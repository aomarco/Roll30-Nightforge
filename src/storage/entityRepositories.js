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

  return { ...repository, setActive };
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
