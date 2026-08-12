import { createApplicationCommands } from "./commands.js";
import { createBrowserArtworkDecoder } from "./artwork.js";
import { createArtworkRepository, createIndexedDbArtworkAdapter } from "../storage/artworkRepository.js";
import { createHeroRepository, createSceneRepository } from "../storage/entityRepositories.js";
import { createSessionRepository } from "../storage/sessionRepository.js";
import { createStateRepository } from "../storage/stateRepository.js";

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
  const commands = createApplicationCommands({
    artworkDecoder: createBrowserArtworkDecoder(browser),
    artworkRepository,
    sceneRepository,
    heroRepository,
    sessionRepository,
    dispatch,
  });

  return {
    artworkRepository,
    commands,
    heroRepository,
    sceneRepository,
    sessionRepository,
    stateRepository,
  };
}
