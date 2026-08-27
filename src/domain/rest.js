import { deriveHero } from "./heroes.js";
import { restoreItemCharges } from "./items.js";
import { normalizeRacialUses, racialStateFor, resetRacialUses } from "./racialTraits.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery) => ({ ok: false, code, message, recovery, retryable: true });
const randomUnit = (random) => Math.max(0, Math.min(0.999999999999, Number(random?.()) || 0));
const rollDie = (sides, random) => Math.floor(randomUnit(random) * Math.max(1, Math.floor(Number(sides) || 1))) + 1;

export const hitDiceTotal = (hero) => Math.max(1, Math.min(20, Math.floor(Number(hero?.level) || 1)));

export const hitDiceSpent = (hero) => Math.max(0, Math.min(hitDiceTotal(hero), Math.floor(Number(hero?.hitDiceSpent) || 0)));

export const hitDiceAvailable = (hero) => hitDiceTotal(hero) - hitDiceSpent(hero);

const restPatch = (hero, patch) => {
  const derived = deriveHero(hero);
  const traitIds = derived.traitIds;
  return {
    ...patch,
    racialUses: normalizeRacialUses(patch.racialUses ?? hero?.racialUses, traitIds),
  };
};

/** Spend hit dice during a short rest and restore short-rest racial/item uses. */
export function shortRest(hero, { diceToSpend = 0, random = () => 0.5 } = {}) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "A persisted Hero is required to take a rest.", "Choose a Hero and retry.");
  const dice = Math.max(0, Math.floor(Number(diceToSpend) || 0));
  const available = hitDiceAvailable(hero);
  if (dice > available) return failure(
    "REST_HIT_DICE_UNAVAILABLE",
    `Only ${available} hit ${available === 1 ? "die is" : "dice are"} available.`,
    "Spend fewer hit dice or take a long rest to recover some.",
  );
  const derived = deriveHero(hero);
  const constitutionModifier = derived.abilityModifiers.con;
  const rolls = Array.from({ length: dice }, () => rollDie(derived.class.hitDie, random));
  const healing = rolls.reduce((total, roll) => total + Math.max(0, roll + constitutionModifier), 0);
  const previousHp = Math.max(0, Math.min(derived.hp, Math.floor(Number(hero.currentHp ?? derived.hp) || 0)));
  const nextHp = Math.min(derived.hp, previousHp + healing);
  const racialState = racialStateFor(derived.race.id, derived.subrace?.id, hero.racialChoices);
  const itemCharges = restoreItemCharges(hero, "short");
  const value = restPatch(hero, {
    currentHp: nextHp,
    hitDiceSpent: hitDiceSpent(hero) + dice,
    itemCharges,
    racialUses: resetRacialUses(hero.racialUses, racialState.traitIds, "short"),
  });
  return success(value, {
    outcome: {
      kind: "short",
      heroId: hero.id,
      dice,
      rolls,
      healing,
      previousHp,
      nextHp,
      hitDiceSpent: value.hitDiceSpent,
      hitDiceAvailable: available - dice,
    },
  });
}
/** Restore full HP, recover half the spent hit dice, and refresh long-rest uses. */
export function longRest(hero) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "A persisted Hero is required to take a rest.", "Choose a Hero and retry.");
  const derived = deriveHero(hero);
  const spent = hitDiceSpent(hero);
  const recovered = Math.min(spent, Math.max(1, Math.ceil(hitDiceTotal(hero) / 2)));
  const racialState = racialStateFor(derived.race.id, derived.subrace?.id, hero.racialChoices);
  const value = restPatch(hero, {
    currentHp: derived.hp,
    hitDiceSpent: spent - recovered,
    itemCharges: restoreItemCharges(hero, "long"),
    racialUses: resetRacialUses(hero.racialUses, racialState.traitIds, "long"),
  });
  return success(value, {
    outcome: {
      kind: "long",
      heroId: hero.id,
      previousHp: hero.currentHp ?? derived.hp,
      nextHp: derived.hp,
      hitDiceRecovered: recovered,
      hitDiceSpent: value.hitDiceSpent,
      hitDiceAvailable: hitDiceTotal(hero) - value.hitDiceSpent,
      restHours: derived.restHours,
    },
  });
}
