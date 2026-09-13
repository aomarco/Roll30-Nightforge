import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationCommands } from "./application/commands.js";
import { createArtworkRepository } from "./storage/artworkRepository.js";
import { createSceneRepository, createHeroRepository } from "./storage/entityRepositories.js";
import { createStateRepository } from "./storage/stateRepository.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createMemoryStorage, createMemoryArtworkAdapter } from "./storage/memoryAdapters.js";
import { createEmptyEnvelope, sealEnvelope } from "./storage/envelope.js";
import { STORAGE_KEYS, storageIdentity } from "./storage/constants.js";
import { createSceneRecord, createHeroRecord } from "./domain/records.js";
import { dailyItemReset, longRest, shortRest } from "./domain/rest.js";
import { createManualToken } from "./domain/table.js";
import { itemRechargeMetadata } from "../scripts/item-recharge.mjs";
import { ITEM_BY_ID } from "./domain/catalog.js";

const now = "2026-09-06T12:00:00.000Z";
const clock = () => now;
function harness(seed = {}) {
  const storage = createMemoryStorage(seed);
  const state = createStateRepository(storage, { clock });
  let sequence = 0;
  const options = { clock, idFactory: () => `record-${++sequence}` };
  const scenes = createSceneRepository(state, options);
  const heroes = createHeroRepository(state, options);
  const blobs = createMemoryArtworkAdapter({ map: new Blob(["preserved map"]) });
  const commands = createApplicationCommands({
    sceneRepository: scenes, heroRepository: heroes,
    sessionRepository: createSessionRepository(createMemoryStorage()),
    artworkRepository: createArtworkRepository(blobs), dispatch() {},
  });
  return { storage, state, scenes, heroes, blobs, commands };
}

test("uncertain recovery preserves both raw records and all map blobs on startup and retry", async () => {
  const seed = { [STORAGE_KEYS.state]: "{broken primary", [STORAGE_KEYS.backup]: "{broken backup" };
  const app = harness(seed);
  const loaded = app.state.load();
  assert.equal(loaded.classification, "damaged-unrecoverable");
  assert.equal(loaded.readOnly, true);
  await (await app.commands.initialize()).cleanup;
  await app.commands.cleanupPendingArtwork();
  assert.deepEqual(await app.blobs.keys(), ["map"]);
  assert.deepEqual(app.storage.snapshot(), seed);
  assert.equal((await app.scenes.create({ name: "Must not overwrite recovery" })).ok, false);
  assert.deepEqual(app.storage.snapshot(), seed);
});

test("only absent records are truly empty; unsupported data prevents writes even with a valid backup", async () => {
  assert.equal(harness().state.load().classification, "truly-empty");
  const app = harness({
    [STORAGE_KEYS.state]: JSON.stringify({ schemaVersion: 999 }),
    [STORAGE_KEYS.backup]: JSON.stringify(sealEnvelope(createEmptyEnvelope(now), now)),
  });
  assert.equal(app.state.load().classification, "unsupported-version");
  assert.equal((await app.scenes.create({})).ok, false);
});

test("replacing a map retains the copy referenced by a valid backup", async () => {
  const app = harness();
  const scene = (await app.scenes.create({ name: "Before", artworkKey: "map" })).value;
  const result = await app.commands.useWhiteCanvas(scene.id);
  assert.equal(result.ok, true);
  assert.deepEqual(await app.blobs.keys(), ["map"]);
  assert.equal(app.state.retention().value.artworkKeys.includes("map"), true);
});

test("preview writes cannot affect production state, backup, session or asset namespaces", () => {
  const production = storageIdentity("production"), preview = storageIdentity("preview");
  assert.deepEqual(production.keys, STORAGE_KEYS);
  const storage = createMemoryStorage();
  const prod = createStateRepository(storage, { keys: production.keys, clock });
  const prev = createStateRepository(storage, { keys: preview.keys, clock });
  assert.equal(prod.save(createEmptyEnvelope(now)).ok, true);
  const raw = storage.getItem(production.keys.state);
  assert.equal(prev.save({ ...createEmptyEnvelope(now), scenes: [createSceneRecord({}, { id: "preview", now })] }).ok, true);
  assert.equal(storage.getItem(production.keys.state), raw);
  for (const key of ["artworkDatabase", "portraitDatabase", "vaultDatabase", "lock", "channel"]) assert.notEqual(production[key], preview[key]);
  assert.notEqual(production.keys.session, preview.keys.session);
  assert.throws(() => storageIdentity("typo"), /Unknown/);
});

test("long rests recover floor(total Hit Dice / 2), minimum one, capped by spent dice", () => {
  for (const [level, spent, expected] of [[1, 1, 1], [3, 3, 1], [3, 0, 0], [5, 1, 1], [20, 20, 10]]) {
    const hero = createHeroRecord({ level, hitDiceSpent: spent }, { id: "hero", now });
    const result = longRest(hero);
    assert.equal(result.outcome.hitDiceRecovered, expected, `${level}/${spent}`);
    assert.equal(result.value.hitDiceSpent, spent - expected);
  }
});

test("daily recharge joins paragraphs and rolls its authored quantity only at explicit dawn", () => {
  const metadata = itemRechargeMetadata("The helm regains 1d3\n\nexpended charges daily at dawn.");
  assert.equal(metadata.chargeRechargeKind, "daily");
  assert.equal(metadata.chargeRechargeAmount, "1d3");
  assert.equal(ITEM_BY_ID["helm-of-teleportation"].chargeRechargeKind, "daily");
  const hero = createHeroRecord({ inventory: [{ itemId: "cubic-gate", quantity: 1 }], itemCharges: { "cubic-gate": 0 } }, { id: "hero", now });
  assert.equal(shortRest(hero).value.itemCharges["cubic-gate"].current, 0);
  assert.equal(longRest(hero).value.itemCharges["cubic-gate"].current, 0);
  const reset = dailyItemReset(hero, { day: 1, random: () => 0 });
  assert.equal(reset.value.itemCharges["cubic-gate"].current, 1);
  assert.deepEqual(reset.outcome.rolls[0].rolls, [1]);
  const next = { ...hero, ...reset.value };
  assert.equal(dailyItemReset(next, { day: 1, random() { throw new Error("Must not reroll"); } }).replayed, true);
  assert.equal(dailyItemReset(next, { day: 2, random: () => 0.99 }).value.itemCharges["cubic-gate"].current, 3);
  assert.equal(dailyItemReset(next, { day: 0 }).ok, false);
});

async function completedFight(app) {
  const a = (await app.heroes.create({ name: "A" })).value, b = (await app.heroes.create({ name: "B" })).value;
  const tokens = [
    createManualToken({ id: "a", heroId: a.id, hp: 10, maxHp: 10, faction: "ally" }),
    createManualToken({ id: "a-copy", heroId: a.id, hp: 10, maxHp: 10, faction: "ally" }),
    createManualToken({ id: "b", heroId: b.id, hp: 10, maxHp: 10, faction: "ally" }),
    createManualToken({ id: "foe", hp: 0, maxHp: 10, xp: 100, faction: "foe" }),
  ];
  return (await app.scenes.create({ tokens, encounter: { status: "complete" } })).value;
}

test("XP uses authoritative unique recipients and commits the entire award once", async () => {
  const app = harness(), scene = (await completedFight(app));
  app.storage.setFailureMode("write");
  assert.equal((await app.commands.awardExperience(scene.id, { recipients: [{ heroId: "forged", share: 999 }] })).ok, false);
  app.storage.setFailureMode(null);
  assert.deepEqual((await app.heroes.list()).value.map((hero) => hero.xp), [0, 0]);
  assert.equal((await app.scenes.get(scene.id)).value.encounter.xpAwarded, false);
  const result = (await app.commands.awardExperience(scene.id));
  assert.equal(result.ok, true);
  assert.deepEqual((await app.heroes.list()).value.map((hero) => hero.xp), [50, 50]);
  const replay = (await app.commands.awardExperience(scene.id));
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.awarded, result.awarded);
  assert.deepEqual((await app.heroes.list()).value.map((hero) => hero.xp), [50, 50]);
});

test("XP refuses stale encounter identity and missing recipients without changing anyone", async () => {
  const app = harness(), scene = (await completedFight(app));
  assert.equal((await app.commands.awardExperience(scene.id, { encounterInstanceId: "old-run" })).ok, false);
  (await app.heroes.remove((await app.heroes.list()).value[1].id));
  assert.equal((await app.commands.awardExperience(scene.id)).code, "xp-hero-missing");
  assert.equal((await app.heroes.list()).value[0].xp, 0);
  assert.equal((await app.scenes.get(scene.id)).value.encounter.xpAwarded, false);
});

test("a read failure after the active write cannot roll back or misreport a committed XP award", async () => {
  const app = harness(), scene = (await completedFight(app));
  const originalSet = app.storage.setItem;
  app.storage.setItem = (key, value) => {
    originalSet(key, value);
    if (key === STORAGE_KEYS.state) app.storage.setFailureMode("read");
  };
  const awarded = (await app.commands.awardExperience(scene.id));
  assert.equal(awarded.ok, true);
  app.storage.setFailureMode(null);
  assert.deepEqual((await app.heroes.list()).value.map((hero) => hero.xp), [50, 50]);
  assert.equal((await app.commands.awardExperience(scene.id)).replayed, true);
});

test("a failed primary write never replaces a newer valid backup with an older primary", () => {
  const old = sealEnvelope({ ...createEmptyEnvelope(now), revision: 1 }, now);
  const recent = sealEnvelope({ ...createEmptyEnvelope(now), revision: 2 }, now);
  const app = harness({ [STORAGE_KEYS.state]: JSON.stringify(old), [STORAGE_KEYS.backup]: JSON.stringify(recent) });
  const originalSet = app.storage.setItem;
  app.storage.setItem = (key, value) => { if (key === STORAGE_KEYS.state) throw new Error("Active write fails"); originalSet(key, value); };
  assert.equal(app.state.save(app.state.load().value).ok, false);
  assert.equal(app.storage.getItem(STORAGE_KEYS.backup), JSON.stringify(recent));
  assert.equal(app.state.load().value.revision, 2);
});
