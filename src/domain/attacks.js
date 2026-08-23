import { ITEM_BY_ID } from "./catalog.js";
import {
  attackerConditionModes,
  isIncapacitated,
  targetAutoCritical,
  targetConditionModes,
  changeCondition,
} from "./conditions.js";
import { applyDamageDefense, damageDefenseText } from "./damageTypes.js";
import { abilityModifier, proficiencyBonus } from "./heroes.js";
import { effectiveDamageDice, equippedWeapons, weaponMagicBonuses } from "./items.js";
import {
  applyAttackSupplyEffects,
  attackSupplyAvailability,
  completeEncounterIfNeeded,
} from "./encounter.js";
import { activeTurnContext, attackActionAvailability, segmentsIntersect } from "./combat.js";
import { damageStateText, resolveIncomingDamage } from "./vitality.js";
import {
  appendEncounterLog,
  createTurnResources,
  normalizeTableTokens,
  normalizeWalls,
  setupCellForPosition,
  setupGridMetrics,
  setupPositionForCell,
  updateToken,
} from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });
const hasProperty = (weapon, property) => weapon?.propertyIds?.includes(String(property).toLowerCase());

export const ATTACK_KIND_ACTION = "action";
export const ATTACK_KIND_BONUS = "bonus";
export const ATTACK_KIND_REACTION = "reaction";
export const ATTACK_MODE_NORMAL = "normal";
export const ATTACK_MODE_ADVANTAGE = "advantage";
export const ATTACK_MODE_DISADVANTAGE = "disadvantage";

export const attackDistanceFeet = (from, to, viewport) => {
  const start = setupCellForPosition(from, viewport);
  const end = setupCellForPosition(to, viewport);
  return Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row)) * 5;
};

const THROWN_AWAY = Object.freeze({
  ok: false,
  code: "AUTHORED_ATTACK_THROWN",
  message: "That weapon has been thrown and is no longer in hand.",
  recovery: "Retrieve it from the board before using it again.",
  retryable: false,
});

/**
 * Authored attacks describe a creature's own capabilities and already carry
 * their to-hit and damage. A token that has any uses them instead of deriving
 * options from the weapons in its hands.
 */
export const authoredAttackOptions = (token) =>
  (token?.attacks || []).map((attack) => ({
    hand: "attack",
    attackId: attack.id,
    attack,
    authored: true,
    weaponId: null,
    weapon: {
      id: attack.id,
      name: attack.name,
      kind: "authored-attack",
      damageDice: attack.damageDice,
      damageType: attack.damageType,
      weaponRange: attack.rangeKind,
      propertyIds: [],
    },
    damageDice: attack.damageDice,
    supply: attack.thrown ? THROWN_AWAY : { ok: true, value: { kind: "none" } },
    key: `attack:${attack.id}`,
  }));

/**
 * Every creature can punch: one bludgeoning damage plus its Strength modifier,
 * with proficiency, at a reach of five feet. It exists as a catalog-shaped
 * object rather than a real item so it can never be owned, dropped, thrown, or
 * enchanted — it is a capability, not equipment.
 */
export const UNARMED_STRIKE = Object.freeze({
  id: "unarmed-strike",
  name: "Unarmed Strike",
  kind: "weapon",
  typeLabel: "Unarmed",
  weaponClass: "simple",
  weaponRange: "melee",
  categoryRange: "Simple Melee",
  // A plain number, not dice: parseDamageDefinition reads it as a fixed 1 and
  // rollWeaponDamage adds the ability modifier on top, which is the rule.
  damageDice: 1,
  damageType: "Bludgeoning",
  normalRange: 5,
  longRange: null,
  throwRange: null,
  versatileDamageDice: null,
  properties: [],
  propertyIds: [],
});

export const unarmedStrikeOption = () => ({
  hand: "mainHand",
  attackId: null,
  attack: null,
  authored: false,
  unarmed: true,
  weaponId: null,
  weapon: UNARMED_STRIKE,
  damageDice: UNARMED_STRIKE.damageDice,
  supply: { ok: true, value: { kind: "none" } },
  key: "unarmed:unarmed-strike",
});

export function attackOptionsForToken(token) {
  if (token?.attacks?.length) return authoredAttackOptions(token);
  const equipped = equippedWeapons(token).map(({ hand, item, damageDice }) => ({
    hand: hand === "main" ? "mainHand" : "offHand",
    attackId: null,
    attack: null,
    authored: false,
    unarmed: false,
    weaponId: item.id,
    weapon: item,
    damageDice,
    supply: attackSupplyAvailability(token, item, { usage: item.propertyIds?.includes("ammunition") ? "ranged" : "melee" }),
    key: `${hand}:${item.id}`,
  }));
  // An empty-handed creature is never stranded with no legal Action.
  return equipped.length ? equipped : [unarmedStrikeOption()];
}

export function mainAttackAvailability(scene) {
  const available = attackActionAvailability(scene);
  if (!available.ok) return available;
  // Never empty: a creature holding nothing still has an unarmed strike, so
  // there is no longer a "no weapon equipped" refusal to make.
  const options = attackOptionsForToken(available.value.token);
  if (options.every((option) => !option.supply.ok)) return failure(
    "NO_ATTACK_SUPPLIES",
    options[0].supply.message,
    options[0].supply.recovery,
    true,
    { options },
  );
  return success({ ...available.value, options });
}

export function bonusAttackAvailability(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || isIncapacitated(token.conditions)) return failure(
    "BONUS_ATTACK_INCAPACITATED",
    `${token.name} cannot use a Bonus Action while incapacitated or defeated.`,
    "Remove the condition or end the turn.",
  );
  if (resources.bonusActionSpent) return failure(
    "BONUS_ACTION_SPENT",
    `The Bonus Action was already spent on ${resources.bonusActionType || "another command"}.`,
    "End the turn to refresh it.",
  );
  if (!resources.offHandAttackAvailable || !resources.offHandWeaponId || !resources.offHandAttackHand) return failure(
    "OFF_HAND_ATTACK_LOCKED",
    "An off-hand attack is not available this turn.",
    "Use the Attack Action with one weapon from a legal dual-wield loadout first.",
  );
  const option = attackOptionsForToken(token).find(({ weaponId, hand }) =>
    weaponId === resources.offHandWeaponId && hand === resources.offHandAttackHand,
  );
  if (!option) return failure(
    "OFF_HAND_WEAPON_MISSING",
    "The weapon reserved for the off-hand attack is no longer equipped.",
    "End the turn and restore a legal loadout in Battle Setup.",
  );
  return success({ ...context.value, options: [option] });
}

/**
 * A reaction is the first thing in the app that a creature does on somebody
 * else's turn, so it cannot go through `activeTurnContext` like every other
 * attack — the creature making it is by definition not the active one.
 *
 * It also spends nothing from the turn economy. A reaction is its own resource,
 * and it lives on the token rather than in turn resources because turn resources
 * exist only for whoever is active and are thrown away when the turn passes.
 */
export function reactionAttackAvailability(scene, reactorId) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Reactions happen only during an active Battle.",
    "Start Battle first.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === reactorId);
  if (!token) return failure(
    "REACTION_TOKEN_MISSING",
    "That token is no longer on this Table.",
    "The reaction is skipped.",
  );
  if (token.hp <= 0 || isIncapacitated(token.conditions)) return failure(
    "REACTION_INCAPACITATED",
    `${token.name} cannot react while incapacitated or down.`,
    "The reaction is skipped.",
  );
  if (token.reactionSpent) return failure(
    "REACTION_ALREADY_SPENT",
    `${token.name} has already used a reaction this round.`,
    "A creature gets one reaction, and it refreshes at the start of its own turn.",
  );
  const round = Math.max(1, Math.floor(Number(scene.encounter.round) || 1));
  const order = scene.encounter.initiativeOrder || [];
  const reactorIndex = order.indexOf(token.id);
  const activeIndex = Math.max(0, Math.floor(Number(scene.encounter.activeIndex) || 0));
  if (round === 1 && (scene.encounter.surprisedTokenIds || []).includes(token.id) && reactorIndex >= activeIndex) return failure(
    "REACTION_SURPRISED",
    `${token.name} cannot react before its surprised first turn has passed.`,
    "The reaction becomes available after its place in round one.",
  );
  return success({
    tokens,
    token,
    tokenId: token.id,
    // A stand-in turn: a reacting creature has no live turn of its own, and the
    // roll only reads `swapped` from this, which is never true for one.
    resources: createTurnResources(token),
    options: attackOptionsForToken(token),
  });
}

export function readiedAttacksFor(scene, trigger, targetTokenId) {
  if (!scene?.encounter || scene.encounter.status !== "active") return [];
  const tokens = normalizeTableTokens(scene.tokens);
  const target = tokens.find((entry) => entry.id === targetTokenId);
  if (!target) return [];
  return tokens.flatMap((reactor) => {
    const ready = reactor.readiedAction;
    if (!ready || ready.trigger !== trigger || ready.targetTokenId !== target.id) return [];
    if (reactor.faction === target.faction || !reactionAttackAvailability(scene, reactor.id).ok) return [];
    return [{
      type: "ready",
      reactorId: reactor.id,
      reactorName: reactor.name,
      targetId: target.id,
      targetName: target.name,
      weaponId: ready.weaponId,
      hand: ready.hand,
      attackId: ready.attackId,
      trigger,
    }];
  });
}

const selectionAvailability = (scene, kind, specification = {}) =>
  kind === ATTACK_KIND_REACTION
    ? reactionAttackAvailability(scene, specification.reactorId)
    : kind === ATTACK_KIND_BONUS
      ? bonusAttackAvailability(scene)
      : mainAttackAvailability(scene);

const selectedAttackOption = (available, weaponId, hand, attackId) => available.value.options.find((option) =>
  option.authored
    ? option.attackId === attackId
    : option.weaponId === weaponId && (!hand || option.hand === hand),
);

/**
 * A throwable authored attack behaves exactly like a thrown catalog weapon:
 * used inside its reach it is a melee swing and stays in hand, used beyond it
 * the weapon leaves the creature and lands on the board.
 */
const authoredRangeAtDistance = (attack, distanceFeet) => {
  if (attack.rangeKind === "melee") {
    if (distanceFeet <= attack.reachFeet) {
      return {
        usage: "melee",
        tier: attack.reachFeet > 5 ? "reach" : "melee",
        distanceFeet,
        maximumFeet: attack.reachFeet,
        color: "green",
        disadvantage: false,
      };
    }
    if (!attack.throwable) return null;
    if (distanceFeet <= attack.normalFeet) return { usage: "thrown", tier: "thrown-normal", distanceFeet, maximumFeet: attack.normalFeet, color: "yellow", disadvantage: false };
    if (distanceFeet <= attack.longFeet) return { usage: "thrown", tier: "thrown-long", distanceFeet, maximumFeet: attack.longFeet, color: "red", disadvantage: true };
    return null;
  }
  const usage = attack.throwable ? "thrown" : "ranged";
  if (distanceFeet <= attack.normalFeet) return { usage, tier: `${usage}-normal`, distanceFeet, maximumFeet: attack.normalFeet, color: "green", disadvantage: false };
  if (distanceFeet <= attack.longFeet) return { usage, tier: `${usage}-long`, distanceFeet, maximumFeet: attack.longFeet, color: "yellow", disadvantage: true };
  return null;
};

const weaponRangeAtDistance = (weapon, distanceFeet) => {
  const meleeMaximum = hasProperty(weapon, "reach") ? 10 : 5;
  if (weapon.weaponRange === "melee" && distanceFeet <= meleeMaximum) {
    return { usage: "melee", tier: meleeMaximum > 5 ? "reach" : "melee", distanceFeet, maximumFeet: meleeMaximum, color: "green", disadvantage: false };
  }
  if (weapon.weaponRange === "melee" && weapon.throwRange) {
    if (distanceFeet <= weapon.throwRange.normal) return { usage: "thrown", tier: "thrown-normal", distanceFeet, maximumFeet: weapon.throwRange.normal, color: "yellow", disadvantage: false };
    if (distanceFeet <= weapon.throwRange.long) return { usage: "thrown", tier: "thrown-long", distanceFeet, maximumFeet: weapon.throwRange.long, color: "red", disadvantage: true };
    return null;
  }
  if (weapon.weaponRange === "ranged" && hasProperty(weapon, "thrown") && weapon.throwRange) {
    if (distanceFeet <= weapon.throwRange.normal) return { usage: "thrown", tier: "thrown-normal", distanceFeet, maximumFeet: weapon.throwRange.normal, color: "yellow", disadvantage: false };
    if (distanceFeet <= weapon.throwRange.long) return { usage: "thrown", tier: "thrown-long", distanceFeet, maximumFeet: weapon.throwRange.long, color: "red", disadvantage: true };
    return null;
  }
  if (weapon.weaponRange === "ranged") {
    if (distanceFeet <= weapon.normalRange) return { usage: "ranged", tier: "ranged-normal", distanceFeet, maximumFeet: weapon.normalRange, color: "green", disadvantage: false };
    if (distanceFeet <= weapon.longRange) return { usage: "ranged", tier: "ranged-long", distanceFeet, maximumFeet: weapon.longRange, color: "yellow", disadvantage: true };
  }
  return null;
};

const percentPoint = (point) => ({ x: Number(point?.xPercent) || 0, y: Number(point?.yPercent) || 0 });

export function attackLineOfSight(scene, attacker, target, usage) {
  if (usage === "melee") return { state: "clear", blockingWallIds: [], halfWallIds: [] };
  const start = percentPoint(attacker.position);
  const end = percentPoint(target.position);
  const blockingWallIds = [];
  const halfWallIds = [];
  for (const wall of normalizeWalls(scene?.walls)) {
    for (let index = 1; index < wall.points.length; index += 1) {
      if (!segmentsIntersect(start, end, percentPoint(wall.points[index - 1]), percentPoint(wall.points[index]))) continue;
      const list = wall.type === "half" ? halfWallIds : blockingWallIds;
      if (!list.includes(wall.id)) list.push(wall.id);
    }
  }
  if (blockingWallIds.length) return { state: "blocked", blockingWallIds, halfWallIds };
  if (halfWallIds.length) return { state: "half-cover", blockingWallIds, halfWallIds };
  return { state: "clear", blockingWallIds, halfWallIds };
}

export function attackTargetEligibility(scene, {
  kind = ATTACK_KIND_ACTION,
  weaponId,
  hand,
  attackId,
  targetId,
  reactorId,
  targetPosition,
  viewport,
} = {}) {
  const available = selectionAvailability(scene, kind, { reactorId });
  if (!available.ok) return available;
  const option = selectedAttackOption(available, weaponId, hand, attackId);
  if (!option) return failure(
    "ATTACK_WEAPON_UNAVAILABLE",
    "That weapon is not available for this attack.",
    "Choose one of the equipped weapons shown in the command drawer.",
  );
  if (!option.supply.ok) return option.supply;
  const target = available.value.tokens.find((token) => token.id === targetId);
  if (!target || target.id === available.value.token.id) return failure(
    "ATTACK_TARGET_INVALID",
    "Choose another token as the attack target.",
    "Select a living token inside the highlighted range.",
    true,
  );
  // A creature bleeding out can still be attacked, and finishing one off is a
  // real tactical choice a monster gets to make. Only the dead are refused.
  if (target.dead) return failure(
    "ATTACK_TARGET_DEFEATED",
    `${target.name} is already dead.`,
    "Choose a standing or dying target.",
    true,
  );
  // Opportunity attacks land immediately before the creature leaves reach.
  // Movement is already saved when the queued reaction resolves, so use the
  // recorded departure square for range while damaging the real moved token.
  const targetingPosition = kind === ATTACK_KIND_REACTION && targetPosition
    ? targetPosition
    : target.position;
  const targetingTarget = targetingPosition === target.position
    ? target
    : { ...target, position: targetingPosition };
  const distanceFeet = attackDistanceFeet(available.value.token.position, targetingPosition, viewport);
  const range = option.authored
    ? authoredRangeAtDistance(option.attack, distanceFeet)
    : weaponRangeAtDistance(option.weapon, distanceFeet);
  if (!range) return failure(
    "ATTACK_OUT_OF_RANGE",
    `${target.name} is outside ${option.weapon.name}'s attack range.`,
    "Choose a highlighted target or move closer.",
    true,
    { distanceFeet },
  );
  const lineOfSight = attackLineOfSight(scene, available.value.token, targetingTarget, range.usage);
  if (lineOfSight.state === "blocked") return failure(
    "ATTACK_LINE_BLOCKED",
    `A full wall blocks the shot to ${target.name}.`,
    "Choose another target, move around the wall, or use a melee attack.",
    true,
    { distanceFeet, range, lineOfSight },
  );
  // An authored attack has no catalog object behind it, so there is no
  // ammunition to spend and no thrown-weapon whitelist to satisfy.
  const supply = option.authored
    ? success(range.usage === "thrown"
        ? { kind: "authored-thrown", attackId: option.attackId }
        : { kind: "none" })
    : attackSupplyAvailability(available.value.token, option.weapon, range);
  if (!supply.ok) return supply;
  return success({ ...available.value, option, target, distanceFeet, range, lineOfSight, supply: supply.value });
}

export function combineAttackModes(sources = []) {
  const advantage = sources.some((source) => source.mode === ATTACK_MODE_ADVANTAGE);
  const disadvantage = sources.some((source) => source.mode === ATTACK_MODE_DISADVANTAGE);
  if (advantage && !disadvantage) return ATTACK_MODE_ADVANTAGE;
  if (disadvantage && !advantage) return ATTACK_MODE_DISADVANTAGE;
  return ATTACK_MODE_NORMAL;
}

export function attackRollSources({ attacker, target, weapon, range, lineOfSight, resources, kind }) {
  const sources = [];
  if (range.disadvantage) sources.push({ mode: "disadvantage", code: range.tier, label: range.tier === "thrown-long" ? "Long throw" : "Long range" });
  if (attacker.size === "small" && hasProperty(weapon, "heavy")) sources.push({ mode: "disadvantage", code: "small-heavy", label: "Small creature with Heavy weapon" });
  if (weapon.id === "lance" && range.distanceFeet === 5) sources.push({ mode: "disadvantage", code: "lance-close", label: "Lance at 5 feet" });
  if (kind === ATTACK_KIND_ACTION && resources.swapped) sources.push({ mode: "disadvantage", code: "attack-after-swap", label: "Attack after weapon Swap" });
  if (lineOfSight.state === "half-cover") sources.push({ mode: "disadvantage", code: "half-wall", label: "Half-wall shot" });
  // A Dodging creature is harder to hit with everything. The exception is a
  // creature that cannot actually dodge: the Action does nothing for someone
  // incapacitated or pinned in place, and the flag can outlive the condition
  // that arrived after it.
  if (target.dodging && !isIncapacitated(target.conditions) && target.baseSpeed > 0) {
    sources.push({ mode: ATTACK_MODE_DISADVANTAGE, code: "target-dodging", label: "Dodging target" });
  }
  // Help is spent on one enemy. Naming the target is what stops a single Help
  // turning into advantage on everything the ally swings at this round.
  //
  // The truthiness guard is load-bearing: an unhelped attacker carries null
  // here, and comparing two absent values would hand advantage to everyone.
  if (attacker.helpedAgainstTokenId && attacker.helpedAgainstTokenId === target.id) {
    sources.push({ mode: ATTACK_MODE_ADVANTAGE, code: "helped", label: "Helped by an ally" });
  }
  sources.push(...attackerConditionModes(attacker.conditions));
  sources.push(...targetConditionModes(target.conditions, range.usage === "melee" ? "melee" : "ranged"));
  return sources;
}

const randomUnit = (random) => Math.max(0, Math.min(0.999999999999, Number(random?.()) || 0));
export const rollDie = (sides, random = Math.random) => Math.floor(randomUnit(random) * Math.max(1, Math.floor(Number(sides) || 1))) + 1;

const attackAbility = (token, weapon) => {
  const strength = abilityModifier(token.strength);
  const dexterity = abilityModifier(token.dexterity);
  if (hasProperty(weapon, "finesse")) return strength >= dexterity
    ? { ability: "STR", modifier: strength }
    : { ability: "DEX", modifier: dexterity };
  return weapon.weaponRange === "ranged"
    ? { ability: "DEX", modifier: dexterity }
    : { ability: "STR", modifier: strength };
};

/**
 * Catalog weapons store their dice alone and pick up the ability modifier at
 * roll time. A stat block writes the total instead ("1d6+2"), so the trailing
 * term is parsed out here and carried as `flat` rather than being mistaken for
 * a second ability modifier.
 */
export function parseDamageDefinition(definition) {
  if (Number.isFinite(definition)) return { kind: "fixed", fixed: Math.max(0, Math.floor(definition)), count: 0, sides: 0, flat: 0 };
  const text = String(definition || "").trim();
  if (/^\d+$/.test(text)) return { kind: "fixed", fixed: Math.max(0, Number(text)), count: 0, sides: 0, flat: 0 };
  const match = text.match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!match) return { kind: "fixed", fixed: 0, count: 0, sides: 0, flat: 0 };
  return {
    kind: "dice",
    fixed: 0,
    count: Math.max(0, Number(match[1])),
    sides: Math.max(1, Number(match[2])),
    flat: match[3] ? Number(match[3].replace(/\s+/g, "")) : 0,
  };
}

export function rollWeaponDamage({ definition, critical = false, ability = 0, magic = 0, offHand = false, random = Math.random }) {
  const parsed = parseDamageDefinition(definition);
  const diceCount = parsed.kind === "dice" ? parsed.count * (critical ? 2 : 1) : 0;
  const rolls = Array.from({ length: diceCount }, () => rollDie(parsed.sides, random));
  const diceTotal = parsed.kind === "fixed" ? parsed.fixed : rolls.reduce((total, roll) => total + roll, 0);
  const abilityDamage = offHand ? Math.min(0, ability) : ability;
  // A critical doubles dice, never the flat term written into the definition.
  const modifier = abilityDamage + Number(magic || 0) + parsed.flat;
  return {
    definition: String(definition),
    parsed,
    critical,
    rolls,
    diceTotal,
    abilityModifier: abilityDamage,
    magicModifier: Number(magic || 0),
    flatModifier: parsed.flat,
    modifier,
    total: Math.max(0, diceTotal + modifier),
  };
}

const dualWieldFollowup = (token, attackedOption) => {
  if (attackedOption.authored) return null;
  const options = attackOptionsForToken(token);
  if (options.length !== 2) return null;
  if (options.some(({ weapon }) => weapon.weaponRange !== "melee" || !hasProperty(weapon, "light") || hasProperty(weapon, "two-handed"))) return null;
  return options.find(({ hand }) => hand !== attackedOption.hand) || null;
};

export function performWeaponAttack(scene, specification = {}, {
  random = Math.random,
  battleItemIdFactory = () => `battle-item-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
} = {}) {
  const kind = specification.kind === ATTACK_KIND_BONUS
    ? ATTACK_KIND_BONUS
    : specification.kind === ATTACK_KIND_REACTION
      ? ATTACK_KIND_REACTION
      : ATTACK_KIND_ACTION;
  const eligible = attackTargetEligibility(scene, { ...specification, kind });
  if (!eligible.ok) return eligible;
  const { token: attacker, target, option, resources, range, lineOfSight } = eligible.value;
  // An authored attack states its own to-hit, so no ability modifier,
  // proficiency bonus or magic bonus is derived or added on top of it.
  const ability = option.authored
    ? { ability: null, modifier: 0 }
    : attackAbility(attacker, option.weapon);
  const magic = option.authored
    ? { attack: 0, damage: 0 }
    : weaponMagicBonuses(attacker, option.weaponId);
  const sources = attackRollSources({ attacker, target, weapon: option.weapon, range, lineOfSight, resources, kind });
  const mode = combineAttackModes(sources);
  const rolls = Array.from({ length: mode === ATTACK_MODE_NORMAL ? 1 : 2 }, () => rollDie(20, random));
  const selectedIndex = mode === ATTACK_MODE_DISADVANTAGE
    ? (rolls[1] < rolls[0] ? 1 : 0)
    : (rolls[1] > rolls[0] ? 1 : 0);
  const naturalRoll = rolls[selectedIndex];
  const proficiency = option.authored ? 0 : proficiencyBonus(attacker.level);
  const attackBonus = option.authored
    ? option.attack.toHit
    : ability.modifier + proficiency + magic.attack;
  const attackTotal = naturalRoll + attackBonus;
  const hit = naturalRoll === 20 || (naturalRoll !== 1 && attackTotal >= target.ac);
  const autoCritical = hit && targetAutoCritical(target.conditions, range.usage === "melee" ? "melee" : "ranged");
  const critical = hit && (naturalRoll === 20 || autoCritical);
  const damage = hit ? rollWeaponDamage({
    definition: option.authored
      ? option.attack.damageDice
      : range.usage === "thrown"
        ? option.weapon.damageDice
        : option.damageDice || effectiveDamageDice(attacker, option.weaponId),
    critical,
    ability: ability.modifier,
    magic: magic.damage,
    offHand: !option.authored && kind === ATTACK_KIND_BONUS,
    random,
  }) : null;
  // Resistance, immunity and vulnerability land on the finished total, which is
  // where the SRD puts them: after every other modifier, not inside the dice.
  const damageType = option.authored ? option.attack.damageType : option.weapon.damageType || null;
  const defense = hit
    ? applyDamageDefense(target, damage.total, damageType)
    : { amount: 0, incoming: 0, multiplier: 1, defense: null, damageType: null };
  // Temporary hit points are a buffer in front of real health, and a hit on a
  // creature that is already down is a failed death saving throw rather than
  // damage. Both live in `resolveIncomingDamage`, so an attack and a
  // hand-applied hit put a creature into exactly the same state.
  const pools = hit
    ? resolveIncomingDamage(target, defense.amount, { critical })
    : {
      patch: {}, absorbed: 0, previousHp: target.hp, nextHp: target.hp, nextTempHp: target.tempHp,
      downed: false, dyingHit: false, failuresAdded: 0, died: false, instantDeath: false,
    };
  const nextTargetHp = pools.nextHp;
  const damagedTokens = hit
    ? updateToken(eligible.value.tokens, target.id, pools.patch)
    : eligible.value.tokens;
  // A reaction spends the reactor's reaction, which is a flag on the creature,
  // and nothing at all from anybody's turn. The mover is mid-turn while this
  // resolves, so writing turn resources here would hand their remaining Action
  // and movement to whoever happened to swing at them.
  const reactionRefreshedAtStartedTurn = kind === ATTACK_KIND_REACTION
    && specification.reactionType === "ready"
    && specification.readyTrigger === "target-ends-turn"
    && scene.encounter.initiativeOrder?.[scene.encounter.activeIndex] === attacker.id;
  const reactionTokens = kind === ATTACK_KIND_REACTION
    ? updateToken(damagedTokens, attacker.id, {
      // The UI saves an end-of-turn transition before presenting its reaction.
      // If that transition began the reactor's own turn, the reaction has
      // already refreshed for the new round and remains available.
      reactionSpent: !reactionRefreshedAtStartedTurn,
      ...(specification.reactionType === "ready" ? { readiedAction: null } : {}),
    })
    : damagedTokens;
  // Help buys one attack roll, hit or miss, so it is spent the moment the die
  // is thrown at the enemy it named. Without this a single Help would carry
  // advantage across every attack of a Multiattack.
  const helpedTokens = attacker.helpedAgainstTokenId === target.id
    ? updateToken(reactionTokens, attacker.id, { helpedAgainstTokenId: null, helpedById: null })
    : reactionTokens;
  let nextResources;
  if (kind === ATTACK_KIND_BONUS) {
    nextResources = {
      ...resources,
      bonusActionSpent: true,
      bonusActionType: "off-hand attack",
      offHandAttackAvailable: false,
    };
  } else {
    const followup = resources.swapped ? null : dualWieldFollowup(attacker, option);
    // Multiattack spends one Action across several rolls: the Action only
    // closes once the creature's whole allowance has been used.
    const attacksMade = resources.attacksMade + 1;
    // A Loading weapon fires a single piece of ammunition per Action however
    // large the Multiattack allowance is, so the first shot closes the Action.
    const loading = hasProperty(option.weapon, "loading");
    const allowanceRemaining = attacksMade < resources.attackAllowance && !loading;
    nextResources = {
      ...resources,
      attacksMade,
      actionSpent: !allowanceRemaining,
      actionType: "attack",
      mainWeaponAttacked: true,
      mainAttackWeaponId: option.weaponId,
      offHandAttackAvailable: Boolean(followup),
      offHandWeaponId: followup?.weaponId || null,
      offHandAttackHand: followup?.hand || null,
      swapChoice: resources.swapped ? "attack" : resources.swapChoice,
    };
  }
  const verdict = critical ? "critical" : hit ? "hit" : "miss";
  const attackEncounter = {
    ...scene.encounter,
    ...(kind === ATTACK_KIND_REACTION ? {} : { resources: { [attacker.id]: nextResources } }),
    log: appendEncounterLog(scene.encounter.log, `${attacker.name} ${kind === ATTACK_KIND_REACTION ? specification.reactionType === "ready" ? "releases a readied attack on" : "takes an opportunity attack on" : "attacks"} ${target.name} with ${option.weapon.name}: ${verdict}${hit && !pools.dyingHit ? ` for ${defense.amount} damage` : ""}.${hit ? `${damageDefenseText(defense)}${damageStateText(target, pools)}` : ""}`),
  };
  const supplied = applyAttackSupplyEffects({
    scene,
    tokens: helpedTokens,
    encounter: attackEncounter,
    attackerId: attacker.id,
    targetId: target.id,
    weapon: option.weapon,
    hand: option.hand,
    authoredAttack: option.authored ? option.attack : null,
    range,
    hit,
    viewport: specification.viewport,
    battleItemId: range.usage === "thrown" ? battleItemIdFactory() : null,
  });
  if (!supplied.ok) return supplied;
  const completed = completeEncounterIfNeeded(supplied.value.tokens, supplied.value.encounter);
  if (!completed.ok) return completed;
  const outcome = {
    kind,
    attackerId: attacker.id,
    attackerName: attacker.name,
    targetId: target.id,
    targetName: target.name,
    weaponId: option.weaponId,
    weaponName: option.weapon.name,
    weaponHand: option.hand,
    authored: Boolean(option.authored),
    attackId: option.attackId || null,
    damageType,
    // What the target's defences did to the rolled number. `damage` stays the
    // roll so the cinematic can still show the dice that were thrown; this is
    // what actually came off their hit points.
    damageDefense: defense,
    damageApplied: hit ? defense.amount : 0,
    riders: option.authored ? option.attack.riders : [],
    attacksMade: supplied.value.encounter.resources?.[attacker.id]?.attacksMade ?? null,
    attackAllowance: resources.attackAllowance,
    range,
    lineOfSight,
    sources,
    mode,
    rolls,
    selectedIndex,
    naturalRoll,
    ability,
    proficiency,
    magicAttackBonus: magic.attack,
    attackBonus,
    attackTotal,
    targetAc: target.ac,
    hit,
    critical,
    autoCritical,
    verdict,
    damage,
    previousHp: target.hp,
    nextHp: nextTargetHp,
    absorbedByTempHp: pools.absorbed,
    downed: pools.downed,
    dyingHit: pools.dyingHit,
    deathSaveFailuresAdded: pools.failuresAdded,
    died: pools.died,
    previousTempHp: target.tempHp,
    nextTempHp: pools.nextTempHp,
    supply: supplied.supply,
    battleItem: supplied.battleItem || null,
    completed: completed.completed,
    winnerTokenId: completed.winnerTokenId || null,
    ammunitionRecovery: completed.recovery,
  };
  return success(completed.value, { outcome });
}

const cellKey = (cell) => `${cell.column}:${cell.row}`;
const pointKey = (x, y) => `${x}:${y}`;

function boundaryPath(cells, metrics) {
  const occupied = new Set(cells.map(cellKey));
  const edges = [];
  for (const { column, row } of cells) {
    if (!occupied.has(cellKey({ column, row: row - 1 }))) edges.push([[column, row], [column + 1, row]]);
    if (!occupied.has(cellKey({ column: column + 1, row }))) edges.push([[column + 1, row], [column + 1, row + 1]]);
    if (!occupied.has(cellKey({ column, row: row + 1 }))) edges.push([[column + 1, row + 1], [column, row + 1]]);
    if (!occupied.has(cellKey({ column: column - 1, row }))) edges.push([[column, row + 1], [column, row]]);
  }
  const byStart = new Map();
  for (const edge of edges) {
    const key = pointKey(...edge[0]);
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(edge);
  }
  const paths = [];
  const unused = new Set(edges);
  while (unused.size) {
    const first = unused.values().next().value;
    const points = [first[0], first[1]];
    unused.delete(first);
    let current = first[1];
    while (pointKey(...current) !== pointKey(...first[0])) {
      const next = (byStart.get(pointKey(...current)) || []).find((edge) => unused.has(edge));
      if (!next) break;
      unused.delete(next);
      current = next[1];
      points.push(current);
    }
    const coordinates = points.map(([x, y]) => `${x / metrics.columns * 100} ${y / metrics.rows * 100}`);
    if (coordinates.length > 2) paths.push(`M ${coordinates.join(" L ")} Z`);
  }
  return paths.join(" ");
}

const authoredBandDefinitions = (attack) => {
  if (attack.rangeKind === "melee") {
    const melee = {
      id: attack.reachFeet > 5 ? "reach" : "melee",
      maximumFeet: attack.reachFeet,
      tone: "green",
      label: `${attack.reachFeet > 5 ? "Reach" : "Melee"} · ${attack.reachFeet} ft`,
    };
    if (!attack.throwable) return [melee];
    return [
      { id: "thrown-long", maximumFeet: attack.longFeet, tone: "red", label: `Long throw · ${attack.longFeet} ft` },
      { id: "thrown-normal", maximumFeet: attack.normalFeet, tone: "yellow", label: `Normal throw · ${attack.normalFeet} ft` },
      melee,
    ];
  }
  const noun = attack.throwable ? "throw" : "range";
  return [
    { id: "ranged-long", maximumFeet: attack.longFeet, tone: "yellow", label: `Long ${noun} · ${attack.longFeet} ft` },
    { id: "ranged-normal", maximumFeet: attack.normalFeet, tone: "green", label: `Normal ${noun} · ${attack.normalFeet} ft` },
  ];
};

const bandDefinitions = (option) => {
  if (option.authored) return authoredBandDefinitions(option.attack);
  const weapon = option.weapon;
  const meleeMaximum = hasProperty(weapon, "reach") ? 10 : 5;
  if (weapon.weaponRange === "melee" && weapon.throwRange) return [
    { id: "thrown-long", maximumFeet: weapon.throwRange.long, tone: "red", label: `Long throw · ${weapon.throwRange.long} ft` },
    { id: "thrown-normal", maximumFeet: weapon.throwRange.normal, tone: "yellow", label: `Normal throw · ${weapon.throwRange.normal} ft` },
    { id: meleeMaximum > 5 ? "reach" : "melee", maximumFeet: meleeMaximum, tone: "green", label: `${meleeMaximum > 5 ? "Reach" : "Melee"} · ${meleeMaximum} ft` },
  ];
  if (weapon.weaponRange === "ranged" && hasProperty(weapon, "thrown") && weapon.throwRange) return [
    { id: "thrown-long", maximumFeet: weapon.throwRange.long, tone: "red", label: `Long throw · ${weapon.throwRange.long} ft` },
    { id: "thrown-normal", maximumFeet: weapon.throwRange.normal, tone: "yellow", label: `Normal throw · ${weapon.throwRange.normal} ft` },
  ];
  if (weapon.weaponRange === "ranged") return [
    { id: "ranged-long", maximumFeet: weapon.longRange, tone: "yellow", label: `Long range · ${weapon.longRange} ft` },
    { id: "ranged-normal", maximumFeet: weapon.normalRange, tone: "green", label: `Normal range · ${weapon.normalRange} ft` },
  ];
  return [{ id: meleeMaximum > 5 ? "reach" : "melee", maximumFeet: meleeMaximum, tone: "green", label: `${meleeMaximum > 5 ? "Reach" : "Melee"} · ${meleeMaximum} ft` }];
};

export function buildAttackRangeBands(scene, {
  kind = ATTACK_KIND_ACTION,
  weaponId,
  hand,
  attackId,
  viewport,
} = {}) {
  const available = selectionAvailability(scene, kind);
  if (!available.ok) return available;
  const option = selectedAttackOption(available, weaponId, hand, attackId);
  if (!option) return failure("ATTACK_WEAPON_UNAVAILABLE", "That weapon is not available for targeting.", "Choose an equipped weapon.");
  if (!option.supply.ok) return option.supply;
  const metrics = setupGridMetrics(viewport);
  const origin = setupCellForPosition(available.value.token.position, viewport);
  const allCells = [];
  for (let row = 0; row < metrics.rows; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) allCells.push({ column, row });
  }
  const bands = bandDefinitions(option).map((band) => {
    const maximumCells = Math.floor(band.maximumFeet / 5);
    const cells = allCells.filter((cell) => Math.max(Math.abs(cell.column - origin.column), Math.abs(cell.row - origin.row)) <= maximumCells);
    return { ...band, path: boundaryPath(cells, metrics), cellCount: cells.length };
  });
  return success({
    tokenId: available.value.token.id,
    option,
    origin,
    columns: metrics.columns,
    rows: metrics.rows,
    cellWidthPercent: 100 / metrics.columns,
    cellHeightPercent: 100 / metrics.rows,
    bands,
  });
}

/**
 * How far a creature can reach with a melee swing, in feet, taking the longest
 * of whatever it can attack with. Zero means it has nothing that reaches at all,
 * which is why an archer with only a bow draws no opportunity attacks.
 */
export function meleeReachFeet(token) {
  let reach = 0;
  for (const option of attackOptionsForToken(token)) {
    if (!option.supply.ok) continue;
    if (option.authored) {
      if (option.attack.rangeKind === "melee") reach = Math.max(reach, option.attack.reachFeet);
    } else if (option.weapon.weaponRange === "melee") {
      reach = Math.max(reach, hasProperty(option.weapon, "reach") ? 10 : 5);
    }
  }
  return reach;
}

/**
 * Who gets a swing at a creature for walking away from them.
 *
 * The trigger is leaving a square that an enemy could reach, so the route is
 * walked square by square and the first step that carries the mover out of a
 * given reach is the one that provokes. Only the first: a creature has one
 * reaction, and taking it here is what stops a long run past the same guard
 * being a dozen free attacks.
 *
 * The mover has to be leaving, not merely moving. Walking around a monster while
 * staying inside its reach the whole way provokes nothing, which is exactly what
 * the "not adjacent at the next step" test says.
 */
export function opportunityAttacksFor(scene, plan, viewport) {
  const cells = plan?.cells || [];
  const landing = Math.max(0, Math.min(cells.length - 1, Number(plan?.landingIndex) || 0));
  if (landing < 1) return [];
  const tokens = normalizeTableTokens(scene?.tokens);
  const mover = tokens.find((token) => token.id === plan.tokenId);
  if (!mover) return [];
  // Disengage is the whole point of the Action: the route is walked exactly the
  // same way, and nobody gets to swing at it.
  if (mover.disengaging) return [];

  const positions = cells.map((cell) => setupPositionForCell(cell, viewport));
  const reactions = [];
  for (const reactor of tokens) {
    if (reactor.id === mover.id) continue;
    if (reactor.faction === mover.faction) continue;
    if (reactor.hp <= 0 || reactor.dead) continue;
    if (reactor.reactionSpent) continue;
    if (isIncapacitated(reactor.conditions)) continue;
    const reach = meleeReachFeet(reactor);
    if (reach <= 0) continue;
    for (let step = 0; step < landing; step += 1) {
      const before = attackDistanceFeet(reactor.position, positions[step], viewport);
      const after = attackDistanceFeet(reactor.position, positions[step + 1], viewport);
      if (before > reach || after <= reach) continue;
      // A guard cannot swing through a wall any more than they can shoot
      // through one, so the same sight test the attack itself uses applies.
      const sight = attackLineOfSight(scene, reactor, { ...mover, position: positions[step] }, "melee");
      if (sight.state === "blocked") break;
      const option = attackOptionsForToken(reactor).find((entry) => entry.supply.ok && (entry.authored
        ? entry.attack.rangeKind === "melee" && entry.attack.reachFeet >= before
        : entry.weapon.weaponRange === "melee" && (hasProperty(entry.weapon, "reach") ? 10 : 5) >= before));
      if (!option) break;
      reactions.push({
        reactorId: reactor.id,
        reactorName: reactor.name,
        targetId: mover.id,
        targetName: mover.name,
        weaponId: option.weaponId,
        weaponName: option.weapon.name,
        hand: option.hand,
        attackId: option.attackId,
        departureIndex: step,
        departurePosition: positions[step],
        landingPosition: positions[landing],
        distanceFeet: before,
      });
      break;
    }
  }
  return reactions;
}

export function toggleBattleCondition(scene, tokenId, conditionId, { durationRounds = null } = {}) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Conditions can be changed only during an active Battle.",
    "Start Battle before applying a condition.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure("CONDITION_TOKEN_MISSING", "That token is no longer on this Table.", "Select another token.");
  const changed = changeCondition(token, conditionId, {
    currentRound: scene.encounter.round,
    durationRounds,
  });
  if (!changed.ok) return changed;
  return success({
    tokens: updateToken(tokens, tokenId, {
      conditions: changed.value,
      conditionExpiries: changed.conditionExpiries,
      ...(changed.active ? {} : { grappledById: token.conditions.includes("grappled") && changed.condition.id === "grappled" ? null : token.grappledById }),
    }),
  }, { condition: changed.condition, active: changed.active });
}
