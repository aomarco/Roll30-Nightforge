# Working on Nightforge

Read this before you write code. It is short on purpose.

There are three rules. They exist because the codebase outlived the memory of
everyone who wrote it, including the people who wrote it last week.

---

## Rule 1 — Comment as you go, not afterwards

Write comments while the reasoning is still in your head. A comment added a day
later is a guess about your own past thinking.

**Explain why, not what.** Anyone can read `hp = Math.max(0, hp)` and see that
it clamps. Nobody can see *why* it clamps at zero instead of allowing negatives,
or what breaks downstream if it doesn't.

Good:

```js
// A melee attack keeps distance bands only when it can be thrown; that is
// what turns "swing it" into "swing it or throw it".
const banded = rangeKind === "ranged" || throwable;
```

Useless:

```js
// Set banded to true if ranged or throwable
const banded = rangeKind === "ranged" || throwable;
```

**Comment these things every time:**

- Any number that isn't obvious. Where did `4000` come from? Why `0.35`?
- Any rule that comes from D&D rather than from the code. Say which rule.
- Any place you deliberately did the unusual thing. Say what the obvious
  approach was and why it fails here.
- Any function whose name doesn't fully carry its job.
- Anything that will look like a bug to someone who doesn't know the history.

**Don't comment these:**

- What a well-named function does. Rename it instead.
- Line-by-line narration of plain code.
- Anything that will go stale the moment the code beside it changes.

The bar to aim for: a competent programmer who has never seen this project
should be able to open any file and follow what is happening and why.

---

## Rule 2 — Update `docs/FEATURES.md` when you finish

`docs/FEATURES.md` describes the whole app in plain English. It is the single
place anyone goes to find out what Nightforge does. It is only useful if it is
true.

When you finish a piece of work, before you commit:

1. **Add** entries for anything the app can now do that it couldn't before.
2. **Remove** anything that is no longer true. This matters more than adding.
   A missing feature is an inconvenience; a documented feature that doesn't
   exist sends the next person hunting for code that was deleted.
3. **Correct** anything that shifted — counts, limits, names, behaviour.
   The document quotes real numbers. If you changed one, change it here.
4. **Record the reason** if you made a real decision. One clause on the end of
   the entry is enough. "Frozen at 1 because bumping it wipes every save."

Finished means finished. Not "the code works" — the code works, the tests pass,
and the document matches reality.

---

## Rule 3 — Keep `docs/TODO.md` honest

`docs/TODO.md` is what's left to build.

- Cross things off when you build them.
- Add things when you discover them, including the small ones you find while
  doing something else. If you don't write it down it does not exist.
- If you deliberately decide **not** to build something, don't just delete the
  line — move it to the "Decided against" section with the reason. Otherwise
  someone re-proposes it in six months and nobody remembers why it was dropped.

---

## Before you commit

```bash
npm run verify
```

This is the same chain CI runs: every unit test, every render smoke suite,
every phase verifier, the browser journeys, the dependency audit, and a
production build. It takes a few minutes. Run it anyway.

Then check yourself against the three rules:

- [ ] New code carries comments that explain the reasoning
- [ ] `docs/FEATURES.md` matches what the app actually does now
- [ ] `docs/TODO.md` reflects what is genuinely left

---

## Things that will bite you

A short list of traps that are not obvious from reading the code. The full
reasoning for each is in `docs/FEATURES.md`.

- **Never bump `NIGHTFORGE_SCHEMA_VERSION`.** The version check is a strict
  mismatch with no migration path — a bump discards every existing save. Add
  new fields by giving them defaults in the normalizer instead. That is
  backwards-compatible for free.
- **Domain code stays pure.** No `window`, no `localStorage`, no `Date.now()`,
  no `Math.random()` reached for directly. Randomness and clocks arrive as
  arguments so tests can pin them. Phase verifiers enforce this and will fail
  the build.
- **Verifiers grep for literal source text.** Some phase verifiers assert on
  exact strings in the source, not on behaviour. Innocent refactors can fail
  them. If a verifier fails on code you believe is correct, read the verifier
  before changing the code.
- **SRD source data stays out of the repo.** `DND 5E Data/` is gitignored.
  Generators read it from a path you supply; only their generated output is
  committed.
- **Generated files are not editable.** `catalog.generated.js` and
  `monsters.generated.js` are build artefacts. Change the generator in
  `scripts/` and re-run it.
