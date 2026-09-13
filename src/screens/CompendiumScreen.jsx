import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, FolderOpen, Search } from "lucide-react";

import { ITEM_CATALOG, formatCost, itemSubtitle } from "../domain/catalog.js";
import { CONDITIONS } from "../domain/conditions.js";
import { CLASSES, RACES, abilityModifier } from "../domain/heroes.js";
import { formatChallengeRating, loadMonsters, monsterCapabilitySummary, monsterSubtitle } from "../domain/monsters.js";

const ITEM_GROUPS = Object.freeze([
  { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armour" },
  { id: "gear", label: "Gear" },
  { id: "ammunition", label: "Ammunition" },
  { id: "magic-item", label: "Magic items" },
]);

const titleCase = (value) => String(value || "").split(/[\s-]+/).filter(Boolean)
  .map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

const formatModifier = (score) => {
  const modifier = abilityModifier(Number(score) || 10);
  return `${score} (${modifier >= 0 ? "+" : ""}${modifier})`;
};

const speedLine = (speed = {}) => {
  const parts = [];
  if (speed.walk > 0) parts.push(`${speed.walk} ft.`);
  for (const mode of ["fly", "swim", "climb", "burrow"]) {
    if (speed[mode] > 0) parts.push(`${mode} ${speed[mode]} ft.`);
  }
  return parts.join(", ") || "—";
};

const readableStatus = (status) => {
  if (status === "implemented") return "Automated";
  if (status === "assisted") return "Assisted";
  return "Reference only";
};

// ---------------------------------------------------------------- cute rows

function FolderRow({ label, detail, onOpen }) {
  return (
    <button type="button" className="nf-state-compendium-row" onClick={onOpen}>
      <span className="nf-state-compendium-row-ico"><FolderOpen size={17} /></span>
      <span className="nf-state-compendium-row-meta"><strong>{label}</strong><small>{detail}</small></span>
      <ChevronRight size={16} />
    </button>
  );
}

function EntryRow({ label, detail, onOpen }) {
  return (
    <button type="button" className="nf-state-compendium-row" onClick={onOpen}>
      <span className="nf-state-compendium-row-meta"><strong>{label}</strong><small>{detail}</small></span>
      <ChevronRight size={16} />
    </button>
  );
}

// ---------------------------------------------------------------- details

function MonsterDetail({ monster }) {
  const summary = monsterCapabilitySummary(monster);
  const senses = Object.entries(monster.senses || {})
    .filter(([key]) => key !== "passive_perception")
    .map(([key, value]) => `${titleCase(key)} ${value}`).join(", ");
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">Monster</span><h2>{monster.name}</h2>
        <p className="note">{titleCase(monster.size)} {monster.subtype ? `${titleCase(monster.creatureType)} (${monster.subtype})` : titleCase(monster.creatureType)}, {monster.alignment}</p></header>
      <div className="nf-state-compendium-stats">
        <span>Armour Class <strong className="numeral">{monster.ac}</strong></span>
        <span>Hit Points <strong className="numeral">{monster.hp}{monster.hitDice ? ` (${monster.hitDice})` : ""}</strong></span>
        <span>Speed <strong>{speedLine(monster.speed)}</strong></span>
        <span>Challenge <strong className="numeral">{formatChallengeRating(monster.challengeRating)} ({Number(monster.xp || 0).toLocaleString("en-AU")} XP)</strong></span>
      </div>
      <div className="nf-state-compendium-abilities">
        {[["STR", monster.strength], ["DEX", monster.dexterity], ["CON", monster.constitution], ["INT", monster.intelligence], ["WIS", monster.wisdom], ["CHA", monster.charisma]]
          .map(([label, score]) => <span key={label}><small>{label}</small><strong className="numeral">{formatModifier(score)}</strong></span>)}
      </div>
      {(monster.saveProfiles?.length || monster.skillProfiles?.length) && (
        <p className="note">
          {monster.saveProfiles?.length ? `Saves ${monster.saveProfiles.map((entry) => `${entry.name} +${entry.total}`).join(", ")}. ` : ""}
          {monster.skillProfiles?.length ? `Skills ${monster.skillProfiles.map((entry) => `${entry.name} +${entry.total}`).join(", ")}.` : ""}
        </p>
      )}
      {(senses || monster.passivePerception || monster.languages) && (
        <p className="note">
          {senses ? `Senses ${senses}. ` : ""}{monster.passivePerception ? `Passive Perception ${monster.passivePerception}. ` : ""}
          {monster.languages ? `Languages ${monster.languages}.` : ""}
        </p>
      )}
      {(monster.damageResistances?.length || monster.damageImmunities?.length || monster.damageVulnerabilities?.length || monster.conditionImmunities?.length) && (
        <p className="note">
          {monster.damageResistances?.length ? `Resistant to ${monster.damageResistances.join(", ")}. ` : ""}
          {monster.damageImmunities?.length ? `Immune to ${monster.damageImmunities.join(", ")}. ` : ""}
          {monster.damageVulnerabilities?.length ? `Vulnerable to ${monster.damageVulnerabilities.join(", ")}. ` : ""}
          {monster.conditionImmunities?.length ? `Condition immunities: ${monster.conditionImmunities.join(", ")}.` : ""}
        </p>
      )}
      {(monster.attacksPerAction > 1 || monster.multiattackNote) && (
        <p className="note"><strong>Multiattack.</strong> {monster.attacksPerAction > 1 ? `${monster.attacksPerAction} attacks per Action. ` : ""}{monster.multiattackNote || ""}</p>
      )}
      {!!monster.attacks?.length && (
        <section><h3>Attacks</h3>
          {monster.attacks.map((attack) => (
            <article key={attack.id} className="nf-state-compendium-sub">
              <strong>{attack.name} <small>+{attack.toHit} to hit · {attack.damageDice} {attack.damageType}</small></strong>
              <small>{attack.rangeKind === "melee" ? `reach ${attack.reachFeet} ft.` : `${attack.normalFeet}/${attack.longFeet} ft.`}{attack.throwable ? " · throwable" : ""}</small>
              {attack.note && <p className="note">{attack.note}</p>}
            </article>
          ))}
        </section>
      )}
      {!!monster.traits?.length && (
        <section><h3>Traits</h3>
          {monster.traits.map((trait, index) => (
            <article key={`${trait.name}-${index}`} className="nf-state-compendium-sub">
              <strong>{trait.name}</strong><p className="note">{trait.desc || trait.text}</p>
            </article>
          ))}
        </section>
      )}
      {!!monster.otherActions?.length && (
        <section><h3>Other actions</h3>
          {monster.otherActions.map((action, index) => (
            <article key={`${action.name || "action"}-${index}`} className="nf-state-compendium-sub">
              <strong>{action.name || "Action"}</strong><p className="note">{action.desc || action.text}</p>
            </article>
          ))}
        </section>
      )}
      {!!monster.legendaryActions?.length && (
        <section><h3>Legendary actions</h3>
          {monster.legendaryActions.map((action, index) => (
            <article key={`${action.name || "legendary"}-${index}`} className="nf-state-compendium-sub">
              <strong>{action.name || "Legendary action"}</strong><p className="note">{action.desc || action.text}</p>
            </article>
          ))}
        </section>
      )}
      {!!monster.reactions?.length && (
        <section><h3>Reactions</h3>
          {monster.reactions.map((action, index) => (
            <article key={`${action.name || "reaction"}-${index}`} className="nf-state-compendium-sub">
              <strong>{action.name || "Reaction"}</strong><p className="note">{action.desc || action.text}</p>
            </article>
          ))}
        </section>
      )}
      <p className="note">Table automation — {monsterSubtitle(monster)} · {summary.implemented} automated, {summary.assisted} assisted, {summary.referenceOnly} reference-only.</p>
    </article>
  );
}

function ItemDetail({ item }) {
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">{item.typeLabel || "Item"}</span><h2>{item.name}</h2>
        <p className="note">{itemSubtitle(item)} · {formatCost(item)}{item.weight ? ` · ${item.weight} lb` : ""}</p></header>
      {item.kind === "weapon" && (
        <div className="nf-state-compendium-stats">
          <span>Damage <strong>{item.damageDice || "Special"} {item.damageType || ""}</strong></span>
          <span>Range <strong>{item.throwRange ? `thrown ${item.throwRange.normal}/${item.throwRange.long} ft.` : item.weaponRange === "ranged" ? `${item.normalRange}/${item.longRange} ft.` : "melee"}</strong></span>
          {item.versatileDamageDice && <span>Versatile <strong>{item.versatileDamageDice}</strong></span>}
        </div>
      )}
      {item.kind === "armor" && (
        <div className="nf-state-compendium-stats">
          <span>Armour Class <strong className="numeral">{item.baseAc}</strong></span>
          {item.dexCap != null && <span>Dex cap <strong className="numeral">+{item.dexCap}</strong></span>}
          {item.stealthDisadvantage ? <span><strong>Stealth at disadvantage</strong></span> : null}
        </div>
      )}
      {!!item.properties?.length && <p className="note">Properties: {item.properties.join(", ")}.</p>}
      {item.chargeMaximum > 0 && <p className="note">Charges: {item.chargeMaximum}{item.chargeRecharge ? ` · ${item.chargeRecharge}` : ""}.</p>}
      {item.requiresAttunement && <p className="note">Requires attunement{item.attunementRequirement && item.attunementRequirement !== "requires attunement" ? ` (${item.attunementRequirement})` : ""}.</p>}
      {item.description && <p className="note">{item.description}</p>}
      {!item.description && item.kind === "gear" && item.gearCategory && <p className="note">Adventuring gear · {item.gearCategory}.</p>}
    </article>
  );
}

function SpellDetail({ entry }) {
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">Spell</span><h2>{entry.name}</h2>
        <p className="note">{readableStatus(entry.capabilityStatus)} — the table resolves this one by hand for now.</p></header>
      <p className="note">Shape of the magic: {String(entry.behaviorFamily || "unspecified").replace(/-/g, " ")}.</p>
      {!!entry.prerequisites?.length && <p className="note">Needs: {entry.prerequisites.join(", ")}.</p>}
      {!!entry.manualNarrativeRequirements?.length && <p className="note">{entry.manualNarrativeRequirements.join(" ")}</p>}
    </article>
  );
}

function ClassDetail({ entry, subclasses, implemented }) {
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">Class</span><h2>{entry.name}</h2>
        <p className="note">{implemented ? "Playable in Nightforge today." : `${readableStatus(entry.capabilityStatus)} — not built yet, the table adjudicates it.`}</p></header>
      {implemented && (
        <div className="nf-state-compendium-stats">
          <span>Hit die <strong className="numeral">d{implemented.hitDie}</strong></span>
          <span>Save proficiencies <strong>{implemented.saveProficiencies.map((save) => save.toUpperCase()).join(", ")}</strong></span>
        </div>
      )}
      {implemented && <p className="note">Class skills: {implemented.skillOptions.join(", ")} (pick {implemented.recommendedSkillCount}).</p>}
      {!implemented && !!entry.prerequisites?.length && <p className="note">Needs: {entry.prerequisites.join(", ")}.</p>}
      {!!subclasses.length && (
        <section><h3>Subclasses</h3>
          {subclasses.map((sub) => (
            <article key={sub.contentId} className="nf-state-compendium-sub">
              <strong>{sub.name}</strong><p className="note">{readableStatus(sub.capabilityStatus)}.</p>
            </article>
          ))}
        </section>
      )}
    </article>
  );
}

function RaceDetail({ race }) {
  const bonuses = Object.entries(race.abilityBonuses || {}).map(([ability, bonus]) => `+${bonus} ${ability.toUpperCase()}`).join(", ");
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">Race</span><h2>{race.name}</h2>
        <p className="note">{titleCase(race.size)} · speed {race.speed} ft.{bonuses ? ` · ${bonuses}` : ""} · speaks {race.languages.join(", ") || "—"}.</p></header>
      {!!race.subraces?.length && (
        <section><h3>Subraces</h3>
          {race.subraces.map((sub) => {
            const subBonuses = Object.entries(sub.abilityBonuses || {}).map(([ability, bonus]) => `+${bonus} ${ability.toUpperCase()}`).join(", ");
            return (
              <article key={sub.id} className="nf-state-compendium-sub">
                <strong>{sub.name}</strong><p className="note">{[subBonuses, sub.languages?.length ? `speaks ${sub.languages.join(", ")}` : ""].filter(Boolean).join(" · ") || "A cultural variant."}</p>
              </article>
            );
          })}
        </section>
      )}
      <p className="note">The full racial trait list lives on the Hero sheet under Ancestry.</p>
    </article>
  );
}

function ConditionDetail({ condition }) {
  const lines = [];
  if (condition.selfAttack) lines.push(`Its attacks have ${condition.selfAttack}.`);
  if (condition.vsMelee || condition.vsRanged) lines.push(`Attacks against it: melee ${condition.vsMelee || "—"}, ranged ${condition.vsRanged || "—"}.`);
  if (condition.immobile) lines.push("It cannot move.");
  if (condition.incapacitated) lines.push("No Action or Bonus Action.");
  if (condition.autoCriticalMelee) lines.push("Melee hits against it are automatic criticals.");
  if (condition.autoFailSaves?.length) lines.push(`${condition.autoFailSaves.map((save) => save.toUpperCase()).join("/")} saves fail with no roll.`);
  for (const [ability, saveMode] of Object.entries(condition.saveModes || {})) lines.push(`${ability.toUpperCase()} saves at ${saveMode}.`);
  return (
    <article className="nf-state-compendium-detail">
      <header><span className="kicker kicker-brass">Condition</span><h2>{condition.name}</h2>
        <p className="note"><span className="tag" style={{ borderColor: condition.color, color: condition.color }}>{condition.abbreviation}</span> {condition.note}</p></header>
      {!!lines.length && (
        <section><h3>What it does at this table</h3>
          {lines.map((line) => <p className="note" key={line}>{line}</p>)}
        </section>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- the page

const SECTIONS = Object.freeze([
  { id: "monsters", label: "Monsters" },
  { id: "items", label: "Items" },
  { id: "spells", label: "Spells" },
  { id: "classes", label: "Classes" },
  { id: "races", label: "Races" },
  { id: "conditions", label: "Conditions" },
]);

export default function CompendiumScreen() {
  const [monsters, setMonsters] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [section, setSection] = useState(null);
  const [group, setGroup] = useState(null);
  const [entryId, setEntryId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    loadMonsters().then((loaded) => { if (active) setMonsters(loaded); }).catch(() => { if (active) setMonsters([]); });
    import("../domain/content.generated.js").then((module) => { if (active) setManifest(module.CONTENT_MANIFEST); }).catch(() => { if (active) setManifest([]); });
    return () => { active = false; };
  }, []);

  const spells = useMemo(() => (manifest || []).filter((entry) => entry.contentKind === "spells").sort((left, right) => left.name.localeCompare(right.name)), [manifest]);
  const classEntries = useMemo(() => (manifest || []).filter((entry) => entry.contentKind === "classes").sort((left, right) => left.name.localeCompare(right.name)), [manifest]);
  const subclassEntries = useMemo(() => (manifest || []).filter((entry) => entry.contentKind === "subclasses"), [manifest]);
  const monsterTypes = useMemo(() => [...new Set((monsters || []).map((entry) => entry.creatureType))].sort(), [monsters]);
  const spellLetters = useMemo(() => [...new Set(spells.map((entry) => entry.name[0].toUpperCase()))].sort(), [spells]);

  const openSection = (id) => { setSection(id); setGroup(null); setEntryId(null); setSearch(""); };
  const openEntry = (nextSection, nextGroup, id) => { setSection(nextSection); setGroup(nextGroup); setEntryId(id); setSearch(""); };

  const query = search.trim().toLowerCase();
  const searchResults = query ? [
    { section: "monsters", label: "Monsters", entries: (monsters || []).filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
    { section: "items", label: "Items", entries: ITEM_CATALOG.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
    { section: "spells", label: "Spells", entries: spells.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
    { section: "classes", label: "Classes", entries: classEntries.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
    { section: "races", label: "Races", entries: RACES.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
    { section: "conditions", label: "Conditions", entries: CONDITIONS.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 8) },
  ].filter((block) => block.entries.length) : [];

  const entryKey = (sectionId, entry) => sectionId === "spells" || sectionId === "classes" ? entry.contentId : entry.id;
  const entryLabel = (sectionId, entry) => entry.name;
  const entryDetail = (sectionId, entry) => {
    if (sectionId === "monsters") return `CR ${formatChallengeRating(entry.challengeRating)} · ${titleCase(entry.creatureType)}`;
    if (sectionId === "items") return itemSubtitle(entry);
    if (sectionId === "spells") return readableStatus(entry.capabilityStatus);
    if (sectionId === "classes") return CLASSES.some((item) => item.id === entry.sourceRecordId) ? "Playable today" : "Not built yet";
    if (sectionId === "races") return `${titleCase(entry.size)} · speed ${entry.speed} ft.`;
    return entry.note;
  };
  const entryGroup = (sectionId, entry) => {
    if (sectionId === "monsters") return entry.creatureType;
    if (sectionId === "items") return entry.kind;
    if (sectionId === "spells") return entry.name[0].toUpperCase();
    return null;
  };

  const crumbs = ["Compendium"];
  if (section) crumbs.push(SECTIONS.find((entry) => entry.id === section)?.label || section);
  if (group) crumbs.push(section === "monsters" ? titleCase(group) : section === "items" ? ITEM_GROUPS.find((entry) => entry.id === group)?.label || group : group);
  const activeEntry = entryId && !query ? findEntry(section, group, entryId, monsters, spells, classEntries) : null;
  if (activeEntry) crumbs.push(activeEntry.name);

  return (
    <div className="codex nf-state-compendium">
      <div className="codex-glow" aria-hidden="true" />
      <header className="codex-top">
        <div><span className="kicker kicker-brass">Every rule in the library</span><h2><BookOpen size={18} /> Compendium</h2></div>
        <div className="seek"><Search size={16} /><input className="inp" aria-label="Search the compendium" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search monsters, items, spells…" /></div>
      </header>
      <nav className="nf-state-compendium-crumbs" aria-label="Compendium location">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`}>
            {index > 0 && <ChevronRight size={13} />}
            {index < crumbs.length - 1 || query ? (
              <button
                type="button"
                onClick={() => {
                  if (query) { setSearch(""); return; }
                  if (index === 0) openSection(null);
                  else if (index === 1) { setGroup(null); setEntryId(null); }
                  else { setEntryId(null); }
                }}
              >
                {crumb}
              </button>
            ) : <strong>{crumb}</strong>}
          </span>
        ))}
      </nav>

      {query ? (
        <div className="nf-state-compendium-groups">
          {!searchResults.length && <p className="note">Nothing answers to that name. Try another search.</p>}
          {searchResults.map((block) => (
            <section key={block.section}>
              <div className="unit-top"><span className="unit-label">{block.label}</span></div>
              {block.entries.map((entry) => (
                <EntryRow key={entryKey(block.section, entry)} label={entryLabel(block.section, entry)} detail={entryDetail(block.section, entry)} onOpen={() => openEntry(block.section, entryGroup(block.section, entry), entryKey(block.section, entry))} />
              ))}
            </section>
          ))}
        </div>
      ) : !section ? (
        <div className="nf-state-compendium-groups">
          <FolderRow label="Monsters" detail={monsters ? `${monsters.length} stat blocks, shelved by creature type` : "Opening the monster shelves…"} onOpen={() => openSection("monsters")} />
          <FolderRow label="Items" detail={`${ITEM_CATALOG.length} entries, shelved by kind`} onOpen={() => openSection("items")} />
          <FolderRow label="Spells" detail={manifest ? `${spells.length} named, shelved A to Z` : "Opening the spell shelves…"} onOpen={() => openSection("spells")} />
          <FolderRow label="Classes" detail="All twelve, marked playable or not yet" onOpen={() => openSection("classes")} />
          <FolderRow label="Races" detail={`${RACES.length} peoples and their subraces`} onOpen={() => openSection("races")} />
          <FolderRow label="Conditions" detail={`${CONDITIONS.length} conditions and what each does`} onOpen={() => openSection("conditions")} />
        </div>
      ) : activeEntry ? (
        <DetailView section={section} entry={activeEntry} subclasses={subclassEntries} />
      ) : (
        <GroupView
          section={section}
          group={group}
          monsters={monsters}
          manifest={manifest}
          monsterTypes={monsterTypes}
          spells={spells}
          spellLetters={spellLetters}
          classEntries={classEntries}
          onOpenGroup={setGroup}
          onOpenEntry={(id) => setEntryId(id)}
          onBack={() => setSection(null)}
        />
      )}
    </div>
  );
}

function findEntry(section, group, id, monsters, spells, classEntries) {
  if (section === "monsters") return (monsters || []).find((entry) => entry.id === id) || null;
  if (section === "items") return ITEM_CATALOG.find((entry) => entry.id === id) || null;
  if (section === "spells") return spells.find((entry) => entry.contentId === id) || null;
  if (section === "classes") return classEntries.find((entry) => entry.contentId === id) || null;
  if (section === "races") return RACES.find((entry) => entry.id === id) || null;
  if (section === "conditions") return CONDITIONS.find((entry) => entry.id === id) || null;
  return null;
}

function GroupView({ section, group, monsters, manifest, monsterTypes, spells, spellLetters, classEntries, onOpenGroup, onOpenEntry, onBack }) {
  if (section === "monsters" && !group) {
    if (!monsters) return <p className="note" role="status">Opening the monster shelves…</p>;
    return (
      <div className="nf-state-compendium-groups">
        {monsterTypes.map((type) => {
          const count = monsters.filter((entry) => entry.creatureType === type).length;
          return <FolderRow key={type} label={titleCase(type)} detail={`${count} ${count === 1 ? "monster" : "monsters"}`} onOpen={() => onOpenGroup(type)} />;
        })}
      </div>
    );
  }
  if (section === "monsters") {
    const entries = monsters.filter((entry) => entry.creatureType === group).sort((left, right) => left.name.localeCompare(right.name));
    return (
      <div className="nf-state-compendium-groups">
        {entries.map((entry) => <EntryRow key={entry.id} label={entry.name} detail={`CR ${formatChallengeRating(entry.challengeRating)}`} onOpen={() => onOpenEntry(entry.id)} />)}
      </div>
    );
  }
  if (section === "items" && !group) {
    return (
      <div className="nf-state-compendium-groups">
        {ITEM_GROUPS.map((kind) => {
          const count = ITEM_CATALOG.filter((entry) => entry.kind === kind.id).length;
          return <FolderRow key={kind.id} label={kind.label} detail={`${count} entries`} onOpen={() => onOpenGroup(kind.id)} />;
        })}
      </div>
    );
  }
  if (section === "items") {
    const entries = ITEM_CATALOG.filter((entry) => entry.kind === group).sort((left, right) => left.name.localeCompare(right.name));
    return (
      <div className="nf-state-compendium-groups">
        {entries.map((entry) => <EntryRow key={entry.id} label={entry.name} detail={itemSubtitle(entry)} onOpen={() => onOpenEntry(entry.id)} />)}
      </div>
    );
  }
  if (section === "spells" && !group) {
    if (!spells.length) return <p className="note" role="status">Opening the spell shelves…</p>;
    return (
      <div className="nf-state-compendium-groups">
        {spellLetters.map((letter) => <FolderRow key={letter} label={letter} detail={`${spells.filter((entry) => entry.name[0].toUpperCase() === letter).length} spells`} onOpen={() => onOpenGroup(letter)} />)}
      </div>
    );
  }
  if (section === "spells") {
    const entries = spells.filter((entry) => entry.name[0].toUpperCase() === group);
    return (
      <div className="nf-state-compendium-groups">
        {entries.map((entry) => <EntryRow key={entry.contentId} label={entry.name} detail={readableStatus(entry.capabilityStatus)} onOpen={() => onOpenEntry(entry.contentId)} />)}
      </div>
    );
  }
  if (section === "classes") {
    if (!manifest) return <p className="note" role="status">Opening the class shelves…</p>;
    return (
      <div className="nf-state-compendium-groups">
        {classEntries.map((entry) => (
          <EntryRow key={entry.contentId} label={entry.name} detail={CLASSES.some((item) => item.id === entry.sourceRecordId) ? "Playable today" : "Not built yet"} onOpen={() => onOpenEntry(entry.contentId)} />
        ))}
      </div>
    );
  }
  if (section === "races") {
    return (
      <div className="nf-state-compendium-groups">
        {RACES.map((entry) => <EntryRow key={entry.id} label={entry.name} detail={`${titleCase(entry.size)} · speed ${entry.speed} ft.`} onOpen={() => onOpenEntry(entry.id)} />)}
      </div>
    );
  }
  if (section === "conditions") {
    return (
      <div className="nf-state-compendium-groups">
        {CONDITIONS.map((entry) => <EntryRow key={entry.id} label={entry.name} detail={entry.note} onOpen={() => onOpenEntry(entry.id)} />)}
      </div>
    );
  }
  return <p className="note">That shelf is empty. <button type="button" onClick={onBack}>Back to the Compendium.</button></p>;
}

function DetailView({ section, entry, subclasses }) {
  if (section === "monsters") return <MonsterDetail monster={entry} />;
  if (section === "items") return <ItemDetail item={entry} />;
  if (section === "spells") return <SpellDetail entry={entry} />;
  if (section === "classes") {
    return (
      <ClassDetail
        entry={entry}
        subclasses={subclasses.filter((sub) => sub.parentContentId === entry.contentId)}
        implemented={CLASSES.find((item) => item.id === entry.sourceRecordId) || null}
      />
    );
  }
  if (section === "races") return <RaceDetail race={entry} />;
  return <ConditionDetail condition={entry} />;
}
