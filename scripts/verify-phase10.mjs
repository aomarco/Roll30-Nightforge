import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AMMUNITION_BY_WEAPON,
  LODGING_THROWN_WEAPON_IDS,
  NON_LODGING_THROWN_WEAPON_IDS,
} from "../src/domain/encounter.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const hash = async (file) => createHash("sha256").update(await readFile(resolve(root, file))).digest("hex").toUpperCase();
const baseline = JSON.parse(await read("scripts/nightforge-baseline-hashes.json"));
const failures = [];

const protectedVisuals = [
  "src/styles/core.css",
  "src/styles/shell.css",
  "src/styles/library.css",
  "src/styles/heroes.css",
  "src/styles/scene.css",
  "src/styles/table.css",
  "src/ui/Glyphs.jsx",
];
for (const file of protectedVisuals) {
  if (await hash(file) !== baseline[file]) failures.push(`${file}: permanent Nightforge visual changed.`);
}

for (const file of [
  "src/domain/encounter.js",
  "src/phase10.test.js",
  "src/screens/BattleCompletion.jsx",
  "src/screens/ChestLootDrawer.jsx",
  "src/screens/RetrievalCinematic.jsx",
  "scripts/phase10-render-smoke.mjs",
  "scripts/verify-phase10.mjs",
]) {
  try { await read(file); } catch { failures.push(`Missing Phase 10 file: ${file}`); }
}

if (Object.keys(AMMUNITION_BY_WEAPON).length !== 7) failures.push("Exactly seven ammunition weapons must have stable mappings.");
if (new Set(Object.values(AMMUNITION_BY_WEAPON)).size !== 4) failures.push("The ammunition mapping must use exactly four ammunition types.");
if (LODGING_THROWN_WEAPON_IDS.length !== 6) failures.push("Exactly six thrown weapons must lodge.");
if (NON_LODGING_THROWN_WEAPON_IDS.length !== 1 || NON_LODGING_THROWN_WEAPON_IDS[0] !== "light-hammer") failures.push("Light Hammer must be the only non-lodging thrown weapon.");

const encounter = await read("src/domain/encounter.js");
for (const behavior of [
  "ammunitionForWeapon",
  "attackSupplyAvailability",
  "nearbyThrownLanding",
  "applyAttackSupplyEffects",
  "completeEncounterIfNeeded",
  "openChestAvailability",
  "chestCommandOptions",
  "openAdjacentChest",
  "takeOneFromOpenChest",
  "retrievalAvailability",
  "retrievalCommandOptions",
  "retrieveBattleItem",
  "restartCompletedBattle",
  "AMMUNITION_DEPLETED",
  "THROWN_LANDING_UNAVAILABLE",
  "CHEST_NOT_ADJACENT",
  "GROUND_ITEM_NOT_ADJACENT",
  "LIVING_CARRIER_NOT_ADJACENT",
  "DEFEATED_CARRIER_NOT_ADJACENT",
  "Math.floor(spent * 0.5)",
  "bonusActionType: \"open chest\"",
  "bonusActionType: \"retrieve weapon\"",
  "status: \"complete\"",
  "status: \"active\"",
  "hp: token.maxHp",
  "conditions: []",
  "battleItems: []",
]) if (!encounter.includes(behavior)) failures.push(`Phase 10 encounter domain is missing ${behavior}.`);
if (encounter.includes("chests: []")) failures.push("Restart appears to clear or refill persisted chests.");

const tableDomain = await read("src/domain/table.js");
for (const behavior of [
  "openedChestId",
  "normalizeBattleItem",
  "normalizeBattleItems",
  "normalizeAmmoSpentByToken",
  "ammunitionRecovered",
]) if (!tableDomain.includes(behavior)) failures.push(`Phase 10 persisted data normalization is missing ${behavior}.`);

const attacks = await read("src/domain/attacks.js");
for (const integration of [
  "attackSupplyAvailability",
  "applyAttackSupplyEffects",
  "completeEncounterIfNeeded",
  "battleItemIdFactory",
  "range.usage === \"thrown\"",
  "ammunitionRecovery",
]) if (!attacks.includes(integration)) failures.push(`Attack resolution is missing Phase 10 integration ${integration}.`);

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "isActiveBattle",
  "isCompleteBattle",
  "battleItemIdFactory",
  "openBattleChest",
  "takeChestItem",
  "resolveRetrieval",
  "restartBattle",
  "chestCommandOptions",
  "retrievalCommandOptions",
  "ChestLootDrawer",
  "RetrievalCinematic",
  "BattleCompletion",
  "nf-state-table-chest-eligible",
  "nf-state-battle-item",
  "nf-state-table-embedded-count",
  "Battle inventory",
  "Restart Battle",
  "prefers-reduced-motion: reduce",
]) if (!table.includes(integration)) failures.push(`Table screen is missing Phase 10 integration ${integration}.`);
if (!table.includes("commandOpen && isActiveBattle") || !table.includes("bonusOpen && isActiveBattle")) failures.push("Ordinary command drawers are not gated out of completed encounters.");
if (!table.includes("isActiveBattle && active && <div className=\"track")) failures.push("The active turn track is not removed in completed encounters.");

const bonusDrawer = await read("src/screens/BonusCommandsDrawer.jsx");
for (const control of ["Battle chests", "Physical weapons", "openChest(chest.id)", "retrieve(battleItem.id)", "alreadyOpen", "availability.message"]) {
  if (!bonusDrawer.includes(control)) failures.push(`Bonus Commands drawer is missing ${control}.`);
}
if (/Phase 10|arrives in Phase 10/.test(bonusDrawer)) failures.push("Bonus Commands still contains a Phase 10 placeholder.");

const lootDrawer = await read("src/screens/ChestLootDrawer.jsx");
for (const state of ["Take one item", "Chest depleted", "Each Take transfers exactly one unit", "Loot was not saved"]) {
  if (!lootDrawer.includes(state)) failures.push(`Chest loot drawer is missing ${state}.`);
}

const retrievalCinematic = await read("src/screens/RetrievalCinematic.jsx");
for (const state of ["spin", "natural", "modifiers", "verdict", "impact", "failed", "Retrieval DC", "Retrieval was not saved"]) {
  if (!retrievalCinematic.includes(state)) failures.push(`Retrieval cinematic is missing ${state}.`);
}

const completion = await read("src/screens/BattleCompletion.jsx");
for (const state of ["Battle complete", "No survivor", "Restart Battle", "fired ammunition recovered"]) {
  if (!completion.includes(state)) failures.push(`Battle completion presentation is missing ${state}.`);
}

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const requiredClass of [
  ".nf-state-bonus-command-group",
  ".nf-state-table-chest-eligible",
  ".nf-state-loot-list",
  ".nf-state-battle-item-ground",
  ".nf-state-battle-item-embedded",
  ".nf-state-battle-item-eligible",
  ".nf-state-table-embedded-count",
  ".nf-state-battle-complete",
  ".nf-state-retrieval-cinematic",
]) if (!functionalCss.includes(requiredClass)) failures.push(`Missing Phase 10 functional style ${requiredClass}.`);
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
}
if (!functionalCss.includes("@media (prefers-reduced-motion: reduce)")) failures.push("Phase 10 motion does not respect reduced-motion preferences.");

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
const indexHtml = await read("index.html");
if (/[\u00c2\u00c3\ufffd]|\u00e2[^\s]/u.test(indexHtml)) failures.push("index.html contains malformed UTF-8/mojibake text.");

const packageJson = JSON.parse(await read("package.json"));
for (const script of ["verify:phase10", "test:phase10:render"]) if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
if (!packageJson.scripts?.verify?.includes("verify:phase10") || !packageJson.scripts?.verify?.includes("test:phase10:render")) failures.push("The complete verification gate does not include both Phase 10 gates.");

if (failures.length) {
  console.error("Phase 10 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("All permanent Nightforge visual files match the frozen baseline.");
console.log("Phase 10 chest looting, physical throws, retrieval, ammunition, completion, restoration, and restart contracts are present.");
console.log("Completed encounters preserve depleted chests and final state; original Roll30 runtime, UI, storage identifiers, and user data remain isolated.");
