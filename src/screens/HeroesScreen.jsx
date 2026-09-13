import { flushDirtyDraft } from "../ui/flushDraft.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Footprints,
  HeartPulse,
  ImagePlus,
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
  applyBackgroundBenefits,
  BACKGROUND_DETAILS,
  canSetBaseAbility,
  CLASSES,
  deriveHero,
  formatModifier,
  grantedLanguages,
  LANGUAGES,
  levelForXp,
  RACES,
  raceById,
  SAVING_THROWS,
  saveModifier,
  SKILLS,
  skillModifier,
  subraceById,
  xpToNextLevel,
} from "../domain/heroes.js";
import { DRAGON_ANCESTRIES } from "../domain/racialTraits.js";
import { hitDiceAvailable, hitDiceTotal, previewRest } from "../domain/rest.js";
import { useDialogA11y } from "../ui/useDialogA11y.js";
import GearChapter from "./GearChapter.jsx";
import CoinEditor from "./CoinEditor.jsx";
import CheckPanel from "./CheckPanel.jsx";
import RollLogPanel from "./RollLogPanel.jsx";

const okay = () => ({ ok: true });
const CLASS_ICONS = { fighter: Sword, wizard: Wand2 };
const errorText = (error) =>
  error ? `${error.message} ${error.recovery || "Please retry."}` : "";

const toggleValue = (values, value) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

function useHeroPortraits(heroes, portraitRepository) {
  const [portraits, setPortraits] = useState({});
  const [portraitError, setPortraitError] = useState(null);
  const signature = heroes.map((hero) => `${hero.id}:${hero.portraitKey || ""}`).join("|");

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    setPortraitError(null);
    if (!portraitRepository) {
      setPortraits({});
      return undefined;
    }

    const load = async () => {
      const next = {};
      for (const hero of heroes) {
        if (!hero.portraitKey) continue;
        const result = await portraitRepository.get(hero.portraitKey);
        if (!active) return;
        if (!result.ok) {
          setPortraitError(result);
          continue;
        }
        if (result.value instanceof Blob && globalThis.URL?.createObjectURL) {
          const url = URL.createObjectURL(result.value);
          objectUrls.push(url);
          next[hero.id] = url;
        }
      }
      if (active) setPortraits(next);
    };
    load();

    return () => {
      active = false;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [portraitRepository, signature]);

  return { portraits, portraitError };
}

export default function HeroesScreen({
  heroes = [],
  lifecycle = "ready",
  persistence = { status: "idle", error: null },
  go = okay,
  onCreate = okay,
  onUpdate = okay,
  onRollCheck = async () => ({ ok: false, message: "Roster checks are unavailable." }),
  rollLog = [],
  onRetire = okay,
  onRest = okay,
  portraitRepository = null,
  onReplacePortrait = async () => okay(),
  onRemovePortrait = async () => okay(),
  flushRef = null,
  initialRetiringId = null,
}) {
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [activeId, setActiveId] = useState(() => heroes[0]?.id || null);
  const [retiring, setRetiring] = useState(
    () => heroes.find((hero) => hero.id === initialRetiringId) || null,
  );
  const [drafts, setDrafts] = useState(() => ({
    name: heroes[0]?.name || "",
    background: heroes[0]?.background || "",
  }));
  const [localError, setLocalError] = useState(null);
  const [restDice, setRestDice] = useState(0);
  const [restMessage, setRestMessage] = useState("");
  const [restPreview, setRestPreview] = useState(null);
  const [restEventId, setRestEventId] = useState(null);
  const [dawnDay, setDawnDay] = useState(1);
  const draftRef = useRef(drafts);
  const dirtyRef = useRef(new Set());
  const timerRef = useRef(null);
  const pendingFlushRef = useRef(null);
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
    setRestDice(0);
    setRestMessage("");
    setRestPreview(null);
    setRestEventId(null);
  }, [activeHero?.id]);

  useEffect(() => {
    if (!activeHero) return;
    const next = { ...draftRef.current };
    if (!dirtyRef.current.has("name")) next.name = activeHero.name;
    if (!dirtyRef.current.has("background")) next.background = activeHero.background || "";
    draftRef.current = next;
    setDrafts(next);
  }, [activeHero?.id, activeHero?.name, activeHero?.background]);

  const retireDialogRef = useDialogA11y({ open: Boolean(retiring), onClose: () => setRetiring(null) });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const flushDraft = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!activeHero?.id) return Promise.resolve(okay());
    return flushDirtyDraft({
      pendingRef: pendingFlushRef, dirtyRef, draftRef,
      save: (patch) => onUpdate(activeHero.id, patch),
      onSaved: (next) => { setDrafts(next); setLocalError(null); },
      onError: setLocalError,
    });
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

  const apply = async (patch) => {
    if (!activeHero || !(await flushDraft()).ok) return null;
    const result = (await onUpdate(activeHero.id, patch)) || okay();
    setLocalError(result.ok ? null : result);
    return result;
  };

  const selectHero = async (heroId) => {
    if (!(await flushDraft()).ok) return;
    setActiveId(heroId);
  };

  const createHero = async () => {
    if (!(await flushDraft()).ok) return;
    const result = (await onCreate({})) || okay();
    if (!result.ok) {
      setLocalError(result);
      return;
    }
    setActiveId(result.value.id);
    setLocalError(null);
  };

  const takeRest = async (kind) => {
    if (!activeHero || !(await flushDraft()).ok) return null;
    // Daily dawn is already idempotent by day, so it applies at once.
    if (kind === "daily") {
      const result = (await onRest(activeHero.id, kind, { day: dawnDay })) || okay();
      if (!result.ok) {
        setLocalError(result);
        return result;
      }
      setLocalError(null);
      const outcome = result.outcome;
      setRestMessage(result.replayed ? `Dawn ${dawnDay} was already applied. No charges changed.`
        : `Dawn ${dawnDay}: daily charges recovered${outcome?.rolls?.length ? ` (${outcome.rolls.map((roll) => `${roll.formula}: ${roll.rolls.join(" + ")}`).join("; ")})` : ""}.`);
      return result;
    }
    // Short and long rests preview first so a misclick never spends dice.
    // The preview runs locally with no persistence; confirming reuses one
    // stable event id so a double-click cannot apply the rest twice.
    const previewed = previewRest(activeHero, { kind, diceToSpend: kind === "short" ? restDice : 0 });
    if (!previewed.ok) {
      setLocalError(previewed);
      return previewed;
    }
    const eventId = globalThis.crypto?.randomUUID?.() || `rest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    setRestPreview(previewed.value);
    setRestEventId(eventId);
    setLocalError(null);
    setRestMessage("");
    return previewed;
  };

  const confirmRest = async () => {
    if (!activeHero || !restPreview) return null;
    const kind = restPreview.kind;
    const result = (await onRest(activeHero.id, kind, {
      diceToSpend: kind === "short" ? restDice : 0,
      eventId: restEventId,
    })) || okay();
    if (!result.ok) {
      setLocalError(result);
      return result;
    }
    setLocalError(null);
    const outcome = result.outcome;
    setRestMessage(kind === "short"
      ? `Short rest: ${outcome?.healing || 0} HP restored from ${outcome?.dice || 0} hit dice.`
      : `Long rest: HP restored and ${outcome?.hitDiceRecovered || 0} hit dice recovered.`);
    setRestPreview(null);
    setRestEventId(null);
    return result;
  };

  const cancelRest = () => {
    setRestPreview(null);
    setRestEventId(null);
    setRestMessage("");
  };

  const confirmRetire = async () => {
    const retiredId = retiring.id;
    const result = (await onRetire(retiredId)) || okay();
    if (!result.ok) {
      setLocalError(result);
      return;
    }
    const nextHero = heroes.find((hero) => hero.id !== retiredId) || null;
    setActiveId(nextHero?.id || null);
    setRetiring(null);
    setLocalError(null);
  };

  const changeClass = async (classId) => {
    const selectedClass = CLASSES.find((entry) => entry.id === classId) || CLASSES[0];
    const backgroundSkills = BACKGROUND_DETAILS.find((entry) => entry.id === activeHero.backgroundBenefitId)?.skills || [];
    (await apply({
      classId: selectedClass.id,
      saveProficiencies: [...selectedClass.saveProficiencies],
      skillProficiencies: [...backgroundSkills],
    }));
  };

  const changeRace = async (raceId) => {
    const nextRace = raceById(raceId);
    const nextSubrace = nextRace.subraces[0] || null;
    const oldGranted = grantedLanguages(activeHero.raceId, activeHero.subraceId);
    const chosenLanguages = activeHero.languages.filter((language) => !oldGranted.includes(language));
    (await apply({
      raceId: nextRace.id,
      subraceId: nextSubrace?.id || null,
      languages: [...new Set([...grantedLanguages(nextRace.id, nextSubrace?.id), ...chosenLanguages])],
    }));
  };

  const changeBackground = async (backgroundId) => {
    const changed = applyBackgroundBenefits(activeHero, backgroundId);
    if (!changed.ok) {
      setLocalError(changed);
      return changed;
    }
    const result = (await apply(changed.value));
    if (result?.ok) {
      const nextDraft = { ...draftRef.current, background: changed.background.name };
      draftRef.current = nextDraft;
      setDrafts(nextDraft);
    }
    return result;
  };

  const changeSubrace = async (subraceId) => {
    const nextSubrace = subraceById(activeHero.raceId, subraceId);
    const oldGranted = grantedLanguages(activeHero.raceId, activeHero.subraceId);
    const chosenLanguages = activeHero.languages.filter((language) => !oldGranted.includes(language));
    (await apply({
      subraceId: nextSubrace?.id || null,
      languages: [...new Set([
        ...grantedLanguages(activeHero.raceId, nextSubrace?.id),
        ...chosenLanguages,
      ])],
    }));
  };

  const changeAbility = async (ability, delta) => {
    const score = activeHero.baseAbilities[ability] + delta;
    if (!canSetBaseAbility(activeHero.baseAbilities, ability, score)) return;
    (await apply({ baseAbilities: { ...activeHero.baseAbilities, [ability]: score } }));
  };

  const { portraits, portraitError } = useHeroPortraits(heroes, portraitRepository);
  const visibleError = localError || persistence.error || portraitError;

  const uploadPortrait = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeHero || !(await flushDraft()).ok) return;
    setPortraitBusy(true);
    try {
      const result = await onReplacePortrait(activeHero.id, file);
      setLocalError(result?.ok === false ? result : null);
    } finally {
      setPortraitBusy(false);
    }
  };

  const clearPortrait = async () => {
    if (!activeHero || !(await flushDraft()).ok) return;
    setPortraitBusy(true);
    try {
      const result = await onRemovePortrait(activeHero.id);
      setLocalError(result?.ok === false ? result : null);
    } finally {
      setPortraitBusy(false);
    }
  };
  const Icon = activeHero ? CLASS_ICONS[activeHero.classId] || Sword : Sword;
  const selectedClass = activeHero ? derived.class : CLASSES[0];
  // Experience is recorded, never spent. The sheet says when a level is
  // available and leaves the decision to the person playing the Hero.
  const earnedLevel = activeHero ? levelForXp(activeHero.xp) : 1;
  const xpRemaining = activeHero ? xpToNextLevel(activeHero.xp) : null;
  const activeBackground = BACKGROUND_DETAILS.find((entry) => entry.id === activeHero?.backgroundBenefitId) || null;
  const backgroundSkills = new Set(activeBackground?.skills || []);
  const racialSkills = new Set(derived?.racialSkillProficiencies || []);
  const selectedSkills = activeHero?.skillProficiencies.filter((skillId) => !backgroundSkills.has(skillId)).length || 0;
  const overRecommended =
    selectedClass.id === "fighter" && selectedSkills > selectedClass.recommendedSkillCount;
  const creationChecklist = activeHero ? [
    { id: "name", label: "Name", done: Boolean(activeHero.name && activeHero.name !== "Unnamed hero"), anchor: "hero-identity" },
    { id: "class", label: "Class", done: Boolean(activeHero.classId), anchor: "hero-identity" },
    { id: "race", label: "Race", done: Boolean(activeHero.raceId), anchor: "hero-identity" },
    { id: "abilities", label: "Abilities", done: derived.pointBuyRemaining === 0, anchor: "hero-abilities" },
    { id: "skills", label: "Skills", done: selectedSkills >= selectedClass.recommendedSkillCount, anchor: "hero-abilities" },
    { id: "equipment", label: "Equipment", done: activeHero.inventory.length > 0, anchor: "hero-equipment" },
  ] : [];
  const saveMessage = visibleError
    ? `Not saved. ${errorText(visibleError)}`
    : busy
      ? "Saving hero…"
      : activeHero
        ? "Hero changes save automatically to this browser."
        : "Forge your first persisted Nightforge hero.";

  const vitals = activeHero ? [
    { label: "Hit Points", value: `${derived.currentHp}/${derived.hp}`, note: `${selectedClass.name} + Constitution`, icon: HeartPulse, tone: "hp" },
    { label: "Armour Class", value: String(derived.ac), note: activeHero.armorId ? "Equipped armour" : "Unarmoured + Dexterity", icon: ShieldHalf, tone: "ally" },
    { label: "Initiative", value: formatModifier(derived.initiative), note: "Dexterity modifier", icon: Zap, tone: "brass" },
    { label: "Speed", value: `${derived.speed} ft`, note: `${derived.race.name} walking speed`, icon: Footprints, tone: "jade" },
  ] : [];

  return (
    <div className={`scroller nf-state-screen-root nf-state-heroes-root${busy ? " nf-state-busy" : ""}`}>
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
            const portrait = portraits[hero.id];
            return (
              <button
                key={hero.id}
                className={"portrait" + (hero.id === activeHero?.id ? " on" : "")}
                onClick={async () => (await selectHero(hero.id))}
              >
                <span className="portrait-face">
                  {portrait
                    ? <img className="nf-state-portrait-image" src={portrait} alt="" />
                    : <HeroIcon size={19} />}
                </span>
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

        {activeHero && (
          <>
            <nav className="nf-state-hero-nav" aria-label="Character sheet sections">
              {[
                ["hero-identity", "Identity"],
                ["hero-abilities", "Abilities"],
                ["hero-equipment", "Equipment"],
              ].map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
            </nav>
            <section className="unit nf-state-hero-checklist" aria-labelledby="hero-checklist-title">
              <div className="unit-top"><div><span className="unit-label" id="hero-checklist-title">Creation checklist</span><p className="note">A clear setup path for this Hero. You can still play with an incomplete sheet.</p></div><span className="tag numeral">{creationChecklist.filter((entry) => entry.done).length}/{creationChecklist.length}</span></div>
              <div className="nf-state-hero-checklist-items">
                {creationChecklist.map((entry) => <a className={`nf-state-hero-check${entry.done ? " done" : ""}`} href={`#${entry.anchor}`} key={entry.id} aria-label={`${entry.label}: ${entry.done ? "complete" : "incomplete"}`}><span aria-hidden="true">{entry.done ? "✓" : "○"}</span>{entry.label}</a>)}
              </div>
            </section>
          </>
        )}

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
                <span
                  className={"sigil sigil-xl" + (portraits[activeHero.id] ? " nf-state-portrait-sigil" : "")}
                  style={portraits[activeHero.id] ? undefined : { background: "linear-gradient(150deg,#3a6f7a,#16292f)" }}
                >
                  {portraits[activeHero.id]
                    ? <img className="nf-state-portrait-image" src={portraits[activeHero.id]} alt="" />
                    : <Icon size={30} />}
                </span>
                <div className="codex-id">
                  <span className="kicker kicker-brass">Character sheet</span>
                  <h2>{drafts.name || "Unnamed hero"}</h2>
                  <p className="prose-sm">
                    Level {activeHero.level} {selectedClass.name} · {derived.race.name}
                    {derived.subrace ? ` (${derived.subrace.name})` : ""}
                  </p>
                  <div className="nf-state-portrait-actions">
                    <label className={"btn btn-line btn-sm file-drop" + (busy || portraitBusy ? " nf-state-disabled" : "")}>
                      <ImagePlus size={14} /> {portraits[activeHero.id] ? "Change portrait" : "Add portrait"}
                      <input
                        type="file"
                        accept="image/*"
                        aria-label="Upload a hero portrait"
                        onChange={uploadPortrait}
                        disabled={busy || portraitBusy}
                      />
                    </label>
                    {activeHero.portraitKey && (
                      <button
                        className="btn btn-line btn-sm"
                        onClick={clearPortrait}
                        disabled={busy || portraitBusy}
                      >
                        <X size={14} /> Remove portrait
                      </button>
                    )}
                  </div>
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

            <section className="sheet enter nf-state-hero-rests" key="rests">
              <header className="sheet-head">
                <div><span className="kicker">Recovery</span><h3>Rests</h3></div>
                <span className="tag tag-jade">{derived.restHours}h sleep equivalent</span>
              </header>
              <div className="nf-state-hero-rest-grid">
                <div className="nf-state-hero-rest-stat"><span>Current HP</span><strong className="numeral">{derived.currentHp}/{derived.hp}</strong></div>
                <div className="nf-state-hero-rest-stat"><span>Hit dice ready</span><strong className="numeral">{hitDiceAvailable(activeHero)}/{hitDiceTotal(activeHero)}</strong></div>
                <label className="field"><span className="label">Dice for short rest</span><input className="inp" type="number" min="0" max={hitDiceAvailable(activeHero)} value={restDice} onChange={(event) => setRestDice(Math.max(0, Math.min(hitDiceAvailable(activeHero), Math.floor(Number(event.target.value) || 0))))} disabled={busy} /></label>
              </div>
              <div className="nf-state-hero-rest-actions">
                <button className="btn btn-line" type="button" onClick={async () => (await takeRest("short"))} disabled={busy || restDice > hitDiceAvailable(activeHero) || Boolean(restPreview)}><HeartPulse size={15} /> Short rest</button>
                <button className="btn btn-key" type="button" onClick={async () => (await takeRest("long"))} disabled={busy || Boolean(restPreview)}><Zap size={15} /> Long rest</button>
              </div>
              {restPreview && (
                <div className="nf-state-hero-panel" role="status">
                  <div className="unit-top"><span className="unit-label">Rest preview</span><span className="tag tag-brass">{restPreview.kind} rest</span></div>
                  <p className="note">
                    {restPreview.kind === "short"
                      ? `Spend ${restPreview.outcome.dice} hit dice to heal ${restPreview.outcome.healing} HP (${restPreview.outcome.previousHp} → ${restPreview.outcome.nextHp}). ${restPreview.outcome.hitDiceAvailable} dice will remain. Short-rest racial uses and charges recover.`
                      : `Restore to full HP (${restPreview.outcome.previousHp} → ${restPreview.outcome.nextHp}) and recover ${restPreview.outcome.hitDiceRecovered} hit dice. Long-rest racial uses and charges recover.`}
                  </p>
                  <div className="nf-state-hero-rest-actions">
                    <button className="btn btn-key" type="button" onClick={confirmRest} disabled={busy}>Confirm rest</button>
                    <button className="btn btn-line" type="button" onClick={cancelRest} disabled={busy}>Cancel</button>
                  </div>
                </div>
              )}
              <p className="note">Long rests restore HP and recover up to half your total Hit Dice, rounded down (minimum one). Daily item charges recover separately when the GM advances dawn.</p>
              <div className="nf-state-hero-rest-actions">
                <label className="field"><span className="label">Campaign day</span><input className="inp" type="number" min="1" step="1" value={dawnDay} onChange={(event) => setDawnDay(Number(event.target.value))} disabled={busy} /></label>
                <button className="btn btn-line" type="button" onClick={async () => (await takeRest("daily"))} disabled={busy || !Number.isSafeInteger(dawnDay) || dawnDay < 1}>Apply dawn</button>
              </div>
              <p className="note">Last applied: {activeHero.dailyResetDay ? `day ${activeHero.dailyResetDay}` : "none"}. Applying the same day again never rerolls charges.</p>
              {restMessage && <p className="prose-sm" role="status">{restMessage}</p>}
            </section>

            {/* One page. Identity, abilities and gear used to hide behind three
                toggles; they are all one scroll now. */}
            <section className="sheet enter" id="hero-identity" key="identity">
                <header className="sheet-head">
                  <div><span className="kicker">Identity</span><h3>Name &amp; origin</h3></div>
                  <p className="note">Who they are before the dice hit the table. Class feature automation is still being expanded; each incomplete rule is labelled where it matters.</p>
                </header>

                <div className="identity">
                  <label className="field span-all">
                    <span className="label">Character name</span>
                    <input className="inp inp-lg" value={drafts.name} onChange={(event) => queueDraft("name", event.target.value)} onBlur={flushDraft} />
                  </label>
                  <label className="field">
                    <span className="label">Class</span>
                    <select className="sel" value={activeHero.classId} onChange={async (event) => (await changeClass(event.target.value))}>
                      {CLASSES.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Level</span>
                    <input className="inp" type="number" min="1" max="20" value={activeHero.level} onChange={async (event) => (await apply({ level: Number(event.target.value) }))} />
                  </label>
                  <label className="field nf-state-hero-xp">
                    <span className="label">Experience</span>
                    <input className="inp" type="number" min="0" value={activeHero.xp} onChange={async (event) => (await apply({ xp: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} />
                    <small className={`note${earnedLevel > activeHero.level ? " nf-state-hero-xp-ready" : ""}`}>
                      {earnedLevel > activeHero.level
                        ? `Enough for level ${earnedLevel}. Levelling up is your call — raise the Level field when you are ready.`
                        : xpRemaining === null
                          ? "Level 20 is the ceiling; further experience changes nothing."
                          : `${xpRemaining.toLocaleString("en-AU")} more for level ${earnedLevel + 1}.`}
                    </small>
                  </label>
                  <label className="field">
                    <span className="label">Race</span>
                    <select className="sel" value={activeHero.raceId} onChange={async (event) => (await changeRace(event.target.value))}>
                      {RACES.map((race) => <option value={race.id} key={race.id}>{race.name}</option>)}
                    </select>
                  </label>
                  {derived.race.subraces.length > 0 && (
                    <label className="field">
                      <span className="label">Subrace</span>
                      <select className="sel" value={activeHero.subraceId || ""} onChange={async (event) => (await changeSubrace(event.target.value))}>
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
                    <select className="sel" value={activeHero.alignment} onChange={async (event) => (await apply({ alignment: event.target.value }))}>
                      {ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}
                    </select>
                  </label>
                  <label className="field span-all">
                    <span className="label">Background</span>
                    <select className="sel" value={activeHero.backgroundBenefitId || ""} onChange={async (event) => (await changeBackground(event.target.value))}>
                      <option value="">Choose a background</option>
                      {BACKGROUND_DETAILS.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                    </select>
                    {activeHero.backgroundBenefitId && (() => {
                      const entry = BACKGROUND_DETAILS.find((candidate) => candidate.id === activeHero.backgroundBenefitId);
                      return entry ? <small>{entry.skills.map((id) => SKILLS.find((skill) => skill.id === id)?.name).join(" + ")} · {entry.tools.length ? entry.tools.join(", ") : "no tool proficiency"} · starting gear added</small> : null;
                    })()}
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
                            onClick={async () => (await apply({ languages: toggleValue(activeHero.languages, language) }))}
                          >
                            {language}{isGranted ? " · granted" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
            </section>

            <section className="sheet enter nf-state-hero-traits" key="racial-traits">
              <header className="sheet-head">
                <div><span className="kicker">Ancestry</span><h3>Racial traits</h3></div>
                <span className="tag tag-brass">{derived.traits.length} active rules</span>
              </header>
              <div className="nf-state-hero-trait-list">
                {derived.traits.map((trait) => (
                  <article className="nf-state-hero-trait" key={trait.id}>
                    <strong>{trait.name}</strong>
                    <p>{trait.description}</p>
                  </article>
                ))}
              </div>
              {derived.traitIds.includes("draconic-ancestry") && (
                <label className="field span-all">
                  <span className="label">Dragon ancestry</span>
                  <select className="sel" value={activeHero.racialChoices.dragonAncestry} onChange={async (event) => (await apply({ racialChoices: { ...activeHero.racialChoices, dragonAncestry: event.target.value } }))}>
                    {DRAGON_ANCESTRIES.map((entry) => <option value={entry.id} key={entry.id}>{entry.label} · {entry.damageType}</option>)}
                  </select>
                </label>
              )}
              {derived.traitIds.includes("tool-proficiency") && (
                <label className="field span-all">
                  <span className="label">Dwarven tool proficiency</span>
                  <select className="sel" value={activeHero.racialChoices.dwarfTool} onChange={async (event) => (await apply({ racialChoices: { ...activeHero.racialChoices, dwarfTool: event.target.value } }))}>
                    <option value="smiths-tools">Smith's tools</option>
                    <option value="brewers-supplies">Brewer's supplies</option>
                    <option value="masons-tools">Mason's tools</option>
                  </select>
                </label>
              )}
              {derived.traitIds.includes("skill-versatility") && (
                <div className="field span-all">
                  <span className="label">Half-elf skill choices · {activeHero.racialChoices.halfElfSkills.length}/2</span>
                  <div className="afflict">
                    {SKILLS.map((skill) => {
                      const selected = activeHero.racialChoices.halfElfSkills.includes(skill.id);
                      return <button type="button" className={`toggle-chip${selected ? " on" : ""}`} key={skill.id} aria-pressed={selected} disabled={!selected && activeHero.racialChoices.halfElfSkills.length >= 2} onClick={async () => (await apply({ racialChoices: { ...activeHero.racialChoices, halfElfSkills: toggleValue(activeHero.racialChoices.halfElfSkills, skill.id) } }))}>{skill.name}</button>;
                    })}
                  </div>
                </div>
              )}
              {derived.traitIds.includes("extra-language") && (
                <label className="field span-all">
                  <span className="label">High elf extra language</span>
                  <select className="sel" value={activeHero.racialChoices.extraLanguage || ""} onChange={async (event) => (await apply({ racialChoices: { ...activeHero.racialChoices, extraLanguage: event.target.value || null } }))}>
                    <option value="">Choose a language</option>
                    {LANGUAGES.filter((language) => !grantedLanguages(activeHero.raceId, activeHero.subraceId).includes(language)).map((language) => <option value={language} key={language}>{language}</option>)}
                  </select>
                </label>
              )}
              {derived.traitIds.includes("high-elf-cantrip") && (
                <label className="field span-all">
                  <span className="label">High elf cantrip</span>
                  <input className="inp" value={activeHero.racialChoices.highElfCantrip || ""} placeholder="Wizard cantrip name" onChange={async (event) => (await apply({ racialChoices: { ...activeHero.racialChoices, highElfCantrip: event.target.value } }))} />
                </label>
              )}
              {derived.traitIds.includes("tinker") && (
                <label className="field span-all">
                  <span className="label">Tinker device note</span>
                  <input className="inp" value={activeHero.racialChoices.tinkerDevice || ""} placeholder="Optional tiny device" onChange={async (event) => (await apply({ racialChoices: { ...activeHero.racialChoices, tinkerDevice: event.target.value } }))} />
                </label>
              )}
            </section>

            <section className="sheet enter" id="hero-abilities" key="abilities">
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
                        <span className="dial-key">{ability.short}</span>
                        <div className="dial-figures">
                          <span className="dial-score numeral">{final}</span>
                          <em className="dial-mod numeral">{formatModifier(derived.abilityModifiers[ability.id])}</em>
                        </div>
                        <span className="dial-name">{ability.name}</span>
                        <div className="dial-step">
                          <button onClick={async () => (await changeAbility(ability.id, -1))} disabled={base <= 8} aria-label={`Lower ${ability.short}`}><Minus size={13} /></button>
                          <button onClick={async () => (await changeAbility(ability.id, 1))} disabled={!canSetBaseAbility(activeHero.baseAbilities, ability.id, base + 1)} aria-label={`Raise ${ability.short}`}><Plus size={13} /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="nf-state-hero-sections">
                  <section className="nf-state-hero-panel">
                    <div className="unit-top"><span className="unit-label">Saving throws</span><span className="tag">Proficiency +{derived.proficiency}</span></div>
                    <p className="note">
                      Tap a save to make this hero <strong>proficient</strong> in it. A proficient save
                      adds the +{derived.proficiency} proficiency bonus to the number shown; removing
                      proficiency takes it away again. Highlighted saves are the proficient ones.
                    </p>
                    <div className="nf-state-hero-checks">
                      {SAVING_THROWS.map((save) => {
                        const proficient = activeHero.saveProficiencies.includes(save.id);
                        return (
                          <button
                            type="button"
                            key={save.id}
                            className={`toggle-chip${proficient ? " on" : ""}`}
                            aria-pressed={proficient}
                            title={proficient
                              ? `${save.name}: proficient. Tap to remove proficiency and lose +${derived.proficiency}.`
                              : `${save.name}: not proficient. Tap to add proficiency and gain +${derived.proficiency}.`}
                            onClick={async () => (await apply({ saveProficiencies: toggleValue(activeHero.saveProficiencies, save.id) }))}
                          >
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
                      Tap a skill to make this hero <strong>proficient</strong> in it, which adds
                      +{derived.proficiency} to that skill. Highlighted skills are the proficient ones.
                      {" "}{selectedClass.name} guidance: choose {selectedClass.recommendedSkillCount} from {selectedClass.skillOptions.map((id) => SKILLS.find((skill) => skill.id === id)?.name).join(", ")}.
                      {overRecommended ? " You may keep extra proficiencies, but this exceeds Fighter guidance." : ""}
                    </p>
                    <div className="nf-state-hero-skills">
                      {SKILLS.map((skill) => {
                        const proficient = derived.skillProficiencies.includes(skill.id);
                        const backgroundGranted = backgroundSkills.has(skill.id);
                        const racialGranted = racialSkills.has(skill.id);
                        return (
                          <button
                            type="button"
                            key={skill.id}
                            className={`toggle-chip${proficient ? " on" : ""}`}
                            aria-pressed={proficient}
                            disabled={backgroundGranted || racialGranted}
                             title={backgroundGranted
                               ? `${skill.name}: granted by ${activeBackground.name}.`
                               : racialGranted
                               ? `${skill.name}: granted by racial traits.`
                               : proficient
                              ? `${skill.name}: proficient. Tap to remove proficiency and lose +${derived.proficiency}.`
                              : `${skill.name}: not proficient. Tap to add proficiency and gain +${derived.proficiency}.`}
                            onClick={async () => (await apply({ skillProficiencies: toggleValue(activeHero.skillProficiencies, skill.id) }))}
                          >
                            <span>{skill.name} <small>{backgroundGranted ? `${skill.ability.toUpperCase()} · background` : skill.ability.toUpperCase()}</small></span>
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

            <div id="hero-equipment">
              <CoinEditor coins={activeHero.coins} onChange={async (coins) => (await apply({ coins }))} busy={busy} title="Coin purse" />
              <GearChapter key={activeHero.id} hero={activeHero} apply={apply} busy={busy} />
            </div>
            <CheckPanel
              actorName={activeHero.name}
              disabled={busy}
              onRoll={(specification) => onRollCheck(null, { ...specification, heroId: activeHero.id })}
            />
            <RollLogPanel entries={rollLog} heroId={activeHero.id} />
          </>
        )}
      </div>

      {retiring && (
        <>
          <div className="veil" onClick={() => setRetiring(null)} />
          <aside ref={retireDialogRef} className="drawer nf-state-dialog" role="dialog" aria-modal="true" aria-labelledby="retire-hero-title" aria-describedby="retire-hero-description" tabIndex={-1}>
            <div className="drawer-top">
              <div><span className="kicker">Retire hero</span><h2 id="retire-hero-title">Close this legend?</h2></div>
              <button className="glyph" onClick={() => setRetiring(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="drawer-body">
              {visibleError && <div className="nf-state-inline-error" role="alert"><strong>Hero not retired</strong><span>{errorText(visibleError)}</span></div>}
              <p className="prose" id="retire-hero-description">Retire <strong>{retiring.name}</strong> from this Nightforge party?</p>
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
