import { failure, success } from "./result.js";
import { ROUTES } from "./state.js";
import {
  classById,
  grantedLanguages,
  raceById,
  subraceById,
} from "../domain/heroes.js";
import { dailyItemReset, longRest, shortRest } from "../domain/rest.js";
import { performAbilityCheck, performSavingThrow } from "../domain/checks.js";

export function createApplicationCommands({
  sceneRepository,
  heroRepository,
  rollLogRepository = null,
  sessionRepository,
  artworkRepository = null,
  artworkDecoder = null,
  artworkKeyFactory = () => `artwork-${crypto.randomUUID()}`,
  portraitRepository = null,
  portraitDecoder = null,
  portraitKeyFactory = () => `portrait-${crypto.randomUUID()}`,
  random = Math.random,
  commandBus = null,
  dispatch,
}) {
  if (!sceneRepository || !heroRepository || !sessionRepository || !dispatch) {
    throw new TypeError("Application commands require repositories and dispatch.");
  }

  const cleanupArtworkKey = async (artworkKey) => {
    if (!artworkRepository || !artworkKey) return success(artworkKey);
    const retention = (await sceneRepository.retention?.());
    if (!retention?.ok || !retention.value.certain || retention.value.artworkKeys.includes(artworkKey)) {
      return success(artworkKey, { deferred: true });
    }
    const removed = await artworkRepository.remove(artworkKey);
    if (!removed.ok) {
      (await sceneRepository.scheduleArtworkDelete?.(artworkKey));
      return removed;
    }
    const acknowledged = (await sceneRepository.acknowledgeArtworkDelete(artworkKey));
    if (!acknowledged.ok) return acknowledged;
    dispatch({ type: "persistence-saved", revision: acknowledged.revision || 0 });
    return success(artworkKey, {
      envelope: acknowledged.envelope,
      revision: acknowledged.revision,
    });
  };

  const cleanupPortraitKey = async (key) => {
    const retained = (await heroRepository.retention?.());
    if (!retained?.ok || !retained.value.certain || retained.value.portraitKeys.includes(key)) return success(key, { deferred: true });
    return portraitRepository.remove(key);
  };

  const cleanupPendingArtwork = async () => {
    if (!artworkRepository || !sceneRepository.pendingArtworkDeletes) {
      return success([], { issues: [] });
    }
    const pending = (await sceneRepository.pendingArtworkDeletes());
    if (!pending.ok) return pending;
    // Legacy blobs have no durable staging ownership. An unreferenced key may
    // be an upload in another tab, so only explicitly scheduled keys are safe
    // candidates. The vault performs journal-aware orphan collection later.
    const targets = [...new Set(pending.value)];
    const cleaned = [];
    const issues = [];
    for (const artworkKey of targets) {
      const result = await cleanupArtworkKey(artworkKey);
      if (result.ok && !result.deferred) cleaned.push(artworkKey);
      else if (result.ok) continue;
      else issues.push(result);
    }
    return success(cleaned, { issues });
  };

  const initialize = async () => {
    const scenes = (await sceneRepository.list());
    const heroes = (await heroRepository.list());
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
      rollLog: scenes.envelope?.rollLog || [],
      activeSceneId,
      revision: scenes.envelope?.revision || 0,
      recovered: Boolean(scenes.recovered || heroes.recovered),
      recoverySource: scenes.recovered ? scenes.source : heroes.recovered ? heroes.source : null,
      classification: scenes.classification,
      readOnly: scenes.readOnly,
    });
    return success(
      { scenes: scenes.value, heroes: heroes.value, activeSceneId },
      { cleanup: (await cleanupPendingArtwork()) },
    );
  };

  const synchronize = async () => {
    const scenes = (await sceneRepository.list());
    const heroes = (await heroRepository.list());
    const failed = [scenes, heroes].find((result) => !result.ok);
    if (failed) {
      dispatch({ type: "persistence-failed", error: failed });
      return failed;
    }
    dispatch({
      type: "external-state-synchronized",
      scenes: scenes.value,
      heroes: heroes.value,
      rollLog: scenes.envelope?.rollLog || [],
      activeSceneId: scenes.envelope?.lastActiveSceneId || null,
      revision: scenes.envelope?.revision || 0,
      readOnly: scenes.readOnly,
      classification: scenes.classification,
    });
    return success({ scenes: scenes.value, heroes: heroes.value }, {
      revision: scenes.envelope?.revision || 0,
    });
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

  const selectScene = async (sceneId) => {
    const scene = (await sceneRepository.setActive(sceneId));
    if (!scene.ok) return scene;
    const session = sessionRepository.save({ activeSceneId: sceneId });
    dispatch({ type: "persistence-saved", revision: scene.revision || 0 });
    dispatch({ type: "set-active-scene", sceneId });
    return success(scene.value, {
      revision: scene.revision,
      issues: session.ok ? [] : [session],
    });
  };

  const refreshScenes = async () => {
    const scenes = (await sceneRepository.list());
    if (scenes.ok) dispatch({ type: "replace-scenes", scenes: scenes.value });
    return scenes;
  };

  const refreshHeroes = async () => {
    const heroes = (await heroRepository.list());
    if (heroes.ok) dispatch({ type: "replace-heroes", heroes: heroes.value });
    return heroes;
  };

  const applySceneSave = (result) => {
    dispatch({ type: "replace-scenes", scenes: result.envelope.scenes });
    dispatch({ type: "set-active-scene", sceneId: result.envelope.lastActiveSceneId });
    dispatch({ type: "persistence-saved", revision: result.revision || 0 });
  };

  const persistScene = async (operation) => {
    dispatch({ type: "persistence-saving" });
    const result = (await operation());
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

  const enterScene = async (operation, route) => {
    dispatch({ type: "persistence-saving" });
    const result = (await operation());
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

  const persist = async (operation, refresh) => {
    dispatch({ type: "persistence-saving" });
    const result = (await operation());
    if (!result.ok) {
      dispatch({ type: "persistence-failed", error: result });
      return result;
    }
    (await refresh());
    dispatch({ type: "persistence-saved", revision: result.revision || 0 });
    return result;
  };

  // State, recipient totals, and the replay outcome share one durable save.
  const awardExperience = async (sceneId, award, expectedRevision) => {
    dispatch({ type: "persistence-saving" });
    const result = (await sceneRepository.awardEncounterExperience(sceneId, {
      expectedRevision, encounterInstanceId: award?.encounterInstanceId,
    }));
    if (!result.ok) {
      dispatch({ type: "persistence-failed", error: result });
      return result;
    }
    dispatch({ type: "replace-heroes", heroes: result.envelope.heroes });
    applySceneSave(result);
    return result;
  };

  const rollCheck = async (sceneId, specification = {}, { expectedRevision, random: rollRandom = random } = {}) => {
    if (!rollLogRepository) {
      const unavailable = failure("roll-log-unavailable", "Exploration rolls are unavailable in this runtime.", {
        recovery: "Refresh the application and retry the check.",
        retryable: true,
      });
      dispatch({ type: "persistence-failed", error: unavailable });
      return unavailable;
    }
    dispatch({ type: "persistence-saving" });
    const rosterHero = specification.heroId
      ? await heroRepository.get(specification.heroId)
      : success(null);
    if (!rosterHero.ok) {
      dispatch({ type: "persistence-failed", error: rosterHero });
      return rosterHero;
    }
    const sourceScene = rosterHero.value
      ? null
      : (await sceneRepository.get(sceneId));
    if (!rosterHero.value && !sourceScene.ok) {
      dispatch({ type: "persistence-failed", error: sourceScene });
      return sourceScene;
    }
    const scene = sourceScene?.value || null;
    const target = { ...specification, hero: rosterHero.value || undefined };
    const rolled = specification.kind === "save"
      ? performSavingThrow(scene, target, { random: rollRandom })
      : performAbilityCheck(scene, target, { random: rollRandom });
    if (!rolled.ok) {
      dispatch({ type: "persistence-failed", error: rolled });
      return rolled;
    }
    const baseEntry = rolled.value.rollLogEntry;
    const entry = {
      ...baseEntry,
      id: specification.logId || `roll-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      sceneId: scene?.id || null,
      heroId: rosterHero.value?.id || null,
      visibility: specification.visibility === "private" ? "private" : "public",
    };
    const saved = await rollLogRepository.append(entry, { expectedRevision });
    if (!saved.ok) {
      dispatch({ type: "persistence-failed", error: saved });
      return saved;
    }
    dispatch({ type: "replace-scenes", scenes: saved.envelope.scenes });
    dispatch({ type: "replace-heroes", heroes: saved.envelope.heroes });
    dispatch({ type: "replace-roll-log", rollLog: saved.envelope.rollLog || [] });
    dispatch({ type: "persistence-saved", revision: saved.revision || 0 });
    return success({ ...rolled.value, rollLogEntry: entry }, {
      outcome: rolled.outcome,
      revision: saved.revision,
      envelope: saved.envelope,
    });
  };

  const updateHero = async (id, patch = {}, expectedRevision) => {
    const current = (await heroRepository.get(id));
    if (!current.ok) return (await persist(() => current, refreshHeroes));
    let normalizedPatch = { ...patch };

    if (patch.classId && classById(patch.classId).id !== current.value.classId) {
      const selectedClass = classById(patch.classId);
      normalizedPatch = {
        ...normalizedPatch,
        classId: selectedClass.id,
        saveProficiencies: [...selectedClass.saveProficiencies],
        skillProficiencies: [],
      };
    }

    if (patch.raceId || Object.hasOwn(patch, "subraceId")) {
      const nextRace = raceById(patch.raceId || current.value.raceId);
      const nextSubrace = subraceById(nextRace.id, patch.subraceId);
      const oldGranted = grantedLanguages(current.value.raceId, current.value.subraceId);
      const chosenLanguages = (patch.languages || current.value.languages).filter(
        (language) => !oldGranted.includes(language),
      );
      normalizedPatch = {
        ...normalizedPatch,
        raceId: nextRace.id,
        subraceId: nextSubrace?.id || null,
        languages: [
          ...new Set([
            ...grantedLanguages(nextRace.id, nextSubrace?.id),
            ...chosenLanguages,
          ]),
        ],
      };
    }

    return (await persist(async () => (await heroRepository.update(id, normalizedPatch, { expectedRevision })), refreshHeroes));
  };

  const restHero = async (id, kind = "long", options = {}) => {
    const current = (await heroRepository.get(id));
    if (!current.ok) return (await persist(() => current, refreshHeroes));
    const rested = kind === "daily" ? dailyItemReset(current.value, { ...options, random: options.random || random }) : kind === "short"
      ? shortRest(current.value, { ...options, random: options.random || Math.random })
      : longRest(current.value);
    if (!rested.ok) return rested;
    if (rested.replayed) return success(current.value, { outcome: rested.outcome, replayed: true, revision: current.envelope.revision });
    const saved = (await persist(async () => (await heroRepository.update(id, rested.value)), refreshHeroes));
    return saved.ok ? { ...saved, outcome: rested.outcome } : saved;
  };

  return {
    previewCommand: async (command) => commandBus
      ? commandBus.preview(command)
      : failure("command-bus-unavailable", "This Nightforge action boundary is not available in the current runtime.", { recovery: "Refresh the application and retry.", retryable: true }),
    executeCommand: async (command) => commandBus
      ? commandBus.execute(command)
      : failure("command-bus-unavailable", "This Nightforge action boundary is not available in the current runtime.", { recovery: "Refresh the application and retry.", retryable: true }),
    initialize,
    synchronize,
    navigate,
    selectScene,
    forgeScene: async (input, route = { page: "board", mode: "setup" }) =>
      (await enterScene(async () => (await sceneRepository.createActive(input)), route)),
    openScene: async (id, route = { page: "board", mode: "setup" }) =>
      (await enterScene(async () => (await sceneRepository.open(id)), route)),
    createScene: async (input) => (await persist(async () => (await sceneRepository.create(input)), refreshScenes)),
    updateScene: async (id, patch, expectedRevision) =>
      (await persistScene(async () => (await sceneRepository.update(id, patch, { expectedRevision })))),
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
        if (!stagedCleanup.ok) (await sceneRepository.scheduleArtworkDelete?.(artworkKey));
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

      const saved = (await sceneRepository.updateArtwork(id, artworkKey, false));
      if (!saved.ok) {
        const stagedCleanup = await artworkRepository.remove(artworkKey);
        if (!stagedCleanup.ok) (await sceneRepository.scheduleArtworkDelete?.(artworkKey));
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
      const saved = (await sceneRepository.updateArtwork(id, null, true));
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
    removeScene: async (id) => {
      dispatch({ type: "persistence-saving" });
      const result = (await sceneRepository.remove(id));
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
    createHero: async (input) => (await persist(async () => (await heroRepository.create(input)), refreshHeroes)),
    updateHero,
    restHero,
    awardExperience,
    rollCheck,
    removeHero: async (id) => {
      const existing = (await heroRepository.get(id));
      const portraitKey = existing.ok ? existing.value.portraitKey : null;
      const removed = (await persist(async () => (await heroRepository.remove(id)), refreshHeroes));
      if (removed.ok && portraitKey && portraitRepository) {
        const cleanup = await cleanupPortraitKey(portraitKey);
        if (!cleanup.ok) dispatch({ type: "persistence-failed", error: cleanup });
        return success(removed.value, {
          envelope: removed.envelope,
          revision: removed.revision,
          cleanup,
        });
      }
      return removed;
    },
    replaceHeroPortrait: async (id, blob) => {
      if (!portraitRepository || !portraitDecoder) {
        const unavailable = failure(
          "portrait-unavailable",
          "Hero portraits are unavailable in this browser.",
          { recovery: "Use a current browser and retry.", retryable: true },
        );
        dispatch({ type: "persistence-failed", error: unavailable });
        return unavailable;
      }

      const current = (await heroRepository.get(id));
      if (!current.ok) {
        dispatch({ type: "persistence-failed", error: current });
        return current;
      }

      dispatch({ type: "persistence-saving" });
      const decoded = await portraitDecoder(blob);
      if (!decoded.ok) {
        dispatch({ type: "persistence-failed", error: decoded });
        return decoded;
      }

      const portraitKey = portraitKeyFactory();
      const written = await portraitRepository.put(portraitKey, blob);
      if (!written.ok) {
        dispatch({ type: "persistence-failed", error: written });
        return written;
      }

      const verified = await portraitRepository.get(portraitKey);
      if (!verified.ok || !verified.value) {
        await portraitRepository.remove(portraitKey);
        const failed = verified.ok
          ? failure("portrait-verification-failed", "Nightforge could not verify the staged portrait.", {
              recovery: "The previous portrait remains active. Retry the upload.",
              retryable: true,
            })
          : verified;
        dispatch({ type: "persistence-failed", error: failed });
        return failed;
      }

      const previousPortraitKey = current.value.portraitKey;
      const saved = (await heroRepository.update(id, { portraitKey }));
      if (!saved.ok) {
        await portraitRepository.remove(portraitKey);
        dispatch({ type: "persistence-failed", error: saved });
        return saved;
      }

      (await refreshHeroes());
      dispatch({ type: "persistence-saved", revision: saved.revision || 0 });
      const cleanup = previousPortraitKey
        ? await cleanupPortraitKey(previousPortraitKey)
        : success(null);
      return success(saved.value, {
        revision: saved.revision,
        issues: cleanup.ok ? [] : [cleanup],
      });
    },
    removeHeroPortrait: async (id) => {
      const current = (await heroRepository.get(id));
      if (!current.ok) {
        dispatch({ type: "persistence-failed", error: current });
        return current;
      }
      const previousPortraitKey = current.value.portraitKey;
      dispatch({ type: "persistence-saving" });
      const saved = (await heroRepository.update(id, { portraitKey: null }));
      if (!saved.ok) {
        dispatch({ type: "persistence-failed", error: saved });
        return saved;
      }
      (await refreshHeroes());
      dispatch({ type: "persistence-saved", revision: saved.revision || 0 });
      const cleanup = previousPortraitKey && portraitRepository
        ? await cleanupPortraitKey(previousPortraitKey)
        : success(null);
      return success(saved.value, {
        revision: saved.revision,
        issues: cleanup.ok ? [] : [cleanup],
      });
    },
  };
}
