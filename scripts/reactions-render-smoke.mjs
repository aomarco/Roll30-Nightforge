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
    { default: CheckCinematic },
    { default: AttackCinematic },
    { createSceneRecord },
    table,
    death,
    attacks,
  ] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/screens/CheckCinematic.jsx"),
    vite.ssrLoadModule("/src/screens/AttackCinematic.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
    vite.ssrLoadModule("/src/domain/death.js"),
    vite.ssrLoadModule("/src/domain/attacks.js"),
  ]);

  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-23T10:00:00.000Z";
  const viewport = { width: 440, height: 440, gridSize: 44 };
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);
  const fixedDie = (face) => () => (face - 0.5) / 20;

  const makeBattle = (tokens, activeIndex = 0) => createSceneRecord({
    id: "reactions-render",
    name: "Reactions Lab",
    kind: "battle",
    gridSize: 44,
    tokens,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder: tokens.map(({ id }) => id),
      initiatives: Object.fromEntries(tokens.map(({ id }, index) => [id, 20 - index])),
      activeIndex,
      round: 2,
      resources: { [tokens[activeIndex].id]: table.createTurnResources(tokens[activeIndex]) },
      battleItems: [],
      ammoSpentByToken: {},
      winnerTokenId: null,
      log: [],
    },
  }, { id: "reactions-render", now });

  /* ------------------------------------- the Tactics key and its drawer */

  const wren = table.createManualToken({
    id: "wren", name: "Wren", position: at(3, 3), heroId: "hero-1", faction: "ally", hp: 20, maxHp: 20, dead: false,
  });
  const sable = table.createManualToken({
    id: "sable", name: "Sable", position: at(3, 4), heroId: "hero-2", faction: "ally", hp: 18, maxHp: 18, dead: false,
  });
  const grix = table.createManualToken({
    id: "grix", name: "Grix", position: at(6, 6), faction: "foe", hp: 9, maxHp: 9, xp: 50, dead: false,
    damageResistances: ["fire"], damageImmunities: ["poison"], damageVulnerabilities: ["cold"],
  });

  const tactics = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: makeBattle([wren, sable, grix]),
    mode: "battle",
    initialSelectedId: "wren",
    initialCommandPanel: "tactics",
  }));
  assert.match(tactics, /Tactics/);
  assert.match(tactics, /Spend the Action on a tactic/);
  assert.match(tactics, /Dodge/);
  assert.match(tactics, /Disengage/);
  // Sable is adjacent, so Help offers them by name rather than as an abstraction.
  assert.match(tactics, /Help Sable/);

  /* ------------------------------- defences read on the battle inspector */

  const defended = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: makeBattle([wren, sable, grix]),
    mode: "battle",
    initialSelectedId: "grix",
  }));
  assert.match(defended, /Immune Poison/);
  assert.match(defended, /Resists Fire/);
  assert.match(defended, /Vulnerable Cold/);
  assert.match(defended, /nf-state-battle-vitality-type/);
  // A creature with no defences must not advertise an empty row.
  const bare = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: makeBattle([wren, sable, grix]),
    mode: "battle",
    initialSelectedId: "wren",
  }));
  assert.doesNotMatch(bare, /nf-state-battle-defenses/);

  /* ------------------------------------ a dying creature and its pips */

  const dying = table.createManualToken({
    id: "wren", name: "Wren", position: at(3, 3), heroId: "hero-1", faction: "ally",
    hp: 0, maxHp: 20, dead: false, deathSaveSuccesses: 1, deathSaveFailures: 2, conditions: ["unconscious"],
  });
  const downed = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: makeBattle([dying, sable, grix]),
    mode: "battle",
    initialSelectedId: "wren",
  }));
  assert.match(downed, /nf-state-battle-down-dying/);
  assert.match(downed, />Dying</);
  assert.match(downed, /nf-state-battle-death-pip/);
  assert.equal((downed.match(/nf-state-battle-death-pip[^"]*on"/g) || []).length, 3);
  // The command deck collapses to the one thing a dying creature can do.
  assert.match(downed, /Roll death save/);
  assert.doesNotMatch(downed, /nf-state-command-key-dash/);

  const stable = table.createManualToken({
    id: "wren", name: "Wren", position: at(3, 3), heroId: "hero-1", faction: "ally",
    hp: 0, maxHp: 20, dead: false, deathSaveSuccesses: 3, conditions: ["unconscious"],
  });
  const held = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: makeBattle([stable, sable, grix]),
    mode: "battle",
    initialSelectedId: "wren",
  }));
  assert.match(held, /nf-state-battle-down-stable/);
  assert.match(held, />Stable</);

  /* ---------------------------------- the death save through the cinematic */

  const rolled = death.rollDeathSave(makeBattle([dying, sable, grix]), "wren", { random: fixedDie(20) });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.outcome.revived, true);
  for (const stage of ["spin", "natural", "modifiers", "verdict"]) {
    const markup = renderToStaticMarkup(React.createElement(CheckCinematic, {
      cinematic: { outcome: rolled.outcome, stage, error: null },
      skip: () => ({ ok: true }),
    }));
    assert.match(markup, /Death saving throw/);
    // No modifier row: a death save has none, and showing +0 invites a hunt
    // for the bonus that is missing.
    assert.doesNotMatch(markup, /Modifier/);
  }
  const verdictMarkup = renderToStaticMarkup(React.createElement(CheckCinematic, {
    cinematic: { outcome: rolled.outcome, stage: "verdict", error: null },
    skip: () => ({ ok: true }),
  }));
  assert.match(verdictMarkup, /Back on their feet/);

  /* --------------------------- resistance and going down in the attack card */

  const attacker = table.createManualToken({
    id: "wren", name: "Wren", position: at(6, 5), heroId: "hero-1", faction: "ally", hp: 20, maxHp: 20, dead: false,
    inventory: [{ itemId: "longsword", quantity: 1 }],
    loadout: { mainHand: "longsword", offHand: null },
  });
  const soaker = table.createManualToken({
    id: "grix", name: "Grix", position: at(6, 6), faction: "foe", hp: 40, maxHp: 40, dead: false,
    damageResistances: ["slashing"],
  });
  const swung = attacks.performWeaponAttack(
    makeBattle([attacker, soaker]),
    { kind: "action", weaponId: "longsword", hand: "mainHand", targetId: "grix", viewport },
    { random: fixedDie(18) },
  );
  assert.equal(swung.ok, true);
  assert.equal(swung.outcome.damageDefense.defense, "resistant");
  const impact = renderToStaticMarkup(React.createElement(AttackCinematic, {
    cinematic: { outcome: swung.outcome, stage: "impact", error: null },
    skip: () => ({ ok: true }),
  }));
  assert.match(impact, /nf-state-cinematic-defense-resistant/);
  assert.match(impact, /Resistant to Slashing damage/);

  for (const markup of [tactics, defended, downed, held, verdictMarkup, impact]) {
    assert.doesNotMatch(markup, /Ã.|â€|Â./);
  }

  console.log("Reactions render smoke: tactics drawer, defence badges, death pips and cinematic, resistance readout.");
} finally {
  await vite.close();
}
