import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserArtworkDecoder, HERO_PORTRAIT_LIMITS } from "./application/artwork.js";
import { createApplicationCommands } from "./application/commands.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { createArtworkRepository } from "./storage/artworkRepository.js";
import { createHeroRepository, createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryArtworkAdapter, createMemoryStorage } from "./storage/memoryAdapters.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createStateRepository } from "./storage/stateRepository.js";

const CLOCK = () => "2026-08-19T12:00:00.000Z";
const portrait = (body = "portrait") => new Blob([body], { type: "image/png" });

function harness({ portraitSeed = {}, portraitAdapter: supplied, decoder, keys = ["portrait-1", "portrait-2"] } = {}) {
  const local = createMemoryStorage();
  const artworkAdapter = createMemoryArtworkAdapter();
  const portraitAdapter = supplied || createMemoryArtworkAdapter(portraitSeed);
  const stateRepository = createStateRepository(local, { clock: CLOCK });
  const sceneRepository = createSceneRepository(stateRepository, { clock: CLOCK, idFactory: () => "scene-1" });
  const heroRepository = createHeroRepository(stateRepository, { clock: CLOCK, idFactory: () => "hero-1" });
  let state = createInitialApplicationState();
  const dispatch = (action) => { state = applicationReducer(state, action); };
  const issued = [...keys];
  const commands = createApplicationCommands({
    sceneRepository,
    heroRepository,
    sessionRepository: createSessionRepository(createMemoryStorage()),
    artworkRepository: createArtworkRepository(artworkAdapter),
    artworkDecoder: async () => ({ ok: true, value: { width: 10, height: 10 } }),
    portraitRepository: createArtworkRepository(portraitAdapter),
    portraitDecoder: decoder || (async () => ({ ok: true, value: { width: 256, height: 256 } })),
    portraitKeyFactory: () => issued.shift() || "portrait-exhausted",
    dispatch,
  });
  return { commands, heroRepository, portraitAdapter, state: () => state };
}

test("a hero record carries no portrait until one is uploaded", () => {
  const { commands } = harness();
  const created = commands.createHero({ name: "Mara" });
  assert.equal(created.ok, true);
  assert.equal(created.value.portraitKey, null);
});

test("uploading a portrait stores the blob and points the hero at it", async () => {
  const { commands, portraitAdapter } = harness();
  commands.createHero({ name: "Mara" });

  const saved = await commands.replaceHeroPortrait("hero-1", portrait());
  assert.equal(saved.ok, true);
  assert.equal(saved.value.portraitKey, "portrait-1");
  assert.deepEqual(await portraitAdapter.keys(), ["portrait-1"]);
});

test("replacing a portrait removes the blob it superseded", async () => {
  const { commands, portraitAdapter } = harness();
  commands.createHero({ name: "Mara" });

  await commands.replaceHeroPortrait("hero-1", portrait("first"));
  const replaced = await commands.replaceHeroPortrait("hero-1", portrait("second"));

  assert.equal(replaced.ok, true);
  assert.equal(replaced.value.portraitKey, "portrait-2");
  assert.deepEqual(await portraitAdapter.keys(), ["portrait-2"]);
});

test("removing a portrait clears the record and deletes the blob", async () => {
  const { commands, portraitAdapter } = harness();
  commands.createHero({ name: "Mara" });
  await commands.replaceHeroPortrait("hero-1", portrait());

  const cleared = await commands.removeHeroPortrait("hero-1");
  assert.equal(cleared.ok, true);
  assert.equal(cleared.value.portraitKey, null);
  assert.deepEqual(await portraitAdapter.keys(), []);
});

test("retiring a hero deletes its stored portrait", async () => {
  const { commands, portraitAdapter } = harness();
  commands.createHero({ name: "Mara" });
  await commands.replaceHeroPortrait("hero-1", portrait());

  const retired = commands.removeHero("hero-1");
  assert.equal(retired.ok, true);
  await retired.cleanup;
  assert.deepEqual(await portraitAdapter.keys(), []);
});

test("a rejected portrait leaves the previous portrait active and stores nothing new", async () => {
  const { commands, portraitAdapter } = harness({
    decoder: createBrowserArtworkDecoder({}, HERO_PORTRAIT_LIMITS),
  });
  commands.createHero({ name: "Mara" });

  const rejected = await commands.replaceHeroPortrait("hero-1", new Blob(["nope"], { type: "text/plain" }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "artwork-invalid");
  assert.deepEqual(await portraitAdapter.keys(), []);
});

test("an oversized portrait is refused before anything is written", async () => {
  const oversized = new Blob([new Uint8Array(HERO_PORTRAIT_LIMITS.maxBytes + 1)], { type: "image/png" });
  const { commands, portraitAdapter } = harness({
    decoder: createBrowserArtworkDecoder({}, HERO_PORTRAIT_LIMITS),
  });
  commands.createHero({ name: "Mara" });

  const refused = await commands.replaceHeroPortrait("hero-1", oversized);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "artwork-too-large");
  assert.deepEqual(await portraitAdapter.keys(), []);
});

test("a failed portrait write never changes the hero record", async () => {
  const portraitAdapter = createMemoryArtworkAdapter();
  const { commands, heroRepository } = harness({ portraitAdapter });
  commands.createHero({ name: "Mara" });
  portraitAdapter.setFailureOperation("put");

  const failed = await commands.replaceHeroPortrait("hero-1", portrait());
  assert.equal(failed.ok, false);
  assert.equal(heroRepository.get("hero-1").value.portraitKey, null);
});

test("portrait blobs survive a Scene artwork orphan sweep", async () => {
  const { commands, portraitAdapter } = harness();
  commands.createHero({ name: "Mara" });
  await commands.replaceHeroPortrait("hero-1", portrait());

  const cleaned = await commands.cleanupPendingArtwork();
  assert.equal(cleaned.ok, true);
  assert.deepEqual(await portraitAdapter.keys(), ["portrait-1"]);
});

test("a persisted portrait key round-trips through storage", async () => {
  const { commands, heroRepository } = harness();
  commands.createHero({ name: "Mara" });
  await commands.replaceHeroPortrait("hero-1", portrait());

  const reloaded = heroRepository.get("hero-1");
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.value.portraitKey, "portrait-1");
});
