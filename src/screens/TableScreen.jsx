import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  CircleDot,
  Eye,
  EyeOff,
  Grid3x3,
  Hammer,
  LayoutGrid,
  Minus,
  Move,
  Package,
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
  normalizeMapView,
  normalizeTableTokens,
  prepareBattleStart,
  removeChest,
  removeToken,
  rulerDistanceFeet,
  setArtworkScale,
  snapSetupPosition,
  updateChest,
  updateToken,
  zoomCameraAt,
  zoomCameraAtViewportCenter,
} from "../domain/table.js";
import { Pip } from "../ui/Glyphs.jsx";
import BattleSetupInspector from "./BattleSetupInspector.jsx";

const CONDITIONS = [
  "Blinded", "Charmed", "Frightened", "Grappled", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious",
];

const okay = () => ({ ok: true });
const initials = (name) => String(name || "?").slice(0, 2).toUpperCase();
const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the change."}` : "";

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
      return () => {};
    }
    let active = true;
    let objectUrl = null;
    setState({ url: null, error: null });
    if (!scene?.artworkKey || !artworkRepository) return () => {};
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
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside className="drawer nf-state-table-tools-drawer" role="dialog" aria-modal="true" aria-labelledby="table-tools-title">
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
  suppliedArtworkUrl = null,
}) {
  const isPlay = scene?.kind === "play" || mode === "play";
  const isBattle = !isPlay && Boolean(scene?.encounter);
  const isSetup = !isPlay && !isBattle;
  const mapRef = useRef(null);
  const worldRef = useRef(null);
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
  const [localError, setLocalError] = useState(null);
  const { url: artworkUrl, error: artworkError } = useArtworkUrl(scene, artworkRepository, suppliedArtworkUrl);
  const busy = persistence.status === "saving";
  const tableTokens = useMemo(() => normalizeTableTokens(scene?.tokens), [scene?.tokens]);
  const playTokens = tableTokens;
  const chests = useMemo(() => normalizeChests(scene?.chests), [scene?.chests]);
  const visibleTokens = tableTokens.map((token) => tokenPreview?.id === token.id ? { ...token, position: tokenPreview.position } : token);
  const visibleChests = chests.map((chest) => chestPreview?.id === chest.id ? { ...chest, position: chestPreview.position } : chest);
  const activeId = scene?.encounter?.initiativeOrder?.[scene?.encounter?.activeIndex || 0];
  const active = tableTokens.find((token) => token.id === activeId) || tableTokens[0] || null;
  const selected = visibleTokens.find((token) => token.id === selectedId) || null;
  const selectedChest = visibleChests.find((chest) => chest.id === selectedChestId) || null;
  const visibleError = localError || persistence.error || artworkError;
  const walls = scene?.walls || [];
  const wallsVisible = scene?.wallsVisible !== false;
  const canAdjustArtwork = Boolean(artworkUrl || scene?.blankCanvas);
  const rulerFeet = rulerDraft && worldRef.current
    ? rulerDistanceFeet(rulerDraft.start, rulerDraft.end, { width: worldRef.current.offsetWidth, height: worldRef.current.offsetHeight, gridSize: scene?.gridSize })
    : 0;

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
    setLocalError(null);
  }, [scene?.id]);

  useEffect(() => {
    if (!interaction || interaction.kind !== "artwork") setMapView(normalizeMapView(scene?.mapView));
  }, [scene?.mapView?.scale, scene?.mapView?.x, scene?.mapView?.y]);

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
    const wall = createWall({ id: wallIdFactory(), type: wallDraft.type, points: wallDraft.points });
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
  }, [abandonOpen, activeTool, drawerOpen, wallDraft, walls]);

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
    if (event.button !== 0) return;
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
    if ((!isPlay && !isSetup) || activeTool || event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(token.id);
    setSelectedChestId(null);
    const pointer = localPoint(event);
    capturePointer(event.pointerId);
    setInteraction({
      kind: "token",
      pointerId: event.pointerId,
      tokenId: token.id,
      offset: {
        xPercent: token.position.xPercent - pointer.xPercent,
        yPercent: token.position.yPercent - pointer.yPercent,
      },
    });
  };

  const onChestPointerDown = (event, chest) => {
    if (!isSetup || activeTool || event.button !== 0) return;
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
    setInteraction(null);
    try { mapRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture is optional */ }
  };

  const onMapPointerCancel = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "artwork") setMapView(normalizeMapView(scene?.mapView));
    if (interaction.kind === "token") setTokenPreview(null);
    if (interaction.kind === "chest") setChestPreview(null);
    if (interaction.kind === "ruler") setRulerDraft(null);
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
    const token = createPlayToken({ id: tokenIdFactory(), ordinal: playTokens.length });
    const result = savePatch({ tokens: [...playTokens, token] });
    if (result.ok) setSelectedId(token.id);
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
    const id = tokenIdFactory();
    const hero = heroes.find((entry) => entry.id === summonChoice);
    const token = hero
      ? createHeroTokenSnapshot(hero, { id, ordinal: tableTokens.length, position })
      : createManualToken({ id, ordinal: tableTokens.length, position });
    const result = savePatch({ tokens: [...tableTokens, token] });
    if (result.ok) {
      setSelectedId(token.id);
      setSelectedChestId(null);
    }
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
    const chest = createChest({ id: chestIdFactory(), position });
    const result = savePatch({ chests: [...chests, chest] });
    if (result.ok) {
      setSelectedChestId(chest.id);
      setSelectedId(null);
    }
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

  return (
    <div className={`table nf-state-table-root${busy ? " nf-state-busy" : ""}`}>
      <div
        className={`map nf-state-table-map${activeTool ? ` nf-state-table-tool-${activeTool}` : ""}`}
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
            {!isPlay && visibleChests.map((chest) => (
              <button
                key={chest.id}
                className={`nf-state-table-chest${selectedChestId === chest.id ? " on" : ""}${chestPreview?.id === chest.id && chestPreview.blocked ? " blocked" : ""}`}
                style={{ left: `${chest.position.xPercent}%`, top: `${chest.position.yPercent}%` }}
                onPointerDown={(event) => onChestPointerDown(event, chest)}
                onClick={(event) => { event.stopPropagation(); setSelectedChestId(chest.id); setSelectedId(null); }}
                aria-label={`Chest with ${chest.inventory.reduce((total, entry) => total + entry.quantity, 0)} items`}
              >
                <Package size={18} />
                <span className="nf-state-table-chest-count numeral">{chest.inventory.reduce((total, entry) => total + entry.quantity, 0)}</span>
              </button>
            ))}
            {visibleTokens.map((token) => (
              <button
                key={token.id}
                className={`piece${selectedId === token.id ? " on" : ""}${isBattle && token.id === active?.id ? " acting" : ""}${tokenPreview?.id === token.id && tokenPreview.blocked ? " blocked" : ""}`}
                style={{ left: `${token.position.xPercent}%`, top: `${token.position.yPercent}%`, "--piece": token.color }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onClick={(event) => { event.stopPropagation(); setSelectedId(token.id); setSelectedChestId(null); }}
                aria-label={token.name}
              >
                <span className="piece-disc">{initials(token.name)}</span>
                <span className="piece-name">{token.name}</span>
                {isBattle && <span className="piece-hp"><i style={{ width: `${(token.hp / token.maxHp) * 100}%`, background: healthTone(token.hp, token.maxHp) }} /></span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hud hud-tl glass grained">
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps"><ChevronLeft size={18} /></button>
        <span className="hud-div" />
        <div className="hud-scene"><span className="kicker">{scene?.name || "Untitled scene"}</span><strong>{isPlay ? "Free play" : isBattle ? `Round ${scene.encounter.round} · ${active?.name || "Token"}'s turn` : "Setup mode"}</strong></div>
      </div>

      <div className="hud hud-tc glass grained">
        <div className="phase">
          {isPlay ? <button className="on" disabled aria-current="page"><Sparkles size={14} /> Play</button> : <><button className={isSetup ? "on" : ""} onClick={() => isBattle ? setAbandonOpen(true) : setMode("setup")}><Hammer size={14} /> Setup</button><button className={isBattle ? "on" : ""} onClick={isSetup ? beginBattle : undefined} disabled={busy}><Swords size={14} /> Battle</button></>}
        </div>
      </div>

      <div className="hud hud-tr glass grained">
        <button className="tag tag-brass nf-state-table-tools-trigger" onClick={() => setDrawerOpen(true)} title="Table tools — 5 ft grid" aria-label="Table tools — 5 ft grid"><Grid3x3 size={12} /> 5 ft</button>
        <span className="hud-div" />
        <button className="glyph" onClick={() => go({ page: "settings", returnTo: { page: "board", mode } })} title="Scene settings"><SlidersHorizontal size={17} /></button>
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps"><LayoutGrid size={17} /></button>
      </div>

      {toolLabel && <div className="nf-state-table-tool-status glass grained" role="status"><span className="tag tag-jade">{toolLabel}</span><button className="glyph" onClick={exitTool} title="Exit current tool" aria-label="Exit current tool"><X size={15} /></button></div>}
      {visibleError && !drawerOpen && <div className="nf-state-table-error glass" role="alert"><strong>Table change not saved</strong><span>{errorText(visibleError)}</span></div>}

      <aside className="dock dock-left glass grained">
        <header className="dock-head"><div><span className="kicker kicker-jade">{isPlay ? "Free play" : "Encounter"}</span><h2>{isPlay ? "Build the cast" : isBattle ? "Battle running" : "Build the scene"}</h2></div></header>
        <div className="dock-body">
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Summon a token</span></div>
            <select className="sel" value={isPlay ? "" : summonChoice} onChange={(event) => setSummonChoice(event.target.value)} disabled={isBattle}>
              <option value="">Blank token</option>
              {!isPlay && heroes.map((hero) => <option value={hero.id} key={hero.id}>{hero.name}</option>)}
            </select>
            <button className="btn btn-key btn-sm btn-wide" onClick={isPlay ? addPlayToken : addSetupToken} disabled={busy || isBattle}><Plus size={15} strokeWidth={2.4} /> Add to map</button>
            {isSetup && <button className="btn btn-line btn-sm btn-wide" onClick={placeSetupChest} disabled={busy}><Package size={14} /> Place a chest</button>}
            {isBattle && <p className="note">Token and chest creation are locked while this Battle is active.</p>}
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
              <section className="unit"><div className="unit-top"><span className="unit-label">Conditions</span><span className="tag">Phase 9</span></div><div className="afflict">{CONDITIONS.map((condition) => <button key={condition} type="button" className="toggle-chip" disabled title="Condition controls arrive in Phase 9">{condition}</button>)}</div></section>
              <form className="unit" onSubmit={(event) => event.preventDefault()}><div className="unit-top"><span className="unit-label">Adjust stat</span><span className="tag">Locked</span></div><div className="console-row"><select className="sel" defaultValue="hp" disabled><option value="hp">HP</option><option value="maxHp">Max HP</option><option value="ac">AC</option><option value="speed">Speed</option></select><input className="inp" placeholder="+5 / −5" inputMode="numeric" disabled /></div><button className="btn btn-key btn-sm btn-wide" type="submit" disabled>Apply adjustment</button></form>
            </>}
            <button className="btn btn-hazard btn-sm btn-wide" onClick={isPlay ? removeSelectedPlayToken : undefined} disabled={busy || isBattle} title={isBattle ? "Tokens cannot be removed during an active Battle" : undefined}><Trash2 size={15} /> Remove token</button>
          </div>
        </> : selectedChest ? <><header className="dock-head"><span className="sigil sigil-lg nf-state-table-chest-sigil"><Package size={18} /></span><div><span className="kicker">Selected chest</span><h2>Battle chest</h2></div></header><div className="dock-body"><section className="unit"><div className="unit-top"><span className="unit-label">Contents</span><span className="tag">Locked in Battle</span></div><div className="nf-state-table-chest-owned">{selectedChest.inventory.map((entry) => <span key={entry.itemId}><strong>{getItem(entry.itemId)?.name || entry.itemId}</strong><em className="numeral">×{entry.quantity}</em></span>)}{!selectedChest.inventory.length && <p className="note">This chest is empty.</p>}</div><p className="note">Chest movement and inventory editing are disabled after Battle begins.</p></section></div></> : <div className="void-state"><span className="void-orb"><CircleDot size={26} /></span><h3>Nothing selected</h3><p>Pick a token on the map or in the cast list to inspect it.</p></div>}
      </aside>

      {isBattle && active && <div className="track glass grained"><div className="track-round"><span className="kicker kicker-brass">Round</span><strong className="numeral">{scene.encounter.round}</strong></div><div className="track-div" /><ol className="track-order">{orderedTokens.map((token, index) => <li key={token.id} className={index === scene.encounter.activeIndex ? "now" : ""}><span className="track-face" style={{ background: token.color }}>{initials(token.name)}</span><span className="track-name">{token.name}</span><span className="track-init numeral">{scene.encounter.initiatives[token.id]}</span></li>)}</ol><div className="track-div" /><div className="track-res"><div className="res-move"><span className="kicker"><Wind size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Movement</span><strong className="numeral">{activeResources?.movementBase || active.baseSpeed} / {active.baseSpeed} ft</strong><div className="meter" style={{ marginTop: 6 }}><i style={{ width: "100%" }} /></div></div><div className="res-pips"><span className="pip-key" title="Action behavior arrives in Phase 8"><Swords size={13} /><em>Action</em></span><span className="pip-key" title="Bonus behavior arrives in Phase 9"><ShieldHalf size={13} /><em>Bonus</em></span></div></div></div>}

      {drawerOpen && <TableToolsDrawer isPlay={isPlay} camera={camera} mapView={mapView} activeTool={activeTool} wallDraft={wallDraft} wallsVisible={wallsVisible} canAdjustArtwork={canAdjustArtwork} busy={busy} error={visibleError} close={() => setDrawerOpen(false)} zoomBy={zoomBy} resetCamera={() => setCamera({ ...DEFAULT_CAMERA })} chooseTool={chooseTool} scaleArtwork={scaleArtwork} resetArtwork={resetArtwork} finishWall={finishWall} cancelWall={cancelWall} toggleWalls={() => savePatch({ wallsVisible: !wallsVisible })} exitTool={exitTool} />}
      {abandonOpen && <PortalLayer><div className="veil" onClick={() => setAbandonOpen(false)} /><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="abandon-battle-title"><div className="drawer-top"><div><span className="kicker">Return to Setup</span><h2 id="abandon-battle-title">Abandon this encounter?</h2></div><button className="glyph" onClick={() => setAbandonOpen(false)} aria-label="Close"><X size={17} /></button></div><div className="drawer-body">{visibleError && <div className="nf-state-inline-error" role="alert"><strong>Battle not abandoned</strong><span>{errorText(visibleError)}</span></div>}<p className="prose">Return <strong>{scene?.name}</strong> to editable Battle Setup?</p><p className="note">Current token HP and positions are preserved. Initiative, turn resources, and physical battle items are cleared.</p></div><div className="drawer-foot"><button className="btn btn-line" onClick={() => setAbandonOpen(false)} autoFocus>Continue Battle</button><button className="btn btn-hazard" onClick={abandonBattle} disabled={busy}><Hammer size={15} /> Abandon Battle</button></div></aside></PortalLayer>}
    </div>
  );
}
