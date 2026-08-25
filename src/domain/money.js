export const COIN_DENOMINATIONS = Object.freeze([
  Object.freeze({ id: "cp", name: "Copper", abbreviation: "CP", copperValue: 1 }),
  Object.freeze({ id: "sp", name: "Silver", abbreviation: "SP", copperValue: 10 }),
  Object.freeze({ id: "ep", name: "Electrum", abbreviation: "EP", copperValue: 50 }),
  Object.freeze({ id: "gp", name: "Gold", abbreviation: "GP", copperValue: 100 }),
  Object.freeze({ id: "pp", name: "Platinum", abbreviation: "PP", copperValue: 1000 }),
]);

export const EMPTY_COINS = Object.freeze(Object.fromEntries(
  COIN_DENOMINATIONS.map(({ id }) => [id, 0]),
));

const quantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
};

export const normalizeCoins = (input = {}) => Object.fromEntries(
  COIN_DENOMINATIONS.map(({ id }) => [id, quantity(input?.[id])]),
);

export const coinValueCopper = (input = {}) => {
  const coins = normalizeCoins(input);
  return COIN_DENOMINATIONS.reduce(
    (total, denomination) => total + coins[denomination.id] * denomination.copperValue,
    0,
  );
};

export const coinsAreEmpty = (input = {}) => coinValueCopper(input) === 0;

export function changeCoins(input, denominationId, delta) {
  const denomination = COIN_DENOMINATIONS.find(({ id }) => id === denominationId);
  if (!denomination) return { ok: false, code: "COIN_DENOMINATION_UNKNOWN", message: "Choose a supported coin denomination." };
  const coins = normalizeCoins(input);
  const adjustment = Math.trunc(Number(delta) || 0);
  const next = coins[denominationId] + adjustment;
  if (next < 0) return {
    ok: false,
    code: "COINS_INSUFFICIENT",
    message: `There are not enough ${denomination.name.toLowerCase()} coins.`,
  };
  return { ok: true, value: { ...coins, [denominationId]: quantity(next) }, denomination };
}

export function transferCoins(sourceInput, destinationInput, denominationId, amount = 1) {
  const count = quantity(amount);
  if (count < 1) return { ok: false, code: "COIN_TRANSFER_EMPTY", message: "Choose at least one coin to transfer." };
  const removed = changeCoins(sourceInput, denominationId, -count);
  if (!removed.ok) return removed;
  const added = changeCoins(destinationInput, denominationId, count);
  if (!added.ok) return added;
  return {
    ok: true,
    source: removed.value,
    destination: added.value,
    denomination: removed.denomination,
    amount: count,
  };
}

export function formatCoins(input = {}) {
  const coins = normalizeCoins(input);
  const parts = COIN_DENOMINATIONS
    .slice()
    .reverse()
    .filter(({ id }) => coins[id] > 0)
    .map(({ id, abbreviation }) => `${coins[id]} ${abbreviation}`);
  return parts.join(" · ") || "No coins";
}
