import { useState } from "react";
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

const noop = () => {};

export default function SceneScreen({ go = noop }) {
  const [name, setName] = useState("Goblin Ambush");
  const [mode, setMode] = useState("battle");
  const [gridSize, setGridSize] = useState(44);
  const map = null;
  const noMap = false;
  const onBack = () => go({ page: "home" });
  const onUpload = () => {};
  const onNoMap = () => {};

  const backdrop = map ? "Image map" : noMap ? "White canvas" : "Not set";

  return (
    <div className="workbench">
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
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!map && <div className="rig-wash" aria-hidden="true" />}
            {mode === "battle" && (
              <div
                className="rig-grid"
                aria-hidden="true"
                style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}
              />
            )}
            <div className="rig-vignette" aria-hidden="true" />

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
            <input type="file" accept="image/*" onChange={onUpload} />
          </label>
          <button className="btn btn-line" onClick={onNoMap}>
            <Square size={15} /> Use white canvas
          </button>
          <span className="push prose-sm">Changes save automatically to this browser.</span>
        </div>
      </section>

      {/* ------------------------------------------------------- tuner */}
      <div className="tuner-pane">
        <div className="tuner">
          <button className="crumb" onClick={onBack}>
            <ChevronLeft size={15} /> Library
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
                onChange={(event) => setName(event.target.value)}
                placeholder="Untitled map"
              />
            </label>

            <div className="field">
              <span className="label">Map type</span>
              <div className="picks">
                <button
                  className={"pick" + (mode === "play" ? " on" : "")}
                  onClick={() => setMode("play")}
                >
                  <span className="pick-ico"><Sparkles size={18} /></span>
                  <span>
                    <b>Play</b>
                    <small>Scenery only — no grid or turn order.</small>
                  </span>
                </button>
                <button
                  className={"pick" + (mode === "battle" ? " on" : "")}
                  onClick={() => setMode("battle")}
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
                  min="24"
                  max="80"
                  value={gridSize}
                  onChange={(event) => setGridSize(+event.target.value)}
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
