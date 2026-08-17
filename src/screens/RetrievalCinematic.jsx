import { createPortal } from "react-dom";
import { ArchiveRestore, Sparkles } from "lucide-react";

const STAGES = ["spin", "natural", "modifiers", "verdict", "impact", "failed"];
const signed = (value) => Number(value) >= 0 ? `+${Number(value)}` : String(Number(value));

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

export default function RetrievalCinematic({ cinematic }) {
  if (!cinematic?.outcome) return null;
  const { outcome, stage = "spin", error = null } = cinematic;
  const stageIndex = STAGES.indexOf(stage);
  const revealed = stageIndex >= 1;
  const showModifiers = stageIndex >= 2;
  const showVerdict = stageIndex >= 3;
  const showImpact = stageIndex >= 4;
  return (
    <PortalLayer>
      <div className="nf-state-cinematic-veil" />
      <section className={`nf-state-cinematic nf-state-retrieval-cinematic nf-state-cinematic-${stage}`} role="status" aria-live="assertive" aria-label="Weapon retrieval result">
        <div className="nf-state-cinematic-heading">
          <span className="kicker kicker-brass">Weapon retrieval</span>
          <h2>{outcome.actorName} <ArchiveRestore size={20} /> {outcome.weaponName}</h2>
          <p>Embedded in a living target · DC {outcome.dc}</p>
        </div>
        <div className="nf-state-cinematic-dice"><span className={`nf-state-cinematic-die${revealed ? " selected" : ""}`}>{revealed ? outcome.roll : "?"}<small>d20</small></span></div>
        <div className="nf-state-cinematic-readout">
          {!revealed && <p><Sparkles size={15} /> Rolling retrieval check…</p>}
          {revealed && <p>Natural <strong className="numeral">{outcome.roll}</strong></p>}
          {showModifiers && <p>STR {signed(outcome.strengthModifier)} · DEX {signed(outcome.dexterityModifier)} = <strong className="numeral">{outcome.total}</strong></p>}
          {showModifiers && <p>Retrieval DC <strong className="numeral">{outcome.dc}</strong></p>}
        </div>
        {showVerdict && <div className={`nf-state-cinematic-verdict nf-state-cinematic-verdict-${outcome.succeeded ? "hit" : "miss"}`}><strong>{outcome.succeeded ? "Weapon retrieved" : "Retrieval failed"}</strong><span>{outcome.succeeded ? `${outcome.total} meets DC ${outcome.dc}` : `${outcome.total} misses DC ${outcome.dc}`}</span></div>}
        {showImpact && !error && <p className="nf-state-cinematic-impact-copy">{outcome.succeeded ? `${outcome.weaponName} returns to ${outcome.placement === "inventory" ? "inventory" : outcome.placement === "mainHand" ? "the main hand" : "the off hand"}.` : `${outcome.weaponName} remains embedded. The Bonus Action is spent.`}</p>}
        {error && <div className="nf-state-inline-error" role="alert"><strong>Retrieval was not saved</strong><span>{error.message} {error.recovery}</span></div>}
      </section>
    </PortalLayer>
  );
}
