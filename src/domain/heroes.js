import { ITEM_BY_ID } from "./catalog.js";
import { normalizeInventoryEntries, wornMagicBonuses } from "./items.js";
import { normalizeRacialChoices, racialStateFor } from "./racialTraits.js";

export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

export const ABILITIES = Object.freeze([
  { id: "str", short: "STR", name: "Strength" },
  { id: "dex", short: "DEX", name: "Dexterity" },
  { id: "con", short: "CON", name: "Constitution" },
  { id: "int", short: "INT", name: "Intelligence" },
  { id: "wis", short: "WIS", name: "Wisdom" },
  { id: "cha", short: "CHA", name: "Charisma" },
]);

export const CLASSES = Object.freeze([
  {
    id: "fighter",
    name: "Fighter",
    hitDie: 10,
    saveProficiencies: ["str", "con"],
    recommendedSkillCount: 2,
    skillOptions: [
      "acrobatics",
      "animal-handling",
      "athletics",
      "history",
      "insight",
      "intimidation",
      "perception",
      "survival",
    ],
    spellcasting: null,
  },
  {
    id: "wizard",
    name: "Wizard",
    hitDie: 6,
    saveProficiencies: ["int", "wis"],
    recommendedSkillCount: 2,
    skillOptions: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
    spellcasting: { ability: "int", slots: "unlimited", spells: "unlimited" },
  },
]);

const subrace = (id, name, abilityBonuses = {}, languages = []) =>
  Object.freeze({ id, name, abilityBonuses: Object.freeze(abilityBonuses), languages: Object.freeze(languages) });

export const RACES = Object.freeze([
  {
    id: "dwarf", name: "Dwarf", speed: 25, size: "Medium",
    abilityBonuses: { con: 2 }, languages: ["Common", "Dwarvish"],
    subraces: [subrace("hill-dwarf", "Hill Dwarf", { wis: 1 })],
  },
  {
    id: "elf", name: "Elf", speed: 30, size: "Medium",
    abilityBonuses: { dex: 2 }, languages: ["Common", "Elvish"],
    subraces: [subrace("high-elf", "High Elf", { int: 1 })],
  },
  {
    id: "halfling", name: "Halfling", speed: 25, size: "Small",
    abilityBonuses: { dex: 2 }, languages: ["Common", "Halfling"],
    subraces: [subrace("lightfoot-halfling", "Lightfoot Halfling", { cha: 1 })],
  },
  {
    id: "human", name: "Human", speed: 30, size: "Medium",
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    languages: ["Common"], subraces: [],
  },
  {
    id: "dragonborn", name: "Dragonborn", speed: 30, size: "Medium",
    abilityBonuses: { str: 2, cha: 1 }, languages: ["Common", "Draconic"], subraces: [],
  },
  {
    id: "gnome", name: "Gnome", speed: 25, size: "Small",
    abilityBonuses: { int: 2 }, languages: ["Common", "Gnomish"],
    subraces: [subrace("rock-gnome", "Rock Gnome", { con: 1 })],
  },
  {
    id: "half-elf", name: "Half-Elf", speed: 30, size: "Medium",
    abilityBonuses: { cha: 2 }, languages: ["Common", "Elvish"], subraces: [],
  },
  {
    id: "half-orc", name: "Half-Orc", speed: 30, size: "Medium",
    abilityBonuses: { str: 2, con: 1 }, languages: ["Common", "Orc"], subraces: [],
  },
  {
    id: "tiefling", name: "Tiefling", speed: 30, size: "Medium",
    abilityBonuses: { int: 1, cha: 2 }, languages: ["Common", "Infernal"], subraces: [],
  },
].map((race) => Object.freeze({
  ...race,
  abilityBonuses: Object.freeze(race.abilityBonuses),
  languages: Object.freeze(race.languages),
  subraces: Object.freeze(race.subraces),
})));

export const ALIGNMENTS = Object.freeze([
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
]);

export const LANGUAGES = Object.freeze([
  "Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc",
  "Abyssal", "Celestial", "Draconic", "Deep Speech", "Infernal", "Primordial", "Sylvan", "Undercommon",
]);

export const BACKGROUNDS = Object.freeze([
  "Acolyte", "Charlatan", "Criminal", "Entertainer", "Folk Hero", "Guild Artisan",
  "Hermit", "Noble", "Outlander", "Sage", "Sailor", "Soldier", "Urchin",
]);

const background = (id, name, skills, tools, equipment) => Object.freeze({
  id,
  name,
  skills: Object.freeze(skills),
  tools: Object.freeze(tools),
  equipment: Object.freeze(equipment.map(([itemId, quantity = 1]) => Object.freeze({ itemId, quantity }))),
});

/** Catalog-backed defaults are used where a background normally offers a choice. */
export const BACKGROUND_DETAILS = Object.freeze([
  background("acolyte", "Acolyte", ["insight", "religion"], [], [["amulet"], ["book"], ["block-of-incense", 5], ["vestments"], ["clothes-common"], ["pouch"]]),
  background("charlatan", "Charlatan", ["deception", "sleight-of-hand"], ["disguise-kit", "forgery-kit"], [["clothes-fine"], ["disguise-kit"], ["forgery-kit"], ["pouch"]]),
  background("criminal", "Criminal", ["deception", "stealth"], ["dice-set", "thieves-tools"], [["crowbar"], ["clothes-common"], ["pouch"]]),
  background("entertainer", "Entertainer", ["acrobatics", "performance"], ["disguise-kit", "lute"], [["lute"], ["clothes-costume"], ["pouch"]]),
  background("folk-hero", "Folk Hero", ["animal-handling", "survival"], ["smiths-tools", "vehicles-land"], [["smiths-tools"], ["shovel"], ["pot-iron"], ["clothes-common"], ["pouch"]]),
  background("guild-artisan", "Guild Artisan", ["insight", "persuasion"], ["smiths-tools"], [["smiths-tools"], ["clothes-travelers"], ["pouch"]]),
  background("hermit", "Hermit", ["medicine", "religion"], ["herbalism-kit"], [["case-map-or-scroll"], ["blanket"], ["clothes-common"], ["herbalism-kit"], ["pouch"]]),
  background("noble", "Noble", ["history", "persuasion"], ["dice-set"], [["clothes-fine"], ["signet-ring"], ["case-map-or-scroll"], ["pouch"]]),
  background("outlander", "Outlander", ["athletics", "survival"], ["flute"], [["quarterstaff"], ["hunting-trap"], ["clothes-travelers"], ["pouch"]]),
  background("sage", "Sage", ["arcana", "history"], [], [["ink-1-ounce-bottle"], ["ink-pen"], ["small-knife"], ["clothes-common"], ["pouch"]]),
  background("sailor", "Sailor", ["athletics", "perception"], ["navigators-tools", "vehicles-water"], [["club"], ["rope-silk-50-feet"], ["clothes-common"], ["pouch"]]),
  background("soldier", "Soldier", ["athletics", "intimidation"], ["dice-set", "vehicles-land"], [["dice-set"], ["clothes-common"], ["pouch"]]),
  background("urchin", "Urchin", ["sleight-of-hand", "stealth"], ["disguise-kit", "thieves-tools"], [["small-knife"], ["case-map-or-scroll"], ["clothes-common"], ["pouch"]]),
]);

export const backgroundById = (id) => BACKGROUND_DETAILS.find((entry) => entry.id === String(id || "").trim().toLowerCase()) || null;
export const backgroundByName = (name) => BACKGROUND_DETAILS.find((entry) => entry.name.toLowerCase() === String(name || "").trim().toLowerCase()) || null;

const subtractGrantedEquipment = (inventory, equipment) => {
  const quantities = new Map(normalizeInventoryEntries(inventory).inventory.map((entry) => [entry.itemId, entry.quantity]));
  for (const grant of equipment || []) quantities.set(grant.itemId, Math.max(0, (quantities.get(grant.itemId) || 0) - grant.quantity));
  return [...quantities].flatMap(([itemId, quantity]) => quantity > 0 ? [{ itemId, quantity }] : []);
};

export function applyBackgroundBenefits(hero, backgroundId) {
  const next = backgroundById(backgroundId) || backgroundByName(backgroundId);
  if (!next) return { ok: false, code: "BACKGROUND_UNKNOWN", message: "Choose one of the thirteen Nightforge backgrounds.", recovery: "Select a background from the list.", retryable: false };
  const previous = backgroundById(hero?.backgroundBenefitId);
  const previousSkills = new Set(previous?.skills || []);
  const previousTools = new Set(previous?.tools || []);
  const chosenSkills = (hero?.skillProficiencies || []).filter((id) => !previousSkills.has(id));
  const chosenTools = (hero?.toolProficiencies || []).filter((id) => !previousTools.has(id));
  const retainedInventory = subtractGrantedEquipment(hero?.inventory, previous?.equipment || []);
  const inventory = normalizeInventoryEntries([...retainedInventory, ...next.equipment]).inventory;
  return {
    ok: true,
    value: {
      background: next.name,
      backgroundBenefitId: next.id,
      skillProficiencies: [...new Set([...chosenSkills, ...next.skills])],
      toolProficiencies: [...new Set([...chosenTools, ...next.tools])],
      inventory,
    },
    background: next,
  };
}

export const SAVING_THROWS = Object.freeze(
  ABILITIES.map((ability) => Object.freeze({ ...ability })),
);

export const SKILLS = Object.freeze([
  { id: "acrobatics", name: "Acrobatics", ability: "dex" },
  { id: "animal-handling", name: "Animal Handling", ability: "wis" },
  { id: "arcana", name: "Arcana", ability: "int" },
  { id: "athletics", name: "Athletics", ability: "str" },
  { id: "deception", name: "Deception", ability: "cha" },
  { id: "history", name: "History", ability: "int" },
  { id: "insight", name: "Insight", ability: "wis" },
  { id: "intimidation", name: "Intimidation", ability: "cha" },
  { id: "investigation", name: "Investigation", ability: "int" },
  { id: "medicine", name: "Medicine", ability: "wis" },
  { id: "nature", name: "Nature", ability: "int" },
  { id: "perception", name: "Perception", ability: "wis" },
  { id: "performance", name: "Performance", ability: "cha" },
  { id: "persuasion", name: "Persuasion", ability: "cha" },
  { id: "religion", name: "Religion", ability: "int" },
  { id: "sleight-of-hand", name: "Sleight of Hand", ability: "dex" },
  { id: "stealth", name: "Stealth", ability: "dex" },
  { id: "survival", name: "Survival", ability: "wis" },
].map(Object.freeze));

export const POINT_BUY_COSTS = Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
export const POINT_BUY_BUDGET = 27;

export const classById = (id) =>
  CLASSES.find((entry) => entry.id === String(id || "").toLowerCase()) || CLASSES[0];

export const raceById = (id) =>
  RACES.find((entry) => entry.id === String(id || "").toLowerCase()) ||
  RACES.find((entry) => entry.id === "human");

export const subraceById = (raceId, id) => {
  const race = raceById(raceId);
  return race.subraces.find((entry) => entry.id === id) || race.subraces[0] || null;
};

export const pointBuyCost = (score) => POINT_BUY_COSTS[score] ?? Infinity;

export const pointBuySpent = (baseAbilities = {}) =>
  ABILITY_KEYS.reduce((total, ability) => total + pointBuyCost(baseAbilities[ability]), 0);

export const pointBuyRemaining = (baseAbilities = {}) =>
  Math.max(0, POINT_BUY_BUDGET - pointBuySpent(baseAbilities));

export function normalizeBaseAbilities(value = {}) {
  const normalized = Object.fromEntries(
    ABILITY_KEYS.map((ability) => [
      ability,
      Math.max(8, Math.min(15, Math.floor(Number(value[ability]) || 8))),
    ]),
  );
  while (pointBuySpent(normalized) > POINT_BUY_BUDGET) {
    const ability = [...ABILITY_KEYS]
      .reverse()
      .find((key) => normalized[key] > 8);
    if (!ability) break;
    normalized[ability] -= 1;
  }
  return normalized;
}

export function canSetBaseAbility(baseAbilities, ability, score) {
  if (!ABILITY_KEYS.includes(ability) || !Number.isInteger(score) || score < 8 || score > 15) return false;
  return pointBuySpent({ ...baseAbilities, [ability]: score }) <= POINT_BUY_BUDGET;
}

export const abilityModifier = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
export const formatModifier = (value) => (value >= 0 ? `+${value}` : String(value).replace("-", "−"));

/**
 * Experience needed to reach each level, indexed from zero, so
 * XP_THRESHOLDS[n] is the requirement for level n + 1. Level 1 costs nothing.
 * Nightforge never levels a Hero on its own — the table exists so the sheet can
 * say when a level is available and leave the choice to the person playing.
 */
export const XP_THRESHOLDS = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]);

export const MAX_LEVEL = XP_THRESHOLDS.length;

const cleanExperience = (xp) => Math.max(0, Math.floor(Number(xp) || 0));

export function levelForXp(xp) {
  const total = cleanExperience(xp);
  let level = 1;
  for (let index = 1; index < XP_THRESHOLDS.length; index += 1) {
    if (total >= XP_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

export const xpForLevel = (level) =>
  XP_THRESHOLDS[Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1))) - 1];

/** Experience still owed before the next level, or null once level 20 is reached. */
export function xpToNextLevel(xp) {
  const total = cleanExperience(xp);
  const level = levelForXp(total);
  if (level >= MAX_LEVEL) return null;
  return XP_THRESHOLDS[level] - total;
}

export function racialAbilityBonuses(raceId, subraceId) {
  const race = raceById(raceId);
  const selectedSubrace = subraceById(race.id, subraceId);
  return Object.fromEntries(
    ABILITY_KEYS.map((ability) => [
      ability,
      (race.abilityBonuses[ability] || 0) + (selectedSubrace?.abilityBonuses[ability] || 0),
    ]),
  );
}

export const grantedLanguages = (raceId, subraceId) => {
  const race = raceById(raceId);
  const selectedSubrace = subraceById(race.id, subraceId);
  return [...new Set([...race.languages, ...(selectedSubrace?.languages || [])])];
};

export function computeArmorClass({
  dexterity,
  armor = null,
  shield = null,
  armorBonus = 0,
  shieldBonus = 0,
  acBonus = 0,
} = {}) {
  const dexterityModifier = abilityModifier(dexterity);
  let armorClass = 10 + dexterityModifier;
  if (armor) {
    const dexterityContribution = armor.category === "heavy"
      ? 0
      : armor.category === "medium"
        ? Math.min(2, dexterityModifier)
        : dexterityModifier;
    armorClass = Number(armor.baseAc) + dexterityContribution + Number(armorBonus || 0);
  }
  if (shield) armorClass += Number(shield.baseAc ?? 2) + Number(shieldBonus || 0);
  return armorClass + Number(acBonus || 0);
}

export function deriveHero(hero, { equipmentById = ITEM_BY_ID, acBonus = 0 } = {}) {
  const selectedClass = classById(hero?.classId);
  const race = raceById(hero?.raceId);
  const selectedSubrace = subraceById(race.id, hero?.subraceId);
  const bonuses = racialAbilityBonuses(race.id, selectedSubrace?.id);
  const baseAbilities = normalizeBaseAbilities(hero?.baseAbilities);
  const finalAbilities = Object.fromEntries(
    ABILITY_KEYS.map((ability) => [ability, baseAbilities[ability] + bonuses[ability]]),
  );
  const level = Math.max(1, Math.min(20, Math.floor(Number(hero?.level) || 1)));
  const racial = racialStateFor(race.id, selectedSubrace?.id, hero?.racialChoices);
  const constitutionModifier = abilityModifier(finalAbilities.con);
  const laterLevelGain = selectedClass.hitDie / 2 + 1 + constitutionModifier;
  const hp = Math.max(1, selectedClass.hitDie + constitutionModifier + (level - 1) * Math.max(1, laterLevelGain) + racial.hitPointBonusPerLevel * level);
  const armor = equipmentById[hero?.armorId] || null;
  const shield = equipmentById[hero?.shieldId] || null;
  const strengthMinimum = armor?.category === "heavy" ? Number(armor.strengthMinimum || 0) : 0;
  const speed = race.speed - (strengthMinimum > finalAbilities.str ? 10 : 0);
  const proficiency = proficiencyBonus(level);
  const spellAbilityModifier = selectedClass.spellcasting
    ? abilityModifier(finalAbilities[selectedClass.spellcasting.ability])
    : null;
  const magicBonuses = wornMagicBonuses(hero, equipmentById);
  const skillProficiencies = [...new Set([...(hero?.skillProficiencies || []), ...racial.skillProficiencies])];
  const toolProficiencies = [...new Set([...(hero?.toolProficiencies || []), ...racial.toolProficiencies])];
  const weaponProficiencies = racial.weaponProficiencies;

  return {
    class: selectedClass,
    race,
    subrace: selectedSubrace,
    level,
    baseAbilities,
    finalAbilities,
    abilityModifiers: Object.fromEntries(
      ABILITY_KEYS.map((ability) => [ability, abilityModifier(finalAbilities[ability])]),
    ),
    pointBuySpent: pointBuySpent(baseAbilities),
    pointBuyRemaining: pointBuyRemaining(baseAbilities),
    proficiency,
    hp,
    currentHp: Math.max(0, Math.min(hp, Math.floor(Number(hero?.currentHp ?? hp) || 0))),
    ac: computeArmorClass({
      dexterity: finalAbilities.dex,
      armor,
      shield,
      armorBonus: hero?.enchantments?.[hero?.armorId] || 0,
      shieldBonus: hero?.enchantments?.[hero?.shieldId] || 0,
      acBonus: Number(acBonus || 0) + magicBonuses.ac,
    }),
    initiative: abilityModifier(finalAbilities.dex),
    baseSpeed: race.speed,
    speed,
    size: race.size,
    saveBonus: magicBonuses.save,
    attackBonus: magicBonuses.attack,
    rangedDamageBonus: magicBonuses.rangedDamage,
    magicBonuses,
    racialChoices: normalizeRacialChoices(hero?.racialChoices),
    traitIds: racial.traitIds,
    traits: racial.traits,
    darkvisionFeet: racial.darkvisionFeet,
    skillProficiencies,
    racialSkillProficiencies: racial.skillProficiencies,
    toolProficiencies,
    weaponProficiencies,
    saveAdvantages: racial.saveAdvantages,
    magicSaveAdvantages: racial.magicSaveAdvantages,
    damageResistances: racial.damageResistances,
    conditionalExpertise: racial.conditionalExpertise,
    hitPointBonusPerLevel: racial.hitPointBonusPerLevel,
    sleepImmunity: racial.sleepImmunity,
    restHours: racial.restHours,
    hideBehindLargerCreature: racial.hideBehindLargerCreature,
    lucky: racial.lucky,
    savageAttacks: racial.savageAttacks,
    relentlessEndurance: racial.relentlessEndurance,
    breathWeapon: racial.breathWeapon,
    racialSpellcasting: racial.racialSpellcasting,
    languages: [...new Set([
      ...grantedLanguages(race.id, selectedSubrace?.id),
      ...(hero?.languages || []),
      ...(racial.choices.extraLanguage ? [racial.choices.extraLanguage] : []),
    ])],
    spellcasting: selectedClass.spellcasting
      ? {
          ability: selectedClass.spellcasting.ability,
          saveDc: 8 + proficiency + spellAbilityModifier,
          attackBonus: proficiency + spellAbilityModifier + magicBonuses.attack,
          slots: selectedClass.spellcasting.slots,
          spells: selectedClass.spellcasting.spells,
        }
      : null,
  };
}

export const saveModifier = (hero, derived, ability) =>
  derived.abilityModifiers[ability] +
  (hero.saveProficiencies?.includes(ability) ? derived.proficiency : 0) +
  Number(derived.saveBonus || 0);

export const skillModifier = (hero, derived, skill) =>
  derived.abilityModifiers[skill.ability] +
  ((derived.skillProficiencies || hero?.skillProficiencies || []).includes(skill.id) ? derived.proficiency : 0);
