const trait = (id, name, description, mechanics = {}) => Object.freeze({
  id,
  name,
  description,
  ...mechanics,
});

/**
 * The 2014 SRD racial-trait corpus is kept as a small, queryable rule table.
 * The colour-specific dragon ancestry entries are real source traits even
 * though the character sheet exposes them through one ancestry choice.
 */
export const RACIAL_TRAITS = Object.freeze([
  trait("darkvision", "Darkvision", "See in dim light within 60 feet as if it were bright light, and darkness as if it were dim light."),
  trait("dwarven-resilience", "Dwarven Resilience", "Advantage on saving throws against poison and resistance to poison damage.", { saveAdvantages: ["poison"], damageResistances: ["poison"] }),
  trait("dwarven-combat-training", "Dwarven Combat Training", "Proficiency with battleaxe, handaxe, light hammer, and warhammer.", { weaponProficiencies: ["battleaxe", "handaxe", "light-hammer", "warhammer"] }),
  trait("tool-proficiency", "Tool Proficiency", "Proficiency with one artisan's tool: smith's, brewer's, or mason's tools.", { choice: "dwarfTool" }),
  trait("stonecunning", "Stonecunning", "Double proficiency on History checks related to the origin of stonework.", { conditionalExpertise: [{ skillId: "history", context: "stonework" }] }),
  trait("dwarven-toughness", "Dwarven Toughness", "Your hit point maximum increases by 1 for every level.", { hitPointPerLevel: 1 }),
  trait("keen-senses", "Keen Senses", "Proficiency in the Perception skill.", { skillProficiencies: ["perception"] }),
  trait("fey-ancestry", "Fey Ancestry", "Advantage on saves against being charmed, and magic cannot put you to sleep.", { saveAdvantages: ["charmed"], sleepImmunity: true }),
  trait("trance", "Trance", "You do not need to sleep; meditate deeply for four hours to gain the same benefit as eight hours of sleep.", { longRestHours: 4 }),
  trait("elf-weapon-training", "Elf Weapon Training", "Proficiency with longsword, shortsword, shortbow, and longbow.", { weaponProficiencies: ["longsword", "shortsword", "shortbow", "longbow"] }),
  trait("high-elf-cantrip", "High Elf Cantrip", "Learn one cantrip from the wizard spell list; Intelligence is your spellcasting ability.", { choice: "highElfCantrip", spellcasting: { ability: "int", spells: ["cantrip"] } }),
  trait("extra-language", "Extra Language", "You can speak, read, and write one extra language of your choice.", { choice: "extraLanguage" }),
  trait("lucky", "Lucky", "When you roll a 1 on an attack roll, ability check, or saving throw, reroll the die and use the new roll.", { rerollNaturalOne: true }),
  trait("brave", "Brave", "Advantage on saving throws against being frightened.", { saveAdvantages: ["frightened"] }),
  trait("halfling-nimbleness", "Halfling Nimbleness", "You can move through the space of any creature that is a size larger than you."),
  trait("naturally-stealthy", "Naturally Stealthy", "You can attempt to hide when obscured only by a creature at least one size larger than you.", { hideBehindLargerCreature: true }),
  trait("draconic-ancestry", "Draconic Ancestry", "Choose one kind of dragon; it determines your damage resistance and breath weapon.", { choice: "dragonAncestry" }),
  trait("draconic-ancestry-black", "Draconic Ancestry (Black)", "Acid damage; 5 by 30 foot line breath weapon, Dexterity save."),
  trait("draconic-ancestry-blue", "Draconic Ancestry (Blue)", "Lightning damage; 5 by 30 foot line breath weapon, Dexterity save."),
  trait("draconic-ancestry-brass", "Draconic Ancestry (Brass)", "Fire damage; 5 by 30 foot line breath weapon, Dexterity save."),
  trait("draconic-ancestry-bronze", "Draconic Ancestry (Bronze)", "Lightning damage; 5 by 30 foot line breath weapon, Dexterity save."),
  trait("draconic-ancestry-copper", "Draconic Ancestry (Copper)", "Acid damage; 5 by 30 foot line breath weapon, Dexterity save."),
  trait("draconic-ancestry-gold", "Draconic Ancestry (Gold)", "Fire damage; 15 foot cone breath weapon, Dexterity save."),
  trait("draconic-ancestry-green", "Draconic Ancestry (Green)", "Poison damage; 15 foot cone breath weapon, Constitution save."),
  trait("draconic-ancestry-red", "Draconic Ancestry (Red)", "Fire damage; 15 foot cone breath weapon, Dexterity save."),
  trait("draconic-ancestry-silver", "Draconic Ancestry (Silver)", "Cold damage; 15 foot cone breath weapon, Constitution save."),
  trait("draconic-ancestry-white", "Draconic Ancestry (White)", "Cold damage; 15 foot cone breath weapon, Constitution save."),
  trait("breath-weapon", "Breath Weapon", "Use an action to exhale destructive energy; targets make the ancestry's save. Damage scales from 2d6 at level 1 to 5d6 at level 16, and it recharges on a short or long rest.", { action: true, recharge: "short-rest" }),
  trait("damage-resistance", "Damage Resistance", "Resistance to the damage type associated with your draconic ancestry.", { choice: "dragonAncestry", damageResistanceByChoice: true }),
  trait("gnome-cunning", "Gnome Cunning", "Advantage on Intelligence, Wisdom, and Charisma saving throws against magic.", { magicSaveAdvantages: ["int", "wis", "cha"] }),
  trait("artificers-lore", "Artificer's Lore", "Double proficiency on History checks related to magic items, alchemical objects, or technological devices.", { conditionalExpertise: [{ skillId: "history", context: "magic-item" }] }),
  trait("tinker", "Tinker", "Proficiency with artisan's tools and the ability to construct tiny clockwork devices.", { toolProficiencies: ["tinkers-tools"], choice: "tinkerDevice" }),
  trait("skill-versatility", "Skill Versatility", "Proficiency in any two skills of your choice.", { choice: "halfElfSkills" }),
  trait("menacing", "Menacing", "Proficiency in the Intimidation skill.", { skillProficiencies: ["intimidation"] }),
  trait("relentless-endurance", "Relentless Endurance", "When reduced to 0 hit points but not killed outright, drop to 1 hit point instead. Recharges after a long rest.", { longRestUse: true }),
  trait("savage-attacks", "Savage Attacks", "When you score a critical hit with a melee weapon, roll one additional weapon damage die.", { extraMeleeCriticalDie: true }),
  trait("hellish-resistance", "Hellish Resistance", "Resistance to fire damage.", { damageResistances: ["fire"] }),
  trait("infernal-legacy", "Infernal Legacy", "Thaumaturgy cantrip; Hellish Rebuke once per long rest at level 3; Darkness once per long rest at level 5, using Charisma.", { longRestUse: true, spellcasting: { ability: "cha", spells: ["thaumaturgy", "hellish-rebuke", "darkness"] } }),
]);

export const RACIAL_TRAIT_BY_ID = Object.freeze(
  Object.fromEntries(RACIAL_TRAITS.map((entry) => [entry.id, entry])),
);

export const DRAGON_ANCESTRIES = Object.freeze([
  { id: "black", label: "Black", damageType: "acid", breathShape: "line", saveAbility: "dex" },
  { id: "blue", label: "Blue", damageType: "lightning", breathShape: "line", saveAbility: "dex" },
  { id: "brass", label: "Brass", damageType: "fire", breathShape: "line", saveAbility: "dex" },
  { id: "bronze", label: "Bronze", damageType: "lightning", breathShape: "line", saveAbility: "dex" },
  { id: "copper", label: "Copper", damageType: "acid", breathShape: "line", saveAbility: "dex" },
  { id: "gold", label: "Gold", damageType: "fire", breathShape: "cone", saveAbility: "dex" },
  { id: "green", label: "Green", damageType: "poison", breathShape: "cone", saveAbility: "con" },
  { id: "red", label: "Red", damageType: "fire", breathShape: "cone", saveAbility: "dex" },
  { id: "silver", label: "Silver", damageType: "cold", breathShape: "cone", saveAbility: "con" },
  { id: "white", label: "White", damageType: "cold", breathShape: "cone", saveAbility: "con" },
]);

const DRAGON_BY_ID = Object.freeze(Object.fromEntries(DRAGON_ANCESTRIES.map((entry) => [entry.id, entry])));
const DwarfToolIds = Object.freeze(["smiths-tools", "brewers-supplies", "masons-tools"]);
const SKILL_IDS = Object.freeze([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history", "insight", "intimidation",
  "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);

const BASE_TRAITS = Object.freeze({
  dwarf: ["darkvision", "dwarven-resilience", "stonecunning", "dwarven-combat-training", "tool-proficiency"],
  elf: ["darkvision", "fey-ancestry", "trance", "keen-senses"],
  halfling: ["brave", "halfling-nimbleness", "lucky"],
  human: [],
  dragonborn: ["draconic-ancestry", "breath-weapon", "damage-resistance"],
  gnome: ["darkvision", "gnome-cunning"],
  "half-elf": ["darkvision", "fey-ancestry", "skill-versatility"],
  "half-orc": ["darkvision", "savage-attacks", "relentless-endurance", "menacing"],
  tiefling: ["darkvision", "hellish-resistance", "infernal-legacy"],
});

const SUBRACE_TRAITS = Object.freeze({
  "hill-dwarf": ["dwarven-toughness"],
  "high-elf": ["elf-weapon-training", "high-elf-cantrip", "extra-language"],
  "lightfoot-halfling": ["naturally-stealthy"],
  "rock-gnome": ["artificers-lore", "tinker"],
});

const cleanChoice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;

export function normalizeRacialChoices(value = {}) {
  const dragonAncestry = cleanChoice(String(value.dragonAncestry || "red").toLowerCase(), DRAGON_ANCESTRIES.map((entry) => entry.id), "red");
  const dwarfTool = cleanChoice(String(value.dwarfTool || "smiths-tools").toLowerCase(), DwarfToolIds, "smiths-tools");
  const halfElfSkills = Array.isArray(value.halfElfSkills)
    ? [...new Set(value.halfElfSkills.filter((id) => SKILL_IDS.includes(id)))].slice(0, 2)
    : [];
  const extraLanguage = typeof value.extraLanguage === "string" && value.extraLanguage.trim()
    ? value.extraLanguage.trim()
    : null;
  const highElfCantrip = typeof value.highElfCantrip === "string" && value.highElfCantrip.trim()
    ? value.highElfCantrip.trim()
    : null;
  const tinkerDevice = typeof value.tinkerDevice === "string" && value.tinkerDevice.trim()
    ? value.tinkerDevice.trim().slice(0, 80)
    : null;
  return { dragonAncestry, dwarfTool, halfElfSkills, extraLanguage, highElfCantrip, tinkerDevice };
}

export function racialTraitIds(raceId, subraceId, choices = {}) {
  const normalizedRace = String(raceId || "human").toLowerCase();
  const normalizedChoices = normalizeRacialChoices(choices);
  const ids = [...(BASE_TRAITS[normalizedRace] || []), ...(SUBRACE_TRAITS[String(subraceId || "").toLowerCase()] || [])];
  if (normalizedRace === "dragonborn") ids.push(`draconic-ancestry-${normalizedChoices.dragonAncestry}`);
  return [...new Set(ids)].filter((id) => RACIAL_TRAIT_BY_ID[id]);
}

export const racialTraitsFor = (raceId, subraceId, choices = {}) =>
  racialTraitIds(raceId, subraceId, choices).map((id) => RACIAL_TRAIT_BY_ID[id]).filter(Boolean);

export function dragonAncestryFor(value) {
  return DRAGON_BY_ID[normalizeRacialChoices({ dragonAncestry: value }).dragonAncestry];
}

export function racialSkillProficiencies(traitIds, choices = {}) {
  const traits = new Set(traitIds || []);
  const normalized = normalizeRacialChoices(choices);
  return [...new Set([
    ...(traits.has("keen-senses") ? ["perception"] : []),
    ...(traits.has("menacing") ? ["intimidation"] : []),
    ...(traits.has("skill-versatility") ? normalized.halfElfSkills : []),
  ])];
}

export function racialToolProficiencies(traitIds, choices = {}) {
  const traits = new Set(traitIds || []);
  const normalized = normalizeRacialChoices(choices);
  return [...new Set([
    ...(traits.has("tool-proficiency") ? [normalized.dwarfTool] : []),
    ...(traits.has("tinker") ? ["tinkers-tools"] : []),
  ])];
}

export function racialWeaponProficiencies(traitIds) {
  const traits = new Set(traitIds || []);
  return [...new Set([
    ...(traits.has("dwarven-combat-training") ? ["battleaxe", "handaxe", "light-hammer", "warhammer"] : []),
    ...(traits.has("elf-weapon-training") ? ["longsword", "shortsword", "shortbow", "longbow"] : []),
  ])];
}

export function racialStateFor(raceId, subraceId, choices = {}) {
  const normalizedChoices = normalizeRacialChoices(choices);
  const traitIds = racialTraitIds(raceId, subraceId, normalizedChoices);
  const traits = racialTraitsFor(raceId, subraceId, normalizedChoices);
  const ancestry = traitIds.includes("draconic-ancestry") ? dragonAncestryFor(normalizedChoices.dragonAncestry) : null;
  const saveAdvantages = [...new Set(traits.flatMap((entry) => entry.saveAdvantages || []))];
  const damageResistances = [...new Set([
    ...traits.flatMap((entry) => entry.damageResistances || []),
    ...(ancestry ? [ancestry.damageType] : []),
  ])];
  const conditionalExpertise = traits.flatMap((entry) => entry.conditionalExpertise || []);
  const spellcasting = traits.find((entry) => entry.spellcasting)?.spellcasting || null;
  return {
    traitIds,
    traits,
    choices: normalizedChoices,
    darkvisionFeet: traitIds.includes("darkvision") ? 60 : 0,
    skillProficiencies: racialSkillProficiencies(traitIds, normalizedChoices),
    toolProficiencies: racialToolProficiencies(traitIds, normalizedChoices),
    weaponProficiencies: racialWeaponProficiencies(traitIds),
    saveAdvantages,
    magicSaveAdvantages: traits.flatMap((entry) => entry.magicSaveAdvantages || []),
    damageResistances,
    conditionalExpertise,
    hitPointBonusPerLevel: traits.reduce((total, entry) => total + Number(entry.hitPointPerLevel || 0), 0),
    sleepImmunity: traits.some((entry) => entry.sleepImmunity),
    restHours: traits.find((entry) => entry.longRestHours)?.longRestHours || 8,
    hideBehindLargerCreature: traits.some((entry) => entry.hideBehindLargerCreature),
    lucky: traitIds.includes("lucky"),
    savageAttacks: traitIds.includes("savage-attacks"),
    relentlessEndurance: traitIds.includes("relentless-endurance"),
    breathWeapon: traitIds.includes("breath-weapon") && ancestry
      ? { ...ancestry, damageDiceByLevel: { 1: "2d6", 6: "3d6", 11: "4d6", 16: "5d6" }, recharge: "short-rest" }
      : null,
    racialSpellcasting: spellcasting,
  };
}

export function normalizeRacialUses(value = {}, traitIds = []) {
  const traits = new Set(traitIds);
  const legacy = value && typeof value === "object" ? value : {};
  const infernal = legacy.infernalLegacy && typeof legacy.infernalLegacy === "object" ? legacy.infernalLegacy : {};
  return {
    breathWeapon: traits.has("breath-weapon") ? legacy.breathWeapon !== false : false,
    relentlessEndurance: traits.has("relentless-endurance") ? legacy.relentlessEndurance !== false : false,
    infernalLegacy: {
      hellishRebuke: traits.has("infernal-legacy") ? infernal.hellishRebuke !== false : false,
      darkness: traits.has("infernal-legacy") ? infernal.darkness !== false : false,
    },
  };
}

export function resetRacialUses(value, traitIds, restKind = "long") {
  const normalized = normalizeRacialUses(value, traitIds);
  if (restKind === "short" || restKind === "long") normalized.breathWeapon = new Set(traitIds).has("breath-weapon");
  if (restKind === "long") {
    normalized.relentlessEndurance = new Set(traitIds).has("relentless-endurance");
    normalized.infernalLegacy = {
      hellishRebuke: new Set(traitIds).has("infernal-legacy"),
      darkness: new Set(traitIds).has("infernal-legacy"),
    };
  }
  return normalized;
}
