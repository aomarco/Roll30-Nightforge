import { useState } from "react";
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

const PLACEHOLDER_MAPS = [
  { id: "1", name: "Goblin Ambush", mode: "battle", accent: "#f2617a" },
  { id: "2", name: "Tavern of the Salty Dog", mode: "play", accent: "#2fd3b4" },
  { id: "3", name: "Dragon's Lair", mode: "battle", accent: "#e0b055" },
];

const noop = () => {};

const modeLabel = (mode) => (mode === "battle" ? "Battle" : "Play");
const modeNote = (mode) => (mode === "battle" ? "Combat ready" : "Free play");

/** Painted scene art — a tinted wash over a faint battle grid. */
function SceneArt({ accent, children, className = "" }) {
  return (
    <div className={"art " + className}>
      <div
        className="art-wash"
        style={{
          background:
            `radial-gradient(700px 340px at 74% 6%, ${accent}55, transparent 62%),` +
            `radial-gradient(500px 400px at 10% 100%, ${accent}22, transparent 60%),` +
            `linear-gradient(155deg, #16242a, #070d0f)`,
        }}
      />
      <div className="art-grid" aria-hidden="true" />
      <div className="art-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function LibraryScreen({ go = noop }) {
  const [mapName, setMapName] = useState("");
  const [createMode, setCreateMode] = useState("battle");
  const [forging, setForging] = useState(false);

  const openMap = (mode) =>
    go({ page: "board", mode: mode === "battle" ? "battle" : "setup" });

  const [featured, ...rest] = PLACEHOLDER_MAPS;

  return (
    <div className="scroller">
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
            <button className="btn btn-key" onClick={() => setForging(true)}>
              <Plus size={17} strokeWidth={2.4} /> Forge a scene
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------- featured */}
        <section className="stage">
          <SceneArt accent={featured.accent} className="stage-art">
            <div className="stage-veil" />
          </SceneArt>

          <div className="stage-corner">
            <button
              className="glyph"
              onClick={() => go({ page: "settings" })}
              title="Scene settings"
              aria-label={`Settings for ${featured.name}`}
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              className="glyph glyph-hazard"
              onClick={noop}
              title="Delete scene"
              aria-label={`Delete ${featured.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="stage-body">
            <div className="stage-tags">
              <span className={"tag " + (featured.mode === "battle" ? "tag-foe" : "tag-jade")}>
                {featured.mode === "battle" ? <Swords size={12} /> : <Sparkles size={12} />}
                {modeLabel(featured.mode)}
              </span>
              <span className="tag">
                <Grid3x3 size={12} /> 5 ft grid
              </span>
            </div>
            <span className="kicker">Continue where you left off</span>
            <h2>{featured.name}</h2>
            <div className="stage-foot">
              <button className="btn btn-key btn-lg" onClick={() => openMap(featured.mode)}>
                <Play size={17} fill="currentColor" /> Enter the table
              </button>
              <span className="prose-sm">{modeNote(featured.mode)}</span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ ledger */}
        <div className="band">
          <span className="kicker">All scenes</span>
          <span className="tag tag-jade numeral">{PLACEHOLDER_MAPS.length}</span>
          <hr className="rule" />
        </div>

        <div className="ledger">
          {rest.map((entry) => (
            <article className="ledger-row" key={entry.id}>
              <button
                className="ledger-open"
                onClick={() => openMap(entry.mode)}
                aria-label={`Open ${entry.name}`}
              >
                <SceneArt accent={entry.accent} className="ledger-art">
                  <span className="ledger-play">
                    <Play size={15} fill="currentColor" />
                  </span>
                </SceneArt>
                <span className="ledger-meta">
                  <strong>{entry.name}</strong>
                  <small>5 ft grid · {modeNote(entry.mode)}</small>
                </span>
              </button>

              <span className={"tag " + (entry.mode === "battle" ? "tag-foe" : "tag-jade")}>
                {entry.mode === "battle" ? <Swords size={12} /> : <Sparkles size={12} />}
                {modeLabel(entry.mode)}
              </span>

              <div className="ledger-acts">
                <button
                  className="btn btn-line btn-sm"
                  onClick={() => openMap(entry.mode)}
                >
                  Open <ArrowUpRight size={14} />
                </button>
                <button
                  className="glyph"
                  onClick={() => go({ page: "settings" })}
                  title="Scene settings"
                  aria-label={`Settings for ${entry.name}`}
                >
                  <SlidersHorizontal size={16} />
                </button>
                <button
                  className="glyph glyph-hazard"
                  onClick={noop}
                  title="Delete scene"
                  aria-label={`Delete ${entry.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}

          <button className="ledger-new" onClick={() => setForging(true)}>
            <span className="ledger-new-ico">
              <Plus size={18} strokeWidth={2.4} />
            </span>
            <span>
              <strong>Forge a new scene</strong>
              <small>Name it, choose a type, and start building</small>
            </span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------- the forge */}
      {forging && (
        <>
          <div className="veil" onClick={() => setForging(false)} />
          <aside className="drawer" role="dialog" aria-label="Forge a scene">
            <div className="drawer-top">
              <div>
                <span className="kicker kicker-jade">New scene</span>
                <h2>The Forge</h2>
              </div>
              <button className="glyph" onClick={() => setForging(false)} aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="drawer-body">
              <label className="field">
                <span className="label">Scene name</span>
                <input
                  className="inp inp-lg"
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  placeholder="The Sunken Crypt…"
                  autoFocus
                />
              </label>

              <div className="field">
                <span className="label">What is this scene for?</span>
                <div className="picks">
                  <button
                    className={"pick" + (createMode === "play" ? " on" : "")}
                    onClick={() => setCreateMode("play")}
                  >
                    <span className="pick-ico"><Sparkles size={18} /></span>
                    <span>
                      <b>Play</b>
                      <small>Open roleplay. No grid, no initiative — just the scene.</small>
                    </span>
                  </button>
                  <button
                    className={"pick" + (createMode === "battle" ? " on" : "")}
                    onClick={() => setCreateMode("battle")}
                  >
                    <span className="pick-ico"><Swords size={18} /></span>
                    <span>
                      <b>Battle</b>
                      <small>Grid, initiative order, movement and attacks.</small>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="drawer-foot">
              <button className="btn btn-line" onClick={() => setForging(false)}>
                Cancel
              </button>
              <button className="btn btn-key" onClick={() => openMap(createMode)}>
                <Plus size={16} strokeWidth={2.4} /> Forge scene
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
