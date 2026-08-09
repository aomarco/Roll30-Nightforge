const DEFAULT_ABILITIES = Object.freeze({
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
});

const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nullableId = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const cleanIdList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()))]
    : [];

const cleanInventory = (value) => {
  if (!Array.isArray(value)) return [];
  const quantities = new Map();
  for (const entry of value) {
    if (!entry || typeof entry.itemId !== "string" || !entry.itemId.trim()) continue;
    const quantity = Math.floor(finiteNumber(entry.quantity, 0));
    if (quantity <= 0) continue;
    const itemId = entry.itemId.trim();
    quantities.set(itemId, (quantities.get(itemId) || 0) + quantity);
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
};

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

  return {
    id: sceneId,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Untitled scene",
    kind: input.kind === "play" ? "play" : "battle",
    gridSize: Math.max(24, Math.min(80, finiteNumber(input.gridSize, 44))),
    artworkKey: nullableId(input.artworkKey),
    blankCanvas: Boolean(input.blankCanvas),
    mapView: {
      scale: finiteNumber(input.mapView?.scale, 1),
      x: finiteNumber(input.mapView?.x, 0),
      y: finiteNumber(input.mapView?.y, 0),
    },
    wallsVisible: input.wallsVisible !== false,
    walls: Array.isArray(input.walls) ? input.walls : [],
    chests: Array.isArray(input.chests) ? input.chests : [],
    tokens: Array.isArray(input.tokens) ? input.tokens : [],
    encounter: input.kind === "play" ? null : input.encounter || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    lastOpenedAt: input.lastOpenedAt || null,
    schemaVersion: 1,
  };
}

export function createHeroRecord(
  input = {},
  { id, now = new Date().toISOString() } = {},
) {
  const heroId = nullableId(input.id) || nullableId(id);
  if (!heroId) throw new TypeError("A Hero requires a stable id.");

  return {
    id: heroId,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Unnamed hero",
    classId: nullableId(input.classId) || "fighter",
    level: Math.max(1, Math.min(20, Math.floor(finiteNumber(input.level, 1)))),
    raceId: nullableId(input.raceId) || "human",
    subraceId: nullableId(input.subraceId),
    alignment: nullableId(input.alignment) || "Neutral",
    background: typeof input.background === "string" ? input.background : "",
    languages: cleanIdList(input.languages).length
      ? cleanIdList(input.languages)
      : ["Common"],
    baseAbilities: Object.fromEntries(
      Object.keys(DEFAULT_ABILITIES).map((ability) => [
        ability,
        Math.max(
          8,
          Math.min(15, Math.floor(finiteNumber(input.baseAbilities?.[ability], 8))),
        ),
      ]),
    ),
    saveProficiencies: cleanIdList(input.saveProficiencies),
    skillProficiencies: cleanIdList(input.skillProficiencies),
    inventory: cleanInventory(input.inventory),
    loadout: cleanLoadout(input.loadout),
    armorId: nullableId(input.armorId),
    shieldId: nullableId(input.shieldId),
    enchantments: cleanEnchantments(input.enchantments),
    wornItemIds: cleanIdList(input.wornItemIds),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    schemaVersion: 1,
  };
}

export const normalizeSceneRecord = (record, options = {}) =>
  createSceneRecord(record, { id: record?.id, ...options });

export const normalizeHeroRecord = (record, options = {}) =>
  createHeroRecord(record, { id: record?.id, ...options });

