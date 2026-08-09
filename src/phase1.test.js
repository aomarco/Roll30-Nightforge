import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationCommands } from "./application/commands.js";
import { failure, success } from "./application/result.js";
import {
  applicationReducer,
  createInitialApplicationState,
} from "./application/state.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import {
  createArtworkRepository,
  createIndexedDbArtworkAdapter,
} from "./storage/artworkRepository.js";
import { STORAGE_KEYS } from "./storage/constants.js";
import {
  createHeroRepository,
  createSceneRepository,
} from "./storage/entityRepositories.js";
import {
  createEmptyEnvelope,
  inspectEnvelope,
  sealEnvelope,
  serializeEnvelope,
} from "./storage/envelope.js";
import {
  createMemoryArtworkAdapter,
  createMemoryStorage,
} from "./storage/memoryAdapters.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createStateRepository } from "./storage/stateRepository.js";

const CLOCK = () => "2026-08-09T10:00:00.000Z";
const stateRepository = (storage = createMemoryStorage()) =>
  createStateRepository(storage, { clock: CLOCK });

const createFakeIndexedDb = () => {
  const values = new Map();
  let created = false;
  const request = (operation, transaction) => {
    const pending = {};
    queueMicrotask(() => {
      try {
        pending.result = operation();
        pending.onsuccess?.();
        queueMicrotask(() => transaction.oncomplete?.());
      } catch (error) {
        pending.error = error;
        pending.onerror?.();
        transaction.error = error;
        transaction.onerror?.();
      }
    });
    return pending;
  };
  const database = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => {
      created = true;
    },
    transaction: () => {
      const transaction = {
        objectStore: () => ({
          get: (key) => request(() => values.get(key), transaction),
          put: (value, key) => request(() => (values.set(key, value), key), transaction),
          delete: (key) => request(() => values.delete(key), transaction),
          getAllKeys: () => request(() => [...values.keys()], transaction),
        }),
      };
      return transaction;
    },
  };
  return {
    open: () => {
      const pending = {};
      queueMicrotask(() => {
        pending.result = database;
        if (!created) pending.onupgradeneeded?.();
        queueMicrotask(() => pending.onsuccess?.());
      });
      return pending;
    },
  };
};

test("command results expose one stable success or failure shape", () => {
  assert.deepEqual(success("value", { revision: 2 }), {
    ok: true,
    value: "value",
    revision: 2,
  });
  assert.deepEqual(failure("failed", "It failed.", { recovery: "Retry.", retryable: false }), {
    ok: false,
    code: "failed",
    message: "It failed.",
    recovery: "Retry.",
    retryable: false,
  });
});

test("new Scenes receive Nightforge defaults and separate kind from encounter", () => {
  const battle = createSceneRecord({}, { id: "scene-1", now: CLOCK() });
  const play = createSceneRecord(
    { kind: "play", encounter: { status: "active" }, gridSize: 999 },
    { id: "scene-2", now: CLOCK() },
  );
  assert.equal(battle.name, "Untitled scene");
  assert.equal(battle.kind, "battle");
  assert.equal(battle.gridSize, 44);
  assert.equal(play.kind, "play");
  assert.equal(play.encounter, null);
  assert.equal(play.gridSize, 80);
});

test("new Heroes start as valid level-1 Human Fighters with all abilities at 8", () => {
  const hero = createHeroRecord({}, { id: "hero-1", now: CLOCK() });
  assert.equal(hero.classId, "fighter");
  assert.equal(hero.raceId, "human");
  assert.equal(hero.level, 1);
  assert.deepEqual(Object.values(hero.baseAbilities), [8, 8, 8, 8, 8, 8]);
  assert.deepEqual(hero.languages, ["Common"]);
});

test("Hero record normalization merges inventory and clamps user values", () => {
  const hero = createHeroRecord(
    {
      level: 30,
      baseAbilities: { str: 99, dex: 2 },
      inventory: [
        { itemId: "dagger", quantity: 1 },
        { itemId: "dagger", quantity: 2 },
        { itemId: "club", quantity: 0 },
      ],
      enchantments: { dagger: 9, club: 0 },
    },
    { id: "hero-1", now: CLOCK() },
  );
  assert.equal(hero.level, 20);
  assert.equal(hero.baseAbilities.str, 15);
  assert.equal(hero.baseAbilities.dex, 8);
  assert.deepEqual(hero.inventory, [{ itemId: "dagger", quantity: 3 }]);
  assert.deepEqual(hero.enchantments, { dagger: 3 });
});

test("sealed state validates and detects tampering", () => {
  const sealed = sealEnvelope(createEmptyEnvelope(CLOCK()), CLOCK());
  assert.equal(inspectEnvelope(serializeEnvelope(sealed)).ok, true);
  const tampered = { ...sealed, revision: 44 };
  const inspected = inspectEnvelope(JSON.stringify(tampered));
  assert.equal(inspected.ok, false);
  assert.equal(inspected.code, "state-checksum-invalid");
});

test("StateRepository starts empty without writing any browser state", () => {
  const storage = createMemoryStorage();
  const loaded = stateRepository(storage).load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "empty");
  assert.equal(loaded.value.revision, 0);
  assert.deepEqual(storage.snapshot(), {});
});

test("StateRepository saves, verifies, and increments revisions", () => {
  const repository = stateRepository();
  const first = repository.save(createEmptyEnvelope(CLOCK()));
  const second = repository.save({ ...first.value, pendingArtworkDeletes: ["old-art"] });
  assert.equal(first.ok, true);
  assert.equal(first.value.revision, 1);
  assert.equal(second.value.revision, 2);
  assert.deepEqual(second.value.pendingArtworkDeletes, ["old-art"]);
});

test("StateRepository recovers the newest valid backup when primary is corrupt", () => {
  const storage = createMemoryStorage();
  const repository = stateRepository(storage);
  const first = repository.save(createEmptyEnvelope(CLOCK()));
  repository.save({ ...first.value, lastActiveSceneId: null });
  storage.setItem(STORAGE_KEYS.state, "{broken");
  const loaded = repository.load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.value.revision, 1);
});

test("StateRepository reports write failures and leaves the last valid state readable", () => {
  const storage = createMemoryStorage();
  const repository = stateRepository(storage);
  const first = repository.save(createEmptyEnvelope(CLOCK()));
  storage.setFailureMode("write");
  const failed = repository.save({ ...first.value, pendingArtworkDeletes: ["x"] });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "storage-write-failed");
  storage.setFailureMode(null);
  assert.equal(repository.load().value.revision, 1);
});

test("SceneRepository creates, reads, updates, lists, and removes stable records", () => {
  const repository = stateRepository();
  const scenes = createSceneRepository(repository, {
    idFactory: () => "scene-fixed",
    clock: CLOCK,
  });
  assert.equal(scenes.create({ name: "  The Forge  " }).value.id, "scene-fixed");
  assert.equal(scenes.get("scene-fixed").value.name, "The Forge");
  assert.equal(scenes.update("scene-fixed", { kind: "play" }).value.kind, "play");
  assert.equal(scenes.list().value.length, 1);
  assert.equal(scenes.remove("scene-fixed").value.id, "scene-fixed");
  assert.equal(scenes.list().value.length, 0);
});

test("HeroRepository changes only the requested Hero", () => {
  const repository = stateRepository();
  let id = 0;
  const heroes = createHeroRepository(repository, {
    idFactory: () => `hero-${++id}`,
    clock: CLOCK,
  });
  const first = heroes.create({ name: "A" }).value;
  const second = heroes.create({ name: "B" }).value;
  heroes.update(second.id, { name: "Updated" });
  assert.equal(heroes.get(first.id).value.name, "A");
  assert.equal(heroes.get(second.id).value.name, "Updated");
});

test("removing the active Scene clears only its active reference", () => {
  const repository = stateRepository();
  const scenes = createSceneRepository(repository, {
    idFactory: () => "scene-active",
    clock: CLOCK,
  });
  scenes.create({ name: "Active" });
  const loaded = repository.load();
  repository.save({ ...loaded.value, lastActiveSceneId: "scene-active" });
  scenes.remove("scene-active");
  assert.equal(repository.load().value.lastActiveSceneId, null);
});

test("selecting a Scene persists its durable active reference", () => {
  const repository = stateRepository();
  const scenes = createSceneRepository(repository, {
    idFactory: () => "scene-active",
    clock: CLOCK,
  });
  scenes.create({ name: "Active" });
  const selected = scenes.setActive("scene-active");
  assert.equal(selected.ok, true);
  assert.equal(repository.load().value.lastActiveSceneId, "scene-active");
});

test("SessionRepository uses only the isolated Nightforge session key", () => {
  const storage = createMemoryStorage();
  const session = createSessionRepository(storage);
  assert.deepEqual(session.load().value, { activeSceneId: null });
  session.save({ activeSceneId: "scene-1" });
  assert.deepEqual(session.load().value, { activeSceneId: "scene-1" });
  assert.deepEqual(Object.keys(storage.snapshot()), [STORAGE_KEYS.session]);
});

test("ArtworkRepository round-trips and removes data through an isolated adapter", async () => {
  const adapter = createMemoryArtworkAdapter();
  const artwork = createArtworkRepository(adapter);
  const blob = new Blob(["nightforge"], { type: "image/png" });
  assert.equal((await artwork.put("art-1", blob)).ok, true);
  assert.equal((await artwork.get("art-1")).value.size, blob.size);
  assert.deepEqual((await artwork.keys()).value, ["art-1"]);
  assert.equal((await artwork.remove("art-1")).ok, true);
  assert.equal((await artwork.get("art-1")).value, null);
});

test("IndexedDB artwork adapter completes real request and transaction lifecycles", async () => {
  const adapter = createIndexedDbArtworkAdapter(createFakeIndexedDb());
  const blob = new Blob(["nightforge-indexed-db"], { type: "image/png" });
  assert.equal(await adapter.put("art-1", blob), "art-1");
  assert.equal((await adapter.get("art-1")).size, blob.size);
  assert.deepEqual(await adapter.keys(), ["art-1"]);
  await adapter.remove("art-1");
  assert.equal(await adapter.get("art-1"), undefined);
});

test("ArtworkRepository turns adapter failures into actionable results", async () => {
  const adapter = createMemoryArtworkAdapter();
  adapter.setFailureOperation("put");
  const result = await createArtworkRepository(adapter).put("art-1", new Blob(["x"]));
  assert.equal(result.ok, false);
  assert.equal(result.code, "artwork-write-failed");
  assert.match(result.recovery, /previous artwork remains/i);
});

test("application hydration always opens Library while restoring valid Scene context", () => {
  const initial = createInitialApplicationState();
  const hydrated = applicationReducer(initial, {
    type: "hydrate-success",
    scenes: [{ id: "scene-1" }],
    heroes: [],
    activeSceneId: "scene-1",
    revision: 3,
    recovered: false,
  });
  assert.deepEqual(hydrated.route, { page: "home" });
  assert.equal(hydrated.activeSceneId, "scene-1");
  assert.equal(hydrated.persistence.revision, 3);
});

test("ApplicationCommands initialize repositories without bypassing Library", () => {
  const storage = createMemoryStorage();
  const repository = stateRepository(storage);
  const scenes = createSceneRepository(repository, { idFactory: () => "scene-1", clock: CLOCK });
  const heroes = createHeroRepository(repository, { idFactory: () => "hero-1", clock: CLOCK });
  scenes.create({ name: "Scene" });
  const session = createSessionRepository(storage);
  session.save({ activeSceneId: "scene-1" });
  const actions = [];
  const commands = createApplicationCommands({
    sceneRepository: scenes,
    heroRepository: heroes,
    sessionRepository: session,
    dispatch: (action) => actions.push(action),
  });
  const initialized = commands.initialize();
  assert.equal(initialized.ok, true);
  assert.equal(initialized.value.activeSceneId, "scene-1");
  assert.equal(actions.at(-1).type, "hydrate-success");
});

test("ApplicationCommands select Scene durably even when session context cannot save", () => {
  const repository = stateRepository();
  const scenes = createSceneRepository(repository, { idFactory: () => "scene-1", clock: CLOCK });
  const heroes = createHeroRepository(repository, { idFactory: () => "hero-1", clock: CLOCK });
  scenes.create({ name: "Scene" });
  const actions = [];
  const commands = createApplicationCommands({
    sceneRepository: scenes,
    heroRepository: heroes,
    sessionRepository: {
      load: () => success({ activeSceneId: null }),
      save: () => failure("session-write-failed", "Cannot remember Scene."),
      clear: () => success({ activeSceneId: null }),
    },
    dispatch: (action) => actions.push(action),
  });
  const selected = commands.selectScene("scene-1");
  assert.equal(selected.ok, true);
  assert.equal(selected.issues.length, 1);
  assert.equal(repository.load().value.lastActiveSceneId, "scene-1");
  assert.equal(actions.at(-1).sceneId, "scene-1");
});

test("ApplicationCommands clear stale session context when the active Scene is removed", () => {
  const storage = createMemoryStorage();
  const repository = stateRepository(storage);
  const scenes = createSceneRepository(repository, { idFactory: () => "scene-1", clock: CLOCK });
  const heroes = createHeroRepository(repository, { idFactory: () => "hero-1", clock: CLOCK });
  scenes.create({ name: "Scene" });
  scenes.setActive("scene-1");
  const session = createSessionRepository(storage);
  session.save({ activeSceneId: "scene-1" });
  const actions = [];
  const commands = createApplicationCommands({
    sceneRepository: scenes,
    heroRepository: heroes,
    sessionRepository: session,
    dispatch: (action) => actions.push(action),
  });
  const removed = commands.removeScene("scene-1");
  assert.equal(removed.ok, true);
  assert.equal(session.load().value.activeSceneId, null);
  assert.equal(actions.some((action) => action.type === "set-active-scene" && action.sceneId === null), true);
});

test("ApplicationCommands require a selected Scene for Scene and Table routes", () => {
  const stub = {
    list: () => success([], { envelope: createEmptyEnvelope(CLOCK()) }),
    get: () => failure("not-found", "Not found"),
    create: () => failure("unused", "Unused"),
    update: () => failure("unused", "Unused"),
    remove: () => failure("unused", "Unused"),
  };
  const commands = createApplicationCommands({
    sceneRepository: stub,
    heroRepository: stub,
    sessionRepository: { load: () => success({ activeSceneId: null }), save: success },
    dispatch: () => {},
  });
  assert.equal(commands.navigate({ page: "settings" }).code, "route-scene-required");
  assert.equal(commands.navigate({ page: "board" }).code, "route-scene-required");
  assert.equal(commands.navigate({ page: "characters" }).ok, true);
});

test("application persistence failures are dispatched without hiding the error", () => {
  const actions = [];
  const failed = failure("storage-write-failed", "Cannot save.");
  const sceneRepository = {
    list: () => success([], { envelope: createEmptyEnvelope(CLOCK()) }),
    get: () => failed,
    create: () => failed,
    update: () => failed,
    remove: () => failed,
  };
  const commands = createApplicationCommands({
    sceneRepository,
    heroRepository: sceneRepository,
    sessionRepository: { load: () => success({ activeSceneId: null }), save: success },
    dispatch: (action) => actions.push(action),
  });
  assert.equal(commands.createScene({ name: "Will fail" }).ok, false);
  assert.deepEqual(actions.map((action) => action.type), [
    "persistence-saving",
    "persistence-failed",
  ]);
  assert.equal(actions.at(-1).error.code, "storage-write-failed");
});
