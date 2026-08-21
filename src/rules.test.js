import test from "node:test";
import assert from "node:assert/strict";

import {
  UNARMED_STRIKE,
  attackOptionsForToken,
  performWeaponAttack,
} from "./domain/attacks.js";
import {
  CHECK_MODE_ADVANTAGE,
  CHECK_MODE_DISADVANTAGE,
  performAbilityCheck,
  performSavingThrow,
} from "./domain/checks.js";
import {
  CONDITIONS,
  conditionAutoFailsSave,
  conditionSaveModes,
} from "./domain/conditions.js";
import { encounterExperienceAward } from "./domain/encounter.js";
import {
  MAX_LEVEL,
  XP_THRESHOLDS,
  levelForXp,
  xpForLevel,
  xpToNextLevel,
} from "./domain/heroes.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import {
  createHeroTokenSnapshot,
  createManualToken,
  createTurnResources,
  setupPositionForCell,
  tokenSkillModifier,
  tokenSkillProfile,
} from "./domain/table.js";
import {
  applyDamageToPools,
  damageToken,
  healToken,
  setTemporaryHp,
} from "./domain/vitality.js";

const NOW = "2026-08-21T10:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const at = (column, row) => setupPositionForCell({ column, row }, VIEWPORT);
const item = (itemId, quantity = 1) => ({ itemId, quantity });
const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

const token = (id, column, row, patch = {}) => createManualToken({
  id,
  name: patch.name || id,
  position: at(column, row),
  ...patch,
});

const battleScene = ({ tokens, resources, status = "active" } = {}) => createSceneRecord({
  id: "rules-scene",
  name: "Rules Lab",
  kind: "battle",
  tokens,
  encounter: {
    version: 1,
    status,
    initiativeOrder: tokens.map((entry) => entry.id),
    initiatives: Object.fromEntries(tokens.map((entry, index) => [entry.id, 20 - index])),
    activeIndex: 0,
    round: 1,
    resources: { [tokens[0].id]: resources || createTurnResources(tokens[0]) },
    battleItems: [],
    ammoSpentByToken: {},
    winnerTokenId: null,
    log: [],
  },
}, { id: "rules-scene", now: NOW });

/* ------------------------------------------------------- unarmed strikes */

test("an empty-handed creature falls back to exactly one unarmed strike", () => {
  const barehanded = token("barehanded", 1, 1);
  const options = attackOptionsForToken(barehanded);
  assert.equal(options.length, 1);
  assert.equal(options[0].weapon.id, "unarmed-strike");
  assert.equal(options[0].weaponId, null);
  assert.equal(options[0].unarmed, true);
  assert.equal(options[0].supply.ok, true);
  assert.equal(options[0].weapon.damageType, "Bludgeoning");
  assert.equal(UNARMED_STRIKE.normalRange, 5);
});

test("an armed creature never sees the unarmed fallback", () => {
  const armed = token("armed", 1, 1, {
    inventory: [item("longsword")],
    loadout: { mainHand: "longsword", offHand: null },
  });
  const options = attackOptionsForToken(armed);
  assert.equal(options.length, 1);
  assert.equal(options[0].weapon.id, "longsword");
  assert.equal(options[0].unarmed, false);
});

test("a creature with authored attacks keeps them instead of punching", () => {
  const monster = token("monster", 1, 1, {
    attacks: [{ id: "bite", name: "Bite", toHit: 4, damageDice: "1d6+2", damageType: "Piercing", rangeKind: "melee", reachFeet: 5 }],
  });
  const options = attackOptionsForToken(monster);
  assert.equal(options.length, 1);
  assert.equal(options[0].authored, true);
  assert.equal(options[0].attackId, "bite");
});

test("an unarmed strike deals one plus the Strength modifier and cannot critical for extra dice", () => {
  const attacker = token("attacker", 1, 1, { strength: 16 });
  const target = token("target", 2, 1, { ac: 5, hp: 30, maxHp: 30 });
  const scene = battleScene({ tokens: [attacker, target] });
  const result = performWeaponAttack(scene, {
    weaponId: null,
    hand: "mainHand",
    targetId: "target",
    viewport: VIEWPORT,
  }, { random: sequence(0.5) });
  assert.equal(result.ok, true);
  assert.equal(result.outcome.hit, true);
  assert.equal(result.outcome.weaponName, "Unarmed Strike");
  // Fixed 1 plus a +3 Strength modifier, and no damage dice to double.
  assert.equal(result.outcome.damage.total, 4);
  assert.equal(result.outcome.damage.rolls.length, 0);
});

/* --------------------------------------------------------------- loading */

test("a Loading weapon spends the whole Action on its first shot", () => {
  const attacker = token("attacker", 1, 1, {
    dexterity: 16,
    attacksPerAction: 3,
    inventory: [item("crossbow-heavy"), item("crossbow-bolt", 20)],
    loadout: { mainHand: "crossbow-heavy", offHand: null },
  });
  const target = token("target", 3, 1, { ac: 5, hp: 60, maxHp: 60 });
  const scene = battleScene({ tokens: [attacker, target] });
  const result = performWeaponAttack(scene, {
    weaponId: "crossbow-heavy",
    hand: "mainHand",
    targetId: "target",
    viewport: VIEWPORT,
  }, { random: sequence(0.5) });
  assert.equal(result.ok, true);
  assert.equal(result.outcome.attackAllowance, 3);
  assert.equal(result.value.encounter.resources.attacker.actionSpent, true);
});

test("a non-Loading weapon keeps the Action open across a Multiattack allowance", () => {
  const attacker = token("attacker", 1, 1, {
    dexterity: 16,
    attacksPerAction: 3,
    inventory: [item("shortbow"), item("arrow", 20)],
    loadout: { mainHand: "shortbow", offHand: null },
  });
  const target = token("target", 3, 1, { ac: 5, hp: 60, maxHp: 60 });
  const scene = battleScene({ tokens: [attacker, target] });
  const result = performWeaponAttack(scene, {
    weaponId: "shortbow",
    hand: "mainHand",
    targetId: "target",
    viewport: VIEWPORT,
  }, { random: sequence(0.5) });
  assert.equal(result.ok, true);
  assert.equal(result.value.encounter.resources.attacker.actionSpent, false);
  assert.equal(result.value.encounter.resources.attacker.attacksMade, 1);
});

/* ------------------------------------------------------------ experience */

test("experience thresholds map to levels at every boundary", () => {
  assert.equal(XP_THRESHOLDS.length, 20);
  assert.equal(MAX_LEVEL, 20);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(899), 2);
  assert.equal(levelForXp(900), 3);
  assert.equal(levelForXp(354999), 19);
  assert.equal(levelForXp(355000), 20);
  assert.equal(levelForXp(9999999), 20);
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    assert.equal(levelForXp(xpForLevel(level)), level);
  }
});

test("experience remaining counts down to the next level and stops at twenty", () => {
  assert.equal(xpToNextLevel(0), 300);
  assert.equal(xpToNextLevel(299), 1);
  assert.equal(xpToNextLevel(300), 600);
  assert.equal(xpToNextLevel(355000), null);
});

test("a Hero record defaults experience to zero and never accepts a negative", () => {
  const fresh = createHeroRecord({ name: "Kaelen" }, { id: "hero-1", now: NOW });
  assert.equal(fresh.xp, 0);
  const negative = createHeroRecord({ name: "Kaelen", xp: -500 }, { id: "hero-1", now: NOW });
  assert.equal(negative.xp, 0);
  const kept = createHeroRecord({ name: "Kaelen", xp: 1234.7 }, { id: "hero-1", now: NOW });
  assert.equal(kept.xp, 1234);
});

test("a Battle award splits defeated experience evenly among surviving Heroes", () => {
  const heroOne = token("hero-token-1", 1, 1, { heroId: "hero-1", hp: 12, maxHp: 12 });
  const heroTwo = token("hero-token-2", 1, 2, { heroId: "hero-2", hp: 4, maxHp: 12 });
  const slain = token("goblin", 2, 1, { xp: 50, hp: 0, maxHp: 7 });
  const alsoSlain = token("orc", 2, 2, { xp: 100, hp: 0, maxHp: 15 });
  const award = encounterExperienceAward([heroOne, heroTwo, slain, alsoSlain], { xpAwarded: false });
  assert.equal(award.total, 150);
  assert.equal(award.perHero, 75);
  assert.equal(award.defeatedCount, 2);
  assert.equal(award.recipients.length, 2);
  assert.deepEqual(award.recipients.map((entry) => entry.heroId).sort(), ["hero-1", "hero-2"]);
  assert.equal(award.alreadyAwarded, false);
});

test("a fallen Hero is neither treasure nor a recipient", () => {
  const standing = token("hero-token-1", 1, 1, { heroId: "hero-1", hp: 12, maxHp: 12 });
  const fallen = token("hero-token-2", 1, 2, { heroId: "hero-2", xp: 500, hp: 0, maxHp: 12 });
  const slain = token("goblin", 2, 1, { xp: 50, hp: 0, maxHp: 7 });
  const award = encounterExperienceAward([standing, fallen, slain], { xpAwarded: false });
  assert.equal(award.total, 50);
  assert.equal(award.recipients.length, 1);
  assert.equal(award.recipients[0].heroId, "hero-1");
  assert.equal(award.recipients[0].share, 50);
});

test("an already-awarded encounter reports itself so a second press pays nothing", () => {
  const hero = token("hero-token-1", 1, 1, { heroId: "hero-1", hp: 12, maxHp: 12 });
  const slain = token("goblin", 2, 1, { xp: 50, hp: 0, maxHp: 7 });
  const award = encounterExperienceAward([hero, slain], { xpAwarded: true });
  assert.equal(award.alreadyAwarded, true);
});

test("a monster token carries the experience it is worth and the encounter tracks the payout", () => {
  const scene = battleScene({
    tokens: [token("hero", 1, 1, { heroId: "hero-1" }), token("goblin", 2, 1, { xp: 50 })],
  });
  assert.equal(scene.encounter.xpAwarded, false);
  assert.equal(scene.tokens.find((entry) => entry.id === "goblin").xp, 50);
});

/* ---------------------------------------------- healing and temporary HP */

test("healing restores hit points and is capped at the maximum", () => {
  const hurt = token("hurt", 1, 1, { hp: 4, maxHp: 20 });
  const other = token("other", 2, 1, { hp: 10, maxHp: 10 });
  const scene = battleScene({ tokens: [hurt, other] });
  const healed = healToken(scene, "hurt", 5);
  assert.equal(healed.ok, true);
  assert.equal(healed.outcome.nextHp, 9);
  assert.equal(healed.outcome.restored, 5);
  const overheal = healToken(scene, "hurt", 999);
  assert.equal(overheal.outcome.nextHp, 20);
  assert.equal(overheal.outcome.restored, 16);
  assert.match(overheal.value.encounter.log.at(-1), /regains 16 hit points/);
});

test("healing refuses a defeated token, a token at full health, and a zero amount", () => {
  const down = token("down", 1, 1, { hp: 0, maxHp: 20 });
  const full = token("full", 2, 1, { hp: 20, maxHp: 20 });
  const scene = battleScene({ tokens: [full, down] });
  assert.equal(healToken(scene, "down", 5).code, "HEAL_TARGET_DEFEATED");
  assert.equal(healToken(scene, "full", 5).code, "HEAL_TARGET_UNHURT");
  assert.equal(healToken(scene, "full", 0).code, "HEAL_AMOUNT_REQUIRED");
});

test("temporary hit points are a separate pool that absorbs damage first", () => {
  const buffered = { hp: 20, maxHp: 20, tempHp: 8 };
  assert.deepEqual(applyDamageToPools(buffered, 5), { absorbed: 5, nextTempHp: 3, nextHp: 20 });
  assert.deepEqual(applyDamageToPools(buffered, 8), { absorbed: 8, nextTempHp: 0, nextHp: 20 });
  assert.deepEqual(applyDamageToPools(buffered, 12), { absorbed: 8, nextTempHp: 0, nextHp: 16 });
  assert.deepEqual(applyDamageToPools({ hp: 3, maxHp: 20, tempHp: 0 }, 99), { absorbed: 0, nextTempHp: 0, nextHp: 0 });
});

test("temporary hit points do not stack and only a larger grant replaces them", () => {
  const guarded = token("guarded", 1, 1, { hp: 20, maxHp: 20, tempHp: 8 });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [guarded, other] });
  assert.equal(setTemporaryHp(scene, "guarded", 5).code, "TEMP_HP_NOT_HIGHER");
  assert.equal(setTemporaryHp(scene, "guarded", 8).code, "TEMP_HP_NOT_HIGHER");
  const bigger = setTemporaryHp(scene, "guarded", 12);
  assert.equal(bigger.ok, true);
  assert.equal(bigger.outcome.nextTempHp, 12);
  const cleared = setTemporaryHp(scene, "guarded", 0);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.outcome.nextTempHp, 0);
  assert.match(cleared.value.encounter.log.at(-1), /loses their temporary hit points/);
});

test("manual damage spends temporary hit points first and reports what was absorbed", () => {
  const guarded = token("guarded", 1, 1, { hp: 20, maxHp: 20, tempHp: 6 });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [guarded, other] });
  const hurt = damageToken(scene, "guarded", 10);
  assert.equal(hurt.ok, true);
  assert.equal(hurt.outcome.absorbed, 6);
  assert.equal(hurt.outcome.nextTempHp, 0);
  assert.equal(hurt.outcome.nextHp, 16);
  assert.match(hurt.value.encounter.log.at(-1), /absorbed by temporary hit points/);
});

test("manual damage that fells the last standing enemy completes the Battle", () => {
  const winner = token("winner", 1, 1, { heroId: "hero-1", hp: 20, maxHp: 20 });
  const doomed = token("doomed", 2, 1, { hp: 3, maxHp: 10 });
  const scene = battleScene({ tokens: [winner, doomed] });
  const killed = damageToken(scene, "doomed", 3);
  assert.equal(killed.ok, true);
  assert.equal(killed.outcome.completed, true);
  assert.equal(killed.outcome.winnerTokenId, "winner");
  assert.equal(killed.value.encounter.status, "complete");
});

test("an attack spends the target's temporary hit points before their own", () => {
  const attacker = token("attacker", 1, 1, {
    strength: 16,
    inventory: [item("longsword")],
    loadout: { mainHand: "longsword", offHand: null },
  });
  const guarded = token("guarded", 2, 1, { ac: 5, hp: 20, maxHp: 20, tempHp: 30 });
  const scene = battleScene({ tokens: [attacker, guarded] });
  const result = performWeaponAttack(scene, {
    weaponId: "longsword",
    hand: "mainHand",
    targetId: "guarded",
    viewport: VIEWPORT,
  }, { random: sequence(0.5) });
  assert.equal(result.ok, true);
  assert.equal(result.outcome.hit, true);
  assert.equal(result.outcome.nextHp, 20);
  assert.equal(result.outcome.absorbedByTempHp, result.outcome.damage.total);
  assert.equal(result.outcome.nextTempHp, 30 - result.outcome.damage.total);
});

test("hit point commands refuse to run outside an active Battle", () => {
  const scene = battleScene({
    tokens: [token("a", 1, 1, { hp: 5, maxHp: 20 }), token("b", 2, 1)],
    status: "complete",
  });
  assert.equal(healToken(scene, "a", 5).code, "ACTIVE_BATTLE_REQUIRED");
  assert.equal(damageToken(scene, "a", 5).code, "ACTIVE_BATTLE_REQUIRED");
  assert.equal(setTemporaryHp(scene, "a", 5).code, "ACTIVE_BATTLE_REQUIRED");
});

/* ----------------------------------------------------------- skill state */

test("a token carries skill proficiencies and prices them with the proficiency bonus", () => {
  const trained = token("trained", 1, 1, {
    strength: 16,
    level: 5,
    skillProficiencies: ["athletics", "stealth"],
  });
  assert.deepEqual(trained.skillProficiencies, ["athletics", "stealth"]);
  // +3 Strength and a +3 proficiency bonus at level five.
  assert.equal(tokenSkillModifier(trained, "athletics"), 6);
  // Untrained Strength skill: the ability alone.
  assert.equal(tokenSkillModifier(trained, "survival"), 0);
  assert.equal(tokenSkillModifier(trained, "not-a-skill"), 0);
  const profile = tokenSkillProfile(trained);
  assert.equal(profile.length, 18);
  assert.equal(profile.find((entry) => entry.id === "athletics").proficient, true);
  assert.equal(profile.find((entry) => entry.id === "arcana").proficient, false);
});

test("unknown skills are discarded when a token normalizes", () => {
  const noisy = token("noisy", 1, 1, { skillProficiencies: ["athletics", "wrestling", "athletics"] });
  assert.deepEqual(noisy.skillProficiencies, ["athletics"]);
});

test("a Hero token snapshot carries the Hero's skill proficiencies onto the board", () => {
  const hero = createHeroRecord({
    name: "Kaelen",
    classId: "fighter",
    skillProficiencies: ["athletics", "perception"],
  }, { id: "hero-1", now: NOW });
  const snapshot = createHeroTokenSnapshot(hero, { id: "hero-token-1", position: at(1, 1) });
  assert.deepEqual(snapshot.skillProficiencies, ["athletics", "perception"]);
});

/* ---------------------------------------------------------- saving throws */

test("a saving throw uses the token's save modifier and beats its difficulty class", () => {
  const brave = token("brave", 1, 1, { dexterity: 16, level: 5, saveProficiencies: ["dex"] });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [brave, other] });
  // Natural 15, +3 Dexterity, +3 proficiency at level five.
  const rolled = performSavingThrow(scene, { tokenId: "brave", ability: "dex", dc: 15 }, { random: sequence(0.7) });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.outcome.naturalRoll, 15);
  assert.equal(rolled.outcome.modifier, 6);
  assert.equal(rolled.outcome.total, 21);
  assert.equal(rolled.outcome.succeeded, true);
  assert.equal(rolled.outcome.proficient, true);
  assert.match(rolled.value.encounter.log.at(-1), /Dexterity saving throw against DC 15 and succeeds with 21/);
});

test("a saving throw without a difficulty class decides nothing", () => {
  const someone = token("someone", 1, 1);
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [someone, other] });
  const rolled = performSavingThrow(scene, { tokenId: "someone", ability: "wis" }, { random: sequence(0.5) });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.outcome.dc, null);
  assert.equal(rolled.outcome.succeeded, null);
  assert.match(rolled.value.encounter.log.at(-1), /scores 11\./);
});

test("advantage keeps the high die and disadvantage keeps the low die, picked by index", () => {
  const someone = token("someone", 1, 1);
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [someone, other] });
  const advantage = performSavingThrow(scene, {
    tokenId: "someone", ability: "con", dc: 10, mode: CHECK_MODE_ADVANTAGE,
  }, { random: sequence(0.1, 0.8) });
  assert.equal(advantage.outcome.mode, "advantage");
  assert.equal(advantage.outcome.rolls.length, 2);
  assert.equal(advantage.outcome.selectedIndex, 1);
  const disadvantage = performSavingThrow(scene, {
    tokenId: "someone", ability: "con", dc: 10, mode: CHECK_MODE_DISADVANTAGE,
  }, { random: sequence(0.8, 0.1) });
  assert.equal(disadvantage.outcome.mode, "disadvantage");
  assert.equal(disadvantage.outcome.selectedIndex, 1);
});

test("Paralyzed, Petrified, Stunned and Unconscious fail Strength and Dexterity saves without a roll", () => {
  for (const conditionId of ["paralyzed", "petrified", "stunned", "unconscious"]) {
    const helpless = token("helpless", 1, 1, { conditions: [conditionId] });
    const other = token("other", 2, 1);
    const scene = battleScene({ tokens: [helpless, other] });
    for (const ability of ["str", "dex"]) {
      const rolled = performSavingThrow(scene, { tokenId: "helpless", ability, dc: 5 }, { random: sequence(0.999) });
      assert.equal(rolled.outcome.autoFailed, true, `${conditionId} ${ability}`);
      assert.equal(rolled.outcome.succeeded, false);
      assert.equal(rolled.outcome.rolls.length, 0);
      assert.equal(rolled.outcome.naturalRoll, null);
      assert.equal(rolled.outcome.total, null);
      assert.match(rolled.value.encounter.log.at(-1), /fails automatically/);
    }
    // Everything else still rolls normally.
    const wisdom = performSavingThrow(scene, { tokenId: "helpless", ability: "wis", dc: 5 }, { random: sequence(0.999) });
    assert.equal(wisdom.outcome.autoFailed, false);
    assert.equal(wisdom.outcome.naturalRoll, 20);
  }
});

test("Restrained gives disadvantage on Dexterity saves and nothing else", () => {
  const bound = token("bound", 1, 1, { conditions: ["restrained"] });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [bound, other] });
  const dexterity = performSavingThrow(scene, { tokenId: "bound", ability: "dex", dc: 10 }, { random: sequence(0.8, 0.1) });
  assert.equal(dexterity.outcome.mode, "disadvantage");
  assert.equal(dexterity.outcome.rolls.length, 2);
  const strength = performSavingThrow(scene, { tokenId: "bound", ability: "str", dc: 10 }, { random: sequence(0.8) });
  assert.equal(strength.outcome.mode, "normal");
  assert.equal(strength.outcome.rolls.length, 1);
});

test("a requested advantage and a Restrained disadvantage cancel to a normal roll", () => {
  const bound = token("bound", 1, 1, { conditions: ["restrained"] });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [bound, other] });
  const rolled = performSavingThrow(scene, {
    tokenId: "bound", ability: "dex", dc: 10, mode: CHECK_MODE_ADVANTAGE,
  }, { random: sequence(0.5) });
  assert.equal(rolled.outcome.mode, "normal");
  assert.equal(rolled.outcome.rolls.length, 1);
  assert.equal(rolled.outcome.sources.length, 2);
});

test("the condition readers agree with the condition catalog", () => {
  assert.equal(CONDITIONS.length, 15);
  assert.equal(conditionAutoFailsSave(["paralyzed"], "str"), true);
  assert.equal(conditionAutoFailsSave(["paralyzed"], "wis"), false);
  assert.equal(conditionAutoFailsSave(["poisoned"], "str"), false);
  assert.deepEqual(conditionSaveModes(["restrained"], "dex").map((entry) => entry.mode), ["disadvantage"]);
  assert.deepEqual(conditionSaveModes(["restrained"], "str"), []);
  assert.deepEqual(conditionSaveModes(["blinded"], "dex"), []);
});

test("a saving throw refuses an unknown ability and a missing token", () => {
  const someone = token("someone", 1, 1);
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [someone, other] });
  assert.equal(performSavingThrow(scene, { tokenId: "someone", ability: "luck" }).code, "UNKNOWN_SAVE_ABILITY");
  assert.equal(performSavingThrow(scene, { tokenId: "ghost", ability: "str" }).code, "CHECK_TOKEN_MISSING");
});

/* ------------------------------------------------ ability and skill checks */

test("a skill check applies proficiency only where the token is trained", () => {
  const scout = token("scout", 1, 1, { dexterity: 16, level: 5, skillProficiencies: ["stealth"] });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [scout, other] });
  const stealth = performAbilityCheck(scene, { tokenId: "scout", skillId: "stealth", dc: 15 }, { random: sequence(0.5) });
  assert.equal(stealth.outcome.kind, "skill");
  assert.equal(stealth.outcome.proficient, true);
  assert.equal(stealth.outcome.modifier, 6);
  assert.equal(stealth.outcome.total, 17);
  assert.equal(stealth.outcome.succeeded, true);
  const acrobatics = performAbilityCheck(scene, { tokenId: "scout", skillId: "acrobatics", dc: 15 }, { random: sequence(0.5) });
  assert.equal(acrobatics.outcome.proficient, false);
  assert.equal(acrobatics.outcome.modifier, 3);
  assert.equal(acrobatics.outcome.total, 14);
  assert.equal(acrobatics.outcome.succeeded, false);
});

test("a bare ability check is the raw ability modifier with no proficiency", () => {
  const strong = token("strong", 1, 1, { strength: 18, level: 20, skillProficiencies: ["athletics"] });
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [strong, other] });
  const check = performAbilityCheck(scene, { tokenId: "strong", ability: "str", dc: 10 }, { random: sequence(0.5) });
  assert.equal(check.outcome.kind, "ability");
  assert.equal(check.outcome.modifier, 4);
  assert.equal(check.outcome.proficient, false);
  assert.match(check.value.encounter.log.at(-1), /Strength check against DC 10/);
});

test("an ability check refuses an unknown skill and an unknown ability", () => {
  const someone = token("someone", 1, 1);
  const other = token("other", 2, 1);
  const scene = battleScene({ tokens: [someone, other] });
  assert.equal(performAbilityCheck(scene, { tokenId: "someone", skillId: "wrestling" }).code, "UNKNOWN_SKILL");
  assert.equal(performAbilityCheck(scene, { tokenId: "someone", ability: "luck" }).code, "UNKNOWN_CHECK_ABILITY");
});

test("checks and saves refuse to run outside an active Battle and spend no turn resource", () => {
  const someone = token("someone", 1, 1);
  const other = token("other", 2, 1);
  const finished = battleScene({ tokens: [someone, other], status: "complete" });
  assert.equal(performSavingThrow(finished, { tokenId: "someone", ability: "str" }).code, "ACTIVE_BATTLE_REQUIRED");
  assert.equal(performAbilityCheck(finished, { tokenId: "someone", ability: "str" }).code, "ACTIVE_BATTLE_REQUIRED");

  const active = battleScene({ tokens: [someone, other] });
  const rolled = performSavingThrow(active, { tokenId: "someone", ability: "str", dc: 10 }, { random: sequence(0.5) });
  assert.equal(rolled.ok, true);
  // The patch carries only the encounter, and its resources are untouched.
  assert.equal(rolled.value.tokens, undefined);
  assert.deepEqual(rolled.value.encounter.resources, active.encounter.resources);
});

test("any token can be asked to roll, not only the one whose turn it is", () => {
  const active = token("active", 1, 1);
  const bystander = token("bystander", 2, 1, { wisdom: 14 });
  const scene = battleScene({ tokens: [active, bystander] });
  const rolled = performSavingThrow(scene, { tokenId: "bystander", ability: "wis", dc: 10 }, { random: sequence(0.5) });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.outcome.tokenId, "bystander");
  assert.equal(rolled.outcome.modifier, 2);
});
