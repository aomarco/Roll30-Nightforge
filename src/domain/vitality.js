import { completeEncounterIfNeeded } from "./encounter.js";
import { appendEncounterLog, normalizeTableTokens, updateToken } from "./table.js";

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
  // Healing cannot revive: a creature at zero is out of this Battle, and
  // bringing it back needs death saving throws, which do not exist yet.
  if (token.hp <= 0) return failure(
    "HEAL_TARGET_DEFEATED",
    `${token.name} is already defeated and cannot be healed.`,
    "Restart the Battle to restore defeated tokens.",
  );
  if (token.hp >= token.maxHp) return failure(
    "HEAL_TARGET_UNHURT",
    `${token.name} is already at full hit points.`,
    "Choose a wounded token.",
  );
  const nextHp = Math.min(token.maxHp, token.hp + requested);
  const restored = nextHp - token.hp;
  return success({
    tokens: updateToken(tokens, tokenId, { hp: nextHp }),
    encounter: {
      ...scene.encounter,
      log: appendEncounterLog(scene.encounter.log, `${token.name} regains ${restored} hit ${restored === 1 ? "point" : "points"}.`),
    },
  }, { outcome: { tokenId, tokenName: token.name, requested, restored, previousHp: token.hp, nextHp } });
}

export function damageToken(scene, tokenId, amount) {
  const context = activeBattleToken(scene, tokenId);
  if (!context.ok) return context;
  const { tokens, token } = context.value;
  const requested = wholeAmount(amount);
  if (requested <= 0) return failure(
    "DAMAGE_AMOUNT_REQUIRED",
    "Damage needs a whole number above zero.",
    "Enter an amount and try again.",
  );
  if (token.hp <= 0) return failure(
    "DAMAGE_TARGET_DEFEATED",
    `${token.name} is already defeated.`,
    "Choose a standing token.",
  );
  const pools = applyDamageToPools(token, requested);
  const damagedTokens = updateToken(tokens, tokenId, { hp: pools.nextHp, tempHp: pools.nextTempHp });
  const absorbedText = pools.absorbed
    ? ` ${pools.absorbed} absorbed by temporary hit points.`
    : "";
  const damagedEncounter = {
    ...scene.encounter,
    log: appendEncounterLog(scene.encounter.log, `${token.name} takes ${requested} damage.${absorbedText}`),
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
      absorbed: pools.absorbed,
      previousHp: token.hp,
      nextHp: pools.nextHp,
      previousTempHp: token.tempHp,
      nextTempHp: pools.nextTempHp,
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
