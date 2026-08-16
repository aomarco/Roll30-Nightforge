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

import {
  adjustArtworkBy,
  clientPointToPercent,
  createPlayToken,
  createWall,
  DEFAULT_CAMERA,
  DEFAULT_MAP_VIEW,
  midpointPercent,
  normalizeCamera,
  normalizeMapView,
  normalizeTableTokens,
  removeToken,
  rulerDistanceFeet,
  setArtworkScale,
  updateToken,
  zoomCameraAt,
  zoomCameraAtViewportCenter,
} from "../domain/table.js";
import { Pip } from "../ui/Glyphs.jsx";

const BATTLE_PROTOTYPE_TOKENS = [
  { id: "1", name: "Thorin", color: "#d9803f", hp: 24, maxHp: 28, ac: 19, baseSpeed: 30, position: { xPercent: 32, yPercent: 44 }, type: "pc" },
  { id: "2", name: "Elara", color: "#5fa8f5", hp: 9, maxHp: 12, ac: 12, baseSpeed: 30, position: { xPercent: 52, yPercent: 58 }, type: "pc" },
  { id: "3", name: "Goblin", color: "#7fb356", hp: 7, maxHp: 7, ac: 15, baseSpeed: 30, position: { xPercent: 68, yPercent: 36 }, type: "enemy" },
];

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
  artworkRepository = null,
  persistence = { status: "idle", error: null },
  tokenIdFactory = () => `token-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  wallIdFactory = () => `wall-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  initialCamera = DEFAULT_CAMERA,
  initialDrawerOpen = false,
  initialTool = null,
  initialRulerDraft = null,
  initialWallDraft = null,
  suppliedArtworkUrl = null,
}) {
  const isPlay = scene?.kind === "play" || mode === "play";
  const isBattle = !isPlay && mode === "battle";
  const mapRef = useRef(null);
  const worldRef = useRef(null);
  const [camera, setCamera] = useState(() => normalizeCamera(initialCamera));
  const [mapView, setMapView] = useState(() => normalizeMapView(scene?.mapView));
  const [selectedId, setSelectedId] = useState(() => isPlay ? scene?.tokens?.[0]?.id || null : "1");
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [activeTool, setActiveTool] = useState(initialTool);
  const [interaction, setInteraction] = useState(null);
  const [tokenPreview, setTokenPreview] = useState(null);
  const [wallDraft, setWallDraft] = useState(initialWallDraft);
  const [wallHover, setWallHover] = useState(null);
  const [rulerDraft, setRulerDraft] = useState(initialRulerDraft);
  const [localError, setLocalError] = useState(null);
  const { url: artworkUrl, error: artworkError } = useArtworkUrl(scene, artworkRepository, suppliedArtworkUrl);
  const busy = persistence.status === "saving";
  const playTokens = useMemo(() => normalizeTableTokens(scene?.tokens), [scene?.tokens]);
  const tableTokens = isPlay ? playTokens : BATTLE_PROTOTYPE_TOKENS;
  const visibleTokens = tableTokens.map((token) => tokenPreview?.id === token.id ? { ...token, position: tokenPreview.position } : token);
  const active = tableTokens[0] || null;
  const selected = visibleTokens.find((token) => token.id === selectedId) || null;
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
    setSelectedId(isPlay ? scene?.tokens?.[0]?.id || null : "1");
    setDrawerOpen(false);
    setActiveTool(null);
    setInteraction(null);
    setTokenPreview(null);
    setWallDraft(null);
    setWallHover(null);
    setRulerDraft(null);
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
      if (activeTool?.startsWith("wall-") && wallDraft?.points?.length) {
        finishWall();
        return;
      }
      if (drawerOpen) setDrawerOpen(false);
      else if (activeTool) exitTool();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTool, drawerOpen, wallDraft, walls]);

  const localPoint = (event) => {
    const rect = worldRef.current?.getBoundingClientRect();
    return rect ? clientPointToPercent({ x: event.clientX, y: event.clientY }, rect) : { xPercent: 50, yPercent: 50 };
  };

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
    if (!isPlay || activeTool || event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(token.id);
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
      setTokenPreview({
        id: interaction.tokenId,
        position: { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent },
      });
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
      const position = { xPercent: point.xPercent + interaction.offset.xPercent, yPercent: point.yPercent + interaction.offset.yPercent };
      savePatch({ tokens: updateToken(playTokens, interaction.tokenId, { position }) });
      setTokenPreview(null);
    }
    setInteraction(null);
    try { mapRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture is optional */ }
  };

  const onMapPointerCancel = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "artwork") setMapView(normalizeMapView(scene?.mapView));
    if (interaction.kind === "token") setTokenPreview(null);
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

  const toolLabel = activeTool === "artwork"
    ? "Drag the Table to adjust artwork"
    : activeTool === "wall-full"
      ? "Click points for a full wall · Escape to finish"
      : activeTool === "wall-half"
        ? "Click points for a half-wall · Escape to finish"
        : activeTool === "ruler"
          ? "Drag across the Table to measure"
          : null;

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
            {visibleTokens.map((token) => (
              <button
                key={token.id}
                className={`piece${selectedId === token.id ? " on" : ""}${isBattle && token.id === active?.id ? " acting" : ""}`}
                style={{ left: `${token.position.xPercent}%`, top: `${token.position.yPercent}%`, "--piece": token.color }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onClick={(event) => { event.stopPropagation(); setSelectedId(token.id); }}
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
        <div className="hud-scene"><span className="kicker">{scene?.name || "Untitled scene"}</span><strong>{isPlay ? "Free play" : isBattle ? `Round 1 · ${active?.name || "Token"}'s turn` : "Setup mode"}</strong></div>
      </div>

      <div className="hud hud-tc glass grained">
        <div className="phase">
          {isPlay ? <button className="on" disabled aria-current="page"><Sparkles size={14} /> Play</button> : <><button className={!isBattle ? "on" : ""} onClick={() => setMode("setup")}><Hammer size={14} /> Setup</button><button className={isBattle ? "on" : ""} onClick={() => setMode("battle")}><Swords size={14} /> Battle</button></>}
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
            <select className="sel" defaultValue=""><option value="">Blank token</option>{!isPlay && <><option>Thorin</option><option>Elara</option></>}</select>
            <button className="btn btn-key btn-sm btn-wide" onClick={isPlay ? addPlayToken : okay} disabled={busy}><Plus size={15} strokeWidth={2.4} /> Add to map</button>
            {!isBattle && !isPlay && <button className="btn btn-line btn-sm btn-wide" onClick={okay}><Package size={14} /> Place a chest</button>}
          </section>
          <section className="unit">
            <div className="unit-top"><span className="unit-label">On the map</span><span className="tag numeral">{tableTokens.length}</span></div>
            <div className="cast">
              {tableTokens.map((token) => <button key={token.id} className={`cast-row${selectedId === token.id ? " on" : ""}`} onClick={() => setSelectedId(token.id)}><span className="sigil" style={{ background: token.color }}>{initials(token.name)}</span><span className="cast-meta"><strong>{token.name}</strong><small>{isBattle ? `${token.hp}/${token.maxHp} HP` : "On map"}</small></span><Pip tone={token.type === "enemy" ? "foe" : "ally"} /></button>)}
              {!tableTokens.length && <p className="note">No tokens are on this Table yet.</p>}
            </div>
          </section>
          {!isBattle && !isPlay && <p className="whisper">Arrange the scene, then switch to Battle to roll initiative.</p>}
          {isPlay && <p className="whisper">Drag tokens freely across the Table. Camera position and ruler marks remain view-only.</p>}
        </div>
      </aside>

      <aside className="dock dock-right glass grained">
        {selected ? <><header className="dock-head"><span className="sigil sigil-lg" style={{ background: selected.color }}>{initials(selected.name)}</span><div><span className="kicker">Selected token</span><h2>{selected.name}</h2></div></header><div className="dock-body">
          <label className="field"><span className="label">Name</span><input className="inp" value={selected.name} readOnly /></label>
          {isPlay ? <section className="unit"><div className="unit-top"><span className="unit-label">Free position</span><span className="tag tag-jade">No turn limits</span></div><div className="nf-state-table-position"><span>X <strong className="numeral">{selected.position.xPercent.toFixed(1)}%</strong></span><span>Y <strong className="numeral">{selected.position.yPercent.toFixed(1)}%</strong></span></div><p className="note">Drag this token directly on the Table. No grid snapping or combat resources apply in Play.</p></section> : isBattle ? <>
            <section className="unit"><div className="unit-top"><span className="unit-label">Vitals</span></div><div className="quad"><div className="quad-cell"><span>HP</span><strong className="numeral">{selected.hp}</strong></div><div className="quad-cell"><span>Max HP</span><strong className="numeral">{selected.maxHp}</strong></div><div className="quad-cell"><span>AC</span><strong className="numeral">{selected.ac}</strong></div><div className="quad-cell"><span>Speed</span><strong className="numeral">{selected.baseSpeed}</strong></div></div><div className="vitalbar"><div className="vitalbar-top"><span>Health</span><strong className="numeral">{selected.hp} / {selected.maxHp}</strong></div><div className="meter"><i style={{ width: `${(selected.hp / selected.maxHp) * 100}%`, background: healthTone(selected.hp, selected.maxHp), boxShadow: `0 0 12px ${healthTone(selected.hp, selected.maxHp)}` }} /></div></div></section>
            <section className="unit"><div className="unit-top"><span className="unit-label">Conditions</span><span className="tag">None</span></div><div className="afflict">{CONDITIONS.map((condition) => <button key={condition} type="button" className="toggle-chip" onClick={okay}>{condition}</button>)}</div></section>
            <form className="unit" onSubmit={(event) => event.preventDefault()}><div className="unit-top"><span className="unit-label">Adjust stat</span></div><div className="console-row"><select className="sel" defaultValue="hp"><option value="hp">HP</option><option value="maxHp">Max HP</option><option value="ac">AC</option><option value="speed">Speed</option></select><input className="inp" placeholder="+5 / −5" inputMode="numeric" /></div><button className="btn btn-key btn-sm btn-wide" type="submit">Apply adjustment</button></form>
          </> : <section className="unit"><div className="unit-top"><span className="unit-label">Starting stats</span></div><p className="note" style={{ marginTop: -4 }}>Set this token&apos;s opening values before the fight begins.</p><div className="grid-fields">{[["HP", selected.hp], ["Max HP", selected.maxHp], ["Speed (ft)", selected.baseSpeed], ["Strength", 16], ["Dexterity", 12], ["Level", 3]].map(([label, value]) => <div className="micro" key={label}><label>{label}</label><input className="inp" type="number" defaultValue={value} /></div>)}<div className="micro wide"><label>Initiative bonus</label><input className="inp" type="number" defaultValue={1} /></div><div className="micro wide"><label>Creature size</label><select className="sel" defaultValue="medium"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div></div></section>}
          <button className="btn btn-hazard btn-sm btn-wide" onClick={isPlay ? removeSelectedPlayToken : okay} disabled={busy}><Trash2 size={15} /> Remove token</button>
        </div></> : <div className="void-state"><span className="void-orb"><CircleDot size={26} /></span><h3>Nothing selected</h3><p>Pick a token on the map or in the cast list to edit its details.</p></div>}
      </aside>

      {isBattle && active && <div className="track glass grained"><div className="track-round"><span className="kicker kicker-brass">Round</span><strong className="numeral">1</strong></div><div className="track-div" /><ol className="track-order">{tableTokens.map((token, index) => <li key={token.id} className={index === 0 ? "now" : ""}><span className="track-face" style={{ background: token.color }}>{initials(token.name)}</span><span className="track-name">{token.name}</span><span className="track-init numeral">{20 - index * 4}</span></li>)}</ol><div className="track-div" /><div className="track-res"><div className="res-move"><span className="kicker"><Wind size={11} style={{ verticalAlign: -1, marginRight: 5 }} />Movement</span><strong className="numeral">30 / 30 ft</strong><div className="meter" style={{ marginTop: 6 }}><i style={{ width: "100%" }} /></div></div><div className="res-pips"><span className="pip-key" title="Action available"><Swords size={13} /><em>Action</em></span><span className="pip-key" title="Bonus Action available"><ShieldHalf size={13} /><em>Bonus</em></span></div></div></div>}

      {drawerOpen && <TableToolsDrawer isPlay={isPlay} camera={camera} mapView={mapView} activeTool={activeTool} wallDraft={wallDraft} wallsVisible={wallsVisible} canAdjustArtwork={canAdjustArtwork} busy={busy} error={visibleError} close={() => setDrawerOpen(false)} zoomBy={zoomBy} resetCamera={() => setCamera({ ...DEFAULT_CAMERA })} chooseTool={chooseTool} scaleArtwork={scaleArtwork} resetArtwork={resetArtwork} finishWall={finishWall} cancelWall={cancelWall} toggleWalls={() => savePatch({ wallsVisible: !wallsVisible })} exitTool={exitTool} />}
    </div>
  );
}
