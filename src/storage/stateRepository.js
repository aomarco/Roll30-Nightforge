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
    if (!primaryRead.ok) return { ...primaryRead, classification: "storage-unavailable" };
    const backupRead = safeRead(storage, keys.backup);
    if (!backupRead.ok) return { ...backupRead, classification: "storage-unavailable" };

    const primary = inspectEnvelope(primaryRead.value);
    const backup = inspectEnvelope(backupRead.value);
    const unsupported = [primary, backup].some((result) => result.code === "state-version-incompatible");
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
        classification: unsupported ? "unsupported-version" : issues.length ? "damaged-unrecoverable" : "truly-empty",
        readOnly: issues.length > 0,
      });
    }

    candidates.sort((left, right) => right.envelope.revision - left.envelope.revision);
    const chosen = candidates[0];
    return success(chosen.envelope, {
      source: chosen.source,
      recovered: chosen.source === "backup" || !primary.ok,
      issues: primary.ok ? [] : [primary],
      classification: unsupported ? "unsupported-version" : chosen.source === "backup" ? "valid-backup" : "healthy-primary",
      readOnly: unsupported,
    });
  };

  const save = (proposed) => {
    const primaryRead = safeRead(storage, keys.state);
    if (!primaryRead.ok) return primaryRead;
    const currentPrimary = inspectEnvelope(primaryRead.value);
    const loaded = load();
    if (!loaded.ok) return loaded;
    if (loaded.readOnly) return failure("storage-recovery-required", "Saved data needs recovery before it can be changed.", {
      recovery: "Export the preserved data or choose a recovery source. The original records have not been overwritten.",
      retryable: false,
      classification: loaded.classification,
    });
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
      if (currentPrimary.ok && currentPrimary.value.revision >= loaded.value.revision) {
        storage.setItem(keys.backup, primaryRead.value);
      }
      // Storage.setItem is the atomic commit point. A later read failure must
      // not turn a committed award into a failure or overwrite a newer writer.
      storage.setItem(keys.state, serialized);
      return success(inspectEnvelope(next).value, { revision: next.revision });
    } catch (error) {
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

  const retention = () => {
    const envelopes = [];
    const issues = [];
    for (const key of [keys.state, keys.backup]) {
      const raw = safeRead(storage, key);
      if (!raw.ok) { issues.push(raw); continue; }
      const inspected = inspectEnvelope(raw.value);
      if (inspected.ok) envelopes.push(inspected.value);
      else if (inspected.code !== "state-missing") issues.push(inspected);
    }
    return success({
      certain: issues.length === 0,
      artworkKeys: [...new Set(envelopes.flatMap((value) => value.scenes.map((scene) => scene.artworkKey)).filter(Boolean))],
      portraitKeys: [...new Set(envelopes.flatMap((value) => value.heroes.map((hero) => hero.portraitKey)).filter(Boolean))],
    }, { issues });
  };

  const evidence = () => {
    const primary = safeRead(storage, keys.state);
    const backup = safeRead(storage, keys.backup);
    return primary.ok && backup.ok ? success({ primary: primary.value, backup: backup.value }) : !primary.ok ? primary : backup;
  };

  return { load, save, retention, evidence };
}
