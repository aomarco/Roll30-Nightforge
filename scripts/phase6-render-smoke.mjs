import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: TableScreen }, { createSceneRecord }, { createPlayToken }] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const emptyPlay = createSceneRecord({ id: "play-empty", name: "Quiet Expanse", kind: "play" }, { id: "play-empty", now: "2026-08-16T12:00:00.000Z" });
  const emptyMarkup = renderToStaticMarkup(React.createElement(TableScreen, { ...handlers, scene: emptyPlay, mode: "play" }));
  assert.match(emptyMarkup, /Quiet Expanse/);
  assert.match(emptyMarkup, /Free play/);
  assert.match(emptyMarkup, /Build the cast/);
  assert.match(emptyMarkup, /No tokens are on this Table yet/);
  assert.match(emptyMarkup, /Table tools — 5 ft grid/);
  assert.match(emptyMarkup, /title="Scene settings"/);
  assert.doesNotMatch(emptyMarkup, /Thorin|Elara|Goblin|Starting stats|Conditions/);

  const playToken = createPlayToken({ id: "play-token", name: "Lantern Bearer" });
  const populatedPlay = createSceneRecord({
    id: "play-populated",
    name: "Moonlit Crossing",
    kind: "play",
    tokens: [playToken],
    blankCanvas: true,
    mapView: { scale: 1.4, x: 25, y: -18 },
  }, { id: "play-populated", now: "2026-08-16T12:00:00.000Z" });
  const playMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: populatedPlay,
    mode: "play",
    initialCamera: { x: 120, y: -40, zoom: 1.5 },
  }));
  assert.match(playMarkup, /Lantern Bearer/);
  assert.match(playMarkup, /Free position/);
  assert.match(playMarkup, /No turn limits/);
  assert.match(playMarkup, /Drag tokens freely across the Table/);
  assert.match(playMarkup, /translate\(120px, -40px\) scale\(1.5\)/);
  assert.match(playMarkup, /translate\(25px, -18px\) scale\(1.4\)/);
  assert.doesNotMatch(playMarkup, /track-order|piece-hp|Battle geometry/);

  const playTools = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: populatedPlay,
    mode: "play",
    initialDrawerOpen: true,
  }));
  assert.match(playTools, /Table instruments/);
  assert.match(playTools, /Zoom out/);
  assert.match(playTools, /Zoom in/);
  assert.match(playTools, /Reset camera/);
  assert.match(playTools, /Adjust artwork/);
  assert.match(playTools, /Scale down/);
  assert.match(playTools, /Scale up/);
  assert.match(playTools, /Reset artwork transform/);
  assert.doesNotMatch(playTools, /Battle geometry|Full wall|Half-wall|>Ruler<|Hide walls/);

  const battle = createSceneRecord({
    id: "battle-tools",
    name: "Iron Causeway",
    kind: "battle",
    gridSize: 52,
    walls: [{ id: "wall-existing", type: "half", points: [{ xPercent: 10, yPercent: 20 }, { xPercent: 70, yPercent: 80 }] }],
  }, { id: "battle-tools", now: "2026-08-16T12:00:00.000Z" });
  const battleTools = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "setup",
    initialDrawerOpen: true,
  }));
  assert.match(battleTools, /Battle geometry/);
  assert.match(battleTools, /Draw full wall/);
  assert.match(battleTools, /Draw half-wall/);
  assert.match(battleTools, / Ruler</);
  assert.match(battleTools, /Hide walls/);
  assert.match(battleTools, /--nf-grid-size:52px/);
  assert.match(battleTools, /nf-state-table-wall-half/);

  const activeArtwork = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: { ...populatedPlay, artworkKey: "artwork" },
    mode: "play",
    suppliedArtworkUrl: "blob:nightforge-artwork",
    initialTool: "artwork",
  }));
  assert.match(activeArtwork, /blob:nightforge-artwork/);
  assert.match(activeArtwork, /Drag the Table to adjust artwork/);
  assert.match(activeArtwork, /Exit current tool/);

  const rulerAndDraft = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "setup",
    initialTool: "ruler",
    initialRulerDraft: { start: { xPercent: 10, yPercent: 10 }, end: { xPercent: 40, yPercent: 30 } },
    initialWallDraft: { type: "full", points: [{ xPercent: 15, yPercent: 15 }, { xPercent: 45, yPercent: 35 }] },
  }));
  assert.match(rulerAndDraft, /nf-state-table-ruler-line/);
  assert.match(rulerAndDraft, /nf-state-table-wall-draft/);
  assert.match(rulerAndDraft, /Drag across the Table to measure/);

  const failed = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: populatedPlay,
    mode: "play",
    persistence: { status: "error", error: { message: "Scene save failed.", recovery: "Retry the Table change." } },
  }));
  assert.match(failed, /Table change not saved/);
  assert.match(failed, /Scene save failed/);
  assert.match(failed, /Retry the Table change/);

  for (const markup of [emptyMarkup, playMarkup, playTools, battleTools, activeArtwork, rulerAndDraft, failed]) {
    assert.doesNotMatch(markup, /[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u);
  }
  console.log("Phase 6 render smoke passed for empty/populated Play, camera/artwork transforms, Play/Battle tool drawers, walls, ruler, and failure states.");
} finally {
  await vite.close();
}
