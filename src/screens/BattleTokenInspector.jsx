import { ShieldHalf, Sword } from "lucide-react";

import { getItem } from "../domain/catalog.js";
import { CONDITIONS } from "../domain/conditions.js";
import { equippedWeapons } from "../domain/items.js";
import { tokenSaveProfile } from "../domain/table.js";

const SAVE_LABEL = Object.freeze({
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
});
const SAVE_NAME = Object.freeze({
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
});

const signed = (value) => (value >= 0 ? `+${value}` : String(value).replace("-", "−"));

const healthTone = (hp, maxHp) => {
  const percentage = hp / Math.max(1, maxHp);
  if (percentage > 0.55) return "var(--hp-full)";
  if (percentage > 0.25) return "var(--hp-mid)";
  return "var(--hp-low)";
};

/**
 * Only what matters mid-fight: how hurt this token is, how hard it is to hit,
 * what it is holding and wearing, and what it saves on.
 */
export default function BattleTokenInspector({ token, busy = false, locked = false, changeCondition }) {
  const weapons = equippedWeapons(token);
  const armour = getItem(token.armorId);
  const shield = getItem(token.shieldId);
  const saves = tokenSaveProfile(token);
  const healthPercent = Math.max(0, Math.min(100, (token.hp / Math.max(1, token.maxHp)) * 100));

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
          {token.hp <= 0 && <span className="nf-state-battle-down">Down</span>}
        </div>
        <div className="nf-state-battle-ac">
          <ShieldHalf size={18} />
          <strong className="numeral">{token.ac}</strong>
          <span>Armour class</span>
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

      <section className="nf-state-battle-saves">
        <div className="unit-top">
          <span className="unit-label">Saving throws</span>
          <span className="tag">Proficient marked</span>
        </div>
        <div className="nf-state-battle-save-grid">
          {saves.map((save) => (
            <span
              className={`nf-state-battle-save${save.proficient ? " nf-state-battle-save-proficient" : ""}`}
              key={save.ability}
              title={`${SAVE_NAME[save.ability]} save ${signed(save.modifier)}${save.proficient ? " — proficient" : ""}`}
            >
              <small>{SAVE_LABEL[save.ability]}</small>
              <strong className="numeral">{signed(save.modifier)}</strong>
            </span>
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
        <p className="note">Conditions are applied manually. Their movement, action, roll-mode, and automatic-critical effects are enforced immediately.</p>
      </section>
    </div>
  );
}
