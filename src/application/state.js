export const ROUTES = Object.freeze(["home", "characters", "settings", "board"]);

export function createInitialApplicationState() {
  return {
    route: { page: "home" },
    scenes: [],
    heroes: [],
    activeSceneId: null,
    lifecycle: "booting",
    persistence: {
      status: "idle",
      revision: 0,
      error: null,
      recovered: false,
    },
  };
}

export function applicationReducer(state, action) {
  switch (action.type) {
    case "hydrate-success":
      return {
        ...state,
        route: { page: "home" },
        scenes: action.scenes,
        heroes: action.heroes,
        activeSceneId: action.activeSceneId,
        lifecycle: "ready",
        persistence: {
          status: "saved",
          revision: action.revision,
          error: null,
          recovered: Boolean(action.recovered),
        },
      };
    case "hydrate-failure":
      return {
        ...state,
        route: { page: "home" },
        lifecycle: "error",
        persistence: { ...state.persistence, status: "error", error: action.error },
      };
    case "navigate":
      return ROUTES.includes(action.route?.page)
        ? { ...state, route: action.route }
        : state;
    case "set-active-scene":
      return { ...state, activeSceneId: action.sceneId };
    case "replace-scenes":
      return { ...state, scenes: action.scenes };
    case "replace-heroes":
      return { ...state, heroes: action.heroes };
    case "persistence-saving":
      return {
        ...state,
        persistence: { ...state.persistence, status: "saving", error: null },
      };
    case "persistence-saved":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          status: "saved",
          revision: action.revision,
          error: null,
        },
      };
    case "persistence-failed":
      return {
        ...state,
        persistence: { ...state.persistence, status: "error", error: action.error },
      };
    default:
      return state;
  }
}

