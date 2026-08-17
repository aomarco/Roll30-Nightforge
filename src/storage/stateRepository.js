import { failure, fromThrown, isQuotaExceededError, success } from "../application/result.js";
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
      const issues = [primary, backup].filter((result) => result.code !== "state-missing");
      return success(empty, {
        source: "empty",
        recovered: issues.length > 0,
        issues,
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
    const proposedRevision = Number(proposed?.revision);
    if (!Number.isSafeInteger(proposedRevision) || proposedRevision < 0 || proposedRevision !== loaded.value.revision) {
      return failure("storage-revision-conflict", "Nightforge state changed before this save could complete.", {
        recovery: "Review the latest state and retry your change. No newer data was overwritten.",
        retryable: true,
        expectedRevision: proposedRevision,
        actualRevision: loaded.value.revision,
      });
    }
    if (loaded.value.revision === Number.MAX_SAFE_INTEGER) {
      return failure("storage-revision-exhausted", "Nightforge cannot safely assign another storage revision.", {
        recovery: "Export your current data and begin with a fresh Nightforge storage envelope.",
        retryable: false,
      });
    }

    const next = sealEnvelope(
      {
        ...proposed,
        revision: loaded.value.revision + 1,
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
      if (isQuotaExceededError(error)) return fromThrown(
        "storage-quota-exceeded",
        "Nightforge browser storage is full.",
        error,
        "Free browser storage or remove unused Nightforge records, then retry. Your previous valid state remains intact.",
      );
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
