import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DAMAGE_TYPES, applyDamageDefense, normalizeDamageTypeList } from "../src/domain/damageTypes.js";
import { DEATH_SAVE_DC, STABILIZE_DC } from "../src/domain/death.js";
import { CONDITIONS } from "../src/domain/conditions.js";
import { DEATH_SAVES_REQUIRED } from "../src/domain/table.js";
import { HELP_REACH_FEET } from "../src/domain/combat.js";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const failures = [];

for (const file of [
  "src/domain/damageTypes.js",
  "src/domain/death.js",
  "src/reactions.test.js",
  "scripts/reactions-render-smoke.mjs",
  "scripts/verify-reactions.mjs",
]) {
  try { await read(file); } catch { failures.push(`Missing reactions file: ${file}`); }
}

/* ------------------------------------------------------------ damage types */

if (DAMAGE_TYPES.length !== 13) failures.push(`The SRD damage type list must hold exactly 13 entries; found ${DAMAGE_TYPES.length}.`);
for (const id of ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]) {
  if (!DAMAGE_TYPES.some((type) => type.id === id)) failures.push(`The damage type list is missing ${id}.`);
}

// The three multipliers, and the rounding, are the whole rule.
const defended = {
  damageImmunities: ["poison"],
  damageResistances: ["fire"],
  damageVulnerabilities: ["cold"],
};
if (applyDamageDefense(defended, 13, "poison").amount !== 0) failures.push("Immunity must reduce damage to zero.");
if (applyDamageDefense(defended, 13, "fire").amount !== 6) failures.push("Resistance must halve damage, rounding down.");
if (applyDamageDefense(defended, 13, "cold").amount !== 26) failures.push("Vulnerability must double damage.");
if (applyDamageDefense(defended, 13, "slashing").amount !== 13) failures.push("An undefended damage type must pass through untouched.");
if (applyDamageDefense(defended, 13, null).amount !== 13) failures.push("Untyped damage must pass through untouched.");

// Qualified SRD prose must never be reduced to plain types: no weapon in the
// catalog records whether it is silvered, adamantine, or magical, so there is
// nothing to test the qualifier against.
const qualified = normalizeDamageTypeList(["Cold", "Bludgeoning, Piercing, And Slashing From Nonmagical Weapons That Aren't Silvered"]);
if (qualified.applied.length !== 1 || qualified.applied[0] !== "cold") failures.push("A qualified defence line must not be split into plain damage types.");
if (qualified.unapplied.length !== 1) failures.push("A qualified defence line must be kept whole as reference prose.");

const damageTypes = await read("src/domain/damageTypes.js");
for (const behavior of [
  "export function applyDamageDefense",
  "export function normalizeDamageTypeList",
  "export function damageDefenseText",
  "Math.floor(incoming / 2)",
]) if (!damageTypes.includes(behavior)) failures.push(`Damage type domain is missing ${behavior}.`);

/* ------------------------------------------------------- death saving throws */

if (DEATH_SAVE_DC !== 10) failures.push("A death saving throw must be against DC 10.");
if (STABILIZE_DC !== 10) failures.push("Stabilising first aid must be a DC 10 Medicine check.");
if (DEATH_SAVES_REQUIRED !== 3) failures.push("Three successes must stabilise and three failures must kill.");

const death = await read("src/domain/death.js");
for (const behavior of [
  "export function rollDeathSave",
  "export function stabilizeAvailability",
  "export function stabilizeCreature",
  "criticalSuccess",
  "criticalFailure",
  "revivedTokenPatch",
  "DEATH_SAVE_STABLE",
  "DEATH_SAVE_ALREADY_ROLLED",
  "completeEncounterIfNeeded",
]) if (!death.includes(behavior)) failures.push(`Death domain is missing ${behavior}.`);
// Randomness stays injected so the dice can be pinned in a test.
if (!death.includes("{ random = Math.random } = {}")) failures.push("Death saving throw randomness is not injected.");
if (/Math\.random\(\)/.test(death)) failures.push("The death domain calls Math.random directly.");
for (const forbidden of ["window.", "localStorage", "document.", "Date.now("]) {
  if (death.includes(forbidden)) failures.push(`The death domain reaches for the browser global ${forbidden}.`);
}

// Dying must not become a sixteenth condition. The unconscious condition already
// carries exactly the right mechanics, and the catalog is pinned at fifteen.
if (CONDITIONS.length !== 15) failures.push(`The condition engine must still hold exactly 15 conditions; found ${CONDITIONS.length}.`);
if (CONDITIONS.some((condition) => condition.id === "dying")) failures.push("Dying must be derived from hit points and the dead flag, not added as a condition.");

const vitality = await read("src/domain/vitality.js");
for (const behavior of [
  "export function resolveIncomingDamage",
  "export function damageStateText",
  "applyDamageToPools",
  "instantDeath",
  "downed ? [...token.conditions, \"unconscious\"]",
]) if (!vitality.includes(behavior)) failures.push(`Vitality domain is missing ${behavior}.`);
// Death saving throws are a player-character rule. Without the Hero test a
// felled monster would lie there dying and the Battle would never complete.
if (!vitality.includes("const makesDeathSaves = Boolean(token.heroId)")) {
  failures.push("Death saving throws are not restricted to Heroes; a felled monster would be left dying.");
}
// Healing must raise the dying and refuse only the dead. The old guard tested
// hit points, which would now leave a downed hero unrescuable.
if (!vitality.includes("if (token.dead) return failure(")) {
  failures.push("Healing must refuse the dead rather than everyone at zero hit points.");
}
if (vitality.includes("if (token.hp <= 0) return failure(")) {
  failures.push("A hit-point guard still blocks healing or damaging a dying creature.");
}

const encounter = await read("src/domain/encounter.js");
if (!encounter.includes("token.hp > 0 || !token.dead")) failures.push("Battle completion must count a dying creature as still in the fight.");
// The experience filter is a separate rule and must not have been folded in.
if (!encounter.includes("token.hp <= 0 && !token.heroId")) failures.push("The experience award no longer counts defeated non-Hero tokens.");

/* --------------------------------------------- reactions and opportunity attacks */

if (HELP_REACH_FEET !== 5) failures.push("Help must reach exactly one square.");

const attacks = await read("src/domain/attacks.js");
for (const behavior of [
  "export const ATTACK_KIND_REACTION",
  "export function reactionAttackAvailability",
  "export function opportunityAttacksFor",
  "export function meleeReachFeet",
  "targetPosition",
  "REACTION_ALREADY_SPENT",
  "code: \"target-dodging\"",
  "code: \"helped\"",
]) if (!attacks.includes(behavior)) failures.push(`Attack domain is missing ${behavior}.`);
// A reaction must not write turn resources: the mover is mid-turn while it
// resolves, and overwriting them would hand their Action to the reactor.
if (!attacks.includes("...(kind === ATTACK_KIND_REACTION ? {} : { resources: { [attacker.id]: nextResources } })")) {
  failures.push("An opportunity attack overwrites the moving creature's turn resources.");
}
if (!attacks.includes("updateToken(damagedTokens, attacker.id, { reactionSpent: true })")) {
  failures.push("An opportunity attack does not spend the reactor's reaction.");
}
// Help buys one roll. Without this a Multiattack would carry it across every swing.
if (!attacks.includes("helpedAgainstTokenId: null, helpedById: null")) {
  failures.push("Help is not consumed by the attack it was granted for.");
}

const combat = await read("src/domain/combat.js");
for (const behavior of [
  "export const dodgeAvailability",
  "export const activateDodge",
  "export const disengageAvailability",
  "export const activateDisengage",
  "export function helpAvailability",
  "export function activateHelp",
  "TACTIC_ACTION_SPENT",
  "DEATH_SAVE_REQUIRED",
]) if (!combat.includes(behavior)) failures.push(`Combat domain is missing ${behavior}.`);
// End Turn still discards resources exactly as Phase 8 pinned it, and now also
// clears the states that had to outlive the turn on the token.
if (!combat.includes("resources: { [nextToken.id]: createTurnResources(nextToken) }")) {
  failures.push("End Turn no longer discards old resources and creates a fresh next turn.");
}
if (!combat.includes("updateToken(tokens, nextToken.id, CLEARED_TURN_STATE)")) {
  failures.push("End Turn does not clear Dodge, Disengage and the spent reaction for the incoming creature.");
}
// A dying creature takes its turn; only the dead and the stable are skipped.
if (!combat.includes("candidate.hp > 0 || (!candidate.dead && !isStable(candidate))")) {
  failures.push("End Turn skips dying creatures instead of letting them roll.");
}

const tableDomain = await read("src/domain/table.js");
for (const contract of [
  "export const isDying",
  "export const isStable",
  "export const CLEARED_TURN_STATE",
  "export const CLEARED_DEATH_STATE",
  "deathSaveRolled: false",
  "damageResistances: normalizeDamageTypes(input.damageResistances)",
  "reactionSpent: Boolean(input.reactionSpent)",
  "dodging: Boolean(input.dodging)",
  "disengaging: Boolean(input.disengaging)",
]) if (!tableDomain.includes(contract)) failures.push(`Table domain is missing ${contract}.`);
// The normalizer decides who is dead rather than trusting the caller, so no
// code path can build a dying monster or a dead creature with hit points left.
if (!tableDomain.includes("dead: hp > 0\n      ? false\n      : heroId")) {
  failures.push("The token normalizer no longer enforces who can be dying and who is simply dead.");
}
// The schema version must not move: every new field defaults instead.
if (!(await read("src/storage/constants.js")).includes("export const NIGHTFORGE_SCHEMA_VERSION = 1;")) {
  failures.push("The storage schema version moved. New token fields must default in the normalizer instead.");
}

/* ------------------------------------------------------------------- screens */

const inspector = await read("src/screens/BattleTokenInspector.jsx");
for (const control of [
  "nf-state-battle-death-pip",
  "nf-state-battle-defenses",
  "nf-state-battle-vitality-type",
  "damage(token.id, amount, damageType || null)",
]) if (!inspector.includes(control)) failures.push(`Battle token inspector is missing ${control}.`);

const commandBar = await read("src/screens/CommandBar.jsx");
for (const control of [
  "Tactics",
  "Spend the Action on a tactic",
  "Roll death save",
  "onClick={dodge}",
  "onClick={disengage}",
  "help(ally.id)",
  "stabilize(target.id)",
]) if (!commandBar.includes(control)) failures.push(`Command bar is missing ${control}.`);

const setupInspector = await read("src/screens/BattleSetupInspector.jsx");
for (const control of ["nf-state-scene-defences", "DefenceEditor"]) {
  if (!setupInspector.includes(control)) failures.push(`Battle setup inspector is missing ${control}.`);
}

const table = await read("src/screens/TableScreen.jsx");
for (const integration of [
  "opportunityAttacksFor",
  "ATTACK_KIND_REACTION",
  "rollDeathSave",
  "activateDodge",
  "activateDisengage",
  "activateHelp",
  "stabilizeCreature",
  "commitMovement",
  "reactionQueue",
  "attackDraft || helpDraft",
]) if (!table.includes(integration)) failures.push(`Table screen is missing ${integration}.`);

const browserRegression = await read("tests/phase11.spec.js");
for (const journey of [
  "Help targeting survives board pointer capture",
  "walking away from a Knight resolves an opportunity attack",
  "a dying turn cannot skip or repeat its save",
]) if (!browserRegression.includes(journey)) failures.push(`Browser regression coverage is missing: ${journey}.`);
// Persistence precedes presentation for a reaction exactly as it does for an
// ordinary attack, because both go through the same presenter.
const presenter = table.slice(table.indexOf("const presentAttack"), table.indexOf("const resolveAttackTarget"));
if (presenter.indexOf("savePatch") > presenter.indexOf("setCinematic")) {
  failures.push("An attack animates before it is saved.");
}

const cinematic = await read("src/screens/AttackCinematic.jsx");
for (const control of ["nf-state-cinematic-defense", "damageDefense", "nf-state-cinematic-dying"]) {
  if (!cinematic.includes(control)) failures.push(`Attack cinematic is missing ${control}.`);
}

const checkCinematic = await read("src/screens/CheckCinematic.jsx");
for (const control of ["Death saving throw", "deathVerdict", "Back on their feet"]) {
  if (!checkCinematic.includes(control)) failures.push(`Check cinematic is missing ${control}.`);
}

const styles = await read("src/styles/functional-states.css");
for (const selector of [
  ".nf-state-battle-death",
  ".nf-state-battle-death-pip",
  ".nf-state-battle-defenses",
  ".nf-state-scene-defences",
  ".nf-state-cinematic-defense",
]) if (!styles.includes(selector)) failures.push(`Functional states stylesheet is missing ${selector}.`);

/* ------------------------------------------------------------------- gating */

const packageJson = JSON.parse(await read("package.json"));
for (const script of ["test:reactions:render", "verify:reactions"]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing npm script ${script}.`);
}
for (const gate of ["test:reactions:render", "verify:reactions"]) {
  if (!packageJson.scripts?.verify?.includes(gate)) failures.push(`Full verification command omits ${gate}.`);
}

if (failures.length) {
  console.error("Reactions verification failed:\n" + failures.map((line) => `  - ${line}`).join("\n"));
  process.exit(1);
}

console.log("Reactions verification passed.");
console.log(`  - Damage: ${DAMAGE_TYPES.length} types; immunity zeroes, resistance halves rounding down, vulnerability doubles.`);
console.log("  - Qualified SRD defence prose is displayed, never adjudicated.");
console.log(`  - Death saving throws: DC ${DEATH_SAVE_DC}, ${DEATH_SAVES_REQUIRED} either way, natural 1 twice, natural 20 revives.`);
console.log(`  - Dying turns require one save; adjacent allies can stabilise with a DC ${STABILIZE_DC} Medicine check.`);
console.log("  - A dying creature keeps its side in the fight and still takes its turn.");
console.log("  - Reactions live on the token, spend nothing from the mover's turn, and refresh at the start of their own.");
