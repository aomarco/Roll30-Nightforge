import {
  ABILITY_KEYS,
  ALIGNMENTS,
  classById,
  grantedLanguages,
  LANGUAGES,
  normalizeBaseAbilities,
  raceById,
  SKILLS,
  subraceById,
} from "./heroes.js";
import { ITEM_BY_ID } from "./catalog.js";
import { normalizeEquipment, normalizeInventoryEntries } from "./items.js";
import {
  normalizeChests,
  normalizeEncounter,
  normalizeMapView,
  normalizeTableTokens,
  normalizeWalls,
} from "./table.js";

const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nullableId = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const timestamp = (value, fallback, { nullable = false } = {}) => {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return nullable ? null : fallback;
};

const cleanIdList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()))]
    : [];

const cleanLoadout = (value) => ({
  mainHand: nullableId(value?.mainHand),
  offHand: nullableId(value?.offHand),
});

const cleanEnchantments = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([itemId]) => itemId.trim())
      .map(([itemId, bonus]) => [
        itemId,
        Math.max(0, Math.min(3, Math.floor(finiteNumber(bonus, 0)))),
      ])
      .filter(([, bonus]) => bonus > 0),
  );
};

export function createSceneRecord(
  input = {},
  { id, now = new Date().toISOString() } = {},
) {
  const sceneId = nullableId(input.id) || nullableId(id);
  if (!sceneId) throw new TypeError("A Scene requires a stable id.");
  const kind = input.kind === "play" ? "play" : "battle";
  const tokens = normalizeTableTokens(input.tokens);

  return {
    id: sceneId,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Untitled scene",
    kind,
    gridSize: Math.max(24, Math.min(80, finiteNumber(input.gridSize, 44))),
    artworkKey: nullableId(input.artworkKey),
    blankCanvas: Boolean(input.blankCanvas),
    mapView: normalizeMapView(input.mapView),
    wallsVisible: input.wallsVisible !== false,
    walls: normalizeWalls(input.walls),
    chests: normalizeChests(input.chests),
    tokens,
    encounter: kind === "play" ? null : normalizeEncounter(input.encounter, tokens),
    createdAt: timestamp(input.createdAt, now),
    updatedAt: timestamp(input.updatedAt, now),
    lastOpenedAt: timestamp(input.lastOpenedAt, now, { nullable: true }),
    schemaVersion: 1,
  };
}

export function createHeroRecord(
  input = {},
  { id, now = new Date().toISOString() } = {},
) {
  const heroId = nullableId(input.id) || nullableId(id);
  if (!heroId) throw new TypeError("A Hero requires a stable id.");
  const selectedClass = classById(input.classId);
  const selectedRace = raceById(input.raceId);
  const selectedSubrace = subraceById(selectedRace.id, input.subraceId);
  const suppliedLanguages = cleanIdList(input.languages).filter((language) =>
    LANGUAGES.includes(language),
  );
  const languages = [...new Set([
    ...grantedLanguages(selectedRace.id, selectedSubrace?.id),
    ...suppliedLanguages,
  ])];
  const inventoryResult = normalizeInventoryEntries(input.inventory, ITEM_BY_ID);
  const priorUnknownItems = cleanIdList(input.recoveryDiagnostics?.unknownInventoryItemIds);

  const hero = {
    id: heroId,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Unnamed hero",
    portraitKey: nullableId(input.portraitKey),
    classId: selectedClass.id,
    level: Math.max(1, Math.min(20, Math.floor(finiteNumber(input.level, 1)))),
    // Earned experience is recorded but never spent automatically. Defaulting
    // to zero lets every Hero saved before this field existed load unchanged,
    // which is why the schema version does not move.
    xp: Math.max(0, Math.floor(finiteNumber(input.xp, 0))),
    raceId: selectedRace.id,
    subraceId: selectedSubrace?.id || null,
    alignment: ALIGNMENTS.includes(input.alignment) ? input.alignment : "Neutral",
    background: typeof input.background === "string" ? input.background : "",
    languages,
    baseAbilities: normalizeBaseAbilities(input.baseAbilities),
    saveProficiencies: Array.isArray(input.saveProficiencies)
      ? cleanIdList(input.saveProficiencies).filter((ability) => ABILITY_KEYS.includes(ability))
      : [...selectedClass.saveProficiencies],
    skillProficiencies: cleanIdList(input.skillProficiencies).filter((skill) =>
      SKILLS.some((entry) => entry.id === skill),
    ),
    inventory: inventoryResult.inventory,
    loadout: cleanLoadout(input.loadout),
    armorId: nullableId(input.armorId),
    shieldId: nullableId(input.shieldId),
    enchantments: cleanEnchantments(input.enchantments),
    wornItemIds: cleanIdList(input.wornItemIds),
    recoveryDiagnostics: {
      unknownInventoryItemIds: [...new Set([
        ...priorUnknownItems,
        ...inventoryResult.unknownItemIds,
      ])],
    },
    createdAt: timestamp(input.createdAt, now),
    updatedAt: timestamp(input.updatedAt, now),
    schemaVersion: 1,
  };
  return { ...hero, ...normalizeEquipment(hero, hero.inventory, ITEM_BY_ID) };
}

export const normalizeSceneRecord = (record, options = {}) =>
  createSceneRecord(record, { id: record?.id, ...options });

export const normalizeHeroRecord = (record, options = {}) =>
  createHeroRecord(record, { id: record?.id, ...options });
