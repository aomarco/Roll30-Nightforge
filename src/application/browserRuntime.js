import { createApplicationCommands } from "./commands.js";
import { createBrowserArtworkDecoder, HERO_PORTRAIT_LIMITS } from "./artwork.js";
import { createArtworkRepository, createIndexedDbArtworkAdapter } from "../storage/artworkRepository.js";
import { createHeroRepository, createSceneRepository } from "../storage/entityRepositories.js";
import { createSessionRepository } from "../storage/sessionRepository.js";
import { createStateRepository } from "../storage/stateRepository.js";
import { PORTRAIT_DATABASE, PORTRAIT_STORE } from "../storage/constants.js";

const unavailableStorage = (error) => ({
  getItem() { throw error; },
  setItem() { throw error; },
  removeItem() { throw error; },
});

const browserStorage = (browser, name) => {
  try {
    return browser[name];
  } catch (error) {
    return unavailableStorage(error);
  }
};

export function createBrowserRuntime(browser, dispatch) {
  if (!browser || !dispatch) {
    throw new TypeError("Nightforge browser runtime requires a window and dispatch.");
  }
  const stateRepository = createStateRepository(browserStorage(browser, "localStorage"));
  const sceneRepository = createSceneRepository(stateRepository);
  const heroRepository = createHeroRepository(stateRepository);
  const sessionRepository = createSessionRepository(browserStorage(browser, "sessionStorage"));
  const artworkRepository = createArtworkRepository(
    createIndexedDbArtworkAdapter(browser.indexedDB),
  );
  const portraitRepository = createArtworkRepository(
    createIndexedDbArtworkAdapter(browser.indexedDB, {
      databaseName: PORTRAIT_DATABASE,
      storeName: PORTRAIT_STORE,
    }),
  );
  const commands = createApplicationCommands({
    artworkDecoder: createBrowserArtworkDecoder(browser),
    artworkRepository,
    portraitDecoder: createBrowserArtworkDecoder(browser, HERO_PORTRAIT_LIMITS),
    portraitRepository,
    sceneRepository,
    heroRepository,
    sessionRepository,
    dispatch,
  });

  return {
    artworkRepository,
    portraitRepository,
    commands,
    heroRepository,
    sceneRepository,
    sessionRepository,
    stateRepository,
  };
}
