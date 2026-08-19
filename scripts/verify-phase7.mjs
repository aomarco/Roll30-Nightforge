import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

for (const file of ["src/screens/BattleSetupInspector.jsx", "src/phase7.test.js", "scripts/phase7-render-smoke.mjs", "scripts/verify-phase7.mjs"]) {
  try { await read(file); } catch { failures.push(`Missing Phase 7 file: ${file}`); }
}

const domain = await read("src/domain/table.js");
for (const behavior of [
  "createManualToken", "createHeroTokenSnapshot", "derivedTokenArmorClass", "applySetupTokenEquipment",
  "normalizeChest", "changeChestInventory", "setupCellForPosition", "setupPositionForCell", "snapSetupPosition",
  "occupiedSetupCells", "canOccupySetupPosition", "findOpenSetupPosition", "prepareBattleStart",
  "BATTLE_NEEDS_TOKENS", "initiativeOrder", "createTurnResources", "conditions: []", "battleItems: []",
]) if (!domain.includes(behavior)) failures.push(`Phase 7 Table domain is missing ${behavior}.`);

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "heroes = []", "summonChoice", "addSetupToken", "placeSetupChest", "onChestPointerDown",
  "setupCollisionFailure", "BattleSetupInspector", "beginBattle", "abandonBattle", "setAbandonOpen(true)",
  "Token and chest creation are locked", "returnTo: { page: \"board\", mode }",
]) if (!table.includes(integration)) failures.push(`Table screen is missing ${integration}.`);
for (const fixture of ["BATTLE_PROTOTYPE_TOKENS", "Thorin", "Elara", "Goblin"]) {
  if (table.includes(fixture)) failures.push(`Deferred prototype fixture remains in the real Phase 7 Table: ${fixture}.`);
}
if (!table.includes("const isBattle = !isPlay && Boolean(scene?.encounter)")) failures.push("Battle mode is not derived from persisted encounter state.");

const inspector = await read("src/screens/BattleSetupInspector.jsx");
for (const control of [
  "Editable token", "Save token details", "Hero snapshot", "Read only", "GearChapter",
  "Fill chest", "ITEM_CATALOG", "changeItem", "Remove chest", "Creature size", "Initiative bonus",
]) if (!inspector.includes(control)) failures.push(`Battle Setup inspector is missing ${control}.`);
if (!(await read("src/screens/GearChapter.jsx")).includes("Only owned equipment is listed")) failures.push("Per-battle Gear does not retain the owned-equipment legality control.");

const app = await read("src/App.jsx");
if (!app.includes("heroes={state.heroes}")) failures.push("App does not supply the real Hero roster to Battle Setup.");

const records = await read("src/domain/records.js");
for (const normalizer of ["normalizeChests", "normalizeEncounter", "normalizeTableTokens"]) {
  if (!records.includes(normalizer)) failures.push(`Scene records are missing ${normalizer}.`);
}

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
for (const script of ["verify:phase7", "test:phase7:render"]) if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);

if (failures.length) {
  console.error("Phase 7 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 7 manual tokens, Hero snapshots, read-only derived values, per-battle Gear, chests, snapping, collisions, and encounter transition are present.");
console.log("Battle mode derives from persisted encounter state; original Roll30 UI, runtime, storage identifiers, and user data remain isolated.");
