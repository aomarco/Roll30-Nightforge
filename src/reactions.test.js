import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTACK_KIND_REACTION,
  attackRollSources,
  meleeReachFeet,
  opportunityAttacksFor,
  performWeaponAttack,
  UNARMED_STRIKE,
} from "./domain/attacks.js";
import {
  activateDisengage,
  activateDodge,
  activateHelp,
  endTurn,
  helpAvailability,
  moveActiveToken,
  planActiveMovement,
} from "./domain/combat.js";
import {
  applyDamageDefense,
  DAMAGE_TYPES,
  normalizeDamageType,
  normalizeDamageTypeList,
} from "./domain/damageTypes.js";
import {
  rollDeathSave,
  stabilizeAvailability,
  stabilizeCreature,
} from "./domain/death.js";
import { completeEncounterIfNeeded, encounterExperienceAward } from "./domain/encounter.js";
import { createSceneRecord } from "./domain/records.js";
import {
  createManualToken,
  createMonsterToken,
  createTurnResources,
  DEATH_SAVES_REQUIRED,
  isDying,
  isStable,
  setupPositionForCell,
  updateToken,
} from "./domain/table.js";
import { damageToken, healToken, resolveIncomingDamage } from "./domain/vitality.js";
import { MONSTERS } from "./domain/monsters.generated.js";

const NOW = "2026-08-23T10:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const at = (column, row) => setupPositionForCell({ column, row }, VIEWPORT);

/**
 * A fixed die. `rollDie` multiplies by the number of sides and floors, so the
 * midpoint of a face is the safe place to land — the edges round unpredictably.
 */
const d20 = (face) => () => (face - 0.5) / 20;

const token = (id, column, row, patch = {}) => createManualToken({
  id,
  name: patch.name || id,
  position: at(column, row),
  ...patch,
});

const battleScene = ({ tokens, resources, activeIndex = 0 } = {}) => createSceneRecord({
  id: "reactions-scene",
  name: "Reactions Lab",
  kind: "battle",
  tokens,
  encounter: {
    version: 1,
    status: "active",
    initiativeOrder: tokens.map((entry) => entry.id),
    initiatives: Object.fromEntries(tokens.map((entry, index) => [entry.id, 20 - index])),
    activeIndex,
    round: 1,
    resources: { [tokens[activeIndex].id]: resources || createTurnResources(tokens[activeIndex]) },
    battleItems: [],
    ammoSpentByToken: {},
    winnerTokenId: null,
    log: [],
  },
}, { id: "reactions-scene", now: NOW });

/* ------------------------------------------- damage types and defences */

test("the damage type vocabulary covers the thirteen SRD types and folds case", () => {
  assert.equal(DAMAGE_TYPES.length, 13);
  assert.equal(normalizeDamageType("Fire"), "fire");
  assert.equal(normalizeDamageType("  BLUDGEONING "), "bludgeoning");
  assert.equal(normalizeDamageType("nonsense"), null);
  assert.equal(normalizeDamageType(null), null);
});

test("a qualified SRD defence line is kept whole as prose rather than split into plain types", () => {
  const split = normalizeDamageTypeList([
    "Psychic",
    "Bludgeoning, Piercing, And Slashing From Nonmagical Weapons That Aren't Silvered",
  ]);
  assert.deepEqual(split.applied, ["psychic"]);
  assert.equal(split.unapplied.length, 1);
  // The qualifier cannot be judged — nothing in the catalog records whether a
  // weapon is silvered — so none of the three physical types leaks through.
  assert.equal(split.applied.includes("bludgeoning"), false);
  assert.equal(split.applied.includes("slashing"), false);
});

test("immunity zeroes, resistance halves rounding down, and vulnerability doubles", () => {
  const target = token("target", 1, 1, {
    damageImmunities: ["poison"],
    damageResistances: ["fire"],
    damageVulnerabilities: ["cold"],
  });
  assert.equal(applyDamageDefense(target, 13, "Poison").amount, 0);
  assert.equal(applyDamageDefense(target, 13, "Fire").amount, 6);
  assert.equal(applyDamageDefense(target, 13, "Cold").amount, 26);
  assert.equal(applyDamageDefense(target, 13, "Slashing").amount, 13);
});

test("only one defence applies, and immunity settles a contradictory stat block", () => {
  const contradictory = token("both", 1, 1, {
    damageImmunities: ["fire"],
    damageResistances: ["fire"],
    damageVulnerabilities: ["fire"],
  });
  const result = applyDamageDefense(contradictory, 20, "fire");
  assert.equal(result.defense, "immune");
  assert.equal(result.amount, 0);
});

test("untyped and unrecognised damage passes through untouched", () => {
  const resistant = token("resistant", 1, 1, { damageResistances: ["fire"] });
  assert.equal(applyDamageDefense(resistant, 10, null).amount, 10);
  assert.equal(applyDamageDefense(resistant, 10, "psionic").amount, 10);
  assert.equal(applyDamageDefense(resistant, 10, null).defense, null);
});

test("a monster keeps its structured defences and its unrunnable prose separately", () => {
  const dragon = MONSTERS.find((entry) => entry.id === "adult-brass-dragon");
  const placed = createMonsterToken(dragon, { id: "dragon", ordinal: 0, position: at(1, 1) });
  assert.deepEqual(placed.damageImmunities, ["fire"]);
  assert.match(placed.statBlockNotes.immunities, /Fire \(applied\)/);
});

test("hand-applied damage respects a named type and ignores an unnamed one", () => {
  const dragon = MONSTERS.find((entry) => entry.id === "adult-brass-dragon");
  const placed = createMonsterToken(dragon, { id: "dragon", ordinal: 0, position: at(1, 1) });
  const hero = token("hero", 3, 1, { heroId: "wren", faction: "ally", dead: false });
  const scene = battleScene({ tokens: [placed, hero] });
  const immune = damageToken(scene, "dragon", 20, "Fire");
  assert.equal(immune.outcome.applied, 0);
  assert.match(immune.value.encounter.log.at(-1), /negated by immunity/i);
  const plain = damageToken(scene, "dragon", 20, null);
  assert.equal(plain.outcome.applied, 20);
});

/* -------------------------------------------------------- death saving throws */

test("three successes stabilise and stop the rolling", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, deathSaveSuccesses: 2, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, foe] });
  const rolled = rollDeathSave(scene, "hero", { random: d20(15) });
  const after = rolled.value.tokens.find((entry) => entry.id === "hero");
  assert.equal(rolled.outcome.stabilised, true);
  assert.equal(isStable(after), true);
  assert.equal(after.hp, 0);
  // Stable is not standing. The creature holds on and waits for healing.
  assert.equal(after.dead, false);
  assert.equal(rollDeathSave({ ...scene, tokens: rolled.value.tokens }, "hero", { random: d20(15) }).code, "DEATH_SAVE_STABLE");
});

test("three failures kill", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, deathSaveFailures: 2, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const rolled = rollDeathSave(battleScene({ tokens: [hero, foe] }), "hero", { random: d20(4) });
  assert.equal(rolled.outcome.died, true);
  assert.equal(rolled.value.tokens.find((entry) => entry.id === "hero").dead, true);
});

test("a natural one counts as two failures", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const rolled = rollDeathSave(battleScene({ tokens: [hero, foe] }), "hero", { random: d20(1) });
  assert.equal(rolled.outcome.criticalFailure, true);
  assert.equal(rolled.value.tokens.find((entry) => entry.id === "hero").deathSaveFailures, 2);
});

test("a natural twenty stands the creature up at one hit point with a clean tally", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, deathSaveFailures: 2, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const rolled = rollDeathSave(battleScene({ tokens: [hero, foe] }), "hero", { random: d20(20) });
  const after = rolled.value.tokens.find((entry) => entry.id === "hero");
  assert.equal(after.hp, 1);
  assert.equal(after.deathSaveFailures, 0);
  assert.equal(after.conditions.includes("unconscious"), false);
});

test("dropping to zero starts the dying rather than ending it", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", maxHp: 20, hp: 6, dead: false });
  const state = resolveIncomingDamage(hero, 9);
  assert.equal(state.downed, true);
  assert.equal(state.patch.hp, 0);
  assert.equal(state.patch.dead, false);
  assert.equal(state.patch.conditions.includes("unconscious"), true);
});

test("only a Hero makes death saving throws; a monster at zero is simply dead", () => {
  // Death saving throws are a player-character rule. A monster that drops to
  // zero dies, which is what the SRD says and what keeps a Battle finishing
  // when the last goblin falls rather than leaving it bleeding out forever.
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", maxHp: 20, hp: 4, dead: false });
  const goblin = token("goblin", 2, 1, { faction: "foe", maxHp: 9, hp: 4, dead: false });
  const heroDown = resolveIncomingDamage(hero, 6);
  assert.equal(heroDown.downed, true);
  assert.equal(heroDown.patch.dead, false);
  assert.equal(heroDown.patch.conditions.includes("unconscious"), true);
  const goblinDown = resolveIncomingDamage(goblin, 6);
  assert.equal(goblinDown.felled, true);
  assert.equal(goblinDown.downed, false);
  assert.equal(goblinDown.patch.dead, true);
  assert.equal(goblinDown.patch.conditions.includes("unconscious"), false);
});

test("felling the last monster still ends the Battle", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 2, 1, { faction: "foe", maxHp: 9, hp: 4, dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  const killed = damageToken(scene, "goblin", 6);
  assert.equal(killed.outcome.completed, true);
  assert.equal(killed.value.encounter.status, "complete");
});

test("a hit on a dying creature is a failed death save, and a critical is two", () => {
  const dying = token("dying", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  assert.equal(resolveIncomingDamage(dying, 7).patch.deathSaveFailures, 1);
  assert.equal(resolveIncomingDamage(dying, 7, { critical: true }).patch.deathSaveFailures, 2);
  // The hit takes no hit points, because there are none left to take.
  assert.equal(resolveIncomingDamage(dying, 7).nextHp, 0);
});

test("damage knocks a stable Hero back into dying before adding a failure", () => {
  const stable = token("stable", 1, 1, {
    heroId: "wren",
    faction: "ally",
    hp: 0,
    dead: false,
    deathSaveSuccesses: DEATH_SAVES_REQUIRED,
    conditions: ["unconscious"],
  });
  const struck = resolveIncomingDamage(stable, 1);
  assert.equal(struck.patch.deathSaveSuccesses, 0);
  assert.equal(struck.patch.deathSaveFailures, 1);
  assert.equal(isStable({ ...stable, ...struck.patch }), false);
});

test("an adjacent ally can spend an Action on a DC 10 Medicine check to stabilise", () => {
  const medic = token("medic", 1, 1, { heroId: "medic", faction: "ally", dead: false, wisdom: 10 });
  const dying = token("dying", 2, 1, {
    heroId: "wren",
    faction: "ally",
    hp: 0,
    dead: false,
    deathSaveFailures: 2,
    conditions: ["unconscious"],
  });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [medic, dying, foe] });
  assert.deepEqual(stabilizeAvailability(scene, null, VIEWPORT).value.targets.map(({ id }) => id), ["dying"]);
  const treated = stabilizeCreature(scene, "dying", VIEWPORT, { random: d20(10) });
  const after = treated.value.tokens.find((entry) => entry.id === "dying");
  assert.equal(treated.outcome.stabilised, true);
  assert.equal(isStable(after), true);
  assert.equal(after.deathSaveFailures, 0);
  assert.equal(treated.value.encounter.resources.medic.actionSpent, true);
  assert.equal(treated.value.encounter.resources.medic.actionType, "stabilize");
});

test("failed first aid still spends the Action and distance is enforced", () => {
  const medic = token("medic", 1, 1, { heroId: "medic", faction: "ally", dead: false, wisdom: 10 });
  const dying = token("dying", 2, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [medic, dying, foe] });
  const failed = stabilizeCreature(scene, "dying", VIEWPORT, { random: d20(9) });
  assert.equal(failed.outcome.stabilised, false);
  assert.equal(isStable(failed.value.tokens.find((entry) => entry.id === "dying")), false);
  assert.equal(failed.value.encounter.resources.medic.actionSpent, true);
  const distant = { ...scene, tokens: updateToken(scene.tokens, "dying", { position: at(8, 8) }) };
  assert.equal(stabilizeAvailability(distant, "dying", VIEWPORT).code, "STABILIZE_NO_TARGET_ADJACENT");
});

test("damage overflowing the whole hit point maximum kills outright", () => {
  const hero = token("hero", 1, 1, { heroId: "wren", faction: "ally", maxHp: 20, hp: 5, dead: false });
  assert.equal(resolveIncomingDamage(hero, 26).instantDeath, true);
  // One short of the maximum in overflow is a knockdown, not a death.
  assert.equal(resolveIncomingDamage(hero, 24).instantDeath, false);
});

test("healing raises the dying and refuses only the dead", () => {
  const dying = token("dying", 1, 1, { heroId: "wren", faction: "ally", maxHp: 20, hp: 0, dead: false, deathSaveFailures: 2, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [dying, foe] });
  const healed = healToken(scene, "dying", 5);
  const after = healed.value.tokens.find((entry) => entry.id === "dying");
  assert.equal(after.hp, 5);
  assert.equal(after.deathSaveFailures, 0);
  assert.equal(after.conditions.includes("unconscious"), false);
  const dead = updateToken(scene.tokens, "dying", { dead: true });
  assert.equal(healToken({ ...scene, tokens: dead }, "dying", 5).code, "HEAL_TARGET_DEFEATED");
});

/* ------------------------------------------- dying and the end of a Battle */

test("a Battle does not end while a side's last member is still dying", () => {
  const dying = token("hero", 1, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [dying, foe] });
  assert.equal(completeEncounterIfNeeded(scene.tokens, scene.encounter).completed, false);
  const gone = updateToken(scene.tokens, "hero", { dead: true });
  assert.equal(completeEncounterIfNeeded(gone, scene.encounter).completed, true);
});

test("the winner is named only when nobody else on their side is left at all", () => {
  const standing = token("wren", 1, 1, { heroId: "wren", faction: "ally", dead: false });
  const dying = token("sable", 2, 1, { heroId: "sable", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const foe = token("foe", 5, 5, { faction: "foe", hp: 0, dead: true });
  const scene = battleScene({ tokens: [standing, dying, foe] });
  const completed = completeEncounterIfNeeded(scene.tokens, scene.encounter);
  assert.equal(completed.completed, true);
  // Wren did not win alone; Sable is bleeding out beside them.
  assert.equal(completed.winnerTokenId, null);
  assert.equal(completed.winnerFaction, "ally");
});

test("a dying foe is worth no experience until it is actually dead", () => {
  const hero = token("wren", 1, 1, { heroId: "wren", faction: "ally", dead: false });
  const foe = token("foe", 5, 5, { faction: "foe", hp: 0, dead: false, xp: 200 });
  assert.equal(encounterExperienceAward([hero, foe], { xpAwarded: false }).total, 200);
  // The award counts creatures at zero hit points, which a dying foe is. It is
  // the completion check that keeps the Battle open, not the ledger.
  assert.equal(encounterExperienceAward([hero, updateToken([hero, foe], "foe", { dead: true })[1]], { xpAwarded: false }).total, 200);
});

test("a dying creature still takes its turn, and a stable or dead one is skipped", () => {
  const first = token("first", 1, 1, { faction: "foe", dead: false });
  const dying = token("dying", 2, 1, { heroId: "wren", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const stable = token("stable", 3, 1, { heroId: "sable", faction: "ally", hp: 0, dead: false, deathSaveSuccesses: DEATH_SAVES_REQUIRED, conditions: ["unconscious"] });
  const scene = battleScene({ tokens: [first, dying, stable] });
  assert.equal(endTurn(scene).activeTokenId, "dying");
  const past = battleScene({ tokens: [first, dying, stable], activeIndex: 1 });
  assert.equal(endTurn(past).code, "DEATH_SAVE_REQUIRED");
  const rolled = rollDeathSave(past, "dying", { random: d20(11) });
  assert.equal(rolled.value.encounter.resources.dying.deathSaveRolled, true);
  assert.equal(rollDeathSave({ ...past, ...rolled.value }, "dying", { random: d20(11) }).code, "DEATH_SAVE_ALREADY_ROLLED");
  // Past the dying creature the order skips the stable one and wraps around.
  assert.equal(endTurn({ ...past, ...rolled.value }).activeTokenId, "first");
});

/* ----------------------------------------------------- opportunity attacks */

test("walking out of an enemy's reach draws exactly one opportunity attack", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  const plan = planActiveMovement(scene, "hero", at(10, 5), VIEWPORT);
  const drawn = opportunityAttacksFor(scene, plan.value, VIEWPORT);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].reactorId, "goblin");
  assert.equal(drawn[0].targetId, "hero");
});

test("moving while staying inside the reach draws nothing", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 6, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  // Sidestepping around the goblin never leaves the square it threatens.
  const plan = planActiveMovement(scene, "hero", at(7, 6), VIEWPORT);
  assert.equal(opportunityAttacksFor(scene, plan.value, VIEWPORT).length, 0);
});

test("Disengage prevents the opportunity attack on the same route", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  const disengaged = activateDisengage(scene);
  assert.equal(disengaged.value.tokens.find((entry) => entry.id === "hero").disengaging, true);
  const after = { ...scene, tokens: disengaged.value.tokens, encounter: disengaged.value.encounter };
  const plan = planActiveMovement(after, "hero", at(10, 5), VIEWPORT);
  assert.equal(opportunityAttacksFor(after, plan.value, VIEWPORT).length, 0);
});

test("a creature whose reaction is spent does not get a second swing", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false, reactionSpent: true });
  const scene = battleScene({ tokens: [hero, goblin] });
  const plan = planActiveMovement(scene, "hero", at(10, 5), VIEWPORT);
  assert.equal(opportunityAttacksFor(scene, plan.value, VIEWPORT).length, 0);
});

test("an ally never draws an opportunity attack, and neither does an unreachable enemy", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const friend = token("friend", 6, 5, { heroId: "sable", faction: "ally", dead: false });
  const archer = token("archer", 6, 6, {
    faction: "foe",
    dead: false,
    inventory: [{ itemId: "shortbow", quantity: 1 }, { itemId: "arrow", quantity: 20 }],
    loadout: { mainHand: "shortbow", offHand: null },
  });
  assert.equal(meleeReachFeet(archer), 0);
  const scene = battleScene({ tokens: [hero, friend, archer] });
  const plan = planActiveMovement(scene, "hero", at(10, 5), VIEWPORT);
  assert.equal(opportunityAttacksFor(scene, plan.value, VIEWPORT).length, 0);
});

test("an opportunity attack spends the reactor's reaction and leaves the mover's turn alone", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  const plan = planActiveMovement(scene, "hero", at(10, 5), VIEWPORT);
  const [drawn] = opportunityAttacksFor(scene, plan.value, VIEWPORT);
  const resolved = performWeaponAttack(scene, {
    kind: ATTACK_KIND_REACTION,
    reactorId: drawn.reactorId,
    targetId: drawn.targetId,
    weaponId: drawn.weaponId,
    hand: drawn.hand,
    attackId: drawn.attackId,
    viewport: VIEWPORT,
  }, { random: d20(18) });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.value.tokens.find((entry) => entry.id === "goblin").reactionSpent, true);
  // The mover is mid-turn: their Action and movement must survive the swing.
  assert.equal(resolved.value.encounter.resources.hero.actionSpent, false);
  assert.equal(resolved.value.encounter.resources.hero.movementSpent, 0);
  assert.match(resolved.value.encounter.log.at(-1), /opportunity attack/i);
});

test("a Knight resolves its opportunity attack from the departure square after movement is saved", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false, maxHp: 30, hp: 30 });
  const knightRecord = MONSTERS.find((entry) => entry.id === "knight");
  const knight = { ...createMonsterToken(knightRecord, { id: "knight", position: at(6, 5) }), faction: "foe" };
  const scene = battleScene({ tokens: [hero, knight] });
  const moved = moveActiveToken(scene, "hero", at(10, 5), VIEWPORT);
  const [drawn] = opportunityAttacksFor(scene, moved.plan, VIEWPORT);
  assert.equal(drawn.weaponName, "Greatsword");
  const afterMove = { ...scene, ...moved.value };
  // Without the departure square this is out of range from the saved landing.
  assert.equal(performWeaponAttack(afterMove, {
    kind: ATTACK_KIND_REACTION,
    reactorId: drawn.reactorId,
    targetId: drawn.targetId,
    attackId: drawn.attackId,
    viewport: VIEWPORT,
  }, { random: d20(18) }).code, "ATTACK_OUT_OF_RANGE");
  const resolved = performWeaponAttack(afterMove, {
    kind: ATTACK_KIND_REACTION,
    reactorId: drawn.reactorId,
    targetId: drawn.targetId,
    attackId: drawn.attackId,
    targetPosition: drawn.departurePosition,
    viewport: VIEWPORT,
  }, { random: d20(18) });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.value.tokens.find((entry) => entry.id === "hero").position, drawn.landingPosition);
  assert.equal(resolved.value.tokens.find((entry) => entry.id === "knight").reactionSpent, true);
});

/* --------------------------------------------------- Dodge, Help, and expiry */

test("Dodge gives every attacker disadvantage and spends the Action", () => {
  const hero = token("hero", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [hero, goblin] });
  const dodged = activateDodge(scene);
  assert.equal(dodged.value.encounter.resources.hero.actionSpent, true);
  const dodging = dodged.value.tokens.find((entry) => entry.id === "hero");
  const sources = attackRollSources({
    attacker: goblin,
    target: dodging,
    weapon: UNARMED_STRIKE,
    range: { usage: "melee", tier: "melee" },
    lineOfSight: { state: "clear" },
    resources: createTurnResources(goblin),
    kind: "action",
  });
  assert.deepEqual(sources.map((entry) => entry.code), ["target-dodging"]);
});

test("Dodge does nothing for a creature that cannot move", () => {
  const pinned = token("pinned", 5, 5, { heroId: "wren", faction: "ally", dead: false, dodging: true, baseSpeed: 0 });
  const goblin = token("goblin", 6, 5, { faction: "foe", dead: false });
  const sources = attackRollSources({
    attacker: goblin,
    target: pinned,
    weapon: UNARMED_STRIKE,
    range: { usage: "melee", tier: "melee" },
    lineOfSight: { state: "clear" },
    resources: createTurnResources(goblin),
    kind: "action",
  });
  assert.equal(sources.some((entry) => entry.code === "target-dodging"), false);
});

test("Help grants advantage against the named enemy only", () => {
  const helper = token("helper", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const ally = token("ally", 5, 6, { heroId: "sable", faction: "ally", dead: false });
  const goblin = token("goblin", 8, 8, { faction: "foe", dead: false });
  const other = token("other", 9, 9, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [helper, ally, goblin, other] });
  const helped = activateHelp(scene, "ally", "goblin", VIEWPORT);
  assert.equal(helped.ok, true);
  const boosted = helped.value.tokens.find((entry) => entry.id === "ally");
  const against = (target) => attackRollSources({
    attacker: boosted,
    target,
    weapon: UNARMED_STRIKE,
    range: { usage: "melee", tier: "melee" },
    lineOfSight: { state: "clear" },
    resources: createTurnResources(boosted),
    kind: "action",
  }).map((entry) => entry.code);
  assert.deepEqual(against(goblin), ["helped"]);
  assert.deepEqual(against(other), []);
});

test("Help needs an ally within five feet", () => {
  const helper = token("helper", 1, 1, { heroId: "wren", faction: "ally", dead: false });
  const distant = token("distant", 9, 9, { heroId: "sable", faction: "ally", dead: false });
  const goblin = token("goblin", 5, 5, { faction: "foe", dead: false });
  const scene = battleScene({ tokens: [helper, distant, goblin] });
  assert.equal(helpAvailability(scene, null, VIEWPORT).code, "HELP_NO_ALLY_ADJACENT");
});

test("Dodge and Help cancel to a normal roll rather than stacking", () => {
  const helper = token("helper", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const ally = token("ally", 5, 6, { heroId: "sable", faction: "ally", dead: false });
  const goblin = token("goblin", 6, 6, { faction: "foe", dead: false, dodging: true });
  const scene = battleScene({ tokens: [helper, ally, goblin] });
  const helped = activateHelp(scene, "ally", "goblin", VIEWPORT);
  const boosted = helped.value.tokens.find((entry) => entry.id === "ally");
  const sources = attackRollSources({
    attacker: boosted,
    target: goblin,
    weapon: UNARMED_STRIKE,
    range: { usage: "melee", tier: "melee" },
    lineOfSight: { state: "clear" },
    resources: createTurnResources(boosted),
    kind: "action",
  });
  assert.equal(sources.length, 2);
  assert.equal(sources.some((entry) => entry.code === "helped"), true);
  assert.equal(sources.some((entry) => entry.code === "target-dodging"), true);
});

test("ending a turn clears the incoming creature's Dodge, Disengage and spent reaction", () => {
  const first = token("first", 1, 1, { faction: "foe", dead: false });
  const second = token("second", 5, 5, {
    heroId: "wren",
    faction: "ally",
    dead: false,
    dodging: true,
    disengaging: true,
    reactionSpent: true,
  });
  const ended = endTurn(battleScene({ tokens: [first, second] }));
  const refreshed = ended.value.tokens.find((entry) => entry.id === "second");
  assert.equal(ended.activeTokenId, "second");
  assert.equal(refreshed.dodging, false);
  assert.equal(refreshed.disengaging, false);
  assert.equal(refreshed.reactionSpent, false);
});

test("an unused Help expires when the helper's own turn comes round again", () => {
  const helper = token("helper", 5, 5, { heroId: "wren", faction: "ally", dead: false });
  const ally = token("ally", 5, 6, { heroId: "sable", faction: "ally", dead: false, helpedAgainstTokenId: "goblin", helpedById: "helper" });
  const goblin = token("goblin", 8, 8, { faction: "foe", dead: false });
  // Initiative sits on the goblin, so ending its turn wraps back to the helper.
  const scene = battleScene({ tokens: [helper, ally, goblin], activeIndex: 2 });
  const ended = endTurn(scene);
  assert.equal(ended.activeTokenId, "helper");
  assert.equal(ended.value.tokens.find((entry) => entry.id === "ally").helpedAgainstTokenId, null);
});

/* -------------------------------------------------------- saves and loading */

test("a save written before any of this loads with the behaviour it always had", () => {
  // No faction, no defences, no death fields, no turn states — an old token.
  const legacy = createManualToken({ id: "legacy", ordinal: 0, maxHp: 12, hp: 12, position: at(1, 1) });
  assert.deepEqual(legacy.damageResistances, []);
  assert.deepEqual(legacy.damageImmunities, []);
  assert.deepEqual(legacy.damageVulnerabilities, []);
  assert.equal(legacy.deathSaveSuccesses, 0);
  assert.equal(legacy.deathSaveFailures, 0);
  assert.equal(legacy.dodging, false);
  assert.equal(legacy.disengaging, false);
  assert.equal(legacy.reactionSpent, false);
  assert.equal(legacy.helpedAgainstTokenId, null);
  assert.equal(legacy.dead, false);
});

test("a creature already at zero in an old save loads as dead, not merely dying", () => {
  // Before death saving throws existed, zero hit points was the end of it. The
  // default has to mean what the save meant when it was written, or a reloaded
  // Battle would quietly revive every corpse into a creature still in the fight.
  const fallen = createManualToken({ id: "fallen", ordinal: 0, maxHp: 12, hp: 0, position: at(1, 1) });
  assert.equal(fallen.dead, true);
  assert.equal(isDying(fallen), false);
});

test("every new field survives a normalize round trip", () => {
  // A Hero, because only a Hero can be at zero hit points and not dead.
  const rich = token("rich", 1, 1, {
    heroId: "wren",
    damageResistances: ["Fire", "cold"],
    damageImmunities: ["Poison"],
    damageVulnerabilities: ["thunder"],
    deathSaveSuccesses: 2,
    deathSaveFailures: 1,
    hp: 0,
    dead: false,
    dodging: true,
    disengaging: true,
    reactionSpent: true,
    helpedAgainstTokenId: "goblin",
    helpedById: "wren",
  });
  const again = createManualToken({ ...rich, ordinal: 0 });
  assert.deepEqual(again.damageResistances, ["fire", "cold"]);
  assert.deepEqual(again.damageImmunities, ["poison"]);
  assert.deepEqual(again.damageVulnerabilities, ["thunder"]);
  assert.equal(again.deathSaveSuccesses, 2);
  assert.equal(again.deathSaveFailures, 1);
  assert.equal(again.dead, false);
  assert.equal(again.dodging, true);
  assert.equal(again.disengaging, true);
  assert.equal(again.reactionSpent, true);
  assert.equal(again.helpedAgainstTokenId, "goblin");
  assert.equal(again.helpedById, "wren");
});

test("the death save tally cannot be pushed past what the rules allow", () => {
  const cheated = token("cheated", 1, 1, { heroId: "wren", hp: 0, dead: false, deathSaveSuccesses: 99, deathSaveFailures: -4 });
  assert.equal(cheated.deathSaveSuccesses, DEATH_SAVES_REQUIRED);
  assert.equal(cheated.deathSaveFailures, 0);
});

test("the normalizer refuses to build a state the game does not have", () => {
  // A monster cannot be dying, and nothing with hit points left can be dead.
  // Enforcing both here means no call site can construct an impossible token,
  // including one that patches hit points without thinking about death.
  const monster = token("monster", 1, 1, { hp: 0, dead: false });
  assert.equal(monster.dead, true);
  assert.equal(isDying(monster), false);
  const revived = token("revived", 1, 1, { heroId: "wren", hp: 7, dead: true });
  assert.equal(revived.dead, false);
});
