import { failure, success } from "../application/result.js";
import {
  createHeroRecord,
  createSceneRecord,
  normalizeHeroRecord,
  normalizeSceneRecord,
} from "../domain/records.js";

const defaultIdFactory = () => crypto.randomUUID();

function createCollectionRepository({
  stateRepository,
  collection,
  singular,
  createRecord,
  normalizeRecord,
  idFactory = defaultIdFactory,
  clock = () => new Date().toISOString(),
}) {
  if (!stateRepository) throw new TypeError(`${collection} repository requires StateRepository.`);

  const loadCollection = () => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    return success(loaded.value[collection], {
      envelope: loaded.value,
      recovered: loaded.recovered,
      source: loaded.source,
      issues: loaded.issues,
    });
  };

  const list = () => loadCollection();

  const get = (id) => {
    const loaded = loadCollection();
    if (!loaded.ok) return loaded;
    const record = loaded.value.find((item) => item.id === id);
    return record
      ? success(record, { envelope: loaded.envelope })
      : failure(`${collection}-not-found`, `No ${singular} exists with id ${id}.`, {
          recovery: "Refresh the collection and choose an existing record.",
          retryable: false,
        });
  };

  const create = (input = {}) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const now = clock();
    const record = createRecord(input, { id: idFactory(), now });
    const saved = stateRepository.save({
      ...loaded.value,
      [collection]: [...loaded.value[collection], record],
    });
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const update = (id, patch = {}) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const index = loaded.value[collection].findIndex((item) => item.id === id);
    if (index < 0) {
      return failure(`${collection}-not-found`, `No ${singular} exists with id ${id}.`, {
        recovery: "Refresh the collection and choose an existing record.",
        retryable: false,
      });
    }
    const now = clock();
    const record = normalizeRecord(
      { ...loaded.value[collection][index], ...patch, id, updatedAt: now },
      { now },
    );
    const records = [...loaded.value[collection]];
    records[index] = record;
    const saved = stateRepository.save({ ...loaded.value, [collection]: records });
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const remove = (id) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const record = loaded.value[collection].find((item) => item.id === id);
    if (!record) {
      return failure(`${collection}-not-found`, `No ${singular} exists with id ${id}.`, {
        recovery: "Refresh the collection and choose an existing record.",
        retryable: false,
      });
    }
    const saved = stateRepository.save({
      ...loaded.value,
      [collection]: loaded.value[collection].filter((item) => item.id !== id),
      ...(collection === "scenes" && loaded.value.lastActiveSceneId === id
        ? { lastActiveSceneId: null }
        : {}),
    });
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  return { list, get, create, update, remove };
}

const sceneRecency = (scene) => {
  const candidates = [scene.lastOpenedAt, scene.updatedAt, scene.createdAt];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const fallbackSceneId = (scenes) =>
  [...scenes]
    .sort((left, right) => sceneRecency(right) - sceneRecency(left) || left.id.localeCompare(right.id))
    .at(0)?.id || null;

export const createSceneRepository = (stateRepository, options = {}) => {
  const repository = createCollectionRepository({
    stateRepository,
    collection: "scenes",
    singular: "Scene",
    createRecord: createSceneRecord,
    normalizeRecord: normalizeSceneRecord,
    ...options,
  });

  const setActive = (id) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const scene = loaded.value.scenes.find((item) => item.id === id);
    if (!scene) {
      return failure("scenes-not-found", `No Scene exists with id ${id}.`, {
        recovery: "Refresh the Scene collection and choose an existing Scene.",
        retryable: false,
      });
    }
    const saved = stateRepository.save({ ...loaded.value, lastActiveSceneId: id });
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const createActive = (input = {}) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const now = options.clock?.() || new Date().toISOString();
    const id = options.idFactory?.() || defaultIdFactory();
    const scene = createSceneRecord({ ...input, lastOpenedAt: now }, { id, now });
    const saved = stateRepository.save({
      ...loaded.value,
      scenes: [...loaded.value.scenes, scene],
      lastActiveSceneId: scene.id,
    });
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const open = (id) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const index = loaded.value.scenes.findIndex((scene) => scene.id === id);
    if (index < 0) {
      return failure("scenes-not-found", `No Scene exists with id ${id}.`, {
        recovery: "Refresh the Scene collection and choose an existing Scene.",
        retryable: false,
      });
    }
    const now = options.clock?.() || new Date().toISOString();
    const scene = normalizeSceneRecord(
      { ...loaded.value.scenes[index], lastOpenedAt: now },
      { now },
    );
    const scenes = [...loaded.value.scenes];
    scenes[index] = scene;
    const saved = stateRepository.save({
      ...loaded.value,
      scenes,
      lastActiveSceneId: id,
    });
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const remove = (id) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const scene = loaded.value.scenes.find((item) => item.id === id);
    if (!scene) {
      return failure("scenes-not-found", `No Scene exists with id ${id}.`, {
        recovery: "Refresh the Scene collection and choose an existing Scene.",
        retryable: false,
      });
    }
    const scenes = loaded.value.scenes.filter((item) => item.id !== id);
    const activeSceneId =
      loaded.value.lastActiveSceneId === id
        ? fallbackSceneId(scenes)
        : loaded.value.lastActiveSceneId;
    const pendingArtworkDeletes = scene.artworkKey
      ? [...new Set([...loaded.value.pendingArtworkDeletes, scene.artworkKey])]
      : loaded.value.pendingArtworkDeletes;
    const saved = stateRepository.save({
      ...loaded.value,
      scenes,
      lastActiveSceneId: activeSceneId,
      pendingArtworkDeletes,
    });
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const updateArtwork = (id, artworkKey, blankCanvas) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    const index = loaded.value.scenes.findIndex((scene) => scene.id === id);
    if (index < 0) {
      return failure("scenes-not-found", `No Scene exists with id ${id}.`, {
        recovery: "Refresh the Scene collection and choose an existing Scene.",
        retryable: false,
      });
    }

    const previousArtworkKey = loaded.value.scenes[index].artworkKey;
    const now = options.clock?.() || new Date().toISOString();
    const scene = normalizeSceneRecord(
      {
        ...loaded.value.scenes[index],
        artworkKey,
        blankCanvas,
        updatedAt: now,
      },
      { now },
    );
    const scenes = [...loaded.value.scenes];
    scenes[index] = scene;
    const pendingArtworkDeletes =
      previousArtworkKey && previousArtworkKey !== scene.artworkKey
        ? [...new Set([...loaded.value.pendingArtworkDeletes, previousArtworkKey])]
        : loaded.value.pendingArtworkDeletes;
    const saved = stateRepository.save({
      ...loaded.value,
      scenes,
      pendingArtworkDeletes,
    });
    return saved.ok
      ? success(scene, {
          envelope: saved.value,
          revision: saved.revision,
          previousArtworkKey,
        })
      : saved;
  };

  const pendingArtworkDeletes = () => {
    const loaded = stateRepository.load();
    return loaded.ok
      ? success([...loaded.value.pendingArtworkDeletes], { envelope: loaded.value })
      : loaded;
  };

  const acknowledgeArtworkDelete = (artworkKey) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    if (!loaded.value.pendingArtworkDeletes.includes(artworkKey)) {
      return success(artworkKey, {
        envelope: loaded.value,
        revision: loaded.value.revision,
      });
    }
    const saved = stateRepository.save({
      ...loaded.value,
      pendingArtworkDeletes: loaded.value.pendingArtworkDeletes.filter(
        (key) => key !== artworkKey,
      ),
    });
    return saved.ok
      ? success(artworkKey, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const scheduleArtworkDelete = (artworkKey) => {
    const loaded = stateRepository.load();
    if (!loaded.ok) return loaded;
    if (!artworkKey || loaded.value.pendingArtworkDeletes.includes(artworkKey)) {
      return success(artworkKey, {
        envelope: loaded.value,
        revision: loaded.value.revision,
      });
    }
    const saved = stateRepository.save({
      ...loaded.value,
      pendingArtworkDeletes: [...loaded.value.pendingArtworkDeletes, artworkKey],
    });
    return saved.ok
      ? success(artworkKey, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  return {
    ...repository,
    acknowledgeArtworkDelete,
    createActive,
    open,
    pendingArtworkDeletes,
    remove,
    scheduleArtworkDelete,
    setActive,
    updateArtwork,
  };
};

export const createHeroRepository = (stateRepository, options = {}) =>
  createCollectionRepository({
    stateRepository,
    collection: "heroes",
    singular: "Hero",
    createRecord: createHeroRecord,
    normalizeRecord: normalizeHeroRecord,
    ...options,
  });
