import { failure, fromThrown, success } from "../application/result.js";
import { STORAGE_KEYS } from "./constants.js";
import {
  createEmptyEnvelope,
  inspectEnvelope,
  sealEnvelope,
  serializeEnvelope,
} from "./envelope.js";

const safeRead = (storage, key) => {
  try {
    return success(storage.getItem(key));
  } catch (error) {
    return fromThrown(
      "storage-read-failed",
      "Nightforge could not read browser storage.",
      error,
      "Check browser storage permissions and retry.",
    );
  }
};

export function createStateRepository(
  storage,
  { clock = () => new Date().toISOString(), keys = STORAGE_KEYS } = {},
) {
  if (!storage) throw new TypeError("StateRepository requires a Storage-compatible object.");

  const load = () => {
    const primaryRead = safeRead(storage, keys.state);
    if (!primaryRead.ok) return primaryRead;
    const backupRead = safeRead(storage, keys.backup);
    if (!backupRead.ok) return backupRead;

    const primary = inspectEnvelope(primaryRead.value);
    const backup = inspectEnvelope(backupRead.value);
    const candidates = [
      primary.ok ? { source: "primary", envelope: primary.value } : null,
      backup.ok ? { source: "backup", envelope: backup.value } : null,
    ].filter(Boolean);

    if (!candidates.length) {
      const empty = createEmptyEnvelope(clock());
      return success(empty, {
        source: "empty",
        recovered: false,
        issues: [primary, backup].filter((result) => result.code !== "state-missing"),
      });
    }

    candidates.sort((left, right) => right.envelope.revision - left.envelope.revision);
    const chosen = candidates[0];
    return success(chosen.envelope, {
      source: chosen.source,
      recovered: chosen.source === "backup" || !primary.ok,
      issues: primary.ok ? [] : [primary],
    });
  };

  const save = (proposed) => {
    const primaryRead = safeRead(storage, keys.state);
    if (!primaryRead.ok) return primaryRead;
    const currentPrimary = inspectEnvelope(primaryRead.value);
    const loaded = load();
    if (!loaded.ok) return loaded;

    const next = sealEnvelope(
      {
        ...proposed,
        revision: Math.max(loaded.value.revision, Number(proposed?.revision) || 0) + 1,
      },
      clock(),
    );
    const serialized = serializeEnvelope(next);

    try {
      if (currentPrimary.ok) storage.setItem(keys.backup, primaryRead.value);
      storage.setItem(keys.state, serialized);
      const verification = inspectEnvelope(storage.getItem(keys.state));
      if (!verification.ok || verification.value.revision !== next.revision) {
        if (currentPrimary.ok) storage.setItem(keys.state, primaryRead.value);
        return failure("storage-verification-failed", "Nightforge could not verify the saved state.", {
          recovery: "Your previous valid state was restored. Retry the save.",
          retryable: true,
        });
      }
      return success(verification.value, { revision: verification.value.revision });
    } catch (error) {
      try {
        if (currentPrimary.ok) storage.setItem(keys.state, primaryRead.value);
      } catch {
        // The original failure is more actionable; recovery is attempted best-effort.
      }
      return fromThrown(
        "storage-write-failed",
        "Nightforge could not save to browser storage.",
        error,
        "Your edits are still in memory. Check browser storage and retry.",
      );
    }
  };

  return { load, save };
}

