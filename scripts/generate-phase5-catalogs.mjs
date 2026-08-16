import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceDirectory = process.argv[2];
const outputFile = process.argv[3] || path.resolve("src/domain/catalog.generated.js");

if (!sourceDirectory) {
  throw new Error("Usage: node scripts/generate-phase5-catalogs.mjs <SRD directory> [output file]");
}

const readJson = async (name) =>
  JSON.parse(await readFile(path.join(sourceDirectory, name), "utf8"));

const [equipmentSource, magicSource, classificationText] = await Promise.all([
  readJson("5e-SRD-Equipment.json"),
  readJson("5e-SRD-Magic-Items.json"),
  readFile(path.join(sourceDirectory, "MAGIC_ITEM_FILE_SYSTEM.txt"), "utf8"),
]);

const copperPerUnit = Object.freeze({ cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 });
const cost = (entry) => ({
  quantity: Number(entry?.quantity || 0),
  unit: entry?.unit || "cp",
});
const costCopper = (entry) =>
  Number(entry?.quantity || 0) * (copperPerUnit[entry?.unit] || 0);
const titleCase = (value) =>
  String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());

const rangedOverrides = Object.freeze({
  blowgun: [25, 50],
  sling: [30, 60],
  "crossbow-hand": [40, 80],
  shortbow: [40, 80],
  "crossbow-light": [60, 120],
  "crossbow-heavy": [80, 160],
  longbow: [80, 160],
});

const displayWeaponName = (entry) => {
  const crossbow = /^Crossbow, (light|hand|heavy)$/i.exec(entry.name);
  return crossbow ? `${titleCase(crossbow[1])} Crossbow` : entry.name;
};

const weapons = equipmentSource
  .filter((entry) => entry.equipment_category?.name === "Weapon" && entry.index !== "net")
  .map((entry) => {
    const range = rangedOverrides[entry.index] || [entry.range?.normal || 5, entry.range?.long || null];
    return {
      id: entry.index,
      name: displayWeaponName(entry),
      sourceName: entry.name,
      kind: "weapon",
      typeLabel: "Weapon",
      weaponClass: String(entry.weapon_category || "").toLowerCase(),
      weaponRange: String(entry.weapon_range || "").toLowerCase(),
      categoryRange: entry.category_range,
      cost: cost(entry.cost),
      costCopper: costCopper(entry.cost),
      weight: Number(entry.weight || 0),
      damageDice: entry.damage?.damage_dice || null,
      damageType: entry.damage?.damage_type?.name || null,
      normalRange: range[0],
      longRange: range[1],
      throwRange: entry.throw_range
        ? { normal: entry.throw_range.normal, long: entry.throw_range.long || null }
        : null,
      properties: (entry.properties || []).map((property) => property.name),
      propertyIds: (entry.properties || []).map((property) => property.index),
      versatileDamageDice: entry.two_handed_damage?.damage_dice || null,
      source: "SRD 5.1",
    };
  });

const ammunition = equipmentSource
  .filter((entry) => entry.gear_category?.name === "Ammunition")
  .map((entry) => ({
    id: entry.index,
    name: entry.name,
    kind: "ammunition",
    typeLabel: "Ammunition",
    gearCategory: "Ammunition",
    bundleSize: Number(entry.quantity || 1),
    cost: cost(entry.cost),
    costCopper: costCopper(entry.cost),
    weight: Number(entry.weight || 0),
    source: "SRD 5.1",
  }));

const armor = equipmentSource
  .filter((entry) => entry.equipment_category?.name === "Armor")
  .map((entry) => ({
    id: entry.index,
    name: entry.name,
    kind: "armor",
    typeLabel: entry.armor_category === "Shield" ? "Shield" : "Armour",
    armorClass: String(entry.armor_category || "").toLowerCase(),
    category: String(entry.armor_category || "").toLowerCase(),
    baseAc: Number(entry.armor_class?.base || 0),
    dexBonus: Boolean(entry.armor_class?.dex_bonus),
    maxDexBonus: entry.armor_class?.max_bonus ?? null,
    strengthMinimum: Number(entry.str_minimum || 0),
    stealthDisadvantage: Boolean(entry.stealth_disadvantage),
    cost: cost(entry.cost),
    costCopper: costCopper(entry.cost),
    weight: Number(entry.weight || 0),
    source: "SRD 5.1",
  }));

const gearCategory = (entry) =>
  entry.gear_category?.name ||
  entry.tool_category ||
  entry.vehicle_category ||
  entry.equipment_category?.name ||
  "Gear";

const gear = equipmentSource
  .filter((entry) =>
    !["Weapon", "Armor"].includes(entry.equipment_category?.name) &&
    entry.gear_category?.name !== "Ammunition",
  )
  .map((entry) => ({
    id: entry.index,
    name: entry.name,
    kind: "gear",
    typeLabel: "Gear",
    gearCategory: gearCategory(entry),
    cost: cost(entry.cost),
    costCopper: costCopper(entry.cost),
    weight: Number(entry.weight || 0),
    source: "SRD 5.1",
  }));

const lines = classificationText.replace(/\r\n/g, "\n").split("\n");
const nonBattleStart = lines.indexOf("NON BATTLE");
if (nonBattleStart < 0) throw new Error("NON BATTLE classification section was not found.");
const nonBattleNames = new Set(
  lines
    .slice(nonBattleStart + 1)
    .map((line) => /^ {3}(\S.*)$/.exec(line)?.[1])
    .filter(Boolean),
);
const magicByName = new Map(magicSource.map((entry) => [entry.name, entry]));
const missingMagic = [...nonBattleNames].filter((name) => !magicByName.has(name));
if (missingMagic.length) {
  throw new Error(`Missing SRD magic records: ${missingMagic.join(", ")}`);
}

const magicShape = (entry, implementedEffect = null) => ({
  id: entry.index,
  name: entry.name,
  kind: "magic-item",
  typeLabel: "Magic item",
  itemCategory: entry.equipment_category?.name || "Magic Item",
  rarity: entry.rarity?.name || "Unknown",
  implementedEffect,
  source: "SRD 5.1",
});

const magicItems = [...nonBattleNames]
  .map((name) => magicShape(magicByName.get(name)))
  .sort((left, right) => left.name.localeCompare(right.name));

const wornEffects = Object.freeze({
  "bracers-of-archery": "ranged-damage-2",
  "bracers-of-defense": "unarmored-ac-2",
  "cloak-of-protection": "ac-and-saves-1",
  "ring-of-protection": "ac-and-saves-1",
  "ioun-stone-of-mastery": "attack-1",
  "ioun-stone-of-protection": "ac-1",
});
const wornMagicItems = Object.entries(wornEffects).map(([id, effect]) => {
  const entry = magicSource.find((candidate) => candidate.index === id);
  if (!entry) throw new Error(`Missing implemented worn magic record: ${id}`);
  return magicShape(entry, effect);
});

const expectedCounts = { weapons: 36, ammunition: 4, armor: 13, gear: 183, magicItems: 113, wornMagicItems: 6 };
for (const [name, expected] of Object.entries(expectedCounts)) {
  const actual = ({ weapons, ammunition, armor, gear, magicItems, wornMagicItems })[name].length;
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, received ${actual}`);
}

const serialize = (name, value) =>
  `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)});`;
const output = [
  "// Generated from the local public SRD corpus and its classification index.",
  "// Regenerate with scripts/generate-phase5-catalogs.mjs; do not edit by hand.",
  serialize("WEAPONS", weapons),
  serialize("AMMUNITION", ammunition),
  serialize("ARMOR", armor),
  serialize("GEAR", gear),
  serialize("MAGIC_ITEMS", magicItems),
  serialize("WORN_MAGIC_ITEMS", wornMagicItems),
  "",
].join("\n\n");

await writeFile(outputFile, output, "utf8");
console.log(`Generated ${weapons.length} weapons, ${ammunition.length} ammunition, ${armor.length} armor, ${gear.length} gear, ${magicItems.length} inert magic items, and ${wornMagicItems.length} worn magic items.`);
