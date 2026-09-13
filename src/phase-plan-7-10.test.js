import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BOARD,
  cellFromPosition,
  cellsForShape,
  footprintForPosition,
  lineOfEffect,
  normalizeBoard,
  positionFromCell,
  queryShapeTargets,
  resizeBoard,
  resizeBoardPreview,
} from "./domain/geometry.js";
import {
  advanceEffects,
  applyEffectToToken,
  effectStatExplanation,
  normalizeEffectDefinition,
  removeEffectFromToken,
} from "./domain/effects.js";
import { advanceCampaignClock, advanceCombatRound, normalizeCampaignClock } from "./domain/time.js";
import {
  beginResolution,
  completeResolution,
  createPendingResolution,
  currentResolution,
  enqueueResolution,
  normalizePendingResolutions,
  respondToResolution,
} from "./domain/resolutionScheduler.js";
import {
  adjustPool,
  commitSpend,
  normalizeResourceLedger,
  recoverPool,
  releaseReservation,
  reserveSpend,
} from "./domain/resources.js";
import {
  attuneItemInstance,
  materializeInventoryInstances,
  recoverItemInstanceCharges,
  spendItemInstanceCharges,
  transferItemInstance,
} from "./domain/itemInstances.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import { commitRestPreview, longRest, previewRest } from "./domain/rest.js";

test("P07 geometry keeps old scenes stable while using custom board cells and footprints", () => {
  assert.deepEqual(normalizeBoard(), DEFAULT_BOARD);
  const board = normalizeBoard({ columns: 30, rows: 18, feetPerCell: 10 });
  const position = positionFromCell({ column: 7, row: 4 }, board);
  assert.deepEqual(cellFromPosition(position, board), { column: 7, row: 4 });
  assert.equal(footprintForPosition(position, "large", board).cells.length, 4);
  assert.equal(cellsForShape({ kind: "circle", origin: { column: 7, row: 4 }, radiusFeet: 10 }, board).length > 1, true);

  const tokens = [
    { id: "self", name: "Self", faction: "ally", position, size: "medium" },
    { id: "foe", name: "Foe", faction: "foe", position: positionFromCell({ column: 8, row: 4 }, board), size: "large" },
  ];
  const targets = queryShapeTargets({
    tokens,
    originTokenId: "self",
    includeSelf: false,
    shape: { kind: "point", origin: { column: 8, row: 4 } },
    board,
  });
  assert.deepEqual(targets.tokenIds, ["foe"]);
  assert.equal(targets.reasons.some((entry) => entry.reason === "self-excluded"), true);
});

test("P07 line of effect and resize review are deterministic and explicit", () => {
  const wall = { id: "wall-1", points: [{ xPercent: 25, yPercent: 0 }, { xPercent: 25, yPercent: 100 }] };
  assert.deepEqual(lineOfEffect({ column: 2, row: 5 }, { column: 8, row: 5 }, [wall]), { state: "blocked", blockedBy: ["wall-1"] });
  const token = { id: "large", size: "large", position: { xPercent: 1, yPercent: 50 } };
  const preview = resizeBoardPreview(DEFAULT_BOARD, { columns: 10, rows: 12, feetPerCell: 5 }, { tokens: [token] });
  assert.deepEqual(preview.outOfBounds.tokens, ["large"]);
  const refused = resizeBoard(DEFAULT_BOARD, { columns: 10, rows: 12 }, { tokens: [token] });
  assert.equal(refused.code, "BOARD_RESIZE_REVIEW_REQUIRED");
  const cropped = resizeBoard(DEFAULT_BOARD, { columns: 10, rows: 12 }, { tokens: [token] }, { decision: "crop" });
  assert.equal(cropped.ok, true);
  assert.deepEqual(cropped.value.tokens, []);
});

test("P08 effects are trusted data, preserve source identities, expire exactly, and explain stats", () => {
  const definition = normalizeEffectDefinition({
    id: "bless-stat",
    name: "Blessed strength",
    stackingPolicy: "independent",
    operations: [
      { op: "grant-condition", conditionId: "poisoned" },
      { op: "modify-stat", stat: "ac", amount: 1, label: "Blessed AC" },
      { op: "replace-formula", stat: "ac", formulaKey: "shielded-ac" },
    ],
    executable: () => "must never survive normalization",
  });
  assert.equal(typeof definition.executable, "undefined");
  const token = { id: "hero", name: "Hero", conditions: [], conditionSources: [], effects: [], baseStats: { ac: 12 } };
  const first = applyEffectToToken(token, definition, { sourceId: "spell-a", instanceId: "effect-a", round: 1, duration: { kind: "round-boundary", expiresAtRound: 3, rounds: 2 } });
  const second = applyEffectToToken(first.value, definition, { sourceId: "spell-b", instanceId: "effect-b", round: 1, duration: { kind: "game-time", seconds: 60, expiresAtSeconds: 60 } });
  assert.equal(second.value.conditions.includes("poisoned"), true);
  assert.equal(second.value.conditionSources.poisoned.length, 2);
  const removed = removeEffectFromToken(second.value, "effect-a", [definition]);
  assert.equal(removed.value.conditions.includes("poisoned"), true);
  assert.deepEqual(removed.value.conditionSources.poisoned, ["effect-b"]);
  const stillActive = advanceEffects(removed.value, { round: 2, gameTimeSeconds: 30 }, [definition]);
  assert.deepEqual(stillActive.expired, []);
  const expired = advanceEffects(stillActive.value, { round: 3, gameTimeSeconds: 30 }, [definition]);
  assert.deepEqual(expired.expired, []);
  const gameExpired = advanceEffects(expired.value, { round: 3, gameTimeSeconds: 60 }, [definition]);
  assert.deepEqual(gameExpired.expired, ["effect-b"]);
  const explanation = effectStatExplanation(second.value, { ac: 12 }, [definition]);
  assert.equal(explanation.values.ac, 14);
  assert.equal(explanation.explanations.ac.length, 2);
  assert.equal(explanation.formulas.ac.formulaKey, "shielded-ac");
});

test("P08 campaign time advances only through explicit commands and combat rounds", () => {
  const paused = normalizeCampaignClock({ sceneModes: { scene: "paused" } });
  assert.equal(advanceCampaignClock(paused, { sceneId: "scene", seconds: 10 }).code, "CLOCK_SCENE_PAUSED");
  const active = advanceCampaignClock({ ...paused, sceneModes: { scene: "active" } }, { sceneId: "scene", seconds: 10, eventId: "gm-1" });
  assert.equal(active.value.gameTimeSeconds, 10);
  assert.equal(advanceCampaignClock(active.value, { sceneId: "scene", seconds: 10, eventId: "gm-1" }).replayed, true);
  const round = advanceCombatRound(active.value, { sceneId: "scene", eventId: "round-1" });
  assert.equal(round.value.gameTimeSeconds, 16);
});

test("P09 pending resolutions remain ordered, resumable, deduplicated, and bounded", () => {
  const attack = createPendingResolution({ id: "oa-1", type: "opportunity-attack", priority: 10, initiativeSnapshot: 4, payload: { reactorId: "guard", targetId: "runner" }, requiredResponderIds: ["guard"] });
  const shield = createPendingResolution({ id: "shield-1", type: "shield", priority: 20, initiativeSnapshot: 2, payload: { targetId: "runner" }, requiredResponderIds: ["runner"] });
  assert.equal(attack.ok && shield.ok, true);
  let queue = enqueueResolution([], attack.value).value;
  queue = enqueueResolution(queue, shield.value).value;
  queue = enqueueResolution(queue, attack.value).value;
  assert.equal(currentResolution(queue).id, "shield-1");
  queue = beginResolution(queue, "shield-1").value;
  queue = respondToResolution(queue, "shield-1", { responderId: "runner", response: "accept" }).value;
  queue = completeResolution(queue, "shield-1", { boundaryId: "turn-start-2" }).value;
  const reloaded = normalizePendingResolutions(JSON.parse(JSON.stringify(queue)));
  assert.equal(reloaded.find((frame) => frame.id === "shield-1").status, "resolved");
  assert.equal(reloaded.filter((frame) => frame.id === "oa-1").length, 1);
});

test("P10 resource reservations and recovery are atomic and idempotent", () => {
  const ledger = normalizeResourceLedger({ pools: { spell: { kind: "spell-slots", current: 2, maximum: 3, label: "Spell slots" } } });
  const reserved = reserveSpend(ledger, "spell", 2, { reservationId: "cast-1", ownerId: "hero" });
  assert.equal(reserved.ok, true);
  assert.equal(reserveSpend(reserved.value, "spell", 1).ok, false);
  const committed = commitSpend(reserved.value, "cast-1");
  assert.equal(committed.value.pools.spell.current, 0);
  assert.equal(commitSpend(committed.value, "cast-1").replayed, true);
  const recovered = recoverPool(committed.value, "spell", { mode: "full", eventId: "dawn-1" });
  assert.equal(recovered.value.pools.spell.current, 3);
  assert.equal(recoverPool(recovered.value, "spell", { mode: "full", eventId: "dawn-1" }).replayed, true);
  const adjusted = adjustPool(recovered.value, "spell", -99, { eventId: "gm-negative" });
  assert.equal(adjusted.value.pools.spell.current, 0);
  assert.equal(releaseReservation(adjusted.value, "cast-1").replayed, true);
});

test("P10 item instances keep separate durable items, split stacks, and track final charges", () => {
  const catalog = {
    sword: { id: "sword", name: "Enchanted sword", kind: "weapon" },
    bolts: { id: "bolts", name: "Bolts", kind: "ammunition", stackable: true },
    lantern: { id: "lantern", name: "Charged lantern", kind: "wondrous", chargeMaximum: 2, chargeRechargeKind: "daily", chargeRechargeAmount: "all" },
  };
  const instances = materializeInventoryInstances([{ itemId: "sword", quantity: 2 }, { itemId: "bolts", quantity: 5 }, { itemId: "lantern", quantity: 1 }], { ownerId: "hero" }, catalog);
  assert.equal(instances.filter((entry) => entry.itemId === "sword").length, 2);
  const sword = transferItemInstance(instances, instances.find((entry) => entry.itemId === "sword").id, { kind: "chest", ownerId: "chest-1" }, {}, catalog);
  assert.equal(sword.ok, true);
  const bolts = instances.find((entry) => entry.itemId === "bolts");
  const split = transferItemInstance(sword.value, bolts.id, { kind: "ground", sceneId: "scene" }, { quantity: 2 }, catalog);
  assert.equal(split.ok, true);
  assert.equal(split.value.filter((entry) => entry.itemId === "bolts").reduce((sum, entry) => sum + entry.quantity, 0), 5);
  const lantern = instances.find((entry) => entry.itemId === "lantern");
  const spent = spendItemInstanceCharges(instances, lantern.id, 1, catalog);
  assert.equal(spent.value.find((entry) => entry.id === lantern.id).charges.current, 1);
  const final = spendItemInstanceCharges(spent.value, lantern.id, 1, catalog);
  assert.equal(final.value.find((entry) => entry.id === lantern.id).charges.current, 0);
  const restored = recoverItemInstanceCharges(final.value, "daily", {}, catalog);
  assert.equal(restored.value.find((entry) => entry.id === lantern.id).charges.current, 2);
  const attuned = attuneItemInstance(restored.value, lantern.id, "hero", {}, catalog);
  assert.equal(attuned.ok, true);
  assert.equal(transferItemInstance(attuned.value, "missing", { kind: "ground" }, {}, catalog).ok, false);
});

test("P10 rest recovery records a stable event and does not double apply on retry", () => {
  const hero = createHeroRecord({ id: "hero", level: 2, currentHp: 1, hitDiceSpent: 1 });
  const firstPatch = longRest(hero, { eventId: "rest-1" });
  const first = { ...hero, ...firstPatch.value };
  assert.equal(firstPatch.ok, true);
  assert.equal(first.recoveryLedger.processedEventIds.includes("rest-1"), true);
  const retry = longRest(first, { eventId: "rest-1" });
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.value, first);
});

test("P10 rest preview commits a typed breakdown once", () => {
  const hero = createHeroRecord({ id: "preview-hero", level: 2, currentHp: 1, hitDiceSpent: 1 });
  const preview = previewRest(hero, { kind: "short", diceToSpend: 1, random: () => 0 });
  assert.equal(preview.ok, true);
  assert.equal(preview.value.status, "preview");
  const committed = commitRestPreview(hero, preview.value, { eventId: "preview-rest-1" });
  assert.equal(committed.committed, true);
  const retry = commitRestPreview({ ...hero, ...committed.value }, preview.value, { eventId: "preview-rest-1" });
  assert.equal(retry.replayed, true);
});

test("P08–P10 records and reload normalization preserve the new durable fields", () => {
  const scene = createSceneRecord({
    id: "scene",
    board: { columns: 40, rows: 20, feetPerCell: 10 },
    effectDefinitions: [{ id: "effect", name: "Effect", operations: [{ op: "modify-stat", stat: "ac", amount: 1 }] }],
    tokens: [{ id: "token", effects: [{ id: "effect-1", definitionId: "effect", sourceId: "gm" }], conditionSources: {} }],
    encounter: { status: "active", initiativeOrder: ["token"], initiatives: { token: 10 }, activeIndex: 0, pendingResolutions: [{ id: "choice-1", type: "choice", payload: { field: "weapon" } }] },
  }, { id: "scene" });
  const reloaded = createSceneRecord(JSON.parse(JSON.stringify(scene)), { id: "scene" });
  assert.equal(reloaded.board.columns, 40);
  assert.equal(reloaded.tokens[0].effects[0].id, "effect-1");
  assert.equal(reloaded.encounter.pendingResolutions[0].id, "choice-1");
});
