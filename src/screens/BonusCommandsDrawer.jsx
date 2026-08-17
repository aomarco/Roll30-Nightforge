import { createPortal } from "react-dom";
import { ArchiveRestore, Footprints, PackageOpen, ShieldHalf, X } from "lucide-react";

import { getItem, itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining } from "../domain/combat.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";

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
  chestOptions = [],
  retrievalOptions = [],
  openChest,
  retrieve,
}) {
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);
  const option = bonusState.ok ? bonusState.value.options[0] : null;
  const dialogRef = useDialogA11y({ onClose: close });

  return (
    <PortalLayer>
      <div className="veil" onClick={close} />
      <aside ref={dialogRef} className="drawer nf-state-dialog nf-state-combat-drawer" role="dialog" aria-modal="true" aria-labelledby="bonus-commands-title" tabIndex={-1}>
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
            <div className="nf-state-bonus-command-group">
              <span className="label">Battle chests</span>
              {chestOptions.map(({ chest, availability }, index) => <button className="btn btn-line btn-wide" key={chest.id} onClick={() => openChest(chest.id)} disabled={busy || !availability.ok} title={availability.ok ? availability.value.alreadyOpen ? "Resume this opened chest" : "Spend Bonus Action and open this chest" : availability.message}>
                <PackageOpen size={15} /> Chest {index + 1}
                <span className="nf-state-command-reason">{availability.ok ? availability.value.alreadyOpen ? "Resume looting" : `${chest.inventory.reduce((total, entry) => total + entry.quantity, 0)} items · adjacent` : availability.message}</span>
              </button>)}
              {!chestOptions.length && <p className="note">No Battle chests are on this Table.</p>}
            </div>
            <div className="nf-state-bonus-command-group">
              <span className="label">Physical weapons</span>
              {retrievalOptions.map(({ battleItem, availability }) => {
                const weapon = getItem(battleItem.itemId);
                return <button className="btn btn-line btn-wide" key={battleItem.id} onClick={() => retrieve(battleItem.id)} disabled={busy || !availability.ok} title={availability.ok ? `${availability.value.cost === "free" ? "Free" : "Bonus Action"} retrieval` : availability.message}>
                  <ArchiveRestore size={15} /> Retrieve {weapon?.name || battleItem.itemId}
                  <span className="nf-state-command-reason">{availability.ok ? `${availability.value.retrievalKind.replaceAll("-", " ")} · ${availability.value.cost}` : availability.message}</span>
                </button>;
              })}
              {!retrievalOptions.length && <p className="note">No thrown weapons are present in this encounter.</p>}
            </div>
          </section>
          {!bonusState.ok && <div className="nf-state-inline-error" role="status"><strong>Off-hand attack unavailable</strong><span>{bonusState.message} {bonusState.recovery}</span></div>}
        </div>
        <div className="drawer-foot"><button className="btn btn-line" onClick={close}><Footprints size={15} /> Keep turn open</button></div>
      </aside>
    </PortalLayer>
  );
}
