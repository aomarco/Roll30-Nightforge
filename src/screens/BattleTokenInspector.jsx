import { useState } from "react";
import { HeartPulse, Shield, ShieldHalf, Sword } from "lucide-react";

import { getItem } from "../domain/catalog.js";
import { CHECK_MODE_ADVANTAGE, CHECK_MODE_DISADVANTAGE, CHECK_MODE_NORMAL, MAX_CHECK_DC, MIN_CHECK_DC } from "../domain/checks.js";
import { CONDITIONS } from "../domain/conditions.js";
import { equippedWeapons } from "../domain/items.js";
import { MAX_VITALITY_ADJUSTMENT } from "../domain/vitality.js";
import { tokenSaveProfile, tokenSkillProfile } from "../domain/table.js";

const SAVE_LABEL = Object.freeze({
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
});
const SAVE_NAME = Object.freeze({
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
});

const ROLL_MODES = Object.freeze([
  { id: CHECK_MODE_NORMAL, label: "Normal" },
  { id: CHECK_MODE_ADVANTAGE, label: "Adv" },
  { id: CHECK_MODE_DISADVANTAGE, label: "Dis" },
]);

const signed = (value) => (value >= 0 ? `+${value}` : String(value).replace("-", "−"));

const healthTone = (hp, maxHp) => {
  const percentage = hp / Math.max(1, maxHp);
  if (percentage > 0.55) return "var(--hp-full)";
  if (percentage > 0.25) return "var(--hp-mid)";
  return "var(--hp-low)";
};

const clampAmount = (value) =>
  Math.max(0, Math.min(MAX_VITALITY_ADJUSTMENT, Math.floor(Number(value) || 0)));

/**
 * Only what matters mid-fight: how hurt this token is, how hard it is to hit,
 * what it is holding and wearing, what it saves on, and what it can roll.
 *
 * Saves and checks are available for any token, not only the one whose turn it
 * is, because a saving throw is almost always demanded on somebody else's turn.
 */
export default function BattleTokenInspector({
  token,
  busy = false,
  locked = false,
  changeCondition,
  heal,
  damage,
  setTempHp,
  rollSave,
  rollCheck,
}) {
  const [amount, setAmount] = useState(5);
  const [tempDraft, setTempDraft] = useState(0);
  const [dc, setDc] = useState(15);
  const [mode, setMode] = useState(CHECK_MODE_NORMAL);
  const weapons = equippedWeapons(token);
  const armour = getItem(token.armorId);
  const shield = getItem(token.shieldId);
  const saves = tokenSaveProfile(token);
  const skills = tokenSkillProfile(token);
  const healthPercent = Math.max(0, Math.min(100, (token.hp / Math.max(1, token.maxHp)) * 100));
  const rollOptions = { dc, mode };
  const disabled = busy || locked;

  return (
    <div className="nf-state-battle-card">
      <section className="nf-state-battle-vitals">
        <div className="nf-state-battle-hp">
          <div className="nf-state-battle-hp-top">
            <span>Hit points</span>
            <strong className="numeral">{token.hp}<em>/{token.maxHp}</em></strong>
          </div>
          <div className="meter nf-state-battle-hp-meter">
            <i style={{ width: `${healthPercent}%`, background: healthTone(token.hp, token.maxHp), boxShadow: `0 0 14px ${healthTone(token.hp, token.maxHp)}` }} />
          </div>
          {token.tempHp > 0 && (
            <span className="nf-state-battle-temp" title="Temporary hit points absorb damage before real hit points and are not restored by healing.">
              <Shield size={12} /> {token.tempHp} temporary
            </span>
          )}
          {token.hp <= 0 && <span className="nf-state-battle-down">Down</span>}
        </div>
        <div className="nf-state-battle-ac">
          <ShieldHalf size={18} />
          <strong className="numeral">{token.ac}</strong>
          <span>Armour class</span>
        </div>
      </section>

      <section className="nf-state-battle-vitality">
        <div className="unit-top">
          <span className="unit-label">Hit point adjustment</span>
          <span className="tag">Applied by hand</span>
        </div>
        <div className="nf-state-battle-vitality-row">
          <label className="field nf-state-battle-vitality-amount">
            <span className="label">Amount</span>
            <input
              className="inp"
              type="number"
              min="0"
              max={MAX_VITALITY_ADJUSTMENT}
              value={amount}
              onChange={(event) => setAmount(clampAmount(event.target.value))}
              disabled={disabled}
            />
          </label>
          <button
            type="button"
            className="btn nf-state-battle-heal"
            onClick={() => heal(token.id, amount)}
            disabled={disabled || amount <= 0}
            title={`Restore ${amount} hit points to ${token.name}, capped at their maximum.`}
          >
            <HeartPulse size={15} /> Heal
          </button>
          <button
            type="button"
            className="btn nf-state-battle-damage"
            onClick={() => damage(token.id, amount)}
            disabled={disabled || amount <= 0}
            title={`Take ${amount} damage on ${token.name}. Temporary hit points absorb it first.`}
          >
            <Sword size={15} /> Damage
          </button>
        </div>
        <div className="nf-state-battle-vitality-row">
          <label className="field nf-state-battle-vitality-amount">
            <span className="label">Temporary HP</span>
            <input
              className="inp"
              type="number"
              min="0"
              max={MAX_VITALITY_ADJUSTMENT}
              value={tempDraft}
              onChange={(event) => setTempDraft(clampAmount(event.target.value))}
              disabled={disabled}
            />
          </label>
          <button
            type="button"
            className="btn nf-state-battle-temp-set"
            onClick={() => setTempHp(token.id, tempDraft)}
            disabled={disabled}
            title="Temporary hit points do not stack. A new pool replaces the old one only when it is larger; zero clears it."
          >
            <Shield size={15} /> Set
          </button>
        </div>
      </section>

      <section className="nf-state-battle-kit">
        <div className="nf-state-battle-kit-row">
          <span className="nf-state-battle-kit-ico"><Sword size={15} /></span>
          <span className="nf-state-battle-kit-body">
            <small>Weapon</small>
            <strong>
              {weapons.length
                ? weapons.map(({ hand, item }) => `${item.name} (${hand === "main" ? "main" : "off"})`).join(" · ")
                : "Unarmed"}
            </strong>
          </span>
        </div>
        <div className="nf-state-battle-kit-row">
          <span className="nf-state-battle-kit-ico"><ShieldHalf size={15} /></span>
          <span className="nf-state-battle-kit-body">
            <small>Armour</small>
            <strong>
              {[armour?.name, shield?.name].filter(Boolean).join(" · ") || "Unarmoured"}
            </strong>
          </span>
        </div>
      </section>

      <section className="nf-state-battle-rolls">
        <div className="unit-top">
          <span className="unit-label">Roll against</span>
          <span className="tag">No Action spent</span>
        </div>
        <div className="nf-state-battle-roll-controls">
          <label className="field nf-state-battle-dc">
            <span className="label">Difficulty class</span>
            <input
              className="inp"
              type="number"
              min={MIN_CHECK_DC}
              max={MAX_CHECK_DC}
              value={dc}
              onChange={(event) => setDc(Math.max(MIN_CHECK_DC, Math.min(MAX_CHECK_DC, Math.floor(Number(event.target.value) || MIN_CHECK_DC))))}
              disabled={disabled}
            />
          </label>
          <div className="nf-state-battle-roll-modes" role="group" aria-label="Roll mode">
            {ROLL_MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`toggle-chip nf-state-battle-roll-mode${mode === option.id ? " on" : ""}`}
                onClick={() => setMode(option.id)}
                disabled={disabled}
                aria-pressed={mode === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="nf-state-battle-saves">
        <div className="unit-top">
          <span className="unit-label">Saving throws</span>
          <span className="tag">Proficient marked</span>
        </div>
        <div className="nf-state-battle-save-grid">
          {saves.map((save) => (
            <button
              type="button"
              className={`nf-state-battle-save${save.proficient ? " nf-state-battle-save-proficient" : ""}`}
              key={save.ability}
              onClick={() => rollSave(token.id, save.ability, rollOptions)}
              disabled={disabled}
              title={`Roll ${SAVE_NAME[save.ability]} save ${signed(save.modifier)} against DC ${dc}${save.proficient ? " — proficient" : ""}`}
            >
              <small>{SAVE_LABEL[save.ability]}</small>
              <strong className="numeral">{signed(save.modifier)}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="nf-state-battle-skills">
        <div className="unit-top">
          <span className="unit-label">Skills</span>
          <span className="tag tag-jade">{token.skillProficiencies.length || "None"} trained</span>
        </div>
        <div className="nf-state-battle-skill-grid">
          {skills.map((skill) => (
            <button
              type="button"
              className={`nf-state-battle-skill${skill.proficient ? " nf-state-battle-skill-proficient" : ""}`}
              key={skill.id}
              onClick={() => rollCheck(token.id, { skillId: skill.id }, rollOptions)}
              disabled={disabled}
              title={`Roll ${skill.name} ${signed(skill.modifier)} against DC ${dc}${skill.proficient ? " — proficient" : ""}`}
            >
              <small>{skill.name}</small>
              <strong className="numeral">{signed(skill.modifier)}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="nf-state-battle-conditions">
        <div className="unit-top">
          <span className="unit-label">Conditions</span>
          <span className="tag tag-jade">{token.conditions.length || "None"}</span>
        </div>
        <div className="afflict">
          {CONDITIONS.map((condition) => {
            const on = token.conditions.includes(condition.id);
            return (
              <button
                key={condition.id}
                type="button"
                className={`toggle-chip nf-state-condition-chip${on ? " on" : ""}`}
                style={on ? { "--nf-condition": condition.color } : undefined}
                onClick={() => changeCondition(condition.id)}
                disabled={busy || locked}
                title={condition.note}
                aria-pressed={on}
              >
                {condition.name}
              </button>
            );
          })}
        </div>
        <p className="note">Conditions are applied manually. Their movement, action, roll-mode, saving-throw, and automatic-critical effects are enforced immediately.</p>
      </section>
    </div>
  );
}
