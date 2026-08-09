import { failure, fromThrown, success } from "../application/result.js";
import { STORAGE_KEYS } from "./constants.js";

const emptySession = () => ({ activeSceneId: null });

export function createSessionRepository(storage, { key = STORAGE_KEYS.session } = {}) {
  if (!storage) throw new TypeError("SessionRepository requires a Storage-compatible object.");

  const load = () => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return success(emptySession(), { source: "empty" });
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failure("session-invalid", "Nightforge session context is invalid.", {
          recovery: "Return to Library and choose a Scene.",
          retryable: false,
        });
      }
      return success({
        activeSceneId:
          typeof parsed.activeSceneId === "string" && parsed.activeSceneId.trim()
            ? parsed.activeSceneId
            : null,
      });
    } catch (error) {
      return fromThrown(
        "session-read-failed",
        "Nightforge could not restore the previous Scene context.",
        error,
        "Return to Library and choose a Scene.",
      );
    }
  };

  const save = (session = emptySession()) => {
    const value = {
      activeSceneId:
        typeof session.activeSceneId === "string" && session.activeSceneId.trim()
          ? session.activeSceneId
          : null,
    };
    try {
      storage.setItem(key, JSON.stringify(value));
      return success(value);
    } catch (error) {
      return fromThrown(
        "session-write-failed",
        "Nightforge could not remember the active Scene.",
        error,
        "You can continue, but may need to select the Scene again after reload.",
      );
    }
  };

  const clear = () => save(emptySession());

  return { load, save, clear };
}

