import { failure, success } from "./result.js";
import { ROUTES } from "./state.js";

export function createApplicationCommands({
  sceneRepository,
  heroRepository,
  sessionRepository,
  artworkRepository = null,
  artworkDecoder = null,
  artworkKeyFactory = () => `artwork-${crypto.randomUUID()}`,
  dispatch,
}) {
  if (!sceneRepository || !heroRepository || !sessionRepository || !dispatch) {
    throw new TypeError("Application commands require repositories and dispatch.");
  }

  const cleanupArtworkKey = async (artworkKey) => {
    if (!artworkRepository || !artworkKey) return success(artworkKey);
    const removed = await artworkRepository.remove(artworkKey);
    if (!removed.ok) {
      sceneRepository.scheduleArtworkDelete?.(artworkKey);
      return removed;
    }
    const acknowledged = sceneRepository.acknowledgeArtworkDelete(artworkKey);
    if (!acknowledged.ok) return acknowledged;
    dispatch({ type: "persistence-saved", revision: acknowledged.revision || 0 });
    return success(artworkKey, {
      envelope: acknowledged.envelope,
      revision: acknowledged.revision,
    });
  };

  const cleanupPendingArtwork = async () => {
    if (!artworkRepository || !sceneRepository.pendingArtworkDeletes) {
      return success([], { issues: [] });
    }
    const pending = sceneRepository.pendingArtworkDeletes();
    if (!pending.ok) return pending;
    const stored = await artworkRepository.keys();
    const referenced = new Set(
      pending.envelope.scenes.map((scene) => scene.artworkKey).filter(Boolean),
    );
    const orphaned = stored.ok
      ? stored.value.filter((artworkKey) => !referenced.has(artworkKey))
      : [];
    const targets = [...new Set([...pending.value, ...orphaned])];
    const cleaned = [];
    const issues = stored.ok ? [] : [stored];
    for (const artworkKey of targets) {
      const result = await cleanupArtworkKey(artworkKey);
      if (result.ok) cleaned.push(artworkKey);
      else issues.push(result);
    }
    return success(cleaned, { issues });
  };

  const initialize = () => {
    const scenes = sceneRepository.list();
    const heroes = heroRepository.list();
    const session = sessionRepository.load();
    const failed = [scenes, heroes].find((result) => !result.ok);
    if (failed) {
      dispatch({ type: "hydrate-failure", error: failed });
      return failed;
    }
    const sceneIds = new Set(scenes.value.map((scene) => scene.id));
    const activeSceneId =
      session.ok && sceneIds.has(session.value.activeSceneId)
        ? session.value.activeSceneId
        : scenes.envelope?.lastActiveSceneId && sceneIds.has(scenes.envelope.lastActiveSceneId)
          ? scenes.envelope.lastActiveSceneId
          : null;
    dispatch({
      type: "hydrate-success",
      scenes: scenes.value,
      heroes: heroes.value,
      activeSceneId,
      revision: scenes.envelope?.revision || 0,
      recovered: Boolean(scenes.recovered || heroes.recovered),
    });
    return success(
      { scenes: scenes.value, heroes: heroes.value, activeSceneId },
      { cleanup: cleanupPendingArtwork() },
    );
  };

  const navigate = (route, activeSceneId = null) => {
    if (!ROUTES.includes(route?.page)) {
      return failure("route-invalid", "Nightforge cannot navigate to that destination.", {
        recovery: "Return to Library.",
        retryable: false,
      });
    }
    if (["settings", "board"].includes(route.page) && !activeSceneId) {
      return failure("route-scene-required", "Choose a Scene before opening this destination.", {
        recovery: "Open or Forge a Scene from Library.",
        retryable: false,
      });
    }
    dispatch({ type: "navigate", route });
    return success(route);
  };

  const selectScene = (sceneId) => {
    const scene = sceneRepository.setActive(sceneId);
    if (!scene.ok) return scene;
    const session = sessionRepository.save({ activeSceneId: sceneId });
    dispatch({ type: "set-active-scene", sceneId });
    return success(scene.value, {
      revision: scene.revision,
      issues: session.ok ? [] : [session],
    });
  };

  const refreshScenes = () => {
    const scenes = sceneRepository.list();
    if (scenes.ok) dispatch({ type: "replace-scenes", scenes: scenes.value });
    return scenes;
  };

  const refreshHeroes = () => {
    const heroes = heroRepository.list();
    if (heroes.ok) dispatch({ type: "replace-heroes", heroes: heroes.value });
    return heroes;
  };

  const applySceneSave = (result) => {
    dispatch({ type: "replace-scenes", scenes: result.envelope.scenes });
    dispatch({ type: "set-active-scene", sceneId: result.envelope.lastActiveSceneId });
    dispatch({ type: "persistence-saved", revision: result.revision || 0 });
  };

  const persistScene = (operation) => {
    dispatch({ type: "persistence-saving" });
    const result = operation();
    if (!result.ok) {
      dispatch({ type: "persistence-failed", error: result });
      return result;
    }
    applySceneSave(result);
    return result;
  };

  const rememberScene = (sceneId) => {
    const remembered = sceneId
      ? sessionRepository.save({ activeSceneId: sceneId })
      : sessionRepository.clear();
    return remembered.ok ? [] : [remembered];
  };

  const enterScene = (operation, route) => {
    dispatch({ type: "persistence-saving" });
    const result = operation();
    if (!result.ok) {
      dispatch({ type: "persistence-failed", error: result });
      return result;
    }
    applySceneSave(result);
    const issues = rememberScene(result.value.id);
    dispatch({ type: "navigate", route });
    return success(result.value, {
      envelope: result.envelope,
      revision: result.revision,
      issues,
    });
  };

  const persist = (operation, refresh) => {
    dispatch({ type: "persistence-saving" });
    const result = operation();
    if (!result.ok) {
      dispatch({ type: "persistence-failed", error: result });
      return result;
    }
    refresh();
    dispatch({ type: "persistence-saved", revision: result.revision || 0 });
    return result;
  };

  return {
    initialize,
    navigate,
    selectScene,
    forgeScene: (input, route = { page: "board", mode: "setup" }) =>
      enterScene(() => sceneRepository.createActive(input), route),
    openScene: (id, route = { page: "board", mode: "setup" }) =>
      enterScene(() => sceneRepository.open(id), route),
    createScene: (input) => persist(() => sceneRepository.create(input), refreshScenes),
    updateScene: (id, patch) => persistScene(() => sceneRepository.update(id, patch)),
    replaceSceneArtwork: async (id, blob) => {
      if (!artworkRepository || !artworkDecoder) {
        const unavailable = failure(
          "artwork-unavailable",
          "Scene artwork is unavailable in this browser.",
          { recovery: "Use a current browser and retry.", retryable: true },
        );
        dispatch({ type: "persistence-failed", error: unavailable });
        return unavailable;
      }

      dispatch({ type: "persistence-saving" });
      const decoded = await artworkDecoder(blob);
      if (!decoded.ok) {
        dispatch({ type: "persistence-failed", error: decoded });
        return decoded;
      }

      const artworkKey = artworkKeyFactory();
      const written = await artworkRepository.put(artworkKey, blob);
      if (!written.ok) {
        dispatch({ type: "persistence-failed", error: written });
        return written;
      }

      const verified = await artworkRepository.get(artworkKey);
      if (!verified.ok || !verified.value) {
        const stagedCleanup = await artworkRepository.remove(artworkKey);
        if (!stagedCleanup.ok) sceneRepository.scheduleArtworkDelete?.(artworkKey);
        const failed = verified.ok
          ? failure("artwork-verification-failed", "Nightforge could not verify the staged Scene artwork.", {
              recovery: "The previous artwork remains active. Retry the upload.",
              retryable: true,
            })
          : verified;
        const result = { ...failed, issues: stagedCleanup.ok ? [] : [stagedCleanup] };
        dispatch({ type: "persistence-failed", error: result });
        return result;
      }

      const saved = sceneRepository.updateArtwork(id, artworkKey, false);
      if (!saved.ok) {
        const stagedCleanup = await artworkRepository.remove(artworkKey);
        if (!stagedCleanup.ok) sceneRepository.scheduleArtworkDelete?.(artworkKey);
        const result = { ...saved, issues: stagedCleanup.ok ? [] : [stagedCleanup] };
        dispatch({ type: "persistence-failed", error: result });
        return result;
      }

      applySceneSave(saved);
      const cleanup = saved.previousArtworkKey
        ? await cleanupArtworkKey(saved.previousArtworkKey)
        : success(null);
      return success(saved.value, {
        envelope: saved.envelope,
        revision: saved.revision,
        issues: cleanup.ok ? [] : [cleanup],
      });
    },
    useWhiteCanvas: async (id) => {
      dispatch({ type: "persistence-saving" });
      const saved = sceneRepository.updateArtwork(id, null, true);
      if (!saved.ok) {
        dispatch({ type: "persistence-failed", error: saved });
        return saved;
      }
      applySceneSave(saved);
      const cleanup = saved.previousArtworkKey
        ? await cleanupArtworkKey(saved.previousArtworkKey)
        : success(null);
      return success(saved.value, {
        envelope: saved.envelope,
        revision: saved.revision,
        issues: cleanup.ok ? [] : [cleanup],
      });
    },
    cleanupPendingArtwork,
    removeScene: (id) => {
      dispatch({ type: "persistence-saving" });
      const result = sceneRepository.remove(id);
      if (!result.ok) {
        dispatch({ type: "persistence-failed", error: result });
        return result;
      }
      applySceneSave(result);
      const issues = rememberScene(result.envelope.lastActiveSceneId);
      const cleanup = result.value.artworkKey
        ? cleanupArtworkKey(result.value.artworkKey)
        : Promise.resolve(success(null));
      cleanup.then((cleaned) => {
        if (!cleaned.ok) dispatch({ type: "persistence-failed", error: cleaned });
      });
      return success(result.value, {
        envelope: result.envelope,
        revision: result.revision,
        issues,
        cleanup,
      });
    },
    createHero: (input) => persist(() => heroRepository.create(input), refreshHeroes),
    updateHero: (id, patch) =>
      persist(() => heroRepository.update(id, patch), refreshHeroes),
    removeHero: (id) => persist(() => heroRepository.remove(id), refreshHeroes),
  };
}
