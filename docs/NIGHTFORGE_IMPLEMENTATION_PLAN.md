# Nightforge: complete implementation and delivery plan

**Status: planning only. No implementation is authorized or performed by this document.**

Prepared 6 September 2026 for the local checkout at `ef268d40178bdd726136a84ddff0efc6e3942996`.
Workspace: `C:\Users\Marcelo\Documents\Roll30 UI Rebuild`.
Baseline evidence: `NIGHTFORGE_COMPLETE_ANALYSIS.txt`, the current source, `docs/FEATURES.md`, `docs/TODO.md`, and `WORKFLOW.md`.

This is a delivery specification, dependency map, and set of engineering contracts. Creating this file does not run migrations, change application code, install dependencies, create infrastructure, commit, push, or deploy. Every command and proposed path below is an instruction for a future implementation task unless explicitly identified as evidence already gathered.

The plan covers correcting existing reliability defects; portable backups; complete supported character progression; all twelve classes and the supplied subclasses; spells, effects, concentration, feats, and multiclassing; monster and item abilities; lighting; exploration rolls; larger maps; offline use; optional accounts/cloud/multiplayer/player permissions; merchants; and the UI, testing, migration, operational, and release work these require.

## Document navigation

[Scope and baseline](#product-contract) · [Engineering invariants](#invariants) · [Phase dependencies](#phase-map) · [Architecture](#architecture) · [Detailed phases](#phase-specifications) · [Delivery contracts](#delivery-contracts)

| Appendix | Contents |
|---|---|
| [A](#appendix-a) | Issue template and worked XP/spell examples |
| [B](#appendix-b) | 319 spell work items |
| [C](#appendix-c) | Twelve classes/subclasses and 407 feature records |
| [D](#appendix-d) | 113 reference-only magic items and source hashes |
| [E](#appendix-e) | Test layers, 40 interaction cases, failure injection, invariants |
| [F](#appendix-f) | Gap traceability, risks, and 18 architecture decisions |
| [G](#appendix-g) | Delivery waves, sizing, ownership, first ten proposed PRs |
| [H](#appendix-h) | Existing code map and persistence touchpoints |
| [I](#appendix-i) | Recovery, support, and operational procedures |
| [J](#appendix-j) | Evidence boundaries and planning-only status |

## Reading and using this plan

1. Read the scope, invariants, and dependency table before implementing any phase.
2. Select the smallest ready work package, not the entire program.
3. Recheck the cited source against the actual implementation commit; line numbers from the audit are historical.
4. Create a concrete issue using the package template in Appendix A.
5. Implement only that package and its necessary dependency work.
6. Prove its behavioral acceptance cases and recovery behavior.
7. Update the capability inventory and only documentation whose truth changed.
8. Follow the repository's applicable delivery lane. Production promotion remains separately authorized.

The phase identifiers are stable issue prefixes. Their numerical order is a useful reading order, not permission to ignore explicit dependencies. Several packages can eventually proceed independently, but this document does not launch agents or assign live work.

<a id="product-contract"></a>

## 1. Product contract and scope boundaries

### 1.1 Target product

Deliver a reliable local GM tabletop capable of running the mechanical parts of its declared 2014/SRD 5.1 content, while making GM-adjudicated decisions explicit. Preserve the existing Nightforge visual identity and fast local workflow. Extend that product with a separately gated online collaboration mode rather than requiring an account for local play.

There are three release products:

| Release | Promise | Required scope |
|---|---|---|
| R1: trustworthy local foundation | Existing games survive failures; existing published numbers are correct; campaigns are portable. | P00–P06, with P01 fixes delivered first. |
| R2: complete declared local rules | All mechanically applicable behaviors in the selected content manifest work, and explicit narrative workflows cover the remainder honestly. | P07–P24 plus preceding dependencies; P28 if merchants are included in that release's selected scope. |
| R3: shared online tabletop | Authorized participants collaborate without exposing GM information or corrupting encounter state. | P25–P27 plus P29 online gates; R2 content rollout can remain independently versioned. |

"Complete" always means complete against a versioned content and behavior manifest. A searchable description, disabled action, or manual HP field does not make a mechanical spell, class feature, or item implemented. Reference-only entries remain open work. A narrative workflow can count as complete only for a behavior that inherently requires GM judgment and has an explicit, useful end-to-end interaction.

### 1.2 Baseline and newly verified content inventory

Previous investigation established 365 passing unit tests, 30 passing Chromium browser tests, 28 passing render/contract scripts, a passing limited TypeScript check, zero lint errors with 30 warnings, zero reported audit vulnerabilities, and a successful production build. These are a dated baseline, not proof about future changes.

Source inventory read while preparing this plan:

| Dataset | Current local source count | Planning implication |
|---|---:|---|
| Classes | 12 | Ten need adding; Fighter and Wizard still need their mechanics. |
| Subclasses | 12 | One supplied subclass per class; do not promise every published subclass. |
| Class/feature records | 407 | Includes related/progression/choice records; inventory by behavior, not assumed unique features. |
| Spells | 319 | Every record needs a supported-behavior contract and completion evidence. |
| Feats | 1 | Grappler only. Broader feat content needs an explicitly selected, authorized source or authored content. |
| Level records | 290 | Contains heterogeneous progression records; do not assume 290 character levels or flatten subclass rows into class rows. |
| Magic-item source records | 362 | Parents and variants require reconciliation; not equivalent to 362 currently shipped distinct items. |
| Shipped item catalogue | 359 | Includes 123 magic entries; 113 are primarily reference-only. |
| Generated monsters | 334 | Form variants exist; all numeric imports and supported abilities require auditing. |

Keep the product on its declared 2014 rules. Do not import 2024/5.2 mechanics because the latest website defaults to them. The official SRD site distinguishes these versions; content eligibility and edition are separate decisions. [Official SRD releases](https://www.dndbeyond.com/srd).

### 1.3 Decisions retained

- Preserve explicit End Turn. Resource exhaustion never automatically advances the turn.
- Preserve Hero-to-token snapshots. Reconciliation, if requested, is explicit and reviewed.
- Preserve manual application of descriptive attack riders and monster prose. Build explicit typed actions and GM-confirmed effect commands; never execute prose as rules.
- Keep the board flat. Falling damage, a vertical physics engine, and the exhaustion ladder remain outside scope under existing closed decisions.
- Keep alignment/languages and encounter CR balancing as reference or GM judgment. An explicit content prerequisite may still use a recorded value after a scoped rule decision; do not create a general morality/language simulation.
- Monsters retain finished authored numbers, not character levels.
- Keep two factions by default; permission roles are a different concept from combat allegiance.
- Keep raw external SRD inputs gitignored. Ship generated, selected content with provenance.
- Never turn a content-generator failure into silent omission or guessed mechanics.

### 1.4 Defaults and decision checkpoints

Use these defaults to avoid blocking implementation on routine choices. An ADR records the actual decision when its phase begins.

| Decision | Default in this plan | Revisit before |
|---|---|---|
| Rules edition | 2014 / SRD 5.1, existing declared house conventions explicitly versioned | P00 |
| Local account requirement | None | P25 |
| Backups | One portable archive containing state and referenced assets | P02 |
| Long-term local persistence | Transactional IndexedDB vault with separate staged generations | P03 |
| Online authority | Server-authoritative encounter commands; clients send intent | P26 |
| Hosted backend vendor | Unselected; TypeScript service, transactional relational database, private object storage | P25 |
| Online offline editing | Read cached state; fork locally instead of merging offline combat actions | P26 |
| Class content | Twelve supplied classes and twelve supplied subclasses | P14 |
| Feats | Grappler plus approved additional content packs, never invented licensing coverage | P19 |
| Multiclassing | Optional per-campaign 2014 feature; preserve single-class simplicity | P19 |
| Map geometry | Square grid, five-foot diagonals, configurable dimensions; no elevation | P07 |
| Story time | Explicit GM advancement; wall-clock time never secretly advances a campaign | P08 |
| Inventory continuity | Instance identity for durable/charged items; stacks for fungible goods | P10 |
| Item coverage | Finish the current 113 first; separately reconcile all 362 source parents/variants | P21 |
| Online hosting and spend | Choose later against measured requirements; no provisioning in this task | P25 |

<a id="invariants"></a>

## 2. Non-negotiable engineering invariants

I01. A failed durable command changes neither authoritative state nor resources. A committed result survives presentation interruption.

I02. Retrying the same command ID returns its original outcome; it does not reroll dice, spend another slot, duplicate loot, or award XP again.

I03. Save recovery never authorizes destructive garbage collection. Unknown reachability means retain, report, and resolve.

I04. Production and preview have different namespaces/origins for state, assets, locks, channels, caches, and online services. A path prefix alone is insufficient.

I05. Persist source facts, choices, resource state, and applied effects. Derive totals through a single documented pipeline. Authored monster totals are source facts, not Hero derivations.

I06. Every mechanically active modifier has provenance, a scope, and a removal rule. Removing one source cannot remove another source's contribution.

I07. Game-time advancement, resource resets, turn boundaries, and reaction decisions are commands. No rule relies on animation timers or browser wall-clock passage.

I08. A browser reload can resume every committed unresolved choice. React local state alone cannot own a rule-critical pending reaction or resolution.

I09. UI previews do not mutate authoritative game state or consume randomness. Commit revalidates all volatile eligibility against the expected revision.

I10. Existing saves have an explicit compatibility path. Normalization must not silently discard new features, pending resolutions, unknown content, or asset references.

I11. A rules/content version is pinned to a campaign/encounter. A deployment cannot silently change an ongoing fight's interpretation.

I12. The online client never receives information it is unauthorized to know. Hiding a DOM element is not an authorization boundary.

I13. Equality of public projections does not require equality of private event logs, IDs, state size, or asset lists. Private information is filtered before transmission.

I14. Game operations have finite work bounds. Unbounded triggered recursion becomes a recoverable adjudication pause, not a hung tab or silently dropped effect.

I15. Tests assert rules and externally visible outcomes, not incidental code strings. Architectural checks inspect import/schema structure where feasible.

I16. Local-only play, old approved campaigns, and prior valid backups remain usable throughout incremental rollout.

<a id="phase-map"></a>

## 3. Program phases and dependencies

| Phase | Outcome | Depends on | Release track |
|---|---|---|---|
| [P00](#p00) | Rules/content contract, evidence, and test baseline | Existing audit | All |
| [P01](#p01) | Urgent recovery, environment, XP, and rest fixes | P00 contract slice | R1 |
| [P02](#p02) | Portable export/import and recovery workbench | P01 | R1 |
| [P03](#p03) | Transactional local vault and safe compatibility boundary | P02 | R1 |
| [P04](#p04) | Correct, loss-accounted content generation | P00; existing-token repair uses P03 | R1 |
| [P05](#p05) | Typed command boundary, deterministic resolution, and resource contracts | P03, P04 | R1 |
| [P06](#p06) | Exploration rolls and first-use character workflow | P05 | R1 |
| [P07](#p07) | Configurable geometry, footprints, targeting, and area templates | P04, P05 | R2 |
| [P08](#p08) | Persistent effects, provenance, and campaign time | P05 | R2 |
| [P09](#p09) | Durable trigger/reaction scheduler | P05, P08; spatial triggers use P07 | R2 |
| [P10](#p10) | Resource lifecycle, item instances, and rest semantics | P03, P05, P08 | R2 |
| [P11](#p11) | Spell definitions, preparation, casting, and first vertical slices | P04, P07–P10 | R2 |
| [P12](#p12) | Concentration and interruption across all damage paths | P09–P11 | R2 |
| [P13](#p13) | Complete the 319-spell behavior manifest | P11, P12; families add only listed prerequisites | R2 |
| [P14](#p14) | Advancement ledger and class-feature framework | P04, P05, P08, P10 | R2 |
| [P15](#p15) | Complete Fighter/Champion and Wizard/Evocation | P11, P12, P14; referenced spell families P13 | R2 |
| [P16](#p16) | Barbarian, Rogue, Monk, and their supplied subclasses | P07–P10, P14 | R2 |
| [P17](#p17) | Cleric, Druid, Paladin, Ranger and supplied subclasses | P12, P14, required P13 families | R2 |
| [P18](#p18) | Bard, Sorcerer, Warlock and supplied subclasses | P12, P14, required P13 families | R2 |
| [P19](#p19) | Feats, ASI alternatives, and optional multiclassing | P14–P18; individual feats can start earlier | R2 |
| [P20](#p20) | Explicit monster abilities and complete action coverage | P04, P07–P13 | R2 |
| [P21](#p21) | Bespoke magic-item behavior and variant reconciliation | P10, relevant P13/P20 primitives | R2 |
| [P22](#p22) | Lighting, senses, and visibility semantics | P07–P09, P12 | R2 |
| [P23](#p23) | Campaign continuity, polished UI, and accessibility audit | P06, P10, P14; final pass after P19–P22 | R2 |
| [P24](#p24) | Offline delivery, cache/version safety, performance | P03, P23; all dynamically loaded content inventoried | R2 |
| [P25](#p25) | Optional accounts, cloud vault, and permission data model | P02, P03, P05 | R3 |
| [P26](#p26) | Authoritative multiplayer and reconnect protocol | P09, P25 | R3 |
| [P27](#p27) | GM/player projections, ownership, and private assets | P22, P25, P26 | R3 |
| [P28](#p28) | Merchants and transactional shopping | P10; online authority if enabled uses P26 | Optional local/online |
| [P29](#p29) | Release qualification, operations, support, and handoff | Selected release's required phases | Every release |

Critical local path: P00 → P01 → P02 → P03 → P05 → P08/P09/P10 → P11 → P12 → content families and class integrations → P23 → P24 → P29.

P04 catalogue repair and P07 geometry can be prepared alongside compatible foundation work. P13 is a family-based work queue, not a requirement to finish all 319 spells before any class starts. Class packages declare exact spell dependencies. Online development is optional and must not delay shipping a trustworthy local release.

<a id="architecture"></a>

## 4. Target architecture and ownership boundaries

Preserve React/Vite and the existing domain implementation. Introduce boundaries incrementally; do not rewrite all screens or create a framework before the first feature slice proves it useful.

Proposed modules are illustrative destinations, not files created by this plan:

```text
src/contracts/             validated persisted and command shapes
src/domain/actions/       typed action specifications and resolution plans
src/domain/effects/       effect definitions, instances, modifiers, expiry
src/domain/progression/   advancement, class/subclass/feat grants
src/domain/spells/        spell metadata, casting policies, behavior handlers
src/domain/resources/     pools, spending, recovery, cooldown policies
src/domain/geometry/      cells, footprints, distance, cover, area membership
src/domain/visibility/    illumination, senses, observer projections
src/application/commands/ command dispatch, planning, validation, orchestration
src/application/queries/  screen-ready derived data and refusal reasons
src/storage/vault/        transactional local adapter, migrations, generations
src/storage/archive/      archive validation, export, staged restore
src/screens/hooks/        small UI lifecycle hooks extracted as needed
src/content/              generated definitions and behavior capability registry
server/                   later optional authenticated command authority
```

Domain code receives explicit state, a rules context, stable IDs, resolved choices, and a random transcript/source. It cannot read browser storage, perform network calls, open a dialog, or schedule a timer. Commands orchestrate repositories and outcomes. Queries compute projections without side effects. Views render projections and submit intent.

Keep one authoritative state snapshot plus a bounded command outcome/event journal. A full event-sourced application is not required. Events support audit, pending work, incremental delivery, and reproducible bug reports; snapshots remain the load path. Retain enough checkpoints/outcomes for reconnect and undo policy without promising arbitrary historical replay across every rules version.

### 4.1 Proposed foundational contracts

All shapes need runtime validation as well as TypeScript definitions. New strict TypeScript modules may coexist with current JavaScript. No wholesale extension rename is required.

```text
RulesContext
  editionId, rulesVersion, contentPackVersions, houseRuleProfileId

ActorRef
  kind: hero | token | companion | system
  campaignId, entityId, sceneId?; no ambiguous bare IDs across campaigns

CommandIntent
  commandId, commandType, payloadVersion, actor, principalId?
  expectedCampaignRevision, expectedEntityRevisions?
  rulesVersion, payload, clientSessionId?

CommandOutcome
  commandId, status: committed | rejected | awaiting-choice
  committedRevision?, result?, emittedEvents?, pendingResolutionId?
  rejectionCode?, message?, recovery?, retryable?
  randomTranscriptDigest?; not a secret-bearing player response

ResourcePool
  poolId, ownerRef, sourceRef, current, maximumPolicy
  recoveryPolicy, allowedSpendContexts, instanceId?

EffectInstance
  instanceId, definitionId, definitionVersion, sourceRef, targetRefs
  parameters, createdAtGameTime, durationPolicy, triggerState
  concentrationGroupId?, stackingKey, visibilityPolicy, provenance

PendingResolution
  resolutionId, commandId, phase, immutableInitialIntent
  cursor, pinnedRulesVersion, reservations, randomTranscript
  completedSteps, choicesRequested, eligibleResponders, resumePolicy

ItemInstance
  instanceId, catalogueId, contentVersion, ownerRef, location
  enchantments, charges, attunement, identification, customName?, durability?

AdvancementEntry
  entryId, characterLevel, classId, classLevel, choices, grants
  hitPointChoice, sourceVersion, committedAtGameTime?, operationId
```

Do not store mutable UI-only references, React objects, DOM positions, Dates, Maps, Sets, functions, or unbounded prose in canonical game state. Encode numbers and identifiers explicitly. Use finite integer/fixed-unit values for money, movement, time, resource counts, and normal dice definitions.

### 4.2 Command and resolution lifecycle

```text
Draft (UI only)
  → Preview (pure query, deterministic, no spend)
  → Submit stable command ID
  → Validate principal, versions, preconditions, targets, resources
  → Commit either final outcome OR durable pending resolution/reservations
  → Offer authorized choices/reaction windows
  → Resolve the next deterministic step and persist atomically
  → Complete/cancel under the action's explicit cost policy
  → Render animation and narrative from the saved result
```

No global rule says cancellation refunds everything. Cancellation before commitment usually spends nothing. Countered spells, interrupted long casts, declined reactions, cancelled targeting, and invalidated targets have distinct source-backed spend policies. Encode them on the action family and test each boundary.

Once randomness has contributed to a committed pending resolution, reconnect/retry resumes that transcript. A failure before any commit may reject and leave no visible outcome; the UI must not show an unsaved roll and then permit reroll fishing by retry. In online play, only the server supplies authoritative randomness.

### 4.3 Modifier evaluation order

Each rule returns a contribution with source, affected statistic, operation, applicability predicate, and stacking policy. Query pipeline:

1. Choose base formula or authored total.
2. Apply valid replacements and explicit formula choices.
3. Apply additive contributions that are allowed to stack.
4. Apply multipliers/caps in the source-defined order.
5. Apply advantage/disadvantage using sources, then cancel opposing modes.
6. Apply outcome-specific defenses and rounding at named stages.
7. Return total plus explainable breakdown and unused/conflicting contributions.

Do not assume all AC formulas stack, all auras add, all dice bonuses are permanent, or every critical doubles flat damage. Authored exceptional rules override a generic stage only through a tested handler. The current engine becomes an adapter and a source of characterization tests, not a second competing calculator.

<a id="phase-specifications"></a>

## 5. Phase specifications

<a id="p00"></a>

### P00 — Establish the contract, baseline, and executable work inventory

**Outcome:** everyone can identify what the release promises, what it deliberately excludes, and what evidence proves each claim.

**Entry:** this plan and the existing audit. **Primary touchpoints:** `docs/FEATURES.md`, `docs/TODO.md`, `PARITY_REGISTER.md`, tests, generators, new content capability metadata.

**Packages**

- P00.1 Record the exact working commit, test environment, supported browsers, build artifact hashes, and representative save fixtures. Use synthetic data and explicitly supplied exports; never copy unrelated user saves into tests.
- P00.2 Create a rules/house-convention ledger. Record distance/cover, swap/loot costs, ready/opportunity timing, completion, restart, exhaustion, and attack-rider choices. Classify each as source rule, intentional convention, defect, or unresolved decision.
- P00.3 Create a content capability manifest per record and per mechanical behavior. Required fields: stable ID, content version/source hash, owner phase, behavior family, implemented operations, manual narrative requirements, prerequisites, tests, and status.
- P00.4 Correct misleading documentation: current test counts; active screenshot coverage; storage scope; monster command input; limits of `checkJs: false`; and purity claims. Do not weaken a verifier merely to make the gate green.
- P00.5 Restore genuine visual comparisons for a small, approved baseline of Library, Forge, Hero creation, Table Setup, Battle, reaction, recovery, and import. Review screenshots once under pinned fonts/browser/OS; retain layout checks separately.
- P00.6 Establish a selective strict-checking project for new contracts/domain slices. Characterize affected legacy functions before adapting them.

**Acceptance:** every selected release requirement maps to a phase and test; reference-only records cannot be marked implemented; old docs no longer claim screenshot coverage that does not run; baseline defects are reproduced with failing focused tests before their fixes.

**Failure/rollout:** documentation and test-only changes do not mutate saves. Preserve historical evidence with an explicit archived status, rather than deleting the explanation of past failures. No broad full-suite reruns are required for every wording change.

<a id="p01"></a>

### P01 — Deliver urgent safety and correctness fixes

**Outcome:** the present architecture stops damaging recoverable assets, sharing preview data unexpectedly, partially awarding XP, and miscounting basic recovery.

**Entry:** P00's invariant/defect contracts. **Files:** storage constants/runtime, state and entity repositories, application commands, rest/items, catalogue generator, matching regression tests.

**Packages**

- P01.1 Add explicit load classifications: healthy-primary, valid-backup, truly-empty, unsupported-version, damaged-unrecoverable, storage-unavailable. Preserve diagnostics through application state. `truly-empty` requires absence, not invalidity, of durable records.
- P01.2 Inhibit artwork deletion whenever reachable references are uncertain. Compute retention from primary, retained backup, staged operations, and pending recovery; make cleanup idempotent and postponable. Test corruption, incompatible versions, backup-only recovery, interrupted upload, and concurrent staging. Do not delete on initialization merely because the current scene list is empty.
- P01.3 Preserve existing production identifiers. Introduce an explicit runtime environment configuration for preview and test keys/database names, with no implicit fallback to production. Extend the same identity to future locks/channels/caches. Inspect built artifacts to prove namespace differences. Offer an explicit copy/import of existing data into preview instead of silently moving it.
- P01.4 Replace per-Hero XP writes with one repository-level `awardEncounterExperience` envelope transformation. Recompute eligible recipients from the completed encounter inside the operation; reject client-supplied totals as authority. Deduplicate Hero IDs, define duplicate snapshot eligibility, use an encounter-instance award ID, update all XP and the flag in the same save. Restart creates a new encounter-instance identity; retrying one completed encounter cannot create another award.
- P01.5 Correct long-rest Hit Dice recovery using the declared 2014 rule. Split long-rest and daily/dawn recovery; preserve recharge quantity expressions; normalize paragraph-spanning text. Add a GM-controlled daily-reset action rather than pretending every long rest crosses dawn.
- P01.6 Until P03 supplies cross-tab transactional writes, prevent an unconditional concurrency guarantee: use a compatible-writer lock when available, expose conflicts, and advise closing obsolete clients for the safety rollout. A lock cannot protect against old builds that do not acquire it.

**Mandatory acceptance cases**

- T01-A Both JSON copies corrupt + two map blobs: raw strings and both blobs survive startup and retry.
- T01-B Healthy zero-scene vault does not delete a currently staged upload; the later verified orphan sweep deletes only an actually unreferenced asset.
- T01-C Preview create/delete leaves production state, backup, portraits, and map assets unchanged.
- T01-D Two-recipient 50-XP award: failures before commit leave 0/0; success leaves 50/50; retry remains 50/50. Failure after durable commit but before acknowledgment returns the committed award on retry.
- T01-E Level 3, three spent dice: one recovered. Level 1 minimum, no spent dice, partially spent pool, and maximum-level bounds are covered.
- T01-F Helm recharge parsing survives paragraph boundaries; Cubic Gate uses the specified roll at the explicit daily reset and never refills simply because a short rest occurred.

**Rollout:** full-safety lane. Ship these repairs before the larger refactor. Preserve production schema version 1. Document that namespace isolation affects preview, not the location of current production saves. Roll back code only to a build that retains the safety changes.

<a id="p02"></a>

### P02 — Portable archives and a recovery workbench

**Outcome:** a user can preserve and restore a complete campaign on another browser or machine, including images and unfinished encounters.

**Entry:** P01. **Proposed paths:** `storage/archive/`, `application/backupCommands`, a Backup/Recovery screen, reusable progress and validation components.

**Archive contract**

One `.nightforge` archive, with a documented ZIP container and UTF-8 manifest:

```text
manifest.json: format/version, creator build, rules/content versions,
              exported generation/revision, counts, timestamps, asset hashes,
              required reader capabilities, record hashes, optional diagnostics
state.json: canonical logical campaign data, no browser-specific object URLs
assets/<sha256>.<validated-extension>: map/portrait blobs
content/custom.json: explicitly exportable custom definitions where required
```

IDs in `state.json` reference logical asset identities. External HTTP URLs and local filesystem paths are not trusted restoration sources. Hashes detect corruption, not authorship. No access tokens, server credentials, invite secrets, or private data from other campaigns enter the archive.

**Packages**

- P02.1 Build a stable export reader for the present storage backend. Capture revision plus asset references, read blobs, then recheck revision. Retry a bounded number of times or offer a brief exclusive compatible-writer export window; do not produce a mixed snapshot. Missing assets are named in a visible report, and a degraded export is explicitly labeled.
- P02.2 Select and pin an archive library after measuring browser support, streaming, decompression limits, and memory. No dependency is selected merely by this plan. Export via worker when warranted; show bytes/items progress and cancellation.
- P02.3 Validate file extension, magic bytes, manifest version, counts, canonical paths, total expanded bytes, compression ratio, duplicate entries, duplicate IDs, hashes, object types, references, image dimensions, and nesting bounds before activation. Reject traversal paths and malformed executable/custom rule payloads.
- P02.4 Provide import preview: campaigns/scenes/Heroes/assets, content compatibility, collisions, conflicts, warnings, and required storage estimate. Defaults: import as a new isolated collection; replace only after a reviewable backup/rollback checkpoint. Merge rewrites all IDs and references using a documented map.
- P02.5 Stage blobs under new IDs and journal the import. On the existing backend, commit a single final state-envelope reference switch only after assets validate; never overwrite active blobs in place. A crash before activation leaves the old state; a crash after activation is recognized from the committed import ID. P03 later places state and asset references within a transactional generation model.
- P02.6 Add recovery choices: inspect diagnostics, export damaged raw evidence and available blobs, choose a valid backup, open a separate clean collection, or retry storage access. No "start fresh" action implicitly overwrites recovery evidence.
- P02.7 Ship format documentation and a small round-trip fixture with active reaction, thrown item, portrait, unknown content entry, and Unicode names.

**Acceptance:** cross-browser round-trip preserves semantic state and binary hashes; cancellation changes nothing active; interrupted export/import is recoverable; missing blobs are explicit; duplicate import can be identified; unknown future format is rejected safely; user sees a saved/downloaded artifact before replacement proceeds. Restore never depends on a preview origin or original machine path.

**Rollout:** export first, then import-as-new, then reviewed merge/replace. Replacement is enabled only once recovery from every journal state is tested. Backup date in UI represents a successfully completed archive, not the time the export button was clicked.

<a id="p03"></a>

### P03 — Transactional local vault and compatibility boundary

**Outcome:** atomic state/resource/asset-reference commits and a safe base for durable pending actions and offline/cloud queues.

**Entry:** P02 export/restore works. **Decision:** use IndexedDB for transactional structured state as well as local blob storage. Preserve LocalStorage v1 as migration input; do not casually bump its schema constant.

**Proposed database stores:** vaultMetadata, campaignSnapshots, assetMetadata, assetBlobs, commandOutcomes, pendingResolutions, importJobs, migrationJobs, and later cloudOutbox. Keep all stores required for one local atomic operation in the same database. Separate databases do not share an IndexedDB transaction.

**Packages**

- P03.1 Introduce an asynchronous repository interface and adapt one read-only screen, then scene identity, then Hero saves, then battle commands. Await every caller; replace `result.ok` assumptions on unresolved promises. Preserve App's revision tracking and draft-flush behavior with async navigation guards.
- P03.2 Add generation IDs and an active-generation pointer. Build and validate a new generation before activation. Introduce the minimum campaign aggregate now: stable campaign identity, scene/roster membership, and rules/content pins, with existing data in a default campaign. P08 adds time semantics; P23 completes multi-campaign management and reconciliation UI. State snapshots reference immutable/deduplicated blobs plus stable asset metadata. Blob retention includes active, backup, staged, and pinned export generations.
- P03.3 Implement revision-checked transactions that atomically update the snapshot, command result, pending resolution, and references. Perform decoding, compression, hashing, and network work before opening the write transaction; only transaction requests occur while it is active. Await transaction completion, not just individual request success. [IndexedDB transaction guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).
- P03.4 Use Web Locks for compatible-tab coordination of long operations where supported; correctness still comes from database transactions/revision checks. Use BroadcastChannel as invalidation/notification, never as the durable record. A fallback cannot falsely claim mutually exclusive writes. [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
- P03.5 Migrate by export checkpoint → read/fingerprint legacy state and blobs → stage new database → semantic validation → commit active vault marker. Do not modify/delete the legacy source during migration. On restart resume or discard only the inactive staged generation.
- P03.6 Address old clients explicitly: they cannot honor a new minimum-writer flag they do not understand. The new vault uses a new storage boundary; old clients may continue writing legacy data, but the new app never automatically reimports or dual-writes it. Detect changed legacy fingerprints and offer a reviewed import, not silent overwrite. New clients enforce minimumReader/minimumWriter and content capabilities.
- P03.7 Preserve unknown extension data and incompatible content in quarantined records. A known validator failure is not permission to normalize a record to an empty inventory or zero effects. Define strict trusted writers and loss-aware readers separately.
- P03.8 Add versionchange/blocked-upgrade handling, quota reporting, storage estimate/persistence request UI, startup repair diagnostics, and retry limits. Browser eviction remains possible; portable backups remain necessary.

**Acceptance:** atomic transaction abort restores all logical state; reload resumes a staged migration; old-v1 data survives; old/new tabs cannot silently overwrite one another's canonical vault; opening an unsupported future vault is read-only/recovery; asset collection respects retained generations; no full-state writes on pointermove.

**Rollout:** preview namespace first, then production opt-in migration with export, then default for new vaults. Never deploy a rollback build that cannot read the activated vault. Keep a recovery-capable forward-fix build; downconversion is an explicit documented export transformation or unavailable, never automatic data stripping.

<a id="p04"></a>

### P04 — Correct the content pipeline and repair monster imports

**Outcome:** every source record is accounted for, numeric stat-block facts survive import, and skipped mechanics stay visible.

**Entry:** P00 manifest. Existing-token repair requires P03. **Files:** both current generators, catalogue manifests, `domain/table.js`, monster browser and inspector, new generator contract tests.

**Packages**

- P04.1 Add canonical generated metadata: edition, source dataset/hash, source record ID, definition version, parser version, generated capability status, and explicit warnings. Same input must produce byte-stable output independent of time or object ordering.
- P04.2 Preserve authored save totals, skill totals, passive senses, attack bonuses, and relevant expertise. Implement precedence: explicit GM override → authored monster total → supported derived value. Hero formulas remain independent. Preserve zero and negative values without truthy fallback bugs.
- P04.3 Parse nested attack damage alternatives into named variants. Keep melee and thrown/ranged modes distinct for a weapon that supports both; do not select the ranged sentence and erase its melee use. Preserve damage riders as typed parts with their own applicability.
- P04.4 Account for every action as implemented, explicitly assisted, or reference-only with reason. Unsupported finite-attack-bonus actions must remain in reference actions. Compare all source records to output, including the 20 previously dropped entries.
- P04.5 Repair new monster tokens immediately. For existing tokens, distinguish pristine imported fields, user overrides, and unresolvable historical provenance. Offer a preview diff for applying refreshed authored stats/attacks; never overwrite customized monsters automatically. Store `sourceSnapshotVersion` and overrides going forward.
- P04.6 Generate spell/class/feature/feat/item definition manifests from explicit input paths. Reconcile feature variants and parent/child magic items before asserting counts. Unknown mechanics fail capability completeness, not compilation of already supported unrelated content.
- P04.7 Add a content coverage report: source count, emitted count, variants, missing relations, exact modifier mismatches, and behavior status. CI requires zero unexplained losses and zero unexplained numeric mismatches.

**Acceptance:** all 262 save and 393 skill discrepancies are eliminated or individually documented source corrections; Adult Red Dragon CON +13 and passive Perception 23; Guard Spear and Druid Quarterstaff retain alternatives; editing a monster override survives reload and a catalogue update; every spell/class reference resolves; generated-data changes are reviewed as content diffs.

**Rollout:** regenerate from supplied local inputs, review output/manifest, then ship. Existing active encounters retain pinned snapshots until the GM accepts a repair; fixing the catalogue must not mutate a fight under the user's cursor.

**Implementation record (2026-09-06):** the current working tree implements the
P04 content slice. Monster generation emits all 334 supplied source records with
edition/hash/parser metadata, authored totals, nested damage alternatives,
capability statuses, and source-refresh diffs that preserve GM overrides. The
explicit-input content manifest emits 1,350 records with zero unresolved parent
or variant relationships. `npm run verify:content` is the coverage gate; future
unsupported rules remain marked assisted or reference-only.

<a id="p05"></a>

### P05 — Typed commands and deterministic rule resolution

**Outcome:** one durable application boundary for current and future actions, with idempotency and visible refusal reasons.

**Entry:** P03/P04. **Files:** application commands/runtime/state, current combat/check/attack modules, controller; proposed contracts/actions/query modules.

**Packages**

- P05.1 Define validated command/result schemas and typed actor/resource refs. Start with move, attack, HP adjustment, and XP, retaining adapters around existing tested functions.
- P05.2 Add an atomic command inbox/outcome transaction. Store command ID and payload hash; same ID with a different payload is rejected. Define durable outcome retention: never prune IDs for still-retryable encounters/imports/financial transfers; compact old outcomes behind a snapshot/epoch and reject obsolete command epochs.
- P05.3 Separate preview/eligibility from resolution. Queries return allowed targets, costs, requirements, and explanation. Commit revalidates after any other command changes the world.
- P05.4 Introduce a random transcript: roll kind, sides, draw order, selected/discarded dice, reroll source, and committed result. IDs/clocks/randomness are injected. An internal action adapter cannot independently call Math.random after a transcript exists.
- P05.5 Return ordered domain events plus next state. Use explicit action lifecycle state, not regex inspection of encounter log strings. Keep the human log as a derived readable projection.
- P05.6 Establish resource reservation/spend/release contracts and command cancellation policies. Defer full recharge/item-instance modeling to P10, but stop each feature inventing its own boolean spend path.
- P05.7 Extract controller hooks only along proven seams: camera/selection, targeting drafts, durable resolution presentation, and managed dialogs. Rules-pending state moves to persistence, not another React hook.

**Acceptance:** identical intent/state/transcript/version yields identical outcome; stale revision refuses with a useful retry path; duplicate command has no additional effects; pagehide/reload during a pending action preserves its identity; presentation skip never changes the result; current attack/movement regression journeys remain unchanged.

**Rollout:** one command family at a time behind adapters. Strictly type new contracts and touched modules. Remove a legacy pathway only after its callers and characterization tests use the new boundary. Avoid maintaining two independent engines that can both mutate the same encounter.

**Implementation record (2026-09-06):** the current working tree implements the
validated command/result boundary for move, attack, hit-point, XP, and check
commands, including revision checks, payload hashes, durable bounded outcomes,
duplicate/conflict handling, ordered events, preview dispatch, and random
transcripts. The existing controller paths remain adapters while the broader
resource reservation and full command migration continue in their planned
phases.

<a id="p06"></a>

### P06 — Exploration checks and first-use character flow

**Outcome:** useful dice/check workflows outside initiative and a clear path from a new Hero to a playable character.

**Entry:** P05. **Files:** `domain/checks.js`, Hero/Play inspectors, checks cinematic, navigation; proposed roll query/panel and creation checklist.

**Packages**

- P06.1 Replace the unconditional active-Battle guard with a typed context: encounter-token, scene-token, or roster-Hero. Keep combat-specific costs/conditions scoped to combat. Roster rolls use the roster, not an arbitrary existing snapshot.
- P06.2 Support ability/skill/save rolls with optional DC, advantage/disadvantage, named situational modifiers, and source breakdown. A supplied DC produces pass/fail; an absent DC produces a total without inventing success.
- P06.3 Persist a bounded campaign/scene roll log outside encounters. Distinguish private GM rolls and public results in the shape now; offline local mode can show both to the sole operator.
- P06.4 Move name/class/race/abilities into the initial creation working area. Show an incomplete-character checklist, derived totals, owned-equipment selection, and automatic saving status without forbidding intentional GM overrides.
- P06.5 Mark unimplemented class mechanics honestly until their phases ship. Add jump links/sticky section navigation; do not force users to traverse a long Recovery section before changing identity.
- P06.6 Provide keyboard entry, cancellation, focus restoration, empty/loading/error states, and reduced-motion results. Keep roster-snapshot explanations at import and at attempts to rest/edit a placed Hero.

**Acceptance:** roll Perception on a Play scene without starting Battle; roll a roster Hero save while no scene exists; no initiative/action state is created; active encounter rolls remain resource-neutral where intended; a keyboard user creates and equips a Hero without hidden essential steps; failed autosave prevents a misleading saved indicator.

**Rollout:** deliver independently of spellcasting. This is an early user-visible improvement after the reliability foundation, not a reason to wait for the entire class catalogue.

**Implementation record (2026-09-06):** Play scene tokens and roster Heroes now
support typed ability, skill, and save checks with optional DC, advantage or
disadvantage, and modifier-source explanations. Campaign/scene rolls persist to
a bounded public/private log without creating initiative or resource state.
Hero creation includes an incomplete-character checklist, sticky section links,
equipment visibility, honest class-mechanics notes, and autosave feedback. The
focused phase tests and 30-browser-test acceptance run pass.

<a id="p07"></a>

### P07 — Board dimensions, footprints, and targeting geometry

**Outcome:** one geometry service supports current movement, larger maps, differently sized creatures, and future spell templates.

**Entry:** P04/P05. **Files:** `domain/table.js`, `combat.js`, `attacks.js`, Scene settings, map layers; proposed geometry modules.

**Packages**

- P07.1 Add `board { columns, rows, feetPerCell, distancePolicy, geometryVersion }`. Default old scenes to 20×12, five feet, existing diagonal convention. Distinguish board dimensions, rendered cell size, camera zoom, and image scale in both data and labels.
- P07.2 Introduce canonical cell/fraction coordinates; retain an adapter for current percentage positions and wall endpoints. Convert against each scene's original dimensions. Do not snap free wall endpoints or move artwork while migrating. Before/after fixture screenshots and distances must agree.
- P07.3 Define footprints per creature size and an explicit anchor. Movement/range/adjacency measure from occupied spaces under the chosen policy, not always center-to-center. Make a large creature's collision mask match its visible footprint. Source exceptions such as reach remain action-specific.
- P07.4 Define resize preview: expanding preserves world coordinates; shrinking identifies off-board objects, walls, terrain, zones, and pending targets. Default refusal until the user chooses a reviewed relocation/crop action. Never silently delete outside objects.
- P07.5 Centralize line of effect, cover, distance, movement blockers, teleport destination eligibility, and shape membership. Shapes: point, line, cone, circle/radius, rectangle/cube footprint. Persist exact origin/orientation/size and inclusion policy. Height-dependent judgments remain GM decisions on a flat board.
- P07.6 Return target candidates and included cells from pure queries. Show inclusive/exclusive boundary cells, self exclusion, ally inclusion, and invalid targets before commit. Add a reviewed target override for exceptional adjudication, with event provenance.
- P07.7 Use spatial indexes and visible-region rendering instead of one DOM node per cell. Candidate design ceiling: 200×200 cells, with measured supported limits lowered if required. Bound pathfinding separately; a search-budget refusal must be explicit, never called an impassable route without proof.

**Acceptance:** old maps render/measure identically; Large/Huge creatures cannot pass through insufficient space; resizing preserves tokens/assets; area preview and committed target set match at the same revision; wall endpoints at boundaries and diagonal corners have deterministic outcomes; 200×200 configured scenes do not create 40,000 interactive cell elements; a keyboard user can place/rotate/confirm a template.

**Rollout:** board metadata/adapter first, footprints next, templates last. Existing encounters pin geometry policy. Do not change diagonal or cover conventions as an incidental refactor.

**Implementation record (2026-09-06):** the core P07 geometry contract is now
implemented in [`src/domain/geometry.js`](../src/domain/geometry.js): old scenes
normalize to a 20×12 board, custom dimensions and feet-per-cell are persisted,
percentage positions convert through canonical cells, Large through Gargantuan
footprints participate in collision and distance queries, line-of-effect and
shape queries return deterministic cells/candidates/reasons, and board shrink
operations refuse until relocation or crop is explicit. Scene settings expose
columns, rows, feet per cell, and rendered cell size separately, while the map
renders footprint-sized tokens. The focused gate covers resize refusal/crop,
wall intersection, custom boards, and target queries. Keyboard template
rotation and a spatial index remain future work under the rollout above.

<a id="p08"></a>

### P08 — Effects, modifier provenance, and game time

**Outcome:** lasting mechanics can be applied, explained, saved, expired, and removed without corrupting base statistics.

**Entry:** P05. **Files:** conditions, Hero/token derivation, encounter transitions; proposed effects/resources/time contracts and inspector.

**Packages**

- P08.1 Create trusted effect definitions and serializable instances. Definition operations are validated, bounded primitives such as grant-condition, modify-stat, grant-sense, replace-formula, create-zone, or provide-roll-choice. Custom JSON cannot contain executable JavaScript.
- P08.2 Give each applied condition source its own identity. Derive a visible condition chip from active sources. Removing a spell effect does not erase the GM's independently applied condition; immunity is checked at application under the rule's policy.
- P08.3 Define duration types: permanent, explicit end, elapsed game-time, caster-turn boundary, target-turn boundary, round boundary, while-source-valid, and condition/event termination. Legacy `conditionExpiries` migrate as legacy-round duration, retaining previous behavior until edited.
- P08.4 Add monotonic boundary/event IDs alongside round and active index. Initiative reroll/reorder must not accidentally expire or reset effects. Record whether "next turn" means the next not-yet-observed eligible boundary, including when an effect was created during the target's current turn.
- P08.5 Add a campaign clock advanced by explicit GM commands. A combat round contributes six seconds under the pinned edition; rest/ritual/travel advancement is explicit. Browser suspension and daylight-saving changes do not advance game time. Define scene-local paused time versus campaign time for simultaneous scenes.
- P08.6 Implement stacking policies: independent, strongest, exclusive-group, refresh-same-source, replace-by-source, and suspended-but-retained. Preserve overlapping source instances so ending the strongest can reveal a still-valid weaker effect.
- P08.7 Build the stat explanation pipeline, showing base and named contributions. Support formula choices for AC without adding mutually exclusive formulas. Every grant has a provenance ID used by respec, inventory unequip, concentration, and form changes.
- P08.8 Add explicit GM apply/end/suspend/adjust-duration commands and an effect inspector. Pin definition versions so an update cannot change an ongoing effect's meaning.

**Acceptance:** two independent sources of the same condition survive removal of one; time advancement expires exactly the intended instances; initiative reroll changes no resource/effect boundary already processed; round wrap, zero-duration refusal, and source deletion are deterministic; reload preserves expiry state and suspended effects; derived totals cannot drift after apply/remove cycles.

**Rollout:** migrate manual conditions first, then one modifier effect, then time and zones. Never retrofit all old booleans at once; adapters have a named removal milestone and a single source of truth.

**Implementation record (2026-09-06):** trusted serializable effect definitions,
source-aware condition chips, pinned definition versions, duration boundaries,
stacking policies, effect suspension/removal/adjustment, provenance explanations,
legacy condition-expiry adaptation, and the explicit campaign clock are now in
[`src/domain/effects.js`](../src/domain/effects.js) and
[`src/domain/time.js`](../src/domain/time.js). Normalized Scene and token records
retain the new state, and combat turn boundaries carry monotonic IDs. The focused
gate verifies executable values are discarded, independent sources survive
removal, expiry is exact, and six seconds are added per explicit combat round.
Full inspector presentation and zone/teleport consumers remain staged for the
later spell and visibility phases.

<a id="p09"></a>

### P09 — Durable triggers, choices, and reactions

**Outcome:** opportunity attacks, Ready, defensive reactions, triggered features, and later legendary actions share one resumable scheduler.

**Entry:** P05/P08, P07 for spatial events. **Files:** controller reaction state, attacks/combat/encounter, command bar; proposed resolution scheduler.

**Packages**

- P09.1 Define event types and timing windows: action-declared, target-selected, attack-roll-known, before-hit-finalized, before-damage, damage-applied, movement-boundary, save-resolved, turn-start/end, round-start/end, and game-time-advanced. A handler declares exactly which window it can observe and alter.
- P09.2 Port existing opportunity/Ready queues into `PendingResolution`. Persist mover path/cursor, departure space, reservations, responder list, used reactions, and outcome before showing a choice. Preserve legal existing departure-square behavior.
- P09.3 Define stable ordering using source rule priorities, current initiative ordering snapshot, and explicit GM choice for genuinely ambiguous simultaneous events. Do not let object iteration order settle rules.
- P09.4 Support nested reactions with a stack of resolution frames and parent links. A countered spell does not proceed to damage; a declined reaction advances without resource cost; an invalidated response explains why.
- P09.5 Prevent trigger recursion with an event/handler/target deduplication key, maximum nesting depth, maximum processed triggers per command, and a diagnostic adjudication pause. These are operational bounds, not permission to drop a valid effect invisibly.
- P09.6 Distinguish resource ownership from active turn resources. Reactions belong to actors, not the current creature's action record. Source-specific exceptions use explicit additional pools rather than pretending every actor can react multiple times.
- P09.7 Add a durable reaction prompt UI: eligible actor, trigger, consequence, cost, accept/decline, keyboard path, and resume state. Local mode waits for GM; online default never treats a network timeout as consent to spend a resource.

**Acceptance:** reload at every scheduler state resumes exactly once; two opportunity attacks can resolve sequentially; an incapacitated mover does not continue; Shield can alter the relevant hit before damage; Counterspell can prevent resolution; a lost acknowledgment cannot duplicate a reaction; log/animation strings are not parsed to discover triggers.

**Rollout:** migrate opportunity attacks first, then Ready, then new spell/feature reactions. Do not ship a second React-owned reaction queue in parallel with durable reactions.

**Implementation record (2026-09-06):** the durable frame contract is now in
[`src/domain/resolutionScheduler.js`](../src/domain/resolutionScheduler.js).
Pending resolutions have typed windows, stable priority/initiative/sequence
ordering, parent links, mover departure/path fields, reservations, responder
and reaction ownership, deduplication keys, resumable cursors, and explicit
depth/event limits. Encounter and archive normalization preserve these frames,
and opportunity/Ready records receive stable resolution identities. The table
controller now writes and rehydrates those opportunity/Ready entries through
`PendingResolution`, preserving the reaction queue, movement cursor, and
departure square across saves and reloads. The remaining P09 slice is the full
prompt semantics and nested frame runner for Shield/Counterspell and later
reaction consumers.

<a id="p10"></a>

### P10 — Resource lifecycle, physical item identity, and rests

**Outcome:** slots, class pools, charges, consumables, equipment, and recovery use shared, auditable state.

**Entry:** P03/P05/P08. **Files:** items, rest, records, token snapshots, equipment/loot UI, proposed resource and inventory modules.

**Packages**

- P10.1 Implement pool operations: quote spend, reserve, commit spend, release reservation, recover by amount/formula, set maximum, and GM adjustment. For each source decide whether a maximum change preserves spent amount or remaining amount; no universal refill-on-level-up shortcut.
- P10.2 Create typed recovery events: short rest, long rest, daily dawn, explicit calendar interval, encounter/turn start, and source-specific recharge roll. Recovery stores the last processed event ID so retries do not refill twice. Repeated long rests without a qualifying game-time event do not provide free repeated recovery when the rules prohibit it.
- P10.3 Migrate fungible stacks versus durable instances. Charge-bearing, independently enchanted, attuned, or identified objects need instance IDs. Current item-ID keyed state with quantity >1 is ambiguous: show the distribution choice, preserve original totals/metadata, and do not manufacture a full charge pool for every copy automatically.
- P10.4 Define single ownership/location across Hero/token inventory, chest, ground, embedded carrier, merchant stock, and destroyed state. Transfers update both ends atomically. Split/merge only fungible stacks with compatible attributes; bound quantities and avoid number overflow.
- P10.5 Tie attunement to item instances and actor. Ownership change, death, range separation, class eligibility, and rest time use verified source rules or explicit GM actions. Do not equate attuning with instantly wearing an item.
- P10.6 Complete short/long-rest workflow: actor selection, hit-die choice by class, rolls, interrupted-rest policy, qualifications, timeline change, and item/class recovery. Show a preview and a committed breakdown. Use manual GM override for elapsed-story judgments, recorded with reason.
- P10.7 Update loot, potions, throwing, ammunition, enchantment UI, and snapshots to preserve instance identity. Historical catalogue-ID transfers remain adapters until converted.

**Acceptance:** two differently enchanted swords stay different through throw/retrieve/loot/export; two identical charged items do not share one counter; zero charges and final-charge consequences are explicit; failed transfer spends/depletes neither side; no negative balances; rest cannot duplicate charges on retry; a mixed-class hit-die pool recovers/spends correctly after P19.

**Rollout:** introduce identity for new items, preview migration for old ambiguous holdings, then retire legacy loadout references. Export must round-trip both during transition. No forced inventory conversion without a recovery checkpoint.

**Implementation record (2026-09-06):** shared pool and recovery contracts now
live in [`src/domain/resources.js`](../src/domain/resources.js), with
quote/reserve/commit/release/recover/set-maximum/GM-adjust operations that keep
balances non-negative and recovery event IDs idempotent. Durable stack/instance
ownership, atomic transfer, split/merge, attunement, charge spending, and
per-instance recharge live in [`src/domain/itemInstances.js`](../src/domain/itemInstances.js).
Hero and token records retain ledgers and instance arrays, while old quantity
inventories remain available through an explicit materialization adapter. Short,
long, and dawn recovery can record a stable event for retry-safe application.
The domain now exposes a typed rest preview and one-time commit path; the full
rest preview/commit UI and automatic migration of every historical inventory
are still staged. The focused gate covers the shared contracts, preview commit,
and reload normalization.

<a id="p11"></a>

### P11 — Spellcasting framework and complete first slices

**Outcome:** a character can prepare/know, target, pay for, cast, and inspect a spell through the same action engine used by other abilities.

**Entry:** P04/P07/P08/P09/P10. **Files:** generated spell metadata, new spell modules, Hero spell chapter, command bar, target/effect UI.

**Definition contract:** spell ID/version, level/school, permitted lists, learning/preparation policy reference, casting-time policy, components, target/area policy, duration, concentration flag, resolution handler, upcast policy, resource alternatives, narrative responsibilities, and tested capability status.

**Packages**

- P11.1 Generate all 319 definitions as metadata with a capability manifest. Do not convert prose into executable handlers automatically. Preserve source IDs and source hashes; render unavailable mechanics honestly.
- P11.2 Model known spells, prepared spells, spellbook ownership, always-prepared grants, cantrips, spellcasting ability, save DC, attack bonus, and source-specific casting permission. Slots are distinct from access to spells. Monster innate casting and item casting are alternative sources using the same action contract.
- P11.3 Validate casting time, current action/bonus/reaction availability, verbal/somatic/material requirements, armour proficiency, focus substitutions, costly/consumed components, target eligibility, and selected slot or alternative pool. Long casting is persistent progress with source-specific interruption/spend behavior, not a long UI timeout.
- P11.4 Encode edition-specific spell restrictions as named predicates. Do not reduce the 2014 bonus-action restriction to a generic "one leveled spell per turn" flag. Test combinations before and after Action Surge, reactions on different turns, and ritual casting using source rules. [2014 spellcasting reference](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting).
- P11.5 Add a casting workspace showing effect, target(s), range/cover, selected resource, components, upcast difference, and expected pending decisions. Confirm commits the intent; cancellation before commitment spends nothing. Changed targets/resources require revalidation.
- P11.6 Deliver vertical slices: Fire Bolt (spell attack/cantrip scaling); Cure Wounds (touch healing); Magic Missile (allocated automatic damage and defensive interaction); Burning Hands (area save); Shield (reaction window). Concentration-tagged spells stay unavailable for mechanical casting until P12, rather than silently omitting concentration.
- P11.7 Record actual rolls/targets/components/spend/events, then animate saved outcomes. Cross-scene or noncombat casts use game-time and actor context without requiring fake initiative.

**Acceptance:** legal first spells execute fully; invalid targets spend nothing; retry never spends twice; upcast affects the correct quantities; dead/ineligible targets receive explicit refusal; somatic/material hand cases are distinguished; failed save/half damage and natural attack crit handling use their correct families; a Wizard spellbook edit does not silently change a snapshot in battle.

**Rollout:** catalog browsing and preparation first, then individually completed spell handlers. Label exact supported operations; do not enable a cast button on metadata-only records.

<a id="p12"></a>

### P12 — Concentration and universal interruption

**Outcome:** concentration remains correct regardless of which action, damage source, reload, or manual adjustment caused the change.

**Entry:** P09/P10/P11. **Files:** effects, damage pipeline, checks, death/incapacity, turn resolution, Hero/token inspector.

**Packages**

- P12.1 Store one active concentration group per actor, referencing all dependent effects, zones, summons, and ongoing casting as required. Replacement is an explicit casting transition; targeting preview alone cannot end the existing effect.
- P12.2 Route every damage source through a shared finalized damage packet: attacks, manual typed/untyped damage, area spells, hazards applied by GM, item abilities, and ongoing effects. Use post-mitigation damage for the rule's DC, not merely the capped HP decrement; temporary HP absorption does not make the creature immune to a required concentration check.
- P12.3 Name packet grouping rules. Multiple damage types from one resolved hit and separately resolved hits are distinct concepts; multi-projectile spell behavior is source-reviewed per handler, not guessed by event batching. Keep packet identity in the journal.
- P12.4 Create the concentration save window at the correct resolution stage with applicable modifiers, advantage, rerolls, and automatic failure/end rules. Incapacity/death or explicit ending may remove concentration without an ordinary save. Never prompt on an effect already ended by that transition.
- P12.5 End all dependent effects through one cleanup operation with explicit exceptions defined on the effect. Removing a zone cleans its memberships but not unrelated manual conditions. A failed save ends the group once even after reload.
- P12.6 Support manual end, out-of-combat duration expiry, changing scenes, token deletion, summons leaving play, and invalid references. A missing source becomes a diagnostic recovery operation, not an endless crash during normalization.

**Acceptance:** Bless survives a successful check and ends after failure; new concentration replaces the old group at commitment; zero damage does not generate an ordinary damage check; temporary HP cases are tested; multi-hit damage produces the intended count; two casters' overlapping effects remain independent; reload at the check prompt gives the same pending choice/roll; death ends dependent effects without duplicate prompts.

**Rollout:** enable one concentration spell after all damage-entry paths conform. Add a verifier over the damage API boundary and behavioral tests; a source-text search for the word "concentration" is not sufficient.

<a id="p13"></a>

### P13 — Complete the spell catalogue by behavior family

**Outcome:** all 319 supplied spell records have complete mechanical behavior or an explicitly designed narrative interaction for their irreducibly adjudicated parts.

**Entry:** P11/P12. **Owner model:** one issue per spell with child tasks per unsupported behavior; shared primitives are implemented once. Appendix B inventories the supplied spell IDs. Each issue contains source excerpts/references, exact target/cost/timing rules, handler mapping, negative cases, UI, persistence, and interaction tests.

**Family work packages**

| Package | Mechanics to implement | Representative integration fixtures |
|---|---|---|
| P13.1 Direct attack/save/heal | Per-target attacks, shared versus separate damage rolls, upcast, type/size restrictions, immunity, healing restrictions | Fire Bolt, Acid Splash, Cure Wounds, Healing Word, Fireball |
| P13.2 Modifiers/conditions | Conditional bonuses, repeated saves, end-on-damage/hostility, stacking/source cleanup | Bless, Bane, Hold Person, Faerie Fire |
| P13.3 Allocation and exceptions | HP-budget target ordering, multiple projectiles, image decoys, defense bypass/interaction | Sleep, Magic Missile, Mirror Image |
| P13.4 Persistent zones | Entry/start/end triggers, movement-attached areas, once-per-turn eligibility, changing membership | Spirit Guardians, Moonbeam, Spike Growth |
| P13.5 Defensive/counter magic | Timing windows, range/visibility, cast level comparisons, ability checks, dispel targets/effect groups | Shield, Counterspell, Dispel Magic |
| P13.6 Movement/terrain/objects | Teleport, difficult terrain, barriers, forced movement, climb/fly grants, collision-aware objects | Misty Step, Fly, Web, Wall of Force |
| P13.7 Summons/companions | Spawn limits, ownership/control, initiative policy, stat-source snapshots, disappearance and cleanup | Find Familiar, Conjure Animals, Animate Dead |
| P13.8 Transformation | Original-form snapshot, replaced versus retained stats, equipment disposition, alternate HP, overflow/reversion | Polymorph, Shapechange; shared with Wild Shape |
| P13.9 Information/social/utility | Explicit query/GM-response workflow, durations, targets, resources, privacy, no invented world facts | Identify, Detect Magic, Comprehend Languages, Speak with Dead |
| P13.10 Long-duration/restoration | Consumed components, elapsed game time, return-to-life eligibility, persistent world changes | Revivify, Raise Dead, Greater Restoration |
| P13.11 Open-ended/exceptional | Reviewed branch selection, explicit GM adjudication, recorded consequences; no pretending arbitrary reality changes are deterministic | Wish and other manifest-classified exceptions |

Representative names are a work-family guide; the manifest of source records is the completion denominator. Every unlisted spell is assigned by reading its mechanics, not by school/name matching. A spell can depend on multiple families.

**Per-spell required deliverable**

- A behavior matrix covering target types, range, area, sight/line of effect, concentration/duration, components, action costs, resource choices, dice, saves, defenses, scaling, repeated triggers, dismissal, and source cleanup.
- A compositional handler or a narrowly justified bespoke handler. No copied second damage or resource engine.
- Golden deterministic examples; all refusal branches that could spend resources incorrectly; reload/export at pending decisions; at least one interaction with another system if applicable.
- UI text and breakdown distinguish automated steps from requested GM decisions. Decisions are recorded and validated; the app must not invent a creature's secrets, a deity's response, or a campaign's plane destination.
- Content coverage moves from reference-only to partial to implemented only when every applicable behavior is accounted for. Deliberately excluded flat-board judgments remain explicit and cannot hide a missing ordinary mechanic.

**Acceptance:** zero unclassified records; zero missing required handler operations in the selected release pack; no concentration spells ship as implemented without P12; all family integration fixtures pass; class-granted spell references resolve; generated catalogue and hand-authored behavior registry have no orphan IDs.

**Rollout:** small themed packs with capability/version pins, not a 319-spell mega-PR. Publish coverage per pack. P29 cannot label the entire source catalogue complete while any mechanically applicable behavior remains reference-only.

<a id="p14"></a>

### P14 — Advancement and class-feature foundation

**Outcome:** character progression is reproducible, reversible by an explicit respec workflow, and independent of transient combat state.

**Entry:** P04/P05/P08/P10. **Files:** heroes/records, progression inputs, Hero UI, snapshot creation; proposed advancement/grant/query modules.

**Packages**

- P14.1 Generate class/subclass/level/feature relations with validation. Represent character level and class level separately from the outset, even before multiclass UI. Do not infer all grants by reading the current level field alone.
- P14.2 Store an ordered advancement ledger: starting class, per-level class choice, HP method/result, skill/tool/language choices, subclass, ASI/feat selection, spells, feature options, and explicit overrides. Derive grants with stable source IDs.
- P14.3 Implement feature types: passive modifier/formula, resource pool, active action, reaction/trigger, choice grant, spell access, companion/form, and narrative feature. Define handler hooks using P05–P12 primitives.
- P14.4 Build a level-up draft transaction. Show missing choices and before/after derived values; commit the entire advancement once. A cancel or failed save leaves no partial grants. XP eligibility is advisory unless campaign rules intentionally enforce it.
- P14.5 Migrate old Heroes into an explicit legacy baseline. Preserve current ability scores, proficiencies, inventory, HP state, and manual choices. Ask for missing historical choices without retroactively inventing dice rolls or refilling used resources. A level-10 legacy Hero can remain usable with a visible incomplete-progressions status.
- P14.6 Implement respec as a reviewed rebuild from baseline plus ledger. Remove only source-owned grants, preserve independent loot/GM adjustments, and show resource/max-HP consequences. Never erase an item because it happens to match an old starting item without provenance.
- P14.7 Snapshot advancement-derived mechanics into newly placed tokens, including feature definitions/versions and resource pools. Existing snapshots stay unchanged until explicit reconciliation.

**Acceptance:** building 1→20 and loading the final ledger derive the same character; level-up failure grants nothing; respec removes only its own grants; changing class does not silently erase background grants; feature options reference valid parent definitions; HP/slot maximum changes preserve the chosen spent-resource policy.

**Rollout:** support Fighter/Wizard existing records first; leave the single-class UI simple. Do not enable the new class selector for a class whose mandatory level-one mechanics are still metadata only.

<a id="p15"></a>

### P15 — Complete Fighter/Champion and Wizard/Evocation

**Outcome:** the two existing class choices become mechanically credible through levels 1–20.

**Entry:** P14, P11/P12 and referenced P13 spell families. **Files:** class handlers/progression, command bar, spell chapter, resource UI.

**Fighter packages**

- Implement source-defined Fighting Style choices and their scoped modifiers; incompatible formula/weapon conditions produce explanations.
- Implement Second Wind, Action Surge, Extra Attack scaling, Indomitable, and level-specific usage recovery. Extra Attack expands attacks within an Attack action; it does not create unrestricted extra actions or extra opportunity attacks.
- Implement Champion's supplied subclass mechanics, including critical-range progression and passive/recovery features, through typed rules. Crit-range changes still respect attack-specific hit rules; do not equate any expanded-critical value with an unqualified natural-20 override.
- Integrate replacement attacks such as Grapple/Shove into the Attack action's remaining attack allowance under the selected edition, rather than each consuming a whole action unconditionally.

**Wizard packages**

- Implement spellbook learning, copying costs/time where supported, preparation, ritual permission, slots, and Arcane Recovery.
- Implement Evocation feature grants and their per-spell targeting/damage consequences, including ally exclusions/modified saves where applicable; do not mutate the base spell definition globally for every caster.
- Implement Spell Mastery and Signature Spells as explicit alternative resource/casting policies with source constraints. Spell access, selected slot level, and upcast resource cost remain distinct.
- Treat lost/replaced books and copied entries as inventory/content state without destroying recorded advancement provenance.

**Acceptance:** level 1/5/11/17/20 fixtures validate all grants and pool maxima; Action Surge does not reset Bonus Action or reaction; Indomitable opens only at its proper decision window; Champion effects apply only to eligible attacks; Wizard preparation excludes duplicate/illegal choices; free-cast features cannot accidentally grant free upcasts; level-up and rest do not reset unrelated encounter state.

**Rollout:** small feature clusters with browser journeys and explicit capability labels. A class's "complete" badge requires every mandatory supplied feature and chosen subclass behavior at all supported levels, not just level-one playability.

<a id="p16"></a>

### P16 — Barbarian, Rogue, and Monk

**Outcome:** the martial/skirmisher classes and Berserker, Thief, and Open Hand subclasses are fully integrated.

**Entry:** P07–P10/P14. Referenced spell-like mechanics use P11/P12 as needed. **Source authority:** supplied class/feature records plus edition-appropriate rule references; spell or feature names below are coverage prompts, not substitute rules text.

| Class | Required packages | Key interaction tests |
|---|---|---|
| Barbarian / Berserker | Rage lifecycle/uses, eligibility, damage/resistance, attack/casting restrictions, Reckless Attack, unarmoured formula, danger-sense conditions, movement, critical additions, death-prevention/resource features, subclass actions and retaliation | Rage expiry from its actual trigger policy; source-qualified defenses; no unintended rage bonus on ineligible attack; retaliation shares/consumes reaction correctly |
| Rogue / Thief | Expertise, Sneak Attack eligibility and once-per-turn tracking, Cunning Action, Uncanny Dodge, Evasion, reliable checks, blindsense/reference limits, elusive/stroke-of-luck windows, fast hands/second-story/supreme sneak/use-magic-item/thief-reflexes behaviors | Sneak Attack may differ on another creature's turn; no doubling per attack; grapple expertise; dodge before damage; alternate initiative turns do not corrupt expiry |
| Monk / Open Hand | Martial Arts, Ki pool/recovery, Flurry, bonus defenses/movement, unarmoured formula/movement, deflect-missile resolution and return option, stunning checks, ki-empowered attacks, defensive passives, language narrative features, empty-body actions, subclass rider choices and marked-target effects | Martial Arts weapon/armour conditions; Ki charged once after valid choice; multiple strikes versus one action; reflected missile inventory; riders applied only by explicit selected action |

**Implementation sequence:** level-one passive/active core → resource/bonus action loops → reaction/defense features → subclass branches → high-level exceptions → full advancement matrix. Reuse per-turn event identities rather than resetting Sneak Attack whenever selection changes.

**Closed-decision treatment:** Berserker mechanics that refer to exhaustion expose a clear manual exhaustion consequence and keep that consequence in the feature's adjudication contract. This does not reopen the global exhaustion-ladder implementation. A class badge must disclose that retained product exception rather than falsely claiming full automation of it.

**Acceptance:** source-derived level matrices and deterministic combat fixtures for each active/passive feature; condition immunities; unsuccessful attacks still affect resources when the source says so; all resource resets use P10; subclass options survive export/respec; no monster-level logic introduced to reuse character progression.

<a id="p17"></a>

### P17 — Cleric, Druid, Paladin, and Ranger

**Outcome:** prepared divine/nature casting, mixed martial casting, companions/forms, and the supplied Life/Land/Devotion/Hunter subclasses work.

**Entry:** P12/P14 and named P13 families; P10 item identity; form and companion primitives must exist before enabling those features.

| Class | Required packages | Hard cases that require explicit tests |
|---|---|---|
| Cleric / Life | Prepared list, domain always-prepared spells, Channel Divinity alternatives/shared uses, turning/destruction eligibility, healing modifiers, intervention workflow and cooldown | Domain grants do not consume ordinary preparation quota incorrectly; healing source restrictions; turn effects end on proper triggers; narrative intervention records a GM decision |
| Druid / Land | Preparation/rituals, Wild Shape uses/forms/eligibility, learned forms and source CR/movement limits, retained mental/feature state, alternate HP/reversion, equipment disposition, subclass recovery and land choices, high-level casting/form exceptions | Overflow damage on reversion; concentration retained only when legal; previous HP/resources restored accurately; nested transform refusal/explicit policy; no replenishment by repeatedly entering a form |
| Paladin / Devotion | Half-caster progression, Lay on Hands spend modes, Divine Sense, Fighting Style, smite after eligible hit, auras, oath spells/Channel Divinity, cleansing features, capstone | Smite decision occurs after the relevant hit and spends correct slot; aura membership updates on movement/incapacity; strongest/overlapping effects respect source policy; pools and spell slots are separate |
| Ranger / Hunter | Known-spell policy, half-caster slots, exploration choices, favored enemy/terrain narrative and supported mechanical scopes, Fighting Style, Extra Attack, hunter option trees and defensive features | Hunter once-per-turn/per-target rules; option prerequisites; no invented automatic navigation; level replacements remove only previous selected grants |

**Packages:** per-class progression adapter; spell-access policy; core resource/action handlers; subclass handlers; complete skill/armour/weapon grants; Hero sheet controls; source-provenance respec tests; class-specific browser journey.

**Form contract:** replacement/retention policies are explicit per statistic and resource. Store a form stack/reference to original actor state, not a destructive overwrite of the Hero. Temporary transformed tokens preserve ownership, principal permissions, concentration references, and inventory identity. Always bound available form selections and object counts.

**Acceptance:** full 1–20 progression fixtures for every class; no prepared/known policy copied from Wizard by convenience; form death/reversion and aura crossing survive reload; slot/resource consumption is idempotent; exported active forms and companions load without their source scene being open.

<a id="p18"></a>

### P18 — Bard, Sorcerer, and Warlock

**Outcome:** remaining arcane/social classes and Lore, Draconic, and Fiend subclasses work without distorting ordinary spellcasting.

**Entry:** P12/P14 and required spell/effect/reaction families.

| Class | Required packages | Hard cases |
|---|---|---|
| Bard / Lore | Known-spell policy, Inspiration dice and grant/spend expiry, expertise/jack-of-all-trades, rest support, Magical Secrets, Cutting Words and other subclass features | A granted die belongs to its recipient effect and source pool; choice windows occur at the correct stage; partially proficient checks and initiative use source-defined bonus rules |
| Sorcerer / Draconic | Sorcery points, slot conversion in both directions, Metamagic option transforms, known/replaced spells, origin durability/defenses/damage/flight/presence | Created-slot expiry separate from ordinary slots; Twin eligibility and target count verified per spell; Quickened/Subtle/Heightened/Empowered etc. alter only their specified stages and consume points once |
| Warlock / Fiend | Pact Magic level/count and short-rest recovery, Mystic Arcanum separate uses, invocations/prerequisites/replacements, pact boon variants, patron grants/actions/defenses, recovery capstone | Do not flatten pact slots into ordinary caster slots; invocation at-will casting has its own source limits; Arcanum is not an ordinary upcast slot; temporary HP uses nonstacking rules |

**Implementation:** define casting-source/resource alternatives before subclass exceptions. Metamagic is a validated transformation of the resolution plan with named stages; do not maintain separate spell clones for every combination. Feature-specific caps and legality operate both in the UI query and command validator.

**Acceptance:** every option in the selected content pack is either implemented with tests or prevents a complete-class label; combining supported Metamagic options follows the source policy; losing an invocation/respeccing removes only its grants; patron/secret spells have clear list/preparation ownership; a reload between granting and spending Inspiration preserves the recipient's die.

<a id="p19"></a>

### P19 — Feats, ability-score choices, and optional multiclassing

**Outcome:** advancement choices extend existing classes cleanly, with an honest content boundary.

**Entry:** P14, class-specific integrations P15–P18. Individual feat scaffolding can start after P14; cross-class completion waits for all affected class adapters.

**Packages**

- P19.1 Implement the feat registry: prerequisites, repeatability, choices, grants, active handlers, and replacement/removal. Supply Grappler from the local input first. Additional feat packs require explicitly authorized content, edition, and behavior records; a UI that lists one feat is not "all official feats."
- P19.2 Add ASI versus feat choices at the correct class levels, ability caps and exceptions, plus stat-preview/respec. Persist the user's selected choice, not only the resulting ability score.
- P19.3 Add optional multiclass campaign policy and per-level class selection. Enforce prerequisites when taking the new class, starting versus multiclass proficiencies, class/subclass level gates, and total-level boundaries. Keep the optional rule disabled unless selected for that campaign.
- P19.4 Derive ordinary multiclass slot progression using the edition's class contributions/rounding. Keep spells known/prepared calculated per class; keep Pact Magic and Arcanum independent while offering source-permitted spending interoperability. Cantrip scaling uses the correct character/class/source policy.
- P19.5 Track Hit Dice by class and source. Proficiency bonus uses character level. Extra Attack and unarmoured/AC alternatives do not stack by naive addition. Preserve resource maxima and recovery identities per source.
- P19.6 Add a conflict explanation panel for competing formulas, duplicate grants, optional features, and invalid historical selections. Use explicit GM override with provenance; do not silently delete a once-valid feat after a respec.

**Acceptance:** single-class legacy Heroes derive unchanged; mixed full/half casters, Wizard/Warlock, Fighter/Rogue, and two Extra Attack classes have reference fixtures; level ordering and starting class produce appropriate different proficiencies; respec removes only the relevant choices; a feat cannot be selected twice unless allowed; additional source packs cannot inject executable handlers.

**Rollout:** feat/ASI choices first, then opt-in multiclass behind complete per-class adapters. Verify the exact 2014 multiclass rules during implementation rather than importing the revised edition's rounding or progression. [2014 customization reference](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options).

<a id="p20"></a>

### P20 — Explicit monster abilities and action completeness

**Outcome:** the 334 monsters expose accurate mechanical actions and useful adjudication flows for reference-only abilities, without parsing their prose at runtime.

**Entry:** P04/P07–P13. **Files:** generated monster definitions, typed action/effect registry, monster inspector/browser, scheduler.

**Packages**

- P20.1 Inventory every attack, action, bonus action where supplied, reaction, trait, legendary action, recharge, and special defense. Link each to a shared primitive or bespoke behavior issue. Parent forms/variants retain distinct IDs and supported features.
- P20.2 Replace count-only Multiattack with explicit legal sequences/alternatives for authored cases. A generic count remains an explicit GM-authored alternative, not an assertion of full source enforcement. Loading and attack substitutions remain correctly scoped.
- P20.3 Implement common families: recharge attacks; breath/save areas; regeneration and regeneration suppression; pack/positional attack modes; undead survival checks; magic defenses; conditional damage defenses; explicit grab/restrain/swallow actions; innate and prepared monster spells.
- P20.4 Add legendary-action budgets and source-defined replenishment, allowed timing, costs, eligibility, and no-self-turn rules. Legendary Resistance offers an optional response at a failed-save window and consumes its own pool, not the ordinary reaction.
- P20.5 Model lair/regional mechanics only where the selected source supplies them and a scene is explicitly configured. Do not invent them from a monster name.
- P20.6 For ordinary attack prose riders, preserve the closed manual-adjudication policy: show a named suggested follow-up that the GM explicitly selects/approves. Do not scan descriptions and auto-apply conditions. Explicit ability actions may resolve their selected typed effect after the required roll/choice.
- P20.7 Qualify resistances with actual attack/item facts introduced in P10, including magical/silvered/etc. where supported. Keep unmodeled predicates visible as adjudication requirements rather than applying blanket resistance.

**Acceptance:** Knight, Goblin, Giant Spider, Troll, Zombie, Adult Red Dragon, a spellcaster, a legendary creature, and a form-changing creature exercise distinct families; a legendary action does not consume an ordinary reaction; recharge fails/succeeds deterministically; variant imports preserve owned weapons and no invented loot; every manifest action has an accounted-for outcome.

**Rollout:** common families first, then individual exceptions. Keep unsupported portions labeled. Test monster behavior with the repaired authored modifiers, never with level-1 token defaults.

<a id="p21"></a>

### P21 — Magic-item actions, charges, and variants

**Outcome:** each of the current 113 primarily reference-only magic entries gains its applicable mechanics and explicit narrative workflow; the wider source catalogue is reconciled transparently.

**Entry:** P10 and required P13/P20 primitives. **Files:** item generator/manifest, item-instance model, action registry, gear/loot/inspection UI.

**Packages**

- P21.1 Decompose each item into equip/attunement requirements, passive effects, active choices, action/reaction costs, charges/consumption, target/area, duration, curse/identification, final-charge consequences, recovery, and narrative requirements. Appendix D enumerates the current reference entries.
- P21.2 Implement families: cast-a-spell items; passive statistic/sense/movement modifiers; consumable potions/oils/dusts; charged attack/save actions; bags/containers; summon/transform objects; teleport/planar travel; information/social tools; permanent advancement; random tables and exceptional outcomes.
- P21.3 Link spell-casting items to the same spell handlers with an item-defined casting source, DC/attack policy, slot/charge alternative, component exceptions, and attunement. Never give the user unbounded access to the underlying spell as a learned spell.
- P21.4 Introduce identification and curse visibility policy that later player projections can enforce. Attunement knowledge and item name disclosure are separate from ownership. Curse removal/transfers use explicit source rules and GM decisions where necessary.
- P21.5 Implement final-charge destruction/recharge dice per item, not one global probability. Preserve physical identity through charge exhaustion, damage, transfer, and restoration.
- P21.6 Reconcile 362 source records into parents, variants, selected items, and currently unshipped content. The release denominator for the existing backlog is the current 113. Add a separately approved expansion manifest for additional source variants; do not count parent descriptions as usable inventory objects or declare all 362 shipped by arithmetic.
- P21.7 Provide custom item instances with safe typed modifiers and manual actions. Arbitrary script execution is out of scope. Every custom definition carries its own provenance, export payload, validation version, and explicit capability limits.

**Acceptance:** a charged casting item casts and spends once; two identical items keep independent pools; a final-charge event survives reload without another destruction roll; an item can't be simultaneously attuned by two actors; ownership transfer removes only applicable old-owner effects; secret traits never enter a player export; narrative items present a real decision workflow rather than an inert "Use" button.

**Rollout:** retain the four existing potion and six worn-effect journeys, migrate them to shared primitives, then expand in small item-family packs. Reference-only status remains until every mechanical sub-behavior is covered.

<a id="p22"></a>

### P22 — Lighting, senses, and visibility

**Outcome:** light sources and creature senses produce consistent, explainable visibility decisions shared by targeting, Hide, effects, and the later player view.

**Entry:** P07–P09/P12. **Files:** geometry/visibility queries, effect definitions, scene lighting editor, token inspector, render layers. Server projection enforcement belongs to P27.

**Packages**

- P22.1 Specify separate concepts for illumination, line of sight, line of effect, perceived creature, known position, explored terrain, and currently revealed map. Hidden, invisible, unseen, and behind full cover cannot be interchangeable Boolean flags.
- P22.2 Add scene ambient light, local light emitters, opaque barriers, doors, and explicit manual reveal. Store geometry in world units; pan/zoom changes only presentation. Emitters may belong to an item, token, effect, or scene object and disappear only when their owning source says so.
- P22.3 Implement bright/dim/dark regions and supported senses with source-defined range and limitations. Darkvision changes interpretation of darkness within its range; it does not grant universal sight through walls. Blindsight, truesight, tremorsense, blindness, magical darkness, and invisibility require separate capability predicates. Do not infer a new sense from descriptive flavor text.
- P22.4 Define an observer query returning permitted facts and a structured adjudication result: visible, obscured, location-known, unknown, or needs-GM-decision, plus GM-only reasons. Attack previews, Hide detection, opportunity triggers, target pickers, and area effects consume this query instead of maintaining competing distance/sight rules.
- P22.5 Preserve authored monster passive Perception and explicit overrides from P04. Make the difference between "can see" and "can detect by another permitted sense" visible in the inspector. Sound and smell beyond modeled content remain GM judgments.
- P22.6 Compute lighting and occlusion incrementally when emitters, walls, doors, observer position, or relevant effects change. Cache by geometry/observer/effect revision, not camera position. Use spatial indexing before introducing workers; move expensive pure calculations to a worker only after profiling.
- P22.7 Expose GM controls for ambient light, source radii, obstruction editing, and adjudication overrides with undoable authored changes. Use color plus texture/icon differences so darkness information does not rely on hue alone.
- P22.8 Define explored-map knowledge persistence per participant or explicitly selected sharing group. A creature becoming unseen does not automatically erase remembered terrain; remembered terrain does not reveal its current occupants. Player rendering remains unavailable until P27 can enforce the same policy before transmission.

**Acceptance:** torch movement updates only affected regions; extinguishing one of two overlapping lights retains the other; an opaque closed door blocks the selected sense while opening it changes visibility; darkvision works at its boundary and retains source restrictions; unseen-but-known targeting differs from unknown-location targeting; a hidden creature is not exposed by the player target list, path preview, or accessible label; reload restores source ownership and explored knowledge.

**Rollout:** local GM lighting and diagnostics first. Enable shared fog/player sight only with the P27 privacy gate. Flat-board limits remain explicit; do not promise volumetric lighting or elevation-aware vision.

<a id="p23"></a>

### P23 — Campaign continuity, interface completion, and accessibility

**Outcome:** users can move between preparation, exploration, combat, advancement, and recovery without losing track of authoritative state or fighting the interface.

**Entry:** P06/P10/P14; final integration follows P19–P22. **Files:** campaign/library/hero/table screens, controller hooks, modal/focus primitives, CSS component layers, scene/hero membership schema.

**Packages**

- P23.1 Complete the campaign management UI over the aggregate introduced in P03: title, rules/content pins, GM time from P08, scene memberships, roster memberships, and local settings. Retain the default-campaign migration without changing existing IDs or allocating items again. Decide whether a roster Hero can be referenced by multiple campaigns; default to explicit copies across independent campaign authorities, with lineage recorded and no live cross-campaign resources.
- P23.2 Implement navigation with clear current campaign, scene, actor, and mode. Preserve useful selection/scroll state on return. Provide search, sorting, filters, duplication, archive, and recovery paths as appropriate to actual user volume. Destructive actions state the affected object and offer a deliberate confirmation or reversible trash workflow; routine actions stay fast.
- P23.3 Add explicit Hero/snapshot reconciliation. Capture a snapshot base revision when deploying a Hero. Compare base, current Hero, and current token; classify unchanged, one-sided, identical, and conflicting field changes. Show a field-level preview, choose direction per supported field group, and commit against all expected revisions. An old snapshot without a base gets an explicitly conservative two-way comparison, never invented history.
- P23.4 Define reconciliation policies separately for identity/appearance, advancement, prepared spells, current HP/resources, inventory instances, temporary effects, and encounter-only state. Do not copy initiative, reaction windows, stale concentration links, or turn expenditure to a roster Hero. Do not replay XP awards or multiply unique item IDs. Inventory transfer/reconciliation uses ownership commands; money and resources require explicit value/delta selection with source evidence. A stale preview must refresh before commit.
- P23.5 Complete character creation and advancement as resumable drafts with validation near the decision, a review summary, and a clear remaining-choice count. Ability method, class, background, proficiencies, starting gear, spells, and later subclass/feat options appear when needed. Do not advertise a class as complete before its manifest gate passes.
- P23.6 Consolidate action discovery around available actions, bonus actions, reactions, spells, features, and items while retaining keyboard-efficient common attacks. Show why an action is unavailable and what changes eligibility. Reserve scarce visual emphasis for the next decision, danger, and unresolved choices. A rules log and a save/recovery notification serve different purposes.
- P23.7 Extract controller and CSS responsibilities along changed feature boundaries. Replace brittle direct DOM coupling with semantic component contracts. Reuse validated numeric fields, entity pickers, modal focus management, token context menus, inspection panels, and status messages. Do not rewrite all styling or adopt a new component framework merely to standardize names.
- P23.8 Audit full keyboard operation, focus restoration, dialog trapping, Escape behavior, visible focus, screen-reader names, live announcements, contrast, reduced motion, zoom/reflow, and touch alternatives. Board interaction needs a keyboard-operable actor list and coordinate/target chooser; canvas appearance alone is insufficient. Use a 44-CSS-pixel comfortable touch target design goal where practical, and evaluate actual WCAG criteria separately rather than treating that number as the whole standard.
- P23.9 Provide understandable empty, loading, offline, read-only, incompatible-version, quota-full, conflict, recovery, and pending-resolution states. "Saved" appears only after durable commit; explain a rejected save without falsely implying success. Offer export from recoverable read-only states when safe.
- P23.10 Run representative user tasks with first-time and experienced GMs: create a Hero, start a small fight, resolve a reaction, cast a concentration spell, reconcile loot, level up, and recover an archive. Record observed failures and task completion, then fix the highest-impact issues. Re-test affected flows rather than scheduling endless broad redesign reviews.

**Acceptance:** keyboard-only creation through combat is possible; reload resumes a draft or committed resolution as promised; a stale reconciliation preview cannot overwrite a newer Hero; two snapshots cannot duplicate an item into the roster; cross-campaign copies have intentional identity/resource boundaries; 200% text zoom and narrow layouts remain operable; no critical information is conveyed by color alone. Validate against [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

**Rollout:** deliver continuity and accessibility with each relevant feature; P23 is the final integration audit, not permission to postpone accessible behavior until the end.

<a id="p24"></a>

### P24 — Offline installation, version-safe caches, and performance

**Outcome:** local play works after an intentional offline preparation step, updates preserve active games, and increasing content does not make common interactions sluggish.

**Entry:** P03/P23 and an inventory of all lazy content/assets. **Files:** Vite delivery configuration, service worker/manifest, storage diagnostics, content loaders, board render/query paths.

**Packages**

- P24.1 Inventory the shell, fonts, icons, CSS, lazy monster/spell/item chunks, worker scripts, and user assets needed for an offline session. Distinguish "app shell ready" from "selected campaign/content ready." Provide a visible offline readiness check and optional content/campaign pinning with estimated size.
- P24.2 Scope service workers and caches to the application environment and deployment base. Production and preview must never share application cache names or a worker controlling both path trees. Check generated asset URLs under both GitHub Pages base paths and a future custom origin. Browser caches and IndexedDB are different stores with different cleanup rules.
- P24.3 Version the shell, content packs, schema reader/writer range, and protocol compatibility independently. Stage and verify a new shell before offering activation. Avoid forcibly reloading an active encounter, losing a draft, or replacing the runtime during a pending resolution. On next safe launch, confirm the new runtime can read the selected vault/content versions before switching.
- P24.4 Keep the previous compatible shell assets long enough to support an interrupted update and open tabs. Cache cleanup must never delete campaign assets or data. A browser may reclaim storage; offline installation is not a backup guarantee. Offer storage usage and export without promising permanent retention. [Service worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [browser storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- P24.5 Handle partial cache writes, failed content download, offline first launch, missing chunks after deployment, unsupported install behavior, and quota errors. Retry downloads idempotently; retain the last usable version. A cached campaign with unpinned content states exactly what is unavailable rather than showing a generic crash.
- P24.6 Capture repeatable performance fixtures before optimizing: fresh library, existing populated library, 20×12 scene, a large-map stress scene, many actors/effects, a large catalogue search, archive export, and restore. Measure cold/warm load, interaction latency, memory growth, query cost, and durable commit latency separately. Use production builds and recorded machine/browser profiles.
- P24.7 Address measured bottlenecks: lazy content boundaries, search indexes, stable selectors, actor-level render subscriptions, spatial indexes, image decoding/downscaling, capped render resolution, and bounded logs. Avoid one React state update per animation frame for every cell. Offscreen/worker work requires cancellation and revision checks before applying results.
- P24.8 Adopt provisional budgets: common non-network previews should normally complete within 100 ms and ordinary small local commands within 200 ms at p95 on the agreed reference desktop; pointer feedback should remain within a frame when doing only camera/selection work. These are proposed targets to calibrate in P00/P24, not measured guarantees or requirements to weaken durable saving. Give long operations progress/cancel semantics where safe. Record bundle budgets from the actual post-splitting baseline instead of inventing a universal kilobyte ceiling.
- P24.9 Verify touch, high-DPI, reduced-motion, and battery-sensitive behavior. A maximum map dimension, asset size, actor count, and trigger work budget must be documented from measured results. Refuse unsupported sizes with a useful message; do not accept them and hang.

**Acceptance:** a prepared campaign reloads with the network disabled; every selected lazy feature opens offline; unprepared content has an actionable state; updating one tab does not corrupt another; an interrupted update leaves a usable shell/vault pairing; performance regressions are reproduced with a saved fixture; repeated scene switching does not continuously retain old images/listeners.

**Rollout:** offline readiness and update behavior behind an environment-specific flag, then staged local release after recovery drills. Never introduce a service worker solely for a marketing "install" badge.

<a id="p25"></a>

### P25 — Optional accounts and cloud persistence

**Outcome:** a user can explicitly place a campaign in a private cloud vault and access it on another device while local campaigns continue to work without an account.

**Entry:** P02/P03/P05. **Files:** new optional server service, authenticated client adapter, cloud campaign UI, infrastructure configuration and runbooks created only in a future authorized task.

**Packages**

- P25.1 Write a backend ADR comparing supported authentication, transaction semantics, private asset delivery, backup/restore, data location, observability, cost at measured usage, and operational ownership. Select a provider only then, using its current official documentation and applicable skills. The plan's relational database/private object store/TypeScript service is an interface direction, not a vendor selection or provisioning instruction.
- P25.2 Specify logical entities: users, campaigns, memberships/invitations, campaign snapshots/revisions, command outcomes, pending resolutions, asset ownership/references, content pins, export jobs, tombstones, and transactional outbox. Add uniqueness for `(campaignId, commandId)`, membership identity, and asset logical identity. Use explicit foreign keys/constraints where supported. Model deletion and restoration instead of relying on dangling JSON references.
- P25.3 Authenticate through a maintained provider/library. Define browser session transport and CSRF protection together; for a same-site service prefer secure HttpOnly cookies with appropriate SameSite policy, deliberate session expiry, and server-side verification. Do not persist provider secrets or privileged credentials in frontend bundles/localStorage. Check WebSocket origin and authorization separately. If deployment needs cross-origin/token transport, document the specific threat model and supported provider flow before implementation.
- P25.4 Authorize every campaign/query/command/asset request on the server. Roles start as GM, player, and observer with explicit capabilities, not a check on a user-supplied `role` field. Membership revocation invalidates subscriptions and future requests. Distinguish authentication failure, no permission, expired invitation, deleted object, conflict, and outage without disclosing private object existence.
- P25.5 Build cloud creation/import as an explicit user action showing campaign scope and assets. Validate locally and server-side, upload to private staging, verify content and ownership, then atomically publish the campaign reference set. Garbage-collect abandoned staging after a documented safe retention window. Never silently upload all local campaigns on login.
- P25.6 Use a single transaction for authoritative snapshot/revision, command outcome, pending state, and outbox entry. Keep private object uploads outside long database transactions and connect them through a staged asset lifecycle. A committed state cannot refer to a file that has not passed validation and become durably accessible to the service.
- P25.7 Implement device listing/session revocation if supported by the selected provider, account recovery, campaign export, campaign deletion, and account deletion with clear consequences. Use tombstones/version fences so an old device cannot resurrect deleted data. Resolve who owns shared campaigns when an account leaves or is deleted; do not silently transfer GM ownership.
- P25.8 Define encrypted transport, private bucket defaults, short-lived authorized asset access or authenticated proxy delivery, size/type limits, rate limits, and sanitized audit records. Never include credentials, raw private character notes, map contents, or full payloads in general telemetry. Define retention by data category and actual product needs.
- P25.9 Establish backup scope and restore rehearsal for both database and object storage. Propose a starting recovery objective, such as a one-hour maximum committed-data loss window and four-hour service restoration target, only after checking cost and provider support. Publish measured recovery capability, not an untested promise. A local portable export remains a supported escape path.

**Acceptance:** a new account cannot enumerate another campaign's IDs/assets; revoked membership loses reads/writes/subscriptions; duplicate upload/command retries create one result; account deletion cannot be reversed by a stale client sync; a restored backup has matching state and assets; login does not alter or upload local campaigns; expired authentication during an action does not falsely show a committed result.

**Rollout:** private single-user cloud campaigns first. No general multiplayer access until P26/P27 qualification. Provider-specific row security, migrations, and deployment configuration are designed and tested after the provider ADR.

<a id="p26"></a>

### P26 — Authoritative multiplayer and reconnect

**Outcome:** simultaneous users observe one consistent encounter, and retries, disconnections, and conflicting commands do not duplicate or lose game actions.

**Entry:** P09/P25, with shared typed commands and a complete privacy design from P27 before player beta. **Files:** server command service, socket transport, protocol contracts, client reconnect/state adapter.

**Packages**

- P26.1 Version the protocol: authentication/session negotiation, supported schema/rules range, subscription request, projected snapshot, command submission, command acknowledgement/outcome, projected event, resync-required, and permission-revoked. Include stable command IDs and expected revisions; define maximum sizes and structured refusal codes.
- P26.2 Make the server validate permissions, action legality, current revisions, resource availability, geometry, and choices. Clients submit intent; they do not supply authoritative HP deltas, successful die results, initiative order changes, or final money balances. Inject randomness for tests; production randomness comes from the chosen server source and is committed with the outcome. Do not expose private seeds or transcripts to unauthorized participants.
- P26.3 Serialize conflicting mutations using short database transactions and a documented lock/compare-and-swap strategy. Start with a campaign authority boundary if measurements support it, using stable lock order. A pending reaction never holds a database transaction or lock open while waiting for a human. Persist its cursor/reservations, release the transaction, then resume through another validated command.
- P26.4 Commit snapshot, idempotency outcome, pending decisions, and delivery outbox atomically. Publish after commit. A crashed publisher can resend; consumers deduplicate. An acknowledgement lost after commit is recovered by querying/retrying the same command ID. The same ID with different payload bytes is rejected and audited.
- P26.5 Define command conflicts by meaning. Stale non-mutating queries can refresh. Stale resource spending, movement, inventory transfer, or advancement is revalidated/rejected; never overwrite an entire newer snapshot. UI may optimistically show a camera move, selection, or pending ghost, but authoritative HP/resources remain explicitly pending until acknowledgement.
- P26.6 Use resumable participant-specific cursors. If retained events cover the gap, replay authorized projections; otherwise send a fresh authorized snapshot. Do not expose a global private event sequence or revision delta that lets a player count hidden GM actions. Maintain a safe public stream/projection revision and an opaque concurrency token appropriate to that principal; server-side expected-state checks still use internal authority revisions.
- P26.7 On reconnect, re-authenticate, re-check membership, reconcile outstanding command IDs, restore pending choices assigned to that user, and subscribe from the last accepted cursor. Do not replay arbitrary queued combat actions from an offline client. Offer read-only cached state with a stale indicator and an explicit independent local fork where permitted.
- P26.8 Separate ephemeral presence, cursors, pings, and camera sharing from durable game commands. Throttle/coalesce presence and drop it under pressure; never let a chatty cursor channel delay saves. Add chat only as a separately approved product feature with its own persistence/privacy scope, not as a hidden dependency of multiplayer.
- P26.9 Implement timeout/disconnect behavior for choices: GM can take over, defer, or resolve through an audited command. A network timeout does not mean an attack missed or a reaction was declined. Turn timers are optional preferences and cannot silently spend another person's resources.
- P26.10 Exercise latency, packet duplication, out-of-order delivery, lost acknowledgements, server restart, membership changes, browser suspension, incompatible clients, and simultaneous commands. Record bandwidth/CPU at expected group sizes before partitioning campaigns or adding distributed coordination.

**Acceptance:** two clients spending the final slot produce one accepted spend; double-submit/reconnect yields one roll; a server crash after commit but before broadcast recovers the same outcome; an expired replay cursor receives a safe snapshot; an offline move does not overwrite current combat; player disconnect during a reaction leaves a recoverable pending decision; no private event count leaks through public cursors.

**Rollout:** GM controlling a private campaign from two devices, then invited internal test groups with P27, then bounded beta. Feature flags disable new online commands without breaking export/read-only recovery. A local rules engine may preview results but cannot override server authority.

<a id="p27"></a>

### P27 — GM/player views, ownership, and information boundaries

**Outcome:** each participant receives only permitted campaign information and can perform only explicitly granted actions, including through direct network calls.

**Entry:** P22/P25/P26. **Files:** server projection/authorization modules, private asset delivery, player application shell, invitation/ownership UI, adversarial integration fixtures.

**Default permission matrix**

| Capability | GM | Player | Observer |
|---|---|---|---|
| Campaign configuration, membership, reveal, authoritative adjudication | Yes | No | No |
| Full private scene/monster state | Yes | No | No |
| Own allowed Hero preparation | Yes | Own drafts/approved fields | No |
| Battle actor commands | Any actor with audited override | Owned/delegated actor, legal timing and action | No |
| Visible public encounter information | Yes | Permitted projection | Permitted projection |
| Full campaign export | Yes | No by default | No |
| Personal/public export | Yes | Explicitly scoped export | Only if granted |
| Private notes and unrevealed assets | Yes | Only explicitly shared/owned notes | Only explicitly shared |

Combat allegiance is not permission. A player may legitimately target an ally or a neutral object when rules allow it; ownership controls who may issue the command, not an invented ban on friendly targeting.

**Packages**

- P27.1 Define field-level projection contracts for campaigns, scenes, actors, items, effects, rolls, events, pending choices, and errors. Decide whether other actors expose exact HP, qualitative health, or no health; default conservatively and make GM settings explicit. A secret modifier may affect a result without exposing its name/value in the player roll breakdown.
- P27.2 Build separate GM and player query projections server-side. Do not serialize the full domain object and delete a few obvious fields. Allowlist visible fields and construct nested objects deliberately. Test that new private schema fields are absent by default.
- P27.3 Model ownership/delegation as membership-linked capability records with scene/actor scope, grantor, and revocation. Revalidate on every command and subscription. Invitation links expire, have bounded uses, and do not grant GM authority merely because their URL is known.
- P27.4 Ensure fog protects assets as well as tokens. A full unrevealed map sent to a browser can be inspected despite a canvas mask. Choose separate public map assets, server-rendered/tiled authorized imagery, or another reviewed scheme that never transmits hidden pixels. Apply the same discipline to thumbnails, exports, preloads, source URLs, cache keys, and signed asset links. A signed URL is access, not pixel-level redaction.
- P27.5 Prevent indirect disclosure through target search, attack availability, collision/path refusals, hidden wall coordinates, effect counters, accessible labels, sound notifications, and reaction lists. The server can validate movement against private facts while returning a deliberately limited refusal/adjudication response. Document unavoidable gameplay inference separately; do not leak the entire secret object as a "debug reason."
- P27.6 Determine who is eligible to respond to each pending choice without broadcasting private abilities to everyone. Send personalized choice projections. A GM can inspect the full scheduler; other clients receive only what their role requires.
- P27.7 Keep discovery/knowledge distinct from current sight and from ownership. Reveal can share a name without sharing statistics, curse, inventory, spell list, or private notes. Losing ownership/membership immediately removes future access and clears applicable local sensitive caches; acknowledge that previously delivered knowledge cannot be made unknown to a person.
- P27.8 Create a player shell centered on their actors, legal actions, visible map, current turn, pending choices, and permission-aware inspection. Hide unavailable GM controls for usability while independently rejecting the corresponding API commands. Explain request-to-GM workflows without exposing internal authorization terms.
- P27.9 Verify privacy at the network/storage level: snapshots, WebSocket frames, HTTP errors, generated images, asset manifests, export archives, logs, local caches, and analytics. Test altered IDs, forged roles, stale invitations, cross-campaign references, and membership revocation during an in-flight operation.

**Acceptance:** a player extracting all received JSON/assets cannot find the hidden monster, private note, secret item property, or unrevealed map region; every matrix denial is tested through direct requests; changing a token's faction grants no permission; a revoked user cannot reuse a cached signed URL beyond its documented short lifetime; no personal export contains the GM journal.

**Rollout:** no player beta until these boundaries pass adversarial integration tests. GM preview of the player UI is useful but does not substitute for testing a genuinely restricted session. Apply current [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) and [WebSocket security guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

<a id="p28"></a>

### P28 — Merchants, prices, and transactional shopping

**Outcome:** a GM can maintain a shop and complete purchases/sales without duplicating goods or losing money under retries and conflicts.

**Entry:** P10; shared shops additionally require P26/P27. **Files:** merchant entity, currency/value helpers, trade commands, catalogue/inventory picker, receipt UI.

**Packages**

- P28.1 Add merchant identity, campaign/scene association, visible description, stock locations, quantities/instances, buying rules, purse policy, and price overrides. Separate finite stock/cash from an explicitly configured unlimited GM shop. Price guidance is a game configuration, not a claim that every magic item has a canonical purchasable value.
- P28.2 Represent value in integer copper units; display selected denominations without floating-point arithmetic. Define exchange/change policy, maximum safe values, rounding, and whether coins are tracked by denomination or fungible value. If physical denominations matter, compute and validate actual tender/change rather than inventing coins. Never silently make an unaffordable purchase negative.
- P28.3 Build a quote containing item definition/instance, quantity, buyer/seller, unit price, adjustments, total, stock revision, and any explicit expiry policy. Show known item properties only. A GM can override price with an audit reason; the accepted quote remains attached to the receipt.
- P28.4 Validate ownership, stock, quantity, funds, capacity policy if enabled, identification visibility, and current quote revisions. Atomically move instances/update stacks, transfer funds, and record the unique command outcome/receipt. A sale that consumes the last stock cannot also succeed for a concurrent buyer.
- P28.5 Preserve charges, attunement restrictions, damage/customization, hidden curse data, and provenance through transfer. Selling a charged item must not reset it to a fresh catalogue item. Require explicit resolution for an item in use by a pending command or bound to a source-defined non-transferable state.
- P28.6 Model returns/refunds as new compensating transactions referencing a receipt and validating current ownership/condition/funds. Do not restore an old entire inventory snapshot or rewind unrelated spending. Stock restocking is an explicit GM operation with its own idempotency key and source.
- P28.7 Provide accessible quantity controls, cart review, clear refusal reasons, and receipts. A cart is a draft; reserving stock is optional and needs timeout/ownership rules if introduced. Do not reserve stock indefinitely by leaving a tab open. Online offline carts may remain drafts but cannot complete trades without authority.

**Acceptance:** exact denomination conversions, insufficient funds, final stock conflicts, duplicate-submit, charged-item sale, interrupted acknowledgement, refund after item transfer, and stale quote are covered; trade changes money/stock/ownership together or changes none; a player does not learn hidden item properties from a quote or error.

**Rollout:** local GM-managed merchants first; expose player purchasing only after the online authority/privacy contracts are complete. Keep direct GM loot editing available with explicit provenance.

<a id="p29"></a>

### P29 — Release qualification, operations, and maintainable handoff

**Outcome:** each selected release is demonstrably usable, recoverable, supportable, and honest about its content coverage.

**Entry:** the chosen release's phase gates. **Files:** CI workflows, test fixtures, capability reports, release/restore/support runbooks, version manifest and deployment configuration.

**Packages**

- P29.1 Establish a release bill of materials: commit, build artifact hash, rules/content versions and source hashes, schema read/write range, asset manifest, protocol version, enabled capabilities, known limitations, and verified browser matrix. Generate coverage reports from behavior manifests and test evidence; do not hand-maintain a misleading green percentage.
- P29.2 Run the repository-required unit/render/browser/lint/type/build gates appropriate to the change, plus new acceptance suites. Separate genuine screenshot comparisons from structural/render contracts. Qualify Chromium and at least one additional engine for durable storage, import/export, offline, keyboard, and online reconnect flows; record unsupported browser behavior explicitly.
- P29.3 Rehearse recovery from each durable boundary: legacy migration, archive staging, IDB commit, quota failure, cache update, command commit/ack loss, cloud snapshot restore, object restore, and membership revocation. Retain sanitized fixtures and a reproducible fault-injection harness. A success-only migration test is insufficient.
- P29.4 Define release blockers: known destructive recovery defect; duplicate spend/award; unrecoverable supported save migration; private-data exposure; unsupported mechanics falsely advertised as complete; critical keyboard blocker; unresolved crash in a core workflow. Triage lower-impact issues with owner, workaround, and expiry rather than pretending every cosmetic defect blocks delivery.
- P29.5 Build once and promote the verified immutable artifact where hosting allows. Verify production/preview state, asset, cache, authentication, and API isolation before promotion. Test under the real deployment base. Never migrate a user's campaign merely because an unrelated shell was deployed; use the tested compatibility/open flow.
- P29.6 Define rollback by compatibility. A previous shell can be restored only if it safely reads/writes the current vault and pins the required content. Otherwise disable the affected capability, serve a compatible read-only/recovery build, or forward-fix. Do not run an old normalizer against a newer save as a "rollback."
- P29.7 Introduce observability proportionate to the mode: local sanitized diagnostic export and explicit opt-in reporting; online latency/error/queue/restore metrics and security events without full private payloads. Provide correlation IDs that support debugging without granting access. Bound event retention while retaining idempotency fences/checkpoints needed to reject ancient retries.
- P29.8 Write operator runbooks for service outage, failed migration, asset loss, quota exhaustion, corrupt primary/backup, incompatible client, stuck pending resolution, duplicate request allegation, permission leak, lost account access, and content regression. Each runbook includes detection, containment, evidence preservation, safe recovery, communication ownership, and a verification step.
- P29.9 Publish user-facing release notes grouped by observable behavior, known capability limits, compatibility, and recovery instructions. Update README/FEATURES/TODO/workflow documentation so it agrees with the executable checks and current source-generation prerequisites. Archive outdated claims rather than layering contradictory notes.
- P29.10 Complete handoff: architecture decisions, dependency ownership, schema migration rules, source update procedure, test fixture maintenance, private-data handling, deployment permissions, rollback constraints, and a prioritized residual backlog. Every unfinished manifest entry remains visible with an owner and reason.

**Acceptance:** a maintainer unfamiliar with the implementation can restore the supplied failure fixture using the runbook; the previous supported archive imports; a clean checkout can reproduce shipped content/build using documented permitted inputs; staging cannot mutate production; the release advertises exactly its passed capability set; rollback/recovery has been rehearsed with the actual schema version.

**Rollout:** apply a proportionate P29 gate to R1, each R2 content increment, and R3. Operational hardening is continuous; this phase consolidates proof rather than postponing all release work.

<a id="delivery-contracts"></a>

## 6. Cross-phase delivery contracts

### 6.1 Definition of ready

A package is ready only when it has a concrete user outcome, exact source/rules references, accepted dependencies, affected persisted shapes, owner, expected behavior/refusal cases, and a bounded rollout. Any necessary product decision is recorded as a default or explicit unresolved gate. "Implement spells" is not a ready package; "resolve Burning Hands with one shared damage roll, per-target saves, half-damage rounding, selected area, slot spending, durable outcome, and friendly targets" can be.

### 6.2 Definition of done

1. The declared behavior works through a complete user flow, including meaningful refusal and empty/error states.
2. Domain results, resource changes, pending choices, and durable state follow I01–I16.
3. Save/export/import and old-version behavior are defined and tested for any new persisted field.
4. Tests cover independent expected outcomes and relevant failure boundaries; no assertion merely repeats the implementation expression.
5. UI works with keyboard and appropriate accessible labels; private information is excluded from relevant projections.
6. Required repository checks pass, or a pre-existing failure is documented with specific evidence and explicit release disposition.
7. Capability manifest, user documentation, and support/diagnostic behavior reflect the actual implementation.
8. Rollout and rollback/recovery are concrete and compatible with already-written saves.
9. No TODO, disabled button, metadata record, or generic "GM can edit HP" is counted as completion of a promised mechanical behavior.

### 6.3 Branch and pull-request shape for future execution

Use the repository's delivery instructions at implementation time and the default `codex/` branch prefix. Do not combine unrelated rule families or persistence migrations into one unreviewable change. Each PR states the current failure/limitation, the new observable behavior, migration/compatibility impact, and the evidence that matters. Include fixture IDs and screenshots only where they substantiate behavior. Avoid a broad architectural refactor in the same PR as hundreds of content conversions unless a mechanical transformation is independently reviewable.

Recommended progression inside a phase: contract/fixture → smallest end-to-end slice → failure/recovery coverage → additional shared family members → exceptional cases → coverage/release gate. A contract-only PR does not claim the user feature has shipped.

### 6.4 Content completion ledger

Maintain one machine-readable registry with `contentId`, source hash/version, rules edition, behavior IDs, implementation handler/version, relevant phase/issue, capability state, evidence test IDs, manual-adjudication boundary, and known limitations. Suggested capability states: `reference-only`, `specified`, `in-progress`, `partially-supported`, `supported`, `intentionally-excluded`. An intentionally excluded behavior requires a documented scope decision; it is not automatically counted in the supported numerator.

Measure completion at both record and behavior level. A spell with working damage but missing concentration is partial. A feature record that is only an option grouping still needs a verified selection/progression contract but must not inflate the count of implemented active powers. Add source changes as a reviewed diff, not a quiet denominator change.

### 6.5 Dependency and interface change control

Every schema change declares reader/writer compatibility and migration ownership. Every shared rule primitive declares which content contracts it changes. Every protocol change defines mixed-version behavior. Every asset change declares cache and reference lifetime. If a phase discovers a prerequisite not listed here, record a specific dependency edge and move the affected package; do not conceal it in a helper or introduce an undocumented cycle.

The full P13/P20/P21 phases must not depend on each other as whole blocks. Extract shared summoning, transformation, item-casting, or conditional-defense primitives under P08–P13 contracts, then let each content family depend on the particular primitive. A class integration similarly names exact spell families rather than waiting for the entire spell catalogue.

<a id="appendix-a"></a>

## Appendix A — Ready-to-use engineering issue template

Copy this template for a phase package or individual content behavior. Fill decisions with actual answers before implementation; placeholders are not an approved specification.

```text
ID / title:
Owner / reviewer / release:
Parent phase and exact dependency packages:
User problem and concrete before/after example:
Selected content ID(s), edition, source version/hash:
Source rule references and explicit house conventions:
In scope / deliberate exclusions:

Behavior contract:
  Initiator, authority, allowed modes, target types:
  Preconditions, timing window, range/area/sight/cover:
  Required choices and validation:
  Action/bonus/reaction/time/slot/charge/material costs:
  When each cost is reserved, spent, released, or retained:
  Roll procedure, shared/per-target dice, rounding, rerolls:
  Ordered state changes and emitted events:
  Effect duration, stacking, source ownership, removal:
  Refusal codes, recoverable decisions, GM adjudication:
  Cancellation, countering, source death, target deletion:

Data and integration:
  Existing entry points and proposed narrow changes:
  Added persisted fields and runtime validators:
  Derived values and modifier precedence:
  Command payload/version and stable idempotency scope:
  Expected revisions and concurrency conflict behavior:
  Pending-resolution resume contract:
  Migration, archive, unknown-content compatibility:
  GM/player projections and asset/privacy implications:
  Work bounds, performance fixture, diagnostic fields:

User experience:
  Entry point, preview, choice controls, committed result:
  Loading, empty, unavailable, stale, offline, quota states:
  Keyboard/focus/screen-reader/reduced-motion behavior:

Acceptance:
  Given / When / Then cases with independent expected results:
  Boundary and negative cases:
  Cross-feature interaction cases:
  Failure-injection points and retry outcomes:
  Required focused tests, browser journeys, visual evidence:

Delivery:
  Estimate range / confidence / largest uncertainty:
  Feature flag and default behavior for old campaigns:
  Preview qualification and production promotion evidence:
  Rollback or compatible recovery procedure:
  Capability ledger and documentation updates:
  Remaining limitations and follow-up issue IDs:
```

### A.1 Worked example: fix the partial XP award

**Issue:** P01.4 — Award completed-encounter XP in one durable envelope update.

**Problem:** the current loop can save the first Hero, fail the second save, and leave the encounter unmarked. Retrying awards the first Hero again. The audit fixture produced 50/0 XP, then 100/50 after retry.

**Entry points to inspect:** `src/application/commands.js`, `src/storage/entityRepositories.js`, `src/storage/stateRepository.js`, `src/domain/encounter.js`, `src/screens/BattleCompletion.jsx`, and the normalizers that retain Hero/encounter fields.

**Behavior:** accept an encounter reference and stable award identity; reload the authoritative completed encounter; derive defeated eligible foes and unique eligible Hero IDs according to the existing split convention; build one next envelope; set the completed encounter's award marker and recipient provenance; save once. Empty/invalid recipients and non-complete encounter status return a clear refusal or explicitly defined zero-award result. Never trust the displayed total as authority. Preserve the exact status literal used by the model (`complete`).

**Idempotency:** within the existing backend, the durable award identity/result must survive normalizing and reload. Later P03/P05 moves this into the general command-outcome transaction. A restarted battle is a new encounter instance; clicking the same award button twice is not. Decide how duplicate deployed snapshots of one Hero affect recipient eligibility before writing the calculation; default to one award per unique eligible Hero.

**Tests:** two Heroes receive 50/50 or 0/0; failure before active state commit changes neither; retry after lost acknowledgement returns 50/50; duplicate Hero snapshots cannot double a recipient; defeated allies do not fund the pool; stale completion revision refuses/recomputes; zero eligible XP follows the documented rule; malformed prior award records are quarantined rather than blindly replayed. Do not claim every test can use the same injected failure mechanism: distinguish repository exceptions, failed active writes, and committed writes whose presentation fails.

**Delivery:** a focused correctness PR with no unrelated UI redesign; existing completed saves without new provenance have a conservative compatibility rule; rollback retains the fixed writer. P03's transaction is the permanent cross-tab authority boundary, while P01 documents old-client limits.

### A.2 Worked example: Burning Hands behavior issue

**Issue:** `S-burning-hands`, initial P11 slice and final P13 coverage.

**Contract to verify against the selected source:** self-origin cone, selected direction, valid affected creatures/objects, Dexterity saving throws, common rolled fire damage, per-target save/defense resolution, source-defined half damage, slot-level scaling, action and components, and explicitly handled environmental ignition. The area UI previews affected allies as well as enemies. The spell has no concentration ownership.

**Implementation sequence:** validate definition → produce pure area/cost preview → validate cast intent and current actor/targets → reserve or spend at the documented casting stage → resolve one committed damage transcript → resolve per-target saves and modifiers → create typed damage packets → apply vitality/concentration/death consequences through shared handlers → persist outcome → animate/report. Source-defined or house-convention decisions about cover and area origin are explicit inputs, not ad hoc CSS hit testing.

**Interaction cases:** a resistant target, a successful saver, a creature with a relevant save/evasion feature, a target concentrating, a partially obstructed cone, an ally inside the cone, and an actor interrupted at a supported casting window. Reuse shared features only when their phase gate has passed; the initial slice must identify any unavailable integration rather than falsely marking the entire behavior complete.

**Recovery cases:** cancel before submit spends nothing; stale preview does not hit a moved target without revalidation; reload after durable outcome does not roll another damage total; failure after one UI animation does not mean only one target took damage; a countered cast follows the selected source's cost policy rather than a global refund.

<a id="appendix-b"></a>

## Appendix B — All 319 supplied spell work items

This is an exact identifier inventory from the supplied local `5e-SRD-Spells.json`, not a claim that every behavior has already been designed. Each row creates a future `S-<id>` issue owned by P13, with any initial P11 slice linked to the same issue. Concentration and ritual flags below are source metadata that still require a behavior-level review. School, prose, or a damage field alone cannot select a complete handler. Apply Appendix A and P13's family matrix to every row; all work remains unexecuted.

| Work item | Spell | Level | Concentration | Ritual | School |
|---|---|---:|---|---|---|
| S-acid-arrow | Acid Arrow | 2 | No | No | Evocation |
| S-acid-splash | Acid Splash | 0 | No | No | Conjuration |
| S-aid | Aid | 2 | No | No | Abjuration |
| S-alarm | Alarm | 1 | No | Yes | Abjuration |
| S-alter-self | Alter Self | 2 | Yes | No | Transmutation |
| S-animal-friendship | Animal Friendship | 1 | No | No | Enchantment |
| S-animal-messenger | Animal Messenger | 2 | No | Yes | Enchantment |
| S-animal-shapes | Animal Shapes | 8 | Yes | No | Transmutation |
| S-animate-dead | Animate Dead | 3 | No | No | Necromancy |
| S-animate-objects | Animate Objects | 5 | Yes | No | Transmutation |
| S-antilife-shell | Antilife Shell | 5 | Yes | No | Abjuration |
| S-antimagic-field | Antimagic Field | 8 | Yes | No | Abjuration |
| S-antipathy-sympathy | Antipathy/Sympathy | 8 | No | No | Enchantment |
| S-arcane-eye | Arcane Eye | 4 | Yes | No | Divination |
| S-arcane-hand | Arcane Hand | 5 | Yes | No | Evocation |
| S-arcane-lock | Arcane Lock | 2 | No | No | Abjuration |
| S-arcane-sword | Arcane Sword | 7 | Yes | No | Evocation |
| S-arcanists-magic-aura | Arcanist's Magic Aura | 2 | No | No | Illusion |
| S-astral-projection | Astral Projection | 9 | No | No | Necromancy |
| S-augury | Augury | 2 | No | Yes | Divination |
| S-awaken | Awaken | 5 | No | No | Transmutation |
| S-bane | Bane | 1 | Yes | No | Enchantment |
| S-banishment | Banishment | 4 | Yes | No | Abjuration |
| S-barkskin | Barkskin | 2 | Yes | No | Transmutation |
| S-beacon-of-hope | Beacon of Hope | 3 | Yes | No | Abjuration |
| S-bestow-curse | Bestow Curse | 3 | Yes | No | Necromancy |
| S-black-tentacles | Black Tentacles | 4 | Yes | No | Conjuration |
| S-blade-barrier | Blade Barrier | 6 | Yes | No | Evocation |
| S-bless | Bless | 1 | Yes | No | Enchantment |
| S-blight | Blight | 4 | No | No | Necromancy |
| S-blindness-deafness | Blindness/Deafness | 2 | No | No | Necromancy |
| S-blink | Blink | 3 | No | No | Transmutation |
| S-blur | Blur | 2 | Yes | No | Illusion |
| S-branding-smite | Branding Smite | 2 | Yes | No | Evocation |
| S-burning-hands | Burning Hands | 1 | No | No | Evocation |
| S-call-lightning | Call Lightning | 3 | Yes | No | Conjuration |
| S-calm-emotions | Calm Emotions | 2 | Yes | No | Enchantment |
| S-chain-lightning | Chain Lightning | 6 | No | No | Evocation |
| S-charm-person | Charm Person | 1 | No | No | Enchantment |
| S-chill-touch | Chill Touch | 0 | No | No | Necromancy |
| S-circle-of-death | Circle of Death | 6 | No | No | Necromancy |
| S-clairvoyance | Clairvoyance | 3 | Yes | No | Divination |
| S-clone | Clone | 8 | No | No | Necromancy |
| S-cloudkill | Cloudkill | 5 | Yes | No | Conjuration |
| S-color-spray | Color Spray | 1 | No | No | Illusion |
| S-command | Command | 1 | No | No | Enchantment |
| S-commune | Commune | 5 | No | Yes | Divination |
| S-commune-with-nature | Commune With Nature | 5 | No | Yes | Divination |
| S-comprehend-languages | Comprehend Languages | 1 | No | Yes | Divination |
| S-compulsion | Compulsion | 4 | Yes | No | Enchantment |
| S-cone-of-cold | Cone of Cold | 5 | No | No | Evocation |
| S-confusion | Confusion | 4 | Yes | No | Enchantment |
| S-conjure-animals | Conjure Animals | 3 | Yes | No | Conjuration |
| S-conjure-celestial | Conjure Celestial | 7 | Yes | No | Conjuration |
| S-conjure-elemental | Conjure Elemental | 5 | Yes | No | Conjuration |
| S-conjure-fey | Conjure Fey | 6 | Yes | No | Conjuration |
| S-conjure-minor-elementals | Conjure Minor Elementals | 4 | Yes | No | Conjuration |
| S-conjure-woodland-beings | Conjure Woodland Beings | 4 | Yes | No | Conjuration |
| S-contact-other-plane | Contact Other Plane | 5 | No | Yes | Divination |
| S-contagion | Contagion | 5 | No | No | Necromancy |
| S-contingency | Contingency | 6 | No | No | Evocation |
| S-continual-flame | Continual Flame | 2 | No | No | Evocation |
| S-control-water | Control Water | 4 | Yes | No | Transmutation |
| S-control-weather | Control Weather | 8 | Yes | No | Transmutation |
| S-counterspell | Counterspell | 3 | No | No | Abjuration |
| S-create-food-and-water | Create Food and Water | 3 | No | No | Conjuration |
| S-create-or-destroy-water | Create or Destroy Water | 1 | No | No | Transmutation |
| S-create-undead | Create Undead | 6 | No | No | Necromancy |
| S-creation | Creation | 5 | No | No | Illusion |
| S-cure-wounds | Cure Wounds | 1 | No | No | Evocation |
| S-dancing-lights | Dancing Lights | 0 | Yes | No | Evocation |
| S-darkness | Darkness | 2 | Yes | No | Evocation |
| S-darkvision | Darkvision | 2 | No | No | Transmutation |
| S-daylight | Daylight | 3 | No | No | Evocation |
| S-death-ward | Death Ward | 4 | No | No | Abjuration |
| S-delayed-blast-fireball | Delayed Blast Fireball | 7 | Yes | No | Evocation |
| S-demiplane | Demiplane | 8 | No | No | Conjuration |
| S-detect-evil-and-good | Detect Evil and Good | 1 | Yes | No | Divination |
| S-detect-magic | Detect Magic | 1 | Yes | Yes | Divination |
| S-detect-poison-and-disease | Detect Poison and Disease | 1 | Yes | Yes | Divination |
| S-detect-thoughts | Detect Thoughts | 2 | Yes | No | Divination |
| S-dimension-door | Dimension Door | 4 | No | No | Conjuration |
| S-disguise-self | Disguise Self | 1 | No | No | Illusion |
| S-disintegrate | Disintegrate | 6 | No | No | Transmutation |
| S-dispel-evil-and-good | Dispel Evil and Good | 5 | Yes | No | Abjuration |
| S-dispel-magic | Dispel Magic | 3 | No | No | Abjuration |
| S-divination | Divination | 4 | No | Yes | Divination |
| S-divine-favor | Divine Favor | 1 | Yes | No | Evocation |
| S-divine-word | Divine Word | 7 | No | No | Evocation |
| S-dominate-beast | Dominate Beast | 4 | Yes | No | Enchantment |
| S-dominate-monster | Dominate Monster | 8 | Yes | No | Enchantment |
| S-dominate-person | Dominate Person | 5 | Yes | No | Enchantment |
| S-dream | Dream | 5 | No | No | Illusion |
| S-druidcraft | Druidcraft | 0 | No | No | Transmutation |
| S-earthquake | Earthquake | 8 | Yes | No | Evocation |
| S-eldritch-blast | Eldritch Blast | 0 | No | No | Evocation |
| S-enhance-ability | Enhance Ability | 2 | Yes | No | Transmutation |
| S-enlarge-reduce | Enlarge/Reduce | 2 | Yes | No | Transmutation |
| S-entangle | Entangle | 1 | Yes | No | Conjuration |
| S-enthrall | Enthrall | 2 | No | No | Enchantment |
| S-etherealness | Etherealness | 7 | No | No | Transmutation |
| S-expeditious-retreat | Expeditious Retreat | 1 | Yes | No | Transmutation |
| S-eyebite | Eyebite | 6 | Yes | No | Necromancy |
| S-fabricate | Fabricate | 4 | No | No | Transmutation |
| S-faerie-fire | Faerie Fire | 1 | Yes | No | Evocation |
| S-faithful-hound | Faithful Hound | 4 | No | No | Conjuration |
| S-false-life | False Life | 1 | No | No | Necromancy |
| S-fear | Fear | 3 | Yes | No | Illusion |
| S-feather-fall | Feather Fall | 1 | No | No | Transmutation |
| S-feeblemind | Feeblemind | 8 | No | No | Enchantment |
| S-find-familiar | Find Familiar | 1 | No | Yes | Conjuration |
| S-find-steed | Find Steed | 2 | No | No | Conjuration |
| S-find-the-path | Find the Path | 6 | Yes | No | Divination |
| S-find-traps | Find Traps | 2 | No | No | Divination |
| S-finger-of-death | Finger of Death | 7 | No | No | Necromancy |
| S-fire-bolt | Fire Bolt | 0 | No | No | Evocation |
| S-fire-shield | Fire Shield | 4 | No | No | Evocation |
| S-fire-storm | Fire Storm | 7 | No | No | Evocation |
| S-fireball | Fireball | 3 | No | No | Evocation |
| S-flame-blade | Flame Blade | 2 | Yes | No | Evocation |
| S-flame-strike | Flame Strike | 5 | No | No | Evocation |
| S-flaming-sphere | Flaming Sphere | 2 | Yes | No | Conjuration |
| S-flesh-to-stone | Flesh to Stone | 6 | Yes | No | Transmutation |
| S-floating-disk | Floating Disk | 1 | No | Yes | Conjuration |
| S-fly | Fly | 3 | Yes | No | Transmutation |
| S-fog-cloud | Fog Cloud | 1 | Yes | No | Conjuration |
| S-forbiddance | Forbiddance | 6 | No | Yes | Abjuration |
| S-forcecage | Forcecage | 7 | No | No | Evocation |
| S-foresight | Foresight | 9 | No | No | Divination |
| S-freedom-of-movement | Freedom of Movement | 4 | No | No | Abjuration |
| S-freezing-sphere | Freezing Sphere | 6 | No | No | Evocation |
| S-gaseous-form | Gaseous Form | 3 | Yes | No | Transmutation |
| S-gate | Gate | 9 | Yes | No | Conjuration |
| S-geas | Geas | 5 | No | No | Enchantment |
| S-gentle-repose | Gentle Repose | 2 | No | Yes | Necromancy |
| S-giant-insect | Giant Insect | 4 | Yes | No | Transmutation |
| S-glibness | Glibness | 8 | No | No | Transmutation |
| S-globe-of-invulnerability | Globe of Invulnerability | 6 | Yes | No | Abjuration |
| S-glyph-of-warding | Glyph of Warding | 3 | No | No | Abjuration |
| S-goodberry | Goodberry | 1 | No | No | Transmutation |
| S-grease | Grease | 1 | No | No | Conjuration |
| S-greater-invisibility | Greater Invisibility | 4 | Yes | No | Illusion |
| S-greater-restoration | Greater Restoration | 5 | No | No | Abjuration |
| S-guardian-of-faith | Guardian of Faith | 4 | No | No | Conjuration |
| S-guards-and-wards | Guards and Wards | 6 | No | No | Abjuration |
| S-guidance | Guidance | 0 | Yes | No | Divination |
| S-guiding-bolt | Guiding Bolt | 1 | No | No | Evocation |
| S-gust-of-wind | Gust of Wind | 2 | Yes | No | Evocation |
| S-hallow | Hallow | 5 | No | No | Evocation |
| S-hallucinatory-terrain | Hallucinatory Terrain | 4 | No | No | Illusion |
| S-harm | Harm | 6 | No | No | Necromancy |
| S-haste | Haste | 3 | Yes | No | Transmutation |
| S-heal | Heal | 6 | No | No | Evocation |
| S-healing-word | Healing Word | 1 | No | No | Evocation |
| S-heat-metal | Heat Metal | 2 | Yes | No | Transmutation |
| S-hellish-rebuke | Hellish Rebuke | 1 | No | No | Evocation |
| S-heroes-feast | Heroes' Feast | 6 | No | No | Conjuration |
| S-heroism | Heroism | 1 | Yes | No | Enchantment |
| S-hideous-laughter | Hideous Laughter | 1 | Yes | No | Enchantment |
| S-hold-monster | Hold Monster | 5 | Yes | No | Enchantment |
| S-hold-person | Hold Person | 2 | Yes | No | Enchantment |
| S-holy-aura | Holy Aura | 8 | Yes | No | Abjuration |
| S-hunters-mark | Hunter's Mark | 1 | Yes | No | Divination |
| S-hypnotic-pattern | Hypnotic Pattern | 3 | Yes | No | Illusion |
| S-ice-storm | Ice Storm | 4 | No | No | Evocation |
| S-identify | Identify | 1 | No | Yes | Divination |
| S-illusory-script | Illusory Script | 1 | No | Yes | Illusion |
| S-imprisonment | Imprisonment | 9 | No | No | Abjuration |
| S-incendiary-cloud | Incendiary Cloud | 8 | Yes | No | Conjuration |
| S-inflict-wounds | Inflict Wounds | 1 | No | No | Necromancy |
| S-insect-plague | Insect Plague | 5 | Yes | No | Conjuration |
| S-instant-summons | Instant Summons | 6 | No | Yes | Conjuration |
| S-invisibility | Invisibility | 2 | Yes | No | Illusion |
| S-irresistible-dance | Irresistible Dance | 6 | Yes | No | Enchantment |
| S-jump | Jump | 1 | No | No | Transmutation |
| S-knock | Knock | 2 | No | No | Transmutation |
| S-legend-lore | Legend Lore | 5 | No | No | Divination |
| S-lesser-restoration | Lesser Restoration | 2 | No | No | Abjuration |
| S-levitate | Levitate | 2 | Yes | No | Transmutation |
| S-light | Light | 0 | No | No | Evocation |
| S-lightning-bolt | Lightning Bolt | 3 | No | No | Evocation |
| S-locate-animals-or-plants | Locate Animals or Plants | 2 | No | Yes | Divination |
| S-locate-creature | Locate Creature | 4 | Yes | No | Divination |
| S-locate-object | Locate Object | 2 | Yes | No | Divination |
| S-longstrider | Longstrider | 1 | No | No | Transmutation |
| S-mage-armor | Mage Armor | 1 | No | No | Abjuration |
| S-mage-hand | Mage Hand | 0 | No | No | Conjuration |
| S-magic-circle | Magic Circle | 3 | No | No | Abjuration |
| S-magic-jar | Magic Jar | 6 | No | No | Necromancy |
| S-magic-missile | Magic Missile | 1 | No | No | Evocation |
| S-magic-mouth | Magic Mouth | 2 | No | Yes | Illusion |
| S-magic-weapon | Magic Weapon | 2 | Yes | No | Transmutation |
| S-magnificent-mansion | Magnificent Mansion | 7 | No | No | Conjuration |
| S-major-image | Major Image | 3 | Yes | No | Illusion |
| S-mass-cure-wounds | Mass Cure Wounds | 5 | No | No | Conjuration |
| S-mass-heal | Mass Heal | 9 | No | No | Conjuration |
| S-mass-healing-word | Mass Healing Word | 3 | No | No | Evocation |
| S-mass-suggestion | Mass Suggestion | 6 | No | No | Enchantment |
| S-maze | Maze | 8 | Yes | No | Conjuration |
| S-meld-into-stone | Meld Into Stone | 3 | No | Yes | Transmutation |
| S-mending | Mending | 0 | No | No | Transmutation |
| S-message | Message | 0 | No | No | Transmutation |
| S-meteor-swarm | Meteor Swarm | 9 | No | No | Evocation |
| S-mind-blank | Mind Blank | 8 | No | No | Abjuration |
| S-minor-illusion | Minor Illusion | 0 | No | No | Illusion |
| S-mirage-arcane | Mirage Arcane | 7 | No | No | Illusion |
| S-mirror-image | Mirror Image | 2 | No | No | Illusion |
| S-mislead | Mislead | 5 | Yes | No | Illusion |
| S-misty-step | Misty Step | 2 | No | No | Conjuration |
| S-modify-memory | Modify Memory | 5 | Yes | No | Enchantment |
| S-moonbeam | Moonbeam | 2 | Yes | No | Evocation |
| S-move-earth | Move Earth | 6 | Yes | No | Transmutation |
| S-nondetection | Nondetection | 3 | No | No | Abjuration |
| S-pass-without-trace | Pass Without Trace | 2 | Yes | No | Abjuration |
| S-passwall | Passwall | 5 | No | No | Transmutation |
| S-phantasmal-killer | Phantasmal Killer | 4 | Yes | No | Illusion |
| S-phantom-steed | Phantom Steed | 3 | No | Yes | Illusion |
| S-planar-ally | Planar Ally | 6 | No | No | Conjuration |
| S-planar-binding | Planar Binding | 5 | No | No | Abjuration |
| S-plane-shift | Plane Shift | 7 | No | No | Conjuration |
| S-plant-growth | Plant Growth | 3 | No | No | Transmutation |
| S-poison-spray | Poison Spray | 0 | No | No | Conjuration |
| S-polymorph | Polymorph | 4 | Yes | No | Transmutation |
| S-power-word-kill | Power Word Kill | 9 | No | No | Enchantment |
| S-power-word-stun | Power Word Stun | 8 | No | No | Enchantment |
| S-prayer-of-healing | Prayer of Healing | 2 | No | No | Evocation |
| S-prestidigitation | Prestidigitation | 0 | No | No | Transmutation |
| S-prismatic-spray | Prismatic Spray | 7 | No | No | Evocation |
| S-prismatic-wall | Prismatic Wall | 9 | No | No | Abjuration |
| S-private-sanctum | Private Sanctum | 4 | No | No | Abjuration |
| S-produce-flame | Produce Flame | 0 | No | No | Conjuration |
| S-programmed-illusion | Programmed Illusion | 6 | No | No | Illusion |
| S-project-image | Project Image | 7 | Yes | No | Illusion |
| S-protection-from-energy | Protection From Energy | 3 | Yes | No | Abjuration |
| S-protection-from-evil-and-good | Protection from Evil and Good | 1 | Yes | No | Abjuration |
| S-protection-from-poison | Protection from Poison | 2 | No | No | Abjuration |
| S-purify-food-and-drink | Purify Food and Drink | 1 | No | Yes | Transmutation |
| S-raise-dead | Raise Dead | 5 | No | No | Necromancy |
| S-ray-of-enfeeblement | Ray of Enfeeblement | 2 | Yes | No | Necromancy |
| S-ray-of-frost | Ray of Frost | 0 | No | No | Evocation |
| S-regenerate | Regenerate | 7 | No | No | Transmutation |
| S-reincarnate | Reincarnate | 5 | No | No | Transmutation |
| S-remove-curse | Remove Curse | 3 | No | No | Abjuration |
| S-resilient-sphere | Resilient Sphere | 4 | Yes | No | Evocation |
| S-resistance | Resistance | 0 | Yes | No | Abjuration |
| S-resurrection | Resurrection | 7 | No | No | Necromancy |
| S-reverse-gravity | Reverse Gravity | 7 | Yes | No | Transmutation |
| S-revivify | Revivify | 3 | No | No | Conjuration |
| S-rope-trick | Rope Trick | 2 | No | No | Transmutation |
| S-sacred-flame | Sacred Flame | 0 | No | No | Evocation |
| S-sanctuary | Sanctuary | 1 | No | No | Abjuration |
| S-scorching-ray | Scorching Ray | 2 | No | No | Evocation |
| S-scrying | Scrying | 5 | Yes | No | Divination |
| S-secret-chest | Secret Chest | 4 | No | No | Conjuration |
| S-see-invisibility | See Invisibility | 2 | No | No | Divination |
| S-seeming | Seeming | 5 | No | No | Illusion |
| S-sending | Sending | 3 | No | No | Evocation |
| S-sequester | Sequester | 7 | No | No | Transmutation |
| S-shapechange | Shapechange | 9 | Yes | No | Transmutation |
| S-shatter | Shatter | 2 | No | No | Evocation |
| S-shield | Shield | 1 | No | No | Abjuration |
| S-shield-of-faith | Shield of Faith | 1 | Yes | No | Abjuration |
| S-shillelagh | Shillelagh | 0 | No | No | Transmutation |
| S-shocking-grasp | Shocking Grasp | 0 | No | No | Evocation |
| S-silence | Silence | 2 | Yes | Yes | Illusion |
| S-silent-image | Silent Image | 1 | Yes | No | Illusion |
| S-simulacrum | Simulacrum | 7 | No | No | Illusion |
| S-sleep | Sleep | 1 | No | No | Enchantment |
| S-sleet-storm | Sleet Storm | 3 | Yes | No | Conjuration |
| S-slow | Slow | 3 | Yes | No | Transmutation |
| S-spare-the-dying | Spare the Dying | 0 | No | No | Necromancy |
| S-speak-with-animals | Speak with Animals | 1 | No | Yes | Divination |
| S-speak-with-dead | Speak with Dead | 3 | No | No | Necromancy |
| S-speak-with-plants | Speak with Plants | 3 | No | No | Transmutation |
| S-spider-climb | Spider Climb | 2 | Yes | No | Transmutation |
| S-spike-growth | Spike Growth | 2 | Yes | No | Transmutation |
| S-spirit-guardians | Spirit Guardians | 3 | Yes | No | Conjuration |
| S-spiritual-weapon | Spiritual Weapon | 2 | No | No | Evocation |
| S-stinking-cloud | Stinking Cloud | 3 | Yes | No | Conjuration |
| S-stone-shape | Stone Shape | 4 | No | No | Transmutation |
| S-stoneskin | Stoneskin | 4 | Yes | No | Abjuration |
| S-storm-of-vengeance | Storm of Vengeance | 9 | Yes | No | Conjuration |
| S-suggestion | Suggestion | 2 | Yes | No | Enchantment |
| S-sunbeam | Sunbeam | 6 | Yes | No | Evocation |
| S-sunburst | Sunburst | 8 | No | No | Evocation |
| S-symbol | Symbol | 7 | No | No | Abjuration |
| S-telekinesis | Telekinesis | 5 | Yes | No | Transmutation |
| S-telepathic-bond | Telepathic Bond | 5 | No | Yes | Divination |
| S-teleport | Teleport | 7 | No | No | Conjuration |
| S-teleportation-circle | Teleportation Circle | 5 | No | No | Conjuration |
| S-thaumaturgy | Thaumaturgy | 0 | No | No | Transmutation |
| S-thunderwave | Thunderwave | 1 | No | No | Evocation |
| S-time-stop | Time Stop | 9 | No | No | Transmutation |
| S-tiny-hut | Tiny Hut | 3 | No | Yes | Evocation |
| S-tongues | Tongues | 3 | No | No | Divination |
| S-transport-via-plants | Transport via Plants | 6 | No | No | Conjuration |
| S-tree-stride | Tree Stride | 5 | Yes | No | Conjuration |
| S-true-polymorph | True Polymorph | 9 | Yes | No | Transmutation |
| S-true-resurrection | True Resurrection | 9 | No | No | Necromancy |
| S-true-seeing | True Seeing | 6 | No | No | Divination |
| S-true-strike | True Strike | 0 | Yes | No | Divination |
| S-unseen-servant | Unseen Servant | 1 | No | Yes | Conjuration |
| S-vampiric-touch | Vampiric Touch | 3 | Yes | No | Necromancy |
| S-vicious-mockery | Vicious Mockery | 0 | No | No | Enchantment |
| S-wall-of-fire | Wall of Fire | 4 | Yes | No | Evocation |
| S-wall-of-force | Wall of Force | 5 | Yes | No | Evocation |
| S-wall-of-ice | Wall of Ice | 6 | Yes | No | Evocation |
| S-wall-of-stone | Wall of Stone | 5 | Yes | No | Evocation |
| S-wall-of-thorns | Wall of Thorns | 6 | Yes | No | Conjuration |
| S-warding-bond | Warding Bond | 2 | No | No | Abjuration |
| S-water-breathing | Water Breathing | 3 | No | Yes | Transmutation |
| S-water-walk | Water Walk | 3 | No | Yes | Transmutation |
| S-web | Web | 2 | Yes | No | Conjuration |
| S-weird | Weird | 9 | Yes | No | Illusion |
| S-wind-walk | Wind Walk | 6 | No | No | Transmutation |
| S-wind-wall | Wind Wall | 3 | Yes | No | Evocation |
| S-wish | Wish | 9 | No | No | Conjuration |
| S-word-of-recall | Word of Recall | 6 | No | No | Conjuration |
| S-zone-of-truth | Zone of Truth | 2 | No | No | Enchantment |

<a id="appendix-c"></a>

## Appendix C — Classes, subclasses, and all 407 feature records

The twelve class packages below consume the supplied feature and level records. Counts include repeated progression increments and selectable child options; they are not a count of independent active abilities. A feature record needs a selection, grant, progression, passive, active, or narrative contract as applicable. The table assigns implementation ownership without pretending prose has been converted into executable rules.

| Class | Supplied subclass | Feature records | Owner |
|---|---|---:|---|
| Barbarian | Berserker | 27 | P16 |
| Bard | Lore | 30 | P18 |
| Cleric | Life | 33 | P17 |
| Druid | Land | 34 | P17 |
| Fighter | Champion | 33 | P15 |
| Monk | Open Hand | 34 | P16 |
| Paladin | Devotion | 32 | P17 |
| Ranger | Hunter | 43 | P17 |
| Rogue | Thief | 27 | P16 |
| Sorcerer | Draconic | 40 | P18 |
| Warlock | Fiend | 56 | P18 |
| Wizard | Evocation | 18 | P15 |

Each `F-<id>` is a future work item using Appendix A. Listed level is the record's source level, not a universal character-level requirement in multiclass play. Parent/child and subclass prerequisites must be reconciled with the heterogeneous level dataset. ASI records link to P19; their owning class phase still proves grant timing.

| Work item | Feature | Class | Source level | Subclass, if recorded | Owner |
|---|---|---|---:|---|---|
| F-barbarian-unarmored-defense | Unarmored Defense | Barbarian | 1 | — | P16 |
| F-rage | Rage | Barbarian | 1 | — | P16 |
| F-danger-sense | Danger Sense | Barbarian | 2 | — | P16 |
| F-reckless-attack | Reckless Attack | Barbarian | 2 | — | P16 |
| F-frenzy | Frenzy | Barbarian | 3 | Berserker | P16 |
| F-primal-path | Primal Path | Barbarian | 3 | — | P16 |
| F-barbarian-ability-score-improvement-1 | Ability Score Improvement | Barbarian | 4 | — | P16 |
| F-barbarian-extra-attack | Extra Attack | Barbarian | 5 | — | P16 |
| F-fast-movement | Fast Movement | Barbarian | 5 | — | P16 |
| F-mindless-rage | Mindless Rage | Barbarian | 6 | Berserker | P16 |
| F-primal-path-improvement-1 | Path feature | Barbarian | 6 | — | P16 |
| F-feral-instinct | Feral Instinct | Barbarian | 7 | — | P16 |
| F-barbarian-ability-score-improvement-2 | Ability Score Improvement | Barbarian | 8 | — | P16 |
| F-brutal-critical-1-die | Brutal Critical (1 die) | Barbarian | 9 | — | P16 |
| F-intimidating-presence | Intimidating Presence | Barbarian | 10 | Berserker | P16 |
| F-primal-path-improvement-2 | Path feature | Barbarian | 10 | — | P16 |
| F-relentless-rage | Relentless Rage | Barbarian | 11 | — | P16 |
| F-barbarian-ability-score-improvement-3 | Ability Score Improvement | Barbarian | 12 | — | P16 |
| F-brutal-critical-2-dice | Brutal Critical (2 dice) | Barbarian | 13 | — | P16 |
| F-primal-path-improvement-3 | Path feature | Barbarian | 14 | — | P16 |
| F-retaliation | Retaliation | Barbarian | 14 | Berserker | P16 |
| F-persistent-rage | Persistent Rage | Barbarian | 15 | — | P16 |
| F-barbarian-ability-score-improvement-4 | Ability Score Improvement | Barbarian | 16 | — | P16 |
| F-brutal-critical-3-dice | Brutal Critical (3 dice) | Barbarian | 17 | — | P16 |
| F-indomitable-might | Indomitable Might | Barbarian | 18 | — | P16 |
| F-barbarian-ability-score-improvement-5 | Ability Score Improvement | Barbarian | 19 | — | P16 |
| F-primal-champion | Primal Champion | Barbarian | 20 | — | P16 |
| F-bardic-inspiration-d6 | Bardic Inspiration (d6) | Bard | 1 | — | P18 |
| F-spellcasting-bard | Spellcasting: Bard | Bard | 1 | — | P18 |
| F-jack-of-all-trades | Jack of All Trades | Bard | 2 | — | P18 |
| F-song-of-rest-d6 | Song of Rest (d6) | Bard | 2 | — | P18 |
| F-bard-college | Bard College | Bard | 3 | — | P18 |
| F-bard-expertise-1 | Expertise | Bard | 3 | — | P18 |
| F-bonus-proficiencies | Bonus Proficiencies | Bard | 3 | Lore | P18 |
| F-cutting-words | Cutting Words | Bard | 3 | Lore | P18 |
| F-bard-ability-score-improvement-1 | Ability Score Improvement | Bard | 4 | — | P18 |
| F-bardic-inspiration-d8 | Bardic Inspiration (d8) | Bard | 5 | — | P18 |
| F-font-of-inspiration | Font of Inspiration | Bard | 5 | — | P18 |
| F-additional-magical-secrets | Additional Magical Secrets | Bard | 6 | Lore | P18 |
| F-bard-college-improvement-1 | Bard College feature | Bard | 6 | — | P18 |
| F-countercharm | Countercharm | Bard | 6 | — | P18 |
| F-bard-ability-score-improvement-2 | Ability Score Improvement | Bard | 8 | — | P18 |
| F-song-of-rest-d8 | Song of Rest (d8) | Bard | 9 | — | P18 |
| F-bard-expertise-2 | Expertise | Bard | 10 | — | P18 |
| F-bardic-inspiration-d10 | Bardic Inspiration (d10) | Bard | 10 | — | P18 |
| F-magical-secrets-1 | Magical Secrets | Bard | 10 | — | P18 |
| F-bard-ability-score-improvement-3 | Ability Score Improvement | Bard | 12 | — | P18 |
| F-song-of-rest-d10 | Song of Rest (d10) | Bard | 13 | — | P18 |
| F-bard-college-improvement-2 | Bard College feature | Bard | 14 | — | P18 |
| F-magical-secrets-2 | Magical Secrets | Bard | 14 | — | P18 |
| F-peerless-skill | Peerless Skill | Bard | 14 | Lore | P18 |
| F-bardic-inspiration-d12 | Bardic Inspiration (d12) | Bard | 15 | — | P18 |
| F-bard-ability-score-improvement-4 | Ability Score Improvement | Bard | 16 | — | P18 |
| F-song-of-rest-d12 | Song of Rest (d12) | Bard | 17 | — | P18 |
| F-magical-secrets-3 | Magical Secrets | Bard | 18 | — | P18 |
| F-bard-ability-score-improvement-5 | Ability Score Improvement | Bard | 19 | — | P18 |
| F-superior-inspiration | Superior Inspiration | Bard | 20 | — | P18 |
| F-bonus-proficiency | Bonus Proficiency | Cleric | 1 | Life | P17 |
| F-disciple-of-life | Disciple of Life | Cleric | 1 | Life | P17 |
| F-divine-domain | Divine Domain | Cleric | 1 | — | P17 |
| F-domain-spells-1 | Domain Spells | Cleric | 1 | — | P17 |
| F-spellcasting-cleric | Spellcasting: Cleric | Cleric | 1 | — | P17 |
| F-channel-divinity-1-rest | Channel Divinity (1/rest) | Cleric | 2 | — | P17 |
| F-channel-divinity-preserve-life | Channel Divinity: Preserve Life | Cleric | 2 | Life | P17 |
| F-channel-divinity-turn-undead | Channel Divinity: Turn Undead | Cleric | 2 | — | P17 |
| F-divine-domain-improvement-1 | Divine Domain feature | Cleric | 2 | — | P17 |
| F-domain-spells-2 | Domain Spells | Cleric | 3 | — | P17 |
| F-cleric-ability-score-improvement-1 | Ability Score Improvement | Cleric | 4 | — | P17 |
| F-destroy-undead-cr-1-2-or-below | Destroy Undead (CR 1/2 or below) | Cleric | 5 | — | P17 |
| F-domain-spells-3 | Domain Spells | Cleric | 5 | — | P17 |
| F-blessed-healer | Blessed Healer | Cleric | 6 | Life | P17 |
| F-channel-divinity-2-rest | Channel Divinity (2/rest) | Cleric | 6 | — | P17 |
| F-divine-domain-improvement-2 | Divine Domain feature | Cleric | 6 | — | P17 |
| F-domain-spells-4 | Domain Spells | Cleric | 7 | — | P17 |
| F-cleric-ability-score-improvement-2 | Ability Score Improvement | Cleric | 8 | — | P17 |
| F-destroy-undead-cr-1-or-below | Destroy Undead (CR 1 or below) | Cleric | 8 | — | P17 |
| F-divine-domain-improvement-3 | Divine Domain feature | Cleric | 8 | — | P17 |
| F-divine-strike | Divine Strike | Cleric | 8 | Life | P17 |
| F-domain-spells-5 | Domain Spells | Cleric | 9 | — | P17 |
| F-divine-intervention | Divine Intervention | Cleric | 10 | — | P17 |
| F-destroy-undead-cr-2-or-below | Destroy Undead (CR 2 or below) | Cleric | 11 | — | P17 |
| F-cleric-ability-score-improvement-3 | Ability Score Improvement | Cleric | 12 | — | P17 |
| F-destroy-undead-cr-3-or-below | Destroy Undead (CR 3 or below) | Cleric | 14 | — | P17 |
| F-cleric-ability-score-improvement-4 | Ability Score Improvement | Cleric | 16 | — | P17 |
| F-destroy-undead-cr-4-or-below | Destroy Undead (CR 4 or below) | Cleric | 17 | — | P17 |
| F-divine-domain-improvement-4 | Divine Domain feature | Cleric | 17 | — | P17 |
| F-supreme-healing | Supreme Healing | Cleric | 17 | — | P17 |
| F-channel-divinity-3-rest | Channel Divinity (3/rest) | Cleric | 18 | — | P17 |
| F-cleric-ability-score-improvement-5 | Ability Score Improvement | Cleric | 19 | — | P17 |
| F-divine-intervention-improvement | Divine Intervention Improvement | Cleric | 20 | — | P17 |
| F-druidic | Druidic | Druid | 1 | — | P17 |
| F-spellcasting-druid | Spellcasting: Druid | Druid | 1 | — | P17 |
| F-bonus-cantrip | Bonus Cantrip | Druid | 2 | Land | P17 |
| F-circle-of-the-land | Circle of the Land | Druid | 2 | Land | P17 |
| F-circle-of-the-land-arctic | Circle of the Land: Arctic | Druid | 2 | Land | P17 |
| F-circle-of-the-land-coast | Circle of the Land: Coast | Druid | 2 | Land | P17 |
| F-circle-of-the-land-desert | Circle of the Land: Desert | Druid | 2 | Land | P17 |
| F-circle-of-the-land-forest | Circle of the Land: Forest | Druid | 2 | Land | P17 |
| F-circle-of-the-land-grassland | Circle of the Land: Grassland | Druid | 2 | Land | P17 |
| F-circle-of-the-land-mountain | Circle of the Land: Mountain | Druid | 2 | Land | P17 |
| F-circle-of-the-land-swamp | Circle of the Land: Swamp | Druid | 2 | Land | P17 |
| F-druid-circle | Druid Circle | Druid | 2 | — | P17 |
| F-natural-recovery | Natural Recovery | Druid | 2 | Land | P17 |
| F-wild-shape-cr-1-4-or-below-no-flying-or-swim-speed | Wild Shape (CR 1/4 or below, no flying or swim speed) | Druid | 2 | — | P17 |
| F-circle-spells-1 | Circle Spells | Druid | 3 | Land | P17 |
| F-druid-ability-score-improvement-1 | Ability Score Improvement | Druid | 4 | — | P17 |
| F-wild-shape-cr-1-2-or-below-no-flying-speed | Wild Shape (CR 1/2 or below, no flying speed) | Druid | 4 | — | P17 |
| F-circle-spells-2 | Circle Spells | Druid | 5 | Land | P17 |
| F-druid-circle-improvement-1 | Druid Circle feature | Druid | 6 | — | P17 |
| F-druid-lands-stride | Land's Stride | Druid | 6 | Land | P17 |
| F-circle-spells-3 | Circle Spells | Druid | 7 | Land | P17 |
| F-druid-ability-score-improvement-2 | Ability Score Improvement | Druid | 8 | — | P17 |
| F-wild-shape-cr-1-or-below | Wild Shape (CR 1 or below) | Druid | 8 | — | P17 |
| F-circle-spells-4 | Circle Spells | Druid | 9 | Land | P17 |
| F-druid-circle-improvement-2 | Druid Circle feature | Druid | 10 | — | P17 |
| F-natures-ward | Nature's Ward | Druid | 10 | Land | P17 |
| F-druid-ability-score-improvement-3 | Ability Score Improvement | Druid | 12 | — | P17 |
| F-druid-circle-improvement-3 | Druid Circle feature | Druid | 14 | — | P17 |
| F-natures-sanctuary | Nature's Sanctuary | Druid | 14 | Land | P17 |
| F-druid-ability-score-improvement-4 | Ability Score Improvement | Druid | 16 | — | P17 |
| F-beast-spells | Beast Spells | Druid | 18 | — | P17 |
| F-druid-timeless-body | Timeless Body | Druid | 18 | — | P17 |
| F-druid-ability-score-improvement-5 | Ability Score Improvement | Druid | 19 | — | P17 |
| F-archdruid | Archdruid | Druid | 20 | — | P17 |
| F-fighter-fighting-style | Fighting Style | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-archery | Fighting Style: Archery | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-defense | Fighting Style: Defense | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-dueling | Fighting Style: Dueling | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-great-weapon-fighting | Fighting Style: Great Weapon Fighting | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-protection | Fighting Style: Protection | Fighter | 1 | — | P15 |
| F-fighter-fighting-style-two-weapon-fighting | Fighting Style: Two-Weapon Fighting | Fighter | 1 | — | P15 |
| F-second-wind | Second Wind | Fighter | 1 | — | P15 |
| F-action-surge-1-use | Action Surge (1 use) | Fighter | 2 | — | P15 |
| F-improved-critical | Improved Critical | Fighter | 3 | Champion | P15 |
| F-martial-archetype | Martial Archetype | Fighter | 3 | — | P15 |
| F-fighter-ability-score-improvement-1 | Ability Score Improvement | Fighter | 4 | — | P15 |
| F-extra-attack-1 | Extra Attack | Fighter | 5 | — | P15 |
| F-fighter-ability-score-improvement-2 | Ability Score Improvement | Fighter | 6 | — | P15 |
| F-martial-archetype-improvement-1 | Martial Archetype feature | Fighter | 7 | — | P15 |
| F-remarkable-athlete | Remarkable Athlete | Fighter | 7 | Champion | P15 |
| F-fighter-ability-score-improvement-3 | Ability Score Improvement | Fighter | 8 | — | P15 |
| F-indomitable-1-use | Indomitable (1 use) | Fighter | 9 | — | P15 |
| F-additional-fighting-style | Additional Fighting Style | Fighter | 10 | Champion | P15 |
| F-martial-archetype-improvement-2 | Martial Archetype feature | Fighter | 10 | — | P15 |
| F-extra-attack-2 | Extra Attack (2) | Fighter | 11 | — | P15 |
| F-fighter-ability-score-improvement-4 | Ability Score Improvement | Fighter | 12 | — | P15 |
| F-indomitable-2-uses | Indomitable (2 uses) | Fighter | 13 | — | P15 |
| F-fighter-ability-score-improvement-5 | Ability Score Improvement | Fighter | 14 | — | P15 |
| F-martial-archetype-improvement-3 | Martial Archetype feature | Fighter | 15 | — | P15 |
| F-superior-critical | Superior Critical | Fighter | 15 | Champion | P15 |
| F-fighter-ability-score-improvement-6 | Ability Score Improvement | Fighter | 16 | — | P15 |
| F-action-surge-2-uses | Action Surge (2 uses) | Fighter | 17 | — | P15 |
| F-indomitable-3-uses | Indomitable (3 uses) | Fighter | 17 | — | P15 |
| F-martial-archetype-improvement-4 | Martial Archetype feature | Fighter | 18 | — | P15 |
| F-survivor | Survivor | Fighter | 18 | Champion | P15 |
| F-fighter-ability-score-improvement-7 | Ability Score Improvement | Fighter | 19 | — | P15 |
| F-extra-attack-3 | Extra Attack (3) | Fighter | 20 | — | P15 |
| F-martial-arts | Martial Arts | Monk | 1 | — | P16 |
| F-monk-unarmored-defense | Unarmored Defense | Monk | 1 | — | P16 |
| F-flurry-of-blows | Flurry of Blows | Monk | 2 | — | P16 |
| F-ki | Ki | Monk | 2 | — | P16 |
| F-patient-defense | Patient Defense | Monk | 2 | — | P16 |
| F-step-of-the-wind | Step of the Wind | Monk | 2 | — | P16 |
| F-unarmored-movement-1 | Unarmored Movement | Monk | 2 | — | P16 |
| F-deflect-missiles | Deflect Missiles | Monk | 3 | — | P16 |
| F-monastic-tradition | Monastic Tradition | Monk | 3 | — | P16 |
| F-open-hand-technique | Open Hand Technique | Monk | 3 | Open Hand | P16 |
| F-monk-ability-score-improvement-1 | Ability Score Improvement | Monk | 4 | — | P16 |
| F-slow-fall | Slow Fall | Monk | 4 | — | P16 |
| F-monk-extra-attack | Extra Attack | Monk | 5 | — | P16 |
| F-stunning-strike | Stunning Strike | Monk | 5 | — | P16 |
| F-ki-empowered-strikes | Ki Empowered Strikes | Monk | 6 | — | P16 |
| F-monastic-tradition-improvement-1 | Monastic Tradition feature | Monk | 6 | — | P16 |
| F-wholeness-of-body | Wholeness of Body | Monk | 6 | Open Hand | P16 |
| F-monk-evasion | Evasion | Monk | 7 | — | P16 |
| F-stillness-of-mind | Stillness of Mind | Monk | 7 | — | P16 |
| F-monk-ability-score-improvement-2 | Ability Score Improvement | Monk | 8 | — | P16 |
| F-unarmored-movement-2 | Unarmored Movement | Monk | 9 | — | P16 |
| F-purity-of-body | Purity of Body | Monk | 10 | — | P16 |
| F-monastic-tradition-improvement-2 | Monastic Tradition feature | Monk | 11 | — | P16 |
| F-tranquility | Tranquility | Monk | 11 | Open Hand | P16 |
| F-monk-ability-score-improvement-3 | Ability Score Improvement | Monk | 12 | — | P16 |
| F-tongue-of-the-sun-and-moon | Tongue of the Sun and Moon | Monk | 13 | — | P16 |
| F-diamond-soul | Diamond Soul | Monk | 14 | — | P16 |
| F-monk-timeless-body | Timeless Body | Monk | 15 | — | P16 |
| F-monk-ability-score-improvement-4 | Ability Score Improvement | Monk | 16 | — | P16 |
| F-monastic-tradition-improvement-3 | Monastic Tradition feature | Monk | 17 | — | P16 |
| F-quivering-palm | Quivering Palm | Monk | 17 | Open Hand | P16 |
| F-empty-body | Empty Body | Monk | 18 | — | P16 |
| F-monk-ability-score-improvement-5 | Ability Score Improvement | Monk | 19 | — | P16 |
| F-perfect-self | Perfect Self | Monk | 20 | — | P16 |
| F-divine-sense | Divine Sense | Paladin | 1 | — | P17 |
| F-lay-on-hands | Lay on Hands | Paladin | 1 | — | P17 |
| F-divine-smite | Divine Smite | Paladin | 2 | — | P17 |
| F-fighting-style-defense | Fighting Style: Defense | Paladin | 2 | — | P17 |
| F-fighting-style-dueling | Fighting Style: Dueling | Paladin | 2 | — | P17 |
| F-fighting-style-great-weapon-fighting | Fighting Style: Great Weapon Fighting | Paladin | 2 | — | P17 |
| F-fighting-style-protection | Fighting Style: Protection | Paladin | 2 | — | P17 |
| F-paladin-fighting-style | Fighting Style | Paladin | 2 | — | P17 |
| F-spellcasting-paladin | Spellcasting: Paladin | Paladin | 2 | — | P17 |
| F-channel-divinity | Channel Divinity | Paladin | 3 | — | P17 |
| F-channel-divinity-sacred-weapon | Channel Divinity: Sacred Weapon | Paladin | 3 | Devotion | P17 |
| F-channel-divinity-turn-the-unholy | Channel Divinity: Turn the Unholy | Paladin | 3 | Devotion | P17 |
| F-divine-health | Divine Health | Paladin | 3 | — | P17 |
| F-oath-spells | Oath Spells | Paladin | 3 | — | P17 |
| F-sacred-oath | Sacred Oath | Paladin | 3 | — | P17 |
| F-paladin-ability-score-improvement-1 | Ability Score Improvement | Paladin | 4 | — | P17 |
| F-paladin-extra-attack | Extra Attack | Paladin | 5 | — | P17 |
| F-aura-of-protection | Aura of Protection | Paladin | 6 | — | P17 |
| F-aura-of-devotion | Aura of Devotion | Paladin | 7 | Devotion | P17 |
| F-sacred-oath-improvement-1 | Sacred Oath feature | Paladin | 7 | — | P17 |
| F-paladin-ability-score-improvement-2 | Ability Score Improvement | Paladin | 8 | — | P17 |
| F-aura-of-courage | Aura of Courage | Paladin | 10 | — | P17 |
| F-improved-divine-smite | Improved Divine Smite | Paladin | 11 | — | P17 |
| F-paladin-ability-score-improvement-3 | Ability Score Improvement | Paladin | 12 | — | P17 |
| F-cleansing-touch | Cleansing Touch | Paladin | 14 | — | P17 |
| F-purity-of-spirit | Purity of Spirit | Paladin | 15 | Devotion | P17 |
| F-sacred-oath-improvement-2 | Sacred Oath feature | Paladin | 15 | — | P17 |
| F-paladin-ability-score-improvement-4 | Ability Score Improvement | Paladin | 16 | — | P17 |
| F-aura-improvements | Aura improvements | Paladin | 18 | — | P17 |
| F-paladin-ability-score-improvement-5 | Ability Score Improvement | Paladin | 19 | — | P17 |
| F-holy-nimbus | Holy Nimbus | Paladin | 20 | Devotion | P17 |
| F-sacred-oath-improvement-3 | Sacred Oath feature | Paladin | 20 | — | P17 |
| F-favored-enemy-1-type | Favored Enemy (1 type) | Ranger | 1 | — | P17 |
| F-natural-explorer-1-terrain-type | Natural Explorer (1 terrain type) | Ranger | 1 | — | P17 |
| F-ranger-fighting-style | Fighting Style | Ranger | 2 | — | P17 |
| F-ranger-fighting-style-archery | Fighting Style: Archery | Ranger | 2 | — | P17 |
| F-ranger-fighting-style-defense | Fighting Style: Defense | Ranger | 2 | — | P17 |
| F-ranger-fighting-style-dueling | Fighting Style: Dueling | Ranger | 2 | — | P17 |
| F-ranger-fighting-style-two-weapon-fighting | Fighting Style: Two-Weapon Fighting | Ranger | 2 | — | P17 |
| F-spellcasting-ranger | Spellcasting: Ranger | Ranger | 2 | — | P17 |
| F-hunters-prey | Hunter's Prey | Ranger | 3 | Hunter | P17 |
| F-hunters-prey-colossus-slayer | Hunter's Prey: Colossus Slayer | Ranger | 3 | Hunter | P17 |
| F-hunters-prey-giant-killer | Hunter's Prey: Giant Killer | Ranger | 3 | Hunter | P17 |
| F-hunters-prey-horde-breaker | Hunter's Prey: Horde Breaker | Ranger | 3 | Hunter | P17 |
| F-primeval-awareness | Primeval Awareness | Ranger | 3 | — | P17 |
| F-ranger-archetype | Ranger Archetype | Ranger | 3 | — | P17 |
| F-ranger-ability-score-improvement-1 | Ability Score Improvement | Ranger | 4 | — | P17 |
| F-ranger-extra-attack | Extra Attack | Ranger | 5 | — | P17 |
| F-favored-enemy-2-types | Favored Enemy (2 types) | Ranger | 6 | — | P17 |
| F-natural-explorer-2-terrain-types | Natural Explorer (2 terrain types) | Ranger | 6 | — | P17 |
| F-defensive-tactics | Defensive Tactics | Ranger | 7 | Hunter | P17 |
| F-defensive-tactics-escape-the-horde | Defensive Tactics: Escape the Horde | Ranger | 7 | Hunter | P17 |
| F-defensive-tactics-multiattack-defense | Defensive Tactics: Multiattack Defense | Ranger | 7 | Hunter | P17 |
| F-defensive-tactics-steel-will | Defensive Tactics: Steel Will | Ranger | 7 | Hunter | P17 |
| F-ranger-archetype-improvement-1 | Ranger Archetype feature | Ranger | 7 | — | P17 |
| F-ranger-ability-score-improvement-2 | Ability Score Improvement | Ranger | 8 | — | P17 |
| F-ranger-lands-stride | Land's Stride | Ranger | 8 | — | P17 |
| F-hide-in-plain-sight | Hide in Plain Sight | Ranger | 10 | — | P17 |
| F-natural-explorer-3-terrain-types | Natural Explorer (3 terrain types) | Ranger | 10 | — | P17 |
| F-multiattack | Multiattack | Ranger | 11 | Hunter | P17 |
| F-multiattack-volley | Multiattack: Volley | Ranger | 11 | Hunter | P17 |
| F-multiattack-whirlwind-attack | Multiattack: Whirlwind Attack | Ranger | 11 | Hunter | P17 |
| F-ranger-archetype-improvement-2 | Ranger Archetype feature | Ranger | 11 | — | P17 |
| F-ranger-ability-score-improvement-3 | Ability Score Improvement | Ranger | 12 | — | P17 |
| F-favored-enemy-3-enemies | Favored Enemy (3 enemies) | Ranger | 14 | — | P17 |
| F-vanish | Vanish | Ranger | 14 | — | P17 |
| F-ranger-archetype-improvement-3 | Ranger Archetype feature | Ranger | 15 | — | P17 |
| F-superior-hunters-defense | Superior Hunter's Defense | Ranger | 15 | Hunter | P17 |
| F-superior-hunters-defense-evasion | Superior Hunter's Defense: Evasion | Ranger | 15 | Hunter | P17 |
| F-superior-hunters-defense-stand-against-the-tide | Superior Hunter's Defense: Stand Against the Tide | Ranger | 15 | Hunter | P17 |
| F-superior-hunters-defense-uncanny-dodge | Superior Hunter's Defense: Uncanny Dodge | Ranger | 15 | Hunter | P17 |
| F-ranger-ability-score-improvement-4 | Ability Score Improvement | Ranger | 16 | — | P17 |
| F-feral-senses | Feral Senses | Ranger | 18 | — | P17 |
| F-ranger-ability-score-improvement-5 | Ability Score Improvement | Ranger | 19 | — | P17 |
| F-foe-slayer | Foe Slayer | Ranger | 20 | — | P17 |
| F-rogue-expertise-1 | Expertise | Rogue | 1 | — | P16 |
| F-sneak-attack | Sneak Attack | Rogue | 1 | — | P16 |
| F-thieves-cant | Thieves' Cant | Rogue | 1 | — | P16 |
| F-cunning-action | Cunning Action | Rogue | 2 | — | P16 |
| F-fast-hands | Fast Hands | Rogue | 3 | Thief | P16 |
| F-roguish-archetype | Roguish Archetype | Rogue | 3 | — | P16 |
| F-second-story-work | Second-Story Work | Rogue | 3 | Thief | P16 |
| F-rogue-ability-score-improvement-1 | Ability Score Improvement | Rogue | 4 | — | P16 |
| F-uncanny-dodge | Uncanny Dodge | Rogue | 5 | — | P16 |
| F-rogue-expertise-2 | Expertise | Rogue | 6 | — | P16 |
| F-rogue-evasion | Evasion | Rogue | 7 | — | P16 |
| F-rogue-ability-score-improvement-2 | Ability Score Improvement | Rogue | 8 | — | P16 |
| F-roguish-archetype-improvement-1 | Roguish Archetype feature | Rogue | 9 | — | P16 |
| F-supreme-sneak | Supreme Sneak | Rogue | 9 | Thief | P16 |
| F-rogue-ability-score-improvement-3 | Ability Score Improvement | Rogue | 10 | — | P16 |
| F-reliable-talent | Reliable Talent | Rogue | 11 | — | P16 |
| F-rogue-ability-score-improvement-4 | Ability Score Improvement | Rogue | 12 | — | P16 |
| F-roguish-archetype-improvement-2 | Roguish Archetype feature | Rogue | 13 | — | P16 |
| F-use-magic-device | Use Magic Device | Rogue | 13 | Thief | P16 |
| F-blindsense | Blindsense | Rogue | 14 | — | P16 |
| F-slippery-mind | Slippery Mind | Rogue | 15 | — | P16 |
| F-rogue-ability-score-improvement-5 | Ability Score Improvement | Rogue | 16 | — | P16 |
| F-roguish-archetype-improvement-3 | Roguish Archetype feature | Rogue | 17 | — | P16 |
| F-thiefs-reflexes | Thief's Reflexes | Rogue | 17 | Thief | P16 |
| F-elusive | Elusive | Rogue | 18 | — | P16 |
| F-rogue-ability-score-improvement-6 | Ability Score Improvement | Rogue | 19 | — | P16 |
| F-stroke-of-luck | Stroke of Luck | Rogue | 20 | — | P16 |
| F-draconic-resilience | Draconic Resilience | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor | Dragon Ancestor | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-black---acid-damage | Dragon Ancestor: Black - Acid Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-blue---lightning-damage | Dragon Ancestor: Blue - Lightning Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-brass---fire-damage | Dragon Ancestor: Brass - Fire Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-bronze---lightning-damage | Dragon Ancestor: Bronze - Lightning Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-copper---acid-damage | Dragon Ancestor: Copper - Acid Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-gold---fire-damage | Dragon Ancestor: Gold - Fire Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-green---poison-damage | Dragon Ancestor: Green - Poison Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-red---fire-damage | Dragon Ancestor: Red - Fire Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-silver---cold-damage | Dragon Ancestor: Silver - Cold Damage | Sorcerer | 1 | Draconic | P18 |
| F-dragon-ancestor-white---cold-damage | Dragon Ancestor: White - Cold Damage | Sorcerer | 1 | Draconic | P18 |
| F-sorcerous-origin | Sorcerous Origin | Sorcerer | 1 | — | P18 |
| F-spellcasting-sorcerer | Spellcasting: Sorcerer | Sorcerer | 1 | — | P18 |
| F-flexible-casting-converting-spell-slot | Flexible Casting: Converting Spell Slot | Sorcerer | 2 | — | P18 |
| F-flexible-casting-creating-spell-slots | Flexible Casting: Creating Spell Slots | Sorcerer | 2 | — | P18 |
| F-font-of-magic | Font of Magic | Sorcerer | 2 | — | P18 |
| F-metamagic-1 | Metamagic | Sorcerer | 3 | — | P18 |
| F-metamagic-careful-spell | Metamagic: Careful Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-distant-spell | Metamagic: Distant Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-empowered-spell | Metamagic: Empowered Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-extended-spell | Metamagic: Extended Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-heightened-spell | Metamagic: Heightened Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-quickened-spell | Metamagic: Quickened Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-subtle-spell | Metamagic: Subtle Spell | Sorcerer | 3 | — | P18 |
| F-metamagic-twinned-spell | Metamagic: Twinned Spell | Sorcerer | 3 | — | P18 |
| F-sorcerer-ability-score-improvement-1 | Ability Score Improvement | Sorcerer | 4 | — | P18 |
| F-elemental-affinity | Elemental Affinity | Sorcerer | 6 | Draconic | P18 |
| F-sorcerous-origin-improvement-1 | Sorcerous Origin feature | Sorcerer | 6 | — | P18 |
| F-sorcerer-ability-score-improvement-2 | Ability Score Improvement | Sorcerer | 8 | — | P18 |
| F-metamagic-2 | Metamagic | Sorcerer | 10 | — | P18 |
| F-sorcerer-ability-score-improvement-3 | Ability Score Improvement | Sorcerer | 12 | — | P18 |
| F-dragon-wings | Dragon Wings | Sorcerer | 14 | Draconic | P18 |
| F-sorcerous-origin-improvement-2 | Sorcerous Origin feature | Sorcerer | 14 | — | P18 |
| F-sorcerer-ability-score-improvement-4 | Ability Score Improvement | Sorcerer | 16 | — | P18 |
| F-metamagic-3 | Metamagic | Sorcerer | 17 | — | P18 |
| F-draconic-presence | Draconic Presence | Sorcerer | 18 | Draconic | P18 |
| F-sorcerous-origin-improvement-3 | Sorcerous Origin feature | Sorcerer | 18 | — | P18 |
| F-sorcerer-ability-score-improvement-5 | Ability Score Improvement | Sorcerer | 19 | — | P18 |
| F-sorcerous-restoration | Sorcerous Restoration | Sorcerer | 20 | — | P18 |
| F-dark-ones-blessing | Dark One's Blessing | Warlock | 1 | Fiend | P18 |
| F-otherworldly-patron | Otherworldly Patron | Warlock | 1 | — | P18 |
| F-pact-magic | Pact Magic | Warlock | 1 | — | P18 |
| F-eldritch-invocation-agonizing-blast | Eldritch Invocation: Agonizing Blast | Warlock | 2 | — | P18 |
| F-eldritch-invocation-armor-of-shadows | Eldritch Invocation: Armor of Shadows | Warlock | 2 | — | P18 |
| F-eldritch-invocation-beast-speech | Eldritch Invocation: Beast Speech | Warlock | 2 | — | P18 |
| F-eldritch-invocation-beguiling-influence | Eldritch Invocation: Beguiling Influence | Warlock | 2 | — | P18 |
| F-eldritch-invocation-book-of-ancient-secrets | Eldritch Invocation: Book of Ancient Secrets | Warlock | 2 | — | P18 |
| F-eldritch-invocation-devils-sight | Eldritch Invocation: Devil's Sight | Warlock | 2 | — | P18 |
| F-eldritch-invocation-eldritch-sight | Eldritch Invocation: Eldritch Sight | Warlock | 2 | — | P18 |
| F-eldritch-invocation-eldritch-spear | Eldritch Invocation: Eldritch Spear | Warlock | 2 | — | P18 |
| F-eldritch-invocation-eyes-of-the-rune-keeper | Eldritch Invocation: Eyes of the Rune Keeper | Warlock | 2 | — | P18 |
| F-eldritch-invocation-fiendish-vigor | Eldritch Invocation: Fiendish Vigor | Warlock | 2 | — | P18 |
| F-eldritch-invocation-gaze-of-two-minds | Eldritch Invocation: Gaze of Two Minds | Warlock | 2 | — | P18 |
| F-eldritch-invocation-mask-of-many-faces | Eldritch Invocation: Mask of Many Faces | Warlock | 2 | — | P18 |
| F-eldritch-invocation-misty-visions | Eldritch Invocation: Misty Visions | Warlock | 2 | — | P18 |
| F-eldritch-invocation-repelling-blast | Eldritch Invocation: Repelling Blast | Warlock | 2 | — | P18 |
| F-eldritch-invocation-thief-of-five-fates | Eldritch Invocation: Thief of Five Fates | Warlock | 2 | — | P18 |
| F-eldritch-invocation-voice-of-the-chain-master | Eldritch Invocation: Voice of the Chain Master | Warlock | 2 | — | P18 |
| F-eldritch-invocations | Eldritch Invocations | Warlock | 2 | — | P18 |
| F-pact-boon | Pact Boon | Warlock | 3 | — | P18 |
| F-pact-of-the-blade | Pact of the Blade | Warlock | 3 | — | P18 |
| F-pact-of-the-chain | Pact of the Chain | Warlock | 3 | — | P18 |
| F-pact-of-the-tome | Pact of the Tome | Warlock | 3 | — | P18 |
| F-warlock-ability-score-improvement-1 | Ability Score Improvement | Warlock | 4 | — | P18 |
| F-eldritch-invocation-mire-the-mind | Eldritch Invocation: Mire the Mind | Warlock | 5 | — | P18 |
| F-eldritch-invocation-one-with-shadows | Eldritch Invocation: One with Shadows | Warlock | 5 | — | P18 |
| F-eldritch-invocation-sign-of-ill-omen | Eldritch Invocation: Sign of Ill Omen | Warlock | 5 | — | P18 |
| F-eldritch-invocation-thirsting-blade | Eldritch Invocation: Thirsting Blade | Warlock | 5 | — | P18 |
| F-dark-ones-own-luck | Dark One's Own Luck | Warlock | 6 | Fiend | P18 |
| F-otherworldly-patron-improvement-1 | Otherworldly Patron feature | Warlock | 6 | — | P18 |
| F-eldritch-invocation-bewitching-whispers | Eldritch Invocation: Bewitching Whispers | Warlock | 7 | — | P18 |
| F-eldritch-invocation-dreadful-word | Eldritch Invocation: Dreadful Word | Warlock | 7 | — | P18 |
| F-eldritch-invocation-sculptor-of-flesh | Eldritch Invocation: Sculptor of Flesh | Warlock | 7 | — | P18 |
| F-warlock-ability-score-improvement-2 | Ability Score Improvement | Warlock | 8 | — | P18 |
| F-eldritch-invocation-ascendant-step | Eldritch Invocation: Ascendant Step | Warlock | 9 | — | P18 |
| F-eldritch-invocation-minions-of-chaos | Eldritch Invocation: Minions of Chaos | Warlock | 9 | — | P18 |
| F-eldritch-invocation-otherworldly-leap | Eldritch Invocation: Otherworldly Leap | Warlock | 9 | — | P18 |
| F-eldritch-invocation-whispers-of-the-grave | Eldritch Invocation: Whispers of the Grave | Warlock | 9 | — | P18 |
| F-fiendish-resilience | Fiendish Resilience | Warlock | 10 | Fiend | P18 |
| F-otherworldly-patron-improvement-2 | Otherworldly Patron feature | Warlock | 10 | — | P18 |
| F-mystic-arcanum-6th-level | Mystic Arcanum (6th level) | Warlock | 11 | — | P18 |
| F-eldritch-invocation-lifedrinker | Eldritch Invocation: Lifedrinker | Warlock | 12 | — | P18 |
| F-warlock-ability-score-improvement-3 | Ability Score Improvement | Warlock | 12 | — | P18 |
| F-mystic-arcanum-7th-level | Mystic Arcanum (7th level) | Warlock | 13 | — | P18 |
| F-hurl-through-hell | Hurl Through Hell | Warlock | 14 | Fiend | P18 |
| F-otherworldly-patron-improvement-3 | Otherworldly Patron feature | Warlock | 14 | — | P18 |
| F-eldritch-invocation-chains-of-carceri | Eldritch Invocation: Chains of Carceri | Warlock | 15 | — | P18 |
| F-eldritch-invocation-master-of-myriad-forms | Eldritch Invocation: Master of Myriad Forms | Warlock | 15 | — | P18 |
| F-eldritch-invocation-visions-of-distant-realms | Eldritch Invocation: Visions of Distant Realms | Warlock | 15 | — | P18 |
| F-eldritch-invocation-witch-sight | Eldritch Invocation: Witch Sight | Warlock | 15 | — | P18 |
| F-mystic-arcanum-8th-level | Mystic Arcanum (8th level) | Warlock | 15 | — | P18 |
| F-warlock-ability-score-improvement-4 | Ability Score Improvement | Warlock | 16 | — | P18 |
| F-mystic-arcanum-9th-level | Mystic Arcanum (9th level) | Warlock | 17 | — | P18 |
| F-warlock-ability-score-improvement-5 | Ability Score Improvement | Warlock | 19 | — | P18 |
| F-eldritch-master | Eldritch Master | Warlock | 20 | — | P18 |
| F-arcane-recovery | Arcane Recovery | Wizard | 1 | — | P15 |
| F-spellcasting-wizard | Spellcasting: Wizard | Wizard | 1 | — | P15 |
| F-arcane-tradition | Arcane Tradition | Wizard | 2 | — | P15 |
| F-evocation-savant | Evocation Savant | Wizard | 2 | Evocation | P15 |
| F-sculpt-spells | Sculpt Spells | Wizard | 2 | Evocation | P15 |
| F-wizard-ability-score-improvement-1 | Ability Score Improvement | Wizard | 4 | — | P15 |
| F-arcane-tradition-improvement-1 | Arcane Tradition feature | Wizard | 6 | — | P15 |
| F-potent-cantrip | Potent Cantrip | Wizard | 6 | Evocation | P15 |
| F-wizard-ability-score-improvement-2 | Ability Score Improvement | Wizard | 8 | — | P15 |
| F-arcane-tradition-improvement-2 | Arcane Tradition feature | Wizard | 10 | — | P15 |
| F-empowered-evocation | Empowered Evocation | Wizard | 10 | Evocation | P15 |
| F-wizard-ability-score-improvement-3 | Ability Score Improvement | Wizard | 12 | — | P15 |
| F-arcane-tradition-improvement-3 | Arcane Tradition feature | Wizard | 14 | — | P15 |
| F-overchannel | Overchannel | Wizard | 14 | Evocation | P15 |
| F-wizard-ability-score-improvement-4 | Ability Score Improvement | Wizard | 16 | — | P15 |
| F-spell-mastery | Spell Mastery | Wizard | 18 | — | P15 |
| F-wizard-ability-score-improvement-5 | Ability Score Improvement | Wizard | 19 | — | P15 |
| F-signature-spell | Signature Spell | Wizard | 20 | — | P15 |

<a id="appendix-d"></a>

## Appendix D — All 113 currently reference-only magic-item work items

This exact current-backlog list is computed from `ITEM_CATALOG` entries whose kind is `magic-item` and whose `implementedEffect` is absent. It deliberately excludes the ten entries with existing effects. Each `M-<id>` is owned by P21 and must decompose all source behaviors using Appendix A. The attunement/charge fields below are current generated metadata, not authoritative repaired rules; P01/P04/P10 must reconcile parsing defects before handlers rely on them. A dash means the current catalogue has no such field value, not proof the source has no corresponding behavior.

| Work item | Item | Attunement recorded | Charge maximum recorded |
|---|---|---|---:|
| M-amulet-of-proof-against-detection-and-location | Amulet of Proof against Detection and Location | Yes | — |
| M-amulet-of-the-planes | Amulet of the Planes | Yes | — |
| M-apparatus-of-the-crab | Apparatus of the Crab | No | — |
| M-bag-of-beans | Bag of Beans | No | — |
| M-bag-of-devouring | Bag of Devouring | No | — |
| M-bag-of-holding | Bag of Holding | No | — |
| M-boots-of-elvenkind | Boots of Elvenkind | No | — |
| M-boots-of-levitation | Boots of Levitation | Yes | — |
| M-boots-of-striding-and-springing | Boots of Striding and Springing | Yes | — |
| M-boots-of-the-winterlands | Boots of the Winterlands | Yes | — |
| M-broom-of-flying | Broom of Flying | No | — |
| M-candle-of-invocation | Candle of Invocation | Yes | — |
| M-cape-of-the-mountebank | Cape of the Mountebank | No | — |
| M-carpet-of-flying | Carpet of Flying | No | — |
| M-carpet-of-flying-3x5 | Carpet of Flying (3 ft. × 5 ft.) | No | — |
| M-carpet-of-flying-4x6 | Carpet of Flying (4 ft. × 6 ft.) | No | — |
| M-carpet-of-flying-5x7 | Carpet of Flying (5 ft. × 7 ft.) | No | — |
| M-carpet-of-flying-6x9 | Carpet of Flying (6 ft. × 9 ft.) | No | — |
| M-chime-of-opening | Chime of Opening | No | — |
| M-cloak-of-elvenkind | Cloak of Elvenkind | Yes | — |
| M-cloak-of-the-bat | Cloak of the Bat | Yes | — |
| M-cloak-of-the-manta-ray | Cloak of the Manta Ray | No | — |
| M-crystal-ball | Crystal Ball | Yes | — |
| M-crystal-ball-of-mind-reading | Crystal Ball of Mind Reading | Yes | — |
| M-crystal-ball-of-telepathy | Crystal Ball of Telepathy | Yes | — |
| M-crystal-ball-of-true-seeing | Crystal Ball of True Seeing | Yes | — |
| M-cubic-gate | Cubic Gate | No | 3 |
| M-decanter-of-endless-water | Decanter of Endless Water | No | — |
| M-deck-of-illusions | Deck of Illusions | No | — |
| M-deck-of-many-things | Deck of Many Things | No | — |
| M-dimensional-shackles | Dimensional Shackles | No | — |
| M-dust-of-disappearance | Dust of Disappearance | No | — |
| M-dust-of-dryness | Dust of Dryness | No | — |
| M-efficient-quiver | Efficient Quiver | No | — |
| M-eyes-of-charming | Eyes of Charming | Yes | — |
| M-eyes-of-minute-seeing | Eyes of Minute Seeing | No | — |
| M-eyes-of-the-eagle | Eyes of the Eagle | Yes | — |
| M-feather-token | Feather Token | No | — |
| M-feather-token-anchor | Anchor Feather Token | No | — |
| M-feather-token-bird | Bird Feather Token | No | — |
| M-feather-token-fan | Fan Feather Token | No | — |
| M-feather-token-swan-boat | Swan Boat Feather Token | No | — |
| M-feather-token-tree | Tree Feather Token | No | — |
| M-figurine-of-wondrous-power | Figurine of Wondrous Power | No | 24 |
| M-figurine-of-wondrous-power-ebony-fly | Ebony Fly Figurine of Wondrous Power | No | — |
| M-figurine-of-wondrous-power-serpentine-owl | Serpentine Owl Figurine of Wondrous Power | No | — |
| M-figurine-of-wondrous-power-silver-raven | Silver Raven Figurine of Wondrous Power | No | — |
| M-folding-boat | Folding Boat | No | — |
| M-gem-of-seeing | Gem of Seeing | Yes | 3 |
| M-gloves-of-swimming-and-climbing | Gloves of Swimming and Climbing | Yes | — |
| M-goggles-of-night | Goggles of Night | No | — |
| M-handy-haversack | Handy Haversack | No | — |
| M-hat-of-disguise | Hat of Disguise | Yes | — |
| M-headband-of-intellect | Headband of Intellect | Yes | — |
| M-helm-of-comprehending-languages | Helm of Comprehending Languages | No | — |
| M-helm-of-telepathy | Helm of Telepathy | Yes | — |
| M-helm-of-teleportation | Helm of Teleportation | Yes | 3 |
| M-horseshoes-of-a-zephyr | Horseshoes of a Zephyr | No | — |
| M-horseshoes-of-speed | Horseshoes of Speed | No | — |
| M-immovable-rod | Immovable Rod | No | — |
| M-ioun-stone-of-sustenance | Ioun Stone of Sustenance | Yes | — |
| M-lantern-of-revealing | Lantern of Revealing | No | — |
| M-manual-of-bodily-health | Manual of Bodily Health | No | — |
| M-manual-of-gainful-exercise | Manual of Gainful Exercise | No | — |
| M-manual-of-golems | Manual of Golems | No | — |
| M-manual-of-golems-clay | Manual of Clay Golems | No | — |
| M-manual-of-golems-flesh | Manual of Flesh Golems | No | — |
| M-manual-of-golems-iron | Manual of Iron Golems | No | — |
| M-manual-of-golems-stone | Manual of Stone Golems | No | — |
| M-manual-of-quickness-of-action | Manual of Quickness of Action | No | — |
| M-marvelous-pigments | Marvelous Pigments | No | — |
| M-medallion-of-thoughts | Medallion of Thoughts | Yes | 3 |
| M-necklace-of-adaptation | Necklace of Adaptation | Yes | — |
| M-oil-of-etherealness | Oil of Etherealness | No | — |
| M-periapt-of-health | Periapt of Health | No | — |
| M-periapt-of-proof-against-poison | Periapt of Proof against Poison | No | — |
| M-philter-of-love | Philter of Love | No | — |
| M-portable-hole | Portable Hole | No | — |
| M-potion-of-animal-friendship | Potion of Animal Friendship | No | — |
| M-potion-of-clairvoyance | Potion of Clairvoyance | No | — |
| M-potion-of-climbing | Potion of Climbing | No | — |
| M-potion-of-flying | Potion of Flying | No | — |
| M-potion-of-gaseous-form | Potion of Gaseous Form | No | — |
| M-potion-of-mind-reading | Potion of Mind Reading | No | — |
| M-potion-of-poison | Potion of Poison | No | — |
| M-potion-of-water-breathing | Potion of Water Breathing | No | — |
| M-restorative-ointment | Restorative Ointment | No | — |
| M-ring-of-animal-influence | Ring of Animal Influence | No | 3 |
| M-ring-of-feather-falling | Ring of Feather Falling | Yes | — |
| M-ring-of-jumping | Ring of Jumping | Yes | — |
| M-ring-of-mind-shielding | Ring of Mind Shielding | Yes | — |
| M-ring-of-swimming | Ring of Swimming | No | — |
| M-ring-of-three-wishes | Ring of Three Wishes | No | — |
| M-ring-of-warmth | Ring of Warmth | Yes | — |
| M-ring-of-water-walking | Ring of Water Walking | No | — |
| M-ring-of-x-ray-vision | Ring of X-ray Vision | Yes | — |
| M-robe-of-eyes | Robe of Eyes | Yes | — |
| M-robe-of-useful-items | Robe of Useful Items | No | — |
| M-rod-of-rulership | Rod of Rulership | Yes | — |
| M-rod-of-security | Rod of Security | No | — |
| M-rope-of-climbing | Rope of Climbing | No | — |
| M-slippers-of-spider-climbing | Slippers of Spider Climbing | Yes | — |
| M-sovereign-glue | Sovereign Glue | No | — |
| M-stone-of-good-luck-luckstone | Stone of Good Luck (Luckstone) | Yes | — |
| M-tome-of-clear-thought | Tome of Clear Thought | No | — |
| M-tome-of-leadership-and-influence | Tome of Leadership and Influence | No | — |
| M-tome-of-understanding | Tome of Understanding | No | — |
| M-universal-solvent | Universal Solvent | No | — |
| M-wand-of-magic-detection | Wand of Magic Detection | No | 3 |
| M-wand-of-secrets | Wand of Secrets | No | 3 |
| M-well-of-many-worlds | Well of Many Worlds | No | — |
| M-winged-boots | Winged Boots | Yes | — |
| M-wings-of-flying | Wings of Flying | Yes | — |

### D.1 Source fingerprints for inventory reproducibility

These SHA-256 values identify the local input bytes read while writing this plan. They are provenance anchors, not proof of licensing or rules correctness. Do not fetch a newer dataset under the same filename and assume this inventory still describes it.

| Local source | Records | SHA-256 |
|---|---:|---|
| DND 5E Data/5e-SRD-Classes.json | 12 | 2c2795733d45db10758f1c62cad28ffdb1e44159d49a0669bd2dcd606ab6fcfc |
| DND 5E Data/5e-SRD-Subclasses.json | 12 | b3502390228ffd15c9043f6b5f25d365a9935e12056debccc2e2749e3d6c3ab1 |
| DND 5E Data/5e-SRD-Features.json | 407 | fd20a2a5c27996eb66c023053b1629d93dac2d1d108e5d81dfc53ddf0d6ad93c |
| DND 5E Data/5e-SRD-Feats.json | 1 | 77ec1eeab03643714250c617ee54f558ff6600a12d25fc17ae709a1bc9513482 |
| DND 5E Data/5e-SRD-Spells.json | 319 | 6ba39de71c28b8fa5439c1a0bdc0f57874aadc7b09b7281ac805e7fe16019d6f |
| DND 5E Data/5e-SRD-Levels.json | 290 | ea6a58268f26f8536d049bd8cb45630280188cd07d2be8b46e0e4cbe5a44feeb |
| DND 5E Data/5e-SRD-Magic-Items.json | 362 | 9a6f928cbf36b268b02e09dc116995efce8a74380df0450e197117886b64993d |

<a id="appendix-e"></a>

## Appendix E — Verification strategy and interaction matrix

### E.1 Test layers and responsibilities

| Layer | Proves | Does not prove by itself |
|---|---|---|
| Pure domain examples | Exact rules, rounding, choices, event order, deterministic outcomes | Browser durability or UI accessibility |
| Property/invariant tests | Broad combinations preserve identity, bounds, determinism, conservation | Correct interpretation of every source rule |
| Repository integration | Real transaction/abort/version/asset behavior | Full user flow or authorization through deployed routing |
| Generator corpus comparisons | Source records/numbers/relations are retained and accounted for | Every generated description is mechanically implemented |
| Command integration | Costs, state, outcomes, retries, pending choices compose correctly | Appearance or keyboard focus |
| Browser journeys | Real UI-to-persistence lifecycle, reload, keyboard, network/offline behavior | Exhaustive rules coverage |
| Visual comparisons | Reviewed layout states remain stable in a pinned environment | Correct damage, spending, or storage |
| Restricted-session network tests | Unauthorized fields/assets/commands stay inaccessible | All human inference about a visible game can be prevented |
| Fault/restore drills | Recovery works after actual interrupted boundaries | Guaranteed zero browser eviction or zero infrastructure outages |
| Performance fixtures | Cost and latency under the recorded workload | Unlimited actors/maps/content on all hardware |

Prefer independently derived expected results. For a rule fix, the test should fail against the old behavior for the right reason. For an archive, compare semantic entity relationships and binary hashes, not merely exported byte count. For a transaction, assert all involved stores before/after an injected abort. For screenshots, compare images; an `expect(text).toContain(...)` assertion remains a content assertion.

### E.2 Mandatory cross-feature scenarios

| ID | Scenario | Required invariant/outcome | Owning phases |
|---|---|---|---|
| X01 | Corrupt primary and backup while maps/portraits exist | Preserve bytes/assets; recovery is non-destructive | P01–P03 |
| X02 | Preview import while production is open | No shared state, locks, channels, cache, or service writes | P01/P24/P29 |
| X03 | XP recipient write/ack failure | Entire award once, never a partial/double recipient | P01/P05 |
| X04 | Imported monster with authored expertise | Check/save/passive queries retain exact authored totals | P04/P06/P22 |
| X05 | Nested melee/ranged alternative | Both legal modes remain available; reference fallback never disappears | P04/P20 |
| X06 | Move through reach, reaction incapacitates mover | Durable departure window; no resumed illegal route or reroll | P07/P09 |
| X07 | Forced movement across the same reach | Uses declared forced-movement trigger policy, spends no walking pool | P07/P09 |
| X08 | Reaction adds defense after an apparent hit | Hit/damage resolves at the correct window, spends reaction once | P09/P11 |
| X09 | Damage absorbed partly/all by temporary HP | Damage event feeds the correct concentration policy; no bypass via HP setter | P10/P12 |
| X10 | One area hits several concentrating targets | Correct shared damage/per-target saves, independently pending concentration checks | P11–P13 |
| X11 | Replace concentration with a new spell | One active group, deliberate old-group removal, source-defined failed/countered-cast behavior | P09/P12/P13 |
| X12 | Source deleted/dies/transforms mid-effect | Correct source cleanup; no dangling summons/zones/resources | P08/P12/P13/P17 |
| X13 | Same condition supplied by two effects | Ending one source retains the other and its own duration | P08/P13 |
| X14 | Zone entry, forced movement, and turn start | Source-defined trigger eligibility and per-turn cap; no duplicate event firing | P07–P09/P13 |
| X15 | Reload while choosing Counterspell/Indomitable | Same pending choice, result transcript, costs, and eligible responder | P09/P13/P15 |
| X16 | Action Surge plus bonus-action spell | Correct 2014 casting restrictions, no extra bonus action/reaction | P11/P15 |
| X17 | Sneak Attack on another creature's turn | Once-per-turn scope differs from once-per-round/own-turn | P09/P16 |
| X18 | Rage while concentrating/casting | Source restrictions and concentration cleanup agree | P12/P16 |
| X19 | Wild Shape/Polymorph at zero alternate HP | Retained/replaced fields and overflow/reversion follow the selected feature | P13/P17 |
| X20 | Wizard/Warlock multiclass rest | Pact and ordinary slots recover independently; known/prepared access stays class-specific | P10/P18/P19 |
| X21 | Respec after finding identical starting gear | Remove grant-owned equipment only; preserve independently acquired instances | P10/P14/P19 |
| X22 | Two charged copies transferred/rested | Per-instance charges, attunement, ownership, and resets remain independent | P10/P21/P28 |
| X23 | Last charge roll, browser closes before animation | One persisted consequence; reload cannot reroll destruction | P09/P21 |
| X24 | Long rest without crossing dawn | Rest pools recover correctly; daily/dawn items do not reset twice | P08/P10/P21 |
| X25 | Legendary action after another actor's turn | Uses its own budget and legal timing, not ordinary reaction spending | P09/P20 |
| X26 | Magical/silvered qualifier in resistance | Attack facts satisfy the exact predicate; unknown predicate requests adjudication | P10/P20/P21 |
| X27 | Hidden creature, darkvision, opaque door | Per-observer visibility is consistent across target list, attack, Hide, and display | P22/P27 |
| X28 | Reconcile stale token and advanced Hero | Three-way conflict preview; no overwritten advancement or duplicated loot | P14/P23 |
| X29 | Offline launch after partial shell update | Last compatible shell/vault remains usable; missing content is explicit | P03/P24 |
| X30 | Two online users spend final resource | Server transaction accepts at most one, loser sees a meaningful conflict | P25/P26 |
| X31 | Server commits then disconnects before acknowledgement | Retry returns original result; outbox eventually delivers authorized projection | P26/P27 |
| X32 | Membership revoked during pending choice | Revoked responder cannot act; GM can recover the pending resolution | P09/P25–P27 |
| X33 | Player downloads every asset/payload | No unrevealed pixels, private notes, hidden IDs, or secret modifiers | P27 |
| X34 | Two buyers purchase final charged item | One ownership transfer and matching money/stock receipt | P26/P28 |
| X35 | Restore cloud backup with missing object batch | Detect inconsistency, preserve evidence, repair from matched asset backup | P25/P29 |
| X36 | New content version opened by older runtime | Safe incompatibility/recovery, never normalized data loss | P03/P04/P24/P29 |
| X37 | Keyboard-only interrupted combat | Focus returns to meaningful pending choice/actor; no pointer-only escape | P09/P23 |
| X38 | Duplicate permanent advancement consumable use | One item consumed and one durable grant, including after retry/import | P14/P21 |
| X39 | Shared campaign time across scenes | One explicit time event expires/resets applicable state once per scope | P08/P10/P23 |
| X40 | Bounded trigger chain reaches work limit | Persist a recoverable adjudication pause; do not discard unresolved effects | P09/P13/P20 |

Each row becomes one or more focused tests when its dependencies exist. Do not manufacture a passing end-to-end test by mocking out the exact transaction, authorization, or trigger behavior the row is meant to verify.

### E.3 Failure-injection boundary matrix

| Boundary | Injected failure | Expected durable state | Recovery evidence |
|---|---|---|---|
| Read primary | Invalid JSON/shape/version | Raw primary/backup/assets preserved | Classification + export/recovery options |
| Read backup | Backup also invalid | No healthy-empty claim, no orphan sweep | Both diagnostics retained |
| Stage image/archive | Quota or interrupted decode | Active generation untouched | Inactive job safely resumable/cleanable |
| Validate archive | Bad hash/path/reference | Nothing activated | Exact entry failure without executing content |
| Before transaction | Exception/cancel/stale revision | No state/resource changes | Safe refusal/retry |
| During transaction | Abort after any store request | All included writes roll back | Before/after state and references equal |
| After commit | Lost UI/socket acknowledgement | Entire result already committed | Retry returns same outcome |
| During choice | Close browser/server restart | Cursor/reservations/choices retained | Same resolution resumes |
| During migration | Crash at every journal transition | Old or fully validated new generation active | Restart chooses one deterministically |
| During GC | Crash or renewed reference | No referenced blob deleted | Reference recheck/transaction protects reachability |
| During cache update | Missing/invalid chunk/quota | Last compatible shell remains | Version readiness stays incomplete |
| During cloud upload | Network fail before publish | No active dangling references | Stage job retries/ages out safely |
| During outbox publish | Duplicate/out-of-order delivery | Authority unchanged | Consumer dedup/resync |
| During access revocation | In-flight request/subscription | Next authorization boundary denies | No post-revocation privileged mutation |
| During deletion | Stale device sends old snapshot | Tombstone/epoch remains authoritative | No silent resurrection |

Fault tests distinguish a simulated command rejection from a real browser transaction abort. Include at least one browser-backed test for each storage/browser capability; memory adapters alone cannot prove IndexedDB scheduling or quota semantics.

### E.4 Useful invariant/property suites

- Conservation: transfers preserve total money/item quantity across participating owners unless an explicit create/consume command accounts for the difference.
- Identity: a durable item instance occupies exactly one authoritative location; all references resolve within the permitted campaign or explicit external catalogue.
- Resource bounds: every supported spend/reset respects its policy and reservations; temporary over-maximum states exist only where a source explicitly defines them.
- Determinism: equal validated state/intent/rules/random transcript produces equal semantic outcome independent of UI timing.
- Idempotency: replaying accepted command IDs at arbitrary boundaries does not change state again; conflicting payload reuse is always rejected.
- Source removal: removing effect A never removes unrelated source B's modifier or grant, even if the names match.
- Archive equivalence: exporting/importing a valid supported graph preserves semantic state after intentional ID remapping and preserves asset hashes.
- Projection monotonicity: adding a private field/event without changing permitted public facts leaves the unauthorized participant's projection unchanged, including cursors/diagnostic fields as designed.
- Geometry: translation within bounds preserves relative distance/membership; camera transformations do not alter game coordinates; every accepted footprint is entirely legal.
- Progression: rebuilding the same ledger yields the same derived character; cancelling/failed advancement leaves the prior ledger and grants unchanged.

### E.5 Current commands versus proposed new checks

These are verified existing script names from `package.json`, recorded for future execution. This documentation task does not run them again.

| Command | Current role | Future use |
|---|---|---|
| `npm test` | Node unit tests | Existing regression baseline plus new domain tests |
| `npm run test:browser` | Playwright journeys | Reload, interaction, real storage, permission/reconnect flows |
| `npm run lint` | ESLint | Touched-code quality and hook review |
| `npm run typecheck` | Limited project TypeScript check | Retain while adding meaningful strict contract checks |
| `npm run test:rules` / `test:reactions` / `test:expansion` | Focused current suites | Relevant existing rules while adapting commands |
| `npm run test:workflow-features:render` | Current workflow/render checks | Keep truthful distinction from screenshots |
| `npm run verify:dependencies` | Audit at high severity threshold | Dependency review at meaningful changes/releases |
| `npm run build` | Production `/Roll30/` build | Real-base artifact verification |
| `npm run build:preview` | Preview `/Roll30-Nightforge/` build | Namespace/base isolation qualification |
| `npm run verify` | Aggregate repository gate | Applicable full delivery lane |

Proposed archive, migration, content-corpus, strict-domain, multiplayer, privacy, and offline suites do not exist merely because this plan names them. Add named scripts when their implementation/test harness is real; update the aggregate gate then. Avoid tests that fail only because a function was renamed or a CSS string moved.

<a id="appendix-f"></a>

## Appendix F — Scope traceability and risk decisions

### F.1 Every identified gap has an owner

| Finding or missing capability | Primary phase | Proof of closure |
|---|---|---|
| Recovery removes maps after both JSON copies fail | P01/P03 | X01 and GC failure matrix |
| Preview and production share browser namespaces | P01 | X02, built environment inventory |
| No portable backup/import | P02 | Cross-browser semantic/hash round-trip |
| No transactional multi-entity durability | P03/P05 | Abort/ack/idempotency matrix |
| Monster save/skill/passive totals lost | P04 | Zero unexplained source numeric mismatches |
| Nested authored attacks dropped | P04 | All source actions accounted for |
| XP can partially commit/double award | P01/P05 | X03 and worked example A.1 |
| Hit Dice rounding/recharge parsing/calendar errors | P01/P10 | Odd-level/rest/daily boundary fixtures |
| Existing normalizers drop future fields | P03 | Unknown/new version loss prevention |
| Scattered rules-pending UI state | P05/P09 | Reload every committed choice phase |
| Checks depend on tabletop context | P06 | Hero/exploration roll journey without artificial combat |
| Fixed small board and incomplete reusable targeting | P07 | Resize/footprint/area/camera invariants |
| Effects lack sufficient source/lifecycle machinery | P08 | X13/X39 and stacking/removal properties |
| New reactions need durable timing | P09 | X06/X08/X15/X40 |
| Resource/item identity needs generalization | P10 | X22/X24, transfer conservation |
| No usable spellcasting system | P11–P13 | All selected spell behavior contracts pass |
| No concentration | P12 | X09–X12 across every damage route |
| Levels do not grant complete class mechanics | P14–P18 | All twelve class/subclass ledgers and feature contracts |
| Ten classes missing | P16–P18 | Class creation through source-supported level 20 |
| Feats and optional multiclassing missing | P19 | Grappler/ASI and mixed-class fixtures |
| Monster traits/actions are largely descriptive | P20 | Per-monster behavior registry and explicit GM workflows |
| 113 magic entries have no implemented effect | P21 | Appendix D behavior completion, existing ten retained |
| No light-level model | P22 | X27 and observer/sense boundaries |
| Snapshot continuity is unclear | P23 | Explicit reconciliation without duplicate ownership/XP |
| Creation/inspection/navigation need refinement | P06/P23 | Representative user tasks and keyboard journeys |
| No deliberate offline install/reopening | P24 | Offline readiness/update failure matrix |
| No accounts/cloud persistence | P25 | Optional explicit cloud import and restore drill |
| No remote multiplayer | P26 | Conflict/retry/reconnect authority tests |
| No player permissions/private view | P27 | Restricted network/asset projection tests |
| Currency exists without shopping | P28 | Transactional stock/funds/identity receipts |
| Verification/docs/type rigor lag claims | P00/P05/P23/P29 | Honest gates, strict new contracts, maintained docs |
| Performance/large module maintenance risk | P05/P23/P24 | Measured boundaries and targeted extraction |

Closed decisions in §1.3 remain exclusions, not gaps. AI assistance, public community sharing, marketplace payments, voice/video, 3D scenes, native mobile binaries, automated encounter balancing, and additional proprietary rulebooks are not silently added to this program. They require separate product scope if desired later.

### F.2 Risk register

| Risk | Impact / early signal | Mitigation | Gate owner |
|---|---|---|---|
| Destructive recovery mistaken for empty state | Irrecoverable assets; invalid JSON followed by sweep | Preserve evidence and require proven reachability | P01/P03 |
| Migration race with obsolete tab | Divergent legacy/new writes | New boundary, fingerprint drift detection, no automatic dual-write | P03 |
| New schema silently stripped by old code | Lost effects/items/choices on load | Reader/writer compatibility and quarantine | P03/P24 |
| Rules edition drift | Internally inconsistent casting/progression | Pinned 2014 ledger and source-specific tests | P00/P04 |
| Metadata mistaken for executable support | Large green counts with unusable content | Behavior-level capability manifest | P00/P13/P29 |
| Reaction recursion/state explosion | Hung encounter or unresolvable choice | Bounded durable scheduler and GM recovery | P09 |
| Competing modifier implementations | Different totals between sheet and attack | One provenance-aware derivation pipeline | P05/P08 |
| Item identity absent in legacy pools | Charges/loot duplicated or reset | Reviewed instance migration and ambiguous-state handling | P10 |
| Unsafe character rebuild | Lost loot/manual choices or resource refill | Grant provenance and explicit legacy baseline | P14/P23 |
| Content import omits exceptions | Apparently valid creature lacks an action | Corpus loss accounting and reference fallback | P04/P20 |
| Whole-catalogue mega-PR | Review/testing become ineffective | Family packs, exact issue IDs, capability gates | P13/P20/P21 |
| Private map sent behind client fog | Irreversible GM information disclosure | Authorized image delivery before bytes reach player | P27 |
| Online offline merge treated like document editing | Duplicated rolls/spends/money | Server authority, revalidation, explicit independent fork | P26 |
| Object store/database backup mismatch | Restored game has missing maps | Matched restore manifests and drills | P25/P29 |
| Service worker retains incompatible shell | Update loop or save incompatibility | Verified activation and compatible recovery build | P24/P29 |
| Overbroad optimization/rewrite | Delayed features and new regressions | Measure first, extract touched seams only | P05/P23/P24 |
| Accessibility deferred | New controls require mouse and block play | Per-package keyboard contract and final audit | P23 |
| Scope expands faster than mechanics complete | Perpetual partial class/content support | Versioned release manifests and explicit expansion decisions | P00/P29 |

### F.3 ADR backlog and concrete defaults

| ADR | Decision to record | Default / constraint | Must be resolved by |
|---|---|---|---|
| ADR-01 | Rules edition and house conventions | 2014/SRD 5.1, existing closed decisions retained | P00 |
| ADR-02 | Environment identity | Preserve production legacy keys; new explicit preview/test identities | P01 |
| ADR-03 | Archive format/library/limits | ZIP container, hashes, bounded validation, library unselected | P02 |
| ADR-04 | Vault schema and compatibility | One transactional IDB boundary, staged generations, no old-writer trust | P03 |
| ADR-05 | Command retention/epoch fences | Stable idempotency while retryable; reject obsolete epochs after compaction | P05 |
| ADR-06 | Geometry and area membership conventions | Square flat grid/five-foot diagonals; exact edge/cover rules recorded | P07 |
| ADR-07 | Game-time authority | Explicit GM clock, defined round/time mapping and cross-scene policy | P08 |
| ADR-08 | Trigger ordering and work bounds | Named windows, durable choices, GM adjudication for unresolved order | P09 |
| ADR-09 | Resource maximum-change semantics | Policy per resource; no implicit refill on editing a stat | P10 |
| ADR-10 | Content support and source expansion | Exact selected manifests; additional feats/items require provenance | P04/P19/P21 |
| ADR-11 | Multiclass and legacy advancement | Optional campaign setting, conservative historical reconstruction | P14/P19 |
| ADR-12 | Reconciliation and campaign membership | Explicit copies across independent campaigns, reviewed snapshot merge | P23 |
| ADR-13 | Supported browsers and offline update | Tested matrix, no forced in-encounter activation | P24 |
| ADR-14 | Hosted provider/deployment/session model | Unselected provider; private assets and transactional authority required | P25 |
| ADR-15 | Online protocol and partition boundary | Versioned intent/outcomes, short authority transactions, safe cursors | P26 |
| ADR-16 | Player knowledge/private-map delivery | Server allowlist projection; no unrevealed pixels sent | P27 |
| ADR-17 | Merchant economy | Integer copper, explicit finite/unlimited purse and change policy | P28 |
| ADR-18 | Release support/recovery objectives | Measured restore capabilities and compatible rollback | P29 |

These are implementation checkpoints, not unanswered permission questions for the current documentation task. Provider selection, source expansion, and final budgets require fresh evidence when that work begins. No present uncertainty authorizes inventing a mechanical rule or counting a partial feature as complete.

<a id="appendix-g"></a>

## Appendix G — Sequencing, estimates, and reviewable first changes

### G.1 Delivery waves

| Wave | Packages | Demonstrable milestone |
|---|---|---|
| W0 | P00 contract slice + P01 urgent defects | Existing data survives recovery; XP/rest/environment fixes verified |
| W1 | P02/P03/P04/P05 | Portable, transactional, loss-aware local foundation |
| W2 | P06–P10 | Exploration, reusable geometry, durable effects/reactions/resources |
| W3 | P11/P12/P14/P15 and selected P13 families | Complete vertical slice with real Fighter/Wizard play and concentration |
| W4 | P13/P16–P22 in dependency-ready packs | Full declared local content and lighting |
| W5 | P23/P24 plus continuous P29 | Coherent accessible offline local release |
| W6, optional | P25–P27 plus online P29 | Private cloud, then authorized shared play |
| W7, optional | P28 after its dependencies | Local/shared shopping with durable receipts |

P29 applies at each release, including W0/W1. W4 is not a reason to withhold a useful earlier supported pack. W6 does not require every optional magic-item expansion, but any online-enabled content must have authoritative/privacy-compatible handlers.

### G.2 Sizing and forecasting method

The following are **complexity bands, not elapsed-time promises**. S means a bounded existing-system repair; M means several integrated packages; L means a new subsystem; XL means many behavior families or a major compatibility/authority boundary. Split XL work before assigning dates. Team throughput, review capacity, source exceptions, and user testing are currently unmeasured.

| Phase | Band | Main uncertainty to reduce first |
|---|---|---|
| [P00](#p00) | M | Actual maintained acceptance baseline and source capability denominator |
| [P01](#p01) | M | Legacy storage write/backup ordering and compatibility of new markers |
| [P02](#p02) | L | Browser memory/quota limits and import collision semantics |
| [P03](#p03) | XL | Async caller adaptation, legacy drift, transaction/generation recovery |
| [P04](#p04) | L | Source exceptions and existing-token override provenance |
| [P05](#p05) | L | Safe incremental adoption without two authorities |
| [P06](#p06) | M | Exploration context/roll history and creation usability |
| [P07](#p07) | L | Footprints, area boundary conventions, performance ceilings |
| [P08](#p08) | L | Effect stacking, source lifetimes, cross-scene game time |
| [P09](#p09) | XL | Timing windows, recursive triggers, reloadable choice state |
| [P10](#p10) | L | Legacy per-copy item ambiguity and reset semantics |
| [P11](#p11) | L | Source-specific casting constraints and complete first integrations |
| [P12](#p12) | M–L | Damage packet grouping and interruption coverage |
| [P13](#p13) | XL | Long tail of spell-specific exceptions across 319 records |
| [P14](#p14) | L | Missing historical choices and grant-owned respec |
| [P15](#p15) | L | Wizard special casting policies and level-dependent interactions |
| [P16](#p16) | L | Once-per-turn features, reactions, resource restrictions |
| [P17](#p17) | XL | Wild Shape, companions, auras, divine spell integrations |
| [P18](#p18) | XL | Metamagic transformations, invocations, separate pact resources |
| [P19](#p19) | L | Optional multiclass ordering and explicitly available feat content |
| [P20](#p20) | XL | Individual traits/legendary sequences and incomplete source records |
| [P21](#p21) | XL | Item identity, random consequences, parent/variant expansion |
| [P22](#p22) | L | Observer-specific senses, occlusion, and private projection requirements |
| [P23](#p23) | L | Reconciliation conflicts and keyboard operation of dense tabletop UI |
| [P24](#p24) | L | Cache/schema compatibility and measured target hardware |
| [P25](#p25) | XL | Provider, auth/storage contracts, restore operations |
| [P26](#p26) | XL | Authority/reconnect/delivery boundaries under simultaneous users |
| [P27](#p27) | XL | Secret imagery and indirect information disclosure |
| [P28](#p28) | M–L | Physical denomination/change rules and durable transfer identity |
| [P29](#p29) | M per release; L initial harness | Real recovery evidence and operational ownership |

For each ready issue, obtain an optimistic/likely/pessimistic engineering-effort estimate and record the largest risk. Forecast from completed comparable packages after the first two waves. Account separately for implementation, review, rules/source verification, browser QA, and release/restore work. Never multiply a guessed "minutes per spell" by 319: shared families and bespoke exceptions have very different costs.

Use three-point estimates only after decomposition. A planning model may use `(optimistic + 4×likely + pessimistic) / 6` for a rough mean, but this is not a calibrated probability or a guarantee. Forecast dates from actual throughput and dependencies, state the confidence assumptions, and refresh when source scope changes. With one developer, perform the dependency-ready queue sequentially; extra engineers do not make shared schema or scheduler decisions independent.

### G.3 Ownership and review

Assign accountable roles even if one person wears several hats: product/rules owner, persistence/domain implementer, UI/accessibility owner, independent reviewer, release/recovery owner, and later online/security operator. A reviewer should independently check the selected rules and durable boundaries rather than only code style. Content authors can prepare behavior contracts while foundational work proceeds, but unresolved schemas must not be guessed into generated data.

Limit work in progress: finish a vertical slice and its compatibility/test gates before opening several half-finished class systems. Keep a ready queue and a separate blocked-decision queue. Escalate only concrete blocking decisions; routine implementation details follow the defaults here.

### G.4 First ten reviewable future PRs

These are proposed scopes, not created branches or executed work. Reorder the independent repairs if a new severity finding warrants it.

| PR | Proposed scope | Main touched area | Acceptance before merge |
|---|---|---|---|
| 1 | Preserve assets on uncertain recovery | Runtime/load classifications/artwork cleanup | Both-corrupt and backup-retention fixtures; no destructive empty fallback |
| 2 | Isolate preview/test storage identity | Constants/runtime/build config | Production state/backup/blobs untouched by preview actions |
| 3 | Make XP award one envelope operation | Commands/entity/state repository | A.1 all-or-none/idempotent cases |
| 4 | Correct Hit Dice and recharge semantics | Rest/items/generator/UI reset entry | Odd-level limits, paragraph metadata, explicit daily reset |
| 5 | Preserve authored monster totals | Generator/record/check queries | Corpus save/skill totals and passive fixtures |
| 6 | Account for nested/missing attacks | Generator/action variants/browser | All twenty omissions accounted for; both weapon modes |
| 7 | Make baseline claims and checks truthful | Docs/capability seed/visual tests | Genuine selected screenshot comparisons; documented current commands |
| 8 | Export complete portable archive | Archive reader/backup UI | State+assets consistency, bounded failure handling |
| 9 | Import archive into a separate collection | Validator/staging/recovery UI | Hash/reference validation and interrupted activation recovery |
| 10 | Introduce async vault adapter and one vertical save slice | Repository interface/read-only load/scene save | Awaited callers, transaction abort, legacy data retained |

PRs 1–6 include their own focused evidence even if PR 7 has not completed the broader baseline work. P00's rule/invariant contract slice precedes them; a documentation mega-PR is not a prerequisite to stop confirmed data loss. A PR too large to review splits further at a meaningful behavior boundary, not arbitrary line count.

<a id="appendix-h"></a>

## Appendix H — Existing code map and migration touchpoints

These paths were present during inspection. They are starting points for future implementation, not claims that each module is already suitable as the final abstraction. Recheck actual call graphs before editing.

| Existing path | Current responsibility / why it matters | Planned work |
|---|---|---|
| `src/application/browserRuntime.js` | Browser repository construction and initialization | P01 recovery/environment; P03 async vault selection |
| `src/application/state.js` | Application state and revision presentation | P03 async/loading/conflict; P05 outcome projection |
| `src/application/commands.js` | Application mutations including XP orchestration | P01 atomic award; P05 typed durable commands |
| `src/application/artwork.js` | Artwork lifecycle coordination | P01 retain uncertain refs; P02/P03 staged asset flow |
| `src/application/generatedId.js` | Generated identifiers | P05 injected IDs and command identity |
| `src/storage/constants.js` | Shared storage identity | P01 explicit environment namespaces |
| `src/storage/stateRepository.js` | Local state/backup persistence | P01 safe classifications; P02 archive reader; P03 adapter |
| `src/storage/entityRepositories.js` | Entity-level updates | P01 multi-entity award; P03 async adaptation |
| `src/storage/envelope.js` | Schema envelope normalization | P03 loss-aware compatibility and migrations |
| `src/storage/artworkRepository.js` | IndexedDB blob storage | P01 GC; P02 archive; P03 transactional reference lifecycle |
| `src/storage/sessionRepository.js` | Session state | P01 environment identity; P23 navigation; no rules authority |
| `src/storage/memoryAdapters.js` | Test storage adapters | Focused fault tests; supplement with real-browser storage |
| `src/domain/records.js` | Record shape/normalization | All persisted additions must survive; P03/P14 compatibility |
| `src/domain/heroes.js` | Hero creation/derived values | P06/P14–P19 progression and explicit provenance |
| `src/domain/table.js` | Tokens/board-related state and normalization | P04 authored stats; P07 geometry; P23 snapshots |
| `src/domain/attacks.js` | Attack mechanics | P05 command adapter; P09/P11/P15–P21 integrations |
| `src/domain/checks.js` | Ability/skill/save derivation and rolls | P04 authored overrides; P06 exploration; P08 modifiers |
| `src/domain/combat.js` | Combat/turn mechanics | P07–P09 geometry/timing; preserve explicit End Turn |
| `src/domain/encounter.js` | Completion/restart/XP-related domain behavior | P01 unique encounter award; P05/P23 continuity |
| `src/domain/conditions.js` | Conditions/duration behavior | P08 source-owned instances and expiry |
| `src/domain/vitality.js` / `death.js` | Health/temp HP/death outcomes | P12 universal damage interruption and cleanup |
| `src/domain/rest.js` | Rest calculations/resource resets | P01 rounding; P10 per-pool game-time policy |
| `src/domain/items.js` / `money.js` | Gear/pools/currency | P10 instance identity; P21 actions; P28 trades |
| `src/domain/racialTraits.js` | Existing race traits and recorded future spell/action data | P11/P20-style explicit racial actions; preserve existing traits |
| `src/domain/catalog.js` / `catalog.generated.js` | Shipped equipment/character metadata | P04 versioned definitions; P21 item coverage |
| `src/domain/monsters.js` / `monsters.generated.js` | Lazy monster loading/generated definitions | P04 loss accounting; P20 typed behavior; P24 offline pinning |
| `src/screens/useTableController.js` | Large interaction/lifecycle controller | P05/P09 durable pending state; targeted hook extraction |
| `src/screens/TableScreen.jsx` | Table view composition | P07 targeting/geometry; P22 sight; P23 keyboard/player adaptation |
| `src/screens/HeroesScreen.jsx` / `GearChapter.jsx` | Character/gear authoring | P06/P10/P14–P19/P23 |
| `src/screens/BattleTokenInspector.jsx` / `BattleSetupInspector.jsx` | Actor details and editing | P04 override visibility; P08 effect inspector; P23 density |
| `src/screens/MonsterBrowser.jsx` | Summoning/catalogue UI | P04 unsupported action visibility; P20 capability status |
| `src/screens/AttackCinematic.jsx` / `CheckCinematic.jsx` | Result presentation | P05 render already-committed outcomes; no authoritative rerolls |
| `src/screens/ChestLootDrawer.jsx` / `CoinEditor.jsx` | Loot/currency UI | P10 instances; P28 quote/receipt reuse where appropriate |
| `src/ui/useDialogA11y.js` | Existing dialog accessibility primitive | P23 focus/keyboard extension rather than duplicating dialogs |
| `src/ui/ApplicationErrorBoundary.jsx` | Application error presentation | P03/P23 recoverable error and diagnostic paths |
| `scripts/generate-phase5-catalogs.mjs` | Current catalogue generation | P01 recharge parsing; P04 source manifests; P21 variants |
| `scripts/generate-monsters.mjs` | Current monster generation | P04 authored totals/nested attacks and loss report |
| `tests/phase11.spec.js` / `tests/expansion.spec.js` | Current browser suites | Extend focused real journeys; add new suites by feature |
| `tests/__screenshots__/_archive/` | Historical screenshots | P00 reviewed active baselines; never claim archive implies assertions |
| `docs/FEATURES.md` / `docs/TODO.md` / `docs/RELEASE.md` | Product scope/backlog/release evidence | P00 and every phase update actual truth |
| `WORKFLOW.md` / `package.json` | Delivery instructions/executable commands | P29 maintain consistency with real checks |

### H.1 Persistence field review checklist

For every added field, trace construction → normalization → edit → command → repository serialization → reload → snapshot copy → restart/abandon → export/import → reconciliation → online projection if enabled. A field that works only in the initial React object is not implemented. Pay particular attention to clearing/reset paths: restart, abandon, rest, re-equip, transformation reversion, respec, and campaign copy can accidentally discard or duplicate new state.

### H.2 Existing racial choices must become usable

The spell/action work must connect previously recorded racial spell choices and dragonborn breath metadata to real actions. Track a small explicit sub-ledger under P11/P13 and the shared action framework: spell access source, ability/DC, level-based unlock, action/uses/recovery, area/targets, and source-defined damage scaling. Preserve existing Lucky, Relentless Endurance, Savage Attacks, save advantages, expertise predicates, resistances, proficiencies, and HP bonuses as regression fixtures. Do not leave the racial browser showing an unlocked power with no executable entry point after the relevant primitive ships.

Weapon Special/Monk properties similarly need explicit supported contracts: connect Monk weapons to P16; adjudicate each supplied Special weapon rule through P07/P09/P15/P20 as applicable. A generic weapon property label is not completion. Inventory actual source weapons with Special, including their targeting, size, attack allowance, and escape/destruction semantics where applicable; do not infer those rules from the label alone.

<a id="appendix-i"></a>

## Appendix I — Operational procedures to make concrete during implementation

### I.1 Local save corruption

1. Enter recovery mode without writes or asset collection.
2. Classify primary/backup/version/storage access independently and retain exact diagnostic codes.
3. Offer a raw evidence export and all available assets; avoid logging private content to a remote service.
4. Preview any valid backup or imported archive in an inactive collection/generation.
5. Validate references and compatibility, then activate through the tested pointer/transaction boundary.
6. Reopen and compare semantic counts/hashes; keep the damaged originals until the documented retention/review point.
7. Record the failure fixture and regression issue after stripping private data with the user's explicit sharing choice.

### I.2 Interrupted migration/import

Read the journal and active generation first. If activation never committed, continue or discard only inactive staging. If activation committed, recognize the operation ID and finish post-commit bookkeeping without applying the import again. Never guess based on a progress bar. Validate asset reachability across active/backup/staged generations before cleanup. Export a usable recovery artifact before any explicitly destructive replacement option.

### I.3 Stuck pending resolution

Inspect pinned rules version, original command, cursor, completed steps, reservations, eligible responders, and last durable outcome. Resume through the same ID. If the source definition is unavailable, load the pinned pack or enter a compatible GM adjudication path; do not recompute with a different rules version. GM resolution/cancellation records what happened and applies the documented cost policy. The recovery command must itself be idempotent. Never repair by editing HP and deleting the pending object independently.

### I.4 Suspected duplicate roll, spend, award, or trade

Use command/receipt/encounter-instance IDs and durable outcomes to distinguish duplicate presentation from duplicate mutation. Preserve the relevant snapshots and sanitized event sequence. If a real duplicate occurred, issue a validated compensating operation referencing the affected outcome; do not rewind the entire campaign past unrelated changes. Add a failure/retry fixture at the boundary that permitted duplication before re-enabling the affected command family.

### I.5 Online outage and restore

Separate login/session outage, command authority failure, delivery backlog, and asset failure. Present cached state as stale/read-only where permitted; do not let clients assume authority. Stop unsafe writes if integrity is uncertain. Restore database and object manifests to a consistent point, rebuild pending outbox delivery idempotently, verify memberships/private projections, and exercise outstanding-command reconciliation before reopening writes. Communicate measured recovery point and any known lost interval plainly.

### I.6 Permission or private-asset exposure

Contain access by disabling the affected projection/route or revoking relevant credentials/links; preserve minimal evidence. Identify exactly which participants received which data and for how long. Correct server-side filtering/asset delivery and add direct-request regression tests before reopening. Purge applicable caches when technically possible, while recognizing already delivered information cannot be recalled from a recipient. Communication and any reporting obligations follow the actual deployment context, not an invented universal checklist.

### I.7 Safe content update

Acquire the explicitly selected source/version; verify provenance; regenerate deterministic definitions and a semantic diff; classify changed mechanics/IDs; run affected behavior contracts and source-loss comparisons; publish a new content version; keep active campaigns pinned; offer reviewed migration/repair where needed. Never delete an old pack still required by a valid supported save without a supported conversion/recovery path.

<a id="appendix-j"></a>

## Appendix J — Plan boundaries, evidence, and completion status

This plan is grounded in the local audit and repository baseline identified at the top. The source fingerprints in Appendix D identify the additional content inventory. External links beside relevant decisions point to official rules, browser platform documentation, accessibility standards, and primary security guidance; provider-specific and source-specific implementation details must be rechecked when that phase begins.

The previous comprehensive findings remain in `NIGHTFORGE_COMPLETE_ANALYSIS.txt`. That analysis contains the detailed runtime observations, reproduced defects, baseline commands/results, architecture inventory, UI findings, and investigation limits. This plan turns those findings into a sequenced implementation program; it does not replace historical evidence with future claims.

**Planning deliverables:** thirty phases with dependencies and acceptance gates; architecture and persistence contracts; a per-content work inventory; interaction/failure matrices; traceability; risks and ADRs; delivery sizing; proposed reviewable PR scopes; code touchpoints; and recovery/runbook requirements.

**Execution status:** this working tree records an implementation of the P04–P06
core slice, with focused verification in `src/phase-plan-4-6.test.js` and
`npm run verify:plan-4-6`. P00–P03 and P07–P29 retain their own planned scope
and are not marked complete by this record. No commit, push, or deployment is
performed by updating this document.

The first future implementation action is the smallest P00/P01 contract-and-regression slice that prevents confirmed data loss. The long-term completion condition is the selected release manifest's passed behavior contracts and recovery gates—not the length of this document or the number of feature names in a menu.
