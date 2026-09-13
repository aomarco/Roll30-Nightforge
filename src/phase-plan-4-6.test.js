import assert from "node:assert/strict";
import test from "node:test";

import { success } from "./application/result.js";
import { createCommandBus } from "./application/commandBus.js";
import { createRandomTranscript } from "./domain/randomTranscript.js";
import { performAbilityCheck, performSavingThrow } from "./domain/checks.js";
import { createHeroRecord } from "./domain/records.js";
import { createPlayToken, createMonsterToken, normalizeTableToken, tokenSaveModifier, tokenSkillModifier } from "./domain/table.js";
import { monsterRefreshDiff, refreshedMonsterToken } from "./domain/monsters.js";
import { MONSTERS } from "./domain/monsters.generated.js";
import { createRollLogRepository } from "./storage/entityRepositories.js";
import { createEmptyEnvelope } from "./storage/envelope.js";
import { createStateRepository } from "./storage/stateRepository.js";

const monster = (id) => MONSTERS.find((entry) => entry.id === id);
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test("P04 monster imports keep authored totals, nested alternatives, and source refresh protection", () => {
  const dragon = createMonsterToken(monster("adult-red-dragon"), { id: "dragon" });
  const guard = createMonsterToken(monster("guard"), { id: "guard" });
  const druid = createMonsterToken(monster("druid"), { id: "druid" });

  assert.equal(tokenSaveModifier(dragon, "con"), 13);
  assert.equal(tokenSkillModifier(dragon, "perception"), 13);
  assert.equal(dragon.passivePerception, 23);
  assert.deepEqual(guard.attacks.find((entry) => entry.name === "Spear").rangeModes.map((entry) => entry.kind), ["melee", "ranged"]);
  assert.deepEqual(druid.attacks.find((entry) => entry.name === "Quarterstaff").damageVariants.map((entry) => entry.damageDice), ["1d6", "1d8", "1d8+2"]);

  const edited = normalizeTableToken({ ...dragon, hp: 77, maxHp: 77, saveOverrides: { con: 15 }, overrides: { hp: true } }, { id: dragon.id });
  assert.equal(tokenSaveModifier(edited, "con"), 15);
  const nextSource = { ...monster("adult-red-dragon"), hp: 256, ac: 20 };
  const diff = monsterRefreshDiff(edited, nextSource);
  assert.ok(diff.changed.includes("hp"));
  assert.ok(diff.changed.includes("ac"));
  const refreshed = refreshedMonsterToken(edited, nextSource);
  assert.equal(refreshed.hp, 77, "an authored HP override must survive a source refresh");
  assert.equal(refreshed.ac, 20, "unoverridden source fields should refresh");
  assert.equal(refreshed.sourceSnapshotVersion, `${nextSource.sourceDatasetHash}:${nextSource.definitionVersion}`);
});

test("P06 checks resolve in Play and roster contexts without initiative or turn resources", () => {
  const play = { id: "play", kind: "play", tokens: [createPlayToken({ id: "play-token" })], encounter: null };
  const playCheck = performAbilityCheck(play, { tokenId: "play-token", skillId: "perception", dc: 10 }, { random: () => 0.5 });
  assert.equal(playCheck.ok, true);
  assert.equal(playCheck.value.rollLogEntry.contextKind, "scene-token");
  assert.equal(playCheck.value.encounter, undefined);

  const hero = createHeroRecord({ id: "hero", name: "Mira" });
  const rosterSave = performSavingThrow(null, { hero, ability: "con", dc: 10 }, { random: () => 0.5 });
  assert.equal(rosterSave.ok, true);
  assert.equal(rosterSave.value.rollLogEntry.contextKind, "roster-hero");
  assert.equal(rosterSave.value.encounter, undefined);
});

test("P05 random transcripts replay the same check outcome despite a different random source", () => {
  const hero = createHeroRecord({ id: "hero", name: "Mira" });
  const firstTranscript = createRandomTranscript({ random: () => 0.1 });
  const first = performAbilityCheck(null, { hero, skillId: "perception", dc: 12 }, { transcript: firstTranscript });
  const replayTranscript = createRandomTranscript({ random: () => 0.9, prior: firstTranscript.snapshot() });
  const replay = performAbilityCheck(null, { hero, skillId: "perception", dc: 12 }, { transcript: replayTranscript });
  assert.deepEqual(replay.outcome, first.outcome);
  assert.deepEqual(firstTranscript.snapshot().decisions.map((entry) => entry.type), ["selection", "committed-result"]);
  assert.deepEqual(replayTranscript.snapshot(), firstTranscript.snapshot());
});

test("P05 command outcomes refuse stale revisions and replay duplicate IDs without a second save", async () => {
  let state = createEmptyEnvelope("2026-09-06T00:00:00.000Z");
  let saves = 0;
  const repository = {
    load: async () => success(state),
    save: async (proposed) => {
      saves += 1;
      state = { ...proposed, revision: proposed.revision + 1 };
      return success(state, { revision: state.revision });
    },
  };
  const bus = createCommandBus({
    stateRepository: repository,
    resolvers: {
      check: {
        preview: () => success({ allowed: true }),
        resolve: ({ state: current, command }) => success({
          state: { ...current, rollLog: [{ id: command.commandId, contextKind: "roster-hero", line: "replayed" }] },
          value: { accepted: true },
          events: [{ type: "check-accepted" }],
        }),
      },
    },
  });
  const command = { commandId: "check-1", type: "check", expectedRevision: 0, payload: { heroId: "hero", ability: "wis" } };
  const first = await bus.execute(command);
  const duplicate = await bus.execute(command);
  const conflict = await bus.execute({ ...command, payload: { heroId: "hero", ability: "str" } });
  const stale = await bus.execute({ commandId: "check-2", type: "check", expectedRevision: 0, payload: {} });
  assert.equal(first.ok, true);
  assert.equal(duplicate.replayed, true);
  assert.equal(conflict.code, "command-id-reused");
  assert.equal(stale.code, "command-stale-revision");
  assert.equal(saves, 1);
});

test("P06 roll-log entries persist outside an encounter and remain bounded by the repository", async () => {
  const repository = createStateRepository(memoryStorage());
  const logs = createRollLogRepository(repository, { clock: () => "2026-09-06T00:00:00.000Z", idFactory: () => "roll-1" });
  const appended = await logs.append({ id: "roll-1", contextKind: "roster-hero", heroId: "hero", visibility: "private", line: "Mira rolls Perception", outcome: { kind: "skill", tokenId: "roster-hero", tokenName: "Mira", modifier: 3, rolls: [14], selectedIndex: 0, naturalRoll: 14, total: 17, dc: null, succeeded: null, mode: "normal", modifierSources: [] } });
  assert.equal(appended.ok, true);
  const listed = await logs.list();
  assert.equal(listed.value[0].visibility, "private");
  assert.equal(listed.value[0].outcome.total, 17);
});
