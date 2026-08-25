import { ITEM_BY_ID } from "./catalog.js";
import { changeCondition, CONDITIONS, expireConditionsAtRound, isImmobilized, isIncapacitated } from "./conditions.js";
import { setMainHand, setOffHand } from "./items.js";
import {
  appendEncounterLog,
  CLEARED_TURN_STATE,
  createTurnResources,
  isDying,
  isStable,
  MOVEMENT_MODES,
  normalizeDifficultTerrain,
  normalizeChests,
  normalizeTableTokens,
  normalizeTurnResources,
  normalizeWalls,
  setupCellForPosition,
  setupGridMetrics,
  setupPositionForCell,
  tokenSkillModifier,
  TOKEN_SIZES,
  updateToken,
} from "./table.js";

export const MOVEMENT_FEET_PER_CELL = 5;
export const PATH_SEARCH_LIMIT = 4000;

export const IMMOBILIZING_CONDITIONS = Object.freeze(CONDITIONS.filter((condition) => condition.immobile).map((condition) => condition.id));

export const INCAPACITATING_CONDITIONS = Object.freeze(CONDITIONS.filter((condition) => condition.incapacitated).map((condition) => condition.id));

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({
  ok: false,
  code,
  message,
  recovery,
  retryable,
  ...metadata,
});

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const tokenIsImmobilized = (token) => isImmobilized(token?.conditions);

export const tokenIsIncapacitated = (token) => isIncapacitated(token?.conditions);

/** Help is offered by stepping in beside someone, so it reaches one square. */
export const HELP_REACH_FEET = 5;
export const SPECIAL_ATTACK_REACH_FEET = 5;
export const READY_TRIGGER_OPTIONS = Object.freeze([
  { id: "target-moves", label: "when the target moves" },
  { id: "target-attacks", label: "when the target attacks" },
  { id: "target-ends-turn", label: "when the target ends its turn" },
]);

/**
 * Distance in feet across the square grid, counting a diagonal as one square.
 * The same measure the ruler and every attack range use, restated here because
 * the attack module cannot be imported from this one without the two files
 * importing each other.
 */
export const chebyshevFeet = (from, to, viewport) => {
  const start = setupCellForPosition(from, viewport);
  const end = setupCellForPosition(to, viewport);
  return Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row)) * MOVEMENT_FEET_PER_CELL;
};

export const movementMaximum = (resources, token) =>
  normalizeTurnResources(resources, token).movementBase;

export const movementRemaining = (resources, token) => {
  const normalized = normalizeTurnResources(resources, token);
  return Math.max(0, normalized.movementBase - normalized.movementSpent);
};

export function activeTurnContext(scene) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "This command requires an active Battle.",
    "Start or resume a Battle before using turn commands.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const order = Array.isArray(scene.encounter.initiativeOrder) ? scene.encounter.initiativeOrder : [];
  const activeIndex = Math.max(0, Math.min(Math.max(0, order.length - 1), Math.floor(finite(scene.encounter.activeIndex))));
  const tokenId = order[activeIndex];
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure(
    "ACTIVE_TOKEN_MISSING",
    "The active initiative token is missing from this Scene.",
    "Return to Setup and begin the encounter again.",
  );
  const resources = normalizeTurnResources(scene.encounter.resources?.[token.id], token);
  return success({ tokens, token, tokenId, activeIndex, order, resources });
}

const cellKey = (cell) => `${cell.column}:${cell.row}`;
const sameCell = (left, right) => left.column === right.column && left.row === right.row;

const pixelPointForCell = (cell, viewport) => {
  const position = setupPositionForCell(cell, viewport);
  const metrics = setupGridMetrics(viewport);
  return {
    x: position.xPercent / 100 * metrics.width,
    y: position.yPercent / 100 * metrics.height,
  };
};

const pixelPointForPercent = (point, viewport) => {
  const metrics = setupGridMetrics(viewport);
  return {
    x: finite(point?.xPercent) / 100 * metrics.width,
    y: finite(point?.yPercent) / 100 * metrics.height,
  };
};

const orientation = (a, b, c) => {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : -1;
};

const onSegment = (a, b, point) =>
  point.x <= Math.max(a.x, b.x) + 1e-7 &&
  point.x >= Math.min(a.x, b.x) - 1e-7 &&
  point.y <= Math.max(a.y, b.y) + 1e-7 &&
  point.y >= Math.min(a.y, b.y) - 1e-7;

export function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(firstStart, firstEnd, secondStart)) return true;
  if (o2 === 0 && onSegment(firstStart, firstEnd, secondEnd)) return true;
  if (o3 === 0 && onSegment(secondStart, secondEnd, firstStart)) return true;
  if (o4 === 0 && onSegment(secondStart, secondEnd, firstEnd)) return true;
  return false;
}

const wallSegments = (walls, viewport) => normalizeWalls(walls).flatMap((wall) =>
  wall.points.slice(1).map((point, index) => ({
    type: wall.type,
    start: pixelPointForPercent(wall.points[index], viewport),
    end: pixelPointForPercent(point, viewport),
  })),
);

const edgeBlockedBySegments = (fromCell, toCell, segments, viewport) => {
  const start = pixelPointForCell(fromCell, viewport);
  const end = pixelPointForCell(toCell, viewport);
  return segments.some((wall) => segmentsIntersect(start, end, wall.start, wall.end));
};

export function movementEdgeBlocked(fromCell, toCell, walls, viewport) {
  return edgeBlockedBySegments(fromCell, toCell, wallSegments(walls, viewport), viewport);
}

const occupiedCellSet = ({ tokens, chests, movingTokenId, viewport }) => {
  const occupied = new Set();
  for (const token of normalizeTableTokens(tokens)) {
    if (token.id !== movingTokenId) occupied.add(cellKey(setupCellForPosition(token.position, viewport)));
  }
  for (const chest of normalizeChests(chests)) occupied.add(cellKey(setupCellForPosition(chest.position, viewport)));
  return occupied;
};

const routeFailure = (reason, visited = 0) => ({ ok: false, reason, route: [], visited });

export function findMovementRoute({
  start,
  destination,
  tokens = [],
  chests = [],
  walls = [],
  difficultTerrain = [],
  movementMode = "walk",
  movementCostMultiplier = 1,
  movingTokenId,
  viewport,
  searchLimit = PATH_SEARCH_LIMIT,
} = {}) {
  const metrics = setupGridMetrics(viewport);
  const startCell = setupCellForPosition(start, viewport);
  const goalCell = setupCellForPosition(destination, viewport);
  if (sameCell(startCell, goalCell)) return { ok: true, cells: [startCell], stepCosts: [], visited: 0 };
  const occupied = occupiedCellSet({ tokens, chests, movingTokenId, viewport });
  const terrain = new Set(normalizeDifficultTerrain(difficultTerrain));
  const multiplier = Math.max(1, Math.floor(finite(movementCostMultiplier, 1)));
  const segments = wallSegments(walls, viewport);
  const startKey = cellKey(startCell);
  const goalKey = cellKey(goalCell);
  const open = [{ cell: startCell, key: startKey, g: 0, h: 0, deviation: 0, f: 0 }];
  const cameFrom = new Map();
  const scores = new Map([[startKey, 0]]);
  const closed = new Set();
  let visited = 0;
  const directions = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  while (open.length) {
    open.sort((left, right) => left.f - right.f || left.deviation - right.deviation || left.h - right.h || left.cell.row - right.cell.row || left.cell.column - right.cell.column);
    const current = open.shift();
    if (closed.has(current.key)) continue;
    closed.add(current.key);
    visited += 1;
    if (visited > Math.max(1, Math.floor(finite(searchLimit, PATH_SEARCH_LIMIT)))) return routeFailure("search-limit", visited);
    if (current.key === goalKey) {
      const cells = [current.cell];
      let key = current.key;
      while (cameFrom.has(key)) {
        const previous = cameFrom.get(key);
        cells.push(previous.cell);
        key = previous.key;
      }
      cells.reverse();
      const stepCosts = cells.slice(1).map((cell) => (movementMode === "fly" ? 1 : terrain.has(cellKey(cell)) ? 2 : 1) * multiplier);
      return { ok: true, cells, stepCosts, visited };
    }

    for (const [columnDelta, rowDelta] of directions) {
      const neighbor = { column: current.cell.column + columnDelta, row: current.cell.row + rowDelta };
      if (neighbor.column < 0 || neighbor.column >= metrics.columns || neighbor.row < 0 || neighbor.row >= metrics.rows) continue;
      const neighborKey = cellKey(neighbor);
      if (closed.has(neighborKey)) continue;
      if (occupied.has(neighborKey) && neighborKey !== goalKey) continue;
      if (edgeBlockedBySegments(current.cell, neighbor, segments, viewport)) continue;

      if (columnDelta && rowDelta) {
        const horizontal = { column: current.cell.column + columnDelta, row: current.cell.row };
        const vertical = { column: current.cell.column, row: current.cell.row + rowDelta };
        if (occupied.has(cellKey(horizontal)) || occupied.has(cellKey(vertical))) continue;
        if (
          edgeBlockedBySegments(current.cell, horizontal, segments, viewport) ||
          edgeBlockedBySegments(current.cell, vertical, segments, viewport) ||
          edgeBlockedBySegments(horizontal, neighbor, segments, viewport) ||
          edgeBlockedBySegments(vertical, neighbor, segments, viewport)
        ) continue;
      }

      const tentative = current.g + (movementMode === "fly" ? 1 : terrain.has(neighborKey) ? 2 : 1) * multiplier;
      if (tentative >= (scores.get(neighborKey) ?? Infinity)) continue;
      cameFrom.set(neighborKey, { key: current.key, cell: current.cell });
      scores.set(neighborKey, tentative);
      const heuristic = Math.max(Math.abs(goalCell.column - neighbor.column), Math.abs(goalCell.row - neighbor.row));
      const deviation = Math.abs(
        (goalCell.row - startCell.row) * (neighbor.column - startCell.column) -
        (goalCell.column - startCell.column) * (neighbor.row - startCell.row),
      );
      open.push({ cell: neighbor, key: neighborKey, g: tentative, h: heuristic, deviation, f: tentative + heuristic });
    }
  }
  return routeFailure("unreachable", visited);
}

export function movementAvailability(scene, tokenId) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.id !== tokenId) return failure(
    "NOT_ACTIVE_TOKEN",
    "Only the active initiative token can move.",
    "Wait for this token's turn or select the active token.",
  );
  if (token.hp <= 0) return failure("TOKEN_DEFEATED", "A defeated token cannot move.", "End the turn to advance initiative.");
  if (tokenIsImmobilized(token)) return failure(
    "TOKEN_IMMOBILIZED",
    `${token.name} is immobilized and has no movement.`,
    "Remove the immobilizing condition before moving.",
  );
  if (resources.swapChoice === "attack") return failure(
    "SWAP_ATTACK_LOCKS_MOVEMENT",
    "Movement is unavailable after choosing the Swap-then-Attack branch.",
    "End the turn when the attack is complete.",
  );
  if (movementRemaining(resources, token) < MOVEMENT_FEET_PER_CELL) return failure(
    "NO_MOVEMENT_REMAINING",
    `${token.name} has less than 5 feet of movement remaining.`,
    "End the turn or use movement on a later turn.",
  );
  return success(context.value);
}

export function planActiveMovement(scene, tokenId, destination, viewport, options = {}) {
  const available = movementAvailability(scene, tokenId);
  const token = available.ok
    ? available.value.token
    : normalizeTableTokens(scene?.tokens).find((entry) => entry.id === tokenId);
  const startCell = setupCellForPosition(token?.position, viewport);
  const origin = setupPositionForCell(startCell, viewport);
  if (!available.ok) return { ...available, tokenId, route: [origin], cells: [startCell], reachableIndex: 0, landingIndex: 0, costFeet: 0 };
  const grappledTarget = available.value.tokens.find((entry) => entry.grappledById === token.id && entry.conditions.includes("grappled")) || null;
  const draggingAtFullSpeed = grappledTarget
    && TOKEN_SIZES.indexOf(grappledTarget.size) <= TOKEN_SIZES.indexOf(token.size) - 2;
  const movementCostMultiplier = grappledTarget && !draggingAtFullSpeed ? 2 : 1;
  const route = findMovementRoute({
    start: token.position,
    destination,
    tokens: scene.tokens,
    chests: scene.chests,
    walls: scene.walls,
    difficultTerrain: scene.difficultTerrain,
    movementMode: available.value.resources.movementMode,
    movementCostMultiplier,
    movingTokenId: token.id,
    viewport,
    searchLimit: options.searchLimit,
  });
  if (!route.ok) return failure(
    route.reason === "search-limit" ? "PATH_SEARCH_LIMIT" : "PATH_UNREACHABLE",
    route.reason === "search-limit" ? "The route search reached its 4,000-cell safety limit." : "No legal route reaches that destination.",
    "Choose another destination with a clear route.",
    true,
    { tokenId, route: [origin], cells: [startCell], reachableIndex: 0, landingIndex: 0, costFeet: 0, visited: route.visited },
  );
  const positions = route.cells.map((cell) => setupPositionForCell(cell, viewport));
  const occupied = occupiedCellSet({ tokens: scene.tokens, chests: scene.chests, movingTokenId: token.id, viewport });
  const remainingCells = Math.floor(movementRemaining(available.value.resources, token) / MOVEMENT_FEET_PER_CELL);
  let landingIndex = 0;
  let costCells = 0;
  for (let index = 1; index < route.cells.length; index += 1) {
    const nextCost = route.stepCosts[index - 1] || 1;
    if (costCells + nextCost > remainingCells) break;
    costCells += nextCost;
    landingIndex = index;
  }
  while (landingIndex > 0 && occupied.has(cellKey(route.cells[landingIndex]))) landingIndex -= 1;
  costCells = route.stepCosts.slice(0, landingIndex).reduce((total, step) => total + step, 0);
  const costFeet = costCells * MOVEMENT_FEET_PER_CELL;
  return success({
    tokenId,
    cells: route.cells,
    route: positions,
    reachableIndex: landingIndex,
    landingIndex,
    landing: positions[landingIndex],
    stepCosts: route.stepCosts,
    costFeet,
    requestedFeet: route.stepCosts.reduce((total, step) => total + step, 0) * MOVEMENT_FEET_PER_CELL,
    overBudget: landingIndex < route.cells.length - 1,
    visited: route.visited,
    grappledTargetId: grappledTarget?.id || null,
    movementCostMultiplier,
  });
}

export function moveActiveToken(scene, tokenId, destination, viewport, options = {}) {
  const plan = planActiveMovement(scene, tokenId, destination, viewport, options);
  if (!plan.ok) return plan;
  const requestedLandingIndex = options.landingIndex === undefined
    ? plan.value.landingIndex
    : Math.max(0, Math.min(plan.value.landingIndex, Math.floor(finite(options.landingIndex))));
  if (requestedLandingIndex <= 0) return failure(
    "NO_LEGAL_MOVEMENT",
    "That destination does not provide a legal movement step.",
    "Choose a reachable empty cell at least 5 feet away.",
    true,
    { plan: plan.value },
  );
  const landing = plan.value.route[requestedLandingIndex];
  const costFeet = plan.value.stepCosts
    .slice(0, requestedLandingIndex)
    .reduce((total, step) => total + step, 0) * MOVEMENT_FEET_PER_CELL;
  const context = activeTurnContext(scene).value;
  const resources = {
    ...context.resources,
    movementSpent: context.resources.movementSpent + costFeet,
    swapChoice: context.resources.swapped ? "movement" : context.resources.swapChoice,
  };
  let tokens = updateToken(context.tokens, tokenId, { position: landing });
  if (plan.value.grappledTargetId) {
    const followPosition = plan.value.route[Math.max(0, requestedLandingIndex - 1)];
    tokens = updateToken(tokens, plan.value.grappledTargetId, { position: followPosition });
  }
  const encounter = {
    ...scene.encounter,
    resources: { [tokenId]: resources },
    log: appendEncounterLog(scene.encounter.log, `${context.token.name} moves ${costFeet} feet using ${context.resources.movementMode}${plan.value.grappledTargetId ? " while dragging a grappled creature" : ""}.`),
  };
  return success({ tokens, encounter }, { plan: { ...plan.value, landingIndex: requestedLandingIndex, landing, costFeet } });
}

export function selectMovementMode(scene, mode) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (!MOVEMENT_MODES.includes(mode)) return failure("MOVEMENT_MODE_UNKNOWN", "That movement mode is not available.", "Choose walk, fly, swim, or climb.");
  const speed = Math.max(0, Math.floor(finite(token.speeds?.[mode])));
  if (speed <= 0) return failure("MOVEMENT_MODE_UNAVAILABLE", `${token.name} has no ${mode} speed.`, "Choose a movement mode shown on the token.");
  const movementBase = speed * (resources.dashed ? 2 : 1);
  return success({
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: { ...resources, movementMode: mode, movementBase } },
      log: appendEncounterLog(scene.encounter.log, `${token.name} switches to ${mode} movement (${speed} feet).`),
    },
  }, { mode, speed });
}

export function dashAvailability(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || tokenIsIncapacitated(token)) return failure(
    "DASH_INCAPACITATED",
    `${token.name} cannot Dash while incapacitated or defeated.`,
    "Remove the condition or end the turn.",
  );
  if (resources.dashed) return failure("DASH_ALREADY_USED", "Dash was already used this turn.", "End the turn to refresh Action resources.");
  if (resources.swapped) return failure("DASH_AFTER_SWAP", "Dash is unavailable after a weapon swap.", "Use remaining movement or end the turn.");
  if (resources.actionSpent) return failure(
    "DASH_ACTION_SPENT",
    `Dash is unavailable because ${resources.actionType || "the Action"} was already used.`,
    "Use remaining movement or end the turn.",
  );
  return context;
}

export function activateDash(scene) {
  const available = dashAvailability(scene);
  if (!available.ok) return available;
  const { token, resources } = available.value;
  const modeSpeed = Math.max(0, Math.floor(finite(token.speeds?.[resources.movementMode], token.baseSpeed)));
  const next = {
    ...resources,
    movementBase: resources.movementBase + modeSpeed,
    actionSpent: true,
    actionType: "dash",
    dashed: true,
  };
  return success({
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: next },
      log: appendEncounterLog(scene.encounter.log, `${token.name} uses Dash.`),
    },
  });
}

/**
 * The shared gate for the three plain Action commands: Dodge, Disengage and
 * Help. They refuse for exactly the same reasons Dash does — the creature is
 * down or incapacitated, it has already Dashed, it has swapped weapons, or the
 * Action is gone — so the reasons are written once rather than three times.
 *
 * `verb` goes straight into the refusal message, which is why it is capitalised
 * at the call site: "Dodge is unavailable" reads as the name of the Action.
 */
function tacticAvailability(scene, verb) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || tokenIsIncapacitated(token)) return failure(
    "TACTIC_INCAPACITATED",
    `${token.name} cannot ${verb} while incapacitated or down.`,
    "Remove the condition or end the turn.",
  );
  if (resources.dashed) return failure("TACTIC_AFTER_DASH", `${verb} is unavailable after Dash.`, "Use remaining movement or end the turn.");
  if (resources.swapped) return failure("TACTIC_AFTER_SWAP", `${verb} is unavailable after a weapon swap.`, "Use remaining movement or end the turn.");
  if (resources.actionSpent) return failure(
    "TACTIC_ACTION_SPENT",
    `${verb} is unavailable because ${resources.actionType || "the Action"} was already used.`,
    "Use remaining movement or end the turn.",
  );
  return context;
}

/**
 * Spending the Action on a tactic, and marking the token with whatever the
 * tactic leaves behind. The mark goes on the token rather than into turn
 * resources because every one of these outlives the turn that bought it.
 */
function activateTactic(scene, { verb, actionType, patch, logText }) {
  const available = tacticAvailability(scene, verb);
  if (!available.ok) return available;
  const { token, resources, tokens } = available.value;
  return success({
    tokens: updateToken(tokens, token.id, patch),
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: { ...resources, actionSpent: true, actionType } },
      log: appendEncounterLog(scene.encounter.log, logText(token)),
    },
  });
}

export const dodgeAvailability = (scene) => tacticAvailability(scene, "Dodge");

/**
 * Dodge makes every attack against the creature roll at disadvantage until its
 * next turn. The flag is all this needs to do: the attack roll already collects
 * advantage and disadvantage from a list of sources, so Dodge simply adds one.
 */
export const activateDodge = (scene) => activateTactic(scene, {
  verb: "Dodge",
  actionType: "dodge",
  patch: { dodging: true },
  logText: (token) => `${token.name} takes the Dodge Action.`,
});

export const disengageAvailability = (scene) => tacticAvailability(scene, "Disengage");

export const activateDisengage = (scene) => activateTactic(scene, {
  verb: "Disengage",
  actionType: "disengage",
  patch: { disengaging: true },
  logText: (token) => `${token.name} Disengages and can move without drawing an opportunity attack.`,
});

export const readyAvailability = (scene) => tacticAvailability(scene, "Ready");

export function activateReady(scene, specification = {}) {
  const available = readyAvailability(scene);
  if (!available.ok) return available;
  const { token, resources, tokens } = available.value;
  const trigger = READY_TRIGGER_OPTIONS.some((entry) => entry.id === specification.trigger)
    ? specification.trigger
    : null;
  const target = tokens.find((entry) => entry.id === specification.targetTokenId);
  if (!target || target.faction === token.faction || target.hp <= 0) return failure(
    "READY_TARGET_INVALID",
    "A readied attack needs a standing enemy as its trigger target.",
    "Choose a standing creature on the other side.",
  );
  if (!trigger) return failure("READY_TRIGGER_INVALID", "Choose when the readied attack should trigger.", "Choose movement, attack, or end of turn.");
  const attack = specification.attackId
    ? token.attacks.find((entry) => entry.id === specification.attackId)
    : null;
  const weapon = specification.weaponId ? ITEM_BY_ID[specification.weaponId] : null;
  const equipped = weapon?.kind === "weapon" && [token.loadout.mainHand, token.loadout.offHand].includes(weapon.id);
  if (!attack && !equipped) return failure("READY_ATTACK_INVALID", "That attack is no longer available to Ready.", "Choose an equipped weapon or an authored attack.");
  const readiedAction = {
    trigger,
    targetTokenId: target.id,
    weaponId: attack ? null : weapon.id,
    attackId: attack?.id || null,
    hand: attack ? null : (["mainHand", "offHand"].includes(specification.hand) ? specification.hand : token.loadout.mainHand === weapon.id ? "mainHand" : "offHand"),
  };
  return success({
    tokens: updateToken(tokens, token.id, { readiedAction }),
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: { ...resources, actionSpent: true, actionType: "ready" } },
      log: appendEncounterLog(scene.encounter.log, `${token.name} Readies an attack ${READY_TRIGGER_OPTIONS.find((entry) => entry.id === trigger).label} (${target.name}).`),
    },
  }, { readiedAction, target });
}

function specialAttackAvailability(scene, targetTokenId, viewport, verb) {
  const available = tacticAvailability(scene, verb);
  if (!available.ok) return available;
  const { token, tokens } = available.value;
  const target = tokens.find((entry) => entry.id === targetTokenId);
  if (!target || target.faction === token.faction || target.hp <= 0) return failure(
    "SPECIAL_ATTACK_TARGET_INVALID",
    `${verb} needs a standing enemy target.`,
    "Choose a standing creature on the other side.",
  );
  if (chebyshevFeet(token.position, target.position, viewport) > SPECIAL_ATTACK_REACH_FEET) return failure(
    "SPECIAL_ATTACK_OUT_OF_REACH",
    `${target.name} is beyond five-foot reach.`,
    "Move adjacent to the target first.",
  );
  if (TOKEN_SIZES.indexOf(target.size) > TOKEN_SIZES.indexOf(token.size) + 1) return failure(
    "SPECIAL_ATTACK_TARGET_TOO_LARGE",
    `${target.name} is more than one size larger than ${token.name}.`,
    "Choose a target no more than one size larger.",
  );
  return success({ ...available.value, target });
}

const contestRoll = (token, skillId, random) => {
  const die = Math.floor(Math.max(0, Math.min(0.999999999999, Number(random?.()) || 0)) * 20) + 1;
  const modifier = tokenSkillModifier(token, skillId);
  return { die, modifier, total: die + modifier, skillId };
};

function spendSpecialAttack(scene, context, tokens, actionType, logText) {
  return {
    tokens,
    encounter: {
      ...scene.encounter,
      resources: { [context.token.id]: { ...context.resources, actionSpent: true, actionType } },
      log: appendEncounterLog(scene.encounter.log, logText),
    },
  };
}

export function performGrapple(scene, targetTokenId, viewport, { random = Math.random } = {}) {
  const available = specialAttackAvailability(scene, targetTokenId, viewport, "Grapple");
  if (!available.ok) return available;
  const { token, target, tokens } = available.value;
  const held = tokens.find((entry) => entry.grappledById === token.id && entry.conditions.includes("grappled"));
  if (held && held.id !== target.id) return failure(
    "GRAPPLE_ALREADY_HOLDING",
    `${token.name} is already grappling ${held.name}.`,
    "Release that grapple before starting another.",
  );
  const attackerRoll = contestRoll(token, "athletics", random);
  const defenderSkill = tokenSkillModifier(target, "acrobatics") > tokenSkillModifier(target, "athletics") ? "acrobatics" : "athletics";
  const defenderRoll = contestRoll(target, defenderSkill, random);
  const won = attackerRoll.total > defenderRoll.total;
  let nextTokens = tokens;
  let immunity = false;
  if (won) {
    const changed = changeCondition(target, "grappled");
    immunity = !changed.ok && changed.code === "CONDITION_IMMUNE";
    if (changed.ok) nextTokens = updateToken(tokens, target.id, { conditions: changed.value, conditionExpiries: changed.conditionExpiries, grappledById: token.id });
  }
  const successState = won && !immunity;
  return success(spendSpecialAttack(
    scene,
    available.value,
    nextTokens,
    "grapple",
    `${token.name} ${successState ? "grapples" : "fails to grapple"} ${target.name} (${attackerRoll.total} vs ${defenderRoll.total})${immunity ? "; the target is immune" : ""}.`,
  ), { attackerRoll, defenderRoll, success: successState, immune: immunity, target });
}

export function escapeGrappleAvailability(scene) {
  const available = tacticAvailability(scene, "Escape a grapple");
  if (!available.ok) return available;
  const { token, tokens } = available.value;
  const grappler = token.grappledById ? tokens.find((entry) => entry.id === token.grappledById) : null;
  if (!grappler || !token.conditions.includes("grappled")) return failure(
    "GRAPPLE_ESCAPE_NOT_NEEDED",
    `${token.name} is not held in a grapple.`,
    "Choose another tactic.",
  );
  return success({ ...available.value, grappler });
}

export function escapeGrapple(scene, { random = Math.random } = {}) {
  const available = escapeGrappleAvailability(scene);
  if (!available.ok) return available;
  const { token, grappler, tokens, resources } = available.value;
  const escapeSkill = tokenSkillModifier(token, "acrobatics") > tokenSkillModifier(token, "athletics") ? "acrobatics" : "athletics";
  const escapeRoll = contestRoll(token, escapeSkill, random);
  const holdRoll = contestRoll(grappler, "athletics", random);
  const escaped = escapeRoll.total > holdRoll.total;
  const { grappled: removed, ...conditionExpiries } = token.conditionExpiries || {};
  const nextTokens = escaped
    ? updateToken(tokens, token.id, {
      conditions: token.conditions.filter((condition) => condition !== "grappled"),
      conditionExpiries,
      grappledById: null,
    })
    : tokens;
  return success({
    tokens: nextTokens,
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: { ...resources, actionSpent: true, actionType: "escape-grapple" } },
      log: appendEncounterLog(scene.encounter.log, `${token.name} ${escaped ? "escapes" : "fails to escape"} ${grappler.name}'s grapple (${escapeRoll.total} vs ${holdRoll.total}).`),
    },
  }, { escaped, escapeRoll, holdRoll, grappler });
}

export function releaseGrapple(scene, targetTokenId) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, tokens } = context.value;
  const target = tokens.find((entry) => entry.id === targetTokenId && entry.grappledById === token.id && entry.conditions.includes("grappled"));
  if (!target) return failure("GRAPPLE_RELEASE_TARGET_INVALID", `${token.name} is not grappling that creature.`, "Choose a creature currently grappled by the active token.");
  const { grappled: removed, ...conditionExpiries } = target.conditionExpiries || {};
  return success({
    tokens: updateToken(tokens, target.id, {
      conditions: target.conditions.filter((condition) => condition !== "grappled"),
      conditionExpiries,
      grappledById: null,
    }),
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(scene.encounter.log, `${token.name} releases ${target.name} from the grapple.`),
    },
  }, { target });
}

const forcedMovementVector = (sourceCell, targetCell, specification) => {
  if (specification.mode === "slide") {
    return {
      column: Math.sign(finite(specification.direction?.column)),
      row: Math.sign(finite(specification.direction?.row)),
    };
  }
  const away = {
    column: Math.sign(targetCell.column - sourceCell.column),
    row: Math.sign(targetCell.row - sourceCell.row),
  };
  return specification.mode === "pull"
    ? { column: -away.column, row: -away.row }
    : away;
};

function resolveForcedMovement(scene, tokens, target, specification, viewport) {
  const source = specification.sourceTokenId
    ? tokens.find((entry) => entry.id === specification.sourceTokenId)
    : null;
  if (!["push", "pull", "slide"].includes(specification.mode)) return failure(
    "FORCED_MOVEMENT_MODE_INVALID",
    "Forced movement must push, pull, or slide the target.",
    "Choose a listed movement mode.",
  );
  if (specification.mode !== "slide" && (!source || source.id === target.id)) return failure(
    "FORCED_MOVEMENT_SOURCE_INVALID",
    "Push and pull need another token as their source.",
    "Choose a different source token.",
  );
  const distanceFeet = Math.max(
    MOVEMENT_FEET_PER_CELL,
    Math.min(60, Math.floor(finite(specification.distanceFeet, MOVEMENT_FEET_PER_CELL) / MOVEMENT_FEET_PER_CELL) * MOVEMENT_FEET_PER_CELL),
  );
  const targetCell = setupCellForPosition(target.position, viewport);
  const sourceCell = setupCellForPosition(source?.position || target.position, viewport);
  const vector = forcedMovementVector(sourceCell, targetCell, specification);
  if (!vector.column && !vector.row) return failure(
    "FORCED_MOVEMENT_DIRECTION_INVALID",
    "The target and source do not define a movement direction.",
    "Choose a slide direction or move the source to another square.",
  );
  const metrics = setupGridMetrics(viewport);
  const occupied = occupiedCellSet({ tokens, chests: scene.chests, movingTokenId: target.id, viewport });
  let current = targetCell;
  let movedCells = 0;
  const requestedCells = distanceFeet / MOVEMENT_FEET_PER_CELL;
  for (let index = 0; index < requestedCells; index += 1) {
    const next = { column: current.column + vector.column, row: current.row + vector.row };
    const blocked = next.column < 0 || next.column >= metrics.columns
      || next.row < 0 || next.row >= metrics.rows
      || occupied.has(cellKey(next))
      || movementEdgeBlocked(current, next, scene.walls, viewport);
    if (blocked) break;
    current = next;
    movedCells += 1;
  }
  if (!movedCells) return failure(
    "FORCED_MOVEMENT_BLOCKED",
    `${target.name} cannot be moved in that direction.`,
    "Choose another direction or clear the blocked square.",
  );
  const position = setupPositionForCell(current, viewport);
  let nextTokens = updateToken(tokens, target.id, { position });
  nextTokens = nextTokens.map((entry) => {
    const grapplerId = entry.id === target.id ? entry.grappledById : entry.grappledById === target.id ? target.id : null;
    const grappler = grapplerId ? nextTokens.find((candidate) => candidate.id === grapplerId) : null;
    if (!grappler || !entry.conditions.includes("grappled") || chebyshevFeet(grappler.position, entry.id === target.id ? position : entry.position, viewport) <= SPECIAL_ATTACK_REACH_FEET) return entry;
    const { grappled: removed, ...conditionExpiries } = entry.conditionExpiries || {};
    return { ...entry, conditions: entry.conditions.filter((condition) => condition !== "grappled"), conditionExpiries, grappledById: null };
  });
  return success({ tokens: nextTokens }, {
    target: nextTokens.find((entry) => entry.id === target.id),
    source,
    requestedFeet: distanceFeet,
    movedFeet: movedCells * MOVEMENT_FEET_PER_CELL,
    stoppedEarly: movedCells < requestedCells,
  });
}

/**
 * Moves a creature without spending its movement or provoking reactions. This
 * is the common engine for authored push/pull effects and the GM's manual
 * Battle control; Shove delegates to it as well.
 */
export function forceMoveToken(scene, targetTokenId, specification = {}, viewport) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Forced movement is available only during an active Battle.",
    "Start Battle before moving a creature this way.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const target = tokens.find((entry) => entry.id === targetTokenId);
  if (!target || target.dead) return failure(
    "FORCED_MOVEMENT_TARGET_INVALID",
    "Choose a living token to move.",
    "Select a standing or dying creature on the Table.",
  );
  const moved = resolveForcedMovement(scene, tokens, target, specification, viewport);
  if (!moved.ok) return moved;
  const verb = specification.mode === "pull" ? "pulls" : specification.mode === "slide" ? "slides" : "pushes";
  const subject = moved.source?.name || "The effect";
  return success({
    tokens: moved.value.tokens,
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(scene.encounter.log, `${subject} ${verb} ${target.name} ${moved.movedFeet} feet${moved.stoppedEarly ? " before an obstacle stops the movement" : ""}.`),
    },
  }, {
    target: moved.target,
    source: moved.source,
    requestedFeet: moved.requestedFeet,
    movedFeet: moved.movedFeet,
    stoppedEarly: moved.stoppedEarly,
  });
}

export function performShove(scene, targetTokenId, mode, viewport, { random = Math.random } = {}) {
  const available = specialAttackAvailability(scene, targetTokenId, viewport, "Shove");
  if (!available.ok) return available;
  if (!["prone", "push"].includes(mode)) return failure("SHOVE_MODE_INVALID", "Choose whether to push the target or knock it prone.", "Choose push or prone.");
  const { token, target, tokens } = available.value;
  const attackerRoll = contestRoll(token, "athletics", random);
  const defenderSkill = tokenSkillModifier(target, "acrobatics") > tokenSkillModifier(target, "athletics") ? "acrobatics" : "athletics";
  const defenderRoll = contestRoll(target, defenderSkill, random);
  const won = attackerRoll.total > defenderRoll.total;
  let nextTokens = tokens;
  let successState = won;
  let reason = "";
  if (won && mode === "prone") {
    const changed = changeCondition(target, "prone");
    if (!changed.ok) {
      successState = false;
      reason = " but the target is immune";
    } else {
      nextTokens = updateToken(tokens, target.id, { conditions: changed.value, conditionExpiries: changed.conditionExpiries });
    }
  }
  if (won && mode === "push") {
    const forced = resolveForcedMovement(scene, tokens, target, {
      mode: "push",
      sourceTokenId: token.id,
      distanceFeet: MOVEMENT_FEET_PER_CELL,
    }, viewport);
    if (!forced.ok) {
      successState = false;
      reason = " but there is no open square behind the target";
    } else {
      nextTokens = forced.value.tokens;
    }
  }
  return success(spendSpecialAttack(
    scene,
    available.value,
    nextTokens,
    `shove-${mode}`,
    `${token.name} ${successState ? mode === "push" ? "pushes" : "knocks prone" : "fails to shove"} ${target.name} (${attackerRoll.total} vs ${defenderRoll.total})${reason}.`,
  ), { attackerRoll, defenderRoll, success: successState, mode, target });
}

/**
 * Help has to name two creatures and a distance, so it cannot go through the
 * shared activator. The ally must be within five feet — the helper is stepping
 * in beside them, not shouting encouragement across the room — and the
 * advantage is pinned to one enemy rather than handed out against everyone.
 */
export function helpAvailability(scene, allyTokenId, viewport) {
  const context = tacticAvailability(scene, "Help");
  if (!context.ok) return context;
  const { token, tokens } = context.value;
  const allies = tokens.filter((entry) =>
    entry.id !== token.id
    && entry.faction === token.faction
    && entry.hp > 0
    && !isIncapacitated(entry.conditions)
    && chebyshevFeet(token.position, entry.position, viewport) <= HELP_REACH_FEET);
  if (!allies.length) return failure(
    "HELP_NO_ALLY_ADJACENT",
    `${token.name} has no ally within ${HELP_REACH_FEET} feet to Help.`,
    "Move next to an ally on the same side first.",
  );
  if (!allyTokenId) return success({ ...context.value, allies });
  const ally = allies.find((entry) => entry.id === allyTokenId);
  if (!ally) return failure(
    "HELP_ALLY_UNREACHABLE",
    "That ally is not adjacent, not on your side, or cannot be Helped.",
    "Choose an ally standing within five feet.",
  );
  return success({ ...context.value, allies, ally });
}

export function activateHelp(scene, allyTokenId, targetTokenId, viewport) {
  const available = helpAvailability(scene, allyTokenId, viewport);
  if (!available.ok) return available;
  const { token, resources, tokens, ally } = available.value;
  const target = tokens.find((entry) => entry.id === targetTokenId);
  if (!target || target.faction === token.faction || target.hp <= 0) return failure(
    "HELP_TARGET_INVALID",
    "Help has to name the enemy the ally is going to attack.",
    "Choose a standing enemy as the target.",
  );
  return success({
    tokens: updateToken(tokens, ally.id, { helpedAgainstTokenId: target.id, helpedById: token.id }),
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: { ...resources, actionSpent: true, actionType: "help" } },
      log: appendEncounterLog(
        scene.encounter.log,
        `${token.name} Helps ${ally.name} against ${target.name}, granting advantage on their next attack.`,
      ),
    },
  });
}

export function attackActionAvailability(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || tokenIsIncapacitated(token)) return failure("ATTACK_INCAPACITATED", `${token.name} cannot Attack while incapacitated or defeated.`, "Remove the condition or end the turn.");
  if (resources.dashed) return failure("ATTACK_AFTER_DASH", "Attack is unavailable after Dash.", "Use movement or end the turn.");
  if (resources.actionSpent) return failure("ATTACK_ACTION_SPENT", "The Action has already been spent.", "End the turn to refresh it.");
  if (resources.swapped && (resources.movementSpent > 0 || resources.swapChoice === "movement")) return failure(
    "ATTACK_AFTER_SWAP_MOVEMENT",
    "Attack is unavailable after moving in the weapon-swap branch.",
    "Use remaining movement or end the turn.",
  );
  return context;
}

export function swapAvailability(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || tokenIsIncapacitated(token)) return failure(
    "SWAP_INCAPACITATED",
    `${token.name} cannot swap weapons while incapacitated or defeated.`,
    "Remove the condition or end the turn.",
  );
  if (resources.swapped) return failure("SWAP_ALREADY_USED", "Weapons were already swapped this turn.", "End the turn before swapping again.");
  if (resources.dashed) return failure("SWAP_AFTER_DASH", "Weapon Swap is unavailable after Dash.", "Use remaining movement or end the turn.");
  if (resources.actionSpent) return failure(
    "SWAP_AFTER_ACTION",
    `Weapon Swap is unavailable after ${resources.actionType || "the Action"}.`,
    "End the turn before changing the Battle loadout.",
  );
  return context;
}

export function validateSwapLoadout(token, loadout = {}) {
  const desired = {
    mainHand: typeof loadout.mainHand === "string" && loadout.mainHand ? loadout.mainHand : null,
    offHand: typeof loadout.offHand === "string" && loadout.offHand ? loadout.offHand : null,
  };
  if (desired.mainHand === token?.loadout?.mainHand && desired.offHand === token?.loadout?.offHand) return failure(
    "SWAP_UNCHANGED",
    "Choose a different main-hand or off-hand loadout.",
    "Select another owned weapon or empty a hand.",
  );
  let candidate = { ...token, loadout: { mainHand: null, offHand: null } };
  if (desired.mainHand) {
    const main = setMainHand(candidate, desired.mainHand);
    if (!main.ok) return failure("ILLEGAL_SWAP", main.message, "Choose a legal owned main-hand weapon.");
    candidate = { ...candidate, ...main.value };
  }
  if (desired.offHand) {
    const off = setOffHand(candidate, desired.offHand);
    if (!off.ok) return failure("ILLEGAL_SWAP", off.message, "Choose two owned Light melee weapons or leave the off hand empty.");
    candidate = { ...candidate, ...off.value };
  }
  return success(desired);
}

export function performWeaponSwap(scene, loadout) {
  const available = swapAvailability(scene);
  if (!available.ok) return available;
  const { token, tokens, resources } = available.value;
  const valid = validateSwapLoadout(token, loadout);
  if (!valid.ok) return valid;
  const nextResources = {
    ...resources,
    swapped: true,
    swapChoice: resources.movementSpent > 0 ? "movement" : null,
  };
  const tokensAfterSwap = updateToken(tokens, token.id, { loadout: valid.value });
  const names = [valid.value.mainHand, valid.value.offHand]
    .map((itemId) => ITEM_BY_ID[itemId]?.name)
    .filter(Boolean);
  return success({
    tokens: tokensAfterSwap,
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: nextResources },
      log: appendEncounterLog(scene.encounter.log, `${token.name} swaps to ${names.join(" and ") || "empty hands"}.`),
    },
  });
}

export function endTurn(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { tokens, order, activeIndex, token, resources } = context.value;
  if (!order.length) return failure("INITIATIVE_EMPTY", "The initiative order is empty.", "Return to Setup and restart Battle.");
  // A death saving throw is the dying Hero's turn, not an optional command the
  // player can skip. Keep the rule here as well as disabling the UI button so
  // every caller, present and future, gets the same protection.
  if (isDying(token) && !isStable(token) && !resources.deathSaveRolled) return failure(
    "DEATH_SAVE_REQUIRED",
    `${token.name} must roll a death saving throw before ending the turn.`,
    "Roll the death save, then end the turn.",
  );
  let nextIndex = null;
  let nextRound = Math.max(1, Math.floor(finite(scene.encounter.round, 1)));
  const surprised = new Set(scene.encounter.surprisedTokenIds || []);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const rawIndex = activeIndex + offset;
    const index = rawIndex % order.length;
    const candidateRound = Math.max(1, Math.floor(finite(scene.encounter.round, 1))) + Math.floor(rawIndex / order.length);
    const candidate = tokens.find((entry) => entry.id === order[index]);
    if (candidateRound === 1 && candidate && surprised.has(candidate.id)) continue;
    // A dying creature still takes its turn — that turn is the death saving
    // throw. Only the dead are skipped, and a stable creature is skipped too
    // because it has stopped rolling and has nothing else it can do.
    if (candidate && (candidate.hp > 0 || (!candidate.dead && !isStable(candidate)))) {
      nextIndex = index;
      nextRound = candidateRound;
      break;
    }
  }
  if (nextIndex === null) return failure(
    "NO_LIVING_TOKEN",
    "No living token remains to receive initiative.",
    "Battle completion will be resolved by the completion phase.",
  );
  const nextToken = tokens.find((entry) => entry.id === order[nextIndex]);
  const wrapped = nextRound > Math.max(1, Math.floor(finite(scene.encounter.round, 1)));
  // Dodging, Disengaging and a spent reaction all last "until the start of your
  // next turn", and this is that moment. They are cleared on the token because
  // they have to survive everybody else's turns in between, which turn
  // resources cannot do — those exist only for whoever is currently active.
  //
  // Help is cleared here too, from the other end: the helper's turn coming round
  // again is the outside limit on how long the offer stands.
  const timedTokens = wrapped ? tokens.map((entry) => {
    const expired = expireConditionsAtRound(entry.conditions, entry.conditionExpiries, nextRound);
    return {
      ...entry,
      conditions: expired.conditions,
      conditionExpiries: expired.conditionExpiries,
      grappledById: expired.expired.includes("grappled") ? null : entry.grappledById,
    };
  }) : tokens;
  const beginningTokens = updateToken(timedTokens, nextToken.id, CLEARED_TURN_STATE).map((entry) =>
    entry.helpedAgainstTokenId && entry.helpedById === nextToken.id
      ? { ...entry, helpedAgainstTokenId: null, helpedById: null }
      : entry);
  return success({
    tokens: beginningTokens,
    encounter: {
      ...scene.encounter,
      activeIndex: nextIndex,
      round: nextRound,
      resources: { [nextToken.id]: createTurnResources(nextToken) },
      log: appendEncounterLog(scene.encounter.log, `${token.name} ends the turn. ${nextToken.name} is active.`),
    },
  }, { activeTokenId: nextToken.id, wrapped });
}
