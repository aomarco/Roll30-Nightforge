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
| 15 | Conditions | All 15 | Yes, but never expire. Exhaustion has no levels |
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
| 28 | XP | Yes | Awarded at battle end by hand |
| 29 | Falling and hazards | No | — |
| 30 | Surprise | No | — |
| 31 | Languages, alignment, CR | Yes | Reference only — correct as is |

A turn currently offers four buttons: Attack, Bonus, Swap, Dash — plus move and
End Turn.

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
- [ ] **Falling damage** — 1d6 per 10 ft
- [ ] **Resistance and immunity** — the data is structured at import and then
      thrown away as prose. Halve, zero, or double.
- [ ] **Dodge, Disengage, Help** — simple flags on turn resources
- [ ] **Exhaustion levels** — six rows of effects on a condition that exists
- [ ] **Condition durations** — rounds are already counted; tie conditions to them
- [ ] **Surprise round** — skip turn one for some tokens
- [ ] **Fly, swim, climb speeds** — imported already; pick which one applies

### Weeks

- [ ] **Death saves** — needs a dying state, and battle-end needs redefining.
      Now unblocked: healing exists, so a stabilised creature has something to
      come back to.
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

Saving throws, skill checks, and healing are done, which unblocks a lot.

Next: **death saves**, so a downed creature has a story rather than an ending.
Then **resistance and immunity**, the cheapest remaining win — the data is
already imported and thrown away. Then **reactions and opportunity attacks**,
which is what makes position matter.

---

## Housekeeping

- [ ] **The phase-numbered npm scripts.** ~45 named `verify-phase1` through
      `verify-phase12`. The numbers meant something during the rebuild and mean
      nothing now. New work is named by feature instead — `test:rules`,
      `verify:rules` — so the migration has somewhere to go.
- [ ] **`README.md` drifts and overlaps.** It quoted 241 tests when the real
      number was 252, and duplicates the design language and screen table now in
      `FEATURES.md`. Cut it to how to run and how to deploy.
- [ ] **Monster inventories import empty.** The SRD publishes no loot tables.
      Needs hand-authoring or a generator.
- [ ] **Initiative can't be edited** — it's rolled automatically at battle start
      and can't be re-rolled or tie-broken by hand.

---

## Decided against

Move things here rather than deleting them, with the reason.

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
