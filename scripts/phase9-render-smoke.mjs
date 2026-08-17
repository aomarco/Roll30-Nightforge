import assert from "node:assert/strict";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });

try {
  const [{ default: TableScreen }, { default: AttackCinematic }, attacks, { createSceneRecord }, table] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/screens/AttackCinematic.jsx"),
    vite.ssrLoadModule("/src/domain/attacks.js"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
  ]);
  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-17T16:00:00.000Z";
  const viewport = { width: 440, height: 440, gridSize: 44 };
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);
  const attacker = table.createManualToken({
    id: "duelist",
    name: "Duelist",
    position: at(1, 1),
    strength: 16,
    dexterity: 14,
    level: 5,
    inventory: [{ itemId: "dagger", quantity: 2 }],
    loadout: { mainHand: "dagger", offHand: "dagger" },
  });
  const target = table.createManualToken({
    id: "sentinel",
    name: "Sentinel",
    position: at(2, 1),
    ac: 12,
    hp: 30,
    maxHp: 30,
    conditions: ["prone", "poisoned"],
  });
  const makeBattle = ({ tokens = [attacker, target], resources = table.createTurnResources(attacker), walls = [], wallsVisible = true } = {}) => createSceneRecord({
    id: "phase9-render",
    name: "Duel at Dawn",
    kind: "battle",
    gridSize: 44,
    tokens,
    walls,
    wallsVisible,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map(({ id }) => id),
      initiatives: { [tokens[0].id]: 19, [tokens[1].id]: 14 },
      activeIndex: 0,
      round: 3,
      resources: { [tokens[0].id]: resources },
      battleItems: [],
      ammoSpentByToken: {},
      winnerTokenId: null,
      log: [],
    },
  }, { id: "phase9-render", now });
  const applyPatch = (scene, patch) => createSceneRecord({ ...scene, ...patch }, { id: scene.id, now });
  const battle = makeBattle();

  const actionMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialCommandOpen: true,
    initialAttackOpen: true,
  }));
  assert.match(actionMarkup, /Choose attack weapon/);
  assert.match(actionMarkup, /Equipped only/);
  assert.match(actionMarkup, /Dagger/);
  assert.match(actionMarkup, /Main hand/);
  assert.match(actionMarkup, /Off hand/);
  assert.match(actionMarkup, /Blocked and out-of-range attempts do not spend Action/);
  assert.doesNotMatch(actionMarkup, /Attack arrives in Phase 9/);

  const range = attacks.buildAttackRangeBands(battle, { weaponId: "dagger", hand: "mainHand", viewport });
  assert.equal(range.ok, true);
  const attackDraft = { kind: "action", weaponId: "dagger", hand: "mainHand", viewport, rangeModel: range.value };
  const rangeMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialSelectedId: target.id,
    initialAttackDraft: attackDraft,
  }));
  assert.match(rangeMarkup, /nf-state-table-attack-range/);
  assert.equal((rangeMarkup.match(/nf-state-table-attack-band/g) || []).length, 3);
  assert.match(rangeMarkup, /nf-state-table-attack-green/);
  assert.match(rangeMarkup, /nf-state-table-attack-yellow/);
  assert.match(rangeMarkup, /nf-state-table-attack-red/);
  assert.match(rangeMarkup, /Choose a target · Dagger/);
  assert.match(rangeMarkup, /aria-label="Attack Sentinel"/);
  assert.match(rangeMarkup, /nf-state-table-targetable/);
  assert.doesNotMatch(rangeMarkup, /attack-cell/);

  assert.equal((rangeMarkup.match(/nf-state-condition-chip/g) || []).length, 15);
  assert.match(rangeMarkup, /Prone/);
  assert.match(rangeMarkup, /Deafened/);
  assert.match(rangeMarkup, /Exhaustion/);
  assert.match(rangeMarkup, /aria-pressed="true"[^>]*>Prone|>Prone<\/button>/);
  assert.match(rangeMarkup, />PRO<|PRO<\/i>/);
  assert.match(rangeMarkup, />POI<|POI<\/i>/);
  assert.match(rangeMarkup, /Conditions are applied manually/);

  const fullWall = table.createWall({ id: "shot-blocker", type: "full", points: [{ xPercent: 20, yPercent: 0 }, { xPercent: 20, yPercent: 30 }] });
  const archer = table.createManualToken({ id: "archer", name: "Archer", position: at(1, 1), inventory: [{ itemId: "shortbow", quantity: 1 }, { itemId: "arrow", quantity: 20 }], loadout: { mainHand: "shortbow", offHand: null } });
  const distant = table.createManualToken({ id: "distant", name: "Distant", position: at(4, 1), hp: 20, maxHp: 20 });
  const blockedBattle = makeBattle({ tokens: [archer, distant], resources: table.createTurnResources(archer), walls: [fullWall], wallsVisible: false });
  const blockedRange = attacks.buildAttackRangeBands(blockedBattle, { weaponId: "shortbow", hand: "mainHand", viewport }).value;
  const blockedMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: blockedBattle,
    mode: "battle",
    initialAttackDraft: { kind: "action", weaponId: "shortbow", hand: "mainHand", viewport, rangeModel: blockedRange },
  }));
  assert.match(blockedMarkup, /aria-label="Distant unavailable as target"/);
  assert.doesNotMatch(blockedMarkup, /aria-label="Attack Distant"/);

  const mainAttack = attacks.performWeaponAttack(battle, { weaponId: "dagger", hand: "mainHand", targetId: target.id, viewport }, { random: (() => { const values = [0.25, 0.8, 0.5]; return () => values.shift() ?? 0; })() });
  assert.equal(mainAttack.ok, true);
  const afterMain = applyPatch(battle, mainAttack.value);
  const bonusMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: afterMain,
    mode: "battle",
    initialBonusOpen: true,
  }));
  assert.match(bonusMarkup, /Duelist.*s Bonus Action/);
  assert.match(bonusMarkup, /Off-hand attack/);
  assert.match(bonusMarkup, /Dagger/);
  assert.match(bonusMarkup, /Battle chests/);
  assert.match(bonusMarkup, /No Battle chests are on this Table/);
  assert.match(bonusMarkup, /Physical weapons/);
  assert.match(bonusMarkup, /No thrown weapons are present/);
  assert.match(bonusMarkup, /No automatic End Turn/);
  assert.match(bonusMarkup, /aria-label="Open Bonus Commands"/);

  const unavailableBonusMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialBonusOpen: true,
  }));
  assert.match(unavailableBonusMarkup, /Off-hand attack unavailable/);
  assert.match(unavailableBonusMarkup, /Use the Attack Action with one weapon/);

  for (const stage of ["spin", "natural", "modifiers", "verdict", "damage", "impact"]) {
    const cinematicMarkup = renderToStaticMarkup(React.createElement(AttackCinematic, { cinematic: { outcome: mainAttack.outcome, stage } }));
    assert.match(cinematicMarkup, new RegExp(`nf-state-cinematic-${stage}`));
    assert.match(cinematicMarkup, /Duelist/);
    assert.match(cinematicMarkup, /Sentinel/);
    assert.match(cinematicMarkup, /Dagger/);
    if (stage === "spin") assert.match(cinematicMarkup, />\?<small/);
    if (stage === "natural") assert.match(cinematicMarkup, /rejected/);
    if (["verdict", "damage", "impact"].includes(stage)) assert.match(cinematicMarkup, /Hit|Critical hit/);
    if (["damage", "impact"].includes(stage)) assert.match(cinematicMarkup, /nf-state-cinematic-damage/);
  }

  const critical = attacks.performWeaponAttack(battle, { weaponId: "dagger", hand: "mainHand", targetId: target.id, viewport }, { random: (() => { const values = [.999, .999, .4, .4]; return () => values.shift() ?? 0; })() });
  const criticalMarkup = renderToStaticMarkup(React.createElement(AttackCinematic, { cinematic: { outcome: critical.outcome, stage: "damage" } }));
  assert.match(criticalMarkup, /Critical hit/);
  assert.match(criticalMarkup, /Natural 20/);
  assert.match(criticalMarkup, /nf-state-cinematic-verdict-critical/);

  const miss = attacks.performWeaponAttack(battle, { weaponId: "dagger", hand: "mainHand", targetId: target.id, viewport }, { random: (() => { const values = [0, 0, 0]; return () => values.shift() ?? 0; })() });
  const missMarkup = renderToStaticMarkup(React.createElement(AttackCinematic, { cinematic: { outcome: miss.outcome, stage: "impact" } }));
  assert.match(missMarkup, /Miss/);
  assert.match(missMarkup, /Natural 1 always misses/);
  assert.match(missMarkup, /takes no damage/);
  assert.doesNotMatch(missMarkup, /nf-state-cinematic-damage/);

  const failureMarkup = renderToStaticMarkup(React.createElement(AttackCinematic, { cinematic: { outcome: mainAttack.outcome, stage: "failed", error: { message: "Attack storage failed.", recovery: "Retry safely." } } }));
  assert.match(failureMarkup, /Attack was not saved/);
  assert.match(failureMarkup, /Attack storage failed/);

  const impactMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: afterMain,
    mode: "battle",
    initialImpact: { targetId: target.id, damage: mainAttack.outcome.damage.total, critical: false },
  }));
  assert.match(impactMarkup, /nf-state-table-hit/);
  assert.match(impactMarkup, /nf-state-table-damage-float/);
  assert.doesNotMatch(impactMarkup, /Â|âˆ|â€”|â€¦|�/);

  console.log("Phase 9 render smoke passed for Action/Bonus drawers, range SVG, target legality, all conditions, attack cinematics, critical/miss feedback, impact, and failure states.");
} finally {
  await vite.close();
}
