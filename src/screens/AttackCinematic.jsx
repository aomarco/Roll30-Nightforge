import { createPortal } from "react-dom";
import { Shield, Sparkles, Swords, Target } from "lucide-react";

const STAGES = ["spin", "natural", "modifiers", "verdict", "damage", "impact", "failed"];

function PortalLayer({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

const signed = (value) => Number(value) >= 0 ? `+${Number(value)}` : String(Number(value));

export default function AttackCinematic({ cinematic }) {
  if (!cinematic?.outcome) return null;
  const { outcome, stage = "spin", error = null } = cinematic;
  const stageIndex = STAGES.indexOf(stage);
  const revealed = stageIndex >= 1;
  const showModifiers = stageIndex >= 2;
  const showVerdict = stageIndex >= 3;
  const showDamage = stageIndex >= 4 && outcome.hit;
  const showImpact = stageIndex >= 5;
  return (
    <PortalLayer>
      <div className="nf-state-cinematic-veil" />
      <section className={`nf-state-cinematic nf-state-cinematic-${stage}`} role="status" aria-live="assertive" aria-label="Attack result">
        <div className="nf-state-cinematic-heading">
          <span className="kicker kicker-brass">{outcome.kind === "bonus" ? "Off-hand attack" : "Attack Action"}</span>
          <h2>{outcome.attackerName} <Swords size={20} /> {outcome.targetName}</h2>
          <p>{outcome.weaponName} · {outcome.range.distanceFeet} ft · {outcome.mode}</p>
        </div>
        <div className="nf-state-cinematic-dice" aria-label={`${outcome.rolls.length} d20 roll${outcome.rolls.length === 1 ? "" : "s"}`}>
          {outcome.rolls.map((roll, index) => <span key={index} className={`nf-state-cinematic-die${revealed && index !== outcome.selectedIndex ? " rejected" : ""}${revealed && index === outcome.selectedIndex ? " selected" : ""}`}>{revealed ? roll : "?"}<small>d20</small></span>)}
        </div>
        <div className="nf-state-cinematic-readout">
          {!revealed && <p><Sparkles size={15} /> Rolling {outcome.mode === "normal" ? "one d20" : "two d20s"}…</p>}
          {revealed && <p><Target size={15} /> Natural <strong className="numeral">{outcome.naturalRoll}</strong>{outcome.rolls.length > 1 && <span> · retained die</span>}</p>}
          {showModifiers && <p><Swords size={15} /> {outcome.ability.ability} {signed(outcome.ability.modifier)} · proficiency {signed(outcome.proficiency)} · magic {signed(outcome.magicAttackBonus)} = <strong className="numeral">{outcome.attackTotal}</strong></p>}
          {showModifiers && <p><Shield size={15} /> Target AC <strong className="numeral">{outcome.targetAc}</strong></p>}
        </div>
        {showVerdict && <div className={`nf-state-cinematic-verdict nf-state-cinematic-verdict-${outcome.verdict}`}><strong>{outcome.critical ? "Critical hit" : outcome.hit ? "Hit" : "Miss"}</strong><span>{outcome.critical ? outcome.autoCritical ? "Condition-forced melee critical" : "Natural 20" : outcome.hit ? `${outcome.attackTotal} meets AC ${outcome.targetAc}` : outcome.naturalRoll === 1 ? "Natural 1 always misses" : `${outcome.attackTotal} misses AC ${outcome.targetAc}`}</span></div>}
        {showDamage && <div className="nf-state-cinematic-damage"><span className="kicker">Damage</span><strong className="numeral">{outcome.damage.total}</strong><small>{outcome.damage.rolls.length ? `${outcome.damage.rolls.join(" + ")} ${signed(outcome.damage.modifier)}` : `${outcome.damage.diceTotal} ${signed(outcome.damage.modifier)}`}</small></div>}
        {showImpact && !error && <p className="nf-state-cinematic-impact-copy">{outcome.hit ? `${outcome.targetName}: ${outcome.previousHp} → ${outcome.nextHp} HP` : `${outcome.targetName} takes no damage.`}</p>}
        {error && <div className="nf-state-inline-error" role="alert"><strong>Attack was not saved</strong><span>{error.message} {error.recovery}</span></div>}
        <div className="nf-state-cinematic-sources">
          {outcome.sources.length ? outcome.sources.map((source) => <span className={`tag ${source.mode === "advantage" ? "tag-jade" : "tag-foe"}`} key={source.code}>{source.label}</span>) : <span className="tag">Normal roll</span>}
        </div>
      </section>
    </PortalLayer>
  );
}
