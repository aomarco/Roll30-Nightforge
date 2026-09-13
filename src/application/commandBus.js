import { success } from "./result.js";
import { commandResult, validateCommand } from "./commandContracts.js";
import { attackTargetEligibility, performWeaponAttack } from "../domain/attacks.js";
import { damageToken, healToken } from "../domain/vitality.js";
import { encounterExperienceAward } from "../domain/encounter.js";
import { moveActiveToken } from "../domain/combat.js";
import { createRandomTranscript } from "../domain/randomTranscript.js";

const generatedId = () => globalThis.crypto?.randomUUID?.() || `command-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const failure = (code, message, recovery = "Retry the operation.", retryable = true, metadata = {}) => ({ ok: false, code, message, recovery, retryable, ...metadata });

const sceneFor = (state, sceneId) => state.scenes.find((scene) => scene.id === sceneId) || null;

const defaultResolvers = Object.freeze({
  move: {
    preview: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      return success({ allowed: true, cost: "movement", requirements: ["active turn", "reachable destination"] });
    },
    resolve: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      const moved = moveActiveToken(scene, command.payload.tokenId, command.payload.destination, command.payload.viewport, command.payload.options || {});
      if (!moved.ok) return moved;
      return success({ state: { ...state, scenes: state.scenes.map((entry) => entry.id === scene.id ? { ...scene, ...moved.value } : entry) }, value: moved.value, events: [{ type: "token-moved", tokenId: command.payload.tokenId, costFeet: moved.plan?.costFeet || 0 }] });
    },
  },
  attack: {
    preview: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      const eligible = attackTargetEligibility(scene, command.payload.specification || {});
      return eligible.ok ? success({ allowed: true, cost: eligible.value.kind || "Action", requirements: ["target in range", "line of sight"] }) : eligible;
    },
    resolve: ({ state, command, random }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      const transcript = createRandomTranscript({ random, prior: command.transcript });
      const attacked = performWeaponAttack(scene, command.payload.specification || {}, { random, transcript });
      if (!attacked.ok) return attacked;
      return success({
        state: { ...state, scenes: state.scenes.map((entry) => entry.id === scene.id ? { ...scene, ...attacked.value } : entry) },
        value: attacked.value,
        events: [{ type: "attack-resolved", sceneId: scene.id, outcome: attacked.outcome }],
        transcript: transcript.snapshot(),
      });
    },
  },
  "adjust-hp": {
    preview: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      if (command.payload.amount <= 0) return failure("hp-amount-invalid", "Hit point adjustments need a positive amount.", "Enter a whole number above zero.");
      return success({ allowed: true, cost: "none", requirements: ["active battle"] });
    },
    resolve: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      const operation = command.payload.direction === "heal" ? healToken : damageToken;
      const changed = operation(scene, command.payload.tokenId, command.payload.amount, command.payload.damageType || null);
      if (!changed.ok) return changed;
      return success({ state: { ...state, scenes: state.scenes.map((entry) => entry.id === scene.id ? { ...scene, ...changed.value } : entry) }, value: changed.value, events: [{ type: "hp-adjusted", tokenId: command.payload.tokenId, direction: command.payload.direction }] });
    },
  },
  "award-xp": {
    preview: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      return success({ allowed: scene.encounter?.status === "complete", cost: "none", requirements: ["completed encounter"] });
    },
    resolve: ({ state, command }) => {
      const scene = sceneFor(state, command.payload.sceneId);
      if (!scene) return failure("scene-not-found", "That Scene is no longer available.", "Refresh the Library and choose a Scene.");
      const award = encounterExperienceAward(scene.tokens, scene.encounter);
      if (!award.recipients.length) return failure("xp-no-recipients", "No eligible Hero remains for this award.", "Finish the encounter with a surviving Hero.");
      const shares = new Map(award.recipients.map((entry) => [entry.heroId, entry.share]));
      const heroes = state.heroes.map((hero) => shares.has(hero.id) ? { ...hero, xp: hero.xp + shares.get(hero.id) } : hero);
      const nextScene = { ...scene, encounter: { ...scene.encounter, xpAwarded: true, xpAwardOutcome: [...shares].map(([heroId, share]) => ({ heroId, share })) } };
      return success({ state: { ...state, heroes, scenes: state.scenes.map((entry) => entry.id === scene.id ? nextScene : entry) }, value: nextScene, events: [{ type: "xp-awarded", sceneId: scene.id }] });
    },
  },
  check: {
    preview: () => success({ allowed: true, cost: "none", requirements: ["valid check context"] }),
    resolve: ({ state, command }) => success({ state, value: command.payload, events: [{ type: "check-requested" }] }),
  },
});

export function createCommandBus({ stateRepository, resolvers = {}, idFactory = generatedId, random = Math.random } = {}) {
  if (!stateRepository?.load || !stateRepository?.save) throw new TypeError("Command bus requires a state repository.");
  const handlers = { ...defaultResolvers, ...resolvers };
  const outcomes = new Map();
  const makeCommand = (input = {}) => validateCommand({ ...input, commandId: input.commandId || idFactory() });

  const preview = async (input) => {
    const normalized = makeCommand(input);
    if (!normalized.ok) return normalized;
    const loaded = await stateRepository.load();
    if (!loaded.ok) return loaded;
    const handler = handlers[normalized.value.type];
    return handler?.preview
      ? handler.preview({ state: loaded.value, command: normalized.value })
      : failure("command-handler-missing", `No preview exists for ${normalized.value.type}.`, "Retry after updating Nightforge.");
  };

  const execute = async (input) => {
    const normalized = makeCommand(input);
    if (!normalized.ok) return normalized;
    const command = normalized.value;
    const cached = outcomes.get(command.commandId);
    if (cached) {
      if (cached.payloadHash !== command.payloadHash) return failure("command-id-reused", "That command ID was already used for different data.", "Retry with a fresh command ID.", false);
      return { ...cached.result, replayed: true };
    }
    const loaded = await stateRepository.load();
    if (!loaded.ok) return loaded;
    const durable = (loaded.value.commandOutcomes || []).find((entry) => entry.commandId === command.commandId || entry.id === command.commandId);
    if (durable) {
      if (durable.payloadHash !== command.payloadHash) return failure("command-id-reused", "That command ID was already used for different data.", "Retry with a fresh command ID.", false);
      return commandResult(command, durable.value, durable.events, durable.transcript, {
        revision: durable.revision,
        state: loaded.value,
        replayed: true,
      });
    }
    if (loaded.value.revision !== command.expectedRevision) return failure("command-stale-revision", "The campaign changed before this action committed.", "Refresh the latest state and retry; the action was not applied.", true, { expectedRevision: command.expectedRevision, actualRevision: loaded.value.revision });
    const handler = handlers[command.type];
    if (!handler?.resolve) return failure("command-handler-missing", `No resolver exists for ${command.type}.`, "Retry after updating Nightforge.");
    let resolved;
    try {
      resolved = await handler.resolve({ state: loaded.value, command, random });
    } catch (error) {
      return failure(
        error?.code || "command-resolution-failed",
        error?.message || "Nightforge could not resolve that command.",
        error?.code === "random-transcript-mismatch" ? "Use the transcript produced by the original command." : "Review the action and retry.",
        true,
      );
    }
    if (!resolved.ok) return resolved;
    const durableOutcome = {
      id: command.commandId,
      commandId: command.commandId,
      payloadHash: command.payloadHash,
      value: resolved.value.value,
      events: resolved.value.events,
      transcript: resolved.value.transcript || command.transcript,
      revision: loaded.value.revision + 1,
    };
    const commandOutcomes = [...(loaded.value.commandOutcomes || []), durableOutcome].slice(-100);
    const saved = await stateRepository.save({ ...resolved.value.state, commandOutcomes }, { commandId: command.commandId, pending: resolved.value.pending || [] });
    if (!saved.ok) return saved;
    const result = commandResult(command, resolved.value.value, resolved.value.events, resolved.value.transcript || command.transcript, { revision: saved.revision, state: saved.value });
    outcomes.set(command.commandId, { payloadHash: command.payloadHash, result });
    return result;
  };

  return { preview, execute, makeCommand, outcomes };
}
