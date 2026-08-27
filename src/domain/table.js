import { ITEM_BY_ID, WEAPONS } from "./catalog.js";
import {
  isIncapacitated,
  normalizeConditionExpiries,
  normalizeConditionImmunities,
  normalizeConditions,
} from "./conditions.js";
import { damageTypeName, normalizeDamageTypeList, normalizeDamageTypes } from "./damageTypes.js";
import {
  ABILITY_KEYS,
  abilityModifier,
  computeArmorClass,
  deriveHero,
  proficiencyBonus,
  SKILLS,
} from "./heroes.js";
import {
  changeInventory,
  normalizeEquipment,
  normalizeInventoryEntries,
  wornMagicBonuses,
} from "./items.js";
import { normalizeCoins } from "./money.js";
import { normalizeRacialChoices, normalizeRacialUses, resetRacialUses } from "./racialTraits.js";

const SKILL_BY_ID = Object.freeze(Object.fromEntries(SKILLS.map((skill) => [skill.id, skill])));

export const CAMERA_MIN_ZOOM = 0.35;
export const CAMERA_MAX_ZOOM = 3;
export const MAP_MIN_SCALE = 0.2;
export const MAP_MAX_SCALE = 5;
/**
 * Three successes stabilise, three failures kill. Named because the tally is
 * clamped in the token normalizer and counted in three other places, and a bare
 * 3 in four files is a rule nobody can find later.
 */
export const DEATH_SAVES_REQUIRED = 3;

/**
 * Dying is not a stored flag. It is the gap between being at zero hit points and
 * being dead, and deriving it from the two fields that already exist means there
 * is no third field to keep in step with them.
 *
 * These live here rather than in the death module because combat and the
 * screens both need them, and the death module reaches through attacks into
 * combat — putting them there would make the two files import each other.
 */
export const isDying = (token) => Boolean(token) && token.hp <= 0 && !token.dead;

/**
 * Stable is likewise derived. A stabilised creature stays at zero and stays
 * unconscious — it has simply stopped rolling, because three successes means the
 * bleeding has been survived, not that the creature is back on its feet.
 */
export const isStable = (token) => isDying(token) && token.deathSaveSuccesses >= DEATH_SAVES_REQUIRED;

export const canRollDeathSave = (token) => isDying(token) && !isStable(token);

/**
 * Everything a creature carries out of the dying state. Kept in one place so
 * that reviving by healing, by a natural twenty, and by restarting the Battle
 * cannot drift apart.
 */
export const revivedTokenPatch = (token, hp = 1) => ({
  hp: Math.max(1, Math.min(token.maxHp, Math.floor(Number(hp) || 1))),
  deathSaveSuccesses: 0,
  deathSaveFailures: 0,
  dead: false,
  conditions: token.conditions.filter((condition) => condition !== "unconscious"),
  conditionExpiries: Object.fromEntries(Object.entries(token.conditionExpiries || {}).filter(([condition]) => condition !== "unconscious")),
});

/** The state a creature is reset to when a Battle restarts or is abandoned. */
export const CLEARED_DEATH_STATE = Object.freeze({
  deathSaveSuccesses: 0,
  deathSaveFailures: 0,
  dead: false,
});

/**
 * The turn-scoped states that expire at the start of a creature's next turn:
 * whether it is Dodging, whether it has Disengaged, whether its reaction is
 * still available, and any Help an ally gave it.
 *
 * Cleared in three places — when a turn passes to this creature, when a Battle
 * begins, and when one restarts. One object rather than four lines in each so
 * the set cannot go out of step between them.
 */
export const CLEARED_TURN_STATE = Object.freeze({
  reactionSpent: false,
  dodging: false,
  disengaging: false,
  helpedAgainstTokenId: null,
  helpedById: null,
  readiedAction: null,
});

export const DEFAULT_CAMERA = Object.freeze({ x: 0, y: 0, zoom: 1 });
export const DEFAULT_MAP_VIEW = Object.freeze({ scale: 1, x: 0, y: 0 });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, finite(value, minimum)));

export const clampCameraZoom = (zoom) => clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
export const clampMapScale = (scale) => clamp(scale, MAP_MIN_SCALE, MAP_MAX_SCALE);

export const normalizeCamera = (camera = {}) => ({
  x: finite(camera.x),
  y: finite(camera.y),
  zoom: clampCameraZoom(camera.zoom ?? 1),
});

export const normalizeMapView = (mapView = {}) => {
  // `scale` stays the single number the readout and the +/- buttons speak in.
  // The two axes are only ever apart when a corner was pulled with Shift held.
  const scale = clampMapScale(mapView.scale ?? 1);
  const result = {
    scale,
    x: finite(mapView.x),
    y: finite(mapView.y),
  };
  if (mapView.scaleX !== undefined && mapView.scaleX !== null) {
    result.scaleX = clampMapScale(mapView.scaleX);
  }
  if (mapView.scaleY !== undefined && mapView.scaleY !== null) {
    result.scaleY = clampMapScale(mapView.scaleY);
  }
  return result;
};

export function zoomCameraAt(camera, nextZoom, anchor = { x: 0, y: 0 }) {
  const current = normalizeCamera(camera);
  const zoom = clampCameraZoom(nextZoom);
  const anchorX = finite(anchor.x);
  const anchorY = finite(anchor.y);
  const worldX = (anchorX - current.x) / current.zoom;
  const worldY = (anchorY - current.y) / current.zoom;
  return {
    x: anchorX - worldX * zoom,
    y: anchorY - worldY * zoom,
    zoom,
  };
}

export const zoomCameraBy = (camera, delta, anchor) =>
  zoomCameraAt(camera, normalizeCamera(camera).zoom + finite(delta), anchor);

export const panCameraBy = (camera, delta = {}) => {
  const current = normalizeCamera(camera);
  return {
    ...current,
    x: current.x + finite(delta.x),
    y: current.y + finite(delta.y),
  };
};

export const screenToWorld = (point, camera) => {
  const current = normalizeCamera(camera);
  return {
    x: (finite(point?.x) - current.x) / current.zoom,
    y: (finite(point?.y) - current.y) / current.zoom,
  };
};

export const worldToScreen = (point, camera) => {
  const current = normalizeCamera(camera);
  return {
    x: finite(point?.x) * current.zoom + current.x,
    y: finite(point?.y) * current.zoom + current.y,
  };
};

export const zoomCameraAtViewportCenter = (camera, nextZoom, viewport = {}) =>
  zoomCameraAt(camera, nextZoom, {
    x: finite(viewport.width) / 2,
    y: finite(viewport.height) / 2,
  });

export const adjustArtworkBy = (mapView, screenDelta = {}, cameraZoom = 1) => {
  const current = normalizeMapView(mapView);
  const zoom = clampCameraZoom(cameraZoom);
  return {
    ...current,
    x: current.x + finite(screenDelta.x) / zoom,
    y: current.y + finite(screenDelta.y) / zoom,
  };
};

export const setArtworkScale = (mapView, scale) => {
  const normalized = normalizeMapView(mapView);
  delete normalized.scaleX;
  delete normalized.scaleY;
  return {
    ...normalized,
    scale: clampMapScale(scale),
  };
};

/** Shift-dragging a corner stretches the picture, so the axes move apart. */
export const setArtworkScaleAxes = (mapView, scaleX, scaleY) => {
  const x = clampMapScale(scaleX);
  const y = clampMapScale(scaleY);
  return { ...normalizeMapView(mapView), scale: x, scaleX: x, scaleY: y };
};

export const clientPointToPercent = (point, transformedRect) => ({
  xPercent: ((finite(point?.x) - finite(transformedRect?.left)) / Math.max(1, finite(transformedRect?.width, 1))) * 100,
  yPercent: ((finite(point?.y) - finite(transformedRect?.top)) / Math.max(1, finite(transformedRect?.height, 1))) * 100,
});

/** The stored numbers, before anything is said about which cell they land in. */
const rawPosition = (position = {}) => ({
  xPercent: finite(position.xPercent ?? position.x, 50),
  yPercent: finite(position.yPercent ?? position.y, 50),
});

/**
 * Snap onto the centre of the scene cell a position falls inside.
 *
 * Written against SCENE_COLUMNS/SCENE_ROWS directly rather than through
 * setupCellForPosition, because that helper takes a viewport and this one is
 * about the real board every saved scene uses.
 */
export const snapScenePosition = (position) => {
  const { xPercent, yPercent } = rawPosition(position);
  const column = clamp(Math.floor((xPercent / 100) * SCENE_COLUMNS), 0, SCENE_COLUMNS - 1);
  const row = clamp(Math.floor((yPercent / 100) * SCENE_ROWS), 0, SCENE_ROWS - 1);
  return {
    xPercent: ((column + 0.5) / SCENE_COLUMNS) * 100,
    yPercent: ((row + 0.5) / SCENE_ROWS) * 100,
  };
};

/** True when a position is already sitting exactly on a cell centre. */
export const isOnCellCentre = (position) => {
  const current = rawPosition(position);
  const snapped = snapScenePosition(current);
  return Math.abs(current.xPercent - snapped.xPercent) < 0.0001
    && Math.abs(current.yPercent - snapped.yPercent) < 0.0001;
};

/**
 * The stored numbers, defaulting to the centre *cell* rather than to 50/50.
 * On a 20x12 board 50/50 is a cell corner, so any record that fell back to it
 * rendered half a cell out in both directions.
 *
 * Snapping itself happens a layer up, in the Table screen, because the grid
 * helpers here are deliberately viewport-parameterised and a record has no
 * viewport attached to it.
 */
export const normalizePosition = (position = {}) => ({
  xPercent: finite(position.xPercent ?? position.x, 52.5),
  yPercent: finite(position.yPercent ?? position.y, 54.166666666666664),
});

const colorPattern = /^#[0-9a-f]{6}$/i;
const TOKEN_COLORS = Object.freeze(["#d9803f", "#5fa8f5", "#7fb356", "#a77be8", "#e0b055", "#d75f79"]);

const uniqueNormalizedRecords = (records, normalize) => {
  const seen = new Set();
  const normalized = [];
  for (const [ordinal, record] of (Array.isArray(records) ? records : []).entries()) {
    try {
      const value = normalize(record, ordinal);
      if (!value || seen.has(value.id)) continue;
      seen.add(value.id);
      normalized.push(value);
    } catch {
      // Invalid persisted records are dropped while the remaining collection is recovered.
    }
  }
  return normalized;
};

export const TOKEN_SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
export const MOVEMENT_MODES = Object.freeze(["walk", "fly", "swim", "climb"]);

/**
 * Which side of a fight a creature is on. Two sides only: the rules need to
 * answer "is one side left standing", and nothing in 5e needs a third answer.
 * Bystanders are modelled by leaving them off the board, not by a neutral team.
 */
export const TOKEN_FACTIONS = Object.freeze(["ally", "foe"]);

export function normalizeSpeeds(input, fallback = 30) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const walk = Math.max(0, Math.floor(finite(source.walk, fallback)));
  return Object.fromEntries(MOVEMENT_MODES.map((mode) => [
    mode,
    mode === "walk" ? walk : Math.max(0, Math.floor(finite(source[mode], 0))),
  ]));
}

export function normalizeDifficultTerrain(input) {
  const seen = new Set();
  for (const candidate of Array.isArray(input) ? input : []) {
    const match = typeof candidate === "string" ? /^(\d+):(\d+)$/.exec(candidate) : null;
    const column = match ? Number(match[1]) : Math.floor(finite(candidate?.column, -1));
    const row = match ? Number(match[2]) : Math.floor(finite(candidate?.row, -1));
    if (column >= 0 && column < SCENE_COLUMNS && row >= 0 && row < SCENE_ROWS) seen.add(`${column}:${row}`);
  }
  return [...seen].sort((left, right) => {
    const [lc, lr] = left.split(":").map(Number);
    const [rc, rr] = right.split(":").map(Number);
    return lr - rr || lc - rc;
  });
}

export const FACTION_LABELS = Object.freeze({ ally: "Ally", foe: "Foe" });

export const MAX_ATTACKS_PER_ACTION = 10;

const attackSlug = (value, fallback) => {
  const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || fallback;
};

const proseSection = (value) =>
  Array.isArray(value)
    ? value.slice(0, 40).flatMap((entry) => {
        const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, 80) : "";
        if (!name) return [];
        return [{ name, desc: typeof entry?.desc === "string" ? entry.desc.slice(0, 1200) : "" }];
      })
    : [];

const proseLine = (value) => (typeof value === "string" ? value.trim().slice(0, 300) : "");

/**
 * The reference line for a defence list, naming which half of it the engine is
 * actually running.
 *
 * Without the marker the table cannot tell a resistance that is being applied
 * from one that is only being displayed, and those look identical on the sheet
 * while behaving completely differently at the dice.
 */
function unappliedNote({ applied, unapplied }) {
  const parts = [];
  if (applied.length) parts.push(`${applied.map(damageTypeName).join(", ")} (applied)`);
  if (unapplied.length) parts.push(`${unapplied.join("; ")} (not applied — read at the table)`);
  return parts.join(" · ");
}

/**
 * Everything on a stat block the engine cannot yet run: saving-throw actions,
 * legendary actions, reactions, resistances and senses. Kept as reference text
 * so the table can read it, deliberately not wired to any rule.
 */
export function normalizeStatBlockNotes(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const notes = {
    multiattack: proseLine(input.multiattack),
    resistances: proseLine(input.resistances),
    immunities: proseLine(input.immunities),
    vulnerabilities: proseLine(input.vulnerabilities),
    conditionImmunities: proseLine(input.conditionImmunities),
    senses: proseLine(input.senses),
    languages: proseLine(input.languages),
    traits: proseSection(input.traits),
    otherActions: proseSection(input.otherActions),
    legendaryActions: proseSection(input.legendaryActions),
    reactions: proseSection(input.reactions),
  };
  const populated = Object.values(notes).some((value) => (Array.isArray(value) ? value.length : Boolean(value)));
  return populated ? notes : null;
}

/**
 * An authored attack is a capability, not an object. Heroes derive their attack
 * options from the weapons in their hands; every other token carries the
 * finished numbers the way a stat block writes them, with the ability modifier
 * already folded into the damage.
 */
export function normalizeTokenAttack(input = {}, ordinal = 0) {
  const name = typeof input.name === "string" && input.name.trim()
    ? input.name.trim().slice(0, 60)
    : `Attack ${ordinal + 1}`;
  const rangeKind = input.rangeKind === "ranged" ? "ranged" : "melee";
  const throwable = Boolean(input.throwable);
  const normalFeet = Math.max(0, Math.floor(finite(input.normalFeet)));
  const longFeet = Math.max(normalFeet, Math.floor(finite(input.longFeet)));
  // A melee attack keeps distance bands only when it can be thrown; that is
  // what turns "swing it" into "swing it or throw it".
  const banded = rangeKind === "ranged" || throwable;
  return {
    id: typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : attackSlug(name, `attack-${ordinal + 1}`),
    name,
    toHit: Math.max(-20, Math.min(20, Math.floor(finite(input.toHit)))),
    damageDice: typeof input.damageDice === "string" && input.damageDice.trim()
      ? input.damageDice.trim().slice(0, 20)
      : "1d4",
    damageType: typeof input.damageType === "string" && input.damageType.trim()
      ? input.damageType.trim().slice(0, 30)
      : null,
    rangeKind,
    reachFeet: rangeKind === "melee"
      ? Math.max(5, Math.floor(finite(input.reachFeet, 5)))
      : 5,
    normalFeet: banded ? Math.max(5, normalFeet || 20) : 0,
    longFeet: banded ? Math.max(5, longFeet || normalFeet || 20) : 0,
    throwable,
    // True while the weapon is lying on the board or lodged in a target. The
    // attack stays on the list so it can be restored when it is recovered.
    thrown: throwable && Boolean(input.thrown),
    riders: Array.isArray(input.riders)
      ? input.riders.slice(0, 4).flatMap((rider) => {
          const dice = typeof rider?.damageDice === "string" ? rider.damageDice.trim().slice(0, 20) : "";
          if (!dice) return [];
          return [{
            damageDice: dice,
            damageType: typeof rider?.damageType === "string" && rider.damageType.trim()
              ? rider.damageType.trim().slice(0, 30)
              : null,
          }];
        })
      : [],
    note: typeof input.note === "string" ? input.note.slice(0, 600) : "",
  };
}

export function normalizeTokenAttacks(attacks) {
  if (!Array.isArray(attacks)) return [];
  const seen = new Set();
  const normalized = [];
  for (const candidate of attacks.slice(0, 24)) {
    const attack = normalizeTokenAttack(candidate, normalized.length);
    let uniqueId = attack.id;
    let suffix = 2;
    while (seen.has(uniqueId)) {
      uniqueId = `${attack.id}-${suffix}`;
      suffix += 1;
    }
    seen.add(uniqueId);
    normalized.push({ ...attack, id: uniqueId });
  }
  return normalized;
}

export const READY_TRIGGERS = Object.freeze(["target-moves", "target-attacks", "target-ends-turn"]);

export function normalizeReadiedAction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const targetTokenId = typeof input.targetTokenId === "string" && input.targetTokenId.trim() ? input.targetTokenId.trim() : null;
  const trigger = READY_TRIGGERS.includes(input.trigger) ? input.trigger : null;
  const weaponId = typeof input.weaponId === "string" && input.weaponId.trim() ? input.weaponId.trim() : null;
  const attackId = typeof input.attackId === "string" && input.attackId.trim() ? input.attackId.trim() : null;
  const hand = ["mainHand", "offHand"].includes(input.hand) ? input.hand : null;
  if (!targetTokenId || !trigger || (!weaponId && !attackId)) return null;
  return { trigger, targetTokenId, weaponId, attackId, hand };
}

export function normalizeTableToken(input = {}, { id, ordinal = 0 } = {}) {
  const tokenId = typeof input.id === "string" && input.id.trim()
    ? input.id.trim()
    : typeof id === "string" && id.trim()
      ? id.trim()
      : null;
  if (!tokenId) throw new TypeError("A Table token requires a stable id.");
  const maxHp = Math.max(1, Math.floor(finite(input.maxHp, 10)));
  const inventoryResult = normalizeInventoryEntries(input.inventory);
  const heroId = typeof input.heroId === "string" && input.heroId.trim() ? input.heroId.trim() : null;
  const hp = Math.max(0, Math.min(maxHp, Math.floor(finite(input.hp, maxHp))));
  const speeds = normalizeSpeeds(input.speeds, Math.max(0, Math.floor(finite(input.baseSpeed ?? input.speed, 30))));
  const token = {
    id: tokenId,
    heroId,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : `Token ${ordinal + 1}`,
    color: colorPattern.test(input.color || "") ? input.color : TOKEN_COLORS[ordinal % TOKEN_COLORS.length],
    // Which side this creature fights on. Saves written before factions
    // existed carry no value, so the default has to reconstruct the intent:
    // a token with a Hero behind it is a party member, anything else is not.
    // That is exactly the ally/foe split every existing save already implies,
    // so old battles load with the sides the table always understood them to
    // have, and no schema bump is needed.
    faction: TOKEN_FACTIONS.includes(input.faction) ? input.faction : (heroId ? "ally" : "foe"),
    position: normalizePosition(input.position || input),
    hp,
    maxHp,
    // Temporary hit points sit outside the maximum on purpose: they are a
    // buffer in front of real health, not part of it, so they are not clamped
    // to maxHp and are not restored by healing.
    tempHp: Math.max(0, Math.floor(finite(input.tempHp, 0))),
    ac: Math.max(0, Math.floor(finite(input.ac, 10))),
    baseSpeed: speeds.walk,
    speeds,
    strength: Math.max(1, Math.floor(finite(input.strength, 10))),
    dexterity: Math.max(1, Math.floor(finite(input.dexterity, 10))),
    constitution: Math.max(1, Math.floor(finite(input.constitution, 10))),
    intelligence: Math.max(1, Math.floor(finite(input.intelligence, 10))),
    wisdom: Math.max(1, Math.floor(finite(input.wisdom, 10))),
    charisma: Math.max(1, Math.floor(finite(input.charisma, 10))),
    saveProficiencies: Array.isArray(input.saveProficiencies)
      ? [...new Set(input.saveProficiencies.filter((ability) => ABILITY_KEYS.includes(ability)))]
      : [],
    // Copied from the Hero when the token joined the Battle, for the same
    // reason as saveProficiencies: a skill check must be answerable from the
    // token alone, without reaching back into a Hero record that may have
    // changed since.
    skillProficiencies: Array.isArray(input.skillProficiencies)
      ? [...new Set(input.skillProficiencies.filter((skill) => SKILL_BY_ID[skill]))]
      : [],
    toolProficiencies: Array.isArray(input.toolProficiencies)
      ? [...new Set(input.toolProficiencies.filter((tool) => typeof tool === "string" && tool.trim()))]
      : [],
    level: Math.max(1, Math.min(20, Math.floor(finite(input.level, 1)))),
    // Experience this creature is worth when defeated. Monsters bring it from
    // their stat block; manual tokens are worth nothing unless told otherwise.
    xp: Math.max(0, Math.floor(finite(input.xp, 0))),
    initiativeBonus: Math.floor(finite(input.initiativeBonus)),
    size: TOKEN_SIZES.includes(input.size) ? input.size : "medium",
    attacks: normalizeTokenAttacks(input.attacks),
    attacksPerAction: Math.max(1, Math.min(MAX_ATTACKS_PER_ACTION, Math.floor(finite(input.attacksPerAction, 1)))),
    monsterId: typeof input.monsterId === "string" && input.monsterId.trim() ? input.monsterId.trim() : null,
    creatureType: typeof input.creatureType === "string" && input.creatureType.trim() ? input.creatureType.trim() : null,
    challengeRating: input.challengeRating === null || input.challengeRating === undefined || !Number.isFinite(Number(input.challengeRating))
      ? null
      : Number(input.challengeRating),
    statBlockNotes: normalizeStatBlockNotes(input.statBlockNotes),
    inventory: inventoryResult.inventory,
    coins: normalizeCoins(input.coins),
    loadout: input.loadout || { mainHand: null, offHand: null },
    armorId: typeof input.armorId === "string" ? input.armorId : null,
    shieldId: typeof input.shieldId === "string" ? input.shieldId : null,
    enchantments: input.enchantments && typeof input.enchantments === "object" ? input.enchantments : {},
    attunedItemIds: Array.isArray(input.attunedItemIds)
      ? [...new Set(input.attunedItemIds.filter((value) => typeof value === "string"))]
      : Array.isArray(input.wornItemIds) ? [...new Set(input.wornItemIds.filter((value) => typeof value === "string"))] : [],
    wornItemIds: Array.isArray(input.wornItemIds) ? [...new Set(input.wornItemIds.filter((value) => typeof value === "string"))] : [],
    itemCharges: input.itemCharges && typeof input.itemCharges === "object" && !Array.isArray(input.itemCharges) ? input.itemCharges : {},
    racialTraitIds: Array.isArray(input.racialTraitIds) ? [...new Set(input.racialTraitIds.filter((value) => typeof value === "string"))] : [],
    racialChoices: normalizeRacialChoices(input.racialChoices),
    racialUses: normalizeRacialUses(input.racialUses, input.racialTraitIds),
    darkvisionFeet: Math.max(0, Math.floor(finite(input.darkvisionFeet, 0))),
    weaponProficiencies: Array.isArray(input.weaponProficiencies) ? [...new Set(input.weaponProficiencies.filter((value) => typeof value === "string"))] : [],
    saveAdvantages: Array.isArray(input.saveAdvantages) ? [...new Set(input.saveAdvantages.filter((value) => typeof value === "string"))] : [],
    magicSaveAdvantages: Array.isArray(input.magicSaveAdvantages) ? [...new Set(input.magicSaveAdvantages.filter((value) => typeof value === "string"))] : [],
    racialExpertise: Array.isArray(input.racialExpertise) ? [...new Set(input.racialExpertise.filter((value) => value && typeof value === "object"))] : [],
    hiddenFromTokenIds: Array.isArray(input.hiddenFromTokenIds) ? [...new Set(input.hiddenFromTokenIds.filter((value) => typeof value === "string" && value.trim()))] : [],
    hidden: Array.isArray(input.hiddenFromTokenIds) && input.hiddenFromTokenIds.length > 0,
    conditions: normalizeConditions(input.conditions),
    conditionImmunities: normalizeConditionImmunities(input.conditionImmunities),
    conditionExpiries: normalizeConditionExpiries(input.conditionExpiries, input.conditions),
    // Which damage types this creature shrugs off, ignores, or suffers double
    // from. Monsters bring these from their stat block; everything else starts
    // empty, which is exactly how every save written before today behaved.
    damageResistances: normalizeDamageTypes(input.damageResistances),
    damageImmunities: normalizeDamageTypes(input.damageImmunities),
    damageVulnerabilities: normalizeDamageTypes(input.damageVulnerabilities),
    // Death saving throws. "Dying" is not stored — it is hp of zero and not
    // dead — because a third field would only be one more thing to keep
    // consistent with the other two.
    deathSaveSuccesses: Math.max(0, Math.min(DEATH_SAVES_REQUIRED, Math.floor(finite(input.deathSaveSuccesses)))),
    deathSaveFailures: Math.max(0, Math.min(DEATH_SAVES_REQUIRED, Math.floor(finite(input.deathSaveFailures)))),
    // Three rules, enforced here rather than trusted from the caller, because
    // each of the alternatives is a state the game does not have:
    //
    //   - A creature with hit points left is not dead.
    //   - Death saving throws are a player-character rule. A monster that
    //     reaches zero is simply dead, so there is no dying monster to build.
    //   - A save written before death saves existed carries no value, and in
    //     that world dropping to zero was final. Reading the absence as death
    //     keeps a reloaded Battle holding the same creatures it did, rather
    //     than quietly reviving every corpse into a casualty still in the fight.
    dead: hp > 0
      ? false
      : heroId
        ? (typeof input.dead === "boolean" ? input.dead : true)
        : true,
    // Turn-scoped states that outlive the acting creature's own turn, which is
    // why they are on the token and not on turn resources: resources exist only
    // for whoever is currently active and are discarded when the turn passes.
    // All four are cleared at the start of this creature's next turn.
    reactionSpent: Boolean(input.reactionSpent),
    dodging: Boolean(input.dodging),
    disengaging: Boolean(input.disengaging),
    // Setup marks which creatures lose their first turn. The encounter keeps a
    // snapshot of those IDs, so editing Setup after a Battle cannot rewrite an
    // encounter already in progress.
    surprised: Boolean(input.surprised),
    grappledById: typeof input.grappledById === "string" && input.grappledById.trim()
      ? input.grappledById.trim()
      : null,
    readiedAction: normalizeReadiedAction(input.readiedAction),
    // Set on the creature being helped, naming the one target the advantage
    // applies to. Help is aimed at a specific enemy, not handed out at large.
    helpedAgainstTokenId: typeof input.helpedAgainstTokenId === "string" && input.helpedAgainstTokenId.trim()
      ? input.helpedAgainstTokenId.trim()
      : null,
    // Who offered it. Needed because Help expires at the start of the helper's
    // next turn, and without this there is no way to tell whose offer it was.
    helpedById: typeof input.helpedById === "string" && input.helpedById.trim()
      ? input.helpedById.trim()
      : null,
  };
  return { ...token, ...normalizeEquipment(token, token.inventory) };
}

export const normalizeTableTokens = (tokens) =>
  (() => {
    const normalized = uniqueNormalizedRecords(tokens, (token, ordinal) =>
      normalizeTableToken(token, { id: token?.id, ordinal }));
    const tokenIds = new Set(normalized.map((token) => token.id));
    return normalized.map((token) => {
      const hiddenFromTokenIds = token.hiddenFromTokenIds.filter((tokenId) => tokenIds.has(tokenId) && tokenId !== token.id);
      return { ...token, hiddenFromTokenIds, hidden: hiddenFromTokenIds.length > 0 };
    });
  })();

export function createPlayToken({ id, ordinal = 0, name } = {}) {
  // Fanned across distinct cells near the middle of the board. The old
  // trigonometric ring produced positions between squares, and once positions
  // snap it also dropped the first several tokens onto the same cell.
  const column = clamp(Math.floor(SCENE_COLUMNS / 2) - 2 + (ordinal % 5), 0, SCENE_COLUMNS - 1);
  const row = clamp(Math.floor(SCENE_ROWS / 2) - 1 + Math.floor(ordinal / 5), 0, SCENE_ROWS - 1);
  return normalizeTableToken({
    id,
    name: name || `Token ${ordinal + 1}`,
    position: {
      xPercent: ((column + 0.5) / SCENE_COLUMNS) * 100,
      yPercent: ((row + 0.5) / SCENE_ROWS) * 100,
    },
  }, { id, ordinal });
}

export function repairGrappleLinks(tokens) {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  return tokens.map((token) => {
    if (!token.grappledById) return token;
    const grappler = byId.get(token.grappledById);
    if (token.conditions.includes("grappled") && grappler && grappler.hp > 0 && !isIncapacitated(grappler.conditions)) return token;
    const { grappled: removed, ...conditionExpiries } = token.conditionExpiries || {};
    return {
      ...token,
      conditions: token.conditions.filter((condition) => condition !== "grappled"),
      conditionExpiries,
      grappledById: null,
    };
  });
}

export const updateToken = (tokens, tokenId, patch) =>
  repairGrappleLinks(normalizeTableTokens(tokens).map((token, ordinal) =>
    token.id === tokenId
      ? normalizeTableToken({
        ...token,
        ...patch,
        ...("baseSpeed" in (patch || {}) && !("speeds" in (patch || {}))
          ? { speeds: { ...token.speeds, walk: patch.baseSpeed } }
          : {}),
      }, { id: token.id, ordinal })
      : token,
  ));

export const removeToken = (tokens, tokenId) =>
  normalizeTableTokens(tokens).filter((token) => token.id !== tokenId);

export function createManualToken({ id, ordinal = 0, position, name, ...input } = {}) {
  return normalizeTableToken({
    ...input,
    id,
    name: name || `Token ${ordinal + 1}`,
    position,
  }, { id, ordinal });
}

/**
 * A monster is a manual token that arrives filled in. Everything it carries is
 * an ordinary token field, so it stays editable afterwards and the board, the
 * initiative order and the turn tracker need to know nothing about monsters.
 */
export function createMonsterToken(monster, { id, ordinal = 0, position, name } = {}) {
  if (!monster?.id) throw new TypeError("A monster token requires a generated monster record.");
  const speedNotes = Object.entries(monster.speed || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([mode, value]) => `${mode} ${value} ft.`)
    .join(", ");
  const senseNotes = Object.entries(monster.senses || {})
    .map(([sense, value]) => `${sense.replace(/_/g, " ")} ${value}`)
    .join(", ");
  const resistances = normalizeDamageTypeList(monster.damageResistances);
  const immunities = normalizeDamageTypeList(monster.damageImmunities);
  const vulnerabilities = normalizeDamageTypeList(monster.damageVulnerabilities);
  const catalogWeaponsByName = new Map(WEAPONS.map((weapon) => [weapon.name.toLowerCase(), weapon.id]));
  const inventory = [...new Set((monster.attacks || [])
    .map((attack) => String(attack.name || "").trim().replace(/\s*\([^)]*\)\s*$/, "").toLowerCase())
    .map((attackName) => catalogWeaponsByName.get(attackName))
    .filter(Boolean))]
    .map((itemId) => ({ itemId, quantity: 1 }));
  return normalizeTableToken({
    id,
    name: name || monster.name,
    position,
    monsterId: monster.id,
    creatureType: monster.subtype ? `${monster.creatureType} (${monster.subtype})` : monster.creatureType,
    challengeRating: monster.challengeRating,
    xp: monster.xp,
    hp: monster.hp,
    maxHp: monster.hp,
    ac: monster.ac,
    baseSpeed: monster.baseSpeed,
    speeds: monster.speed,
    strength: monster.strength,
    dexterity: monster.dexterity,
    constitution: monster.constitution,
    intelligence: monster.intelligence,
    wisdom: monster.wisdom,
    charisma: monster.charisma,
    saveProficiencies: monster.saveProficiencies,
    size: monster.size,
    initiativeBonus: abilityModifier(monster.dexterity),
    attacks: monster.attacks,
    attacksPerAction: monster.attacksPerAction,
    // Generated stat blocks do not publish treasure. Only weapons explicitly
    // named by an authored attack become loot; natural attacks and inferred
    // armour never invent inventory the source did not actually name.
    inventory,
    // The plain single types the engine can run, split away from the qualified
    // prose it cannot. Both halves are kept: the ids drive the damage rules
    // below, and whatever could not be reduced to an id stays in the notes so
    // the table can still read the full stat block.
    damageResistances: resistances.applied,
    damageImmunities: immunities.applied,
    damageVulnerabilities: vulnerabilities.applied,
    conditionImmunities: monster.conditionImmunities,
    statBlockNotes: {
      multiattack: monster.multiattackNote,
      resistances: unappliedNote(resistances),
      immunities: unappliedNote(immunities),
      vulnerabilities: unappliedNote(vulnerabilities),
      conditionImmunities: (monster.conditionImmunities || []).join(", "),
      senses: [senseNotes, speedNotes && `speed ${speedNotes}`].filter(Boolean).join(" · "),
      languages: monster.languages,
      traits: monster.traits,
      otherActions: monster.otherActions,
      legendaryActions: monster.legendaryActions,
      reactions: monster.reactions,
    },
    conditions: [],
  }, { id, ordinal });
}

export function createHeroTokenSnapshot(hero, { id, ordinal = 0, position } = {}) {
  if (!hero?.id) throw new TypeError("A Hero token snapshot requires a persisted Hero.");
  const derived = deriveHero(hero);
  return normalizeTableToken({
    id,
    heroId: hero.id,
    name: hero.name,
    position,
    hp: derived.currentHp,
    maxHp: derived.hp,
    ac: derived.ac,
    baseSpeed: derived.speed,
    speeds: { walk: derived.speed },
    strength: derived.finalAbilities.str,
    dexterity: derived.finalAbilities.dex,
    constitution: derived.finalAbilities.con,
    intelligence: derived.finalAbilities.int,
    wisdom: derived.finalAbilities.wis,
    charisma: derived.finalAbilities.cha,
    saveProficiencies: hero.saveProficiencies || [],
    skillProficiencies: derived.skillProficiencies,
    toolProficiencies: derived.toolProficiencies,
    racialTraitIds: derived.traitIds,
    racialChoices: derived.racialChoices,
    racialUses: hero.racialUses,
    darkvisionFeet: derived.darkvisionFeet,
    weaponProficiencies: derived.weaponProficiencies,
    saveAdvantages: derived.saveAdvantages,
    magicSaveAdvantages: derived.magicSaveAdvantages,
    racialExpertise: derived.conditionalExpertise,
    damageResistances: derived.damageResistances,
    level: derived.level,
    initiativeBonus: derived.initiative,
    size: derived.size,
    inventory: hero.inventory,
    coins: hero.coins,
    loadout: hero.loadout,
    armorId: hero.armorId,
    shieldId: hero.shieldId,
    enchantments: hero.enchantments,
    wornItemIds: hero.wornItemIds,
    attunedItemIds: hero.attunedItemIds,
    itemCharges: hero.itemCharges,
    hiddenFromTokenIds: [],
    conditions: [],
  }, { id, ordinal });
}

const TOKEN_ABILITY_FIELD = Object.freeze({
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
});

export const tokenAbilityScore = (token, ability) =>
  Math.max(1, Math.floor(finite(token?.[TOKEN_ABILITY_FIELD[ability]], 10)));

/**
 * A token carries its own six ability scores and save proficiencies, copied
 * from the Hero when it joined the Battle. Saves are therefore readable during
 * combat without reaching back into a Hero record that may since have changed,
 * and manual tokens get real saves too.
 */
export function tokenSaveModifier(token, ability) {
  if (!ABILITY_KEYS.includes(ability)) return 0;
  const base = abilityModifier(tokenAbilityScore(token, ability));
  const proficient = (token?.saveProficiencies || []).includes(ability);
  return base
    + (proficient ? proficiencyBonus(token?.level) : 0)
    + Number(wornMagicBonuses(token).save || 0);
}

export const tokenSaveProfile = (token) => ABILITY_KEYS.map((ability) => ({
  ability,
  modifier: tokenSaveModifier(token, ability),
  proficient: (token?.saveProficiencies || []).includes(ability),
}));

export const skillById = (skillId) => SKILL_BY_ID[skillId] || null;

/**
 * A skill check is the governing ability's modifier plus the proficiency bonus
 * when the creature is trained in that skill. Worn magic items are deliberately
 * excluded — the implemented effects only cover attacks, armour class, and
 * saves, and none of them claims to help with skills.
 */
export function tokenSkillModifier(token, skillId, context = null) {
  const skill = SKILL_BY_ID[skillId];
  if (!skill) return 0;
  const base = abilityModifier(tokenAbilityScore(token, skill.ability));
  const proficient = (token?.skillProficiencies || []).includes(skill.id);
  const expertise = proficient && context && (token?.racialExpertise || []).some((entry) =>
    entry?.skillId === skill.id && entry.context === context,
  );
  return base + (proficient ? proficiencyBonus(token?.level) * (expertise ? 2 : 1) : 0);
}

export const tokenSkillProfile = (token) => SKILLS.map((skill) => ({
  id: skill.id,
  name: skill.name,
  ability: skill.ability,
  modifier: tokenSkillModifier(token, skill.id),
  proficient: (token?.skillProficiencies || []).includes(skill.id),
}));

export function derivedTokenArmorClass(token) {
  const armor = ITEM_BY_ID[token?.armorId] || null;
  const shield = ITEM_BY_ID[token?.shieldId] || null;
  return computeArmorClass({
    dexterity: token?.dexterity,
    armor,
    shield,
    armorBonus: token?.enchantments?.[token?.armorId] || 0,
    shieldBonus: token?.enchantments?.[token?.shieldId] || 0,
    acBonus: wornMagicBonuses(token).ac,
  });
}

export function applySetupTokenEquipment(tokens, tokenId, equipmentState) {
  return normalizeTableTokens(tokens).map((token, ordinal) => {
    if (token.id !== tokenId) return token;
    // `wornItemIds` was the only persisted magic-equipment switch before
    // attunement existed. Treat an explicit legacy edit as the complete
    // attunement edit too, so an old Setup inspector can still remove an item
    // from both active lists instead of leaving a stale attunement behind.
    const legacyWornEdit = Object.hasOwn(equipmentState || {}, "wornItemIds")
      && !Object.hasOwn(equipmentState || {}, "attunedItemIds");
    const normalized = normalizeTableToken({
      ...token,
      ...equipmentState,
      ...(legacyWornEdit ? { attunedItemIds: equipmentState.wornItemIds } : {}),
    }, { id: token.id, ordinal });
    return normalized.heroId
      ? { ...normalized, ac: derivedTokenArmorClass(normalized) }
      : normalized;
  });
}

export function normalizeChest(input = {}, { id } = {}) {
  const chestId = typeof input.id === "string" && input.id.trim()
    ? input.id.trim()
    : typeof id === "string" && id.trim()
      ? id.trim()
      : null;
  if (!chestId) throw new TypeError("A chest requires a stable id.");
  return {
    id: chestId,
    position: normalizePosition(input.position || input),
    inventory: normalizeInventoryEntries(input.inventory).inventory,
    coins: normalizeCoins(input.coins),
  };
}

export const normalizeChests = (chests) =>
  uniqueNormalizedRecords(chests, (chest) =>
    normalizeChest(chest, { id: chest?.id }));

export const createChest = ({ id, position, inventory = [], coins } = {}) =>
  normalizeChest({ id, position, inventory, coins }, { id });

export const updateChest = (chests, chestId, patch) =>
  normalizeChests(chests).map((chest) =>
    chest.id === chestId ? normalizeChest({ ...chest, ...patch }, { id: chest.id }) : chest,
  );

export const removeChest = (chests, chestId) =>
  normalizeChests(chests).filter((chest) => chest.id !== chestId);

export function changeChestInventory(chests, chestId, itemId, direction) {
  const chest = normalizeChests(chests).find((entry) => entry.id === chestId);
  if (!chest) return {
    ok: false,
    code: "CHEST_NOT_FOUND",
    message: "That chest is no longer on this Table.",
    recovery: "Select another chest and retry.",
    retryable: false,
  };
  const changed = changeInventory({ inventory: chest.inventory }, itemId, direction);
  if (!changed.ok) return { ...changed, recovery: "Choose an item from the Nightforge catalog.", retryable: false };
  return {
    ok: true,
    value: updateChest(chests, chestId, { inventory: changed.value.inventory }),
    item: changed.item,
    quantity: changed.quantity,
    step: changed.step,
  };
}

/**
 * The board is a fixed number of cells, not a slice of whatever the browser
 * window happens to be. Deriving the grid from the viewport meant a resize
 * silently re-mapped every stored percentage onto a different cell, and left
 * scene artwork with no size of its own. These two constants match the
 * long-standing fallback in setupGridMetrics, so a scene keeps the board it
 * was built on.
 */
export const SCENE_COLUMNS = 20;
export const SCENE_ROWS = 12;

export const MIN_GRID_SIZE = 24;
export const MAX_GRID_SIZE = 80;

export const sceneCellSize = (gridSize) =>
  clamp(Math.floor(finite(gridSize, 44)), MIN_GRID_SIZE, MAX_GRID_SIZE);

/** Pixel size of the whole board for a scene's chosen cell size. */
export function sceneWorldSize(gridSize) {
  const cellSize = sceneCellSize(gridSize);
  return {
    cellSize,
    width: cellSize * SCENE_COLUMNS,
    height: cellSize * SCENE_ROWS,
  };
}

/**
 * The viewport object every grid helper expects, built from the scene rather
 * than from the DOM so cell identity is stable across window sizes.
 */
export function sceneViewport(gridSize) {
  const { cellSize, width, height } = sceneWorldSize(gridSize);
  return { width, height, gridSize: cellSize };
}

export function setupGridMetrics({ width, height, gridSize } = {}) {
  const cellSize = Math.max(1, finite(gridSize, 44));
  const worldWidth = Math.max(cellSize, finite(width, cellSize * 20));
  const worldHeight = Math.max(cellSize, finite(height, cellSize * 12));
  return {
    cellSize,
    width: worldWidth,
    height: worldHeight,
    columns: Math.max(1, Math.floor(worldWidth / cellSize)),
    rows: Math.max(1, Math.floor(worldHeight / cellSize)),
  };
}

export function setupCellForPosition(position, viewport) {
  const metrics = setupGridMetrics(viewport);
  const normalized = rawPosition(position);
  return {
    column: Math.max(0, Math.min(metrics.columns - 1, Math.floor((normalized.xPercent / 100) * metrics.width / metrics.cellSize))),
    row: Math.max(0, Math.min(metrics.rows - 1, Math.floor((normalized.yPercent / 100) * metrics.height / metrics.cellSize))),
  };
}

export function setupPositionForCell(cell, viewport) {
  const metrics = setupGridMetrics(viewport);
  const column = Math.max(0, Math.min(metrics.columns - 1, Math.floor(finite(cell?.column))));
  const row = Math.max(0, Math.min(metrics.rows - 1, Math.floor(finite(cell?.row))));
  return {
    xPercent: ((column + 0.5) * metrics.cellSize / metrics.width) * 100,
    yPercent: ((row + 0.5) * metrics.cellSize / metrics.height) * 100,
  };
}

export const snapSetupPosition = (position, viewport) =>
  setupPositionForCell(setupCellForPosition(position, viewport), viewport);

const setupCellKey = (cell) => `${cell.column}:${cell.row}`;

export function occupiedSetupCells({ tokens = [], chests = [], exclude = null, viewport } = {}) {
  const occupied = new Set();
  for (const token of normalizeTableTokens(tokens)) {
    if (exclude?.kind === "token" && token.id === exclude.id) continue;
    occupied.add(setupCellKey(setupCellForPosition(token.position, viewport)));
  }
  for (const chest of normalizeChests(chests)) {
    if (exclude?.kind === "chest" && chest.id === exclude.id) continue;
    occupied.add(setupCellKey(setupCellForPosition(chest.position, viewport)));
  }
  return occupied;
}

export function canOccupySetupPosition(position, options = {}) {
  const occupied = occupiedSetupCells(options);
  return !occupied.has(setupCellKey(setupCellForPosition(position, options.viewport)));
}

export function findOpenSetupPosition(position, options = {}) {
  const metrics = setupGridMetrics(options.viewport);
  const desired = setupCellForPosition(position, options.viewport);
  const occupied = occupiedSetupCells(options);
  const candidates = [];
  for (let row = 0; row < metrics.rows; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) {
      candidates.push({
        column,
        row,
        distance: Math.abs(column - desired.column) + Math.abs(row - desired.row),
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance || left.row - right.row || left.column - right.column);
  const cell = candidates.find((candidate) => !occupied.has(setupCellKey(candidate)));
  return cell ? setupPositionForCell(cell, options.viewport) : null;
}

export const createTurnResources = (token) => ({
  movementMode: "walk",
  movementBase: Math.max(0, Math.floor(finite(token?.speeds?.walk, token?.baseSpeed ?? 30))),
  movementSpent: 0,
  actionSpent: false,
  actionType: null,
  bonusActionSpent: false,
  bonusActionType: null,
  // A dying creature rolls exactly once on its turn. This lives with the
  // current turn rather than on the token so it resets automatically when
  // initiative comes back around.
  deathSaveRolled: false,
  dashed: false,
  swapped: false,
  swapChoice: null,
  mainWeaponAttacked: false,
  mainAttackWeaponId: null,
  offHandAttackAvailable: false,
  offHandWeaponId: null,
  offHandAttackHand: null,
  openedChestId: null,
  openedLootTokenId: null,
  // A creature with Multiattack spends one Action across several attack rolls,
  // so the Action stays open until the allowance is used up.
  attacksMade: 0,
  attackAllowance: Math.max(1, Math.min(MAX_ATTACKS_PER_ACTION, Math.floor(finite(token?.attacksPerAction, 1)))),
});

export function normalizeTurnResources(resources, token) {
  const defaults = createTurnResources(token);
  const movementMode = MOVEMENT_MODES.includes(resources?.movementMode) && Number(token?.speeds?.[resources.movementMode]) > 0
    ? resources.movementMode
    : defaults.movementMode;
  const modeSpeed = Math.max(0, Math.floor(finite(token?.speeds?.[movementMode], token?.baseSpeed ?? 0)));
  const movementBase = Math.max(modeSpeed, Math.floor(finite(resources?.movementBase, modeSpeed)));
  const movementSpent = Math.max(0, Math.floor(finite(resources?.movementSpent)));
  const swapChoice = ["attack", "movement"].includes(resources?.swapChoice) ? resources.swapChoice : null;
  return {
    movementMode,
    movementBase,
    movementSpent,
    actionSpent: Boolean(resources?.actionSpent),
    actionType: typeof resources?.actionType === "string" && resources.actionType.trim() ? resources.actionType.trim() : null,
    bonusActionSpent: Boolean(resources?.bonusActionSpent),
    bonusActionType: typeof resources?.bonusActionType === "string" && resources.bonusActionType.trim() ? resources.bonusActionType.trim() : null,
    deathSaveRolled: Boolean(resources?.deathSaveRolled),
    dashed: Boolean(resources?.dashed),
    swapped: Boolean(resources?.swapped),
    swapChoice,
    mainWeaponAttacked: Boolean(resources?.mainWeaponAttacked),
    mainAttackWeaponId: typeof resources?.mainAttackWeaponId === "string" ? resources.mainAttackWeaponId : null,
    offHandAttackAvailable: Boolean(resources?.offHandAttackAvailable),
    offHandWeaponId: typeof resources?.offHandWeaponId === "string" ? resources.offHandWeaponId : null,
    offHandAttackHand: ["mainHand", "offHand"].includes(resources?.offHandAttackHand) ? resources.offHandAttackHand : null,
    openedChestId: typeof resources?.openedChestId === "string" && resources.openedChestId.trim()
      ? resources.openedChestId.trim()
      : null,
    openedLootTokenId: typeof resources?.openedLootTokenId === "string" && resources.openedLootTokenId.trim()
      ? resources.openedLootTokenId.trim()
      : null,
    attackAllowance: defaults.attackAllowance,
    attacksMade: Math.max(0, Math.min(defaults.attackAllowance, Math.floor(finite(resources?.attacksMade)))),
  };
}

export function normalizeBattleItem(input, tokens = []) {
  const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : null;
  if (!id) return null;
  const tokenIds = new Set(normalizeTableTokens(tokens).map((token) => token.id));
  const sourceTokenId = tokenIds.has(input.sourceTokenId) ? input.sourceTokenId : null;
  // A thrown authored attack has no catalog record behind it, so it carries its
  // own name and points back at the attack it should restore on recovery.
  const attackId = typeof input?.attackId === "string" && input.attackId.trim() ? input.attackId.trim() : null;
  const authored = Boolean(attackId);
  const item = authored ? null : ITEM_BY_ID[input?.itemId];
  if (authored) {
    // Without a living owner there is nothing to give the attack back to.
    if (!sourceTokenId) return null;
  } else if (item?.kind !== "weapon") {
    return null;
  }
  const state = input.state === "embedded" ? "embedded" : "ground";
  const carrierTokenId = state === "embedded" && tokenIds.has(input.carrierTokenId)
    ? input.carrierTokenId
    : null;
  if (state === "embedded" && !carrierTokenId) return null;
  return {
    id,
    itemId: authored ? null : item.id,
    attackId,
    name: authored
      ? (typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : "Thrown weapon")
      : item.name,
    state,
    position: state === "ground" ? normalizePosition(input.position) : null,
    carrierTokenId,
    sourceTokenId,
  };
}

export const normalizeBattleItems = (items, tokens = []) => {
  const seen = new Set();
  return Array.isArray(items)
    ? items.flatMap((item) => {
        const normalized = normalizeBattleItem(item, tokens);
        if (!normalized || seen.has(normalized.id)) return [];
        seen.add(normalized.id);
        return [normalized];
      })
    : [];
};

export function normalizeAmmoSpentByToken(input, tokens = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const tokenIds = new Set(normalizeTableTokens(tokens).map((token) => token.id));
  return Object.fromEntries(Object.entries(input).flatMap(([tokenId, ammunition]) => {
    if (!tokenIds.has(tokenId) || !ammunition || typeof ammunition !== "object" || Array.isArray(ammunition)) return [];
    const spent = Object.fromEntries(Object.entries(ammunition).flatMap(([itemId, quantity]) => {
      const item = ITEM_BY_ID[itemId];
      const normalizedQuantity = Math.max(0, Math.floor(finite(quantity)));
      return item?.kind === "ammunition" && normalizedQuantity > 0 ? [[itemId, normalizedQuantity]] : [];
    }));
    return Object.keys(spent).length ? [[tokenId, spent]] : [];
  }));
}

export const MAX_ENCOUNTER_LOG_ENTRIES = 500;
export const MAX_ENCOUNTER_LOG_ENTRY_LENGTH = 500;

export function normalizeEncounterLog(log) {
  if (!Array.isArray(log)) return [];
  const normalized = [];
  for (let index = log.length - 1; index >= 0 && normalized.length < MAX_ENCOUNTER_LOG_ENTRIES; index -= 1) {
    if (typeof log[index] === "string") {
      normalized.push(log[index].slice(0, MAX_ENCOUNTER_LOG_ENTRY_LENGTH));
    }
  }
  return normalized.reverse();
}

export const appendEncounterLog = (log, entry) =>
  normalizeEncounterLog([...normalizeEncounterLog(log), String(entry)]);

export function normalizeEncounter(encounter, tokens = []) {
  if (!encounter || !["active", "complete"].includes(encounter.status)) return null;
  const tokenIds = new Set(normalizeTableTokens(tokens).map((token) => token.id));
  const initiativeOrder = Array.isArray(encounter.initiativeOrder)
    ? [...new Set(encounter.initiativeOrder.filter((id) => tokenIds.has(id)))]
    : [];
  const initiatives = Object.fromEntries(initiativeOrder.map((tokenId) => [
    tokenId,
    Math.floor(finite(encounter.initiatives?.[tokenId])),
  ]));
  const activeIndex = Math.max(0, Math.min(Math.max(0, initiativeOrder.length - 1), Math.floor(finite(encounter.activeIndex))));
  const activeToken = normalizeTableTokens(tokens).find((token) => token.id === initiativeOrder[activeIndex]);
  const resourceInput = activeToken
    ? encounter.resources?.[activeToken.id] || encounter.resources
    : null;
  return {
    version: 1,
    status: encounter.status,
    initiativeOrder,
    initiatives,
    activeIndex,
    round: Math.max(1, Math.floor(finite(encounter.round, 1))),
    surprisedTokenIds: Array.isArray(encounter.surprisedTokenIds)
      ? [...new Set(encounter.surprisedTokenIds.filter((tokenId) => tokenIds.has(tokenId)))]
      : [],
    resources: activeToken ? { [activeToken.id]: normalizeTurnResources(resourceInput, activeToken) } : {},
    battleItems: normalizeBattleItems(encounter.battleItems, tokens),
    ammoSpentByToken: normalizeAmmoSpentByToken(encounter.ammoSpentByToken, tokens),
    ammunitionRecovered: Boolean(encounter.ammunitionRecovered),
    // Experience is handed out once, by hand, from the completion card. The
    // flag is what stops a second press from paying the party twice.
    xpAwarded: Boolean(encounter.xpAwarded),
    winnerTokenId: tokenIds.has(encounter.winnerTokenId) ? encounter.winnerTokenId : null,
    // The winning side. Set even when several creatures are left standing,
    // which is the case winnerTokenId alone cannot describe.
    winnerFaction: TOKEN_FACTIONS.includes(encounter.winnerFaction) ? encounter.winnerFaction : null,
    log: normalizeEncounterLog(encounter.log),
    setupTokens: normalizeSetupSnapshot(encounter.setupTokens, tokenIds),
  };
}

/**
 * What every token looked like the moment Battle began. Leaving a battle rolls
 * the table back to this, so a fight never leaves damage behind in Setup.
 */
export function normalizeSetupSnapshot(snapshot, tokenIds) {
  if (!snapshot || typeof snapshot !== "object") return {};
  const entries = [];
  for (const [tokenId, entry] of Object.entries(snapshot)) {
    if (!tokenIds.has(tokenId) || !entry) continue;
    entries.push([tokenId, {
      position: normalizePosition(entry.position),
      hp: Math.max(0, Math.floor(finite(entry.hp))),
    }]);
  }
  return Object.fromEntries(entries);
}

/** The token list as it should look once the encounter is thrown away. */
export function restoreSetupTokens(tokens, snapshot) {
  const restored = normalizeTableTokens(tokens);
  return restored.map((token) => {
    const saved = snapshot?.[token.id];
    return {
      ...token,
      hp: token.maxHp,
      // Temporary hit points belong to the fight that granted them. Leaving
      // them behind would carry a buffer out of an abandoned battle and into
      // the next one, which reads as a token that mysteriously has more health
      // than its sheet says.
      tempHp: 0,
      conditions: [],
      conditionExpiries: {},
      grappledById: null,
      // The dying and the dead both stand up again. An abandoned Battle did not
      // happen, so nothing that happened in it should follow a creature out.
      ...CLEARED_DEATH_STATE,
      ...CLEARED_TURN_STATE,
      position: saved ? normalizePosition(saved.position) : token.position,
      hiddenFromTokenIds: [],
      hidden: false,
      racialUses: resetRacialUses(token.racialUses, token.racialTraitIds, "long"),
    };
  });
}

export function prepareBattleStart(scene, { viewport, random = Math.random } = {}) {
  if (scene?.kind !== "battle") return {
    ok: false,
    code: "BATTLE_SCENE_REQUIRED",
    message: "Only a Battle Scene can begin an encounter.",
    recovery: "Open a Battle Scene and retry.",
    retryable: false,
  };
  if (scene.encounter) return {
    ok: false,
    code: "BATTLE_ALREADY_ACTIVE",
    message: "This encounter has already begun.",
    recovery: "Continue the current Battle or abandon it from the phase control.",
    retryable: false,
  };
  const sourceTokens = normalizeTableTokens(scene.tokens);
  if (sourceTokens.length < 2) return {
    ok: false,
    code: "BATTLE_NEEDS_TOKENS",
    message: "Battle requires at least two tokens.",
    recovery: "Add another manual or Hero token in Setup, then press Battle again.",
    retryable: true,
  };

  let snappedChests = [];
  for (const chest of normalizeChests(scene.chests)) {
    const position = findOpenSetupPosition(chest.position, { chests: snappedChests, viewport });
    if (!position) return {
      ok: false,
      code: "BATTLE_GRID_FULL",
      message: "The Table has no free grid cell for this Setup.",
      recovery: "Remove an entity or increase the available Table area before starting Battle.",
      retryable: true,
    };
    snappedChests.push({ ...chest, position });
  }

  const snappedTokens = [];
  for (const token of sourceTokens) {
    const position = findOpenSetupPosition(token.position, { tokens: snappedTokens, chests: snappedChests, viewport });
    if (!position) return {
      ok: false,
      code: "BATTLE_GRID_FULL",
      message: "The Table has no free grid cell for every token.",
      recovery: "Remove an entity or increase the available Table area before starting Battle.",
      retryable: true,
    };
    snappedTokens.push({
      ...token,
      position,
      conditions: [],
      conditionExpiries: {},
      grappledById: null,
      // A new Battle starts everyone whole, upright, and with a reaction in
      // hand. Nothing carries in from Setup or from a previous encounter.
      ...CLEARED_DEATH_STATE,
      ...CLEARED_TURN_STATE,
      // Every creature starts the encounter holding its own weapons.
      attacks: token.attacks.map((attack) => ({ ...attack, thrown: false })),
      hiddenFromTokenIds: [],
      hidden: false,
      racialUses: resetRacialUses(token.racialUses, token.racialTraitIds, "long"),
    });
  }

  const initiatives = Object.fromEntries(snappedTokens.map((token) => {
    const rolled = Math.max(0, Math.min(0.999999999999, finite(random(), 0)));
    return [token.id, Math.floor(rolled * 20) + 1 + token.initiativeBonus];
  }));
  const orderIndex = new Map(snappedTokens.map((token, index) => [token.id, index]));
  const initiativeOrder = snappedTokens
    .map((token) => token.id)
    .sort((left, right) => initiatives[right] - initiatives[left] || orderIndex.get(left) - orderIndex.get(right));
  const surprisedTokenIds = snappedTokens.filter((token) => token.surprised).map((token) => token.id);
  const surprisedSet = new Set(surprisedTokenIds);
  const firstReadyIndex = initiativeOrder.findIndex((tokenId) => !surprisedSet.has(tokenId));
  const activeIndex = firstReadyIndex < 0 ? 0 : firstReadyIndex;
  const round = firstReadyIndex < 0 ? 2 : 1;
  const firstToken = snappedTokens.find((token) => token.id === initiativeOrder[activeIndex]);
  const encounter = {
    version: 1,
    status: "active",
    initiativeOrder,
    initiatives,
    activeIndex,
    round,
    surprisedTokenIds,
    resources: firstToken ? { [firstToken.id]: createTurnResources(firstToken) } : {},
    battleItems: [],
    ammoSpentByToken: {},
    ammunitionRecovered: false,
    winnerTokenId: null,
    log: [
      `Battle began with ${snappedTokens.length} tokens.`,
      ...(surprisedTokenIds.length ? [`${surprisedTokenIds.length} surprised creature${surprisedTokenIds.length === 1 ? " loses" : "s lose"} a turn in round one.`] : []),
    ],
    setupTokens: Object.fromEntries(snappedTokens.map((token) => [token.id, { position: token.position, hp: token.hp }])),
  };
  return { ok: true, value: { tokens: snappedTokens, chests: snappedChests, encounter } };
}

const normalizeWallPoint = (point) => ({
  xPercent: finite(point?.xPercent),
  yPercent: finite(point?.yPercent),
});

export function normalizeWall(wall) {
  if (!wall || typeof wall.id !== "string" || !wall.id.trim()) return null;
  const points = Array.isArray(wall.points) ? wall.points.map(normalizeWallPoint) : [];
  if (points.length < 2) return null;
  const type = ["half", "three-quarters"].includes(wall.type) ? wall.type : "full";
  return { id: wall.id.trim(), type, points };
}

export const normalizeWalls = (walls) =>
  uniqueNormalizedRecords(walls, (wall) => normalizeWall(wall));

export function createWall({ id, type, points }) {
  const wall = normalizeWall({ id, type, points });
  if (!wall) throw new TypeError("A persisted wall requires an id and at least two points.");
  return wall;
}

/**
 * Percentages are not isotropic — the board is 20 cells wide and 12 tall, so
 * one percent across is not one percent down. Everything the Delete tool
 * measures is converted into cell units first, where distances are honest.
 */
const toCellSpace = (position) => {
  const { xPercent, yPercent } = rawPosition(position);
  return { x: (xPercent / 100) * SCENE_COLUMNS, y: (yPercent / 100) * SCENE_ROWS };
};

const distanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const along = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + along * dx), point.y - (start.y + along * dy));
};

/** Distance in grid cells from a board position to the nearest part of a wall. */
export function wallDistanceInCells(wall, position) {
  const point = toCellSpace(position);
  const points = (wall?.points || []).map(toCellSpace);
  let nearest = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, points[index - 1], points[index]));
  }
  return nearest;
}

/** Half a cell: a token fills its square, so that is the whole of its target. */
const PICK_RADIUS_CELLS = 0.5;
/** Walls are drawn thin, so they need a little slack to be clickable. */
const WALL_PICK_CELLS = 0.35;

/**
 * What sits under a pointer, topmost first: token, then chest, then wall.
 * Returns null when the pointer is over empty board.
 */
export function sceneObjectAt(position, { tokens = [], chests = [], walls = [] } = {}) {
  const target = toCellSpace(position);
  const near = (candidate) => Math.hypot(target.x - candidate.x, target.y - candidate.y) <= PICK_RADIUS_CELLS;

  for (const token of normalizeTableTokens(tokens)) {
    if (near(toCellSpace(token.position))) return { kind: "token", id: token.id };
  }
  for (const chest of normalizeChests(chests)) {
    if (near(toCellSpace(chest.position))) return { kind: "chest", id: chest.id };
  }

  let closest = null;
  for (const wall of normalizeWalls(walls)) {
    const distance = wallDistanceInCells(wall, position);
    if (distance <= WALL_PICK_CELLS && (!closest || distance < closest.distance)) {
      closest = { kind: "wall", id: wall.id, distance };
    }
  }
  return closest ? { kind: "wall", id: closest.id } : null;
}

/**
 * Everything caught inside a drag rectangle. Tokens and chests count when
 * their square is inside it; a wall counts when any of its corners is.
 */
export function sceneObjectsWithin(rectangle, { tokens = [], chests = [], walls = [] } = {}) {
  const start = rawPosition(rectangle?.start);
  const end = rawPosition(rectangle?.end);
  const left = Math.min(start.xPercent, end.xPercent);
  const right = Math.max(start.xPercent, end.xPercent);
  const top = Math.min(start.yPercent, end.yPercent);
  const bottom = Math.max(start.yPercent, end.yPercent);
  const inside = (position) => {
    const { xPercent, yPercent } = rawPosition(position);
    return xPercent >= left && xPercent <= right && yPercent >= top && yPercent <= bottom;
  };
  return {
    tokenIds: normalizeTableTokens(tokens).filter((token) => inside(token.position)).map((token) => token.id),
    chestIds: normalizeChests(chests).filter((chest) => inside(chest.position)).map((chest) => chest.id),
    wallIds: normalizeWalls(walls).filter((wall) => wall.points.some(inside)).map((wall) => wall.id),
  };
}

export function rulerDistanceFeet(start, end, { width, height, gridSize } = {}) {
  const cellSize = Math.max(1, finite(gridSize, 44));
  const cellsX = Math.max(1, finite(width, cellSize)) / cellSize;
  const cellsY = Math.max(1, finite(height, cellSize)) / cellSize;
  const startColumn = Math.floor((finite(start?.xPercent) / 100) * cellsX);
  const startRow = Math.floor((finite(start?.yPercent) / 100) * cellsY);
  const endColumn = Math.floor((finite(end?.xPercent) / 100) * cellsX);
  const endRow = Math.floor((finite(end?.yPercent) / 100) * cellsY);
  // A diagonal step costs one square, not two — the SRD's optional "every
  // diagonal is 5 ft" variant, which is what movement, attack range and
  // adjacency all already use. Summing the two axes instead would make the
  // ruler read 30 ft where an attack that measured 15 ft is legal, and the
  // only thing worse than an unruled map is a ruler that contradicts the rules.
  const crossedSquares = Math.max(Math.abs(endColumn - startColumn), Math.abs(endRow - startRow));
  return crossedSquares * 5;
}

export const midpointPercent = (start, end) => ({
  xPercent: (finite(start?.xPercent) + finite(end?.xPercent)) / 2,
  yPercent: (finite(start?.yPercent) + finite(end?.yPercent)) / 2,
});
