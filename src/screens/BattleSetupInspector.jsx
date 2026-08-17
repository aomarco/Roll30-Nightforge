import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Package, Plus, Search, Trash2, X } from "lucide-react";

import { formatCost, getItem, itemSubtitle, ITEM_CATALOG } from "../domain/catalog.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import GearChapter from "./GearChapter.jsx";

const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the change."}` : "";
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

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
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

function ManualTokenFields({ token, save, busy }) {
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
    save({
      ...draft,
      ...Object.fromEntries(numericFields.map(([field]) => [field, Number(draft[field])])),
    });
  };
  return (
    <form className="unit" onSubmit={submit}>
      <div className="unit-top"><span className="unit-label">Starting statistics</span><span className="tag tag-jade">Editable token</span></div>
      <label className="field"><span className="label">Name</span><input className="inp" value={draft.name} onChange={change("name")} disabled={busy} /></label>
      <div className="grid-fields">
        {numericFields.map(([field, label, minimum, maximum]) => (
          <div className="micro" key={field}>
            <label>{label}</label>
            <input className="inp" type="number" min={minimum ?? undefined} max={maximum ?? undefined} value={draft[field]} onChange={change(field)} disabled={busy} />
          </div>
        ))}
        <div className="micro wide">
          <label>Creature size</label>
          <select className="sel" value={draft.size} onChange={change("size")} disabled={busy}>
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

function HeroSnapshotFields({ token }) {
  const fields = [
    ["HP", token.hp], ["Max HP", token.maxHp], ["AC", token.ac],
    ["Speed", `${token.baseSpeed} ft`], ["Strength", token.strength],
    ["Dexterity", token.dexterity], ["Level", token.level],
    ["Initiative", token.initiativeBonus >= 0 ? `+${token.initiativeBonus}` : token.initiativeBonus],
    ["Size", token.size],
  ];
  return (
    <section className="unit">
      <div className="unit-top"><span className="unit-label">Hero snapshot</span><span className="tag tag-brass">Read only</span></div>
      <p className="note">These derived values were copied when the Hero entered this Battle. Later Hero edits do not change this token.</p>
      <div className="nf-state-table-snapshot-grid">
        {fields.map(([label, value]) => <span key={label}><small>{label}</small><strong className="numeral">{value}</strong></span>)}
      </div>
    </section>
  );
}

function ChestInventoryDrawer({ chest, busy, error, close, changeItem }) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? ITEM_CATALOG.filter((item) => `${item.name} ${itemSubtitle(item)}`.toLowerCase().includes(query)) : ITEM_CATALOG;
  }, [search]);
  const dialogRef = useDialogA11y({ onClose: close });
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside ref={dialogRef} className="drawer nf-state-table-chest-drawer" role="dialog" aria-modal="true" aria-labelledby="chest-inventory-title" tabIndex={-1}>
        <div className="drawer-top"><div><span className="kicker kicker-brass">Battle cache</span><h2 id="chest-inventory-title">Fill chest</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          {error && <div className="nf-state-inline-error" role="alert"><strong>Chest unchanged</strong><span>{errorText(error)}</span></div>}
          <div className="seek"><Search size={16} /><input className="inp" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the complete catalog…" autoFocus /></div>
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
        </div>
        <div className="drawer-foot"><button className="btn btn-key" onClick={close}>Done</button></div>
      </aside>
    </PortalLayer>
  );
}

function ChestInspector({ chest, busy, error, changeItem, remove }) {
  const [open, setOpen] = useState(false);
  const owned = chest.inventory.map((entry) => ({ entry, item: getItem(entry.itemId) })).filter(({ item }) => item);
  return (
    <>
      <div className="dock-body">
        {error && <div className="nf-state-inline-error" role="alert"><strong>Chest unchanged</strong><span>{errorText(error)}</span></div>}
        <section className="unit">
          <div className="unit-top"><span className="unit-label">Grid position</span><span className="tag tag-brass">Blocks movement</span></div>
          <div className="nf-state-table-position"><span>X <strong className="numeral">{chest.position.xPercent.toFixed(1)}%</strong></span><span>Y <strong className="numeral">{chest.position.yPercent.toFixed(1)}%</strong></span></div>
          <p className="note">Drag the chest to any unoccupied grid cell during Setup.</p>
        </section>
        <section className="unit">
          <div className="unit-top"><span className="unit-label">Contents</span><span className="tag numeral">{chest.inventory.reduce((total, entry) => total + entry.quantity, 0)} items</span></div>
          <div className="nf-state-table-chest-owned">
            {owned.map(({ entry, item }) => <span key={item.id}><strong>{item.name}</strong><em className="numeral">×{entry.quantity}</em></span>)}
            {!owned.length && <p className="note">This chest is empty.</p>}
          </div>
          <button className="btn btn-key btn-sm btn-wide" onClick={() => setOpen(true)} disabled={busy}><Package size={15} /> Open chest inventory</button>
        </section>
        <button className="btn btn-hazard btn-sm btn-wide" onClick={remove} disabled={busy}><Trash2 size={15} /> Remove chest</button>
      </div>
      {open && <ChestInventoryDrawer chest={chest} busy={busy} error={error} close={() => setOpen(false)} changeItem={changeItem} />}
    </>
  );
}

export default function BattleSetupInspector({
  token,
  chest,
  busy = false,
  error = null,
  saveToken,
  applyTokenEquipment,
  removeToken,
  changeChestItem,
  removeChest,
}) {
  if (chest) return <ChestInspector chest={chest} busy={busy} error={error} changeItem={changeChestItem} remove={removeChest} />;
  if (!token) return <div className="void-state"><span className="void-orb"><Package size={26} /></span><h3>Nothing selected</h3><p>Pick a token or chest on the Table to configure it.</p></div>;
  return (
    <div className="dock-body">
      {error && <div className="nf-state-inline-error" role="alert"><strong>Setup unchanged</strong><span>{errorText(error)}</span></div>}
      {token.heroId ? <HeroSnapshotFields token={token} /> : <ManualTokenFields token={token} save={saveToken} busy={busy} />}
      <div className="nf-state-table-setup-gear">
        <GearChapter key={token.id} hero={token} apply={applyTokenEquipment} busy={busy} />
      </div>
      <button className="btn btn-hazard btn-sm btn-wide" onClick={removeToken} disabled={busy}><Trash2 size={15} /> Remove token</button>
    </div>
  );
}
