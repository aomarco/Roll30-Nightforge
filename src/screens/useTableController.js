import { useEffect, useMemo, useRef, useState } from "react";

import { getItem } from "../domain/catalog.js";
import { generatedId } from "../application/generatedId.js";
import {
  ATTACK_KIND_REACTION,
  attackTargetEligibility,
  bonusAttackAvailability,
  buildAttackRangeBands,
  activateHide,
  hideAvailability,
  mainAttackAvailability,
  opportunityAttacksFor,
  performWeaponAttack,
  readiedAttacksFor,
  toggleBattleCondition,
} from "../domain/attacks.js";
import {
  activateDash,
  activateDisengage,
  activateDodge,
  activateHelp,
  activateReady,
  dashAvailability,
  dodgeAvailability,
  endTurn,
  escapeGrapple,
  escapeGrappleAvailability,
  helpAvailability,
  movementMaximum,
  movementRemaining,
  forceMoveToken,
  moveActiveToken,
  performWeaponSwap,
  planActiveMovement,
  performGrapple,
  performShove,
  readyAvailability,
  releaseGrapple,
  selectMovementMode,
  swapAvailability,
} from "../domain/combat.js";
import { performAbilityCheck, performSavingThrow } from "../domain/checks.js";
import { coinsAreEmpty, formatCoins } from "../domain/money.js";
import {
  rollDeathSave,
  stabilizeAvailability,
  stabilizeCreature,
} from "../domain/death.js";
import { CONDITIONS, conditionById } from "../domain/conditions.js";
import { damageToken, healToken, healingPotionAvailability, setTemporaryHp, useHealingPotion as consumeHealingPotion } from "../domain/vitality.js";
import {
  chestCommandOptions,
  lootCommandOptions,
  openAdjacentChest,
  moveTiedInitiative,
  rerollEncounterInitiatives,
  restartCompletedBattle,
  retrievalCommandOptions,
  retrieveBattleItem,
  searchDefeatedToken,
  takeOneFromDefeatedToken,
  takeOneFromOpenChest,
  takeCoinFromDefeatedToken,
  takeCoinFromOpenChest,
  setEncounterInitiative,
} from "../domain/encounter.js";
import {
  adjustArtworkBy,
  applySetupTokenEquipment,
  canOccupySetupPosition,
  changeChestInventory,
  clientPointToPercent,
  createChest,
  createTurnResources,
  createHeroTokenSnapshot,
  createManualToken,
  createMonsterToken,
  createPlayToken,
  createWall,
  DEFAULT_CAMERA,
  DEFAULT_MAP_VIEW,
  findOpenSetupPosition,
  midpointPercent,
  normalizeCamera,
  normalizeChests,
  normalizeBattleItems,
  normalizeMapView,
  normalizeTableTokens,
  prepareBattleStart,
  removeChest,
  removeToken,
  isOnCellCentre,
  rulerDistanceFeet,
  sceneObjectAt,
  sceneObjectsWithin,
  sceneViewport,
  sceneWorldSize,
  setArtworkScale,
  setArtworkScaleAxes,
  restoreSetupTokens,
  setupCellForPosition,
  setupPositionForCell,
  snapScenePosition,
  snapSetupPosition,
  updateChest,
  updateToken,
  zoomCameraAt,
  zoomCameraAtViewportCenter,
} from "../domain/table.js";

const okay = () => ({ ok: true });
const initials = (name) => String(name || "?").slice(0, 2).toUpperCase();
const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the change."}` : "";

/**
 * Refusals during play get a short line you can read at a glance. Anything that
 * risks losing work keeps its full explanation, because there the detail is the
 * point.
 */
const BRIEF_REFUSALS = Object.freeze({
  NO_MOVEMENT_REMAINING: "Not enough movement left",
  NO_LEGAL_MOVEMENT: "No legal step there",
  PATH_UNREACHABLE: "No route to that square",
  PATH_SEARCH_LIMIT: "That route is too far to search",
  TOKEN_IMMOBILIZED: "This token cannot move",
  TOKEN_DEFEATED: "This token is down",
  NOT_ACTIVE_TOKEN: "It is not this token's turn",
  SWAP_ATTACK_LOCKS_MOVEMENT: "Attacking after a swap locks movement",
  SETUP_CELL_OCCUPIED: "That square is taken",
  SETUP_GRID_FULL: "No empty square left",
  ATTACK_OUT_OF_RANGE: "Target is out of range",
    ATTACK_LINE_BLOCKED: "A wall blocks the shot",
    ATTACK_TARGET_DEFEATED: "That target is already down",
    ATTACK_TARGET_HIDDEN: "That target is hidden from this token",
    ATTACK_TARGET_INVALID: "Choose another target",
  ATTACK_ACTION_SPENT: "Action already used",
  ATTACK_INCAPACITATED: "This token cannot attack",
  ATTACK_AFTER_DASH: "Cannot attack after Dash",
  DASH_ALREADY_USED: "Dash already used",
  DASH_ACTION_SPENT: "Action already used",
  DASH_AFTER_SWAP: "Cannot Dash after a swap",
  DASH_INCAPACITATED: "This token cannot Dash",
  TACTIC_ACTION_SPENT: "Action already used",
  TACTIC_AFTER_DASH: "Not available after Dash",
  TACTIC_AFTER_SWAP: "Not available after a swap",
  TACTIC_INCAPACITATED: "This token cannot do that",
  HELP_NO_ALLY_ADJACENT: "No ally within five feet",
  HELP_ALLY_UNREACHABLE: "That ally is out of reach",
  HELP_TARGET_INVALID: "Choose a standing enemy",
  DEATH_SAVE_STABLE: "Stable — no more saves",
  DEATH_SAVE_ALREADY_DEAD: "This token is dead",
  DEATH_SAVE_NOT_DYING: "This token is still standing",
  REACTION_ALREADY_SPENT: "Reaction already used",
  REACTION_INCAPACITATED: "This token cannot react",
  SWAP_ALREADY_USED: "Weapons already swapped",
  SWAP_AFTER_ACTION: "Action already used",
  SWAP_AFTER_DASH: "Cannot swap after Dash",
  SWAP_UNCHANGED: "Pick a different loadout",
  ILLEGAL_SWAP: "That loadout is not legal",
  BONUS_ACTION_SPENT: "Bonus Action already used",
  OFF_HAND_ATTACK_LOCKED: "No off-hand attack available",
  CHEST_NOT_ADJACENT: "Move next to the chest first",
  CHEST_ITEM_DEPLETED: "That item is gone",
  GROUND_ITEM_NOT_ADJACENT: "Move closer to pick that up",
  LIVING_CARRIER_NOT_ADJACENT: "Move next to the carrier",
  DEFEATED_CARRIER_NOT_ADJACENT: "Move next to the carrier",
  AMMUNITION_DEPLETED: "Out of ammunition",
  BATTLE_NEEDS_TOKENS: "Battle needs at least two tokens",
  BATTLE_GRID_FULL: "No room left on the board",
});

const briefRefusal = (error) => (error?.code ? BRIEF_REFUSALS[error.code] : null) || null;
const ARROW_DELTAS = Object.freeze({
  ArrowLeft: { column: -1, row: 0, xPercent: -1, yPercent: 0 },
  ArrowRight: { column: 1, row: 0, xPercent: 1, yPercent: 0 },
  ArrowUp: { column: 0, row: -1, xPercent: 0, yPercent: -1 },
  ArrowDown: { column: 0, row: 1, xPercent: 0, yPercent: 1 },
});

const healthTone = (hp, maxHp) => {
  const percentage = hp / Math.max(1, maxHp);
  if (percentage > 0.55) return "var(--hp-full)";
  if (percentage > 0.25) return "var(--hp-mid)";
  return "var(--hp-low)";
};

function useArtworkUrl(scene, artworkRepository, suppliedUrl) {
  const [state, setState] = useState({ url: suppliedUrl || null, error: null });
  useEffect(() => {
    if (suppliedUrl) {
      setState({ url: suppliedUrl, error: null });
      return undefined;
    }
    let active = true;
    let objectUrl = null;
    setState({ url: null, error: null });
    if (!scene?.artworkKey || !artworkRepository) return undefined;
    const load = async () => {
      const result = await artworkRepository.get(scene.artworkKey);
      if (!active) return;
      if (!result.ok || !(result.value instanceof Blob) || !globalThis.URL?.createObjectURL) {
        setState({
          url: null,
          error: result.ok
            ? { message: "Nightforge could not display the saved Table artwork.", recovery: "The Scene data remains safe." }
            : result,
        });
        return;
      }
      objectUrl = URL.createObjectURL(result.value);
      setState({ url: objectUrl, error: null });
    };
    load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artworkRepository, scene?.artworkKey, suppliedUrl]);
  return state;
}
function playNightforgeImpact() {
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(112, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(48, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.21);
    oscillator.addEventListener("ended", () => context.close(), { once: true });
  } catch { /* Audio is optional and never changes the combat result. */ }
}

export function useTableController({
  scene = null,
  mode = "setup",
  go = okay,
  setMode = okay,
  onUpdate = okay,
  onAwardExperience = okay,
  heroes = [],
  artworkRepository = null,
  persistence = { status: "idle", error: null },
  tokenIdFactory = () => `token-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  chestIdFactory = () => `chest-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  battleItemIdFactory = () => `battle-item-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  wallIdFactory = () => `wall-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  random = Math.random,
  initialCamera = DEFAULT_CAMERA,
  initialDrawerOpen = false,
  initialInspectorDrawer = null,
  initialTool = null,
  initialRulerDraft = null,
  initialWallDraft = null,
  initialSelectedId = undefined,
  initialSelectedChestId = null,
  initialCommandPanel = null,
  initialMovementPreview = null,
  initialSwapDraft = null,
  initialAttackDraft = null,
  initialCinematic = null,
  initialCheckCinematic = null,
  initialRetrievalCinematic = null,
  initialLootChestId = null,
  initialLootTokenId = null,
  initialMonsterBrowserOpen = false,
  initialImpact = null,
  suppliedArtworkUrl = null,
}) {
  const isPlay = scene?.kind === "play" || mode === "play";
  const isBattle = !isPlay && Boolean(scene?.encounter);
  const isActiveBattle = isBattle && scene?.encounter?.status === "active";
  const isCompleteBattle = isBattle && scene?.encounter?.status === "complete";
  const isSetup = !isPlay && !isBattle;
  const mapRef = useRef(null);
  const planeRef = useRef(null);
  const arrivalTimerRef = useRef(null);
  const cinematicTimersRef = useRef([]);
  const retrievalTimersRef = useRef([]);
  const [camera, setCamera] = useState(() => normalizeCamera(initialCamera));
  const [mapView, setMapView] = useState(() => normalizeMapView(scene?.mapView));
  const [selectedId, setSelectedId] = useState(() => initialSelectedId === undefined ? scene?.tokens?.[0]?.id || null : initialSelectedId);
  const [selectedChestId, setSelectedChestId] = useState(initialSelectedChestId);
  const [summonChoice, setSummonChoice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [activeTool, setActiveTool] = useState(initialTool);
  const [interaction, setInteraction] = useState(null);
  const [tokenPreview, setTokenPreview] = useState(null);
  const [chestPreview, setChestPreview] = useState(null);
  const [wallDraft, setWallDraft] = useState(initialWallDraft);
  const [wallHover, setWallHover] = useState(null);
  const [rulerDraft, setRulerDraft] = useState(initialRulerDraft);
  const [movementPreview, setMovementPreview] = useState(initialMovementPreview);
  const [attackDraft, setAttackDraft] = useState(initialAttackDraft);
  // Help is chosen in two halves — the ally from the command bar, the enemy off
  // the board — so it needs its own targeting mode alongside the attack one.
  const [helpDraft, setHelpDraft] = useState(null);
  const [readyDraft, setReadyDraft] = useState(null);
  const [specialDraft, setSpecialDraft] = useState(null);
  // Opportunity attacks pause movement at the departure boundary and resolve
  // one at a time through the ordinary attack cinematic.
  const [reactionQueue, setReactionQueue] = useState([]);
  const [pendingMovement, setPendingMovement] = useState(null);
  const [cinematic, setCinematic] = useState(initialCinematic);
  const [checkCinematic, setCheckCinematic] = useState(initialCheckCinematic);
  const [retrievalCinematic, setRetrievalCinematic] = useState(initialRetrievalCinematic);
  const [lootChestId, setLootChestId] = useState(initialLootChestId);
  const [lootTokenId, setLootTokenId] = useState(initialLootTokenId);
  const [impact, setImpact] = useState(initialImpact);
  const [arrivalId, setArrivalId] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [deleteMarquee, setDeleteMarquee] = useState(null);
  const [summonPickerOpen, setSummonPickerOpen] = useState(false);
  const [monsterBrowserOpen, setMonsterBrowserOpen] = useState(initialMonsterBrowserOpen);
  const artworkRef = useRef(null);
  const { url: artworkUrl, error: artworkError } = useArtworkUrl(scene, artworkRepository, suppliedArtworkUrl);
  const busy = persistence.status === "saving";
  const combatLocked = Boolean(cinematic || checkCinematic || retrievalCinematic || reactionQueue.length || pendingMovement);
  const tableTokens = useMemo(() => normalizeTableTokens(scene?.tokens), [scene?.tokens]);
  const playTokens = tableTokens;
  const chests = useMemo(() => normalizeChests(scene?.chests), [scene?.chests]);
  const battleItems = useMemo(() => normalizeBattleItems(scene?.encounter?.battleItems, scene?.tokens), [scene?.encounter?.battleItems, scene?.tokens]);
  const visibleTokens = tableTokens.map((token) => tokenPreview?.id === token.id ? { ...token, position: tokenPreview.position } : token);
  const visibleChests = chests.map((chest) => chestPreview?.id === chest.id ? { ...chest, position: chestPreview.position } : chest);
  const activeId = scene?.encounter?.initiativeOrder?.[scene?.encounter?.activeIndex || 0];
  const active = tableTokens.find((token) => token.id === activeId) || tableTokens[0] || null;
  const selected = visibleTokens.find((token) => token.id === selectedId) || null;
  const selectedChest = visibleChests.find((chest) => chest.id === selectedChestId) || null;
  const selectedChestHasContents = Boolean(selectedChest && (selectedChest.inventory.length || !coinsAreEmpty(selectedChest.coins)));
  const lootChest = chests.find((chest) => chest.id === lootChestId) || null;
  const lootBody = tableTokens.find((token) => token.id === lootTokenId) || null;
  const visibleError = localError || persistence.error || artworkError;
  const walls = scene?.walls || [];
  const wallsVisible = scene?.wallsVisible !== false;
  const canAdjustArtwork = Boolean(artworkUrl || scene?.blankCanvas);
  const sceneSize = sceneWorldSize(scene?.gridSize);
  const rulerFeet = rulerDraft
    ? rulerDistanceFeet(rulerDraft.start, rulerDraft.end, sceneViewport(scene?.gridSize))
    : 0;

  // The result is already saved before the animation starts, so skipping only
  // stops the presentation.
  const skipCinematic = () => {
    clearCinematicTimers();
    setCinematic(null);
    setImpact(null);
  };

  // A check is saved before its animation too, so skipping only stops the show.
  const skipCheckCinematic = () => {
    clearCinematicTimers();
    setCheckCinematic(null);
  };

  const clearCinematicTimers = () => {
    for (const timer of cinematicTimersRef.current) clearTimeout(timer);
    cinematicTimersRef.current = [];
  };

  const clearRetrievalTimers = () => {
    for (const timer of retrievalTimersRef.current) clearTimeout(timer);
    retrievalTimersRef.current = [];
  };

  useEffect(() => () => {
    if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current);
    clearCinematicTimers();
    clearRetrievalTimers();
  }, []);

  useEffect(() => {
    setCamera({ ...DEFAULT_CAMERA });
    setMapView(normalizeMapView(scene?.mapView));
    setSelectedId(scene?.tokens?.[0]?.id || null);
    setSelectedChestId(null);
    setSummonChoice("");
    setDrawerOpen(false);
    setActiveTool(null);
    setInteraction(null);
    setTokenPreview(null);
    setChestPreview(null);
    setWallDraft(null);
    setWallHover(null);
    setRulerDraft(null);
    setMovementPreview(null);
    setAttackDraft(null);
    setHelpDraft(null);
    setReadyDraft(null);
    setSpecialDraft(null);
    setReactionQueue([]);
    setPendingMovement(null);
    setCinematic(null);
    setRetrievalCinematic(null);
    setLootChestId(null);
    setLootTokenId(null);
    setMonsterBrowserOpen(false);
    setImpact(null);
    clearCinematicTimers();
    clearRetrievalTimers();
    setArrivalId(null);
    setLocalError(null);
  }, [scene?.id]);

  useEffect(() => {
    if (!interaction || interaction.kind !== "artwork") setMapView(normalizeMapView(scene?.mapView));
  }, [scene?.mapView?.scale, scene?.mapView?.scaleX, scene?.mapView?.scaleY, scene?.mapView?.x, scene?.mapView?.y]);

  useEffect(() => {
    setMovementPreview(null);
    setAttackDraft(null);
    setHelpDraft(null);
    setLootChestId(null);
    setLootTokenId(null);
    setInteraction((current) => current?.kind === "movement" ? null : current);
  }, [activeId]);

  // Short refusals clear themselves; anything that risks losing work stays until
  // it is read and dismissed.
  useEffect(() => {
    if (!localError || !briefRefusal(localError)) return undefined;
    const timer = setTimeout(() => setLocalError(null), 3200);
    return () => clearTimeout(timer);
  }, [localError]);

  const savePatch = (patch) => {
    if (!scene?.id) return { ok: false, message: "No active Scene is available." };
    const result = onUpdate(scene.id, patch) || okay();
    setLocalError(result.ok ? null : result);
    return result;
  };

  const finishWall = () => {
    if (!wallDraft?.points || wallDraft.points.length < 2) {
      setWallDraft(null);
      setWallHover(null);
      return { ok: true };
    }
    const wallId = generatedId("wall", wallIdFactory, walls);
    if (!wallId.ok) {
      setLocalError(wallId);
      return wallId;
    }
    const wall = createWall({ id: wallId.value, type: wallDraft.type, points: wallDraft.points });
    const result = savePatch({ walls: [...walls, wall] });
    if (result.ok) {
      setWallDraft(null);
      setWallHover(null);
    }
    return result;
  };

  const cancelWall = () => {
    setWallDraft(null);
    setWallHover(null);
  };

  const exitTool = () => {
    setActiveTool(null);
    setInteraction(null);
    setRulerDraft(null);
    cancelWall();
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (combatLocked) return;
      if (attackDraft) {
        setAttackDraft(null);
        setLocalError(null);
        return;
      }
      if (helpDraft) {
        setHelpDraft(null);
        setLocalError(null);
        return;
      }
      if (readyDraft) {
        setReadyDraft(null);
        setLocalError(null);
        return;
      }
      if (specialDraft) {
        setSpecialDraft(null);
        setLocalError(null);
        return;
      }
      if (lootChestId || lootTokenId) {
        setLootChestId(null);
        setLootTokenId(null);
        return;
      }
      if (activeTool?.startsWith("wall-") && wallDraft?.points?.length) {
        finishWall();
        return;
      }
      if (drawerOpen) setDrawerOpen(false);
      else if (activeTool) exitTool();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTool, attackDraft, combatLocked, drawerOpen, helpDraft, readyDraft, specialDraft, lootChestId, wallDraft, walls]);

  /**
   * Heal scenes saved before every path snapped. One pass when a scene opens
   * puts any stray token or chest back onto its cell centre, so an old map
   * fixes itself instead of needing every piece nudged by hand.
   */
  const healedSceneRef = useRef(null);
  useEffect(() => {
    if (!scene?.id || busy || healedSceneRef.current === scene.id) return;
    const strayTokens = tableTokens.some((token) => !isOnCellCentre(token.position));
    const strayChests = chests.some((chest) => !isOnCellCentre(chest.position));
    healedSceneRef.current = scene.id;
    if (!strayTokens && !strayChests) return;
    const patch = {};
    if (strayTokens) {
      patch.tokens = tableTokens.map((token) => ({ ...token, position: snapScenePosition(token.position) }));
    }
    if (strayChests) {
      patch.chests = chests.map((chest) => ({ ...chest, position: snapScenePosition(chest.position) }));
    }
    savePatch(patch);
  }, [scene?.id, busy]);

  const localPoint = (event) => {
    const rect = planeRef.current?.getBoundingClientRect();
    return rect ? clientPointToPercent({ x: event.clientX, y: event.clientY }, rect) : { xPercent: 50, yPercent: 50 };
  };

  const setupViewport = () => sceneViewport(scene?.gridSize);

  const setupCollisionFailure = (entity) => ({
    ok: false,
    code: "SETUP_CELL_OCCUPIED",
    message: `That grid cell is already occupied by another ${entity}.`,
    recovery: "Choose an empty cell and retry the move.",
    retryable: true,
  });

  const capturePointer = (pointerId) => {
    try { mapRef.current?.setPointerCapture?.(pointerId); } catch { /* pointer capture is optional */ }
  };

  const onMapPointerDown = (event) => {
    if (event.button !== 0 || combatLocked || attackDraft || helpDraft || readyDraft || specialDraft) return;
    const point = localPoint(event);
    if (activeTool === "terrain") {
      const cell = setupCellForPosition(point, setupViewport());
      const key = `${cell.column}:${cell.row}`;
      const current = scene?.difficultTerrain || [];
      savePatch({ difficultTerrain: current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key] });
      return;
    }
    if (["wall-full", "wall-half", "wall-three-quarters"].includes(activeTool)) {
      const type = activeTool === "wall-half" ? "half" : activeTool === "wall-three-quarters" ? "three-quarters" : "full";
      setWallDraft((current) => ({ type, points: [...(current?.type === type ? current.points : []), point] }));
      setWallHover(point);
      return;
    }
    capturePointer(event.pointerId);
    if (activeTool === "delete") {
      setInteraction({ kind: "delete", pointerId: event.pointerId, start: point });
      setDeleteMarquee({ start: point, end: point, count: 0 });
      return;
    }
    if (activeTool === "ruler") {
      const draft = { start: point, end: point };
      setRulerDraft(draft);
      setInteraction({ kind: "ruler", pointerId: event.pointerId, start: point });
      return;
    }
    if (activeTool === "artwork" && canAdjustArtwork) {
      setInteraction({ kind: "artwork", pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, mapView });
      return;
    }
    if (!activeTool) {
      setInteraction({ kind: "camera", pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, camera });
    }
  };

  const onTokenPointerDown = (event, token) => {
    if (activeTool || event.button !== 0 || combatLocked) return;
    if (attackDraft || helpDraft || readyDraft || specialDraft) {
      event.stopPropagation();
      return;
    }
    const canDrag = isPlay || isSetup || (isActiveBattle && token.id === active?.id);
    if (!canDrag) return;
    event.stopPropagation();
    setSelectedId(token.id);
    setSelectedChestId(null);
    const pointer = localPoint(event);
    capturePointer(event.pointerId);
    setInteraction({
      kind: isActiveBattle ? "movement" : "token",
      pointerId: event.pointerId,
      tokenId: token.id,
      offset: {
        xPercent: token.position.xPercent - pointer.xPercent,
        yPercent: token.position.yPercent - pointer.yPercent,
      },
    });
  };

  const onChestPointerDown = (event, chest) => {
    if (activeTool || event.button !== 0) return;
    if (isBattle) {
      event.stopPropagation();
      return;
    }
    if (!isSetup) return;
    event.stopPropagation();
    setSelectedChestId(chest.id);
    setSelectedId(null);
    const pointer = localPoint(event);
    capturePointer(event.pointerId);
    setInteraction({
      kind: "chest",
      pointerId: event.pointerId,
      chestId: chest.id,
      offset: {
        xPercent: chest.position.xPercent - pointer.xPercent,
        yPercent: chest.position.yPercent - pointer.yPercent,
      },
    });
  };

  const onTokenKeyDown = (event, token) => {
    const delta = ARROW_DELTAS[event.key];
    const canMove = !activeTool && !attackDraft && !helpDraft && !readyDraft && !specialDraft && !combatLocked &&
      (isPlay || isSetup || (isActiveBattle && token.id === active?.id));
    if (!delta || !canMove) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(token.id);
    setSelectedChestId(null);

    // Every mode steps a whole cell at a time. Play used to nudge by one
    // percentage point, which is what left tokens sitting between squares.
    const viewport = setupViewport();
    const currentCell = setupCellForPosition(token.position, viewport);
    const destination = setupPositionForCell({
      column: currentCell.column + delta.column,
      row: currentCell.row + delta.row,
    }, viewport);
    const destinationCell = setupCellForPosition(destination, viewport);
    if (destinationCell.column === currentCell.column && destinationCell.row === currentCell.row) return;

    if (isPlay) {
      savePatch({ tokens: updateToken(playTokens, token.id, { position: destination }) });
      return;
    }

    if (isSetup) {
      if (!canOccupySetupPosition(destination, {
        tokens: tableTokens,
        chests,
        exclude: { kind: "token", id: token.id },
        viewport,
      })) {
        setLocalError(setupCollisionFailure("token or chest"));
        return;
      }
      savePatch({ tokens: updateToken(tableTokens, token.id, { position: destination }) });
      return;
    }

    commitMovement(token.id, destination, viewport);
  };

  /**
   * Every committed move in Battle goes through here, so that leaving an
   * enemy's reach costs the same whether the token was dragged or walked with
   * the arrow keys.
   *
   * The opportunity attacks are worked out from the route the domain accepted,
   * against the board as it stood before the step — the reactors have not moved,
   * and the mover's path is the plan's own list of squares.
   */
  const commitMovement = (tokenId, destination, viewport) => {
    const planned = planActiveMovement(scene, tokenId, destination, viewport);
    if (!planned.ok) {
      setLocalError(planned);
      return planned;
    }
    const reactions = isActiveBattle ? opportunityAttacksFor(scene, planned.value, viewport) : [];
    if (reactions.length) {
      const departureIndex = Math.min(...reactions.map((reaction) => reaction.departureIndex));
      const interrupting = reactions
        .filter((reaction) => reaction.departureIndex === departureIndex)
        .map((reaction) => ({ ...reaction, landingPosition: planned.value.route[departureIndex] }));
      setPendingMovement({ tokenId, destination, viewport });
      if (departureIndex === 0) {
        setReactionQueue(interrupting);
        setLocalError(null);
        return { ok: true };
      }
      const partial = moveActiveToken(scene, tokenId, destination, viewport, { landingIndex: departureIndex });
      if (!partial.ok) {
        setPendingMovement(null);
        setLocalError(partial);
        return partial;
      }
      const partialSaved = savePatch(partial.value);
      if (partialSaved.ok) setReactionQueue(interrupting);
      else setPendingMovement(null);
      return partialSaved;
    }
    const moved = moveActiveToken(scene, tokenId, destination, viewport);
    if (!moved.ok) {
      setLocalError(moved);
      return moved;
    }
    const readyReactions = isActiveBattle
      ? readiedAttacksFor(scene, "target-moves", tokenId).map((entry) => ({ ...entry, landingPosition: moved.plan.landing }))
      : [];
    const saved = savePatch(moved.value);
    if (saved.ok) {
      setArrivalId(tokenId);
      if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current);
      arrivalTimerRef.current = setTimeout(() => setArrivalId(null), 520);
      if (readyReactions.length) setReactionQueue(readyReactions);
    }
    return saved;
  };

  const onChestKeyDown = (event, chest) => {
    const delta = ARROW_DELTAS[event.key];
    if (!delta || !isSetup || activeTool || combatLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedChestId(chest.id);
    setSelectedId(null);
    const viewport = setupViewport();
    const currentCell = setupCellForPosition(chest.position, viewport);
    const position = setupPositionForCell({
      column: currentCell.column + delta.column,
      row: currentCell.row + delta.row,
    }, viewport);
    const destinationCell = setupCellForPosition(position, viewport);
    if (destinationCell.column === currentCell.column && destinationCell.row === currentCell.row) return;
    if (!canOccupySetupPosition(position, {
      tokens: tableTokens,
      chests,
      exclude: { kind: "chest", id: chest.id },
      viewport,
    })) {
      setLocalError(setupCollisionFailure("token or chest"));
      return;
    }
    savePatch({ chests: updateChest(chests, chest.id, { position }) });
  };

  const onMapPointerMove = (event) => {
    const point = localPoint(event);
    if (activeTool?.startsWith("wall-") && wallDraft?.points?.length) setWallHover(point);
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "camera") {
      setCamera({
        ...interaction.camera,
        x: interaction.camera.x + event.clientX - interaction.client.x,
        y: interaction.camera.y + event.clientY - interaction.client.y,
      });
    }
    if (interaction.kind === "artwork") {
      setMapView(adjustArtworkBy(interaction.mapView, { x: event.clientX - interaction.client.x, y: event.clientY - interaction.client.y }, camera.zoom));
    }
    if (interaction.kind === "artwork-scale") {
      setMapView(artworkScaleFrom(interaction, event));
    }
    if (interaction.kind === "delete") {
      const rectangle = { start: interaction.start, end: point };
      const caught = sceneObjectsWithin(rectangle, { tokens: tableTokens, chests, walls });
      setDeleteMarquee({
        ...rectangle,
        count: caught.tokenIds.length + caught.chestIds.length + caught.wallIds.length,
      });
    }
    if (interaction.kind === "ruler") setRulerDraft({ start: interaction.start, end: point });
    if (interaction.kind === "token") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      // Snapped in every mode, so the preview shows the square the token will
      // actually land on rather than wherever the pointer happens to be.
      const position = snapSetupPosition(proposed, setupViewport());
      const blocked = isSetup && !canOccupySetupPosition(position, {
        tokens: tableTokens,
        chests,
        exclude: { kind: "token", id: interaction.tokenId },
        viewport: setupViewport(),
      });
      setTokenPreview({
        id: interaction.tokenId,
        position,
        blocked,
      });
    }
    if (interaction.kind === "chest") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      const position = snapSetupPosition(proposed, setupViewport());
      const blocked = !canOccupySetupPosition(position, {
        tokens: tableTokens,
        chests,
        exclude: { kind: "chest", id: interaction.chestId },
        viewport: setupViewport(),
      });
      setChestPreview({ id: interaction.chestId, position, blocked });
    }
    if (interaction.kind === "movement") {
      const destination = {
        xPercent: point.xPercent + interaction.offset.xPercent,
        yPercent: point.yPercent + interaction.offset.yPercent,
      };
      setMovementPreview(planActiveMovement(scene, interaction.tokenId, destination, setupViewport()));
    }
  };

  const onMapPointerUp = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = localPoint(event);
    if (interaction.kind === "artwork") {
      const finalView = adjustArtworkBy(interaction.mapView, { x: event.clientX - interaction.client.x, y: event.clientY - interaction.client.y }, camera.zoom);
      setMapView(finalView);
      savePatch({ mapView: finalView });
    }
    if (interaction.kind === "artwork-scale") {
      const next = artworkScaleFrom(interaction, event);
      setMapView(next);
      savePatch({ mapView: next });
    }
    if (interaction.kind === "delete") {
      // A short press is a click on one object; anything longer is a box.
      const dragged = Math.abs(point.xPercent - interaction.start.xPercent) > 0.8
        || Math.abs(point.yPercent - interaction.start.yPercent) > 1.3;
      if (dragged) deleteSceneObjectsWithin({ start: interaction.start, end: point });
      else deleteSceneObject(sceneObjectAt(interaction.start, { tokens: tableTokens, chests, walls }));
      setDeleteMarquee(null);
    }
    if (interaction.kind === "ruler") setRulerDraft({ start: interaction.start, end: point });
    if (interaction.kind === "token") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      const position = snapSetupPosition(proposed, setupViewport());
      if (isSetup && !canOccupySetupPosition(position, {
        tokens: tableTokens,
        chests,
        exclude: { kind: "token", id: interaction.tokenId },
        viewport: setupViewport(),
      })) setLocalError(setupCollisionFailure("token or chest"));
      else savePatch({ tokens: updateToken(tableTokens, interaction.tokenId, { position }) });
      setTokenPreview(null);
    }
    if (interaction.kind === "chest") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      const position = snapSetupPosition(proposed, setupViewport());
      if (!canOccupySetupPosition(position, {
        tokens: tableTokens,
        chests,
        exclude: { kind: "chest", id: interaction.chestId },
        viewport: setupViewport(),
      })) setLocalError(setupCollisionFailure("token or chest"));
      else savePatch({ chests: updateChest(chests, interaction.chestId, { position }) });
      setChestPreview(null);
    }
    if (interaction.kind === "movement") {
      const destination = {
        xPercent: point.xPercent + interaction.offset.xPercent,
        yPercent: point.yPercent + interaction.offset.yPercent,
      };
      commitMovement(interaction.tokenId, destination, setupViewport());
      setMovementPreview(null);
    }
    setInteraction(null);
    try { mapRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture is optional */ }
  };

  const onMapPointerCancel = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "artwork") setMapView(normalizeMapView(scene?.mapView));
    if (interaction.kind === "token") setTokenPreview(null);
    if (interaction.kind === "chest") setChestPreview(null);
    if (interaction.kind === "delete") setDeleteMarquee(null);
    if (interaction.kind === "ruler") setRulerDraft(null);
    if (interaction.kind === "movement") setMovementPreview(null);
    setInteraction(null);
    try { mapRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture is optional */ }
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setCamera((current) => zoomCameraAt(current, current.zoom + (event.deltaY < 0 ? 0.15 : -0.15), anchor));
  };

  const zoomBy = (delta) => {
    const viewport = { width: mapRef.current?.clientWidth || 0, height: mapRef.current?.clientHeight || 0 };
    setCamera((current) => zoomCameraAtViewportCenter(current, current.zoom + delta, viewport));
  };

  const chooseTool = (tool) => {
    if (tool === "artwork" && !canAdjustArtwork) return;
    const nextTool = activeTool === tool ? null : tool;
    setActiveTool(nextTool);
    if (nextTool !== "ruler") setRulerDraft(null);
    if (!nextTool?.startsWith("wall-")) cancelWall();
    setDrawerOpen(false);
  };

  /**
   * Corner handles on the backdrop, the way an image behaves in any editing
   * tool: drag the middle to move it, pull a corner to resize it. Scaling is
   * uniform about the image's own centre, so the picture never distorts.
   */
  const artworkScaleFrom = (interaction, event) => {
    if (event.shiftKey) {
      // Shift lets the two axes come apart, the way any image editor does it.
      return setArtworkScaleAxes(
        mapView,
        interaction.scaleX * (Math.abs(event.clientX - interaction.centre.x) / interaction.startX),
        interaction.scaleY * (Math.abs(event.clientY - interaction.centre.y) / interaction.startY),
      );
    }
    const distance = Math.hypot(event.clientX - interaction.centre.x, event.clientY - interaction.centre.y);
    return setArtworkScale(mapView, interaction.scale * (distance / interaction.startDistance));
  };

  const onArtworkHandleDown = (event) => {
    if (activeTool !== "artwork" || !canAdjustArtwork || event.button !== 0) return;
    event.stopPropagation();
    const rect = artworkRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    capturePointer(event.pointerId);
    setInteraction({
      kind: "artwork-scale",
      pointerId: event.pointerId,
      centre,
      startDistance: Math.max(1, Math.hypot(event.clientX - centre.x, event.clientY - centre.y)),
      startX: Math.max(1, Math.abs(event.clientX - centre.x)),
      startY: Math.max(1, Math.abs(event.clientY - centre.y)),
      scale: mapView.scale,
      scaleX: mapView.scaleX,
      scaleY: mapView.scaleY,
    });
  };

  const scaleArtwork = (delta) => {
    const next = setArtworkScale(mapView, mapView.scale + delta);
    setMapView(next);
    savePatch({ mapView: next });
  };

  const resetArtwork = () => {
    const next = { ...DEFAULT_MAP_VIEW };
    setMapView(next);
    savePatch({ mapView: next });
  };

  const addPlayToken = () => {
    const tokenId = generatedId("token", tokenIdFactory, playTokens);
    if (!tokenId.ok) {
      setLocalError(tokenId);
      return tokenId;
    }
    const token = createPlayToken({ id: tokenId.value, ordinal: playTokens.length });
    const result = savePatch({ tokens: [...playTokens, token] });
    if (result.ok) setSelectedId(token.id);
    return result;
  };

  const removeSelectedPlayToken = () => {
    if (!selected) return;
    const next = removeToken(playTokens, selected.id);
    const result = savePatch({ tokens: next });
    if (result.ok) setSelectedId(next[0]?.id || null);
  };

  /**
   * Places a token built by `build`, once a free cell and a stable id exist.
   * Heroes, blank tokens and monsters differ only in what they are built from.
   */
  const placeSetupToken = (build) => {
    const position = findOpenSetupPosition({ xPercent: 50, yPercent: 50 }, {
      tokens: tableTokens,
      chests,
      viewport: setupViewport(),
    });
    if (!position) {
      setLocalError({
        ok: false,
        code: "SETUP_GRID_FULL",
        message: "The Table has no empty cell for another token.",
        recovery: "Move or remove an existing token or chest and retry.",
        retryable: true,
      });
      return;
    }
    const tokenId = generatedId("token", tokenIdFactory, tableTokens);
    if (!tokenId.ok) {
      setLocalError(tokenId);
      return tokenId;
    }
    const id = tokenId.value;
    const token = build({ id, ordinal: tableTokens.length, position });
    const result = savePatch({ tokens: [...tableTokens, token] });
    if (result.ok) {
      setSelectedId(token.id);
      setSelectedChestId(null);
    }
    return result;
  };

  const addSetupToken = (heroChoice = summonChoice) => {
    const hero = heroes.find((entry) => entry.id === heroChoice);
    return placeSetupToken((placement) => hero
      ? createHeroTokenSnapshot(hero, placement)
      : createManualToken(placement));
  };

  const summonMonsterToken = (monster) => {
    const result = placeSetupToken((placement) => createMonsterToken(monster, placement));
    if (!result || result.ok) setMonsterBrowserOpen(false);
    return result;
  };

  const placeSetupChest = () => {
    const position = findOpenSetupPosition({ xPercent: 50, yPercent: 50 }, {
      tokens: tableTokens,
      chests,
      viewport: setupViewport(),
    });
    if (!position) {
      setLocalError({
        ok: false,
        code: "SETUP_GRID_FULL",
        message: "The Table has no empty cell for another chest.",
        recovery: "Move or remove an existing token or chest and retry.",
        retryable: true,
      });
      return;
    }
    const chestId = generatedId("chest", chestIdFactory, chests);
    if (!chestId.ok) {
      setLocalError(chestId);
      return chestId;
    }
    const chest = createChest({ id: chestId.value, position });
    const result = savePatch({ chests: [...chests, chest] });
    if (result.ok) {
      setSelectedChestId(chest.id);
      setSelectedId(null);
    }
    return result;
  };

  const saveSelectedSetupToken = (patch) => {
    if (!selected || !isSetup) return { ok: false, message: "Select an editable Setup token." };
    return savePatch({ tokens: updateToken(tableTokens, selected.id, patch) });
  };

  const applySelectedTokenEquipment = (equipmentState) => {
    if (!selected || !isSetup) return { ok: false, message: "Setup editing is unavailable during Battle." };
    return savePatch({ tokens: applySetupTokenEquipment(tableTokens, selected.id, equipmentState) });
  };

  const removeSelectedSetupToken = () => {
    if (!selected || !isSetup) return;
    const next = removeToken(tableTokens, selected.id);
    const result = savePatch({ tokens: next });
    if (result.ok) setSelectedId(next[0]?.id || null);
  };

  const changeSelectedChestItem = (itemId, direction) => {
    if (!selectedChest || !isSetup) return { ok: false, message: "Select an editable Setup chest." };
    const changed = changeChestInventory(chests, selectedChest.id, itemId, direction);
    if (!changed.ok) {
      setLocalError(changed);
      return changed;
    }
    return savePatch({ chests: changed.value });
  };

  const changeSelectedChestCoins = (coins) => {
    if (!selectedChest || !isSetup) return { ok: false, message: "Select an editable Setup chest." };
    return savePatch({ chests: updateChest(chests, selectedChest.id, { coins }) });
  };

  const removeSelectedSetupChest = () => {
    if (!selectedChest || !isSetup) return;
    removeSetupChestById(selectedChest.id);
  };

  const removeSetupTokenById = (tokenId) => {
    if (!isSetup) return;
    const next = removeToken(tableTokens, tokenId);
    const result = savePatch({ tokens: next });
    if (result.ok && selectedId === tokenId) setSelectedId(next[0]?.id || null);
  };

  const removeSetupChestById = (chestId) => {
    if (!isSetup) return;
    const next = removeChest(chests, chestId);
    const result = savePatch({ chests: next });
    if (result.ok && selectedChestId === chestId) {
      setSelectedChestId(null);
      setSelectedId(tableTokens[0]?.id || null);
    }
  };

  /**
   * The Delete tool. A click removes whatever is under the pointer; a drag
   * removes everything the box catches. Walls are included, which is the only
   * way to take one off the board — they could previously only be added.
   */
  const deleteSceneObject = (target) => {
    if (!target || !isSetup) return;
    if (target.kind === "token") removeSetupTokenById(target.id);
    else if (target.kind === "chest") removeSetupChestById(target.id);
    else if (target.kind === "wall") savePatch({ walls: walls.filter((wall) => wall.id !== target.id) });
  };

  const deleteSceneObjectsWithin = (rectangle) => {
    if (!isSetup) return;
    const caught = sceneObjectsWithin(rectangle, { tokens: tableTokens, chests, walls });
    const total = caught.tokenIds.length + caught.chestIds.length + caught.wallIds.length;
    if (!total) return;
    const patch = {};
    if (caught.tokenIds.length) patch.tokens = tableTokens.filter((token) => !caught.tokenIds.includes(token.id));
    if (caught.chestIds.length) patch.chests = chests.filter((chest) => !caught.chestIds.includes(chest.id));
    if (caught.wallIds.length) patch.walls = walls.filter((wall) => !caught.wallIds.includes(wall.id));
    const result = savePatch(patch);
    if (!result.ok) return;
    if (caught.tokenIds.includes(selectedId)) setSelectedId(null);
    if (caught.chestIds.includes(selectedChestId)) setSelectedChestId(null);
  };

  const beginBattle = () => {
    const prepared = prepareBattleStart(scene, { viewport: setupViewport(), random });
    if (!prepared.ok) {
      setLocalError(prepared);
      return prepared;
    }
    const result = savePatch(prepared.value);
    if (result.ok) {
      setSelectedId(prepared.value.encounter.initiativeOrder[0] || prepared.value.tokens[0]?.id || null);
      setSelectedChestId(null);
      setMode("battle");
    }
    return result;
  };

  /**
   * Leaving a battle throws the fight away entirely. Every token goes back to
   * full HP, no conditions and the square it stood on in Setup, so nothing a
   * battle did to a token can leak into the next one.
   */
  const abandonBattle = () => {
    const result = savePatch({
      encounter: null,
      tokens: restoreSetupTokens(tableTokens, scene?.encounter?.setupTokens),
    });
    if (result.ok) {
      setMovementPreview(null);
      setAttackDraft(null);
      setMode("setup");
    }
    return result;
  };

  const useDash = () => {
    const dashed = activateDash(scene);
    if (!dashed.ok) {
      setLocalError(dashed);
      return dashed;
    }
    return savePatch(dashed.value);
  };

  const useDodge = () => {
    const dodged = activateDodge(scene);
    if (!dodged.ok) {
      setLocalError(dodged);
      return dodged;
    }
    return savePatch(dodged.value);
  };

  const useDisengage = () => {
    const disengaged = activateDisengage(scene);
    if (!disengaged.ok) {
      setLocalError(disengaged);
      return disengaged;
    }
    return savePatch(disengaged.value);
  };

  const useHide = () => {
    const hidden = activateHide(scene, setupViewport(), { random });
    if (!hidden.ok) {
      setLocalError(hidden);
      return hidden;
    }
    return savePatch(hidden.value);
  };

  /**
   * Help needs two names, and only one of them is known when the button is
   * pressed. Choosing the ally arms a targeting mode exactly like an attack
   * does, and the enemy is picked off the board.
   */
  const startHelp = (allyTokenId) => {
    const available = helpAvailability(scene, allyTokenId, setupViewport());
    if (!available.ok) {
      setLocalError(available);
      return available;
    }
    setLocalError(null);
    setAttackDraft(null);
    setHelpDraft({ allyTokenId, allyName: available.value.ally.name });
    return available;
  };

  const confirmHelp = (targetTokenId) => {
    if (!helpDraft) return { ok: false, message: "No Help is waiting for a target." };
    const helped = activateHelp(scene, helpDraft.allyTokenId, targetTokenId, setupViewport());
    if (!helped.ok) {
      setLocalError(helped);
      return helped;
    }
    setHelpDraft(null);
    return savePatch(helped.value);
  };

  const startReady = (specification) => {
    const available = readyAvailability(scene);
    if (!available.ok) {
      setLocalError(available);
      return available;
    }
    setAttackDraft(null);
    setHelpDraft(null);
    setSpecialDraft(null);
    setReadyDraft(specification);
    setLocalError(null);
    return available;
  };

  const confirmReady = (targetTokenId) => {
    if (!readyDraft) return { ok: false, message: "No Ready Action is waiting for a target." };
    const readied = activateReady(scene, { ...readyDraft, targetTokenId });
    if (!readied.ok) {
      setLocalError(readied);
      return readied;
    }
    setReadyDraft(null);
    return savePatch(readied.value);
  };

  const startSpecialAttack = (kind) => {
    setAttackDraft(null);
    setHelpDraft(null);
    setReadyDraft(null);
    setSpecialDraft({ kind });
    setLocalError(null);
    return { ok: true };
  };

  const confirmSpecialAttack = (targetTokenId) => {
    if (!specialDraft) return { ok: false, message: "No special attack is waiting for a target." };
    const viewport = setupViewport();
    const resolved = specialDraft.kind === "grapple"
      ? performGrapple(scene, targetTokenId, viewport, { random })
      : performShove(scene, targetTokenId, specialDraft.kind === "shove-prone" ? "prone" : "push", viewport, { random });
    if (!resolved.ok) {
      setLocalError(resolved);
      return resolved;
    }
    setSpecialDraft(null);
    return savePatch(resolved.value);
  };

  const tryEscapeGrapple = () => {
    const escaped = escapeGrapple(scene, { random });
    if (!escaped.ok) {
      setLocalError(escaped);
      return escaped;
    }
    return savePatch(escaped.value);
  };

  const letGoOfGrapple = (targetTokenId) => {
    const released = releaseGrapple(scene, targetTokenId);
    if (!released.ok) {
      setLocalError(released);
      return released;
    }
    return savePatch(released.value);
  };

  const drinkPotion = (itemId, targetTokenId) => {
    const used = consumeHealingPotion(scene, itemId, targetTokenId, setupViewport(), { random });
    if (!used.ok) {
      setLocalError(used);
      return used;
    }
    return savePatch(used.value);
  };

  const changeMovementMode = (mode) => {
    const selectedMode = selectMovementMode(scene, mode);
    if (!selectedMode.ok) {
      setLocalError(selectedMode);
      return selectedMode;
    }
    return savePatch(selectedMode.value);
  };

  const rollTokenDeathSave = (tokenId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Death saving throws need an active unlocked Battle." };
    return presentCheck(rollDeathSave(scene, tokenId, { random }));
  };

  const stabilizeToken = (tokenId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Stabilising needs an active unlocked Battle." };
    return presentCheck(stabilizeCreature(scene, tokenId, setupViewport(), { random }));
  };

  const useWeaponSwap = (loadout) => {
    const swapped = performWeaponSwap(scene, loadout);
    if (!swapped.ok) {
      setLocalError(swapped);
      return swapped;
    }
    return savePatch(swapped.value);
  };

  const startAttack = (specification) => {
    const viewport = setupViewport();
    const range = buildAttackRangeBands(scene, { ...specification, viewport });
    if (!range.ok) {
      setLocalError(range);
      return range;
    }
    setAttackDraft({ ...specification, viewport, rangeModel: range.value });
    setMovementPreview(null);
    setInteraction(null);
    setLocalError(null);
    return range;
  };

  /**
   * Persist first, then animate — the same order attacks have always used, and
   * the reason a cinematic never shows a result that failed to save.
   *
   * Shared with opportunity attacks. A reaction is an ordinary attack once it
   * has been decided upon, and giving it its own animation would tell the table
   * that something different happened when nothing did.
   */
  const presentAttack = (resolved, targetId) => {
    const saved = savePatch(resolved.value);
    if (!saved.ok) return saved;
    clearCinematicTimers();
    setSelectedId(targetId);
    setSelectedChestId(null);
    setAttackDraft(null);
    setInteraction(null);
    setLocalError(null);
    setCinematic({ outcome: resolved.outcome, stage: "spin", error: null });
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    // Each beat gets long enough to read. The old sequence gave every step under
    // half a second, which is why nothing could be followed.
    const timings = reducedMotion
      ? { natural: 80, modifiers: 160, verdict: 240, damage: 320, impact: 420, close: 760 }
      : { natural: 1300, modifiers: 2400, verdict: 3800, damage: 4900, impact: 6100, close: 7800 };
    const schedule = (callback, delay) => {
      const timer = setTimeout(callback, delay);
      cinematicTimersRef.current.push(timer);
    };
    for (const stage of ["natural", "modifiers", "verdict", "damage"]) {
      schedule(() => setCinematic((current) => current ? { ...current, stage } : current), timings[stage]);
    }
    schedule(() => {
      if (resolved.outcome.hit) {
        setImpact({ targetId, damage: resolved.outcome.damage.total, critical: resolved.outcome.critical });
        playNightforgeImpact();
      }
      setCinematic((current) => current ? { ...current, stage: "impact", error: null } : current);
    }, timings.impact);
    schedule(() => {
      setCinematic(null);
      setImpact(null);
      cinematicTimersRef.current = [];
    }, timings.close);
    return resolved;
  };

  /**
   * Opportunity attacks resolve one at a time, each waiting for the last
   * cinematic to finish, so two guards swinging at the same runner read as two
   * separate events rather than one number changing twice.
   *
   * The queue is drained from an effect rather than in a loop because each
   * attack has to be saved and re-rendered before the next one is worked out —
   * the second reactor might be swinging at a creature the first one downed.
   */
  useEffect(() => {
    if (!reactionQueue.length || cinematic || checkCinematic) return;
    const [next, ...rest] = reactionQueue;
    // The parent can persist one render after this component queues the swing.
    // Wait until the mover is on the accepted landing cell so resolving from a
    // stale scene can never snap it back to where the route began.
    const viewport = setupViewport();
    const currentTarget = tableTokens.find((token) => token.id === next.targetId);
    if (!currentTarget) {
      setReactionQueue(rest);
      return;
    }
    if (next.landingPosition) {
      const currentCell = setupCellForPosition(currentTarget.position, viewport);
      const landingCell = setupCellForPosition(next.landingPosition, viewport);
      if (currentCell.column !== landingCell.column || currentCell.row !== landingCell.row) return;
    }
    const resolved = performWeaponAttack(
      scene,
      {
        kind: ATTACK_KIND_REACTION,
        reactorId: next.reactorId,
        targetId: next.targetId,
        weaponId: next.weaponId,
        hand: next.hand,
        attackId: next.attackId,
        targetPosition: next.departurePosition,
        reactionType: next.type === "ready" ? "ready" : "opportunity",
        readyTrigger: next.trigger,
        viewport,
      },
      { random, battleItemIdFactory },
    );
    setReactionQueue(rest);
    // A refusal here is not a mistake to report. The reactor may have been
    // downed by the attack before it, or lost the weapon it was going to use;
    // either way the swing simply does not happen.
    if (resolved.ok) presentAttack(resolved, next.targetId);
  }, [reactionQueue, cinematic, checkCinematic, scene, tableTokens]);

  // A voluntary move pauses on the last safe square, lets every reaction at
  // that boundary resolve, then plans the remaining route from the persisted
  // board. A lethal or immobilising reaction cancels the continuation.
  useEffect(() => {
    if (!pendingMovement || reactionQueue.length || cinematic || checkCinematic) return;
    const mover = tableTokens.find((token) => token.id === pendingMovement.tokenId);
    if (!isActiveBattle || !mover || mover.hp <= 0 || mover.dead || activeId !== mover.id) {
      setPendingMovement(null);
      return;
    }
    const continuation = pendingMovement;
    setPendingMovement(null);
    commitMovement(continuation.tokenId, continuation.destination, continuation.viewport);
  }, [pendingMovement, reactionQueue, cinematic, checkCinematic, scene, tableTokens, activeId, isActiveBattle]);

  const resolveAttackTarget = (targetId) => {
    if (!attackDraft || combatLocked) return { ok: false, message: "No attack is ready." };
    const resolved = performWeaponAttack(scene, { ...attackDraft, targetId }, { random, battleItemIdFactory });
    if (!resolved.ok) {
      setLocalError(resolved);
      return resolved;
    }
    const readyReactions = readiedAttacksFor(scene, "target-attacks", active.id);
    if (readyReactions.length) setReactionQueue((current) => [...current, ...readyReactions]);
    return presentAttack(resolved, targetId);
  };

  const openBattleChest = (chestId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Chest interaction requires an active unlocked Battle." };
    const opened = openAdjacentChest(scene, chestId, setupViewport());
    if (!opened.ok) {
      setLocalError(opened);
      return opened;
    }
    if (opened.resumed) {
      setLootChestId(chestId);
      setLocalError(null);
      return opened;
    }
    const saved = savePatch(opened.value);
    if (saved.ok) {
      setLootChestId(chestId);
      setSelectedChestId(chestId);
      setSelectedId(null);
    }
    return saved;
  };

  const takeChestItem = (itemId) => {
    if (!lootChestId || combatLocked) return { ok: false, message: "No opened chest is ready." };
    const taken = takeOneFromOpenChest(scene, lootChestId, itemId, setupViewport());
    if (!taken.ok) {
      setLocalError(taken);
      return taken;
    }
    return savePatch(taken.value);
  };

  const takeChestCoin = (denominationId) => {
    if (!lootChestId || combatLocked) return { ok: false, message: "No opened chest is ready." };
    const taken = takeCoinFromOpenChest(scene, lootChestId, denominationId, setupViewport());
    if (!taken.ok) {
      setLocalError(taken);
      return taken;
    }
    return savePatch(taken.value);
  };

  const searchBattleBody = (tokenId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Searching a body requires an active unlocked Battle." };
    const opened = searchDefeatedToken(scene, tokenId, setupViewport());
    if (!opened.ok) {
      setLocalError(opened);
      return opened;
    }
    if (opened.resumed) {
      setLootTokenId(tokenId);
      setLocalError(null);
      return opened;
    }
    const saved = savePatch(opened.value);
    if (saved.ok) {
      setLootTokenId(tokenId);
      setLootChestId(null);
    }
    return saved;
  };

  const takeBodyItem = (itemId) => {
    if (!lootTokenId || combatLocked) return { ok: false, message: "No searched body is ready." };
    const taken = takeOneFromDefeatedToken(scene, lootTokenId, itemId, setupViewport());
    if (!taken.ok) {
      setLocalError(taken);
      return taken;
    }
    return savePatch(taken.value);
  };

  const takeBodyCoin = (denominationId) => {
    if (!lootTokenId || combatLocked) return { ok: false, message: "No searched body is ready." };
    const taken = takeCoinFromDefeatedToken(scene, lootTokenId, denominationId, setupViewport());
    if (!taken.ok) {
      setLocalError(taken);
      return taken;
    }
    return savePatch(taken.value);
  };

  const resolveRetrieval = (battleItemId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Weapon retrieval requires an active unlocked Battle." };
    const resolved = retrieveBattleItem(scene, battleItemId, setupViewport(), { random });
    if (!resolved.ok) {
      setLocalError(resolved);
      return resolved;
    }
    setLootChestId(null);
    setLootTokenId(null);
    setLocalError(null);
    if (!resolved.outcome.requiresRoll) {
      const saved = savePatch(resolved.value);
      if (saved.ok) {
        setSelectedId(resolved.outcome.actorId);
        setSelectedChestId(null);
      }
      return saved;
    }
    const saved = savePatch(resolved.value);
    if (!saved.ok) return saved;
    clearRetrievalTimers();
    setRetrievalCinematic({ outcome: resolved.outcome, stage: "spin", error: null });
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const timings = reducedMotion
      ? { natural: 80, modifiers: 160, verdict: 240, impact: 340, close: 680 }
      : { natural: 420, modifiers: 820, verdict: 1220, impact: 1640, close: 2360 };
    const schedule = (callback, delay) => {
      const timer = setTimeout(callback, delay);
      retrievalTimersRef.current.push(timer);
    };
    for (const stage of ["natural", "modifiers", "verdict"]) {
      schedule(() => setRetrievalCinematic((current) => current ? { ...current, stage } : current), timings[stage]);
    }
    schedule(() => {
      setSelectedId(resolved.outcome.actorId);
      setSelectedChestId(null);
      setRetrievalCinematic((current) => current ? { ...current, stage: "impact", error: null } : current);
    }, timings.impact);
    schedule(() => {
      setRetrievalCinematic(null);
      retrievalTimersRef.current = [];
    }, timings.close);
    return resolved;
  };

  const restartBattle = () => {
    if (!isCompleteBattle || combatLocked) return { ok: false, message: "Only a completed Battle can restart." };
    const restarted = restartCompletedBattle(scene, { random });
    if (!restarted.ok) {
      setLocalError(restarted);
      return restarted;
    }
    const saved = savePatch(restarted.value);
    if (saved.ok) {
      setSelectedId(restarted.activeTokenId);
      setSelectedChestId(null);
      setLootChestId(null);
      setLootTokenId(null);
      setAttackDraft(null);
      setImpact(null);
      setMode("battle");
    }
    return saved;
  };

  const changeSelectedCondition = (conditionId, options = {}) => {
    if (!selected || !isActiveBattle || combatLocked) return { ok: false, message: "Select an active Battle token before changing conditions." };
    const changed = toggleBattleCondition(scene, selected.id, conditionId, options);
    if (!changed.ok) {
      setLocalError(changed);
      return changed;
    }
    return savePatch(changed.value);
  };

  const applyVitality = (operation) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Hit points can be changed only during an active unlocked Battle." };
    const changed = operation();
    if (!changed.ok) {
      setLocalError(changed);
      return changed;
    }
    setLocalError(null);
    return savePatch(changed.value);
  };

  const healSelected = (tokenId, amount) => applyVitality(() => healToken(scene, tokenId, amount));
  const damageSelected = (tokenId, amount, damageType = null) => applyVitality(() => damageToken(scene, tokenId, amount, damageType));
  const setSelectedTempHp = (tokenId, amount) => applyVitality(() => setTemporaryHp(scene, tokenId, amount));

  /**
   * Saves and checks share one presentation path. Neither spends a turn
   * resource and neither is restricted to the active token, because a save is
   * nearly always demanded on somebody else's turn.
   */
  const presentCheck = (rolled) => {
    if (!rolled.ok) {
      setLocalError(rolled);
      return rolled;
    }
    const saved = savePatch(rolled.value);
    if (!saved.ok) return saved;
    clearCinematicTimers();
    setLocalError(null);
    setCheckCinematic({ outcome: rolled.outcome, stage: "spin", error: null });
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const timings = reducedMotion
      ? { natural: 80, modifiers: 160, verdict: 240, close: 620 }
      : { natural: 1100, modifiers: 2100, verdict: 3200, close: 5200 };
    const schedule = (callback, delay) => {
      const timer = setTimeout(callback, delay);
      cinematicTimersRef.current.push(timer);
    };
    for (const stage of ["natural", "modifiers", "verdict"]) {
      schedule(() => setCheckCinematic((current) => current ? { ...current, stage } : current), timings[stage]);
    }
    schedule(() => { setCheckCinematic(null); cinematicTimersRef.current = []; }, timings.close);
    return rolled;
  };

  const rollTokenSave = (tokenId, ability, options = {}) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Saving throws need an active unlocked Battle." };
    return presentCheck(performSavingThrow(scene, {
      tokenId,
      ability,
      sourceTokenId: active?.id === tokenId ? null : active?.id,
      viewport: setupViewport(),
      ...options,
    }, { random }));
  };

  const rollTokenCheck = (tokenId, target = {}, options = {}) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Ability checks need an active unlocked Battle." };
    return presentCheck(performAbilityCheck(scene, { tokenId, ...target, ...options }, { random }));
  };

  const awardBattleExperience = (award) => {
    if (!isCompleteBattle || !scene?.id) return { ok: false, message: "Only a completed Battle awards experience." };
    const result = onAwardExperience(scene.id, award);
    setLocalError(result?.ok === false ? result : null);
    return result || { ok: true };
  };

  const finishTurn = () => {
    if (combatLocked) return { ok: false, code: "ATTACK_RESOLVING", message: "Finish resolving the current attack before ending the turn." };
    const readyReactions = readiedAttacksFor(scene, "target-ends-turn", active.id);
    const ended = endTurn(scene);
    if (!ended.ok) {
      setLocalError(ended);
      return ended;
    }
    const result = savePatch(ended.value);
    if (result.ok) {
      setSelectedId(ended.activeTokenId);
      setSelectedChestId(null);
      setMovementPreview(null);
      setAttackDraft(null);
      setLootChestId(null);
      setLootTokenId(null);
      setImpact(null);
      setInteraction(null);
      if (readyReactions.length) setReactionQueue((current) => [...current, ...readyReactions]);
    }
    return result;
  };

  const editInitiative = (tokenId, score) => {
    const changed = setEncounterInitiative(scene, tokenId, score);
    if (!changed.ok) { setLocalError(changed); return changed; }
    return savePatch(changed.value);
  };

  const rerollInitiative = () => {
    const changed = rerollEncounterInitiatives(scene, { random });
    if (!changed.ok) { setLocalError(changed); return changed; }
    return savePatch(changed.value);
  };

  const reorderTiedInitiative = (tokenId, direction) => {
    const changed = moveTiedInitiative(scene, tokenId, direction);
    if (!changed.ok) { setLocalError(changed); return changed; }
    return savePatch(changed.value);
  };

  const forceSelected = (tokenId, specification) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Forced movement needs an active unlocked Battle." };
    const moved = forceMoveToken(scene, tokenId, specification, setupViewport());
    if (!moved.ok) { setLocalError(moved); return moved; }
    return savePatch(moved.value);
  };

  const changeBattleCoins = (tokenId, coins) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Money can be changed only during an active unlocked Battle." };
    return savePatch({ tokens: updateToken(tableTokens, tokenId, { coins }) });
  };

  const toolLabel = activeTool === "artwork"
    ? null
    : activeTool === "wall-full"
      ? "Click points for a full wall · Escape to finish"
      : activeTool === "wall-half"
        ? "Click points for a half-wall · Escape to finish"
        : activeTool === "wall-three-quarters"
          ? "Click points for three-quarters cover · Escape to finish"
          : activeTool === "ruler"
            ? "Drag across the Table to measure"
          : activeTool === "terrain"
            ? "Click squares to paint or erase difficult terrain"
            : activeTool === "delete"
              ? "Click an object to delete it · drag a box for several"
              : null;
  const orderedTokens = isBattle
    ? (scene?.encounter?.initiativeOrder || []).map((tokenId) => tableTokens.find((token) => token.id === tokenId)).filter(Boolean)
    : tableTokens;
  const activeResources = active ? scene?.encounter?.resources?.[active.id] : null;
  const routePreview = movementPreview?.ok ? movementPreview.value : movementPreview;
  const dashState = isActiveBattle ? dashAvailability(scene) : { ok: false, message: "Battle is not active." };
  const swapState = isActiveBattle ? swapAvailability(scene) : { ok: false, message: "Battle is not active." };
  const attackState = isActiveBattle ? mainAttackAvailability(scene) : { ok: false, message: "Battle is not active." };
  const bonusState = isActiveBattle ? bonusAttackAvailability(scene) : { ok: false, message: "Battle is not active." };
  const tacticState = isActiveBattle ? dodgeAvailability(scene) : { ok: false, message: "Battle is not active." };
  const hideState = isActiveBattle ? hideAvailability(scene, setupViewport()) : { ok: false, message: "Battle is not active." };
  const readyState = isActiveBattle ? readyAvailability(scene) : { ok: false, message: "Battle is not active." };
  const battleViewport = setupViewport();
  // Asked without an ally so it comes back with the list of who is close
  // enough, which is what the Tactics panel needs to offer.
  const helpState = isActiveBattle ? helpAvailability(scene, null, battleViewport) : { ok: false, message: "Battle is not active." };
  const stabilizeState = isActiveBattle ? stabilizeAvailability(scene, null, battleViewport) : { ok: false, message: "Battle is not active." };
  const potionState = isActiveBattle ? healingPotionAvailability(scene, null, battleViewport) : { ok: false, message: "Battle is not active." };
  const grappleState = isActiveBattle ? {
    grappledTargets: tableTokens.filter((token) => token.grappledById === active?.id && token.conditions.includes("grappled")),
    escape: escapeGrappleAvailability(scene),
  } : { grappledTargets: [], escape: { ok: false } };
  const movementModes = active ? Object.entries(active.speeds || {}).flatMap(([mode, speed]) => speed > 0 ? [{ mode, speed }] : []) : [];
  const battleChestOptions = isActiveBattle ? chestCommandOptions(scene, battleViewport) : [];
  const battleRetrievalOptions = isActiveBattle ? retrievalCommandOptions(scene, battleViewport) : [];
  const battleLootOptions = isActiveBattle ? lootCommandOptions(scene, battleViewport) : [];
  const embeddedByCarrier = battleItems.filter((item) => item.state === "embedded").reduce((groups, item) => ({
    ...groups,
    [item.carrierTokenId]: [...(groups[item.carrierTokenId] || []), item],
  }), {});
  const selectedEmbedded = selected ? embeddedByCarrier[selected.id] || [] : [];
  const attackTargetStates = useMemo(() => attackDraft
    ? Object.fromEntries(tableTokens.map((token) => [token.id, attackTargetEligibility(scene, { ...attackDraft, targetId: token.id })]))
    : {}, [attackDraft, scene, tableTokens]);
  const movementMax = active && activeResources ? movementMaximum(activeResources, active) : 0;
  const movementLeft = active && activeResources ? movementRemaining(activeResources, active) : 0;


  return {
    scene,
    mode,
    go,
    setMode,
    onUpdate,
    onAwardExperience,
    heroes,
    artworkRepository,
    persistence,
    tokenIdFactory,
    chestIdFactory,
    battleItemIdFactory,
    wallIdFactory,
    random,
    initialCamera,
    initialDrawerOpen,
    initialInspectorDrawer,
    initialTool,
    initialRulerDraft,
    initialWallDraft,
    initialSelectedId,
    initialSelectedChestId,
    initialCommandPanel,
    initialMovementPreview,
    initialSwapDraft,
    initialAttackDraft,
    initialCinematic,
    initialCheckCinematic,
    initialRetrievalCinematic,
    initialLootChestId,
    initialLootTokenId,
    initialMonsterBrowserOpen,
    initialImpact,
    suppliedArtworkUrl,
    isPlay,
    isBattle,
    isActiveBattle,
    isCompleteBattle,
    isSetup,
    mapRef,
    planeRef,
    arrivalTimerRef,
    cinematicTimersRef,
    retrievalTimersRef,
    camera,
    setCamera,
    mapView,
    setMapView,
    selectedId,
    setSelectedId,
    selectedChestId,
    setSelectedChestId,
    summonChoice,
    setSummonChoice,
    drawerOpen,
    setDrawerOpen,
    activeTool,
    setActiveTool,
    interaction,
    setInteraction,
    tokenPreview,
    setTokenPreview,
    chestPreview,
    setChestPreview,
    wallDraft,
    setWallDraft,
    wallHover,
    setWallHover,
    rulerDraft,
    setRulerDraft,
    movementPreview,
    setMovementPreview,
    attackDraft,
    setAttackDraft,
    helpDraft,
    setHelpDraft,
    readyDraft,
    setReadyDraft,
    specialDraft,
    setSpecialDraft,
    reactionQueue,
    setReactionQueue,
    pendingMovement,
    setPendingMovement,
    cinematic,
    setCinematic,
    checkCinematic,
    setCheckCinematic,
    retrievalCinematic,
    setRetrievalCinematic,
    lootChestId,
    setLootChestId,
    lootTokenId,
    setLootTokenId,
    impact,
    setImpact,
    arrivalId,
    setArrivalId,
    localError,
    setLocalError,
    deleteMarquee,
    setDeleteMarquee,
    summonPickerOpen,
    setSummonPickerOpen,
    monsterBrowserOpen,
    setMonsterBrowserOpen,
    artworkRef,
    artworkUrl,
    artworkError,
    busy,
    combatLocked,
    tableTokens,
    playTokens,
    chests,
    battleItems,
    visibleTokens,
    visibleChests,
    activeId,
    active,
    selected,
    selectedChest,
    selectedChestHasContents,
    lootChest,
    lootBody,
    visibleError,
    walls,
    wallsVisible,
    canAdjustArtwork,
    sceneSize,
    rulerFeet,
    skipCinematic,
    skipCheckCinematic,
    clearCinematicTimers,
    clearRetrievalTimers,
    savePatch,
    finishWall,
    cancelWall,
    exitTool,
    healedSceneRef,
    localPoint,
    setupViewport,
    setupCollisionFailure,
    capturePointer,
    onMapPointerDown,
    onTokenPointerDown,
    onChestPointerDown,
    onTokenKeyDown,
    commitMovement,
    onChestKeyDown,
    onMapPointerMove,
    onMapPointerUp,
    onMapPointerCancel,
    onWheel,
    zoomBy,
    chooseTool,
    artworkScaleFrom,
    onArtworkHandleDown,
    scaleArtwork,
    resetArtwork,
    addPlayToken,
    removeSelectedPlayToken,
    placeSetupToken,
    addSetupToken,
    summonMonsterToken,
    placeSetupChest,
    saveSelectedSetupToken,
    applySelectedTokenEquipment,
    removeSelectedSetupToken,
    changeSelectedChestItem,
    changeSelectedChestCoins,
    removeSelectedSetupChest,
    removeSetupTokenById,
    removeSetupChestById,
    deleteSceneObject,
    deleteSceneObjectsWithin,
    beginBattle,
    abandonBattle,
    useDash,
    useDodge,
    useDisengage,
    useHide,
    startHelp,
    confirmHelp,
    startReady,
    confirmReady,
    startSpecialAttack,
    confirmSpecialAttack,
    tryEscapeGrapple,
    letGoOfGrapple,
    drinkPotion,
    changeMovementMode,
    rollTokenDeathSave,
    stabilizeToken,
    useWeaponSwap,
    startAttack,
    presentAttack,
    resolveAttackTarget,
    openBattleChest,
    takeChestItem,
    takeChestCoin,
    searchBattleBody,
    takeBodyItem,
    takeBodyCoin,
    resolveRetrieval,
    restartBattle,
    changeSelectedCondition,
    applyVitality,
    healSelected,
    damageSelected,
    setSelectedTempHp,
    presentCheck,
    rollTokenSave,
    rollTokenCheck,
    awardBattleExperience,
    finishTurn,
    editInitiative,
    rerollInitiative,
    reorderTiedInitiative,
    forceSelected,
    changeBattleCoins,
    toolLabel,
    orderedTokens,
    activeResources,
    routePreview,
    dashState,
    swapState,
    attackState,
    bonusState,
    tacticState,
    hideState,
    readyState,
    battleViewport,
    helpState,
    stabilizeState,
    potionState,
    grappleState,
    movementModes,
    battleChestOptions,
    battleRetrievalOptions,
    battleLootOptions,
    embeddedByCarrier,
    selectedEmbedded,
    attackTargetStates,
    movementMax,
    movementLeft,
  };
}
