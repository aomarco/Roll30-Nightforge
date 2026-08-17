import test from "node:test";
import assert from "node:assert/strict";

import { ITEM_BY_ID } from "./domain/catalog.js";
import { performWeaponAttack, attackTargetEligibility } from "./domain/attacks.js";
import { activeTurnContext, endTurn, movementAvailability } from "./domain/combat.js";
import {
  AMMUNITION_BY_WEAPON,
  LODGING_THROWN_WEAPON_IDS,
  NON_LODGING_THROWN_WEAPON_IDS,
  ammunitionForWeapon,
  attackSupplyAvailability,
  chestCommandOptions,
  completeEncounterIfNeeded,
  nearbyThrownLanding,
  openAdjacentChest,
  openChestAvailability,
  restartCompletedBattle,
  retrievalAvailability,
  retrievalCommandOptions,
  retrieveBattleItem,
  takeOneFromOpenChest,
} from "./domain/encounter.js";
import { createSceneRecord } from "./domain/records.js";
import {
  createChest,
  createManualToken,
  createTurnResources,
  normalizeBattleItems,
  normalizeEncounter,
  prepareBattleStart,
  setupCellForPosition,
  setupPositionForCell,
  updateToken,
} from "./domain/table.js";
import { createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-17T18:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const WIDE_VIEWPORT = { width: 1760, height: 440, gridSize: 44 };
const at = (column, row, viewport = VIEWPORT) => setupPositionForCell({ column, row }, viewport);
const item = (itemId, quantity = 1) => ({ itemId, quantity });
const quantity = (token, itemId) => token.inventory.find((entry) => entry.itemId === itemId)?.quantity || 0;
const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

const token = (id, column, row, patch = {}, viewport = VIEWPORT) => createManualToken({
  id,
  name: patch.name || id,
  position: at(column, row, viewport),
  ...patch,
});

const battleScene = ({
  tokens = [
    token("active", 1, 1, { inventory: [item("longsword")], loadout: { mainHand: "longsword", offHand: null } }),
    token("target", 2, 1, { hp: 20, maxHp: 20, ac: 10 }),
    token("witness", 8, 8, { hp: 20, maxHp: 20 }),
  ],
  chests = [],
  resources,
  battleItems = [],
  ammoSpentByToken = {},
  status = "active",
  winnerTokenId = null,
  ammunitionRecovered = false,
} = {}) => createSceneRecord({
  id: "phase10-scene",
  name: "Completion Lab",
  kind: "battle",
  tokens,
  chests,
  encounter: {
    version: 1,
    status,
    initiativeOrder: tokens.map((entry) => entry.id),
    initiatives: Object.fromEntries(tokens.map((entry, index) => [entry.id, 20 - index])),
    activeIndex: 0,
    round: 1,
    resources: { [tokens[0].id]: resources || createTurnResources(tokens[0]) },
    battleItems,
    ammoSpentByToken,
    ammunitionRecovered,
    winnerTokenId,
    log: [],
  },
}, { id: "phase10-scene", now: NOW });

const applyPatch = (scene, patch) => createSceneRecord({ ...scene, ...patch }, { id: scene.id, now: NOW });
const physical = (id, itemId, patch = {}) => ({
  id,
  itemId,
  state: patch.state || "ground",
  position: patch.position || at(2, 2),
  carrierTokenId: patch.carrierTokenId || null,
  sourceTokenId: patch.sourceTokenId || "active",
});

test("all seven ammunition weapons map to the exact four bundle-backed ammunition types", () => {
  assert.deepEqual(AMMUNITION_BY_WEAPON, {
    "crossbow-light": "crossbow-bolt",
    shortbow: "arrow",
    sling: "sling-bullet",
    blowgun: "blowgun-needle",
    "crossbow-hand": "crossbow-bolt",
    "crossbow-heavy": "crossbow-bolt",
    longbow: "arrow",
  });
  assert.deepEqual(["arrow", "crossbow-bolt", "sling-bullet", "blowgun-needle"].map((id) => ITEM_BY_ID[id].bundleSize), [20, 20, 20, 50]);
  for (const [weaponId, ammunitionId] of Object.entries(AMMUNITION_BY_WEAPON)) {
    assert.equal(ammunitionForWeapon(weaponId).id, ammunitionId);
  }
});

test("the physical thrown catalog has six lodging weapons and one non-lodging hammer", () => {
  assert.deepEqual(LODGING_THROWN_WEAPON_IDS, ["dagger", "dart", "handaxe", "javelin", "spear", "trident"]);
  assert.deepEqual(NON_LODGING_THROWN_WEAPON_IDS, ["light-hammer"]);
});

test("encounter normalization validates physical items, ammunition expenditure, and an opened chest", () => {
  const active = token("active", 1, 1);
  const target = token("target", 2, 1);
  const normalized = normalizeEncounter({
    version: 1,
    status: "active",
    initiativeOrder: ["active", "missing", "target"],
    activeIndex: 0,
    resources: { active: { ...createTurnResources(active), openedChestId: " chest-1 " } },
    battleItems: [
      physical("ground-1", "dagger"),
      physical("embedded-1", "javelin", { state: "embedded", carrierTokenId: "target", position: null }),
      physical("bad-item", "arrow"),
      physical("bad-carrier", "spear", { state: "embedded", carrierTokenId: "missing", position: null }),
    ],
    ammoSpentByToken: { active: { arrow: 3, dagger: 9, "crossbow-bolt": -1 }, missing: { arrow: 4 } },
  }, [active, target]);
  assert.deepEqual(normalized.initiativeOrder, ["active", "target"]);
  assert.equal(normalized.resources.active.openedChestId, "chest-1");
  assert.deepEqual(normalized.battleItems.map(({ id }) => id), ["ground-1", "embedded-1"]);
  assert.deepEqual(normalized.ammoSpentByToken, { active: { arrow: 3 } });
  assert.equal(normalized.ammunitionRecovered, false);
});

test("a ranged weapon with no matching ammunition cannot target, roll, or spend Action", () => {
  const active = token("active", 1, 1, { inventory: [item("shortbow")], loadout: { mainHand: "shortbow", offHand: null } });
  const scene = battleScene({ tokens: [active, token("target", 5, 1), token("witness", 8, 8)] });
  const before = structuredClone(scene);
  const eligibility = attackTargetEligibility(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT });
  assert.equal(eligibility.code, "NO_ATTACK_SUPPLIES");
  const attack = performWeaponAttack(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT });
  assert.equal(attack.code, "NO_ATTACK_SUPPLIES");
  assert.deepEqual(scene, before);
  assert.equal(activeTurnContext(scene).value.resources.actionSpent, false);
});

test("every ammunition weapon consumes exactly one matching unit and records it per token", () => {
  for (const [weaponId, ammunitionId] of Object.entries(AMMUNITION_BY_WEAPON)) {
    const active = token("active", 1, 1, {
      inventory: [item(weaponId), item(ammunitionId, 2)],
      loadout: { mainHand: weaponId, offHand: null },
    }, WIDE_VIEWPORT);
    const targetToken = token("target", 3, 1, { ac: 1, hp: 50, maxHp: 50 }, WIDE_VIEWPORT);
    const scene = battleScene({ tokens: [active, targetToken, token("witness", 30, 1, {}, WIDE_VIEWPORT)] });
    const attacked = performWeaponAttack(scene, { weaponId, hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }, { random: sequence(0.5, 0.2) });
    assert.equal(attacked.ok, true, weaponId);
    const after = applyPatch(scene, attacked.value);
    assert.equal(quantity(after.tokens.find(({ id }) => id === "active"), ammunitionId), 1, weaponId);
    assert.equal(after.encounter.ammoSpentByToken.active[ammunitionId], 1, weaponId);
    assert.equal(attacked.outcome.supply.kind, "ammunition", weaponId);
  }
});

test("illegal ranged targets consume no ammunition", () => {
  const active = token("active", 1, 1, { inventory: [item("shortbow"), item("arrow", 2)], loadout: { mainHand: "shortbow", offHand: null } }, WIDE_VIEWPORT);
  const scene = battleScene({ tokens: [active, token("target", 25, 1, {}, WIDE_VIEWPORT), token("witness", 30, 1, {}, WIDE_VIEWPORT)] });
  assert.equal(performWeaponAttack(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).code, "ATTACK_OUT_OF_RANGE");
  assert.equal(quantity(scene.tokens[0], "arrow"), 2);
  assert.deepEqual(scene.encounter.ammoSpentByToken, {});
});

test("throwing is inferred from distance while adjacent use remains melee", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: null } });
  const scene = battleScene({ tokens: [active, token("near", 2, 1), token("far", 5, 1)] });
  assert.equal(attackTargetEligibility(scene, { weaponId: "dagger", hand: "mainHand", targetId: "near", viewport: VIEWPORT }).value.range.usage, "melee");
  assert.equal(attackTargetEligibility(scene, { weaponId: "dagger", hand: "mainHand", targetId: "far", viewport: VIEWPORT }).value.range.usage, "thrown");

  const dartUser = token("active", 1, 1, { inventory: [item("dart")], loadout: { mainHand: "dart", offHand: null } });
  const dartScene = battleScene({ tokens: [dartUser, token("target", 2, 1), token("witness", 8, 8)] });
  assert.equal(attackTargetEligibility(dartScene, { weaponId: "dart", hand: "mainHand", targetId: "target", viewport: VIEWPORT }).value.range.usage, "thrown");
});

test("a lodging thrown hit removes one copy, shifts the other hand, and embeds a stable item", () => {
  const active = token("active", 1, 1, {
    inventory: [item("dagger"), item("handaxe")],
    loadout: { mainHand: "dagger", offHand: "handaxe" },
  });
  const scene = battleScene({ tokens: [active, token("target", 5, 1, { ac: 1, hp: 30, maxHp: 30 }), token("witness", 8, 8)] });
  const attacked = performWeaponAttack(scene, { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, {
    random: sequence(0.5, 0.4),
    battleItemIdFactory: () => "thrown-dagger-1",
  });
  assert.equal(attacked.ok, true);
  assert.equal(attacked.outcome.range.usage, "thrown");
  assert.equal(attacked.outcome.battleItem.state, "embedded");
  assert.equal(attacked.outcome.battleItem.carrierTokenId, "target");
  const after = applyPatch(scene, attacked.value);
  const thrower = after.tokens.find(({ id }) => id === "active");
  assert.equal(quantity(thrower, "dagger"), 0);
  assert.deepEqual(thrower.loadout, { mainHand: "handaxe", offHand: null });
  assert.equal(after.encounter.resources.active.offHandAttackAvailable, true);
  assert.equal(after.encounter.resources.active.offHandWeaponId, "handaxe");
  assert.equal(after.encounter.resources.active.offHandAttackHand, "mainHand");
  assert.deepEqual(after.encounter.battleItems[0], {
    id: "thrown-dagger-1",
    itemId: "dagger",
    state: "embedded",
    position: null,
    carrierTokenId: "target",
    sourceTokenId: "active",
  });
});

test("a duplicate physical-item identity refuses the throw without mutating the Scene", () => {
  const active = token("active", 1, 1, { inventory: [item("javelin")], loadout: { mainHand: "javelin", offHand: null } });
  const scene = battleScene({
    tokens: [active, token("target", 5, 1, { ac: 1, hp: 30, maxHp: 30 }), token("witness", 8, 8)],
    battleItems: [physical("duplicate", "dagger", { position: at(4, 2) })],
  });
  const before = structuredClone(scene);
  const attacked = performWeaponAttack(scene, { weaponId: "javelin", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, {
    random: sequence(0.5, 0.4), battleItemIdFactory: () => "duplicate",
  });
  assert.equal(attacked.code, "BATTLE_ITEM_ID_CONFLICT");
  assert.deepEqual(scene, before);
});

test("throwing an off-hand copy clears only that hand", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" } });
  const scene = battleScene({ tokens: [active, token("target", 5, 1, { ac: 1, hp: 30, maxHp: 30 }), token("witness", 8, 8)] });
  const attacked = performWeaponAttack(scene, { weaponId: "dagger", hand: "offHand", targetId: "target", viewport: VIEWPORT }, {
    random: sequence(0.5, 0.4), battleItemIdFactory: () => "off-dagger",
  });
  const thrower = attacked.value.tokens.find(({ id }) => id === "active");
  assert.equal(quantity(thrower, "dagger"), 1);
  assert.deepEqual(thrower.loadout, { mainHand: "dagger", offHand: null });
});

test("a hammer hit and any thrown miss land on a deterministic unoccupied nearby cell", () => {
  for (const [weaponId, roll, expectedHit] of [["light-hammer", 0.5, true], ["javelin", 0, false]]) {
    const active = token("active", 1, 1, { inventory: [item(weaponId)], loadout: { mainHand: weaponId, offHand: null } });
    const targetToken = token("target", 5, 5, { ac: 10, hp: 30, maxHp: 30 });
    const witness = token("witness", 4, 4);
    const chest = createChest({ id: "chest", position: at(5, 4) });
    const scene = battleScene({ tokens: [active, targetToken, witness], chests: [chest] });
    const attacked = performWeaponAttack(scene, { weaponId, hand: "mainHand", targetId: "target", viewport: VIEWPORT }, {
      random: sequence(roll, 0.3), battleItemIdFactory: () => `${weaponId}-ground`,
    });
    assert.equal(attacked.ok, true, weaponId);
    assert.equal(attacked.outcome.hit, expectedHit, weaponId);
    assert.equal(attacked.outcome.battleItem.state, "ground", weaponId);
    const landingCell = setupCellForPosition(attacked.outcome.battleItem.position, VIEWPORT);
    const occupied = [active, targetToken, witness, chest].map((entry) => setupCellForPosition(entry.position, VIEWPORT));
    assert.equal(occupied.some((cell) => cell.column === landingCell.column && cell.row === landingCell.row), false, weaponId);
    assert.ok(Math.max(Math.abs(landingCell.column - 5), Math.abs(landingCell.row - 5)) <= 1, weaponId);
  }
});

test("nearby landing is bounded and refuses a fully occupied board", () => {
  const tiny = { width: 88, height: 44, gridSize: 44 };
  const first = token("active", 0, 0, {}, tiny);
  const second = token("target", 1, 0, {}, tiny);
  assert.equal(nearbyThrownLanding({ tokens: [first, second], chests: [], encounter: { battleItems: [] } }, second.position, tiny), null);
});

test("an adjacent chest spends Bonus once and remains resumable for one-unit looting", () => {
  const active = token("active", 1, 1);
  const chest = createChest({ id: "chest-1", position: at(2, 2), inventory: [item("dagger", 2), item("arrow", 3)] });
  let scene = battleScene({ chests: [chest], tokens: [active, token("target", 5, 5), token("witness", 8, 8)] });
  const opened = openAdjacentChest(scene, chest.id, VIEWPORT);
  assert.equal(opened.ok, true);
  scene = applyPatch(scene, opened.value);
  assert.equal(activeTurnContext(scene).value.resources.bonusActionSpent, true);
  assert.equal(activeTurnContext(scene).value.resources.openedChestId, chest.id);
  assert.equal(openChestAvailability(scene, chest.id, VIEWPORT).value.alreadyOpen, true);
  assert.equal(openAdjacentChest(scene, chest.id, VIEWPORT).resumed, true);

  scene = applyPatch(scene, takeOneFromOpenChest(scene, chest.id, "dagger", VIEWPORT).value);
  assert.equal(quantity(scene.tokens.find(({ id }) => id === "active"), "dagger"), 1);
  assert.equal(quantity(scene.chests[0], "dagger"), 1);
  scene = applyPatch(scene, takeOneFromOpenChest(scene, chest.id, "dagger", VIEWPORT).value);
  assert.equal(quantity(scene.chests[0], "dagger"), 0);
  assert.equal(quantity(scene.chests[0], "arrow"), 3);
  assert.equal(scene.encounter.activeIndex, 0);
});

test("chest looting enforces adjacency, Bonus availability, and exact depletion", () => {
  const active = token("active", 1, 1);
  const near = createChest({ id: "near", position: at(2, 1), inventory: [item("club")] });
  const far = createChest({ id: "far", position: at(6, 6), inventory: [item("club")] });
  const scene = battleScene({ chests: [near, far], tokens: [active, token("target", 8, 8), token("witness", 9, 9)] });
  const options = chestCommandOptions(scene, VIEWPORT);
  assert.equal(options.find(({ chest }) => chest.id === "near").availability.ok, true);
  assert.equal(options.find(({ chest }) => chest.id === "far").availability.code, "CHEST_NOT_ADJACENT");
  assert.equal(takeOneFromOpenChest(scene, "near", "club", VIEWPORT).code, "CHEST_NOT_OPEN");
  const opened = applyPatch(scene, openAdjacentChest(scene, "near", VIEWPORT).value);
  const depleted = applyPatch(opened, takeOneFromOpenChest(opened, "near", "club", VIEWPORT).value);
  assert.equal(takeOneFromOpenChest(depleted, "near", "club", VIEWPORT).code, "CHEST_ITEM_DEPLETED");
  assert.equal(openChestAvailability(depleted, "far", VIEWPORT).code, "CHEST_NOT_ADJACENT");
});

test("an opened chest cannot be looted after the active token moves away", () => {
  const active = token("active", 1, 1);
  const chest = createChest({ id: "chest", position: at(2, 1), inventory: [item("club")] });
  let scene = battleScene({ tokens: [active, token("target", 8, 8), token("witness", 9, 9)], chests: [chest] });
  scene = applyPatch(scene, openAdjacentChest(scene, "chest", VIEWPORT).value);
  scene = applyPatch(scene, { tokens: updateToken(scene.tokens, "active", { position: at(6, 6) }) });
  assert.equal(takeOneFromOpenChest(scene, "chest", "club", VIEWPORT).code, "CHEST_NOT_ADJACENT");
  assert.equal(quantity(scene.chests[0], "club"), 1);
});

test("ground retrieval costs Bonus, needs no roll, and equips a legal empty hand", () => {
  const active = token("active", 1, 1);
  const scene = battleScene({ tokens: [active, token("target", 5, 5), token("witness", 8, 8)], battleItems: [physical("ground", "dagger", { position: at(2, 1) })] });
  const retrieved = retrieveBattleItem(scene, "ground", VIEWPORT);
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.outcome.requiresRoll, false);
  assert.equal(retrieved.outcome.cost, "bonus");
  assert.equal(retrieved.outcome.placement, "mainHand");
  const after = applyPatch(scene, retrieved.value);
  assert.equal(quantity(after.tokens[0], "dagger"), 1);
  assert.equal(after.tokens[0].loadout.mainHand, "dagger");
  assert.equal(after.encounter.resources.active.bonusActionSpent, true);
  assert.equal(after.encounter.battleItems.length, 0);
});

test("living-carrier retrieval uses d20 plus STR and DEX against DC 15 and spends Bonus on failure", () => {
  const active = token("active", 1, 1, { strength: 16, dexterity: 14 });
  const carrier = token("target", 2, 1, { hp: 10, maxHp: 10 });
  const embedded = physical("embedded", "javelin", { state: "embedded", position: null, carrierTokenId: "target" });
  const scene = battleScene({ tokens: [active, carrier, token("witness", 8, 8)], battleItems: [embedded] });
  const failed = retrieveBattleItem(scene, "embedded", VIEWPORT, { random: () => 0.2 });
  assert.equal(failed.outcome.roll, 5);
  assert.equal(failed.outcome.strengthModifier, 3);
  assert.equal(failed.outcome.dexterityModifier, 2);
  assert.equal(failed.outcome.total, 10);
  assert.equal(failed.outcome.succeeded, false);
  const afterFailure = applyPatch(scene, failed.value);
  assert.equal(afterFailure.encounter.resources.active.bonusActionSpent, true);
  assert.equal(afterFailure.encounter.battleItems.length, 1);
  assert.equal(quantity(afterFailure.tokens[0], "javelin"), 0);

  const succeeded = retrieveBattleItem(scene, "embedded", VIEWPORT, { random: () => 0.7 });
  assert.equal(succeeded.outcome.roll, 15);
  assert.equal(succeeded.outcome.total, 20);
  assert.equal(succeeded.outcome.succeeded, true);
  assert.equal(succeeded.value.encounter.battleItems.length, 0);
});

test("a living carrier may retrieve its own embedded weapon", () => {
  const active = token("active", 1, 1, { strength: 20, dexterity: 20 });
  const scene = battleScene({ tokens: [active, token("target", 5, 5), token("witness", 8, 8)], battleItems: [physical("self", "spear", { state: "embedded", position: null, carrierTokenId: "active" })] });
  assert.equal(retrievalAvailability(scene, "self", VIEWPORT).ok, true);
  assert.equal(retrieveBattleItem(scene, "self", VIEWPORT, { random: () => 0.3 }).outcome.succeeded, true);
});

test("an adjacent defeated carrier is recovered freely even after Bonus was spent", () => {
  const active = token("active", 1, 1);
  const defeated = token("target", 2, 1, { hp: 0, maxHp: 10 });
  const resources = { ...createTurnResources(active), bonusActionSpent: true, bonusActionType: "off-hand attack" };
  const scene = battleScene({
    tokens: [active, defeated, token("witness", 8, 8)],
    resources,
    battleItems: [physical("defeated", "handaxe", { state: "embedded", position: null, carrierTokenId: "target" })],
  });
  const available = retrievalAvailability(scene, "defeated", VIEWPORT);
  assert.equal(available.ok, true);
  assert.equal(available.value.cost, "free");
  const retrieved = retrieveBattleItem(scene, "defeated", VIEWPORT);
  assert.equal(retrieved.outcome.requiresRoll, false);
  assert.equal(retrieved.value.encounter.resources.active.bonusActionType, "off-hand attack");
  assert.equal(retrieved.value.encounter.activeIndex, 0);
});

test("a recovered weapon falls back to inventory when neither hand can accept it legally", () => {
  const active = token("active", 1, 1, {
    inventory: [item("longsword")],
    loadout: { mainHand: "longsword", offHand: null },
  });
  const scene = battleScene({ tokens: [active, token("target", 5, 5), token("witness", 8, 8)], battleItems: [physical("ground", "javelin", { position: at(2, 1) })] });
  const retrieved = retrieveBattleItem(scene, "ground", VIEWPORT);
  assert.equal(retrieved.outcome.placement, "inventory");
  assert.equal(retrieved.value.tokens[0].loadout.mainHand, "longsword");
  assert.equal(quantity(retrieved.value.tokens[0], "javelin"), 1);
});

test("retrieval options preserve contextual legal and unavailable reasons", () => {
  const scene = battleScene({ battleItems: [
    physical("near", "dagger", { position: at(2, 1) }),
    physical("far", "spear", { position: at(8, 8) }),
  ] });
  const options = retrievalCommandOptions(scene, VIEWPORT);
  assert.equal(options.find(({ battleItem }) => battleItem.id === "near").availability.ok, true);
  assert.equal(options.find(({ battleItem }) => battleItem.id === "far").availability.code, "GROUND_ITEM_NOT_ADJACENT");
});

test("completion reports the winner and recovers floor fifty percent of each ammunition type exactly once", () => {
  const winner = token("active", 1, 1, { inventory: [item("shortbow"), item("arrow", 1), item("crossbow-bolt", 1)] });
  const defeated = token("target", 2, 1, { hp: 0, maxHp: 10 });
  const scene = battleScene({
    tokens: [winner, defeated],
    ammoSpentByToken: { active: { arrow: 5, "crossbow-bolt": 2 } },
  });
  const completed = completeEncounterIfNeeded(scene.tokens, scene.encounter);
  assert.equal(completed.completed, true);
  assert.equal(completed.value.encounter.status, "complete");
  assert.equal(completed.value.encounter.winnerTokenId, "active");
  assert.equal(completed.value.encounter.ammunitionRecovered, true);
  assert.equal(quantity(completed.value.tokens[0], "arrow"), 3);
  assert.equal(quantity(completed.value.tokens[0], "crossbow-bolt"), 2);
  assert.deepEqual(completed.recovery.map(({ quantity }) => quantity), [2, 1]);

  const again = completeEncounterIfNeeded(completed.value.tokens, completed.value.encounter);
  assert.equal(again.completed, false);
  assert.equal(quantity(again.value.tokens[0], "arrow"), 3);
  assert.equal(quantity(again.value.tokens[0], "crossbow-bolt"), 2);
});

test("completion supports no survivor and disables every ordinary active-turn command", () => {
  const scene = battleScene({ tokens: [token("active", 1, 1, { hp: 0 }), token("target", 2, 1, { hp: 0 })] });
  const completed = applyPatch(scene, completeEncounterIfNeeded(scene.tokens, scene.encounter).value);
  assert.equal(completed.encounter.status, "complete");
  assert.equal(completed.encounter.winnerTokenId, null);
  assert.equal(activeTurnContext(completed).code, "ACTIVE_BATTLE_REQUIRED");
  assert.equal(endTurn(completed).code, "ACTIVE_BATTLE_REQUIRED");
  assert.equal(movementAvailability(completed, "active").code, "ACTIVE_BATTLE_REQUIRED");
});

test("a defeating attack completes immediately and includes its fired round in recovery", () => {
  const active = token("active", 1, 1, { inventory: [item("shortbow"), item("arrow", 2)], loadout: { mainHand: "shortbow", offHand: null } });
  const targetToken = token("target", 3, 1, { hp: 1, maxHp: 10, ac: 1 });
  const scene = battleScene({ tokens: [active, targetToken], ammoSpentByToken: { active: { arrow: 1 } } });
  const attacked = performWeaponAttack(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0) });
  assert.equal(attacked.ok, true);
  assert.equal(attacked.outcome.completed, true);
  assert.equal(attacked.value.encounter.status, "complete");
  assert.equal(attacked.value.encounter.ammoSpentByToken.active.arrow, 2);
  assert.equal(quantity(attacked.value.tokens[0], "arrow"), 2);
});

test("restart restores HP, rerolls stable initiative, and clears conditions, resources, and physical items", () => {
  const first = token("first", 1, 1, { hp: 1, maxHp: 12, initiativeBonus: 2, conditions: ["poisoned"], inventory: [item("arrow", 2)] });
  const second = token("second", 3, 1, { hp: 0, maxHp: 20, initiativeBonus: -1, conditions: ["prone"] });
  const chest = createChest({ id: "depleted", position: at(5, 5), inventory: [] });
  const completed = battleScene({
    tokens: [first, second],
    chests: [chest],
    status: "complete",
    winnerTokenId: "first",
    ammunitionRecovered: true,
    ammoSpentByToken: { first: { arrow: 3 } },
    battleItems: [physical("left-behind", "dagger", { position: at(4, 4), sourceTokenId: "first" })],
  });
  const positions = completed.tokens.map(({ position }) => position);
  const restarted = restartCompletedBattle(completed, { random: sequence(0.1, 0.9) });
  assert.equal(restarted.ok, true);
  assert.deepEqual(restarted.value.tokens.map(({ hp, maxHp }) => [hp, maxHp]), [[12, 12], [20, 20]]);
  assert.deepEqual(restarted.value.tokens.map(({ conditions }) => conditions), [[], []]);
  assert.deepEqual(restarted.value.tokens.map(({ position }) => position), positions);
  assert.deepEqual(restarted.value.encounter.initiativeOrder, ["second", "first"]);
  assert.equal(restarted.value.encounter.round, 1);
  assert.equal(restarted.value.encounter.status, "active");
  assert.deepEqual(restarted.value.encounter.battleItems, []);
  assert.deepEqual(restarted.value.encounter.ammoSpentByToken, {});
  assert.equal(restarted.value.encounter.winnerTokenId, null);
  assert.equal(restarted.value.encounter.ammunitionRecovered, false);
  assert.equal(restarted.value.chests, undefined);
  assert.deepEqual(completed.chests, [chest]);
});

test("active and completed encounters restore physical state, ammo ledgers, loot depletion, and completion", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), { idFactory: () => "phase10-persisted", clock: () => NOW });
  const active = token("active", 1, 1);
  const chest = createChest({ id: "chest", position: at(2, 1), inventory: [item("arrow", 1)] });
  let scene = battleScene({
    tokens: [active, token("target", 3, 1), token("witness", 8, 8)],
    chests: [chest],
    resources: { ...createTurnResources(active), bonusActionSpent: true, bonusActionType: "open chest", openedChestId: "chest" },
    battleItems: [physical("ground", "dagger", { position: at(1, 2) })],
    ammoSpentByToken: { active: { arrow: 3 } },
  });
  scene = repository.create(scene).value;
  let reloaded = repository.get(scene.id).value;
  assert.equal(reloaded.encounter.resources.active.openedChestId, "chest");
  assert.equal(reloaded.encounter.battleItems[0].id, "ground");
  assert.deepEqual(reloaded.encounter.ammoSpentByToken, { active: { arrow: 3 } });
  const looted = takeOneFromOpenChest(reloaded, "chest", "arrow", VIEWPORT);
  assert.equal(repository.update(scene.id, looted.value).ok, true);
  reloaded = repository.get(scene.id).value;
  assert.equal(reloaded.chests[0].inventory.length, 0);

  const defeatedTokens = reloaded.tokens.map((entry, index) => index ? { ...entry, hp: 0 } : entry);
  const completed = completeEncounterIfNeeded(defeatedTokens, reloaded.encounter);
  assert.equal(repository.update(scene.id, completed.value).ok, true);
  reloaded = repository.get(scene.id).value;
  assert.equal(reloaded.encounter.status, "complete");
  assert.equal(reloaded.encounter.ammunitionRecovered, true);
  assert.equal(reloaded.chests[0].inventory.length, 0);
});

test("a full Setup-to-completion-to-restart walkthrough preserves depleted chests", () => {
  const archer = token("archer", 1, 1, { inventory: [item("shortbow"), item("arrow", 2)], loadout: { mainHand: "shortbow", offHand: null } });
  const foe = token("foe", 3, 1, { hp: 1, maxHp: 9, ac: 1 });
  const chest = createChest({ id: "supplies", position: at(2, 2), inventory: [item("arrow", 1)] });
  let scene = battleScene({ tokens: [archer, foe], chests: [chest] });
  scene = applyPatch(scene, openAdjacentChest(scene, "supplies", VIEWPORT).value);
  scene = applyPatch(scene, takeOneFromOpenChest(scene, "supplies", "arrow", VIEWPORT).value);
  assert.equal(scene.chests[0].inventory.length, 0);
  scene = applyPatch(scene, endTurn(scene).value);
  scene = applyPatch(scene, endTurn(scene).value);
  const attacked = performWeaponAttack(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "foe", viewport: VIEWPORT }, { random: sequence(0.5, 0) });
  assert.equal(attacked.value.encounter.status, "complete");
  scene = applyPatch(scene, attacked.value);
  const restarted = restartCompletedBattle(scene, { random: sequence(0.8, 0.2) });
  scene = applyPatch(scene, restarted.value);
  assert.equal(scene.encounter.status, "active");
  assert.equal(scene.chests[0].inventory.length, 0);
  assert.equal(scene.tokens.find(({ id }) => id === "foe").hp, 9);
});

test("the Phase 10 gate passes from real Setup through active reload, completion reload, and restart reload", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), { idFactory: () => "phase10-gate", clock: () => NOW });
  const archer = token("archer", 1, 1, {
    inventory: [item("shortbow"), item("arrow", 2)],
    loadout: { mainHand: "shortbow", offHand: null },
    dexterity: 16,
  });
  const foe = token("foe", 3, 1, { hp: 1, maxHp: 11, ac: 1 });
  const chest = createChest({ id: "gate-chest", position: at(2, 2), inventory: [item("arrow")] });
  let scene = createSceneRecord({
    id: "phase10-gate",
    name: "Complete Gate",
    kind: "battle",
    gridSize: 44,
    tokens: [archer, foe],
    chests: [chest],
    encounter: null,
  }, { id: "phase10-gate", now: NOW });
  const started = prepareBattleStart(scene, { viewport: VIEWPORT, random: sequence(0.9, 0.1) });
  assert.equal(started.ok, true);
  scene = applyPatch(scene, started.value);
  assert.equal(scene.encounter.status, "active");
  assert.equal(scene.encounter.initiativeOrder[0], "archer");
  scene = repository.create(scene).value;
  scene = repository.get(scene.id).value;
  assert.equal(activeTurnContext(scene).value.token.id, "archer");

  scene = applyPatch(scene, openAdjacentChest(scene, "gate-chest", VIEWPORT).value);
  scene = applyPatch(scene, takeOneFromOpenChest(scene, "gate-chest", "arrow", VIEWPORT).value);
  assert.equal(scene.chests[0].inventory.length, 0);
  assert.equal(repository.update(scene.id, { tokens: scene.tokens, chests: scene.chests, encounter: scene.encounter }).ok, true);
  scene = repository.get(scene.id).value;
  assert.equal(scene.chests[0].inventory.length, 0);
  const attacked = performWeaponAttack(scene, { weaponId: "shortbow", hand: "mainHand", targetId: "foe", viewport: VIEWPORT }, { random: sequence(0.5, 0) });
  assert.equal(attacked.ok, true);
  assert.equal(attacked.value.encounter.status, "complete");
  assert.equal(repository.update(scene.id, attacked.value).ok, true);
  scene = repository.get(scene.id).value;
  assert.equal(scene.encounter.status, "complete");
  assert.equal(scene.encounter.winnerTokenId, "archer");
  assert.equal(scene.encounter.ammunitionRecovered, true);
  assert.equal(scene.chests[0].inventory.length, 0);

  const restarted = restartCompletedBattle(scene, { random: sequence(0.2, 0.8) });
  assert.equal(repository.update(scene.id, restarted.value).ok, true);
  scene = repository.get(scene.id).value;
  assert.equal(scene.encounter.status, "active");
  assert.equal(scene.encounter.round, 1);
  assert.equal(scene.chests[0].inventory.length, 0);
  assert.equal(scene.tokens.find(({ id }) => id === "foe").hp, 11);
  assert.deepEqual(scene.encounter.battleItems, []);
  assert.deepEqual(scene.encounter.ammoSpentByToken, {});
});

test("a failed Phase 10 write preserves the complete last valid encounter state", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), { idFactory: () => "phase10-failure", clock: () => NOW });
  const active = token("active", 1, 1);
  const chest = createChest({ id: "chest", position: at(2, 1), inventory: [item("dagger")] });
  const created = repository.create(battleScene({ chests: [chest] })).value;
  const opened = openAdjacentChest(created, "chest", VIEWPORT);
  storage.setFailureMode("write");
  assert.equal(repository.update(created.id, opened.value).ok, false);
  storage.setFailureMode(null);
  assert.deepEqual(repository.get(created.id).value, created);
});

test("battle-item normalization never retains duplicate ids or non-weapons", () => {
  const tokens = [token("active", 1, 1), token("target", 2, 1)];
  const items = normalizeBattleItems([
    physical("one", "dagger"),
    physical("one", "spear"),
    physical("ammo", "arrow"),
  ], tokens);
  assert.deepEqual(items.map(({ id, itemId }) => [id, itemId]), [["one", "dagger"]]);
});

test("supply availability distinguishes matching ammunition, physical throws, and melee", () => {
  const archer = token("archer", 1, 1, { inventory: [item("shortbow"), item("arrow")], loadout: { mainHand: "shortbow", offHand: null } });
  const thrower = token("thrower", 1, 1, { inventory: [item("spear")], loadout: { mainHand: "spear", offHand: null } });
  assert.equal(attackSupplyAvailability(archer, ITEM_BY_ID.shortbow, { usage: "ranged" }).value.kind, "ammunition");
  assert.equal(attackSupplyAvailability(thrower, ITEM_BY_ID.spear, { usage: "thrown" }).value.kind, "thrown");
  assert.equal(attackSupplyAvailability(thrower, ITEM_BY_ID.spear, { usage: "melee" }).value.kind, "none");
});
