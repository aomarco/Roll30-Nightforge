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
    { default: BattleCompletion },
    { default: HeroesScreen },
    { createHeroRecord, createSceneRecord },
    table,
    checks,
  ] = await Promise.all([
    vite.ssrLoadModule("/src/screens/TableScreen.jsx"),
    vite.ssrLoadModule("/src/screens/CheckCinematic.jsx"),
    vite.ssrLoadModule("/src/screens/BattleCompletion.jsx"),
    vite.ssrLoadModule("/src/screens/HeroesScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
    vite.ssrLoadModule("/src/domain/table.js"),
    vite.ssrLoadModule("/src/domain/checks.js"),
  ]);

  const handlers = { go: () => ({ ok: true }), setMode: () => ({ ok: true }), onUpdate: () => ({ ok: true }) };
  const now = "2026-08-21T10:00:00.000Z";
  const viewport = { width: 440, height: 440, gridSize: 44 };
  const at = (column, row) => table.setupPositionForCell({ column, row }, viewport);
  const sequence = (...values) => {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)] ?? 0;
  };

  const hero = table.createManualToken({
    id: "kaelen",
    name: "Kaelen",
    position: at(1, 1),
    heroId: "hero-1",
    dexterity: 16,
    level: 5,
    hp: 17,
    maxHp: 24,
    tempHp: 8,
    saveProficiencies: ["dex", "con"],
    skillProficiencies: ["athletics", "stealth"],
  });
  const foe = table.createManualToken({
    id: "goblin",
    name: "Goblin",
    position: at(2, 1),
    hp: 7,
    maxHp: 7,
    xp: 50,
    conditions: ["restrained"],
  });

  const makeBattle = ({ tokens = [hero, foe], status = "active", encounter = {} } = {}) => createSceneRecord({
    id: "rules-render",
    name: "Rules Lab",
    kind: "battle",
    gridSize: 44,
    tokens,
    encounter: {
      version: 1,
      status,
      initiativeOrder: tokens.map(({ id }) => id),
      initiatives: Object.fromEntries(tokens.map(({ id }, index) => [id, 20 - index])),
      activeIndex: 0,
      round: 2,
      resources: { [tokens[0].id]: table.createTurnResources(tokens[0]) },
      battleItems: [],
      ammoSpentByToken: {},
      winnerTokenId: null,
      log: [],
      ...encounter,
    },
  }, { id: "rules-render", now });

  /* ------------------------------------------- inspector: vitality + rolls */

  const battle = makeBattle();
  const inspectorMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialSelectedId: "kaelen",
  }));

  assert.match(inspectorMarkup, /Hit point adjustment/);
  assert.match(inspectorMarkup, /nf-state-battle-heal/);
  assert.match(inspectorMarkup, /nf-state-battle-damage/);
  assert.match(inspectorMarkup, /nf-state-battle-temp-set/);
  assert.match(inspectorMarkup, /8 temporary/);
  assert.match(inspectorMarkup, /Roll against/);
  assert.match(inspectorMarkup, /No Action spent/);
  assert.match(inspectorMarkup, /Difficulty class/);
  assert.equal((inspectorMarkup.match(/nf-state-battle-roll-mode(?!s)/g) || []).length, 3);
  // Six saves and eighteen skills, all of them now rollable buttons.
  assert.equal((inspectorMarkup.match(/class="nf-state-battle-save(?: nf-state-battle-save-proficient)?"/g) || []).length, 6);
  assert.equal((inspectorMarkup.match(/class="nf-state-battle-skill(?: nf-state-battle-skill-proficient)?"/g) || []).length, 18);
  assert.equal((inspectorMarkup.match(/nf-state-battle-save-proficient/g) || []).length, 2);
  assert.equal((inspectorMarkup.match(/nf-state-battle-skill-proficient/g) || []).length, 2);
  assert.match(inspectorMarkup, /2 trained/);
  assert.match(inspectorMarkup, /Athletics/);
  assert.match(inspectorMarkup, /Sleight of Hand/);
  assert.match(inspectorMarkup, /saving-throw, and automatic-critical effects/);

  // A token with no temporary pool must not advertise one.
  const plainMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: battle,
    mode: "battle",
    initialSelectedId: "goblin",
  }));
  assert.doesNotMatch(plainMarkup, /nf-state-battle-temp"/);
  assert.match(plainMarkup, /None trained/);
  assert.doesNotMatch(plainMarkup, /nf-state-battle-skill-proficient/);

  /* --------------------------------------------------- the check cinematic */

  const saved = checks.performSavingThrow(battle, { tokenId: "kaelen", ability: "dex", dc: 15 }, { random: sequence(0.7) });
  assert.equal(saved.ok, true);
  for (const stage of ["spin", "natural", "modifiers", "verdict"]) {
    const markup = renderToStaticMarkup(React.createElement(CheckCinematic, {
      cinematic: { outcome: saved.outcome, stage, error: null },
      skip: () => ({ ok: true }),
    }));
    assert.match(markup, /Saving throw/);
    assert.match(markup, /Dexterity saving throw/);
    assert.match(markup, /DC 15/);
    assert.match(markup, /Click anywhere to skip/);
    if (stage === "spin") assert.match(markup, /Rolling one d20/);
    if (stage !== "spin") assert.match(markup, /Natural/);
    if (stage === "verdict") assert.match(markup, /Success/);
  }

  const autoFailed = checks.performSavingThrow(
    makeBattle({ tokens: [table.createManualToken({ ...hero, conditions: ["paralyzed"] }), foe] }),
    { tokenId: "kaelen", ability: "dex", dc: 15 },
    { random: sequence(0.999) },
  );
  assert.equal(autoFailed.outcome.autoFailed, true);
  const autoFailMarkup = renderToStaticMarkup(React.createElement(CheckCinematic, {
    cinematic: { outcome: autoFailed.outcome, stage: "verdict", error: null },
    skip: () => ({ ok: true }),
  }));
  assert.match(autoFailMarkup, /Automatic failure/);
  assert.match(autoFailMarkup, /The die is never thrown/);
  assert.match(autoFailMarkup, /nf-state-check-die-void/);
  assert.doesNotMatch(autoFailMarkup, /Rolling/);

  const openEnded = checks.performAbilityCheck(battle, { tokenId: "kaelen", skillId: "stealth" }, { random: sequence(0.5) });
  const openEndedMarkup = renderToStaticMarkup(React.createElement(CheckCinematic, {
    cinematic: { outcome: openEnded.outcome, stage: "verdict", error: null },
    skip: () => ({ ok: true }),
  }));
  assert.match(openEndedMarkup, /Stealth check/);
  assert.match(openEndedMarkup, /No difficulty class/);
  assert.match(openEndedMarkup, /nothing is decided here/);

  const erroredMarkup = renderToStaticMarkup(React.createElement(CheckCinematic, {
    cinematic: { outcome: saved.outcome, stage: "verdict", error: { message: "Storage is full.", recovery: "Free space and retry." } },
    skip: () => ({ ok: true }),
  }));
  assert.match(erroredMarkup, /Roll was not saved/);
  assert.match(erroredMarkup, /Storage is full/);

  /* ------------------------------------------ completion card and the award */

  const finishedTokens = [
    table.createManualToken({ ...hero, hp: 11 }),
    table.createManualToken({ ...foe, hp: 0, conditions: [] }),
  ];
  const unpaid = renderToStaticMarkup(React.createElement(BattleCompletion, {
    encounter: { winnerTokenId: "kaelen", ammoSpentByToken: {}, xpAwarded: false },
    tokens: finishedTokens,
    restart: () => ({ ok: true }),
    awardXp: () => ({ ok: true }),
  }));
  assert.match(unpaid, /Kaelen wins/);
  assert.match(unpaid, /50 XP/);
  assert.match(unpaid, /Award XP/);
  assert.match(unpaid, /50 each to Kaelen/);

  const paid = renderToStaticMarkup(React.createElement(BattleCompletion, {
    encounter: { winnerTokenId: "kaelen", ammoSpentByToken: {}, xpAwarded: true },
    tokens: finishedTokens,
    restart: () => ({ ok: true }),
    awardXp: () => ({ ok: true }),
  }));
  assert.match(paid, /Experience awarded/);
  assert.match(paid, /Already awarded for this Battle/);
  assert.doesNotMatch(paid, />Award XP</);

  // A Battle worth nothing must not offer a button at all.
  const worthless = renderToStaticMarkup(React.createElement(BattleCompletion, {
    encounter: { winnerTokenId: "kaelen", ammoSpentByToken: {}, xpAwarded: false },
    tokens: [table.createManualToken({ ...hero, hp: 11 }), table.createManualToken({ ...foe, hp: 0, xp: 0, conditions: [] })],
    restart: () => ({ ok: true }),
    awardXp: () => ({ ok: true }),
  }));
  assert.doesNotMatch(worthless, /nf-state-battle-xp/);
  assert.match(worthless, /Restart Battle/);

  /* -------------------------------------------- hero sheet experience field */

  const readyHero = createHeroRecord({ name: "Kaelen", classId: "fighter", level: 1, xp: 900 }, { id: "hero-1", now });
  const readyMarkup = renderToStaticMarkup(React.createElement(HeroesScreen, {
    ...handlers,
    heroes: [readyHero],
    initialActiveId: "hero-1",
  }));
  assert.match(readyMarkup, /Experience/);
  assert.match(readyMarkup, /Enough for level 3/);
  assert.match(readyMarkup, /nf-state-hero-xp-ready/);

  const climbingHero = createHeroRecord({ name: "Kaelen", classId: "fighter", level: 1, xp: 100 }, { id: "hero-1", now });
  const climbingMarkup = renderToStaticMarkup(React.createElement(HeroesScreen, {
    ...handlers,
    heroes: [climbingHero],
    initialActiveId: "hero-1",
  }));
  assert.match(climbingMarkup, /200 more for level 2/);
  assert.doesNotMatch(climbingMarkup, /nf-state-hero-xp-ready/);

  const cappedHero = createHeroRecord({ name: "Kaelen", classId: "fighter", level: 20, xp: 355000 }, { id: "hero-1", now });
  const cappedMarkup = renderToStaticMarkup(React.createElement(HeroesScreen, {
    ...handlers,
    heroes: [cappedHero],
    initialActiveId: "hero-1",
  }));
  assert.match(cappedMarkup, /Level 20 is the ceiling/);

  /* ------------------------------------------------ unarmed strike surfaces */

  const barehanded = table.createManualToken({ id: "monk", name: "Monk", position: at(1, 1), strength: 16 });
  const dummy = table.createManualToken({ id: "dummy", name: "Dummy", position: at(2, 1), hp: 20, maxHp: 20 });
  const unarmedBattle = makeBattle({ tokens: [barehanded, dummy] });
  const unarmedMarkup = renderToStaticMarkup(React.createElement(TableScreen, {
    ...handlers,
    scene: unarmedBattle,
    mode: "battle",
    initialCommandPanel: "attack",
  }));
  assert.match(unarmedMarkup, /Unarmed Strike/);
  assert.doesNotMatch(unarmedMarkup, /has no equipped weapon available/);

  /* ------------------------------------------------------- mojibake guard */

  for (const markup of [inspectorMarkup, plainMarkup, autoFailMarkup, openEndedMarkup, unpaid, paid, worthless, readyMarkup, climbingMarkup, cappedMarkup, unarmedMarkup]) {
    assert.doesNotMatch(markup, /Ã.|â€|Â./);
  }

  console.log("Rules render smoke: inspector vitality and rolls, check cinematic stages, experience award, hero sheet experience, unarmed strike.");
} finally {
  await vite.close();
}
