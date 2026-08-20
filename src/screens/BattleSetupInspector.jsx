import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDot, Minus, MoreVertical, Package, Plus, Search, X } from "lucide-react";

import { formatCost, getItem, itemSubtitle, ITEM_CATALOG } from "../domain/catalog.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import GearChapter from "./GearChapter.jsx";

const numericFields = [
  ["hp", "HP", 0, null],
  ["maxHp", "Max HP", 1, null],
  ["ac", "AC", 0, null],
  ["baseSpeed", "Speed (ft)", 0, null],
  ["strength", "Strength", 1, null],
  ["dexterity", "Dexterity", 1, null],
  ["level", "Level", 1, 20],
  ["initiativeBonus", "Initiative bonus", null, null],
];

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
  level: token?.level ?? 1,
  initiativeBonus: token?.initiativeBonus ?? 0,
  size: token?.size || "medium",
});

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
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
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
    ["Level", token.level],
    ["Size", token.size.charAt(0).toUpperCase() + token.size.slice(1)],
  ];

  return (
    <>
      <section className="nf-state-scene-panel">
        <header className="nf-state-scene-panel-head">
          <span className="sigil" style={{ background: token.color }}>{initials(token.name)}</span>
          <h3>{token.name}</h3>
          <OverflowMenu
            label="Token actions"
            items={[
              ...(token.heroId ? [] : [{ label: "Edit stats…", onSelect: () => setDrawer("stats") }]),
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
        <p className="nf-state-scene-kind">{token.heroId ? "Hero snapshot" : "Manual token"}</p>
      </section>

      {drawer === "stats" && (
        <Drawer kicker="Manual token" title="Edit statistics" id="token-stats-title" close={close} footer={false}>
          <ManualTokenFields token={token} save={saveToken} busy={busy} close={close} />
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
