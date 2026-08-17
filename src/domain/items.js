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
  if (mainHand && isTwoHanded(main)) offHand = null;
  if (shieldId) offHand = null;
  if (shieldId && isTwoHanded(main)) shieldId = null;

  const retainedIds = new Set([mainHand, offHand, armorId, shieldId].filter(Boolean));
  const enchantments = Object.fromEntries(
    Object.entries(hero?.enchantments || {}).filter(([itemId]) =>
      (retainedIds.has(itemId) || ownsItem(normalizedHero, itemId)) &&
      ["weapon", "armor"].includes(getItem(itemId, catalogById)?.kind),
    ),
  );
  const wornItemIds = (hero?.wornItemIds || []).filter((itemId) =>
    ownsItem(normalizedHero, itemId) && Boolean(getItem(itemId, catalogById)?.implementedEffect),
  );
  return { loadout: { mainHand, offHand }, armorId, shieldId, enchantments, wornItemIds };
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
  if (isTwoHanded(item) && hero.loadout?.offHand) return equipmentFailure("A Two-Handed weapon requires an empty off hand.");
  if (isTwoHanded(item) && hero.shieldId) return equipmentFailure("A Two-Handed weapon cannot be used with a shield.");
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
  if (isTwoHanded(main)) return equipmentFailure("A Two-Handed weapon requires an empty off hand.");
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
  if (isTwoHanded(main)) return equipmentFailure("A shield cannot be used with a Two-Handed weapon.");
  return success({ shieldId: itemId });
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

export function toggleWornItem(hero, itemId, catalogById = ITEM_BY_ID) {
  const item = getItem(itemId, catalogById);
  if (!ownsItem(hero, itemId)) return failure("ITEM_NOT_OWNED", "Only an owned magic item can be worn.");
  if (!item?.implementedEffect) return failure("NOT_WEARABLE", "This item has no implemented worn effect in Nightforge.");
  const current = new Set(hero.wornItemIds || []);
  if (current.has(itemId)) current.delete(itemId);
  else current.add(itemId);
  return success({ wornItemIds: [...current] });
}

export function wornMagicBonuses(hero, catalogById = ITEM_BY_ID) {
  const totals = { ac: 0, save: 0, attack: 0, rangedDamage: 0 };
  for (const itemId of hero?.wornItemIds || []) {
    if (!ownsItem(hero, itemId)) continue;
    const effect = getItem(itemId, catalogById)?.implementedEffect;
    if (effect === "ranged-damage-2") totals.rangedDamage += 2;
    if (effect === "unarmored-ac-2" && !hero.armorId && !hero.shieldId) totals.ac += 2;
    if (effect === "ac-and-saves-1") { totals.ac += 1; totals.save += 1; }
    if (effect === "attack-1") totals.attack += 1;
    if (effect === "ac-1") totals.ac += 1;
  }
  return totals;
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
