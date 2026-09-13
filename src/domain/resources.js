import { failure, success } from "../application/result.js";

export const RESOURCE_LEDGER_VERSION = 1;
export const RESOURCE_EVENT_LIMIT = 256;
export const RESERVATION_STATUS = Object.freeze(["reserved", "committed", "released"]);

const cleanId = (value, fallback = null) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(finite(value, fallback))));
const cleanText = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;

export function normalizeResourcePool(input = {}, id = null) {
  const poolId = cleanId(input.id, cleanId(id));
  if (!poolId) return null;
  const maximum = integer(input.maximum ?? input.max, 0);
  return {
    id: poolId,
    kind: cleanText(input.kind, "uses"),
    current: Math.min(maximum, integer(input.current, maximum)),
    maximum,
    recovery: cleanText(input.recovery, "manual"),
    sourceId: cleanId(input.sourceId),
    label: cleanText(input.label, poolId),
  };
}

function normalizeReservation(input = {}) {
  const id = cleanId(input.id);
  const poolId = cleanId(input.poolId);
  const amount = integer(input.amount);
  if (!id || !poolId || amount <= 0 || !RESERVATION_STATUS.includes(input.status)) return null;
  return {
    id,
    poolId,
    amount,
    status: input.status,
    ownerId: cleanId(input.ownerId),
    operationId: cleanId(input.operationId),
  };
}

export function normalizeResourceLedger(input = {}) {
  const rawPools = Array.isArray(input.pools)
    ? input.pools.map((pool) => [pool?.id, pool])
    : Object.entries(input.pools || {});
  const pools = Object.fromEntries(rawPools.map(([id, pool]) => [id, normalizeResourcePool(pool, id)]).filter(([, pool]) => pool));
  const reservations = (Array.isArray(input.reservations) ? input.reservations : Object.values(input.reservations || {}))
    .map(normalizeReservation).filter(Boolean).slice(-256);
  const processedEventIds = [...new Set((Array.isArray(input.processedEventIds) ? input.processedEventIds : [])
    .filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim().slice(0, 160)))].slice(-RESOURCE_EVENT_LIMIT);
  const events = (Array.isArray(input.events) ? input.events : []).filter((event) => event && cleanId(event.id)).slice(-RESOURCE_EVENT_LIMIT)
    .map((event) => ({ id: cleanId(event.id), type: cleanText(event.type, "resource"), poolId: cleanId(event.poolId), amount: integer(event.amount), sequence: integer(event.sequence) }));
  return {
    version: RESOURCE_LEDGER_VERSION,
    pools,
    reservations,
    processedEventIds,
    events,
    sequence: integer(input.sequence),
  };
}

const activeReservationsFor = (ledger, poolId) => normalizeResourceLedger(ledger).reservations
  .filter((reservation) => reservation.poolId === poolId && reservation.status === "reserved");

const availableFor = (ledger, poolId) => {
  const normalized = normalizeResourceLedger(ledger);
  const pool = normalized.pools[poolId];
  if (!pool) return null;
  return Math.max(0, pool.current - activeReservationsFor(normalized, poolId).reduce((sum, reservation) => sum + reservation.amount, 0));
};

const resourceMissing = (poolId) => failure(
  "RESOURCE_POOL_MISSING",
  `Resource pool ${poolId || "(unknown)"} is not available.`,
  { recovery: "Refresh the Hero or create the resource pool before spending it.", retryable: true },
);

export function quoteSpend(ledger, poolId, amount) {
  const normalized = normalizeResourceLedger(ledger);
  const pool = normalized.pools[poolId];
  const quantity = integer(amount);
  if (!pool) return resourceMissing(poolId);
  if (!quantity) return failure("RESOURCE_AMOUNT_INVALID", "Resource spend must be a positive whole number.", { recovery: "Choose a positive amount.", retryable: false });
  const available = availableFor(normalized, poolId);
  if (quantity > available) return failure("RESOURCE_INSUFFICIENT", `${pool.label} has only ${available} available.`, { recovery: "Choose a smaller spend or recover the resource.", retryable: true });
  return success({ poolId, amount: quantity, current: pool.current, reserved: pool.current - available, availableAfter: available - quantity });
}

function appendResourceEvent(ledger, event) {
  const normalized = normalizeResourceLedger(ledger);
  const id = cleanId(event.id, `resource-${normalized.sequence + 1}`);
  if (normalized.processedEventIds.includes(id)) return { ledger: normalized, event: normalized.events.find((entry) => entry.id === id) || null, replayed: true };
  const nextEvent = { ...event, id, sequence: normalized.sequence + 1, amount: integer(event.amount) };
  return {
    ledger: {
      ...normalized,
      sequence: nextEvent.sequence,
      processedEventIds: [...normalized.processedEventIds, id].slice(-RESOURCE_EVENT_LIMIT),
      events: [...normalized.events, nextEvent].slice(-RESOURCE_EVENT_LIMIT),
    },
    event: nextEvent,
    replayed: false,
  };
}

export function reserveSpend(ledger, poolId, amount, { reservationId, ownerId = null, operationId = null } = {}) {
  const normalized = normalizeResourceLedger(ledger);
  const quote = quoteSpend(normalized, poolId, amount);
  if (!quote.ok) return quote;
  const id = cleanId(reservationId, `reservation-${normalized.sequence + 1}`);
  const existing = normalized.reservations.find((reservation) => reservation.id === id);
  if (existing) return success(normalized, { replayed: true, reservation: existing, quote: { ...quote.value, availableAfter: availableFor(normalized, poolId) } });
  const reservation = { id, poolId, amount: quote.value.amount, status: "reserved", ownerId: cleanId(ownerId), operationId: cleanId(operationId) };
  const event = appendResourceEvent(normalized, { id: `reserve-${id}`, type: "resource-reserved", poolId, amount: reservation.amount });
  return success({ ...event.ledger, reservations: [...event.ledger.reservations, reservation] }, { reservation, event: event.event, replayed: false });
}

function updateReservation(ledger, reservationId, status, eventType) {
  const normalized = normalizeResourceLedger(ledger);
  const reservation = normalized.reservations.find((entry) => entry.id === reservationId);
  if (!reservation) return failure("RESOURCE_RESERVATION_MISSING", "That resource reservation is no longer present.", { recovery: "Refresh the current resource ledger.", retryable: true });
  if (reservation.status !== "reserved") return success(normalized, { replayed: true, reservation });
  const event = appendResourceEvent(normalized, { id: `${eventType}-${reservation.id}`, type: eventType, poolId: reservation.poolId, amount: reservation.amount });
  return success({ ...event.ledger, reservations: event.ledger.reservations.map((entry) => entry.id === reservationId ? { ...entry, status } : entry) }, { reservation: { ...reservation, status }, event: event.event, replayed: false });
}

export function commitSpend(ledger, reservationId) {
  const normalized = normalizeResourceLedger(ledger);
  const reservation = normalized.reservations.find((entry) => entry.id === reservationId);
  if (!reservation) return updateReservation(normalized, reservationId, "committed", "resource-committed");
  if (reservation.status !== "reserved") return success(normalized, { replayed: true, reservation });
  const pool = normalized.pools[reservation.poolId];
  if (!pool || pool.current < reservation.amount) return failure("RESOURCE_BALANCE_CHANGED", "The resource balance changed before the reservation committed.", { recovery: "Release the reservation and quote the spend again.", retryable: true });
  const event = appendResourceEvent(normalized, { id: `commit-${reservation.id}`, type: "resource-committed", poolId: reservation.poolId, amount: reservation.amount });
  return success({
    ...event.ledger,
    pools: { ...event.ledger.pools, [pool.id]: { ...pool, current: pool.current - reservation.amount } },
    reservations: event.ledger.reservations.map((entry) => entry.id === reservationId ? { ...entry, status: "committed" } : entry),
  }, { reservation: { ...reservation, status: "committed" }, event: event.event, replayed: false });
}

export const releaseReservation = (ledger, reservationId) => updateReservation(ledger, reservationId, "released", "resource-released");

export function recoverPool(ledger, poolId, { amount = null, mode = "amount", eventId = null } = {}) {
  const normalized = normalizeResourceLedger(ledger);
  const pool = normalized.pools[poolId];
  if (!pool) return resourceMissing(poolId);
  if (eventId && normalized.processedEventIds.includes(eventId)) return success(normalized, {
    replayed: true,
    recovered: 0,
    pool,
    event: normalized.events.find((event) => event.id === eventId) || null,
  });
  const recovery = mode === "full" ? pool.maximum - pool.current : integer(amount);
  if (recovery <= 0) return success(normalized, { replayed: false, recovered: 0, pool });
  const event = appendResourceEvent(normalized, { id: cleanId(eventId, `recover-${poolId}-${normalized.sequence + 1}`), type: "resource-recovered", poolId, amount: recovery });
  if (event.replayed) return success(event.ledger, { replayed: true, recovered: 0, pool: event.ledger.pools[poolId], event: event.event });
  const nextPool = { ...pool, current: Math.min(pool.maximum, pool.current + recovery) };
  return success({ ...event.ledger, pools: { ...event.ledger.pools, [poolId]: nextPool } }, { replayed: false, recovered: nextPool.current - pool.current, pool: nextPool, event: event.event });
}

export function setPoolMaximum(ledger, poolId, maximum) {
  const normalized = normalizeResourceLedger(ledger);
  const pool = normalized.pools[poolId];
  if (!pool) return resourceMissing(poolId);
  const nextMaximum = integer(maximum);
  const nextPool = { ...pool, maximum: nextMaximum, current: Math.min(nextMaximum, pool.current) };
  return success({ ...normalized, pools: { ...normalized.pools, [poolId]: nextPool } }, { pool: nextPool });
}

export function adjustPool(ledger, poolId, delta, { eventId = null, reason = "gm-adjustment" } = {}) {
  const normalized = normalizeResourceLedger(ledger);
  const pool = normalized.pools[poolId];
  if (!pool) return resourceMissing(poolId);
  const amount = Math.floor(finite(delta));
  const nextCurrent = Math.max(0, Math.min(pool.maximum, pool.current + amount));
  const event = appendResourceEvent(normalized, { id: cleanId(eventId, `adjust-${poolId}-${normalized.sequence + 1}`), type: reason, poolId, amount: Math.abs(nextCurrent - pool.current) });
  if (event.replayed) return success(event.ledger, { replayed: true, pool: event.ledger.pools[poolId], event: event.event });
  const nextPool = { ...pool, current: nextCurrent };
  return success({ ...event.ledger, pools: { ...event.ledger.pools, [poolId]: nextPool } }, { replayed: false, pool: nextPool, event: event.event });
}

export function normalizeRecoveryLedger(input = {}) {
  return {
    version: 1,
    processedEventIds: [...new Set((Array.isArray(input.processedEventIds) ? input.processedEventIds : [])
      .filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim().slice(0, 160)))].slice(-RESOURCE_EVENT_LIMIT),
    events: (Array.isArray(input.events) ? input.events : []).filter((event) => event && cleanId(event.id)).slice(-RESOURCE_EVENT_LIMIT)
      .map((event) => ({ id: cleanId(event.id), kind: cleanText(event.kind, "recovery"), source: cleanText(event.source, "manual") })),
  };
}

export function applyRecoveryEvent(ledger, { id, kind = "recovery", source = "manual" } = {}) {
  const normalized = normalizeRecoveryLedger(ledger);
  const eventId = cleanId(id);
  if (!eventId) return failure("RECOVERY_EVENT_INVALID", "Recovery needs a stable event id.", { recovery: "Retry with the persisted rest or dawn event id.", retryable: false });
  if (normalized.processedEventIds.includes(eventId)) return success(normalized, { replayed: true, event: normalized.events.find((event) => event.id === eventId) || { id: eventId, kind, source } });
  const event = { id: eventId, kind: cleanText(kind, "recovery"), source: cleanText(source, "manual") };
  return success({ ...normalized, processedEventIds: [...normalized.processedEventIds, eventId].slice(-RESOURCE_EVENT_LIMIT), events: [...normalized.events, event].slice(-RESOURCE_EVENT_LIMIT) }, { replayed: false, event });
}
