import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArchiveRestore, Footprints, PackageOpen, ShieldHalf, X } from "lucide-react";

import { itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining } from "../domain/combat.js";

const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the command."}` : "";

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

export default function BonusCommandsDrawer({
  token,
  resources,
  bonusState,
  busy = false,
  error = null,
  close,
  attack,
}) {
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);
  const option = bonusState.ok ? bonusState.value.options[0] : null;

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside className="drawer nf-state-combat-drawer" role="dialog" aria-modal="true" aria-labelledby="bonus-commands-title">
        <div className="drawer-top"><div><span className="kicker kicker-brass">Bonus command</span><h2 id="bonus-commands-title">{token.name}&apos;s Bonus Action</h2></div><button className="glyph" onClick={close} aria-label="Close"><X size={17} /></button></div>
        <div className="drawer-body">
          {error && <div className="nf-state-inline-error" role="alert"><strong>Command not completed</strong><span>{errorText(error)}</span></div>}
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Turn resources</span><span className="tag tag-jade">No automatic End Turn</span></div>
            <div className="nf-state-combat-resource-grid">
              <span><small>Movement</small><strong className="numeral">{remaining} / {maximum} ft</strong></span>
              <span><small>Bonus</small><strong>{resources.bonusActionSpent ? resources.bonusActionType || "Spent" : "Available"}</strong></span>
            </div>
          </section>
          <section className="unit">
            <div className="unit-top"><span className="unit-label">Bonus commands</span><span className="tag">Contextual</span></div>
            <button className="btn btn-line btn-wide" onClick={() => option && attack({ kind: "bonus", weaponId: option.weaponId, hand: option.hand })} disabled={busy || !bonusState.ok} title={bonusState.ok ? "Enter off-hand targeting mode" : bonusState.message}>
              <ShieldHalf size={15} /> Off-hand attack
              <span className="nf-state-command-reason">{option ? `${option.weapon.name} · ${itemSubtitle(option.weapon)}` : bonusState.message}</span>
            </button>
            <button className="btn btn-line btn-wide" disabled title="Battle chest looting arrives in Phase 10"><PackageOpen size={15} /> Open adjacent chest <span className="nf-state-command-reason">Phase 10</span></button>
            <button className="btn btn-line btn-wide" disabled title="Physical weapon retrieval arrives in Phase 10"><ArchiveRestore size={15} /> Retrieve weapon <span className="nf-state-command-reason">Phase 10</span></button>
          </section>
          {!bonusState.ok && <div className="nf-state-inline-error" role="status"><strong>Off-hand attack unavailable</strong><span>{bonusState.message} {bonusState.recovery}</span></div>}
        </div>
        <div className="drawer-foot"><button className="btn btn-line" onClick={close}><Footprints size={15} /> Keep turn open</button></div>
      </aside>
    </PortalLayer>
  );
}
