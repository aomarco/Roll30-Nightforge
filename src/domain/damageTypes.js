/**
 * Damage types, and the three defences that read them.
 *
 * Every weapon in the catalog and every monster attack already carried a damage
 * type, and every monster already carried its resistances, but nothing compared
 * the two: the rolled number was subtracted whole. This module is that missing
 * comparison and nothing else.
 */

const makeType = (id, name) => Object.freeze({ id, name });

/**
 * The thirteen SRD damage types. The imported data only ever uses ten of them —
 * Force, Psychic and Thunder appear in immunity lists but never as the type of
 * an attack — and they are listed anyway because a hand-typed attack or a
 * hand-set resistance should not be silently rejected for naming a real type.
 */
export const DAMAGE_TYPES = Object.freeze([
  makeType("acid", "Acid"),
  makeType("bludgeoning", "Bludgeoning"),
  makeType("cold", "Cold"),
  makeType("fire", "Fire"),
  makeType("force", "Force"),
  makeType("lightning", "Lightning"),
  makeType("necrotic", "Necrotic"),
  makeType("piercing", "Piercing"),
  makeType("poison", "Poison"),
  makeType("psychic", "Psychic"),
  makeType("radiant", "Radiant"),
  makeType("slashing", "Slashing"),
  makeType("thunder", "Thunder"),
]);

export const DAMAGE_TYPE_BY_ID = Object.freeze(
  Object.fromEntries(DAMAGE_TYPES.map((type) => [type.id, type])),
);

export const DAMAGE_TYPE_IDS = Object.freeze(DAMAGE_TYPES.map((type) => type.id));

/**
 * The three defences, and what each does to a number. Immunity is listed first
 * because it wins: a creature that is immune does not also get to be vulnerable.
 */
export const DAMAGE_DEFENCES = Object.freeze(["immune", "resistant", "vulnerable"]);

export const DAMAGE_DEFENCE_LABELS = Object.freeze({
  immune: "Immune",
  resistant: "Resistant",
  vulnerable: "Vulnerable",
});

/**
 * The generator writes title case ("Fire"), the app stores lowercase ids
 * ("fire"), and a person typing into the setup inspector will write whatever
 * they like. All three have to land on the same value, so everything is folded
 * down before the lookup rather than matched in several shapes.
 */
export function normalizeDamageType(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return DAMAGE_TYPE_BY_ID[id] ? id : null;
}

export const damageTypeName = (value) => DAMAGE_TYPE_BY_ID[normalizeDamageType(value)]?.name || null;

/**
 * Splits an SRD defence list into the part the engine can run and the part it
 * cannot.
 *
 * Roughly a quarter of the monsters with resistances carry a qualified entry
 * such as "Bludgeoning, Piercing, And Slashing From Nonmagical Weapons That
 * Aren't Silvered". No weapon in the catalog records whether it is silvered,
 * adamantine or magical, so there is nothing to test the qualifier against.
 * Splitting those entries into their three plain types would halve a silvered
 * sword's damage against a werewolf, which is the opposite of what the line
 * says. So they come back whole in `unapplied`, to be shown as reference text
 * next to the rest of the stat block, and the engine leaves them alone.
 */
export function normalizeDamageTypeList(values) {
  const applied = [];
  const unapplied = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const id = normalizeDamageType(entry);
    if (id) {
      if (!seen.has(id)) { applied.push(id); seen.add(id); }
      continue;
    }
    const prose = typeof entry === "string" ? entry.trim() : "";
    if (prose) unapplied.push(prose);
  }
  return { applied, unapplied };
}

/** The persisted form: ids only, deduped, unknown entries dropped. */
export const normalizeDamageTypes = (values) => normalizeDamageTypeList(values).applied;

const wholeDamage = (amount) => Math.max(0, Math.floor(Number(amount) || 0));

/**
 * Applies immunity, resistance and vulnerability to a rolled number.
 *
 * The order is the SRD's: this happens after every other modifier, so it takes
 * the finished total rather than reaching back into the dice. Only one defence
 * ever applies — a creature listed as both resistant and vulnerable to the same
 * type is a data error, and immunity settling it is the least surprising answer.
 *
 * Untyped damage is unaffected. That is what makes the change safe for the
 * hand-applied damage control, where the table may not care to name a type.
 */
export function applyDamageDefense(token, amount, damageType) {
  const incoming = wholeDamage(amount);
  const type = normalizeDamageType(damageType);
  if (!type) return { amount: incoming, incoming, multiplier: 1, defense: null, damageType: null };
  const has = (list) => Array.isArray(list) && list.includes(type);
  const defense = has(token?.damageImmunities)
    ? "immune"
    : has(token?.damageVulnerabilities)
      ? "vulnerable"
      : has(token?.damageResistances)
        ? "resistant"
        : null;
  // Halving rounds down, which is the only rounding 5e ever uses.
  const next = defense === "immune"
    ? 0
    : defense === "vulnerable"
      ? incoming * 2
      : defense === "resistant"
        ? Math.floor(incoming / 2)
        : incoming;
  return {
    amount: next,
    incoming,
    multiplier: defense === "immune" ? 0 : defense === "vulnerable" ? 2 : defense === "resistant" ? 0.5 : 1,
    defense,
    damageType: type,
  };
}

/**
 * The sentence the log and the cinematic both use. Kept here so the two cannot
 * drift apart, and returns empty for the ordinary case so callers can append it
 * without checking.
 */
export function damageDefenseText(result) {
  if (!result?.defense) return "";
  const name = damageTypeName(result.damageType);
  if (result.defense === "immune") return ` ${name} damage is negated by immunity.`;
  if (result.defense === "resistant") return ` ${result.incoming} halved by ${name} resistance.`;
  return ` ${result.incoming} doubled by ${name} vulnerability.`;
}
