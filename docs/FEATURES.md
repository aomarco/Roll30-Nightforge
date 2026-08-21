# Nightforge — what it is and everything it does

This is the master document. It describes the whole application in plain
English: what it is, what it does, how it behaves, and why certain things were
built the way they were.

If you change the app, change this file. See [`WORKFLOW.md`](../WORKFLOW.md).

**How to read this:** the first section explains what Nightforge is, for
someone who has never seen it. Everything after that is a list of features
grouped by where you'd look for them. "Feature" is used loosely and on purpose
— a thing the user can do, a rule the app enforces, and a decision about how
the plumbing works are all features here, because they all belong in one place.

---

# Part 1 — What Nightforge is

## The short version

Nightforge is a **virtual tabletop for Dungeons & Dragons 5th Edition.** It
runs in a web browser. It replaces the physical objects a group would otherwise
need: the battle map, the miniatures, the character sheets, the dice, and the
scrap of paper tracking whose turn it is.

It is for the person running the game. You build a map, put creatures on it,
start a fight, and the app handles the rules — how far you can move, whether
your attack reaches, whether it hits, how much damage it does.

Nightforge is not a chat app, not a dice roller you paste results from, and not
a rules encyclopaedia. It is a board that knows the rules.

## The mental model

Five nouns carry the entire app. Everything else hangs off these.

**Scene.** One map with everything on it. A Scene is either a **Play** scene
(no grid, no combat — a tavern, a map you're just looking at) or a **Battle**
scene (a grid, creatures, turn order, dice). You can have many Scenes and
switch between them. A Scene is the unit of saving: it holds the artwork, the
grid size, the creatures, the walls, the chests, and the fight in progress.

**Hero.** A player character, built the way you'd build one on paper — race,
class, ability scores, skills, equipment. Heroes exist independently of any
map. They live in a roster and can be dropped onto any Battle scene.

**Token.** A creature standing on a Battle map. Three kinds, all the same shape
underneath:

- A **Hero token** — a snapshot of a Hero, copied onto the map
- A **Monster token** — created from one of 334 imported stat blocks
- A **blank token** — one you fill in yourself

They are genuinely the same kind of thing. A monster is a blank token that
arrived pre-filled. This means you can edit a monster's numbers freely, and it
means a blank token can do everything a monster can.

**Encounter.** A fight in progress on a Battle scene. It holds initiative
order, whose turn it is, the round number, what each creature has spent this
turn, thrown weapons lying on the floor, and a log. A Battle scene has at most
one encounter; ending it returns the scene to Setup.

**Item.** Something ownable — a weapon, armour, a rope, a magic ring. There are
355 of them, imported from the official SRD. Heroes carry them, chests hold
them, corpses can be looted for them.

## The two phases of a Battle scene

A Battle scene is always in one of two phases, and the switch sits centred
above the map.

**Setup.** You arrange things. Place tokens, edit their stats, draw walls, put
down chests, adjust the map artwork, set the grid size. Nothing is committed;
there's no turn order and no dice.

**Battle.** You fight. Initiative is rolled, turn order is fixed, and the rules
apply. Movement costs, actions get spent, attacks resolve. You can abandon back
to Setup at any point, which throws away the fight but keeps everything you
arranged.

## What a turn looks like

On your turn you have a **movement allowance**, one **Action**, and one **Bonus
Action**. The bottom of the screen shows what you have left.

Movement is spent by distance, not by trips — you can move, attack, and move
again with what's left. The Action is spent on one thing: an attack, a Dash, a
weapon Swap. The Bonus Action covers off-hand attacks, opening chests, looting
bodies, and picking thrown weapons back up.

Saving throws, skill checks, and hit point adjustments cost none of the above.
They can be made for any token at any point in the fight, because a saving throw
is nearly always demanded on somebody else's turn.

You end your turn when you choose to. The app never ends it for you.

## The shape of the code

Four layers, and the direction of dependency is strict.

```
src/domain/       the rules. Pure functions, no browser, no clock, no randomness.
src/application/  commands and app state. Wires domain results into storage.
src/screens/      React components. Draws things, collects clicks.
src/storage/      saving and loading. LocalStorage and IndexedDB.
```

**Domain is pure** and that is enforced by the build. It cannot touch `window`,
`localStorage`, the system clock, or `Math.random()` on its own. Randomness and
time are passed in as arguments. This is what makes every rule in the app
testable by pinning the dice to known values.

Every domain function returns the same envelope:

```js
{ ok: true,  value: <the result>, ...extras }
{ ok: false, code: "ATTACK_OUT_OF_RANGE", message, recovery, retryable }
```

The UI never has to guess whether something worked. A refusal always carries a
code the app can branch on, a sentence for the user, and a suggestion of what
to do instead.

---

# Part 2 — Every feature

## Scenes and the Library

- **Two scene kinds.** Play scenes are for display — a map with no grid and no
  combat. Battle scenes carry a grid, tokens, walls, chests, and encounters.
  The kind is chosen at creation and cannot be changed afterwards.
- **The Library** is the home screen. It shows the scene you'd most likely
  return to on a large cinematic card, and everything else in a compact ledger
  below it.
- **The Forge** is the creation panel — a slide-over from the Library where you
  name a scene and pick its kind.
- **Rename, open, and delete** any scene from the ledger. Deleting also sweeps
  the scene's artwork out of image storage so it doesn't accumulate.
- **Scene settings** cover the name, the grid size, and the map artwork.
- **The grid is fixed at 20 columns by 12 rows.** Changing "grid size" changes
  how large each cell is drawn (24–80 pixels), not how many cells exist. The
  board is always the same board; you're changing the zoom of the ruling, not
  the size of the field.
- **Grid size drives the world size.** Cell size determines the pixel size of
  the whole map, which is what the camera pans around inside.

## Map artwork

- **Upload an image** as the map background. Replace it or remove it at any
  time; removing leaves a plain white canvas rather than an empty void.
- **Artwork is transformed independently of the camera.** You can move and
  scale the image to line its features up with the grid without disturbing
  where the camera is looking. Scale is clamped to 0.2×–5×.
- **Non-uniform scaling** is supported — stretch horizontally and vertically by
  different amounts, for maps that aren't square.
- **Live preview.** The Scene workbench redraws the grid over the artwork as
  you drag the cell-size slider, so you can match the ruling to a map that
  already has a grid printed on it.
- **Images live in IndexedDB, not LocalStorage.** Map images are far too large
  for LocalStorage's few-megabyte budget. They are stored as blobs in a
  separate database and referenced by id from the scene record.
- **Hero portraits live in their own separate database** from scene artwork.
  This is deliberate: the scene-artwork cleanup sweep deletes images no scene
  refers to, and if portraits shared that database the sweep would eat them.

## The camera

- **Pan and zoom** over the map. Zoom is clamped to 0.35×–3×.
- **Zoom anchors on a point.** Zooming with the pointer keeps the spot under
  the cursor in place, rather than snapping to the centre — the behaviour every
  map application has, and its absence is immediately noticeable.
- **Reset** returns the camera to its default position and zoom in one action.
- **Screen and world coordinates convert both ways**, which is what lets a
  click on screen become a square on the map regardless of pan and zoom.

## Walls and line of sight

- **Draw walls** as line segments on the map. Two kinds:
  - **Full walls** block both movement and line of sight completely.
  - **Half walls** don't block, but grant cover — attacks crossing them suffer
    disadvantage.
- **Hide walls** with a toggle. The wall still works; you just can't see it.
  This is for the person running the game who wants the players to discover
  where the walls are by walking into them.
- **Walls block movement at the edge between squares**, not by overlapping
  squares. Movement is refused when the step from one cell to the next crosses
  a wall segment.
- **Line of sight is a segment intersection test** from attacker centre to
  target centre against every wall in the scene.

## The ruler

- **Measure between two points** on the map.
- **Distance counts crossed squares, then converts at 5 feet per square** —
  the standard 5e grid rule rather than true diagonal distance.

## Heroes

- **Full character creation** — name, race, subrace, class, level, background,
  alignment, languages, skills, saving throws, ability scores, and equipment.
- **9 races** (Dwarf, Elf, Halfling, Human, Dragonborn, Gnome, Half-Elf,
  Half-Orc, Tiefling) with subraces where the SRD defines them, each applying
  its own ability score bonuses and granted languages.
- **2 classes: Fighter and Wizard.** The other ten are not built — see
  [`TODO.md`](./TODO.md).
- **13 backgrounds, 9 alignments, 16 languages, 18 skills.**
- **Point buy** with the standard 27-point budget. Scores run 8–15 before racial
  bonuses, costing 0/1/2/3/4/5/7/9 respectively. Overspending is refused with a
  message rather than silently clamped.
- **Everything derived is derived, never stored.** Ability modifiers,
  proficiency bonus, armour class, save modifiers, and skill modifiers are all
  computed from the base numbers each time they're read. There is no way for a
  sheet to hold a stale total.
- **Proficiency bonus** is `2 + floor((level - 1) / 4)`, capped to levels 1–20.
- **Experience is recorded but never spent.** Heroes carry an XP total against
  the SRD's 20 thresholds. The sheet says how much is left to the next level, or
  that a level is already available — and then leaves it to you. Raising the
  Level field is always a deliberate act.
- **Armour class** accounts for the armour worn, its Dexterity cap, a shield,
  and any magic bonuses from worn items.
- **Changing class resets save proficiencies** to that class's two, because
  keeping the old ones would silently produce an illegal character.
- **The sheet is split into chapters** — Identity, Abilities, Gear — rather
  than one endless scroll.
- **Hero portraits** upload per-hero.
- **Retire hero** deletes one from the roster.

## Items and equipment

- **355 items** imported from the SRD 5.1: 36 weapons, 13 armour, 183 pieces of
  gear, 4 kinds of ammunition, 113 magic items, and 6 worn magic items.
- **Search and filter** the whole catalogue by kind, and by the properties that
  matter for each kind.
- **Inventory is quantity-based.** You own N of a thing; adding and removing
  adjusts the count.
- **Equipment legality is enforced, with reasons.** You cannot equip what you
  don't own, cannot put a two-handed weapon in one hand while holding
  something else, cannot equip a shield alongside a two-handed weapon. Each
  refusal names the rule it broke rather than just greying out.
- **Weapon properties are honoured** — Light (required for dual wielding),
  Two-Handed, Versatile, Finesse, Thrown, Ammunition, Reach.
- **Enchantments from +0 to +3** can be applied to eligible weapons and armour,
  and they feed through to attack rolls, damage, and AC.
- **Worn magic items** apply passive bonuses while worn.
- **The catalogue is generated, not hand-written.** `catalog.generated.js` is
  built by `npm run catalog:generate` from three SRD files. Never edit it
  directly — edit the generator in `scripts/` and re-run.

## Tokens

- **Three ways onto the map:** import a Hero, summon a Monster, or place a
  blank token you fill in yourself.
- **A Hero token is a snapshot, not a live link.** Copying a Hero onto the map
  freezes its numbers at that moment. Editing the Hero afterwards does not
  change a token already placed. This is intentional — a fight shouldn't
  silently change under you because someone levelled up in another tab.
- **Every token carries** a name, colour, position, HP and max HP, AC, speed,
  all six ability scores, save proficiencies, level, size, conditions, an
  inventory, and a list of attacks.
- **Six sizes:** tiny, small, medium, large, huge, gargantuan.
- **Manual tokens have an editable AC** rather than a derived one, because
  there's no character sheet underneath to derive it from.
- **Tokens snap to cell centres** and cannot be dropped onto an occupied cell.
- **Collision-aware placement.** If the square you asked for is taken, the app
  finds the nearest open one rather than refusing.
- **New token fields are added by giving them a default in the normalizer.**
  Every token loaded from storage passes through `normalizeTableToken`, which
  fills in anything missing. This makes adding a field backwards-compatible
  with every existing save, with no migration and no schema bump.

## Monsters

- **334 monster stat blocks** imported from the SRD, with 324 of them carrying
  at least one authored attack.
- **The Monster browser** is a searchable, filterable picker — by name, creature
  type, size, and challenge rating band, with sorting.
- **Summoning creates an ordinary token** pre-filled from the stat block: HP,
  AC, speed, ability scores, size, type, challenge rating, and attacks.
- **Everything is editable after summoning.** A summoned goblin is just a token
  with goblin numbers in it; change any of them.
- **Challenge rating is displayed, not mechanical.** Fractional ratings render
  as 1/8, 1/4, 1/2. Nothing in the app uses CR to decide anything — it's there
  to help you pick.
- **No levels for monsters.** Deliberate. Monsters carry finished numbers rather
  than a progression that produces them.
- **Read-only stat block notes** are preserved and displayed: traits, non-attack
  actions, legendary actions, reactions, resistances, senses, and languages.
  These are prose for you to read and apply yourself; the app does not enforce
  them.
- **141 monsters have Multiattack**, imported as a number of attacks per Action
  (see the attack rules below).
- **Monster inventories import empty.** The SRD does not publish loot tables —
  only 34 of 334 monsters mention armour at all. Rather than invent loot, they
  arrive empty for you to fill in.
- **The monster catalogue is lazy-loaded.** At 599KB it would nearly double the
  initial download, so it is fetched as a separate chunk the first time the
  browser is opened. The main bundle is 347KB; the monsters arrive only if you
  ask for them.
- **Generated by `npm run monsters:generate`** from the SRD monster file. Like
  the item catalogue, never hand-edit the output.

## Attacks — how they're defined

There are two completely separate ways a creature gets its attacks, and the
split is the single most important design decision in the combat code.

- **Heroes derive their attacks** from what they're holding. Equip a longsword,
  get a longsword attack. The attack bonus is assembled at roll time from
  ability modifier, proficiency bonus, and magic bonus.
- **Everything else carries authored attacks** — a name, a to-hit number, a
  damage expression, a range, written down and finished. `"Scimitar", +4,
  1d6+2, melee 5ft.`
- **You write authored attacks by hand** for any token, in the Setup inspector.
  This is how blank tokens fight. It is also how monsters fight, which is why
  they're the same thing.
- **Why the split exists:** catalogue weapons store dice alone and add the
  ability modifier when rolled. Stat blocks bake the modifier into the damage
  string. Feeding `1d6+2` through the hero path would either parse to nothing
  or count the modifier twice. Keeping them separate avoids the whole problem.
- **The flat term is parsed out at import** and folded into the damage modifier
  at roll time — so a critical hit doubles the dice and never the flat bonus,
  which is the correct 5e behaviour and would be wrong either other way.
- **Both paths produce the same attack option.** Everything downstream — the
  d20, advantage, criticals, walls, range bands, damage, the cinematic — is
  shared code and doesn't know or care which kind it got.
- **Authored attacks can be throwable.** Mark one throwable and it gains
  distance bands on top of its melee reach: swing it or throw it.
- **A creature with nothing equipped punches.** An Unarmed Strike appears as
  the only option: fixed 1 damage plus the Strength modifier, bludgeoning, five
  feet of reach, proficiency applied. It is a capability rather than an item, so
  it can never be owned, dropped, thrown, or enchanted. Creatures with authored
  attacks never see it, and neither does anyone holding a weapon.
- **At most 10 attacks per Action**, a sanity bound rather than a rule.

## Attacks — how they resolve

- **The full 5e resolution:** roll d20, apply advantage or disadvantage,
  compare against target AC, roll damage on a hit.
- **Natural 20 always hits and is a critical.** Natural 1 always misses,
  regardless of what the modifiers say.
- **Criticals double the damage dice only** — never the flat modifier.
- **Advantage and disadvantage cancel.** Having both from any number of sources
  yields a normal roll, per the rules.
- **Three range bands, drawn on the map** when you're choosing a target: green
  for normal range, yellow for long range (which imposes disadvantage), red for
  out of reach.
- **Range tiers are honoured** — melee reach, extended Reach, normal range,
  long range, and thrown range each behave differently.
- **Full walls refuse the attack outright** with a line-of-sight message. Half
  walls allow it at disadvantage.
- **Illegal attacks cost nothing.** An attempt that is blocked or out of range
  does not spend your Action. You get the refusal and you're still standing
  where you were with everything intact.
- **Dual wielding** requires the Attack Action with a Light weapon in each
  hand. The off-hand attack is a Bonus Action, and by default it adds no
  ability modifier to damage.
- **Multiattack keeps the Action open.** A creature with an allowance of three
  attacks spends one Action and rolls three times; the Action closes when the
  allowance runs out. The command bar shows how many are left.
- **Loading overrides Multiattack.** A weapon with the Loading property fires
  once per Action however large the allowance is, so the first shot closes the
  Action. That covers the Light, Hand, and Heavy Crossbows and the Blowgun.
- **Temporary hit points absorb damage first.** A hit spends the target's
  temporary pool before it touches real hit points, and the cinematic says how
  much was absorbed.
- **The attack cinematic** plays the roll out in stages — spin, natural die,
  modifiers, verdict, damage, impact — so the result is legible rather than a
  number appearing. Authored attacks show a single "Attack bonus" line instead
  of the hero breakdown, because there is nothing to break down.
- **Damage floats over the target** on the map when it lands.
- **Failures during the attack are shown, not swallowed.** If the attack
  resolved but couldn't be saved, the cinematic says so and offers a retry.

## Turns and actions

- **Initiative is rolled at battle start** and fixes the turn order for the
  fight.
- **Rounds count up** and are displayed alongside the turn track.
- **Movement is measured in feet at 5 feet per square** and spent as you go.
- **Movement can be split.** Move part of your allowance, attack, then move the
  rest. The app never bundles your movement into one trip.
- **Pathfinding routes around walls and creatures** using A*, bounded to 4,000
  explored cells so a pathological map can't lock the browser up.
- **Dash** spends your Action to double your movement for the turn.
- **Swap** changes your equipped weapons mid-fight, with legality checks and
  ordering rules about what you can still do afterwards.
- **Turns never end automatically.** The app will not advance for you, even when
  you have nothing left to spend. Ending the turn is always a deliberate press.
- **Every refusal explains itself.** "Action already spent", "you have already
  Dashed", "attacking is unavailable after a Swap and movement" — each is a
  distinct error code with its own sentence.

## Saving throws and ability checks

- **Every token can roll all six saves and all 18 skills**, from the battle
  inspector. Click the number and it becomes a d20.
- **Any token, at any point in the battle** — not only the one whose turn it is.
  A saving throw is nearly always demanded on somebody else's turn, so limiting
  this to the active token would make it useless.
- **Nothing is spent.** A save or a check costs no Action, no Bonus Action, and
  no movement. The turn economy is untouched.
- **A difficulty class is optional.** Set one and the roll reports success or
  failure; leave it out and the roll reports its total and decides nothing,
  which is what a contested or open-ended check needs.
- **Advantage and disadvantage** are chosen from a three-way control and combine
  with condition-derived ones using the same cancellation rule as attacks. A
  requested advantage and a Restrained disadvantage produce a normal roll.
- **Skill proficiency is copied onto the token** when it joins the battle, for
  the same reason save proficiency is: a check has to be answerable from the
  token alone, without reaching back into a Hero record that may have changed.
- **Bare ability checks carry no proficiency.** Proficiency reaches a check only
  through a skill.
- **The check cinematic** is a sibling of the attack one, not the same
  component. An attack always resolves against an armour class and always has
  damage to tell; a check may have neither, and may never roll at all.

## Hit points, healing, and temporary hit points

- **Heal or damage any token by hand**, from the battle inspector. There is no
  potion or spell to produce healing yet, so this is the way it happens — and
  the plumbing is what those will call later.
- **Healing is capped at the maximum** and cannot revive. A creature at zero is
  out of this battle; bringing it back needs death saving throws, which do not
  exist yet.
- **Temporary hit points are a separate pool** that sits in front of real
  health. They absorb damage first, are not restored by healing, and are not
  capped by the maximum.
- **Temporary hit points never stack.** A new grant replaces the old pool only
  when it is larger; otherwise the better buffer stands and the grant is
  discarded, with a message saying so. Clearing to zero is always allowed.
- **Manual damage ends the battle properly.** Felling the last standing
  creature by hand completes the encounter exactly as a killing blow does,
  including ammunition recovery.
- **Every change is logged** as a sentence in the encounter log.

## Conditions

- **15 conditions**, toggled by hand on any token: Blinded, Charmed, Deafened,
  Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified,
  Poisoned, Prone, Restrained, Stunned, and the rest of the SRD list.
- **Conditions are applied manually, never automatically.** Nothing in the app
  inflicts a condition on its own. You decide.
- **The mechanical ones actually work:**
  - *Blinded* — your attacks have disadvantage, attacks against you have advantage
  - *Frightened*, *Poisoned* — your attacks have disadvantage
  - *Invisible* — your attacks have advantage, attacks against you have disadvantage
  - *Prone* — your attacks have disadvantage; melee against you has advantage,
    ranged against you has disadvantage
  - *Grappled*, *Restrained* — movement unavailable
  - *Incapacitated*, *Stunned*, *Paralyzed*, *Petrified* — Action, Bonus Action,
    Dash, and Swap all unavailable
  - *Paralyzed* — additionally, melee hits against you are automatic criticals
  - *Paralyzed*, *Petrified*, *Stunned*, *Unconscious* — your Strength and
    Dexterity saving throws fail automatically, without a die being thrown
  - *Restrained* — additionally, your Dexterity saving throws have disadvantage
- **The tracked-only ones are honest about it.** Charmed and Deafened carry a
  note saying they are recorded for future use and do not change weapon attacks
  by themselves. They're there so you can track them, not because the app
  enforces them.
- **Each condition has a colour and a three-letter abbreviation** shown on the
  token, so the board is readable without opening anything.

## Chests and loot

- **Place chests** on a Battle map during Setup and fill them from the full item
  catalogue.
- **Opening a chest costs a Bonus Action** and requires being in an adjacent
  square.
- **You take one unit at a time.** Each take is a separate transfer, and the
  chest depletes item by item until it's empty.
- **Depleted chests stay depleted through a restart.** Restarting a battle
  resets HP, initiative, rounds, resources, conditions, and thrown weapons —
  but not chests you already emptied. Looting is progress, not part of the
  fight.

## Looting the dead

- **Defeated creatures can be searched and looted**, using the same rules as
  chests: adjacent square, Bonus Action to open, one unit at a time.
- **Only the defeated.** A living creature refuses with a message, and so does
  trying to loot yourself.
- **This is the reason monsters have inventories at all** — so the party can
  take what they were carrying.

## Thrown weapons and ammunition

- **Throwing a weapon puts it on the map as a real object.** It leaves your
  hand and your inventory, and physically exists at a location until someone
  picks it up.
- **On a hit it lodges in the target. On a miss it lands nearby**, at a
  deterministic square rather than a random one, so the same throw always
  produces the same result.
- **Some weapons lodge and some don't.** Daggers and darts embed themselves; a
  light hammer hits and drops.
- **Three ways to get a thrown weapon back**, each with its own cost:
  - **From the ground** — Bonus Action, must be adjacent, always succeeds
  - **From a defeated carrier** — free, must be adjacent, always succeeds
  - **From a living carrier** — Bonus Action, must be adjacent, and requires a roll
- **Authored thrown attacks come back to their owner only.** If a monster
  throws its "Wavy Sword", only that monster can recover it. Retrieving it
  restores the attack to the creature rather than granting an item — because
  authored attacks aren't catalogue items and there's nothing to put in a bag.
- **Ammunition is consumed per shot.** Seven weapons draw from four kinds of
  ammunition: bows use arrows, light/hand/heavy crossbows use bolts, slings use
  bullets, blowguns use needles.
- **Running out refuses the attack** rather than firing for free.
- **Spent ammunition can be recovered exactly once**, so it can't be farmed.

## Ending a battle

- **A battle completes automatically** when only one side is standing, or when
  nobody is.
- **The winner is named** on the completion screen.
- **Experience is offered, not given.** The completion card totals what the
  defeated creatures were worth, splits it evenly among the surviving heroes,
  and waits for you to press Award XP. Nothing is written to a hero until you
  do. This matches the rest of the app: it never advances the game for you.
- **A battle pays out once.** The encounter records that it has been awarded, so
  a second press does nothing.
- **Only heroes collect, and only monsters count.** A fallen party member is not
  treasure, and a token with no hero behind it has nowhere to put a share.
- **Levelling up stays manual.** The hero sheet says when a level is available
  and leaves the decision to you.
- **Restarting resets the fight, not the world.** HP, initiative, rounds, turn
  resources, conditions, and thrown weapons all reset. Emptied chests and looted
  bodies stay as they are.
- **Abandoning a battle returns the scene to Setup** and discards the encounter,
  keeping every token, wall, and chest you placed.

## The encounter log

- **Every significant event is recorded** during a fight.
- **Capped at 500 entries of 500 characters each.** A long battle cannot grow
  the save file without bound — an unbounded log is one of the easier ways to
  hit the LocalStorage quota.

## Saving and loading

- **Everything saves automatically** to browser storage. There is no save
  button.
- **Nothing leaves your machine.** No server, no account, no network calls.
- **Two storage systems by size.** Scene and hero records go to LocalStorage as
  JSON. Images go to IndexedDB as blobs, because they are far too large for
  LocalStorage.
- **Every write goes to a primary key and a backup key.** If the primary is
  corrupted on load, the backup is recovered from automatically.
- **Saves are checksummed.** Corruption is detected rather than silently loaded
  as garbage.
- **Corrupt and unrecoverable data does not overwrite.** If both copies are
  unreadable, the app starts clean and leaves the damaged data alone rather
  than stamping over what might still be salvageable.
- **Quota failures are visible.** Running out of storage produces a message
  explaining what happened, and the previous good save is preserved.
- **Saves are patches, not replacements.** Domain functions return the pieces
  that changed; the storage layer shallow-merges them onto the existing record
  and re-normalizes the result. Nothing has to hand back a complete scene just
  to move one token.
- **The schema version is frozen at 1, and must stay there.** The version check
  is a strict mismatch with no migration path — bumping it discards every
  existing save. New fields are added by defaulting them in the normalizer,
  which is backwards-compatible for free.
- **Nightforge storage is namespaced separately from old Roll30.** Keys are
  prefixed `roll30-nightforge-v1:`. The old application's keys are listed as
  forbidden and scanned for, so Nightforge can never read or overwrite a save
  from the app it replaced. Both can be installed side by side.
- **Changes sync across tabs** — two windows on the same scene stay consistent.

## Interface and accessibility

- **The command deck** runs across the top: brand, navigation, and a standing
  "Enter the table" action.
- **The map owns the window** on the Table screen. Instruments float over it as
  glass panels — corner HUDs, side docks, and a turn track along the bottom —
  rather than boxing the map into a column.
- **9 modal dialogs** share one focus and keyboard contract: focus is trapped
  inside, Tab and Shift-Tab cycle, Escape closes, and focus returns to whatever
  opened it.
- **Visible focus everywhere**, globally enforced.
- **Reduced motion is respected.** Animations are scoped behind
  `prefers-reduced-motion` and verified by measuring computed durations in a
  real browser.
- **Nothing is communicated by colour alone.** Every colour-coded state also
  carries text or a symbol.
- **Disabled controls say why.** A greyed-out button is always accompanied by
  the reason it's unavailable.
- **Long names and large collections are handled** — the layout survives a
  355-item catalogue, a 180-token battle, and absurd name lengths.
- **Six responsive breakpoints** are baselined, plus 100%, 125%, and 150% zoom.
- **Local fonts only.** Fraunces for display, Plus Jakarta Sans for interface,
  IBM Plex Mono for numerals. Nothing is fetched from a font CDN.

## The design language

- **Nightforge** — cold slate substrate, verdigris as the primary voice,
  antique brass reserved for ceremony (initiative, rounds, rank), faction
  colour used only where allegiance actually matters.
- **Substrate:** near-black green-shifted slate, `#05080a → #1f363c`
- **Primary:** verdigris `#2fd3b4`
- **Ceremony:** antique brass `#e0b055`
- **Factions:** ally `#5fa8f5`, foe `#f2617a`
- **Surfaces are layered rather than outlined** — glass over the map, gradient
  panes over the page, and a film grain so the flat darks don't read as
  plastic.
- **`core.css` owns every token and shared primitive.** Screen stylesheets only
  describe what is unique to that screen. No primitive is defined twice.
- **`functional-states.css` is behaviour-only.** Responsive and state hardening
  live there, scoped under `.nf-state-` so they never collide with visual
  styling.

## Building and shipping

- `npm run dev` — development server
- `npm run build` — production build for `/Roll30/`
- `npm run build:preview` — production build for `/Roll30-Nightforge/`
- `npm run catalog:generate -- <srd-path>` — regenerate the item catalogue
- `npm run monsters:generate` — regenerate the monster catalogue
- `npm run verify` — the full gate (see below)
- **Two deploy targets.** `origin` publishes the preview site,
  `production` publishes the live one. The same verified source is reviewed in
  preview before production is replaced.
- **Production replacement requires separate explicit approval** and is not part
  of the normal verify gate.
- **Rollback is anchored** by the annotated tag `pre-nightforge-2026-08-17`,
  pointing at the final pre-Nightforge commit.
- **SRD source data is never committed.** `DND 5E Data/` is gitignored.
  Generators read it from a path you supply; only generated output is tracked.

## Testing and verification

- **`npm run verify` is the whole gate** and is exactly what CI runs: every unit
  test, every render smoke suite, every phase verifier, the browser journeys,
  a dependency audit, and a production build.
- **289 unit tests** covering domain rules, repositories, and integration.
- **23 pinned-Chromium browser journeys** driving the real app.
- **21 deterministic visual baselines** per platform.
- **Three kinds of check, by design:**
  - **Unit tests** (`phaseN.test.js`, `rules.test.js`) prove the rules are right
  - **Render smoke** (`phaseN-render-smoke.mjs`, `rules-render-smoke.mjs`)
    server-renders real screens and asserts on the markup, catching UI breakage
    without a browser
  - **Verifiers** (`verify-phaseN.mjs`, `verify-rules.mjs`) grep the source, enforcing
    architectural rules that tests can't see — domain purity, no forbidden
    storage keys, bounded SVG output
- **Verifiers assert on literal source text.** Some of them check for exact
  strings rather than behaviour. An innocent refactor can fail one. If a
  verifier fails on code you're confident in, read the verifier first.
- **Randomness is injectable everywhere**, which is what makes dice-dependent
  rules testable at all — every roll can be pinned to a known sequence.
- **The parity register** ([`../PARITY_REGISTER.md`](../PARITY_REGISTER.md))
  maps 47 acceptance journeys to the evidence proving each one.

## Clean-room provenance

- **Nightforge shares no code with the original Roll30.** Every stylesheet,
  layout, component, and navigation model was deleted and rewritten. Only the
  conceptual functionality survived — the same things are possible, but almost
  nothing looks, sits, or is named the way it did.
- **No original data is imported.** Not characters, games, maps, saves, source,
  UI, UX, or layout.
- **Purity is verified, not asserted.** The build scans for forbidden legacy
  storage keys and runtime paths, and a browser journey confirms old Roll30
  saves are left untouched.

---

## Where the numbers came from

Counts in this document are real and were read from the source. If you change
one, change it here too:

| Thing | Count | Where it lives |
|---|---:|---|
| Items | 355 | `src/domain/catalog.generated.js` |
| — weapons | 36 | |
| — armour | 13 | |
| — gear | 183 | |
| — ammunition | 4 | |
| — magic items | 113 | |
| — worn magic items | 6 | |
| Monsters | 334 | `src/domain/monsters.generated.js` |
| Conditions | 15 | `src/domain/conditions.js` |
| Classes | 2 | `src/domain/heroes.js` |
| Races | 9 | |
| Backgrounds | 13 | |
| Alignments | 9 | |
| Languages | 16 | |
| Skills | 18 | |
| Experience thresholds | 20 | `src/domain/heroes.js` |
| Error codes | 70+ | across `src/domain/` |
| Unit tests | 289 | `src/*.test.js` |
| Browser journeys | 23 | Playwright |
| Acceptance journeys | 47 | `PARITY_REGISTER.md` |
