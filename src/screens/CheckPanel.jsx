import { useState } from "react";

import { ABILITIES, SKILLS } from "../domain/heroes.js";

const MODES = [
  ["normal", "Normal"],
  ["advantage", "Advantage"],
  ["disadvantage", "Disadvantage"],
];

const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value) || 0}`;

const modifierSourceLabel = (source) => {
  if (source.type === "ability") return "Ability modifier";
  if (source.type === "proficiency") return "Proficiency";
  if (source.type === "cover") return `${source.source || "Cover"} cover`;
  if (source.type === "save") return `Save ${source.source || "modifier"}`;
  return source.type || "Modifier";
};

const resultText = (outcome) => {
  if (!outcome) return "";
  if (outcome.autoFailed) return "Automatic failure";
  if (outcome.succeeded === null) return `Total ${outcome.total}`;
  return outcome.succeeded ? `Success · ${outcome.total}` : `Failure · ${outcome.total}`;
};

export default function CheckPanel({
  actorName = "Hero",
  onRoll = async () => ({ ok: false, message: "Checks are unavailable." }),
  disabled = false,
}) {
  const [kind, setKind] = useState("skill");
  const [skillId, setSkillId] = useState("perception");
  const [ability, setAbility] = useState("wis");
  const [dc, setDc] = useState("");
  const [mode, setMode] = useState("normal");
  const [visibility, setVisibility] = useState("public");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const rolled = await onRoll({
        kind,
        skillId: kind === "skill" ? skillId : undefined,
        ability,
        dc: dc === "" ? null : Number(dc),
        mode,
        visibility,
      });
      setResult(rolled?.ok ? rolled.outcome : rolled);
    } catch (error) {
      setResult({ message: error?.message || "Nightforge could not complete that check." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="unit nf-state-check-panel" onSubmit={submit}>
      <div className="unit-top">
        <div><span className="unit-label">Roll a check</span><p className="note">{actorName} · no initiative or resource cost</p></div>
        <span className="tag tag-jade">Exploration</span>
      </div>
      <div className="grid-fields">
        <label className="field">
          <span className="label">Check type</span>
          <select className="sel" value={kind} onChange={(event) => setKind(event.target.value)} disabled={disabled || busy}>
            <option value="skill">Skill</option>
            <option value="ability">Ability</option>
            <option value="save">Saving throw</option>
          </select>
        </label>
        {kind === "skill" ? (
          <label className="field">
            <span className="label">Skill</span>
            <select className="sel" value={skillId} onChange={(event) => setSkillId(event.target.value)} disabled={disabled || busy}>
              {SKILLS.map((skill) => <option value={skill.id} key={skill.id}>{skill.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="label">Ability</span>
            <select className="sel" value={ability} onChange={(event) => setAbility(event.target.value)} disabled={disabled || busy}>
              {ABILITIES.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span className="label">DC <small>(optional)</small></span>
          <input className="inp" type="number" min="1" max="40" value={dc} onChange={(event) => setDc(event.target.value)} placeholder="—" disabled={disabled || busy} />
        </label>
        <label className="field">
          <span className="label">Roll mode</span>
          <select className="sel" value={mode} onChange={(event) => setMode(event.target.value)} disabled={disabled || busy}>
            {MODES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Visibility</span>
          <select className="sel" value={visibility} onChange={(event) => setVisibility(event.target.value)} disabled={disabled || busy}>
            <option value="public">Public</option>
            <option value="private">Private GM roll</option>
          </select>
        </label>
      </div>
      <button className="btn btn-key btn-sm btn-wide" type="submit" disabled={disabled || busy}>{busy ? "Rolling…" : "Roll"}</button>
      {result?.message && <p className="nf-state-inline-error" role="alert">{result.message}</p>}
      {result?.kind && (
        <div className="nf-state-check-result" role="status">
          <strong>{resultText(result)}</strong>
          <span>{result.rolls?.length ? `d20 ${result.rolls.join(" / ")} · ${signed(result.modifier)}` : "Automatic result"}{result.dc !== null && result.dc !== undefined ? ` · DC ${result.dc}` : ""}</span>
          {result.modifierSources?.length ? <small className="nf-state-check-sources">Sources: {result.modifierSources.map((source) => `${modifierSourceLabel(source)} ${signed(source.value)}`).join(" · ")}</small> : null}
        </div>
      )}
    </form>
  );
}
