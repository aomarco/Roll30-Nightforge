import { failure, success } from "../application/result.js";

export const CAMPAIGN_CLOCK_VERSION = 1;
export const COMBAT_ROUND_SECONDS = 6;
export const CLOCK_EVENT_LIMIT = 256;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const cleanId = (value, fallback = null) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;

const nonNegativeInteger = (value, fallback = 0) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(finite(value, fallback))));

const normalizeSceneModes = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([sceneId, mode]) => cleanId(sceneId) && ["paused", "active"].includes(mode))
    .map(([sceneId, mode]) => [sceneId.slice(0, 160), mode]));
};

export function normalizeCampaignClock(input = {}) {
  const mode = ["paused", "active"].includes(input.mode) ? input.mode : "paused";
  return {
    version: CAMPAIGN_CLOCK_VERSION,
    gameTimeSeconds: nonNegativeInteger(input.gameTimeSeconds ?? input.seconds),
    combatRoundSeconds: COMBAT_ROUND_SECONDS,
    mode,
    sceneModes: normalizeSceneModes(input.sceneModes),
    sequence: nonNegativeInteger(input.sequence),
    lastEventId: cleanId(input.lastEventId),
    events: (Array.isArray(input.events) ? input.events : [])
      .filter((event) => event && cleanId(event.id))
      .slice(-CLOCK_EVENT_LIMIT)
      .map((event) => ({
        id: cleanId(event.id),
        kind: cleanId(event.kind, "gm-time-advance"),
        sceneId: cleanId(event.sceneId),
        seconds: nonNegativeInteger(event.seconds),
        sequence: nonNegativeInteger(event.sequence),
      })),
  };
}

export function createBoundaryId(clock, kind = "boundary", actorId = null) {
  const normalized = normalizeCampaignClock(clock);
  const next = normalized.sequence + 1;
  return `${kind}-${next}-${cleanId(actorId, "campaign")}`.slice(0, 160);
}

export function setSceneClockMode(clock, sceneId, mode = "paused") {
  const normalized = normalizeCampaignClock(clock);
  const cleanSceneId = cleanId(sceneId);
  if (!cleanSceneId || !["paused", "active"].includes(mode)) return failure(
    "CLOCK_SCENE_INVALID",
    "Choose a valid Scene and clock mode.",
    { recovery: "Select a Scene before changing its campaign clock.", retryable: false },
  );
  return success({ ...normalized, sceneModes: { ...normalized.sceneModes, [cleanSceneId]: mode } }, {
    event: { id: `scene-mode-${normalized.sequence + 1}-${cleanSceneId}`, kind: "scene-clock-mode", sceneId: cleanSceneId, mode },
  });
}

export function advanceCampaignClock(clock, {
  seconds = 0,
  sceneId = null,
  eventId = null,
  kind = "gm-time-advance",
  reason = "GM command",
} = {}) {
  const normalized = normalizeCampaignClock(clock);
  const amount = nonNegativeInteger(seconds);
  const cleanSceneId = cleanId(sceneId);
  if (cleanSceneId && normalized.sceneModes[cleanSceneId] === "paused") return failure(
    "CLOCK_SCENE_PAUSED",
    "The selected Scene is paused, so campaign time did not advance.",
    { recovery: "Resume the Scene clock or advance campaign time without a paused Scene.", retryable: true },
  );
  if (!amount) return success(normalized, { replayed: false, event: null });
  const id = cleanId(eventId, `clock-${normalized.sequence + 1}`);
  const prior = normalized.events.find((event) => event.id === id);
  if (prior) return success(normalized, { replayed: true, event: prior });
  const event = {
    id,
    kind: cleanId(kind, "gm-time-advance"),
    sceneId: cleanSceneId,
    seconds: amount,
    sequence: normalized.sequence + 1,
    reason: String(reason || "GM command").slice(0, 200),
  };
  return success({
    ...normalized,
    gameTimeSeconds: normalized.gameTimeSeconds + amount,
    sequence: event.sequence,
    lastEventId: event.id,
    events: [...normalized.events, event].slice(-CLOCK_EVENT_LIMIT),
  }, { replayed: false, event });
}

export function advanceCombatRound(clock, { sceneId = null, eventId = null, rounds = 1 } = {}) {
  const count = Math.max(1, Math.floor(finite(rounds, 1)));
  return advanceCampaignClock(clock, {
    seconds: count * COMBAT_ROUND_SECONDS,
    sceneId,
    eventId,
    kind: "combat-round",
    reason: `${count} combat round${count === 1 ? "" : "s"}`,
  });
}

export function markClockEvent(clock, event) {
  return advanceCampaignClock(clock, {
    seconds: 0,
    sceneId: event?.sceneId,
    eventId: event?.id,
    kind: event?.kind || "boundary",
    reason: event?.reason || "Recorded boundary",
  });
}

