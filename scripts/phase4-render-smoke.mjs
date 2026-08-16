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
  const [{ default: HeroesScreen }, { createHeroRecord }] = await Promise.all([
    vite.ssrLoadModule("/src/screens/HeroesScreen.jsx"),
    vite.ssrLoadModule("/src/domain/records.js"),
  ]);
  const handlers = {
    go: () => ({ ok: true }),
    onCreate: () => ({ ok: true }),
    onUpdate: () => ({ ok: true }),
    onRetire: () => ({ ok: true }),
  };
  const fighter = createHeroRecord(
    {
      id: "hero-fighter",
      name: "Aster Vale",
      classId: "fighter",
      level: 3,
      raceId: "dwarf",
      subraceId: "hill-dwarf",
      alignment: "Lawful Good",
      background: "Soldier",
      baseAbilities: { str: 15, con: 14, wis: 10 },
      skillProficiencies: ["athletics", "perception"],
    },
    { id: "hero-fighter", now: "2026-08-12T14:00:00.000Z" },
  );
  const wizard = createHeroRecord(
    {
      id: "hero-wizard",
      name: "Lyra Quill",
      classId: "wizard",
      level: 5,
      raceId: "elf",
      subraceId: "high-elf",
      baseAbilities: { int: 15, dex: 14, con: 13 },
      skillProficiencies: ["arcana", "history"],
    },
    { id: "hero-wizard", now: "2026-08-12T14:00:00.000Z" },
  );
  const overFighter = createHeroRecord(
    {
      ...fighter,
      id: "hero-over",
      skillProficiencies: ["athletics", "perception", "survival"],
    },
    { id: "hero-over", now: "2026-08-12T14:00:00.000Z" },
  );

  const empty = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
    }),
  );
  assert.match(empty, /No adventurers are recorded yet/);
  assert.match(empty, /No heroes written yet/);
  assert.doesNotMatch(empty, /Thorin|Elara|Bruenor/);

  const identity = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [fighter, wizard],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
      initialChapter: "identity",
    }),
  );
  assert.match(identity, /2 adventurers under your banner/);
  assert.match(identity, /Aster Vale/);
  assert.match(identity, /Lv 5/);
  assert.match(identity, /Hill Dwarf/);
  assert.match(identity, /Level 3 Fighter · Dwarf/);
  assert.match(identity, /Lawful Good/);
  assert.match(identity, /Soldier/);
  assert.match(identity, /Dwarvish · granted/);
  assert.match(identity, />Gear</);
  assert.doesNotMatch(identity, /Longsword|Plate Armor|Potion of Healing/);

  const fighterAbilities = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [fighter],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
      initialChapter: "abilities",
    }),
  );
  assert.match(fighterAbilities, /27-point buy/);
  assert.match(fighterAbilities, /Saving throws/);
  assert.match(fighterAbilities, /Athletics/);
  assert.match(fighterAbilities, /Sleight of Hand/);
  assert.match(fighterAbilities, /2 \/ 2 chosen/);
  assert.match(fighterAbilities, /−1/);
  assert.doesNotMatch(fighterAbilities, /Wizard spellcasting/);

  const overGuidance = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [overFighter],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
      initialChapter: "abilities",
    }),
  );
  assert.match(overGuidance, /3 \/ 2 chosen/);
  assert.match(overGuidance, /exceeds Fighter guidance/);

  const wizardAbilities = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [wizard],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
      initialChapter: "abilities",
    }),
  );
  assert.match(wizardAbilities, /Wizard spellcasting/);
  assert.match(wizardAbilities, /Spell save DC/);
  assert.match(wizardAbilities, /Spell attack/);
  assert.match(wizardAbilities, /Scaffold only/);
  assert.match(wizardAbilities, /No spell list, slot economy, or in-battle casting is enabled/);

  const failed = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [fighter],
      lifecycle: "ready",
      persistence: {
        status: "error",
        error: { message: "Hero save failed.", recovery: "Retry the edit." },
      },
    }),
  );
  assert.match(failed, /Not saved/);
  assert.match(failed, /Hero save failed/);
  assert.match(failed, /Retry the edit/);

  const retiring = renderToStaticMarkup(
    React.createElement(HeroesScreen, {
      ...handlers,
      heroes: [fighter],
      lifecycle: "ready",
      persistence: { status: "saved", error: null },
      initialRetiringId: fighter.id,
    }),
  );
  assert.match(retiring, /Retire <strong>Aster Vale<\/strong>/);
  assert.match(retiring, /Existing Scene tokens are independent snapshots and remain untouched/);

  for (const markup of [empty, identity, fighterAbilities, overGuidance, wizardAbilities, failed, retiring]) {
    assert.doesNotMatch(markup, /[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u);
  }

  console.log("Phase 4 render smoke passed for empty, Identity, Fighter guidance, Wizard scaffold, retirement, later-phase Gear integration, and error states.");
} finally {
  await vite.close();
}
