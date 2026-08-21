import { RotateCcw, Sparkles, Trophy } from "lucide-react";

import { getItem } from "../domain/catalog.js";
import { encounterExperienceAward } from "../domain/encounter.js";

export default function BattleCompletion({ encounter, tokens, busy = false, restart, awardXp }) {
  const winner = tokens.find((token) => token.id === encounter?.winnerTokenId) || null;
  const spent = Object.values(encounter?.ammoSpentByToken || {}).reduce((total, byItem) =>
    total + Object.values(byItem || {}).reduce((itemTotal, quantity) => itemTotal + Number(quantity || 0), 0), 0);
  const recovered = Object.values(encounter?.ammoSpentByToken || {}).flatMap((byItem) => Object.entries(byItem || {}))
    .reduce((total, [, quantity]) => total + Math.floor(Number(quantity || 0) * 0.5), 0);
  const ammoKinds = [...new Set(Object.values(encounter?.ammoSpentByToken || {}).flatMap((byItem) => Object.keys(byItem || {})))]
    .map((itemId) => getItem(itemId)?.name || itemId);
  const award = encounterExperienceAward(tokens, encounter);
  const payable = award.total > 0 && award.recipients.length > 0 && !award.alreadyAwarded;
  return (
    <section className="nf-state-battle-complete glass grained" role="status" aria-label="Battle complete">
      <span className="nf-state-battle-complete-icon"><Trophy size={22} /></span>
      <div><span className="kicker kicker-brass">Battle complete</span><h2>{winner ? `${winner.name} wins` : "No survivor"}</h2><p>{spent ? `${recovered} of ${spent} fired ammunition recovered${ammoKinds.length ? ` · ${ammoKinds.join(", ")}` : ""}.` : "No ammunition recovery was required."}</p></div>
      {award.total > 0 && (
        <div className="nf-state-battle-xp">
          <span className="kicker">Experience</span>
          <strong className="numeral">{award.total.toLocaleString("en-AU")} XP</strong>
          <p>
            {award.alreadyAwarded
              ? "Already awarded for this Battle."
              : award.recipients.length
                ? `${award.perHero.toLocaleString("en-AU")} each to ${award.recipients.map((entry) => entry.name).join(", ")}.`
                : "No Hero survived to collect it."}
          </p>
        </div>
      )}
      <div className="nf-state-battle-complete-actions">
        {award.total > 0 && (
          <button
            className="btn"
            onClick={() => awardXp(award)}
            disabled={busy || !payable}
            title={award.alreadyAwarded
              ? "Experience for this Battle has already been awarded."
              : award.recipients.length
                ? `Add ${award.perHero} experience to each surviving Hero. Levelling up stays your choice.`
                : "Only Heroes standing at the end of a Battle earn experience."}
          >
            <Sparkles size={15} /> {award.alreadyAwarded ? "Experience awarded" : "Award XP"}
          </button>
        )}
        <button className="btn btn-key" onClick={restart} disabled={busy}><RotateCcw size={15} /> Restart Battle</button>
      </div>
    </section>
  );
}
