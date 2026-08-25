import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
const [
  { default: AttackCinematic },
  { default: BattleTokenInspector },
  { default: ChestLootDrawer },
  { default: CoinEditor },
  { default: SetupRail },
  { createManualToken },
] = await Promise.all([
  vite.ssrLoadModule("/src/screens/AttackCinematic.jsx"),
  vite.ssrLoadModule("/src/screens/BattleTokenInspector.jsx"),
  vite.ssrLoadModule("/src/screens/ChestLootDrawer.jsx"),
  vite.ssrLoadModule("/src/screens/CoinEditor.jsx"),
  vite.ssrLoadModule("/src/screens/SetupRail.jsx"),
  vite.ssrLoadModule("/src/domain/table.js"),
]);

const noop = () => ({ ok: true });
const token = createManualToken({ id: "target", name: "Target", coins: { gp: 3 } });
const source = createManualToken({ id: "source", name: "Source" });

const coins = renderToStaticMarkup(React.createElement(CoinEditor, { coins: token.coins, onChange: noop, title: "Coin purse" }));
assert.match(coins, /Coin purse/);
assert.match(coins, /Gold coins/);
assert.match(coins, /3 GP/);

const battleInspector = renderToStaticMarkup(React.createElement(BattleTokenInspector, {
  token,
  activeToken: source,
  forceMove: noop,
  changeCoins: noop,
  changeCondition: noop,
  heal: noop,
  damage: noop,
  setTempHp: noop,
  rollSave: noop,
  rollCheck: noop,
}));
assert.match(battleInspector, /Forced movement/);
assert.match(battleInspector, /Push from Source/);
assert.match(battleInspector, /Pull toward Source/);
assert.match(battleInspector, /Slide north-east/);

const loot = renderToStaticMarkup(React.createElement(ChestLootDrawer, {
  chest: { id: "chest", inventory: [], coins: { gp: 2 } },
  take: noop,
  takeCoin: noop,
  close: noop,
}));
assert.match(loot, /Gold coin/);
assert.match(loot, /×2/);

const rail = renderToStaticMarkup(React.createElement(SetupRail, {
  chooseTool: noop,
  summonToken: noop,
  openMonsterBrowser: noop,
  addChest: noop,
  zoomIn: noop,
  zoomOut: noop,
  resetView: noop,
  toggleWalls: noop,
  setPickerOpen: noop,
}));
assert.match(rail, /High cover/);
assert.match(rail, /grants \+5 AC/);

const cinematic = renderToStaticMarkup(React.createElement(AttackCinematic, {
  cinematic: {
    stage: "modifiers",
    outcome: {
      kind: "action", attackerName: "Archer", targetName: "Target", weaponName: "Shortbow",
      range: { distanceFeet: 20 }, mode: "normal", rolls: [12], selectedIndex: 0, naturalRoll: 12,
      ability: { ability: "dex", modifier: 2 }, proficiency: 2, magicAttackBonus: 0,
      attackBonus: 4, attackTotal: 16, targetAc: 17, coverBonus: 5, coverLevel: "three-quarters",
      sources: [], hit: false, critical: false, verdict: "miss", damage: null,
    },
  },
  skip: noop,
}));
assert.match(cinematic, /three-quarters cover \+5/);

console.log("Workflow feature render smoke passed for coins, forced movement, loot, cover tools, and cover cinematic.");
} finally {
  await vite.close();
}
