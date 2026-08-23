import test from "node:test";
import assert from "node:assert/strict";

import { ATTACK_KIND_REACTION, performWeaponAttack, reactionAttackAvailability, toggleBattleCondition, readiedAttacksFor } from "./domain/attacks.js";
import {
  activateDash,
  activateReady,
  endTurn,
  escapeGrapple,
  moveActiveToken,
  performGrapple,
  performShove,
  planActiveMovement,
  releaseGrapple,
  selectMovementMode,
} from "./domain/combat.js";
import { applyBackgroundBenefits, BACKGROUND_DETAILS } from "./domain/heroes.js";
import { createHeroRecord, createSceneRecord } from "./domain/records.js";
import {
  createMonsterToken,
  createTurnResources,
  normalizeTableToken,
  prepareBattleStart,
  updateToken,
} from "./domain/table.js";
import { useHealingPotion } from "./domain/vitality.js";
import { HEALING_POTIONS, ITEM_BY_ID } from "./domain/catalog.js";
import { loadMonsters } from "./domain/monsters.js";

const VIEWPORT = { width: 880, height: 528, gridSize: 44 };
const at = (column, row) => ({ xPercent: (column + 0.5) * 5, yPercent: (row + 0.5) * (100 / 12) });
const token = (id, column, row, patch = {}) => normalizeTableToken({
  id,
  name: id,
  position: at(column, row),
  hp: 20,
  maxHp: 20,
  faction: id === "hero" ? "ally" : "foe",
  inventory: [{ itemId: "club", quantity: 1 }],
  loadout: { mainHand: "club", offHand: null },
  ...patch,
}, { id });
const battle = (tokens, patch = {}) => ({
  id: "scene",
  kind: "battle",
  tokens,
  chests: [],
  walls: [],
  difficultTerrain: [],
  encounter: {
    status: "active",
    initiativeOrder: tokens.map((entry) => entry.id),
    initiatives: Object.fromEntries(tokens.map((entry, index) => [entry.id, 20 - index])),
    activeIndex: 0,
    round: 1,
    surprisedTokenIds: [],
    resources: { [tokens[0].id]: createTurnResources(tokens[0]) },
    log: [],
    ...patch,
  },
});

test("monster condition immunities are structured and refuse condition application", async () => {
  const dragon = (await loadMonsters()).find((entry) => entry.id === "adult-green-dragon");
  const monster = createMonsterToken(dragon, { id: "dragon", position: at(2, 2) });
  assert.deepEqual(monster.conditionImmunities, ["poisoned"]);
  const scene = battle([token("hero", 1, 1), monster]);
  const changed = toggleBattleCondition(scene, monster.id, "poisoned");
  assert.equal(changed.ok, false);
  assert.equal(changed.code, "CONDITION_IMMUNE");
});

test("timed conditions expire when their named encounter round begins", () => {
  const hero = token("hero", 1, 1);
  const foe = token("foe", 3, 1);
  let scene = battle([hero, foe], {
    activeIndex: 1,
    resources: { foe: createTurnResources(foe) },
  });
  const applied = toggleBattleCondition(scene, foe.id, "poisoned", { durationRounds: 1 });
  assert.equal(applied.ok, true);
  scene = { ...scene, ...applied.value };
  assert.equal(scene.tokens[1].conditionExpiries.poisoned, 2);
  const ended = endTurn(scene);
  assert.equal(ended.ok, true);
  assert.equal(ended.value.encounter.round, 2);
  assert.deepEqual(ended.value.tokens.find((entry) => entry.id === "foe").conditions, []);
});

test("surprised creatures are skipped during round one and return in round two", () => {
  const surprised = token("hero", 1, 1, { surprised: true });
  const ready = token("foe", 3, 1);
  const prepared = prepareBattleStart({ kind: "battle", tokens: [surprised, ready], chests: [] }, {
    viewport: VIEWPORT,
    random: (() => { const values = [0.1, 0.99]; return () => values.shift(); })(),
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.encounter.activeIndex, 0);
  assert.equal(prepared.value.encounter.round, 1);
  let started = { kind: "battle", ...prepared.value };
  assert.equal(reactionAttackAvailability(started, "hero").code, "REACTION_SURPRISED");
  const wrapped = endTurn(started);
  assert.equal(wrapped.value.encounter.round, 2);
  assert.equal(wrapped.activeTokenId, "foe");
  started = { ...started, ...wrapped.value };
  assert.equal(reactionAttackAvailability(started, "hero").ok, true);
  const returned = endTurn(started);
  assert.equal(returned.activeTokenId, "hero");
});

test("healing potions roll healing, consume one item, and spend the Action", () => {
  assert.deepEqual(
    HEALING_POTIONS.map(({ id, healingDice, healingBonus }) => [id, healingDice, healingBonus]),
    [
      ["potion-of-healing-common", 2, 2],
      ["potion-of-healing-greater", 4, 4],
      ["potion-of-healing-superior", 8, 8],
      ["potion-of-healing-supreme", 10, 20],
    ],
  );
  const hero = token("hero", 1, 1, {
    hp: 8,
    inventory: [{ itemId: "club", quantity: 1 }, { itemId: "potion-of-healing-common", quantity: 2 }],
  });
  const scene = battle([hero, token("foe", 4, 1)]);
  const used = useHealingPotion(scene, "potion-of-healing-common", hero.id, VIEWPORT, { random: () => 0 });
  assert.equal(used.ok, true);
  assert.deepEqual(used.rolls, [1, 1]);
  assert.equal(used.value.tokens[0].hp, 12);
  assert.equal(used.value.tokens[0].inventory.find((entry) => entry.itemId === "potion-of-healing-common").quantity, 1);
  assert.equal(used.value.encounter.resources.hero.actionType, "potion");

  const downed = token("downed", 2, 1, { heroId: "downed-record", faction: "ally", hp: 0, dead: false, conditions: ["unconscious"] });
  const administered = useHealingPotion(battle([hero, downed]), "potion-of-healing-common", downed.id, VIEWPORT, { random: () => 0 });
  assert.equal(administered.ok, true);
  assert.equal(administered.value.tokens[1].hp, 4);
  assert.ok(!administered.value.tokens[1].conditions.includes("unconscious"));
});

test("Ready stores an attack and exposes it only for the chosen trigger", () => {
  const hero = token("hero", 1, 1);
  const foe = token("foe", 2, 1);
  const scene = battle([hero, foe]);
  const readied = activateReady(scene, { trigger: "target-moves", targetTokenId: foe.id, weaponId: "club", hand: "mainHand" });
  assert.equal(readied.ok, true);
  const after = { ...scene, ...readied.value };
  assert.equal(after.tokens[0].readiedAction.trigger, "target-moves");
  assert.equal(readiedAttacksFor(after, "target-attacks", foe.id).length, 0);
  assert.equal(readiedAttacksFor(after, "target-moves", foe.id).length, 1);

  const ended = endTurn(after);
  const triggeredScene = { ...after, ...ended.value };
  const triggered = performWeaponAttack(triggeredScene, {
    kind: ATTACK_KIND_REACTION,
    reactorId: hero.id,
    targetId: foe.id,
    weaponId: "club",
    hand: "mainHand",
    reactionType: "ready",
    viewport: VIEWPORT,
  }, { random: () => 0.95 });
  assert.equal(triggered.ok, true);
  const reactor = triggered.value.tokens.find((entry) => entry.id === hero.id);
  assert.equal(reactor.reactionSpent, true);
  assert.equal(reactor.readiedAction, null);

  const waitingHero = token("hero", 1, 1, {
    readiedAction: { trigger: "target-ends-turn", targetTokenId: foe.id, weaponId: "club", hand: "mainHand" },
  });
  const targetTurn = battle([foe, waitingHero]);
  const advanced = endTurn(targetTurn);
  const afterTargetTurn = { ...targetTurn, ...advanced.value };
  const endTriggered = performWeaponAttack(afterTargetTurn, {
    kind: ATTACK_KIND_REACTION,
    reactorId: waitingHero.id,
    targetId: foe.id,
    weaponId: "club",
    hand: "mainHand",
    reactionType: "ready",
    readyTrigger: "target-ends-turn",
    viewport: VIEWPORT,
  }, { random: () => 0.95 });
  assert.equal(endTriggered.ok, true);
  assert.equal(endTriggered.value.tokens.find((entry) => entry.id === waitingHero.id).reactionSpent, false);
});

test("all thirteen backgrounds grant skills, tools, and catalog-backed equipment", () => {
  assert.equal(BACKGROUND_DETAILS.length, 13);
  for (const entry of BACKGROUND_DETAILS) {
    assert.equal(entry.skills.length, 2);
    assert.ok(entry.equipment.length > 0);
    assert.ok(entry.equipment.every((grant) => ITEM_BY_ID[grant.itemId]));
  }
  const base = createHeroRecord({}, { id: "hero", now: "2026-08-24T00:00:00.000Z" });
  const soldier = applyBackgroundBenefits(base, "soldier");
  assert.equal(soldier.ok, true);
  assert.ok(soldier.value.skillProficiencies.includes("athletics"));
  assert.ok(soldier.value.toolProficiencies.includes("vehicles-land"));
  assert.ok(soldier.value.inventory.some((entry) => entry.itemId === "dice-set"));
  const persisted = createHeroRecord({ ...base, ...soldier.value }, { id: "persisted-hero", now: "2026-08-24T00:00:00.000Z" });
  assert.equal(persisted.backgroundBenefitId, "soldier");
  assert.ok(persisted.toolProficiencies.includes("vehicles-land"));
  const chosen = createHeroRecord({ skillProficiencies: ["perception"], inventory: [{ itemId: "rope-hempen-50-feet", quantity: 1 }] }, { id: "chosen", now: "2026-08-24T00:00:00.000Z" });
  const firstBackground = applyBackgroundBenefits(chosen, "soldier");
  const switched = applyBackgroundBenefits({ ...chosen, ...firstBackground.value }, "acolyte");
  assert.ok(switched.value.skillProficiencies.includes("perception"));
  assert.ok(!switched.value.skillProficiencies.includes("intimidation"));
  assert.ok(switched.value.inventory.some((entry) => entry.itemId === "rope-hempen-50-feet"));
});

test("movement modes use their own speed and flying ignores difficult terrain", () => {
  const hero = token("hero", 1, 1, { speeds: { walk: 30, fly: 60, swim: 20, climb: 15 } });
  const foe = token("foe", 10, 10);
  let scene = battle([hero, foe]);
  scene.difficultTerrain = ["2:1"];
  const walking = planActiveMovement(scene, hero.id, at(2, 1), VIEWPORT);
  assert.equal(walking.value.requestedFeet, 10);
  const selected = selectMovementMode(scene, "fly");
  assert.equal(selected.ok, true);
  scene = { ...scene, ...selected.value };
  const flying = planActiveMovement(scene, hero.id, at(2, 1), VIEWPORT);
  assert.equal(flying.value.requestedFeet, 5);
  assert.equal(flying.value.costFeet, 5);
  const dashed = activateDash(scene);
  assert.equal(dashed.ok, true);
  assert.equal(dashed.value.encounter.resources.hero.movementBase, 120);
});

test("Grapple and Shove resolve contested checks and apply their outcomes", () => {
  const hero = token("hero", 1, 1, { strength: 18, skillProficiencies: ["athletics"] });
  const foe = token("foe", 2, 1, { strength: 8, dexterity: 8 });
  let scene = battle([hero, foe]);
  const grapple = performGrapple(scene, foe.id, VIEWPORT, { random: (() => { const values = [0.95, 0]; return () => values.shift(); })() });
  assert.equal(grapple.ok, true);
  assert.equal(grapple.success, true);
  assert.ok(grapple.value.tokens[1].conditions.includes("grappled"));
  assert.equal(grapple.value.tokens[1].grappledById, hero.id);

  const immuneTarget = token("foe", 2, 1, { conditionImmunities: ["grappled"] });
  const immuneGrapple = performGrapple(battle([hero, immuneTarget]), immuneTarget.id, VIEWPORT, { random: (() => { const values = [0.95, 0]; return () => values.shift(); })() });
  assert.equal(immuneGrapple.ok, true);
  assert.equal(immuneGrapple.success, false);
  assert.equal(immuneGrapple.immune, true);

  let grappledScene = { ...scene, ...grapple.value };
  const ended = endTurn(grappledScene);
  grappledScene = { ...grappledScene, ...ended.value };
  const escaped = escapeGrapple(grappledScene, { random: (() => { const values = [0.95, 0]; return () => values.shift(); })() });
  assert.equal(escaped.ok, true);
  assert.equal(escaped.escaped, true);
  assert.equal(escaped.value.tokens[1].grappledById, null);
  assert.ok(!escaped.value.tokens[1].conditions.includes("grappled"));

  scene = battle([hero, foe]);
  const shove = performShove(scene, foe.id, "push", VIEWPORT, { random: (() => { const values = [0.95, 0]; return () => values.shift(); })() });
  assert.equal(shove.success, true);
  assert.deepEqual(shove.value.tokens[1].position, at(3, 1));

  const heldFoe = token("foe", 2, 1, { conditions: ["grappled"], grappledById: hero.id });
  scene = battle([hero, heldFoe]);
  const dragged = moveActiveToken(scene, hero.id, at(1, 2), VIEWPORT);
  assert.equal(dragged.ok, true);
  assert.equal(dragged.plan.costFeet, 10);
  assert.deepEqual(dragged.value.tokens.find((entry) => entry.id === heldFoe.id).position, at(1, 1));

  const released = releaseGrapple({ ...scene, ...dragged.value }, heldFoe.id);
  assert.equal(released.ok, true);
  assert.equal(released.value.tokens.find((entry) => entry.id === heldFoe.id).grappledById, null);

  const relinked = token("foe", 2, 1, { conditions: ["grappled"], grappledById: hero.id });
  const broken = updateToken([hero, relinked], hero.id, { hp: 0, conditions: ["unconscious"] });
  assert.equal(broken[1].grappledById, null);
  assert.ok(!broken[1].conditions.includes("grappled"));
});

test("difficult terrain is persisted by the Scene normalizer", () => {
  const scene = createSceneRecord({ kind: "battle", difficultTerrain: ["2:3", "2:3", "99:99"] }, { id: "scene", now: "2026-08-24T00:00:00.000Z" });
  assert.deepEqual(scene.difficultTerrain, ["2:3"]);
});
