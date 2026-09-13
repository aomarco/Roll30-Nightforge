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
import { footprintSize } from "../domain/geometry.js";
import { generatedId } from "../application/generatedId.js";
import {
  ATTACK_KIND_REACTION,
  attackTargetEligibility,
  bonusAttackAvailability,
  buildAttackRangeBands,
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
import CheckPanel from "./CheckPanel.jsx";
import RollLogPanel from "./RollLogPanel.jsx";

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

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
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

function DifficultTerrainLayer({ cells = [] }) {
  if (!cells.length) return null;
  return (
    <div className="nf-state-table-terrain" aria-label={`${cells.length} difficult terrain squares`}>
      {cells.map((key) => {
        const [column, row] = key.split(":").map(Number);
        return <i key={key} style={{ left: `${column * 5}%`, top: `${row * (100 / 12)}%`, width: "5%", height: `${100 / 12}%` }} />;
      })}
    </div>
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
                <button className={`btn ${activeTool === "wall-three-quarters" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("wall-three-quarters")}><PenLine size={15} /> Draw high-cover wall</button>
                <button className={`btn ${activeTool === "ruler" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("ruler")}><Ruler size={15} /> Ruler</button>
                <button className={`btn ${activeTool === "terrain" ? "btn-key" : "btn-line"}`} onClick={() => chooseTool("terrain")}><Grid3x3 size={15} /> Paint terrain</button>
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

import { useTableController } from "./useTableController.js";

export default function TableScreen(props) {
  const {
    scene,
    mode,
    go,
    setMode,
    onUpdate,
    onAwardExperience,
    heroes,
    rollLog = [],
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
    monsterReview,
    reviewSelectedMonster,
    applySelectedMonsterSource,
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
  } = useTableController(props);
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
            <DifficultTerrainLayer cells={scene?.difficultTerrain || []} />
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
              const tacticTargetable = Boolean((helpDraft || readyDraft || specialDraft) && active && token.faction !== active.faction && token.hp > 0);
              const conditions = token.conditions.map(conditionById).filter(Boolean);
              const embedded = embeddedByCarrier[token.id] || [];
              return (
              <button
                key={token.id}
                className={`piece${selectedId === token.id ? " on" : ""}${isActiveBattle && token.id === active?.id ? " acting" : ""}${token.hidden ? " nf-state-table-hidden" : ""}${tokenPreview?.id === token.id && tokenPreview.blocked ? " blocked" : ""}${arrivalId === token.id ? " nf-state-table-arriving" : ""}${targetState?.ok || tacticTargetable ? " nf-state-table-targetable" : ""}${isBattle && token.hp <= 0 ? " nf-state-token-down" : ""}${impact?.targetId === token.id ? ` nf-state-table-hit${impact.critical ? " nf-state-table-critical" : ""}` : ""}`}
                style={{ left: `${token.position.xPercent}%`, top: `${token.position.yPercent}%`, "--piece": token.color, "--nf-token-size": `${sceneSize.cellSize * footprintSize(token.size).columns * 0.82}px` }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onKeyDown={(event) => onTokenKeyDown(event, token)}
                onClick={(event) => { event.stopPropagation(); if (attackDraft) resolveAttackTarget(token.id); else if (helpDraft) confirmHelp(token.id); else if (readyDraft) confirmReady(token.id); else if (specialDraft) confirmSpecialAttack(token.id); else { setSelectedId(token.id); setSelectedChestId(null); } }}
                aria-label={attackDraft ? targetState?.ok ? `Attack ${token.name}` : `${token.name} unavailable as target` : helpDraft ? `Help ${helpDraft.allyName} against ${token.name}` : readyDraft ? `Ready against ${token.name}` : specialDraft ? `${specialDraft.kind} ${token.name}` : `${token.name}${isPlay || isSetup || (isActiveBattle && token.id === active?.id) ? ", use arrow keys to move" : ""}`}
              >
                <span className="piece-disc">{initials(token.name)}</span>
                {isBattle && token.hp <= 0 && (
                  <span className="nf-state-token-down-mark" aria-hidden="true"><X size={26} strokeWidth={3.2} /></span>
                )}
                <span className="piece-name">{token.name}</span>
                {isBattle && <span className="piece-hp"><i style={{ width: `${(token.hp / token.maxHp) * 100}%`, background: healthTone(token.hp, token.maxHp) }} /></span>}
                {isBattle && conditions.length > 0 && <span className="nf-state-table-condition-badges" aria-label={`${conditions.length} conditions`}>{conditions.map((condition) => <i key={condition.id} title={`${condition.name}: ${condition.note}`} style={{ "--nf-condition": condition.color }}>{condition.abbreviation}</i>)}</span>}
                {isBattle && token.hidden && <span className="nf-state-table-hidden-badge" title={`Hidden from ${token.hiddenFromTokenIds.length} token${token.hiddenFromTokenIds.length === 1 ? "" : "s"}`}><EyeOff size={10} /> {token.hiddenFromTokenIds.length}</span>}
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
          <button className="tag tag-brass nf-state-table-tools-trigger" onClick={() => setDrawerOpen(true)} title={`Table tools — ${sceneSize.feetPerCell} ft grid`} aria-label={`Table tools — ${sceneSize.feetPerCell} ft grid`}><Grid3x3 size={12} /> {sceneSize.feetPerCell} ft</button>
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
      {helpDraft && <div className="nf-state-table-tool-status nf-state-table-help-status glass grained" role="status"><span className="tag tag-brass">Helping {helpDraft.allyName} · choose the enemy they are going for</span><button className="glyph" onClick={() => setHelpDraft(null)} title="Cancel Help" aria-label="Cancel Help"><X size={15} /></button></div>}
      {readyDraft && <div className="nf-state-table-tool-status nf-state-table-help-status glass grained" role="status"><span className="tag tag-brass">Readying {readyDraft.attackName || "an attack"} · choose the triggering enemy</span><button className="glyph" onClick={() => setReadyDraft(null)} title="Cancel Ready" aria-label="Cancel Ready"><X size={15} /></button></div>}
      {specialDraft && <div className="nf-state-table-tool-status nf-state-table-help-status glass grained" role="status"><span className="tag tag-brass">{specialDraft.kind === "grapple" ? "Grapple" : specialDraft.kind === "shove-prone" ? "Shove prone" : "Push 5 feet"} · choose an adjacent enemy</span><button className="glyph" onClick={() => setSpecialDraft(null)} title="Cancel contested attack" aria-label="Cancel contested attack"><X size={15} /></button></div>}
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
          {isBattle && (<>
            {isActiveBattle && <button type="button" className="glyph" onClick={rerollInitiative} disabled={busy || combatLocked} title="Reroll initiative for every creature" aria-label="Reroll initiative"><RotateCcw size={14} /></button>}
            <span className="nf-state-initiative-round" title={`Round ${scene.encounter.round}`}>
              <em>Round</em>
              <strong className="numeral">{scene.encounter.round}</strong>
            </span>
          </>)}
        </header>
        {isBattle ? (
          <div className="dock-body nf-state-initiative">
            <ol className="nf-state-initiative-list">
              {orderedTokens.map((token, index) => (
                <li key={token.id} className="nf-state-initiative-entry">
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
                  {isActiveBattle && (
                    <span className="nf-state-initiative-edit">
                      <input key={`${token.id}-${scene.encounter.initiatives[token.id]}`} type="number" min="-99" max="99" defaultValue={scene.encounter.initiatives[token.id]} disabled={busy || combatLocked} aria-label={`${token.name} initiative`} onBlur={(event) => editInitiative(token.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                      <button type="button" className="glyph" aria-label={`Move ${token.name} up in tied initiative`} title="Move up within this tie" disabled={busy || combatLocked || index === 0 || scene.encounter.initiatives[orderedTokens[index - 1]?.id] !== scene.encounter.initiatives[token.id]} onClick={() => reorderTiedInitiative(token.id, "up")}>↑</button>
                      <button type="button" className="glyph" aria-label={`Move ${token.name} down in tied initiative`} title="Move down within this tie" disabled={busy || combatLocked || index === orderedTokens.length - 1 || scene.encounter.initiatives[orderedTokens[index + 1]?.id] !== scene.encounter.initiatives[token.id]} onClick={() => reorderTiedInitiative(token.id, "down")}>↓</button>
                    </span>
                  )}
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
            changeChestCoins={changeSelectedChestCoins}
            removeChest={removeSelectedSetupChest}
            monsterReview={monsterReview}
            reviewMonsterSource={reviewSelectedMonster}
            applyMonsterSource={applySelectedMonsterSource}
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
              <>
                <section className="unit"><div className="unit-top"><span className="unit-label">Free position</span><span className="tag tag-jade">No turn limits</span></div><div className="nf-state-table-position"><span>X <strong className="numeral">{selected.position.xPercent.toFixed(1)}%</strong></span><span>Y <strong className="numeral">{selected.position.yPercent.toFixed(1)}%</strong></span></div><p className="note">Drag this token directly on the Table. No grid snapping or combat resources apply in Play.</p></section>
                <CheckPanel actorName={selected.name} disabled={busy} onRoll={(specification) => rollTokenCheck(selected.id, specification)} />
                <RollLogPanel entries={rollLog} sceneId={scene?.id} />
              </>
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
                activeToken={active}
                forceMove={forceSelected}
                changeCoins={changeBattleCoins}
                round={scene.encounter.round}
              />
            )}
            {isPlay && <button className="btn btn-hazard btn-sm btn-wide" onClick={removeSelectedPlayToken} disabled={busy}><Trash2 size={15} /> Remove token</button>}
          </div>
        </> : selectedChest ? <><header className="dock-head"><span className="sigil sigil-lg nf-state-table-chest-sigil"><Package size={18} /></span><div><span className="kicker">Selected chest</span><h2>Battle chest</h2></div></header><div className="dock-body"><section className="unit"><div className="unit-top"><span className="unit-label">Contents</span><span className={`tag ${selectedChestHasContents ? "tag-brass" : ""}`}>{selectedChestHasContents ? isActiveBattle ? "Bonus Action" : "Final state" : "Empty"}</span></div><div className="nf-state-table-chest-owned">{!coinsAreEmpty(selectedChest.coins) && <span><strong>Coins</strong><em className="numeral">{formatCoins(selectedChest.coins)}</em></span>}{selectedChest.inventory.map((entry) => <span key={entry.itemId}><strong>{getItem(entry.itemId)?.name || entry.itemId}</strong><em className="numeral">×{entry.quantity}</em></span>)}{!selectedChestHasContents && <p className="note">This chest is empty.</p>}</div><p className="note">Chest movement and Setup editing stay locked. An adjacent active token can open it through the Bonus command; depleted contents persist through restart.</p></section></div></> : <div className="void-state"><span className="void-orb"><CircleDot size={26} /></span><h3>Nothing selected</h3><p>Pick a token on the map or in the cast list to inspect it.</p></div>}
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
          tacticState={tacticState}
          hideState={hideState}
          readyState={readyState}
          potionState={potionState}
          helpState={helpState}
          stabilizeState={stabilizeState}
          dodge={useDodge}
          disengage={useDisengage}
          hide={useHide}
          help={startHelp}
          stabilize={stabilizeToken}
          ready={startReady}
          specialAttack={startSpecialAttack}
          grappleState={grappleState}
          escapeGrapple={tryEscapeGrapple}
          releaseGrapple={letGoOfGrapple}
          drinkPotion={drinkPotion}
          movementModes={movementModes}
          chooseMovementMode={changeMovementMode}
          rollDeath={rollTokenDeathSave}
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
      {lootChest && isActiveBattle && <ChestLootDrawer chest={lootChest} busy={busy || combatLocked} error={visibleError} take={takeChestItem} takeCoin={takeChestCoin} close={() => setLootChestId(null)} />}
      {lootBody && isActiveBattle && <ChestLootDrawer chest={lootBody} body busy={busy || combatLocked} error={visibleError} take={takeBodyItem} takeCoin={takeBodyCoin} close={() => setLootTokenId(null)} />}
      {cinematic && <AttackCinematic cinematic={cinematic} skip={skipCinematic} />}
      {checkCinematic && <CheckCinematic cinematic={checkCinematic} skip={skipCheckCinematic} />}
      {retrievalCinematic && <RetrievalCinematic cinematic={retrievalCinematic} />}
    </div>
  );
}
