import { ITEM_BY_ID } from "./catalog.js";
import {
  attackerConditionModes,
  isIncapacitated,
  targetAutoCritical,
  targetConditionModes,
  toggleCondition,
} from "./conditions.js";
import { abilityModifier, proficiencyBonus } from "./heroes.js";
import { effectiveDamageDice, equippedWeapons, weaponMagicBonuses } from "./items.js";
import {
  applyAttackSupplyEffects,
  attackSupplyAvailability,
  completeEncounterIfNeeded,
} from "./encounter.js";
import { activeTurnContext, attackActionAvailability, segmentsIntersect } from "./combat.js";
import {
  appendEncounterLog,
  normalizeTableTokens,
  normalizeWalls,
  setupCellForPosition,
  setupGridMetrics,
  updateToken,
} from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });
const hasProperty = (weapon, property) => weapon?.propertyIds?.includes(String(property).toLowerCase());

export const ATTACK_KIND_ACTION = "action";
export const ATTACK_KIND_BONUS = "bonus";
export const ATTACK_MODE_NORMAL = "normal";
export const ATTACK_MODE_ADVANTAGE = "advantage";
export const ATTACK_MODE_DISADVANTAGE = "disadvantage";

export const attackDistanceFeet = (from, to, viewport) => {
  const start = setupCellForPosition(from, viewport);
  const end = setupCellForPosition(to, viewport);
  return Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row)) * 5;
};

export function attackOptionsForToken(token) {
  return equippedWeapons(token).map(({ hand, item, damageDice }) => ({
    hand: hand === "main" ? "mainHand" : "offHand",
    weaponId: item.id,
    weapon: item,
    damageDice,
    supply: attackSupplyAvailability(token, item, { usage: item.propertyIds?.includes("ammunition") ? "ranged" : "melee" }),
    key: `${hand}:${item.id}`,
  }));
}

export function mainAttackAvailability(scene) {
  const available = attackActionAvailability(scene);
  if (!available.ok) return available;
  const options = attackOptionsForToken(available.value.token);
  if (!options.length) return failure(
    "NO_EQUIPPED_WEAPON",
    `${available.value.token.name} has no equipped weapon available for Attack.`,
    "End the turn or equip a weapon in Battle Setup before the next encounter.",
  );
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

const selectionAvailability = (scene, kind) =>
  kind === ATTACK_KIND_BONUS ? bonusAttackAvailability(scene) : mainAttackAvailability(scene);

const selectedAttackOption = (available, weaponId, hand) => available.value.options.find((option) =>
  option.weaponId === weaponId && (!hand || option.hand === hand),
);

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
  targetId,
  viewport,
} = {}) {
  const available = selectionAvailability(scene, kind);
  if (!available.ok) return available;
  const option = selectedAttackOption(available, weaponId, hand);
  if (!option) return failure(
    "ATTACK_WEAPON_UNAVAILABLE",
    "That weapon is not available for this attack.",
    "Choose one of the equipped weapons shown in the command drawer.",
  );
  const target = available.value.tokens.find((token) => token.id === targetId);
  if (!target || target.id === available.value.token.id) return failure(
    "ATTACK_TARGET_INVALID",
    "Choose another token as the attack target.",
    "Select a living token inside the highlighted range.",
    true,
  );
  if (target.hp <= 0) return failure(
    "ATTACK_TARGET_DEFEATED",
    `${target.name} is already defeated.`,
    "Choose a living target.",
    true,
  );
  const distanceFeet = attackDistanceFeet(available.value.token.position, target.position, viewport);
  const range = weaponRangeAtDistance(option.weapon, distanceFeet);
  if (!range) return failure(
    "ATTACK_OUT_OF_RANGE",
    `${target.name} is outside ${option.weapon.name}'s attack range.`,
    "Choose a highlighted target or move closer.",
    true,
    { distanceFeet },
  );
  const lineOfSight = attackLineOfSight(scene, available.value.token, target, range.usage);
  if (lineOfSight.state === "blocked") return failure(
    "ATTACK_LINE_BLOCKED",
    `A full wall blocks the shot to ${target.name}.`,
    "Choose another target, move around the wall, or use a melee attack.",
    true,
    { distanceFeet, range, lineOfSight },
  );
  const supply = attackSupplyAvailability(available.value.token, option.weapon, range);
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

export function parseDamageDefinition(definition) {
  if (Number.isFinite(definition)) return { kind: "fixed", fixed: Math.max(0, Math.floor(definition)), count: 0, sides: 0 };
  const text = String(definition || "").trim();
  if (/^\d+$/.test(text)) return { kind: "fixed", fixed: Math.max(0, Number(text)), count: 0, sides: 0 };
  const match = text.match(/^(\d+)d(\d+)$/i);
  if (!match) return { kind: "fixed", fixed: 0, count: 0, sides: 0 };
  return { kind: "dice", fixed: 0, count: Math.max(0, Number(match[1])), sides: Math.max(1, Number(match[2])) };
}

export function rollWeaponDamage({ definition, critical = false, ability = 0, magic = 0, offHand = false, random = Math.random }) {
  const parsed = parseDamageDefinition(definition);
  const diceCount = parsed.kind === "dice" ? parsed.count * (critical ? 2 : 1) : 0;
  const rolls = Array.from({ length: diceCount }, () => rollDie(parsed.sides, random));
  const diceTotal = parsed.kind === "fixed" ? parsed.fixed : rolls.reduce((total, roll) => total + roll, 0);
  const abilityDamage = offHand ? Math.min(0, ability) : ability;
  const modifier = abilityDamage + Number(magic || 0);
  return {
    definition: String(definition),
    parsed,
    critical,
    rolls,
    diceTotal,
    abilityModifier: abilityDamage,
    magicModifier: Number(magic || 0),
    modifier,
    total: Math.max(0, diceTotal + modifier),
  };
}

const dualWieldFollowup = (token, attackedOption) => {
  const options = attackOptionsForToken(token);
  if (options.length !== 2) return null;
  if (options.some(({ weapon }) => weapon.weaponRange !== "melee" || !hasProperty(weapon, "light") || hasProperty(weapon, "two-handed"))) return null;
  return options.find(({ hand }) => hand !== attackedOption.hand) || null;
};

export function performWeaponAttack(scene, specification = {}, {
  random = Math.random,
  battleItemIdFactory = () => `battle-item-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
} = {}) {
  const kind = specification.kind === ATTACK_KIND_BONUS ? ATTACK_KIND_BONUS : ATTACK_KIND_ACTION;
  const eligible = attackTargetEligibility(scene, { ...specification, kind });
  if (!eligible.ok) return eligible;
  const { token: attacker, target, option, resources, range, lineOfSight } = eligible.value;
  const ability = attackAbility(attacker, option.weapon);
  const magic = weaponMagicBonuses(attacker, option.weaponId);
  const sources = attackRollSources({ attacker, target, weapon: option.weapon, range, lineOfSight, resources, kind });
  const mode = combineAttackModes(sources);
  const rolls = Array.from({ length: mode === ATTACK_MODE_NORMAL ? 1 : 2 }, () => rollDie(20, random));
  const selectedIndex = mode === ATTACK_MODE_DISADVANTAGE
    ? (rolls[1] < rolls[0] ? 1 : 0)
    : (rolls[1] > rolls[0] ? 1 : 0);
  const naturalRoll = rolls[selectedIndex];
  const proficiency = proficiencyBonus(attacker.level);
  const attackBonus = ability.modifier + proficiency + magic.attack;
  const attackTotal = naturalRoll + attackBonus;
  const hit = naturalRoll === 20 || (naturalRoll !== 1 && attackTotal >= target.ac);
  const autoCritical = hit && targetAutoCritical(target.conditions, range.usage === "melee" ? "melee" : "ranged");
  const critical = hit && (naturalRoll === 20 || autoCritical);
  const damage = hit ? rollWeaponDamage({
    definition: range.usage === "thrown"
      ? option.weapon.damageDice
      : option.damageDice || effectiveDamageDice(attacker, option.weaponId),
    critical,
    ability: ability.modifier,
    magic: magic.damage,
    offHand: kind === ATTACK_KIND_BONUS,
    random,
  }) : null;
  const nextTargetHp = hit ? Math.max(0, target.hp - damage.total) : target.hp;
  const damagedTokens = hit ? updateToken(eligible.value.tokens, target.id, { hp: nextTargetHp }) : eligible.value.tokens;
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
    nextResources = {
      ...resources,
      actionSpent: true,
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
    resources: { [attacker.id]: nextResources },
    log: appendEncounterLog(scene.encounter.log, `${attacker.name} attacks ${target.name} with ${option.weapon.name}: ${verdict}${hit ? ` for ${damage.total} damage` : ""}.`),
  };
  const supplied = applyAttackSupplyEffects({
    scene,
    tokens: damagedTokens,
    encounter: attackEncounter,
    attackerId: attacker.id,
    targetId: target.id,
    weapon: option.weapon,
    hand: option.hand,
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

const bandDefinitions = (weapon) => {
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
  viewport,
} = {}) {
  const available = selectionAvailability(scene, kind);
  if (!available.ok) return available;
  const option = selectedAttackOption(available, weaponId, hand);
  if (!option) return failure("ATTACK_WEAPON_UNAVAILABLE", "That weapon is not available for targeting.", "Choose an equipped weapon.");
  const metrics = setupGridMetrics(viewport);
  const origin = setupCellForPosition(available.value.token.position, viewport);
  const allCells = [];
  for (let row = 0; row < metrics.rows; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) allCells.push({ column, row });
  }
  const bands = bandDefinitions(option.weapon).map((band) => {
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

export function toggleBattleCondition(scene, tokenId, conditionId) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Conditions can be changed only during an active Battle.",
    "Start Battle before applying a condition.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure("CONDITION_TOKEN_MISSING", "That token is no longer on this Table.", "Select another token.");
  const changed = toggleCondition(token.conditions, conditionId);
  if (!changed.ok) return changed;
  return success({ tokens: updateToken(tokens, tokenId, { conditions: changed.value }) }, { condition: changed.condition, active: changed.value.includes(changed.condition.id) });
}
