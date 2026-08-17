import { RotateCcw, Trophy } from "lucide-react";

import { getItem } from "../domain/catalog.js";

export default function BattleCompletion({ encounter, tokens, busy = false, restart }) {
  const winner = tokens.find((token) => token.id === encounter?.winnerTokenId) || null;
  const spent = Object.values(encounter?.ammoSpentByToken || {}).reduce((total, byItem) =>
    total + Object.values(byItem || {}).reduce((itemTotal, quantity) => itemTotal + Number(quantity || 0), 0), 0);
  const recovered = Object.values(encounter?.ammoSpentByToken || {}).flatMap((byItem) => Object.entries(byItem || {}))
    .reduce((total, [, quantity]) => total + Math.floor(Number(quantity || 0) * 0.5), 0);
  const ammoKinds = [...new Set(Object.values(encounter?.ammoSpentByToken || {}).flatMap((byItem) => Object.keys(byItem || {})))]
    .map((itemId) => getItem(itemId)?.name || itemId);
  return (
    <section className="nf-state-battle-complete glass grained" role="status" aria-label="Battle complete">
      <span className="nf-state-battle-complete-icon"><Trophy size={22} /></span>
      <div><span className="kicker kicker-brass">Battle complete</span><h2>{winner ? `${winner.name} wins` : "No survivor"}</h2><p>{spent ? `${recovered} of ${spent} fired ammunition recovered${ammoKinds.length ? ` · ${ammoKinds.join(", ")}` : ""}.` : "No ammunition recovery was required."}</p></div>
      <button className="btn btn-key" onClick={restart} disabled={busy}><RotateCcw size={15} /> Restart Battle</button>
    </section>
  );
}
