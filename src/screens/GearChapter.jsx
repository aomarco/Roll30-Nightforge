import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Gem,
  Minus,
  PackageOpen,
  Plus,
  Search,
  ShieldHalf,
  Sword,
  Trash2,
  X,
} from "lucide-react";

import {
  CATALOG_FACETS,
  filterCatalog,
  formatCost,
  getItem,
  itemSubtitle,
  ITEM_BY_ID,
  ITEM_CATALOG,
} from "../domain/catalog.js";
import {
  changeInventory,
  removeInventoryItem,
  setArmor,
  setEnchantment,
  setMainHand,
  setOffHand,
  setShield,
  toggleWornItem,
  wornMagicBonuses,
} from "../domain/items.js";

const KIND_ICONS = {
  weapon: Sword,
  ammunition: PackageOpen,
  armor: ShieldHalf,
  gear: PackageOpen,
  "magic-item": Gem,
};

const TYPE_OPTIONS = [
  ["", "All item types"],
  ["weapon", "Weapons"],
  ["ammunition", "Ammunition"],
  ["armor", "Armour"],
  ["gear", "Gear"],
  ["magic-item", "Magic items"],
];

const EFFECT_LABELS = Object.freeze({
  "ranged-damage-2": "+2 ranged weapon damage",
  "unarmored-ac-2": "+2 AC while unarmoured and shieldless",
  "ac-and-saves-1": "+1 AC and calculated saving throws",
  "attack-1": "+1 attack rolls",
  "ac-1": "+1 AC",
});

const emptyFilters = Object.freeze({
  text: "",
  kind: "",
  weaponClass: "",
  armorClass: "",
  gearCategory: "",
  rarity: "",
  property: "",
  damageType: "",
  rangeBand: "",
  sort: "name",
});

const itemIcon = (item) => KIND_ICONS[item?.kind] || Gem;
const stop = (callback) => (event) => {
  event.stopPropagation();
  callback();
};

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

function QuantityControl({ hero, item, run, busy }) {
  const quantity = hero.inventory.find((entry) => entry.itemId === item.id)?.quantity || 0;
  return (
    <div className="step" title={item.kind === "ammunition" ? `Quantity · bundles of ${item.bundleSize}` : "Quantity"}>
      <button onClick={stop(() => run(changeInventory(hero, item.id, -1)))} disabled={busy} aria-label={`Fewer ${item.name}`}><Minus size={13} /></button>
      <span className="val">{quantity}</span>
      <button onClick={stop(() => run(changeInventory(hero, item.id, 1)))} disabled={busy} aria-label={`More ${item.name}`}><Plus size={13} /></button>
    </div>
  );
}

function EnchantmentControl({ hero, item, run, busy }) {
  const bonus = hero.enchantments?.[item.id] || 0;
  return (
    <div className="step" title="Magic bonus">
      <button onClick={stop(() => run(setEnchantment(hero, item.id, bonus - 1)))} disabled={busy || bonus <= 0} aria-label={`Lower ${item.name} enchantment`}><Minus size={13} /></button>
      <span className="val">+{bonus}</span>
      <button onClick={stop(() => run(setEnchantment(hero, item.id, bonus + 1)))} disabled={busy || bonus >= 3} aria-label={`Raise ${item.name} enchantment`}><Plus size={13} /></button>
    </div>
  );
}

function OwnedItemRow({ hero, item, run, open, busy }) {
  const Icon = itemIcon(item);
  const enchantable = item.kind === "weapon" || item.kind === "armor";
  const wearable = Boolean(item.implementedEffect);
  const worn = hero.wornItemIds.includes(item.id);
  const bonus = hero.enchantments?.[item.id] || 0;
  return (
    <article className={`loot loot-${item.kind} nf-state-loot-button`} onClick={() => open(item.id)}>
      <span className="loot-ico"><Icon size={18} /></span>
      <div className="loot-meta">
        <strong>{item.name}{enchantable && bonus ? ` +${bonus}` : ""}</strong>
        <small>{itemSubtitle(item)}</small>
      </div>
      <div className="loot-acts">
        {enchantable && <EnchantmentControl hero={hero} item={item} run={run} busy={busy} />}
        {wearable && (
          <button className={`attune${worn ? " on" : ""}`} onClick={stop(() => run(toggleWornItem(hero, item.id)))} disabled={busy}>
            {worn ? "Worn" : "Wear"}
          </button>
        )}
        <QuantityControl hero={hero} item={item} run={run} busy={busy} />
        <button className="glyph glyph-hazard" onClick={stop(() => run(removeInventoryItem(hero, item.id)))} disabled={busy} title="Remove all" aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button>
      </div>
    </article>
  );
}

function LoadoutContinuation({ hero, run, error, clearError, busy }) {
  const ownedItems = hero.inventory.map((entry) => ITEM_BY_ID[entry.itemId]).filter(Boolean);
  const weapons = ownedItems.filter((item) => item.kind === "weapon");
  const armor = ownedItems.filter((item) => item.kind === "armor" && item.category !== "shield");
  const shields = ownedItems.filter((item) => item.kind === "armor" && item.category === "shield");
  const wornBonuses = wornMagicBonuses(hero);
  const choose = (operation) => (event) => {
    clearError();
    run(operation(event.target.value || null));
  };
  return (
    <div className="nf-state-gear-continuation">
      <section className="nf-state-hero-panel">
        <div className="unit-top"><span className="unit-label">Loadout</span><span className="tag tag-jade">Owned equipment only</span></div>
        <p className="note">Two-Handed, shield, quantity, and Light dual-wield rules are enforced before saving.</p>
        {error && <div className="nf-state-inline-error" role="alert"><strong>Loadout unchanged</strong><span>{error}</span></div>}
        <div className="nf-state-gear-fields">
          <label className="field"><span className="label">Main hand</span><select className="sel" value={hero.loadout.mainHand || ""} onChange={choose((id) => setMainHand(hero, id))} disabled={busy}><option value="">Empty</option>{weapons.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span className="label">Off hand</span><select className="sel" value={hero.loadout.offHand || ""} onChange={choose((id) => setOffHand(hero, id))} disabled={busy}><option value="">Empty</option>{weapons.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span className="label">Armour</span><select className="sel" value={hero.armorId || ""} onChange={choose((id) => setArmor(hero, id))} disabled={busy}><option value="">Unarmoured</option>{armor.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span className="label">Shield</span><select className="sel" value={hero.shieldId || ""} onChange={choose((id) => setShield(hero, id))} disabled={busy}><option value="">No shield</option>{shields.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </div>
      </section>
      <section className="nf-state-hero-panel">
        <div className="unit-top"><span className="unit-label">Worn magic</span><span className="tag tag-brass">No attunement cap</span></div>
        <div className="nf-state-gear-bonuses">
          <span>AC <strong className="numeral">+{wornBonuses.ac}</strong></span>
          <span>Saves <strong className="numeral">+{wornBonuses.save}</strong></span>
          <span>Attacks <strong className="numeral">+{wornBonuses.attack}</strong></span>
          <span>Ranged damage <strong className="numeral">+{wornBonuses.rangedDamage}</strong></span>
        </div>
      </section>
    </div>
  );
}

function CatalogDrawer({ hero, filters, setFilters, run, close, busy }) {
  const visible = useMemo(() => filterCatalog(ITEM_CATALOG, filters), [filters]);
  const update = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside className="drawer nf-state-gear-drawer" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
        <div className="drawer-top"><div><span className="kicker kicker-brass">The equipment ledger</span><h2 id="catalog-title">Add an item</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          <div className="seek"><Search size={16} /><input className="inp" value={filters.text} onChange={update("text")} placeholder="Search all 355 items…" autoFocus /></div>
          <div className="nf-state-catalog-filters">
            <label className="field"><span className="label">Item type</span><select className="sel" value={filters.kind} onChange={update("kind")}>{TYPE_OPTIONS.map(([value, label]) => <option value={value} key={label}>{label}</option>)}</select></label>
            <label className="field"><span className="label">Sort</span><select className="sel" value={filters.sort} onChange={update("sort")}><option value="name">Name A–Z</option><option value="cost-asc">Cost low–high</option><option value="cost-desc">Cost high–low</option></select></label>
            <label className="field"><span className="label">Weapon class</span><select className="sel" value={filters.weaponClass} onChange={update("weaponClass")}><option value="">Any</option>{CATALOG_FACETS.weaponClasses.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Armour class</span><select className="sel" value={filters.armorClass} onChange={update("armorClass")}><option value="">Any</option>{CATALOG_FACETS.armorClasses.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Gear category</span><select className="sel" value={filters.gearCategory} onChange={update("gearCategory")}><option value="">Any</option>{CATALOG_FACETS.gearCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Magic rarity</span><select className="sel" value={filters.rarity} onChange={update("rarity")}><option value="">Any</option>{CATALOG_FACETS.magicRarities.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Weapon property</span><select className="sel" value={filters.property} onChange={update("property")}><option value="">Any</option>{CATALOG_FACETS.weaponProperties.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Damage type</span><select className="sel" value={filters.damageType} onChange={update("damageType")}><option value="">Any</option>{CATALOG_FACETS.damageTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field"><span className="label">Range band</span><select className="sel" value={filters.rangeBand} onChange={update("rangeBand")}><option value="">Any</option>{CATALOG_FACETS.rangeBands.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className="unit-top"><span className="unit-label">Catalog</span><span className="tag numeral">{visible.length} results</span></div>
          <div className="hoard nf-state-catalog-results">
            {visible.map((item) => {
              const Icon = itemIcon(item);
              const owned = hero.inventory.find((entry) => entry.itemId === item.id)?.quantity || 0;
              return <article className={`loot loot-${item.kind}`} key={item.id}><span className="loot-ico"><Icon size={18} /></span><div className="loot-meta"><strong>{item.name}</strong><small>{itemSubtitle(item)} · {formatCost(item)}</small></div><div className="loot-acts">{owned > 0 && <span className="tag numeral">Owned {owned}</span>}<button className="btn btn-line btn-sm" onClick={() => run(changeInventory(hero, item.id, 1))} disabled={busy}><Plus size={14} /> Add</button></div></article>;
            })}
            {!visible.length && <div className="nf-state-catalog-empty"><strong>No matching entries</strong><span>Clear a filter or try another search term.</span></div>}
          </div>
        </div>
        <div className="drawer-foot"><button className="btn btn-line" onClick={() => setFilters({ ...emptyFilters })}>Clear filters</button><button className="btn btn-key" onClick={close}>Done</button></div>
      </aside>
    </PortalLayer>
  );
}

function ItemDrawer({ hero, item, run, close, error, busy }) {
  const Icon = itemIcon(item);
  const bonus = hero.enchantments?.[item.id] || 0;
  const worn = hero.wornItemIds.includes(item.id);
  const main = hero.loadout.mainHand === item.id;
  const off = hero.loadout.offHand === item.id;
  const body = hero.armorId === item.id;
  const shield = hero.shieldId === item.id;
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside className="drawer nf-state-gear-drawer" role="dialog" aria-modal="true" aria-labelledby="item-title">
        <div className="drawer-top"><div><span className="kicker">Equipment record</span><h2 id="item-title">{item.name}</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          <div className={`nf-state-item-hero loot-${item.kind}`}><span className="loot-ico"><Icon size={20} /></span><div><strong>{item.typeLabel}</strong><p className="note">{itemSubtitle(item)}</p></div></div>
          {error && <div className="nf-state-inline-error" role="alert"><strong>Equipment unchanged</strong><span>{error}</span></div>}
          <section className="nf-state-hero-panel">
            <div className="unit-top"><span className="unit-label">Inventory</span><span className="tag">{formatCost(item)}</span></div>
            <div className="row"><QuantityControl hero={hero} item={item} run={run} busy={busy} />{(item.kind === "weapon" || item.kind === "armor") && <EnchantmentControl hero={hero} item={item} run={run} busy={busy} />}</div>
          </section>
          {item.kind === "weapon" && <section className="nf-state-hero-panel"><div className="unit-top"><span className="unit-label">Weapon loadout</span></div><div className="nf-state-equipment-actions"><button className={`btn ${main ? "btn-key" : "btn-line"}`} onClick={() => run(setMainHand(hero, main ? null : item.id))}>{main ? "Main hand" : "Equip main hand"}</button><button className={`btn ${off ? "btn-key" : "btn-line"}`} onClick={() => run(setOffHand(hero, off ? null : item.id))}>{off ? "Off hand" : "Equip off hand"}</button></div></section>}
          {item.kind === "armor" && item.category !== "shield" && <section className="nf-state-hero-panel"><div className="unit-top"><span className="unit-label">Armour loadout</span></div><button className={`btn ${body ? "btn-key" : "btn-line"}`} onClick={() => run(setArmor(hero, body ? null : item.id))}>{body ? "Worn armour" : "Wear armour"}</button></section>}
          {item.kind === "armor" && item.category === "shield" && <section className="nf-state-hero-panel"><div className="unit-top"><span className="unit-label">Shield loadout</span></div><button className={`btn ${shield ? "btn-key" : "btn-line"}`} onClick={() => run(setShield(hero, shield ? null : item.id))}>{shield ? "Shield raised" : "Raise shield"}</button></section>}
          {item.implementedEffect && <section className="nf-state-hero-panel"><div className="unit-top"><span className="unit-label">Implemented magic</span><span className="tag tag-brass">{item.rarity}</span></div><p className="note">{EFFECT_LABELS[item.implementedEffect]}</p><button className={`attune${worn ? " on" : ""}`} onClick={() => run(toggleWornItem(hero, item.id))}>{worn ? "Worn" : "Wear"}</button></section>}
          {item.kind === "magic-item" && !item.implementedEffect && <p className="note">This non-battle magic item is stored as inventory. Its special rules are intentionally inert in the current feature boundary.</p>}
        </div>
        <div className="drawer-foot"><button className="btn btn-hazard" onClick={() => { const result = run(removeInventoryItem(hero, item.id)); if (result?.ok !== false) close(); }} disabled={busy}><Trash2 size={15} /> Remove all</button><button className="btn btn-line" onClick={close}>Close</button></div>
      </aside>
    </PortalLayer>
  );
}

export default function GearChapter({
  hero,
  apply,
  busy = false,
  initialDrawer = null,
  initialFilters = emptyFilters,
}) {
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(initialDrawer);
  const [filters, setFilters] = useState({ ...emptyFilters, ...initialFilters });
  const [gearError, setGearError] = useState("");
  const owned = useMemo(() => hero.inventory
    .map((entry) => ({ entry, item: getItem(entry.itemId) }))
    .filter(({ item }) => item && (!search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase()))), [hero.inventory, search]);

  useEffect(() => {
    if (!drawer) return undefined;
    const close = (event) => { if (event.key === "Escape") setDrawer(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [drawer]);

  const run = (result) => {
    if (!result?.ok) {
      setGearError(result?.message || "That equipment change is not legal.");
      return result;
    }
    const saved = apply(result.value);
    if (saved?.ok !== false) setGearError("");
    return saved;
  };
  const selectedItem = drawer?.itemId ? getItem(drawer.itemId) : null;

  return (
    <>
      <section className="sheet enter" key="gear">
        <header className="sheet-head"><div><span className="kicker">Inventory</span><h3>Gear &amp; treasures</h3></div><div className="row"><span className="tag numeral">{hero.inventory.length} unique · {hero.inventory.reduce((total, entry) => total + entry.quantity, 0)} total</span><button className="btn btn-key btn-sm" onClick={() => { setGearError(""); setDrawer({ mode: "catalog" }); }}><Plus size={15} strokeWidth={2.4} /> Add item</button></div></header>
        <div className="seek" style={{ marginBottom: 18 }}><Search size={16} /><input className="inp" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your inventory…" /></div>
        <div className="hoard">
          {owned.map(({ item }) => <OwnedItemRow key={item.id} hero={hero} item={item} run={run} open={(itemId) => { setGearError(""); setDrawer({ mode: "item", itemId }); }} busy={busy} />)}
          {!owned.length && <div className="nf-state-catalog-empty"><strong>{hero.inventory.length ? "No owned items match" : "This pack is empty"}</strong><span>{hero.inventory.length ? "Try another inventory search." : "Open Add item to choose from the Nightforge catalogs."}</span></div>}
        </div>
        <LoadoutContinuation hero={hero} run={run} error={gearError} clearError={() => setGearError("")} busy={busy} />
      </section>
      {drawer?.mode === "catalog" && <CatalogDrawer hero={hero} filters={filters} setFilters={setFilters} run={run} close={() => setDrawer(null)} busy={busy} />}
      {drawer?.mode === "item" && selectedItem && <ItemDrawer hero={hero} item={selectedItem} run={run} close={() => setDrawer(null)} error={gearError} busy={busy} />}
    </>
  );
}
