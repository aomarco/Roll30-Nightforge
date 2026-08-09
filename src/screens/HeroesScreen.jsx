import { useState } from "react";
import {
  Footprints,
  Gem,
  HeartPulse,
  Minus,
  Plus,
  Search,
  ShieldHalf,
  Sword,
  Trash2,
  UserRoundPlus,
  Wand2,
  Zap,
} from "lucide-react";

const CHARACTERS = [
  { id: "1", name: "Thorin", level: 3, className: "Fighter" },
  { id: "2", name: "Elara", level: 1, className: "Wizard" },
  { id: "3", name: "Bruenor", level: 5, className: "Fighter" },
];

const ABILITIES = [
  { key: "STR", label: "Strength", score: 16, mod: "+3", base: 15 },
  { key: "DEX", label: "Dexterity", score: 12, mod: "+1", base: 12 },
  { key: "CON", label: "Constitution", score: 14, mod: "+2", base: 13 },
  { key: "INT", label: "Intelligence", score: 10, mod: "+0", base: 10 },
  { key: "WIS", label: "Wisdom", score: 13, mod: "+1", base: 13 },
  { key: "CHA", label: "Charisma", score: 8, mod: "−1", base: 8 },
];

const INVENTORY = [
  { id: "longsword", name: "Longsword", sub: "1d8 slashing · 5 ft", plus: 2, kind: "weapon" },
  { id: "plate", name: "Plate Armor", sub: "Heavy armour · AC 18", plus: 0, kind: "armor" },
  { id: "ring", name: "Ring of Protection", sub: "Rare · Ring", worn: true, kind: "magic-item" },
  { id: "bracers", name: "Bracers of Archery", sub: "Uncommon · Wondrous Items", worn: false, kind: "magic-item" },
  { id: "potion", name: "Potion of Healing", sub: "Uncommon · Potion", kind: "magic-item" },
];

const noop = () => {};

const CLASS_ICONS = { Fighter: Sword, Wizard: Wand2 };
const KIND_ICONS = { weapon: Sword, armor: ShieldHalf, "magic-item": Gem };

const VITALS = [
  { label: "Hit Points", value: "28", note: "Fighter + Constitution", icon: HeartPulse, tone: "hp" },
  { label: "Armour Class", value: "19", note: "Plate Armor + shield", icon: ShieldHalf, tone: "ally" },
  { label: "Initiative", value: "+1", note: "Dexterity modifier", icon: Zap, tone: "brass" },
  { label: "Speed", value: "30 ft", note: "Human walking speed", icon: Footprints, tone: "jade" },
];

const CHAPTERS = [
  { id: "identity", label: "Identity" },
  { id: "abilities", label: "Abilities" },
  { id: "gear", label: "Gear" },
];

export default function HeroesScreen({ go = noop }) {
  const [name, setName] = useState("Thorin");
  const [activeId, setActiveId] = useState("1");
  const [chapter, setChapter] = useState("identity");

  return (
    <div className="scroller">
      <div className="measure measure-wide enter">
        {/* ------------------------------------------------ roster band */}
        <div className="masthead">
          <div>
            <span className="kicker kicker-jade">Party roster</span>
            <h1>Heroes</h1>
            <p className="prose">
              {CHARACTERS.length} adventurers under your banner. Pick one to open
              their sheet.
            </p>
          </div>
          <div className="masthead-acts">
            <button className="btn btn-key" onClick={noop}>
              <UserRoundPlus size={17} /> New hero
            </button>
          </div>
        </div>

        <div className="band-rail">
          {CHARACTERS.map((character) => {
            const Icon = CLASS_ICONS[character.className] || Sword;
            return (
              <button
                key={character.id}
                className={"portrait" + (character.id === activeId ? " on" : "")}
                onClick={() => setActiveId(character.id)}
              >
                <span className="portrait-face">
                  <Icon size={19} />
                </span>
                <span className="portrait-meta">
                  <strong>{character.name}</strong>
                  <small>
                    Lv {character.level} · {character.className}
                  </small>
                </span>
              </button>
            );
          })}
          <button className="portrait portrait-add" onClick={noop}>
            <span className="portrait-face">
              <Plus size={18} strokeWidth={2.4} />
            </span>
            <span className="portrait-meta">
              <strong>New hero</strong>
              <small>Roll a character</small>
            </span>
          </button>
        </div>

        {/* --------------------------------------------- hero letterhead */}
        <section className="codex">
          <div className="codex-glow" aria-hidden="true" />
          <div className="codex-head">
            <span className="sigil sigil-xl" style={{ background: "linear-gradient(150deg,#3a6f7a,#16292f)" }}>
              <Sword size={30} />
            </span>
            <div className="codex-id">
              <span className="kicker kicker-brass">Character sheet</span>
              <h2>{name || "Unnamed hero"}</h2>
              <p className="prose-sm">Level 3 Fighter · Human</p>
            </div>
            <button className="btn btn-hazard btn-sm" onClick={noop}>
              <Trash2 size={15} /> Retire hero
            </button>
          </div>

          <div className="vitals">
            {VITALS.map((vital) => (
              <div className={"vital vital-" + vital.tone} key={vital.label}>
                <span className="vital-ico">
                  <vital.icon size={17} />
                </span>
                <span className="vital-num numeral">{vital.value}</span>
                <span className="vital-label">{vital.label}</span>
                <span className="vital-note">{vital.note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------- chapters */}
        <nav className="chapters">
          {CHAPTERS.map((c) => (
            <button
              key={c.id}
              className={"chapter" + (chapter === c.id ? " on" : "")}
              onClick={() => setChapter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </nav>

        {/* --------------------------------------------------- identity */}
        {chapter === "identity" && (
          <section className="sheet enter" key="identity">
            <header className="sheet-head">
              <div>
                <span className="kicker">Identity</span>
                <h3>Name &amp; origin</h3>
              </div>
              <p className="note">Who they are before the dice hit the table.</p>
            </header>

            <div className="identity">
              <label className="field span-all">
                <span className="label">Character name</span>
                <input
                  className="inp inp-lg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Class</span>
                <select className="sel" defaultValue="Fighter">
                  <option>Fighter</option>
                  <option>Wizard</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Level</span>
                <input className="inp" type="number" min="1" max="20" defaultValue={3} />
              </label>
              <label className="field">
                <span className="label">Race</span>
                <select className="sel" defaultValue="human">
                  <option value="human">Human</option>
                  <option value="elf">Elf</option>
                  <option value="dwarf">Dwarf</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {/* -------------------------------------------------- abilities */}
        {chapter === "abilities" && (
          <section className="sheet enter" key="abilities">
            <header className="sheet-head">
              <div>
                <span className="kicker">Ability scores</span>
                <h3>27-point buy</h3>
                <p className="note" style={{ marginTop: 6 }}>
                  Racial bonuses apply on top of purchased scores.
                </p>
              </div>
              <div className="budget">
                <strong className="numeral">0</strong>
                <span>points left</span>
              </div>
            </header>

            <div className="dials">
              {ABILITIES.map((a) => (
                <article className="dial" key={a.key}>
                  <div className="dial-top">
                    <span className="dial-key">{a.key}</span>
                    <em className="dial-mod numeral">{a.mod}</em>
                  </div>
                  <span className="dial-score numeral">{a.score}</span>
                  <span className="dial-name">{a.label}</span>
                  <div className="dial-step">
                    <button onClick={noop} aria-label={`Lower ${a.key}`}>
                      <Minus size={13} />
                    </button>
                    <small>Base {a.base}</small>
                    <button onClick={noop} aria-label={`Raise ${a.key}`}>
                      <Plus size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------- gear */}
        {chapter === "gear" && (
          <section className="sheet enter" key="gear">
            <header className="sheet-head">
              <div>
                <span className="kicker">Inventory</span>
                <h3>Gear &amp; treasures</h3>
              </div>
              <div className="row">
                <span className="tag numeral">{INVENTORY.length} items</span>
                <button className="btn btn-key btn-sm" onClick={noop}>
                  <Plus size={15} strokeWidth={2.4} /> Add item
                </button>
              </div>
            </header>

            <div className="seek" style={{ marginBottom: 18 }}>
              <Search size={16} />
              <input className="inp" placeholder="Search your inventory…" />
            </div>

            <div className="hoard">
              {INVENTORY.map((item) => {
                const enchantable = item.kind === "weapon" || item.kind === "armor";
                const wearable = item.id === "ring" || item.id === "bracers";
                const Icon = KIND_ICONS[item.kind] || Gem;
                return (
                  <article className={"loot loot-" + item.kind} key={item.id}>
                    <span className="loot-ico">
                      <Icon size={18} />
                    </span>
                    <div className="loot-meta">
                      <strong>
                        {item.name}
                        {enchantable && item.plus > 0 ? ` +${item.plus}` : ""}
                      </strong>
                      <small>{item.sub}</small>
                    </div>

                    <div className="loot-acts">
                      {enchantable && (
                        <div className="step" title="Magic bonus">
                          <button onClick={noop} aria-label="Lower enchantment">
                            <Minus size={13} />
                          </button>
                          <span className="val">+{item.plus}</span>
                          <button onClick={noop} aria-label="Raise enchantment">
                            <Plus size={13} />
                          </button>
                        </div>
                      )}
                      {wearable && (
                        <button
                          className={"attune" + (item.worn ? " on" : "")}
                          onClick={noop}
                        >
                          {item.worn ? "Worn" : "Wear"}
                        </button>
                      )}
                      <div className="step" title="Quantity">
                        <button onClick={noop} aria-label="Fewer">
                          <Minus size={13} />
                        </button>
                        <span className="val">1</span>
                        <button onClick={noop} aria-label="More">
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        className="glyph glyph-hazard"
                        onClick={noop}
                        title="Remove all"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
