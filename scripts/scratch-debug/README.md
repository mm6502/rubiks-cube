# scratch-debug — rotation-animation evidence

**Status: temporary. Not part of the app and not imported by it.**

These files exist to support one piece of work: replacing the Basic view's
matrix-based rotation animation with a shared angle-based primitive. They are
the measured evidence behind
[`docs/plans/2026-09-20-001-refactor-shared-rotation-animation-plan.md`](../../docs/plans/2026-09-20-001-refactor-shared-rotation-animation-plan.md)
and its origin
[`docs/brainstorms/2026-09-20-shared-rotation-animation-requirements.md`](../../docs/brainstorms/2026-09-20-shared-rotation-animation-requirements.md).

Read that plan first. This folder only records _how the claims were measured_.

## Why this folder still exists

The plan rests on two measured claims that no unit test currently guards:

1. **The defect is component-wise matrix interpolation, not a browser quirk.** A
   `matrix3d → matrix3d` transition shears the geometry when interrupted, in
   Chromium _and_ Firefox.
2. **A fixed rotation axis cannot work.** The correct axis is derived from
   state.

Those claims shaped requirements R1 and R2. Until they are promoted into real
tests, these scripts are the only reproducible basis for them.

## The files that matter

| File                           | What it establishes                                                                                                                                                                                                                            | How to run                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `probe-css-transition.mjs`     | The **actual defect**. The only probe that drives the app's real path (CSS `transition`, the composite transform string, and transitions interrupted mid-flight). Reports per-frame sweep, net angle, minimum determinant, and reversal count. | `node scripts/scratch-debug/probe-css-transition.mjs chromium`      |
| `analysis-pivot-structure.mjs` | The **96/96 computation** behind R2: over all 24 orientations × 4 rotations, a fixed-axis pivot is wrong in 96/96 cases and a state-derived axis is correct in 96/96.                                                                          | `node scripts/scratch-debug/analysis-pivot-structure.mjs`           |
| `analysis-rotation-axis.mjs`   | The **6-distinct-axes** result: a given rotation gesture uses ±X/±Y/±Z depending on current orientation, which is why the axis cannot be a constant.                                                                                           | `node scripts/scratch-debug/analysis-rotation-axis.mjs`             |
| `repro.html`                   | A **standalone side-by-side comparison** — panel A is the current `matrix3d` + CSS-transition scheme, panel B is the proposed WAAPI `rotate3d` scheme. Each panel prints its own swept angle and an OK/MISBEHAVES verdict.                     | Open the file directly in any browser (no build step)               |
| `validate-repro.mjs`           | Drives `repro.html`'s own buttons through Playwright and prints what each panel reports.                                                                                                                                                       | `PW_HEADED=1 node scripts/scratch-debug/validate-repro.mjs firefox` |

Both entry points take the engine as an argument (`chromium` or `firefox`).

## Read this before trusting any number

Four traps cost real time during the investigation. If you re-measure, avoid
them.

**1. Measure headed, not headless.** The headless compositor takes a different
path. Set `PW_HEADED=1` for the Playwright-driven scripts.

**2. Do not use the rotation-block determinant as the assertion.** It measures
`1.000` for the _entire_ animation **even on the broken implementation**. A
determinant check passes on the very defect this work exists to fix. The real
signature of the bug is:

- the swept angle is **90° where 270° was intended**, and
- the traversal **reverses direction** mid-flight (`reversals=2`).

**3. Identity and 360° frames serialize as 2D `matrix(1,0,0,1,0,0)`, not
`matrix3d(...)`.** A metric that only accepts 16-value matrices silently drops
those frames and under-reports the swept angle.

**4. Measure the outcome, not a proxy.** An earlier probe measured the _pivot's_
angle rather than the _resulting cube orientation_. It reported that the
proposed scheme worked, and it was wrong. Anything that measures a stand-in
instead of the end state will produce a confident wrong answer.

**On Firefox specifically:** Playwright's bundled Firefox is a _patched build_
and is not the shipped browser. It cannot settle a browser-specific question.
For that, open `repro.html` directly in a real Firefox — that is the whole
reason it is a standalone page rather than a script.

## What to do when the work lands

This folder is a means, not a deliverable. In rough order of preference:

1. **Promote the axis computation into a real unit test.** The 96/96 result is
   load-bearing for the plan, and a scratch script is not a durable guard. This
   is the strongest outcome and the one the plan recommends.
2. **Promote the load-bearing artifacts into a tracked location** if they remain
   useful for future animation work.
3. **Delete the folder** once the fix ships and the claims are covered by tests.

Do not leave it in its current state indefinitely, and do not treat it as
reference documentation. It is committed only so the evidence survives until the
claims are covered by tests; it is not a permanent part of the codebase.

> **Keep this folder out of the quality gate.** It contains no `*.test.ts` files
> and is excluded from linting (ESLint targets `**/*.ts`), but
> `scripts/tsconfig.json` does type-check `.ts` files under `scripts/`, so any
> future `.ts` file added here must type-check.

## Conventions

- Plain `.mjs` run directly by `node` — no build step, no dependencies beyond
  what the repo already has (`playwright` comes from `@playwright/test`).
- Top-level `await`; no test framework.
- Deliberately excluded from the app build and from linting. `repro.html` is a
  standalone page, not a Vite entry — it is not bundled and must not be.
