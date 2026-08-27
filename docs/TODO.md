# What's left to build

Everything Nightforge does today is in [`FEATURES.md`](./FEATURES.md). This is
everything it doesn't.

All the D&D data is already imported. Almost everything below is a rule that
needs writing, not data that needs fetching.

Cross things off as you build them, add new ones as you find them, and move
anything you decide against to the bottom **with the reason**.

---

## Where we stand

| # | Thing | In app? | Works? |
|---|---|---|---|
| 1 | Classes | 2 of 12 | Fighter and Wizard. No features, no subclasses |
| 2 | Levels | Yes | 1–20, but only HP and proficiency scale |
| 3 | Races and subraces | All 9 + 4 | Bonuses, speed, size, and the 38-rules racial trait catalog |
| 4 | Backgrounds | All 13 | Grant their two skills, tool proficiencies, and catalog-backed starting equipment |
| 5 | Feats | No | — |
| 6 | Character creation | Yes | Point buy, skills, saves, languages |
| 7 | Skills and ability checks | All 18 | Rollable, with advantage and a DC |
| 8 | Saving throws | Yes | Rollable; four conditions auto-fail STR and DEX; cover applies to sourced DEX saves |
| 9 | Spells | No | Save DC and attack bonus computed, nothing uses them |
| 10 | Weapons | All 36 | Yes, incl. properties except Special and Monk |
| 11 | Armor and shields | All 13 | Yes |
| 12 | Magic weapons and armor | Yes | +1 to +3 enchantments work |
| 13 | Magic items | 123 | Attunement and charge pools are tracked; 10 have active effects and 113 remain reference-only |
| 14 | Monsters | All 334 | Yes. Traits, reactions, legendary actions are text only |
| 15 | Conditions | All 15 | Permanent or timed; immunity enforced. Exhaustion is tracked, not laddered — decided against |
| 16 | Attack rolls | Yes | Advantage, crits, multiattack, two-weapon, thrown, ammo |
| 17 | Damage | Yes | Typed. Resistance, immunity and vulnerability all apply |
| 18 | Healing, temp HP, death saves | Yes | Heroes must roll once on their dying turn; healing raises them; adjacent allies can stabilise with Medicine |
| 19 | Initiative and turns | Yes | Editable scores, reroll-all, and manual tie ordering |
| 20 | Movement | Yes | Walking, flying, swimming, climbing, difficult terrain, and manual forced movement |
| 21 | Reactions | Yes | Opportunity attacks interrupt movement; Ready uses the same reaction resource |
| 22 | Other actions | Partly | Unarmed strikes, Dodge, Disengage, Help, Hide, Stabilise, Grapple, and Shove |
| 23 | Vision | Partly | Cover and racial darkvision are surfaced; there is no light-level model |
| 24 | Concentration | No | — |
| 25 | Rests | Yes | Hero sheet short/long rests spend hit dice, restore HP, and refresh racial/item uses |
| 26 | Loot and chests | Yes | Yes |
| 27 | Money | Yes | Five coin purses and loot transfers; no shopping |
| 28 | XP | Yes | Awarded at battle end by hand. Only defeated foes count |
| 29 | Falling and hazards | No | Decided against — applied by hand with the damage control |
| 30 | Surprise | Yes | Setup can mark creatures that lose their first turn and cannot react beforehand |
| 31 | Languages, alignment, CR | Yes | Reference only — correct as is |
| 32 | Sides | Yes | Ally or foe per token; a Battle ends when one side stands |

A standing turn offers Attack, Dash, Swap, Tactics and Bonus Action — plus move
and End Turn. Tactics contains Dodge, Disengage, Help and adjacent Stabilise
options. A dying turn shows only its required death save and End Turn.

---

## Bugs

Things that are built but wrong, as opposed to things that aren't built. These
come before new features — a broken rule is worse than a missing one, because
you can plan around a missing one.

**The page is currently clear.** Fixed bugs stay crossed off here because knowing
a rule was once wrong is worth more than a tidy list.

- [x] **Knight opportunity attacks were detected and then silently refused.**
      Movement was saved before the reaction resolved, so the attack engine
      measured Greatsword range to the destination instead of the square the
      Hero had just left. Reactions now resolve range from that departure square
      without undoing the saved movement.
- [x] **Help targeting was swallowed by the map's pointer capture.** The board
      treated the enemy click as the start of a camera drag before the token
      could confirm the target. Help mode now owns token clicks just like Attack
      targeting mode does.
- [x] **A dying Hero could skip or repeat their death save.** End Turn is now
      blocked until the active Hero rolls once, and the roll is then spent for
      that turn.
- [x] **There was no ally stabilization action.** An adjacent standing creature
      can now spend its Action on a DC 10 Medicine check from Tactics. Success
      stabilises the dying Hero; failure still spends the Action.

- [x] **A battle can't end while two heroes are alive.** Completion fired when
      one creature was left standing, not one side. Fixed by adding a `faction`
      field to the token — ally or foe, defaulted from whether the token has a
      Hero behind it, so existing saves load with the right sides and no schema
      bump — and making `completeEncounterIfNeeded` ask whether one *side* is
      standing. A fight where every token shares a side falls back to
      last-creature-standing, so a monster brawl does not complete on turn one.
      The side is editable on the Setup inspector card and shown read-only
      during Battle. Defeated allies no longer pay out experience.
- [x] **The ruler disagreed with the rules engine on diagonals.**
      `rulerDistanceFeet` now takes the larger axis rather than the sum, which
      is what movement, attack range and adjacency already did. A test pins the
      ruler and `attackDistanceFeet` to the same answer on a diagonal, a
      straight line, and a knight's move.
- [x] **Temporary hit points survived Restart and Abandon.** Both paths now
      clear `tempHp`, in `restartCompletedBattle` and `restoreSetupTokens`.
- [x] **Two GitHub workflows raced to deploy the same Pages site.**
      `deploy.yml` is deleted. `deploy-pages.yml` was and remains the real one:
      it runs the full gate and picks the build base from the repository.
- [x] **Hero portraits reported scene-artwork errors.**
      `createArtworkRepository` now takes `item`, `collection` and `codePrefix`
      labels. Two nouns rather than one because English needs both — `item` sits
      in object position ("could not load a Hero portrait") and `collection` is
      the mass noun ("storage for Hero portraits is full"). Scene artwork keeps
      the `artwork-*` codes the rest of the app branches on, as the defaults.

---

## The backlog, easiest first

### Days

- [x] **Unarmed strikes** — fixed 1 + Strength, five-foot reach, offered only
      when a creature has nothing equipped
- [x] **Loading property** — the first shot closes the Action whatever the
      Multiattack allowance says. Affects the three crossbows and the blowgun.
- [x] **XP** — monsters carry it, the completion card shows the split, a button
      applies it. Levelling up stays a manual choice.
- [x] **Healing and temporary HP** — heal and damage controls on the token
      inspector; temporary hit points are a separate non-stacking pool that
      absorbs damage first, including damage from attacks.
- [x] **Skill and ability checks** — all 18 skills rollable from the inspector,
      plus bare ability checks
- [x] **Saving throws** — rollable from the inspector for any token, with the
      four helpless conditions failing Strength and Dexterity automatically
- [x] **Resistance and immunity** — immunity zeroes, resistance halves rounding
      down, vulnerability doubles, all applied to the finished total. Every
      token can carry defences, so a Hero can have them too. Qualified SRD lines
      such as "nonmagical weapons that aren't silvered" stay as reference text
      and are marked as not applied, because no weapon in the catalog records
      whether it is silvered.
- [x] **Dodge, Disengage, Help** — flags on the token, not on turn resources:
      all three outlive the turn that bought them, and turn resources exist only
      for whoever is currently active.
- [x] **Ready** — spend the Action, choose an equipped or authored attack, name
      an enemy, and choose whether its movement, attack, or end of turn releases
      the reaction. The intent expires at the creature's next turn if it never
      fires, and resolving it spends the ordinary reaction resource.
- [x] **Interrupting movement with an opportunity attack** — movement pauses on
      the departure square, reactions at that boundary resolve one at a time,
      and the route resumes only if the mover can still move.
- [x] **Condition immunity** — monster data is enforced and every Setup token
      has the same editor, so an immune condition cannot be applied.
- [x] **Condition durations** — apply a condition permanently or for 1, 2, 3,
      5, or 10 rounds; the round transition removes it automatically.
- [x] **Surprise round** — Setup marks surprised creatures, round one skips
      them, and their reactions stay locked until their skipped turn has passed.
- [x] **Fly, swim, climb speeds** — imported monster speeds and editable manual
      speeds feed a movement-mode selector. Dash uses the selected speed.

### Weeks

- [x] **Death saves** — Heroes only; a monster at zero still simply dies, which
      is the SRD rule and what keeps a Battle finishing when the last goblin
      falls. Three successes stabilise, three failures kill, a natural one costs
      two and a natural twenty stands the creature up at 1 hit point. A dying
      creature keeps its side in the fight, so allies have time to reach it, and
      healing raises it. The active Hero must roll once before End Turn; an
      adjacent ally can spend an Action on DC 10 Medicine to stabilise them.
- [x] **Difficult terrain** — paint or erase cells from the Setup rail. Entering
      one costs twice as much movement; flying ignores it.
- [x] **Money (without shopping)** — Heroes, tokens, and chests carry CP, SP,
      EP, GP, and PP. Coins transfer through the existing chest/body loot flow.
      A shop is deliberately not part of this feature.
- [x] **Potions** — all four SRD healing potions roll their formula, heal the
      active creature or an adjacent living creature, consume one item, and
      spend the Action.
- [x] **Backgrounds** — all thirteen grant two skills, their tool proficiencies,
      and catalog-backed starting equipment. Changing background swaps
      only the previous background's grants.
- [x] **Racial traits** — all 38 rules are catalogued and shown on the Hero sheet.
      Proficiencies, darkvision, resistances, save advantages, conditional
      expertise, Hill Dwarf HP, Lucky, Relentless Endurance, Savage Attacks,
      dragon ancestry, and rest-based uses are derived or enforced. Racial
      spell choices and the dragonborn breath profile are recorded for the
      future spell/action systems.
- [x] **Forced movement** — shared collision-aware push, pull, and directional
      slide engine. Shove uses the same engine; forced movement spends no speed
      and draws no opportunity attack.
- [x] **Cover** — half cover grants +2 AC and Dexterity saves, three-quarters
      grants +5, and a full wall provides total cover.
- [x] **Grapple and shove** — contested Athletics versus the defender's better
      Athletics or Acrobatics. Grapple immobilises, supports escape, release,
      and half-speed dragging; Shove either knocks prone or pushes five feet
      with wall, board-edge, and collision checks.

### Months

- [x] **Reactions and opportunity attacks** — leaving an enemy's reach draws one
      swing, and Disengage prevents it. Movement pauses at the departure square,
      the reaction resolves, and a surviving mobile creature resumes its route.
      Ready uses the same reaction resource.
- [x] **Hide** — Stealth checks run against each enemy's passive Perception when
      total cover or invisibility provides concealment. Visibility is stored per
      enemy token; hidden attackers gain advantage and reveal when they attack
      or move.
- [x] **Attunement and charges** — magic-item attunement is capped at three,
      class requirements are checked, legacy worn state is normalized, and SRD
      charge metadata is generated into persistent per-Hero pools.
- [ ] **Feats** — each one is bespoke
- [ ] **The 113 inert magic items** — each one is bespoke
- [x] **Rests** — Hero-sheet short and long rests spend/recover hit dice, restore
      HP, and refresh racial uses plus catalogued short/long/daily item charges.
- [ ] **Concentration** — effects need durations and sources first
- [ ] **Light and darkvision** — needs a lighting model on the map
- [ ] **Monster traits automated** — 334 monsters of bespoke rules
- [ ] **Class features and subclasses** — 407 features, most needing spells
- [ ] **Spells** — slots, areas, concentration, saves. The largest by far.

---

## Suggested order

Condition immunity and durations, surprise, all four movement modes, difficult
terrain, Ready, healing potions, backgrounds, Grapple and Shove have landed.
Hide, racial traits, rests, and the attunement/charge state system have now
landed. The next open systems are **Feats** and the 113 bespoke magic-item
actions. Shopping remains separate from the implemented coin purses because it
needs a merchant and transaction workflow, not just item prices.

---

## Housekeeping

- [x] **The phase-numbered npm scripts.** Public npm commands now use feature
      names such as verify:foundation, test:combat:render, and verify:release.
      Historical phase filenames remain only where they are useful as
      evidence-artifact names.
- [x] **README.md overlaps FEATURES.md.** README now covers setup, builds,
      deployment, verification, and catalog maintenance. FEATURES.md is the
      single description of the app and its design language.
- [x] **No linter and no type checking.** ESLint flat configuration and a
      TypeScript project check are part of the repository and the full
      verification gate. The existing JavaScript code remains in a gradual
      typing mode while TypeScript validates the project graph and JSX setup.
- [x] **The font pipeline differs between dev and production.** Google Fonts
      imports and the stripping plugin are gone. Local @font-face rules live
      in core.css, so development and production use the same bundled fonts.
- [x] **functional-states.css has outgrown its brief.** State hardening is now
      separated into a small cross-screen layer plus library, hero, and table
      state sheets. Font declarations no longer live in a functional
      stylesheet.
- [x] **TableScreen.jsx was carrying the interaction state machine.** The
      controller hook now owns state, effects, and transitions in
      src/screens/useTableController.js; TableScreen.jsx composes the view.
- [x] **Superseded planning files are still tracked.** The three root planning
      records were removed. Durable release evidence now lives in
      docs/RELEASE.md, alongside the other maintained documentation.
- [x] **Monster inventories contain their named weapons only.** Exact catalog
      weapons named by authored attacks are added once. Natural attacks, armour,
      money, and generated treasure are never inferred.
- [x] **Initiative is editable.** Scores can be changed, the whole order can be
      rerolled without losing the active turn, and equal scores can be ordered
      manually.

---

## Decided against

Move things here rather than deleting them, with the reason.

**Everything in this section is a closed question.** These are not gaps and they
are not backlog. Do not list them as missing features, do not raise them in a
review, and do not build them without a decision that reopens the entry first.

- **Falling damage.** The board is flat. There is no elevation on a token, no
  height on a wall, and no third axis anywhere in the scene record, so nothing
  in the app can know that something fell or how far. Adding 1d6 per 10 ft would
  mean inventing a whole vertical dimension to serve one die roll. The person
  running the game says "you fall thirty feet" and types the damage into the
  hit point control, which already exists and already logs it. That is the
  correct amount of machinery for this.
- **Exhaustion levels.** Exhaustion is already there as one of the 15
  conditions, tracked by hand with an honest note saying the six-level ladder is
  not inferred. That is the right place for it to stop. The ladder touches
  ability checks, attacks, movement speed, saving throws, hit point maximum and
  death, so automating it means threading one condition through nearly every
  rule in the engine — and conditions are applied by hand here anyway, on
  purpose. Tracking the level is a note; applying it is a judgement call.
- **Languages and alignment as mechanics.** Both are imported and displayed.
  Whether two creatures understand each other is a conversation at the table,
  not a check the app can make. Alignment is a roleplaying note, not a number.
- **Challenge rating as a mechanic.** Imported and displayed to help you pick a
  monster. Encounter balancing is a judgement call.
- **Levels for monsters.** Monsters carry finished numbers instead of a
  progression that generates them. A stat block already is the result.
- **Automatic turn ending.** The app never advances the turn for you, even when
  you have nothing left to spend. Ending a turn is always deliberate.
- **Automatic conditions from authored attacks and descriptive effects.** The
  person running the game decides those. Explicit rule actions are different:
  Grapple and Shove apply the condition they just resolved, while ordinary
  attack riders and monster prose remain manual.
- **Bundling SRD source data in the repo.** `DND 5E Data/` stays external and
  gitignored. Only generated output is committed.
