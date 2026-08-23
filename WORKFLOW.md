# Working on Nightforge — speed first

Read this before changing the app.

**The default goal is to ship the requested change quickly.** Do not turn a
small fix into a release project. Use the smallest amount of process that gives
real confidence, avoid running the same verification twice, and let GitHub CI
perform the exhaustive gate after the work is pushed.

The default workflow is:

1. **Understand the exact request.**
2. **Make the smallest complete change.**
3. **Run focused verification.**
4. **Update only documentation made stale by the change.**
5. **Commit and push immediately.**
6. **Let CI run the exhaustive gate.**

If the change qualifies for the full-safety lane below, use that lane instead.

---

## Choose a lane before starting

### Fast lane — the default

Use the fast lane for:

- isolated bug fixes
- small UI or copy changes
- narrow combat-rule corrections
- documentation changes
- focused features with an obvious boundary
- test-only changes

Fast-lane rules:

- Work on the current branch. Direct commits to `main` are allowed for a small,
  understood change unless the user asks for a branch or pull request.
- Inspect only the files needed to understand the change. Do not scan the whole
  repository when a focused search answers the question.
- Run the narrowest relevant tests locally. Do not run `npm run verify` by
  default; GitHub CI already runs it after push.
- For a UI change, exercise the changed journey once. Do not walk the rest of
  the app.
- Commit and push as soon as focused verification passes.
- Watch CI. If CI fails, fix the actual failure and push again.

### Full-safety lane — only when risk justifies it

Use the full-safety lane when the change touches any of these:

- storage format, recovery, persistence, or migration behaviour
- authentication, security, permissions, or sensitive data
- dependencies, build configuration, deployment, or GitHub Actions
- generated catalogs or monster generation
- a broad refactor spanning unrelated systems
- destructive data operations
- a release promotion to the production Roll30 repository
- anything the user explicitly asks to verify exhaustively

Full-safety rules:

1. Create a branch.
2. Implement and run focused tests while iterating.
3. Perform one short manual sanity check when UI is affected.
4. Run `npm run verify` once at the end.
5. Update relevant documentation.
6. Commit, push, open a pull request, and wait for CI.

When uncertain, prefer the fast lane unless a failure could lose user data,
break deployment, or affect several unrelated systems.

---

## 1 — Understand the exact request

Build what was actually requested: no smaller substitute, no speculative
expansion, and no unrelated refactor.

- Reproduce a reported bug with the shortest reliable path.
- Read the local code around that path before proposing a solution.
- If another issue appears, record it only when useful and continue with the
  requested work.
- Ask a question only when a missing decision would materially change the
  result. Otherwise make the safest reasonable assumption and move.

Do not spend time producing a formal plan for a tiny change. A one-sentence
working note is enough.

---

## 2 — Make the smallest complete change

Fix the cause, not only the visible symptom, but keep the edit tightly scoped.

- Reuse existing domain functions and UI patterns.
- Avoid opportunistic cleanup unless it is required for the fix.
- Preserve unrelated user changes in the worktree.
- Do not change storage schema versions for ordinary new fields; give new
  fields backwards-compatible defaults in normalizers.

### Comments

Comments are for reasoning that the code cannot express clearly. Add one when:

- a D&D rule or product decision explains the behaviour
- an unusual implementation prevents a subtle bug
- a non-obvious constraint or compatibility requirement must survive

Do not pause to comment obvious code, narrate each line, or document unchanged
areas. Clear names are faster to maintain than redundant comments.

---

## 3 — Run focused verification

Match verification to the change:

| Change | Local verification before push |
|---|---|
| Documentation or copy only | `git diff --check` and read the diff |
| Pure domain rule | Relevant unit test file |
| Small component/UI change | Relevant unit/render test plus one changed journey |
| Browser interaction bug | One targeted browser regression |
| Storage, deployment, dependencies, broad refactor | Full-safety lane and `npm run verify` |

Useful focused commands include:

```bash
node --test --test-name-pattern="relevant behaviour" src/relevant.test.js
npm run test:reactions
npm run test:reactions:render
npx playwright test --grep "relevant journey"
git diff --check
```

Use whichever command actually covers the change; do not run all of them from
habit.

### Avoid duplicate work

GitHub CI runs the complete verification chain. In the fast lane, do **not** run
the full chain locally and then wait for the identical chain remotely. Focused
local verification catches quick mistakes; CI supplies broad regression
coverage.

If focused verification fails, fix it before pushing. If CI fails, inspect the
specific failing job rather than rerunning unrelated local suites.

---

## 4 — Keep documentation truthful, not ceremonial

The repository documents remain the memory between AI sessions, but only touch
the document whose truth changed.

### Update `docs/FEATURES.md` when:

- the app gained or lost user-visible behaviour
- a documented limit, number, name, or rule changed
- an implementation decision future work must preserve changed

### Update `docs/TODO.md` when:

- a listed item was completed
- a real new gap was discovered
- a feature was deliberately rejected and the reason should survive

Do **not** edit both files automatically. A code refactor, test improvement,
workflow edit, or typo fix may require neither. Documentation should take
minutes, not become a second implementation phase.

---

## 5 — Commit and push immediately

Once focused verification passes:

1. Review `git diff --check` and `git status`.
2. Commit with a short message saying what outcome changed.
3. Push without rerunning already-passing tests.

For fast-lane work on `main`, push directly and let the normal GitHub workflow
verify and deploy it. Use a branch and pull request when the user requests one,
repository protection requires one, or the change belongs in the full-safety
lane.

Do not wait for a second local review cycle unless the diff reveals a real
problem.

---

## 6 — Let CI perform the exhaustive gate

After pushing:

- Watch the relevant GitHub workflow.
- If it passes, report the commit and deployment outcome.
- If it fails, inspect the failing step, make a focused correction, and push.
- Do not run live acceptance unless deployment behaviour changed, the user asks
  for it, or CI cannot prove the served build works.

The full command remains available when genuinely needed:

```bash
npm run verify
```

It runs every unit test, render smoke suite, phase verifier, browser journey,
dependency audit, and production build. It is intentionally **not** the default
local command for small changes.

---

## Fast-lane completion checklist

- [ ] The requested change is complete and tightly scoped
- [ ] The most relevant focused test passed
- [ ] UI was checked once if UI changed
- [ ] Documentation made stale by the change was corrected
- [ ] `git diff --check` passed
- [ ] The work was committed and pushed
- [ ] CI was watched to completion

That is enough. Do not add ceremony after every box is checked.

---

## Things that will bite you

- **Never bump `NIGHTFORGE_SCHEMA_VERSION` casually.** The version check has no
  migration path and a bump can discard existing saves. Prefer defaults in the
  normalizer.
- **Domain code stays pure.** No `window`, `localStorage`, `Date.now()`, or
  direct `Math.random()` access. Inject clocks and randomness.
- **Some verifiers grep literal source text.** Read a failing verifier before
  rewriting correct code to satisfy it.
- **SRD source data stays out of the repository.** Generators may read it from a
  supplied local path; only generated output is committed.
- **Generated files are not hand-edited.** Change the generator and regenerate.
- **The production Roll30 repository is separate.** A Nightforge push does not
  authorize or imply production promotion.
