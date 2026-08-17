import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserArtworkDecoder,
  MAX_ARTWORK_BYTES,
  MAX_ARTWORK_DIMENSION,
  MAX_ARTWORK_PIXELS,
} from "./application/artwork.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { normalizeInventoryEntries, MAX_INVENTORY_QUANTITY } from "./domain/items.js";
import {
  appendEncounterLog,
  MAX_ENCOUNTER_LOG_ENTRIES,
  MAX_ENCOUNTER_LOG_ENTRY_LENGTH,
  normalizeChests,
  normalizeEncounter,
  normalizeTableTokens,
  normalizeWalls,
} from "./domain/table.js";
import { generatedId } from "./application/generatedId.js";
import { createHeroRepository, createSceneRepository } from "./storage/entityRepositories.js";
import { createEmptyEnvelope, normalizeEnvelope, sealEnvelope, serializeEnvelope } from "./storage/envelope.js";
import { STORAGE_KEYS } from "./storage/constants.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-17T20:00:00.000Z";
const token = (id = "token-1") => ({ id, name: id });
const wall = (id = "wall-1") => ({
  id,
  type: "full",
  points: [{ xPercent: 0, yPercent: 0 }, { xPercent: 10, yPercent: 10 }],
});

test("corrupt collections retain only the first record for every stable id", () => {
  const normalized = normalizeEnvelope({
    revision: 4,
    scenes: [
      { id: "scene-1", name: "First", tokens: [token(), { ...token(), name: "Duplicate" }], chests: [{ id: "chest-1" }, { id: "chest-1" }], walls: [wall(), wall()] },
      { id: "scene-1", name: "Duplicate Scene" },
    ],
    heroes: [{ id: "hero-1", name: "First Hero" }, { id: "hero-1", name: "Duplicate Hero" }],
  }, NOW);

  assert.equal(normalized.scenes.length, 1);
  assert.equal(normalized.scenes[0].name, "First");
  assert.equal(normalized.scenes[0].tokens.length, 1);
  assert.equal(normalized.scenes[0].chests.length, 1);
  assert.equal(normalized.scenes[0].walls.length, 1);
  assert.equal(normalized.heroes.length, 1);
  assert.equal(normalized.heroes[0].name, "First Hero");
  assert.equal(normalizeTableTokens([token(), token()]).length, 1);
  assert.equal(normalizeChests([{ id: "chest-1" }, { id: "chest-1" }]).length, 1);
  assert.equal(normalizeWalls([wall(), wall()]).length, 1);
});

test("non-finite revisions and quantities never serialize as null", () => {
  const envelope = normalizeEnvelope({ revision: Infinity }, NOW);
  const inventory = normalizeInventoryEntries([
    { itemId: "club", quantity: Infinity },
    { itemId: "club", quantity: MAX_INVENTORY_QUANTITY },
    { itemId: "club", quantity: MAX_INVENTORY_QUANTITY },
  ]);
  assert.equal(envelope.revision, 0);
  assert.deepEqual(inventory.inventory, [{ itemId: "club", quantity: MAX_INVENTORY_QUANTITY }]);
  assert.equal(JSON.stringify(envelope).includes('"revision":null'), false);
  assert.equal(JSON.stringify(inventory).includes('"quantity":null'), false);
  assert.equal(normalizeEnvelope({ revision: Number.NaN }, NOW).revision, 0);
  assert.equal(normalizeEnvelope({ revision: -3 }, NOW).revision, 0);
  assert.equal(normalizeEnvelope({ revision: "9" }, NOW).revision, 9);
  assert.deepEqual(normalizeInventoryEntries([{ itemId: "club", quantity: "3" }]).inventory, [
    { itemId: "club", quantity: 3 },
  ]);
  assert.deepEqual(normalizeInventoryEntries([{ itemId: "club", quantity: -2 }]).inventory, []);
});

test("encounter history retains bounded recent strings", () => {
  const entries = Array.from({ length: MAX_ENCOUNTER_LOG_ENTRIES + 20 }, (_, index) =>
    index === MAX_ENCOUNTER_LOG_ENTRIES + 19
      ? "x".repeat(MAX_ENCOUNTER_LOG_ENTRY_LENGTH + 40)
      : `entry-${index}`);
  const normalized = normalizeEncounter({
    status: "active",
    initiativeOrder: ["token-1"],
    activeIndex: 0,
    round: 1,
    resources: {},
    log: entries,
  }, [token()]);
  assert.equal(normalized.log.length, MAX_ENCOUNTER_LOG_ENTRIES);
  assert.equal(normalized.log[0], "entry-20");
  assert.equal(normalized.log.at(-1).length, MAX_ENCOUNTER_LOG_ENTRY_LENGTH);
  assert.equal(appendEncounterLog(normalized.log, "newest").length, MAX_ENCOUNTER_LOG_ENTRIES);
  assert.equal(appendEncounterLog(normalized.log, "newest").at(-1), "newest");
});

test("repository creation rejects a stable-id collision without mutation", () => {
  const state = createStateRepository(createMemoryStorage(), { clock: () => NOW });
  const scenes = createSceneRepository(state, { clock: () => NOW, idFactory: () => "same-id" });
  assert.equal(scenes.create({ name: "First" }).ok, true);
  const conflict = scenes.create({ name: "Second" });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "scenes-id-conflict");
  assert.deepEqual(scenes.list().value.map((scene) => scene.name), ["First"]);

  const activeConflict = scenes.createActive({ name: "Active duplicate" });
  assert.equal(activeConflict.ok, false);
  assert.equal(activeConflict.code, "scenes-id-conflict");

  const heroState = createStateRepository(createMemoryStorage(), { clock: () => NOW });
  const heroes = createHeroRepository(heroState, { clock: () => NOW, idFactory: () => "same-hero" });
  assert.equal(heroes.create({ name: "First Hero" }).ok, true);
  assert.equal(heroes.create({ name: "Duplicate Hero" }).code, "heroes-id-conflict");
});

test("every Table creation path shares recoverable stable-id validation", () => {
  const records = [{ id: "duplicate" }];
  for (const kind of ["token", "chest", "wall"]) {
    assert.equal(generatedId(kind, () => "duplicate", records).code, `${kind.toUpperCase()}_ID_CONFLICT`);
    assert.equal(generatedId(kind, () => "  ", records).code, `${kind.toUpperCase()}_ID_CONFLICT`);
    assert.equal(generatedId(kind, () => { throw new Error("unavailable"); }, records).code, `${kind.toUpperCase()}_ID_FAILED`);
    assert.deepEqual(generatedId(kind, () => `${kind}-new`, records), { ok: true, value: `${kind}-new` });
  }
});

test("stale repository revisions cannot overwrite newer browser state", () => {
  const storage = createMemoryStorage();
  const state = createStateRepository(storage, { clock: () => NOW });
  const secondRuntimeState = createStateRepository(storage, { clock: () => NOW });
  const initial = createEmptyEnvelope(NOW);
  const secondRuntimeSnapshot = secondRuntimeState.load().value;
  const first = state.save(initial);
  assert.equal(first.ok, true);
  const stale = secondRuntimeState.save(secondRuntimeSnapshot);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "storage-revision-conflict");
  assert.equal(state.load().value.revision, 1);
});

test("an exhausted storage revision fails explicitly instead of overflowing", () => {
  const storage = createMemoryStorage();
  const state = createStateRepository(storage, { clock: () => NOW });
  const envelope = sealEnvelope({
    ...createEmptyEnvelope(NOW),
    revision: Number.MAX_SAFE_INTEGER,
  }, NOW);
  storage.setItem(STORAGE_KEYS.state, serializeEnvelope(envelope));

  const result = state.save(envelope);
  assert.equal(result.ok, false);
  assert.equal(result.code, "storage-revision-exhausted");
  assert.equal(state.load().value.revision, Number.MAX_SAFE_INTEGER);
});

test("entity updates reject UI state produced from an older revision", () => {
  const state = createStateRepository(createMemoryStorage(), { clock: () => NOW });
  const scenes = createSceneRepository(state, { clock: () => NOW, idFactory: () => "scene-1" });
  const created = scenes.create({ name: "Current" });
  const conflict = scenes.update(created.value.id, { name: "Stale" }, { expectedRevision: 0 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "storage-revision-conflict");
  assert.equal(scenes.get(created.value.id).value.name, "Current");
});

test("artwork rejects oversized bytes before invoking the decoder", async () => {
  class OversizedBlob extends Blob {
    get size() { return MAX_ARTWORK_BYTES + 1; }
  }
  let decodeCalls = 0;
  const decode = createBrowserArtworkDecoder({
    createImageBitmap: async () => {
      decodeCalls += 1;
      return { width: 1, height: 1, close() {} };
    },
  });
  const result = await decode(new OversizedBlob([], { type: "image/png" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "artwork-too-large");
  assert.equal(decodeCalls, 0);
});

test("artwork rejects excessive dimensions and pixels while closing bitmaps", async () => {
  for (const dimensions of [
    { width: MAX_ARTWORK_DIMENSION + 1, height: 1 },
    { width: Math.ceil(Math.sqrt(MAX_ARTWORK_PIXELS)) + 1, height: Math.ceil(Math.sqrt(MAX_ARTWORK_PIXELS)) + 1 },
  ]) {
    let closed = false;
    const decode = createBrowserArtworkDecoder({
      createImageBitmap: async () => ({ ...dimensions, close: () => { closed = true; } }),
    });
    const result = await decode(new Blob(["image"], { type: "image/png" }));
    assert.equal(result.ok, false);
    assert.equal(result.code, "artwork-too-large");
    assert.equal(closed, true);
  }
});

test("artwork accepts its documented byte, dimension, and pixel boundaries", async () => {
  class BoundaryBlob extends Blob {
    get size() { return MAX_ARTWORK_BYTES; }
  }
  for (const dimensions of [
    { width: MAX_ARTWORK_DIMENSION, height: 1 },
    { width: 8_000, height: 5_000 },
  ]) {
    let closed = false;
    const decode = createBrowserArtworkDecoder({
      createImageBitmap: async () => ({ ...dimensions, close: () => { closed = true; } }),
    });
    const result = await decode(new BoundaryBlob(["image"], { type: "image/png" }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, dimensions);
    assert.equal(closed, true);
  }
});

test("external synchronization preserves a safe route and latest collections", () => {
  const initial = {
    ...createInitialApplicationState(),
    route: { page: "board", mode: "setup" },
    activeSceneId: "removed",
    lifecycle: "ready",
  };
  const synchronized = applicationReducer(initial, {
    type: "external-state-synchronized",
    scenes: [],
    heroes: [{ id: "hero-1" }],
    activeSceneId: null,
    revision: 7,
  });
  assert.deepEqual(synchronized.route, { page: "home" });
  assert.equal(synchronized.activeSceneId, null);
  assert.equal(synchronized.persistence.revision, 7);
});
