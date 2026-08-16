import { useEffect, useMemo, useRef, useState } from "react";
import {
  Footprints,
  HeartPulse,
  Minus,
  Plus,
  ShieldHalf,
  Sword,
  Trash2,
  UserRoundPlus,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import {
  ABILITIES,
  ALIGNMENTS,
  BACKGROUNDS,
  canSetBaseAbility,
  CLASSES,
  deriveHero,
  formatModifier,
  grantedLanguages,
  LANGUAGES,
  RACES,
  raceById,
  SAVING_THROWS,
  saveModifier,
  SKILLS,
  skillModifier,
  subraceById,
} from "../domain/heroes.js";
import GearChapter from "./GearChapter.jsx";

const okay = () => ({ ok: true });
const CLASS_ICONS = { fighter: Sword, wizard: Wand2 };
const errorText = (error) =>
  error ? `${error.message} ${error.recovery || "Please retry."}` : "";

const toggleValue = (values, value) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export default function HeroesScreen({
  heroes = [],
  lifecycle = "ready",
  persistence = { status: "idle", error: null },
  go = okay,
  onCreate = okay,
  onUpdate = okay,
  onRetire = okay,
  flushRef = null,
  initialChapter = "identity",
  initialRetiringId = null,
}) {
  const [activeId, setActiveId] = useState(() => heroes[0]?.id || null);
  const [chapter, setChapter] = useState(initialChapter);
  const [retiring, setRetiring] = useState(
    () => heroes.find((hero) => hero.id === initialRetiringId) || null,
  );
  const [drafts, setDrafts] = useState(() => ({
    name: heroes[0]?.name || "",
    background: heroes[0]?.background || "",
  }));
  const [localError, setLocalError] = useState(null);
  const draftRef = useRef(drafts);
  const dirtyRef = useRef(new Set());
  const timerRef = useRef(null);
  const busy = persistence.status === "saving";
  const activeHero = heroes.find((hero) => hero.id === activeId) || heroes[0] || null;
  const derived = useMemo(() => activeHero ? deriveHero(activeHero) : null, [activeHero]);

  useEffect(() => {
    if (!activeHero) {
      setActiveId(null);
      setDrafts({ name: "", background: "" });
      draftRef.current = { name: "", background: "" };
      dirtyRef.current.clear();
      return;
    }
    if (activeHero.id !== activeId) setActiveId(activeHero.id);
    const next = { name: activeHero.name, background: activeHero.background || "" };
    setDrafts(next);
    draftRef.current = next;
    dirtyRef.current.clear();
    setLocalError(null);
  }, [activeHero?.id]);

  useEffect(() => {
    if (!retiring) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setRetiring(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [retiring]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const flushDraft = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!activeHero || dirtyRef.current.size === 0) return okay();
    const fields = [...dirtyRef.current];
    const patch = Object.fromEntries(fields.map((field) => [field, draftRef.current[field]]));
    dirtyRef.current.clear();
    const result = onUpdate(activeHero.id, patch) || okay();
    if (!result.ok) {
      fields.forEach((field) => dirtyRef.current.add(field));
      setLocalError(result);
    } else {
      const next = {
        name: result.value.name,
        background: result.value.background || "",
      };
      setDrafts(next);
      draftRef.current = next;
      setLocalError(null);
    }
    return result;
  };

  if (flushRef) flushRef.current = flushDraft;

  const queueDraft = (field, value) => {
    const next = { ...draftRef.current, [field]: value };
    draftRef.current = next;
    setDrafts(next);
    dirtyRef.current.add(field);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushDraft, 450);
  };

  const apply = (patch) => {
    if (!activeHero || !flushDraft().ok) return null;
    const result = onUpdate(activeHero.id, patch) || okay();
    setLocalError(result.ok ? null : result);
    return result;
  };

  const selectHero = (heroId) => {
    if (!flushDraft().ok) return;
    setActiveId(heroId);
    setChapter("identity");
  };

  const createHero = () => {
    if (!flushDraft().ok) return;
    const result = onCreate({}) || okay();
    if (!result.ok) {
      setLocalError(result);
      return;
    }
    setActiveId(result.value.id);
    setChapter("identity");
    setLocalError(null);
  };

  const confirmRetire = () => {
    const retiredId = retiring.id;
    const result = onRetire(retiredId) || okay();
    if (!result.ok) {
      setLocalError(result);
      return;
    }
    const nextHero = heroes.find((hero) => hero.id !== retiredId) || null;
    setActiveId(nextHero?.id || null);
    setRetiring(null);
    setChapter("identity");
    setLocalError(null);
  };

  const changeClass = (classId) => {
    const selectedClass = CLASSES.find((entry) => entry.id === classId) || CLASSES[0];
    apply({
      classId: selectedClass.id,
      saveProficiencies: [...selectedClass.saveProficiencies],
      skillProficiencies: [],
    });
  };

  const changeRace = (raceId) => {
    const nextRace = raceById(raceId);
    const nextSubrace = nextRace.subraces[0] || null;
    const oldGranted = grantedLanguages(activeHero.raceId, activeHero.subraceId);
    const chosenLanguages = activeHero.languages.filter((language) => !oldGranted.includes(language));
    apply({
      raceId: nextRace.id,
      subraceId: nextSubrace?.id || null,
      languages: [...new Set([...grantedLanguages(nextRace.id, nextSubrace?.id), ...chosenLanguages])],
    });
  };

  const changeSubrace = (subraceId) => {
    const nextSubrace = subraceById(activeHero.raceId, subraceId);
    const oldGranted = grantedLanguages(activeHero.raceId, activeHero.subraceId);
    const chosenLanguages = activeHero.languages.filter((language) => !oldGranted.includes(language));
    apply({
      subraceId: nextSubrace?.id || null,
      languages: [...new Set([
        ...grantedLanguages(activeHero.raceId, nextSubrace?.id),
        ...chosenLanguages,
      ])],
    });
  };

  const changeAbility = (ability, delta) => {
    const score = activeHero.baseAbilities[ability] + delta;
    if (!canSetBaseAbility(activeHero.baseAbilities, ability, score)) return;
    apply({ baseAbilities: { ...activeHero.baseAbilities, [ability]: score } });
  };

  const visibleError = localError || persistence.error;
  const Icon = activeHero ? CLASS_ICONS[activeHero.classId] || Sword : Sword;
  const selectedClass = activeHero ? derived.class : CLASSES[0];
  const selectedSkills = activeHero?.skillProficiencies.length || 0;
  const overRecommended =
    selectedClass.id === "fighter" && selectedSkills > selectedClass.recommendedSkillCount;
  const saveMessage = visibleError
    ? `Not saved. ${errorText(visibleError)}`
    : busy
      ? "Saving hero…"
      : activeHero
        ? "Hero changes save automatically to this browser."
        : "Forge your first persisted Nightforge hero.";

  const vitals = activeHero ? [
    { label: "Hit Points", value: String(derived.hp), note: `${selectedClass.name} + Constitution`, icon: HeartPulse, tone: "hp" },
    { label: "Armour Class", value: String(derived.ac), note: activeHero.armorId ? "Equipped armour" : "Unarmoured + Dexterity", icon: ShieldHalf, tone: "ally" },
    { label: "Initiative", value: formatModifier(derived.initiative), note: "Dexterity modifier", icon: Zap, tone: "brass" },
    { label: "Speed", value: `${derived.speed} ft`, note: `${derived.race.name} walking speed`, icon: Footprints, tone: "jade" },
  ] : [];

  return (
    <div className={`scroller${busy ? " nf-state-busy" : ""}`}>
      <div className="measure measure-wide enter">
        <div className="masthead">
          <div>
            <span className="kicker kicker-jade">Party roster</span>
            <h1>Heroes</h1>
            <p className="prose">
              {heroes.length
                ? `${heroes.length} adventurer${heroes.length === 1 ? "" : "s"} under your banner. Pick one to open their sheet.`
                : "No adventurers are recorded yet. Forge one to begin the party codex."}
            </p>
          </div>
          <div className="masthead-acts">
            <span className="prose-sm" role="status">{saveMessage}</span>
            <button className="btn btn-key" onClick={createHero} disabled={busy}>
              <UserRoundPlus size={17} /> New hero
            </button>
          </div>
        </div>

        <div className="band-rail">
          {heroes.map((hero) => {
            const HeroIcon = CLASS_ICONS[hero.classId] || Sword;
            return (
              <button
                key={hero.id}
                className={"portrait" + (hero.id === activeHero?.id ? " on" : "")}
                onClick={() => selectHero(hero.id)}
              >
                <span className="portrait-face"><HeroIcon size={19} /></span>
                <span className="portrait-meta">
                  <strong>{hero.name}</strong>
                  <small>Lv {hero.level} · {CLASSES.find((entry) => entry.id === hero.classId)?.name || "Fighter"}</small>
                </span>
              </button>
            );
          })}
          <button className="portrait portrait-add" onClick={createHero} disabled={busy}>
            <span className="portrait-face"><Plus size={18} strokeWidth={2.4} /></span>
            <span className="portrait-meta"><strong>New hero</strong><small>Roll a character</small></span>
          </button>
        </div>

        {!activeHero ? (
          <section className="codex nf-state-heroes-empty">
            <div className="codex-glow" aria-hidden="true" />
            <div className="nf-state-heroes-empty-body">
              <span className="sigil sigil-xl" style={{ background: "linear-gradient(150deg,#3a6f7a,#16292f)" }}>
                <UserRoundPlus size={30} />
              </span>
              <div>
                <span className="kicker kicker-brass">The codex awaits</span>
                <h2>{lifecycle === "booting" ? "Opening the party record…" : "No heroes written yet"}</h2>
                <p className="prose-sm">Create a fresh Nightforge Hero to open Identity and Abilities.</p>
              </div>
              <button className="btn btn-key" onClick={createHero} disabled={busy || lifecycle === "booting"}>
                <UserRoundPlus size={17} /> New hero
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="codex">
              <div className="codex-glow" aria-hidden="true" />
              <div className="codex-head">
                <span className="sigil sigil-xl" style={{ background: "linear-gradient(150deg,#3a6f7a,#16292f)" }}>
                  <Icon size={30} />
                </span>
                <div className="codex-id">
                  <span className="kicker kicker-brass">Character sheet</span>
                  <h2>{drafts.name || "Unnamed hero"}</h2>
                  <p className="prose-sm">
                    Level {activeHero.level} {selectedClass.name} · {derived.race.name}
                    {derived.subrace ? ` (${derived.subrace.name})` : ""}
                  </p>
                </div>
                <button className="btn btn-hazard btn-sm" onClick={() => setRetiring(activeHero)} disabled={busy}>
                  <Trash2 size={15} /> Retire hero
                </button>
              </div>

              <div className="vitals">
                {vitals.map((vital) => (
                  <div className={`vital vital-${vital.tone}`} key={vital.label}>
                    <span className="vital-ico"><vital.icon size={17} /></span>
                    <span className="vital-num numeral">{vital.value}</span>
                    <span className="vital-label">{vital.label}</span>
                    <span className="vital-note">{vital.note}</span>
                  </div>
                ))}
              </div>
            </section>

            <nav className="chapters">
              <button className={"chapter" + (chapter === "identity" ? " on" : "")} onClick={() => setChapter("identity")}>Identity</button>
              <button className={"chapter" + (chapter === "abilities" ? " on" : "")} onClick={() => setChapter("abilities")}>Abilities</button>
              <button className={"chapter" + (chapter === "gear" ? " on" : "")} onClick={() => setChapter("gear")}>Gear</button>
            </nav>

            {chapter === "identity" && (
              <section className="sheet enter" key="identity">
                <header className="sheet-head">
                  <div><span className="kicker">Identity</span><h3>Name &amp; origin</h3></div>
                  <p className="note">Who they are before the dice hit the table.</p>
                </header>

                <div className="identity">
                  <label className="field span-all">
                    <span className="label">Character name</span>
                    <input className="inp inp-lg" value={drafts.name} onChange={(event) => queueDraft("name", event.target.value)} onBlur={flushDraft} />
                  </label>
                  <label className="field">
                    <span className="label">Class</span>
                    <select className="sel" value={activeHero.classId} onChange={(event) => changeClass(event.target.value)}>
                      {CLASSES.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Level</span>
                    <input className="inp" type="number" min="1" max="20" value={activeHero.level} onChange={(event) => apply({ level: Number(event.target.value) })} />
                  </label>
                  <label className="field">
                    <span className="label">Race</span>
                    <select className="sel" value={activeHero.raceId} onChange={(event) => changeRace(event.target.value)}>
                      {RACES.map((race) => <option value={race.id} key={race.id}>{race.name}</option>)}
                    </select>
                  </label>
                  {derived.race.subraces.length > 0 && (
                    <label className="field">
                      <span className="label">Subrace</span>
                      <select className="sel" value={activeHero.subraceId || ""} onChange={(event) => changeSubrace(event.target.value)}>
                        {derived.race.subraces.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span className="label">Size</span>
                    <input className="inp" value={derived.size} readOnly aria-readonly="true" />
                  </label>
                  <label className="field">
                    <span className="label">Alignment</span>
                    <select className="sel" value={activeHero.alignment} onChange={(event) => apply({ alignment: event.target.value })}>
                      {ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}
                    </select>
                  </label>
                  <label className="field span-all">
                    <span className="label">Background</span>
                    <input className="inp" value={drafts.background} list="nightforge-backgrounds" onChange={(event) => queueDraft("background", event.target.value)} onBlur={flushDraft} placeholder="Acolyte, Soldier, Sage…" />
                    <datalist id="nightforge-backgrounds">{BACKGROUNDS.map((background) => <option value={background} key={background} />)}</datalist>
                  </label>
                  <div className="field span-all">
                    <span className="label">Languages</span>
                    <div className="afflict">
                      {LANGUAGES.map((language) => {
                        const isGranted = grantedLanguages(activeHero.raceId, activeHero.subraceId).includes(language);
                        const selected = activeHero.languages.includes(language);
                        return (
                          <button
                            type="button"
                            key={language}
                            className={`toggle-chip${selected ? " on" : ""}`}
                            disabled={isGranted}
                            title={isGranted ? `Granted by ${derived.race.name}` : undefined}
                            onClick={() => apply({ languages: toggleValue(activeHero.languages, language) })}
                          >
                            {language}{isGranted ? " · granted" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {chapter === "abilities" && (
              <section className="sheet enter" key="abilities">
                <header className="sheet-head">
                  <div>
                    <span className="kicker">Ability scores</span>
                    <h3>27-point buy</h3>
                    <p className="note" style={{ marginTop: 6 }}>Racial bonuses apply on top of purchased scores.</p>
                  </div>
                  <div className="budget"><strong className="numeral">{derived.pointBuyRemaining}</strong><span>points left</span></div>
                </header>

                <div className="dials">
                  {ABILITIES.map((ability) => {
                    const base = activeHero.baseAbilities[ability.id];
                    const final = derived.finalAbilities[ability.id];
                    return (
                      <article className="dial" key={ability.id}>
                        <div className="dial-top"><span className="dial-key">{ability.short}</span><em className="dial-mod numeral">{formatModifier(derived.abilityModifiers[ability.id])}</em></div>
                        <span className="dial-score numeral">{final}</span>
                        <span className="dial-name">{ability.name}</span>
                        <div className="dial-step">
                          <button onClick={() => changeAbility(ability.id, -1)} disabled={base <= 8} aria-label={`Lower ${ability.short}`}><Minus size={13} /></button>
                          <small>Base {base}</small>
                          <button onClick={() => changeAbility(ability.id, 1)} disabled={!canSetBaseAbility(activeHero.baseAbilities, ability.id, base + 1)} aria-label={`Raise ${ability.short}`}><Plus size={13} /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="nf-state-hero-sections">
                  <section className="nf-state-hero-panel">
                    <div className="unit-top"><span className="unit-label">Saving throws</span><span className="tag">Proficiency +{derived.proficiency}</span></div>
                    <div className="nf-state-hero-checks">
                      {SAVING_THROWS.map((save) => {
                        const proficient = activeHero.saveProficiencies.includes(save.id);
                        return (
                          <button type="button" key={save.id} className={`toggle-chip${proficient ? " on" : ""}`} onClick={() => apply({ saveProficiencies: toggleValue(activeHero.saveProficiencies, save.id) })}>
                            {save.short} <strong className="numeral">{formatModifier(saveModifier(activeHero, derived, save.id))}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="nf-state-hero-panel">
                    <div className="unit-top">
                      <span className="unit-label">Skills</span>
                      <span className={`tag${overRecommended ? " tag-foe" : " tag-jade"}`}>{selectedSkills} / {selectedClass.recommendedSkillCount} chosen</span>
                    </div>
                    <p className="note">
                      {selectedClass.name} guidance: choose {selectedClass.recommendedSkillCount} from {selectedClass.skillOptions.map((id) => SKILLS.find((skill) => skill.id === id)?.name).join(", ")}.
                      {overRecommended ? " You may keep extra proficiencies, but this exceeds Fighter guidance." : ""}
                    </p>
                    <div className="nf-state-hero-skills">
                      {SKILLS.map((skill) => {
                        const proficient = activeHero.skillProficiencies.includes(skill.id);
                        return (
                          <button type="button" key={skill.id} className={`toggle-chip${proficient ? " on" : ""}`} onClick={() => apply({ skillProficiencies: toggleValue(activeHero.skillProficiencies, skill.id) })}>
                            <span>{skill.name} <small>{skill.ability.toUpperCase()}</small></span>
                            <strong className="numeral">{formatModifier(skillModifier(activeHero, derived, skill))}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {derived.spellcasting && (
                    <section className="nf-state-hero-panel nf-state-hero-spellcasting">
                      <div className="unit-top"><span className="unit-label">Wizard spellcasting</span><span className="tag tag-brass">Scaffold only</span></div>
                      <div className="quad">
                        <div className="quad-cell"><span>Spell save DC</span><strong className="numeral">{derived.spellcasting.saveDc}</strong></div>
                        <div className="quad-cell"><span>Spell attack</span><strong className="numeral">{formatModifier(derived.spellcasting.attackBonus)}</strong></div>
                        <div className="quad-cell"><span>Slots</span><strong className="numeral">∞</strong></div>
                        <div className="quad-cell"><span>Spells</span><strong className="numeral">∞</strong></div>
                      </div>
                      <p className="note">No spell list, slot economy, or in-battle casting is enabled.</p>
                    </section>
                  )}
                </div>
              </section>
            )}
            {chapter === "gear" && (
              <GearChapter key={activeHero.id} hero={activeHero} apply={apply} busy={busy} />
            )}
          </>
        )}
      </div>

      {retiring && (
        <>
          <div className="veil" onClick={() => setRetiring(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="retire-hero-title">
            <div className="drawer-top">
              <div><span className="kicker">Retire hero</span><h2 id="retire-hero-title">Close this legend?</h2></div>
              <button className="glyph" onClick={() => setRetiring(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="drawer-body">
              {visibleError && <div className="nf-state-inline-error" role="alert"><strong>Hero not retired</strong><span>{errorText(visibleError)}</span></div>}
              <p className="prose">Retire <strong>{retiring.name}</strong> from this Nightforge party?</p>
              <p className="note">Existing Scene tokens are independent snapshots and remain untouched.</p>
            </div>
            <div className="drawer-foot">
              <button className="btn btn-line" onClick={() => setRetiring(null)} autoFocus>Keep hero</button>
              <button className="btn btn-hazard" onClick={confirmRetire} disabled={busy}><Trash2 size={15} /> {busy ? "Retiring…" : "Retire hero"}</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
