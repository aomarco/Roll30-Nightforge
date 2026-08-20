import { useMemo, useState } from "react";
import { Package, Plus, Search, Trash2 } from "lucide-react";

const initials = (name) => (name || "?")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0])
  .join("")
  .toUpperCase() || "?";

/**
 * Everything currently on the board, grouped by kind.
 *
 * This is the object tree an editing tool would give you: a count you can
 * trust, a search once the list gets long, and a delete on every row so you
 * never have to select something first just to remove it.
 */
export default function SceneObjects({
  tokens = [],
  chests = [],
  selectedTokenId = null,
  selectedChestId = null,
  selectToken,
  selectChest,
  addToken,
  addChest,
  removeToken,
  removeChest,
  busy = false,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visibleTokens = useMemo(
    () => (needle ? tokens.filter((token) => token.name.toLowerCase().includes(needle)) : tokens),
    [tokens, needle],
  );
  const visibleChests = useMemo(() => {
    if (!needle) return chests;
    return chests.filter((chest, index) => `chest ${index + 1}`.includes(needle));
  }, [chests, needle]);

  const total = tokens.length + chests.length;

  return (
    <section className="nf-state-scene-panel nf-state-scene-objects">
      <header className="nf-state-scene-panel-head">
        <h3>Objects on map</h3>
        <span className="tag numeral">{total}</span>
        <button
          className="glyph"
          onClick={() => {
            setSearchOpen((current) => !current);
            if (searchOpen) setQuery("");
          }}
          aria-label="Search objects on the map"
          aria-expanded={searchOpen}
        >
          <Search size={16} />
        </button>
      </header>

      {searchOpen && (
        <div className="seek nf-state-scene-search">
          <Search size={15} />
          <input
            className="inp"
            aria-label="Search objects on the map"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a token or chest…"
            autoFocus
          />
        </div>
      )}

      <div className="nf-state-scene-group">
        <span className="nf-state-scene-group-label">Tokens ({tokens.length})</span>
        <button className="glyph" onClick={addToken} disabled={busy} aria-label="Add a token"><Plus size={15} /></button>
      </div>
      <ul className="nf-state-scene-rows">
        {visibleTokens.map((token) => (
          <li key={token.id}>
            <button
              className={`nf-state-scene-row${selectedTokenId === token.id ? " on" : ""}`}
              onClick={() => selectToken(token.id)}
            >
              <span className="nf-state-scene-row-face" style={{ background: token.color }}>{initials(token.name)}</span>
              <strong>{token.name}</strong>
              <span
                className={`nf-state-scene-pip${token.hp <= 0 ? " nf-state-scene-pip-down" : ""}`}
                title={token.hp <= 0 ? "Down" : `${token.hp}/${token.maxHp} HP`}
              />
            </button>
            <button
              className="glyph glyph-hazard"
              onClick={() => removeToken(token.id)}
              disabled={busy}
              aria-label={`Remove ${token.name}`}
              title={`Remove ${token.name}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {!visibleTokens.length && (
          <li className="nf-state-scene-empty-row">
            <p className="note">{needle ? "No token matches that." : "No tokens on this board yet."}</p>
          </li>
        )}
      </ul>

      <div className="nf-state-scene-group">
        <span className="nf-state-scene-group-label">Chests ({chests.length})</span>
        <button className="glyph" onClick={addChest} disabled={busy} aria-label="Add a chest"><Plus size={15} /></button>
      </div>
      <ul className="nf-state-scene-rows">
        {visibleChests.map((chest) => {
          const index = chests.indexOf(chest);
          const count = chest.inventory.reduce((total, entry) => total + entry.quantity, 0);
          return (
            <li key={chest.id}>
              <button
                className={`nf-state-scene-row${selectedChestId === chest.id ? " on" : ""}`}
                onClick={() => selectChest(chest.id)}
              >
                <span className="nf-state-scene-row-face nf-state-table-chest-sigil"><Package size={13} /></span>
                <strong>Chest {index + 1}</strong>
                <span className={`nf-state-scene-pip${count ? "" : " nf-state-scene-pip-empty"}`} title={`${count} items`} />
              </button>
              <button
                className="glyph glyph-hazard"
                onClick={() => removeChest(chest.id)}
                disabled={busy}
                aria-label={`Remove chest ${index + 1}`}
                title={`Remove chest ${index + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
        {!visibleChests.length && (
          <li className="nf-state-scene-empty-row">
            <p className="note">{needle ? "No chest matches that." : "No chests on this board yet."}</p>
          </li>
        )}
      </ul>
    </section>
  );
}
