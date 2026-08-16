import test from "node:test";
import assert from "node:assert/strict";

import {
  activateDash,
  activeTurnContext,
  attackActionAvailability,
  dashAvailability,
  endTurn,
  findMovementRoute,
  INCAPACITATING_CONDITIONS,
  IMMOBILIZING_CONDITIONS,
  movementAvailability,
  movementEdgeBlocked,
  movementMaximum,
  movementRemaining,
  moveActiveToken,
  PATH_SEARCH_LIMIT,
  performWeaponSwap,
  planActiveMovement,
  segmentsIntersect,
  swapAvailability,
  tokenIsImmobilized,
  tokenIsIncapacitated,
  validateSwapLoadout,
} from "./domain/combat.js";
import { createSceneRecord } from "./domain/records.js";
import {
  createChest,
  createManualToken,
  createTurnResources,
  createWall,
  normalizeTurnResources,
  setupPositionForCell,
} from "./domain/table.js";
import { createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-16T14:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const at = (column, row) => setupPositionForCell({ column, row }, VIEWPORT);
const item = (itemId, quantity = 1) => ({ itemId, quantity });

const token = (id, column, row, patch = {}) => createManualToken({
  id,
  name: patch.name || id,
  position: at(column, row),
  ...patch,
});

const battleScene = ({
  tokens = [token("active", 1, 1), token("next", 8, 8)],
  chests = [],
  walls = [],
  activeIndex = 0,
  round = 1,
  resources,
} = {}) => {
  const active = tokens[activeIndex];
  return createSceneRecord({
    id: "phase8-scene",
    name: "Movement Lab",
    kind: "battle",
    tokens,
    chests,
    walls,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map((entry) => entry.id),
      initiatives: Object.fromEntries(tokens.map((entry, index) => [entry.id, 20 - index])),
      activeIndex,
      round,
      resources: { [active.id]: resources || createTurnResources(active) },
      battleItems: [],
      ammoSpentByToken: {},
      winnerTokenId: null,
      log: [],
    },
  }, { id: "phase8-scene", now: NOW });
};

const applyPatch = (scene, patch) => createSceneRecord({ ...scene, ...patch }, { id: scene.id, now: NOW });

test("turn resources normalize movement and every Phase 8 branch field", () => {
  const active = token("active", 1, 1, { baseSpeed: 30 });
  const normalized = normalizeTurnResources({
    movementBase: 60,
    movementSpent: 15,
    actionSpent: true,
    actionType: "dash",
    dashed: true,
    swapped: true,
    swapChoice: "movement",
  }, active);
  assert.equal(movementMaximum(normalized, active), 60);
  assert.equal(movementRemaining(normalized, active), 45);
  assert.equal(normalized.actionType, "dash");
  assert.equal(normalized.dashed, true);
  assert.equal(normalized.swapped, true);
  assert.equal(normalized.swapChoice, "movement");
});

test("active turn context follows persisted initiative rather than token-list position", () => {
  const tokens = [token("first", 1, 1), token("second", 2, 2, { baseSpeed: 40 })];
  const scene = battleScene({ tokens, activeIndex: 1 });
  const context = activeTurnContext(scene);
  assert.equal(context.ok, true);
  assert.equal(context.value.token.id, "second");
  assert.equal(context.value.resources.movementBase, 40);
});

test("condition helpers distinguish immobilization from incapacitation", () => {
  for (const condition of IMMOBILIZING_CONDITIONS) assert.equal(tokenIsImmobilized({ conditions: [condition.toUpperCase()] }), true);
  for (const condition of INCAPACITATING_CONDITIONS) assert.equal(tokenIsIncapacitated({ conditions: [condition] }), true);
  assert.equal(tokenIsImmobilized({ conditions: ["incapacitated"] }), false);
  assert.equal(tokenIsIncapacitated({ conditions: ["grappled"] }), false);
});

test("inclusive segment geometry detects crossing and endpoint wall contacts", () => {
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), true);
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }), true);
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }), false);
});

test("both full and half walls block movement edges", () => {
  const from = { column: 1, row: 1 };
  const to = { column: 2, row: 1 };
  for (const type of ["full", "half"]) {
    const wall = createWall({ id: `${type}-wall`, type, points: [{ xPercent: 20, yPercent: 0 }, { xPercent: 20, yPercent: 30 }] });
    assert.equal(movementEdgeBlocked(from, to, [wall], VIEWPORT), true);
  }
});

test("eight-directional routing charges one 5-foot cell for a diagonal", () => {
  const active = token("active", 1, 1);
  const route = findMovementRoute({ start: active.position, destination: at(4, 4), tokens: [active], movingTokenId: active.id, viewport: VIEWPORT });
  assert.equal(route.ok, true);
  assert.equal(route.cells.length - 1, 3);
  const plan = planActiveMovement(battleScene({ tokens: [active, token("other", 9, 9)] }), active.id, at(4, 4), VIEWPORT);
  assert.equal(plan.value.costFeet, 15);
});

test("routing cannot cut diagonally through two occupied corner cells", () => {
  const active = token("active", 0, 0);
  const route = findMovementRoute({
    start: active.position,
    destination: at(1, 1),
    tokens: [active, token("east", 1, 0), token("south", 0, 1)],
    movingTokenId: active.id,
    viewport: VIEWPORT,
  });
  assert.equal(route.ok, false);
  assert.equal(route.reason, "unreachable");
});

test("token and chest obstacles produce legal detours", () => {
  const active = token("active", 1, 1, { baseSpeed: 60 });
  const blocker = token("blocker", 2, 1);
  const chest = createChest({ id: "chest", position: at(3, 1) });
  const route = findMovementRoute({
    start: active.position,
    destination: at(4, 1),
    tokens: [active, blocker],
    chests: [chest],
    movingTokenId: active.id,
    viewport: VIEWPORT,
  });
  assert.equal(route.ok, true);
  assert.ok(route.cells.length - 1 > 3);
  assert.equal(route.cells.some((cell) => cell.column === 2 && cell.row === 1), false);
  assert.equal(route.cells.some((cell) => cell.column === 3 && cell.row === 1), false);
});

test("wall-aware A* detours charge the complete routed distance", () => {
  const active = token("active", 1, 1, { baseSpeed: 60 });
  const wall = createWall({ id: "barrier", type: "full", points: [{ xPercent: 20, yPercent: 0 }, { xPercent: 20, yPercent: 40 }] });
  const scene = battleScene({ tokens: [active, token("other", 9, 9)], walls: [wall] });
  const plan = planActiveMovement(scene, active.id, at(3, 1), VIEWPORT);
  assert.equal(plan.ok, true);
  assert.ok(plan.value.requestedFeet > 10);
  assert.equal(plan.value.costFeet, plan.value.requestedFeet);
});

test("over-budget drops land at the farthest reachable green cell", () => {
  const active = token("active", 1, 1, { baseSpeed: 30 });
  const scene = battleScene({ tokens: [active, token("other", 9, 9)] });
  const plan = planActiveMovement(scene, active.id, at(9, 1), VIEWPORT);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.overBudget, true);
  assert.equal(plan.value.costFeet, 30);
  assert.equal(plan.value.landingIndex, 6);
  assert.deepEqual(plan.value.landing, at(7, 1));
});

test("an occupied requested destination steps backward along the traced route", () => {
  const active = token("active", 1, 1, { baseSpeed: 60 });
  const occupied = token("occupied", 5, 1);
  const scene = battleScene({ tokens: [active, occupied] });
  const plan = planActiveMovement(scene, active.id, occupied.position, VIEWPORT);
  assert.equal(plan.ok, true);
  assert.equal(plan.value.overBudget, true);
  assert.deepEqual(plan.value.landing, at(4, 1));
  assert.equal(plan.value.costFeet, 15);
});

test("an enclosed or capped route leaves the token at its origin", () => {
  const active = token("active", 1, 1, { baseSpeed: 60 });
  const enclosure = createWall({
    id: "enclosure",
    type: "half",
    points: [
      { xPercent: 10, yPercent: 10 }, { xPercent: 20, yPercent: 10 },
      { xPercent: 20, yPercent: 20 }, { xPercent: 10, yPercent: 20 },
      { xPercent: 10, yPercent: 10 },
    ],
  });
  const scene = battleScene({ tokens: [active, token("other", 8, 8)], walls: [enclosure] });
  const unreachable = planActiveMovement(scene, active.id, at(5, 5), VIEWPORT);
  assert.equal(unreachable.ok, false);
  assert.equal(unreachable.code, "PATH_UNREACHABLE");
  assert.deepEqual(unreachable.route, [at(1, 1)]);
  const capped = planActiveMovement(battleScene(), "active", at(8, 8), VIEWPORT, { searchLimit: 1 });
  assert.equal(capped.code, "PATH_SEARCH_LIMIT");
  assert.ok(capped.visited > 1);
  assert.equal(PATH_SEARCH_LIMIT, 4000);
});

test("immobilized and inactive tokens cannot preview or spend movement", () => {
  const immobilized = token("active", 1, 1, { conditions: ["Restrained"] });
  const scene = battleScene({ tokens: [immobilized, token("next", 8, 8)] });
  assert.equal(movementAvailability(scene, immobilized.id).code, "TOKEN_IMMOBILIZED");
  assert.equal(planActiveMovement(scene, immobilized.id, at(2, 1), VIEWPORT).costFeet, 0);
  assert.equal(movementAvailability(scene, "next").code, "NOT_ACTIVE_TOKEN");
});

test("movement is splittable and never advances initiative automatically", () => {
  const scene = battleScene();
  const first = moveActiveToken(scene, "active", at(3, 1), VIEWPORT);
  assert.equal(first.ok, true);
  assert.equal(first.plan.costFeet, 10);
  const afterFirst = applyPatch(scene, first.value);
  const second = moveActiveToken(afterFirst, "active", at(5, 1), VIEWPORT);
  assert.equal(second.ok, true);
  const afterSecond = applyPatch(afterFirst, second.value);
  const resources = activeTurnContext(afterSecond).value.resources;
  assert.equal(resources.movementSpent, 20);
  assert.equal(afterSecond.encounter.activeIndex, 0);
  assert.equal(afterSecond.encounter.round, 1);
});

test("normal Attack state still permits remaining movement", () => {
  const active = token("active", 1, 1);
  const resources = { ...createTurnResources(active), actionSpent: true, actionType: "attack" };
  const scene = battleScene({ tokens: [active, token("next", 8, 8)], resources });
  assert.equal(movementAvailability(scene, active.id).ok, true);
  assert.equal(moveActiveToken(scene, active.id, at(2, 1), VIEWPORT).ok, true);
});

test("Dash adds one complete Speed, preserves spent movement, and spends only Action", () => {
  const active = token("active", 1, 1, { baseSpeed: 30 });
  const resources = { ...createTurnResources(active), movementSpent: 10 };
  const scene = battleScene({ tokens: [active, token("next", 8, 8)], resources });
  const dashed = activateDash(scene);
  assert.equal(dashed.ok, true);
  const after = applyPatch(scene, dashed.value);
  const next = activeTurnContext(after).value.resources;
  assert.equal(next.movementBase, 60);
  assert.equal(next.movementSpent, 10);
  assert.equal(movementRemaining(next, active), 50);
  assert.equal(next.actionSpent, true);
  assert.equal(next.actionType, "dash");
  assert.equal(next.bonusActionSpent, false);
  assert.deepEqual(after.tokens[0].position, active.position);
  assert.equal(after.encounter.activeIndex, 0);
});

test("Dash reports every unavailable branch honestly", () => {
  const active = token("active", 1, 1);
  const make = (resources, patch = {}) => battleScene({ tokens: [{ ...active, ...patch }, token("next", 8, 8)], resources });
  assert.equal(dashAvailability(make({ ...createTurnResources(active), actionSpent: true, actionType: "attack" })).code, "DASH_ACTION_SPENT");
  assert.equal(dashAvailability(make({ ...createTurnResources(active), swapped: true })).code, "DASH_AFTER_SWAP");
  assert.equal(dashAvailability(make({ ...createTurnResources(active), dashed: true, actionSpent: true })).code, "DASH_ALREADY_USED");
  assert.equal(dashAvailability(make(createTurnResources(active), { conditions: ["Stunned"] })).code, "DASH_INCAPACITATED");
});

test("Swap validates owned legal main/off-hand drafts", () => {
  const active = token("active", 1, 1, {
    inventory: [item("club"), item("dagger"), item("greatsword"), item("shield")],
    loadout: { mainHand: "club", offHand: null },
    shieldId: "shield",
  });
  assert.equal(validateSwapLoadout(active, active.loadout).code, "SWAP_UNCHANGED");
  assert.equal(validateSwapLoadout(active, { mainHand: "not-owned", offHand: null }).code, "ILLEGAL_SWAP");
  assert.equal(validateSwapLoadout(active, { mainHand: "greatsword", offHand: null }).code, "ILLEGAL_SWAP");
  assert.equal(validateSwapLoadout(active, { mainHand: "dagger", offHand: null }).ok, true);
});

test("Swap changes the persisted Battle loadout once without moving or ending turn", () => {
  const active = token("active", 1, 1, {
    inventory: [item("club"), item("dagger")],
    loadout: { mainHand: "club", offHand: null },
  });
  const scene = battleScene({ tokens: [active, token("next", 8, 8)] });
  const swapped = performWeaponSwap(scene, { mainHand: "dagger", offHand: null });
  assert.equal(swapped.ok, true);
  const after = applyPatch(scene, swapped.value);
  assert.equal(after.tokens[0].loadout.mainHand, "dagger");
  assert.equal(activeTurnContext(after).value.resources.swapped, true);
  assert.equal(activeTurnContext(after).value.resources.swapChoice, null);
  assert.equal(after.encounter.activeIndex, 0);
  assert.deepEqual(after.tokens[0].position, active.position);
  assert.equal(swapAvailability(after).code, "SWAP_ALREADY_USED");
  assert.equal(dashAvailability(after).code, "DASH_AFTER_SWAP");
  assert.equal(attackActionAvailability(after).ok, true);
});

test("Swap then Move selects the movement branch and keeps remaining movement usable", () => {
  const active = token("active", 1, 1, { inventory: [item("club"), item("dagger")], loadout: { mainHand: "club", offHand: null } });
  const scene = battleScene({ tokens: [active, token("next", 8, 8)] });
  const swapped = applyPatch(scene, performWeaponSwap(scene, { mainHand: "dagger", offHand: null }).value);
  const moved = moveActiveToken(swapped, active.id, at(2, 1), VIEWPORT);
  const afterMove = applyPatch(swapped, moved.value);
  assert.equal(activeTurnContext(afterMove).value.resources.swapChoice, "movement");
  assert.equal(attackActionAvailability(afterMove).code, "ATTACK_AFTER_SWAP_MOVEMENT");
  assert.equal(moveActiveToken(afterMove, active.id, at(3, 1), VIEWPORT).ok, true);
  assert.equal(afterMove.encounter.activeIndex, 0);
});

test("Move then Swap chooses movement, blocks Attack and Dash, and permits remaining movement", () => {
  const active = token("active", 1, 1, { inventory: [item("club"), item("dagger")], loadout: { mainHand: "club", offHand: null } });
  const scene = battleScene({ tokens: [active, token("next", 8, 8)] });
  const moved = applyPatch(scene, moveActiveToken(scene, active.id, at(2, 1), VIEWPORT).value);
  const swapped = applyPatch(moved, performWeaponSwap(moved, { mainHand: "dagger", offHand: null }).value);
  assert.equal(activeTurnContext(swapped).value.resources.swapChoice, "movement");
  assert.equal(attackActionAvailability(swapped).ok, false);
  assert.equal(dashAvailability(swapped).ok, false);
  assert.equal(moveActiveToken(swapped, active.id, at(3, 1), VIEWPORT).ok, true);
});

test("Swap then Attack state prevents all later movement", () => {
  const active = token("active", 1, 1);
  const resources = {
    ...createTurnResources(active),
    actionSpent: true,
    actionType: "attack",
    swapped: true,
    swapChoice: "attack",
  };
  const scene = battleScene({ tokens: [active, token("next", 8, 8)], resources });
  assert.equal(movementAvailability(scene, active.id).code, "SWAP_ATTACK_LOCKS_MOVEMENT");
  assert.equal(moveActiveToken(scene, active.id, at(2, 1), VIEWPORT).ok, false);
});

test("Swap is unavailable after Attack, Dash, prior Swap, or incapacitation", () => {
  const active = token("active", 1, 1);
  const make = (resources, patch = {}) => battleScene({ tokens: [{ ...active, ...patch }, token("next", 8, 8)], resources });
  assert.equal(swapAvailability(make({ ...createTurnResources(active), actionSpent: true, actionType: "attack" })).code, "SWAP_AFTER_ACTION");
  assert.equal(swapAvailability(make({ ...createTurnResources(active), dashed: true, actionSpent: true })).code, "SWAP_AFTER_DASH");
  assert.equal(swapAvailability(make({ ...createTurnResources(active), swapped: true })).code, "SWAP_ALREADY_USED");
  assert.equal(swapAvailability(make(createTurnResources(active), { conditions: ["Petrified"] })).code, "SWAP_INCAPACITATED");
});

test("End Turn skips defeated tokens and gives the next living token fresh Speed", () => {
  const tokens = [
    token("active", 1, 1, { baseSpeed: 30 }),
    token("defeated", 4, 4, { hp: 0, baseSpeed: 20 }),
    token("living", 8, 8, { baseSpeed: 40 }),
  ];
  const scene = battleScene({ tokens, resources: { ...createTurnResources(tokens[0]), movementSpent: 25, actionSpent: true } });
  const ended = endTurn(scene);
  assert.equal(ended.ok, true);
  assert.equal(ended.activeTokenId, "living");
  assert.equal(ended.value.encounter.activeIndex, 2);
  assert.equal(ended.value.encounter.round, 1);
  assert.deepEqual(ended.value.encounter.resources, { living: createTurnResources(tokens[2]) });
});

test("End Turn wraps initiative, increments round, and remains the only advance path", () => {
  const tokens = [token("first", 1, 1), token("last", 8, 8)];
  const scene = battleScene({ tokens, activeIndex: 1, round: 3 });
  const dashed = applyPatch(scene, activateDash(scene).value);
  assert.equal(dashed.encounter.activeIndex, 1);
  const ended = endTurn(dashed);
  assert.equal(ended.wrapped, true);
  assert.equal(ended.value.encounter.activeIndex, 0);
  assert.equal(ended.value.encounter.round, 4);
  assert.deepEqual(ended.value.encounter.resources, { first: createTurnResources(tokens[0]) });
});

test("End Turn reports an encounter with no living receiver", () => {
  const defeated = token("defeated", 1, 1, { hp: 0 });
  const scene = battleScene({ tokens: [defeated] });
  assert.equal(endTurn(scene).code, "NO_LIVING_TOKEN");
});

test("mid-turn movement, Dash, Swap, and active initiative survive repository reload", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    idFactory: () => "phase8-persisted",
    clock: () => NOW,
  });
  const active = token("active", 1, 1, { inventory: [item("club"), item("dagger")], loadout: { mainHand: "club", offHand: null } });
  const initial = battleScene({ tokens: [active, token("next", 8, 8)] });
  const created = makeRepository().create(initial).value;
  const moved = applyPatch(created, moveActiveToken(created, active.id, at(3, 1), VIEWPORT).value);
  const swapped = applyPatch(moved, performWeaponSwap(moved, { mainHand: "dagger", offHand: null }).value);
  assert.equal(makeRepository().update(created.id, { tokens: swapped.tokens, encounter: swapped.encounter }).ok, true);

  const reloaded = makeRepository().get(created.id).value;
  assert.deepEqual(reloaded.tokens[0].position, at(3, 1));
  assert.equal(reloaded.tokens[0].loadout.mainHand, "dagger");
  assert.equal(activeTurnContext(reloaded).value.resources.movementSpent, 10);
  assert.equal(activeTurnContext(reloaded).value.resources.swapChoice, "movement");
  assert.equal(reloaded.encounter.activeIndex, 0);
});

test("a failed Phase 8 command write preserves the last valid turn state", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), {
    idFactory: () => "phase8-failure",
    clock: () => NOW,
  });
  const created = repository.create(battleScene()).value;
  const movement = moveActiveToken(created, "active", at(3, 1), VIEWPORT);
  assert.equal(movement.ok, true);
  storage.setFailureMode("write");
  const failed = repository.update(created.id, movement.value);
  assert.equal(failed.ok, false);
  storage.setFailureMode(null);
  assert.deepEqual(repository.get(created.id).value, created);
});
