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
| 4 | Backgrounds | 13 names | Text field only |
| 5 | Feats | No | — |
| 6 | Character creation | Yes | Point buy, skills, saves, languages |
| 7 | Skills and ability checks | All 18 | Rollable, with advantage and a DC |
| 8 | Saving throws | Yes | Rollable; four conditions auto-fail STR and DEX |
| 9 | Spells | No | Save DC and attack bonus computed, nothing uses them |
| 10 | Weapons | All 36 | Yes, incl. properties except Special and Monk |
| 11 | Armor and shields | All 13 | Yes |
| 12 | Magic weapons and armor | Yes | +1 to +3 enchantments work |
| 13 | Magic items | 119 | 6 work, 113 inert. No potions, attunement, or charges |
| 14 | Monsters | All 334 | Yes. Traits, reactions, legendary actions are text only |
| 15 | Conditions | All 15 | Yes, but never expire. Exhaustion is tracked, not laddered — decided against |
| 16 | Attack rolls | Yes | Advantage, crits, multiattack, two-weapon, thrown, ammo |
| 17 | Damage | Yes | Types are labels. No resistance or immunity |
| 18 | Healing and temp HP | Yes | Manual controls. No death saves yet |
| 19 | Initiative and turns | Yes | Yes |
| 20 | Movement | Yes | Walking only. No fly/swim/climb, difficult terrain, forced movement |
| 21 | Reactions | No | No opportunity attacks, no Ready |
| 22 | Other actions | Partly | Unarmed strikes work. No Dodge, Disengage, Hide, Help, Grapple, Shove |
| 23 | Vision | Partly | Walls block sight. No cover, light levels, or darkvision |
| 24 | Concentration | No | — |
| 25 | Rests | No | No short/long rest, no hit dice |
| 26 | Loot and chests | Yes | Yes |
| 27 | Money | Prices exist | Can't buy anything |
| 28 | XP | Yes | Awarded at battle end by hand. Only defeated foes count |
| 29 | Falling and hazards | No | Decided against — applied by hand with the damage control |
| 30 | Surprise | No | — |
| 31 | Languages, alignment, CR | Yes | Reference only — correct as is |
| 32 | Sides | Yes | Ally or foe per token; a Battle ends when one side stands |

A turn currently offers four buttons: Attack, Bonus, Swap, Dash — plus move and
End Turn.

---

## Bugs

Things that are built but wrong, as opposed to things that aren't built. These
come before new features — a broken rule is worse than a missing one, because
you can plan around a missing one.

**The page is currently clear.** The five bugs below were fixed on
`feat/core-rules`; they are kept here, crossed off, because knowing a rule was
once wrong is worth more than a tidy list.

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
- [ ] **Resistance and immunity** — the data is structured at import and then
      thrown away as prose. Halve, zero, or double.
- [ ] **Dodge, Disengage, Help** — simple flags on turn resources
- [ ] **Condition durations** — rounds are already counted; tie conditions to them
- [ ] **Surprise round** — skip turn one for some tokens
- [ ] **Fly, swim, climb speeds** — imported already; pick which one applies

### Weeks

- [ ] **Death saves** — needs a dying state, and battle-end needs redefining.
      Fully unblocked now: healing exists so a stabilised creature has something
      to come back to, and `completeEncounterIfNeeded` already asks whether one
      side is standing, so the dying state slots into a check that is asking the
      right question.
- [ ] **Difficult terrain** — paint cells, double movement cost
- [ ] **Money and shopping** — prices exist; needs a purse and a shop
- [ ] **Potions** — now unblocked; healing exists and they can call it
- [ ] **Backgrounds** — skills, tools, and equipment per background
- [ ] **Racial traits** — 38 individual rules
- [ ] **Forced movement** — push and pull, needs collision handling
- [ ] **Cover** — wall geometry exists, but half vs. three-quarters is fiddly
- [ ] **Grapple and shove** — needs contested checks. The single-roll half now
      exists, so this is one function that rolls twice and compares.

### Months

- [ ] **Reactions and opportunity attacks** — new resource, and it interrupts
      other creatures' turns. Movement currently has no consequence at all.
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

The bugs are cleared, including battle completion — so the completion card,
the experience award and restart are all reachable in a normal party for the
first time.

Next: **death saves**, so a downed creature has a story rather than an ending.
Saving throws, skill checks and healing are all done, which unblocks it, and it
was waiting on the completion fix because both touch the same check — that
dependency is now paid off, and `completeEncounterIfNeeded` already asks the
side-aware question death saves need. Then **resistance and immunity**, the
cheapest remaining feature: the data is already imported and thrown away as
prose. Then **reactions and opportunity attacks**, which is what makes position
matter.

---

## Housekeeping

- [ ] **The phase-numbered npm scripts.** ~45 named `verify-phase1` through
      `verify-phase12`. The numbers meant something during the rebuild and mean
      nothing now. New work is named by feature instead — `test:rules`,
      `verify:rules` — so the migration has somewhere to go.
- [ ] **`README.md` overlaps `FEATURES.md`.** The test count is correct again
      (301 in both), but the README still duplicates the design language and the
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
- **Automatic conditions.** Nothing inflicts a condition on its own. The person
  running the game decides what's happening to whom.
- **Bundling SRD source data in the repo.** `DND 5E Data/` stays external and
  gitignored. Only generated output is committed.
