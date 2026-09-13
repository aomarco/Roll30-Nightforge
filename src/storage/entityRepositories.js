import { failure, success } from "../application/result.js";
import { encounterExperienceAward } from "../domain/encounter.js";
import {
  createHeroRecord,
  createSceneRecord,
  normalizeHeroRecord,
  normalizeSceneRecord,
} from "../domain/records.js";
import { appendRollLog } from "../domain/rollLog.js";

const defaultIdFactory = () => crypto.randomUUID();

const revisionConflict = (expectedRevision, actualRevision) =>
  failure("storage-revision-conflict", "Nightforge state changed in another browser context.", {
    recovery: "Review the latest state and retry your change. No newer data was overwritten.",
    retryable: true,
    expectedRevision,
    actualRevision,
  });

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

  const loadCollection = async () => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    return success(loaded.value[collection], {
      envelope: loaded.value,
      recovered: loaded.recovered,
      source: loaded.source,
      issues: loaded.issues,
      classification: loaded.classification,
      readOnly: loaded.readOnly,
    });
  };

  const list = async () => (await loadCollection());

  const get = async (id) => {
    const loaded = (await loadCollection());
    if (!loaded.ok) return loaded;
    const record = loaded.value.find((item) => item.id === id);
    return record
      ? success(record, { envelope: loaded.envelope })
      : failure(`${collection}-not-found`, `No ${singular} exists with id ${id}.`, {
          recovery: "Refresh the collection and choose an existing record.",
          retryable: false,
        });
  };

  const create = async (input = {}) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    const now = clock();
    const record = createRecord(input, { id: idFactory(), now });
    if (loaded.value[collection].some((item) => item.id === record.id)) {
      return failure(`${collection}-id-conflict`, `A ${singular} already exists with id ${record.id}.`, {
        recovery: `Retry creating the ${singular}; no existing record was changed.`,
        retryable: true,
      });
    }
    const saved = (await stateRepository.save({
      ...loaded.value,
      [collection]: [...loaded.value[collection], record],
    }));
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const update = async (id, patch = {}, { expectedRevision } = {}) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    if (expectedRevision !== undefined && expectedRevision !== loaded.value.revision) {
      return revisionConflict(expectedRevision, loaded.value.revision);
    }
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
    const saved = (await stateRepository.save({ ...loaded.value, [collection]: records }));
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const remove = async (id) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    const record = loaded.value[collection].find((item) => item.id === id);
    if (!record) {
      return failure(`${collection}-not-found`, `No ${singular} exists with id ${id}.`, {
        recovery: "Refresh the collection and choose an existing record.",
        retryable: false,
      });
    }
    const saved = (await stateRepository.save({
      ...loaded.value,
      [collection]: loaded.value[collection].filter((item) => item.id !== id),
      ...(collection === "scenes" && loaded.value.lastActiveSceneId === id
        ? { lastActiveSceneId: null }
        : {}),
    }));
    return saved.ok
      ? success(record, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  return { list, get, create, update, remove, retention: stateRepository.retention };
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
  const withEncounterIdentity = (input) => input.encounter ? {
    ...input,
    encounter: { ...input.encounter, instanceId: input.encounter.instanceId || (options.idFactory || defaultIdFactory)() },
  } : input;
  const repository = createCollectionRepository({
    stateRepository,
    collection: "scenes",
    singular: "Scene",
    createRecord: (input, context) => createSceneRecord(withEncounterIdentity(input), context),
    normalizeRecord: (input, context) => normalizeSceneRecord(withEncounterIdentity(input), context),
    ...options,
  });

  const setActive = async (id) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    const scene = loaded.value.scenes.find((item) => item.id === id);
    if (!scene) {
      return failure("scenes-not-found", `No Scene exists with id ${id}.`, {
        recovery: "Refresh the Scene collection and choose an existing Scene.",
        retryable: false,
      });
    }
    const saved = (await stateRepository.save({ ...loaded.value, lastActiveSceneId: id }));
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const createActive = async (input = {}) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    const now = options.clock?.() || new Date().toISOString();
    const id = options.idFactory?.() || defaultIdFactory();
    const scene = createSceneRecord({ ...input, lastOpenedAt: now }, { id, now });
    if (loaded.value.scenes.some((item) => item.id === scene.id)) {
      return failure("scenes-id-conflict", `A Scene already exists with id ${scene.id}.`, {
        recovery: "Retry forging the Scene; no existing Scene was changed.",
        retryable: true,
      });
    }
    const saved = (await stateRepository.save({
      ...loaded.value,
      scenes: [...loaded.value.scenes, scene],
      lastActiveSceneId: scene.id,
    }));
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const open = async (id) => {
    const loaded = (await stateRepository.load());
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
    const saved = (await stateRepository.save({
      ...loaded.value,
      scenes,
      lastActiveSceneId: id,
    }));
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const remove = async (id) => {
    const loaded = (await stateRepository.load());
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
    const saved = (await stateRepository.save({
      ...loaded.value,
      scenes,
      lastActiveSceneId: activeSceneId,
      pendingArtworkDeletes,
    }));
    return saved.ok
      ? success(scene, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const updateArtwork = async (id, artworkKey, blankCanvas) => {
    const loaded = (await stateRepository.load());
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
    const saved = (await stateRepository.save({
      ...loaded.value,
      scenes,
      pendingArtworkDeletes,
    }));
    return saved.ok
      ? success(scene, {
          envelope: saved.value,
          revision: saved.revision,
          previousArtworkKey,
        })
      : saved;
  };

  const pendingArtworkDeletes = async () => {
    const loaded = (await stateRepository.load());
    return loaded.ok
      ? success([...loaded.value.pendingArtworkDeletes], { envelope: loaded.value })
      : loaded;
  };

  const acknowledgeArtworkDelete = async (artworkKey) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    if (!loaded.value.pendingArtworkDeletes.includes(artworkKey)) {
      return success(artworkKey, {
        envelope: loaded.value,
        revision: loaded.value.revision,
      });
    }
    const saved = (await stateRepository.save({
      ...loaded.value,
      pendingArtworkDeletes: loaded.value.pendingArtworkDeletes.filter(
        (key) => key !== artworkKey,
      ),
    }));
    return saved.ok
      ? success(artworkKey, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const scheduleArtworkDelete = async (artworkKey) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    if (!artworkKey || loaded.value.pendingArtworkDeletes.includes(artworkKey)) {
      return success(artworkKey, {
        envelope: loaded.value,
        revision: loaded.value.revision,
      });
    }
    const saved = (await stateRepository.save({
      ...loaded.value,
      pendingArtworkDeletes: [...loaded.value.pendingArtworkDeletes, artworkKey],
    }));
    return saved.ok
      ? success(artworkKey, { envelope: saved.value, revision: saved.revision })
      : saved;
  };

  const awardEncounterExperience = async (id, { expectedRevision, encounterInstanceId } = {}) => {
    const loaded = (await stateRepository.load());
    if (!loaded.ok) return loaded;
    const scene = loaded.value.scenes.find((entry) => entry.id === id);
    if (!scene || scene.encounter?.status !== "complete") return failure("xp-encounter-incomplete", "Finish this Battle before awarding experience.");
    if (encounterInstanceId && encounterInstanceId !== scene.encounter.instanceId) return failure("xp-encounter-conflict", "This is a different run of the Battle. Review its experience award.");
    if (scene.encounter.xpAwarded) return success(scene, {
      envelope: loaded.value, revision: loaded.value.revision, awarded: scene.encounter.xpAwardOutcome || [], replayed: true,
    });
    if (expectedRevision !== undefined && loaded.value.revision !== expectedRevision) return revisionConflict(expectedRevision, loaded.value.revision);
    const award = encounterExperienceAward(scene.tokens, scene.encounter);
    if (!award.recipients.length || award.perHero <= 0) return failure("xp-no-recipients", "No surviving Hero has experience to receive.");
    const shares = new Map(award.recipients.map((entry) => [entry.heroId, entry.share]));
    if ([...shares.keys()].some((heroId) => !loaded.value.heroes.some((hero) => hero.id === heroId))) {
      return failure("xp-hero-missing", "An eligible Hero is no longer in the roster. No experience was awarded.");
    }
    const awarded = [];
    const heroes = loaded.value.heroes.map((hero) => {
      if (!shares.has(hero.id)) return hero;
      const xp = hero.xp + shares.get(hero.id);
      awarded.push({ heroId: hero.id, name: hero.name, xp });
      return { ...hero, xp };
    });
    if (awarded.some((entry) => !Number.isSafeInteger(entry.xp))) return failure("xp-limit-exceeded", "This award exceeds the supported experience total.");
    const nextScene = withEncounterIdentity({ ...scene, encounter: { ...scene.encounter, xpAwarded: true, xpAwardOutcome: awarded } });
    const saved = (await stateRepository.save({
      ...loaded.value, heroes, scenes: loaded.value.scenes.map((entry) => entry.id === id ? nextScene : entry),
    }));
    return saved.ok ? success(saved.value.scenes.find((entry) => entry.id === id), {
      envelope: saved.value, revision: saved.revision, awarded,
    }) : saved;
  };

  return {
    ...repository,
    awardEncounterExperience,
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

export function createRollLogRepository(stateRepository, { clock = () => new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
  if (!stateRepository) throw new TypeError("Roll log repository requires StateRepository.");
  const list = async () => {
    const loaded = await stateRepository.load();
    return loaded.ok ? success(loaded.value.rollLog || [], { envelope: loaded.value }) : loaded;
  };
  const append = async (entry, { expectedRevision } = {}) => {
    const loaded = await stateRepository.load();
    if (!loaded.ok) return loaded;
    if (expectedRevision !== undefined && expectedRevision !== loaded.value.revision) return revisionConflict(expectedRevision, loaded.value.revision);
    const normalized = { ...entry, id: entry.id || idFactory(), createdAt: entry.createdAt || clock() };
    const rollLog = appendRollLog(loaded.value.rollLog || [], normalized, { now: clock() });
    const saved = await stateRepository.save({ ...loaded.value, rollLog }, { commandId: `roll-${normalized.id}` });
    return saved.ok ? success(normalized, { envelope: saved.value, revision: saved.revision }) : saved;
  };
  return { list, append };
}
