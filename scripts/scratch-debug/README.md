# scratch-debug — browser-level verification for rotation animation

**Not part of the app. Not imported by it. Not a permanent host for the plan's
claims.**

This folder holds the checks that cannot live in the test suite:

- `verify-rotation-fix.mjs` — drives the **built app** in a real browser and
  checks the rotation _traversal_ (what the cube looks like at each frame).
- `verify-tilt-animation.mjs` — drives the **dev server** and checks that a
  tilt/pitch toggle actually starts an animation, with a mid-flight sample that
  distinguishes an interpolated ramp from a snap.

## Why this exists at all

The rotation-animation defect is a property of a _traversal_ — what the cube
looks like at each frame while it is turning. Nothing in the unit suite can see
that:

- jsdom has no Web Animations API, so a stubbed animation resolves instantly and
  every frame is missing.
- Even with a stub, `getComputedStyle` has no compositor to report from.

So the two claims the work rests on are covered twice, deliberately:

| Claim                                                                    | Durable guard (preferred)               | Browser guard                         |
| ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------- |
| The rotation axis must be state-derived, not fixed (6 axes, 96/96 exact) | `src/views/basic/rotation-math.test.ts` | R2 check in `verify-rotation-fix.mjs` |
| An interrupted rotation travels the intended path and never reverses     | partially — `planRotation` unit tests   | R1 checks (the real evidence)         |

The axis claim was **promoted into a real unit test**, because it is
load-bearing for the implementation and a scratch script is not a durable guard.
The traversal claim stays here, because it genuinely cannot be a unit test.

## Running it

```bash
npm run build                                         # verify-rotation-fix.mjs drives dist/index.html
node scripts/scratch-debug/verify-rotation-fix.mjs chromium
node scripts/scratch-debug/verify-rotation-fix.mjs firefox
```

`verify-tilt-animation.mjs` drives the **dev server** instead, because it needs
the live app rather than a build:

```bash
npm run dev                                           # or any server on :5173
node scripts/scratch-debug/verify-tilt-animation.mjs
```

Add `PW_HEADED=1` for the headed compositor path (see the traps below).

Both exit non-zero if any check fails, so they are usable as a gate.

## What it asserts, and which requirement each check covers

| Check                                                               | Covers |
| ------------------------------------------------------------------- | ------ |
| A view rotation animates as a ~90° sweep with no reversal           | R1     |
| No interpolated frame leaves the rotation group                     | R1     |
| An **interrupted** rotation never reverses direction                | R1     |
| Different orientations use different world axes                     | R2     |
| A burst past the threshold still lands on the requested orientation | R3     |
| `prefers-reduced-motion` applies the rotation without animating     | R4     |
| A rapid sequence reveals the strips exactly once, at the end        | R7     |

`verify-tilt-animation.mjs` covers the presentation slot, which no unit test can
observe because jsdom's `animate` does not interpolate:

| Check                                                  | Why                                        |
| ------------------------------------------------------ | ------------------------------------------ |
| A view rotation starts an animation (control)          | Proves the input path is live              |
| A tilt toggle starts an animation                      | The reported regression                    |
| A pitch toggle starts an animation                     | The sibling path                           |
| The mid-flight transform is neither endpoint           | Separates a ramp from a snap               |
| Animations finish and are not left holding the element | No leaked `fill: forwards`                 |
| A later view rotation still changes the transform      | The base ramp does not disturb orientation |

## The metric is the outcome, not a proxy

Each frame's computed matrix is `C = B · R · M`, where `B` is the base tilt, `M`
is the basis the ramp is built on, and `R` is the rotation the animation is
applying. The script recovers `R = B⁻¹ · C · M⁻¹` and then checks it directly:
is it orthonormal, is its determinant +1, what is its axis, and how far has it
swept.

## Traps — read before trusting or re-deriving any number here

Six cost real time during this work. Each produced a confident, wrong answer.

1. **Do not assert on the rotation-block determinant of a composed frame.** It
   measures `1.000` for the _entire_ animation even on the broken
   implementation, so it passes on the very defect this exists to catch. The
   determinant is meaningful only on the **recovered rotation** (above).

2. **Identity and 360° frames serialize as 2D `matrix(1,0,0,1,0,0)`, not
   `matrix3d(...)`.** A metric that only accepts the 16-value form silently
   drops those frames and under-reports the swept angle.

3. **A headless page does not run `requestAnimationFrame`.** An in-page rAF
   sampling loop records _zero_ frames and looks like "nothing happened" rather
   than like a broken harness. Sampling here is driven from Node, one `evaluate`
   per frame; polling `getComputedStyle` still returns the painted value of a
   running animation. Verify in headed mode too (`PW_HEADED=1`), since the
   headed compositor takes a different path.

4. **The app routes keys from its own focus model.** Calling `.focus()` on an
   element is not enough — the rotation keys then reach nothing and every sweep
   measures 0°, which reads as "the animation is broken". Focus has to be
   claimed through the app's real contact path (a `pointerdown` on the
   registered view container). The script asserts the focus took effect, and
   asserts the orientation actually changed, so a vacuous pass cannot recur.

5. **`matrix3d` is COLUMN-major.** The app's `matrix3d(vR.x, vU.x, vF.x, …)`
   therefore puts `viewRight`/`viewUp`/`viewForward` in the matrix's
   **columns**. Reading them as rows transposes the rotation, which yields a
   plausible-looking but wrong axis/angle. The unit test pins this against the
   app's own string.

6. **Do not round an axis to integers.** A rotation between two of the 24
   axis-aligned orientations has an axis of exactly ±X/±Y/±Z, but an
   _interrupted_ rotation re-bases onto a pose that is not one of the 24, and
   `Math.round` maps a general axis like `(0.707, 0.707, 0)` to `(1, 1, 0)` —
   not a unit vector, not the rotation. Snap per component instead.

## What this folder used to hold, and why it does not any more

`probe-css-transition.mjs`, `repro.html`, `validate-repro.mjs`,
`analysis-pivot-structure.mjs` and `analysis-rotation-axis.mjs` were removed
when the fix landed. They are deliberately **not** preserved:

- The probes existed to characterise a scheme that no longer exists (a CSS
  `transition` interpolating `matrix3d`). `probe-css-transition.mjs` was the
  only artifact that could show the original defect, but it can only show it on
  code that has been deleted, so keeping it invites a future reader to run it,
  get a clean result, and conclude something false.
- The two `analysis-*` scripts computed claims that are now enforced by
  `rotation-math.test.ts` over the same 24 × 4 cases. Keeping a second,
  unmaintained copy of a load-bearing computation is how the two drift.
- Their measured conclusions live on in the commit history and in
  `docs/plans/2026-09-20-001-refactor-shared-rotation-animation-plan.md`.

## Conventions

- Plain `.mjs`, run directly by `node` — no build step. `playwright` comes from
  `@playwright/test`, which the repo already has.
- Top-level `await`; no test framework.
- Excluded from the app build and from ESLint (which targets `**/*.ts`).
  `scripts/tsconfig.json` type-checks only `.ts` files, so any future `.ts` file
  added here would need to type-check.
