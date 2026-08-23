# Working on Nightforge

Read this before you write code. It is short on purpose.

The workflow is six steps, in order:

1. **Build what was asked for.**
2. **Comment as you go.**
3. **Check that it actually worked.**
4. **Send it to GitHub.**
5. **Update `docs/FEATURES.md`.**
6. **Update `docs/TODO.md`.**

Steps 5 and 6 are not paperwork. Read the next section before you skip them.

---

## Why the two documents matter more here than anywhere else

Most of this codebase was written fast, by AI agents, in sessions that no
longer exist. That has one consequence that shapes everything else:

**Whoever picks this up next starts from nothing.** Not "a bit rusty" —
nothing. A fresh agent has never seen this project, cannot remember the last
session, and cannot ask the previous one what it was thinking. Every session is
someone's first day. The only thing that survives between them is what got
written into the repository.

The code alone can't carry it. Reading the source tells you what the app does
right now. It does not tell you:

- what was **tried and abandoned**, so the next session tries it again
- what was **deliberately left out**, so the next session "fixes" it back in
- what is **half-built on purpose**, waiting on something else first
- what is **already finished**, so the next session builds a second copy of it

That is what the two documents are for. `docs/FEATURES.md` is the memory of
what exists. `docs/TODO.md` is the memory of what doesn't, and why.

**A stale document is worse than no document.** Nobody half-trusts a document
— they read it and believe it. If `FEATURES.md` claims a feature that was
deleted, the next agent spends an hour hunting for code that isn't there and
then writes it again from scratch. If `TODO.md` still lists something you
finished, it gets built twice and the two versions disagree. If a decision you
made against something isn't recorded with its reason, it comes back in six
months and nobody remembers why it was dropped the first time.

The trade is lopsided and it is always worth taking. Updating both documents
costs about two minutes at the end of a piece of work. Not updating them costs
the next session hours, and costs you a codebase that slowly stops matching its
own description.

So: the work is not finished when the code runs. It is finished when the code
runs, the gate passes, it is pushed, and the two documents are true again.

---

## 1 — Build what was asked for

Build the thing that was actually asked for. Not a smaller version of it, not a
larger one, not the refactor you noticed on the way past.

- If you find a real problem with the request, say so in a sentence, then keep
  building. Flag it; don't silently change the job.
- If you spot something else that needs doing, write it in `docs/TODO.md` and
  carry on. That is what step 5 is for.
- Finish the whole thing. If part of it turns out to be blocked, finish
  everything else and say plainly what you left out and why.

---

## 2 — Comment as you go, not afterwards

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

## 3 — Check that it actually worked

Two different questions, and you need both answered before anything is pushed.

**Did the thing you built actually do what was asked?** Open the app and use
it. Click the button, roll the dice, drag the token, watch the number change.

```bash
npm run dev
```

A passing test is not proof that a feature works — it is proof that the code
you wrote does what you thought you wrote. Plenty of things pass their tests
and are still wrong on screen: the control renders off the edge, the refusal
message never appears, the value saves but doesn't survive a reload. Look at
it.

**Keep this check short.** One quick pass over the thing you actually built,
then move on. Do not walk the whole app, do not re-check features you did not
touch, and do not write a throwaway script to drive the browser when clicking
the button yourself answers the question in ten seconds. The point is a single
sanity check, not a second test suite — you already have one of those.

**Did you break anything else?** Run the gate. Once, at the end — not between
pieces of work.

```bash
npm run verify
```

This is the same chain CI runs: every unit test, every render smoke suite,
every phase verifier, the browser journeys, the dependency audit, and a
production build. It takes a few minutes. Run it anyway.

If either answer is no, go back to step 1. Do not push it and fix it later.

---

## 4 — Send it to GitHub

Commit and push. Work goes on a branch, not straight onto `main`.

Say what changed and why in the commit message. The diff already says what
moved; the message is for the reason behind it.

---

## 5 — Update `docs/FEATURES.md`

`docs/FEATURES.md` describes the whole app in plain English. It is the single
place anyone goes to find out what Nightforge does. It is only useful if it is
true.

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

## 6 — Update `docs/TODO.md`

`docs/TODO.md` is what's left to build — and, just as importantly, what was
considered and turned down. It is the only record of the thinking that never
made it into the code.

- Cross things off when you build them.
- Add things when you discover them, including the small ones you found while
  doing something else. If you don't write it down it does not exist.
- If you deliberately decide **not** to build something, don't just delete the
  line — move it to the "Decided against" section with the reason. Otherwise
  someone re-proposes it in six months and nobody remembers why it was dropped.

---

## The check before you call it done

- [ ] The thing that was asked for is built, all of it
- [ ] New code carries comments that explain the reasoning
- [ ] You opened the app and watched the change work
- [ ] `npm run verify` passed
- [ ] The work is committed and pushed
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
