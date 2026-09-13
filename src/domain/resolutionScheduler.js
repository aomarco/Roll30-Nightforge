import { failure, success } from "../application/result.js";

export const RESOLUTION_STATUS = Object.freeze(["pending", "active", "resolved", "cancelled"]);
export const RESOLUTION_TYPES = Object.freeze([
  "opportunity-attack",
  "reaction",
  "ready-trigger",
  "shield",
  "counterspell",
  "choice",
  "resource-choice",
  "death-save",
  "gm-review",
]);
export const RESOLUTION_WINDOWS = Object.freeze([
  "action-declared",
  "target-selected",
  "attack-roll-known",
  "before-hit-finalized",
  "before-damage",
  "damage-applied",
  "movement-boundary",
  "save-resolved",
  "turn-start",
  "turn-end",
  "round-start",
  "round-end",
  "game-time-advanced",
]);
export const RESOLUTION_LIMITS = Object.freeze({ maxFrames: 128, maxDepth: 16, maxEvents: 256, maxResponders: 32 });

const cleanId = (value, fallback = null) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const boundedInteger = (value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) => Math.max(0, Math.min(maximum, Math.floor(finite(value, fallback))));
const cleanList = (value, limit = 32) => [...new Set((Array.isArray(value) ? value : [])
  .filter((entry) => typeof entry === "string" && entry.trim())
  .map((entry) => entry.trim().slice(0, 160)))].slice(0, limit);

function serializable(value, depth = 0) {
  if (depth > 8 || value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return value.slice(0, 64).map((entry) => serializable(entry, depth + 1));
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["__proto__", "prototype", "constructor"].includes(key))
    .slice(0, 128)
    .map(([key, entry]) => [key.slice(0, 120), serializable(entry, depth + 1)]));
}

const normalizeResponder = (entry) => {
  const id = cleanId(entry?.id || entry?.responderId);
  if (!id) return null;
  return {
    id,
    response: cleanId(entry?.response || entry?.choice),
    accepted: entry?.accepted === undefined ? null : Boolean(entry.accepted),
    sequence: boundedInteger(entry?.sequence),
  };
};

export function normalizePendingResolution(input = {}, { sequence = 0 } = {}) {
  const id = cleanId(input.id);
  const type = RESOLUTION_TYPES.includes(input.type) ? input.type : null;
  if (!id || !type) return null;
  const status = RESOLUTION_STATUS.includes(input.status) ? input.status : "pending";
  const parentId = cleanId(input.parentId);
  const depth = boundedInteger(input.depth, parentId ? 1 : 0, RESOLUTION_LIMITS.maxDepth);
  const maxDepth = boundedInteger(input.maxDepth, RESOLUTION_LIMITS.maxDepth, RESOLUTION_LIMITS.maxDepth);
  const responders = (Array.isArray(input.responders) ? input.responders : []).map(normalizeResponder).filter(Boolean).slice(0, RESOLUTION_LIMITS.maxResponders);
  return {
    id,
    type,
    window: RESOLUTION_WINDOWS.includes(input.window) ? input.window : "action-declared",
    status,
    dedupKey: cleanId(input.dedupKey, id),
    priority: boundedInteger(input.priority, 0, 1000),
    sequence: boundedInteger(input.sequence, sequence),
    initiativeSnapshot: boundedInteger(input.initiativeSnapshot, 0, 1000000),
    parentId,
    depth,
    maxDepth,
    eventCount: boundedInteger(input.eventCount, 0, RESOLUTION_LIMITS.maxEvents),
    maxEvents: boundedInteger(input.maxEvents, RESOLUTION_LIMITS.maxEvents, RESOLUTION_LIMITS.maxEvents),
    path: cleanList(input.path, 64),
    cursor: boundedInteger(input.cursor),
    departureCell: input.departureCell && Number.isFinite(Number(input.departureCell.column)) && Number.isFinite(Number(input.departureCell.row))
      ? { column: Math.floor(Number(input.departureCell.column)), row: Math.floor(Number(input.departureCell.row)) }
      : null,
    reservations: serializable(input.reservations || {}),
    responders,
    requiredResponderIds: cleanList(input.requiredResponderIds, RESOLUTION_LIMITS.maxResponders),
    usedReactions: cleanList(input.usedReactions, RESOLUTION_LIMITS.maxResponders),
    reservedResourceIds: cleanList(input.reservedResourceIds, RESOLUTION_LIMITS.maxResponders),
    payload: serializable(input.payload || {}),
    options: serializable(input.options || []),
    createdBoundaryId: cleanId(input.createdBoundaryId),
    resolvedAtBoundaryId: cleanId(input.resolvedAtBoundaryId),
    outcome: serializable(input.outcome),
  };
}

export const normalizePendingResolutions = (frames) => {
  const normalized = (Array.isArray(frames) ? frames : [])
    .map((frame, index) => normalizePendingResolution(frame, { sequence: index + 1 }))
    .filter(Boolean)
    .slice(0, RESOLUTION_LIMITS.maxFrames);
  const unique = new Map();
  for (const frame of normalized) {
    if (!unique.has(frame.id)) unique.set(frame.id, frame);
  }
  return [...unique.values()].sort((left, right) =>
    right.priority - left.priority
    || left.initiativeSnapshot - right.initiativeSnapshot
    || left.sequence - right.sequence
    || left.id.localeCompare(right.id));
};

export function createPendingResolution({
  id,
  type,
  payload = {},
  priority = 0,
  initiativeSnapshot = 0,
  parentId = null,
  depth,
  sequence = 0,
  createdBoundaryId = null,
  requiredResponderIds = [],
  dedupKey = null,
  window = "action-declared",
} = {}) {
  if (!cleanId(id) || !RESOLUTION_TYPES.includes(type)) return failure(
    "RESOLUTION_TYPE_INVALID",
    "Nightforge could not create that pending resolution.",
    { recovery: "Choose a supported reaction or choice window.", retryable: false },
  );
  const nextDepth = depth === undefined ? (parentId ? 1 : 0) : depth;
  if (nextDepth > RESOLUTION_LIMITS.maxDepth) return failure(
    "RESOLUTION_DEPTH_LIMIT",
    "Nested reactions reached the safety limit and were refused.",
    { recovery: "Resolve the current reaction before creating another nested reaction.", retryable: true },
  );
  return success(normalizePendingResolution({
    id, type, window, payload, priority, initiativeSnapshot, parentId, depth: nextDepth, sequence,
    createdBoundaryId, requiredResponderIds, dedupKey: dedupKey || id,
  }, { sequence }));
}

function resolutionFailure(code, message, recovery = "Refresh the current resolution and retry.") {
  return failure(code, message, { recovery, retryable: true });
}

export function enqueueResolution(frames, resolution, { maxFrames = RESOLUTION_LIMITS.maxFrames } = {}) {
  const current = normalizePendingResolutions(frames);
  const next = normalizePendingResolution(resolution, { sequence: current.length + 1 });
  if (!next) return resolutionFailure("RESOLUTION_INVALID", "The pending resolution is incomplete.");
  if (current.some((entry) => entry.id === next.id || (next.dedupKey && entry.dedupKey === next.dedupKey))) {
    return success(current, { replayed: true, resolution: current.find((entry) => entry.id === next.id || entry.dedupKey === next.dedupKey) });
  }
  if (next.depth > next.maxDepth || next.eventCount >= next.maxEvents) return resolutionFailure(
    "RESOLUTION_RECURSION_LIMIT",
    "This reaction would exceed the persisted resolution safety limit.",
    "Finish or cancel the parent resolution before opening another window.",
  );
  if (current.length >= maxFrames) return resolutionFailure(
    "RESOLUTION_QUEUE_LIMIT",
    "Too many pending resolution windows are already stored.",
    "Resolve or cancel an existing window before creating another.",
  );
  const queued = normalizePendingResolutions([...current, { ...next, sequence: Math.max(next.sequence, current.reduce((max, entry) => Math.max(max, entry.sequence), 0) + 1) }]);
  return success(queued, { replayed: false, resolution: queued.find((entry) => entry.id === next.id) });
}

export const currentResolution = (frames) => normalizePendingResolutions(frames).find((frame) => ["pending", "active"].includes(frame.status)) || null;

export function beginResolution(frames, resolutionId) {
  const current = normalizePendingResolutions(frames);
  const target = current.find((frame) => frame.id === resolutionId);
  if (!target) return resolutionFailure("RESOLUTION_NOT_FOUND", "That resolution is no longer pending.");
  return success(current.map((frame) => frame.id === resolutionId ? { ...frame, status: "active" } : frame), { resolution: { ...target, status: "active" } });
}

export function respondToResolution(frames, resolutionId, { responderId, response = null, accepted = true, sequence = 0 } = {}) {
  const current = normalizePendingResolutions(frames);
  const target = current.find((frame) => frame.id === resolutionId);
  const responder = cleanId(responderId);
  if (!target || !responder) return resolutionFailure("RESOLUTION_RESPONDER_INVALID", "That reaction responder is no longer available.");
  if (target.status === "resolved" || target.status === "cancelled") return resolutionFailure("RESOLUTION_ALREADY_CLOSED", "That resolution window has already closed.");
  if (target.requiredResponderIds.length && !target.requiredResponderIds.includes(responder)) return resolutionFailure("RESOLUTION_RESPONDER_UNEXPECTED", "That creature is not a responder for this window.");
  const responders = target.responders.filter((entry) => entry.id !== responder);
  responders.push({ id: responder, response: cleanId(response), accepted: Boolean(accepted), sequence: boundedInteger(sequence, target.responders.length + 1) });
  const nextTarget = { ...target, status: "active", responders, eventCount: target.eventCount + 1, usedReactions: accepted && target.type !== "choice" ? [...new Set([...target.usedReactions, responder])] : target.usedReactions };
  if (nextTarget.eventCount > nextTarget.maxEvents) return resolutionFailure("RESOLUTION_EVENT_LIMIT", "This resolution exceeded its event limit.", "Cancel the loop and retry the original action.");
  return success(normalizePendingResolutions(current.map((frame) => frame.id === resolutionId ? nextTarget : frame)), { resolution: nextTarget });
}

export function resumeResolution(frames, resolutionId, patch = {}) {
  const current = normalizePendingResolutions(frames);
  const target = current.find((frame) => frame.id === resolutionId);
  if (!target) return resolutionFailure("RESOLUTION_NOT_FOUND", "That resolution is no longer pending.");
  const next = normalizePendingResolution({ ...target, ...patch, id: target.id, eventCount: target.eventCount + 1 }, { sequence: target.sequence });
  if (!next || next.eventCount > next.maxEvents) return resolutionFailure("RESOLUTION_EVENT_LIMIT", "This resolution exceeded its event limit.");
  return success(normalizePendingResolutions(current.map((frame) => frame.id === resolutionId ? next : frame)), { resolution: next });
}

export function completeResolution(frames, resolutionId, { boundaryId = null, outcome = null } = {}) {
  const current = normalizePendingResolutions(frames);
  const target = current.find((frame) => frame.id === resolutionId);
  if (!target) return resolutionFailure("RESOLUTION_NOT_FOUND", "That resolution is no longer pending.");
  const completed = { ...target, status: "resolved", resolvedAtBoundaryId: cleanId(boundaryId), outcome: serializable(outcome) };
  return success(normalizePendingResolutions(current.map((frame) => frame.id === resolutionId ? completed : frame)), { resolution: completed });
}

export function cancelResolution(frames, resolutionId, reason = "cancelled") {
  const current = normalizePendingResolutions(frames);
  const target = current.find((frame) => frame.id === resolutionId);
  if (!target) return resolutionFailure("RESOLUTION_NOT_FOUND", "That resolution is no longer pending.");
  const cancelled = { ...target, status: "cancelled", outcome: { reason: String(reason).slice(0, 200) } };
  return success(normalizePendingResolutions(current.map((frame) => frame.id === resolutionId ? cancelled : frame)), { resolution: cancelled });
}
