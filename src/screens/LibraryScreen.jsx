import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Grid3x3,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { accentForScene, orderScenesForLibrary } from "../application/library.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";

const unavailable = () => ({
  ok: false,
  code: "COMMAND_UNAVAILABLE",
  message: "This command is not connected.",
  recovery: "Open Nightforge through its application shell.",
  retryable: false,
});
const modeLabel = (kind) => (kind === "battle" ? "Battle" : "Play");
const modeNote = (kind) => (kind === "battle" ? "Combat ready" : "Free play");
const errorText = (error) =>
  error ? `${error.message} ${error.recovery || "Please retry."}` : "";

function useArtworkUrls(scenes, artworkRepository) {
  const [artworkUrls, setArtworkUrls] = useState({});
  const [artworkError, setArtworkError] = useState(null);
  const signature = scenes.map((scene) => `${scene.id}:${scene.artworkKey || ""}`).join("|");

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    setArtworkError(null);
    if (!artworkRepository) {
      setArtworkUrls({});
      return undefined;
    }

    const load = async () => {
      const next = {};
      for (const scene of scenes) {
        if (!scene.artworkKey) continue;
        const result = await artworkRepository.get(scene.artworkKey);
        if (!active) return;
        if (!result.ok) {
          setArtworkError(result);
          continue;
        }
        if (result.value instanceof Blob && globalThis.URL?.createObjectURL) {
          const url = URL.createObjectURL(result.value);
          objectUrls.push(url);
          next[scene.id] = url;
        }
      }
      if (active) setArtworkUrls(next);
    };
    load();

    return () => {
      active = false;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [artworkRepository, signature]);

  return { artworkUrls, artworkError };
}

function SceneArt({ accent, artworkUrl, children, className = "" }) {
  return (
    <div className={`art ${className}`}>
      {artworkUrl ? (
        <img className="nf-state-artwork-image" src={artworkUrl} alt="" />
      ) : (
        <div
          className="art-wash"
          style={{
            background:
              `radial-gradient(700px 340px at 74% 6%, ${accent}55, transparent 62%),` +
              `radial-gradient(500px 400px at 10% 100%, ${accent}22, transparent 60%),` +
              "linear-gradient(155deg, #16242a, #070d0f)",
          }}
        />
      )}
      <div className="art-grid" aria-hidden="true" />
      <div className="art-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function LibraryScreen({
  scenes = [],
  lifecycle = "ready",
  persistence = { status: "idle", error: null },
  artworkRepository = null,
  go = unavailable,
  onForge = unavailable,
  onOpen = unavailable,
  onSettings = unavailable,
  onDelete = unavailable,
}) {
  const [mapName, setMapName] = useState("");
  const [createMode, setCreateMode] = useState("battle");
  const [forging, setForging] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const orderedScenes = useMemo(() => orderScenesForLibrary(scenes), [scenes]);
  const [featured, ...rest] = orderedScenes;
  const { artworkUrls, artworkError } = useArtworkUrls(orderedScenes, artworkRepository);
  const busy = lifecycle === "booting" || persistence.status === "saving";
  const visibleError = persistence.error || artworkError;
  const forgeDialogRef = useDialogA11y({ open: forging, onClose: () => setForging(false) });
  const deleteDialogRef = useDialogA11y({ open: Boolean(deleting), onClose: () => setDeleting(null) });

  const forge = (event) => {
    event.preventDefault();
    const result = onForge({ name: mapName, kind: createMode });
    if (!result?.ok) return;
    setMapName("");
    setCreateMode("battle");
    setForging(false);
  };

  const confirmDelete = () => {
    const result = onDelete(deleting);
    if (result?.ok) setDeleting(null);
  };

  const sceneTag = (scene) => (
    <span className={`tag ${scene.kind === "battle" ? "tag-foe" : "tag-jade"}`}>
      {scene.kind === "battle" ? <Swords size={12} /> : <Sparkles size={12} />}
      {modeLabel(scene.kind)}
    </span>
  );

  return (
    <div className={`scroller nf-state-screen-root nf-state-library-root${busy ? " nf-state-busy" : ""}`}>
      <div className="measure measure-wide enter">
        <div className="masthead">
          <div>
            <span className="kicker kicker-jade">Campaign vault</span>
            <h1>Library</h1>
            <p className="prose">
              Every map, tavern and dungeon you have built. Open one to take your
              party to the table.
            </p>
          </div>
          <div className="masthead-acts">
            <button className="btn btn-line" onClick={() => go({ page: "characters" })}>
              <Users size={16} /> Party roster
            </button>
            <button className="btn btn-key" onClick={() => setForging(true)} disabled={busy}>
              <Plus size={17} strokeWidth={2.4} /> Forge a scene
            </button>
          </div>
        </div>

        {visibleError && (
          <div className="nf-state-notice" role="alert">
            <strong>Nightforge could not complete that action.</strong>
            <span>{errorText(visibleError)}</span>
          </div>
        )}

        {!visibleError && persistence.recovered && (
          <div className="nf-state-recovery" role="status">
            <strong>Nightforge recovered safely.</strong>
            <span>{persistence.recoverySource === "empty"
              ? "The damaged saved records could not be used, so a clean vault was opened without overwriting them."
              : "The primary browser save was invalid, so Nightforge restored the backup vault."}</span>
          </div>
        )}

        {featured ? (
          <section className="stage">
            <SceneArt
              accent={accentForScene(featured)}
              artworkUrl={artworkUrls[featured.id]}
              className="stage-art"
            >
              <div className="stage-veil" />
            </SceneArt>

            <div className="stage-corner">
              <button
                className="glyph"
                onClick={() => onSettings(featured)}
                title="Scene settings"
                aria-label={`Settings for ${featured.name}`}
                disabled={busy}
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                className="glyph glyph-hazard"
                onClick={() => setDeleting(featured)}
                title="Delete scene"
                aria-label={`Delete ${featured.name}`}
                disabled={busy}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="stage-body">
              <div className="stage-tags">
                {sceneTag(featured)}
                {featured.kind === "battle" && (
                  <span className="tag"><Grid3x3 size={12} /> 5 ft grid</span>
                )}
              </div>
              <span className="kicker">Continue where you left off</span>
              <h2>{featured.name}</h2>
              <div className="stage-foot">
                <button className="btn btn-key btn-lg" onClick={() => onOpen(featured)} disabled={busy}>
                  <Play size={17} fill="currentColor" /> Enter the table
                </button>
                <span className="prose-sm">{modeNote(featured.kind)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="stage nf-state-empty-stage">
            <SceneArt accent="#2fd3b4" className="stage-art"><div className="stage-veil" /></SceneArt>
            <div className="stage-body">
              <div className="stage-tags"><span className="tag tag-jade">Fresh campaign</span></div>
              <span className="kicker">
                {lifecycle === "booting" ? "Opening campaign vault" : "Your first scene"}
              </span>
              <h2>{lifecycle === "booting" ? "Gathering your scenes…" : "The vault is ready"}</h2>
              <p className="prose">
                {lifecycle === "booting"
                  ? "Nightforge is restoring this browser’s campaign state."
                  : "Forge a Play scene for open roleplay or a Battle scene for the grid."}
              </p>
            </div>
          </section>
        )}

        <div className="band">
          <span className="kicker">All scenes</span>
          <span className="tag tag-jade numeral">{orderedScenes.length}</span>
          <hr className="rule" />
        </div>

        <div className="ledger">
          {rest.map((scene) => (
            <article className="ledger-row" key={scene.id}>
              <button className="ledger-open" onClick={() => onOpen(scene)} aria-label={`Open ${scene.name}`} disabled={busy}>
                <SceneArt accent={accentForScene(scene)} artworkUrl={artworkUrls[scene.id]} className="ledger-art">
                  <span className="ledger-play"><Play size={15} fill="currentColor" /></span>
                </SceneArt>
                <span className="ledger-meta">
                  <strong>{scene.name}</strong>
                  <small>{scene.kind === "battle" ? "5 ft grid · Combat ready" : "Free play"}</small>
                </span>
              </button>

              {sceneTag(scene)}

              <div className="ledger-acts">
                <button className="btn btn-line btn-sm" onClick={() => onOpen(scene)} disabled={busy}>
                  Open <ArrowUpRight size={14} />
                </button>
                <button className="glyph" onClick={() => onSettings(scene)} title="Scene settings" aria-label={`Settings for ${scene.name}`} disabled={busy}>
                  <SlidersHorizontal size={16} />
                </button>
                <button className="glyph glyph-hazard" onClick={() => setDeleting(scene)} title="Delete scene" aria-label={`Delete ${scene.name}`} disabled={busy}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}

          <button className="ledger-new" onClick={() => setForging(true)} disabled={busy}>
            <span className="ledger-new-ico"><Plus size={18} strokeWidth={2.4} /></span>
            <span><strong>Forge a new scene</strong><small>Name it, choose a type, and start building</small></span>
          </button>
        </div>
      </div>

      {forging && (
        <>
          <div className="veil" onClick={() => setForging(false)} />
          <aside ref={forgeDialogRef} className="drawer nf-state-dialog" role="dialog" aria-modal="true" aria-label="Forge a scene" tabIndex={-1}>
            <form className="nf-state-drawer-form" onSubmit={forge}>
              <div className="drawer-top">
                <div><span className="kicker kicker-jade">New scene</span><h2>The Forge</h2></div>
                <button className="glyph" type="button" onClick={() => setForging(false)} aria-label="Close"><X size={17} /></button>
              </div>
              <div className="drawer-body">
                {persistence.error && (
                  <div className="nf-state-inline-error" role="alert">
                    <strong>Scene not saved</strong>
                    <span>{errorText(persistence.error)}</span>
                  </div>
                )}
                <label className="field">
                  <span className="label">Scene name</span>
                  <input className="inp inp-lg" value={mapName} onChange={(event) => setMapName(event.target.value)} placeholder="The Sunken Crypt…" autoFocus />
                </label>
                <div className="field">
                  <span className="label">What is this scene for?</span>
                  <div className="picks">
                    <button type="button" className={`pick${createMode === "play" ? " on" : ""}`} onClick={() => setCreateMode("play")}>
                      <span className="pick-ico"><Sparkles size={18} /></span>
                      <span><b>Play</b><small>Open roleplay. No grid, no initiative — just the scene.</small></span>
                    </button>
                    <button type="button" className={`pick${createMode === "battle" ? " on" : ""}`} onClick={() => setCreateMode("battle")}>
                      <span className="pick-ico"><Swords size={18} /></span>
                      <span><b>Battle</b><small>Grid, initiative order, movement and attacks.</small></span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="drawer-foot">
                <button className="btn btn-line" type="button" onClick={() => setForging(false)}>Cancel</button>
                <button className="btn btn-key" type="submit" disabled={busy}><Plus size={16} strokeWidth={2.4} /> {busy ? "Forging…" : "Forge scene"}</button>
              </div>
            </form>
          </aside>
        </>
      )}

      {deleting && (
        <>
          <div className="veil" onClick={() => setDeleting(null)} />
          <aside ref={deleteDialogRef} className="drawer nf-state-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-scene-title" aria-describedby="delete-scene-description" tabIndex={-1}>
            <div className="drawer-top">
              <div><span className="kicker">Remove scene</span><h2 id="delete-scene-title">Close this chapter?</h2></div>
              <button className="glyph" onClick={() => setDeleting(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="drawer-body">
              {persistence.error && (
                <div className="nf-state-inline-error" role="alert">
                  <strong>Scene not deleted</strong>
                  <span>{errorText(persistence.error)}</span>
                </div>
              )}
              <p className="prose" id="delete-scene-description">Delete <strong>{deleting.name}</strong> from this Nightforge vault?</p>
              <p className="note">This removes the Scene record. Original Roll30 saves are never accessed or changed.</p>
            </div>
            <div className="drawer-foot">
              <button className="btn btn-line" onClick={() => setDeleting(null)} autoFocus>Keep scene</button>
              <button className="btn btn-hazard" onClick={confirmDelete} disabled={busy}><Trash2 size={15} /> {busy ? "Deleting…" : "Delete scene"}</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
