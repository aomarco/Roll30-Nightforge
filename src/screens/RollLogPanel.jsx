export default function RollLogPanel({ entries = [], sceneId = null, heroId = null }) {
  const visible = entries
    .filter((entry) => (sceneId ? entry.sceneId === sceneId : true))
    .filter((entry) => (heroId ? entry.heroId === heroId : true))
    .slice(-6)
    .reverse();
  return (
    <section className="unit nf-state-roll-log" aria-labelledby="roll-log-title">
      <div className="unit-top"><div><span className="unit-label" id="roll-log-title">Recent rolls</span><p className="note">A bounded campaign record outside Battle initiative.</p></div><span className="tag numeral">{visible.length}</span></div>
      {visible.length ? (
        <div className="nf-state-roll-log-list">
          {visible.map((entry) => <article key={entry.id}><div><strong>{entry.line || `${entry.outcome?.kind || "Check"} roll`}</strong><small>{entry.visibility === "private" ? "Private" : "Public"} · {entry.contextKind}</small></div><b className="numeral">{entry.outcome?.total ?? "—"}</b></article>)}
        </div>
      ) : <p className="note">No exploration rolls have been recorded here yet.</p>}
    </section>
  );
}
