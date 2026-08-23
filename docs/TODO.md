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
| 3 | Races and subraces | All 9 + 4 | Bonuses, speed, size. No racial traits |
| 4 | Backgrounds | All 13 | Grant their two skills, tool proficiencies, and catalog-backed starting equipment |
| 5 | Feats | No | — |
| 6 | Character creation | Yes | Point buy, skills, saves, languages |
| 7 | Skills and ability checks | All 18 | Rollable, with advantage and a DC |
| 8 | Saving throws | Yes | Rollable; four conditions auto-fail STR and DEX |
| 9 | Spells | No | Save DC and attack bonus computed, nothing uses them |
| 10 | Weapons | All 36 | Yes, incl. properties except Special and Monk |
| 11 | Armor and shields | All 13 | Yes |
| 12 | Magic weapons and armor | Yes | +1 to +3 enchantments work |
| 13 | Magic items | 123 | 10 work: 6 worn items and 4 healing potions. 113 remain inert; no attunement or charges |
| 14 | Monsters | All 334 | Yes. Traits, reactions, legendary actions are text only |
| 15 | Conditions | All 15 | Permanent or timed; immunity enforced. Exhaustion is tracked, not laddered — decided against |
| 16 | Attack rolls | Yes | Advantage, crits, multiattack, two-weapon, thrown, ammo |
| 17 | Damage | Yes | Typed. Resistance, immunity and vulnerability all apply |
| 18 | Healing, temp HP, death saves | Yes | Heroes must roll once on their dying turn; healing raises them; adjacent allies can stabilise with Medicine |
| 19 | Initiative and turns | Yes | Yes |
| 20 | Movement | Yes | Walking, flying, swimming, climbing, and difficult terrain. No general forced movement |
| 21 | Reactions | Yes | Opportunity attacks and Ready. An opportunity swing still does not interrupt the move |
| 22 | Other actions | Partly | Unarmed strikes, Dodge, Disengage, Help, Stabilise, Grapple, and Shove. No Hide |
| 23 | Vision | Partly | Walls block sight. No cover, light levels, or darkvision |
| 24 | Concentration | No | — |
| 25 | Rests | No | No short/long rest, no hit dice |
| 26 | Loot and chests | Yes | Yes |
| 27 | Money | Prices exist | Can't buy anything |
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
- [ ] **Interrupting movement with an opportunity attack** — the swing currently
      resolves after the mover finishes their route. Making it interrupt means
      making `moveActiveToken` resumable, which is a bigger change than the
      reaction itself was. Only matters when the swing would down the mover
      mid-route.
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
- [ ] **Money and shopping** — prices exist; needs a purse and a shop
- [x] **Potions** — all four SRD healing potions roll their formula, heal the
      active creature or an adjacent living creature, consume one item, and
      spend the Action.
- [x] **Backgrounds** — all thirteen grant two skills, their tool proficiencies,
      and catalog-backed starting equipment. Changing background swaps
      only the previous background's grants.
- [ ] **Racial traits** — 38 individual rules
- [ ] **Forced movement** — push and pull, needs collision handling
- [ ] **Cover** — wall geometry exists, but half vs. three-quarters is fiddly
- [x] **Grapple and shove** — contested Athletics versus the defender's better
      Athletics or Acrobatics. Grapple immobilises, supports escape, release,
      and half-speed dragging; Shove either knocks prone or pushes five feet
      with wall, board-edge, and collision checks.

### Months

- [x] **Reactions and opportunity attacks** — leaving an enemy's reach draws one
      swing, and Disengage prevents it. The reaction is a flag on the token
      because the creature spending it is never the active one. Range is checked
      from the departure square after movement persists. Movement now has a
      consequence. **Not done:** the swing does not interrupt the move, and
      Ready now uses the same reaction resource; only movement interruption is
      still outstanding.
- [ ] **Hide** — needs Stealth, plus per-token visibility
- [ ] **Attunement and charges** — a new system touching every item
- [ ] **Feats** — each one is bespoke
- [ ] **The 113 inert magic items** — each one is bespoke
- [ ] **Rests** — needs hit dice and everything that recharges
- [ ] **Concentration** — effects need durations and sources first
- [ ] **Light and darkvision** — needs a lighting model on the map
- [ ] **Monster traits automated** — 334 monsters of bespoke rules
- [ ] **Class features and subclasses** — 407 features, most needing spells
- [ ] **Spells** — slots, areas, concentration, saves. The largest by far.

---

## Suggested order

Condition immunity and durations, surprise, all four movement modes, difficult
terrain, Ready, healing potions, backgrounds, Grapple and Shove have landed.
The next smallest combat gap is **interrupting movement with an opportunity
attack**. After that, **money and shopping** can turn the existing prices into a
usable economy, followed by the broader **forced movement** system.

---

## Housekeeping

- [ ] **The phase-numbered npm scripts.** ~45 named `verify-phase1` through
      `verify-phase12`. The numbers meant something during the rebuild and mean
      nothing now. New work is named by feature instead — `test:rules`,
      `verify:rules` — so the migration has somewhere to go.
- [ ] **`README.md` overlaps `FEATURES.md`.** The test count is correct again
      (353 in both), but the README still duplicates the design language and the
      screen-by-screen table that now live in `FEATURES.md`. Cut it back to how
      to run it and how to deploy it, and let `FEATURES.md` be the one
      description of the app.
- [ ] **No linter and no type checking.** There is no ESLint config and no
      TypeScript. The gap is filled by fourteen `verify-phase*.mjs` scripts,
      several of which assert on literal source strings — `verify-rules.mjs`
      checks `attacks.js` for the exact text of a return statement. Those checks
      would be free and refactor-proof as unit tests or lint rules; as greps
      they punish cleanup and still miss real type errors.
- [ ] **The font pipeline differs between dev and production.** `core.css` keeps
      a Google Fonts `@import` that a Vite plugin strips with a regex at build
      time, so `npm run dev` uses CDN fonts and the build uses local ones.
      Reformatting that one line onto two would silently ship remote fonts with
      nothing to catch it. Delete the `@import` and the plugin, and let the
      local `@font-face` rules stand on their own.
- [ ] **`functional-states.css` has outgrown its brief.** At 3,206 lines it is
      larger than the other six stylesheets combined, and now holds every
      `@font-face` as well as the responsive and state hardening it was meant
      for. The `core.css`-plus-per-screen split described in the README no
      longer matches what is on disk.
- [ ] **`TableScreen.jsx` is 1,971 lines** with around thirty pieces of
      `useState` and twenty-four `initial*` props that exist only for test
      injection. The inspectors were extracted; the interaction state machine
      wasn't.
- [ ] **Superseded planning files are still tracked.** `PROJECT_AUDIT.txt`
      (56KB), `Phase Completion.txt` (136KB) and
      `NIGHTFORGE_FULL_FUNCTIONALITY_PORT_PLAN.txt` (45KB) sit in the repository
      root and are replaced by `docs/`.
- [ ] **Monster inventories import empty.** The SRD publishes no loot tables.
      Needs hand-authoring or a generator.
- [ ] **Initiative can't be edited** — it's rolled automatically at battle start
      and can't be re-rolled or tie-broken by hand.

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
