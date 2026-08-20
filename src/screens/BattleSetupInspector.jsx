import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDot, Minus, MoreVertical, Package, Plus, Search, X } from "lucide-react";

import { formatCost, getItem, itemSubtitle, ITEM_CATALOG } from "../domain/catalog.js";
import { MAX_ATTACKS_PER_ACTION, TOKEN_SIZES } from "../domain/table.js";
import { formatChallengeRating } from "../domain/monsters.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import GearChapter from "./GearChapter.jsx";

const numericFields = [
  ["hp", "HP", 0, null],
  ["maxHp", "Max HP", 1, null],
  ["ac", "AC", 0, null],
  ["baseSpeed", "Speed (ft)", 0, null],
  ["strength", "Strength", 1, null],
  ["dexterity", "Dexterity", 1, null],
  ["constitution", "Constitution", 1, null],
  ["intelligence", "Intelligence", 1, null],
  ["wisdom", "Wisdom", 1, null],
  ["charisma", "Charisma", 1, null],
  ["level", "Level", 1, 20],
  ["initiativeBonus", "Initiative bonus", null, null],
  ["attacksPerAction", "Attacks per Action", 1, MAX_ATTACKS_PER_ACTION],
];

const blankAttack = (ordinal) => ({
  id: `attack-${ordinal + 1}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  toHit: 3,
  damageDice: "1d6",
  damageType: "",
  rangeKind: "melee",
  reachFeet: 5,
  normalFeet: 20,
  longFeet: 60,
  throwable: false,
  thrown: false,
  riders: [],
  note: "",
});

const attackSummary = (attack) => {
  const reach = attack.rangeKind === "melee"
    ? `${attack.reachFeet} ft`
    : `${attack.normalFeet}/${attack.longFeet} ft`;
  const damage = [attack.damageDice, attack.damageType].filter(Boolean).join(" ");
  return `${signed(Number(attack.toHit) || 0)} to hit · ${damage} · ${reach}`;
};

const initials = (name) => (name || "?")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0])
  .join("")
  .toUpperCase() || "?";

const signed = (value) => (value >= 0 ? `+${value}` : String(value));

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

function Drawer({ title, kicker, id, close, children, footer }) {
  const dialogRef = useDialogA11y({ onClose: close });
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside
        ref={dialogRef}
        className="drawer nf-state-dialog nf-state-scene-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="drawer-top">
          <div><span className="kicker kicker-brass">{kicker}</span><h2 id={id}>{title}</h2></div>
          <button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer !== false && <div className="drawer-foot"><button className="btn btn-key" onClick={close}>Done</button></div>}
      </aside>
    </PortalLayer>
  );
}

const draftFromToken = (token) => ({
  name: token?.name || "",
  hp: token?.hp ?? 10,
  maxHp: token?.maxHp ?? 10,
  ac: token?.ac ?? 10,
  baseSpeed: token?.baseSpeed ?? 30,
  strength: token?.strength ?? 10,
  dexterity: token?.dexterity ?? 10,
  constitution: token?.constitution ?? 10,
  intelligence: token?.intelligence ?? 10,
  wisdom: token?.wisdom ?? 10,
  charisma: token?.charisma ?? 10,
  level: token?.level ?? 1,
  initiativeBonus: token?.initiativeBonus ?? 0,
  attacksPerAction: token?.attacksPerAction ?? 1,
  size: token?.size || "medium",
});

/**
 * Attacks a creature simply has, rather than derives from the weapons in its
 * hands. The numbers are written the way a stat block writes them: the to-hit
 * is absolute and the damage already carries its modifier.
 */
function AttackEditor({ token, save, busy, close }) {
  const [draft, setDraft] = useState(() => token.attacks.map((attack) => ({ ...attack })));
  useEffect(() => setDraft(token.attacks.map((attack) => ({ ...attack }))), [token.id, token.attacks]);

  const change = (index, field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setDraft((current) => current.map((attack, position) =>
      position === index ? { ...attack, [field]: value } : attack,
    ));
  };
  const add = () => setDraft((current) => [...current, blankAttack(current.length)]);
  const remove = (index) => setDraft((current) => current.filter((_, position) => position !== index));
  const submit = (event) => {
    event.preventDefault();
    const attacks = draft.map((attack, index) => ({
      ...attack,
      name: String(attack.name || "").trim() || `Attack ${index + 1}`,
      toHit: Number(attack.toHit) || 0,
      reachFeet: Number(attack.reachFeet) || 5,
      normalFeet: Number(attack.normalFeet) || 20,
      longFeet: Number(attack.longFeet) || 60,
      damageType: String(attack.damageType || "").trim(),
    }));
    const result = save({ attacks });
    if (!result || result.ok) close();
  };

  return (
    <form className="unit nf-state-attack-editor" onSubmit={submit}>
      <div className="unit-top">
        <span className="unit-label">Attacks</span>
        <span className="tag numeral">{draft.length}</span>
      </div>
      {!draft.length && <p className="note">This creature has no attacks yet. Add one to let it fight.</p>}
      {draft.map((attack, index) => (
        <fieldset className="nf-state-attack-row" key={attack.id}>
          <legend className="nf-state-attack-legend">{attack.name || `Attack ${index + 1}`}</legend>
          <label className="field">
            <span className="label">Name</span>
            <input className="inp" value={attack.name} onChange={change(index, "name")} placeholder="Wavy Sword" disabled={busy} />
          </label>
          <div className="grid-fields">
            <div className="micro">
              <label htmlFor={`to-hit-${attack.id}`}>To hit</label>
              <input id={`to-hit-${attack.id}`} className="inp" type="number" value={attack.toHit} onChange={change(index, "toHit")} disabled={busy} />
            </div>
            <div className="micro">
              <label htmlFor={`damage-${attack.id}`}>Damage</label>
              <input id={`damage-${attack.id}`} className="inp" value={attack.damageDice} onChange={change(index, "damageDice")} placeholder="2d8+3" disabled={busy} />
            </div>
            <div className="micro">
              <label htmlFor={`damage-type-${attack.id}`}>Damage type</label>
              <input id={`damage-type-${attack.id}`} className="inp" value={attack.damageType || ""} onChange={change(index, "damageType")} placeholder="Slashing" disabled={busy} />
            </div>
            <div className="micro">
              <label htmlFor={`range-kind-${attack.id}`}>Range</label>
              <select id={`range-kind-${attack.id}`} className="sel" value={attack.rangeKind} onChange={change(index, "rangeKind")} disabled={busy}>
                <option value="melee">Melee</option>
                <option value="ranged">Ranged</option>
              </select>
            </div>
            {attack.rangeKind === "melee" ? (
              <div className="micro">
                <label htmlFor={`reach-${attack.id}`}>Reach (ft)</label>
                <input id={`reach-${attack.id}`} className="inp" type="number" min="5" step="5" value={attack.reachFeet} onChange={change(index, "reachFeet")} disabled={busy} />
              </div>
            ) : null}
            {(attack.rangeKind === "ranged" || attack.throwable) && (
              <>
                <div className="micro">
                  <label htmlFor={`normal-${attack.id}`}>Normal (ft)</label>
                  <input id={`normal-${attack.id}`} className="inp" type="number" min="5" step="5" value={attack.normalFeet} onChange={change(index, "normalFeet")} disabled={busy} />
                </div>
                <div className="micro">
                  <label htmlFor={`long-${attack.id}`}>Long (ft)</label>
                  <input id={`long-${attack.id}`} className="inp" type="number" min="5" step="5" value={attack.longFeet} onChange={change(index, "longFeet")} disabled={busy} />
                </div>
              </>
            )}
          </div>
          <div className="nf-state-attack-foot">
            <label className="nf-state-attack-toggle">
              <input type="checkbox" checked={Boolean(attack.throwable)} onChange={change(index, "throwable")} disabled={busy} />
              <span>Throwable — leaves the creature and lands on the board</span>
            </label>
            <button className="btn btn-sm nf-state-attack-remove" type="button" onClick={() => remove(index)} disabled={busy}>Remove</button>
          </div>
        </fieldset>
      ))}
      <button className="btn btn-sm btn-wide" type="button" onClick={add} disabled={busy}>
        <Plus size={13} /> Add attack
      </button>
      <button className="btn btn-key btn-sm btn-wide" type="submit" disabled={busy}>{busy ? "Saving…" : "Save attacks"}</button>
    </form>
  );
}

/**
 * The parts of a stat block the engine cannot run yet - saving-throw actions,
 * legendary actions, traits, resistances. Shown so the table can read and
 * narrate them, deliberately not wired to any rule.
 */
function StatBlockNotes({ notes }) {
  const lines = [
    ["Multiattack", notes.multiattack],
    ["Resistances", notes.resistances],
    ["Immunities", notes.immunities],
    ["Vulnerabilities", notes.vulnerabilities],
    ["Condition immunities", notes.conditionImmunities],
    ["Senses", notes.senses],
    ["Languages", notes.languages],
  ].filter(([, value]) => value);
  const sections = [
    ["Traits", notes.traits],
    ["Other actions", notes.otherActions],
    ["Legendary actions", notes.legendaryActions],
    ["Reactions", notes.reactions],
  ].filter(([, entries]) => entries.length);
  return (
    <div className="nf-state-statblock">
      <p className="note">Reference only. Nothing here is applied by the rules engine.</p>
      {lines.map(([label, value]) => (
        <p className="nf-state-statblock-line" key={label}><strong>{label}:</strong> {value}</p>
      ))}
      {sections.map(([label, entries]) => (
        <section className="nf-state-statblock-section" key={label}>
          <h4>{label}</h4>
          {entries.map((entry) => (
            <p key={entry.name}><strong>{entry.name}.</strong> {entry.desc}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function ManualTokenFields({ token, save, busy, close }) {
  const [draft, setDraft] = useState(() => draftFromToken(token));
  useEffect(() => setDraft(draftFromToken(token)), [
    token.id,
    token.name,
    token.hp,
    token.maxHp,
    token.ac,
    token.baseSpeed,
    token.strength,
    token.dexterity,
    token.level,
    token.initiativeBonus,
    token.size,
  ]);
  const change = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    const result = save({
      ...draft,
      ...Object.fromEntries(numericFields.map(([field]) => [field, Number(draft[field])])),
    });
    if (!result || result.ok) close();
  };
  return (
    <form className="unit" onSubmit={submit}>
      <div className="unit-top"><span className="unit-label">Starting statistics</span><span className="tag tag-jade">Editable token</span></div>
      <label className="field"><span className="label">Name</span><input className="inp" value={draft.name} onChange={change("name")} disabled={busy} /></label>
      <div className="grid-fields">
        {numericFields.map(([field, label, minimum, maximum]) => (
          <div className="micro" key={field}>
            <label>{label}</label>
            <input className="inp" type="number" aria-label={label} min={minimum ?? undefined} max={maximum ?? undefined} value={draft[field]} onChange={change(field)} disabled={busy} />
          </div>
        ))}
        <div className="micro wide">
          <label>Creature size</label>
          <select className="sel" aria-label="Creature size" value={draft.size} onChange={change("size")} disabled={busy}>
            {TOKEN_SIZES.map((size) => (
              <option value={size} key={size}>{size.charAt(0).toUpperCase() + size.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn btn-key btn-sm btn-wide" type="submit" disabled={busy}>{busy ? "Saving…" : "Save token details"}</button>
    </form>
  );
}

function ChestCatalog({ chest, busy, changeItem }) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? ITEM_CATALOG.filter((item) => `${item.name} ${itemSubtitle(item)}`.toLowerCase().includes(query)) : ITEM_CATALOG;
  }, [search]);
  return (
    <>
      <div className="seek"><Search size={16} /><input className="inp" aria-label="Search the chest item catalog" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the complete catalog…" autoFocus /></div>
      <div className="unit-top"><span className="unit-label">Catalog</span><span className="tag numeral">{visible.length} results</span></div>
      <div className="hoard nf-state-table-chest-catalog">
        {visible.map((item) => {
          const quantity = chest.inventory.find((entry) => entry.itemId === item.id)?.quantity || 0;
          return (
            <article className={`loot loot-${item.kind}`} key={item.id}>
              <span className="loot-ico"><Package size={17} /></span>
              <div className="loot-meta"><strong>{item.name}</strong><small>{itemSubtitle(item)} · {formatCost(item)}</small></div>
              <div className="step" title={item.kind === "ammunition" ? `Quantity · bundles of ${item.bundleSize}` : "Quantity"}>
                <button onClick={() => changeItem(item.id, -1)} disabled={busy || quantity <= 0} aria-label={`Fewer ${item.name}`}><Minus size={13} /></button>
                <span className="val">{quantity}</span>
                <button onClick={() => changeItem(item.id, 1)} disabled={busy} aria-label={`More ${item.name}`}><Plus size={13} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function OverflowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return (
    <span className="nf-state-scene-menu-wrap">
      <button
        className="glyph nf-state-scene-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-expanded={open}
      >
        <MoreVertical size={17} />
      </button>
      {open && (
        <>
          <span className="nf-state-scene-menu-veil" onClick={() => setOpen(false)} />
          <span className="nf-state-scene-menu glass" role="menu">
            {items.map((item) => (
              <button
                className={`nf-state-scene-menu-item${item.hazard ? " nf-state-scene-menu-hazard" : ""}`}
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onSelect(); }}
              >
                {item.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * The properties card for whatever is selected on the board.
 *
 * Only readings live on the card itself. Everything that edits — token stats,
 * gear, chest contents, deletion — sits behind the overflow menu and opens as
 * a drawer, which is what keeps the card as compact as the reference design
 * while losing none of the old inspector's abilities.
 */
export default function BattleSetupInspector({
  token,
  chest,
  busy = false,
  saveToken,
  applyTokenEquipment,
  removeToken,
  changeChestItem,
  removeChest,
  initialDrawer = null,
}) {
  const [drawer, setDrawer] = useState(initialDrawer);
  const close = () => setDrawer(null);

  useEffect(() => { setDrawer(null); }, [token?.id, chest?.id]);

  if (chest) {
    const owned = chest.inventory.map((entry) => ({ entry, item: getItem(entry.itemId) })).filter(({ item }) => item);
    const count = chest.inventory.reduce((total, entry) => total + entry.quantity, 0);
    return (
      <>
        <section className="nf-state-scene-panel">
          <header className="nf-state-scene-panel-head">
            <span className="sigil nf-state-table-chest-sigil"><Package size={17} /></span>
            <h3>Battle chest</h3>
            <OverflowMenu
              label="Chest actions"
              items={[
                { label: "Chest contents…", onSelect: () => setDrawer("chest") },
                { label: "Remove chest", hazard: true, disabled: busy, onSelect: removeChest },
              ]}
            />
          </header>
          <div className="nf-state-scene-stats">
            <span><small>Items</small><strong className="numeral">{count}</strong></span>
            <span><small>Kinds</small><strong className="numeral">{owned.length}</strong></span>
            <span><small>Blocks</small><strong>Movement</strong></span>
          </div>
          <div className="nf-state-table-chest-owned">
            {owned.map(({ entry, item }) => <span key={item.id}><strong>{item.name}</strong><em className="numeral">×{entry.quantity}</em></span>)}
            {!owned.length && <p className="note">This chest is empty.</p>}
          </div>
        </section>
        {drawer === "chest" && (
          <Drawer kicker="Battle cache" title="Fill chest" id="chest-inventory-title" close={close}>
            <ChestCatalog chest={chest} busy={busy} changeItem={changeChestItem} />
          </Drawer>
        )}
      </>
    );
  }

  if (!token) {
    return (
      <section className="nf-state-scene-panel nf-state-scene-empty">
        <span className="void-orb"><CircleDot size={22} /></span>
        <h3>Nothing selected</h3>
        <p>Pick a token or chest on the board to inspect it.</p>
      </section>
    );
  }

  const stats = [
    ["HP", `${token.hp}/${token.maxHp}`],
    ["AC", token.ac],
    ["Speed", `${token.baseSpeed} Ft`],
    ["Strength", token.strength],
    ["Dexterity", token.dexterity],
    ["Initiative", signed(token.initiativeBonus)],
    token.monsterId
      ? ["Challenge", formatChallengeRating(token.challengeRating)]
      : ["Level", token.level],
    ["Size", token.size.charAt(0).toUpperCase() + token.size.slice(1)],
    ...(token.attacksPerAction > 1 ? [["Attacks", `${token.attacksPerAction} per Action`]] : []),
  ];

  const tokenKind = token.heroId
    ? "Hero snapshot"
    : token.monsterId
      ? `Monster · ${token.creatureType || "creature"}`
      : "Manual token";

  return (
    <>
      <section className="nf-state-scene-panel">
        <header className="nf-state-scene-panel-head">
          <span className="sigil" style={{ background: token.color }}>{initials(token.name)}</span>
          <h3>{token.name}</h3>
          <OverflowMenu
            label="Token actions"
            items={[
              ...(token.heroId ? [] : [
                { label: "Edit stats…", onSelect: () => setDrawer("stats") },
                { label: "Attacks…", onSelect: () => setDrawer("attacks") },
              ]),
              ...(token.statBlockNotes ? [{ label: "Stat block notes…", onSelect: () => setDrawer("statblock") }] : []),
              { label: "Gear & inventory…", onSelect: () => setDrawer("gear") },
              { label: "Remove token", hazard: true, disabled: busy, onSelect: removeToken },
            ]}
          />
        </header>
        <div className="nf-state-scene-stats">
          {stats.map(([label, value]) => (
            <span key={label}><small>{label}</small><strong className="numeral">{value}</strong></span>
          ))}
        </div>
        {!token.heroId && (
          <div className="nf-state-scene-attacks">
            {token.attacks.map((attack) => (
              <span key={attack.id}>
                <strong>{attack.name}</strong>
                <em>{attackSummary(attack)}</em>
              </span>
            ))}
            {!token.attacks.length && <p className="note">No attacks. This token cannot fight yet.</p>}
          </div>
        )}
        <p className="nf-state-scene-kind">{tokenKind}</p>
      </section>

      {drawer === "stats" && (
        <Drawer kicker="Manual token" title="Edit statistics" id="token-stats-title" close={close} footer={false}>
          <ManualTokenFields token={token} save={saveToken} busy={busy} close={close} />
        </Drawer>
      )}
      {drawer === "attacks" && (
        <Drawer kicker={token.name} title="Attacks" id="token-attacks-title" close={close} footer={false}>
          <AttackEditor token={token} save={saveToken} busy={busy} close={close} />
        </Drawer>
      )}
      {drawer === "statblock" && token.statBlockNotes && (
        <Drawer kicker={token.name} title="Stat block notes" id="token-statblock-title" close={close}>
          <StatBlockNotes notes={token.statBlockNotes} />
        </Drawer>
      )}
      {drawer === "gear" && (
        <Drawer kicker={token.name} title="Gear & inventory" id="token-gear-title" close={close}>
          <div className="nf-state-table-setup-gear">
            <GearChapter key={token.id} hero={token} apply={applyTokenEquipment} busy={busy} />
          </div>
        </Drawer>
      )}
    </>
  );
}
