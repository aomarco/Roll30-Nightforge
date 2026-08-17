import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Footprints, Gauge, RefreshCw, Swords, X } from "lucide-react";

import { ITEM_BY_ID, itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining, validateSwapLoadout } from "../domain/combat.js";

const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the command."}` : "";

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

export default function CombatCommandsDrawer({
  token,
  resources,
  dashState,
  swapState,
  attackState,
  busy = false,
  error = null,
  close,
  attack,
  dash,
  swap,
  end,
  initialSwapOpen = false,
  initialSwapDraft = null,
  initialAttackOpen = false,
}) {
  const [swapOpen, setSwapOpen] = useState(initialSwapOpen);
  const [attackOpen, setAttackOpen] = useState(initialAttackOpen);
  const [draft, setDraft] = useState(() => initialSwapDraft || { ...token.loadout });
  const weapons = useMemo(() => token.inventory
    .map((entry) => ({ item: ITEM_BY_ID[entry.itemId], quantity: entry.quantity }))
    .filter(({ item }) => item?.kind === "weapon"), [token.inventory]);
  const validation = validateSwapLoadout(token, draft);
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const toggleSwap = () => {
    setDraft({ ...token.loadout });
    setSwapOpen((current) => !current);
    setAttackOpen(false);
  };
  const toggleAttack = () => {
    setAttackOpen((current) => !current);
    setSwapOpen(false);
  };
  const updateDraft = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value || null }));

  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside className="drawer nf-state-combat-drawer" role="dialog" aria-modal="true" aria-labelledby="combat-commands-title">
        <div className="drawer-top"><div><span className="kicker kicker-brass">Round command</span><h2 id="combat-commands-title">{token.name}&apos;s turn</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          {error && <div className="nf-state-inline-error" role="alert"><strong>Command not completed</strong><span>{errorText(error)}</span></div>}
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Turn resources</span><span className="tag tag-jade">Round movement</span></div>
            <div className="nf-state-combat-resource-grid">
              <span><small>Movement</small><strong className="numeral">{remaining} / {maximum} ft</strong></span>
              <span><small>Action</small><strong>{resources.actionSpent ? resources.actionType || "Spent" : "Available"}</strong></span>
              <span><small>Bonus</small><strong>{resources.bonusActionSpent ? resources.bonusActionType || "Spent" : "Available"}</strong></span>
              <span><small>Swap</small><strong>{resources.swapped ? resources.swapChoice || "Pending branch" : "Available"}</strong></span>
            </div>
          </section>

          <section className="unit">
            <div className="unit-top"><span className="unit-label">Action commands</span><span className="tag">End Turn stays available</span></div>
            <button className={`btn btn-wide ${attackOpen ? "btn-key" : "btn-line"}`} onClick={toggleAttack} disabled={busy || !attackState.ok} title={attackState.ok ? "Choose an equipped weapon and enter targeting mode" : attackState.message}><Swords size={15} /> Attack <span className="nf-state-command-reason">{attackState.ok ? `${attackState.value.options.length} equipped` : attackState.message}</span></button>
            <button className="btn btn-line btn-wide" onClick={dash} disabled={busy || !dashState.ok} title={dashState.ok ? "Spend Action and add one complete Speed" : dashState.message}><Gauge size={15} /> Dash <span className="nf-state-command-reason">{dashState.ok ? `Add ${token.baseSpeed} ft` : dashState.message}</span></button>
            <button className={`btn btn-wide ${swapOpen ? "btn-key" : "btn-line"}`} onClick={toggleSwap} disabled={busy || !swapState.ok} title={swapState.ok ? "Choose a legal per-Battle weapon loadout" : swapState.message}><RefreshCw size={15} /> Swap weapons <span className="nf-state-command-reason">{swapState.ok ? "Once this turn" : swapState.message}</span></button>
          </section>

          {attackOpen && attackState.ok && (
            <section className="unit nf-state-combat-attack-draft">
              <div className="unit-top"><span className="unit-label">Choose attack weapon</span><span className="tag tag-jade">Equipped only</span></div>
              <div className="nf-state-combat-weapon-list">
                {attackState.value.options.map((option) => (
                  <button className="btn btn-line btn-wide" key={option.key} onClick={() => attack({ kind: "action", weaponId: option.weaponId, hand: option.hand })} disabled={busy}>
                    <Swords size={15} />
                    <span className="nf-state-combat-weapon-copy"><strong>{option.weapon.name}</strong><small>{option.hand === "mainHand" ? "Main hand" : "Off hand"} · {itemSubtitle(option.weapon)}</small></span>
                  </button>
                ))}
              </div>
              <p className="note">Choose a weapon, then select a living token inside the highlighted range. Blocked and out-of-range attempts do not spend Action.</p>
            </section>
          )}

          {swapOpen && swapState.ok && (
            <section className="unit nf-state-combat-swap-draft">
              <div className="unit-top"><span className="unit-label">Swap draft</span><span className="tag tag-brass">Owned weapons</span></div>
              <div className="grid-fields">
                <label className="field"><span className="label">Main hand</span><select className="sel" value={draft.mainHand || ""} onChange={updateDraft("mainHand")}><option value="">Empty</option>{weapons.map(({ item }) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label className="field"><span className="label">Off hand</span><select className="sel" value={draft.offHand || ""} onChange={updateDraft("offHand")}><option value="">Empty</option>{weapons.map(({ item, quantity }) => <option value={item.id} key={item.id}>{item.name}{item.id === draft.mainHand && quantity < 2 ? " · needs quantity 2" : ""}</option>)}</select></label>
              </div>
              {!validation.ok && <div className="nf-state-inline-error" role="status"><strong>Choose another loadout</strong><span>{validation.message}</span></div>}
              <p className="note">Swap then Attack causes disadvantage and blocks movement. Moving before or after Swap blocks Attack and Dash while preserving unused movement.</p>
              <button className="btn btn-key btn-wide" onClick={() => swap(draft)} disabled={busy || !validation.ok}><RefreshCw size={15} /> Confirm weapon swap</button>
            </section>
          )}
        </div>
        <div className="drawer-foot"><button className="btn btn-line" onClick={close}>Keep turn open</button><button className="btn btn-key" onClick={end} disabled={busy}><Footprints size={15} /> End Turn</button></div>
      </aside>
    </PortalLayer>
  );
}
