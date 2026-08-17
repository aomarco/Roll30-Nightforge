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
  const [
    { default: LibraryScreen },
    { default: HeroesScreen },
    { default: TableScreen },
    { ITEM_CATALOG },
    { createHeroRecord, createSceneRecord },
    { createManualToken, createTurnResources },
  ] = await Promise.all([
    vite.ssrLoadModule("/src/screens/LibraryScreen.jsx"),
    vite.ssrLoadModule("/src/screens/HeroesScreen.jsx"),
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/domain/catalog.js"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);

  const LONG_NAME = "The Last Sentinel of the Verdigris Archive and Keeper of the Unbroken Nightforge Oath";
  const okay = () => ({ ok: true });
  const handlers = {
    go: okay,
    onForge: okay,
    onOpen: okay,
    onSettings: okay,
    onDelete: okay,
  };
  const persistence = { status: "saved", error: null };

  const loadingMarkup = renderToStaticMarkup(React.createElement(LibraryScreen, {
    ...handlers,
    scenes: [],
    lifecycle: "booting",
    persistence: { status: "idle", error: null },
  }));
  assert.match(loadingMarkup, /Opening campaign vault/);
  assert.match(loadingMarkup, /Gathering your scenes…/);
  assert.match(loadingMarkup, /Nightforge is restoring this browser’s campaign state/);
  assert.match(loadingMarkup, /Forge a scene[\s\S]*disabled=""/);

  const emptyMarkup = renderToStaticMarkup(React.createElement(LibraryScreen, {
    ...handlers,
    scenes: [],
    lifecycle: "ready",
    persistence,
  }));
  assert.match(emptyMarkup, /The vault is ready/);
  assert.match(emptyMarkup, /Forge a Play scene for open roleplay or a Battle scene/);
  assert.match(emptyMarkup, /class="tag tag-jade numeral">0</);

  const quotaMarkup = renderToStaticMarkup(React.createElement(LibraryScreen, {
    ...handlers,
    scenes: [],
    lifecycle: "ready",
    persistence: {
      status: "error",
      error: {
        message: "Nightforge browser storage is full.",
        recovery: "Free browser storage and retry. Your previous valid state remains intact.",
      },
    },
  }));
  assert.match(quotaMarkup, /role="alert"/);
  assert.match(quotaMarkup, /Nightforge browser storage is full/);
  assert.match(quotaMarkup, /previous valid state remains intact/);

  const backupRecoveryMarkup = renderToStaticMarkup(React.createElement(LibraryScreen, {
    ...handlers,
    scenes: [],
    lifecycle: "ready",
    persistence: { ...persistence, recovered: true, recoverySource: "backup" },
  }));
  assert.match(backupRecoveryMarkup, /Nightforge recovered safely/);
  assert.match(backupRecoveryMarkup, /restored the backup vault/);

  const cleanRecoveryMarkup = renderToStaticMarkup(React.createElement(LibraryScreen, {
    ...handlers,
    scenes: [],
    lifecycle: "ready",
    persistence: { ...persistence, recovered: true, recoverySource: "empty" },
  }));
  assert.match(cleanRecoveryMarkup, /clean vault was opened without overwriting them/);

  const hero = createHeroRecord({
    id: "phase11-hero",
    name: LONG_NAME,
    classId: "fighter",
    raceId: "half-elf",
    background: "Archivist of a deliberately long and storied ceremonial order",
    inventory: ITEM_CATALOG.map((item, index) => ({ itemId: item.id, quantity: index + 1 })),
  }, { id: "phase11-hero", now: "2026-08-17T12:00:00.000Z" });
  const gearMarkup = renderToStaticMarkup(React.createElement(HeroesScreen, {
    heroes: [hero],
    lifecycle: "ready",
    persistence,
    go: okay,
    onCreate: okay,
    onUpdate: okay,
    onRetire: okay,
    initialChapter: "gear",
  }));
  assert.match(gearMarkup, new RegExp(LONG_NAME));
  assert.equal((gearMarkup.match(/class="loot loot-/g) || []).length, ITEM_CATALOG.length);
  assert.match(gearMarkup, /Search your inventory…/);

  const tokens = Array.from({ length: 180 }, (_, index) => createManualToken({
    id: `phase11-token-${index}`,
    ordinal: index,
    name: index === 0 ? LONG_NAME : `Combatant ${String(index + 1).padStart(3, "0")}`,
    position: {
      xPercent: 2.5 + (index % 20) * 4.8,
      yPercent: 5 + Math.floor(index / 20) * 10.8,
    },
  }));
  const active = tokens[0];
  const scene = createSceneRecord({
    id: "phase11-large-table",
    name: LONG_NAME,
    kind: "battle",
    tokens,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map((token) => token.id),
      initiatives: Object.fromEntries(tokens.map((token, index) => [token.id, 1000 - index])),
      activeIndex: 0,
      round: 11,
      resources: { [active.id]: createTurnResources(active) },
      battleItems: [],
      ammoSpentByToken: {},
      ammunitionRecovered: false,
      winnerTokenId: null,
      log: [],
    },
  }, { id: "phase11-large-table", now: "2026-08-17T12:00:00.000Z" });
  const tableMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    scene,
    heroes: [hero],
    mode: "battle",
    go: okay,
    setMode: okay,
    onUpdate: okay,
    persistence,
    initialSelectedId: active.id,
  }));
  assert.equal((tableMarkup.match(/class="cast-row\b/g) || []).length, 180);
  assert.equal((tableMarkup.match(/class="track-face"/g) || []).length, 180);
  assert.match(tableMarkup, new RegExp(LONG_NAME));
  assert.match(tableMarkup, /Round 11/);
  assert.match(tableMarkup, /title="The Last Sentinel of the Verdigris Archive/);

  for (const markup of [
    loadingMarkup,
    emptyMarkup,
    quotaMarkup,
    backupRecoveryMarkup,
    cleanRecoveryMarkup,
    gearMarkup,
    tableMarkup,
  ]) {
    assert.doesNotMatch(markup, /[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u);
  }

  console.log("Phase 11 render smoke passed for loading, empty, success, error, recovery, long-content, complete-inventory, and 180-token states.");
} finally {
  await vite.close();
}
