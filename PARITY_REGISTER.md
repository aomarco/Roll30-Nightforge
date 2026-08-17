# Nightforge parity register

This register tracks the clean-room Nightforge implementation against the 47 acceptance journeys in the implementation plan. Evidence names refer to independent Nightforge tests and verifiers; no original Roll30 source, UI, storage, or user data is used as runtime input.

## End-to-end acceptance journeys

| # | Journey | Authoritative evidence | Status |
|---:|---|---|:---:|
| 1 | Fresh first launch | `phase1.test.js` empty repository; Playwright fresh-launch journey | **PASS** |
| 2 | Forge Play Scene | `phase2.test.js` Play Forge journey; Playwright successful Forge journey | **PASS** |
| 3 | Forge Battle Scene | `phase2.test.js` real Forge persistence journey | **PASS** |
| 4 | Open, rename, settings, and delete | `phase2.test.js` open/delete journeys; `phase3.test.js` identity persistence; Phase 2/3 render smoke | **PASS** |
| 5 | Upload, replace, remove, and fail artwork operations | `phase3.test.js` staging, replacement, white-canvas removal, read/write/decode/save/cleanup failures | **PASS** |
| 6 | Create Fighter | `phase4.test.js` Fighter defaults, derivation, and CRUD | **PASS** |
| 7 | Create Wizard | `phase4.test.js` Wizard scaffold and derivation; Phase 4 render smoke | **PASS** |
| 8 | Exercise all races and subraces | `phase4.test.js` nine-race/four-subrace numeric matrix | **PASS** |
| 9 | Complete point buy | `phase4.test.js` cost curve, overspend refusal, and exact 27-point build | **PASS** |
| 10 | Configure skills and saves | `phase4.test.js` catalogs, exact mappings, modifiers, and class resets | **PASS** |
| 11 | Search and filter every item kind | `phase5.test.js` backed-field filter matrix; Playwright complete-catalog search | **PASS** |
| 12 | Configure legal and illegal equipment | `phase5.test.js` ownership, hand, Light, Two-Handed, Versatile, armour, and shield branches | **PASS** |
| 13 | Apply enchantments and worn items | `phase5.test.js` +0–+3 enchantments, worn effects, and persistence | **PASS** |
| 14 | Import Hero token | `phase7.test.js` independent Hero-token snapshot and derived read-only values | **PASS** |
| 15 | Create manual tokens | `phase7.test.js` complete manual-token normalization and editable AC | **PASS** |
| 16 | Add, fill, move, and delete chest | `phase7.test.js` complete-catalog chest CRUD, snapping, and collision | **PASS** |
| 17 | Pan, zoom, reset, and adjust artwork | `phase6.test.js` camera anchoring/reset and independent artwork transform | **PASS** |
| 18 | Draw full and half walls | `phase6.test.js` wall normalization; Phase 6 render smoke | **PASS** |
| 19 | Hide walls | `phase6.test.js` persisted wall visibility; Phase 6 render smoke | **PASS** |
| 20 | Measure with ruler | `phase6.test.js` crossed-square counting and five-foot conversion | **PASS** |
| 21 | Start Battle | `phase7.test.js` refusal branches, initiative creation, and persisted transition | **PASS** |
| 22 | Split movement | `phase8.test.js` multiple movement spends without automatic turn advance | **PASS** |
| 23 | Move after Attack | `phase8.test.js` remaining movement after a normal Attack | **PASS** |
| 24 | Dash | `phase8.test.js` success and every unavailable branch | **PASS** |
| 25 | Exercise all Swap branches | `phase8.test.js` legality, action ordering, movement, attack, repeat, and incapacity branches | **PASS** |
| 26 | Attack melee, Reach, ranged, long, and thrown | `phase9.test.js` exact range tiers and complete resolution matrix | **PASS** |
| 27 | Attack with advantage and disadvantage | `phase9.test.js` high/low die selection and cancellation | **PASS** |
| 28 | Verify Natural 1 and Natural 20 | `phase9.test.js` unconditional miss/hit and critical dice behavior | **PASS** |
| 29 | Dual-wield | `phase9.test.js` unlock legality and off-hand modifier rules | **PASS** |
| 30 | Toggle all conditions | `phase9.test.js` complete 15-condition persisted toggle matrix | **PASS** |
| 31 | Verify full-wall block and half-wall disadvantage | `phase9.test.js` line-of-sight refusal and cover disadvantage | **PASS** |
| 32 | Loot and deplete chest | `phase10.test.js` adjacency, Bonus spend, one-unit transfer, and exact depletion | **PASS** |
| 33 | Throw and embed weapon | `phase10.test.js` physical identity, inventory/hand update, and embedded item | **PASS** |
| 34 | Miss and land weapon | `phase10.test.js` deterministic nearby landing and bounded refusal | **PASS** |
| 35 | Fail and succeed retrieval | `phase10.test.js` ground and living-carrier success/failure; Phase 10 render smoke | **PASS** |
| 36 | Recover from defeated carrier | `phase10.test.js` adjacent free recovery after defeat | **PASS** |
| 37 | Consume and recover ammunition | `phase10.test.js` all seven weapons, four ammunition types, consumption, and exact-once recovery | **PASS** |
| 38 | Reload mid-Setup | `phase7.test.js` fully configured Setup repository reload | **PASS** |
| 39 | Reload mid-Battle | `phase8.test.js` mid-turn reload; `phase10.test.js` active physical-state reload | **PASS** |
| 40 | Abandon Battle to Setup | `phase7.test.js` encounter removal with Setup assets preserved | **PASS** |
| 41 | Complete encounter | `phase10.test.js` winner/no-survivor completion and full walkthrough | **PASS** |
| 42 | Reload completed encounter | `phase10.test.js` completed-state restoration with loot and ammunition state | **PASS** |
| 43 | Restart | `phase10.test.js` HP, initiative, rounds, resources, conditions, and physical-item reset with depleted chests preserved | **PASS** |
| 44 | Force LocalStorage failure | `phase11.test.js` quota contract; Playwright visible quota failure with prior-save preservation | **PASS** |
| 45 | Force IndexedDB failure | `phase3.test.js` staged write/read/cleanup failures; `phase11.test.js` artwork quota contract | **PASS** |
| 46 | Corrupt primary envelope and recover backup | `phase1.test.js` backup recovery; `phase11.test.js` corruption diagnostics; Playwright clean-vault recovery without overwrite | **PASS** |
| 47 | Confirm original Roll30 saves remain untouched | Playwright legacy-key preservation journey; Phase 1–11 purity verifiers | **PASS** |

## Phase 11 hardening matrix

| Requirement | Evidence | Status |
|---|---|:---:|
| Empty, loading, error, recovery, and success states | Phase 11 render smoke plus fresh Forge, corrupt-save, and quota Playwright journeys | **PASS** |
| Focus and keyboard behavior | Shared dialog stack; Playwright forward/reverse Tab trap, Escape, and invoker restoration | **PASS** |
| Reduced motion | Scoped `prefers-reduced-motion` rules and Playwright computed-duration audit | **PASS** |
| Long names | Phase 11 domain/render fixtures and responsive screenshot matrix | **PASS** |
| Large inventories | Full 355-entry catalog in domain, render, and interactive browser search | **PASS** |
| Large token lists | 180-token normalization, static render, and interactive browser selection | **PASS** |
| Corrupt data | JSON, shape, version, checksum, backup, and clean-vault recovery tests | **PASS** |
| Storage quota failures | Separate LocalStorage and artwork quota contracts plus visible browser error | **PASS** |
| Responsive verification | Six required viewport baselines, 100/125/150% zoom emulation, and compact Table baselines | **PASS** |
| Accessibility | Global visible focus, modal contract, exact destructive targets, disabled reasons, non-colour copy, compact layout checks | **PASS** |
| Performance | Bounded SVG, 4,000-cell A*, local pointer handling, debounced/flushable drafts, complete-catalog browser test, isolated artwork storage | **PASS** |
| Clean-room purity | Protected visual hashes, isolated Nightforge storage, forbidden runtime path/key scan, and legacy-key browser preservation | **PASS** |

**Open entries: 0.** Phase 12 preview, production replacement, and rollback operations are deliberately outside this Phase 11 register and require separate explicit approval.
