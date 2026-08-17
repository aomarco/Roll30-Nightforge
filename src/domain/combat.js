import { ITEM_BY_ID } from "./catalog.js";
import { CONDITIONS, isImmobilized, isIncapacitated } from "./conditions.js";
import { setMainHand, setOffHand } from "./items.js";
import {
  createTurnResources,
  normalizeChests,
  normalizeTableTokens,
  normalizeTurnResources,
  normalizeWalls,
  setupCellForPosition,
  setupGridMetrics,
  setupPositionForCell,
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
  movingTokenId,
  viewport,
  searchLimit = PATH_SEARCH_LIMIT,
} = {}) {
  const metrics = setupGridMetrics(viewport);
  const startCell = setupCellForPosition(start, viewport);
  const goalCell = setupCellForPosition(destination, viewport);
  if (sameCell(startCell, goalCell)) return { ok: true, cells: [startCell], visited: 0 };
  const occupied = occupiedCellSet({ tokens, chests, movingTokenId, viewport });
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
      return { ok: true, cells, visited };
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

      const tentative = current.g + 1;
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
  const route = findMovementRoute({
    start: token.position,
    destination,
    tokens: scene.tokens,
    chests: scene.chests,
    walls: scene.walls,
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
  let landingIndex = Math.min(route.cells.length - 1, remainingCells);
  while (landingIndex > 0 && occupied.has(cellKey(route.cells[landingIndex]))) landingIndex -= 1;
  const costFeet = landingIndex * MOVEMENT_FEET_PER_CELL;
  return success({
    tokenId,
    cells: route.cells,
    route: positions,
    reachableIndex: landingIndex,
    landingIndex,
    landing: positions[landingIndex],
    costFeet,
    requestedFeet: Math.max(0, route.cells.length - 1) * MOVEMENT_FEET_PER_CELL,
    overBudget: landingIndex < route.cells.length - 1,
    visited: route.visited,
  });
}

export function moveActiveToken(scene, tokenId, destination, viewport, options = {}) {
  const plan = planActiveMovement(scene, tokenId, destination, viewport, options);
  if (!plan.ok) return plan;
  if (plan.value.landingIndex <= 0) return failure(
    "NO_LEGAL_MOVEMENT",
    "That destination does not provide a legal movement step.",
    "Choose a reachable empty cell at least 5 feet away.",
    true,
    { plan: plan.value },
  );
  const context = activeTurnContext(scene).value;
  const resources = {
    ...context.resources,
    movementSpent: context.resources.movementSpent + plan.value.costFeet,
    swapChoice: context.resources.swapped ? "movement" : context.resources.swapChoice,
  };
  const tokens = updateToken(context.tokens, tokenId, { position: plan.value.landing });
  const encounter = {
    ...scene.encounter,
    resources: { [tokenId]: resources },
    log: [...(scene.encounter.log || []), `${context.token.name} moves ${plan.value.costFeet} feet.`],
  };
  return success({ tokens, encounter }, { plan: plan.value });
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
  const next = {
    ...resources,
    movementBase: resources.movementBase + token.baseSpeed,
    actionSpent: true,
    actionType: "dash",
    dashed: true,
  };
  return success({
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: next },
      log: [...(scene.encounter.log || []), `${token.name} uses Dash.`],
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
      log: [...(scene.encounter.log || []), `${token.name} swaps to ${names.join(" and ") || "empty hands"}.`],
    },
  });
}

export function endTurn(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { tokens, order, activeIndex, token } = context.value;
  if (!order.length) return failure("INITIATIVE_EMPTY", "The initiative order is empty.", "Return to Setup and restart Battle.");
  let nextIndex = null;
  let wrapped = false;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const rawIndex = activeIndex + offset;
    const index = rawIndex % order.length;
    const candidate = tokens.find((entry) => entry.id === order[index]);
    if (candidate && candidate.hp > 0) {
      nextIndex = index;
      wrapped = rawIndex >= order.length;
      break;
    }
  }
  if (nextIndex === null) return failure(
    "NO_LIVING_TOKEN",
    "No living token remains to receive initiative.",
    "Battle completion will be resolved by the completion phase.",
  );
  const nextToken = tokens.find((entry) => entry.id === order[nextIndex]);
  return success({
    encounter: {
      ...scene.encounter,
      activeIndex: nextIndex,
      round: Math.max(1, Math.floor(finite(scene.encounter.round, 1))) + (wrapped ? 1 : 0),
      resources: { [nextToken.id]: createTurnResources(nextToken) },
      log: [...(scene.encounter.log || []), `${token.name} ends the turn. ${nextToken.name} is active.`],
    },
  }, { activeTokenId: nextToken.id, wrapped });
}
