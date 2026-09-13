import { conditionById, normalizeConditionImmunities, normalizeConditions } from "./conditions.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });

export const EFFECT_DEFINITION_VERSION = 1;
export const EFFECT_STATUS = Object.freeze(["active", "suspended", "ended"]);
export const EFFECT_DURATION_KINDS = Object.freeze([
  "permanent",
  "explicit-end",
  "round-boundary",
  "game-time",
  "turn-start",
  "turn-end",
  "caster-turn",
  "target-turn",
  "source-valid",
  "event",
]);
export const EFFECT_STACKING_POLICIES = Object.freeze([
  "independent",
  "strongest",
  "exclusive-group",
  "refresh-same-source",
  "replace-by-source",
  "suspended-but-retained",
]);
export const EFFECT_OPERATION_TYPES = Object.freeze([
  "grant-condition",
  "modify-stat",
  "grant-sense",
  "replace-formula",
  "create-zone",
  "provide-roll-choice",
]);

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;

const cleanId = (value, fallback = null) => {
  const result = text(value, fallback || "");
  return result ? result.slice(0, 160) : fallback;
};

const cleanList = (value, limit = 32) => [...new Set(
  (Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim().slice(0, 160)),
)].slice(0, limit);

function normalizeOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) return null;
  const op = text(operation.op);
  if (!EFFECT_OPERATION_TYPES.includes(op)) return null;
  if (op === "grant-condition") {
    const conditionId = conditionById(operation.conditionId)?.id;
    return conditionId ? { op, conditionId } : null;
  }
  if (op === "modify-stat") {
    const stat = text(operation.stat).slice(0, 80);
    if (!stat) return null;
    const mode = operation.mode === "set" ? "set" : "add";
    const amount = finite(operation.amount, 0);
    return { op, stat, mode, amount, label: text(operation.label, stat).slice(0, 120) };
  }
  if (op === "grant-sense") {
    const sense = text(operation.sense).slice(0, 80);
    const feet = Math.max(0, Math.min(1000, Math.floor(finite(operation.feet))));
    return sense && feet > 0 ? { op, sense, feet } : null;
  }
  if (op === "replace-formula") {
    const stat = text(operation.stat).slice(0, 80);
    const formulaKey = text(operation.formulaKey).slice(0, 120);
    return stat && formulaKey ? { op, stat, formulaKey } : null;
  }
  if (op === "create-zone") {
    const zoneId = cleanId(operation.zoneId);
    return zoneId ? { op, zoneId, shape: text(operation.shape, "point").slice(0, 40) } : null;
  }
  const choiceId = cleanId(operation.choiceId);
  const options = cleanList(operation.options, 12);
  return choiceId && options.length ? { op, choiceId, options } : null;
}

export function normalizeEffectDefinition(input = {}) {
  const id = cleanId(input.id);
  const name = text(input.name);
  const operations = (Array.isArray(input.operations) ? input.operations : []).map(normalizeOperation).filter(Boolean);
  if (!id || !name || !operations.length) return null;
  const stackingPolicy = EFFECT_STACKING_POLICIES.includes(input.stackingPolicy) ? input.stackingPolicy : "independent";
  return {
    id,
    name: name.slice(0, 120),
    definitionVersion: Math.max(1, Math.floor(finite(input.definitionVersion, EFFECT_DEFINITION_VERSION))),
    stackingPolicy,
    stackingKey: cleanId(input.stackingKey, id),
    operations,
    narrativeResponsibilities: cleanList(input.narrativeResponsibilities, 12),
    capabilityStatus: ["supported", "partially-supported", "specified", "reference-only"].includes(input.capabilityStatus)
      ? input.capabilityStatus
      : "supported",
  };
}

export const normalizeEffectDefinitions = (definitions) => (Array.isArray(definitions) ? definitions : definitions && typeof definitions === "object" ? Object.values(definitions) : [])
  .map(normalizeEffectDefinition)
  .filter(Boolean)
  .slice(0, 512);

function normalizeDuration(input = {}, context = {}) {
  const kind = EFFECT_DURATION_KINDS.includes(input.kind) ? input.kind : "permanent";
  const duration = { kind };
  if (kind === "explicit-end") {
    duration.endBoundaryId = cleanId(input.endBoundaryId);
    duration.endEventId = cleanId(input.endEventId);
    duration.endAtSeconds = Number.isFinite(Number(input.endAtSeconds))
      ? Math.max(0, Math.floor(Number(input.endAtSeconds)))
      : null;
  }
  if (kind === "round-boundary") {
    const rounds = Math.max(1, Math.min(10000, Math.floor(finite(input.rounds, 1))));
    duration.rounds = rounds;
    duration.expiresAtRound = Math.max(1, Math.floor(finite(input.expiresAtRound, finite(context.round, 1) + rounds)));
  }
  if (kind === "game-time") {
    const seconds = Math.max(1, Math.min(10_000_000, Math.floor(finite(input.seconds, 6))));
    duration.seconds = seconds;
    duration.expiresAtSeconds = Math.max(0, Math.floor(finite(input.expiresAtSeconds, finite(context.gameTimeSeconds, 0) + seconds)));
  }
  if (["turn-start", "turn-end", "caster-turn", "target-turn"].includes(kind)) {
    duration.boundaries = Math.max(1, Math.min(1000, Math.floor(finite(input.boundaries, 1))));
    duration.remainingBoundaries = Math.max(1, Math.min(duration.boundaries, Math.floor(finite(input.remainingBoundaries, duration.boundaries))));
    duration.actorId = cleanId(input.actorId, cleanId(context.actorId));
  }
  if (kind === "event") duration.eventId = cleanId(input.eventId);
  if (kind === "source-valid") duration.sourceId = cleanId(input.sourceId, cleanId(context.sourceId));
  return duration;
}

export function normalizeEffectInstance(input = {}, context = {}) {
  const definitionId = cleanId(input.definitionId);
  const id = cleanId(input.id, `${definitionId || "effect"}-${cleanId(input.sourceId, "gm")}`);
  if (!id || !definitionId) return null;
  const status = EFFECT_STATUS.includes(input.status) ? input.status : "active";
  return {
    id,
    definitionId,
    definitionVersion: Math.max(1, Math.floor(finite(input.definitionVersion, EFFECT_DEFINITION_VERSION))),
    sourceId: cleanId(input.sourceId, "gm"),
    sourceType: text(input.sourceType, "gm").slice(0, 40),
    provenanceId: cleanId(input.provenanceId, id),
    stackingKey: cleanId(input.stackingKey, definitionId),
    magnitude: Math.max(0, finite(input.magnitude, input._magnitude || 0)),
    conditionIds: cleanList(input.conditionIds, 16),
    status,
    startedAtRound: Math.max(1, Math.floor(finite(input.startedAtRound, finite(context.round, 1)))),
    startedAtSeconds: Math.max(0, Math.floor(finite(input.startedAtSeconds, finite(context.gameTimeSeconds, 0)))),
    createdBoundaryId: cleanId(input.createdBoundaryId),
    duration: normalizeDuration(input.duration, context),
    endedAt: input.endedAt || null,
    endReason: cleanId(input.endReason),
  };
}

export const normalizeEffects = (effects, context = {}) => (Array.isArray(effects) ? effects : [])
  .map((effect) => normalizeEffectInstance(effect, context))
  .filter(Boolean)
  .slice(-200);

/** Bridge the pre-P08 conditionExpiries map without making old saves depend on
 * a new schema. The returned definitions are pinned compatibility definitions,
 * so a later catalog change cannot reinterpret an old expiry. */
export function legacyConditionExpiryAdapter(conditionExpiries, { round = 1, sourceId = "legacy-condition" } = {}) {
  const definitions = [];
  const effects = [];
  for (const [conditionId, expiry] of Object.entries(conditionExpiries && typeof conditionExpiries === "object" ? conditionExpiries : {})) {
    const condition = conditionById(conditionId);
    const expiresAtRound = Math.max(1, Math.floor(finite(expiry, round)));
    if (!condition) continue;
    const definition = normalizeEffectDefinition({
      id: `legacy-condition-${condition.id}`,
      name: `${condition.name} (legacy)`,
      definitionVersion: 1,
      stackingPolicy: "replace-by-source",
      operations: [{ op: "grant-condition", conditionId: condition.id }],
      capabilityStatus: "supported",
    });
    definitions.push(definition);
    effects.push(normalizeEffectInstance({
      id: `legacy-condition-${condition.id}-${sourceId}`,
      definitionId: definition.id,
      definitionVersion: definition.definitionVersion,
      sourceId,
      sourceType: "legacy-condition-expiry",
      conditionIds: [condition.id],
      duration: { kind: "round-boundary", expiresAtRound, rounds: Math.max(1, expiresAtRound - round) },
    }, { round }));
  }
  return { definitions, effects: effects.filter(Boolean) };
}

const activeEffects = (effects) => normalizeEffects(effects).filter((effect) => effect.status === "active");

export function normalizeConditionSources(value, conditions = []) {
  const active = new Set(normalizeConditions(conditions));
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([conditionId, sources]) => {
    const condition = conditionById(conditionId);
    const cleanSources = cleanList(sources, 40);
    return condition && active.has(condition.id) && cleanSources.length ? [[condition.id, cleanSources]] : [];
  }));
}

function definitionsFor(definitions) {
  return new Map(normalizeEffectDefinitions(definitions).map((definition) => [definition.id, definition]));
}

const effectMagnitude = (definition) => Math.max(...definition.operations.filter((operation) => operation.op === "modify-stat").map((operation) => Math.abs(operation.amount)), 0);

function stackingResult(current, definition, sourceId) {
  const matches = current.filter((effect) => effect.status === "active" && effect.stackingKey === definition.stackingKey);
  if (!matches.length || definition.stackingPolicy === "independent") return { current, replace: [] };
  if (definition.stackingPolicy === "strongest") {
    const magnitude = effectMagnitude(definition);
    const strongest = matches.find((effect) => effect.magnitude >= magnitude);
    if (strongest) return { current, reject: strongest };
    return { current, replace: matches };
  }
  if (definition.stackingPolicy === "refresh-same-source") {
    return { current, refresh: matches.find((effect) => effect.sourceId === sourceId) || null };
  }
  if (definition.stackingPolicy === "replace-by-source") {
    return { current, replace: matches.filter((effect) => effect.sourceId === sourceId) };
  }
  if (definition.stackingPolicy === "exclusive-group") return { current, replace: matches };
  return { current, replace: [] };
}

function applyConditionSource(token, conditionId, effectId) {
  const condition = conditionById(conditionId);
  if (!condition) return failure("EFFECT_CONDITION_INVALID", "The effect names an unknown condition.", "Update the effect definition before applying it.");
  const conditions = normalizeConditions(token.conditions);
  const conditionSources = normalizeConditionSources(token.conditionSources, conditions);
  const sources = [...(conditionSources[condition.id] || [])];
  if (!sources.length && conditions.includes(condition.id)) sources.push(`manual:${condition.id}`);
  if (!sources.includes(effectId)) sources.push(effectId);
  return { conditions: conditions.includes(condition.id) ? conditions : [...conditions, condition.id], conditionSources: { ...conditionSources, [condition.id]: sources } };
}

function removeConditionSource(token, conditionId, effectId) {
  const conditions = normalizeConditions(token.conditions);
  const conditionSources = normalizeConditionSources(token.conditionSources, conditions);
  const remaining = (conditionSources[conditionId] || []).filter((sourceId) => sourceId !== effectId);
  const nextSources = { ...conditionSources };
  if (remaining.length) nextSources[conditionId] = remaining;
  else delete nextSources[conditionId];
  const shouldRemove = !remaining.length;
  return {
    conditions: shouldRemove ? conditions.filter((id) => id !== conditionId) : conditions,
    conditionSources: nextSources,
  };
}

export function applyEffectToToken(token, definitionInput, {
  sourceId = "gm",
  sourceType = "gm",
  instanceId = null,
  round = 1,
  gameTimeSeconds = 0,
  boundaryId = null,
  duration = {},
  definitions = [],
} = {}) {
  const definition = normalizeEffectDefinition(definitionInput) || definitionsFor(definitions).get(definitionInput?.id);
  if (!definition) return failure("EFFECT_DEFINITION_INVALID", "That effect definition is incomplete or unsupported.", "Choose a trusted effect definition.");
  if (definition.capabilityStatus === "reference-only") return failure("EFFECT_REFERENCE_ONLY", `${definition.name} is reference-only and cannot be applied automatically.`, "Use a GM adjustment with an explicit note.");
  const conditionOperations = definition.operations.filter((operation) => operation.op === "grant-condition");
  const immuneCondition = conditionOperations.find((operation) => normalizeConditionImmunities(token.conditionImmunities).includes(operation.conditionId));
  if (immuneCondition) {
    return failure("CONDITION_IMMUNE", `${token.name || "This creature"} is immune to ${conditionById(immuneCondition.conditionId).name}.`, "Choose another effect or apply a documented override.");
  }
  const current = normalizeEffects(token.effects, { round, gameTimeSeconds });
  const stacking = stackingResult(current, definition, sourceId);
  if (stacking.reject) return success(token, { applied: false, existing: stacking.reject, reason: "stronger-effect-active" });
  const replaced = stacking.replace || [];
  const resolvedId = cleanId(instanceId, `${definition.id}-${sourceId}-${current.length + 1}`);
  const refreshed = stacking.refresh;
  const instance = normalizeEffectInstance({
    ...(refreshed || {}),
    id: refreshed?.id || resolvedId,
    definitionId: definition.id,
    definitionVersion: definition.definitionVersion,
    sourceId,
    sourceType,
    provenanceId: refreshed?.provenanceId || resolvedId,
    stackingKey: definition.stackingKey,
    conditionIds: definition.operations.filter((operation) => operation.op === "grant-condition").map((operation) => operation.conditionId),
    status: "active",
    startedAtRound: refreshed?.startedAtRound || round,
    startedAtSeconds: refreshed?.startedAtSeconds || gameTimeSeconds,
    createdBoundaryId: boundaryId,
    duration,
  }, { round, gameTimeSeconds, sourceId });
  if (!instance) return failure("EFFECT_INSTANCE_INVALID", "Nightforge could not create that effect instance.", "Retry with a stable source and definition.");
  const activeIds = new Set(replaced.map((effect) => effect.id));
  const effects = current
    .filter((effect) => !activeIds.has(effect.id))
    .map((effect) => refreshed && effect.id === refreshed.id ? instance : effect);
  if (!refreshed) effects.push({ ...instance, magnitude: effectMagnitude(definition) });
  let next = { ...token, effects: normalizeEffects(effects, { round, gameTimeSeconds }) };
  for (const replacedEffect of replaced) {
    for (const conditionId of replacedEffect.conditionIds || []) {
      next = { ...next, ...removeConditionSource(next, conditionId, replacedEffect.id) };
    }
  }
  for (const operation of conditionOperations) next = { ...next, ...applyConditionSource(next, operation.conditionId, instance.id) };
  return success(next, {
    applied: true,
    effect: instance,
    replaced: replaced.map((effect) => effect.id),
    event: { type: "effect-applied", effectId: instance.id, definitionId: definition.id, sourceId },
  });
}

export function removeEffectFromToken(token, effectId, definitions = [], { endedAt = null, endReason = "removed" } = {}) {
  const current = normalizeEffects(token.effects);
  const instance = current.find((effect) => effect.id === effectId);
  if (!instance) return failure("EFFECT_NOT_FOUND", "That effect is no longer active.", "Refresh the current token state.");
  const definition = definitionsFor(definitions).get(instance.definitionId);
  let next = { ...token, effects: current.map((effect) => effect.id === effectId ? { ...effect, status: "ended", endedAt, endReason } : effect) };
  const conditionIds = definition?.operations.filter((operation) => operation.op === "grant-condition").map((operation) => operation.conditionId) || instance.conditionIds || [];
  for (const conditionId of conditionIds) next = { ...next, ...removeConditionSource(next, conditionId, effectId) };
  return success(next, { effect: instance, event: { type: "effect-ended", effectId, reason: "removed" } });
}

export function setEffectSuspended(token, effectId, suspended = true) {
  const effects = normalizeEffects(token.effects);
  const effect = effects.find((entry) => entry.id === effectId);
  if (!effect) return failure("EFFECT_NOT_FOUND", "That effect is no longer active.", "Refresh the current token state.");
  return success({ ...token, effects: effects.map((entry) => entry.id === effectId ? { ...entry, status: suspended ? "suspended" : "active" } : entry) }, {
    effectId,
    event: { type: suspended ? "effect-suspended" : "effect-resumed", effectId },
  });
}

function durationReached(effect, context = {}) {
  const duration = effect.duration || { kind: "permanent" };
  if (effect.status !== "active") return false;
  if (duration.kind === "explicit-end") {
    return (duration.endBoundaryId && duration.endBoundaryId === context.boundaryId)
      || (duration.endEventId && duration.endEventId === context.eventId)
      || (duration.endAtSeconds !== null && finite(context.gameTimeSeconds) >= duration.endAtSeconds);
  }
  if (duration.kind === "round-boundary") return finite(context.round) >= duration.expiresAtRound;
  if (duration.kind === "game-time") return finite(context.gameTimeSeconds) >= duration.expiresAtSeconds;
  if (duration.kind === "event") return context.eventId && context.eventId === duration.eventId;
  if (["turn-start", "turn-end", "caster-turn", "target-turn"].includes(duration.kind)) {
    return context.boundaryKind === duration.kind && (!duration.actorId || duration.actorId === context.actorId);
  }
  return duration.kind === "source-valid" && context.validSourceIds && !context.validSourceIds.includes(effect.duration.sourceId);
}

export function advanceEffects(token, context = {}, definitions = []) {
  let next = { ...token, effects: normalizeEffects(token.effects, context) };
  const expired = [];
  for (const effect of activeEffects(next.effects)) {
    const duration = effect.duration || {};
    if (["turn-start", "turn-end", "caster-turn", "target-turn"].includes(duration.kind) && durationReached(effect, context)) {
      const remaining = Math.max(0, (duration.remainingBoundaries || 1) - 1);
      if (remaining > 0) {
        next = { ...next, effects: next.effects.map((entry) => entry.id === effect.id ? { ...entry, duration: { ...duration, remainingBoundaries: remaining } } : entry) };
        continue;
      }
    }
    if (!durationReached(effect, context)) continue;
    const removed = removeEffectFromToken(next, effect.id, definitions, {
      endedAt: context.timestamp || context.boundaryId || null,
      endReason: duration.kind === "event" ? "event" : "expired",
    });
    if (removed.ok) {
      next = removed.value;
      expired.push(effect.id);
    }
  }
  return success(next, { expired, event: expired.length ? { type: "effects-expired", effectIds: expired } : null });
}

export function effectStatExplanation(token, baseStats = {}, definitions = []) {
  const byId = definitionsFor(definitions);
  const values = { ...baseStats };
  const explanations = Object.fromEntries(Object.keys(values).map((stat) => [stat, []]));
  const formulas = {};
  for (const effect of activeEffects(token.effects)) {
    const definition = byId.get(effect.definitionId);
    if (!definition) continue;
    for (const operation of definition.operations) {
      if (operation.op !== "modify-stat") continue;
      if (!Object.hasOwn(values, operation.stat)) continue;
      const before = values[operation.stat];
      const after = operation.mode === "set" ? operation.amount : before + operation.amount;
      values[operation.stat] = after;
      explanations[operation.stat].push({
        provenanceId: effect.provenanceId,
        effectId: effect.id,
        sourceId: effect.sourceId,
        label: operation.label,
        mode: operation.mode,
        amount: operation.amount,
        before,
        after,
      });
    }
    for (const operation of definition.operations) {
      if (operation.op !== "replace-formula") continue;
      formulas[operation.stat] = {
        formulaKey: operation.formulaKey,
        provenanceId: effect.provenanceId,
        effectId: effect.id,
        sourceId: effect.sourceId,
        definitionVersion: definition.definitionVersion,
      };
    }
  }
  return { values, explanations, formulas };
}

export function effectSourceSummary(token, definitions = []) {
  const byId = definitionsFor(definitions);
  return activeEffects(token.effects).map((effect) => ({
    id: effect.id,
    name: byId.get(effect.definitionId)?.name || effect.definitionId,
    sourceId: effect.sourceId,
    sourceType: effect.sourceType,
    status: effect.status,
    duration: effect.duration,
    provenanceId: effect.provenanceId,
  }));
}

export function adjustEffectOnToken(token, effectId, patch = {}, definitions = []) {
  const effects = normalizeEffects(token.effects);
  const current = effects.find((effect) => effect.id === effectId);
  if (!current) return failure("EFFECT_NOT_FOUND", "That effect is no longer active.", "Refresh the current token state.");
  const nextEffect = normalizeEffectInstance({ ...current, ...patch, id: current.id, definitionId: current.definitionId }, patch);
  if (!nextEffect) return failure("EFFECT_INSTANCE_INVALID", "The adjusted effect is not valid.", "Use a supported duration or source value.");
  return success({ ...token, effects: effects.map((effect) => effect.id === effectId ? nextEffect : effect) }, {
    effect: nextEffect,
    definitions,
    event: { type: "effect-adjusted", effectId },
  });
}

export function inspectEffects(token, definitions = []) {
  return {
    effects: effectSourceSummary(token, definitions),
    conditionSources: normalizeConditionSources(token?.conditionSources, token?.conditions),
    statExplanation: effectStatExplanation(token, token?.baseStats || {}, definitions),
  };
}
