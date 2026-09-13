/**
 * Canonical board geometry for scenes, movement, attacks, and future areas.
 *
 * Stored positions remain percentages for compatibility with existing saves.
 * Every rule query converts them through this module, so viewport pixels never
 * decide which square a creature occupies.
 */

export const BOARD_GEOMETRY_VERSION = 1;
export const BOARD_DISTANCE_POLICIES = Object.freeze(["chebyshev"]);
export const BOARD_LIMITS = Object.freeze({
  minColumns: 1,
  maxColumns: 200,
  minRows: 1,
  maxRows: 200,
  minFeetPerCell: 1,
  maxFeetPerCell: 100,
});

export const DEFAULT_BOARD = Object.freeze({
  columns: 20,
  rows: 12,
  feetPerCell: 5,
  distancePolicy: "chebyshev",
  geometryVersion: BOARD_GEOMETRY_VERSION,
});

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const cellKey = (cell) => `${Math.floor(Number(cell?.column) || 0)}:${Math.floor(Number(cell?.row) || 0)}`;

export function normalizeBoard(input = {}) {
  const columns = clamp(
    Math.floor(finite(input?.columns, DEFAULT_BOARD.columns)),
    BOARD_LIMITS.minColumns,
    BOARD_LIMITS.maxColumns,
  );
  const rows = clamp(
    Math.floor(finite(input?.rows, DEFAULT_BOARD.rows)),
    BOARD_LIMITS.minRows,
    BOARD_LIMITS.maxRows,
  );
  const feetPerCell = clamp(
    Math.floor(finite(input?.feetPerCell, DEFAULT_BOARD.feetPerCell)),
    BOARD_LIMITS.minFeetPerCell,
    BOARD_LIMITS.maxFeetPerCell,
  );
  return {
    columns,
    rows,
    feetPerCell,
    distancePolicy: BOARD_DISTANCE_POLICIES.includes(input?.distancePolicy)
      ? input.distancePolicy
      : DEFAULT_BOARD.distancePolicy,
    geometryVersion: BOARD_GEOMETRY_VERSION,
  };
}

export function boardWorldSize(board = DEFAULT_BOARD, cellSize = 1) {
  const normalized = normalizeBoard(board);
  const size = Math.max(1, finite(cellSize, 1));
  return {
    width: normalized.columns * size,
    height: normalized.rows * size,
    cellSize: size,
    ...normalized,
  };
}

export function normalizePosition(position = {}) {
  return {
    xPercent: clamp(finite(position?.xPercent ?? position?.x, 50), 0, 100),
    yPercent: clamp(finite(position?.yPercent ?? position?.y, 50), 0, 100),
  };
}

export function cellFromPosition(position, board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const point = normalizePosition(position);
  return {
    column: clamp(Math.floor((point.xPercent / 100) * normalized.columns), 0, normalized.columns - 1),
    row: clamp(Math.floor((point.yPercent / 100) * normalized.rows), 0, normalized.rows - 1),
  };
}

export function positionFromCell(cell, board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const column = clamp(Math.floor(finite(cell?.column)), 0, normalized.columns - 1);
  const row = clamp(Math.floor(finite(cell?.row)), 0, normalized.rows - 1);
  return {
    xPercent: ((column + 0.5) / normalized.columns) * 100,
    yPercent: ((row + 0.5) / normalized.rows) * 100,
  };
}

export function fractionalCellFromPosition(position, board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const point = normalizePosition(position);
  return {
    column: (point.xPercent / 100) * normalized.columns,
    row: (point.yPercent / 100) * normalized.rows,
  };
}

const FOOTPRINTS = Object.freeze({
  tiny: { columns: 1, rows: 1 },
  small: { columns: 1, rows: 1 },
  medium: { columns: 1, rows: 1 },
  large: { columns: 2, rows: 2 },
  huge: { columns: 3, rows: 3 },
  gargantuan: { columns: 4, rows: 4 },
});

export function footprintSize(size) {
  const value = FOOTPRINTS[String(size || "medium").toLowerCase()] || FOOTPRINTS.medium;
  return { ...value };
}

/**
 * The anchor is the occupied square at the creature's visual centre. Even
 * footprints use the upper-left of the two central squares as their anchor,
 * which keeps old one-cell positions stable and makes every placement exact.
 */
export function footprintCells(anchor, size = "medium", board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const footprint = footprintSize(size);
  const centerColumn = Math.floor(finite(anchor?.column));
  const centerRow = Math.floor(finite(anchor?.row));
  const startColumn = Math.floor(centerColumn - (footprint.columns - 1) / 2);
  const startRow = Math.floor(centerRow - (footprint.rows - 1) / 2);
  const cells = [];
  for (let row = 0; row < footprint.rows; row += 1) {
    for (let column = 0; column < footprint.columns; column += 1) {
      cells.push({ column: startColumn + column, row: startRow + row });
    }
  }
  return {
    anchor: { column: centerColumn, row: centerRow },
    size: footprint,
    cells,
    inBounds: cells.every((cell) => cell.column >= 0 && cell.row >= 0 && cell.column < normalized.columns && cell.row < normalized.rows),
  };
}

export function footprintForPosition(position, size = "medium", board = DEFAULT_BOARD) {
  return footprintCells(cellFromPosition(position, board), size, board);
}

export function footprintForToken(token, board = DEFAULT_BOARD) {
  return footprintForPosition(token?.position, token?.size, board);
}

export function distanceCells(first, second, policy = DEFAULT_BOARD.distancePolicy) {
  const dx = Math.abs(Math.floor(finite(first?.column)) - Math.floor(finite(second?.column)));
  const dy = Math.abs(Math.floor(finite(first?.row)) - Math.floor(finite(second?.row)));
  if (policy === "chebyshev") return Math.max(dx, dy);
  return Math.ceil(Math.sqrt((dx ** 2) + (dy ** 2)));
}

export function distanceBetweenFootprints(first, second, board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const left = Array.isArray(first) ? first : first?.cells || [];
  const right = Array.isArray(second) ? second : second?.cells || [];
  if (!left.length || !right.length) return 0;
  let nearest = Infinity;
  for (const a of left) {
    for (const b of right) nearest = Math.min(nearest, distanceCells(a, b, normalized.distancePolicy));
  }
  // The existing rules use occupied-square centres and count a neighbouring
  // square as five feet. Overlapping footprints are still zero feet.
  return Math.max(0, nearest) * normalized.feetPerCell;
}

export function distanceBetweenPositions(first, second, board = DEFAULT_BOARD, sizes = {}) {
  const normalized = normalizeBoard(board);
  return distanceBetweenFootprints(
    footprintForPosition(first, sizes.first || "medium", normalized),
    footprintForPosition(second, sizes.second || "medium", normalized),
    normalized,
  );
}

export function distanceBetweenTokens(first, second, board = DEFAULT_BOARD) {
  return distanceBetweenFootprints(footprintForToken(first, board), footprintForToken(second, board), board);
}

export function cellsForTokens(tokens = [], board = DEFAULT_BOARD) {
  const occupied = new Set();
  for (const token of Array.isArray(tokens) ? tokens : []) {
    for (const cell of footprintForToken(token, board).cells) occupied.add(cellKey(cell));
  }
  return occupied;
}

const cellCenter = (cell) => ({ x: Number(cell.column) + 0.5, y: Number(cell.row) + 0.5 });

const vectorForDirection = (direction = {}) => {
  const column = finite(direction.column ?? direction.x);
  const row = finite(direction.row ?? direction.y);
  const length = Math.hypot(column, row) || 1;
  return { column: column / length, row: row / length };
};

const dot = (a, b) => a.column * b.column + a.row * b.row;

const cross = (a, b) => a.column * b.row - a.row * b.column;

function cellIncluded(cell, shape, board) {
  const normalized = normalizeBoard(board);
  const center = cellCenter(cell);
  const origin = {
    column: finite(shape.origin?.column) + 0.5,
    row: finite(shape.origin?.row) + 0.5,
  };
  const delta = { column: center.x - origin.column, row: center.y - origin.row };
  const distance = Math.hypot(delta.column, delta.row);
  const feet = normalized.feetPerCell;
  const boundary = shape.boundary === "exclusive" ? (value, limit) => value < limit : (value, limit) => value <= limit;
  if (shape.kind === "point") return cell.column === shape.origin?.column && cell.row === shape.origin?.row;
  if (shape.kind === "circle" || shape.kind === "radius") return boundary(distance * feet, Math.max(0, finite(shape.radiusFeet, feet)));
  if (shape.kind === "rectangle" || shape.kind === "cube") {
    const width = Math.max(1, finite(shape.widthFeet, feet)) / feet;
    const height = Math.max(1, finite(shape.heightFeet ?? shape.depthFeet, feet)) / feet;
    return Math.abs(delta.column) <= width / 2 && Math.abs(delta.row) <= height / 2;
  }
  if (shape.kind === "line") {
    const direction = vectorForDirection(shape.direction);
    const along = dot(delta, direction);
    const length = Math.max(feet, finite(shape.lengthFeet, feet)) / feet;
    const perpendicular = Math.abs(cross(delta, direction));
    const width = Math.max(0.5, finite(shape.widthFeet, feet) / feet / 2);
    return along >= 0 && boundary(along, length) && perpendicular <= width;
  }
  if (shape.kind === "cone") {
    const direction = vectorForDirection(shape.direction);
    const along = dot(delta, direction);
    const length = Math.max(feet, finite(shape.lengthFeet, feet)) / feet;
    const angle = Math.abs(cross(delta, direction));
    const halfWidth = Math.max(0.5, (along / length) * Math.max(1, finite(shape.widthFeet, feet) / feet / 2));
    return along >= 0 && boundary(along, length) && angle <= halfWidth;
  }
  return false;
}

export function cellsForShape(shape = {}, board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const cells = [];
  for (let row = 0; row < normalized.rows; row += 1) {
    for (let column = 0; column < normalized.columns; column += 1) {
      const cell = { column, row };
      if (cellIncluded(cell, shape, normalized) && (shape.includeOrigin !== false || cell.column !== shape.origin?.column || cell.row !== shape.origin?.row)) cells.push(cell);
    }
  }
  return cells;
}

export function queryShapeTargets({ tokens = [], shape = {}, board = DEFAULT_BOARD, originTokenId = null, includeSelf = false, includeAllies = true, targetIds = null } = {}) {
  const normalized = normalizeBoard(board);
  const cells = cellsForShape(shape, normalized);
  const included = new Set(cells.map(cellKey));
  const origin = tokens.find((token) => token.id === originTokenId) || null;
  const targetSet = targetIds ? new Set(targetIds) : null;
  const reasons = [];
  const candidates = (Array.isArray(tokens) ? tokens : []).filter((token) => {
    if (!token?.id || (targetSet && !targetSet.has(token.id))) return false;
    if (!includeSelf && token.id === originTokenId) {
      reasons.push({ id: token.id, included: false, reason: "self-excluded" });
      return false;
    }
    if (!includeAllies && origin && token.faction === origin.faction) {
      reasons.push({ id: token.id, included: false, reason: "ally-excluded" });
      return false;
    }
    const occupied = footprintForToken(token, normalized).cells;
    const includedByShape = occupied.some((cell) => included.has(cellKey(cell)));
    reasons.push({ id: token.id, included: includedByShape, reason: includedByShape ? "footprint-intersects-shape" : "outside-shape" });
    return includedByShape;
  });
  return {
    cells,
    tokenIds: candidates.map((token) => token.id),
    candidates: candidates.map((token) => ({ id: token.id, name: token.name, faction: token.faction, reason: "footprint-intersects-shape" })),
    reasons,
    boundary: shape.boundary === "exclusive" ? "exclusive" : "inclusive",
  };
}

const wallPoint = (point, board) => {
  const normalized = normalizeBoard(board);
  return {
    x: (clamp(finite(point?.xPercent), 0, 100) / 100) * normalized.columns,
    y: (clamp(finite(point?.yPercent), 0, 100) / 100) * normalized.rows,
  };
};

const orientation = (a, b, c) => {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : -1;
};

const onSegment = (a, b, point) =>
  point.x <= Math.max(a.x, b.x) + 1e-7 && point.x >= Math.min(a.x, b.x) - 1e-7
  && point.y <= Math.max(a.y, b.y) + 1e-7 && point.y >= Math.min(a.y, b.y) - 1e-7;

export function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(firstStart, firstEnd, secondStart))
    || (o2 === 0 && onSegment(firstStart, firstEnd, secondEnd))
    || (o3 === 0 && onSegment(secondStart, secondEnd, firstStart))
    || (o4 === 0 && onSegment(secondStart, secondEnd, firstEnd));
}

export function lineOfEffect(from, to, walls = [], board = DEFAULT_BOARD) {
  const normalized = normalizeBoard(board);
  const start = { x: finite(from?.column) + 0.5, y: finite(from?.row) + 0.5 };
  const end = { x: finite(to?.column) + 0.5, y: finite(to?.row) + 0.5 };
  const blockedBy = [];
  for (const wall of Array.isArray(walls) ? walls : []) {
    const points = Array.isArray(wall?.points) ? wall.points.map((point) => wallPoint(point, normalized)) : [];
    for (let index = 1; index < points.length; index += 1) {
      if (segmentsIntersect(start, end, points[index - 1], points[index])) blockedBy.push(wall.id);
    }
  }
  return { state: blockedBy.length ? "blocked" : "clear", blockedBy: [...new Set(blockedBy)] };
}

function outOfBoundsPosition(position, size, board) {
  return !footprintForPosition(position, size, board).inBounds;
}

export function resizeBoardPreview(currentBoard, nextBoard, {
  tokens = [],
  chests = [],
  walls = [],
  difficultTerrain = [],
  zones = [],
  pendingTargets = [],
} = {}) {
  const from = normalizeBoard(currentBoard);
  const to = normalizeBoard(nextBoard);
  const outOfBounds = {
    tokens: tokens.filter((token) => outOfBoundsPosition(token.position, token.size, to)).map((token) => token.id),
    chests: chests.filter((chest) => outOfBoundsPosition(chest.position, "medium", to)).map((chest) => chest.id),
    walls: walls.filter((wall) => (wall.points || []).some((point) => {
      const cell = {
        column: (finite(point?.xPercent ?? point?.x, 0) / 100) * to.columns,
        row: (finite(point?.yPercent ?? point?.y, 0) / 100) * to.rows,
      };
      return cell.column < 0 || cell.row < 0 || cell.column > to.columns || cell.row > to.rows;
    })).map((wall) => wall.id),
    terrain: (Array.isArray(difficultTerrain) ? difficultTerrain : []).filter((entry) => {
      const match = /^(\d+):(\d+)$/.exec(String(entry));
      return !match || Number(match[1]) >= to.columns || Number(match[2]) >= to.rows;
    }),
    zones: (Array.isArray(zones) ? zones : []).filter((zone) => !footprintForPosition(zone.position, zone.size, to).inBounds).map((zone) => zone.id),
    pendingTargets: (Array.isArray(pendingTargets) ? pendingTargets : []).filter((target) => !footprintForPosition(target.position, target.size, to).inBounds).map((target) => target.id),
  };
  const counts = Object.fromEntries(Object.entries(outOfBounds).map(([key, values]) => [key, values.length]));
  return {
    from,
    to,
    expanded: to.columns >= from.columns && to.rows >= from.rows,
    changed: from.columns !== to.columns || from.rows !== to.rows || from.feetPerCell !== to.feetPerCell,
    outOfBounds,
    counts,
    requiresReview: Object.values(counts).some((count) => count > 0),
  };
}

export function resizeBoard(currentBoard, nextBoard, options = {}, { decision = "preview", relocations = {} } = {}) {
  const preview = resizeBoardPreview(currentBoard, nextBoard, options);
  if (preview.requiresReview && !["crop", "relocate"].includes(decision)) {
    return {
      ok: false,
      code: "BOARD_RESIZE_REVIEW_REQUIRED",
      message: "Shrinking this board would place saved objects outside its bounds.",
      recovery: "Review the affected objects, then choose a relocation or explicit crop.",
      retryable: true,
      preview,
    };
  }
  const relocationMap = relocations && typeof relocations === "object" ? relocations : {};
  const reposition = (record) => relocationMap[record.id] ? { ...record, position: relocationMap[record.id] } : record;
  if (decision === "relocate") {
    const missing = Object.entries(preview.outOfBounds)
      .filter(([kind, ids]) => ["tokens", "chests", "zones", "pendingTargets"].includes(kind))
      .flatMap(([kind, ids]) => ids.filter((id) => !relocationMap[id]).map((id) => `${kind}:${id}`));
    const invalid = [...(options.tokens || []), ...(options.chests || []), ...(options.zones || []), ...(options.pendingTargets || [])]
      .filter((record) => relocationMap[record.id] && outOfBoundsPosition(relocationMap[record.id], record.size, preview.to))
      .map((record) => record.id);
    if (missing.length || invalid.length) return {
      ok: false,
      code: "BOARD_RELOCATION_INCOMPLETE",
      message: "Every affected object needs a legal relocated position before the board can shrink.",
      recovery: "Place each affected object inside the resized board or choose explicit crop.",
      retryable: true,
      preview,
      missing,
      invalid,
    };
  }
  const crop = (records, ids) => records.filter((record) => !ids.includes(record.id)).map(reposition);
  return {
    ok: true,
    value: {
      board: preview.to,
      tokens: decision === "crop" ? crop(options.tokens || [], preview.outOfBounds.tokens) : (options.tokens || []).map(reposition),
      chests: decision === "crop" ? crop(options.chests || [], preview.outOfBounds.chests) : (options.chests || []).map(reposition),
      walls: decision === "crop" ? crop(options.walls || [], preview.outOfBounds.walls) : options.walls || [],
      difficultTerrain: decision === "crop" ? (options.difficultTerrain || []).filter((entry) => !preview.outOfBounds.terrain.includes(entry)) : options.difficultTerrain || [],
    },
    preview,
    decision,
  };
}
