import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserArtworkDecoder } from "./application/artwork.js";
import { createApplicationCommands } from "./application/commands.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { createArtworkRepository } from "./storage/artworkRepository.js";
import { createHeroRepository, createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryArtworkAdapter, createMemoryStorage } from "./storage/memoryAdapters.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createStateRepository } from "./storage/stateRepository.js";

const CLOCK = () => "2026-08-12T12:00:00.000Z";
const oldArtwork = () => new Blob(["old-artwork"], { type: "image/png" });
const newArtwork = () => new Blob(["new-artwork"], { type: "image/png" });

function harness({ artworkSeed = {}, artworkAdapter: suppliedArtworkAdapter, decoder } = {}) {
  const local = createMemoryStorage();
  const artworkAdapter = suppliedArtworkAdapter || createMemoryArtworkAdapter(artworkSeed);
  const artworkRepository = createArtworkRepository(artworkAdapter);
  const stateRepository = createStateRepository(local, { clock: CLOCK });
  const sceneRepository = createSceneRepository(stateRepository, {
    clock: CLOCK,
    idFactory: () => "scene-1",
  });
  const heroRepository = createHeroRepository(stateRepository, {
    clock: CLOCK,
    idFactory: () => "hero-1",
  });
  let state = createInitialApplicationState();
  const actions = [];
  const dispatch = (action) => {
    actions.push(action);
    state = applicationReducer(state, action);
  };
  const commands = createApplicationCommands({
    sceneRepository,
    heroRepository,
    sessionRepository: createSessionRepository(createMemoryStorage()),
    artworkRepository,
    artworkDecoder: decoder || (async () => ({ ok: true, value: { width: 100, height: 100 } })),
    artworkKeyFactory: () => "art-new",
    dispatch,
  });
  return {
    actions,
    artworkAdapter,
    artworkRepository,
    commands,
    get state() { return state; },
    local,
    sceneRepository,
    stateRepository,
  };
}

test("artwork replacement retains the backup image until a later save releases it", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ name: "Painted", artworkKey: "art-old" }));
  (await app.commands.initialize());

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.ok, true);
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-new");
  assert.equal((await app.sceneRepository.get("scene-1")).value.blankCanvas, false);
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old", "art-new"]);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, ["art-old"]);
  (await app.sceneRepository.update("scene-1", { name: "New map confirmed" }));
  await app.commands.cleanupPendingArtwork();
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-new"]);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, []);
});

test("a rejected image never stages data or changes the valid Scene", async () => {
  const app = harness({
    artworkSeed: { "art-old": oldArtwork() },
    decoder: async () => ({
      ok: false,
      code: "artwork-decode-failed",
      message: "Cannot decode.",
      recovery: "Choose another image.",
      retryable: true,
    }),
  });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.code, "artwork-decode-failed");
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("a failed staged write preserves the previous artwork reference and blob", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));
  app.artworkAdapter.setFailureOperation("put");

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.code, "artwork-write-failed");
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("a failed staged read deletes the orphan and preserves previous Scene data", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));
  app.artworkAdapter.setFailureOperation("get");

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.code, "artwork-read-failed");
  app.artworkAdapter.setFailureOperation(null);
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("a missing staged readback is treated as verification failure and cleaned", async () => {
  const values = new Map([["art-old", oldArtwork()]]);
  const artworkAdapter = {
    async get(key) { return key === "art-new" ? null : values.get(key) ?? null; },
    async put(key, blob) { values.set(key, blob); return key; },
    async remove(key) { values.delete(key); },
    async keys() { return [...values.keys()]; },
  };
  const app = harness({ artworkAdapter });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.code, "artwork-verification-failed");
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("a failed Scene save removes the staged orphan and retains prior valid data", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));
  app.local.setFailureMode("write");

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.code, "storage-write-failed");
  app.local.setFailureMode(null);
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("failed old-art cleanup keeps the new reference and a durable retry key", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old" }));
  app.artworkAdapter.setFailureOperation("remove");

  const replaced = await app.commands.replaceSceneArtwork("scene-1", newArtwork());

  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.issues, []);
  (await app.sceneRepository.update("scene-1", { name: "Backup advanced" }));
  const cleanup = await app.commands.cleanupPendingArtwork();
  assert.equal(cleanup.issues[0].code, "artwork-delete-failed");
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-new");
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, ["art-old"]);
  app.artworkAdapter.setFailureOperation(null);
  assert.deepEqual(new Set((await app.artworkRepository.keys()).value), new Set(["art-old", "art-new"]));
});

test("startup retry removes pending artwork and acknowledges the cleanup durably", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ name: "Blank" }));
  const loaded = app.stateRepository.load();
  app.stateRepository.save({ ...loaded.value, pendingArtworkDeletes: ["art-old"] });

  const initialized = (await app.commands.initialize());
  const cleanup = await initialized.cleanup;

  assert.equal(cleanup.ok, true);
  assert.deepEqual(cleanup.issues, []);
  assert.deepEqual((await app.artworkRepository.keys()).value, []);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, []);
});

test("legacy startup retains unowned blobs that may be another tab's staged upload", async () => {
  const app = harness({ artworkSeed: { "art-orphan": newArtwork() } });
  (await app.sceneRepository.create({ name: "No artwork", artworkKey: null }));

  const cleanup = await (await app.commands.initialize()).cleanup;

  assert.equal(cleanup.ok, true);
  assert.deepEqual(cleanup.value, []);
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-orphan"]);
});

test("failed cleanup acknowledgement remains retryable after the blob is gone", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ name: "Blank" }));
  const loaded = app.stateRepository.load();
  app.stateRepository.save({ ...loaded.value, pendingArtworkDeletes: ["art-old"] });
  app.local.setFailureMode("write");

  const firstCleanup = await (await app.commands.initialize()).cleanup;

  assert.equal(firstCleanup.ok, true);
  assert.equal(firstCleanup.issues[0].code, "storage-write-failed");
  app.local.setFailureMode(null);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, ["art-old"]);
  assert.deepEqual((await app.artworkRepository.keys()).value, []);

  const retry = await app.commands.cleanupPendingArtwork();
  assert.deepEqual(retry.issues, []);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, []);
});

test("white canvas commits first and retains cleanup work when blob deletion fails", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old", blankCanvas: false }));
  app.artworkAdapter.setFailureOperation("remove");

  const blanked = await app.commands.useWhiteCanvas("scene-1");

  assert.equal(blanked.ok, true);
  assert.deepEqual(blanked.issues, []);
  (await app.sceneRepository.update("scene-1", { name: "White canvas confirmed" }));
  const cleanup = await app.commands.cleanupPendingArtwork();
  assert.equal(cleanup.issues[0].code, "artwork-delete-failed");
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, null);
  assert.equal((await app.sceneRepository.get("scene-1")).value.blankCanvas, true);
  assert.deepEqual(app.stateRepository.load().value.pendingArtworkDeletes, ["art-old"]);
});

test("white canvas save failure does not delete or detach the prior artwork", async () => {
  const app = harness({ artworkSeed: { "art-old": oldArtwork() } });
  (await app.sceneRepository.create({ artworkKey: "art-old", blankCanvas: false }));
  app.local.setFailureMode("write");

  const blanked = await app.commands.useWhiteCanvas("scene-1");

  assert.equal(blanked.code, "storage-write-failed");
  app.local.setFailureMode(null);
  assert.equal((await app.sceneRepository.get("scene-1")).value.artworkKey, "art-old");
  assert.equal((await app.sceneRepository.get("scene-1")).value.blankCanvas, false);
  assert.deepEqual((await app.artworkRepository.keys()).value, ["art-old"]);
});

test("Battle to Play clears encounter physical items but preserves Scene assets", async () => {
  const app = harness();
  const original = (await app.sceneRepository.create({
    kind: "battle",
    artworkKey: "art-map",
    tokens: [{ id: "token-1", inventory: [{ itemId: "dagger", quantity: 1 }] }],
    walls: [{ id: "wall-1", type: "full", points: [{ xPercent: 10, yPercent: 10 }, { xPercent: 90, yPercent: 90 }] }],
    chests: [{ id: "chest-1" }],
    encounter: { status: "active", battleItems: [{ id: "thrown-1" }] },
  })).value;

  const changed = (await app.commands.updateScene("scene-1", { kind: "play" }));

  assert.equal(changed.ok, true);
  assert.equal(changed.value.kind, "play");
  assert.equal(changed.value.encounter, null);
  assert.equal(changed.value.artworkKey, "art-map");
  assert.deepEqual(changed.value.tokens, original.tokens);
  assert.deepEqual(changed.value.walls, original.walls);
  assert.deepEqual(changed.value.chests, original.chests);
});

test("Scene identity, Battle grid size, and Play to Battle changes persist", async () => {
  const app = harness();
  (await app.sceneRepository.create({ name: "Old", kind: "play", gridSize: 44 }));

  assert.equal((await app.commands.updateScene("scene-1", { name: "New Name" })).value.name, "New Name");
  assert.equal((await app.commands.updateScene("scene-1", { kind: "battle" })).value.kind, "battle");
  assert.equal((await app.commands.updateScene("scene-1", { gridSize: 72 })).value.gridSize, 72);
  assert.equal((await app.sceneRepository.get("scene-1")).value.gridSize, 72);
});

test("browser artwork decoder rejects non-images and verifies decoded dimensions", async () => {
  let closed = false;
  const decoder = createBrowserArtworkDecoder({
    createImageBitmap: async () => ({ width: 640, height: 360, close: () => { closed = true; } }),
  });

  const invalid = await decoder(new Blob(["text"], { type: "text/plain" }));
  const valid = await decoder(new Blob(["image"], { type: "image/png" }));

  assert.equal(invalid.code, "artwork-invalid");
  assert.deepEqual(valid.value, { width: 640, height: 360 });
  assert.equal(closed, true);
});
