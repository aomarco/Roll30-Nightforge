import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: TableScreen }, { default: HeroesScreen }, records, table, heroes] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/screens/HeroesScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
    vite.ssrLoadModule("/src/domain/heroes.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-24T12:00:00.000Z";
  const viewport = table.sceneViewport(44);
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);

  const scout = table.createManualToken({
    id: "scout", name: "Sky Scout", faction: "ally", position: at(2, 2), hp: 12, maxHp: 20,
    speeds: { walk: 30, fly: 60, swim: 20, climb: 15 }, surprised: true,
    conditionImmunities: ["poisoned"], inventory: [{ itemId: "club", quantity: 1 }, { itemId: "potion-of-healing-common", quantity: 1 }],
    loadout: { mainHand: "club", offHand: null },
  });
  const guard = table.createManualToken({
    id: "guard", name: "Iron Guard", faction: "foe", position: at(3, 2), hp: 20, maxHp: 20,
    inventory: [{ itemId: "club", quantity: 1 }], loadout: { mainHand: "club", offHand: null },
    conditions: ["prone"], conditionExpiries: { prone: 4 },
  });

  const setup = records.createSceneRecord({
    id: "expansion-setup", name: "Expansion Setup", kind: "battle", blankCanvas: true, tokens: [scout, guard],
  }, { id: "expansion-setup", now });
  const setupMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers, scene: setup, mode: "setup", initialSelectedId: "scout", initialInspectorDrawer: "stats",
  }));
  assert.match(setupMarkup, /Surprised in round one/);
  assert.match(setupMarkup, /Condition immunity/);
  assert.match(setupMarkup, /Poisoned/);
  assert.match(setupMarkup, /Fly speed/);
  assert.match(setupMarkup, /value="60"/);

  const encounter = {
    version: 1, status: "active", initiativeOrder: [scout.id, guard.id],
    initiatives: { scout: 20, guard: 10 }, activeIndex: 0, round: 2,
    surprisedTokenIds: [scout.id], resources: { scout: table.createTurnResources(scout) },
    battleItems: [], ammoSpentByToken: {}, winnerTokenId: null, log: [],
  };
  const battle = records.createSceneRecord({
    ...setup, id: "expansion-battle", difficultTerrain: ["4:2"], encounter,
  }, { id: "expansion-battle", now });
  const battleMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers, scene: battle, mode: "battle", initialSelectedId: "guard", initialCommandPanel: "tactics",
  }));
  for (const expected of [
    "Ready an attack", "Target moves", "Grapple", "Shove prone", "Push 5 feet",
    "Potion of Healing", "Movement mode", "1 difficult terrain squares", "round 4",
  ]) assert.match(battleMarkup, new RegExp(expected));

  const baseHero = records.createHeroRecord({ id: "hero-background", name: "Mara" }, { id: "hero-background", now });
  const soldier = heroes.applyBackgroundBenefits(baseHero, "soldier");
  const backgroundHero = records.createHeroRecord({ ...baseHero, ...soldier.value }, { id: "hero-background", now });
  const heroMarkup = renderToStaticMarkup(React.createElement(HeroesScreen, {
    heroes: [backgroundHero], lifecycle: "ready", persistence: { status: "saved", error: null },
    go: handlers.go, onCreate: handlers.go, onUpdate: handlers.go, onRetire: handlers.go,
  }));
  assert.match(heroMarkup, /Soldier/);
  assert.match(heroMarkup, /Athletics \+ Intimidation/);
  assert.match(heroMarkup, /vehicles-land/);
  assert.match(heroMarkup, /starting gear added/);
  assert.match(heroMarkup, /Athletics[\s\S]{0,300}background/);

  for (const markup of [setupMarkup, battleMarkup, heroMarkup]) assert.doesNotMatch(markup, /Ãƒ.|Ã¢â‚¬|Ã‚./);
  console.log("Expansion render smoke: setup immunities/surprise/speeds, timed conditions, Ready, potions, grapple/shove, movement modes, terrain, and background grants.");
} finally {
  await vite.close();
}
