import { Ban, Dices, Sparkles, Target } from "lucide-react";

const STAGES = ["spin", "natural", "modifiers", "verdict"];

/** Milliseconds between one modifier row appearing and the next. */
const MODIFIER_STAGGER = 240;

const signed = (value) => (value >= 0 ? `+${value}` : String(value).replace("-", "−"));

const headingFor = (outcome) => {
  if (outcome.kind === "death") return "Death saving throw";
  if (outcome.kind === "save") return `${outcome.abilityName} saving throw`;
  if (outcome.kind === "skill") return `${outcome.skillName} check`;
  return `${outcome.abilityName} check`;
};

const kickerFor = (outcome) => {
  if (outcome.kind === "death") return "Death saving throw";
  return outcome.kind === "save" ? "Saving throw" : "Ability check";
};

/**
 * A death saving throw is the one roll where the verdict is not "did it beat the
 * number". Both ends of the die do something the total cannot describe, and
 * three of them decide whether a creature lives, so the tally is the news.
 */
const deathVerdict = (outcome) => {
  if (outcome.revived) return { label: "Back on their feet", copy: `A natural twenty. ${outcome.tokenName} comes round with 1 hit point.`, tone: "success" };
  if (outcome.died) return { label: "Dead", copy: `A third failed save. ${outcome.tokenName} does not get up.`, tone: "failure" };
  if (outcome.stabilised) return { label: "Stable", copy: `A third success. ${outcome.tokenName} stops rolling and holds on at zero hit points.`, tone: "success" };
  if (outcome.succeeded) return { label: "Success", copy: `${outcome.successes} of 3 successes. ${outcome.failures} of 3 failures.`, tone: "success" };
  return {
    label: outcome.criticalFailure ? "Failure, twice over" : "Failure",
    copy: `${outcome.criticalFailure ? "A natural one counts as two failures. " : ""}${outcome.failures} of 3 failures. ${outcome.successes} of 3 successes.`,
    tone: "failure",
  };
};

/**
 * The sibling of the attack cinematic for everything that is not an attack.
 * It is deliberately a separate component: an attack always resolves against an
 * armour class and always has damage to tell, while a check may have no
 * difficulty class at all and may never roll a die.
 */
export default function CheckCinematic({ cinematic, skip }) {
  const { outcome, stage, error } = cinematic;
  const stageIndex = STAGES.indexOf(stage);
  const revealed = stageIndex >= 1;
  const showModifiers = stageIndex >= 2 && !outcome.autoFailed;
  const showVerdict = stageIndex >= 3;

  // A death saving throw has no modifier at all — not a zero one — so showing
  // "Modifier +0" would invite the reader to look for the bonus that is missing.
  const modifierRows = outcome.kind === "death"
    ? []
    : [
      {
        id: "modifier",
        label: outcome.proficient ? "Modifier, proficient" : "Modifier",
        value: signed(outcome.modifier),
      },
    ];

  const death = outcome.kind === "death" ? deathVerdict(outcome) : null;

  const verdictLabel = death ? death.label : outcome.autoFailed
    ? "Automatic failure"
    : outcome.succeeded === null
      ? "Rolled"
      : outcome.succeeded
        ? "Success"
        : "Failure";

  const verdictCopy = death ? death.copy : outcome.autoFailed
    ? `${outcome.autoFailReasons.join(" and ")} means this save fails without a roll.`
    : outcome.succeeded === null
      ? `${outcome.tokenName} scores ${outcome.total}. No difficulty class was set, so nothing is decided here.`
      : outcome.succeeded
        ? `${outcome.total} meets or beats DC ${outcome.dc}.`
        : `${outcome.total} falls short of DC ${outcome.dc}.`;

  const verdictTone = death ? death.tone : outcome.autoFailed || outcome.succeeded === false
    ? "failure"
    : outcome.succeeded === true
      ? "success"
      : "neutral";

  return (
    <>
      <div className="nf-state-cinematic-veil" onClick={skip} aria-hidden="true" />
      <section
        className={`nf-state-cinematic nf-state-check-cinematic nf-state-cinematic-${stage}`}
        role="status"
        aria-label="Check result"
        onClick={skip}
      >
        <header className="nf-state-cinematic-head">
          <span className="kicker kicker-brass">{kickerFor(outcome)}</span>
          <h2>{outcome.tokenName} <Dices size={16} /> {headingFor(outcome)}</h2>
          <p>{outcome.dc === null ? "No difficulty class" : `DC ${outcome.dc}`} · {outcome.mode}</p>
        </header>

        <div className="nf-state-cinematic-stage">
          <div className="nf-state-cinematic-dice">
            {outcome.autoFailed
              ? <span className="nf-state-cinematic-die nf-state-check-die-void"><Ban size={20} /><small>no roll</small></span>
              : outcome.rolls.map((roll, index) => (
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
            {outcome.autoFailed && <p className="nf-state-cinematic-natural"><Ban size={14} /> The die is never thrown</p>}
            {!outcome.autoFailed && !revealed && <p className="nf-state-cinematic-rolling"><Sparkles size={14} /> Rolling {outcome.rolls.length > 1 ? "two dice" : "one d20"}…</p>}
            {!outcome.autoFailed && revealed && <p className="nf-state-cinematic-natural"><Target size={14} /> Natural <strong>{outcome.naturalRoll}</strong></p>}

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
                  <strong className="numeral">{outcome.total}</strong>
                </li>
                {outcome.dc !== null && (
                  <li className="nf-state-cinematic-target" style={{ animationDelay: `${(modifierRows.length + 1) * MODIFIER_STAGGER}ms` }}>
                    <span><Target size={12} /> Difficulty class</span>
                    <strong className="numeral">{outcome.dc}</strong>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="nf-state-cinematic-result">
          {showVerdict && (
            <div className={`nf-state-cinematic-verdict nf-state-check-verdict-${verdictTone}`}>
              <strong>{verdictLabel}</strong>
              <span>{verdictCopy}</span>
            </div>
          )}
        </div>

        <div className="nf-state-cinematic-sources">
          {outcome.sources.length
            ? outcome.sources.map((source) => (
              <span className={`tag ${source.mode === "advantage" ? "tag-jade" : "tag-foe"}`} key={source.code}>{source.label}</span>
            ))
            : <span className="tag">Normal roll</span>}
        </div>

        {error && <div className="nf-state-inline-error" role="alert"><strong>Roll was not saved</strong><span>{error.message} {error.recovery}</span></div>}

        <p className="nf-state-cinematic-skip">Click anywhere to skip</p>
      </section>
    </>
  );
}
