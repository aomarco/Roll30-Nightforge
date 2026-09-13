/**
 * The generated monster corpus is several hundred kilobytes of stat blocks and
 * reference prose. It is loaded on demand rather than bundled into the first
 * paint, because a table only needs it the moment someone opens the browser.
 */
let cachedMonsters = null;
let pendingLoad = null;

export const MONSTER_CONTENT_VERSION = "srd-5.1-2014-monsters-v2";

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

/**
 * A source record is allowed to be incomplete, but it is never allowed to
 * disappear silently. These helpers are intentionally pure so the generator,
 * setup inspector, and migration code can all use the same comparison shape.
 */
export const monsterCapabilitySummary = (monster) => {
  const capabilities = Array.isArray(monster?.actionCapabilities) ? monster.actionCapabilities : [];
  return Object.freeze({
    implemented: capabilities.filter((entry) => entry.status === "implemented").length,
    assisted: capabilities.filter((entry) => entry.status === "assisted").length,
    referenceOnly: capabilities.filter((entry) => entry.status === "reference-only").length,
    total: capabilities.length,
  });
};

const comparable = (value) => JSON.stringify(value ?? null);

export function monsterRefreshDiff(token, monster) {
  if (!token?.monsterId || !monster || token.monsterId !== monster.id) return null;
  const source = {
    name: monster.name,
    creatureType: monster.subtype ? `${monster.creatureType} (${monster.subtype})` : monster.creatureType,
    challengeRating: monster.challengeRating,
    xp: monster.xp,
    hp: monster.hp,
    maxHp: monster.hp,
    ac: monster.ac,
    speeds: monster.speed,
    baseSpeed: monster.baseSpeed,
    initiativeBonus: Math.floor((Number(monster.dexterity || 10) - 10) / 2),
    strength: monster.strength,
    dexterity: monster.dexterity,
    constitution: monster.constitution,
    intelligence: monster.intelligence,
    wisdom: monster.wisdom,
    charisma: monster.charisma,
    saveProficiencies: monster.saveProficiencies,
    skillProficiencies: monster.skillProficiencies,
    saveTotals: monster.saveTotals,
    skillTotals: monster.skillTotals,
    skillExpertise: monster.skillExpertise,
    passivePerception: monster.passivePerception,
    damageResistances: monster.damageResistances,
    damageImmunities: monster.damageImmunities,
    damageVulnerabilities: monster.damageVulnerabilities,
    conditionImmunities: monster.conditionImmunities,
    attacks: monster.attacks,
    attacksPerAction: monster.attacksPerAction,
    actionCapabilities: monster.actionCapabilities,
    capabilityStatus: monster.capabilityStatus,
    sourceDatasetHash: monster.sourceDatasetHash,
  };
  const changed = Object.keys(source).filter((field) => comparable(token[field]) !== comparable(source[field]));
  return {
    monsterId: monster.id,
    sourceSnapshotVersion: `${monster.sourceDatasetHash}:${monster.definitionVersion}`,
    changed,
    hasChanges: changed.length > 0,
    source,
    overrides: token.overrides || {},
  };
}

export function refreshedMonsterToken(token, monster, { id = token?.id, position = token?.position } = {}) {
  const diff = monsterRefreshDiff(token, monster);
  if (!diff) return null;
  const overrides = token.overrides || {};
  const preserve = new Set(Object.keys(overrides));
  const next = { ...token, ...diff.source, id, position };
  for (const field of preserve) if (Object.hasOwn(token, field)) next[field] = token[field];
  return {
    ...next,
    sourceSnapshotVersion: diff.sourceSnapshotVersion,
    overrides,
  };
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
