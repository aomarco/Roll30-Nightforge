import { ITEM_BY_ID } from "./catalog.js";
import { computeArmorClass, deriveHero } from "./heroes.js";
import {
  changeInventory,
  normalizeEquipment,
  normalizeInventoryEntries,
  wornMagicBonuses,
} from "./items.js";

export const CAMERA_MIN_ZOOM = 0.35;
export const CAMERA_MAX_ZOOM = 3;
export const MAP_MIN_SCALE = 0.2;
export const MAP_MAX_SCALE = 5;
export const DEFAULT_CAMERA = Object.freeze({ x: 0, y: 0, zoom: 1 });
export const DEFAULT_MAP_VIEW = Object.freeze({ scale: 1, x: 0, y: 0 });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, finite(value, minimum)));

export const clampCameraZoom = (zoom) => clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
export const clampMapScale = (scale) => clamp(scale, MAP_MIN_SCALE, MAP_MAX_SCALE);

export const normalizeCamera = (camera = {}) => ({
  x: finite(camera.x),
  y: finite(camera.y),
  zoom: clampCameraZoom(camera.zoom ?? 1),
});

export const normalizeMapView = (mapView = {}) => ({
  scale: clampMapScale(mapView.scale ?? 1),
  x: finite(mapView.x),
  y: finite(mapView.y),
});

export function zoomCameraAt(camera, nextZoom, anchor = { x: 0, y: 0 }) {
  const current = normalizeCamera(camera);
  const zoom = clampCameraZoom(nextZoom);
  const anchorX = finite(anchor.x);
  const anchorY = finite(anchor.y);
  const worldX = (anchorX - current.x) / current.zoom;
  const worldY = (anchorY - current.y) / current.zoom;
  return {
    x: anchorX - worldX * zoom,
    y: anchorY - worldY * zoom,
    zoom,
  };
}

export const zoomCameraBy = (camera, delta, anchor) =>
  zoomCameraAt(camera, normalizeCamera(camera).zoom + finite(delta), anchor);

export const panCameraBy = (camera, delta = {}) => {
  const current = normalizeCamera(camera);
  return {
    ...current,
    x: current.x + finite(delta.x),
    y: current.y + finite(delta.y),
  };
};

export const screenToWorld = (point, camera) => {
  const current = normalizeCamera(camera);
  return {
    x: (finite(point?.x) - current.x) / current.zoom,
    y: (finite(point?.y) - current.y) / current.zoom,
  };
};

export const worldToScreen = (point, camera) => {
  const current = normalizeCamera(camera);
  return {
    x: finite(point?.x) * current.zoom + current.x,
    y: finite(point?.y) * current.zoom + current.y,
  };
};

export const zoomCameraAtViewportCenter = (camera, nextZoom, viewport = {}) =>
  zoomCameraAt(camera, nextZoom, {
    x: finite(viewport.width) / 2,
    y: finite(viewport.height) / 2,
  });

export const adjustArtworkBy = (mapView, screenDelta = {}, cameraZoom = 1) => {
  const current = normalizeMapView(mapView);
  const zoom = clampCameraZoom(cameraZoom);
  return {
    ...current,
    x: current.x + finite(screenDelta.x) / zoom,
    y: current.y + finite(screenDelta.y) / zoom,
  };
};

export const setArtworkScale = (mapView, scale) => ({
  ...normalizeMapView(mapView),
  scale: clampMapScale(scale),
});

export const clientPointToPercent = (point, transformedRect) => ({
  xPercent: ((finite(point?.x) - finite(transformedRect?.left)) / Math.max(1, finite(transformedRect?.width, 1))) * 100,
  yPercent: ((finite(point?.y) - finite(transformedRect?.top)) / Math.max(1, finite(transformedRect?.height, 1))) * 100,
});

export const normalizePosition = (position = {}) => ({
  xPercent: finite(position.xPercent ?? position.x, 50),
  yPercent: finite(position.yPercent ?? position.y, 50),
});

const colorPattern = /^#[0-9a-f]{6}$/i;
const TOKEN_COLORS = Object.freeze(["#d9803f", "#5fa8f5", "#7fb356", "#a77be8", "#e0b055", "#d75f79"]);

export function normalizeTableToken(input = {}, { id, ordinal = 0 } = {}) {
  const tokenId = typeof input.id === "string" && input.id.trim()
    ? input.id.trim()
    : typeof id === "string" && id.trim()
      ? id.trim()
      : null;
  if (!tokenId) throw new TypeError("A Table token requires a stable id.");
  const maxHp = Math.max(1, Math.floor(finite(input.maxHp, 10)));
  const inventoryResult = normalizeInventoryEntries(input.inventory);
  const token = {
    id: tokenId,
    heroId: typeof input.heroId === "string" && input.heroId.trim() ? input.heroId.trim() : null,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : `Token ${ordinal + 1}`,
    color: colorPattern.test(input.color || "") ? input.color : TOKEN_COLORS[ordinal % TOKEN_COLORS.length],
    position: normalizePosition(input.position || input),
    hp: Math.max(0, Math.min(maxHp, Math.floor(finite(input.hp, maxHp)))),
    maxHp,
    ac: Math.max(0, Math.floor(finite(input.ac, 10))),
    baseSpeed: Math.max(0, Math.floor(finite(input.baseSpeed ?? input.speed, 30))),
    strength: Math.max(1, Math.floor(finite(input.strength, 10))),
    dexterity: Math.max(1, Math.floor(finite(input.dexterity, 10))),
    level: Math.max(1, Math.min(20, Math.floor(finite(input.level, 1)))),
    initiativeBonus: Math.floor(finite(input.initiativeBonus)),
    size: ["small", "medium", "large"].includes(input.size) ? input.size : "medium",
    inventory: inventoryResult.inventory,
    loadout: input.loadout || { mainHand: null, offHand: null },
    armorId: typeof input.armorId === "string" ? input.armorId : null,
    shieldId: typeof input.shieldId === "string" ? input.shieldId : null,
    enchantments: input.enchantments && typeof input.enchantments === "object" ? input.enchantments : {},
    wornItemIds: Array.isArray(input.wornItemIds) ? [...new Set(input.wornItemIds.filter((value) => typeof value === "string"))] : [],
    conditions: Array.isArray(input.conditions) ? [...new Set(input.conditions.filter((value) => typeof value === "string" && value.trim()))] : [],
  };
  return { ...token, ...normalizeEquipment(token, token.inventory) };
}

export const normalizeTableTokens = (tokens) =>
  Array.isArray(tokens)
    ? tokens.flatMap((token, ordinal) => {
        try { return [normalizeTableToken(token, { id: token?.id, ordinal })]; }
        catch { return []; }
      })
    : [];

export function createPlayToken({ id, ordinal = 0, name } = {}) {
  const angle = ordinal * 0.9;
  const radius = Math.min(18, ordinal * 2.2);
  return normalizeTableToken({
    id,
    name: name || `Token ${ordinal + 1}`,
    position: {
      xPercent: 50 + Math.cos(angle) * radius,
      yPercent: 50 + Math.sin(angle) * radius,
    },
  }, { id, ordinal });
}

export const updateToken = (tokens, tokenId, patch) =>
  normalizeTableTokens(tokens).map((token, ordinal) =>
    token.id === tokenId
      ? normalizeTableToken({ ...token, ...patch }, { id: token.id, ordinal })
      : token,
  );

export const removeToken = (tokens, tokenId) =>
  normalizeTableTokens(tokens).filter((token) => token.id !== tokenId);

export function createManualToken({ id, ordinal = 0, position, name, ...input } = {}) {
  return normalizeTableToken({
    ...input,
    id,
    name: name || `Token ${ordinal + 1}`,
    position,
  }, { id, ordinal });
}

export function createHeroTokenSnapshot(hero, { id, ordinal = 0, position } = {}) {
  if (!hero?.id) throw new TypeError("A Hero token snapshot requires a persisted Hero.");
  const derived = deriveHero(hero);
  return normalizeTableToken({
    id,
    heroId: hero.id,
    name: hero.name,
    position,
    hp: derived.hp,
    maxHp: derived.hp,
    ac: derived.ac,
    baseSpeed: derived.speed,
    strength: derived.finalAbilities.str,
    dexterity: derived.finalAbilities.dex,
    level: derived.level,
    initiativeBonus: derived.initiative,
    size: derived.size,
    inventory: hero.inventory,
    loadout: hero.loadout,
    armorId: hero.armorId,
    shieldId: hero.shieldId,
    enchantments: hero.enchantments,
    wornItemIds: hero.wornItemIds,
    conditions: [],
  }, { id, ordinal });
}

export function derivedTokenArmorClass(token) {
  const armor = ITEM_BY_ID[token?.armorId] || null;
  const shield = ITEM_BY_ID[token?.shieldId] || null;
  return computeArmorClass({
    dexterity: token?.dexterity,
    armor,
    shield,
    armorBonus: token?.enchantments?.[token?.armorId] || 0,
    shieldBonus: token?.enchantments?.[token?.shieldId] || 0,
    acBonus: wornMagicBonuses(token).ac,
  });
}

export function applySetupTokenEquipment(tokens, tokenId, equipmentState) {
  return normalizeTableTokens(tokens).map((token, ordinal) => {
    if (token.id !== tokenId) return token;
    const normalized = normalizeTableToken({ ...token, ...equipmentState }, { id: token.id, ordinal });
    return normalized.heroId
      ? { ...normalized, ac: derivedTokenArmorClass(normalized) }
      : normalized;
  });
}

export function normalizeChest(input = {}, { id } = {}) {
  const chestId = typeof input.id === "string" && input.id.trim()
    ? input.id.trim()
    : typeof id === "string" && id.trim()
      ? id.trim()
      : null;
  if (!chestId) throw new TypeError("A chest requires a stable id.");
  return {
    id: chestId,
    position: normalizePosition(input.position || input),
    inventory: normalizeInventoryEntries(input.inventory).inventory,
  };
}

export const normalizeChests = (chests) =>
  Array.isArray(chests)
    ? chests.flatMap((chest) => {
        try { return [normalizeChest(chest, { id: chest?.id })]; }
        catch { return []; }
      })
    : [];

export const createChest = ({ id, position, inventory = [] } = {}) =>
  normalizeChest({ id, position, inventory }, { id });

export const updateChest = (chests, chestId, patch) =>
  normalizeChests(chests).map((chest) =>
    chest.id === chestId ? normalizeChest({ ...chest, ...patch }, { id: chest.id }) : chest,
  );

export const removeChest = (chests, chestId) =>
  normalizeChests(chests).filter((chest) => chest.id !== chestId);

export function changeChestInventory(chests, chestId, itemId, direction) {
  const chest = normalizeChests(chests).find((entry) => entry.id === chestId);
  if (!chest) return {
    ok: false,
    code: "CHEST_NOT_FOUND",
    message: "That chest is no longer on this Table.",
    recovery: "Select another chest and retry.",
    retryable: false,
  };
  const changed = changeInventory({ inventory: chest.inventory }, itemId, direction);
  if (!changed.ok) return { ...changed, recovery: "Choose an item from the Nightforge catalog.", retryable: false };
  return {
    ok: true,
    value: updateChest(chests, chestId, { inventory: changed.value.inventory }),
    item: changed.item,
    quantity: changed.quantity,
    step: changed.step,
  };
}

export function setupGridMetrics({ width, height, gridSize } = {}) {
  const cellSize = Math.max(1, finite(gridSize, 44));
  const worldWidth = Math.max(cellSize, finite(width, cellSize * 20));
  const worldHeight = Math.max(cellSize, finite(height, cellSize * 12));
  return {
    cellSize,
    width: worldWidth,
    height: worldHeight,
    columns: Math.max(1, Math.floor(worldWidth / cellSize)),
    rows: Math.max(1, Math.floor(worldHeight / cellSize)),
  };
}

export function setupCellForPosition(position, viewport) {
  const metrics = setupGridMetrics(viewport);
  const normalized = normalizePosition(position);
  return {
    column: Math.max(0, Math.min(metrics.columns - 1, Math.floor((normalized.xPercent / 100) * metrics.width / metrics.cellSize))),
    row: Math.max(0, Math.min(metrics.rows - 1, Math.floor((normalized.yPercent / 100) * metrics.height / metrics.cellSize))),
  };
}

export function setupPositionForCell(cell, viewport) {
  const metrics = setupGridMetrics(viewport);
  const column = Math.max(0, Math.min(metrics.columns - 1, Math.floor(finite(cell?.column))));
  const row = Math.max(0, Math.min(metrics.rows - 1, Math.floor(finite(cell?.row))));
  return {
    xPercent: ((column + 0.5) * metrics.cellSize / metrics.width) * 100,
    yPercent: ((row + 0.5) * metrics.cellSize / metrics.height) * 100,
  };
}

export const snapSetupPosition = (position, viewport) =>
  setupPositionForCell(setupCellForPosition(position, viewport), viewport);

const setupCellKey = (cell) => `${cell.column}:${cell.row}`;

export function occupiedSetupCells({ tokens = [], chests = [], exclude = null, viewport } = {}) {
  const occupied = new Set();
  for (const token of normalizeTableTokens(tokens)) {
    if (exclude?.kind === "token" && token.id === exclude.id) continue;
    occupied.add(setupCellKey(setupCellForPosition(token.position, viewport)));
  }
  for (const chest of normalizeChests(chests)) {
    if (exclude?.kind === "chest" && chest.id === exclude.id) continue;
    occupied.add(setupCellKey(setupCellForPosition(chest.position, viewport)));
  }
  return occupied;
}

export function canOccupySetupPosition(position, options = {}) {
  const occupied = occupiedSetupCells(options);
  return !occupied.has(setupCellKey(setupCellForPosition(position, options.viewport)));
}

export function findOpenSetupPosition(position, options = {}) {
  const metrics = setupGridMetrics(options.viewport);
  const desired = setupCellForPosition(position, options.viewport);
  const occupied = occupiedSetupCells(options);
  const candidates = [];
  for (let row = 0; row < metrics.rows; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) {
      candidates.push({
        column,
        row,
        distance: Math.abs(column - desired.column) + Math.abs(row - desired.row),
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance || left.row - right.row || left.column - right.column);
  const cell = candidates.find((candidate) => !occupied.has(setupCellKey(candidate)));
  return cell ? setupPositionForCell(cell, options.viewport) : null;
}

export const createTurnResources = (token) => ({
  movementBase: Math.max(0, Math.floor(finite(token?.baseSpeed, 30))),
  movementSpent: 0,
  actionSpent: false,
  actionType: null,
  bonusActionSpent: false,
  bonusActionType: null,
  dashed: false,
  swapped: false,
  swapChoice: null,
  mainWeaponAttacked: false,
  mainAttackWeaponId: null,
  offHandAttackAvailable: false,
  offHandWeaponId: null,
  offHandAttackHand: null,
});

export function normalizeTurnResources(resources, token) {
  const defaults = createTurnResources(token);
  const movementBase = Math.max(defaults.movementBase, Math.floor(finite(resources?.movementBase, defaults.movementBase)));
  const movementSpent = Math.max(0, Math.min(movementBase, Math.floor(finite(resources?.movementSpent))));
  const swapChoice = ["attack", "movement"].includes(resources?.swapChoice) ? resources.swapChoice : null;
  return {
    movementBase,
    movementSpent,
    actionSpent: Boolean(resources?.actionSpent),
    actionType: typeof resources?.actionType === "string" && resources.actionType.trim() ? resources.actionType.trim() : null,
    bonusActionSpent: Boolean(resources?.bonusActionSpent),
    bonusActionType: typeof resources?.bonusActionType === "string" && resources.bonusActionType.trim() ? resources.bonusActionType.trim() : null,
    dashed: Boolean(resources?.dashed),
    swapped: Boolean(resources?.swapped),
    swapChoice,
    mainWeaponAttacked: Boolean(resources?.mainWeaponAttacked),
    mainAttackWeaponId: typeof resources?.mainAttackWeaponId === "string" ? resources.mainAttackWeaponId : null,
    offHandAttackAvailable: Boolean(resources?.offHandAttackAvailable),
    offHandWeaponId: typeof resources?.offHandWeaponId === "string" ? resources.offHandWeaponId : null,
    offHandAttackHand: ["mainHand", "offHand"].includes(resources?.offHandAttackHand) ? resources.offHandAttackHand : null,
  };
}

export function normalizeEncounter(encounter, tokens = []) {
  if (!encounter || !["active", "complete"].includes(encounter.status)) return null;
  const tokenIds = new Set(normalizeTableTokens(tokens).map((token) => token.id));
  const initiativeOrder = Array.isArray(encounter.initiativeOrder)
    ? [...new Set(encounter.initiativeOrder.filter((id) => tokenIds.has(id)))]
    : [];
  const initiatives = Object.fromEntries(initiativeOrder.map((tokenId) => [
    tokenId,
    Math.floor(finite(encounter.initiatives?.[tokenId])),
  ]));
  const activeIndex = Math.max(0, Math.min(Math.max(0, initiativeOrder.length - 1), Math.floor(finite(encounter.activeIndex))));
  const activeToken = normalizeTableTokens(tokens).find((token) => token.id === initiativeOrder[activeIndex]);
  const resourceInput = activeToken
    ? encounter.resources?.[activeToken.id] || encounter.resources
    : null;
  return {
    version: 1,
    status: encounter.status,
    initiativeOrder,
    initiatives,
    activeIndex,
    round: Math.max(1, Math.floor(finite(encounter.round, 1))),
    resources: activeToken ? { [activeToken.id]: normalizeTurnResources(resourceInput, activeToken) } : {},
    battleItems: Array.isArray(encounter.battleItems) ? encounter.battleItems : [],
    ammoSpentByToken: encounter.ammoSpentByToken && typeof encounter.ammoSpentByToken === "object" ? encounter.ammoSpentByToken : {},
    winnerTokenId: tokenIds.has(encounter.winnerTokenId) ? encounter.winnerTokenId : null,
    log: Array.isArray(encounter.log) ? encounter.log.filter((entry) => typeof entry === "string") : [],
  };
}

export function prepareBattleStart(scene, { viewport, random = Math.random } = {}) {
  if (scene?.kind !== "battle") return {
    ok: false,
    code: "BATTLE_SCENE_REQUIRED",
    message: "Only a Battle Scene can begin an encounter.",
    recovery: "Open a Battle Scene and retry.",
    retryable: false,
  };
  if (scene.encounter) return {
    ok: false,
    code: "BATTLE_ALREADY_ACTIVE",
    message: "This encounter has already begun.",
    recovery: "Continue the current Battle or abandon it from the phase control.",
    retryable: false,
  };
  const sourceTokens = normalizeTableTokens(scene.tokens);
  if (sourceTokens.length < 2) return {
    ok: false,
    code: "BATTLE_NEEDS_TOKENS",
    message: "Battle requires at least two tokens.",
    recovery: "Add another manual or Hero token in Setup, then press Battle again.",
    retryable: true,
  };

  let snappedChests = [];
  for (const chest of normalizeChests(scene.chests)) {
    const position = findOpenSetupPosition(chest.position, { chests: snappedChests, viewport });
    if (!position) return {
      ok: false,
      code: "BATTLE_GRID_FULL",
      message: "The Table has no free grid cell for this Setup.",
      recovery: "Remove an entity or increase the available Table area before starting Battle.",
      retryable: true,
    };
    snappedChests.push({ ...chest, position });
  }

  const snappedTokens = [];
  for (const token of sourceTokens) {
    const position = findOpenSetupPosition(token.position, { tokens: snappedTokens, chests: snappedChests, viewport });
    if (!position) return {
      ok: false,
      code: "BATTLE_GRID_FULL",
      message: "The Table has no free grid cell for every token.",
      recovery: "Remove an entity or increase the available Table area before starting Battle.",
      retryable: true,
    };
    snappedTokens.push({ ...token, position, conditions: [] });
  }

  const initiatives = Object.fromEntries(snappedTokens.map((token) => {
    const rolled = Math.max(0, Math.min(0.999999999999, finite(random(), 0)));
    return [token.id, Math.floor(rolled * 20) + 1 + token.initiativeBonus];
  }));
  const orderIndex = new Map(snappedTokens.map((token, index) => [token.id, index]));
  const initiativeOrder = snappedTokens
    .map((token) => token.id)
    .sort((left, right) => initiatives[right] - initiatives[left] || orderIndex.get(left) - orderIndex.get(right));
  const firstToken = snappedTokens.find((token) => token.id === initiativeOrder[0]);
  const encounter = {
    version: 1,
    status: "active",
    initiativeOrder,
    initiatives,
    activeIndex: 0,
    round: 1,
    resources: firstToken ? { [firstToken.id]: createTurnResources(firstToken) } : {},
    battleItems: [],
    ammoSpentByToken: {},
    winnerTokenId: null,
    log: [`Battle began with ${snappedTokens.length} tokens.`],
  };
  return { ok: true, value: { tokens: snappedTokens, chests: snappedChests, encounter } };
}

const normalizeWallPoint = (point) => ({
  xPercent: finite(point?.xPercent),
  yPercent: finite(point?.yPercent),
});

export function normalizeWall(wall) {
  if (!wall || typeof wall.id !== "string" || !wall.id.trim()) return null;
  const points = Array.isArray(wall.points) ? wall.points.map(normalizeWallPoint) : [];
  if (points.length < 2) return null;
  return { id: wall.id.trim(), type: wall.type === "half" ? "half" : "full", points };
}

export const normalizeWalls = (walls) =>
  Array.isArray(walls) ? walls.map(normalizeWall).filter(Boolean) : [];

export function createWall({ id, type, points }) {
  const wall = normalizeWall({ id, type, points });
  if (!wall) throw new TypeError("A persisted wall requires an id and at least two points.");
  return wall;
}

export function rulerDistanceFeet(start, end, { width, height, gridSize } = {}) {
  const cellSize = Math.max(1, finite(gridSize, 44));
  const cellsX = Math.max(1, finite(width, cellSize)) / cellSize;
  const cellsY = Math.max(1, finite(height, cellSize)) / cellSize;
  const startColumn = Math.floor((finite(start?.xPercent) / 100) * cellsX);
  const startRow = Math.floor((finite(start?.yPercent) / 100) * cellsY);
  const endColumn = Math.floor((finite(end?.xPercent) / 100) * cellsX);
  const endRow = Math.floor((finite(end?.yPercent) / 100) * cellsY);
  const crossedSquares = Math.abs(endColumn - startColumn) + Math.abs(endRow - startRow);
  return crossedSquares * 5;
}

export const midpointPercent = (start, end) => ({
  xPercent: (finite(start?.xPercent) + finite(end?.xPercent)) / 2,
  yPercent: (finite(start?.yPercent) + finite(end?.yPercent)) / 2,
});
