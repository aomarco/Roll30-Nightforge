import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceDirectory = process.argv[2];
const outputFile = process.argv[3] || path.resolve("src/domain/monsters.generated.js");

if (!sourceDirectory) {
  throw new Error("Usage: node scripts/generate-monsters.mjs <SRD directory> [output file]");
}

const monsterSource = JSON.parse(
  await readFile(path.join(sourceDirectory, "5e-SRD-Monsters.json"), "utf8"),
);

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

/**
 * Range lives only in the prose ("reach 10 ft." / "range 80/320 ft."), never in
 * a structured field, so it is read once here rather than at roll time.
 */
const parseAttackRange = (description) => {
  const text = String(description || "");
  const banded = /range\s+(\d+)\s*\/\s*(\d+)\s*ft/i.exec(text);
  if (banded) {
    return { kind: "ranged", reachFeet: 5, normalFeet: Number(banded[1]), longFeet: Number(banded[2]) };
  }
  const single = /range\s+(\d+)\s*ft/i.exec(text);
  if (single) {
    return { kind: "ranged", reachFeet: 5, normalFeet: Number(single[1]), longFeet: Number(single[1]) };
  }
  const reach = /reach\s+(\d+)\s*ft/i.exec(text);
  return { kind: "melee", reachFeet: reach ? Number(reach[1]) : 5, normalFeet: 0, longFeet: 0 };
};

const attackLines = (entry) => {
  const lines = [];
  for (const action of entry.actions || []) {
    if (!Number.isFinite(action.attack_bonus)) continue;
    const parts = (action.damage || [])
      .map((part) => ({ parsed: parseStatBlockDamage(part.damage_dice), type: part.damage_type?.name || null }))
      .filter((part) => part.parsed);
    if (!parts.length) continue;
    const primary = parts[0];
    const range = parseAttackRange(action.desc);
    lines.push({
      id: `${entry.index}-${action.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: action.name,
      toHit: action.attack_bonus,
      damageDice: damageDefinition(primary.parsed),
      damageType: primary.type,
      rangeKind: range.kind,
      reachFeet: range.reachFeet,
      normalFeet: range.normalFeet,
      longFeet: range.longFeet,
      throwable: false,
      // Extra damage riders (a flame tongue's fire, a wight's necrotic drain)
      // are carried so the sheet can show them; only the primary die rolls.
      riders: parts.slice(1).map((part) => ({
        damageDice: damageDefinition(part.parsed),
        damageType: part.type,
      })),
      note: action.desc || "",
    });
  }
  return lines;
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

const saveProficiencies = (entry) => {
  const abilities = { STR: "str", DEX: "dex", CON: "con", INT: "int", WIS: "wis", CHA: "cha" };
  const result = [];
  for (const record of entry.proficiencies || []) {
    const match = /^Saving Throw:\s*([A-Z]{3})$/i.exec(record.proficiency?.name || "");
    const ability = match ? abilities[match[1].toUpperCase()] : null;
    if (ability && !result.includes(ability)) result.push(ability);
  }
  return result;
};

const damageList = (values) =>
  (values || []).map((value) => titleCase(String(value).trim())).filter(Boolean);

const monsters = monsterSource
  .map((entry) => {
    const multiattack = attacksPerAction(entry);
    const speed = speedProfile(entry.speed);
    return {
      id: entry.index,
      name: entry.name,
      kind: "monster",
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
      saveProficiencies: saveProficiencies(entry),
      challengeRating: Number(entry.challenge_rating || 0),
      xp: Number(entry.xp || 0),
      // Carried for the sheet and for the resistance engine when it exists.
      damageResistances: damageList(entry.damage_resistances),
      damageImmunities: damageList(entry.damage_immunities),
      damageVulnerabilities: damageList(entry.damage_vulnerabilities),
      conditionImmunities: (entry.condition_immunities || []).map((record) => record.index),
      senses: entry.senses || {},
      languages: entry.languages || "",
      attacks: attackLines(entry),
      attacksPerAction: multiattack.count,
      multiattackNote: multiattack.note,
      // Save-DC actions, legendary actions and traits are read-only reference
      // text: the engine has no saving-throw or reaction system to run them.
      otherActions: prose((entry.actions || []).filter((action) =>
        !Number.isFinite(action.attack_bonus) && !/^multiattack$/i.test(action.name),
      )),
      traits: prose(entry.special_abilities),
      legendaryActions: prose(entry.legendary_actions),
      reactions: prose(entry.reactions),
      source: "SRD 5.1",
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
  `export const MONSTERS = Object.freeze([\n${records}\n]);`,
  "",
].join("\n\n");

await writeFile(outputFile, output, "utf8");
console.log(
  `Generated ${monsters.length} monsters (${withAttacks} with at least one attack line, ` +
  `${monsters.filter((monster) => monster.attacksPerAction > 1).length} with Multiattack).`,
);
