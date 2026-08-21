import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CONDITIONS } from "../src/domain/conditions.js";
import { MAX_LEVEL, XP_THRESHOLDS, levelForXp, xpToNextLevel } from "../src/domain/heroes.js";
import { UNARMED_STRIKE } from "../src/domain/attacks.js";
import { MAX_VITALITY_ADJUSTMENT } from "../src/domain/vitality.js";
import { MAX_CHECK_DC, MIN_CHECK_DC } from "../src/domain/checks.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

for (const file of [
  "src/domain/checks.js",
  "src/domain/vitality.js",
  "src/screens/CheckCinematic.jsx",
  "src/rules.test.js",
  "scripts/rules-render-smoke.mjs",
  "scripts/verify-rules.mjs",
]) {
  try { await read(file); } catch { failures.push(`Missing rules file: ${file}`); }
}

/* ------------------------------------------------------------ unarmed strike */

if (UNARMED_STRIKE.id !== "unarmed-strike") failures.push("The unarmed strike identifier is not stable.");
if (UNARMED_STRIKE.damageDice !== 1) failures.push("An unarmed strike must deal a fixed 1 before the ability modifier.");
if (UNARMED_STRIKE.damageType !== "Bludgeoning") failures.push("An unarmed strike must deal bludgeoning damage.");
if (UNARMED_STRIKE.weaponRange !== "melee" || UNARMED_STRIKE.normalRange !== 5) failures.push("An unarmed strike must be a melee attack with a five-foot reach.");
if (UNARMED_STRIKE.propertyIds.length) failures.push("An unarmed strike carries no weapon properties.");

const attacks = await read("src/domain/attacks.js");
for (const behavior of [
  "UNARMED_STRIKE",
  "unarmedStrikeOption",
  "return equipped.length ? equipped : [unarmedStrikeOption()]",
  "hasProperty(option.weapon, \"loading\")",
  "applyDamageToPools",
  "absorbedByTempHp",
]) if (!attacks.includes(behavior)) failures.push(`Attack domain is missing ${behavior}.`);

/* ------------------------------------------------------------------ vitality */

if (MAX_VITALITY_ADJUSTMENT !== 999) failures.push("The hit point adjustment ceiling is not stable at 999.");

const vitality = await read("src/domain/vitality.js");
for (const behavior of [
  "export function healToken",
  "export function damageToken",
  "export function setTemporaryHp",
  "export function applyDamageToPools",
  "completeEncounterIfNeeded",
  "appendEncounterLog",
  "HEAL_TARGET_DEFEATED",
  "TEMP_HP_NOT_HIGHER",
]) if (!vitality.includes(behavior)) failures.push(`Vitality domain is missing ${behavior}.`);

const tableDomain = await read("src/domain/table.js");
for (const contract of [
  "tempHp: Math.max(0, Math.floor(finite(input.tempHp, 0)))",
  "skillProficiencies: Array.isArray(input.skillProficiencies)",
  "xp: Math.max(0, Math.floor(finite(input.xp, 0)))",
  "xpAwarded: Boolean(encounter.xpAwarded)",
  "export function tokenSkillModifier",
  "export const tokenSkillProfile",
  "skillProficiencies: hero.skillProficiencies || []",
  "xp: monster.xp",
]) if (!tableDomain.includes(contract)) failures.push(`Table domain is missing ${contract}.`);
// The schema version must not move: new fields default instead.
if (!tableDomain.includes("conditions: normalizeConditions(input.conditions)")) failures.push("Persisted token conditions are no longer normalized through the condition engine.");

/* ---------------------------------------------------------------- experience */

if (XP_THRESHOLDS.length !== 20 || MAX_LEVEL !== 20) failures.push("The experience table must cover exactly twenty levels.");
if (XP_THRESHOLDS[0] !== 0 || XP_THRESHOLDS[1] !== 300 || XP_THRESHOLDS.at(-1) !== 355000) failures.push("The experience table does not match SRD 5.1 thresholds.");
if (XP_THRESHOLDS.some((value, index) => index > 0 && value <= XP_THRESHOLDS[index - 1])) failures.push("Experience thresholds must increase at every level.");
if (levelForXp(0) !== 1 || levelForXp(299) !== 1 || levelForXp(300) !== 2 || levelForXp(355000) !== 20) failures.push("Experience does not map to the correct level at its boundaries.");
if (xpToNextLevel(355000) !== null) failures.push("Level twenty must report no further experience requirement.");

const encounter = await read("src/domain/encounter.js");
for (const behavior of [
  "export function encounterExperienceAward",
  "token.hp <= 0 && !token.heroId",
  "token.hp > 0 && token.heroId",
]) if (!encounter.includes(behavior)) failures.push(`Encounter domain is missing ${behavior}.`);

const commands = await read("src/application/commands.js");
for (const contract of [
  "awardExperience",
  "xp-already-awarded",
  "xp-no-recipients",
  "xpAwarded: true",
]) if (!commands.includes(contract)) failures.push(`Application commands are missing ${contract}.`);
// Experience is never handed out on its own.
if (!commands.includes("scene.value.encounter?.xpAwarded")) failures.push("Experience can be awarded twice for the same Battle.");

/* ------------------------------------------------------- checks and saves */

if (MIN_CHECK_DC !== 1 || MAX_CHECK_DC !== 40) failures.push("The difficulty class bounds are not stable at 1 to 40.");

const checks = await read("src/domain/checks.js");
for (const behavior of [
  "export function performSavingThrow",
  "export function performAbilityCheck",
  "combineAttackModes",
  "conditionAutoFailsSave",
  "conditionSaveModes",
  "tokenSaveModifier",
  "tokenSkillModifier",
  "ACTIVE_BATTLE_REQUIRED",
]) if (!checks.includes(behavior)) failures.push(`Check domain is missing ${behavior}.`);
// Neither a save nor a check may spend the turn economy.
for (const contract of ["actionSpent", "bonusActionSpent", "movementSpent"]) {
  if (checks.includes(contract)) failures.push(`A check must not touch the turn resource ${contract}.`);
}
// Randomness stays injected so tests can pin the dice.
if (!checks.includes("{ random = Math.random } = {}")) failures.push("Check randomness is not injected.");
if (/Math\.random\(\)/.test(checks) || /Math\.random\(\)/.test(vitality)) failures.push("A rules domain module calls Math.random directly.");
for (const forbidden of ["window.", "localStorage", "document.", "Date.now("]) {
  for (const [name, source] of [["checks", checks], ["vitality", vitality]]) {
    if (source.includes(forbidden)) failures.push(`The ${name} domain module reaches for the browser global ${forbidden}.`);
  }
}

const conditionsSource = await read("src/domain/conditions.js");
for (const behavior of [
  "autoFailSaves",
  "saveModes",
  "export function conditionSaveModes",
  "export const conditionAutoFailsSave",
  "export const autoFailingSaveConditions",
]) if (!conditionsSource.includes(behavior)) failures.push(`Condition engine is missing ${behavior}.`);

if (CONDITIONS.length !== 15) failures.push(`The condition engine must still contain exactly 15 conditions; found ${CONDITIONS.length}.`);
for (const id of ["paralyzed", "petrified", "stunned", "unconscious"]) {
  const condition = CONDITIONS.find((entry) => entry.id === id);
  if (!condition) { failures.push(`Condition catalog is missing ${id}.`); continue; }
  if (!condition.autoFailSaves.includes("str") || !condition.autoFailSaves.includes("dex")) {
    failures.push(`${condition.name} must fail Strength and Dexterity saving throws automatically.`);
  }
}
const restrained = CONDITIONS.find((entry) => entry.id === "restrained");
if (restrained?.saveModes?.dex !== "disadvantage") failures.push("Restrained must impose disadvantage on Dexterity saving throws.");
for (const condition of CONDITIONS) {
  if (!Array.isArray(condition.autoFailSaves) || typeof condition.saveModes !== "object") {
    failures.push(`${condition.name} has a malformed saving-throw contract.`);
  }
}

/* ------------------------------------------------------------------- screens */

const inspector = await read("src/screens/BattleTokenInspector.jsx");
for (const control of [
  "Hit point adjustment",
  "nf-state-battle-heal",
  "nf-state-battle-damage",
  "nf-state-battle-temp-set",
  "nf-state-battle-roll-mode",
  "rollSave(token.id, save.ability, rollOptions)",
  "rollCheck(token.id, { skillId: skill.id }, rollOptions)",
  "tokenSkillProfile",
]) if (!inspector.includes(control)) failures.push(`Battle token inspector is missing ${control}.`);

const cinematic = await read("src/screens/CheckCinematic.jsx");
for (const control of ["autoFailed", "Automatic failure", "nf-state-check-die-void", "Click anywhere to skip"]) {
  if (!cinematic.includes(control)) failures.push(`Check cinematic is missing ${control}.`);
}

const completion = await read("src/screens/BattleCompletion.jsx");
for (const control of ["encounterExperienceAward", "Award XP", "awardXp(award)", "alreadyAwarded"]) {
  if (!completion.includes(control)) failures.push(`Battle completion card is missing ${control}.`);
}

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "performSavingThrow",
  "performAbilityCheck",
  "healToken",
  "damageToken",
  "setTemporaryHp",
  "CheckCinematic",
  "checkCinematic",
  "onAwardExperience",
  "combatLocked = Boolean(cinematic || checkCinematic || retrievalCinematic)",
]) if (!table.includes(integration)) failures.push(`Table screen is missing ${integration}.`);
// Persistence must precede presentation, as it does for attacks.
const present = table.slice(table.indexOf("const presentCheck"), table.indexOf("const rollTokenSave"));
if (present.indexOf("savePatch") > present.indexOf("setCheckCinematic")) {
  failures.push("A check animates before it is saved.");
}

const heroes = await read("src/screens/HeroesScreen.jsx");
for (const control of ["levelForXp", "xpToNextLevel", "nf-state-hero-xp", "Experience"]) {
  if (!heroes.includes(control)) failures.push(`Heroes screen is missing ${control}.`);
}

const styles = await read("src/styles/functional-states.css");
for (const selector of [
  ".nf-state-battle-vitality",
  ".nf-state-battle-skill-grid",
  ".nf-state-battle-roll-modes",
  ".nf-state-battle-temp",
  ".nf-state-battle-xp",
  ".nf-state-check-die-void",
]) if (!styles.includes(selector)) failures.push(`Functional states stylesheet is missing ${selector}.`);

/* ------------------------------------------------------------------- gating */

const packageJson = JSON.parse(await read("package.json"));
for (const script of ["test:rules:render", "verify:rules"]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
}
for (const gate of ["test:rules:render", "verify:rules"]) {
  if (!packageJson.scripts?.verify?.includes(gate)) failures.push(`Full verification command omits ${gate}.`);
}

if (failures.length) {
  console.error("Rules verification failed:\n" + failures.map((line) => `  - ${line}`).join("\n"));
  process.exit(1);
}

console.log("Rules verification passed.");
console.log("  - Unarmed strikes: fixed 1 bludgeoning, five-foot reach, no properties, fallback only when empty-handed.");
console.log("  - Loading: the first shot closes the Action whatever the Multiattack allowance.");
console.log(`  - Experience: ${XP_THRESHOLDS.length} thresholds, awarded by hand, once per Battle.`);
console.log("  - Healing and temporary hit points: capped, non-stacking, absorbed before real hit points.");
console.log("  - Saves and checks: injected randomness, no turn resource spent, four conditions auto-fail.");
