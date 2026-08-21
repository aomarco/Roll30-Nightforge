import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleDot,
  ArchiveRestore,
  Eye,
  EyeOff,
  Grid3x3,
  Hammer,
  Home,
  Minus,
  Move,
  Package,
  PackageOpen,
  PenLine,
  Plus,
  RotateCcw,
  Ruler,
  ShieldHalf,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Wind,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { getItem } from "../domain/catalog.js";
import { generatedId } from "../application/generatedId.js";
import {
  attackTargetEligibility,
  bonusAttackAvailability,
  buildAttackRangeBands,
  mainAttackAvailability,
  performWeaponAttack,
  toggleBattleCondition,
} from "../domain/attacks.js";
import {
  activateDash,
  dashAvailability,
  endTurn,
  movementMaximum,
  movementRemaining,
  moveActiveToken,
  performWeaponSwap,
  planActiveMovement,
  swapAvailability,
} from "../domain/combat.js";
import { performAbilityCheck, performSavingThrow } from "../domain/checks.js";
import { CONDITIONS, conditionById } from "../domain/conditions.js";
import { damageToken, healToken, setTemporaryHp } from "../domain/vitality.js";
import {
  chestCommandOptions,
  lootCommandOptions,
  openAdjacentChest,
  restartCompletedBattle,
  retrievalCommandOptions,
  retrieveBattleItem,
  searchDefeatedToken,
  takeOneFromDefeatedToken,
  takeOneFromOpenChest,
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
import { Pip } from "../ui/Glyphs.jsx";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import BattleSetupInspector from "./BattleSetupInspector.jsx";
import BattleTokenInspector from "./BattleTokenInspector.jsx";
import AttackCinematic from "./AttackCinematic.jsx";
import CheckCinematic from "./CheckCinematic.jsx";
import BattleCompletion from "./BattleCompletion.jsx";
import ChestLootDrawer from "./ChestLootDrawer.jsx";
import CommandBar from "./CommandBar.jsx";
import MonsterBrowser from "./MonsterBrowser.jsx";
import SceneObjects from "./SceneObjects.jsx";
import SetupRail from "./SetupRail.jsx";
import RetrievalCinematic from "./RetrievalCinematic.jsx";

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
  ATTACK_TARGET_INVALID: "Choose another target",
  ATTACK_ACTION_SPENT: "Action already used",
  ATTACK_INCAPACITATED: "This token cannot attack",
  ATTACK_AFTER_DASH: "Cannot attack after Dash",
  DASH_ALREADY_USED: "Dash already used",
  DASH_ACTION_SPENT: "Action already used",
  DASH_AFTER_SWAP: "Cannot Dash after a swap",
  DASH_INCAPACITATED: "This token cannot Dash",
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

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

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

function WallAndRulerLayer({ walls, wallsVisible, wallDraft, wallHover, rulerDraft, rulerFeet }) {
  const draftPoints = wallDraft?.points?.length
    ? [...wallDraft.points, ...(wallHover ? [wallHover] : [])]
    : [];
  const midpoint = rulerDraft ? midpointPercent(rulerDraft.start, rulerDraft.end) : null;
  return (
    <>
      <svg className="nf-state-table-geometry" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {wallsVisible && walls.map((wall) => (
          <polyline
            key={wall.id}
            className={`nf-state-table-wall nf-state-table-wall-${wall.type}`}
            points={wall.points.map((point) => `${point.xPercent},${point.yPercent}`).join(" ")}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {draftPoints.length > 1 && (
          <polyline
            className={`nf-state-table-wall nf-state-table-wall-${wallDraft.type} nf-state-table-wall-draft`}
            points={draftPoints.map((point) => `${point.xPercent},${point.yPercent}`).join(" ")}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {rulerDraft && (
          <line
            className="nf-state-table-ruler-line"
            x1={rulerDraft.start.xPercent}
            y1={rulerDraft.start.yPercent}
            x2={rulerDraft.end.xPercent}
            y2={rulerDraft.end.yPercent}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {midpoint && (
        <span className="nf-state-table-ruler-label tag tag-brass numeral" style={{ left: `${midpoint.xPercent}%`, top: `${midpoint.yPercent}%` }}>
          {rulerFeet} ft
        </span>
      )}
    </>
  );
}

function MovementRouteLayer({ preview, boardSize }) {
  if (!preview?.route?.length) return null;
  const reachable = preview.route.slice(0, (preview.reachableIndex || 0) + 1);
  const over = preview.route.slice(preview.reachableIndex || 0);
  const points = (route) => route.map((point) => `${point.xPercent},${point.yPercent}`).join(" ");
  const start = preview.route[0];
  const landingIndex = preview.landingIndex || 0;
  const landing = preview.route[landingIndex] || start;
  const approach = preview.route[Math.max(0, landingIndex - 1)] || start;
  // The layer is stretched, so percentages are converted to board pixels before
  // any angle or radius is computed. Drawn in pixels, a circle stays a circle
  // and the arrowhead keeps pointing the way the token is actually travelling.
  const toPixels = (point) => ({
    x: (point.xPercent / 100) * boardSize.width,
    y: (point.yPercent / 100) * boardSize.height,
  });
  const startPixel = toPixels(start);
  const landingPixel = toPixels(landing);
  const approachPixel = toPixels(approach);
  const angle = Math.atan2(landingPixel.y - approachPixel.y, landingPixel.x - approachPixel.x) * 180 / Math.PI;
  return (
    <>
      <svg className="nf-state-table-movement-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {reachable.length > 1 && <polyline className="nf-state-table-movement-reachable" points={points(reachable)} fill="none" vectorEffect="non-scaling-stroke" />}
        {over.length > 1 && <polyline className="nf-state-table-movement-over" points={points(over)} fill="none" vectorEffect="non-scaling-stroke" />}
      </svg>
      <svg
        className="nf-state-table-movement-marks"
        viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
        aria-hidden="true"
      >
        <circle className="nf-state-table-movement-start" cx={startPixel.x} cy={startPixel.y} r="5" />
        {landingIndex > 0 && (
          <path
            className="nf-state-table-movement-stop"
            d="M 0 0 L -14 -8 L -9 0 L -14 8 Z"
            transform={`translate(${landingPixel.x} ${landingPixel.y}) rotate(${angle})`}
          />
        )}
      </svg>
      <span className={`nf-state-table-movement-label tag numeral${preview.overBudget ? " nf-state-table-movement-label-over" : ""}`} style={{ left: `${landing.xPercent}%`, top: `${landing.yPercent}%` }}>
        {preview.costFeet} ft{preview.overBudget ? " · limit" : ""}
      </span>
    </>
  );
}

function AttackRangeLayer({ model }) {
  if (!model?.bands?.length) return null;
  return (
    <svg className="nf-state-table-attack-range" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {[["green", "rgba(71,216,162,.16)"], ["yellow", "rgba(224,176,85,.15)"], ["red", "rgba(242,97,122,.14)"]].map(([tone, fill]) => (
          <pattern id={`nf-attack-${tone}`} key={tone} width={model.cellWidthPercent} height={model.cellHeightPercent} patternUnits="userSpaceOnUse">
            <rect width={model.cellWidthPercent} height={model.cellHeightPercent} fill={fill} />
            <path d={`M ${model.cellWidthPercent} 0 L 0 0 0 ${model.cellHeightPercent}`} fill="none" className="nf-state-table-attack-grid-line" vectorEffect="non-scaling-stroke" />
          </pattern>
        ))}
      </defs>
      {model.bands.map((band) => <path key={band.id} className={`nf-state-table-attack-band nf-state-table-attack-${band.tone}`} d={band.path} fill={`url(#nf-attack-${band.tone})`} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
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

function TableToolsDrawer({
  isPlay,
  camera,
  mapView,
  activeTool,
  wallDraft,
  wallsVisible,
  canAdjustArtwork,
  busy,
  error,
  close,
  zoomBy,
  resetCamera,
  chooseTool,
  scaleArtwork,
  resetArtwork,
  finishWall,
  cancelWall,
  toggleWalls,
  exitTool,
}) {
  const dialogRef = useDialogA11y({ onClose: close });
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside ref={dialogRef} className="drawer nf-state-dialog nf-state-table-tools-drawer" role="dialog" aria-modal="true" aria-labelledby="table-tools-title" tabIndex={-1}>
        <div className="drawer-top">
          <div><span className="kicker kicker-brass">Table instruments</span><h2 id="table-tools-title">Table tools</h2></div>
          <button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="drawer-body">
          {error && <div className="nf-state-inline-error" role="alert"><strong>Table change not saved</strong><span>{errorText(error)}</span></div>}
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Camera</span><span className="tag numeral">{Math.round(camera.zoom * 100)}%</span></div>
            <div className="nf-state-table-tools-grid">
              <button className="btn btn-line" onClick={() => zoomBy(-0.2)}><ZoomOut size={15} /> Zoom out</button>
              <button className="btn btn-line" onClick={() => zoomBy(0.2)}><ZoomIn size={15} /> Zoom in</button>
              <button className="btn btn-line nf-state-table-tools-wide" onClick={resetCamera}><RotateCcw size={15} /> Reset camera</button>
            </div>
          </section>
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Artwork</span><span className="tag numeral">{Math.round(mapView.scale * 100)}%</span></div>
            <button className={`btn btn-wide ${activeTool === "artwork" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("artwork")} disabled={!canAdjustArtwork} title={canAdjustArtwork ? "Drag the Table to align its artwork" : "Add Scene artwork or choose White Canvas first"}><Move size={15} /> {activeTool === "artwork" ? "Adjusting artwork" : "Adjust artwork"}</button>
            <div className="nf-state-table-tools-grid">
              <button className="btn btn-line" onClick={() => scaleArtwork(-0.1)} disabled={!canAdjustArtwork || busy}><Minus size={15} /> Scale down</button>
              <button className="btn btn-line" onClick={() => scaleArtwork(0.1)} disabled={!canAdjustArtwork || busy}><Plus size={15} /> Scale up</button>
              <button className="btn btn-line nf-state-table-tools-wide" onClick={resetArtwork} disabled={!canAdjustArtwork || busy}><RotateCcw size={15} /> Reset artwork transform</button>
            </div>
          </section>
          {!isPlay && (
            <section className="unit">
              <div className="unit-top"><span className="unit-label">Battle geometry</span><span className="tag">{wallsVisible ? "Visible" : "Hidden"}</span></div>
              <div className="nf-state-table-tools-grid">
                <button className={`btn ${activeTool === "wall-full" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("wall-full")}><PenLine size={15} /> Draw full wall</button>
                <button className={`btn ${activeTool === "wall-half" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("wall-half")}><PenLine size={15} /> Draw half-wall</button>
                <button className={`btn ${activeTool === "ruler" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("ruler")}><Ruler size={15} /> Ruler</button>
                <button className="btn btn-line" onClick={toggleWalls} disabled={busy}>{wallsVisible ? <EyeOff size={15} /> : <Eye size={15} />}{wallsVisible ? "Hide walls" : "Show walls"}</button>
              </div>
              {activeTool?.startsWith("wall-") && (
                <div className="nf-state-table-tools-grid">
                  <button className="btn btn-line" onClick={cancelWall} disabled={!wallDraft?.points?.length}>Cancel wall</button>
                  <button className="btn btn-key" onClick={finishWall} disabled={(wallDraft?.points?.length || 0) < 2}>Finish wall</button>
                </div>
              )}
            </section>
          )}
          <section className="unit">
            <button className="btn btn-line btn-wide" onClick={exitTool} disabled={!activeTool}><X size={15} /> Exit current tool</button>
          </section>
        </div>
        <div className="drawer-foot"><button className="btn btn-key" onClick={close}>Done</button></div>
      </aside>
    </PortalLayer>
  );
}

export default function TableScreen({
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
  const combatLocked = Boolean(cinematic || checkCinematic || retrievalCinematic);
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
  }, [activeTool, attackDraft, combatLocked, drawerOpen, lootChestId, wallDraft, walls]);

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
    if (event.button !== 0 || combatLocked || attackDraft) return;
    const point = localPoint(event);
    if (activeTool === "wall-full" || activeTool === "wall-half") {
      const type = activeTool === "wall-half" ? "half" : "full";
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
    if (attackDraft) {
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
    const canMove = !activeTool && !attackDraft && !combatLocked &&
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

    const moved = moveActiveToken(scene, token.id, destination, viewport);
    if (!moved.ok) {
      setLocalError(moved);
      return;
    }
    const saved = savePatch(moved.value);
    if (saved.ok) {
      setArrivalId(token.id);
      if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current);
      arrivalTimerRef.current = setTimeout(() => setArrivalId(null), 520);
    }
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
      const moved = moveActiveToken(scene, interaction.tokenId, destination, setupViewport());
      if (!moved.ok) setLocalError(moved);
      else {
        const saved = savePatch(moved.value);
        if (saved.ok) {
          setArrivalId(interaction.tokenId);
          if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current);
          arrivalTimerRef.current = setTimeout(() => setArrivalId(null), 520);
        }
      }
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

  const resolveAttackTarget = (targetId) => {
    if (!attackDraft || combatLocked) return { ok: false, message: "No attack is ready." };
    const resolved = performWeaponAttack(scene, { ...attackDraft, targetId }, { random, battleItemIdFactory });
    if (!resolved.ok) {
      setLocalError(resolved);
      return resolved;
    }
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

  const changeSelectedCondition = (conditionId) => {
    if (!selected || !isActiveBattle || combatLocked) return { ok: false, message: "Select an active Battle token before changing conditions." };
    const changed = toggleBattleCondition(scene, selected.id, conditionId);
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
  const damageSelected = (tokenId, amount) => applyVitality(() => damageToken(scene, tokenId, amount));
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
    return presentCheck(performSavingThrow(scene, { tokenId, ability, ...options }, { random }));
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
    }
    return result;
  };

  const toolLabel = activeTool === "artwork"
    ? null
    : activeTool === "wall-full"
      ? "Click points for a full wall · Escape to finish"
      : activeTool === "wall-half"
        ? "Click points for a half-wall · Escape to finish"
        : activeTool === "ruler"
          ? "Drag across the Table to measure"
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
  const battleViewport = setupViewport();
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

  return (
    <div className={`table nf-state-table-root${busy ? " nf-state-busy" : ""}${combatLocked ? " nf-state-combat-locked" : ""}${isCompleteBattle ? " nf-state-battle-complete-root" : ""}`}>
      <div
        className={`map nf-state-table-map${activeTool ? ` nf-state-table-tool-${activeTool}` : ""}${attackDraft ? " nf-state-table-attack-mode" : ""}`}
        ref={mapRef}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerCancel}
        onWheel={onWheel}
      >
        <div className="map-wash" aria-hidden="true" />
        <div
          className="nf-state-table-world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          <div
            className="nf-state-table-plane"
            ref={planeRef}
            style={{
              width: `${sceneSize.width}px`,
              height: `${sceneSize.height}px`,
              "--nf-grid-size": `${sceneSize.cellSize}px`,
              "--nf-grid-major": `${sceneSize.cellSize * 5}px`,
            }}
          >
            {(artworkUrl || scene?.blankCanvas) && (
              <div ref={artworkRef} className={`nf-state-table-artwork${activeTool === "artwork" ? " nf-state-table-artwork-editing" : ""}`} style={{ transform: `translate(${mapView.x}px, ${mapView.y}px) ${mapView.scaleX !== undefined && mapView.scaleY !== undefined && (mapView.scaleX !== mapView.scale || mapView.scaleY !== mapView.scale) ? `scale(${mapView.scaleX}, ${mapView.scaleY})` : `scale(${mapView.scale})`}`, backgroundColor: scene?.blankCanvas ? "#fff" : undefined }}>
                {artworkUrl && <img src={artworkUrl} alt="" draggable="false" />}
                {activeTool === "artwork" && ["nw", "ne", "se", "sw"].map((corner) => (
                  <span
                    className={`nf-state-table-artwork-handle nf-state-table-artwork-handle-${corner}`}
                    key={corner}
                    onPointerDown={onArtworkHandleDown}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
            {deleteMarquee && (
              <div
                className="nf-state-table-marquee"
                style={{
                  left: `${Math.min(deleteMarquee.start.xPercent, deleteMarquee.end.xPercent)}%`,
                  top: `${Math.min(deleteMarquee.start.yPercent, deleteMarquee.end.yPercent)}%`,
                  width: `${Math.abs(deleteMarquee.end.xPercent - deleteMarquee.start.xPercent)}%`,
                  height: `${Math.abs(deleteMarquee.end.yPercent - deleteMarquee.start.yPercent)}%`,
                }}
                aria-hidden="true"
              >
                {deleteMarquee.count > 0 && (
                  <span className="nf-state-table-marquee-count numeral">
                    {deleteMarquee.count} object{deleteMarquee.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
            {!isPlay && <div className="map-grid nf-state-table-scene-grid" aria-hidden="true" />}
            <div className="map-fog" aria-hidden="true" />
            <WallAndRulerLayer walls={walls} wallsVisible={wallsVisible} wallDraft={wallDraft} wallHover={wallHover} rulerDraft={rulerDraft} rulerFeet={rulerFeet} />
            {isActiveBattle && <MovementRouteLayer preview={routePreview} boardSize={sceneSize} />}
            {isActiveBattle && attackDraft && <AttackRangeLayer model={attackDraft.rangeModel} />}
            {!isPlay && visibleChests.map((chest) => {
              const option = battleChestOptions.find((entry) => entry.chest.id === chest.id);
              const canOpen = Boolean(option?.availability.ok);
              const count = chest.inventory.reduce((total, entry) => total + entry.quantity, 0);
              return <button
                key={chest.id}
                className={`nf-state-table-chest${selectedChestId === chest.id ? " on" : ""}${chestPreview?.id === chest.id && chestPreview.blocked ? " blocked" : ""}${canOpen ? " nf-state-table-chest-eligible" : ""}${count === 0 ? " nf-state-table-chest-empty" : ""}`}
                style={{ left: `${chest.position.xPercent}%`, top: `${chest.position.yPercent}%` }}
                onPointerDown={(event) => onChestPointerDown(event, chest)}
                onKeyDown={(event) => onChestKeyDown(event, chest)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isActiveBattle && canOpen) openBattleChest(chest.id);
                  else { setSelectedChestId(chest.id); setSelectedId(null); }
                }}
                aria-label={isActiveBattle ? canOpen ? `Open adjacent chest with ${count} items` : `Chest unavailable: ${option?.availability.message || "Battle is complete"}` : `Chest with ${count} items, use arrow keys to move`}
              >
                <Package size={18} />
                <span className="nf-state-table-chest-count numeral">{count}</span>
              </button>;
            })}
            {isBattle && battleItems.map((battleItem) => {
              const carrier = battleItem.carrierTokenId ? visibleTokens.find((token) => token.id === battleItem.carrierTokenId) : null;
              const position = battleItem.state === "embedded" ? carrier?.position : battleItem.position;
              if (!position) return null;
              const option = battleRetrievalOptions.find((entry) => entry.battleItem.id === battleItem.id);
              const eligible = Boolean(option?.availability.ok);
              const weapon = getItem(battleItem.itemId);
              return <button
                key={battleItem.id}
                type="button"
                className={`nf-state-battle-item nf-state-battle-item-${battleItem.state}${eligible ? " nf-state-battle-item-eligible" : ""}`}
                style={{ left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); if (eligible) resolveRetrieval(battleItem.id); }}
                disabled={!eligible || combatLocked}
                title={eligible ? `${option.availability.value.cost === "free" ? "Free" : "Bonus Action"} retrieval` : option?.availability.message || "Battle is complete"}
                aria-label={`${weapon?.name || battleItem.itemId} ${battleItem.state}${eligible ? ", retrieve" : ", unavailable"}`}
              ><ArchiveRestore size={14} /><span>{battleItem.state === "embedded" ? "Embedded" : "Ground"}</span></button>;
            })}
            {visibleTokens.map((token) => {
              const targetState = attackTargetStates[token.id];
              const conditions = token.conditions.map(conditionById).filter(Boolean);
              const embedded = embeddedByCarrier[token.id] || [];
              return (
              <button
                key={token.id}
                className={`piece${selectedId === token.id ? " on" : ""}${isActiveBattle && token.id === active?.id ? " acting" : ""}${tokenPreview?.id === token.id && tokenPreview.blocked ? " blocked" : ""}${arrivalId === token.id ? " nf-state-table-arriving" : ""}${targetState?.ok ? " nf-state-table-targetable" : ""}${isBattle && token.hp <= 0 ? " nf-state-token-down" : ""}${impact?.targetId === token.id ? ` nf-state-table-hit${impact.critical ? " nf-state-table-critical" : ""}` : ""}`}
                style={{ left: `${token.position.xPercent}%`, top: `${token.position.yPercent}%`, "--piece": token.color }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onKeyDown={(event) => onTokenKeyDown(event, token)}
                onClick={(event) => { event.stopPropagation(); if (attackDraft) resolveAttackTarget(token.id); else { setSelectedId(token.id); setSelectedChestId(null); } }}
                aria-label={attackDraft ? targetState?.ok ? `Attack ${token.name}` : `${token.name} unavailable as target` : `${token.name}${isPlay || isSetup || (isActiveBattle && token.id === active?.id) ? ", use arrow keys to move" : ""}`}
              >
                <span className="piece-disc">{initials(token.name)}</span>
                {isBattle && token.hp <= 0 && (
                  <span className="nf-state-token-down-mark" aria-hidden="true"><X size={26} strokeWidth={3.2} /></span>
                )}
                <span className="piece-name">{token.name}</span>
                {isBattle && <span className="piece-hp"><i style={{ width: `${(token.hp / token.maxHp) * 100}%`, background: healthTone(token.hp, token.maxHp) }} /></span>}
                {isBattle && conditions.length > 0 && <span className="nf-state-table-condition-badges" aria-label={`${conditions.length} conditions`}>{conditions.map((condition) => <i key={condition.id} title={`${condition.name}: ${condition.note}`} style={{ "--nf-condition": condition.color }}>{condition.abbreviation}</i>)}</span>}
                {isBattle && embedded.length > 0 && <span className="nf-state-table-embedded-count" aria-label={`${embedded.length} embedded weapon${embedded.length === 1 ? "" : "s"}`}><ArchiveRestore size={10} />{embedded.length}</span>}
                {impact?.targetId === token.id && <span className="nf-state-table-damage-float" role="status">−{impact.damage}{impact.critical ? " critical" : ""}</span>}
              </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hud hud-tl glass grained">
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps"><Home size={18} /></button>
        <span className="hud-div" />
        <div className="hud-scene"><span className="kicker" title={scene?.name || "Untitled scene"}>{scene?.name || "Untitled scene"}</span><strong>{isPlay ? "Free play" : isCompleteBattle ? scene.encounter.winnerTokenId ? `${tableTokens.find((token) => token.id === scene.encounter.winnerTokenId)?.name || "Winner"} · Battle complete` : "No survivor · Battle complete" : isActiveBattle ? "Battle" : "Setup mode"}</strong></div>
      </div>

      {/* The one thing to do next sits beside Scene settings, top right. */}
      <div className="hud hud-tr glass grained">
        <div className="phase">
          {isPlay
            ? <button className="on" disabled aria-current="page"><Sparkles size={14} /> Play</button>
            : isSetup
              ? <button className="nf-state-table-start" onClick={beginBattle} disabled={busy}><Swords size={16} /> Start Battle</button>
              : isCompleteBattle
                ? <><button onClick={abandonBattle} disabled={busy}><Hammer size={14} /> Exit Battle</button><button className="on" onClick={restartBattle} disabled={busy}><Swords size={14} /> Restart Battle</button></>
                : <button className="nf-state-table-start" onClick={abandonBattle} disabled={busy}><Hammer size={16} /> Exit Battle</button>}
        </div>
        <span className="hud-div" />
        {/* Setup keeps its tools on the rail; Play and Battle still reach them
            through this chip, which doubles as the grid readout. */}
        {isPlay && <>
          <button className="tag tag-brass nf-state-table-tools-trigger" onClick={() => setDrawerOpen(true)} title="Table tools — 5 ft grid" aria-label="Table tools — 5 ft grid"><Grid3x3 size={12} /> 5 ft</button>
          <span className="hud-div" />
        </>}
        <button className="glyph" onClick={() => go({ page: "settings", returnTo: { page: "board", mode } })} title="Scene settings" aria-label="Scene settings"><SlidersHorizontal size={17} /></button>
      </div>

      {toolLabel && <div className="nf-state-table-tool-status glass grained" role="status">
        <span className={`tag ${activeTool === "delete" ? "tag-foe" : "tag-jade"}`}>{toolLabel}</span>
        {/* Finishing a wall used to live in a modal that had to be open at the
            same time as the wall you were drawing. It belongs here instead. */}
        {activeTool?.startsWith("wall-") && <>
          <button className="btn btn-line btn-sm" onClick={cancelWall} disabled={!wallDraft?.points?.length}>Cancel</button>
          <button className="btn btn-key btn-sm" onClick={finishWall} disabled={(wallDraft?.points?.length || 0) < 2}>Finish wall</button>
        </>}
        <button className="glyph" onClick={exitTool} title="Exit current tool" aria-label="Exit current tool"><X size={15} /></button>
      </div>}
      {movementPreview && <div className="nf-state-table-tool-status glass grained" role="status"><span className={`tag ${movementPreview.ok ? routePreview?.overBudget ? "tag-foe" : "tag-jade" : "tag-foe"}`}>{movementPreview.ok ? routePreview.overBudget ? `${routePreview.costFeet} ft reachable · ${routePreview.requestedFeet - routePreview.costFeet} ft over` : `${routePreview.costFeet} ft route · release to move` : movementPreview.message}</span></div>}
      {attackDraft && <div className="nf-state-table-tool-status nf-state-table-attack-status glass grained" role="status"><span className="tag tag-jade">Choose a target · {attackDraft.rangeModel.option.weapon.name}</span>{attackDraft.rangeModel.bands.map((band) => <span className={`tag nf-state-table-range-key nf-state-table-range-key-${band.tone}`} key={band.id}>{band.label}</span>)}<button className="glyph" onClick={() => setAttackDraft(null)} title="Cancel targeting" aria-label="Cancel targeting"><X size={15} /></button></div>}
      {visibleError && !drawerOpen && (
        briefRefusal(visibleError)
          ? (
            <div className="nf-state-table-refusal glass" role="status" key={visibleError.code}>
              <span>{briefRefusal(visibleError)}</span>
              <button className="glyph" onClick={() => setLocalError(null)} title="Dismiss" aria-label="Dismiss message"><X size={14} /></button>
            </div>
          )
          : (
            <div className="nf-state-table-error glass" role="alert">
              <div>
                <strong>Table change not saved</strong>
                <span>{errorText(visibleError)}</span>
              </div>
              <button className="glyph" onClick={() => setLocalError(null)} title="Dismiss" aria-label="Dismiss message"><X size={16} /></button>
            </div>
          )
      )}

      {isSetup && (
        <SetupRail
          activeTool={activeTool}
          chooseTool={chooseTool}
          heroes={heroes}
          summonToken={addSetupToken}
          addChest={placeSetupChest}
          zoomIn={() => zoomBy(0.2)}
          zoomOut={() => zoomBy(-0.2)}
          resetView={() => setCamera({ ...DEFAULT_CAMERA })}
          toggleWalls={() => savePatch({ wallsVisible: !wallsVisible })}
          wallsVisible={wallsVisible}
          canAdjustArtwork={canAdjustArtwork}
          busy={busy}
          pickerOpen={summonPickerOpen}
          setPickerOpen={setSummonPickerOpen}
          openMonsterBrowser={() => setMonsterBrowserOpen(true)}
        />
      )}

      {monsterBrowserOpen && isSetup && (
        <MonsterBrowser
          summon={summonMonsterToken}
          close={() => setMonsterBrowserOpen(false)}
          busy={busy}
        />
      )}

      {!isSetup && <aside className={`dock dock-left glass grained${isBattle ? " nf-state-dock-initiative" : ""}`}>
        <header className="dock-head">
          <div><span className="kicker kicker-jade">{isPlay ? "Free play" : "Turn order"}</span><h2>{isPlay ? "Build the cast" : "Initiative"}</h2></div>
          {isBattle && (
            <span className="nf-state-initiative-round" title={`Round ${scene.encounter.round}`}>
              <em>Round</em>
              <strong className="numeral">{scene.encounter.round}</strong>
            </span>
          )}
        </header>
        {isBattle ? (
          <div className="dock-body nf-state-initiative">
            <ol className="nf-state-initiative-list">
              {orderedTokens.map((token, index) => (
                <li key={token.id}>
                  <button
                    className={`nf-state-initiative-row${index === scene.encounter.activeIndex ? " nf-state-initiative-now" : ""}${selectedId === token.id ? " on" : ""}${token.hp <= 0 ? " nf-state-initiative-down" : ""}`}
                    onClick={() => { setSelectedId(token.id); setSelectedChestId(null); }}
                  >
                    <span className="nf-state-initiative-order numeral">{scene.encounter.initiatives[token.id]}</span>
                    <span className="nf-state-initiative-face" style={{ background: token.color }}>{initials(token.name)}</span>
                    <span className="nf-state-initiative-meta">
                      <strong>{token.name}</strong>
                      <small className="numeral">{token.hp}/{token.maxHp} HP</small>
                    </span>
                    {token.hp <= 0 && <X size={14} className="nf-state-initiative-x" />}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="dock-body">
            <section className="unit">
              <div className="unit-top"><span className="unit-label">Summon a token</span></div>
              <button className="btn btn-key btn-sm btn-wide" onClick={addPlayToken} disabled={busy}><Plus size={15} strokeWidth={2.4} /> Add to map</button>
            </section>
            <section className="unit">
              <div className="unit-top"><span className="unit-label">On the map</span><span className="tag numeral">{tableTokens.length}</span></div>
              <div className="cast">
                {tableTokens.map((token) => <button key={token.id} className={`cast-row${selectedId === token.id ? " on" : ""}`} onClick={() => { setSelectedId(token.id); setSelectedChestId(null); }}><span className="sigil" style={{ background: token.color }}>{initials(token.name)}</span><span className="cast-meta"><strong>{token.name}</strong><small>{token.heroId ? "Hero snapshot" : "Manual token"}</small></span><Pip tone="ally" /></button>)}
                {!tableTokens.length && <p className="note">No tokens are on this Table yet.</p>}
              </div>
            </section>
            <p className="whisper">Drag tokens across the Table. They settle onto the nearest square. Camera position and ruler marks remain view-only.</p>
          </div>
        )}
      </aside>}

      {isSetup && (
        <div className="dock dock-right nf-state-scene-column">
          <BattleSetupInspector
            token={selected}
            chest={selectedChest}
            busy={busy}
            saveToken={saveSelectedSetupToken}
            applyTokenEquipment={applySelectedTokenEquipment}
            removeToken={removeSelectedSetupToken}
            changeChestItem={changeSelectedChestItem}
            removeChest={removeSelectedSetupChest}
            initialDrawer={initialInspectorDrawer}
          />
          <SceneObjects
            tokens={tableTokens}
            chests={chests}
            selectedTokenId={selectedId}
            selectedChestId={selectedChestId}
            selectToken={(tokenId) => { setSelectedId(tokenId); setSelectedChestId(null); }}
            selectChest={(chestId) => { setSelectedChestId(chestId); setSelectedId(null); }}
            addToken={() => setSummonPickerOpen(true)}
            addChest={placeSetupChest}
            removeToken={removeSetupTokenById}
            removeChest={removeSetupChestById}
            busy={busy}
          />
        </div>
      )}

      {!isSetup && <aside className="dock dock-right glass grained">
        {selected ? <>
          <header className="dock-head"><span className="sigil sigil-lg" style={{ background: selected.color }}>{initials(selected.name)}</span><div><span className="kicker">Selected token</span><h2>{selected.name}</h2></div></header>
          <div className="dock-body">
            {isPlay ? (
              <section className="unit"><div className="unit-top"><span className="unit-label">Free position</span><span className="tag tag-jade">No turn limits</span></div><div className="nf-state-table-position"><span>X <strong className="numeral">{selected.position.xPercent.toFixed(1)}%</strong></span><span>Y <strong className="numeral">{selected.position.yPercent.toFixed(1)}%</strong></span></div><p className="note">Drag this token directly on the Table. No grid snapping or combat resources apply in Play.</p></section>
            ) : (
              <BattleTokenInspector
                token={selected}
                busy={busy}
                locked={combatLocked || !isActiveBattle}
                changeCondition={changeSelectedCondition}
                heal={healSelected}
                damage={damageSelected}
                setTempHp={setSelectedTempHp}
                rollSave={rollTokenSave}
                rollCheck={rollTokenCheck}
              />
            )}
            {isPlay && <button className="btn btn-hazard btn-sm btn-wide" onClick={removeSelectedPlayToken} disabled={busy}><Trash2 size={15} /> Remove token</button>}
          </div>
        </> : selectedChest ? <><header className="dock-head"><span className="sigil sigil-lg nf-state-table-chest-sigil"><Package size={18} /></span><div><span className="kicker">Selected chest</span><h2>Battle chest</h2></div></header><div className="dock-body"><section className="unit"><div className="unit-top"><span className="unit-label">Contents</span><span className={`tag ${selectedChest.inventory.length ? "tag-brass" : ""}`}>{selectedChest.inventory.length ? isActiveBattle ? "Bonus Action" : "Final state" : "Empty"}</span></div><div className="nf-state-table-chest-owned">{selectedChest.inventory.map((entry) => <span key={entry.itemId}><strong>{getItem(entry.itemId)?.name || entry.itemId}</strong><em className="numeral">×{entry.quantity}</em></span>)}{!selectedChest.inventory.length && <p className="note">This chest is empty.</p>}</div><p className="note">Chest movement and Setup editing stay locked. An adjacent active token can open it through the Bonus command; depleted contents persist through restart.</p></section></div></> : <div className="void-state"><span className="void-orb"><CircleDot size={26} /></span><h3>Nothing selected</h3><p>Pick a token on the map or in the cast list to inspect it.</p></div>}
      </aside>}

      {isActiveBattle && active && (
        <CommandBar
          token={active}
          resources={activeResources || createTurnResources(active)}
          dashState={dashState}
          swapState={swapState}
          attackState={attackState}
          bonusState={bonusState}
          chestOptions={battleChestOptions}
          retrievalOptions={battleRetrievalOptions}
          lootOptions={battleLootOptions}
          busy={busy || combatLocked}
          attack={startAttack}
          dash={useDash}
          swap={useWeaponSwap}
          end={finishTurn}
          openChest={openBattleChest}
          searchBody={searchBattleBody}
          retrieve={resolveRetrieval}
          initialPanel={initialCommandPanel}
          initialSwapDraft={initialSwapDraft}
        />
      )}

      {isCompleteBattle && <BattleCompletion encounter={scene.encounter} tokens={tableTokens} busy={busy || combatLocked} restart={restartBattle} awardXp={awardBattleExperience} />}

      {drawerOpen && <TableToolsDrawer isPlay={isPlay} camera={camera} mapView={mapView} activeTool={activeTool} wallDraft={wallDraft} wallsVisible={wallsVisible} canAdjustArtwork={canAdjustArtwork} busy={busy} error={visibleError} close={() => setDrawerOpen(false)} zoomBy={zoomBy} resetCamera={() => setCamera({ ...DEFAULT_CAMERA })} chooseTool={chooseTool} scaleArtwork={scaleArtwork} resetArtwork={resetArtwork} finishWall={finishWall} cancelWall={cancelWall} toggleWalls={() => savePatch({ wallsVisible: !wallsVisible })} exitTool={exitTool} />}
      {lootChest && isActiveBattle && <ChestLootDrawer chest={lootChest} busy={busy || combatLocked} error={visibleError} take={takeChestItem} close={() => setLootChestId(null)} />}
      {lootBody && isActiveBattle && <ChestLootDrawer chest={lootBody} body busy={busy || combatLocked} error={visibleError} take={takeBodyItem} close={() => setLootTokenId(null)} />}
      {cinematic && <AttackCinematic cinematic={cinematic} skip={skipCinematic} />}
      {checkCinematic && <CheckCinematic cinematic={checkCinematic} skip={skipCheckCinematic} />}
      {retrievalCinematic && <RetrievalCinematic cinematic={retrievalCinematic} />}
    </div>
  );
}
