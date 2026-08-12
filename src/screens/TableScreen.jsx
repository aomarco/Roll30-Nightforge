import { useState } from "react";
import {
  ChevronLeft,
  CircleDot,
  Grid3x3,
  Hammer,
  LayoutGrid,
  Package,
  Plus,
  ShieldHalf,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Wind,
} from "lucide-react";
import { Pip } from "../ui/Glyphs.jsx";

const TOKENS = [
  { id: "1", name: "Thorin", color: "#d9803f", hp: 24, maxHp: 28, ac: 19, speed: 30, x: 32, y: 44, type: "pc" },
  { id: "2", name: "Elara", color: "#5fa8f5", hp: 9, maxHp: 12, ac: 12, speed: 30, x: 52, y: 58, type: "pc" },
  { id: "3", name: "Goblin", color: "#7fb356", hp: 7, maxHp: 7, ac: 15, speed: 30, x: 68, y: 36, type: "enemy" },
];

const CONDITIONS = [
  "Blinded", "Charmed", "Frightened", "Grappled", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious",
];

const noop = () => {};

const initials = (name) => name.slice(0, 2).toUpperCase();

const healthTone = (hp, maxHp) => {
  const pct = hp / maxHp;
  if (pct > 0.55) return "var(--hp-full)";
  if (pct > 0.25) return "var(--hp-mid)";
  return "var(--hp-low)";
};

export default function TableScreen({ scene = null, mode = "setup", go = noop, setMode = noop }) {
  const [selectedId, setSelectedId] = useState("1");
  const isPlay = scene?.kind === "play" || mode === "play";
  const isBattle = !isPlay && mode === "battle";
  const active = TOKENS[0];
  const selected = TOKENS.find((t) => t.id === selectedId) || null;

  return (
    <div className="table">
      {/* ==================================================== the map ==== */}
      <div className="map">
        <div className="map-wash" aria-hidden="true" />
        {!isPlay && <div className="map-grid" aria-hidden="true" />}
        <div className="map-fog" aria-hidden="true" />

        {TOKENS.map((token) => (
          <button
            key={token.id}
            className={
              "piece" +
              (selectedId === token.id ? " on" : "") +
              (isBattle && token.id === active.id ? " acting" : "")
            }
            style={{ left: `${token.x}%`, top: `${token.y}%`, "--piece": token.color }}
            onClick={() => setSelectedId(token.id)}
            aria-label={token.name}
          >
            <span className="piece-disc">{initials(token.name)}</span>
            <span className="piece-name">{token.name}</span>
            {isBattle && (
              <span className="piece-hp">
                <i
                  style={{
                    width: `${(token.hp / token.maxHp) * 100}%`,
                    background: healthTone(token.hp, token.maxHp),
                  }}
                />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ================================================ top-left HUD ==== */}
      <div className="hud hud-tl glass grained">
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps">
          <ChevronLeft size={18} />
        </button>
        <span className="hud-div" />
        <div className="hud-scene">
          <span className="kicker">{scene?.name || "Untitled scene"}</span>
          <strong>
            {isPlay ? "Free play" : isBattle ? `Round 1 · ${active.name}'s turn` : "Setup mode"}
          </strong>
        </div>
      </div>

      {/* ============================================== top-centre HUD ==== */}
      <div className="hud hud-tc glass grained">
        <div className="phase">
          {isPlay ? (
            <button className="on" disabled aria-current="page"><Sparkles size={14} /> Play</button>
          ) : (
            <>
              <button className={!isBattle ? "on" : ""} onClick={() => setMode("setup")}>
                <Hammer size={14} /> Setup
              </button>
              <button className={isBattle ? "on" : ""} onClick={() => setMode("battle")}>
                <Swords size={14} /> Battle
              </button>
            </>
          )}
        </div>
      </div>

      {/* =============================================== top-right HUD ==== */}
      <div className="hud hud-tr glass grained">
        {!isPlay && (
          <>
            <span className="tag tag-brass"><Grid3x3 size={12} /> 5 ft</span>
            <span className="hud-div" />
          </>
        )}
        <button
          className="glyph"
          onClick={() =>
            go({ page: "settings", returnTo: { page: "board", mode } })
          }
          title="Scene settings"
        >
          <SlidersHorizontal size={17} />
        </button>
        <button className="glyph" onClick={() => go({ page: "home" })} title="All maps">
          <LayoutGrid size={17} />
        </button>
      </div>

      {/* ============================================== left dock: cast ==== */}
      <aside className="dock dock-left glass grained">
        <header className="dock-head">
          <div>
            <span className="kicker kicker-jade">Encounter</span>
            <h2>{isBattle ? "Battle running" : "Build the scene"}</h2>
          </div>
        </header>

        <div className="dock-body">
          <section className="unit">
            <div className="unit-top">
              <span className="unit-label">Summon a token</span>
            </div>
            <select className="sel" defaultValue="">
              <option value="">Blank token</option>
              <option>Thorin</option>
              <option>Elara</option>
            </select>
            <button className="btn btn-key btn-sm btn-wide" onClick={noop}>
              <Plus size={15} strokeWidth={2.4} /> Add to map
            </button>
            {!isBattle && !isPlay && (
              <button className="btn btn-line btn-sm btn-wide" onClick={noop}>
                <Package size={14} /> Place a chest
              </button>
            )}
          </section>

          <section className="unit">
            <div className="unit-top">
              <span className="unit-label">On the map</span>
              <span className="tag numeral">{TOKENS.length}</span>
            </div>
            <div className="cast">
              {TOKENS.map((token) => (
                <button
                  key={token.id}
                  className={"cast-row" + (selectedId === token.id ? " on" : "")}
                  onClick={() => setSelectedId(token.id)}
                >
                  <span className="sigil" style={{ background: token.color }}>
                    {initials(token.name)}
                  </span>
                  <span className="cast-meta">
                    <strong>{token.name}</strong>
                    <small>{isBattle ? `${token.hp}/${token.maxHp} HP` : "On map"}</small>
                  </span>
                  <Pip tone={token.type === "enemy" ? "foe" : "ally"} />
                </button>
              ))}
            </div>
          </section>

          {!isBattle && !isPlay && (
            <p className="whisper">
              Arrange the scene, then switch to Battle to roll initiative.
            </p>
          )}
        </div>
      </aside>

      {/* ========================================= right dock: inspector ==== */}
      <aside className="dock dock-right glass grained">
        {selected ? (
          <>
            <header className="dock-head">
              <span className="sigil sigil-lg" style={{ background: selected.color }}>
                {initials(selected.name)}
              </span>
              <div>
                <span className="kicker">Selected token</span>
                <h2>{selected.name}</h2>
              </div>
            </header>

            <div className="dock-body">
              <label className="field">
                <span className="label">Name</span>
                <input className="inp" value={selected.name} onChange={noop} readOnly />
              </label>

              {isBattle ? (
                <>
                  <section className="unit">
                    <div className="unit-top">
                      <span className="unit-label">Vitals</span>
                    </div>
                    <div className="quad">
                      <div className="quad-cell">
                        <span>HP</span>
                        <strong className="numeral">{selected.hp}</strong>
                      </div>
                      <div className="quad-cell">
                        <span>Max HP</span>
                        <strong className="numeral">{selected.maxHp}</strong>
                      </div>
                      <div className="quad-cell">
                        <span>AC</span>
                        <strong className="numeral">{selected.ac}</strong>
                      </div>
                      <div className="quad-cell">
                        <span>Speed</span>
                        <strong className="numeral">{selected.speed}</strong>
                      </div>
                    </div>

                    <div className="vitalbar">
                      <div className="vitalbar-top">
                        <span>Health</span>
                        <strong className="numeral">
                          {selected.hp} / {selected.maxHp}
                        </strong>
                      </div>
                      <div className="meter">
                        <i
                          style={{
                            width: `${(selected.hp / selected.maxHp) * 100}%`,
                            background: healthTone(selected.hp, selected.maxHp),
                            boxShadow: `0 0 12px ${healthTone(selected.hp, selected.maxHp)}`,
                          }}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="unit">
                    <div className="unit-top">
                      <span className="unit-label">Conditions</span>
                      <span className="tag">None</span>
                    </div>
                    <div className="afflict">
                      {CONDITIONS.map((condition) => (
                        <button
                          key={condition}
                          type="button"
                          className="toggle-chip"
                          onClick={noop}
                        >
                          {condition}
                        </button>
                      ))}
                    </div>
                  </section>

                  <form className="unit" onSubmit={(e) => e.preventDefault()}>
                    <div className="unit-top">
                      <span className="unit-label">Adjust stat</span>
                    </div>
                    <div className="console-row">
                      <select className="sel" defaultValue="hp">
                        <option value="hp">HP</option>
                        <option value="maxHp">Max HP</option>
                        <option value="ac">AC</option>
                        <option value="speed">Speed</option>
                      </select>
                      <input
                        className="inp"
                        placeholder="+5 / −5"
                        inputMode="numeric"
                      />
                    </div>
                    <button className="btn btn-key btn-sm btn-wide" type="submit">
                      Apply adjustment
                    </button>
                  </form>
                </>
              ) : (
                <section className="unit">
                  <div className="unit-top">
                    <span className="unit-label">Starting stats</span>
                  </div>
                  <p className="note" style={{ marginTop: -4 }}>
                    Set this token's opening values before the fight begins.
                  </p>
                  <div className="grid-fields">
                    {[
                      ["HP", selected.hp],
                      ["Max HP", selected.maxHp],
                      ["Speed (ft)", selected.speed],
                      ["Strength", 16],
                      ["Dexterity", 12],
                      ["Level", 3],
                    ].map(([label, value]) => (
                      <div className="micro" key={label}>
                        <label>{label}</label>
                        <input className="inp" type="number" defaultValue={value} />
                      </div>
                    ))}
                    <div className="micro wide">
                      <label>Initiative bonus</label>
                      <input className="inp" type="number" defaultValue={1} />
                    </div>
                    <div className="micro wide">
                      <label>Creature size</label>
                      <select className="sel" defaultValue="medium">
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                  </div>
                </section>
              )}

              <button className="btn btn-hazard btn-sm btn-wide" onClick={noop}>
                <Trash2 size={15} /> Remove token
              </button>
            </div>
          </>
        ) : (
          <div className="void-state">
            <span className="void-orb">
              <CircleDot size={26} />
            </span>
            <h3>Nothing selected</h3>
            <p>Pick a token on the map or in the cast list to edit its details.</p>
          </div>
        )}
      </aside>

      {/* =============================================== the turn track ==== */}
      {isBattle && (
        <div className="track glass grained">
          <div className="track-round">
            <span className="kicker kicker-brass">Round</span>
            <strong className="numeral">1</strong>
          </div>

          <div className="track-div" />

          <ol className="track-order">
            {TOKENS.map((token, i) => (
              <li key={token.id} className={i === 0 ? "now" : ""}>
                <span className="track-face" style={{ background: token.color }}>
                  {initials(token.name)}
                </span>
                <span className="track-name">{token.name}</span>
                <span className="track-init numeral">{20 - i * 4}</span>
              </li>
            ))}
          </ol>

          <div className="track-div" />

          <div className="track-res">
            <div className="res-move">
              <span className="kicker">
                <Wind size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
                Movement
              </span>
              <strong className="numeral">30 / 30 ft</strong>
              <div className="meter" style={{ marginTop: 6 }}>
                <i style={{ width: "100%" }} />
              </div>
            </div>
            <div className="res-pips">
              <span className="pip-key" title="Action available">
                <Swords size={13} />
                <em>Action</em>
              </span>
              <span className="pip-key" title="Bonus Action available">
                <ShieldHalf size={13} />
                <em>Bonus</em>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
