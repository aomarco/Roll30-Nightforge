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
  const [{ default: SceneScreen }, { default: TableScreen }] = await Promise.all([
    vite.ssrLoadModule("/src/screens/SceneScreen.jsx"),
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
  ]);

  const battle = {
    id: "scene-battle",
    name: "The Ember Vault",
    kind: "battle",
    gridSize: 68,
    artworkKey: null,
    blankCanvas: false,
    encounter: null,
  };
  const play = {
    ...battle,
    id: "scene-play",
    name: "Quiet Observatory",
    kind: "play",
    blankCanvas: true,
  };
  const handlers = {
    go: () => ({ ok: true }),
    onUpdate: () => ({ ok: true, value: battle }),
    onReplaceArtwork: async () => ({ ok: true }),
    onUseWhiteCanvas: async () => ({ ok: true }),
  };

  const battleWorkbench = renderToStaticMarkup(
    React.createElement(SceneScreen, {
      ...handlers,
      scene: battle,
      returnTo: { page: "board", mode: "setup" },
      persistence: { status: "saved", error: null },
    }),
  );
  assert.match(battleWorkbench, /The Ember Vault/);
  assert.match(battleWorkbench, /68px/);
  assert.match(battleWorkbench, /background-size:68px 68px/);
  assert.match(battleWorkbench, / Table<\/button>/);
  assert.match(battleWorkbench, /Changes save automatically to this browser/);

  const playWorkbench = renderToStaticMarkup(
    React.createElement(SceneScreen, {
      ...handlers,
      scene: play,
      returnTo: { page: "home" },
      persistence: { status: "saved", error: null },
    }),
  );
  assert.match(playWorkbench, /White canvas/);
  assert.match(playWorkbench, /background-color:#fff/);
  assert.match(playWorkbench, / Library<\/button>/);
  assert.doesNotMatch(playWorkbench, /Battle scale|rig-grid/);

  const failedWorkbench = renderToStaticMarkup(
    React.createElement(SceneScreen, {
      ...handlers,
      scene: battle,
      persistence: {
        status: "error",
        error: { message: "Save failed.", recovery: "Retry the edit." },
      },
    }),
  );
  assert.match(failedWorkbench, /Not saved/);
  assert.match(failedWorkbench, /Save failed/);
  assert.match(failedWorkbench, /Retry the edit/);

  const table = renderToStaticMarkup(
    React.createElement(TableScreen, {
      scene: battle,
      mode: "setup",
      go: () => ({ ok: true }),
      setMode: () => {},
    }),
  );
  assert.match(table, /title="Scene settings"/);

  console.log("Phase 3 render smoke passed for Battle, Play, blank-canvas, error, and Table-return states.");
} finally {
  await vite.close();
}
