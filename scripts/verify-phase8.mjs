import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { MOVEMENT_FEET_PER_CELL, PATH_SEARCH_LIMIT } from "../src/domain/combat.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

for (const file of [
  "src/domain/combat.js",
  "src/phase8.test.js",
  "src/screens/CommandBar.jsx",
  "scripts/phase8-render-smoke.mjs",
  "scripts/verify-phase8.mjs",
]) {
  try { await read(file); } catch { failures.push(`Missing Phase 8 file: ${file}`); }
}

if (MOVEMENT_FEET_PER_CELL !== 5) failures.push("Movement must cost exactly 5 feet per traversed cell.");
if (PATH_SEARCH_LIMIT !== 4000) failures.push("Movement pathfinding must retain the 4,000-cell safety cap.");

const tableDomain = await read("src/domain/table.js");
for (const behavior of [
  "normalizeTurnResources",
  "movementBase",
  "movementSpent",
  "actionSpent",
  "bonusActionSpent",
  "dashed",
  "swapped",
  "swapChoice",
]) if (!tableDomain.includes(behavior)) failures.push(`Turn-resource normalization is missing ${behavior}.`);

const combat = await read("src/domain/combat.js");
for (const behavior of [
  "activeTurnContext",
  "movementMaximum",
  "movementRemaining",
  "movementEdgeBlocked",
  "findMovementRoute",
  "planActiveMovement",
  "moveActiveToken",
  "dashAvailability",
  "activateDash",
  "attackActionAvailability",
  "swapAvailability",
  "validateSwapLoadout",
  "performWeaponSwap",
  "endTurn",
  "TOKEN_IMMOBILIZED",
  "SWAP_ATTACK_LOCKS_MOVEMENT",
  "PATH_SEARCH_LIMIT",
  "PATH_UNREACHABLE",
  "NO_LIVING_TOKEN",
]) if (!combat.includes(behavior)) failures.push(`Phase 8 combat domain is missing ${behavior}.`);
if (combat.includes("wallsVisible")) failures.push("Movement incorrectly ignores hidden persisted walls.");
if (!combat.includes("wall.type") || !combat.includes("normalizeWalls")) failures.push("Movement does not preserve both full- and half-wall geometry.");
if (!combat.includes("movementSpent: context.resources.movementSpent + plan.value.costFeet")) failures.push("Movement does not charge the complete accepted route.");
if (!combat.includes("resources.movementBase + token.baseSpeed")) failures.push("Dash does not add one complete Speed value.");
if (!combat.includes("resources: { [nextToken.id]: createTurnResources(nextToken) }")) failures.push("End Turn does not discard old resources and create a fresh next turn.");

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "MovementRouteLayer",
  "planActiveMovement",
  "moveActiveToken",
  "activateDash",
  "performWeaponSwap",
  "endTurn",
  "movementPreview",
  "nf-state-table-movement-reachable",
  "nf-state-table-movement-over",
  "nf-state-table-movement-start",
  "nf-state-table-arriving",
  "CommandBar",
  "returnTo: { page: \"board\", mode }",
]) if (!table.includes(integration)) failures.push(`Table screen is missing Phase 8 integration ${integration}.`);
if (!table.includes("token.id === active?.id")) failures.push("The Table does not restrict Battle dragging to the active token.");
if (!table.includes("kind: isActiveBattle ? \"movement\" : \"token\"")) failures.push("Active-Battle pointer input is not isolated from Setup, Play, and completed encounters.");
if (!table.includes("initialCommandPanel")) failures.push("The Table does not drive the single combat command bar.");
if (!table.includes("bonusState={bonusState}")) failures.push("The command bar does not receive Bonus availability.");

const drawer = await read("src/screens/CommandBar.jsx");
for (const control of [
  "Movement",
  "Action",
  "Choose attack weapon",
  "Dash",
  "Swap weapon",
  "Swap draft",
  "Confirm weapon swap",
  "End Turn",
  "validateSwapLoadout",
]) if (!drawer.includes(control)) failures.push(`Combat Commands drawer is missing ${control}.`);
if (!/onClick=\{end\} disabled=\{busy\}/.test(drawer)) failures.push("End Turn is not independently reachable after Action is spent.");
if (!drawer.includes("togglePanel(\"attack\")")) failures.push("The Attack command is not connected through the command bar.");

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const requiredClass of [
  ".nf-state-table-movement-route",
  ".nf-state-table-movement-reachable",
  ".nf-state-table-movement-over",
  ".nf-state-table-movement-start",
  ".nf-state-table-arriving",
  ".nf-state-command-pip",
  ".nf-state-command-bar",
  ".nf-state-command-meter",
  ".nf-state-command-swap",
]) if (!functionalCss.includes(requiredClass)) failures.push(`Missing Phase 8 functional style ${requiredClass}.`);
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
}

const app = await read("src/App.jsx");
for (const integration of ["onUpdate={updateScene}", "runtime.commands.updateScene", "persistence={state.persistence}"]) {
  if (!app.includes(integration)) failures.push(`App is missing persisted Phase 8 integration ${integration}.`);
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
for (const script of ["verify:phase8", "test:phase8:render"]) if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
if (!packageJson.scripts?.verify?.includes("verify:phase8") || !packageJson.scripts?.verify?.includes("test:phase8:render")) failures.push("The complete verification gate does not include both Phase 8 gates.");

if (failures.length) {
  console.error("Phase 8 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 8 initiative, turn resources, wall-aware movement, Dash, Swap, End Turn, persistence, and route-state UI are present.");
console.log("Nightforge UI composition remains protected; original Roll30 runtime, storage identifiers, and user data remain isolated.");
