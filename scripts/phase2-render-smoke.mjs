import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ default: LibraryScreen }, { CommandDeck }, { default: SceneScreen }, { default: TableScreen }] =
    await Promise.all([
      vite.ssrLoadModule("/src/screens/LibraryScreen.jsx"),
      vite.ssrLoadModule("/src/App.jsx"),
      vite.ssrLoadModule("/src/screens/SceneScreen.jsx"),
      vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    ]);

  const scenes = [
    {
      id: "scene-recent",
      name: "The Sunken Crypt",
      kind: "battle",
      gridSize: 44,
      artworkKey: null,
      encounter: null,
      createdAt: "2026-08-12T01:00:00Z",
      updatedAt: "2026-08-12T01:00:00Z",
      lastOpenedAt: "2026-08-12T03:00:00Z",
    },
    {
      id: "scene-play",
      name: "Moonlit Parley",
      kind: "play",
      gridSize: 44,
      artworkKey: null,
      encounter: null,
      createdAt: "2026-08-12T02:00:00Z",
      updatedAt: "2026-08-12T02:00:00Z",
      lastOpenedAt: null,
    },
  ];
  const handlers = {
    go: () => {},
    onForge: () => ({ ok: true }),
    onOpen: () => ({ ok: true }),
    onSettings: () => ({ ok: true }),
    onDelete: () => ({ ok: true }),
  };

  const library = renderToStaticMarkup(
    React.createElement(LibraryScreen, {
      ...handlers,
      scenes,
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
    }),
  );
  assert.match(library, /The Sunken Crypt/);
  assert.match(library, /Moonlit Parley/);
  assert.match(library, />2<\/span>/);
  assert.doesNotMatch(library, /Goblin Ambush|Tavern of the Salty Dog|Dragon's Lair/);

  const emptyLibrary = renderToStaticMarkup(
    React.createElement(LibraryScreen, {
      ...handlers,
      scenes: [],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
    }),
  );
  assert.match(emptyLibrary, /The vault is ready/);
  assert.match(emptyLibrary, /Forge a Play scene/);

  const recoveredLibrary = renderToStaticMarkup(
    React.createElement(LibraryScreen, {
      ...handlers,
      scenes,
      lifecycle: "ready",
      persistence: { status: "saved", error: null, recovered: true },
    }),
  );
  assert.match(recoveredLibrary, /restored the backup vault/);

  const deckWithoutScene = renderToStaticMarkup(
    React.createElement(CommandDeck, {
      route: { page: "home" },
      go: () => {},
      activeScene: null,
    }),
  );
  assert.match(deckWithoutScene, /disabled=""/);
  assert.match(deckWithoutScene, /Choose or Forge a Scene first/);

  const deckWithScene = renderToStaticMarkup(
    React.createElement(CommandDeck, {
      route: { page: "home" },
      go: () => {},
      activeScene: scenes[0],
    }),
  );
  assert.doesNotMatch(deckWithScene, /Choose or Forge a Scene first/);

  const workbench = renderToStaticMarkup(
    React.createElement(SceneScreen, { scene: scenes[0], go: () => {} }),
  );
  assert.match(workbench, /The Sunken Crypt/);

  const playTable = renderToStaticMarkup(
    React.createElement(TableScreen, {
      scene: scenes[1],
      mode: "play",
      go: () => {},
      setMode: () => {},
    }),
  );
  assert.match(playTable, /Moonlit Parley/);
  assert.match(playTable, /Free play/);
  assert.doesNotMatch(playTable, />Setup<|>Battle</);
  assert.match(playTable, /Table tools — 5 ft grid/);

  console.log("Phase 2 render smoke passed for populated, empty, guarded, settings, and Play Table states.");
} finally {
  await vite.close();
}
