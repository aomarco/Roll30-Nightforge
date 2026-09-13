# Nightforge release record

## PHASE 12 COMPLETION RECORD

The release contract is complete and maintained here instead of in the
superseded root planning records.

- Release status: **Phase 12 is complete.**
- Production URL: https://aomarco.github.io/Roll30/
- Preview URL: https://aomarco.github.io/Roll30-Nightforge/
- Production rollback tag: `pre-nightforge-2026-08-17`
- Release evidence identifier: `32019078653`

The Pages workflow runs the full `npm run verify` gate before publishing. The
preview and production builds use separate explicit asset bases and separate
Nightforge storage identifiers.

## P04–P06 VERIFICATION RECORD

The current phase slice was verified on 2026-09-06 with:

- `npm run verify:plan-4-6` — content coverage and focused phase tests passed.
- `npm test` — 392 tests passed.
- `npm run typecheck` and `npm run build` — passed.
- `npm run test:browser` — 30 browser tests passed.

The generated content report emitted 1,350 definition records and 334 monster
source records with zero unresolved relationships. The production build still
reports the existing large lazy monster chunk warning; it does not fail the
build.

## P07–P10 CORE CONTRACT RECORD

The P07–P10 core slice was verified on 2026-09-06 with:

- `npm run verify:plan-7-10` — 10 focused geometry, effects, scheduler, resource,
  item-instance, rest, and reload tests passed.
- `npm test` — 402 tests passed.
- `npm run test:browser` — 30 browser tests passed.
- `npm run typecheck`, `npm run lint`, and `npm run build` — passed with zero
  lint errors; lint retains warning-only hooks and unused-import findings.

The implementation record in `NIGHTFORGE_IMPLEMENTATION_PLAN.md` names the
remaining staged work: finishing the full reaction prompt/nested-frame
consumers, effect/zone inspectors, and the full rest UI plus ambiguous
inventory migration workflows.
