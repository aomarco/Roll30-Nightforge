import test from "node:test";
import assert from "node:assert/strict";

import { attackLineOfSight, opportunityAttacksFor, performWeaponAttack } from "./domain/attacks.js";
import { forceMoveToken, moveActiveToken, planActiveMovement } from "./domain/combat.js";
import { performSavingThrow } from "./domain/checks.js";
import {
  moveTiedInitiative,
  rerollEncounterInitiatives,
  setEncounterInitiative,
  takeCoinFromOpenChest,
} from "./domain/encounter.js";
import { COIN_DENOMINATIONS, coinValueCopper, normalizeCoins, transferCoins } from "./domain/money.js";
import { MONSTERS } from "./domain/monsters.generated.js";
import { createSceneRecord } from "./domain/records.js";
import {
  createChest,
  createManualToken,
  createMonsterToken,
  createTurnResources,
  createWall,
  setupCellForPosition,
  setupPositionForCell,
} from "./domain/table.js";

const NOW = "2026-08-26T10:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const at = (column, row) => setupPositionForCell({ column, row }, VIEWPORT);
const item = (itemId, quantity = 1) => ({ itemId, quantity });
const token = (id, column, row, patch = {}) => createManualToken({ id, name: id, position: at(column, row), ...patch });

function battle(tokens, patch = {}) {
  return createSceneRecord({
    id: "workflow-features",
    name: "Workflow features",
    kind: "battle",
    tokens,
    chests: patch.chests || [],
    walls: patch.walls || [],
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map(({ id }) => id),
      initiatives: Object.fromEntries(tokens.map(({ id }, index) => [id, 20 - index])),
      activeIndex: 0,
      round: 1,
      resources: { [tokens[0].id]: createTurnResources(tokens[0]) },
      battleItems: [],
      ammoSpentByToken: {},
      log: [],
      ...patch.encounter,
    },
  }, { id: "workflow-features", now: NOW });
}

test("money normalizes five denominations and transfers exact coins without conversion", () => {
  assert.deepEqual(Object.keys(normalizeCoins({ gp: 4 })), COIN_DENOMINATIONS.map(({ id }) => id));
  assert.equal(coinValueCopper({ gp: 4, sp: 3, cp: 2 }), 432);
  const moved = transferCoins({ gp: 2 }, { gp: 1 }, "gp", 2);
  assert.equal(moved.ok, true);
  assert.equal(moved.source.gp, 0);
  assert.equal(moved.destination.gp, 3);
  assert.equal(transferCoins({ gp: 1 }, {}, "gp", 2).code, "COINS_INSUFFICIENT");
});

test("an opened chest transfers money to the active creature and persists depletion", () => {
  const actor = token("actor", 1, 1, { coins: { gp: 2 } });
  const target = token("target", 5, 5);
  const chest = createChest({ id: "chest", position: at(2, 1), coins: { gp: 3 } });
  const scene = battle([actor, target], { chests: [chest] });
  scene.encounter.resources.actor = { ...scene.encounter.resources.actor, bonusActionSpent: true, bonusActionType: "open chest", openedChestId: "chest" };
  const taken = takeCoinFromOpenChest(scene, "chest", "gp", VIEWPORT);
  assert.equal(taken.ok, true);
  assert.equal(taken.value.tokens.find(({ id }) => id === "actor").coins.gp, 3);
  assert.equal(taken.value.chests[0].coins.gp, 2);
});

test("initiative scores can be edited, rerolled, and manually ordered only inside ties", () => {
  const scene = battle([token("alpha", 1, 1), token("beta", 2, 1), token("gamma", 3, 1)]);
  const edited = setEncounterInitiative(scene, "gamma", 30);
  assert.deepEqual(edited.value.encounter.initiativeOrder, ["gamma", "alpha", "beta"]);
  assert.equal(edited.value.encounter.initiativeOrder[edited.value.encounter.activeIndex], "alpha");

  const tiedScene = { ...scene, encounter: { ...scene.encounter, initiatives: { alpha: 12, beta: 12, gamma: 5 } } };
  const tied = moveTiedInitiative(tiedScene, "beta", "up");
  assert.deepEqual(tied.value.encounter.initiativeOrder, ["beta", "alpha", "gamma"]);
  assert.equal(moveTiedInitiative(tiedScene, "gamma", "up").code, "INITIATIVE_NOT_TIED");

  const rerolled = rerollEncounterInitiatives(scene, { random: () => 0 });
  assert.deepEqual(rerolled.initiatives, { alpha: 1, beta: 1, gamma: 1 });
  assert.equal(rerolled.value.encounter.initiativeOrder[rerolled.value.encounter.activeIndex], "alpha");
});

test("movement can stop at an opportunity-attack boundary and resume after the reaction", () => {
  const runner = token("runner", 1, 1, { faction: "ally", hp: 30, maxHp: 30 });
  const guard = token("guard", 2, 2, { faction: "foe", inventory: [item("longsword")], loadout: { mainHand: "longsword", offHand: null } });
  const scene = battle([runner, guard]);
  const destination = at(5, 1);
  const plan = planActiveMovement(scene, "runner", destination, VIEWPORT);
  const reactions = opportunityAttacksFor(scene, plan.value, VIEWPORT);
  assert.equal(reactions.length, 1);
  const interrupted = moveActiveToken(scene, "runner", destination, VIEWPORT, { landingIndex: reactions[0].departureIndex });
  if (reactions[0].departureIndex === 0) {
    assert.equal(interrupted.code, "NO_LEGAL_MOVEMENT");
  } else {
    assert.deepEqual(setupCellForPosition(interrupted.plan.landing, VIEWPORT), plan.value.cells[reactions[0].departureIndex]);
    assert.ok(interrupted.plan.costFeet < plan.value.costFeet);
  }
  const reaction = performWeaponAttack(scene, {
    kind: "reaction", reactorId: "guard", targetId: "runner", weaponId: "longsword", hand: "mainHand",
    targetPosition: reactions[0].departurePosition, reactionType: "opportunity", viewport: VIEWPORT,
  }, { random: () => 0.75 });
  assert.equal(reaction.ok, true);
  assert.equal(reaction.value.tokens.find(({ id }) => id === "guard").reactionSpent, true);
});

test("forced push, pull, and slide use one collision-aware engine without spending movement", () => {
  const source = token("source", 1, 1);
  const target = token("target", 2, 1);
  const scene = battle([source, target]);
  const pushed = forceMoveToken(scene, "target", { mode: "push", sourceTokenId: "source", distanceFeet: 10 }, VIEWPORT);
  assert.equal(pushed.ok, true);
  assert.deepEqual(setupCellForPosition(pushed.value.tokens.find(({ id }) => id === "target").position, VIEWPORT), { column: 4, row: 1 });
  assert.equal(pushed.value.encounter.resources.source.movementSpent, 0);
  const pulled = forceMoveToken({ ...scene, tokens: pushed.value.tokens }, "target", { mode: "pull", sourceTokenId: "source", distanceFeet: 5 }, VIEWPORT);
  assert.deepEqual(setupCellForPosition(pulled.value.tokens.find(({ id }) => id === "target").position, VIEWPORT), { column: 3, row: 1 });
  const slid = forceMoveToken(scene, "target", { mode: "slide", direction: { column: 0, row: 1 }, distanceFeet: 5 }, VIEWPORT);
  assert.deepEqual(setupCellForPosition(slid.value.tokens.find(({ id }) => id === "target").position, VIEWPORT), { column: 2, row: 2 });
  const blocker = token("blocker", 4, 1);
  const obstructed = battle([source, target, blocker]);
  const stopped = forceMoveToken(obstructed, "target", { mode: "push", sourceTokenId: "source", distanceFeet: 15 }, VIEWPORT);
  assert.equal(stopped.stoppedEarly, true);
  assert.equal(stopped.movedFeet, 5);
  assert.deepEqual(setupCellForPosition(stopped.value.tokens.find(({ id }) => id === "target").position, VIEWPORT), { column: 3, row: 1 });
});

test("cover has explicit +2, +5, and total tiers and also applies to Dexterity saves", () => {
  const archer = token("archer", 1, 1, { inventory: [item("shortbow"), item("arrow", 20)], loadout: { mainHand: "shortbow", offHand: null } });
  const target = token("target", 4, 1, { ac: 12 });
  const points = [{ xPercent: 30, yPercent: 0 }, { xPercent: 30, yPercent: 30 }];
  const half = battle([archer, target], { walls: [createWall({ id: "half", type: "half", points })] });
  const high = battle([archer, target], { walls: [createWall({ id: "high", type: "three-quarters", points })] });
  const total = battle([archer, target], { walls: [createWall({ id: "total", type: "full", points })] });
  assert.deepEqual({ level: attackLineOfSight(half, archer, target, "ranged").coverLevel, bonus: attackLineOfSight(half, archer, target, "ranged").coverBonus }, { level: "half", bonus: 2 });
  assert.equal(attackLineOfSight(high, archer, target, "ranged").coverBonus, 5);
  assert.equal(attackLineOfSight(total, archer, target, "ranged").state, "blocked");
  const save = performSavingThrow(high, { tokenId: "target", sourceTokenId: "archer", ability: "dex", dc: 15, viewport: VIEWPORT }, { random: () => 0.5 });
  assert.equal(save.ok, true);
  assert.equal(save.outcome.coverBonus, 5);
  assert.equal(performSavingThrow(total, { tokenId: "target", sourceTokenId: "archer", ability: "dex", dc: 15, viewport: VIEWPORT }).code, "SAVE_TOTAL_COVER");
});

test("monster inventories contain only exact catalog weapons named in their attacks", () => {
  const goblin = createMonsterToken(MONSTERS.find(({ id }) => id === "goblin"), { id: "goblin-token", position: at(1, 1) });
  assert.deepEqual(goblin.inventory.map(({ itemId }) => itemId).sort(), ["scimitar", "shortbow"]);
  const wolf = createMonsterToken(MONSTERS.find(({ id }) => id === "wolf"), { id: "wolf-token", position: at(2, 1) });
  assert.deepEqual(wolf.inventory, []);
  assert.deepEqual(wolf.coins, normalizeCoins());
});
