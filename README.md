# Roll30 — Nightforge

A ground-up rebuild of Roll30's interface. The previous UI was treated as a
throwaway prototype: every stylesheet, layout, navigation model and component
was deleted and replaced. **Only the conceptual functionality survived** — the
same actions exist, but almost none of them look, sit, or are named the way
they used to.

Nightforge is now a functional, clean-room implementation. Scenes, Heroes,
artwork references, Table setup, encounters, equipment, attacks, conditions,
loot, ammunition, completion, and restart behavior persist through dedicated
Nightforge repositories. It does **not** import characters, games, maps, saves,
source, UI, UX, or layout from original Roll30.

## Run it

```bash
npm install
npm run dev
```

The development server prints the local URL. Production output is created with
`npm run build`.

Release builds use explicit GitHub Pages bases:

| Command | Pages path |
|---|---|
| `npm run build:preview` | `/Roll30-Nightforge/` |
| `npm run build` | `/Roll30/` |

The same verified source can therefore be reviewed in an isolated preview
repository before the production repository is replaced.

## Verification

```bash
npm run verify
```

The complete gate runs **229 domain/repository/integration tests**, every render
smoke suite, all phase purity verifiers, **15 pinned-Chromium browser journeys**,
21 deterministic visual baselines, dependency audit, and the production build.

Useful focused commands:

| Command | Coverage |
|---|---|
| `npm run test:phase11` | Corrupt data, quota failures, long content, and large collections |
| `npm run test:phase11:render` | Loading, empty, success, error, recovery, and extreme-content markup |
| `npm run test:phase11:browser` | Keyboard dialogs, responsive layouts, zoom, large lists, storage isolation, and screenshots |
| `npm run verify:phase11` | Phase 11 purity, accessibility, performance, parity, and baseline contracts |

The [parity register](./PARITY_REGISTER.md) maps all 47 planned acceptance
journeys to their authoritative evidence.

## The design language

**Nightforge** — cold slate substrate, verdigris as the primary voice, antique
brass reserved for ceremony (initiative, rounds, rank), and faction colour used
only where allegiance matters.

| | |
|---|---|
| Substrate | near-black green-shifted slate (`#05080a → #1f363c`) |
| Primary | verdigris `#2fd3b4` |
| Ceremony | antique brass `#e0b055` |
| Factions | ally `#5fa8f5` · foe `#f2617a` |
| Display type | Fraunces (soft serif) |
| Interface type | Plus Jakarta Sans |
| Numerals | IBM Plex Mono, tabular |

Surfaces are layered rather than outlined: glass over the map, gradient panes
over the page, a film grain so the flat darks never read as plastic.

## What changed, screen by screen

| Screen | Before | After |
|---|---|---|
| **Shell** | vertical icon rail pinned left | **command deck** across the top — brand, a centred nav capsule, and a standing "Enter the table" action |
| **Library** | hero banner with an inline create form, then a 3-up card grid | a **cinematic stage** for the scene you'd return to, a tight **ledger** of everything else, and creation moved into **The Forge** slide-over |
| **Heroes** | roster sidebar beside one endless scrolling sheet | a horizontal **portrait rail**, a **letterhead** carrying the vitals ribbon, and the sheet split into **chapters** (Identity · Abilities · Gear) |
| **Scene** | stacked setting cards in a narrow column | a **workbench** — the map on a rig at left, dials at right, and a preview whose grid redraws live as you move the cell-size slider |
| **Table** | rigid three-column grid, panels flanking a boxed canvas | the **map owns the window**; glass instruments float above it — corner HUDs, side docks, and a bottom **turn track** that replaces the old turn bar and initiative list |

## Structure

```
src/
  App.jsx               application shell, command deck, and routing
  application/          commands, state, browser runtime
  domain/               clean-room rules and records
  storage/              isolated state, session, and artwork repositories
  ui/Glyphs.jsx         protected brand die and faction pips
  ui/useDialogA11y.js   shared modal focus and keyboard contract
  screens/
    LibraryScreen.jsx   stage, ledger, forge drawer
    HeroesScreen.jsx    portrait rail, letterhead, chaptered sheet
    SceneScreen.jsx     preview rig + tuner
    TableScreen.jsx     map, HUDs, docks, turn track
  styles/
    core.css            tokens, reset, primitives
    shell.css           deck, viewport, drawers
    library.css  heroes.css  scene.css  table.css
    functional-states.css  behavior-only responsive and state hardening
```

`core.css` holds every token and shared primitive (buttons, fields, tags,
steppers, meters, sigils). Screen sheets only describe what is unique to that
screen — no primitive is redefined twice.

## Capability parity

All required conceptual behaviors have been independently implemented inside
the Nightforge design. The Nightforge labels for several concepts are:

- *Manage heroes* → **Party roster** (Library masthead)
- *Forge scene* form → **The Forge** slide-over
- *Delete character* → **Retire hero** (letterhead)
- *Back to library* → breadcrumb above the scene tuner
- Board *Setup/Battle* segment → **phase switch**, centred over the map
- *Turn Order* panel + resource strip → one **turn track** along the bottom
- *All maps* / *Scene settings* → glyphs in the table's top-right HUD
