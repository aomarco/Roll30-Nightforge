import test from "node:test";
import assert from "node:assert/strict";

import {
  attackRollSources,
  attackTargetEligibility,
  activateHide,
  performWeaponAttack,
} from "./domain/attacks.js";
import { performAbilityCheck, performSavingThrow } from "./domain/checks.js";
import { deriveHero } from "./domain/heroes.js";
import {
  MAX_ATTUNED_ITEMS,
  normalizeItemCharges,
  restoreItemCharges,
  setItemCharges,
  toggleAttunedItem,
  wornMagicBonuses,
} from "./domain/items.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import {
  createHeroTokenSnapshot,
  createManualToken,
  createTurnResources,
  setupPositionForCell,
} from "./domain/table.js";
import { hitDiceAvailable, hitDiceTotal, longRest, shortRest } from "./domain/rest.js";
import {
  DRAGON_ANCESTRIES,
  RACIAL_TRAITS,
  racialStateFor,
} from "./domain/racialTraits.js";
import { resolveIncomingDamage } from "./domain/vitality.js";
import { WORN_MAGIC_ITEMS } from "./domain/catalog.js";

const NOW = "2026-08-28T10:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const at = (column, row) => setupPositionForCell({ column, row }, VIEWPORT);
const entry = (itemId, quantity = 1) => ({ itemId, quantity });
const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

const battle = (tokens, { walls = [], activeIndex = 0, resources } = {}) => createSceneRecord({
  id: "backlog-scene",
  kind: "battle",
  name: "Backlog rules lab",
  tokens,
  walls,
  encounter: {
    status: "active",
    initiativeOrder: tokens.map((token) => token.id),
    initiatives: Object.fromEntries(tokens.map((token, index) => [token.id, 20 - index])),
    activeIndex,
    round: 1,
    resources: resources || { [tokens[activeIndex].id]: createTurnResources(tokens[activeIndex]) },
    battleItems: [],
    ammoSpentByToken: {},
    winnerTokenId: null,
    log: [],
  },
}, { id: "backlog-scene", now: NOW });

const hero = (input = {}) => createHeroRecord({
  id: input.id || "backlog-hero",
  name: "Backlog Hero",
  classId: "fighter",
  raceId: "human",
  baseAbilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
  ...input,
}, { id: input.id || "backlog-hero", now: NOW });

test("the racial catalog contains all 38 rules and derives selected ancestry mechanics", () => {
  assert.equal(RACIAL_TRAITS.length, 38);
  assert.equal(new Set(RACIAL_TRAITS.map((trait) => trait.id)).size, 38);
  assert.equal(DRAGON_ANCESTRIES.length, 10);

  const green = racialStateFor("dragonborn", null, { dragonAncestry: "green" });
  assert.ok(green.traitIds.includes("draconic-ancestry-green"));
  assert.deepEqual(green.damageResistances, ["poison"]);
  assert.deepEqual(green.breathWeapon, {
    id: "green",
    label: "Green",
    damageType: "poison",
    breathShape: "cone",
    saveAbility: "con",
    damageDiceByLevel: { 1: "2d6", 6: "3d6", 11: "4d6", 16: "5d6" },
    recharge: "short-rest",
  });

  const hillDwarf = hero({
    raceId: "dwarf",
    subraceId: "hill-dwarf",
    level: 4,
    racialChoices: { dwarfTool: "masons-tools" },
  });
  const derived = deriveHero(hillDwarf);
  assert.equal(derived.hitPointBonusPerLevel, 1);
  assert.equal(derived.racialSkillProficiencies.includes("perception"), false);
  assert.deepEqual(derived.toolProficiencies, ["masons-tools"]);
  assert.equal(derived.darkvisionFeet, 60);

  const halfElf = hero({
    raceId: "half-elf",
    racialChoices: { halfElfSkills: ["stealth", "perception", "arcana"] },
  });
  assert.deepEqual(deriveHero(halfElf).racialSkillProficiencies, ["stealth", "perception"]);
  const snapshot = createHeroTokenSnapshot(halfElf, { id: "half-elf-token", position: at(1, 1) });
  assert.deepEqual(snapshot.skillProficiencies, ["stealth", "perception"]);
});

test("attunement caps active items at three and charged pools normalize and restore", () => {
  const ids = WORN_MAGIC_ITEMS.map((item) => item.id);
  const equipped = hero({
    classId: "wizard",
    inventory: ids.map((id) => entry(id)),
    wornItemIds: ids,
  });
  assert.equal(MAX_ATTUNED_ITEMS, 3);
  assert.deepEqual(equipped.attunedItemIds, ids.slice(0, 3));
  assert.deepEqual(equipped.wornItemIds, ids.slice(0, 3));
  assert.deepEqual(wornMagicBonuses(equipped), { ac: 3, save: 1, attack: 0, rangedDamage: 2 });
  assert.equal(toggleAttunedItem(equipped, ids[3]).code, "ATTUNEMENT_LIMIT_REACHED");

  const charged = hero({
    inventory: [entry("cubic-gate"), entry("gem-of-seeing")],
    itemCharges: { "cubic-gate": 99, "gem-of-seeing": 0, "unknown-item": 1 },
  });
  assert.deepEqual(charged.itemCharges, {
    "cubic-gate": { current: 3, max: 3 },
    "gem-of-seeing": { current: 0, max: 3 },
  });
  assert.deepEqual(normalizeItemCharges({ "gem-of-seeing": 2 }, charged.inventory), {
    "cubic-gate": { current: 3, max: 3 },
    "gem-of-seeing": { current: 2, max: 3 },
  });
  const spent = setItemCharges(charged, "cubic-gate", 0);
  assert.equal(spent.ok, true);
  assert.equal(spent.value.itemCharges["cubic-gate"].current, 0);
  const spentHero = { ...charged, ...spent.value };
  assert.equal(restoreItemCharges(spentHero, "short")["cubic-gate"].current, 0);
  assert.equal(restoreItemCharges(spentHero, "long")["cubic-gate"].current, 3);
});

test("short and long rests spend and recover hit dice, HP, racial uses, and item charges", () => {
  const starting = hero({
    id: "rest-hero",
    raceId: "half-orc",
    level: 4,
    currentHp: 3,
    hitDiceSpent: 2,
    inventory: [entry("cubic-gate")],
    itemCharges: { "cubic-gate": 0 },
    racialUses: { relentlessEndurance: false },
  });
  assert.equal(hitDiceTotal(starting), 4);
  assert.equal(hitDiceAvailable(starting), 2);

  const short = shortRest(starting, { diceToSpend: 1, random: () => 0 });
  assert.equal(short.ok, true);
  assert.deepEqual(short.outcome.rolls, [1]);
  assert.equal(short.outcome.healing, 3);
  assert.equal(short.value.currentHp, 6);
  assert.equal(short.value.hitDiceSpent, 3);
  assert.equal(short.value.racialUses.relentlessEndurance, false);
  assert.equal(short.value.itemCharges["cubic-gate"].current, 0);

  const long = longRest({ ...starting, ...short.value });
  assert.equal(long.ok, true);
  assert.equal(long.value.currentHp, deriveHero(starting).hp);
  assert.equal(long.value.hitDiceSpent, 1);
  assert.equal(long.value.itemCharges["cubic-gate"].current, 3);
  assert.equal(long.value.racialUses.relentlessEndurance, true);
  assert.equal(long.outcome.restHours, 8);
  assert.equal(shortRest(starting, { diceToSpend: 3 }).code, "REST_HIT_DICE_UNAVAILABLE");
});

test("Hide rolls Stealth against each enemy and keeps visibility per target", () => {
  const wall = { id: "cover-wall", type: "full", points: [{ xPercent: 10, yPercent: 0 }, { xPercent: 10, yPercent: 100 }] };
  const ally = createManualToken({
    id: "ally",
    name: "Scout",
    faction: "ally",
    position: at(0, 0),
    dexterity: 16,
    skillProficiencies: ["stealth"],
    inventory: [entry("club")],
    loadout: { mainHand: "club", offHand: null },
  });
  const foe = createManualToken({
    id: "foe",
    name: "Sentinel",
    faction: "foe",
    position: at(1, 0),
    inventory: [entry("club")],
    loadout: { mainHand: "club", offHand: null },
    ac: 5,
  });
  const scene = battle([ally, foe], { walls: [wall] });
  const hidden = activateHide(scene, VIEWPORT, { random: () => 0.999 });
  assert.equal(hidden.ok, true);
  assert.deepEqual(hidden.outcome.hiddenFromTokenIds, ["foe"]);
  assert.equal(hidden.value.encounter.resources.ally.actionSpent, true);
  const hiddenScene = { ...scene, ...hidden.value };
  const blocked = attackTargetEligibility({
    ...hiddenScene,
    encounter: {
      ...hiddenScene.encounter,
      activeIndex: 1,
      resources: { foe: createTurnResources(hiddenScene.tokens[1]) },
    },
  }, { weaponId: "club", hand: "mainHand", targetId: "ally", viewport: VIEWPORT });
  assert.equal(blocked.code, "ATTACK_TARGET_HIDDEN");

  const readyToAttack = {
    ...hiddenScene,
    encounter: {
      ...hiddenScene.encounter,
      activeIndex: 0,
      resources: { ally: createTurnResources(hiddenScene.tokens[0]) },
    },
  };
  const sources = attackRollSources({
    attacker: readyToAttack.tokens[0],
    target: readyToAttack.tokens[1],
    weapon: { id: "club", weaponRange: "melee", propertyIds: [] },
    range: { usage: "melee", distanceFeet: 5, disadvantage: false },
    lineOfSight: { coverBonus: 0 },
    resources: readyToAttack.encounter.resources.ally,
    kind: "action",
  });
  assert.ok(sources.some((source) => source.code === "hidden-attacker"));
  const attack = performWeaponAttack(readyToAttack, { weaponId: "club", hand: "mainHand", targetId: "foe", viewport: VIEWPORT }, { random: sequence(0.999, 0.5) });
  assert.equal(attack.ok, true);
  assert.equal(attack.value.tokens.find((token) => token.id === "ally").hidden, false);
});

test("racial advantages, Lucky, Relentless Endurance, and Savage Attacks are resolved", () => {
  const gnome = createManualToken({ id: "gnome", faction: "ally", position: at(0, 0), racialTraitIds: ["gnome-cunning", "lucky"], magicSaveAdvantages: ["int", "wis", "cha"] });
  const foe = createManualToken({ id: "mage", faction: "foe", position: at(1, 0) });
  const scene = battle([gnome, foe]);
  const save = performSavingThrow(scene, { tokenId: "gnome", ability: "int", dc: 20, magical: true }, { random: sequence(0.1, 0.5) });
  assert.equal(save.ok, true);
  assert.equal(save.outcome.luckyReroll, null);
  assert.ok(save.outcome.sources.some((source) => source.code === "gnome-cunning"));

  const check = performAbilityCheck(scene, { tokenId: "gnome", ability: "wis", dc: 20 }, { random: sequence(0, 0.999) });
  assert.equal(check.outcome.luckyReroll, 20);

  const resilient = createManualToken({ id: "orc", heroId: "orc-hero", hp: 5, maxHp: 10, racialTraitIds: ["relentless-endurance"], racialUses: { relentlessEndurance: true } });
  const damage = resolveIncomingDamage(resilient, 5);
  assert.equal(damage.nextHp, 1);
  assert.equal(damage.relentlessEndurance, true);
  assert.equal(damage.patch.racialUses.relentlessEndurance, false);

  const savage = createManualToken({ id: "savage", racialTraitIds: ["savage-attacks"] });
  const savageScene = battle([
    createManualToken({ ...savage, inventory: [entry("club")], loadout: { mainHand: "club", offHand: null }, position: at(0, 1), faction: "ally" }),
    createManualToken({ id: "target", position: at(1, 1), faction: "foe", hp: 40, maxHp: 40, ac: 5 }),
  ]);
  const critical = performWeaponAttack(savageScene, { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.999, 0.5) });
  assert.equal(critical.ok, true);
  assert.equal(critical.outcome.critical, true);
  assert.equal(critical.outcome.savageAttacks, true);
  assert.equal(critical.outcome.damage.rolls.length, 3);
});
