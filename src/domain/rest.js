import { deriveHero } from "./heroes.js";
import { restoreItemCharges } from "./items.js";
import { normalizeRacialUses, racialStateFor, resetRacialUses } from "./racialTraits.js";
import { applyRecoveryEvent, normalizeRecoveryLedger } from "./resources.js";
import { recoverItemInstanceCharges } from "./itemInstances.js";

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

const recoveryAlreadyProcessed = (hero, eventId) => Boolean(eventId && normalizeRecoveryLedger(hero?.recoveryLedger).processedEventIds.includes(eventId));

const recoveryPatch = (hero, patch, { eventId = null, kind = "rest" } = {}) => {
  if (!eventId) return patch;
  const marked = applyRecoveryEvent(hero?.recoveryLedger, { id: eventId, kind, source: "rest" });
  return marked.ok ? { ...patch, recoveryLedger: marked.value } : patch;
};

const restoreItemState = (hero, restKind, options = {}) => {
  const itemCharges = restoreItemCharges(hero, restKind, undefined, options);
  if (!Array.isArray(hero?.itemInstances) || !hero.itemInstances.length) return { itemCharges };
  const recovered = recoverItemInstanceCharges(hero.itemInstances, restKind, options);
  return { itemCharges, itemInstances: recovered.ok ? recovered.value : hero.itemInstances };
};

/** Spend hit dice during a short rest and restore short-rest racial/item uses. */
export function shortRest(hero, { diceToSpend = 0, random = () => 0.5, eventId = null } = {}) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "A persisted Hero is required to take a rest.", "Choose a Hero and retry.");
  if (recoveryAlreadyProcessed(hero, eventId)) return success(hero, { replayed: true, outcome: { kind: "short", heroId: hero.id, eventId } });
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
  const itemState = restoreItemState(hero, "short", { random });
  const value = restPatch(hero, recoveryPatch(hero, {
    currentHp: nextHp,
    hitDiceSpent: hitDiceSpent(hero) + dice,
    ...itemState,
    racialUses: resetRacialUses(hero.racialUses, racialState.traitIds, "short"),
  }, { eventId, kind: "short-rest" }));
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
/** Recover up to half the total Hit Dice (rounded down, minimum one). */
export function longRest(hero, { eventId = null } = {}) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "A persisted Hero is required to take a rest.", "Choose a Hero and retry.");
  if (recoveryAlreadyProcessed(hero, eventId)) return success(hero, { replayed: true, outcome: { kind: "long", heroId: hero.id, eventId } });
  const derived = deriveHero(hero);
  const spent = hitDiceSpent(hero);
  const recovered = Math.min(spent, Math.max(1, Math.floor(hitDiceTotal(hero) / 2)));
  const racialState = racialStateFor(derived.race.id, derived.subrace?.id, hero.racialChoices);
  const value = restPatch(hero, recoveryPatch(hero, {
    currentHp: derived.hp,
    hitDiceSpent: spent - recovered,
    ...restoreItemState(hero, "long"),
    racialUses: resetRacialUses(hero.racialUses, racialState.traitIds, "long"),
  }, { eventId, kind: "long-rest" }));
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

/** A GM-selected campaign day, independent of resting or the browser clock. */
export function dailyItemReset(hero, { day, random = () => 0.5, eventId = null } = {}) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "Choose a persisted Hero.", "Select a Hero and retry.");
  if (!Number.isSafeInteger(day) || day < 1) return failure("DAWN_DAY_REQUIRED", "Enter a positive campaign day for this dawn.", "Use the day in your game, not a real-world date.");
  if (day < (hero.dailyResetDay || 0)) return failure("DAWN_ALREADY_PASSED", "That dawn has already passed for this Hero.", "Choose the current campaign day.");
  const dawnEventId = eventId || `dawn-${day}`;
  if (day === hero.dailyResetDay || recoveryAlreadyProcessed(hero, dawnEventId)) return success({}, { replayed: true, outcome: { kind: "daily", day, rolls: [] } });
  const rolls = [];
  const itemState = restoreItemState(hero, "daily", { random, onRoll: (roll) => rolls.push(roll) });
  return success(recoveryPatch(hero, { ...itemState, dailyResetDay: day }, { eventId: dawnEventId, kind: "daily-reset" }), { outcome: { kind: "daily", day, rolls, eventId: dawnEventId } });
}

export function previewRest(hero, { kind = "long", diceToSpend = 0, random = () => 0.5 } = {}) {
  if (!hero?.id) return failure("REST_HERO_REQUIRED", "A persisted Hero is required to preview a rest.", "Choose a Hero and retry.");
  const result = kind === "short"
    ? shortRest(hero, { diceToSpend, random })
    : kind === "long"
      ? longRest(hero)
      : failure("REST_KIND_INVALID", "Choose a short or long rest.", "Select a supported rest workflow.");
  if (!result.ok) return result;
  return success({
    status: "preview",
    kind,
    heroId: hero.id,
    patch: result.value,
    outcome: result.outcome,
  }, { preview: true });
}

export function commitRestPreview(hero, preview, { eventId } = {}) {
  if (!hero?.id || !preview || preview.heroId !== hero.id || !["short", "long"].includes(preview.kind)) return failure(
    "REST_PREVIEW_INVALID",
    "That rest preview no longer matches the selected Hero.",
    "Preview the rest again before committing it.",
  );
  const stableEventId = eventId || `${preview.kind}-rest-${hero.id}`;
  const marked = applyRecoveryEvent(hero.recoveryLedger, { id: stableEventId, kind: `${preview.kind}-rest`, source: "rest" });
  if (!marked.ok) return marked;
  if (marked.replayed) return success(hero, { replayed: true, committed: true, outcome: preview.outcome });
  return success({ ...preview.patch, recoveryLedger: marked.value }, {
    committed: true,
    replayed: false,
    outcome: { ...preview.outcome, eventId: stableEventId },
  });
}
