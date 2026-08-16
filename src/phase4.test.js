import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationCommands } from "./application/commands.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import {
  ABILITIES,
  abilityModifier,
  ALIGNMENTS,
  canSetBaseAbility,
  CLASSES,
  computeArmorClass,
  deriveHero,
  formatModifier,
  grantedLanguages,
  LANGUAGES,
  normalizeBaseAbilities,
  POINT_BUY_COSTS,
  pointBuyRemaining,
  pointBuySpent,
  proficiencyBonus,
  RACES,
  SAVING_THROWS,
  saveModifier,
  SKILLS,
  skillModifier,
} from "./domain/heroes.js";
import { createHeroRecord } from "./domain/records.js";
import { createHeroRepository, createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createSessionRepository } from "./storage/sessionRepository.js";
import { createStateRepository } from "./storage/stateRepository.js";

const CLOCK = () => "2026-08-12T14:00:00.000Z";

function harness() {
  const local = createMemoryStorage();
  let id = 0;
  const stateRepository = createStateRepository(local, { clock: CLOCK });
  const heroRepository = createHeroRepository(stateRepository, {
    clock: CLOCK,
    idFactory: () => `hero-${++id}`,
  });
  const sceneRepository = createSceneRepository(stateRepository, {
    clock: CLOCK,
    idFactory: () => `scene-${++id}`,
  });
  let state = createInitialApplicationState();
  const actions = [];
  const dispatch = (action) => {
    actions.push(action);
    state = applicationReducer(state, action);
  };
  const commands = createApplicationCommands({
    sceneRepository,
    heroRepository,
    sessionRepository: createSessionRepository(createMemoryStorage()),
    dispatch,
  });
  return {
    actions,
    commands,
    get state() { return state; },
    heroRepository,
    local,
    sceneRepository,
    stateRepository,
  };
}

test("Phase 4 class catalog contains only the implemented Fighter and Wizard profiles", () => {
  assert.deepEqual(CLASSES.map((entry) => entry.id), ["fighter", "wizard"]);
  assert.deepEqual(CLASSES[0].saveProficiencies, ["str", "con"]);
  assert.equal(CLASSES[0].hitDie, 10);
  assert.equal(CLASSES[0].spellcasting, null);
  assert.deepEqual(CLASSES[1].saveProficiencies, ["int", "wis"]);
  assert.equal(CLASSES[1].hitDie, 6);
  assert.deepEqual(CLASSES[1].spellcasting, {
    ability: "int",
    slots: "unlimited",
    spells: "unlimited",
  });
});

test("all nine races and four required subraces expose numeric Nightforge traits", () => {
  assert.deepEqual(RACES.map((race) => race.id), [
    "dwarf", "elf", "halfling", "human", "dragonborn", "gnome", "half-elf", "half-orc", "tiefling",
  ]);
  assert.deepEqual(RACES.flatMap((race) => race.subraces.map((entry) => entry.id)), [
    "hill-dwarf", "high-elf", "lightfoot-halfling", "rock-gnome",
  ]);
  for (const race of RACES) {
    assert.ok([25, 30].includes(race.speed));
    assert.ok(["Small", "Medium"].includes(race.size));
    assert.ok(race.languages.includes("Common"));
  }
  assert.deepEqual(grantedLanguages("dwarf", "hill-dwarf"), ["Common", "Dwarvish"]);
  assert.deepEqual(grantedLanguages("elf", "high-elf"), ["Common", "Elvish"]);
  assert.equal(RACES.find((race) => race.id === "halfling").size, "Small");
  assert.equal(RACES.find((race) => race.id === "gnome").size, "Small");
});

test("every race and subrace matches the independently specified numeric trait matrix", () => {
  const matrix = Object.fromEntries(RACES.map((race) => [race.id, {
    bonuses: race.abilityBonuses,
    speed: race.speed,
    size: race.size,
    languages: race.languages,
  }]));
  assert.deepEqual(matrix, {
    dwarf: { bonuses: { con: 2 }, speed: 25, size: "Medium", languages: ["Common", "Dwarvish"] },
    elf: { bonuses: { dex: 2 }, speed: 30, size: "Medium", languages: ["Common", "Elvish"] },
    halfling: { bonuses: { dex: 2 }, speed: 25, size: "Small", languages: ["Common", "Halfling"] },
    human: { bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, size: "Medium", languages: ["Common"] },
    dragonborn: { bonuses: { str: 2, cha: 1 }, speed: 30, size: "Medium", languages: ["Common", "Draconic"] },
    gnome: { bonuses: { int: 2 }, speed: 25, size: "Small", languages: ["Common", "Gnomish"] },
    "half-elf": { bonuses: { cha: 2 }, speed: 30, size: "Medium", languages: ["Common", "Elvish"] },
    "half-orc": { bonuses: { str: 2, con: 1 }, speed: 30, size: "Medium", languages: ["Common", "Orc"] },
    tiefling: { bonuses: { int: 1, cha: 2 }, speed: 30, size: "Medium", languages: ["Common", "Infernal"] },
  });
  assert.deepEqual(
    Object.fromEntries(RACES.flatMap((race) => race.subraces).map((entry) => [entry.id, entry.abilityBonuses])),
    {
      "hill-dwarf": { wis: 1 },
      "high-elf": { int: 1 },
      "lightfoot-halfling": { cha: 1 },
      "rock-gnome": { con: 1 },
    },
  );
});

test("identity catalogs expose nine alignments and sixteen SRD languages", () => {
  assert.equal(ALIGNMENTS.length, 9);
  assert.equal(new Set(ALIGNMENTS).size, 9);
  assert.equal(LANGUAGES.length, 16);
  assert.equal(new Set(LANGUAGES).size, 16);
});

test("skill and save catalogs contain every required entry with governing abilities", () => {
  assert.equal(SAVING_THROWS.length, 6);
  assert.deepEqual(SAVING_THROWS.map((save) => save.id), ABILITIES.map((ability) => ability.id));
  assert.equal(SKILLS.length, 18);
  assert.equal(new Set(SKILLS.map((skill) => skill.id)).size, 18);
  assert.deepEqual(
    SKILLS.filter((skill) => skill.ability === "dex").map((skill) => skill.name),
    ["Acrobatics", "Sleight of Hand", "Stealth"],
  );
});

test("all eighteen skill-to-ability mappings are exact", () => {
  assert.deepEqual(Object.fromEntries(SKILLS.map((skill) => [skill.name, skill.ability])), {
    Acrobatics: "dex",
    "Animal Handling": "wis",
    Arcana: "int",
    Athletics: "str",
    Deception: "cha",
    History: "int",
    Insight: "wis",
    Intimidation: "cha",
    Investigation: "int",
    Medicine: "wis",
    Nature: "int",
    Perception: "wis",
    Performance: "cha",
    Persuasion: "cha",
    Religion: "int",
    "Sleight of Hand": "dex",
    Stealth: "dex",
    Survival: "wis",
  });
});

test("point buy uses the standard cost curve and begins with all 27 points", () => {
  assert.deepEqual(POINT_BUY_COSTS, { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
  const empty = normalizeBaseAbilities({});
  assert.deepEqual(Object.values(empty), [8, 8, 8, 8, 8, 8]);
  assert.equal(pointBuySpent(empty), 0);
  assert.equal(pointBuyRemaining(empty), 27);
});

test("point buy prevents overspending and accepts an exact 27-point build", () => {
  const exact = { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 };
  assert.equal(pointBuySpent(exact), 27);
  assert.equal(pointBuyRemaining(exact), 0);
  assert.equal(canSetBaseAbility(exact, "int", 9), false);
  assert.equal(canSetBaseAbility(exact, "str", 16), false);
  const normalized = normalizeBaseAbilities({ str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 });
  assert.ok(pointBuySpent(normalized) <= 27);
  assert.ok(Object.values(normalized).every((score) => score >= 8 && score <= 15));
});

test("racial and subracial bonuses apply after purchased scores", () => {
  const hillDwarf = createHeroRecord(
    { raceId: "dwarf", subraceId: "hill-dwarf", baseAbilities: { con: 15, wis: 14 } },
    { id: "hero-dwarf", now: CLOCK() },
  );
  const derived = deriveHero(hillDwarf);
  assert.equal(derived.baseAbilities.con, 15);
  assert.equal(derived.finalAbilities.con, 17);
  assert.equal(derived.finalAbilities.wis, 15);
  assert.equal(derived.pointBuyRemaining, 11);
});

test("Human receives +1 to all six final abilities", () => {
  const human = createHeroRecord({}, { id: "hero-human", now: CLOCK() });
  assert.deepEqual(deriveHero(human).finalAbilities, {
    str: 9, dex: 9, con: 9, int: 9, wis: 9, cha: 9,
  });
});

test("ability and proficiency modifiers follow the 20-level progression", () => {
  assert.equal(abilityModifier(8), -1);
  assert.equal(abilityModifier(9), -1);
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(15), 2);
  assert.equal(formatModifier(-1), "−1");
  assert.equal(formatModifier(0), "+0");
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test("Fighter and Wizard HP use their class hit die and fixed later-level gains", () => {
  const fighter = createHeroRecord(
    { classId: "fighter", level: 3, raceId: "half-orc", baseAbilities: { con: 14 } },
    { id: "fighter", now: CLOCK() },
  );
  const wizard = createHeroRecord(
    { classId: "wizard", level: 3, raceId: "elf", baseAbilities: { con: 14 } },
    { id: "wizard", now: CLOCK() },
  );
  assert.equal(deriveHero(fighter).finalAbilities.con, 15);
  assert.equal(deriveHero(fighter).hp, 28);
  assert.equal(deriveHero(wizard).hp, 20);
});

test("HP derivation is correct at level 1 and level 20 for both classes", () => {
  const cases = [
    { classId: "fighter", level: 1, expected: 11 },
    { classId: "fighter", level: 20, expected: 144 },
    { classId: "wizard", level: 1, expected: 7 },
    { classId: "wizard", level: 20, expected: 102 },
  ];
  for (const entry of cases) {
    const hero = createHeroRecord(
      { classId: entry.classId, level: entry.level, raceId: "human", baseAbilities: { con: 11 } },
      { id: `${entry.classId}-${entry.level}`, now: CLOCK() },
    );
    assert.equal(deriveHero(hero).hp, entry.expected);
  }
});

test("initiative, speed, size, armour AC, shield AC, and heavy penalty derive correctly", () => {
  const hero = createHeroRecord(
    {
      raceId: "halfling",
      baseAbilities: { str: 10, dex: 14 },
      inventory: [
        { itemId: "chain-mail", quantity: 1 },
        { itemId: "shield", quantity: 1 },
      ],
      armorId: "chain-mail",
      shieldId: "shield",
      enchantments: { "chain-mail": 1, shield: 2 },
    },
    { id: "armoured", now: CLOCK() },
  );
  const equipmentById = {
    "chain-mail": { id: "chain-mail", category: "heavy", baseAc: 16, strengthMinimum: 13 },
    shield: { id: "shield", baseAc: 2 },
  };
  const derived = deriveHero(hero, { equipmentById });
  assert.equal(derived.initiative, 3);
  assert.equal(derived.baseSpeed, 25);
  assert.equal(derived.speed, 15);
  assert.equal(derived.size, "Small");
  assert.equal(derived.ac, 21);
  assert.equal(computeArmorClass({ dexterity: 16 }), 13);
  assert.equal(computeArmorClass({ dexterity: 16, armor: { category: "light", baseAc: 12 } }), 15);
  assert.equal(computeArmorClass({ dexterity: 16, armor: { category: "medium", baseAc: 14 } }), 16);
});

test("Wizard scaffold derives spell save DC and attack without enabling spell economy", () => {
  const wizard = createHeroRecord(
    { classId: "wizard", level: 5, raceId: "gnome", baseAbilities: { int: 15 } },
    { id: "wizard", now: CLOCK() },
  );
  const spellcasting = deriveHero(wizard).spellcasting;
  assert.deepEqual(spellcasting, {
    ability: "int",
    saveDc: 14,
    attackBonus: 6,
    slots: "unlimited",
    spells: "unlimited",
  });
  assert.equal(deriveHero(createHeroRecord({}, { id: "fighter", now: CLOCK() })).spellcasting, null);
});

test("saving throw and skill modifiers add proficiency only when selected", () => {
  const hero = createHeroRecord(
    {
      level: 5,
      baseAbilities: { str: 14, dex: 12 },
      saveProficiencies: ["str"],
      skillProficiencies: ["athletics"],
    },
    { id: "proficient", now: CLOCK() },
  );
  const derived = deriveHero(hero);
  const athletics = SKILLS.find((skill) => skill.id === "athletics");
  const acrobatics = SKILLS.find((skill) => skill.id === "acrobatics");
  assert.equal(saveModifier(hero, derived, "str"), 5);
  assert.equal(saveModifier(hero, derived, "dex"), 1);
  assert.equal(skillModifier(hero, derived, athletics), 5);
  assert.equal(skillModifier(hero, derived, acrobatics), 1);
});

test("new Heroes normalize to valid persisted Fighter and Human defaults", () => {
  const hero = createHeroRecord({}, { id: "new", now: CLOCK() });
  assert.equal(hero.name, "Unnamed hero");
  assert.equal(hero.classId, "fighter");
  assert.equal(hero.raceId, "human");
  assert.equal(hero.subraceId, null);
  assert.deepEqual(hero.saveProficiencies, ["str", "con"]);
  assert.deepEqual(hero.skillProficiencies, []);
  assert.deepEqual(hero.languages, ["Common"]);
  assert.deepEqual(Object.values(hero.baseAbilities), [8, 8, 8, 8, 8, 8]);
});

test("Hero normalization rejects invalid class, race, alignment, proficiency, and language values", () => {
  const hero = createHeroRecord(
    {
      classId: "bard",
      raceId: "robot",
      alignment: "Sideways",
      languages: ["Common", "Binary"],
      saveProficiencies: ["str", "luck"],
      skillProficiencies: ["arcana", "basket-weaving"],
    },
    { id: "normalized", now: CLOCK() },
  );
  assert.equal(hero.classId, "fighter");
  assert.equal(hero.raceId, "human");
  assert.equal(hero.alignment, "Neutral");
  assert.deepEqual(hero.languages, ["Common"]);
  assert.deepEqual(hero.saveProficiencies, ["str"]);
  assert.deepEqual(hero.skillProficiencies, ["arcana"]);
});

test("Hero CRUD creates, refreshes, edits, and retires exact stable IDs", () => {
  const app = harness();
  app.commands.initialize();
  const first = app.commands.createHero({ name: "Aster" });
  const second = app.commands.createHero({ name: "Bran" });
  assert.equal(first.value.id, "hero-1");
  assert.equal(second.value.id, "hero-2");
  assert.deepEqual(app.state.heroes.map((hero) => hero.name), ["Aster", "Bran"]);
  assert.equal(app.commands.updateHero(first.value.id, { name: "Aster Vale" }).value.name, "Aster Vale");
  app.commands.removeHero(second.value.id);
  assert.deepEqual(app.state.heroes.map((hero) => hero.id), ["hero-1"]);
});

test("class changes reset saves and skills at the application boundary", () => {
  const app = harness();
  const hero = app.commands.createHero({
    classId: "fighter",
    saveProficiencies: ["dex"],
    skillProficiencies: ["athletics", "arcana"],
  }).value;
  const changed = app.commands.updateHero(hero.id, { classId: "wizard" });
  assert.equal(changed.value.classId, "wizard");
  assert.deepEqual(changed.value.saveProficiencies, ["int", "wis"]);
  assert.deepEqual(changed.value.skillProficiencies, []);
});

test("race changes replace grants while retaining user-selected languages", () => {
  const app = harness();
  const hero = app.commands.createHero({
    raceId: "dwarf",
    subraceId: "hill-dwarf",
    languages: ["Common", "Dwarvish", "Giant"],
  }).value;
  const changed = app.commands.updateHero(hero.id, { raceId: "elf", subraceId: "high-elf" });
  assert.deepEqual(changed.value.languages, ["Common", "Elvish", "Giant"]);
  assert.equal(changed.value.subraceId, "high-elf");
});

test("retiring a Hero does not modify pre-existing Hero-token snapshots", () => {
  const app = harness();
  const hero = app.commands.createHero({ name: "Snapshot Source" }).value;
  const scene = app.sceneRepository.create({
    name: "Battle",
    tokens: [{ id: "token-1", heroId: hero.id, name: hero.name, hp: 10 }],
  }).value;
  app.commands.removeHero(hero.id);
  assert.equal(app.heroRepository.list().value.length, 0);
  assert.deepEqual(app.sceneRepository.get(scene.id).value.tokens, [
    { id: "token-1", heroId: hero.id, name: hero.name, hp: 10 },
  ]);
});

test("failed Hero creation and retirement preserve the last visible valid roster", () => {
  const app = harness();
  app.commands.initialize();
  app.local.setFailureMode("write");
  assert.equal(app.commands.createHero({ name: "Unsaved" }).ok, false);
  assert.deepEqual(app.state.heroes, []);
  app.local.setFailureMode(null);
  const hero = app.commands.createHero({ name: "Kept" }).value;
  app.local.setFailureMode("write");
  assert.equal(app.commands.removeHero(hero.id).ok, false);
  assert.equal(app.state.heroes[0].name, "Kept");
  assert.equal(app.state.persistence.status, "error");
});
