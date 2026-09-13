import { ITEM_BY_ID, getItem } from "./catalog.js";
import { failure, success } from "../application/result.js";

export const ITEM_LOCATION_KINDS = Object.freeze(["hero", "token", "chest", "ground", "embedded", "merchant", "destroyed"]);
export const ITEM_INSTANCE_KINDS = Object.freeze(["instance", "stack"]);

const cleanId = (value, fallback = null) => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
const positive = (value, fallback = 1) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback)));
const cleanText = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : fallback;

const isNaturallyFungible = (item) => ["ammunition", "consumable"].includes(item?.kind) || Boolean(item?.stackable);

function normalizeLocation(input = {}) {
  const kind = ITEM_LOCATION_KINDS.includes(input.kind) ? input.kind : "destroyed";
  return {
    kind,
    ownerId: cleanId(input.ownerId),
    containerId: cleanId(input.containerId),
    sceneId: cleanId(input.sceneId),
    slot: cleanText(input.slot, ""),
  };
}

export function normalizeItemInstance(input = {}, catalogById = ITEM_BY_ID) {
  const id = cleanId(input.id);
  const itemId = cleanId(input.itemId);
  const item = getItem(itemId, catalogById);
  if (!id || !item) return null;
  const kind = ITEM_INSTANCE_KINDS.includes(input.instanceKind)
    ? input.instanceKind
    : (isNaturallyFungible(item) || positive(input.quantity) > 1 ? "stack" : "instance");
  const quantity = kind === "instance" ? 1 : Math.max(1, positive(input.quantity));
  const maxCharges = Math.max(0, Math.floor(Number(item.chargeMaximum) || 0));
  const currentCharges = maxCharges
    ? Math.max(0, Math.min(maxCharges, Math.floor(Number(input.charges?.current ?? input.currentCharges ?? maxCharges) || 0)))
    : null;
  return {
    id,
    itemId,
    instanceKind: kind,
    quantity,
    location: normalizeLocation(input.location),
    identified: input.identified !== false,
    attunedToActorId: cleanId(input.attunedToActorId),
    charges: maxCharges ? { current: currentCharges, max: maxCharges } : null,
    notes: cleanText(input.notes, ""),
    definitionVersion: Math.max(1, Math.floor(Number(input.definitionVersion) || 1)),
  };
}

export const normalizeItemInstances = (instances, catalogById = ITEM_BY_ID) => {
  const seen = new Set();
  return (Array.isArray(instances) ? instances : []).map((entry) => normalizeItemInstance(entry, catalogById)).filter((entry) => {
    if (!entry || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).slice(0, 5000);
};

/** Create a durable adapter for old quantity inventories without losing the old field. */
export function materializeInventoryInstances(inventory, { ownerId = null, idFactory = (itemId, index = 0) => `legacy-${ownerId || "owner"}-${itemId}-${index}` } = {}, catalogById = ITEM_BY_ID) {
  const merged = new Map();
  for (const entry of Array.isArray(inventory) ? inventory : []) {
    const itemId = cleanId(entry?.itemId);
    const quantity = positive(entry?.quantity, 0);
    if (!itemId || quantity <= 0 || !getItem(itemId, catalogById)) continue;
    merged.set(itemId, Math.min(Number.MAX_SAFE_INTEGER, (merged.get(itemId) || 0) + quantity));
  }
  return [...merged].flatMap(([itemId, quantity]) => {
    const item = getItem(itemId, catalogById);
    if (isNaturallyFungible(item)) return [normalizeItemInstance({
      id: idFactory(itemId, 0), itemId, quantity, instanceKind: "stack", location: { kind: "hero", ownerId },
    }, catalogById)].filter(Boolean);
    return Array.from({ length: quantity }, (_, index) => normalizeItemInstance({
      id: idFactory(itemId, index), itemId, instanceKind: "instance", location: { kind: "hero", ownerId },
    }, catalogById)).filter(Boolean);
  });
}

export function inventoryFromInstances(instances, { ownerId = null } = {}, catalogById = ITEM_BY_ID) {
  const quantities = new Map();
  for (const instance of normalizeItemInstances(instances, catalogById)) {
    const location = instance.location;
    if (location.kind !== "hero" || (ownerId && location.ownerId !== ownerId)) continue;
    quantities.set(instance.itemId, (quantities.get(instance.itemId) || 0) + instance.quantity);
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

const destination = (input) => normalizeLocation(typeof input === "string" ? { kind: input } : input);

function instanceFailure(code, message, recovery = "Refresh the current item ledger and retry.") {
  return failure(code, message, { recovery, retryable: true });
}

export function splitFungibleStack(instances, instanceId, quantity, { newId } = {}, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const source = current.find((entry) => entry.id === instanceId);
  const amount = Math.floor(Number(quantity) || 0);
  if (!source) return instanceFailure("ITEM_INSTANCE_MISSING", "That item instance is no longer present.");
  if (source.instanceKind !== "stack" || amount <= 0 || amount >= source.quantity) return instanceFailure("ITEM_STACK_SPLIT_INVALID", "Only part of a fungible stack can be split.");
  const id = cleanId(newId, `${source.id}-split-${amount}`);
  if (current.some((entry) => entry.id === id)) return instanceFailure("ITEM_INSTANCE_ID_CONFLICT", "That item instance id is already in use.");
  const split = { ...source, id, quantity: amount };
  const next = current.map((entry) => entry.id === source.id ? { ...entry, quantity: entry.quantity - amount } : entry);
  return success([...next, split], { source: next.find((entry) => entry.id === source.id), split });
}

export function mergeFungibleStacks(instances, firstId, secondId, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const first = current.find((entry) => entry.id === firstId);
  const second = current.find((entry) => entry.id === secondId);
  if (!first || !second || first.id === second.id || first.instanceKind !== "stack" || second.instanceKind !== "stack" || first.itemId !== second.itemId) {
    return instanceFailure("ITEM_STACK_MERGE_INVALID", "Only two stacks of the same item can be merged.");
  }
  const next = current.filter((entry) => entry.id !== second.id).map((entry) => entry.id === first.id ? { ...entry, quantity: first.quantity + second.quantity } : entry);
  return success(next, { mergedInto: first.id, quantity: first.quantity + second.quantity });
}

export function transferItemInstance(instances, instanceId, nextLocation, { quantity = null, newId = null } = {}, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const source = current.find((entry) => entry.id === instanceId);
  if (!source) return instanceFailure("ITEM_INSTANCE_MISSING", "That item instance is no longer present.");
  const location = destination(nextLocation);
  if (!ITEM_LOCATION_KINDS.includes(location.kind)) return instanceFailure("ITEM_LOCATION_INVALID", "That item location is not supported.");
  const amount = quantity === null ? source.quantity : Math.floor(Number(quantity) || 0);
  if (amount <= 0 || amount > source.quantity) return instanceFailure("ITEM_TRANSFER_QUANTITY_INVALID", "The transfer quantity is outside the available stack.");
  if (source.instanceKind === "instance" && amount !== 1) return instanceFailure("ITEM_INSTANCE_NOT_SPLITTABLE", "A durable item instance must move as one item.");
  if (amount === source.quantity) {
    const moved = { ...source, location };
    return success(current.map((entry) => entry.id === source.id ? moved : entry), { moved, atomic: true });
  }
  const id = cleanId(newId, `${source.id}-transfer-${amount}`);
  if (current.some((entry) => entry.id === id)) return instanceFailure("ITEM_INSTANCE_ID_CONFLICT", "That transfer would reuse an item instance id.");
  const moved = { ...source, id, quantity: amount, location };
  const remainder = { ...source, quantity: source.quantity - amount };
  return success([...current.filter((entry) => entry.id !== source.id), remainder, moved], { moved, remainder, atomic: true });
}

export function attuneItemInstance(instances, instanceId, actorId, { maximum = 3 } = {}, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const actor = cleanId(actorId);
  const source = current.find((entry) => entry.id === instanceId);
  if (!source || !actor) return instanceFailure("ATTUNEMENT_INSTANCE_INVALID", "Choose a valid item instance and Hero.");
  const count = current.filter((entry) => entry.attunedToActorId === actor && entry.id !== source.id).length;
  if (source.attunedToActorId === actor) return success(current, { replayed: true, instance: source });
  if (count >= maximum) return instanceFailure("ATTUNEMENT_LIMIT_REACHED", `A Hero can attune to only ${maximum} items at once.`, "Unattune another item instance first.");
  const next = { ...source, attunedToActorId: actor };
  return success(current.map((entry) => entry.id === source.id ? next : entry), { instance: next });
}

export function unattuneItemInstance(instances, instanceId, actorId = null, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const source = current.find((entry) => entry.id === instanceId);
  if (!source || (actorId && source.attunedToActorId !== actorId)) return instanceFailure("ATTUNEMENT_INSTANCE_MISSING", "That item instance is not attuned by this Hero.");
  const next = { ...source, attunedToActorId: null };
  return success(current.map((entry) => entry.id === source.id ? next : entry), { instance: next });
}

export function spendItemInstanceCharges(instances, instanceId, amount = 1, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const source = current.find((entry) => entry.id === instanceId);
  const quantity = Math.max(1, Math.floor(Number(amount) || 0));
  if (!source || !source.charges) return instanceFailure("ITEM_INSTANCE_NOT_CHARGED", "That item instance has no stored charges.");
  if (source.charges.current < quantity) return instanceFailure("ITEM_INSTANCE_CHARGES_DEPLETED", `${source.id} has ${source.charges.current} charge${source.charges.current === 1 ? "" : "s"} remaining.`, "Recover the item at the appropriate rest or dawn before using it again.");
  const next = { ...source, charges: { ...source.charges, current: source.charges.current - quantity } };
  return success(current.map((entry) => entry.id === source.id ? next : entry), { instance: next, spent: quantity, remaining: next.charges.current });
}

export function setItemInstanceCharges(instances, instanceId, currentCharges, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const source = current.find((entry) => entry.id === instanceId);
  if (!source || !source.charges) return instanceFailure("ITEM_INSTANCE_NOT_CHARGED", "That item instance has no stored charges.");
  const next = { ...source, charges: { ...source.charges, current: Math.max(0, Math.min(source.charges.max, Math.floor(Number(currentCharges) || 0))) } };
  return success(current.map((entry) => entry.id === source.id ? next : entry), { instance: next });
}

export function recoverItemInstanceCharges(instances, restKind = "long", { random = () => 0.5, onRoll = () => undefined } = {}, catalogById = ITEM_BY_ID) {
  const current = normalizeItemInstances(instances, catalogById);
  const rolls = [];
  const next = current.map((instance) => {
    if (!instance.charges || instance.charges.current >= instance.charges.max) return instance;
    const item = getItem(instance.itemId, catalogById);
    const matches = restKind === "daily" ? item?.chargeRechargeKind === "daily"
      : restKind === "short" ? item?.chargeRechargeKind === "short-rest"
        : restKind === "long" && ["long-rest", "short-rest"].includes(item?.chargeRechargeKind);
    if (!matches) return instance;
    const amount = item.chargeRechargeAmount;
    let recovered = amount === "all" ? instance.charges.max : /^\d+$/.test(amount || "") ? Number(amount) : 0;
    const dice = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(amount || "");
    if (dice && Number(dice[1]) <= 100 && Number(dice[2]) > 0 && Number(dice[2]) <= 1000) {
      const dieRolls = Array.from({ length: Number(dice[1]) }, () => 1 + Math.floor(Math.max(0, Math.min(0.999999999999, Number(random()) || 0)) * Number(dice[2])));
      recovered = dieRolls.reduce((sum, roll) => sum + roll, Number(dice[3] || 0));
      const roll = { instanceId: instance.id, itemId: instance.itemId, formula: amount, rolls: dieRolls, recovered };
      rolls.push(roll);
      onRoll(roll);
    }
    return { ...instance, charges: { ...instance.charges, current: Math.min(instance.charges.max, instance.charges.current + recovered) } };
  });
  return success(next, { rolls });
}
