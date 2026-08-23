import { combineAttackModes, rollDie } from "./attacks.js";
import {
  autoFailingSaveConditions,
  conditionAutoFailsSave,
  conditionSaveModes,
} from "./conditions.js";
import { ABILITY_KEYS, ABILITIES, abilityModifier } from "./heroes.js";
import {
  appendEncounterLog,
  normalizeTableTokens,
  skillById,
  tokenAbilityScore,
  tokenSaveModifier,
  tokenSkillModifier,
} from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });

export const CHECK_KIND_SAVE = "save";
export const CHECK_KIND_ABILITY = "ability";
export const CHECK_KIND_SKILL = "skill";

export const CHECK_MODE_NORMAL = "normal";
export const CHECK_MODE_ADVANTAGE = "advantage";
export const CHECK_MODE_DISADVANTAGE = "disadvantage";

export const MIN_CHECK_DC = 1;
export const MAX_CHECK_DC = 40;

const ABILITY_NAME = Object.freeze(Object.fromEntries(ABILITIES.map((ability) => [ability.id, ability.name])));

/**
 * A bare ability check carries no proficiency of its own — proficiency reaches
 * a check only through a skill — so it is the raw ability modifier.
 */
const abilityCheckModifier = (token, ability) =>
  abilityModifier(tokenAbilityScore(token, ability));

const requestedModeSource = (mode) =>
  mode === CHECK_MODE_ADVANTAGE || mode === CHECK_MODE_DISADVANTAGE
    ? [{ mode, code: `requested-${mode}`, label: `${mode === CHECK_MODE_ADVANTAGE ? "Advantage" : "Disadvantage"} chosen at the table` }]
    : [];

/**
 * A difficulty class is optional. Without one the roll still resolves and
 * reports its total, which covers contested rolls and open-ended checks where
 * the number matters but there is nothing fixed to beat.
 */
function normalizeDc(dc) {
  if (dc === null || dc === undefined || dc === "") return null;
  const number = Number(dc);
  if (!Number.isFinite(number)) return null;
  return Math.max(MIN_CHECK_DC, Math.min(MAX_CHECK_DC, Math.floor(number)));
}

function rollableToken(scene, tokenId) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Checks and saving throws can be rolled only during an active Battle.",
    "Start Battle before rolling.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure(
    "CHECK_TOKEN_MISSING",
    "That token is no longer on this Table.",
    "Select another token.",
  );
  return success({ tokens, token });
}

/**
 * The shared d20 engine behind saves and checks. Advantage and disadvantage are
 * resolved by rolling twice and picking by index — never by re-rolling — so the
 * discarded die stays visible in the outcome, matching how attacks are shown.
 *
 * No turn resource is spent. Saving throws happen on other creatures' turns and
 * a check is not an Action, so neither may consume the active token's economy.
 */
function resolveD20({ token, kind, ability, skill, dc, modifier, sources, autoFail, random }) {
  const mode = combineAttackModes(sources);
  const rolls = autoFail
    ? []
    : Array.from({ length: mode === CHECK_MODE_NORMAL ? 1 : 2 }, () => rollDie(20, random));
  const selectedIndex = autoFail
    ? -1
    : mode === CHECK_MODE_DISADVANTAGE
      ? (rolls[1] < rolls[0] ? 1 : 0)
      : (rolls[1] > rolls[0] ? 1 : 0);
  const naturalRoll = autoFail ? null : rolls[selectedIndex];
  const total = autoFail ? null : naturalRoll + modifier;
  const succeeded = autoFail ? false : dc === null ? null : total >= dc;
  return {
    kind,
    tokenId: token.id,
    tokenName: token.name,
    ability,
    abilityName: ABILITY_NAME[ability] || null,
    skillId: skill?.id || null,
    skillName: skill?.name || null,
    proficient: skill
      ? (token.skillProficiencies || []).includes(skill.id)
      : kind === CHECK_KIND_SAVE
        ? (token.saveProficiencies || []).includes(ability)
        : false,
    modifier,
    sources,
    mode,
    rolls,
    selectedIndex,
    naturalRoll,
    total,
    dc,
    succeeded,
    autoFailed: Boolean(autoFail),
    autoFailReasons: autoFail ? autoFail.map((condition) => condition.name) : [],
  };
}

const verdictText = (outcome) => {
  if (outcome.autoFailed) return `fails automatically (${outcome.autoFailReasons.join(", ")})`;
  if (outcome.succeeded === null) return `scores ${outcome.total}`;
  return outcome.succeeded ? `succeeds with ${outcome.total}` : `fails with ${outcome.total}`;
};

export function performSavingThrow(scene, specification = {}, { random = Math.random } = {}) {
  const context = rollableToken(scene, specification.tokenId);
  if (!context.ok) return context;
  const { token } = context.value;
  const ability = specification.ability;
  if (!ABILITY_KEYS.includes(ability)) return failure(
    "UNKNOWN_SAVE_ABILITY",
    "A saving throw needs one of the six abilities.",
    "Choose Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma.",
  );
  const dc = normalizeDc(specification.dc);
  const autoFailConditions = conditionAutoFailsSave(token.conditions, ability)
    ? autoFailingSaveConditions(token.conditions, ability)
    : null;
  const sources = [
    ...requestedModeSource(specification.mode),
    ...conditionSaveModes(token.conditions, ability),
  ];
  const outcome = resolveD20({
    token,
    kind: CHECK_KIND_SAVE,
    ability,
    skill: null,
    dc,
    modifier: tokenSaveModifier(token, ability),
    sources,
    autoFail: autoFailConditions,
    random,
  });
  const dcText = dc === null ? "" : ` against DC ${dc}`;
  return success({
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(
        scene.encounter.log,
        `${token.name} rolls a ${outcome.abilityName} saving throw${dcText} and ${verdictText(outcome)}.`,
      ),
    },
  }, { outcome });
}

export function performAbilityCheck(scene, specification = {}, { random = Math.random } = {}) {
  const context = rollableToken(scene, specification.tokenId);
  if (!context.ok) return context;
  const { token } = context.value;
  const skill = specification.skillId ? skillById(specification.skillId) : null;
  if (specification.skillId && !skill) return failure(
    "UNKNOWN_SKILL",
    "That skill is not one of the eighteen Nightforge tracks.",
    "Choose a listed skill or roll a plain ability check.",
  );
  const ability = skill ? skill.ability : specification.ability;
  if (!ABILITY_KEYS.includes(ability)) return failure(
    "UNKNOWN_CHECK_ABILITY",
    "An ability check needs one of the six abilities.",
    "Choose Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma.",
  );
  const dc = normalizeDc(specification.dc);
  const modifier = skill ? tokenSkillModifier(token, skill.id) : abilityCheckModifier(token, ability);
  const outcome = resolveD20({
    token,
    kind: skill ? CHECK_KIND_SKILL : CHECK_KIND_ABILITY,
    ability,
    skill,
    dc,
    modifier,
    sources: requestedModeSource(specification.mode),
    autoFail: null,
    random,
  });
  const label = skill ? `${skill.name} check` : `${outcome.abilityName} check`;
  const dcText = dc === null ? "" : ` against DC ${dc}`;
  return success({
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(
        scene.encounter.log,
        `${token.name} rolls a ${label}${dcText} and ${verdictText(outcome)}.`,
      ),
    },
  }, { outcome });
}

export const checkModifierFor = (token, { ability, skillId }) =>
  skillId ? tokenSkillModifier(token, skillId) : abilityCheckModifier(token, ability);
