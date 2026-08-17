import assert from "node:assert/strict";
import test from "node:test";

import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { ITEM_CATALOG } from "./domain/catalog.js";
import { createHeroRecord, normalizeSceneRecord } from "./domain/records.js";
import { createManualToken, createTurnResources } from "./domain/table.js";
import { createArtworkRepository } from "./storage/artworkRepository.js";
import { STORAGE_KEYS } from "./storage/constants.js";
import { createEmptyEnvelope, inspectEnvelope, sealEnvelope, serializeEnvelope } from "./storage/envelope.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-17T12:00:00.000Z";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

test("corrupt envelope diagnostics distinguish JSON, shape, version, and checksum failures", () => {
  assert.equal(inspectEnvelope("{").code, "state-json-invalid");
  assert.equal(inspectEnvelope("[]").code, "state-shape-invalid");
  assert.equal(inspectEnvelope(JSON.stringify({ schemaVersion: 999 })).code, "state-version-incompatible");
  assert.equal(inspectEnvelope(JSON.stringify({ schemaVersion: 1, checksum: "wrong" })).code, "state-checksum-invalid");
});

test("two damaged envelopes open a clean recovered vault without overwriting either record", () => {
  const storage = memoryStorage({
    [STORAGE_KEYS.state]: "{damaged-primary",
    [STORAGE_KEYS.backup]: "[]",
  });
  const before = storage.snapshot();
  const loaded = createStateRepository(storage, { clock: () => NOW }).load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "empty");
  assert.equal(loaded.recovered, true);
  assert.deepEqual(loaded.value.scenes, []);
  assert.deepEqual(loaded.value.heroes, []);
  assert.deepEqual(loaded.issues.map((issue) => issue.code), ["state-json-invalid", "state-shape-invalid"]);
  assert.deepEqual(storage.snapshot(), before);
});

test("a valid backup remains the authoritative recovery source when primary data is corrupt", () => {
  const backup = sealEnvelope({ ...createEmptyEnvelope(NOW), revision: 7 }, NOW);
  const storage = memoryStorage({
    [STORAGE_KEYS.state]: "not-json",
    [STORAGE_KEYS.backup]: serializeEnvelope(backup),
  });
  const loaded = createStateRepository(storage, { clock: () => NOW }).load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.value.revision, 7);
});

test("LocalStorage quota exhaustion has a dedicated recovery result and preserves prior state", () => {
  const storage = memoryStorage();
  const repository = createStateRepository(storage, { clock: () => NOW });
  const first = repository.save(createEmptyEnvelope(NOW));
  assert.equal(first.ok, true);
  const before = storage.snapshot()[STORAGE_KEYS.state];
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === STORAGE_KEYS.state) {
      const error = new Error("Quota exceeded while writing LocalStorage");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSet(key, value);
  };
  const failed = repository.save({ ...first.value, pendingArtworkDeletes: ["new-work"] });
  assert.equal(failed.code, "storage-quota-exceeded");
  assert.match(failed.recovery, /previous valid state remains intact/i);
  assert.equal(storage.snapshot()[STORAGE_KEYS.state], before);
});

test("IndexedDB artwork quota exhaustion is reported separately and retains the prior artwork contract", async () => {
  const adapter = {
    get: async () => null,
    put: async () => {
      const error = new Error("Disk quota is full");
      error.name = "QuotaExceededError";
      throw error;
    },
    remove: async () => undefined,
    keys: async () => [],
  };
  const failed = await createArtworkRepository(adapter).put("art-large", new Blob(["large"]));
  assert.equal(failed.code, "artwork-quota-exceeded");
  assert.match(failed.recovery, /previous artwork remains active/i);
});

test("application recovery state retains whether backup or clean-vault recovery was used", () => {
  const backup = applicationReducer(createInitialApplicationState(), {
    type: "hydrate-success",
    scenes: [],
    heroes: [],
    activeSceneId: null,
    revision: 2,
    recovered: true,
    recoverySource: "backup",
  });
  assert.equal(backup.persistence.recoverySource, "backup");
  const clean = applicationReducer(backup, {
    type: "hydrate-success",
    scenes: [],
    heroes: [],
    activeSceneId: null,
    revision: 0,
    recovered: true,
    recoverySource: "empty",
  });
  assert.equal(clean.persistence.recoverySource, "empty");
});

test("the complete catalog remains normalizable as one large Hero inventory", () => {
  const hero = createHeroRecord({
    id: "large-inventory",
    name: "Keeper of the Complete Nightforge Equipment Ledger",
    inventory: ITEM_CATALOG.map((item, index) => ({ itemId: item.id, quantity: index + 1 })),
  });
  assert.equal(hero.inventory.length, ITEM_CATALOG.length);
  assert.equal(hero.inventory.at(-1).quantity > 0, true);
  assert.deepEqual(hero.recoveryDiagnostics.unknownInventoryItemIds, []);
});

test("large token lists, long names, initiative, and active resources normalize without truncation", () => {
  const longName = "The Extremely Long Ceremonial Name of the Last Sentinel of the Verdigris Archive ".repeat(3).trim();
  const tokens = Array.from({ length: 180 }, (_, index) => createManualToken({
    id: `token-${index}`,
    ordinal: index,
    name: index === 0 ? longName : `Combatant ${String(index + 1).padStart(3, "0")}`,
    position: { xPercent: index % 20 * 4.5 + 3, yPercent: Math.floor(index / 20) * 9 + 5 },
  }));
  const first = tokens[0];
  const scene = normalizeSceneRecord({
    id: "large-battle",
    name: longName,
    kind: "battle",
    tokens,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map((token) => token.id),
      initiatives: Object.fromEntries(tokens.map((token, index) => [token.id, 200 - index])),
      activeIndex: 0,
      round: 99,
      resources: { [first.id]: createTurnResources(first) },
      battleItems: [],
      ammoSpentByToken: {},
      ammunitionRecovered: false,
      winnerTokenId: null,
      log: [],
    },
  }, { now: NOW });
  assert.equal(scene.tokens.length, 180);
  assert.equal(scene.tokens[0].name, longName);
  assert.equal(scene.encounter.initiativeOrder.length, 180);
  assert.equal(scene.encounter.resources[first.id].movementBase, first.baseSpeed);
});
