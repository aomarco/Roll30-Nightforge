import test from "node:test";
import assert from "node:assert/strict";

import {
  AMMUNITION,
  ARMOR,
  CATALOG_FACETS,
  filterCatalog,
  GEAR,
  ITEM_BY_ID,
  ITEM_CATALOG,
  MAGIC_ITEMS,
  rangeBandForItem,
  WEAPONS,
  WORN_MAGIC_ITEMS,
} from "./domain/catalog.js";
import { createHeroRecord } from "./domain/records.js";
import { deriveHero, saveModifier } from "./domain/heroes.js";
import {
  changeInventory,
  effectiveDamageDice,
  equippedWeapons,
  normalizeEquipment,
  normalizeInventoryEntries,
  removeInventoryItem,
  setArmor,
  setEnchantment,
  setMainHand,
  setOffHand,
  setShield,
  toggleWornItem,
  weaponMagicBonuses,
  wornMagicBonuses,
} from "./domain/items.js";
import { createHeroRepository } from "./storage/entityRepositories.js";
import { createMemoryStorage } from "./storage/memoryAdapters.js";
import { createStateRepository } from "./storage/stateRepository.js";

const NOW = "2026-08-16T00:00:00.000Z";
const hero = (input = {}) => createHeroRecord(input, { id: input.id || "phase5-hero", now: NOW });
const entry = (itemId, quantity = 1) => ({ itemId, quantity });

test("Phase 5 catalogs contain every exact clean-room item count", () => {
  assert.equal(WEAPONS.length, 36);
  assert.equal(AMMUNITION.length, 4);
  assert.equal(ARMOR.length, 13);
  assert.equal(GEAR.length, 183);
  assert.equal(MAGIC_ITEMS.length, 113);
  assert.equal(WORN_MAGIC_ITEMS.length, 6);
  assert.equal(ITEM_CATALOG.length, 355);
  assert.equal(new Set(ITEM_CATALOG.map((item) => item.id)).size, 355);
});

test("weapon catalog excludes unsupported Net mechanics and retains SRD weapon classes", () => {
  assert.equal(ITEM_BY_ID.net, undefined);
  assert.deepEqual(CATALOG_FACETS.weaponClasses, ["martial", "simple"]);
  assert.equal(WEAPONS.filter((item) => item.weaponClass === "simple").length, 14);
  assert.equal(WEAPONS.filter((item) => item.weaponClass === "martial").length, 22);
});

test("ammunition catalog preserves exact bundle sizes", () => {
  assert.deepEqual(Object.fromEntries(AMMUNITION.map((item) => [item.id, item.bundleSize])), {
    arrow: 20,
    "blowgun-needle": 50,
    "crossbow-bolt": 20,
    "sling-bullet": 20,
  });
});

test("intentional ranged battle-map ranges are exact", () => {
  const expected = {
    blowgun: [25, 50], sling: [30, 60], "crossbow-hand": [40, 80], shortbow: [40, 80],
    "crossbow-light": [60, 120], "crossbow-heavy": [80, 160], longbow: [80, 160],
  };
  for (const [id, ranges] of Object.entries(expected)) {
    assert.deepEqual([ITEM_BY_ID[id].normalRange, ITEM_BY_ID[id].longRange], ranges, id);
  }
});

test("thrown ranges remain source-authentic", () => {
  assert.deepEqual(ITEM_BY_ID.javelin.throwRange, { normal: 30, long: 120 });
  assert.deepEqual(ITEM_BY_ID.handaxe.throwRange, { normal: 20, long: 60 });
  assert.deepEqual(ITEM_BY_ID.dagger.throwRange, { normal: 20, long: 60 });
});

test("all catalog filters target their own backed fields", () => {
  assert.deepEqual(filterCatalog(ITEM_CATALOG, { text: "portable hole" }).map((item) => item.id), ["portable-hole"]);
  assert.equal(filterCatalog(ITEM_CATALOG, { kind: "ammunition" }).length, 4);
  assert.ok(filterCatalog(ITEM_CATALOG, { weaponClass: "martial" }).every((item) => item.weaponClass === "martial"));
  assert.ok(filterCatalog(ITEM_CATALOG, { armorClass: "heavy" }).every((item) => item.armorClass === "heavy"));
  assert.ok(filterCatalog(ITEM_CATALOG, { gearCategory: "Artisan's Tools" }).every((item) => item.gearCategory === "Artisan's Tools"));
  assert.ok(filterCatalog(ITEM_CATALOG, { rarity: "Legendary" }).every((item) => item.rarity === "Legendary"));
  assert.ok(filterCatalog(ITEM_CATALOG, { property: "Light" }).every((item) => item.properties.includes("Light")));
  assert.ok(filterCatalog(ITEM_CATALOG, { damageType: "Slashing" }).every((item) => item.damageType === "Slashing"));
  assert.ok(filterCatalog(ITEM_CATALOG, { rangeBand: "long" }).every((item) => rangeBandForItem(item) === "long"));
});

test("catalog sorting supports name and both cost directions while leaving unpriced magic last", () => {
  const sample = [ITEM_BY_ID["bag-of-holding"], ITEM_BY_ID.club, ITEM_BY_ID["plate-armor"]];
  assert.deepEqual(filterCatalog(sample, { sort: "name" }).map((item) => item.id), ["bag-of-holding", "club", "plate-armor"]);
  assert.deepEqual(filterCatalog(sample, { sort: "cost-asc" }).map((item) => item.id), ["club", "plate-armor", "bag-of-holding"]);
  assert.deepEqual(filterCatalog(sample, { sort: "cost-desc" }).map((item) => item.id), ["plate-armor", "club", "bag-of-holding"]);
});

test("inventory normalization merges duplicates, removes zero, and diagnoses unknown IDs", () => {
  assert.deepEqual(normalizeInventoryEntries([
    entry("dagger"), entry("dagger", 2), entry("club", 0), entry("not-in-catalog", 4),
  ]), {
    inventory: [entry("dagger", 3)],
    unknownItemIds: ["not-in-catalog"],
  });
  const normalized = hero({ inventory: [entry("not-in-catalog", 2)] });
  assert.deepEqual(normalized.inventory, []);
  assert.deepEqual(normalized.recoveryDiagnostics.unknownInventoryItemIds, ["not-in-catalog"]);
});

test("active inventory use rejects unknown items and uses ammunition bundles", () => {
  const empty = hero();
  assert.equal(changeInventory(empty, "not-in-catalog", 1).code, "UNKNOWN_ITEM");
  const arrows = changeInventory(empty, "arrow", 1);
  assert.equal(arrows.ok, true);
  assert.deepEqual(arrows.value.inventory, [entry("arrow", 20)]);
  const owned = hero({ inventory: arrows.value.inventory });
  assert.deepEqual(changeInventory(owned, "arrow", -1).value.inventory, []);
  assert.deepEqual(changeInventory(empty, "arrow", 1, { catalogWorkflow: false }).value.inventory, [entry("arrow", 1)]);
});

test("quantity zero removal clears equipment, enchantments, and worn state", () => {
  const equipped = hero({
    inventory: [entry("dagger"), entry("chain-mail"), entry("shield"), entry("ring-of-protection")],
    loadout: { mainHand: "dagger" }, armorId: "chain-mail", shieldId: "shield",
    enchantments: { dagger: 2, "chain-mail": 1, shield: 1 }, wornItemIds: ["ring-of-protection"],
  });
  const noDagger = removeInventoryItem(equipped, "dagger").value;
  assert.equal(noDagger.loadout.mainHand, null);
  assert.equal(noDagger.enchantments.dagger, undefined);
  const noRingHero = { ...equipped, ...removeInventoryItem(equipped, "ring-of-protection").value };
  assert.deepEqual(noRingHero.wornItemIds, []);
});

test("only owned weapons, armour, and shields can be equipped", () => {
  const empty = hero();
  assert.equal(setMainHand(empty, "dagger").ok, false);
  assert.equal(setArmor(empty, "chain-mail").ok, false);
  assert.equal(setShield(empty, "shield").ok, false);
  const owned = hero({ inventory: [entry("dagger"), entry("chain-mail"), entry("shield")] });
  assert.equal(setMainHand(owned, "dagger").ok, true);
  assert.equal(setArmor(owned, "chain-mail").ok, true);
  assert.equal(setShield(owned, "shield").ok, true);
});

test("equipping the same weapon in both hands requires quantity two", () => {
  const one = hero({ inventory: [entry("dagger")], loadout: { mainHand: "dagger" } });
  assert.match(setOffHand(one, "dagger").message, /quantity 2/);
  const two = hero({ inventory: [entry("dagger", 2)], loadout: { mainHand: "dagger" } });
  assert.deepEqual(setOffHand(two, "dagger").value.loadout, { mainHand: "dagger", offHand: "dagger" });
});

test("off-hand legality requires two Light melee weapons", () => {
  const valid = hero({ inventory: [entry("club"), entry("dagger")], loadout: { mainHand: "club" } });
  assert.equal(setOffHand(valid, "dagger").ok, true);
  const heavyMain = hero({ inventory: [entry("longsword"), entry("dagger")], loadout: { mainHand: "longsword" } });
  assert.match(setOffHand(heavyMain, "dagger").message, /Light melee/);
  const rangedOff = hero({ inventory: [entry("dagger"), entry("crossbow-hand")], loadout: { mainHand: "dagger" } });
  assert.match(setOffHand(rangedOff, "crossbow-hand").message, /Light melee/);
});

test("Two-Handed weapons require an empty off hand and reject shields", () => {
  const dual = hero({ inventory: [entry("dagger", 2), entry("greatsword")], loadout: { mainHand: "dagger", offHand: "dagger" } });
  assert.match(setMainHand(dual, "greatsword").message, /empty off hand/);
  const shielded = hero({ inventory: [entry("dagger"), entry("greatsword"), entry("shield")], loadout: { mainHand: "dagger" }, shieldId: "shield" });
  assert.match(setMainHand(shielded, "greatsword").message, /shield/);
  const greatsword = hero({ inventory: [entry("greatsword"), entry("shield")], loadout: { mainHand: "greatsword" } });
  assert.match(setShield(greatsword, "shield").message, /Two-Handed/);
});

test("shield equipment requires a free off hand", () => {
  const dual = hero({ inventory: [entry("club"), entry("dagger"), entry("shield")], loadout: { mainHand: "club", offHand: "dagger" } });
  assert.match(setShield(dual, "shield").message, /free off hand/);
});

test("Versatile damage uses the larger die only when shieldless with an empty off hand", () => {
  const free = hero({ inventory: [entry("quarterstaff")], loadout: { mainHand: "quarterstaff" } });
  assert.equal(effectiveDamageDice(free, "quarterstaff"), "1d8");
  const shielded = hero({ inventory: [entry("quarterstaff"), entry("shield")], loadout: { mainHand: "quarterstaff" }, shieldId: "shield" });
  assert.equal(effectiveDamageDice(shielded, "quarterstaff"), "1d6");
  assert.equal(effectiveDamageDice({ ...free, loadout: { mainHand: "quarterstaff", offHand: "dagger" } }, "quarterstaff"), "1d6");
});

test("equipment normalization repairs impossible persisted combinations", () => {
  const corrupt = {
    inventory: [entry("greatsword"), entry("shield"), entry("dagger")],
    loadout: { mainHand: "greatsword", offHand: "dagger" },
    armorId: "shield", shieldId: "shield", enchantments: {}, wornItemIds: [],
  };
  assert.deepEqual(normalizeEquipment(corrupt), {
    loadout: { mainHand: "greatsword", offHand: null }, armorId: null, shieldId: null,
    enchantments: {}, wornItemIds: [],
  });
});

test("attack selection exposes equipped weapons only", () => {
  const equipped = hero({ inventory: [entry("club"), entry("dagger"), entry("longbow")], loadout: { mainHand: "club", offHand: "dagger" } });
  assert.deepEqual(equippedWeapons(equipped).map(({ hand, item }) => [hand, item.id]), [["main", "club"], ["off", "dagger"]]);
});

test("enchantments apply only to owned weapons, armour, and shields and clamp at +3", () => {
  const owned = hero({ inventory: [entry("dagger"), entry("chain-mail"), entry("shield"), entry("arrow"), entry("rope-hempen-50-feet")] });
  assert.deepEqual(setEnchantment(owned, "dagger", 9).value.enchantments, { dagger: 3 });
  assert.equal(setEnchantment(owned, "arrow", 1).code, "NOT_ENCHANTABLE");
  assert.equal(setEnchantment(owned, "rope-hempen-50-feet", 1).code, "NOT_ENCHANTABLE");
  assert.equal(setEnchantment(owned, "longsword", 1).code, "ITEM_NOT_OWNED");
});

test("weapon enchantments and worn attack/damage bonuses combine by item", () => {
  const archer = hero({
    inventory: [entry("longbow"), entry("bracers-of-archery"), entry("ioun-stone-of-mastery")],
    loadout: { mainHand: "longbow" }, enchantments: { longbow: 2 },
    wornItemIds: ["bracers-of-archery", "ioun-stone-of-mastery"],
  });
  assert.deepEqual(weaponMagicBonuses(archer, "longbow"), { attack: 3, damage: 4 });
});

test("all six implemented worn effects derive exactly and have no attunement cap", () => {
  const ids = WORN_MAGIC_ITEMS.map((item) => item.id);
  const unarmored = hero({ inventory: ids.map((id) => entry(id)), wornItemIds: ids, classId: "wizard", baseAbilities: { int: 15 } });
  assert.deepEqual(unarmored.wornItemIds, ids);
  assert.deepEqual(wornMagicBonuses(unarmored), { ac: 5, save: 2, attack: 1, rangedDamage: 2 });
  const derived = deriveHero(unarmored);
  assert.equal(derived.ac, 14);
  assert.equal(derived.spellcasting.attackBonus, 6);
  assert.equal(saveModifier(unarmored, derived, "str"), 1);
  const armored = { ...unarmored, inventory: [...unarmored.inventory, entry("leather-armor")], armorId: "leather-armor" };
  assert.equal(wornMagicBonuses(armored).ac, 3);
});

test("worn toggles require ownership and an implemented effect", () => {
  const empty = hero();
  assert.equal(toggleWornItem(empty, "ring-of-protection").code, "ITEM_NOT_OWNED");
  const inert = hero({ inventory: [entry("bag-of-holding")] });
  assert.equal(toggleWornItem(inert, "bag-of-holding").code, "NOT_WEARABLE");
  const ring = hero({ inventory: [entry("ring-of-protection")] });
  assert.deepEqual(toggleWornItem(ring, "ring-of-protection").value.wornItemIds, ["ring-of-protection"]);
});

test("inventory, loadout, enchantment, and worn state survive a repository reload", () => {
  const storage = createMemoryStorage();
  const makeRepository = () => createHeroRepository(createStateRepository(storage, { clock: () => NOW }), {
    clock: () => NOW,
    idFactory: () => "persisted-gear-hero",
  });
  const repository = makeRepository();
  const created = repository.create({
    inventory: [entry("dagger", 2), entry("leather-armor"), entry("ring-of-protection")],
    loadout: { mainHand: "dagger", offHand: "dagger" },
    armorId: "leather-armor",
    enchantments: { dagger: 2, "leather-armor": 1 },
    wornItemIds: ["ring-of-protection"],
  });
  assert.equal(created.ok, true);
  const reloaded = makeRepository().get(created.value.id);
  assert.equal(reloaded.ok, true);
  assert.deepEqual(reloaded.value.inventory, created.value.inventory);
  assert.deepEqual(reloaded.value.loadout, { mainHand: "dagger", offHand: "dagger" });
  assert.equal(reloaded.value.armorId, "leather-armor");
  assert.deepEqual(reloaded.value.enchantments, { dagger: 2, "leather-armor": 1 });
  assert.deepEqual(reloaded.value.wornItemIds, ["ring-of-protection"]);
});
