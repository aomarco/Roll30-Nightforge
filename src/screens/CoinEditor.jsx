import { useEffect, useState } from "react";
import { Coins, Minus, Plus } from "lucide-react";

import { COIN_DENOMINATIONS, formatCoins, normalizeCoins } from "../domain/money.js";

export default function CoinEditor({ coins, onChange, busy = false, compact = false, title = "Money" }) {
  const normalized = normalizeCoins(coins);
  const [draft, setDraft] = useState(normalized);

  useEffect(() => setDraft(normalizeCoins(coins)), [coins?.cp, coins?.sp, coins?.ep, coins?.gp, coins?.pp]);

  const commit = (denominationId, value) => {
    const next = { ...draft, [denominationId]: Math.max(0, Math.floor(Number(value) || 0)) };
    setDraft(next);
    return onChange?.(next);
  };

  return (
    <section className={`nf-state-coins${compact ? " nf-state-coins-compact" : ""}`}>
      <div className="unit-top">
        <span className="unit-label"><Coins size={14} /> {title}</span>
        <span className="tag">{formatCoins(normalized)}</span>
      </div>
      <div className="nf-state-coin-grid">
        {COIN_DENOMINATIONS.map((denomination) => (
          <label className="nf-state-coin" key={denomination.id} title={`${denomination.name} coins`}>
            <span>{denomination.abbreviation}</span>
            <button type="button" className="glyph" onClick={() => commit(denomination.id, draft[denomination.id] - 1)} disabled={busy || draft[denomination.id] <= 0} aria-label={`Remove one ${denomination.name} coin`}><Minus size={12} /></button>
            <input className="numeral" type="number" min="0" step="1" value={draft[denomination.id]} disabled={busy} onChange={(event) => setDraft({ ...draft, [denomination.id]: event.target.value })} onBlur={(event) => commit(denomination.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${denomination.name} coins`} />
            <button type="button" className="glyph" onClick={() => commit(denomination.id, Number(draft[denomination.id]) + 1)} disabled={busy} aria-label={`Add one ${denomination.name} coin`}><Plus size={12} /></button>
          </label>
        ))}
      </div>
    </section>
  );
}
