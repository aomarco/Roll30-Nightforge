import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceDirectory = process.argv[2];
const outputFile = process.argv[3] || path.resolve("src/domain/monsters.generated.js");

if (!sourceDirectory) {
  throw new Error("Usage: node scripts/generate-monsters.mjs <SRD directory> [output file]");
}

const sourcePath = path.join(sourceDirectory, "5e-SRD-Monsters.json");
const sourceText = await readFile(sourcePath, "utf8");
const sourceHash = createHash("sha256").update(sourceText).digest("hex").toUpperCase();
const monsterSource = JSON.parse(sourceText);

const EDITION = "2014 / SRD 5.1";
const DEFINITION_VERSION = 2;
const PARSER_VERSION = "2.0.0";

const SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
});

const feet = (value) => {
  const match = /(\d+)/.exec(String(value || ""));
  return match ? Number(match[1]) : 0;
};

const titleCase = (value) =>
  String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());

const slug = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/^(?:skill|saving throw):\s*/, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const abilityIdByName = Object.freeze({
  STR: "str", DEX: "dex", CON: "con", INT: "int", WIS: "wis", CHA: "cha",
});

const abilityModifier = (score) => Math.floor((Number(score || 10) - 10) / 2);

const proficiencyRecords = (entry) => (entry.proficiencies || []).flatMap((record) => {
  const name = String(record.proficiency?.name || "");
  const save = /^Saving Throw:\s*([A-Z]{3})$/i.exec(name);
  const skill = /^Skill:\s*(.+)$/i.exec(name);
  if (save && abilityIdByName[save[1].toUpperCase()]) {
    return [{
      kind: "save",
      id: abilityIdByName[save[1].toUpperCase()],
      name: save[1].toUpperCase(),
      total: Number(record.value),
    }];
  }
  if (skill) {
    return [{
      kind: "skill",
      id: slug(skill[1]),
      name: skill[1],
      total: Number(record.value),
    }];
  }
  return [];
});

const authoredStatProfiles = (entry) => {
  const records = proficiencyRecords(entry);
  const saveProfiles = records.filter((record) => record.kind === "save");
  const skillProfiles = records.filter((record) => record.kind === "skill");
  const proficiencyBonus = Number(entry.proficiency_bonus || 0);
  const expertise = (profile) => {
    const ability = profile.kind === "skill"
      ? ({
        athletics: "str", acrobatics: "dex", "sleight-of-hand": "dex", stealth: "dex",
        arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
        "animal-handling": "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
        deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
      })[profile.id]
      : profile.id;
    const score = entry[({ str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" })[ability]];
    return proficiencyBonus > 0 && profile.total - abilityModifier(score) >= proficiencyBonus * 2;
  };
  return {
    saveProfiles: saveProfiles.map((profile) => ({ ...profile, source: "authored" })),
    skillProfiles: skillProfiles.map((profile) => ({ ...profile, expertise: expertise(profile), source: "authored" })),
    saveProficiencies: saveProfiles.map((profile) => profile.id),
    skillProficiencies: skillProfiles.map((profile) => profile.id),
    saveTotals: Object.fromEntries(saveProfiles.map((profile) => [profile.id, profile.total])),
    skillTotals: Object.fromEntries(skillProfiles.map((profile) => [profile.id, profile.total])),
    skillExpertise: skillProfiles.filter(expertise).map((profile) => profile.id),
  };
};

/**
 * A stat block writes its damage with the ability modifier already folded in
 * ("1d6+2"), unlike the equipment catalog which stores the dice alone. The four
 * shapes the SRD actually uses are N, NdN, NdN+N and NdN-N, so the whole corpus
 * flattens into a dice count, a die size and a flat term.
 */
const parseStatBlockDamage = (definition) => {
  const text = String(definition || "").trim();
  if (!text) return null;
  const dice = /^(\d+)d(\d+)\s*([+-]\s*\d+)?$/i.exec(text);
  if (dice) {
    return {
      count: Number(dice[1]),
      sides: Number(dice[2]),
      flat: dice[3] ? Number(dice[3].replace(/\s+/g, "")) : 0,
    };
  }
  const flat = /^(\d+)$/.exec(text);
  return flat ? { count: 0, sides: 0, flat: Number(flat[1]) } : null;
};

const damageDefinition = ({ count, sides, flat }) => {
  if (!count || !sides) return String(flat);
  return flat === 0 ? `${count}d${sides}` : `${count}d${sides}${flat > 0 ? "+" : "-"}${Math.abs(flat)}`;
};

const damageOptions = (value, path = "0") => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((part, index) => damageOptions(part, `${path}.${index}`));
  if (typeof value.damage_dice === "string") {
    return [{
      damageDice: value.damage_dice,
      damageType: value.damage_type?.name || null,
      note: value.notes || null,
      path,
    }];
  }
  if (value.from?.options) return damageOptions(value.from.options, `${path}.options`);
  if (value.options) return damageOptions(value.options, `${path}.options`);
  return [];
};

const rangeModes = (description) => {
  const text = String(description || "");
  const modes = [];
  const reach = /reach\s+(\d+)\s*ft/i.exec(text);
  const banded = /range\s+(\d+)\s*\/\s*(\d+)\s*ft/i.exec(text);
  const single = /range\s+(\d+)\s*ft/i.exec(text);
  if (reach || /melee\s+or\s+ranged/i.test(text)) modes.push({
    kind: "melee", reachFeet: reach ? Number(reach[1]) : 5, normalFeet: 0, longFeet: 0,
  });
  if (banded || single) modes.push({
    kind: "ranged", reachFeet: 5,
    normalFeet: Number(banded?.[1] || single?.[1]),
    longFeet: Number(banded?.[2] || single?.[1]),
  });
  if (!modes.length) modes.push({ kind: "melee", reachFeet: 5, normalFeet: 0, longFeet: 0 });
  return modes;
};

const attackLines = (entry) => {
  const lines = [];
  for (const action of entry.actions || []) {
    if (!Number.isFinite(action.attack_bonus)) continue;
    const parts = damageOptions(action.damage)
      .map((part) => ({ ...part, parsed: parseStatBlockDamage(part.damageDice) }))
      .filter((part) => part.parsed);
    if (!parts.length) continue;
    const primary = parts[0];
    const modes = rangeModes(action.desc);
    const primaryMode = modes[0];
    lines.push({
      id: `${entry.index}-${action.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: action.name,
      toHit: action.attack_bonus,
      damageDice: damageDefinition(primary.parsed),
      damageType: primary.damageType,
      rangeKind: primaryMode.kind,
      reachFeet: primaryMode.reachFeet,
      normalFeet: primaryMode.normalFeet,
      longFeet: primaryMode.longFeet,
      rangeModes: modes,
      damageVariants: parts.map((part, index) => ({
        id: `${slug(action.name)}-${index + 1}`,
        damageDice: damageDefinition(part.parsed),
        damageType: part.damageType,
        note: part.note,
      })),
      throwable: false,
      // Extra damage riders (a flame tongue's fire, a wight's necrotic drain)
      // are carried so the sheet can show them; only the primary die rolls.
      riders: parts.slice(1).map((part) => ({
        damageDice: damageDefinition(part.parsed),
        damageType: part.damageType,
      })),
      note: action.desc || "",
    });
  }
  return lines;
};

const actionCapabilities = (entry, attacks) => {
  const attackIds = new Set(attacks.map((attack) => attack.id));
  return (entry.actions || []).map((action, index) => {
    const id = `${entry.index}-action-${index + 1}-${slug(action.name) || "unnamed"}`;
    if (/^multiattack$/i.test(action.name)) return {
      id, sourceRecordId: entry.index, sourceActionName: action.name,
      status: "assisted", reason: "Multiattack prose is retained and its parsed attack count is available; substitutions remain GM-directed.",
    };
    const attackId = `${entry.index}-${slug(action.name)}`;
    if (Number.isFinite(action.attack_bonus) && attackIds.has(attackId)) return {
      id, sourceRecordId: entry.index, sourceActionName: action.name,
      status: "implemented", operation: "attack-roll", attackId,
    };
    if (Number.isFinite(action.attack_bonus)) return {
      id, sourceRecordId: entry.index, sourceActionName: action.name,
      status: "reference-only", reason: "The source publishes an attack bonus but its damage structure could not be reduced to a supported variant.",
    };
    if (action.dc || action.damage) return {
      id, sourceRecordId: entry.index, sourceActionName: action.name,
      status: "assisted", reason: "The action has a saving throw or damage profile; the full authored instruction remains visible for GM resolution.",
    };
    return {
      id, sourceRecordId: entry.index, sourceActionName: action.name,
      status: "reference-only", reason: "The action is authored prose without a deterministic Nightforge handler yet.",
    };
  });
};

const prose = (actions) =>
  (actions || []).map((action) => ({ name: action.name, desc: action.desc || "" }));

/**
 * "The goblin makes two scimitar attacks." Free prose, so a clean parse is a
 * best effort; anything unrecognised falls back to one attack and keeps the
 * original sentence visible so it can be corrected by hand.
 */
const attacksPerAction = (entry) => {
  const multiattack = (entry.actions || []).find((action) => /^multiattack$/i.test(action.name));
  if (!multiattack) return { count: 1, note: "" };
  const text = String(multiattack.desc || "");
  const patterns = [
    /makes\s+(\w+)\s+(?:[\w'-]+\s+){0,3}?attacks/i,
    /can\s+make\s+(\w+)\s+attacks/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const count = match ? NUMBER_WORDS[String(match[1]).toLowerCase()] : null;
    if (count) return { count, note: text };
  }
  return { count: 1, note: text };
};

const speedProfile = (speed = {}) => ({
  walk: feet(speed.walk),
  fly: feet(speed.fly),
  swim: feet(speed.swim),
  climb: feet(speed.climb),
  burrow: feet(speed.burrow),
});

const damageList = (values) =>
  (values || []).map((value) => titleCase(String(value).trim())).filter(Boolean);

const monsters = monsterSource
  .map((entry) => {
    const multiattack = attacksPerAction(entry);
    const speed = speedProfile(entry.speed);
    const authored = authoredStatProfiles(entry);
    const attacks = attackLines(entry);
    return {
      id: entry.index,
      sourceRecordId: entry.index,
      name: entry.name,
      kind: "monster",
      edition: EDITION,
      sourceDataset: "5e-SRD-Monsters.json",
      sourceDatasetHash: sourceHash,
      definitionVersion: DEFINITION_VERSION,
      parserVersion: PARSER_VERSION,
      size: SIZES.includes(String(entry.size || "").toLowerCase())
        ? String(entry.size).toLowerCase()
        : "medium",
      creatureType: entry.type || "unknown",
      subtype: entry.subtype || null,
      alignment: entry.alignment || "unaligned",
      ac: Number((entry.armor_class || [])[0]?.value || 10),
      hp: Math.max(1, Number(entry.hit_points || 1)),
      hitDice: entry.hit_dice || null,
      speed,
      baseSpeed: speed.walk || speed.fly || speed.swim || speed.climb || speed.burrow || 0,
      strength: Number(entry.strength || 10),
      dexterity: Number(entry.dexterity || 10),
      constitution: Number(entry.constitution || 10),
      intelligence: Number(entry.intelligence || 10),
      wisdom: Number(entry.wisdom || 10),
      charisma: Number(entry.charisma || 10),
      saveProficiencies: authored.saveProficiencies,
      skillProficiencies: authored.skillProficiencies,
      saveProfiles: authored.saveProfiles,
      skillProfiles: authored.skillProfiles,
      saveTotals: authored.saveTotals,
      skillTotals: authored.skillTotals,
      skillExpertise: authored.skillExpertise,
      challengeRating: Number(entry.challenge_rating || 0),
      xp: Number(entry.xp || 0),
      // Carried for the sheet and for the resistance engine when it exists.
      damageResistances: damageList(entry.damage_resistances),
      damageImmunities: damageList(entry.damage_immunities),
      damageVulnerabilities: damageList(entry.damage_vulnerabilities),
      conditionImmunities: (entry.condition_immunities || []).map((record) => record.index),
      senses: entry.senses || {},
      passivePerception: Number(entry.senses?.passive_perception || 0),
      languages: entry.languages || "",
      attacks,
      attacksPerAction: multiattack.count,
      multiattackNote: multiattack.note,
      actionCapabilities: actionCapabilities(entry, attacks),
      capabilityStatus: attacks.length || (entry.actions || []).length ? "partially-supported" : "reference-only",
      // Save-DC actions, legendary actions and traits are read-only reference
      // text: the engine has no saving-throw or reaction system to run them.
      otherActions: prose((entry.actions || []).filter((action) =>
        !Number.isFinite(action.attack_bonus) && !/^multiattack$/i.test(action.name),
      )),
      traits: prose(entry.special_abilities),
      legendaryActions: prose(entry.legendary_actions),
      reactions: prose(entry.reactions),
      source: "SRD 5.1",
      warnings: [
        ...(authored.skillProfiles.some((profile) => profile.id && !profile.total && profile.total !== 0)
          ? ["One or more authored skill totals were missing or non-numeric."] : []),
        ...(actionCapabilities(entry, attacks).some((capability) => capability.status === "reference-only")
          ? ["One or more authored actions remain reference-only."] : []),
      ],
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

if (monsters.length !== monsterSource.length) {
  throw new Error(`Expected ${monsterSource.length} monsters, produced ${monsters.length}.`);
}

const withAttacks = monsters.filter((monster) => monster.attacks.length).length;
// One record per line: compact enough to stay out of the way in a diff, but
// still line-addressable rather than a single half-megabyte string.
const records = monsters.map((monster) => `  ${JSON.stringify(monster)},`).join("\n");
const output = [
  "// Generated from the local public SRD monster corpus.",
  "// Regenerate with scripts/generate-monsters.mjs; do not edit by hand.",
  `export const MONSTER_GENERATION_META = Object.freeze(${JSON.stringify({
    edition: EDITION,
    sourceDataset: "5e-SRD-Monsters.json",
    sourceDatasetHash: sourceHash,
    definitionVersion: DEFINITION_VERSION,
    parserVersion: PARSER_VERSION,
    sourceCount: monsterSource.length,
    emittedCount: monsters.length,
    generatedCapabilityCounts: Object.fromEntries(["implemented", "assisted", "reference-only"].map((status) => [status, monsters.reduce((total, monster) => total + monster.actionCapabilities.filter((capability) => capability.status === status).length, 0)])),
  }, null, 2)});`,
  `export const MONSTERS = Object.freeze([\n${records}\n]);`,
  "",
].join("\n\n");

await writeFile(outputFile, output, "utf8");
console.log(
  `Generated ${monsters.length} monsters (${withAttacks} with at least one attack line, ` +
  `${monsters.filter((monster) => monster.attacksPerAction > 1).length} with Multiattack).`,
);
