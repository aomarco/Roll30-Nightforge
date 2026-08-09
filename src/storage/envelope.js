import { failure, success } from "../application/result.js";
import { normalizeHeroRecord, normalizeSceneRecord } from "../domain/records.js";
import { NIGHTFORGE_SCHEMA_VERSION } from "./constants.js";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};

const checksumFor = (value) => {
  const source = JSON.stringify(canonicalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export function createEmptyEnvelope(now = new Date().toISOString()) {
  return {
    schemaVersion: NIGHTFORGE_SCHEMA_VERSION,
    revision: 0,
    savedAt: now,
    scenes: [],
    heroes: [],
    lastActiveSceneId: null,
    pendingArtworkDeletes: [],
  };
}

export function normalizeEnvelope(value = {}, now = new Date().toISOString()) {
  const scenes = Array.isArray(value.scenes)
    ? value.scenes
        .filter((scene) => scene?.id)
        .map((scene) => normalizeSceneRecord(scene, { now }))
    : [];
  const heroes = Array.isArray(value.heroes)
    ? value.heroes
        .filter((hero) => hero?.id)
        .map((hero) => normalizeHeroRecord(hero, { now }))
    : [];
  const sceneIds = new Set(scenes.map((scene) => scene.id));

  return {
    schemaVersion: NIGHTFORGE_SCHEMA_VERSION,
    revision: Math.max(0, Math.floor(Number(value.revision) || 0)),
    savedAt: value.savedAt || now,
    scenes,
    heroes,
    lastActiveSceneId: sceneIds.has(value.lastActiveSceneId)
      ? value.lastActiveSceneId
      : null,
    pendingArtworkDeletes: [
      ...new Set(
        Array.isArray(value.pendingArtworkDeletes)
          ? value.pendingArtworkDeletes.filter(
              (key) => typeof key === "string" && key.trim(),
            )
          : [],
      ),
    ],
  };
}

export function sealEnvelope(value, now = new Date().toISOString()) {
  const normalized = normalizeEnvelope(value, now);
  const payload = { ...normalized, savedAt: now };
  return { ...payload, checksum: checksumFor(payload) };
}

export function inspectEnvelope(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return failure("state-missing", "No saved Nightforge state exists.", {
      recovery: "Start with a fresh Nightforge state.",
      retryable: false,
    });
  }

  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (error) {
    return failure("state-json-invalid", "Saved Nightforge state is not valid JSON.", {
      recovery: "Try the backup state.",
      retryable: false,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failure("state-shape-invalid", "Saved Nightforge state has an invalid shape.", {
      recovery: "Try the backup state.",
      retryable: false,
    });
  }

  if (parsed.schemaVersion !== NIGHTFORGE_SCHEMA_VERSION) {
    return failure(
      "state-version-incompatible",
      `Nightforge state version ${String(parsed.schemaVersion)} is not supported.`,
      { recovery: "Keep the data intact and open a supported Nightforge version.", retryable: false },
    );
  }

  const { checksum, ...payload } = parsed;
  if (typeof checksum !== "string" || checksum !== checksumFor(payload)) {
    return failure("state-checksum-invalid", "Saved Nightforge state failed validation.", {
      recovery: "Try the backup state.",
      retryable: false,
    });
  }

  try {
    return success(normalizeEnvelope(payload, payload.savedAt));
  } catch (error) {
    return failure("state-record-invalid", "Saved Nightforge records could not be normalized.", {
      recovery: "Try the backup state.",
      retryable: false,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export const serializeEnvelope = (envelope) => JSON.stringify(envelope);

