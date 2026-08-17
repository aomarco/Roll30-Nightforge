import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Grid3x3,
  ImagePlus,
  Mountain,
  Ruler,
  Sparkles,
  Square,
  Swords,
} from "lucide-react";

const okay = () => ({ ok: true });
const asyncOkay = async () => okay();
const errorText = (error) =>
  error ? `${error.message} ${error.recovery || "Please retry."}` : "";

function useArtworkUrl(scene, artworkRepository) {
  const [state, setState] = useState({ url: null, error: null });

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setState({ url: null, error: null });
    if (!scene?.artworkKey || !artworkRepository) return undefined;

    const load = async () => {
      const result = await artworkRepository.get(scene.artworkKey);
      if (!active) return;
      if (!result.ok) {
        setState({ url: null, error: result });
        return;
      }
      if (!(result.value instanceof Blob) || !globalThis.URL?.createObjectURL) {
        setState({
          url: null,
          error: {
            message: "Nightforge could not display the saved Scene artwork.",
            recovery: "The Scene data was preserved. Retry loading or replace the artwork.",
          },
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
  }, [artworkRepository, scene?.artworkKey]);

  return state;
}

export default function SceneScreen({
  scene = null,
  go = okay,
  returnTo = { page: "home" },
  persistence = { status: "idle", error: null },
  artworkRepository = null,
  onUpdate = okay,
  onReplaceArtwork = asyncOkay,
  onUseWhiteCanvas = asyncOkay,
  flushRef = null,
  confirmChange = (message) => globalThis.confirm?.(message) ?? true,
}) {
  const [name, setName] = useState(() => scene?.name || "Untitled scene");
  const [mode, setMode] = useState(() => scene?.kind || "battle");
  const [gridSize, setGridSize] = useState(() => scene?.gridSize || 44);
  const [artworkBusy, setArtworkBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [cleanupIssue, setCleanupIssue] = useState(null);
  const draftRef = useRef({ name, gridSize });
  const dirtyRef = useRef(new Set());
  const timerRef = useRef(null);
  const { url: map, error: artworkError } = useArtworkUrl(scene, artworkRepository);
  const noMap = Boolean(scene?.blankCanvas);

  useEffect(() => {
    const nextName = scene?.name || "Untitled scene";
    const nextGridSize = scene?.gridSize || 44;
    setName(nextName);
    setMode(scene?.kind || "battle");
    setGridSize(nextGridSize);
    draftRef.current = { name: nextName, gridSize: nextGridSize };
    dirtyRef.current.clear();
    setLocalError(null);
    setCleanupIssue(null);
  }, [scene?.id]);

  useEffect(() => {
    if (!scene?.id) return;
    if (!dirtyRef.current.has("name")) {
      setName(scene.name || "Untitled scene");
      draftRef.current.name = scene.name || "Untitled scene";
    }
    if (!dirtyRef.current.has("gridSize")) {
      setGridSize(scene.gridSize || 44);
      draftRef.current.gridSize = scene.gridSize || 44;
    }
    setMode(scene.kind || "battle");
  }, [scene?.id, scene?.name, scene?.kind, scene?.gridSize]);

  const flushDraft = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!scene?.id || dirtyRef.current.size === 0) return okay();
    const fields = [...dirtyRef.current];
    const patch = Object.fromEntries(fields.map((field) => [field, draftRef.current[field]]));
    dirtyRef.current.clear();
    const result = onUpdate(scene.id, patch) || okay();
    if (!result.ok) {
      for (const field of fields) dirtyRef.current.add(field);
      setLocalError(result);
    } else {
      if (fields.includes("name")) {
        setName(result.value.name);
        draftRef.current.name = result.value.name;
      }
      setLocalError(null);
    }
    return result;
  };

  if (flushRef) flushRef.current = flushDraft;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const queueSave = (field, value) => {
    draftRef.current[field] = value;
    dirtyRef.current.add(field);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushDraft, 450);
  };

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    const flushed = flushDraft();
    if (!flushed.ok) return;
    if (
      mode === "battle" &&
      nextMode === "play" &&
      scene?.encounter &&
      !confirmChange(
        `Change ${scene.name} to Play? This clears its current Battle encounter and physical battle items.`,
      )
    ) {
      return;
    }
    const result = onUpdate(scene.id, { kind: nextMode }) || okay();
    if (!result.ok) {
      setLocalError(result);
      return;
    }
    setMode(nextMode);
    setLocalError(null);
  };

  const recordArtworkResult = (result) => {
    if (!result?.ok) {
      setLocalError(result);
      setCleanupIssue(null);
      return;
    }
    setLocalError(null);
    setCleanupIssue(result.issues?.[0] || null);
  };

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !scene?.id || !flushDraft().ok) return;
    setArtworkBusy(true);
    try {
      recordArtworkResult(await onReplaceArtwork(scene.id, file));
    } finally {
      setArtworkBusy(false);
    }
  };

  const onNoMap = async () => {
    if (!scene?.id || !flushDraft().ok) return;
    setArtworkBusy(true);
    try {
      recordArtworkResult(await onUseWhiteCanvas(scene.id));
    } finally {
      setArtworkBusy(false);
    }
  };

  const onBack = () => go(returnTo);
  const backdrop = map ? "Image map" : noMap ? "White canvas" : "Not set";
  const busy = artworkBusy || persistence.status === "saving";
  const visibleError = localError || persistence.error || artworkError;
  const saveMessage = visibleError
    ? `Not saved. ${errorText(visibleError)}`
    : cleanupIssue
      ? `Changes saved. Cleanup pending. ${errorText(cleanupIssue)}`
      : busy
        ? "Saving changes to this browser…"
        : "Changes save automatically to this browser.";

  return (
    <div className="workbench nf-state-scene-root">
      {/* ------------------------------------------------- live preview */}
      <section className="rig">
        <div className="rig-bar">
          <span className="kicker">Live preview</span>
          <span className="push tag">
            <Mountain size={12} /> {backdrop}
          </span>
        </div>

        <div className="rig-frame">
          <div
            className="rig-canvas"
            style={{
              backgroundImage: map ? `url(${map})` : undefined,
              backgroundColor: noMap ? "#fff" : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!map && !noMap && <div className="rig-wash" aria-hidden="true" />}
            {mode === "battle" && (
              <div
                className="rig-grid"
                aria-hidden="true"
                style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}
              />
            )}
            {!noMap && <div className="rig-vignette" aria-hidden="true" />}

            <div className="rig-plate">
              <span className={"tag " + (mode === "battle" ? "tag-foe" : "tag-jade")}>
                {mode === "battle" ? <Swords size={12} /> : <Sparkles size={12} />}
                {mode === "battle" ? "Battle" : "Play"}
              </span>
              <h2>{name || "Untitled map"}</h2>
              {mode === "battle" && (
                <span className="rig-scale numeral">
                  5 ft squares · {gridSize}px
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rig-tools">
          <label className="btn btn-key file-drop">
            <ImagePlus size={16} /> Upload artwork
            <input type="file" accept="image/*" onChange={onUpload} disabled={busy} />
          </label>
          <button className="btn btn-line" onClick={onNoMap} disabled={busy}>
            <Square size={15} /> Use white canvas
          </button>
          <span className="push prose-sm" role="status">{saveMessage}</span>
        </div>
      </section>

      {/* ------------------------------------------------------- tuner */}
      <div className="tuner-pane">
        <div className="tuner">
          <button className="crumb" onClick={onBack}>
            <ChevronLeft size={15} /> {returnTo?.page === "board" ? "Table" : "Library"}
          </button>

          <header className="tuner-head">
            <span className="kicker kicker-jade">Scene workspace</span>
            <h1>{name || "Untitled map"}</h1>
          </header>

          {/* Identity */}
          <section className="tune-group">
            <div className="tune-title">
              <span className="numeral">01</span>
              <h3>Identity</h3>
            </div>

            <label className="field">
              <span className="label">Map name</span>
              <input
                className="inp inp-lg"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  queueSave("name", event.target.value);
                }}
                onBlur={flushDraft}
                placeholder="Untitled map"
              />
            </label>

            <div className="field">
              <span className="label">Map type</span>
              <div className="picks">
                <button
                  className={"pick" + (mode === "play" ? " on" : "")}
                  onClick={() => changeMode("play")}
                >
                  <span className="pick-ico"><Sparkles size={18} /></span>
                  <span>
                    <b>Play</b>
                    <small>Scenery only — no grid or turn order.</small>
                  </span>
                </button>
                <button
                  className={"pick" + (mode === "battle" ? " on" : "")}
                  onClick={() => changeMode("battle")}
                >
                  <span className="pick-ico"><Swords size={18} /></span>
                  <span>
                    <b>Battle</b>
                    <small>Grid, initiative, movement and attacks.</small>
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Backdrop */}
          <section className="tune-group">
            <div className="tune-title">
              <span className="numeral">02</span>
              <h3>Backdrop</h3>
            </div>
            <p className="note">
              Drop in your own artwork, or start from a blank white canvas and
              draw the scene yourself. The preview updates as you go.
            </p>
            <div className="chit-row">
              <span className="chit">
                <ImagePlus size={14} /> {backdrop}
              </span>
            </div>
          </section>

          {/* Grid — battle only */}
          {mode === "battle" && (
            <section className="tune-group">
              <div className="tune-title">
                <span className="numeral">03</span>
                <h3>Battle scale</h3>
                <span className="push tag tag-brass">
                  <Grid3x3 size={12} /> 5 ft squares
                </span>
              </div>

              <div className="dial-strip">
                <div className="dial-strip-top">
                  <span className="label">
                    <Ruler size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
                    Cell size
                  </span>
                  <strong className="numeral">{gridSize}px</strong>
                </div>
                <input
                  className="slider"
                  type="range"
                  aria-label="Battle grid cell size"
                  min="24"
                  max="80"
                  value={gridSize}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setGridSize(value);
                    queueSave("gridSize", value);
                  }}
                  onBlur={flushDraft}
                />
                <div className="dial-strip-foot numeral">
                  <span>24</span>
                  <span>80</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
