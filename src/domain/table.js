import { normalizeEquipment, normalizeInventoryEntries } from "./items.js";

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
