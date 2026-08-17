import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [
    { default: TableScreen },
    { default: ChestLootDrawer },
    { default: RetrievalCinematic },
    encounter,
    { createSceneRecord },
    table,
  ] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/screens/ChestLootDrawer.jsx"),
    vite.ssrLoadModule("/src/screens/RetrievalCinematic.jsx"),
    vite.ssrLoadModule("/src/domain/encounter.js"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-17T19:00:00.000Z";
  const viewport = { width: 880, height: 528, gridSize: 44 };
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);
  const active = table.createManualToken({
    id: "ranger",
    name: "Ranger",
    position: at(1, 1),
    strength: 16,
    dexterity: 14,
    inventory: [
      { itemId: "longsword", quantity: 1 },
      { itemId: "shortbow", quantity: 1 },
      { itemId: "arrow", quantity: 7 },
    ],
    loadout: { mainHand: "longsword", offHand: null },
  });
  const carrier = table.createManualToken({ id: "carrier", name: "Carrier", position: at(2, 1), hp: 12, maxHp: 12 });
  const witness = table.createManualToken({ id: "witness", name: "Witness", position: at(8, 8), hp: 15, maxHp: 15 });
  const chest = table.createChest({ id: "loot", position: at(1, 2), inventory: [{ itemId: "dagger", quantity: 2 }, { itemId: "arrow", quantity: 3 }] });
  const battleItems = [
    { id: "ground-spear", itemId: "spear", state: "ground", position: at(2, 2), carrierTokenId: null, sourceTokenId: "ranger" },
    { id: "embedded-javelin", itemId: "javelin", state: "embedded", position: null, carrierTokenId: "carrier", sourceTokenId: "ranger" },
  ];
  const makeScene = ({
    tokens = [active, carrier, witness],
    chests = [chest],
    status = "active",
    resources = table.createTurnResources(active),
    physicalItems = battleItems,
    ammoSpentByToken = { ranger: { arrow: 5 } },
    ammunitionRecovered = false,
    winnerTokenId = null,
  } = {}) => createSceneRecord({
    id: "phase10-render",
    name: "Vault Finale",
    kind: "battle",
    gridSize: 44,
    tokens,
    chests,
    encounter: {
      version: 1,
      status,
      initiativeOrder: tokens.map(({ id }) => id),
      initiatives: { ranger: 18, carrier: 12, witness: 8 },
      activeIndex: 0,
      round: 4,
      resources: { ranger: resources },
      battleItems: physicalItems,
      ammoSpentByToken,
      ammunitionRecovered,
      winnerTokenId,
      log: [],
    },
  }, { id: "phase10-render", now });

  const activeScene = makeScene();
  const mapMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: activeScene,
    mode: "battle",
    initialSelectedId: "ranger",
  }));
  assert.match(mapMarkup, /nf-state-table-chest-eligible/);
  assert.match(mapMarkup, /aria-label="Open adjacent chest with 5 items"/);
  assert.equal((mapMarkup.match(/nf-state-battle-item /g) || []).length, 2);
  assert.match(mapMarkup, /nf-state-battle-item-ground nf-state-battle-item-eligible/);
  assert.match(mapMarkup, /nf-state-battle-item-embedded nf-state-battle-item-eligible/);
  assert.match(mapMarkup, /Embedded weapons/);
  assert.match(mapMarkup, /Javelin/);
  assert.match(mapMarkup, /Battle inventory/);
  assert.match(mapMarkup, /Arrow/);
  assert.match(mapMarkup, /×7/);
  assert.match(mapMarkup, /aria-label="1 embedded weapon"/);

  const bonusMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: activeScene,
    mode: "battle",
    initialBonusOpen: true,
  }));
  assert.match(bonusMarkup, /Battle chests/);
  assert.match(bonusMarkup, /Chest 1/);
  assert.match(bonusMarkup, /5 items · adjacent/);
  assert.match(bonusMarkup, /Physical weapons/);
  assert.match(bonusMarkup, /Retrieve Spear/);
  assert.match(bonusMarkup, /Retrieve Javelin/);
  assert.match(bonusMarkup, /living carrier · bonus/);
  assert.doesNotMatch(bonusMarkup, /Phase 10/);

  const openedResources = {
    ...table.createTurnResources(active),
    bonusActionSpent: true,
    bonusActionType: "open chest",
    openedChestId: "loot",
  };
  const openedScene = makeScene({ resources: openedResources });
  const lootMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: openedScene,
    mode: "battle",
    initialLootChestId: "loot",
  }));
  assert.match(lootMarkup, /Opened chest/);
  assert.match(lootMarkup, /Take one item/);
  assert.match(lootMarkup, /5 remaining/);
  assert.match(lootMarkup, /Dagger/);
  assert.match(lootMarkup, /×2/);
  assert.match(lootMarkup, /Each Take transfers exactly one unit/);

  const emptyChest = table.createChest({ id: "empty", position: at(1, 2), inventory: [] });
  const emptyMarkup = renderToStaticMarkup(React.createElement(ChestLootDrawer, {
    chest: emptyChest,
    take: () => {},
    close: () => {},
  }));
  assert.match(emptyMarkup, /Chest depleted/);
  assert.match(emptyMarkup, /restart will not refill it/);

  const retrieval = encounter.retrieveBattleItem(activeScene, "embedded-javelin", viewport, { random: () => 0.7 });
  assert.equal(retrieval.ok, true);
  for (const stage of ["spin", "natural", "modifiers", "verdict", "impact"]) {
    const markup = renderToStaticMarkup(React.createElement(RetrievalCinematic, { cinematic: { outcome: retrieval.outcome, stage } }));
    assert.match(markup, new RegExp(`nf-state-cinematic-${stage}`));
    assert.match(markup, /Weapon retrieval/);
    assert.match(markup, /Javelin/);
    assert.match(markup, /DC 15/);
    if (stage === "spin") assert.match(markup, />\?<small/);
    if (["verdict", "impact"].includes(stage)) assert.match(markup, /Weapon retrieved/);
  }
  const retrievalFailureMarkup = renderToStaticMarkup(React.createElement(RetrievalCinematic, {
    cinematic: { outcome: retrieval.outcome, stage: "failed", error: { message: "Storage refused retrieval.", recovery: "Retry safely." } },
  }));
  assert.match(retrievalFailureMarkup, /Retrieval was not saved/);
  assert.match(retrievalFailureMarkup, /Storage refused retrieval/);

  const completedTokens = [
    { ...active, hp: active.maxHp },
    { ...carrier, hp: 0 },
    { ...witness, hp: 0 },
  ];
  const completedScene = makeScene({
    tokens: completedTokens,
    chests: [emptyChest],
    status: "complete",
    ammunitionRecovered: true,
    winnerTokenId: "ranger",
  });
  const completeMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: completedScene,
    mode: "battle",
  }));
  assert.match(completeMarkup, /nf-state-battle-complete-root/);
  assert.match(completeMarkup, /Battle complete/);
  assert.match(completeMarkup, /Ranger wins/);
  assert.match(completeMarkup, /2 of 5 fired ammunition recovered/);
  assert.match(completeMarkup, /Restart Battle/);
  assert.match(completeMarkup, /No ammunition recovery was required|Arrow/);
  assert.doesNotMatch(completeMarkup, /class="track glass grained"/);
  assert.doesNotMatch(completeMarkup, /aria-label="Open Combat Commands"/);
  assert.match(completeMarkup, /nf-state-battle-item-ground/);

  const noSurvivorScene = makeScene({
    tokens: completedTokens.map((token) => ({ ...token, hp: 0 })),
    chests: [emptyChest],
    status: "complete",
    ammunitionRecovered: true,
    winnerTokenId: null,
    ammoSpentByToken: {},
  });
  const noSurvivorMarkup = renderToStaticMarkup(React.createElement(TableScreen, { ...handlers, scene: noSurvivorScene, mode: "battle" }));
  assert.match(noSurvivorMarkup, /No survivor/);
  assert.match(noSurvivorMarkup, /No ammunition recovery was required/);

  const archerWithoutAmmo = table.createManualToken({
    id: "empty-archer",
    name: "Empty Archer",
    position: at(1, 1),
    inventory: [{ itemId: "shortbow", quantity: 1 }],
    loadout: { mainHand: "shortbow", offHand: null },
  });
  const depletedScene = makeScene({ tokens: [archerWithoutAmmo, carrier, witness], resources: table.createTurnResources(archerWithoutAmmo), physicalItems: [], ammoSpentByToken: {} });
  const depletedMarkup = renderToStaticMarkup(React.createElement(TableScreen, { ...handlers, scene: depletedScene, mode: "battle", initialCommandOpen: true }));
  assert.match(depletedMarkup, /requires Arrow/);
  assert.doesNotMatch(depletedMarkup, /Choose attack weapon/);

  const lootFailureMarkup = renderToStaticMarkup(React.createElement(ChestLootDrawer, {
    chest,
    busy: false,
    error: { message: "Loot write failed.", recovery: "The chest remains unchanged." },
    take: () => {},
    close: () => {},
  }));
  assert.match(lootFailureMarkup, /Loot was not saved/);
  assert.match(lootFailureMarkup, /The chest remains unchanged/);

  for (const markup of [mapMarkup, bonusMarkup, lootMarkup, emptyMarkup, completeMarkup, noSurvivorMarkup, depletedMarkup, retrievalFailureMarkup]) {
    assert.doesNotMatch(markup, /Â|âˆ|â€”|â€¦|�/);
  }

  console.log("Phase 10 render smoke passed for chest eligibility/loot/depletion, physical markers, retrieval commands/cinematics, ammunition feedback, completion, restart, and failure states.");
} finally {
  await vite.close();
}
