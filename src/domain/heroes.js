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

export function deriveHero(hero, { equipmentById = {}, acBonus = 0 } = {}) {
  const selectedClass = classById(hero?.classId);
  const race = raceById(hero?.raceId);
  const selectedSubrace = subraceById(race.id, hero?.subraceId);
  const bonuses = racialAbilityBonuses(race.id, selectedSubrace?.id);
  const baseAbilities = normalizeBaseAbilities(hero?.baseAbilities);
  const finalAbilities = Object.fromEntries(
    ABILITY_KEYS.map((ability) => [ability, baseAbilities[ability] + bonuses[ability]]),
  );
  const level = Math.max(1, Math.min(20, Math.floor(Number(hero?.level) || 1)));
  const constitutionModifier = abilityModifier(finalAbilities.con);
  const laterLevelGain = selectedClass.hitDie / 2 + 1 + constitutionModifier;
  const hp = Math.max(1, selectedClass.hitDie + constitutionModifier + (level - 1) * Math.max(1, laterLevelGain));
  const armor = equipmentById[hero?.armorId] || null;
  const shield = equipmentById[hero?.shieldId] || null;
  const strengthMinimum = armor?.category === "heavy" ? Number(armor.strengthMinimum || 0) : 0;
  const speed = race.speed - (strengthMinimum > finalAbilities.str ? 10 : 0);
  const proficiency = proficiencyBonus(level);
  const spellAbilityModifier = selectedClass.spellcasting
    ? abilityModifier(finalAbilities[selectedClass.spellcasting.ability])
    : null;

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
    ac: computeArmorClass({
      dexterity: finalAbilities.dex,
      armor,
      shield,
      armorBonus: hero?.enchantments?.[hero?.armorId] || 0,
      shieldBonus: hero?.enchantments?.[hero?.shieldId] || 0,
      acBonus,
    }),
    initiative: abilityModifier(finalAbilities.dex),
    baseSpeed: race.speed,
    speed,
    size: race.size,
    languages: [...new Set([...grantedLanguages(race.id, selectedSubrace?.id), ...(hero?.languages || [])])],
    spellcasting: selectedClass.spellcasting
      ? {
          ability: selectedClass.spellcasting.ability,
          saveDc: 8 + proficiency + spellAbilityModifier,
          attackBonus: proficiency + spellAbilityModifier,
          slots: selectedClass.spellcasting.slots,
          spells: selectedClass.spellcasting.spells,
        }
      : null,
  };
}

export const saveModifier = (hero, derived, ability) =>
  derived.abilityModifiers[ability] +
  (hero.saveProficiencies?.includes(ability) ? derived.proficiency : 0);

export const skillModifier = (hero, derived, skill) =>
  derived.abilityModifiers[skill.ability] +
  (hero.skillProficiencies?.includes(skill.id) ? derived.proficiency : 0);
