import { Shield, Sparkles, Swords, Target } from "lucide-react";

const STAGES = ["spin", "natural", "modifiers", "verdict", "damage", "impact"];

/** Milliseconds between one modifier row appearing and the next. */
const MODIFIER_STAGGER = 240;
const DAMAGE_STAGGER = 170;

const signed = (value) => (value >= 0 ? `+${value}` : String(value).replace("-", "−"));

/**
 * The roll is told one beat at a time, and every beat animates: the dice
 * tumble before they settle, each modifier slides in on its own, the verdict
 * stamps down, and the damage dice roll separately. The panel keeps a fixed
 * height so nothing jumps while you are reading it.
 */
export default function AttackCinematic({ cinematic, skip }) {
  const { outcome, stage, error } = cinematic;
  const stageIndex = STAGES.indexOf(stage);
  const revealed = stageIndex >= 1;
  const showModifiers = stageIndex >= 2;
  const showVerdict = stageIndex >= 3;
  const showDamage = stageIndex >= 4 && outcome.hit;
  const showImpact = stageIndex >= 5;

  const modifierRows = [
    { id: "ability", label: `${outcome.ability.ability} modifier`, value: signed(outcome.ability.modifier) },
    { id: "proficiency", label: "Proficiency", value: signed(outcome.proficiency) },
    ...(outcome.magicAttackBonus ? [{ id: "magic", label: "Magic", value: signed(outcome.magicAttackBonus) }] : []),
  ];

  const verdictCopy = outcome.verdict === "critical"
    ? outcome.autoCritical
      ? "Critical hit — the target's condition made this an automatic critical."
      : "Critical hit — a Natural 20 doubles the damage dice."
    : outcome.hit
      ? `${outcome.attackTotal} meets or beats AC ${outcome.targetAc}.`
      : outcome.naturalRoll === 1
        ? "Natural 1 always misses, whatever the modifiers say."
        : `${outcome.attackTotal} falls short of AC ${outcome.targetAc}.`;

  return (
    <>
      <div className="nf-state-cinematic-veil" onClick={skip} aria-hidden="true" />
      <section
        className={`nf-state-cinematic nf-state-cinematic-${stage}`}
        role="status"
        aria-label="Attack result"
        onClick={skip}
      >
        <header className="nf-state-cinematic-head">
          <span className="kicker kicker-brass">{outcome.kind === "bonus" ? "Off-hand attack" : "Attack Action"}</span>
          <h2>{outcome.attackerName} <Swords size={16} /> {outcome.targetName}</h2>
          <p>{outcome.weaponName} · {outcome.range.distanceFeet} ft · {outcome.mode}</p>
        </header>

        <div className="nf-state-cinematic-stage">
          <div className="nf-state-cinematic-dice">
            {outcome.rolls.map((roll, index) => (
              <span
                className={`nf-state-cinematic-die${revealed && index === outcome.selectedIndex ? " selected" : ""}${revealed && index !== outcome.selectedIndex ? " rejected" : ""}`}
                key={index}
              >
                {revealed ? roll : "?"}
                <small>d20</small>
              </span>
            ))}
          </div>

          <div className="nf-state-cinematic-readout">
            {!revealed && <p className="nf-state-cinematic-rolling"><Sparkles size={14} /> Rolling {outcome.rolls.length > 1 ? "two dice" : "one d20"}…</p>}
            {revealed && <p className="nf-state-cinematic-natural"><Target size={14} /> Natural <strong>{outcome.naturalRoll}</strong></p>}

            {showModifiers && (
              <ul className="nf-state-cinematic-modifiers">
                {modifierRows.map((row, index) => (
                  <li key={row.id} style={{ animationDelay: `${index * MODIFIER_STAGGER}ms` }}>
                    <span>{row.label}</span>
                    <strong className="numeral">{row.value}</strong>
                  </li>
                ))}
                <li className="nf-state-cinematic-total" style={{ animationDelay: `${modifierRows.length * MODIFIER_STAGGER}ms` }}>
                  <span>Total</span>
                  <strong className="numeral">{outcome.attackTotal}</strong>
                </li>
                <li className="nf-state-cinematic-target" style={{ animationDelay: `${(modifierRows.length + 1) * MODIFIER_STAGGER}ms` }}>
                  <span><Shield size={12} /> Target AC</span>
                  <strong className="numeral">{outcome.targetAc}</strong>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="nf-state-cinematic-result">
          {showVerdict && (
            <div className={`nf-state-cinematic-verdict nf-state-cinematic-verdict-${outcome.verdict}`}>
              <strong>{outcome.verdict === "critical" ? "Critical" : outcome.hit ? "Hit" : "Miss"}</strong>
              <span>{verdictCopy}</span>
            </div>
          )}

          {showDamage && (
            <div className="nf-state-cinematic-damage">
              <div className="nf-state-cinematic-damage-dice">
                {outcome.damage.rolls.map((roll, index) => (
                  <span key={index} style={{ animationDelay: `${index * DAMAGE_STAGGER}ms` }}>{roll}</span>
                ))}
              </div>
              <strong className="numeral">{outcome.damage.total}</strong>
              <small className="numeral">
                {outcome.damage.definition}
                {outcome.damage.critical ? " doubled" : ""}
                {outcome.damage.modifier ? ` ${signed(outcome.damage.modifier)}` : ""}
              </small>
            </div>
          )}

          {showImpact && (
            <p className="nf-state-cinematic-impact-copy">
              {outcome.hit
                ? <>{outcome.targetName}: <strong className="numeral">{outcome.previousHp}</strong> → <strong className="numeral">{outcome.nextHp}</strong> HP</>
                : <>{outcome.targetName} takes no damage and stays on <strong className="numeral">{outcome.nextHp}</strong> HP</>}
            </p>
          )}
        </div>

        <div className="nf-state-cinematic-sources">
          {outcome.sources.length
            ? outcome.sources.map((source) => (
              <span className={`tag ${source.mode === "advantage" ? "tag-jade" : "tag-foe"}`} key={source.code}>{source.label}</span>
            ))
            : <span className="tag">Normal roll</span>}
        </div>

        {error && <div className="nf-state-inline-error" role="alert"><strong>Attack was not saved</strong><span>{error.message} {error.recovery}</span></div>}

        <p className="nf-state-cinematic-skip">Click anywhere to skip</p>
      </section>
    </>
  );
}
