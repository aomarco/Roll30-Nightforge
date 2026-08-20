/**
 * The generated monster corpus is several hundred kilobytes of stat blocks and
 * reference prose. It is loaded on demand rather than bundled into the first
 * paint, because a table only needs it the moment someone opens the browser.
 */
let cachedMonsters = null;
let pendingLoad = null;

export const loadedMonsters = () => cachedMonsters;

export function loadMonsters() {
  if (cachedMonsters) return Promise.resolve(cachedMonsters);
  if (!pendingLoad) {
    pendingLoad = import("./monsters.generated.js")
      .then((module) => {
        cachedMonsters = module.MONSTERS;
        pendingLoad = null;
        return cachedMonsters;
      })
      .catch((error) => {
        pendingLoad = null;
        throw error;
      });
  }
  return pendingLoad;
}

export const CHALLENGE_BANDS = Object.freeze([
  { id: "0-1", name: "CR 0-1", min: 0, max: 1 },
  { id: "2-4", name: "CR 2-4", min: 2, max: 4 },
  { id: "5-10", name: "CR 5-10", min: 5, max: 10 },
  { id: "11-16", name: "CR 11-16", min: 11, max: 16 },
  { id: "17+", name: "CR 17+", min: 17, max: Infinity },
]);

export const EMPTY_MONSTER_FILTERS = Object.freeze({
  text: "",
  creatureType: "",
  size: "",
  challengeBand: "",
  sort: "name",
});

const uniqueSorted = (values) =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

export const monsterFacets = (monsters = []) => ({
  creatureTypes: uniqueSorted(monsters.map((monster) => monster.creatureType)),
  sizes: uniqueSorted(monsters.map((monster) => monster.size)),
  challengeBands: CHALLENGE_BANDS,
});

export function formatChallengeRating(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value)) return "CR -";
  if (value === 0.125) return "CR 1/8";
  if (value === 0.25) return "CR 1/4";
  if (value === 0.5) return "CR 1/2";
  return `CR ${value}`;
}

export function monsterSubtitle(monster) {
  if (!monster) return "Unknown creature";
  const size = `${monster.size[0].toUpperCase()}${monster.size.slice(1)}`;
  return `${size} ${monster.creatureType} · ${formatChallengeRating(monster.challengeRating)} · ${monster.hp} HP · AC ${monster.ac}`;
}

const normalized = (value) => String(value || "").trim().toLowerCase();

const bandForRating = (rating) =>
  CHALLENGE_BANDS.find((band) => Number(rating) >= band.min && Number(rating) <= band.max) || null;

export function filterMonsters(monsters = [], filters = {}) {
  const text = normalized(filters.text);
  const result = monsters.filter((monster) => {
    if (text) {
      const haystack = [
        monster.name,
        monster.creatureType,
        monster.subtype,
        monster.size,
        monster.alignment,
        ...(monster.attacks || []).map((attack) => attack.name),
      ].map(normalized).join(" ");
      if (!haystack.includes(text)) return false;
    }
    if (filters.creatureType && monster.creatureType !== filters.creatureType) return false;
    if (filters.size && monster.size !== filters.size) return false;
    if (filters.challengeBand && bandForRating(monster.challengeRating)?.id !== filters.challengeBand) return false;
    return true;
  });

  const sort = filters.sort || "name";
  return [...result].sort((left, right) => {
    if (sort === "cr-asc" || sort === "cr-desc") {
      const difference = Number(left.challengeRating) - Number(right.challengeRating);
      if (difference) return sort === "cr-desc" ? -difference : difference;
    }
    if (sort === "hp-desc") {
      const difference = Number(right.hp) - Number(left.hp);
      if (difference) return difference;
    }
    return left.name.localeCompare(right.name);
  });
}
