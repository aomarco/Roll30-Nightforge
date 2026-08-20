import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Skull, X } from "lucide-react";

import {
  EMPTY_MONSTER_FILTERS,
  filterMonsters,
  formatChallengeRating,
  loadMonsters,
  loadedMonsters,
  monsterFacets,
  monsterSubtitle,
} from "../domain/monsters.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

const attackLine = (monster) => {
  if (!monster.attacks.length) return "No attack lines — add one after placing it";
  return monster.attacks
    .map((attack) => `${attack.name} ${attack.toHit >= 0 ? "+" : ""}${attack.toHit} (${attack.damageDice})`)
    .join(" · ");
};

/**
 * A browser over the generated SRD corpus. Choosing a creature places a token
 * filled in from its stat block; everything stays editable afterwards, so this
 * is a starting point rather than a locked record.
 */
export default function MonsterBrowser({ summon, close, busy = false, initialFilters = null }) {
  const dialogRef = useDialogA11y({ onClose: close });
  const [monsters, setMonsters] = useState(() => loadedMonsters() || []);
  const [status, setStatus] = useState(() => (loadedMonsters() ? "ready" : "loading"));
  const [filters, setFilters] = useState(() => ({ ...EMPTY_MONSTER_FILTERS, ...(initialFilters || {}) }));

  useEffect(() => {
    if (loadedMonsters()) return undefined;
    let active = true;
    loadMonsters()
      .then((loaded) => {
        if (!active) return;
        setMonsters(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => { active = false; };
  }, []);

  const facets = useMemo(() => monsterFacets(monsters), [monsters]);
  const visible = useMemo(() => filterMonsters(monsters, filters), [monsters, filters]);
  const update = (field) => (event) =>
    setFilters((current) => ({ ...current, [field]: event.target.value }));

  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside
        ref={dialogRef}
        className="drawer nf-state-dialog nf-state-monster-browser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-browser-title"
        tabIndex={-1}
      >
        <div className="drawer-top">
          <div>
            <span className="kicker kicker-brass">Bestiary</span>
            <h2 id="monster-browser-title">Summon a creature</h2>
          </div>
          <button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="drawer-body">
          {status === "loading" && <p className="note nf-state-monster-loading">Loading the bestiary…</p>}
          {status === "error" && (
            <p className="note nf-state-monster-error">The bestiary could not be loaded. Close this drawer and try again.</p>
          )}
          {status === "ready" && (
            <>
              <div className="seek">
                <Search size={16} />
                <input
                  className="inp"
                  aria-label="Search the bestiary"
                  value={filters.text}
                  onChange={update("text")}
                  placeholder="Search every creature…"
                  autoFocus
                />
              </div>
              <div className="grid-fields nf-state-monster-facets">
                <div className="micro">
                  <label htmlFor="monster-type">Type</label>
                  <select id="monster-type" className="sel" value={filters.creatureType} onChange={update("creatureType")}>
                    <option value="">Any type</option>
                    {facets.creatureTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                  </select>
                </div>
                <div className="micro">
                  <label htmlFor="monster-size">Size</label>
                  <select id="monster-size" className="sel" value={filters.size} onChange={update("size")}>
                    <option value="">Any size</option>
                    {facets.sizes.map((size) => (
                      <option value={size} key={size}>{size.charAt(0).toUpperCase() + size.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="micro">
                  <label htmlFor="monster-challenge">Challenge</label>
                  <select id="monster-challenge" className="sel" value={filters.challengeBand} onChange={update("challengeBand")}>
                    <option value="">Any challenge</option>
                    {facets.challengeBands.map((band) => <option value={band.id} key={band.id}>{band.name}</option>)}
                  </select>
                </div>
                <div className="micro">
                  <label htmlFor="monster-sort">Sort</label>
                  <select id="monster-sort" className="sel" value={filters.sort} onChange={update("sort")}>
                    <option value="name">Name</option>
                    <option value="cr-asc">Challenge, low first</option>
                    <option value="cr-desc">Challenge, high first</option>
                    <option value="hp-desc">Toughest first</option>
                  </select>
                </div>
              </div>
              <div className="unit-top">
                <span className="unit-label">Bestiary</span>
                <span className="tag numeral">{visible.length} results</span>
              </div>
              <div className="hoard nf-state-monster-list">
                {visible.map((monster) => (
                  <article className="loot loot-monster" key={monster.id}>
                    <span className="loot-ico"><Skull size={17} /></span>
                    <div className="loot-meta">
                      <strong>{monster.name}</strong>
                      <small>{monsterSubtitle(monster)}</small>
                      <small className="nf-state-monster-attacks">{attackLine(monster)}</small>
                    </div>
                    <div className="loot-acts">
                      <button
                        className="btn btn-key btn-sm"
                        onClick={() => summon(monster)}
                        disabled={busy}
                        aria-label={`Summon ${monster.name}, ${formatChallengeRating(monster.challengeRating)}`}
                      >
                        Summon
                      </button>
                    </div>
                  </article>
                ))}
                {!visible.length && (
                  <div className="nf-state-monster-empty">
                    <p className="note">No creature matches those filters.</p>
                    <button
                      className="btn btn-sm"
                      onClick={() => setFilters({ ...EMPTY_MONSTER_FILTERS })}
                      disabled={busy}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="drawer-foot"><button className="btn btn-key" onClick={close}>Done</button></div>
      </aside>
    </PortalLayer>
  );
}
