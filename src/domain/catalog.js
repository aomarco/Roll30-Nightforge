import {
  AMMUNITION,
  ARMOR,
  GEAR,
  MAGIC_ITEMS,
  WEAPONS,
  WORN_MAGIC_ITEMS,
} from "./catalog.generated.js";

export { AMMUNITION, ARMOR, GEAR, MAGIC_ITEMS, WEAPONS, WORN_MAGIC_ITEMS };

export const ITEM_CATALOG = Object.freeze([
  ...WEAPONS,
  ...AMMUNITION,
  ...ARMOR,
  ...GEAR,
  ...MAGIC_ITEMS,
  ...WORN_MAGIC_ITEMS,
]);

export const ITEM_BY_ID = Object.freeze(
  Object.fromEntries(ITEM_CATALOG.map((item) => [item.id, item])),
);

const uniqueSorted = (values) => Object.freeze(
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right)),
);

export const CATALOG_FACETS = Object.freeze({
  kinds: Object.freeze(["weapon", "ammunition", "armor", "gear", "magic-item"]),
  weaponClasses: uniqueSorted(WEAPONS.map((item) => item.weaponClass)),
  armorClasses: uniqueSorted(ARMOR.map((item) => item.armorClass)),
  gearCategories: uniqueSorted(GEAR.map((item) => item.gearCategory)),
  magicRarities: uniqueSorted([...MAGIC_ITEMS, ...WORN_MAGIC_ITEMS].map((item) => item.rarity)),
  weaponProperties: uniqueSorted(WEAPONS.flatMap((item) => item.properties)),
  damageTypes: uniqueSorted(WEAPONS.map((item) => item.damageType)),
  rangeBands: Object.freeze(["melee", "close", "medium", "long"]),
});

export const getItem = (itemId, catalogById = ITEM_BY_ID) =>
  catalogById[itemId] || null;

export function formatCost(item) {
  if (!item?.cost || !Number.isFinite(item.cost.quantity)) return "Cost not listed";
  return `${item.cost.quantity} ${item.cost.unit}`;
}

export function itemRange(item) {
  if (item?.kind !== "weapon") return null;
  if (item.throwRange) return item.throwRange;
  return { normal: item.normalRange, long: item.longRange };
}

export function rangeBandForItem(item) {
  if (item?.kind !== "weapon") return null;
  const range = itemRange(item);
  if (item.weaponRange === "melee" && !item.throwRange) return "melee";
  const normal = Number(range?.normal || 0);
  if (normal <= 30) return "close";
  if (normal <= 60) return "medium";
  return "long";
}

export function itemSubtitle(item) {
  if (!item) return "Unknown item";
  if (item.kind === "weapon") {
    const range = itemRange(item);
    const distance = range?.long
      ? `${range.normal}/${range.long} ft`
      : `${range?.normal || 5} ft`;
    return `${item.damageDice || "Special"} ${String(item.damageType || "").toLowerCase()} · ${distance}`;
  }
  if (item.kind === "ammunition") return `${item.bundleSize} per bundle`;
  if (item.kind === "armor") {
    return item.category === "shield"
      ? `Shield · +${item.baseAc} AC`
      : `${item.armorClass[0].toUpperCase()}${item.armorClass.slice(1)} armour · AC ${item.baseAc}`;
  }
  if (item.kind === "gear") return item.gearCategory;
  return `${item.rarity} · ${item.itemCategory}`;
}

const normalized = (value) => String(value || "").trim().toLowerCase();

export function filterCatalog(items = ITEM_CATALOG, filters = {}) {
  const text = normalized(filters.text);
  const result = items.filter((item) => {
    if (text) {
      const haystack = [
        item.name,
        item.typeLabel,
        item.weaponClass,
        item.armorClass,
        item.gearCategory,
        item.itemCategory,
        item.rarity,
        item.damageType,
        ...(item.properties || []),
      ].map(normalized).join(" ");
      if (!haystack.includes(text)) return false;
    }
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.weaponClass && item.weaponClass !== filters.weaponClass) return false;
    if (filters.armorClass && item.armorClass !== filters.armorClass) return false;
    if (filters.gearCategory && item.gearCategory !== filters.gearCategory) return false;
    if (filters.rarity && item.rarity !== filters.rarity) return false;
    if (filters.property && !(item.properties || []).includes(filters.property)) return false;
    if (filters.damageType && item.damageType !== filters.damageType) return false;
    if (filters.rangeBand && rangeBandForItem(item) !== filters.rangeBand) return false;
    return true;
  });

  const sort = filters.sort || "name";
  return [...result].sort((left, right) => {
    if (sort === "cost-asc" || sort === "cost-desc") {
      const leftPriced = Number.isFinite(left.costCopper);
      const rightPriced = Number.isFinite(right.costCopper);
      if (leftPriced !== rightPriced) return leftPriced ? -1 : 1;
      const leftCost = leftPriced ? left.costCopper : 0;
      const rightCost = rightPriced ? right.costCopper : 0;
      const difference = leftCost - rightCost;
      if (difference) return sort === "cost-desc" ? -difference : difference;
    }
    return left.name.localeCompare(right.name);
  });
}
