import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  CircleDot,
  ArchiveRestore,
  Eye,
  EyeOff,
  Grid3x3,
  Hammer,
  LayoutGrid,
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
import { CONDITIONS, conditionById } from "../domain/conditions.js";
import {
  chestCommandOptions,
  openAdjacentChest,
  restartCompletedBattle,
  retrievalCommandOptions,
  retrieveBattleItem,
  takeOneFromOpenChest,
} from "../domain/encounter.js";
import {
  adjustArtworkBy,
  applySetupTokenEquipment,
  canOccupySetupPosition,
  changeChestInventory,
  clientPointToPercent,
  createChest,
  createHeroTokenSnapshot,
  createManualToken,
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
  rulerDistanceFeet,
  setArtworkScale,
  setupCellForPosition,
  setupPositionForCell,
  snapSetupPosition,
  updateChest,
  updateToken,
  zoomCameraAt,
  zoomCameraAtViewportCenter,
} from "../domain/table.js";
import { Pip } from "../ui/Glyphs.jsx";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import BattleSetupInspector from "./BattleSetupInspector.jsx";
import AttackCinematic from "./AttackCinematic.jsx";
import BattleCompletion from "./BattleCompletion.jsx";
import BonusCommandsDrawer from "./BonusCommandsDrawer.jsx";
import ChestLootDrawer from "./ChestLootDrawer.jsx";
import CombatCommandsDrawer from "./CombatCommandsDrawer.jsx";
import RetrievalCinematic from "./RetrievalCinematic.jsx";

const okay = () => ({ ok: true });
const initials = (name) => String(name || "?").slice(0, 2).toUpperCase();
const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the change."}` : "";
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

function MovementRouteLayer({ preview }) {
  if (!preview?.route?.length) return null;
  const reachable = preview.route.slice(0, (preview.reachableIndex || 0) + 1);
  const over = preview.route.slice(preview.reachableIndex || 0);
  const points = (route) => route.map((point) => `${point.xPercent},${point.yPercent}`).join(" ");
  const start = preview.route[0];
  const landing = preview.route[preview.landingIndex || 0] || start;
  return (
    <>
      <svg className="nf-state-table-movement-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {reachable.length > 1 && <polyline className="nf-state-table-movement-reachable" points={points(reachable)} fill="none" vectorEffect="non-scaling-stroke" />}
        {over.length > 1 && <polyline className="nf-state-table-movement-over" points={points(over)} fill="none" vectorEffect="non-scaling-stroke" />}
        <circle className="nf-state-table-movement-start" cx={start.xPercent} cy={start.yPercent} r="0.75" vectorEffect="non-scaling-stroke" />
        {preview.landingIndex > 0 && <circle className="nf-state-table-movement-stop" cx={landing.xPercent} cy={landing.yPercent} r="0.75" vectorEffect="non-scaling-stroke" />}
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
  initialTool = null,
  initialRulerDraft = null,
  initialWallDraft = null,
  initialSelectedId = undefined,
  initialSelectedChestId = null,
  initialAbandonOpen = false,
  initialCommandOpen = false,
  initialBonusOpen = false,
  initialMovementPreview = null,
  initialSwapOpen = false,
  initialSwapDraft = null,
  initialAttackOpen = false,
  initialAttackDraft = null,
  initialCinematic = null,
  initialRetrievalCinematic = null,
  initialLootChestId = null,
  initialImpact = null,
  suppliedArtworkUrl = null,
}) {
  const isPlay = scene?.kind === "play" || mode === "play";
  const isBattle = !isPlay && Boolean(scene?.encounter);
  const isActiveBattle = isBattle && scene?.encounter?.status === "active";
  const isCompleteBattle = isBattle && scene?.encounter?.status === "complete";
  const isSetup = !isPlay && !isBattle;
  const mapRef = useRef(null);
  const worldRef = useRef(null);
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
  const [abandonOpen, setAbandonOpen] = useState(initialAbandonOpen);
  const [commandOpen, setCommandOpen] = useState(initialCommandOpen);
  const [bonusOpen, setBonusOpen] = useState(initialBonusOpen);
  const [movementPreview, setMovementPreview] = useState(initialMovementPreview);
  const [attackDraft, setAttackDraft] = useState(initialAttackDraft);
  const [cinematic, setCinematic] = useState(initialCinematic);
  const [retrievalCinematic, setRetrievalCinematic] = useState(initialRetrievalCinematic);
  const [lootChestId, setLootChestId] = useState(initialLootChestId);
  const [impact, setImpact] = useState(initialImpact);
  const [arrivalId, setArrivalId] = useState(null);
  const [localError, setLocalError] = useState(null);
  const { url: artworkUrl, error: artworkError } = useArtworkUrl(scene, artworkRepository, suppliedArtworkUrl);
  const busy = persistence.status === "saving";
  const combatLocked = Boolean(cinematic || retrievalCinematic);
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
  const visibleError = localError || persistence.error || artworkError;
  const abandonDialogRef = useDialogA11y({ open: abandonOpen, onClose: () => setAbandonOpen(false) });
  const walls = scene?.walls || [];
  const wallsVisible = scene?.wallsVisible !== false;
  const canAdjustArtwork = Boolean(artworkUrl || scene?.blankCanvas);
  const rulerFeet = rulerDraft && worldRef.current
    ? rulerDistanceFeet(rulerDraft.start, rulerDraft.end, { width: worldRef.current.offsetWidth, height: worldRef.current.offsetHeight, gridSize: scene?.gridSize })
    : 0;

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
    setAbandonOpen(false);
    setCommandOpen(false);
    setBonusOpen(false);
    setMovementPreview(null);
    setAttackDraft(null);
    setCinematic(null);
    setRetrievalCinematic(null);
    setLootChestId(null);
    setImpact(null);
    clearCinematicTimers();
    clearRetrievalTimers();
    setArrivalId(null);
    setLocalError(null);
  }, [scene?.id]);

  useEffect(() => {
    if (!interaction || interaction.kind !== "artwork") setMapView(normalizeMapView(scene?.mapView));
  }, [scene?.mapView?.scale, scene?.mapView?.x, scene?.mapView?.y]);

  useEffect(() => {
    setCommandOpen(false);
    setBonusOpen(false);
    setMovementPreview(null);
    setAttackDraft(null);
    setLootChestId(null);
    setInteraction((current) => current?.kind === "movement" ? null : current);
  }, [activeId]);

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
      if (lootChestId) {
        setLootChestId(null);
        return;
      }
      if (commandOpen) {
        setCommandOpen(false);
        return;
      }
      if (bonusOpen) {
        setBonusOpen(false);
        return;
      }
      if (abandonOpen) {
        setAbandonOpen(false);
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
  }, [abandonOpen, activeTool, attackDraft, bonusOpen, combatLocked, commandOpen, drawerOpen, lootChestId, wallDraft, walls]);

  const localPoint = (event) => {
    const rect = worldRef.current?.getBoundingClientRect();
    return rect ? clientPointToPercent({ x: event.clientX, y: event.clientY }, rect) : { xPercent: 50, yPercent: 50 };
  };

  const setupViewport = () => ({
    width: worldRef.current?.offsetWidth,
    height: worldRef.current?.offsetHeight,
    gridSize: scene?.gridSize,
  });

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

    if (isPlay) {
      savePatch({
        tokens: updateToken(playTokens, token.id, {
          position: {
            xPercent: token.position.xPercent + delta.xPercent,
            yPercent: token.position.yPercent + delta.yPercent,
          },
        }),
      });
      return;
    }

    const viewport = setupViewport();
    const currentCell = setupCellForPosition(token.position, viewport);
    const destination = setupPositionForCell({
      column: currentCell.column + delta.column,
      row: currentCell.row + delta.row,
    }, viewport);
    const destinationCell = setupCellForPosition(destination, viewport);
    if (destinationCell.column === currentCell.column && destinationCell.row === currentCell.row) return;

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
    if (interaction.kind === "ruler") setRulerDraft({ start: interaction.start, end: point });
    if (interaction.kind === "token") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      const position = isSetup ? snapSetupPosition(proposed, setupViewport()) : proposed;
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
    if (interaction.kind === "ruler") setRulerDraft({ start: interaction.start, end: point });
    if (interaction.kind === "token") {
      const proposed = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      const position = isSetup ? snapSetupPosition(proposed, setupViewport()) : proposed;
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

  const addSetupToken = () => {
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
    const hero = heroes.find((entry) => entry.id === summonChoice);
    const token = hero
      ? createHeroTokenSnapshot(hero, { id, ordinal: tableTokens.length, position })
      : createManualToken({ id, ordinal: tableTokens.length, position });
    const result = savePatch({ tokens: [...tableTokens, token] });
    if (result.ok) {
      setSelectedId(token.id);
      setSelectedChestId(null);
    }
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
    const next = removeChest(chests, selectedChest.id);
    const result = savePatch({ chests: next });
    if (result.ok) {
      setSelectedChestId(null);
      setSelectedId(tableTokens[0]?.id || null);
    }
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

  const abandonBattle = () => {
    const result = savePatch({ encounter: null });
    if (result.ok) {
      setAbandonOpen(false);
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
    const result = savePatch(dashed.value);
    if (result.ok) setCommandOpen(false);
    return result;
  };

  const useWeaponSwap = (loadout) => {
    const swapped = performWeaponSwap(scene, loadout);
    if (!swapped.ok) {
      setLocalError(swapped);
      return swapped;
    }
    const result = savePatch(swapped.value);
    if (result.ok) setCommandOpen(false);
    return result;
  };

  const startAttack = (specification) => {
    const viewport = setupViewport();
    const range = buildAttackRangeBands(scene, { ...specification, viewport });
    if (!range.ok) {
      setLocalError(range);
      return range;
    }
    setAttackDraft({ ...specification, viewport, rangeModel: range.value });
    setCommandOpen(false);
    setBonusOpen(false);
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
    setCommandOpen(false);
    setBonusOpen(false);
    setInteraction(null);
    setLocalError(null);
    setCinematic({ outcome: resolved.outcome, stage: "spin", error: null });
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const timings = reducedMotion
      ? { natural: 80, modifiers: 160, verdict: 240, damage: 320, impact: 420, close: 760 }
      : { natural: 420, modifiers: 820, verdict: 1220, damage: 1600, impact: 1980, close: 2800 };
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
      setBonusOpen(false);
      setLocalError(null);
      return opened;
    }
    const saved = savePatch(opened.value);
    if (saved.ok) {
      setLootChestId(chestId);
      setBonusOpen(false);
      setCommandOpen(false);
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

  const resolveRetrieval = (battleItemId) => {
    if (!isActiveBattle || combatLocked) return { ok: false, message: "Weapon retrieval requires an active unlocked Battle." };
    const resolved = retrieveBattleItem(scene, battleItemId, setupViewport(), { random });
    if (!resolved.ok) {
      setLocalError(resolved);
      return resolved;
    }
    setBonusOpen(false);
    setCommandOpen(false);
    setLootChestId(null);
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
      setAttackDraft(null);
      setCommandOpen(false);
      setBonusOpen(false);
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
      setCommandOpen(false);
      setBonusOpen(false);
      setMovementPreview(null);
      setAttackDraft(null);
      setLootChestId(null);
      setImpact(null);
      setInteraction(null);
    }
    return result;
  };

  const toolLabel = activeTool === "artwork"
    ? "Drag the Table to adjust artwork"
    : activeTool === "wall-full"
      ? "Click points for a full wall · Escape to finish"
      : activeTool === "wall-half"
        ? "Click points for a half-wall · Escape to finish"
        : activeTool === "ruler"
          ? "Drag across the Table to measure"
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
          ref={worldRef}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, "--nf-grid-size": `${scene?.gridSize || 44}px`, "--nf-grid-major": `${(scene?.gridSize || 44) * 5}px` }}
        >
          <div className="nf-state-table-plane">
            {(artworkUrl || scene?.blankCanvas) && (
              <div className="nf-state-table-artwork" style={{ transform: `translate(${mapView.x}px, ${mapView.y}px) scale(${mapView.scale})`, backgroundColor: scene?.blankCanvas ? "#fff" : undefined }}>
                {artworkUrl && <img src={artworkUrl} alt="" draggable="false" />}
              </div>
            )}
            {!isPlay && <div className="map-grid nf-state-table-infinite-grid" aria-hidden="true" />}
            <div className="map-fog" aria-hidden="true" />
            <WallAndRulerLayer walls={walls} wallsVisible={wallsVisible} wallDraft={wallDraft} wallHover={wallHover} rulerDraft={rulerDraft} rulerFeet={rulerFeet} />
            {isActiveBattle && <MovementRouteLayer preview={routePreview} />}
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
                className={`piece${selectedId === token.id ? " on" : ""}${isActiveBattle && token.id === active?.id ? " acting" : ""}${tokenPreview?.id === token.id && tokenPreview.blocked ? " blocked" : ""}${arrivalId === token.id ? " nf-state-table-arriving" : ""}${targetState?.ok ? " nf-state-table-targetable" : ""}${impact?.targetId === token.id ? ` nf-state-table-hit${impact.critical ? " nf-state-table-critical" : ""}` : ""}`}
                style={{ left: `${token.position.xPercent}%`, top: `${token.position.yPercent}%`, "--piece": token.color }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onKeyDown={(event) => onTokenKeyDown(event, token)}
                onClick={(event) => { event.stopPropagation(); if (attackDraft) resolveAttackTarget(token.id); else { setSelectedId(token.id); setSelectedChestId(null); } }}
                aria-label={attackDraft ? targetState?.ok ? `Attack ${token.name}` : `${token.name} unavailable as target` : `${token.name}${isPlay || isSetup || (isActiveBattle && token.id === active?.id) ? ", use arrow keys to move" : ""}`}
              >
                <span className="piece-disc">{initials(token.name)}</span>
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
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps"><ChevronLeft size={18} /></button>
        <span className="hud-div" />
        <div className="hud-scene"><span className="kicker" title={scene?.name || "Untitled scene"}>{scene?.name || "Untitled scene"}</span><strong>{isPlay ? "Free play" : isCompleteBattle ? scene.encounter.winnerTokenId ? `${tableTokens.find((token) => token.id === scene.encounter.winnerTokenId)?.name || "Winner"} · Battle complete` : "No survivor · Battle complete" : isActiveBattle ? `Round ${scene.encounter.round} · ${active?.name || "Token"}'s turn` : "Setup mode"}</strong></div>
      </div>

      <div className="hud hud-tc glass grained">
        <div className="phase">
          {isPlay ? <button className="on" disabled aria-current="page"><Sparkles size={14} /> Play</button> : <><button className={isSetup ? "on" : ""} onClick={() => isBattle ? setAbandonOpen(true) : setMode("setup")}><Hammer size={14} /> Setup</button><button className={isBattle ? "on" : ""} onClick={isSetup ? beginBattle : isCompleteBattle ? restartBattle : undefined} disabled={busy}><Swords size={14} /> {isCompleteBattle ? "Restart Battle" : "Battle"}</button></>}
        </div>
      </div>

      <div className="hud hud-tr glass grained">
        <button className="tag tag-brass nf-state-table-tools-trigger" onClick={() => setDrawerOpen(true)} title="Table tools — 5 ft grid" aria-label="Table tools — 5 ft grid"><Grid3x3 size={12} /> 5 ft</button>
        <span className="hud-div" />
        <button className="glyph" onClick={() => go({ page: "settings", returnTo: { page: "board", mode } })} title="Scene settings"><SlidersHorizontal size={17} /></button>
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps"><LayoutGrid size={17} /></button>
      </div>

      {toolLabel && <div className="nf-state-table-tool-status glass grained" role="status"><span className="tag tag-jade">{toolLabel}</span><button className="glyph" onClick={exitTool} title="Exit current tool" aria-label="Exit current tool"><X size={15} /></button></div>}
      {movementPreview && <div className="nf-state-table-tool-status glass grained" role="status"><span className={`tag ${movementPreview.ok ? routePreview?.overBudget ? "tag-foe" : "tag-jade" : "tag-foe"}`}>{movementPreview.ok ? routePreview.overBudget ? `${routePreview.costFeet} ft reachable · ${routePreview.requestedFeet - routePreview.costFeet} ft over` : `${routePreview.costFeet} ft route · release to move` : movementPreview.message}</span></div>}
      {attackDraft && <div className="nf-state-table-tool-status nf-state-table-attack-status glass grained" role="status"><span className="tag tag-jade">Choose a target · {attackDraft.rangeModel.option.weapon.name}</span>{attackDraft.rangeModel.bands.map((band) => <span className={`tag nf-state-table-range-key nf-state-table-range-key-${band.tone}`} key={band.id}>{band.label}</span>)}<button className="glyph" onClick={() => setAttackDraft(null)} title="Cancel targeting" aria-label="Cancel targeting"><X size={15} /></button></div>}
      {visibleError && !drawerOpen && <div className="nf-state-table-error glass" role="alert"><strong>Table change not saved</strong><span>{errorText(visibleError)}</span></div>}

      <aside className="dock dock-left glass grained">
        <header className="dock-head"><div><span className="kicker kicker-jade">{isPlay ? "Free play" : "Encounter"}</span><h2>{isPlay ? "Build the cast" : isCompleteBattle ? "Battle complete" : isActiveBattle ? "Battle running" : "Build the scene"}</h2></div></header>
        <div className="dock-body">
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Summon a token</span></div>
            <select className={`sel${isBattle ? " nf-state-disabled" : ""}`} aria-label="Token to summon" value={isPlay ? "" : summonChoice} onChange={(event) => setSummonChoice(event.target.value)} disabled={isBattle}>
              <option value="">Blank token</option>
              {!isPlay && heroes.map((hero) => <option value={hero.id} key={hero.id}>{hero.name}</option>)}
            </select>
            <button className={`btn btn-key btn-sm btn-wide${isBattle ? " nf-state-disabled" : ""}`} onClick={isPlay ? addPlayToken : addSetupToken} disabled={busy || isBattle}><Plus size={15} strokeWidth={2.4} /> Add to map</button>
            {isSetup && <button className="btn btn-line btn-sm btn-wide" onClick={placeSetupChest} disabled={busy}><Package size={14} /> Place a chest</button>}
            {isBattle && <p className="note">Token and chest creation are locked while this encounter is preserved.</p>}
          </section>
          <section className="unit">
            <div className="unit-top"><span className="unit-label">On the map</span><span className="tag numeral">{tableTokens.length}</span></div>
            <div className="cast">
              {tableTokens.map((token) => <button key={token.id} className={`cast-row${selectedId === token.id ? " on" : ""}`} onClick={() => { setSelectedId(token.id); setSelectedChestId(null); }}><span className="sigil" style={{ background: token.color }}>{initials(token.name)}</span><span className="cast-meta"><strong>{token.name}</strong><small>{isBattle ? `${token.hp}/${token.maxHp} HP` : token.heroId ? "Hero snapshot" : "Manual token"}</small></span><Pip tone={token.type === "enemy" ? "foe" : "ally"} /></button>)}
              {!tableTokens.length && <p className="note">No tokens are on this Table yet.</p>}
            </div>
          </section>
          {isSetup && <section className="unit"><div className="unit-top"><span className="unit-label">Chests</span><span className="tag numeral">{chests.length}</span></div><div className="cast">{chests.map((chest, index) => <button key={chest.id} className={`cast-row${selectedChestId === chest.id ? " on" : ""}`} onClick={() => { setSelectedChestId(chest.id); setSelectedId(null); }}><span className="sigil nf-state-table-chest-sigil"><Package size={15} /></span><span className="cast-meta"><strong>Chest {index + 1}</strong><small>{chest.inventory.reduce((total, entry) => total + entry.quantity, 0)} items</small></span><Pip tone="ally" /></button>)}</div></section>}
          {isSetup && <p className="whisper">Arrange the scene, then press Battle to snap every token and roll initiative.</p>}
          {isPlay && <p className="whisper">Drag tokens freely across the Table. Camera position and ruler marks remain view-only.</p>}
        </div>
      </aside>

      <aside className="dock dock-right glass grained">
        {isSetup ? <>
          {(selected || selectedChest) && <header className="dock-head">{selected ? <span className="sigil sigil-lg" style={{ background: selected.color }}>{initials(selected.name)}</span> : <span className="sigil sigil-lg nf-state-table-chest-sigil"><Package size={18} /></span>}<div><span className="kicker">{selected ? "Selected token" : "Selected chest"}</span><h2>{selected?.name || "Battle chest"}</h2></div></header>}
          <BattleSetupInspector token={selected} chest={selectedChest} busy={busy} error={visibleError} saveToken={saveSelectedSetupToken} applyTokenEquipment={applySelectedTokenEquipment} removeToken={removeSelectedSetupToken} changeChestItem={changeSelectedChestItem} removeChest={removeSelectedSetupChest} />
        </> : selected ? <>
          <header className="dock-head"><span className="sigil sigil-lg" style={{ background: selected.color }}>{initials(selected.name)}</span><div><span className="kicker">Selected token</span><h2>{selected.name}</h2></div></header>
          <div className="dock-body">
            <label className="field"><span className="label">Name</span><input className="inp" value={selected.name} readOnly /></label>
            {isPlay ? <section className="unit"><div className="unit-top"><span className="unit-label">Free position</span><span className="tag tag-jade">No turn limits</span></div><div className="nf-state-table-position"><span>X <strong className="numeral">{selected.position.xPercent.toFixed(1)}%</strong></span><span>Y <strong className="numeral">{selected.position.yPercent.toFixed(1)}%</strong></span></div><p className="note">Drag this token directly on the Table. No grid snapping or combat resources apply in Play.</p></section> : <>
              <section className="unit"><div className="unit-top"><span className="unit-label">Vitals</span></div><div className="quad"><div className="quad-cell"><span>HP</span><strong className="numeral">{selected.hp}</strong></div><div className="quad-cell"><span>Max HP</span><strong className="numeral">{selected.maxHp}</strong></div><div className="quad-cell"><span>AC</span><strong className="numeral">{selected.ac}</strong></div><div className="quad-cell"><span>Speed</span><strong className="numeral">{selected.baseSpeed}</strong></div></div><div className="vitalbar"><div className="vitalbar-top"><span>Health</span><strong className="numeral">{selected.hp} / {selected.maxHp}</strong></div><div className="meter"><i style={{ width: `${(selected.hp / selected.maxHp) * 100}%`, background: healthTone(selected.hp, selected.maxHp), boxShadow: `0 0 12px ${healthTone(selected.hp, selected.maxHp)}` }} /></div></div></section>
              <section className="unit"><div className="unit-top"><span className="unit-label">Conditions</span><span className="tag tag-jade">{selected.conditions.length || "None"}</span></div><div className="afflict">{CONDITIONS.map((condition) => { const on = selected.conditions.includes(condition.id); return <button key={condition.id} type="button" className={`toggle-chip nf-state-condition-chip${on ? " on" : ""}`} style={on ? { "--nf-condition": condition.color } : undefined} onClick={() => changeSelectedCondition(condition.id)} disabled={busy || combatLocked || !isActiveBattle} title={condition.note} aria-pressed={on}>{condition.name}</button>; })}</div><p className="note">Conditions are applied manually. Their movement, action, roll-mode, and automatic-critical effects are enforced immediately.</p></section>
              <section className="unit nf-state-embedded-inspector"><div className="unit-top"><span className="unit-label">Embedded weapons</span><span className="tag tag-brass">{selectedEmbedded.length || "None"}</span></div>{selectedEmbedded.map((battleItem) => { const option = battleRetrievalOptions.find((entry) => entry.battleItem.id === battleItem.id); const weapon = getItem(battleItem.itemId); return <button type="button" className="btn btn-line btn-wide" key={battleItem.id} onClick={() => resolveRetrieval(battleItem.id)} disabled={busy || combatLocked || !option?.availability.ok} title={option?.availability.ok ? `${option.availability.value.cost} retrieval` : option?.availability.message || "Battle is complete"}><ArchiveRestore size={14} /> {weapon?.name || battleItem.itemId}<span className="nf-state-command-reason">{option?.availability.ok ? `${option.availability.value.retrievalKind.replaceAll("-", " ")} · ${option.availability.value.cost}` : option?.availability.message || "Preserved final state"}</span></button>; })}{!selectedEmbedded.length && <p className="note">No thrown weapons are embedded in this token.</p>}</section>
              <section className="unit nf-state-battle-inventory"><div className="unit-top"><span className="unit-label">Battle inventory</span><span className="tag">{selected.inventory.reduce((total, entry) => total + entry.quantity, 0)} units</span></div><div className="nf-state-table-chest-owned">{selected.inventory.map((entry) => { const item = getItem(entry.itemId); const hands = [selected.loadout.mainHand === entry.itemId ? "Main" : null, selected.loadout.offHand === entry.itemId ? "Off" : null].filter(Boolean); return <span key={entry.itemId}><strong>{item?.name || entry.itemId}{hands.length ? ` · ${hands.join("/")}` : ""}</strong><em className="numeral">×{entry.quantity}</em></span>; })}{!selected.inventory.length && <p className="note">Inventory is empty.</p>}</div><p className="note">Shots consume one matching ammunition unit. Thrown weapons leave inventory until they are retrieved.</p></section>
              <form className="unit" onSubmit={(event) => event.preventDefault()}><div className="unit-top"><span className="unit-label">Adjust stat</span><span className="tag">Locked</span></div><div className="console-row"><select className="sel" defaultValue="hp" disabled><option value="hp">HP</option><option value="maxHp">Max HP</option><option value="ac">AC</option><option value="speed">Speed</option></select><input className="inp" placeholder="+5 / −5" inputMode="numeric" disabled /></div><button className="btn btn-key btn-sm btn-wide" type="submit" disabled>Apply adjustment</button></form>
            </>}
            <button className={`btn btn-hazard btn-sm btn-wide${isBattle ? " nf-state-disabled" : ""}`} onClick={isPlay ? removeSelectedPlayToken : undefined} disabled={busy || isBattle} title={isBattle ? "Tokens cannot be removed during an active Battle" : undefined}><Trash2 size={15} /> Remove token</button>
          </div>
        </> : selectedChest ? <><header className="dock-head"><span className="sigil sigil-lg nf-state-table-chest-sigil"><Package size={18} /></span><div><span className="kicker">Selected chest</span><h2>Battle chest</h2></div></header><div className="dock-body"><section className="unit"><div className="unit-top"><span className="unit-label">Contents</span><span className={`tag ${selectedChest.inventory.length ? "tag-brass" : ""}`}>{selectedChest.inventory.length ? isActiveBattle ? "Bonus Action" : "Final state" : "Empty"}</span></div><div className="nf-state-table-chest-owned">{selectedChest.inventory.map((entry) => <span key={entry.itemId}><strong>{getItem(entry.itemId)?.name || entry.itemId}</strong><em className="numeral">×{entry.quantity}</em></span>)}{!selectedChest.inventory.length && <p className="note">This chest is empty.</p>}</div><p className="note">Chest movement and Setup editing stay locked. An adjacent active token can open it through the Bonus command; depleted contents persist through restart.</p></section></div></> : <div className="void-state"><span className="void-orb"><CircleDot size={26} /></span><h3>Nothing selected</h3><p>Pick a token on the map or in the cast list to inspect it.</p></div>}
      </aside>

      {isActiveBattle && active && <div className="track glass grained"><div className="track-round"><span className="kicker kicker-brass">Round</span><strong className="numeral">{scene.encounter.round}</strong></div><div className="track-div" /><ol className="track-order">{orderedTokens.map((token, index) => <li key={token.id} className={index === scene.encounter.activeIndex ? "now" : ""}><span className="track-face" style={{ background: token.color }}>{initials(token.name)}</span><span className="track-name">{token.name}</span><span className="track-init numeral">{scene.encounter.initiatives[token.id]}</span></li>)}</ol><div className="track-div" /><div className="track-res"><div className="res-move"><span className="kicker"><Wind size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Movement</span><strong className="numeral">{movementLeft} / {movementMax} ft</strong><div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${movementMax ? movementLeft / movementMax * 100 : 0}%` }} /></div></div><div className="res-pips"><button className={`pip-key nf-state-command-pip${activeResources?.actionSpent ? " spent" : ""}`} title="Open Combat Commands" aria-label="Open Combat Commands" onClick={() => { setCommandOpen(true); setBonusOpen(false); }} disabled={combatLocked}><Swords size={13} /><em>{activeResources?.actionSpent ? activeResources.actionType || "Spent" : "Action"}</em></button><button className={`pip-key nf-state-command-pip${activeResources?.bonusActionSpent ? " spent" : ""}`} title="Open Bonus Commands" aria-label="Open Bonus Commands" onClick={() => { setBonusOpen(true); setCommandOpen(false); }} disabled={combatLocked}><ShieldHalf size={13} /><em>{activeResources?.bonusActionSpent ? activeResources.bonusActionType || "Spent" : "Bonus"}</em></button></div></div></div>}

      {isCompleteBattle && <BattleCompletion encounter={scene.encounter} tokens={tableTokens} busy={busy || combatLocked} restart={restartBattle} />}

      {drawerOpen && <TableToolsDrawer isPlay={isPlay} camera={camera} mapView={mapView} activeTool={activeTool} wallDraft={wallDraft} wallsVisible={wallsVisible} canAdjustArtwork={canAdjustArtwork} busy={busy} error={visibleError} close={() => setDrawerOpen(false)} zoomBy={zoomBy} resetCamera={() => setCamera({ ...DEFAULT_CAMERA })} chooseTool={chooseTool} scaleArtwork={scaleArtwork} resetArtwork={resetArtwork} finishWall={finishWall} cancelWall={cancelWall} toggleWalls={() => savePatch({ wallsVisible: !wallsVisible })} exitTool={exitTool} />}
      {commandOpen && isActiveBattle && active && <CombatCommandsDrawer token={active} resources={activeResources} dashState={dashState} swapState={swapState} attackState={attackState} busy={busy || combatLocked} error={visibleError} close={() => setCommandOpen(false)} attack={startAttack} dash={useDash} swap={useWeaponSwap} end={finishTurn} initialSwapOpen={initialSwapOpen} initialSwapDraft={initialSwapDraft} initialAttackOpen={initialAttackOpen} />}
      {bonusOpen && isActiveBattle && active && <BonusCommandsDrawer token={active} resources={activeResources} bonusState={bonusState} chestOptions={battleChestOptions} retrievalOptions={battleRetrievalOptions} busy={busy || combatLocked} error={visibleError} close={() => setBonusOpen(false)} attack={startAttack} openChest={openBattleChest} retrieve={resolveRetrieval} />}
      {lootChest && isActiveBattle && <ChestLootDrawer chest={lootChest} busy={busy || combatLocked} error={visibleError} take={takeChestItem} close={() => setLootChestId(null)} />}
      {cinematic && <AttackCinematic cinematic={cinematic} />}
      {retrievalCinematic && <RetrievalCinematic cinematic={retrievalCinematic} />}
      {abandonOpen && <PortalLayer><div className="veil" onClick={() => setAbandonOpen(false)} /><aside ref={abandonDialogRef} className="drawer nf-state-dialog" role="dialog" aria-modal="true" aria-labelledby="abandon-battle-title" aria-describedby="abandon-battle-description" tabIndex={-1}><div className="drawer-top"><div><span className="kicker">Return to Setup</span><h2 id="abandon-battle-title">Abandon this encounter?</h2></div><button className="glyph" onClick={() => setAbandonOpen(false)} aria-label="Close"><X size={17} /></button></div><div className="drawer-body">{visibleError && <div className="nf-state-inline-error" role="alert"><strong>Battle not abandoned</strong><span>{errorText(visibleError)}</span></div>}<p className="prose" id="abandon-battle-description">Return <strong>{scene?.name}</strong> to editable Battle Setup?</p><p className="note">Current token HP and positions are preserved. Initiative, turn resources, and physical battle items are cleared.</p></div><div className="drawer-foot"><button className="btn btn-line" onClick={() => setAbandonOpen(false)} autoFocus>Continue Battle</button><button className="btn btn-hazard" onClick={abandonBattle} disabled={busy}><Hammer size={15} /> Abandon Battle</button></div></aside></PortalLayer>}
    </div>
  );
}
