const makeCondition = ({
  id,
  name,
  abbreviation,
  color,
  note,
  selfAttack = null,
  vsMelee = null,
  vsRanged = null,
  incapacitated = false,
  immobile = false,
  autoCriticalMelee = false,
  autoFailSaves = [],
  saveModes = {},
}) => Object.freeze({
  id,
  name,
  abbreviation,
  color,
  note,
  selfAttack,
  vsMelee,
  vsRanged,
  incapacitated,
  immobile,
  autoCriticalMelee,
  // A creature that cannot move or react does not get to roll: the save fails
  // outright. Kept as a list of ability keys rather than a boolean because only
  // Strength and Dexterity behave this way.
  autoFailSaves: Object.freeze([...autoFailSaves]),
  // Per-ability advantage or disadvantage on a save, e.g. Restrained hampering
  // Dexterity saves without touching the other five.
  saveModes: Object.freeze({ ...saveModes }),
});

export const CONDITIONS = Object.freeze([
  makeCondition({ id: "blinded", name: "Blinded", abbreviation: "BLD", color: "#8b96a3", note: "Own attacks have disadvantage; attacks against this token have advantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "advantage" }),
  makeCondition({ id: "charmed", name: "Charmed", abbreviation: "CHA", color: "#d783b5", note: "Tracked for future source-specific restrictions; it does not alter weapon attacks by itself." }),
  makeCondition({ id: "deafened", name: "Deafened", abbreviation: "DEA", color: "#9ca3af", note: "Tracked for future hearing checks; it does not alter weapon attacks by itself." }),
  makeCondition({ id: "frightened", name: "Frightened", abbreviation: "FRI", color: "#b486e8", note: "Own attacks have disadvantage.", selfAttack: "disadvantage" }),
  makeCondition({ id: "grappled", name: "Grappled", abbreviation: "GRA", color: "#c78a54", note: "Movement is unavailable.", immobile: true }),
  makeCondition({ id: "incapacitated", name: "Incapacitated", abbreviation: "INC", color: "#d75f79", note: "Action, Bonus Action, Dash, and Swap are unavailable.", incapacitated: true }),
  makeCondition({ id: "invisible", name: "Invisible", abbreviation: "INV", color: "#66b9c8", note: "Own attacks have advantage; attacks against this token have disadvantage.", selfAttack: "advantage", vsMelee: "disadvantage", vsRanged: "disadvantage" }),
  makeCondition({ id: "paralyzed", name: "Paralyzed", abbreviation: "PAR", color: "#e26c83", note: "Incapacitated and immobile; incoming attacks have advantage, melee hits automatically critical, and Strength and Dexterity saves fail automatically.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoCriticalMelee: true, autoFailSaves: ["str", "dex"] }),
  makeCondition({ id: "petrified", name: "Petrified", abbreviation: "PET", color: "#aa9b82", note: "Incapacitated and immobile; incoming attacks have advantage and Strength and Dexterity saves fail automatically.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoFailSaves: ["str", "dex"] }),
  makeCondition({ id: "poisoned", name: "Poisoned", abbreviation: "POI", color: "#79ad63", note: "Own attacks have disadvantage.", selfAttack: "disadvantage" }),
  makeCondition({ id: "prone", name: "Prone", abbreviation: "PRO", color: "#d79a57", note: "Own attacks have disadvantage; adjacent attacks gain advantage while ranged attacks gain disadvantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "disadvantage" }),
  makeCondition({ id: "restrained", name: "Restrained", abbreviation: "RES", color: "#bf765d", note: "Movement is unavailable, own attacks have disadvantage, incoming attacks have advantage, and Dexterity saves have disadvantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "advantage", immobile: true, saveModes: { dex: "disadvantage" } }),
  makeCondition({ id: "stunned", name: "Stunned", abbreviation: "STU", color: "#e0b055", note: "Incapacitated and immobile; incoming attacks have advantage and Strength and Dexterity saves fail automatically.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoFailSaves: ["str", "dex"] }),
  makeCondition({ id: "unconscious", name: "Unconscious", abbreviation: "UNC", color: "#657080", note: "Incapacitated and immobile; incoming attacks have advantage, melee hits automatically critical, and Strength and Dexterity saves fail automatically.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoCriticalMelee: true, autoFailSaves: ["str", "dex"] }),
  makeCondition({ id: "exhaustion", name: "Exhaustion", abbreviation: "EXH", color: "#8f735f", note: "Tracked as a manual status; level-specific exhaustion effects are not inferred." }),
]);

export const CONDITION_BY_ID = Object.freeze(Object.fromEntries(CONDITIONS.map((condition) => [condition.id, condition])));

const normalizedId = (value) => String(value || "").trim().toLowerCase().replaceAll(" ", "-");

export const conditionById = (conditionId) => CONDITION_BY_ID[normalizedId(conditionId)] || null;

export function normalizeConditions(conditions) {
  const result = [];
  const seen = new Set();
  for (const candidate of Array.isArray(conditions) ? conditions : []) {
    const condition = conditionById(candidate);
    if (condition && !seen.has(condition.id)) {
      result.push(condition.id);
      seen.add(condition.id);
    }
  }
  return result;
}

/** Condition immunities use the same canonical IDs as active conditions. */
export const normalizeConditionImmunities = (immunities) => normalizeConditions(immunities);

/**
 * Timed conditions expire when the encounter reaches the stored round. An
 * absent entry means the condition is permanent until somebody removes it.
 */
export function normalizeConditionExpiries(expiries, conditions = []) {
  if (!expiries || typeof expiries !== "object" || Array.isArray(expiries)) return {};
  const active = new Set(normalizeConditions(conditions));
  return Object.fromEntries(Object.entries(expiries).flatMap(([conditionId, round]) => {
    const condition = conditionById(conditionId);
    const expiry = Math.floor(Number(round));
    return condition && active.has(condition.id) && Number.isFinite(expiry) && expiry > 0
      ? [[condition.id, expiry]]
      : [];
  }));
}

export function changeCondition({ conditions, conditionExpiries, conditionImmunities }, conditionId, {
  currentRound = 1,
  durationRounds = null,
} = {}) {
  const condition = conditionById(conditionId);
  if (!condition) return { ok: false, code: "UNKNOWN_CONDITION", message: "That condition is not part of the Nightforge condition engine.", recovery: "Choose one of the 15 available conditions.", retryable: false };
  const current = normalizeConditions(conditions);
  const expiries = normalizeConditionExpiries(conditionExpiries, current);
  if (current.includes(condition.id)) {
    const { [condition.id]: removed, ...remainingExpiries } = expiries;
    return { ok: true, value: current.filter((id) => id !== condition.id), conditionExpiries: remainingExpiries, condition, active: false };
  }
  if (normalizeConditionImmunities(conditionImmunities).includes(condition.id)) {
    return {
      ok: false,
      code: "CONDITION_IMMUNE",
      message: `${condition.name} cannot be applied because this creature is immune to it.`,
      recovery: "Choose another condition or edit the creature's condition immunities in Setup.",
      retryable: false,
      condition,
    };
  }
  const rounds = durationRounds === null || durationRounds === undefined || durationRounds === ""
    ? null
    : Math.max(1, Math.min(600, Math.floor(Number(durationRounds) || 1)));
  return {
    ok: true,
    value: [...current, condition.id],
    conditionExpiries: rounds ? { ...expiries, [condition.id]: Math.max(1, Math.floor(Number(currentRound) || 1)) + rounds } : expiries,
    condition,
    active: true,
  };
}

export function expireConditionsAtRound(conditions, conditionExpiries, round) {
  const current = normalizeConditions(conditions);
  const expiries = normalizeConditionExpiries(conditionExpiries, current);
  const reached = Math.max(1, Math.floor(Number(round) || 1));
  const expired = current.filter((conditionId) => expiries[conditionId] && expiries[conditionId] <= reached);
  if (!expired.length) return { conditions: current, conditionExpiries: expiries, expired: [] };
  const expiredSet = new Set(expired);
  return {
    conditions: current.filter((conditionId) => !expiredSet.has(conditionId)),
    conditionExpiries: Object.fromEntries(Object.entries(expiries).filter(([conditionId]) => !expiredSet.has(conditionId))),
    expired,
  };
}

export const isIncapacitated = (conditions) =>
  normalizeConditions(conditions).some((conditionId) => CONDITION_BY_ID[conditionId].incapacitated);

export const isImmobilized = (conditions) =>
  normalizeConditions(conditions).some((conditionId) => CONDITION_BY_ID[conditionId].immobile);

export function attackerConditionModes(conditions) {
  return normalizeConditions(conditions).flatMap((conditionId) => {
    const condition = CONDITION_BY_ID[conditionId];
    return condition.selfAttack ? [{ mode: condition.selfAttack, code: `attacker-${condition.id}`, label: `${condition.name} attacker` }] : [];
  });
}

export function targetConditionModes(conditions, rangeType = "melee") {
  const field = rangeType === "melee" ? "vsMelee" : "vsRanged";
  return normalizeConditions(conditions).flatMap((conditionId) => {
    const condition = CONDITION_BY_ID[conditionId];
    return condition[field] ? [{ mode: condition[field], code: `target-${condition.id}`, label: `${condition.name} target` }] : [];
  });
}

export function conditionSaveModes(conditions, ability) {
  return normalizeConditions(conditions).flatMap((conditionId) => {
    const condition = CONDITION_BY_ID[conditionId];
    const mode = condition.saveModes[ability];
    return mode ? [{ mode, code: `save-${condition.id}`, label: `${condition.name} save` }] : [];
  });
}

export const conditionAutoFailsSave = (conditions, ability) =>
  normalizeConditions(conditions).some((conditionId) =>
    CONDITION_BY_ID[conditionId].autoFailSaves.includes(ability));

export const autoFailingSaveConditions = (conditions, ability) =>
  normalizeConditions(conditions)
    .map((conditionId) => CONDITION_BY_ID[conditionId])
    .filter((condition) => condition.autoFailSaves.includes(ability));

export const targetAutoCritical = (conditions, rangeType = "melee") =>
  rangeType === "melee" && normalizeConditions(conditions).some((conditionId) => CONDITION_BY_ID[conditionId].autoCriticalMelee);

export function toggleCondition(conditions, conditionId) {
  return changeCondition({ conditions }, conditionId);
}
