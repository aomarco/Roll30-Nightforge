import test from "node:test";
import assert from "node:assert/strict";

import { deriveHero } from "./domain/heroes.js";
import { setArmor, setEnchantment, setShield } from "./domain/items.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import {
  applySetupTokenEquipment,
  canOccupySetupPosition,
  changeChestInventory,
  createChest,
  createHeroTokenSnapshot,
  createManualToken,
  createTurnResources,
  findOpenSetupPosition,
  normalizeEncounter,
  normalizeTableToken,
  occupiedSetupCells,
  prepareBattleStart,
  removeChest,
  setupCellForPosition,
  setupGridMetrics,
  setupPositionForCell,
  snapSetupPosition,
  updateChest,
  updateToken,
} from "./domain/table.js";
import { createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-16T13:00:00.000Z";
const VIEWPORT = { width: 880, height: 528, gridSize: 44 };
const inventory = (itemId, quantity = 1) => ({ itemId, quantity });

const createTestHero = (patch = {}) => createHeroRecord({
  name: "Mira Ashfall",
  classId: "fighter",
  raceId: "human",
  level: 5,
  baseAbilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
  inventory: [inventory("longsword"), inventory("chain-mail"), inventory("shield"), inventory("ring-of-protection")],
  loadout: { mainHand: "longsword", offHand: null },
  armorId: "chain-mail",
  shieldId: "shield",
  wornItemIds: ["ring-of-protection"],
  ...patch,
}, { id: patch.id || "hero-mira", now: NOW });

test("manual Battle tokens normalize every editable Setup field", () => {
  const token = createManualToken({ id: "manual-1", ordinal: 2, position: { xPercent: 12, yPercent: 34 } });
  const [edited] = updateToken([token], token.id, {
    name: "Ogre guard",
    hp: 28,
    maxHp: 30,
    ac: 13,
    baseSpeed: 40,
    strength: 19,
    dexterity: 8,
    level: 4,
    initiativeBonus: -1,
    size: "large",
  });
  assert.equal(edited.heroId, null);
  assert.deepEqual({
    name: edited.name, hp: edited.hp, maxHp: edited.maxHp, ac: edited.ac,
    baseSpeed: edited.baseSpeed, strength: edited.strength, dexterity: edited.dexterity,
    level: edited.level, initiativeBonus: edited.initiativeBonus, size: edited.size,
  }, {
    name: "Ogre guard", hp: 28, maxHp: 30, ac: 13,
    baseSpeed: 40, strength: 19, dexterity: 8,
    level: 4, initiativeBonus: -1, size: "large",
  });
});

test("Hero token creation takes an independent derived snapshot", () => {
  const hero = createTestHero();
  const derived = deriveHero(hero);
  const token = createHeroTokenSnapshot(hero, { id: "hero-token", ordinal: 0, position: { xPercent: 50, yPercent: 50 } });
  assert.equal(token.heroId, hero.id);
  assert.equal(token.name, hero.name);
  assert.equal(token.hp, derived.hp);
  assert.equal(token.maxHp, derived.hp);
  assert.equal(token.ac, derived.ac);
  assert.equal(token.baseSpeed, derived.speed);
  assert.equal(token.strength, derived.finalAbilities.str);
  assert.equal(token.dexterity, derived.finalAbilities.dex);
  assert.equal(token.initiativeBonus, derived.initiative);
  assert.deepEqual(token.inventory, hero.inventory);
  assert.notEqual(token.inventory, hero.inventory);

  hero.name = "Changed later";
  hero.inventory.length = 0;
  assert.equal(token.name, "Mira Ashfall");
  assert.equal(token.inventory.length, 4);
});

test("Hero-token equipment remains editable and recomputes copied AC", () => {
  const token = createHeroTokenSnapshot(createTestHero(), { id: "hero-token" });
  const withoutShield = setShield(token, null);
  assert.equal(withoutShield.ok, true);
  const [updated] = applySetupTokenEquipment([token], token.id, withoutShield.value);
  assert.equal(updated.shieldId, null);
  assert.equal(updated.ac, token.ac - 2);

  const enchanted = setEnchantment(updated, "chain-mail", 2);
  const [withMagicArmor] = applySetupTokenEquipment([updated], updated.id, enchanted.value);
  assert.equal(withMagicArmor.ac, updated.ac + 2);

  const [withoutWornMagic] = applySetupTokenEquipment([withMagicArmor], withMagicArmor.id, { wornItemIds: [] });
  assert.equal(withoutWornMagic.ac, withMagicArmor.ac - 1);
  const [unarmoredDexterityChange] = applySetupTokenEquipment([withoutWornMagic], withoutWornMagic.id, {
    armorId: null,
    dexterity: 18,
    enchantments: {},
  });
  assert.equal(unarmoredDexterityChange.ac, 14);
});

test("manual-token AC stays editable when its per-battle equipment changes", () => {
  let token = normalizeTableToken({
    id: "manual",
    ac: 17,
    inventory: [inventory("chain-mail")],
  });
  const armor = setArmor(token, "chain-mail");
  [token] = applySetupTokenEquipment([token], token.id, armor.value);
  assert.equal(token.armorId, "chain-mail");
  assert.equal(token.ac, 17);
});

test("chests normalize inventory and support complete-catalog quantity changes", () => {
  const chest = createChest({ id: "chest-1", position: { xPercent: 30, yPercent: 60 } });
  const dagger = changeChestInventory([chest], chest.id, "dagger", 1);
  assert.equal(dagger.ok, true);
  assert.deepEqual(dagger.value[0].inventory, [inventory("dagger")]);
  const arrows = changeChestInventory(dagger.value, chest.id, "arrow", 1);
  assert.equal(arrows.step, 20);
  assert.equal(arrows.value[0].inventory.find((entry) => entry.itemId === "arrow").quantity, 20);
  const emptied = changeChestInventory(arrows.value, chest.id, "arrow", -1);
  assert.equal(emptied.value[0].inventory.some((entry) => entry.itemId === "arrow"), false);
  assert.equal(changeChestInventory(emptied.value, chest.id, "not-real", 1).ok, false);
});

test("chests update and delete without affecting neighboring records", () => {
  const first = createChest({ id: "first", position: { xPercent: 20, yPercent: 20 } });
  const second = createChest({ id: "second", position: { xPercent: 80, yPercent: 80 } });
  const moved = updateChest([first, second], first.id, { position: { xPercent: 40, yPercent: 50 } });
  assert.deepEqual(moved[1], second);
  assert.deepEqual(removeChest(moved, first.id), [second]);
});

test("Battle Setup grid metrics and cell centers are exact", () => {
  assert.deepEqual(setupGridMetrics(VIEWPORT), { cellSize: 44, width: 880, height: 528, columns: 20, rows: 12 });
  assert.deepEqual(setupCellForPosition({ xPercent: 51, yPercent: 51 }, VIEWPORT), { column: 10, row: 6 });
  assert.deepEqual(setupPositionForCell({ column: 10, row: 6 }, VIEWPORT), { xPercent: 52.5, yPercent: 54.166666666666664 });
  assert.deepEqual(snapSetupPosition({ xPercent: 51, yPercent: 51 }, VIEWPORT), setupPositionForCell({ column: 10, row: 6 }, VIEWPORT));
});

test("snapping clamps destinations to valid Table cells", () => {
  assert.deepEqual(setupCellForPosition({ xPercent: -500, yPercent: 900 }, VIEWPORT), { column: 0, row: 11 });
  assert.deepEqual(snapSetupPosition({ xPercent: -500, yPercent: 900 }, VIEWPORT), setupPositionForCell({ column: 0, row: 11 }, VIEWPORT));
});

test("collision detection blocks token/token, token/chest, and chest/chest overlap", () => {
  const center = setupPositionForCell({ column: 5, row: 5 }, VIEWPORT);
  const token = createManualToken({ id: "token", position: center });
  const chest = createChest({ id: "chest", position: center });
  assert.equal(canOccupySetupPosition(center, { tokens: [token], viewport: VIEWPORT }), false);
  assert.equal(canOccupySetupPosition(center, { chests: [chest], viewport: VIEWPORT }), false);
  assert.equal(occupiedSetupCells({ tokens: [token], chests: [chest], viewport: VIEWPORT }).size, 1);
});

test("an entity may retain its own cell while all other entities remain blocking", () => {
  const first = setupPositionForCell({ column: 1, row: 1 }, VIEWPORT);
  const second = setupPositionForCell({ column: 2, row: 1 }, VIEWPORT);
  const tokens = [createManualToken({ id: "one", position: first }), createManualToken({ id: "two", position: second })];
  assert.equal(canOccupySetupPosition(first, { tokens, exclude: { kind: "token", id: "one" }, viewport: VIEWPORT }), true);
  assert.equal(canOccupySetupPosition(second, { tokens, exclude: { kind: "token", id: "one" }, viewport: VIEWPORT }), false);
});

test("nearest free placement is deterministic around an occupied desired cell", () => {
  const desired = setupPositionForCell({ column: 10, row: 6 }, VIEWPORT);
  const token = createManualToken({ id: "center", position: desired });
  const open = findOpenSetupPosition(desired, { tokens: [token], viewport: VIEWPORT });
  assert.deepEqual(setupCellForPosition(open, VIEWPORT), { column: 10, row: 5 });
});

test("snapped entity coordinates remain centered across viewport matrices", () => {
  for (const viewport of [
    { width: 320, height: 240, gridSize: 40 },
    { width: 1366, height: 768, gridSize: 44 },
    { width: 2560, height: 1440, gridSize: 80 },
  ]) {
    const snapped = snapSetupPosition({ xPercent: 68.3, yPercent: 31.7 }, viewport);
    const cell = setupCellForPosition(snapped, viewport);
    assert.deepEqual(snapped, setupPositionForCell(cell, viewport));
  }
});

test("Battle start rejects invalid Scene and roster states with recovery guidance", () => {
  const play = prepareBattleStart({ kind: "play", tokens: [] }, { viewport: VIEWPORT });
  assert.equal(play.code, "BATTLE_SCENE_REQUIRED");
  const tooSmall = prepareBattleStart({ kind: "battle", tokens: [createManualToken({ id: "only" })], encounter: null }, { viewport: VIEWPORT });
  assert.equal(tooSmall.code, "BATTLE_NEEDS_TOKENS");
  assert.match(tooSmall.recovery, /Add another/);
});

test("Battle start snaps all entities, prevents collisions, and creates a fresh encounter", () => {
  const samePosition = { xPercent: 50, yPercent: 50 };
  const first = createManualToken({ id: "first", position: samePosition });
  const second = createManualToken({ id: "second", position: samePosition });
  const chest = createChest({ id: "chest", position: samePosition, inventory: [inventory("dagger")] });
  const started = prepareBattleStart({ kind: "battle", tokens: [first, second], chests: [chest], encounter: null }, {
    viewport: VIEWPORT,
    random: () => 0.5,
  });
  assert.equal(started.ok, true);
  const cells = occupiedSetupCells({ ...started.value, viewport: VIEWPORT });
  assert.equal(cells.size, 3);
  assert.equal(started.value.encounter.status, "active");
  assert.equal(started.value.encounter.round, 1);
  assert.deepEqual(started.value.encounter.battleItems, []);
  assert.deepEqual(started.value.chests[0].inventory, chest.inventory);
});

test("initiative uses injected rolls and stable token-list tie ordering", () => {
  const tokens = [
    createManualToken({ id: "alpha", position: { xPercent: 10, yPercent: 10 } }),
    createManualToken({ id: "beta", position: { xPercent: 30, yPercent: 10 } }),
    createManualToken({ id: "gamma", position: { xPercent: 50, yPercent: 10 } }),
  ];
  const rolls = [0.45, 0.45, 0.95];
  const started = prepareBattleStart({ kind: "battle", tokens, chests: [], encounter: null }, {
    viewport: VIEWPORT,
    random: () => rolls.shift(),
  }).value;
  assert.deepEqual(started.encounter.initiativeOrder, ["gamma", "alpha", "beta"]);
  assert.equal(started.encounter.initiatives.gamma, 20);
  assert.deepEqual(Object.keys(started.encounter.resources), ["gamma"]);
  assert.deepEqual(started.encounter.resources.gamma, createTurnResources(tokens[2]));
});

test("Battle start clears token conditions and old physical encounter state", () => {
  const tokens = [
    normalizeTableToken({ id: "one", conditions: ["Poisoned"] }),
    normalizeTableToken({ id: "two", conditions: ["Prone"] }),
  ];
  const started = prepareBattleStart({ kind: "battle", tokens, chests: [], encounter: null }, { viewport: VIEWPORT, random: () => 0 }).value;
  assert.deepEqual(started.tokens.map((token) => token.conditions), [[], []]);
  assert.deepEqual(started.encounter.battleItems, []);
  assert.deepEqual(started.encounter.ammoSpentByToken, {});
});

test("encounter normalization removes stale token references", () => {
  const tokens = [createManualToken({ id: "valid" })];
  const encounter = normalizeEncounter({
    status: "active",
    initiativeOrder: ["missing", "valid", "valid"],
    initiatives: { missing: 99, valid: 12 },
    activeIndex: 10,
    round: 0,
    winnerTokenId: "missing",
  }, tokens);
  assert.deepEqual(encounter.initiativeOrder, ["valid"]);
  assert.deepEqual(encounter.initiatives, { valid: 12 });
  assert.equal(encounter.activeIndex, 0);
  assert.equal(encounter.round, 1);
  assert.equal(encounter.winnerTokenId, null);
});

test("complete Battle Setup and transition persist through a repository reload", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    idFactory: () => "scene-phase7",
    clock: () => NOW,
  });
  const repository = makeRepository();
  const heroToken = createHeroTokenSnapshot(createTestHero(), { id: "hero-token", position: { xPercent: 20, yPercent: 20 } });
  const manual = createManualToken({ id: "manual-token", position: { xPercent: 70, yPercent: 70 } });
  const chest = createChest({ id: "chest", position: { xPercent: 45, yPercent: 45 }, inventory: [inventory("dagger", 2)] });
  const created = repository.create({ kind: "battle", tokens: [heroToken, manual], chests: [chest] });
  const transition = prepareBattleStart(created.value, { viewport: VIEWPORT, random: () => 0.25 });
  assert.equal(repository.update(created.value.id, transition.value).ok, true);

  const reloaded = makeRepository().get(created.value.id).value;
  assert.equal(reloaded.tokens.length, 2);
  assert.equal(reloaded.tokens[0].heroId, "hero-mira");
  assert.deepEqual(reloaded.chests[0].inventory, [inventory("dagger", 2)]);
  assert.equal(reloaded.encounter.status, "active");
  assert.equal(reloaded.encounter.initiativeOrder.length, 2);
});

test("an editable pre-Battle Setup persists every configured entity before transition", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    idFactory: () => "editable-setup",
    clock: () => NOW,
  });
  const heroToken = createHeroTokenSnapshot(createTestHero(), { id: "hero-token", position: setupPositionForCell({ column: 3, row: 4 }, VIEWPORT) });
  const manual = createManualToken({ id: "manual", name: "Configured guard", position: setupPositionForCell({ column: 8, row: 4 }, VIEWPORT) });
  const chest = createChest({ id: "chest", position: setupPositionForCell({ column: 6, row: 8 }, VIEWPORT), inventory: [inventory("arrow", 40)] });
  const created = makeRepository().create({ kind: "battle", tokens: [heroToken, manual], chests: [chest] });
  assert.equal(created.ok, true);

  const reloaded = makeRepository().get(created.value.id).value;
  assert.equal(reloaded.encounter, null);
  assert.equal(reloaded.tokens[0].heroId, "hero-mira");
  assert.equal(reloaded.tokens[1].name, "Configured guard");
  assert.equal(reloaded.tokens[0].loadout.mainHand, "longsword");
  assert.equal(reloaded.tokens[0].armorId, "chain-mail");
  assert.equal(reloaded.tokens[0].shieldId, "shield");
  assert.deepEqual(reloaded.chests[0], chest);
});

test("abandoning Battle clears encounter state while preserving current Setup assets", () => {
  const tokens = [
    createManualToken({ id: "one", position: { xPercent: 20, yPercent: 20 } }),
    createManualToken({ id: "two", position: { xPercent: 70, yPercent: 70 } }),
  ];
  const chest = createChest({ id: "cache", position: { xPercent: 45, yPercent: 45 }, inventory: [inventory("dagger")] });
  const started = prepareBattleStart({ kind: "battle", tokens, chests: [chest], encounter: null }, { viewport: VIEWPORT, random: () => 0.4 }).value;
  const damaged = updateToken(started.tokens, "one", { hp: 3, position: setupPositionForCell({ column: 2, row: 2 }, VIEWPORT) });
  const abandoned = createSceneRecord({
    id: "abandoned",
    kind: "battle",
    tokens: damaged,
    chests: started.chests,
    encounter: null,
  }, { id: "abandoned", now: NOW });
  assert.equal(abandoned.encounter, null);
  assert.equal(abandoned.tokens.find((token) => token.id === "one").hp, 3);
  assert.deepEqual(abandoned.tokens.find((token) => token.id === "one").position, setupPositionForCell({ column: 2, row: 2 }, VIEWPORT));
  assert.deepEqual(abandoned.chests, started.chests);
});

test("a failed Phase 7 repository update preserves the last valid Setup", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    idFactory: () => "failure-scene",
    clock: () => NOW,
  });
  const created = repository.create({ kind: "battle", tokens: [createManualToken({ id: "safe-token" })] }).value;
  storage.setFailureMode("write");
  const failed = repository.update(created.id, { chests: [createChest({ id: "unsaved" })] });
  assert.equal(failed.ok, false);
  storage.setFailureMode(null);
  assert.deepEqual(repository.get(created.id).value, created);
});
