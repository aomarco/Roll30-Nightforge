import { createPortal } from "react-dom";
import { PackageOpen, X } from "lucide-react";

import { getItem, itemSubtitle } from "../domain/catalog.js";
import { COIN_DENOMINATIONS, coinsAreEmpty } from "../domain/money.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";

const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the command."}` : "";

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

/**
 * One drawer for both kinds of container. A defeated creature is looted exactly
 * like a chest — stand next to it, spend the Bonus Action, take one unit at a
 * time — so the only difference is what the copy calls it.
 */
export default function ChestLootDrawer({ chest, body = false, busy = false, error = null, take, takeCoin, close }) {
  const itemTotal = chest?.inventory?.reduce((sum, entry) => sum + entry.quantity, 0) || 0;
  const coinTotal = COIN_DENOMINATIONS.reduce((sum, { id }) => sum + (chest?.coins?.[id] || 0), 0);
  const total = itemTotal + coinTotal;
  const hasCoins = !coinsAreEmpty(chest?.coins);
  const dialogRef = useDialogA11y({ onClose: close });
  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside ref={dialogRef} className="drawer nf-state-dialog nf-state-loot-drawer" role="dialog" aria-modal="true" aria-labelledby="chest-loot-title" tabIndex={-1}>
        <div className="drawer-top"><div><span className="kicker kicker-brass">{body ? `Searching ${chest.name}` : "Opened chest"}</span><h2 id="chest-loot-title">Take one item</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          {error && <div className="nf-state-inline-error" role="alert"><strong>Loot was not saved</strong><span>{errorText(error)}</span></div>}
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Contents</span><span className={`tag ${total ? "tag-brass" : ""}`}>{total ? `${total} remaining` : "Empty"}</span></div>
            <div className="nf-state-loot-list">
              {COIN_DENOMINATIONS.filter(({ id }) => chest?.coins?.[id] > 0).map((denomination) => (
                <button type="button" className="btn btn-line btn-wide" key={denomination.id} onClick={() => takeCoin(denomination.id)} disabled={busy}>
                  <PackageOpen size={15} />
                  <span><strong>{denomination.name} coin</strong><small>Money · take one</small></span>
                  <em className="numeral">×{chest.coins[denomination.id]}</em>
                </button>
              ))}
              {chest?.inventory?.map((entry) => {
                const item = getItem(entry.itemId);
                return <button type="button" className="btn btn-line btn-wide" key={entry.itemId} onClick={() => take(entry.itemId)} disabled={busy}>
                  <PackageOpen size={15} />
                  <span><strong>{item?.name || entry.itemId}</strong><small>{item ? itemSubtitle(item) : "Recovered catalog entry"}</small></span>
                  <em className="numeral">×{entry.quantity}</em>
                </button>;
              })}
              {!total && !hasCoins && <div className="void-state nf-state-loot-empty"><span className="void-orb"><PackageOpen size={24} /></span><h3>{body ? "Nothing left to take" : "Chest depleted"}</h3><p>This empty state is persisted and restart will not refill it.</p></div>}
            </div>
            <p className="note">Each Take transfers exactly one unit. {body ? "Searching" : "Opening"} spent the Bonus Action; taking items never advances initiative.</p>
          </section>
        </div>
        <div className="drawer-foot"><button className="btn btn-key" onClick={close}>Done looting</button></div>
      </aside>
    </PortalLayer>
  );
}
