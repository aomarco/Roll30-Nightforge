import { useState } from "react";
import { Heart, HeartPulse, Shield, ShieldHalf, Skull, Sword } from "lucide-react";

import { getItem } from "../domain/catalog.js";
import { CHECK_MODE_ADVANTAGE, CHECK_MODE_DISADVANTAGE, CHECK_MODE_NORMAL, MAX_CHECK_DC, MIN_CHECK_DC } from "../domain/checks.js";
import { CONDITIONS } from "../domain/conditions.js";
import { DAMAGE_TYPES, damageTypeName } from "../domain/damageTypes.js";
import { equippedWeapons } from "../domain/items.js";
import { MAX_VITALITY_ADJUSTMENT } from "../domain/vitality.js";
import CoinEditor from "./CoinEditor.jsx";
import {
  DEATH_SAVES_REQUIRED,
  FACTION_LABELS,
  isDying,
  isStable,
  tokenSaveProfile,
  tokenSkillProfile,
} from "../domain/table.js";

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

/** One slot per required save, so the pips are drawn from the rule not a literal. */
const PIP_SLOTS = Object.freeze(Array.from({ length: DEATH_SAVES_REQUIRED }, (unused, index) => index));

const DOWN_LABEL = Object.freeze({ dying: "Dying", stable: "Stable", dead: "Dead" });

const downState = (token) => (token.dead ? "dead" : isStable(token) ? "stable" : "dying");

/**
 * The defences worth a badge, in the order they matter: what does nothing at
 * all, what does half, and what does double.
 */
const DEFENSE_BADGES = Object.freeze([
  { key: "damageImmunities", label: "Immune", tone: "immune" },
  { key: "damageResistances", label: "Resists", tone: "resistant" },
  { key: "damageVulnerabilities", label: "Vulnerable", tone: "vulnerable" },
]);

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
  activeToken = null,
  forceMove,
  changeCoins,
  round = 1,
}) {
  const [amount, setAmount] = useState(5);
  const [damageType, setDamageType] = useState("");
  const [tempDraft, setTempDraft] = useState(0);
  const [dc, setDc] = useState(15);
  const [mode, setMode] = useState(CHECK_MODE_NORMAL);
  const [conditionDuration, setConditionDuration] = useState("");
  const [forcedDistance, setForcedDistance] = useState(5);
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
          {/* "Down" was the whole story when zero hit points was the end of it.
              Now the difference between dying, stable and dead is the difference
              between a creature an ally can still save and one they cannot, so
              the badge has to say which. */}
          {token.hp <= 0 && (
            <span className={`nf-state-battle-down nf-state-battle-down-${downState(token)}`}>
              {DOWN_LABEL[downState(token)]}
            </span>
          )}
          {isDying(token) && (
            <div className="nf-state-battle-death" role="group" aria-label={`Death saving throws: ${token.deathSaveSuccesses} of ${DEATH_SAVES_REQUIRED} successes, ${token.deathSaveFailures} of ${DEATH_SAVES_REQUIRED} failures`}>
              <span className="nf-state-battle-death-row" title={`${token.deathSaveSuccesses} of ${DEATH_SAVES_REQUIRED} successes. Three stabilises.`}>
                <Heart size={11} />
                {PIP_SLOTS.map((slot) => (
                  <i className={`nf-state-battle-death-pip${token.deathSaveSuccesses > slot ? " on" : ""}`} key={`success-${slot}`} />
                ))}
              </span>
              <span className="nf-state-battle-death-row" title={`${token.deathSaveFailures} of ${DEATH_SAVES_REQUIRED} failures. Three is death.`}>
                <Skull size={11} />
                {PIP_SLOTS.map((slot) => (
                  <i className={`nf-state-battle-death-pip nf-state-battle-death-fail${token.deathSaveFailures > slot ? " on" : ""}`} key={`failure-${slot}`} />
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="nf-state-battle-ac">
          <ShieldHalf size={18} />
          <strong className="numeral">{token.ac}</strong>
          <span>Armour class</span>
          {/* Read-only here: sides are set in Setup, but the fight ends when one
              side is left standing, so it has to be legible mid-battle too. */}
          <span
            className={`tag tag-${token.faction}`}
            title="Which side this creature fights on. Change it from the Setup inspector."
          >
            {FACTION_LABELS[token.faction]}
          </span>
        </div>
      </section>

      {/* Read-only, like the Side tag: these are set in Setup, but they change
          what every incoming hit does, so they have to be legible mid-fight. */}
      {(DEFENSE_BADGES.some(({ key }) => token[key].length) || token.dodging || token.disengaging || token.helpedAgainstTokenId) && (
        <section className="nf-state-battle-defenses" aria-label="Damage defences and turn states">
          {DEFENSE_BADGES.map(({ key, label, tone }) => (token[key].length ? (
            <span
              className={`tag nf-state-battle-defense-${tone}`}
              key={key}
              title={`${label} ${token[key].map(damageTypeName).join(", ")} damage. Change this from the Setup inspector.`}
            >
              {label} {token[key].map(damageTypeName).join(", ")}
            </span>
          ) : null))}
          {token.dodging && <span className="tag tag-jade" title="Every attack against this creature has disadvantage until the start of its next turn.">Dodging</span>}
          {token.disengaging && <span className="tag tag-jade" title="This creature can move without drawing an opportunity attack until the start of its next turn.">Disengaged</span>}
          {token.helpedAgainstTokenId && <span className="tag tag-brass" title="An ally has Helped this creature. Its next attack against the named enemy has advantage.">Helped</span>}
          {token.reactionSpent && <span className="tag" title="This creature has used its reaction. It refreshes at the start of its own turn.">Reaction used</span>}
        </section>
      )}

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
          {/* Untyped is the first option and the default, because most of the
              time the table just wants to take six off and get on with it. A
              type is only worth naming when the target has a defence to test. */}
          <label className="field nf-state-battle-vitality-type">
            <span className="label">Damage type</span>
            <select
              className="sel"
              value={damageType}
              onChange={(event) => setDamageType(event.target.value)}
              disabled={disabled}
            >
              <option value="">Untyped</option>
              {DAMAGE_TYPES.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="btn nf-state-battle-damage"
            onClick={() => damage(token.id, amount, damageType || null)}
            disabled={disabled || amount <= 0}
            title={`Take ${amount} ${damageType ? `${damageTypeName(damageType).toLowerCase()} ` : ""}damage on ${token.name}. Resistance and temporary hit points are applied first.`}
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

      <CoinEditor coins={token.coins} onChange={(coins) => changeCoins(token.id, coins)} busy={disabled} compact title="Coin purse" />

      <section className="nf-state-forced-movement">
        <div className="unit-top">
          <span className="unit-label">Forced movement</span>
          <span className="tag">No movement or reaction spent</span>
        </div>
        <label className="field">
          <span className="label">Distance</span>
          <select className="sel" value={forcedDistance} onChange={(event) => setForcedDistance(Number(event.target.value))} disabled={disabled}>
            {[5, 10, 15, 20, 30, 60].map((feet) => <option value={feet} key={feet}>{feet} ft</option>)}
          </select>
        </label>
        {activeToken && activeToken.id !== token.id && (
          <div className="nf-state-forced-actions">
            <button type="button" className="btn btn-line" disabled={disabled} onClick={() => forceMove(token.id, { mode: "push", sourceTokenId: activeToken.id, distanceFeet: forcedDistance })}>Push from {activeToken.name}</button>
            <button type="button" className="btn btn-line" disabled={disabled} onClick={() => forceMove(token.id, { mode: "pull", sourceTokenId: activeToken.id, distanceFeet: forcedDistance })}>Pull toward {activeToken.name}</button>
          </div>
        )}
        <div className="nf-state-forced-directions" role="group" aria-label={`Slide ${token.name}`}>
          {[
            ["↖", -1, -1, "north-west"], ["↑", 0, -1, "north"], ["↗", 1, -1, "north-east"],
            ["←", -1, 0, "west"], ["·", 0, 0, "centre"], ["→", 1, 0, "east"],
            ["↙", -1, 1, "south-west"], ["↓", 0, 1, "south"], ["↘", 1, 1, "south-east"],
          ].map(([label, column, row, name]) => column || row ? (
            <button type="button" className="glyph" key={name} disabled={disabled} aria-label={`Slide ${name}`} title={`Slide ${forcedDistance} feet ${name}`} onClick={() => forceMove(token.id, { mode: "slide", direction: { column, row }, distanceFeet: forcedDistance })}>{label}</button>
          ) : <span key={name} aria-hidden="true">·</span>)}
        </div>
        <p className="note">Push and pull use the active token as the source. Slide gives the GM an exact direction for spells, hazards, and authored abilities. Obstacles stop the move early.</p>
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
        <label className="field">
          <span className="label">New condition duration</span>
          <select className="sel" value={conditionDuration} onChange={(event) => setConditionDuration(event.target.value)} disabled={disabled}>
            <option value="">Permanent</option>
            <option value="1">1 round</option>
            <option value="2">2 rounds</option>
            <option value="3">3 rounds</option>
            <option value="5">5 rounds</option>
            <option value="10">10 rounds</option>
          </select>
        </label>
        <div className="afflict">
          {CONDITIONS.map((condition) => {
            const on = token.conditions.includes(condition.id);
            const immune = token.conditionImmunities.includes(condition.id);
            const expiry = token.conditionExpiries?.[condition.id];
            return (
              <button
                key={condition.id}
                type="button"
                className={`toggle-chip nf-state-condition-chip${on ? " on" : ""}`}
                style={on ? { "--nf-condition": condition.color } : undefined}
                onClick={() => changeCondition(condition.id, { durationRounds: conditionDuration || null })}
                disabled={busy || locked || (immune && !on)}
                title={immune && !on ? `${token.name} is immune to ${condition.name}.` : `${condition.note}${expiry ? ` Expires when round ${expiry} begins.` : ""}`}
                aria-pressed={on}
              >
                {condition.name}{immune && !on ? " · immune" : expiry ? ` · R${Math.max(0, expiry - round)}` : ""}
              </button>
            );
          })}
        </div>
        <p className="note">Conditions are applied manually. Their movement, action, roll-mode, saving-throw, and automatic-critical effects are enforced immediately.</p>
      </section>
    </div>
  );
}
