import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: TableScreen }, { createHeroRecord, createSceneRecord }, table] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-16T13:00:00.000Z";
  const hero = createHeroRecord({
    name: "Mira Ashfall",
    classId: "fighter",
    raceId: "human",
    level: 5,
    baseAbilities: { str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 },
    inventory: [{ itemId: "longsword", quantity: 1 }, { itemId: "chain-mail", quantity: 1 }, { itemId: "shield", quantity: 1 }],
    loadout: { mainHand: "longsword", offHand: null },
    armorId: "chain-mail",
    shieldId: "shield",
  }, { id: "hero-mira", now });
  const manual = table.createManualToken({ id: "manual-guard", name: "Gate Guard", position: { xPercent: 25, yPercent: 25 } });
  const heroToken = table.createHeroTokenSnapshot(hero, { id: "hero-snapshot", position: { xPercent: 65, yPercent: 35 }, ordinal: 1 });
  const chest = table.createChest({ id: "cache", position: { xPercent: 45, yPercent: 65 }, inventory: [{ itemId: "dagger", quantity: 2 }] });
  const setup = createSceneRecord({
    id: "battle-setup",
    name: "Ashen Gate",
    kind: "battle",
    tokens: [manual, heroToken],
    chests: [chest],
  }, { id: "battle-setup", now });

  const manualMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: setup,
    mode: "setup",
    heroes: [hero],
    initialSelectedId: manual.id,
  }));
  assert.match(manualMarkup, /Ashen Gate/);
  assert.match(manualMarkup, /Setup mode/);
  assert.match(manualMarkup, /Blank token/);
  assert.match(manualMarkup, /Mira Ashfall/);
  assert.match(manualMarkup, /Place a chest/);
  assert.match(manualMarkup, /Gate Guard/);
  assert.match(manualMarkup, /Manual token/);
  assert.match(manualMarkup, /Editable token/);
  assert.match(manualMarkup, /Save token details/);
  assert.match(manualMarkup, /Initiative bonus/);
  assert.match(manualMarkup, /Creature size/);
  assert.match(manualMarkup, /Gear &amp; treasures/);
  assert.match(manualMarkup, /Loadout/);
  assert.match(manualMarkup, /Chest 1/);
  assert.match(manualMarkup, /aria-label="Chest with 2 items, use arrow keys to move"/);
  assert.doesNotMatch(manualMarkup, /Thorin|Elara|Goblin/);

  const heroMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: setup,
    mode: "setup",
    heroes: [hero],
    initialSelectedId: heroToken.id,
  }));
  assert.match(heroMarkup, /Hero snapshot/);
  assert.match(heroMarkup, /Read only/);
  assert.match(heroMarkup, /Later Hero edits do not change this token/);
  assert.match(heroMarkup, /Strength/);
  assert.match(heroMarkup, /Dexterity/);
  assert.match(heroMarkup, /Initiative/);
  assert.match(heroMarkup, /Only owned equipment is listed/);

  const chestMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: setup,
    mode: "setup",
    heroes: [hero],
    initialSelectedId: null,
    initialSelectedChestId: chest.id,
  }));
  assert.match(chestMarkup, /Selected chest/);
  assert.match(chestMarkup, /Battle chest/);
  assert.match(chestMarkup, /Blocks movement/);
  assert.match(chestMarkup, /Dagger/);
  assert.match(chestMarkup, /Open chest inventory/);
  assert.match(chestMarkup, /Remove chest/);

  const started = table.prepareBattleStart(setup, {
    viewport: { width: 880, height: 528, gridSize: 44 },
    random: (() => { const values = [0.9, 0.2]; return () => values.shift(); })(),
  }).value;
  const active = createSceneRecord({ ...setup, ...started }, { id: setup.id, now });
  const battleMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: active,
    mode: "battle",
    heroes: [hero],
    initialSelectedId: manual.id,
  }));
  assert.match(battleMarkup, /Battle running/);
  assert.match(battleMarkup, /Round 1/);
  assert.match(battleMarkup, /Token and chest creation are locked/);
  assert.match(battleMarkup, /track-order/);
  assert.match(battleMarkup, new RegExp(`>${active.encounter.initiatives[manual.id]}<`));
  assert.match(battleMarkup, /Tokens cannot be removed during an active Battle/);
  assert.match(battleMarkup, /Conditions.*None/s);
  assert.doesNotMatch(battleMarkup, /Save token details|Open chest inventory/);

  const lockedChestMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: active,
    mode: "battle",
    heroes: [hero],
    initialSelectedId: null,
    initialSelectedChestId: chest.id,
  }));
  assert.match(lockedChestMarkup, /Bonus Action/);
  assert.match(lockedChestMarkup, /depleted contents persist through restart/);
  assert.match(lockedChestMarkup, /Chest movement and Setup editing stay locked/);
  assert.match(lockedChestMarkup, /Dagger/);

  const abandonMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: active,
    mode: "battle",
    heroes: [hero],
    initialAbandonOpen: true,
  }));
  assert.match(abandonMarkup, /Abandon this encounter/);
  assert.match(abandonMarkup, /Current token HP and positions are preserved/);
  assert.match(abandonMarkup, /Continue Battle/);
  assert.match(abandonMarkup, /Abandon Battle/);

  const failureMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: setup,
    mode: "setup",
    persistence: { status: "failed", error: { message: "Setup storage failed.", recovery: "Retry safely." } },
  }));
  assert.match(failureMarkup, /Table change not saved/);
  assert.match(failureMarkup, /Setup storage failed/);
  assert.doesNotMatch(failureMarkup, /Â|âˆ|â€”|â€¦|�/);

  console.log("Phase 7 render smoke passed for manual/Hero Setup, inventory/loadout, chests, active Battle, abandon confirmation, and failure states.");
} finally {
  await vite.close();
}
