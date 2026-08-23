import { applyDamageDefense, damageDefenseText } from "./damageTypes.js";
import { completeEncounterIfNeeded } from "./encounter.js";
import { appendEncounterLog, DEATH_SAVES_REQUIRED, normalizeTableTokens, updateToken } from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });

export const MAX_VITALITY_ADJUSTMENT = 999;

const wholeAmount = (amount) =>
  Math.max(0, Math.min(MAX_VITALITY_ADJUSTMENT, Math.floor(Number(amount) || 0)));

/**
 * Temporary hit points are spent before real ones and are never restored by
 * healing, so damage has to be split across the two pools rather than simply
 * subtracted. Returns the pieces a caller needs to patch a token plus how much
 * the buffer absorbed, which is what the cinematic reports.
 */
export function applyDamageToPools(token, amount) {
  const incoming = wholeAmount(amount);
  const tempHp = Math.max(0, Math.floor(Number(token?.tempHp) || 0));
  const absorbed = Math.min(tempHp, incoming);
  return {
    absorbed,
    nextTempHp: tempHp - absorbed,
    nextHp: Math.max(0, Math.floor(Number(token?.hp) || 0) - (incoming - absorbed)),
  };
}

/**
 * Everything that happens to a creature when damage lands, as one patch.
 *
 * This lives beside the hit point pools rather than in the death module because
 * it needs `applyDamageToPools`, and the death module is imported by this one —
 * putting it there would make the two files import each other.
 *
 * Three outcomes, and which one fires depends on where the creature already was:
 *
 *   - Standing, and the damage does not finish them: ordinary subtraction.
 *   - Standing, and it does: they drop to zero, fall unconscious, and start
 *     making death saving throws with a clean tally.
 *   - Already dying: the hit does not subtract anything, because there is
 *     nothing left to subtract. It is a failed death save instead, and two of
 *     them on a critical.
 *
 * Death saving throws are a player-character rule. A monster that drops to zero
 * simply dies, which is both what the SRD says and what this app has always
 * done — so only a token standing on a Hero record gets the clock. Without that
 * split, killing the last goblin would leave it bleeding out and the Battle
 * would never reach its completion card.
 */
export function resolveIncomingDamage(token, amount, { critical = false } = {}) {
  const incoming = wholeAmount(amount);
  const dying = token.hp <= 0 && !token.dead;
  if (dying) {
    const failures = Math.min(DEATH_SAVES_REQUIRED, token.deathSaveFailures + (critical ? 2 : 1));
    return {
      patch: { deathSaveFailures: failures, dead: failures >= DEATH_SAVES_REQUIRED },
      absorbed: 0,
      previousHp: token.hp,
      nextHp: 0,
      nextTempHp: token.tempHp,
      downed: false,
      dyingHit: true,
      failuresAdded: critical ? 2 : 1,
      died: failures >= DEATH_SAVES_REQUIRED,
      instantDeath: false,
    };
  }
  const pools = applyDamageToPools(token, incoming);
  const felled = token.hp > 0 && pools.nextHp <= 0;
  const makesDeathSaves = Boolean(token.heroId);
  const downed = felled && makesDeathSaves;
  // Damage left over after a creature is reduced to zero kills outright when it
  // equals their whole hit point maximum. The overflow has to be worked out
  // here because `applyDamageToPools` floors at zero, so by the time it returns
  // the number that would have gone negative is already gone.
  const overflow = Math.max(0, incoming - pools.absorbed - Math.max(0, token.hp));
  const instantDeath = downed && overflow >= token.maxHp;
  // A monster that reaches zero is simply killed; a Hero is killed only by
  // damage large enough to blow through their whole maximum on top of it.
  const killed = felled && (!makesDeathSaves || instantDeath);
  return {
    patch: {
      hp: pools.nextHp,
      tempHp: pools.nextTempHp,
      ...(felled
        ? {
          conditions: downed ? [...token.conditions, "unconscious"] : token.conditions,
          deathSaveSuccesses: 0,
          deathSaveFailures: killed ? DEATH_SAVES_REQUIRED : 0,
          dead: killed,
        }
        : {}),
    },
    absorbed: pools.absorbed,
    previousHp: token.hp,
    nextHp: pools.nextHp,
    nextTempHp: pools.nextTempHp,
    downed,
    felled,
    dyingHit: false,
    failuresAdded: 0,
    died: killed,
    instantDeath,
  };
}

/**
 * The sentence for whatever the damage did beyond taking hit points off, so the
 * log reads as an account of the fight rather than a column of numbers.
 */
export function damageStateText(token, result) {
  if (result.instantDeath) return ` The blow is enough to kill ${token.name} outright.`;
  if (result.dyingHit && result.died) return ` ${token.name} fails a final death saving throw and dies.`;
  if (result.dyingHit) return ` ${token.name} fails ${result.failuresAdded === 2 ? "two death saving throws" : "a death saving throw"}.`;
  if (result.downed) return ` ${token.name} falls unconscious and begins making death saving throws.`;
  if (result.felled) return ` ${token.name} is defeated.`;
  return "";
}

function activeBattleToken(scene, tokenId) {
  if (!scene?.encounter || scene.encounter.status !== "active") return failure(
    "ACTIVE_BATTLE_REQUIRED",
    "Hit points can be changed only during an active Battle.",
    "Start Battle before healing or damaging a token.",
  );
  const tokens = normalizeTableTokens(scene.tokens);
  const token = tokens.find((entry) => entry.id === tokenId);
  if (!token) return failure(
    "VITALITY_TOKEN_MISSING",
    "That token is no longer on this Table.",
    "Select another token.",
  );
  return success({ tokens, token });
}

export function healToken(scene, tokenId, amount) {
  const context = activeBattleToken(scene, tokenId);
  if (!context.ok) return context;
  const { tokens, token } = context.value;
  const requested = wholeAmount(amount);
  if (requested <= 0) return failure(
    "HEAL_AMOUNT_REQUIRED",
    "Healing needs a whole number above zero.",
    "Enter an amount and try again.",
  );
  // Healing still cannot raise the dead. It can now raise the dying, which is
  // the whole point of death saving throws: a creature at zero is on a clock,
  // not gone, and any healing at all stops the clock and stands them up.
  if (token.dead) return failure(
    "HEAL_TARGET_DEFEATED",
    `${token.name} is dead and cannot be healed.`,
    "Restart the Battle to restore fallen tokens.",
  );
  if (token.hp >= token.maxHp) return failure(
    "HEAL_TARGET_UNHURT",
    `${token.name} is already at full hit points.`,
    "Choose a wounded token.",
  );
  const revived = token.hp <= 0;
  const nextHp = Math.min(token.maxHp, token.hp + requested);
  const restored = nextHp - token.hp;
  const patch = revived
    ? {
      hp: nextHp,
      // Standing up clears the whole dying state. Leaving a failure behind
      // would mean a creature knocked down twice in one fight dies faster the
      // second time, and the rules restart the count each time.
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      conditions: token.conditions.filter((condition) => condition !== "unconscious"),
    }
    : { hp: nextHp };
  return success({
    tokens: updateToken(tokens, tokenId, patch),
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(
        scene.encounter.log,
        `${token.name} regains ${restored} hit ${restored === 1 ? "point" : "points"}.${revived ? ` ${token.name} is conscious again.` : ""}`,
      ),
    },
  }, { outcome: { tokenId, tokenName: token.name, requested, restored, previousHp: token.hp, nextHp, revived } });
}

/**
 * The damage type is optional, and untyped damage is unaffected by resistance.
 * That is deliberate: the table often just wants to take six off a creature
 * without arguing about where it came from, and making the type mandatory would
 * turn every quick adjustment into a second decision.
 */
export function damageToken(scene, tokenId, amount, damageType = null) {
  const context = activeBattleToken(scene, tokenId);
  if (!context.ok) return context;
  const { tokens, token } = context.value;
  const requested = wholeAmount(amount);
  if (requested <= 0) return failure(
    "DAMAGE_AMOUNT_REQUIRED",
    "Damage needs a whole number above zero.",
    "Enter an amount and try again.",
  );
  // A dying creature can still be damaged — that is how a monster finishes off
  // a downed hero — so only the genuinely dead are refused.
  if (token.dead) return failure(
    "DAMAGE_TARGET_DEFEATED",
    `${token.name} is already dead.`,
    "Choose a standing or dying token.",
  );
  const defense = applyDamageDefense(token, requested, damageType);
  const state = resolveIncomingDamage(token, defense.amount);
  const damagedTokens = updateToken(tokens, tokenId, state.patch);
  const absorbedText = state.absorbed
    ? ` ${state.absorbed} absorbed by temporary hit points.`
    : "";
  const damagedEncounter = {
    ...scene.encounter,
    log: appendEncounterLog(
      scene.encounter.log,
      state.dyingHit
        ? `${token.name} is struck while dying.${damageStateText(token, state)}`
        : `${token.name} takes ${defense.amount} damage.${damageDefenseText(defense)}${absorbedText}${damageStateText(token, state)}`,
    ),
  };
  // Manually finishing the last standing enemy has to end the Battle the same
  // way a killing blow from an attack does.
  const completed = completeEncounterIfNeeded(damagedTokens, damagedEncounter);
  if (!completed.ok) return completed;
  return success(completed.value, {
    outcome: {
      tokenId,
      tokenName: token.name,
      requested,
      damageType: defense.damageType,
      damageDefense: defense,
      applied: defense.amount,
      absorbed: state.absorbed,
      previousHp: token.hp,
      nextHp: state.nextHp,
      previousTempHp: token.tempHp,
      nextTempHp: state.nextTempHp,
      downed: state.downed,
      dyingHit: state.dyingHit,
      died: state.died,
      completed: completed.completed,
      winnerTokenId: completed.winnerTokenId || null,
    },
  });
}

export function setTemporaryHp(scene, tokenId, amount) {
  const context = activeBattleToken(scene, tokenId);
  if (!context.ok) return context;
  const { tokens, token } = context.value;
  const requested = wholeAmount(amount);
  const current = token.tempHp;
  // Temporary hit points never stack. A fresh grant replaces the old pool only
  // when it is larger; otherwise the better buffer stands and the new one is
  // discarded. Clearing to zero is always allowed so a wrong entry can be undone.
  if (requested > 0 && requested <= current) return failure(
    "TEMP_HP_NOT_HIGHER",
    `${token.name} already has ${current} temporary hit points, so a grant of ${requested} is discarded.`,
    "Temporary hit points do not stack — enter a higher amount or clear them to zero first.",
  );
  if (requested === current) return failure(
    "TEMP_HP_UNCHANGED",
    `${token.name} already has ${current} temporary hit points.`,
    "Enter a different amount.",
  );
  const cleared = requested === 0;
  return success({
    tokens: updateToken(tokens, tokenId, { tempHp: requested }),
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(
        scene.encounter.log,
        cleared
          ? `${token.name} loses their temporary hit points.`
          : `${token.name} gains ${requested} temporary hit ${requested === 1 ? "point" : "points"}.`,
      ),
    },
  }, { outcome: { tokenId, tokenName: token.name, previousTempHp: current, nextTempHp: requested } });
}
