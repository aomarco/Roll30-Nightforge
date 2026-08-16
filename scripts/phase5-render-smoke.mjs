import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: HeroesScreen }, { default: GearChapter }, { createHeroRecord }] = await Promise.all([
    vite.ssrLoadModule("/src/screens/HeroesScreen.jsx"),
    vite.ssrLoadModule("/src/screens/GearChapter.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
  ]);
  const inventory = [
    { itemId: "longsword", quantity: 1 },
    { itemId: "plate-armor", quantity: 1 },
    { itemId: "shield", quantity: 1 },
    { itemId: "ring-of-protection", quantity: 1 },
    { itemId: "arrow", quantity: 20 },
  ];
  const equipped = createHeroRecord({
    id: "gear-hero",
    name: "Mara Forge",
    inventory,
    loadout: { mainHand: "longsword" },
    armorId: "plate-armor",
    shieldId: "shield",
    enchantments: { longsword: 2, "plate-armor": 1 },
    wornItemIds: ["ring-of-protection"],
  }, { id: "gear-hero", now: "2026-08-16T00:00:00.000Z" });
  const handlers = {
    go: () => ({ ok: true }),
    onCreate: () => ({ ok: true }),
    onUpdate: (id, patch) => ({ ok: true, value: { ...equipped, ...patch, id } }),
    onRetire: () => ({ ok: true }),
  };

  const gear = renderToStaticMarkup(React.createElement(HeroesScreen, {
    ...handlers,
    heroes: [equipped],
    lifecycle: "ready",
    persistence: { status: "saved", error: null },
    initialChapter: "gear",
  }));
  assert.match(gear, /Gear &amp; treasures/);
  assert.match(gear, /5 unique · 24 total/);
  assert.match(gear, /Longsword \+2/);
  assert.match(gear, /Plate Armor \+1/);
  assert.match(gear, /Ring of Protection/);
  assert.match(gear, />Worn</);
  assert.match(gear, /Loadout/);
  assert.match(gear, /Owned equipment only/);
  assert.match(gear, /No attunement cap/);

  const emptyHero = createHeroRecord({}, { id: "empty-gear", now: "2026-08-16T00:00:00.000Z" });
  const empty = renderToStaticMarkup(React.createElement(GearChapter, { hero: emptyHero, apply: () => ({ ok: true }) }));
  assert.match(empty, /This pack is empty/);
  assert.match(empty, /Open Add item to choose from the Nightforge catalogs/);

  const catalog = renderToStaticMarkup(React.createElement(GearChapter, {
    hero: equipped,
    apply: () => ({ ok: true }),
    initialDrawer: { mode: "catalog" },
    initialFilters: { kind: "magic-item", text: "ring of protection" },
  }));
  assert.match(catalog, /The equipment ledger/);
  assert.match(catalog, /Add an item/);
  assert.match(catalog, /Item type/);
  assert.match(catalog, /Weapon class/);
  assert.match(catalog, /Armour class/);
  assert.match(catalog, /Gear category/);
  assert.match(catalog, /Magic rarity/);
  assert.match(catalog, /Weapon property/);
  assert.match(catalog, /Damage type/);
  assert.match(catalog, /Range band/);
  assert.match(catalog, /1 results/);
  assert.match(catalog, /Owned 1/);

  const weaponDrawer = renderToStaticMarkup(React.createElement(GearChapter, {
    hero: equipped,
    apply: () => ({ ok: true }),
    initialDrawer: { mode: "item", itemId: "longsword" },
  }));
  assert.match(weaponDrawer, /Equipment record/);
  assert.match(weaponDrawer, /Weapon loadout/);
  assert.match(weaponDrawer, /Main hand/);
  assert.match(weaponDrawer, /Magic bonus/);

  const magicDrawer = renderToStaticMarkup(React.createElement(GearChapter, {
    hero: equipped,
    apply: () => ({ ok: true }),
    initialDrawer: { mode: "item", itemId: "ring-of-protection" },
  }));
  assert.match(magicDrawer, /Implemented magic/);
  assert.match(magicDrawer, /\+1 AC and calculated saving throws/);
  assert.match(magicDrawer, />Worn</);

  for (const markup of [gear, empty, catalog, weaponDrawer, magicDrawer]) {
    assert.doesNotMatch(markup, /[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u);
  }
  console.log("Phase 5 render smoke passed for owned Gear, empty inventory, catalog filtering, equipment drawer, loadout continuation, and worn magic.");
} finally {
  await vite.close();
}
