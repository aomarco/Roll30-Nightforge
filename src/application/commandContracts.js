export const COMMAND_VERSION = 1;
export const COMMAND_TYPES = Object.freeze(["move", "attack", "adjust-hp", "award-xp", "check"]);

const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const id = (value) => text(value).slice(0, 256);
const invalidPayload = (message, recovery = "Review the action and retry.") => ({
  ok: false,
  code: "command-payload-invalid",
  message,
  recovery,
  retryable: false,
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const canonicalCommandPayload = (payload) => JSON.stringify(canonicalize(payload || {}));

/** A small synchronous fingerprint used before the durable vault hash. */
export const commandPayloadHash = (payload) => {
  const source = canonicalCommandPayload(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export function validateCommand(input = {}) {
  const commandId = text(input.commandId || input.id);
  const type = text(input.type);
  const expectedRevision = Number(input.expectedRevision ?? input.revision);
  if (!commandId || commandId.length > 256) return { ok: false, code: "command-id-invalid", message: "Every action needs a stable command ID.", recovery: "Retry the action with a fresh command ID.", retryable: true };
  if (!COMMAND_TYPES.includes(type)) return { ok: false, code: "command-type-invalid", message: `Nightforge does not support the command type ${type || "(empty)"}.`, recovery: "Choose a supported action.", retryable: false };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, code: "command-revision-invalid", message: "The action is missing a valid state revision.", recovery: "Refresh the campaign and retry.", retryable: true };
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
  if (["move", "attack", "adjust-hp", "award-xp"].includes(type) && !id(payload.sceneId)) return invalidPayload("This command needs a Scene reference.", "Refresh the Table and retry the action.");
  if (["move", "attack", "adjust-hp"].includes(type) && !id(payload.tokenId) && !id(payload.specification?.tokenId)) return invalidPayload("This command needs an actor token reference.", "Select the token again and retry.");
  if (type === "move" && (!payload.destination || typeof payload.destination !== "object")) return invalidPayload("Movement needs a destination cell.", "Choose a reachable destination on the map.");
  if (type === "attack" && (!payload.specification || typeof payload.specification !== "object")) return invalidPayload("An attack needs its weapon and target specification.", "Choose the attack again.");
  if (type === "adjust-hp" && (!Number.isSafeInteger(Number(payload.amount)) || Number(payload.amount) <= 0 || !["heal", "damage"].includes(payload.direction))) return invalidPayload("Hit point adjustments need a positive amount and a heal or damage direction.", "Enter a whole number above zero.");
  if (type === "award-xp" && !id(payload.sceneId)) return invalidPayload("Experience awards need a Scene reference.", "Open the completed Battle and retry.");
  if (type === "check" && payload.specification !== undefined && (typeof payload.specification !== "object" || Array.isArray(payload.specification))) return invalidPayload("A check specification must be an object.");
  const actor = input.actor && typeof input.actor === "object" && !Array.isArray(input.actor)
    ? { id: id(input.actor.id) || null, kind: text(input.actor.kind, "user") }
    : null;
  return {
    ok: true,
    value: {
      version: COMMAND_VERSION,
      commandId,
      type,
      expectedRevision,
      actor,
      payload,
      payloadHash: commandPayloadHash(payload),
      transcript: input.transcript || null,
    },
  };
}

export const commandResult = (command, value, events = [], transcript = null, metadata = {}) => ({
  ok: true,
  value,
  commandId: command.commandId,
  commandType: command.type,
  events: Array.isArray(events) ? events : [],
  transcript,
  ...metadata,
});
