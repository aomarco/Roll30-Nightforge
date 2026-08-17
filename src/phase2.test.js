import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationCommands } from "./application/commands.js";
import {
  accentForScene,
  orderScenesForLibrary,
  tableModeForScene,
} from "./application/library.js";
import {
  applicationReducer,
  createInitialApplicationState,
} from "./application/state.js";
import { createHeroRepository, createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createStateRepository } from "./storage/stateRepository.js";

const times = [
  "2026-08-12T01:00:00.000Z",
  "2026-08-12T02:00:00.000Z",
  "2026-08-12T03:00:00.000Z",
  "2026-08-12T04:00:00.000Z",
  "2026-08-12T05:00:00.000Z",
  "2026-08-12T06:00:00.000Z",
  "2026-08-12T07:00:00.000Z",
  "2026-08-12T08:00:00.000Z",
];

function harness({ local = createMemoryStorage(), session = createMemoryStorage() } = {}) {
  let timeIndex = 0;
  let idIndex = 0;
  const clock = () => times[Math.min(timeIndex++, times.length - 1)];
  const stateRepository = createStateRepository(local, { clock });
  const sceneRepository = createSceneRepository(stateRepository, {
    clock,
    idFactory: () => `scene-${++idIndex}`,
  });
  const heroRepository = createHeroRepository(stateRepository, {
    clock,
    idFactory: () => `hero-${idIndex + 1}`,
  });
  const sessionRepository = createSessionRepository(session);
  let state = createInitialApplicationState();
  const actions = [];
  const dispatch = (action) => {
    actions.push(action);
    state = applicationReducer(state, action);
  };
  const commands = createApplicationCommands({
    sceneRepository,
    heroRepository,
    sessionRepository,
    dispatch,
  });
  return {
    actions,
    commands,
    get state() { return state; },
    local,
    sceneRepository,
    session,
    sessionRepository,
    stateRepository,
  };
}

test("Library ordering promotes the most recently opened Scene", () => {
  const ordered = orderScenesForLibrary([
    { id: "a", updatedAt: "2026-08-12T06:00:00Z", lastOpenedAt: null },
    { id: "b", updatedAt: "2026-08-12T02:00:00Z", lastOpenedAt: "2026-08-12T07:00:00Z" },
    { id: "c", updatedAt: "2026-08-12T05:00:00Z", lastOpenedAt: "2026-08-12T03:00:00Z" },
  ]);
  assert.deepEqual(ordered.map((scene) => scene.id), ["b", "c", "a"]);
});

test("Library presentation helpers are stable and respect Scene kind and encounter", () => {
  assert.equal(tableModeForScene({ kind: "play" }), "play");
  assert.equal(tableModeForScene({ kind: "battle", encounter: null }), "setup");
  assert.equal(tableModeForScene({ kind: "battle", encounter: { status: "active" } }), "battle");
  assert.equal(tableModeForScene({ kind: "battle", encounter: { status: "complete" } }), "battle");
  assert.equal(accentForScene({ id: "stable", name: "Scene" }), accentForScene({ id: "stable", name: "Scene" }));
});

test("Forge persists, selects, remembers, and opens one real Scene", () => {
  const app = harness();
  app.commands.initialize();
  const forged = app.commands.forgeScene(
    { name: "  The Sunken Crypt  ", kind: "battle" },
    { page: "board", mode: "setup" },
  );
  assert.equal(forged.ok, true);
  assert.equal(forged.value.name, "The Sunken Crypt");
  assert.equal(forged.value.kind, "battle");
  assert.equal(app.state.scenes.length, 1);
  assert.equal(app.state.activeSceneId, forged.value.id);
  assert.deepEqual(app.state.route, { page: "board", mode: "setup" });
  assert.equal(app.sessionRepository.load().value.activeSceneId, forged.value.id);
  assert.equal(app.stateRepository.load().value.lastActiveSceneId, forged.value.id);
  assert.ok(forged.value.lastOpenedAt);
});

test("Forge normalizes a blank name and supports a Play destination", () => {
  const app = harness();
  const forged = app.commands.forgeScene(
    { name: "   ", kind: "play" },
    { page: "board", mode: "play" },
  );
  assert.equal(forged.value.name, "Untitled scene");
  assert.equal(forged.value.kind, "play");
  assert.equal(forged.value.encounter, null);
  assert.deepEqual(app.state.route, { page: "board", mode: "play" });
});

test("Open targets the exact stable Scene ID and refreshes its recency", () => {
  const app = harness();
  const first = app.sceneRepository.create({ name: "First" }).value;
  const second = app.sceneRepository.create({ name: "Second" }).value;
  app.commands.initialize();
  const opened = app.commands.openScene(second.id, { page: "settings" });
  assert.equal(opened.ok, true);
  assert.equal(opened.value.id, second.id);
  assert.equal(app.state.activeSceneId, second.id);
  assert.deepEqual(app.state.route, { page: "settings" });
  assert.ok(app.sceneRepository.get(second.id).value.lastOpenedAt);
  assert.equal(app.sceneRepository.get(first.id).value.lastOpenedAt, null);
});

test("Reload restores active context but always starts at Library", () => {
  const local = createMemoryStorage();
  const session = createMemoryStorage();
  const firstRun = harness({ local, session });
  const forged = firstRun.commands.forgeScene({ name: "Remembered" });
  assert.equal(firstRun.state.route.page, "board");

  const reloaded = harness({ local, session });
  const initialized = reloaded.commands.initialize();
  assert.equal(initialized.ok, true);
  assert.equal(reloaded.state.activeSceneId, forged.value.id);
  assert.deepEqual(reloaded.state.route, { page: "home" });
});

test("Deleting the active Scene selects the safest recent fallback", () => {
  const app = harness();
  const first = app.commands.forgeScene({ name: "First" }).value;
  const second = app.commands.forgeScene({ name: "Second" }).value;
  assert.equal(app.state.activeSceneId, second.id);
  const removed = app.commands.removeScene(second.id);
  assert.equal(removed.ok, true);
  assert.equal(app.state.scenes.some((scene) => scene.id === second.id), false);
  assert.equal(app.state.activeSceneId, first.id);
  assert.equal(app.sessionRepository.load().value.activeSceneId, first.id);
  assert.equal(app.stateRepository.load().value.lastActiveSceneId, first.id);
});

test("Deleting the final Scene clears durable and session context", () => {
  const app = harness();
  const scene = app.commands.forgeScene({ name: "Only" }).value;
  const removed = app.commands.removeScene(scene.id);
  assert.equal(removed.ok, true);
  assert.deepEqual(app.state.scenes, []);
  assert.equal(app.state.activeSceneId, null);
  assert.equal(app.sessionRepository.load().value.activeSceneId, null);
  assert.equal(app.stateRepository.load().value.lastActiveSceneId, null);
});

test("Scene deletion schedules artwork cleanup without touching other artwork", () => {
  const app = harness();
  const scene = app.commands.forgeScene({ name: "Painted", artworkKey: "art-painted" }).value;
  app.commands.removeScene(scene.id);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, ["art-painted"]);
});

test("A failed Forge remains on Library and does not invent visible state", () => {
  const app = harness();
  app.commands.initialize();
  app.local.setFailureMode("write");
  const failed = app.commands.forgeScene({ name: "Unsaved" });
  assert.equal(failed.ok, false);
  assert.deepEqual(app.state.scenes, []);
  assert.deepEqual(app.state.route, { page: "home" });
  assert.equal(app.state.persistence.status, "error");
});

test("A failed deletion leaves the Scene visible and selected", () => {
  const app = harness();
  const scene = app.commands.forgeScene({ name: "Keep Me" }).value;
  app.local.setFailureMode("write");
  const failed = app.commands.removeScene(scene.id);
  assert.equal(failed.ok, false);
  assert.equal(app.state.scenes.some((item) => item.id === scene.id), true);
  assert.equal(app.state.activeSceneId, scene.id);
});
