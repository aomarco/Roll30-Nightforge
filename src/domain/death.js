import { combineAttackModes, rollDie } from "./attacks.js";
import { performAbilityCheck } from "./checks.js";
import {
  activeTurnContext,
  chebyshevFeet,
  HELP_REACH_FEET,
  tokenIsIncapacitated,
} from "./combat.js";
import { completeEncounterIfNeeded } from "./encounter.js";
import {
  appendEncounterLog,
  DEATH_SAVES_REQUIRED,
  isDying,
  isStable,
  normalizeTableTokens,
  revivedTokenPatch,
  updateToken,
} from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });

/** A death saving throw is always against 10. Nothing modifies the number. */
export const DEATH_SAVE_DC = 10;
export const STABILIZE_DC = 10;

/**
 * One death saving throw.
 *
 * Deliberately not built on `performSavingThrow`: a death save shares the shape
 * of a saving throw and almost none of its rules. It has no ability, so no
 * modifier and no proficiency; it cannot be failed automatically by a condition,
 * because the creature is already unconscious and rolling anyway; and both ends
 * of the die do something no other save does — a natural twenty stands the
 * creature up at one hit point, and a natural one costs two failures rather than
 * one. Sharing the code would mean five exceptions inside it.
 *
 * The outcome is shaped like a check outcome regardless, so the existing check
 * cinematic can show it without a second animation being written.
 */
export function rollDeathSave(scene, tokenId, { random = Math.random } = {}) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Death saving throws can be rolled only during an active Battle.",
    "Start Battle before rolling.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure(
    "DEATH_SAVE_TOKEN_MISSING",
    "That token is no longer on this Table.",
    "Select another token.",
  );
  if (token.dead) return failure(
    "DEATH_SAVE_ALREADY_DEAD",
    `${token.name} is dead and has no saving throws left to make.`,
    "Restart the Battle to restore fallen tokens.",
  );
  if (token.hp > 0) return failure(
    "DEATH_SAVE_NOT_DYING",
    `${token.name} is still standing and does not roll death saving throws.`,
    "Only a creature at zero hit points rolls to survive.",
  );
  if (isStable(token)) return failure(
    "DEATH_SAVE_STABLE",
    `${token.name} is stable and has stopped rolling.`,
    "A stable creature stays unconscious at zero hit points until it is healed.",
  );
  const turn = activeTurnContext(scene);
  if (!turn.ok) return turn;
  if (turn.value.token.id !== token.id) return failure(
    "DEATH_SAVE_NOT_ACTIVE",
    `${token.name} rolls a death saving throw only on their own turn.`,
    "Wait until that token is active in initiative.",
  );
  if (turn.value.resources.deathSaveRolled) return failure(
    "DEATH_SAVE_ALREADY_ROLLED",
    `${token.name} has already rolled a death saving throw this turn.`,
    "End the turn and wait for their next turn.",
  );

  // No source ever grants advantage on a death save today. The list is built
  // anyway so the cinematic renders the same way as every other roll, and so a
  // future source has somewhere to be added rather than a branch to invent.
  const sources = [];
  const mode = combineAttackModes(sources);
  const rolls = [rollDie(20, random)];
  const naturalRoll = rolls[0];
  const criticalSuccess = naturalRoll === 20;
  const criticalFailure = naturalRoll === 1;
  const succeeded = naturalRoll >= DEATH_SAVE_DC;

  // A natural twenty is not a success on the tally — it ends the dying outright.
  const successes = criticalSuccess
    ? 0
    : Math.min(DEATH_SAVES_REQUIRED, token.deathSaveSuccesses + (succeeded ? 1 : 0));
  const failures = criticalSuccess
    ? 0
    : Math.min(DEATH_SAVES_REQUIRED, token.deathSaveFailures + (succeeded ? 0 : criticalFailure ? 2 : 1));

  const died = failures >= DEATH_SAVES_REQUIRED;
  const stabilised = !criticalSuccess && !died && successes >= DEATH_SAVES_REQUIRED;
  const patch = criticalSuccess
    ? revivedTokenPatch(token, 1)
    : { deathSaveSuccesses: successes, deathSaveFailures: failures, dead: died };

  const resultText = criticalSuccess
    ? `${token.name} rolls a natural twenty and comes round with 1 hit point.`
    : died
      ? `${token.name} fails a third death saving throw and dies.`
      : stabilised
        ? `${token.name} succeeds a third death saving throw and is stable.`
        : succeeded
          ? `${token.name} succeeds a death saving throw (${successes} of ${DEATH_SAVES_REQUIRED}).`
          : `${token.name} fails ${criticalFailure ? "a death saving throw twice over on a natural one" : "a death saving throw"} (${failures} of ${DEATH_SAVES_REQUIRED}).`;

  const outcome = {
    kind: "death",
    tokenId: token.id,
    tokenName: token.name,
    ability: null,
    abilityName: null,
    skillId: null,
    skillName: null,
    proficient: false,
    modifier: 0,
    sources,
    mode,
    rolls,
    selectedIndex: 0,
    naturalRoll,
    total: naturalRoll,
    dc: DEATH_SAVE_DC,
    succeeded,
    autoFailed: false,
    autoFailReasons: [],
    successes: criticalSuccess ? 0 : successes,
    failures: criticalSuccess ? 0 : failures,
    criticalSuccess,
    criticalFailure,
    died,
    stabilised,
    revived: criticalSuccess,
  };

  // A third failure can be the moment a side runs out of creatures, because a
  // dying creature counts as still in the fight and a dead one does not. So the
  // last death saving throw of a Battle has to be able to end it.
  const completed = completeEncounterIfNeeded(
    updateToken(tokens, tokenId, patch),
    {
      ...scene.encounter,
      resources: {
        [token.id]: { ...turn.value.resources, deathSaveRolled: true },
      },
      log: appendEncounterLog(scene.encounter.log, resultText),
    },
  );
  if (!completed.ok) return completed;
  return success(completed.value, {
    outcome: { ...outcome, completed: completed.completed, winnerFaction: completed.winnerFaction || null },
  });
}

/**
 * Who the active creature can stabilise with first aid right now.
 *
 * Stabilising follows the 2014 SRD action: spend the Action beside a dying
 * creature and make a DC 10 Wisdom (Medicine) check. Only Heroes use death
 * saving throws in Nightforge, so defeated monsters never appear as targets.
 */
export function stabilizeAvailability(scene, targetTokenId, viewport) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, tokens, resources } = context.value;
  if (token.hp <= 0 || tokenIsIncapacitated(token)) return failure(
    "STABILIZE_INCAPACITATED",
    `${token.name} cannot stabilise anyone while incapacitated or down.`,
    "Use a standing creature's turn.",
  );
  if (resources.dashed) return failure("STABILIZE_AFTER_DASH", "Stabilise is unavailable after Dash.", "Use remaining movement or end the turn.");
  if (resources.swapped) return failure("STABILIZE_AFTER_SWAP", "Stabilise is unavailable after a weapon swap.", "Use remaining movement or end the turn.");
  if (resources.actionSpent) return failure(
    "STABILIZE_ACTION_SPENT",
    `Stabilise is unavailable because ${resources.actionType || "the Action"} was already used.`,
    "Use remaining movement or end the turn.",
  );
  const targets = tokens.filter((entry) =>
    entry.id !== token.id
    && Boolean(entry.heroId)
    && isDying(entry)
    && !isStable(entry)
    && chebyshevFeet(token.position, entry.position, viewport) <= HELP_REACH_FEET);
  if (!targets.length) return failure(
    "STABILIZE_NO_TARGET_ADJACENT",
    `${token.name} has no dying Hero within ${HELP_REACH_FEET} feet to stabilise.`,
    "Move beside a dying Hero first.",
  );
  if (!targetTokenId) return success({ ...context.value, targets });
  const target = targets.find((entry) => entry.id === targetTokenId);
  if (!target) return failure(
    "STABILIZE_TARGET_UNAVAILABLE",
    "That creature is not an adjacent dying Hero who needs stabilising.",
    "Choose a dying Hero within five feet.",
  );
  return success({ ...context.value, targets, target });
}

export function stabilizeCreature(scene, targetTokenId, viewport, { random = Math.random } = {}) {
  const available = stabilizeAvailability(scene, targetTokenId, viewport);
  if (!available.ok) return available;
  const { token, target, tokens, resources } = available.value;
  const checked = performAbilityCheck(scene, {
    tokenId: token.id,
    skillId: "medicine",
    dc: STABILIZE_DC,
  }, { random });
  if (!checked.ok) return checked;

  const stabilised = checked.outcome.succeeded;
  const nextTokens = stabilised
    ? updateToken(tokens, target.id, {
      deathSaveSuccesses: DEATH_SAVES_REQUIRED,
      deathSaveFailures: 0,
      dead: false,
    })
    : tokens;
  const encounter = {
    ...checked.value.encounter,
    resources: {
      [token.id]: { ...resources, actionSpent: true, actionType: "stabilize" },
    },
    log: stabilised
      ? appendEncounterLog(checked.value.encounter.log, `${token.name} stabilises ${target.name}.`)
      : checked.value.encounter.log,
  };
  return success({ tokens: nextTokens, encounter }, {
    outcome: {
      ...checked.outcome,
      stabilised,
      stabilizedTargetId: target.id,
      stabilizedTargetName: target.name,
    },
  });
}
