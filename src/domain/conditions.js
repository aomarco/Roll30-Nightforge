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
});

export const CONDITIONS = Object.freeze([
  makeCondition({ id: "blinded", name: "Blinded", abbreviation: "BLD", color: "#8b96a3", note: "Own attacks have disadvantage; attacks against this token have advantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "advantage" }),
  makeCondition({ id: "charmed", name: "Charmed", abbreviation: "CHA", color: "#d783b5", note: "Tracked for future source-specific restrictions; it does not alter weapon attacks by itself." }),
  makeCondition({ id: "deafened", name: "Deafened", abbreviation: "DEA", color: "#9ca3af", note: "Tracked for future hearing checks; it does not alter weapon attacks by itself." }),
  makeCondition({ id: "frightened", name: "Frightened", abbreviation: "FRI", color: "#b486e8", note: "Own attacks have disadvantage.", selfAttack: "disadvantage" }),
  makeCondition({ id: "grappled", name: "Grappled", abbreviation: "GRA", color: "#c78a54", note: "Movement is unavailable.", immobile: true }),
  makeCondition({ id: "incapacitated", name: "Incapacitated", abbreviation: "INC", color: "#d75f79", note: "Action, Bonus Action, Dash, and Swap are unavailable.", incapacitated: true }),
  makeCondition({ id: "invisible", name: "Invisible", abbreviation: "INV", color: "#66b9c8", note: "Own attacks have advantage; attacks against this token have disadvantage.", selfAttack: "advantage", vsMelee: "disadvantage", vsRanged: "disadvantage" }),
  makeCondition({ id: "paralyzed", name: "Paralyzed", abbreviation: "PAR", color: "#e26c83", note: "Incapacitated and immobile; incoming attacks have advantage and melee hits automatically critical.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoCriticalMelee: true }),
  makeCondition({ id: "petrified", name: "Petrified", abbreviation: "PET", color: "#aa9b82", note: "Incapacitated and immobile; incoming attacks have advantage.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true }),
  makeCondition({ id: "poisoned", name: "Poisoned", abbreviation: "POI", color: "#79ad63", note: "Own attacks have disadvantage.", selfAttack: "disadvantage" }),
  makeCondition({ id: "prone", name: "Prone", abbreviation: "PRO", color: "#d79a57", note: "Own attacks have disadvantage; adjacent attacks gain advantage while ranged attacks gain disadvantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "disadvantage" }),
  makeCondition({ id: "restrained", name: "Restrained", abbreviation: "RES", color: "#bf765d", note: "Movement is unavailable, own attacks have disadvantage, and incoming attacks have advantage.", selfAttack: "disadvantage", vsMelee: "advantage", vsRanged: "advantage", immobile: true }),
  makeCondition({ id: "stunned", name: "Stunned", abbreviation: "STU", color: "#e0b055", note: "Incapacitated and immobile; incoming attacks have advantage.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true }),
  makeCondition({ id: "unconscious", name: "Unconscious", abbreviation: "UNC", color: "#657080", note: "Incapacitated and immobile; incoming attacks have advantage and melee hits automatically critical.", vsMelee: "advantage", vsRanged: "advantage", incapacitated: true, immobile: true, autoCriticalMelee: true }),
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

export const targetAutoCritical = (conditions, rangeType = "melee") =>
  rangeType === "melee" && normalizeConditions(conditions).some((conditionId) => CONDITION_BY_ID[conditionId].autoCriticalMelee);

export function toggleCondition(conditions, conditionId) {
  const condition = conditionById(conditionId);
  if (!condition) return { ok: false, code: "UNKNOWN_CONDITION", message: "That condition is not part of the Nightforge condition engine.", recovery: "Choose one of the 15 available conditions.", retryable: false };
  const current = normalizeConditions(conditions);
  return {
    ok: true,
    value: current.includes(condition.id)
      ? current.filter((id) => id !== condition.id)
      : [...current, condition.id],
    condition,
  };
}
