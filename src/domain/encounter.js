import { ITEM_BY_ID } from "./catalog.js";
import { activeTurnContext } from "./combat.js";
import { isIncapacitated } from "./conditions.js";
import { abilityModifier } from "./heroes.js";
import {
  inventoryQuantity,
  normalizeInventoryEntries,
  setMainHand,
  setOffHand,
} from "./items.js";
import {
  appendEncounterLog,
  createTurnResources,
  normalizeBattleItems,
  normalizeChests,
  normalizeTableTokens,
  setupCellForPosition,
  setupGridMetrics,
  setupPositionForCell,
  updateChest,
  updateToken,
} from "./table.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message, recovery, retryable = false, metadata = {}) => ({
  ok: false,
  code,
  message,
  recovery,
  retryable,
  ...metadata,
});
const hasProperty = (weapon, property) => weapon?.propertyIds?.includes(property);
const cellKey = (cell) => `${cell.column}:${cell.row}`;
const sameOrAdjacent = (left, right) =>
  Math.max(Math.abs(left.column - right.column), Math.abs(left.row - right.row)) <= 1;
const randomUnit = (random) => Math.max(0, Math.min(0.999999999999, Number(random?.()) || 0));

export const AMMUNITION_BY_WEAPON = Object.freeze({
  "crossbow-light": "crossbow-bolt",
  shortbow: "arrow",
  sling: "sling-bullet",
  blowgun: "blowgun-needle",
  "crossbow-hand": "crossbow-bolt",
  "crossbow-heavy": "crossbow-bolt",
  longbow: "arrow",
});

export const LODGING_THROWN_WEAPON_IDS = Object.freeze([
  "dagger",
  "dart",
  "handaxe",
  "javelin",
  "spear",
  "trident",
]);

export const NON_LODGING_THROWN_WEAPON_IDS = Object.freeze(["light-hammer"]);

export function ammunitionForWeapon(weaponOrId) {
  const weapon = typeof weaponOrId === "string" ? ITEM_BY_ID[weaponOrId] : weaponOrId;
  const ammunitionId = AMMUNITION_BY_WEAPON[weapon?.id] || null;
  return ammunitionId ? ITEM_BY_ID[ammunitionId] || null : null;
}

export function attackSupplyAvailability(token, weapon, range) {
  if (hasProperty(weapon, "ammunition")) {
    const ammunition = ammunitionForWeapon(weapon);
    if (!ammunition) return failure(
      "AMMUNITION_MAPPING_MISSING",
      `${weapon.name} has no matching Nightforge ammunition definition.`,
      "Choose another equipped weapon.",
    );
    const quantity = inventoryQuantity(token?.inventory, ammunition.id);
    if (quantity < 1) return failure(
      "AMMUNITION_DEPLETED",
      `${weapon.name} requires ${ammunition.name}, but ${token?.name || "this token"} has none.`,
      "Retrieve or loot matching ammunition before firing.",
      true,
      { ammunition, quantity },
    );
    return success({ kind: "ammunition", ammunition, quantity });
  }
  if (range?.usage === "thrown") {
    if (![...LODGING_THROWN_WEAPON_IDS, ...NON_LODGING_THROWN_WEAPON_IDS].includes(weapon?.id)) return failure(
      "THROWN_WEAPON_UNSUPPORTED",
      `${weapon?.name || "That weapon"} has no physical thrown-item behavior.`,
      "Choose another weapon or use it in melee.",
    );
    if (inventoryQuantity(token?.inventory, weapon.id) < 1) return failure(
      "THROWN_WEAPON_MISSING",
      `${token?.name || "This token"} no longer owns the equipped ${weapon.name}.`,
      "Choose another equipped weapon.",
    );
    return success({ kind: "thrown", weapon });
  }
  return success({ kind: "none" });
}

const inventoryWithDelta = (inventory, itemId, delta) => {
  const next = normalizeInventoryEntries(inventory).inventory
    .filter((entry) => entry.itemId !== itemId);
  const quantity = Math.max(0, inventoryQuantity(inventory, itemId) + delta);
  if (quantity > 0) next.push({ itemId, quantity });
  return normalizeInventoryEntries(next).inventory;
};

export function nearbyThrownLanding(scene, targetPosition, viewport, tokens = scene?.tokens, battleItems = scene?.encounter?.battleItems) {
  const metrics = setupGridMetrics(viewport);
  const targetCell = setupCellForPosition(targetPosition, viewport);
  const occupied = new Set();
  for (const token of normalizeTableTokens(tokens)) occupied.add(cellKey(setupCellForPosition(token.position, viewport)));
  for (const chest of normalizeChests(scene?.chests)) occupied.add(cellKey(setupCellForPosition(chest.position, viewport)));
  for (const item of normalizeBattleItems(battleItems, tokens)) {
    if (item.state === "ground") occupied.add(cellKey(setupCellForPosition(item.position, viewport)));
  }
  const candidates = [];
  for (let row = 0; row < metrics.rows; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) {
      const dx = Math.abs(column - targetCell.column);
      const dy = Math.abs(row - targetCell.row);
      candidates.push({ column, row, ring: Math.max(dx, dy), manhattan: dx + dy });
    }
  }
  candidates.sort((left, right) =>
    left.ring - right.ring || left.manhattan - right.manhattan || left.row - right.row || left.column - right.column,
  );
  const landing = candidates.find((cell) => !occupied.has(cellKey(cell)));
  return landing ? setupPositionForCell(landing, viewport) : null;
}

/**
 * A thrown authored attack leaves the creature the same way a thrown catalog
 * weapon does, but there is no item to remove from an inventory. The attack is
 * marked thrown so it disappears from the command drawer, and a battle item
 * carrying its name and id is dropped on the board so it can be recovered.
 */
function applyAuthoredThrowEffects({
  scene, normalizedTokens, encounter, attacker, target,
  attack, range, hit, viewport, battleItemId,
} = {}) {
  if (range.usage !== "thrown") {
    return success({ tokens: normalizedTokens, encounter }, { supply: { kind: "none" } });
  }
  if (typeof battleItemId !== "string" || !battleItemId.trim()) return failure(
    "BATTLE_ITEM_ID_REQUIRED",
    "Nightforge could not create a stable identity for the thrown weapon.",
    "Retry the attack.",
    true,
  );
  const existingBattleItems = normalizeBattleItems(encounter?.battleItems, normalizedTokens);
  if (existingBattleItems.some((item) => item.id === battleItemId.trim())) return failure(
    "BATTLE_ITEM_ID_CONFLICT",
    "That thrown-weapon identity is already present in this encounter.",
    "Retry the attack with a fresh stable identity.",
    true,
  );
  const embedded = hit;
  const position = embedded
    ? null
    : nearbyThrownLanding(scene, target.position, viewport, normalizedTokens, encounter?.battleItems);
  if (!embedded && !position) return failure(
    "THROWN_LANDING_UNAVAILABLE",
    `${attack.name} has no legal nearby cell where it can land.`,
    "Clear a nearby cell or choose another attack.",
    true,
  );
  const attacks = attacker.attacks.map((entry) =>
    entry.id === attack.id ? { ...entry, thrown: true } : entry,
  );
  const battleItem = {
    id: battleItemId.trim(),
    itemId: null,
    attackId: attack.id,
    name: attack.name,
    state: embedded ? "embedded" : "ground",
    position,
    carrierTokenId: embedded ? target.id : null,
    sourceTokenId: attacker.id,
  };
  return success({
    tokens: updateToken(normalizedTokens, attacker.id, { attacks }),
    encounter: {
      ...encounter,
      battleItems: [...existingBattleItems, battleItem],
    },
  }, { supply: { kind: "authored-thrown", attackId: attack.id, embedded, battleItemId: battleItem.id }, battleItem });
}

export function applyAttackSupplyEffects({
  scene,
  tokens,
  encounter,
  attackerId,
  targetId,
  weapon,
  hand,
  authoredAttack = null,
  range,
  hit,
  viewport,
  battleItemId,
} = {}) {
  const normalizedTokens = normalizeTableTokens(tokens);
  const attacker = normalizedTokens.find((token) => token.id === attackerId);
  const target = normalizedTokens.find((token) => token.id === targetId);
  if (!attacker || !target) return failure(
    "ATTACK_SUPPLY_TOKEN_MISSING",
    "The attack participants are no longer present.",
    "Return to Battle and choose another target.",
  );
  if (authoredAttack) {
    return applyAuthoredThrowEffects({
      scene, normalizedTokens, encounter, attacker, target,
      attack: authoredAttack, range, hit, viewport, battleItemId,
    });
  }
  const available = attackSupplyAvailability(attacker, weapon, range);
  if (!available.ok) return available;
  if (available.value.kind === "none") return success({ tokens: normalizedTokens, encounter }, { supply: available.value });

  if (available.value.kind === "ammunition") {
    const ammunition = available.value.ammunition;
    const inventory = inventoryWithDelta(attacker.inventory, ammunition.id, -1);
    const nextTokens = updateToken(normalizedTokens, attacker.id, { inventory });
    const priorSpent = encounter?.ammoSpentByToken?.[attacker.id] || {};
    const ammoSpentByToken = {
      ...(encounter?.ammoSpentByToken || {}),
      [attacker.id]: {
        ...priorSpent,
        [ammunition.id]: Math.max(0, Number(priorSpent[ammunition.id]) || 0) + 1,
      },
    };
    return success({
      tokens: nextTokens,
      encounter: { ...encounter, ammoSpentByToken },
    }, { supply: { kind: "ammunition", ammunitionId: ammunition.id, remaining: available.value.quantity - 1 } });
  }

  if (typeof battleItemId !== "string" || !battleItemId.trim()) return failure(
    "BATTLE_ITEM_ID_REQUIRED",
    "Nightforge could not create a stable identity for the thrown weapon.",
    "Retry the attack.",
    true,
  );
  const existingBattleItems = normalizeBattleItems(encounter?.battleItems, normalizedTokens);
  if (existingBattleItems.some((item) => item.id === battleItemId.trim())) return failure(
    "BATTLE_ITEM_ID_CONFLICT",
    "That thrown-weapon identity is already present in this encounter.",
    "Retry the attack with a fresh stable identity.",
    true,
  );
  const lodging = LODGING_THROWN_WEAPON_IDS.includes(weapon.id);
  const embedded = lodging && hit;
  const position = embedded
    ? null
    : nearbyThrownLanding(scene, target.position, viewport, normalizedTokens, encounter?.battleItems);
  if (!embedded && !position) return failure(
    "THROWN_LANDING_UNAVAILABLE",
    `${weapon.name} has no legal nearby cell where it can land.`,
    "Clear a nearby cell or choose another attack.",
    true,
  );

  const inventory = inventoryWithDelta(attacker.inventory, weapon.id, -1);
  const originalLoadout = attacker.loadout || { mainHand: null, offHand: null };
  const loadout = hand === "mainHand"
    ? { mainHand: originalLoadout.offHand || null, offHand: null }
    : { mainHand: originalLoadout.mainHand || null, offHand: null };
  const nextTokens = updateToken(normalizedTokens, attacker.id, { inventory, loadout });
  const nextAttacker = nextTokens.find((token) => token.id === attacker.id);
  const currentResources = encounter?.resources?.[attacker.id];
  let resources = encounter?.resources;
  if (currentResources?.offHandAttackAvailable && currentResources.offHandWeaponId) {
    const followupHand = nextAttacker?.loadout?.mainHand === currentResources.offHandWeaponId
      ? "mainHand"
      : nextAttacker?.loadout?.offHand === currentResources.offHandWeaponId
        ? "offHand"
        : null;
    resources = {
      [attacker.id]: {
        ...currentResources,
        offHandAttackAvailable: Boolean(followupHand),
        offHandAttackHand: followupHand,
        offHandWeaponId: followupHand ? currentResources.offHandWeaponId : null,
      },
    };
  }
  const battleItem = {
    id: battleItemId.trim(),
    itemId: weapon.id,
    state: embedded ? "embedded" : "ground",
    position,
    carrierTokenId: embedded ? target.id : null,
    sourceTokenId: attacker.id,
  };
  return success({
    tokens: nextTokens,
    encounter: {
      ...encounter,
      resources,
      battleItems: [...existingBattleItems, battleItem],
    },
  }, { supply: { kind: "thrown", weaponId: weapon.id, embedded, battleItemId: battleItem.id }, battleItem });
}

function recoverCompletionAmmunition(tokens, ammoSpentByToken) {
  let nextTokens = normalizeTableTokens(tokens);
  const recovery = [];
  for (const [tokenId, spentByItem] of Object.entries(ammoSpentByToken || {})) {
    const token = nextTokens.find((entry) => entry.id === tokenId);
    if (!token) continue;
    let inventory = token.inventory;
    for (const [itemId, spentValue] of Object.entries(spentByItem || {})) {
      const spent = Math.max(0, Math.floor(Number(spentValue) || 0));
      const quantity = Math.floor(spent * 0.5);
      if (ITEM_BY_ID[itemId]?.kind !== "ammunition" || quantity <= 0) continue;
      inventory = inventoryWithDelta(inventory, itemId, quantity);
      recovery.push({ tokenId, itemId, spent, quantity });
    }
    nextTokens = updateToken(nextTokens, tokenId, { inventory });
  }
  return { tokens: nextTokens, recovery };
}

export function completeEncounterIfNeeded(tokens, encounter) {
  const normalizedTokens = normalizeTableTokens(tokens);
  if (!encounter || encounter.status !== "active") return success({ tokens: normalizedTokens, encounter }, { completed: false, recovery: [] });
  const living = normalizedTokens.filter((token) => token.hp > 0);
  if (living.length > 1) return success({ tokens: normalizedTokens, encounter }, { completed: false, recovery: [] });
  const recovered = encounter.ammunitionRecovered
    ? { tokens: normalizedTokens, recovery: [] }
    : recoverCompletionAmmunition(normalizedTokens, encounter.ammoSpentByToken);
  const winnerTokenId = living.length === 1 ? living[0].id : null;
  const resultText = winnerTokenId
    ? `${living[0].name} wins the Battle.`
    : "The Battle ends with no survivor.";
  const recoveryText = recovered.recovery.length
    ? ` Recovered ${recovered.recovery.reduce((total, entry) => total + entry.quantity, 0)} spent ammunition.`
    : "";
  return success({
    tokens: recovered.tokens,
    encounter: {
      ...encounter,
      status: "complete",
      winnerTokenId,
      ammunitionRecovered: true,
      log: appendEncounterLog(encounter.log, `${resultText}${recoveryText}`),
    },
  }, { completed: true, winnerTokenId, recovery: recovered.recovery });
}

function activeBonusContext(scene) {
  const context = activeTurnContext(scene);
  if (!context.ok) return context;
  const { token, resources } = context.value;
  if (token.hp <= 0 || isIncapacitated(token.conditions)) return failure(
    "BONUS_COMMAND_INCAPACITATED",
    `${token.name} cannot use this command while incapacitated or defeated.`,
    "Remove the condition or end the turn.",
  );
  return context;
}

export function openChestAvailability(scene, chestId, viewport) {
  const context = activeBonusContext(scene);
  if (!context.ok) return context;
  const chest = normalizeChests(scene?.chests).find((entry) => entry.id === chestId);
  if (!chest) return failure("CHEST_NOT_FOUND", "That chest is no longer on this Table.", "Choose another chest.");
  const actorCell = setupCellForPosition(context.value.token.position, viewport);
  const chestCell = setupCellForPosition(chest.position, viewport);
  if (!sameOrAdjacent(actorCell, chestCell)) return failure(
    "CHEST_NOT_ADJACENT",
    `${context.value.token.name} is not adjacent to this chest.`,
    "Move onto an adjacent square before opening it.",
    true,
  );
  const alreadyOpen = context.value.resources.openedChestId === chest.id &&
    context.value.resources.bonusActionSpent && context.value.resources.bonusActionType === "open chest";
  if (!alreadyOpen && context.value.resources.bonusActionSpent) return failure(
    "BONUS_ACTION_SPENT",
    `The Bonus Action was already spent on ${context.value.resources.bonusActionType || "another command"}.`,
    "End the turn to refresh it.",
  );
  return success({ ...context.value, chest, alreadyOpen });
}

export const chestCommandOptions = (scene, viewport) => normalizeChests(scene?.chests).map((chest) => ({
  chest,
  availability: openChestAvailability(scene, chest.id, viewport),
}));

export function openAdjacentChest(scene, chestId, viewport) {
  const available = openChestAvailability(scene, chestId, viewport);
  if (!available.ok) return available;
  if (available.value.alreadyOpen) return success({ encounter: scene.encounter }, { chest: available.value.chest, resumed: true });
  const { token, resources, chest } = available.value;
  return success({
    encounter: {
      ...scene.encounter,
      resources: {
        [token.id]: {
          ...resources,
          bonusActionSpent: true,
          bonusActionType: "open chest",
          openedChestId: chest.id,
          openedLootTokenId: null,
        },
      },
      log: appendEncounterLog(scene.encounter.log, `${token.name} opens a chest.`),
    },
  }, { chest, resumed: false });
}

export function takeOneFromOpenChest(scene, chestId, itemId, viewport) {
  const available = openChestAvailability(scene, chestId, viewport);
  if (!available.ok) return available;
  const { token, resources } = available.value;
  if (!available.value.alreadyOpen) return failure(
    "CHEST_NOT_OPEN",
    "This chest was not opened by the active token this turn.",
    "Open an adjacent chest with the Bonus Action first.",
  );
  const chests = normalizeChests(scene?.chests);
  const chest = chests.find((entry) => entry.id === chestId);
  const item = ITEM_BY_ID[itemId];
  if (!chest) return failure("CHEST_NOT_FOUND", "That chest is no longer on this Table.", "Close the loot drawer.");
  if (!item || inventoryQuantity(chest.inventory, itemId) < 1) return failure(
    "CHEST_ITEM_DEPLETED",
    "That item is no longer inside this chest.",
    "Choose another item or close the empty chest.",
    true,
  );
  const chestInventory = inventoryWithDelta(chest.inventory, itemId, -1);
  const tokenInventory = inventoryWithDelta(token.inventory, itemId, 1);
  return success({
    tokens: updateToken(available.value.tokens, token.id, { inventory: tokenInventory }),
    chests: updateChest(chests, chest.id, { inventory: chestInventory }),
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: resources },
      log: appendEncounterLog(scene.encounter.log, `${token.name} takes 1 ${item.name} from the chest.`),
    },
  }, { chestId, item, quantityRemaining: inventoryQuantity(chestInventory, itemId) });
}

/**
 * Looting a defeated token works exactly like looting a chest: stand next to
 * it, spend the Bonus Action to open it, then take one unit at a time. A body
 * that has been emptied stays empty.
 */
export function lootTokenAvailability(scene, lootTokenId, viewport) {
  const context = activeBonusContext(scene);
  if (!context.ok) return context;
  const quarry = context.value.tokens.find((entry) => entry.id === lootTokenId);
  if (!quarry) return failure("LOOT_TOKEN_NOT_FOUND", "That token is no longer on this Table.", "Choose another token.");
  if (quarry.id === context.value.token.id) return failure(
    "LOOT_TOKEN_IS_SELF",
    `${context.value.token.name} cannot loot itself.`,
    "Choose a defeated token nearby.",
  );
  if (quarry.hp > 0) return failure(
    "LOOT_TOKEN_ALIVE",
    `${quarry.name} is still standing.`,
    "Only a defeated token can be searched.",
    true,
  );
  const actorCell = setupCellForPosition(context.value.token.position, viewport);
  const quarryCell = setupCellForPosition(quarry.position, viewport);
  if (!sameOrAdjacent(actorCell, quarryCell)) return failure(
    "LOOT_TOKEN_NOT_ADJACENT",
    `${context.value.token.name} is not adjacent to ${quarry.name}.`,
    "Move onto an adjacent square before searching it.",
    true,
  );
  const alreadyOpen = context.value.resources.openedLootTokenId === quarry.id &&
    context.value.resources.bonusActionSpent && context.value.resources.bonusActionType === "search body";
  if (!alreadyOpen && context.value.resources.bonusActionSpent) return failure(
    "BONUS_ACTION_SPENT",
    `The Bonus Action was already spent on ${context.value.resources.bonusActionType || "another command"}.`,
    "End the turn to refresh it.",
  );
  return success({ ...context.value, quarry, alreadyOpen });
}

export const lootCommandOptions = (scene, viewport) => normalizeTableTokens(scene?.tokens)
  .filter((token) => token.hp <= 0 && token.inventory.length)
  .map((token) => ({
    token,
    availability: lootTokenAvailability(scene, token.id, viewport),
  }));

export function searchDefeatedToken(scene, lootTokenId, viewport) {
  const available = lootTokenAvailability(scene, lootTokenId, viewport);
  if (!available.ok) return available;
  if (available.value.alreadyOpen) return success({ encounter: scene.encounter }, { quarry: available.value.quarry, resumed: true });
  const { token, resources, quarry } = available.value;
  return success({
    encounter: {
      ...scene.encounter,
      resources: {
        [token.id]: {
          ...resources,
          bonusActionSpent: true,
          bonusActionType: "search body",
          openedLootTokenId: quarry.id,
          openedChestId: null,
        },
      },
      log: appendEncounterLog(scene.encounter.log, `${token.name} searches ${quarry.name}.`),
    },
  }, { quarry, resumed: false });
}

export function takeOneFromDefeatedToken(scene, lootTokenId, itemId, viewport) {
  const available = lootTokenAvailability(scene, lootTokenId, viewport);
  if (!available.ok) return available;
  const { token, resources, quarry } = available.value;
  if (!available.value.alreadyOpen) return failure(
    "LOOT_TOKEN_NOT_OPEN",
    "This body was not searched by the active token this turn.",
    "Search an adjacent defeated token with the Bonus Action first.",
  );
  const item = ITEM_BY_ID[itemId];
  if (!item || inventoryQuantity(quarry.inventory, itemId) < 1) return failure(
    "LOOT_ITEM_DEPLETED",
    `That item is no longer on ${quarry.name}.`,
    "Choose another item or close the drawer.",
    true,
  );
  const quarryInventory = inventoryWithDelta(quarry.inventory, itemId, -1);
  const takerInventory = inventoryWithDelta(token.inventory, itemId, 1);
  const tokens = updateToken(
    updateToken(available.value.tokens, quarry.id, { inventory: quarryInventory }),
    token.id,
    { inventory: takerInventory },
  );
  return success({
    tokens,
    encounter: {
      ...scene.encounter,
      resources: { [token.id]: resources },
      log: appendEncounterLog(scene.encounter.log, `${token.name} takes 1 ${item.name} from ${quarry.name}.`),
    },
  }, { lootTokenId, item, quantityRemaining: inventoryQuantity(quarryInventory, itemId) });
}

export function retrievalAvailability(scene, battleItemId, viewport) {
  const context = activeBonusContext(scene);
  if (!context.ok) return context;
  const battleItem = normalizeBattleItems(scene?.encounter?.battleItems, context.value.tokens)
    .find((entry) => entry.id === battleItemId);
  if (!battleItem) return failure("BATTLE_ITEM_NOT_FOUND", "That physical weapon is no longer present.", "Choose another weapon marker.");
  // A thrown authored attack belongs to the creature that threw it; nobody else
  // has anything to gain by picking it up.
  if (battleItem.attackId && battleItem.sourceTokenId !== context.value.token.id) return failure(
    "AUTHORED_ITEM_NOT_OWNER",
    `${battleItem.name} can only be recovered by whoever threw it.`,
    "Wait for its owner's turn.",
  );
  const actorCell = setupCellForPosition(context.value.token.position, viewport);
  if (battleItem.state === "ground") {
    const itemCell = setupCellForPosition(battleItem.position, viewport);
    if (!sameOrAdjacent(actorCell, itemCell)) return failure(
      "GROUND_ITEM_NOT_ADJACENT",
      `${context.value.token.name} is not close enough to retrieve ${battleItem.name || "that weapon"}.`,
      "Move onto the same or an adjacent square.",
      true,
    );
    if (context.value.resources.bonusActionSpent) return failure(
      "BONUS_ACTION_SPENT",
      `The Bonus Action was already spent on ${context.value.resources.bonusActionType || "another command"}.`,
      "End the turn to refresh it.",
    );
    return success({ ...context.value, battleItem, retrievalKind: "ground", cost: "bonus", requiresRoll: false });
  }
  const carrier = context.value.tokens.find((token) => token.id === battleItem.carrierTokenId);
  if (!carrier) return failure("CARRIER_NOT_FOUND", "The embedded weapon has no valid carrier.", "Return to Setup and restart the encounter.");
  const carrierCell = setupCellForPosition(carrier.position, viewport);
  if (carrier.hp <= 0) {
    if (carrier.id === context.value.token.id || !sameOrAdjacent(actorCell, carrierCell)) return failure(
      "DEFEATED_CARRIER_NOT_ADJACENT",
      `${context.value.token.name} is not adjacent to the defeated carrier.`,
      "Move onto an adjacent square.",
      true,
    );
    return success({ ...context.value, battleItem, carrier, retrievalKind: "defeated-carrier", cost: "free", requiresRoll: false });
  }
  if (carrier.id !== context.value.token.id && !sameOrAdjacent(actorCell, carrierCell)) return failure(
    "LIVING_CARRIER_NOT_ADJACENT",
    `${context.value.token.name} is not the carrier or adjacent to it.`,
    "Move next to the living carrier before attempting retrieval.",
    true,
  );
  if (context.value.resources.bonusActionSpent) return failure(
    "BONUS_ACTION_SPENT",
    `The Bonus Action was already spent on ${context.value.resources.bonusActionType || "another command"}.`,
    "End the turn to refresh it.",
  );
  return success({ ...context.value, battleItem, carrier, retrievalKind: "living-carrier", cost: "bonus", requiresRoll: true });
}

export const retrievalCommandOptions = (scene, viewport) => normalizeBattleItems(scene?.encounter?.battleItems, scene?.tokens).map((battleItem) => ({
  battleItem,
  availability: retrievalAvailability(scene, battleItem.id, viewport),
}));

function giveRecoveredWeapon(tokens, tokenId, itemId) {
  const normalizedTokens = normalizeTableTokens(tokens);
  const token = normalizedTokens.find((entry) => entry.id === tokenId);
  const inventory = inventoryWithDelta(token.inventory, itemId, 1);
  let candidate = { ...token, inventory };
  let placement = "inventory";
  if (!candidate.loadout.mainHand) {
    const equipped = setMainHand(candidate, itemId);
    if (equipped.ok) {
      candidate = { ...candidate, ...equipped.value };
      placement = "mainHand";
    }
  } else if (!candidate.loadout.offHand) {
    const equipped = setOffHand(candidate, itemId);
    if (equipped.ok) {
      candidate = { ...candidate, ...equipped.value };
      placement = "offHand";
    }
  }
  return { tokens: updateToken(normalizedTokens, tokenId, candidate), placement };
}

export function retrieveBattleItem(scene, battleItemId, viewport, { random = Math.random } = {}) {
  const available = retrievalAvailability(scene, battleItemId, viewport);
  if (!available.ok) return available;
  const { token, resources, battleItem, retrievalKind } = available.value;
  const weapon = battleItem.attackId ? null : ITEM_BY_ID[battleItem.itemId];
  const weaponName = weapon?.name || battleItem.name;
  const roll = available.value.requiresRoll ? Math.floor(randomUnit(random) * 20) + 1 : null;
  const strengthModifier = abilityModifier(token.strength);
  const dexterityModifier = abilityModifier(token.dexterity);
  const total = roll === null ? null : roll + strengthModifier + dexterityModifier;
  const succeeded = roll === null || total >= 15;
  const nextResources = available.value.cost === "bonus"
    ? {
        ...resources,
        bonusActionSpent: true,
        bonusActionType: "retrieve weapon",
        openedChestId: null,
        openedLootTokenId: null,
      }
    : resources;
  let tokens = available.value.tokens;
  let battleItems = normalizeBattleItems(scene.encounter.battleItems, tokens);
  let placement = null;
  if (succeeded && battleItem.attackId) {
    // An authored attack is a capability, not an object: recovering it puts the
    // attack back on its owner's list rather than an item into an inventory.
    const owner = tokens.find((entry) => entry.id === battleItem.sourceTokenId);
    const attacks = (owner?.attacks || []).map((entry) =>
      entry.id === battleItem.attackId ? { ...entry, thrown: false } : entry,
    );
    tokens = updateToken(tokens, battleItem.sourceTokenId, { attacks });
    placement = "attack";
    battleItems = battleItems.filter((entry) => entry.id !== battleItem.id);
  } else if (succeeded) {
    const recovered = giveRecoveredWeapon(tokens, token.id, battleItem.itemId);
    tokens = recovered.tokens;
    placement = recovered.placement;
    battleItems = battleItems.filter((entry) => entry.id !== battleItem.id);
  }
  const verdict = succeeded ? "retrieves" : "fails to retrieve";
  const encounter = {
    ...scene.encounter,
    resources: { [token.id]: nextResources },
    battleItems,
    log: appendEncounterLog(scene.encounter.log, `${token.name} ${verdict} ${weaponName}${total === null ? "" : ` (${total} vs DC 15)`}.`),
  };
  const outcome = {
    actorId: token.id,
    actorName: token.name,
    battleItemId: battleItem.id,
    weaponId: weapon?.id || null,
    weaponName,
    retrievalKind,
    cost: available.value.cost,
    requiresRoll: available.value.requiresRoll,
    roll,
    strengthModifier,
    dexterityModifier,
    total,
    dc: 15,
    succeeded,
    placement,
  };
  return success({ tokens, encounter }, { outcome });
}

export function restartCompletedBattle(scene, { random = Math.random } = {}) {
  if (scene?.kind !== "battle" || scene?.encounter?.status !== "complete") return failure(
    "COMPLETED_BATTLE_REQUIRED",
    "Only a completed Battle can be restarted.",
    "Finish the active encounter before restarting it.",
  );
  const tokens = normalizeTableTokens(scene.tokens).map((token) => ({
    ...token,
    hp: token.maxHp,
    conditions: [],
    // Weapons thrown during the last run are back in hand.
    attacks: token.attacks.map((attack) => ({ ...attack, thrown: false })),
  }));
  if (tokens.length < 2) return failure(
    "BATTLE_NEEDS_TOKENS",
    "Restart requires at least two tokens.",
    "Return to Setup and add another token.",
    true,
  );
  const initiatives = Object.fromEntries(tokens.map((token) => [
    token.id,
    Math.floor(randomUnit(random) * 20) + 1 + token.initiativeBonus,
  ]));
  const orderIndex = new Map(tokens.map((token, index) => [token.id, index]));
  const initiativeOrder = tokens.map((token) => token.id).sort((left, right) =>
    initiatives[right] - initiatives[left] || orderIndex.get(left) - orderIndex.get(right),
  );
  const firstToken = tokens.find((token) => token.id === initiativeOrder[0]);
  return success({
    tokens,
    encounter: {
      version: 1,
      status: "active",
      initiativeOrder,
      initiatives,
      activeIndex: 0,
      round: 1,
      resources: { [firstToken.id]: createTurnResources(firstToken) },
      battleItems: [],
      ammoSpentByToken: {},
      ammunitionRecovered: false,
      winnerTokenId: null,
      log: [`Battle restarted with ${tokens.length} tokens.`],
    },
  }, { activeTokenId: firstToken.id });
}
