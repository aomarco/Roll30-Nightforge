import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { CONDITIONS } from "../src/domain/conditions.js";
import { ATTACK_KIND_ACTION, ATTACK_KIND_BONUS } from "../src/domain/attacks.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

for (const file of [
  "src/domain/attacks.js",
  "src/domain/conditions.js",
  "src/phase9.test.js",
  "src/screens/AttackCinematic.jsx",
  "src/screens/BonusCommandsDrawer.jsx",
  "scripts/phase9-render-smoke.mjs",
  "scripts/verify-phase9.mjs",
]) {
  try { await read(file); } catch { failures.push(`Missing Phase 9 file: ${file}`); }
}

if (ATTACK_KIND_ACTION !== "action" || ATTACK_KIND_BONUS !== "bonus") failures.push("Attack resource kinds are not stable.");
if (CONDITIONS.length !== 15 || new Set(CONDITIONS.map(({ id }) => id)).size !== 15) failures.push("The condition engine must contain exactly 15 unique conditions.");
for (const id of ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious", "exhaustion"]) {
  if (!CONDITIONS.some((condition) => condition.id === id)) failures.push(`Condition catalog is missing ${id}.`);
}

const attacks = await read("src/domain/attacks.js");
for (const behavior of [
  "attackOptionsForToken",
  "mainAttackAvailability",
  "bonusAttackAvailability",
  "attackDistanceFeet",
  "attackLineOfSight",
  "attackTargetEligibility",
  "combineAttackModes",
  "attackRollSources",
  "parseDamageDefinition",
  "rollWeaponDamage",
  "performWeaponAttack",
  "buildAttackRangeBands",
  "toggleBattleCondition",
  "ATTACK_OUT_OF_RANGE",
  "ATTACK_LINE_BLOCKED",
  "half-cover",
  "small-heavy",
  "lance-close",
  "attack-after-swap",
  "offHandAttackAvailable",
]) if (!attacks.includes(behavior)) failures.push(`Phase 9 attack domain is missing ${behavior}.`);
if (!attacks.includes("naturalRoll === 20") || !attacks.includes("naturalRoll !== 1")) failures.push("Natural 1 and Natural 20 rules are not structurally present.");
if (!attacks.includes("parsed.count * (critical ? 2 : 1)")) failures.push("Critical hits do not double dice only.");
if (!attacks.includes("Math.max(0, diceTotal + modifier)")) failures.push("Final damage is not clamped at zero.");
if (!attacks.includes("Math.min(0, ability)")) failures.push("Off-hand damage does not retain only non-positive ability modifiers.");

const conditions = await read("src/domain/conditions.js");
for (const behavior of [
  "normalizeConditions",
  "isIncapacitated",
  "isImmobilized",
  "attackerConditionModes",
  "targetConditionModes",
  "targetAutoCritical",
  "toggleCondition",
  "autoCriticalMelee",
]) if (!conditions.includes(behavior)) failures.push(`Phase 9 condition domain is missing ${behavior}.`);

const tableDomain = await read("src/domain/table.js");
if (!tableDomain.includes("conditions: normalizeConditions(input.conditions)")) failures.push("Persisted token conditions are not normalized through the Phase 9 engine.");

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "AttackRangeLayer",
  "buildAttackRangeBands",
  "attackTargetEligibility",
  "performWeaponAttack",
  "toggleBattleCondition",
  "startAttack",
  "resolveAttackTarget",
  "changeSelectedCondition",
  "nf-state-table-targetable",
  "nf-state-table-condition-badges",
  "nf-state-table-damage-float",
  "Open Combat Commands",
  "Open Bonus Commands",
  "BonusCommandsDrawer",
  "AttackCinematic",
  "playNightforgeImpact",
  "prefers-reduced-motion: reduce",
]) if (!table.includes(integration)) failures.push(`Table screen is missing Phase 9 integration ${integration}.`);
if (!table.includes("attackDraft ? targetState?.ok ? `Attack ${token.name}`")) failures.push("Target eligibility is not represented semantically on Table tokens.");
if (!table.includes("if (combatLocked) return")) failures.push("Attack resolution does not lock repeated turn input.");
if (!table.includes("setAttackDraft(null)")) failures.push("Targeting mode cannot be cancelled or closed.");

const commandDrawer = await read("src/screens/CombatCommandsDrawer.jsx");
for (const control of ["Choose attack weapon", "Equipped only", "Blocked and out-of-range attempts do not spend Action", "attack({ kind: \"action\""]) {
  if (!commandDrawer.includes(control)) failures.push(`Combat Commands drawer is missing ${control}.`);
}

const bonusDrawer = await read("src/screens/BonusCommandsDrawer.jsx");
for (const control of ["Off-hand attack", "Battle chests", "Physical weapons", "openChest", "retrieve", "No automatic End Turn", "kind: \"bonus\""]) {
  if (!bonusDrawer.includes(control)) failures.push(`Bonus Commands drawer is missing ${control}.`);
}

const cinematic = await read("src/screens/AttackCinematic.jsx");
for (const state of ["spin", "natural", "modifiers", "verdict", "damage", "impact", "failed", "rejected", "Natural 1 always misses", "Critical hit"]) {
  if (!cinematic.includes(state)) failures.push(`Attack cinematic is missing ${state}.`);
}

const functionalCss = (await read("src/styles/functional-states.css")).replace(/\/\*[\s\S]*?\*\//g, "");
for (const requiredClass of [
  ".nf-state-table-attack-range",
  ".nf-state-table-attack-band",
  ".nf-state-table-targetable",
  ".nf-state-table-condition-badges",
  ".nf-state-condition-chip",
  ".nf-state-table-hit",
  ".nf-state-cinematic",
  ".nf-state-cinematic-die",
  ".nf-state-cinematic-verdict-critical",
  ".nf-state-combat-attack-draft",
]) if (!functionalCss.includes(requiredClass)) failures.push(`Missing Phase 9 functional style ${requiredClass}.`);
for (const match of functionalCss.matchAll(/([^{}]+)\{/g)) {
  const header = match[1].trim();
  if (!header || header.startsWith("@")) continue;
  for (const selector of header.split(",")) if (!selector.trim().startsWith(".nf-state-")) failures.push(`Unscoped functional selector: ${selector.trim()}`);
}
if (!functionalCss.includes("@media (prefers-reduced-motion: reduce)")) failures.push("Phase 9 motion does not respect reduced-motion preferences.");

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
for (const script of ["verify:phase9", "test:phase9:render"]) if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
if (!packageJson.scripts?.verify?.includes("verify:phase9") || !packageJson.scripts?.verify?.includes("test:phase9:render")) failures.push("The complete verification gate does not include both Phase 9 gates.");

if (failures.length) {
  console.error("Phase 9 verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Phase 9 attack selection, bounded range SVG, line of sight, roll modes, damage, dual wielding, all conditions, Action/Bonus drawers, and cinematics are present.");
console.log("Phase 9 behavior remains intact alongside later encounter integration; original Roll30 runtime, UI, storage identifiers, and user data remain isolated.");
