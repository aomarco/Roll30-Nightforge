import { createApplicationCommands } from "./commands.js";
import { createBrowserArtworkDecoder, HERO_PORTRAIT_LIMITS } from "./artwork.js";
import { createArtworkRepository, createIndexedDbArtworkAdapter } from "../storage/artworkRepository.js";
import { createHeroRepository, createRollLogRepository, createSceneRepository } from "../storage/entityRepositories.js";
import { createSessionRepository } from "../storage/sessionRepository.js";
import { createStateRepository } from "../storage/stateRepository.js";
import { PORTRAIT_STORE, storageIdentity } from "../storage/constants.js";
import { createVaultRepository } from "../storage/vault/repository.js";
import { createBackupService } from "./backups.js";
import { fromThrown } from "./result.js";
import { createCommandBus } from "./commandBus.js";

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

export function createBrowserRuntime(browser, dispatch, { environment =
  !import.meta.env || import.meta.env.DEV ? "development"
    : import.meta.env.BASE_URL === "/Roll30/" ? "production" : "preview",
} = {}) {
  if (!browser || !dispatch) {
    throw new TypeError("Nightforge browser runtime requires a window and dispatch.");
  }
  const identity = storageIdentity(environment);
  const legacyRepository = createStateRepository(browserStorage(browser, "localStorage"), { keys: identity.keys });
  let backend = legacyRepository;
  let queue = Promise.resolve();
  const withWriter = (operation) => {
    const execute = () => browser.navigator?.locks?.request
      ? browser.navigator.locks.request(identity.lock, operation) : operation();
    const pending = queue.then(execute, execute);
    queue = pending.catch(() => undefined);
    return pending;
  };
  const listeners = new Set();
  const channel = typeof browser.BroadcastChannel === "function" ? new browser.BroadcastChannel(identity.channel) : null;
  const vault = createVaultRepository(browser.indexedDB, {
    name: identity.vaultDatabase,
    onChange: () => channel?.postMessage({ type: "changed" }),
    onVersionChange: () => listeners.forEach((listener) => listener()),
  });
  const ready = withWriter(async () => {
    const loaded = await vault.load();
    if (!loaded.ok) { backend = vault; return loaded; }
    if (!loaded.absent) { backend = vault; return loaded; }
    const legacy = legacyRepository.load();
    if (legacy.ok && legacy.classification === "truly-empty") {
      backend = vault; return vault.initializeEmpty();
    }
    return legacy;
  });
  const stateRepository = Object.fromEntries(["load", "save", "retention", "evidence"].map((method) => [method, async (...args) => {
    await ready;
    return backend[method](...args);
  }]));
  const sceneRepository = createSceneRepository(stateRepository);
  const heroRepository = createHeroRepository(stateRepository);
  const rollLogRepository = createRollLogRepository(stateRepository);
  const sessionRepository = createSessionRepository(browserStorage(browser, "sessionStorage"), { key: identity.keys.session });
  const legacyArtworkRepository = createArtworkRepository(
    createIndexedDbArtworkAdapter(browser.indexedDB, { databaseName: identity.artworkDatabase }),
  );
  const legacyPortraitRepository = createArtworkRepository(
    createIndexedDbArtworkAdapter(browser.indexedDB, {
      databaseName: identity.portraitDatabase,
      storeName: PORTRAIT_STORE,
    }),
    { item: "a Hero portrait", collection: "Hero portraits", codePrefix: "portrait" },
  );
  const vaultArtwork = createArtworkRepository(vault.artworkAdapter("artwork"));
  const vaultPortrait = createArtworkRepository(vault.artworkAdapter("portrait"), { item: "a Hero portrait", collection: "Hero portraits", codePrefix: "portrait" });
  const imageFacade = (legacy, current) => Object.fromEntries(["get", "put", "remove", "keys"].map((method) => [method, async (...args) => {
    await ready; return (backend === vault ? current : legacy)[method](...args);
  }]));
  const artworkRepository = imageFacade(legacyArtworkRepository, vaultArtwork);
  const portraitRepository = imageFacade(legacyPortraitRepository, vaultPortrait);
  const commandBus = createCommandBus({ stateRepository, random: Math.random });
  const applicationCommands = createApplicationCommands({
    artworkDecoder: createBrowserArtworkDecoder(browser),
    artworkRepository,
    portraitDecoder: createBrowserArtworkDecoder(browser, HERO_PORTRAIT_LIMITS),
    portraitRepository,
    sceneRepository,
    heroRepository,
    rollLogRepository,
    sessionRepository,
    commandBus,
    dispatch,
  });
  const commands = Object.fromEntries(Object.entries(applicationCommands).map(([name, operation]) => [name, (...args) => withWriter(async () => {
    try { return await operation(...args); }
    catch (error) {
      const result = fromThrown("command-failed", "Nightforge could not complete this action.", error, "Your last committed state is preserved. Retry or open recovery.");
      dispatch({ type: "persistence-failed", error: result }); return result;
    }
  })]));
  const adoptVault = async () => { backend = vault; await applicationCommands.synchronize(); channel?.postMessage({ type: "changed" }); };
  const backups = createBackupService({
    stateRepository, legacyRepository, artworkRepository, portraitRepository,
    legacyArtworkRepository, legacyPortraitRepository, vault, adoptVault, withWriter,
    imageDecoder: (blob, kind) => createBrowserArtworkDecoder(browser, kind === "portrait" ? HERO_PORTRAIT_LIMITS : undefined)(blob),
  });
  if (channel) channel.onmessage = async () => {
    const loaded = await vault.load();
    if (loaded.ok && !loaded.absent) backend = vault;
    listeners.forEach((listener) => listener());
  };

  return {
    identity,
    ready,
    backups,
    vault,
    commandBus,
    legacyRepository,
    withWriter,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    artworkRepository,
    portraitRepository,
    commands,
    heroRepository,
    rollLogRepository,
    sceneRepository,
    sessionRepository,
    stateRepository,
  };
}
