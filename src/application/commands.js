import { failure, success } from "./result.js";
import { ROUTES } from "./state.js";

export function createApplicationCommands({
  sceneRepository,
  heroRepository,
  sessionRepository,
  dispatch,
}) {
  if (!sceneRepository || !heroRepository || !sessionRepository || !dispatch) {
    throw new TypeError("Application commands require repositories and dispatch.");
  }

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
    return success({ scenes: scenes.value, heroes: heroes.value, activeSceneId });
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
    updateScene: (id, patch) =>
      persist(() => sceneRepository.update(id, patch), refreshScenes),
    removeScene: (id) => {
      dispatch({ type: "persistence-saving" });
      const result = sceneRepository.remove(id);
      if (!result.ok) {
        dispatch({ type: "persistence-failed", error: result });
        return result;
      }
      applySceneSave(result);
      const issues = rememberScene(result.envelope.lastActiveSceneId);
      return success(result.value, {
        envelope: result.envelope,
        revision: result.revision,
        issues,
      });
    },
    createHero: (input) => persist(() => heroRepository.create(input), refreshHeroes),
    updateHero: (id, patch) =>
      persist(() => heroRepository.update(id, patch), refreshHeroes),
    removeHero: (id) => persist(() => heroRepository.remove(id), refreshHeroes),
  };
}
