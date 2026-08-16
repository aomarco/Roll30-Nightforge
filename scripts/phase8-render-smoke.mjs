import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: TableScreen }, { createSceneRecord }, combat, table] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/combat.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-17T12:00:00.000Z";
  const viewport = { width: 440, height: 440, gridSize: 44 };
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);
  const vanguard = table.createManualToken({
    id: "vanguard",
    name: "Vanguard",
    position: at(1, 1),
    baseSpeed: 10,
    inventory: [{ itemId: "club", quantity: 1 }, { itemId: "dagger", quantity: 2 }],
    loadout: { mainHand: "club", offHand: null },
  });
  const rival = table.createManualToken({ id: "rival", name: "Rival", position: at(9, 9), baseSpeed: 30 });
  const makeBattle = (resources = table.createTurnResources(vanguard)) => createSceneRecord({
    id: "phase8-render",
    name: "Route of Embers",
    kind: "battle",
    gridSize: 44,
    tokens: [vanguard, rival],
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: [vanguard.id, rival.id],
      initiatives: { [vanguard.id]: 18, [rival.id]: 13 },
      activeIndex: 0,
      round: 2,
      resources: { [vanguard.id]: resources },
      battleItems: [],
      ammoSpentByToken: {},
      winnerTokenId: null,
      log: [],
    },
  }, { id: "phase8-render", now });

  const battle = makeBattle();
  const preview = combat.planActiveMovement(battle, vanguard.id, at(8, 1), viewport);
  assert.equal(preview.ok, true);
  assert.equal(preview.value.overBudget, true);
  const routeMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialSelectedId: vanguard.id,
    initialMovementPreview: preview,
  }));
  assert.match(routeMarkup, /nf-state-table-movement-route/);
  assert.match(routeMarkup, /nf-state-table-movement-reachable/);
  assert.match(routeMarkup, /nf-state-table-movement-over/);
  assert.match(routeMarkup, /nf-state-table-movement-start/);
  assert.match(routeMarkup, /10 ft · limit/);
  assert.match(routeMarkup, /10 ft reachable · 25 ft over/);
  assert.match(routeMarkup, /left:15%;top:15%/);
  assert.match(routeMarkup, /Round 2/);
  assert.match(routeMarkup, /10 \/ 10 ft/);
  assert.ok(routeMarkup.indexOf("Vanguard") < routeMarkup.indexOf("Rival"));
  assert.match(routeMarkup, />18<.*>13</s);
  assert.match(routeMarkup, /<button class="pip-key nf-state-command-pip"[^>]*aria-label="Open Combat Commands"/);
  assert.match(routeMarkup, /aria-label="Bonus Commands — Phase 9" disabled=""/);

  const commandMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialCommandOpen: true,
    initialSwapOpen: true,
    initialSwapDraft: { mainHand: "dagger", offHand: "dagger" },
  }));
  assert.match(commandMarkup, /role="dialog"/);
  assert.match(commandMarkup, /combat-commands-title/);
  assert.match(commandMarkup, /Vanguard.*s turn/);
  assert.match(commandMarkup, /10 \/ 10 ft/);
  assert.match(commandMarkup, /Attack.*Phase 9/s);
  assert.match(commandMarkup, /Dash.*Add 10 ft/s);
  assert.match(commandMarkup, /Swap weapons.*Once this turn/s);
  assert.match(commandMarkup, /Swap draft/);
  assert.match(commandMarkup, /Confirm weapon swap/);
  assert.doesNotMatch(commandMarkup, /Choose another loadout/);
  const commandFooter = commandMarkup.match(/<div class="drawer-foot">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(commandFooter, /End Turn/);
  assert.doesNotMatch(commandFooter, /disabled/);

  const dashed = makeBattle({
    ...table.createTurnResources(vanguard),
    movementBase: 20,
    actionSpent: true,
    actionType: "dash",
    dashed: true,
  });
  const dashedMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: dashed,
    mode: "battle",
    initialCommandOpen: true,
  }));
  assert.match(dashedMarkup, /20 \/ 20 ft/);
  assert.match(dashedMarkup, /Dash was already used this turn/);
  assert.match(dashedMarkup, /Attack is unavailable after Dash/);
  assert.match(dashedMarkup, /Weapon Swap is unavailable after Dash/);
  assert.match(dashedMarkup, /nf-state-command-pip spent/);
  const dashedFooter = dashedMarkup.match(/<div class="drawer-foot">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(dashedFooter, /End Turn/);
  assert.doesNotMatch(dashedFooter, /disabled/);

  const movedAfterSwap = makeBattle({
    ...table.createTurnResources(vanguard),
    movementSpent: 5,
    swapped: true,
    swapChoice: "movement",
  });
  const branchMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: movedAfterSwap,
    mode: "battle",
    initialCommandOpen: true,
  }));
  assert.match(branchMarkup, /5 \/ 10 ft/);
  assert.match(branchMarkup, /Attack is unavailable after moving in the weapon-swap branch/);
  assert.match(branchMarkup, /Dash is unavailable after a weapon swap/);
  assert.match(branchMarkup, /Weapons were already swapped this turn/);

  const failureMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialCommandOpen: true,
    persistence: { status: "failed", error: { message: "Turn command storage failed.", recovery: "Retry safely." } },
  }));
  assert.match(failureMarkup, /Command not completed/);
  assert.match(failureMarkup, /Turn command storage failed/);
  assert.doesNotMatch(failureMarkup, /Â|âˆ|â€”|â€¦|�/);

  console.log("Phase 8 render smoke passed for initiative order, route preview, movement resources, command availability, Swap drafting, End Turn reachability, and failure states.");
} finally {
  await vite.close();
}
