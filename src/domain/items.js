import { ITEM_BY_ID, ITEM_CATALOG, getItem } from "./catalog.js";

const success = (value, metadata = {}) => ({ ok: true, value, ...metadata });
const failure = (code, message) => ({ ok: false, code, message });
export const MAX_INVENTORY_QUANTITY = Number.MAX_SAFE_INTEGER;

export const positiveInteger = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(MAX_INVENTORY_QUANTITY, Math.floor(number));
};

const addQuantities = (left, right) =>
  Math.min(MAX_INVENTORY_QUANTITY, left + right);

export function normalizeInventoryEntries(entries, catalogById = ITEM_BY_ID) {
  const quantities = new Map();
  const unknownItemIds = new Set();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const itemId = typeof entry?.itemId === "string" ? entry.itemId.trim() : "";
      const quantity = positiveInteger(entry?.quantity);
      if (!itemId || quantity <= 0) continue;
      if (!catalogById[itemId]) {
        unknownItemIds.add(itemId);
        continue;
      }
      quantities.set(itemId, addQuantities(quantities.get(itemId) || 0, quantity));
    }
  }
  return {
    inventory: [...quantities].map(([itemId, quantity]) => ({ itemId, quantity })),
    unknownItemIds: [...unknownItemIds],
  };
}

export const inventoryQuantity = (inventory, itemId) =>
  inventory?.find((entry) => entry.itemId === itemId)?.quantity || 0;

export const ownsItem = (hero, itemId, quantity = 1) =>
  inventoryQuantity(hero?.inventory, itemId) >= quantity;

const isWeapon = (item) => item?.kind === "weapon";
const isArmor = (item) => item?.kind === "armor" && item.category !== "shield";
const isShield = (item) => item?.kind === "armor" && item.category === "shield";
const isLightMelee = (item) =>
  isWeapon(item) && item.weaponRange === "melee" && item.propertyIds?.includes("light");
const isTwoHanded = (item) => isWeapon(item) && item.propertyIds?.includes("two-handed");

// Special is lance-only in the SRD import. A lance needs two hands when the
// wielder is not mounted. There is no mounted state anywhere in the scene
// record, so Nightforge always enforces the on-foot rule.
export const isSpecialWeapon = (item) =>
  isWeapon(item) && item.propertyIds?.includes("special");
export const requiresTwoHands = (item) =>
  isTwoHanded(item) || (isSpecialWeapon(item) && item?.id === "lance");

// Monk tags which weapons count as monk weapons once the Monk class lands.
// No Monk class exists yet, so this is reference-only: it never changes
// legality, damage, or ability choice. Kept as a helper so the tag has one
// owner instead of scattered string checks.
export const isMonkWeapon = (item) =>
  isWeapon(item) && item.propertyIds?.includes("monk");

export const MAX_ATTUNED_ITEMS = 3;

const uniqueIds = (value) => Array.isArray(value)
  ? [...new Set(value.filter((entry) => typeof entry === "string" && entry.trim()))]
  : [];

const chargeMaximum = (item) => Math.max(0, Math.floor(Number(item?.chargeMaximum) || 0));

/** Charge pools belong to a Hero record; generated catalog entries stay immutable. */
export function normalizeItemCharges(value, inventory = [], catalogById = ITEM_BY_ID) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const owned = new Set(normalizeInventoryEntries(inventory, catalogById).inventory.map((entry) => entry.itemId));
  const normalized = {};
  for (const itemId of owned) {
    const item = getItem(itemId, catalogById);
    const maximum = chargeMaximum(item);
    if (!maximum) continue;
    const raw = source[itemId];
    const current = typeof raw === "object" && raw !== null ? raw.current : raw;
    normalized[itemId] = {
      current: Math.max(0, Math.min(maximum, Math.floor(Number(current ?? maximum) || 0))),
      max: maximum,
    };
  }
  return normalized;
}

const requestedAttunements = (hero) => uniqueIds(
  Array.isArray(hero?.attunedItemIds) ? hero.attunedItemIds : hero?.wornItemIds,
);

/** Items whose passive/implemented effects are currently active. */
export function activeMagicItemIds(hero, catalogById = ITEM_BY_ID) {
  const attuned = new Set(requestedAttunements(hero));
  return uniqueIds(hero?.wornItemIds).filter((itemId) => {
    if (!ownsItem(hero, itemId)) return false;
    const item = getItem(itemId, catalogById);
    if (!item || (!item.implementedEffect && !item.requiresAttunement)) return false;
    return !item.requiresAttunement || attuned.has(itemId);
  });
}

export function normalizeEquipment(hero, inventory = hero?.inventory || [], catalogById = ITEM_BY_ID) {
  const normalizedHero = { ...hero, inventory };
  let mainHand = ownsItem(normalizedHero, hero?.loadout?.mainHand) && isWeapon(getItem(hero?.loadout?.mainHand, catalogById))
    ? hero.loadout.mainHand
    : null;
  let offHand = ownsItem(normalizedHero, hero?.loadout?.offHand) && isWeapon(getItem(hero?.loadout?.offHand, catalogById))
    ? hero.loadout.offHand
    : null;
  let armorId = ownsItem(normalizedHero, hero?.armorId) && isArmor(getItem(hero?.armorId, catalogById))
    ? hero.armorId
    : null;
  let shieldId = ownsItem(normalizedHero, hero?.shieldId) && isShield(getItem(hero?.shieldId, catalogById))
    ? hero.shieldId
    : null;

  const main = getItem(mainHand, catalogById);
  const off = getItem(offHand, catalogById);
  if (mainHand && offHand && mainHand === offHand && !ownsItem(normalizedHero, mainHand, 2)) offHand = null;
  if (offHand && (!isLightMelee(main) || !isLightMelee(off))) offHand = null;
  if (mainHand && requiresTwoHands(main)) offHand = null;
  if (shieldId) offHand = null;
  if (shieldId && main && requiresTwoHands(main)) shieldId = null;

  const retainedIds = new Set([mainHand, offHand, armorId, shieldId].filter(Boolean));
  const enchantments = Object.fromEntries(
    Object.entries(hero?.enchantments || {}).filter(([itemId]) =>
      (retainedIds.has(itemId) || ownsItem(normalizedHero, itemId)) &&
      ["weapon", "armor"].includes(getItem(itemId, catalogById)?.kind),
    ),
  );
  const attunedItemIds = requestedAttunements(hero)
    .filter((itemId) => ownsItem(normalizedHero, itemId) && Boolean(getItem(itemId, catalogById)?.requiresAttunement))
    .slice(0, MAX_ATTUNED_ITEMS);
  const attuned = new Set(attunedItemIds);
  const wornItemIds = uniqueIds([...(hero?.wornItemIds || []), ...attunedItemIds]).filter((itemId) => {
    const item = getItem(itemId, catalogById);
    if (!ownsItem(normalizedHero, itemId) || !item) return false;
    return item.requiresAttunement ? attuned.has(itemId) : Boolean(item.implementedEffect);
  });
  return {
    loadout: { mainHand, offHand },
    armorId,
    shieldId,
    enchantments,
    attunedItemIds,
    // `wornItemIds` remains an alias so old Hero and token records still load.
    wornItemIds,
    itemCharges: normalizeItemCharges(hero?.itemCharges, inventory, catalogById),
  };
}

export function changeInventory(hero, itemId, direction, {
  catalogById = ITEM_BY_ID,
  catalogWorkflow = true,
} = {}) {
  const item = getItem(itemId, catalogById);
  if (!item) return failure("UNKNOWN_ITEM", "That item is not present in the Nightforge catalog.");
  const step = catalogWorkflow && item.kind === "ammunition" ? item.bundleSize : 1;
  const current = inventoryQuantity(hero?.inventory, itemId);
  const nextQuantity = Math.max(0, current + Math.sign(Number(direction) || 0) * step);
  const inventory = (hero?.inventory || []).filter((entry) => entry.itemId !== itemId);
  if (nextQuantity > 0) inventory.push({ itemId, quantity: nextQuantity });
  const equipment = normalizeEquipment(hero, inventory, catalogById);
  return success({ inventory, ...equipment }, { item, quantity: nextQuantity, step });
}

export function removeInventoryItem(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!item) return failure("UNKNOWN_ITEM", "That item is not present in the Nightforge catalog.");
  const inventory = (hero?.inventory || []).filter((entry) => entry.itemId !== itemId);
  return success({ inventory, ...normalizeEquipment(hero, inventory, catalogById) }, { item });
}

const equipmentFailure = (message) => failure("ILLEGAL_EQUIPMENT", message);

export function setMainHand(hero, itemId, catalogById = ITEM_BY_ID) {
  if (itemId === null) return success({ loadout: { ...hero.loadout, mainHand: null } });
  const item = getItem(itemId, catalogById);
  if (!isWeapon(item) || !ownsItem(hero, itemId)) return equipmentFailure("Only an owned weapon can be placed in the main hand.");
  if (requiresTwoHands(item) && hero.loadout?.offHand) return equipmentFailure("That weapon requires an empty off hand.");
  if (requiresTwoHands(item) && hero.shieldId) return equipmentFailure("That weapon cannot be used with a shield.");
  if (hero.loadout?.offHand) {
    const off = getItem(hero.loadout.offHand, catalogById);
    if (!isLightMelee(item) || !isLightMelee(off)) return equipmentFailure("Dual wielding requires two Light melee weapons.");
    if (hero.loadout.offHand === itemId && !ownsItem(hero, itemId, 2)) return equipmentFailure("Equipping the same weapon twice requires quantity 2.");
  }
  return success({ loadout: { ...hero.loadout, mainHand: itemId } });
}

export function setOffHand(hero, itemId, catalogById = ITEM_BY_ID) {
  if (itemId === null) return success({ loadout: { ...hero.loadout, offHand: null } });
  const item = getItem(itemId, catalogById);
  const main = getItem(hero.loadout?.mainHand, catalogById);
  if (!isWeapon(item) || !ownsItem(hero, itemId)) return equipmentFailure("Only an owned weapon can be placed in the off hand.");
  if (!main || !ownsItem(hero, main.id)) return equipmentFailure("Choose an owned main-hand weapon before equipping an off-hand weapon.");
  if (hero.shieldId) return equipmentFailure("Remove the shield before equipping an off-hand weapon.");
  if (main && requiresTwoHands(main)) return equipmentFailure("That main-hand weapon requires an empty off hand.");
  if (!isLightMelee(main) || !isLightMelee(item)) return equipmentFailure("Both weapons must be Light melee weapons to dual wield.");
  if (main.id === itemId && !ownsItem(hero, itemId, 2)) return equipmentFailure("Equipping the same weapon twice requires quantity 2.");
  return success({ loadout: { ...hero.loadout, offHand: itemId } });
}

export function setArmor(hero, itemId, catalogById = ITEM_BY_ID) {
  if (itemId === null) return success({ armorId: null });
  const item = getItem(itemId, catalogById);
  if (!isArmor(item) || !ownsItem(hero, itemId)) return equipmentFailure("Only owned body armour can be equipped as armour.");
  return success({ armorId: itemId });
}

export function setShield(hero, itemId, catalogById = ITEM_BY_ID) {
  if (itemId === null) return success({ shieldId: null });
  const item = getItem(itemId, catalogById);
  const main = getItem(hero.loadout?.mainHand, catalogById);
  if (!isShield(item) || !ownsItem(hero, itemId)) return equipmentFailure("Only an owned shield can be equipped.");
  if (hero.loadout?.offHand) return equipmentFailure("A shield requires a free off hand.");
  if (main && requiresTwoHands(main)) return equipmentFailure("A shield cannot be used with that main-hand weapon.");
  return success({ shieldId: itemId });
}

/**
 * A shield occupies a hand, exactly as an off-hand weapon does, so the sheet
 * presents one off-hand slot holding either. The record keeps `shieldId` and
 * `loadout.offHand` as separate fields — armour class reads `shieldId` — and
 * this setter simply makes sure only one of them is ever filled.
 */
export function setOffHandSlot(hero, itemId, catalogById = ITEM_BY_ID) {
  if (itemId === null) {
    return success({ loadout: { ...hero.loadout, offHand: null }, shieldId: null });
  }
  const item = getItem(itemId, catalogById);
  if (isShield(item)) {
    const withFreeHand = { ...hero, loadout: { ...hero.loadout, offHand: null } };
    const result = setShield(withFreeHand, itemId, catalogById);
    if (!result.ok) return result;
    return success({ loadout: { ...hero.loadout, offHand: null }, ...result.value });
  }
  const withoutShield = { ...hero, shieldId: null };
  const result = setOffHand(withoutShield, itemId, catalogById);
  if (!result.ok) return result;
  return success({ ...result.value, shieldId: null });
}

/**
 * Why an item cannot be equipped right now, in a few words, or null if it can.
 *
 * These mirror setMainHand/setOffHand/setShield exactly. They exist so the
 * dropdowns can grey out an illegal choice up front instead of accepting the
 * click and then refusing it.
 */
export function mainHandRefusal(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!isWeapon(item) || !ownsItem(hero, itemId)) return "Not an owned weapon";
  if (requiresTwoHands(item) && hero?.loadout?.offHand) return "Off hand is not free";
  if (requiresTwoHands(item) && hero?.shieldId) return "Shield is raised";
  if (hero?.loadout?.offHand) {
    const off = getItem(hero.loadout.offHand, catalogById);
    if (!isLightMelee(item) || !isLightMelee(off)) return "Dual wield needs two Light weapons";
    if (hero.loadout.offHand === itemId && !ownsItem(hero, itemId, 2)) return "Needs quantity 2";
  }
  return null;
}

export function offHandRefusal(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!item || !ownsItem(hero, itemId)) return "Not owned";
  const main = getItem(hero?.loadout?.mainHand, catalogById);
  if (isShield(item)) return main && requiresTwoHands(main) ? "Two-handed weapon in use" : null;
  if (!isWeapon(item)) return "Not a weapon";
  if (!main || !ownsItem(hero, main.id)) return "Equip a main hand first";
  if (requiresTwoHands(main)) return "Two-handed weapon in use";
  if (!isLightMelee(main)) return "Main hand is not Light";
  if (!isLightMelee(item)) return "Not a Light melee weapon";
  if (main.id === itemId && !ownsItem(hero, itemId, 2)) return "Needs quantity 2";
  return null;
}

export function setEnchantment(hero, itemId, bonus, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!ownsItem(hero, itemId)) return failure("ITEM_NOT_OWNED", "Only an owned item can be enchanted.");
  if (!(item?.kind === "weapon" || item?.kind === "armor")) {
    return failure("NOT_ENCHANTABLE", "Only weapons, armour, and shields can receive this enchantment.");
  }
  const normalizedBonus = Math.max(0, Math.min(3, Math.floor(Number(bonus) || 0)));
  const enchantments = { ...(hero.enchantments || {}) };
  if (normalizedBonus) enchantments[itemId] = normalizedBonus;
  else delete enchantments[itemId];
  return success({ enchantments });
}

export function attunementEligibility(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!ownsItem(hero, itemId)) return failure("ITEM_NOT_OWNED", "Only an owned item can be attuned.");
  if (!item?.requiresAttunement) return failure("ATTUNEMENT_NOT_REQUIRED", "This item does not require attunement.");
  const requirement = String(item.attunementRequirement || "").toLowerCase();
  if (requirement.includes("spellcaster") && hero?.classId !== "wizard") {
    return failure("ATTUNEMENT_CLASS_REQUIRED", `${item.name} requires attunement by a spellcaster.`, "Use a spellcasting Hero or leave this item unattuned.");
  }
  if (/\bwizard\b/.test(requirement) && hero?.classId !== "wizard") {
    return failure("ATTUNEMENT_CLASS_REQUIRED", `${item.name} requires a wizard to attune to it.`, "Change the Hero's class or leave this item unattuned.");
  }
  return success({ item });
}

export function toggleAttunedItem(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!ownsItem(hero, itemId)) return failure("ITEM_NOT_OWNED", "Only an owned item can be attuned.");
  if (!item?.requiresAttunement) return failure("ATTUNEMENT_NOT_REQUIRED", "This item does not require attunement; it can be worn without using an attunement slot.");
  const current = new Set(requestedAttunements(hero));
  if (current.has(itemId)) {
    current.delete(itemId);
  } else {
    const eligible = attunementEligibility(hero, itemId, catalogById);
    if (!eligible.ok) return eligible;
    if (current.size >= MAX_ATTUNED_ITEMS) return failure(
      "ATTUNEMENT_LIMIT_REACHED",
      `A Hero can attune to only ${MAX_ATTUNED_ITEMS} magic items at once.`,
      "Unattune an existing item before attuning another.",
    );
    current.add(itemId);
  }
  return success(normalizeEquipment({ ...hero, attunedItemIds: [...current] }, hero.inventory, catalogById));
}

/** Compatibility name retained for callers written before attunement existed. */
export function toggleWornItem(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (item && !item.implementedEffect && !item.requiresAttunement) {
    return failure("NOT_WEARABLE", "That item has no implemented worn or attunement rule.");
  }
  if (item?.implementedEffect && !item.requiresAttunement) {
    const current = new Set(uniqueIds(hero?.wornItemIds));
    if (current.has(itemId)) current.delete(itemId);
    else current.add(itemId);
    return success(normalizeEquipment({ ...hero, wornItemIds: [...current] }, hero.inventory, catalogById));
  }
  return toggleAttunedItem(hero, itemId, catalogById);
}

export function wornMagicBonuses(hero, catalogById = ITEM_BY_ID) {
  const totals = { ac: 0, save: 0, attack: 0, rangedDamage: 0 };
  for (const itemId of activeMagicItemIds(hero, catalogById)) {
    const effect = getItem(itemId, catalogById)?.implementedEffect;
    if (effect === "ranged-damage-2") totals.rangedDamage += 2;
    if (effect === "unarmored-ac-2" && !hero.armorId && !hero.shieldId) totals.ac += 2;
    if (effect === "ac-and-saves-1") { totals.ac += 1; totals.save += 1; }
    if (effect === "attack-1") totals.attack += 1;
    if (effect === "ac-1") totals.ac += 1;
  }
  return totals;
}

export function setItemCharges(hero, itemId, current, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  const maximum = chargeMaximum(item);
  if (!ownsItem(hero, itemId)) return failure("ITEM_NOT_OWNED", "Only an owned item can have its charges changed.");
  if (!maximum) return failure("ITEM_NOT_CHARGED", "That item does not have a charge pool in the SRD record.");
  const itemCharges = normalizeItemCharges({
    ...(hero.itemCharges || {}),
    [itemId]: { current, max: maximum },
  }, hero.inventory, catalogById);
  return success({ itemCharges });
}

/** Restore charges that recharge on a short/long rest or at the daily dawn reset. */
export function restoreItemCharges(hero, restKind = "long", catalogById = ITEM_BY_ID, { random = () => 0.5, onRoll = () => {} } = {}) {
  const itemCharges = normalizeItemCharges(hero?.itemCharges, hero?.inventory, catalogById);
  for (const [itemId, state] of Object.entries(itemCharges)) {
    const item = getItem(itemId, catalogById);
    const matches = restKind === "daily" ? item?.chargeRechargeKind === "daily"
      : restKind === "short" ? item?.chargeRechargeKind === "short-rest"
        : restKind === "long" && ["long-rest", "short-rest"].includes(item?.chargeRechargeKind);
    if (!matches || state.current >= state.max) continue;
    const amount = item.chargeRechargeAmount;
    let recovered = amount === "all" ? state.max : /^\d+$/.test(amount || "") ? Number(amount) : 0;
    const dice = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(amount || "");
    if (dice && Number(dice[1]) <= 100 && Number(dice[2]) > 0 && Number(dice[2]) <= 1000) {
      const rolls = Array.from({ length: Number(dice[1]) }, () => 1 + Math.floor(Math.max(0, Math.min(0.999999999999, Number(random()) || 0)) * Number(dice[2])));
      recovered = rolls.reduce((sum, roll) => sum + roll, Number(dice[3] || 0));
      onRoll({ itemId, formula: amount, rolls, recovered });
    }
    itemCharges[itemId] = { ...state, current: Math.min(state.max, state.current + recovered) };
  }
  return itemCharges;
}

export function weaponMagicBonuses(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!isWeapon(item) || !ownsItem(hero, itemId)) return { attack: 0, damage: 0 };
  const worn = wornMagicBonuses(hero, catalogById);
  const enchantment = Math.max(0, Math.min(3, Number(hero?.enchantments?.[itemId]) || 0));
  return {
    attack: enchantment + worn.attack,
    damage: enchantment + (item.weaponRange === "ranged" ? worn.rangedDamage : 0),
  };
}

export function effectiveDamageDice(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!isWeapon(item)) return null;
  const usesTwoHands = hero?.loadout?.mainHand === itemId && !hero?.loadout?.offHand && !hero?.shieldId;
  return usesTwoHands && item.versatileDamageDice ? item.versatileDamageDice : item.damageDice;
}

export function equippedWeapons(hero, catalogById = ITEM_BY_ID) {
  const entries = [];
  for (const [hand, itemId] of [["main", hero?.loadout?.mainHand], ["off", hero?.loadout?.offHand]]) {
    const item = getItem(itemId, catalogById);
    if (item && isWeapon(item) && ownsItem(hero, itemId, hand === "off" && itemId === hero?.loadout?.mainHand ? 2 : 1)) {
      entries.push({ hand, item, damageDice: effectiveDamageDice(hero, itemId, catalogById) });
    }
  }
  return entries;
}

export const OWNABLE_ITEM_IDS = Object.freeze(ITEM_CATALOG.map((item) => item.id));
