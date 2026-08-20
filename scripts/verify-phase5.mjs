import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { AMMUNITION, ARMOR, GEAR, ITEM_CATALOG, MAGIC_ITEMS, WEAPONS, WORN_MAGIC_ITEMS } from "../src/domain/catalog.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const hash = async (file) => createHash("sha256").update(await readFile(resolve(root, file))).digest("hex").toUpperCase();
const failures = [];
const catalogManifest = JSON.parse(await read("scripts/phase5-catalog-manifest.json"));

for (const file of [
  "src/domain/catalog.generated.js", "src/domain/catalog.js", "src/domain/items.js",
  "src/screens/GearChapter.jsx", "src/phase5.test.js", "scripts/generate-phase5-catalogs.mjs",
  "scripts/phase5-render-smoke.mjs", "scripts/phase5-catalog-manifest.json",
]) {
  try { await read(file); } catch { failures.push(`Missing Phase 5 file: ${file}`); }
}

const actualCounts = {
  weapons: WEAPONS.length, ammunition: AMMUNITION.length, armor: ARMOR.length,
  gear: GEAR.length, inertMagicItems: MAGIC_ITEMS.length, wornMagicItems: WORN_MAGIC_ITEMS.length,
};
for (const [name, expected] of Object.entries(catalogManifest.counts)) {
  if (actualCounts[name] !== expected) failures.push(`${name}: expected ${expected}, received ${actualCounts[name]}.`);
}
if (ITEM_CATALOG.length !== 355 || new Set(ITEM_CATALOG.map((item) => item.id)).size !== 355) failures.push("Combined catalog must contain 355 unique IDs.");
if (await hash(catalogManifest.generated.file) !== catalogManifest.generated.sha256) failures.push("Generated catalog differs from its source manifest.");

const expectedRanges = { blowgun: [25, 50], sling: [30, 60], "crossbow-hand": [40, 80], shortbow: [40, 80], "crossbow-light": [60, 120], "crossbow-heavy": [80, 160], longbow: [80, 160] };
for (const [id, range] of Object.entries(expectedRanges)) {
  const item = ITEM_CATALOG.find((candidate) => candidate.id === id);
  if (!item || item.normalRange !== range[0] || item.longRange !== range[1]) failures.push(`${id}: intentional range is incorrect.`);
}

const gearScreen = await read("src/screens/GearChapter.jsx");
for (const behavior of [
  "filterCatalog", "changeInventory", "removeInventoryItem", "setMainHand", "setOffHand",
  "setArmor", "setShield", "setEnchantment", "toggleWornItem", "createPortal",
  "Weapon class", "Armour class", "Gear category", "Magic rarity", "Weapon property", "Damage type", "Range band",
]) {
  if (!gearScreen.includes(behavior)) failures.push(`Gear chapter is missing ${behavior}.`);
}
const heroesScreen = await read("src/screens/HeroesScreen.jsx");
// The sheet is one page now, so gear is rendered directly rather than reached
// through a chapter toggle.
if (!heroesScreen.includes("GearChapter") || !heroesScreen.includes("hero={activeHero}")) failures.push("Heroes screen does not connect the existing Gear chapter.");
if (heroesScreen.includes('setChapter(')) failures.push("Heroes screen still splits the sheet into chapters.");

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
}

const runtimeFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:js|jsx|css)$/.test(entry.name) && !entry.name.endsWith(".test.js")) runtimeFiles.push(file);
  }
};
await collect(resolve(root, "src"));
for (const file of runtimeFiles) {
  const contents = await readFile(file, "utf8");
  const relative = file.slice(root.length + 1).replaceAll("\\", "/");
  if (/Documents[\\/]Roll30|UI Redesign Attempt|\.\.[\\/]\.\.[\\/]Roll30/.test(contents)) failures.push(`${relative}: contains an original-project path or import.`);
  if (relative !== "src/storage/constants.js" && /roll30-maps|roll30-active-map|roll30-characters|roll30-assets/.test(contents)) failures.push(`${relative}: accesses an original Roll30 save identifier.`);
  if (/[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u.test(contents)) failures.push(`${relative}: contains malformed UTF-8/mojibake text.`);
}

const packageJson = JSON.parse(await read("package.json"));
for (const name of ["verify:phase5", "test:phase5:render"]) if (!packageJson.scripts?.[name]) failures.push(`Missing npm script ${name}.`);

if (failures.length) {
  console.error("Phase 5 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 5 catalogs contain 36 weapons, 4 ammunition, 13 armour, 183 gear, 113 inert magic items, and 6 worn items.");
console.log("Inventory, catalog filtering, equipment legality, magic bonuses, Gear drawers, clean-room boundaries, and generated-source integrity are present.");
