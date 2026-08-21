import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTACK_KIND_BONUS,
  ATTACK_MODE_ADVANTAGE,
  ATTACK_MODE_DISADVANTAGE,
  ATTACK_MODE_NORMAL,
  attackDistanceFeet,
  attackLineOfSight,
  attackOptionsForToken,
  attackRollSources,
  attackTargetEligibility,
  bonusAttackAvailability,
  buildAttackRangeBands,
  combineAttackModes,
  mainAttackAvailability,
  parseDamageDefinition,
  performWeaponAttack,
  rollWeaponDamage,
  toggleBattleCondition,
} from "./domain/attacks.js";
import {
  CONDITIONS,
  attackerConditionModes,
  conditionById,
  isImmobilized,
  isIncapacitated,
  normalizeConditions,
  targetAutoCritical,
  targetConditionModes,
  toggleCondition,
} from "./domain/conditions.js";
import { activeTurnContext, dashAvailability, movementAvailability, swapAvailability } from "./domain/combat.js";
import { createSceneRecord } from "./domain/records.js";
import { createManualToken, createTurnResources, createWall, setupPositionForCell } from "./domain/table.js";
import { createSceneRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-17T15:00:00.000Z";
const VIEWPORT = { width: 440, height: 440, gridSize: 44 };
const WIDE_VIEWPORT = { width: 1760, height: 440, gridSize: 44 };
const at = (column, row, viewport = VIEWPORT) => setupPositionForCell({ column, row }, viewport);
const item = (itemId, quantity = 1) => ({ itemId, quantity });
const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

const token = (id, column, row, patch = {}, viewport = VIEWPORT) => createManualToken({
  id,
  name: patch.name || id,
  position: at(column, row, viewport),
  ...patch,
});

const battleScene = ({
  tokens = [
    token("active", 1, 1, { inventory: [item("longsword")], loadout: { mainHand: "longsword", offHand: null } }),
    token("target", 2, 1, { ac: 10, hp: 20, maxHp: 20 }),
  ],
  walls = [],
  resources,
  wallsVisible = true,
} = {}) => createSceneRecord({
  id: "phase9-scene",
  name: "Attack Lab",
  kind: "battle",
  tokens,
  walls,
  wallsVisible,
  encounter: {
    version: 1,
    status: "active",
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
}, { id: "phase9-scene", now: NOW });

const applyPatch = (scene, patch) => createSceneRecord({ ...scene, ...patch }, { id: scene.id, now: NOW });

test("the complete 15-condition catalog has stable metadata", () => {
  assert.equal(CONDITIONS.length, 15);
  assert.equal(new Set(CONDITIONS.map(({ id }) => id)).size, 15);
  for (const condition of CONDITIONS) {
    assert.ok(condition.name);
    assert.ok(condition.abbreviation.length >= 3);
    assert.match(condition.color, /^#[0-9a-f]{6}$/i);
    assert.ok(condition.note);
    assert.equal(conditionById(condition.name), condition);
  }
});

test("condition normalization removes unknown values and duplicates", () => {
  assert.deepEqual(normalizeConditions(["Poisoned", "poisoned", "not-real", "Prone"]), ["poisoned", "prone"]);
  assert.deepEqual(normalizeConditions(null), []);
});

test("condition flags cover incapacitation, immobilization, and automatic melee criticals", () => {
  assert.equal(isIncapacitated(["stunned"]), true);
  assert.equal(isIncapacitated(["grappled"]), false);
  assert.equal(isImmobilized(["grappled"]), true);
  assert.equal(isImmobilized(["poisoned"]), false);
  assert.equal(targetAutoCritical(["paralyzed"], "melee"), true);
  assert.equal(targetAutoCritical(["unconscious"], "ranged"), false);
  assert.equal(targetAutoCritical(["petrified"], "melee"), false);
});

test("attacker and target condition modes retain their exact source labels", () => {
  assert.deepEqual(attackerConditionModes(["invisible", "poisoned"]).map(({ mode }) => mode), ["advantage", "disadvantage"]);
  assert.deepEqual(targetConditionModes(["prone"], "melee").map(({ mode }) => mode), ["advantage"]);
  assert.deepEqual(targetConditionModes(["prone"], "ranged").map(({ mode }) => mode), ["disadvantage"]);
});

test("manual condition toggles are reversible and validate IDs", () => {
  const added = toggleCondition(["prone"], "Poisoned");
  assert.deepEqual(added.value, ["prone", "poisoned"]);
  assert.deepEqual(toggleCondition(added.value, "poisoned").value, ["prone"]);
  assert.equal(toggleCondition([], "imaginary").code, "UNKNOWN_CONDITION");
});

test("Battle condition changes patch only the selected token and spend no resources", () => {
  const scene = battleScene();
  const changed = toggleBattleCondition(scene, "target", "restrained");
  assert.equal(changed.ok, true);
  const after = applyPatch(scene, changed.value);
  assert.deepEqual(after.tokens.find(({ id }) => id === "target").conditions, ["restrained"]);
  assert.deepEqual(after.encounter.resources, scene.encounter.resources);
  assert.equal(after.encounter.activeIndex, 0);
});

test("all 15 conditions can be toggled on and off through persisted Battle patches", () => {
  let scene = battleScene();
  for (const condition of CONDITIONS) {
    const changed = toggleBattleCondition(scene, "target", condition.id);
    assert.equal(changed.ok, true, condition.id);
    scene = applyPatch(scene, changed.value);
  }
  assert.deepEqual(scene.tokens.find(({ id }) => id === "target").conditions, CONDITIONS.map(({ id }) => id));
  for (const condition of CONDITIONS) scene = applyPatch(scene, toggleBattleCondition(scene, "target", condition.id).value);
  assert.deepEqual(scene.tokens.find(({ id }) => id === "target").conditions, []);
  assert.equal(scene.encounter.activeIndex, 0);
  assert.equal(activeTurnContext(scene).value.resources.actionSpent, false);
});

test("attack selection exposes equipped hands only", () => {
  const active = token("active", 1, 1, {
    inventory: [item("dagger", 2), item("longbow")],
    loadout: { mainHand: "dagger", offHand: "dagger" },
  });
  const options = attackOptionsForToken(active);
  assert.deepEqual(options.map(({ hand, weaponId }) => [hand, weaponId]), [["mainHand", "dagger"], ["offHand", "dagger"]]);
  assert.equal(options.some(({ weaponId }) => weaponId === "longbow"), false);
});

test("main Attack offers an unarmed strike to the empty-handed and reports spent resources honestly", () => {
  // An empty-handed creature is never stranded: it falls back to a punch
  // rather than being refused the Attack Action outright.
  const unarmed = mainAttackAvailability(battleScene({ tokens: [token("active", 1, 1), token("target", 2, 1)] }));
  assert.equal(unarmed.ok, true);
  assert.equal(unarmed.value.options.length, 1);
  assert.equal(unarmed.value.options[0].weapon.id, "unarmed-strike");
  const armed = token("active", 1, 1, { inventory: [item("club")], loadout: { mainHand: "club", offHand: null } });
  const spent = { ...createTurnResources(armed), actionSpent: true, actionType: "dash", dashed: true };
  assert.equal(mainAttackAvailability(battleScene({ tokens: [armed, token("target", 2, 1)], resources: spent })).code, "ATTACK_AFTER_DASH");
});

test("grid attack distance charges a diagonal cell as 5 feet", () => {
  assert.equal(attackDistanceFeet(at(1, 1), at(2, 2), VIEWPORT), 5);
  assert.equal(attackDistanceFeet(at(1, 1), at(4, 3), VIEWPORT), 15);
});

test("melee, Reach, ranged, long, thrown-normal, and thrown-long tiers are exact", () => {
  const target = (column) => token("target", column, 1, { hp: 20, maxHp: 20 }, WIDE_VIEWPORT);
  const make = (weaponId, targetColumn) => {
    const active = token("active", 1, 1, { inventory: [item(weaponId), ...(weaponId === "shortbow" ? [item("arrow", 20)] : [])], loadout: { mainHand: weaponId, offHand: null } }, WIDE_VIEWPORT);
    return battleScene({ tokens: [active, target(targetColumn)] });
  };
  assert.equal(attackTargetEligibility(make("longsword", 2), { weaponId: "longsword", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "melee");
  assert.equal(attackTargetEligibility(make("glaive", 3), { weaponId: "glaive", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "reach");
  assert.equal(attackTargetEligibility(make("shortbow", 9), { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "ranged-normal");
  assert.equal(attackTargetEligibility(make("shortbow", 17), { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "ranged-long");
  assert.equal(attackTargetEligibility(make("dagger", 5), { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "thrown-normal");
  assert.equal(attackTargetEligibility(make("dagger", 13), { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).value.range.tier, "thrown-long");
  assert.equal(attackTargetEligibility(make("dagger", 14), { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }).code, "ATTACK_OUT_OF_RANGE");
});

test("melee, Reach, ranged, long-range, normal-throw, and long-throw attacks all resolve", () => {
  const scenarios = [
    ["longsword", 2, "melee", "normal"],
    ["glaive", 3, "melee", "normal"],
    ["shortbow", 9, "ranged", "normal"],
    ["shortbow", 17, "ranged", "disadvantage"],
    ["dagger", 5, "thrown", "normal"],
    ["dagger", 13, "thrown", "disadvantage"],
  ];
  for (const [weaponId, targetColumn, usage, mode] of scenarios) {
    const active = token("active", 1, 1, { inventory: [item(weaponId), ...(weaponId === "shortbow" ? [item("arrow", 20)] : [])], loadout: { mainHand: weaponId, offHand: null } }, WIDE_VIEWPORT);
    const targetToken = token("target", targetColumn, 1, { ac: 1, hp: 40, maxHp: 40 }, WIDE_VIEWPORT);
    const resolved = performWeaponAttack(battleScene({ tokens: [active, targetToken] }), { weaponId, hand: "mainHand", targetId: "target", viewport: WIDE_VIEWPORT }, { random: sequence(0.5, 0.5, 0.5) });
    assert.equal(resolved.ok, true, weaponId);
    assert.equal(resolved.outcome.range.usage, usage, weaponId);
    assert.equal(resolved.outcome.mode, mode, weaponId);
    assert.equal(resolved.outcome.hit, true, weaponId);
    assert.equal(resolved.value.encounter.activeIndex, 0, weaponId);
  }
});

test("full walls block ranged and thrown attacks while half-walls impose cover", () => {
  const active = token("active", 1, 1, { inventory: [item("shortbow"), item("arrow", 20)], loadout: { mainHand: "shortbow", offHand: null } });
  const targetToken = token("target", 4, 1);
  const wallPoints = [{ xPercent: 30, yPercent: 0 }, { xPercent: 30, yPercent: 30 }];
  const fullScene = battleScene({ tokens: [active, targetToken], walls: [createWall({ id: "full", type: "full", points: wallPoints })], wallsVisible: false });
  const halfScene = battleScene({ tokens: [active, targetToken], walls: [createWall({ id: "half", type: "half", points: wallPoints })], wallsVisible: false });
  assert.equal(attackTargetEligibility(fullScene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }).code, "ATTACK_LINE_BLOCKED");
  assert.equal(attackTargetEligibility(halfScene, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }).value.lineOfSight.state, "half-cover");
  assert.equal(attackLineOfSight(fullScene, active, targetToken, "melee").state, "clear");
});

test("full-wall refusal spends nothing while a half-wall attack resolves at disadvantage", () => {
  const active = token("active", 1, 1, { inventory: [item("shortbow"), item("arrow", 20)], loadout: { mainHand: "shortbow", offHand: null } });
  const targetToken = token("target", 4, 1, { ac: 1, hp: 30, maxHp: 30 });
  const points = [{ xPercent: 30, yPercent: 0 }, { xPercent: 30, yPercent: 30 }];
  const full = battleScene({ tokens: [active, targetToken], walls: [createWall({ id: "full", type: "full", points })] });
  const before = structuredClone(full);
  assert.equal(performWeaponAttack(full, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }).code, "ATTACK_LINE_BLOCKED");
  assert.deepEqual(full, before);
  assert.equal(activeTurnContext(full).value.resources.actionSpent, false);

  const half = battleScene({ tokens: [active, targetToken], walls: [createWall({ id: "half", type: "half", points })] });
  const resolved = performWeaponAttack(half, { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.8, 0.5, 0.4) });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.outcome.mode, "disadvantage");
  assert.ok(resolved.outcome.sources.some(({ code }) => code === "half-wall"));
});

test("blocked and out-of-range targeting do not mutate or spend Action", () => {
  const active = token("active", 1, 1, { inventory: [item("club")], loadout: { mainHand: "club", offHand: null } });
  const scene = battleScene({ tokens: [active, token("target", 5, 1)] });
  const before = structuredClone(scene);
  assert.equal(performWeaponAttack(scene, { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }).code, "ATTACK_OUT_OF_RANGE");
  assert.deepEqual(scene, before);
  assert.equal(activeTurnContext(scene).value.resources.actionSpent, false);
});

test("roll modes use one die, keep high, keep low, and cancel opposing sources", () => {
  assert.equal(combineAttackModes([]), ATTACK_MODE_NORMAL);
  assert.equal(combineAttackModes([{ mode: "advantage" }]), ATTACK_MODE_ADVANTAGE);
  assert.equal(combineAttackModes([{ mode: "disadvantage" }]), ATTACK_MODE_DISADVANTAGE);
  assert.equal(combineAttackModes([{ mode: "advantage" }, { mode: "disadvantage" }]), ATTACK_MODE_NORMAL);
});

test("long range, Heavy size, Lance proximity, Swap, and half-wall are disadvantage sources", () => {
  const base = { attacker: { size: "small", conditions: [] }, target: { conditions: [] }, resources: { swapped: true }, kind: "action" };
  const sources = attackRollSources({
    ...base,
    weapon: { id: "lance", propertyIds: ["heavy"] },
    range: { tier: "ranged-long", distanceFeet: 5, disadvantage: true, usage: "ranged" },
    lineOfSight: { state: "half-cover" },
  });
  assert.deepEqual(sources.map(({ code }) => code), ["ranged-long", "small-heavy", "lance-close", "attack-after-swap", "half-wall"]);
});

test("normal Attack uses ability, proficiency, and magic bonuses and preserves movement", () => {
  const active = token("active", 1, 1, {
    strength: 16,
    dexterity: 10,
    level: 5,
    inventory: [item("longsword")],
    loadout: { mainHand: "longsword", offHand: null },
    enchantments: { longsword: 2 },
  });
  const resources = { ...createTurnResources(active), movementSpent: 10 };
  const scene = battleScene({ tokens: [active, token("target", 2, 1, { ac: 10, hp: 30, maxHp: 30 })], resources });
  const attack = performWeaponAttack(scene, { weaponId: "longsword", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.4) });
  assert.equal(attack.ok, true);
  assert.equal(attack.outcome.ability.modifier, 3);
  assert.equal(attack.outcome.proficiency, 3);
  assert.equal(attack.outcome.magicAttackBonus, 2);
  assert.equal(attack.outcome.attackBonus, 8);
  assert.equal(attack.outcome.hit, true);
  assert.equal(attack.outcome.damage.modifier, 5);
  const after = applyPatch(scene, attack.value);
  const next = activeTurnContext(after).value.resources;
  assert.equal(next.movementSpent, 10);
  assert.equal(next.actionSpent, true);
  assert.equal(next.actionType, "attack");
  assert.equal(after.encounter.activeIndex, 0);
  assert.equal(movementAvailability(after, "active").ok, true);
  assert.equal(dashAvailability(after).ok, false);
  assert.equal(swapAvailability(after).ok, false);
});

test("Finesse uses the better ability and ranged attacks use Dexterity", () => {
  const finesse = token("active", 1, 1, { strength: 8, dexterity: 18, inventory: [item("rapier")], loadout: { mainHand: "rapier", offHand: null } });
  const ranged = token("active", 1, 1, { strength: 18, dexterity: 12, inventory: [item("shortbow"), item("arrow", 20)], loadout: { mainHand: "shortbow", offHand: null } });
  const targetToken = token("target", 2, 1, { ac: 1, hp: 20, maxHp: 20 });
  assert.equal(performWeaponAttack(battleScene({ tokens: [finesse, targetToken] }), { weaponId: "rapier", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0) }).outcome.ability.modifier, 4);
  assert.equal(performWeaponAttack(battleScene({ tokens: [ranged, targetToken] }), { weaponId: "shortbow", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0) }).outcome.ability.modifier, 1);
});

test("Natural 1 always misses and Natural 20 always hits and doubles dice only", () => {
  const active = token("active", 1, 1, { strength: 16, inventory: [item("longsword")], loadout: { mainHand: "longsword", offHand: null }, enchantments: { longsword: 2 } });
  const impossible = token("target", 2, 1, { ac: 99, hp: 50, maxHp: 50 });
  const naturalOne = performWeaponAttack(battleScene({ tokens: [active, { ...impossible, ac: 0 }] }), { weaponId: "longsword", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0) });
  assert.equal(naturalOne.outcome.naturalRoll, 1);
  assert.equal(naturalOne.outcome.hit, false);
  const naturalTwenty = performWeaponAttack(battleScene({ tokens: [active, impossible] }), { weaponId: "longsword", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.999, 0.4, 0.4) });
  assert.equal(naturalTwenty.outcome.naturalRoll, 20);
  assert.equal(naturalTwenty.outcome.hit, true);
  assert.equal(naturalTwenty.outcome.critical, true);
  assert.equal(naturalTwenty.outcome.damage.rolls.length, 2);
  assert.equal(naturalTwenty.outcome.damage.modifier, 5);
});

test("fixed damage stays fixed on a critical and final damage cannot be negative", () => {
  assert.deepEqual(parseDamageDefinition("1"), { kind: "fixed", fixed: 1, count: 0, sides: 0, flat: 0 });
  assert.deepEqual(parseDamageDefinition("2d6"), { kind: "dice", fixed: 0, count: 2, sides: 6, flat: 0 });
  assert.equal(rollWeaponDamage({ definition: "1", critical: true, ability: -5 }).total, 0);
  assert.equal(rollWeaponDamage({ definition: "1", critical: true, ability: 3 }).total, 4);
});

test("a stat block damage definition carries its modifier without doubling it on a critical", () => {
  assert.deepEqual(parseDamageDefinition("1d6+2"), { kind: "dice", fixed: 0, count: 1, sides: 6, flat: 2 });
  assert.deepEqual(parseDamageDefinition("2d8-1"), { kind: "dice", fixed: 0, count: 2, sides: 8, flat: -1 });
  // Two d6 rolled at 4 apiece, plus the flat 2 counted exactly once.
  const critical = rollWeaponDamage({ definition: "1d6+2", critical: true, random: sequence(0.5, 0.5) });
  assert.deepEqual(critical.rolls, [4, 4]);
  assert.equal(critical.total, 10);
});

test("advantage keeps the high die, disadvantage keeps the low die, and damage remains normal", () => {
  const active = token("active", 1, 1, { inventory: [item("club")], loadout: { mainHand: "club", offHand: null }, conditions: ["invisible"] });
  const targetToken = token("target", 2, 1, { ac: 12, hp: 20, maxHp: 20 });
  const advantage = performWeaponAttack(battleScene({ tokens: [active, targetToken] }), { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.1, 0.8, 0.4) });
  assert.equal(advantage.outcome.mode, "advantage");
  assert.equal(advantage.outcome.selectedIndex, 1);
  assert.equal(advantage.outcome.damage.rolls.length, 1);
  const poisoned = { ...active, conditions: ["poisoned"] };
  const disadvantage = performWeaponAttack(battleScene({ tokens: [poisoned, targetToken] }), { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.8, 0.1) });
  assert.equal(disadvantage.outcome.mode, "disadvantage");
  assert.equal(disadvantage.outcome.selectedIndex, 1);
});

test("opposing condition sources cancel to one normal d20", () => {
  const active = token("active", 1, 1, { inventory: [item("club")], loadout: { mainHand: "club", offHand: null }, conditions: ["invisible", "poisoned"] });
  const attack = performWeaponAttack(battleScene({ tokens: [active, token("target", 2, 1)] }), { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.3) });
  assert.equal(attack.outcome.mode, "normal");
  assert.equal(attack.outcome.rolls.length, 1);
  assert.ok(attack.outcome.sources.some(({ mode }) => mode === "advantage"));
  assert.ok(attack.outcome.sources.some(({ mode }) => mode === "disadvantage"));
});

test("Paralyzed and Unconscious targets produce melee automatic criticals only", () => {
  const active = token("active", 1, 1, { inventory: [item("club")], loadout: { mainHand: "club", offHand: null } });
  for (const condition of ["paralyzed", "unconscious"]) {
    const targetToken = token("target", 2, 1, { ac: 1, hp: 30, maxHp: 30, conditions: [condition] });
    const attack = performWeaponAttack(battleScene({ tokens: [active, targetToken] }), { weaponId: "club", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.5, 0.2, 0.2) });
    assert.equal(attack.outcome.autoCritical, true);
    assert.equal(attack.outcome.critical, true);
  }
});

test("a legal dual-wield main Attack unlocks only the other hand", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" } });
  const scene = battleScene({ tokens: [active, token("target", 2, 1, { ac: 1, hp: 40, maxHp: 40 })] });
  const attack = performWeaponAttack(scene, { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.5) });
  const after = applyPatch(scene, attack.value);
  const resources = activeTurnContext(after).value.resources;
  assert.equal(resources.offHandAttackAvailable, true);
  assert.equal(resources.offHandWeaponId, "dagger");
  assert.equal(resources.offHandAttackHand, "offHand");
  assert.equal(bonusAttackAvailability(after).ok, true);
});

test("off-hand Bonus attack omits a positive ability modifier, retains a negative one, and never ends turn", () => {
  const run = (strength) => {
    const active = token("active", 1, 1, { strength, dexterity: strength, inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" } });
    const targetToken = token("target", 2, 1, { ac: 1, hp: 40, maxHp: 40 });
    const scene = battleScene({ tokens: [active, targetToken] });
    const main = applyPatch(scene, performWeaponAttack(scene, { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0) }).value);
    return performWeaponAttack(main, { kind: ATTACK_KIND_BONUS, weaponId: "dagger", hand: "offHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.3) });
  };
  const positive = run(16);
  assert.equal(positive.outcome.damage.abilityModifier, 0);
  assert.equal(positive.value.encounter.activeIndex, 0);
  assert.equal(positive.value.encounter.resources.active.bonusActionSpent, true);
  const negative = run(8);
  assert.equal(negative.outcome.damage.abilityModifier, -1);
});

test("Attack after Swap has disadvantage, locks movement, and never unlocks off-hand", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" } });
  const resources = { ...createTurnResources(active), swapped: true, swapChoice: null };
  const scene = battleScene({ tokens: [active, token("target", 2, 1, { ac: 1, hp: 30, maxHp: 30 })], resources });
  const attack = performWeaponAttack(scene, { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.4, 0.8, 0.5) });
  assert.equal(attack.outcome.mode, "disadvantage");
  const after = applyPatch(scene, attack.value);
  const next = activeTurnContext(after).value.resources;
  assert.equal(next.swapChoice, "attack");
  assert.equal(next.offHandAttackAvailable, false);
  assert.equal(movementAvailability(after, "active").code, "SWAP_ATTACK_LOCKS_MOVEMENT");
});

test("the bounded range model returns one path per tier rather than per-cell UI nodes", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger")], loadout: { mainHand: "dagger", offHand: null } });
  const range = buildAttackRangeBands(battleScene({ tokens: [active, token("target", 8, 8)] }), { weaponId: "dagger", hand: "mainHand", viewport: VIEWPORT });
  assert.equal(range.ok, true);
  assert.deepEqual(range.value.bands.map(({ id }) => id), ["thrown-long", "thrown-normal", "melee"]);
  assert.equal(range.value.bands.every(({ path, cellCount }) => path.startsWith("M ") && cellCount > 0), true);
  assert.equal("cells" in range.value.bands[0], false);
});

test("incapacitating conditions disable Action and Bonus attacks", () => {
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" }, conditions: ["stunned"] });
  const resources = { ...createTurnResources(active), actionSpent: true, actionType: "attack", offHandAttackAvailable: true, offHandWeaponId: "dagger", offHandAttackHand: "offHand" };
  const scene = battleScene({ tokens: [active, token("target", 2, 1)], resources });
  assert.equal(mainAttackAvailability(battleScene({ tokens: [active, token("target", 2, 1)] })).code, "ATTACK_INCAPACITATED");
  assert.equal(bonusAttackAvailability(scene).code, "BONUS_ATTACK_INCAPACITATED");
});

test("resolved attacks and unlocked Bonus state survive repository reload", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), { idFactory: () => "phase9-persisted", clock: () => NOW });
  const active = token("active", 1, 1, { inventory: [item("dagger", 2)], loadout: { mainHand: "dagger", offHand: "dagger" } });
  const created = repository.create(battleScene({ tokens: [active, token("target", 2, 1, { ac: 1, hp: 30, maxHp: 30 })] })).value;
  const attack = performWeaponAttack(created, { weaponId: "dagger", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.5) });
  assert.equal(repository.update(created.id, attack.value).ok, true);
  const reloaded = repository.get(created.id).value;
  assert.ok(reloaded.tokens.find(({ id }) => id === "target").hp < 30);
  assert.equal(activeTurnContext(reloaded).value.resources.actionSpent, true);
  assert.equal(activeTurnContext(reloaded).value.resources.offHandAttackAvailable, true);
});

test("a failed attack write preserves the entire last valid Battle", () => {
  const storage = createMemoryStorage();
  const repository = createSceneRepository(createStateRepository(storage, { clock: () => NOW }), { idFactory: () => "phase9-failure", clock: () => NOW });
  const created = repository.create(battleScene()).value;
  const attack = performWeaponAttack(created, { weaponId: "longsword", hand: "mainHand", targetId: "target", viewport: VIEWPORT }, { random: sequence(0.5, 0.5) });
  storage.setFailureMode("write");
  assert.equal(repository.update(created.id, attack.value).ok, false);
  storage.setFailureMode(null);
  assert.deepEqual(repository.get(created.id).value, created);
});
