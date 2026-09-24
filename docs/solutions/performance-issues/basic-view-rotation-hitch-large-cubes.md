---
title:
  '7x7 Basic-view rotation hitches ~120 ms mid-flight while frame rate stays
  full (unresolved)'
date: 2026-09-24
category: performance-issues
module: src/views/basic
problem_type: performance_issue
component: frontend_stimulus
severity: medium
symptoms:
  - 'A whole-cube view rotation on a 7x7 cube stalls once, visibly, mid-flight,
    then continues; 3x3 peaks at ~43 ms and reads as smooth.'
  - 'Average frame gap stays near 17 ms, a full 60 fps, so this is one stall per
    rotation rather than a frame-rate collapse.'
  - 'The stall grows with cube size: median gap 31/38/50/65/92/117 ms for 2x2 to
    7x7 at a fixed 19421 px screen area.'
  - 'A control detach of the cube children leaves a large residual - 72 ms of
    133 ms at 7x7 survives with the element completely empty - so no content
    change alone can remove it.'
  - 'Four mitigations changed nothing: squaring the .cubie-interior corners,
    rebuilding the pre-sealed-body DOM, will-change on the cube, and re-enabling
    backface culling.'
root_cause: config_error
resolution_type: documentation_update
related_components:
  - testing_framework
  - tooling
  - documentation
tags:
  - basic-view
  - performance
  - css-3d
  - preserve-3d
  - compositing
  - raster
  - view-rotation
  - unresolved
---

# 7x7 Basic-view rotation hitches ~120 ms mid-flight while frame rate stays full (unresolved)

> **STATUS: NOT FIXED.** No validated root cause and no validated fix. Four
> candidate mitigations were tried and **none** changed any measurement — and
> three of those nulls were measured through an instrument that was itself
> contaminating the result (see _What Didn't Work_), so they are weak evidence
> rather than proof of no effect.
>
> **The arithmetic in this document was re-derived during the write-up and six
> quoted figures did not survive.** They are corrected below and flagged where
> they appear. Do not re-quote the original numbers from `TODO.md`. Evidence
> labels: **MEASURED**, **CONFIRMED**, **RULED OUT**, **OPEN / NOT PROVEN**,
> **UNTESTED**.

## Problem

On cubes larger than 3x3 — most visibly 7x7 — a whole-cube view rotation stalls
for roughly 120 ms in the middle of the gesture. The rotation completes and the
average frame rate stays healthy, so this is not a frame-rate collapse; it is a
single visible hitch per rotation. It is a real cost of large cubes that
pre-exists the sealed-body change.

## Symptoms

- **MEASURED** (Firefox + Chromium; dev server + built app; `main` + sealed-body
  branch): one ~120 ms stall per rotation at 7x7. It **PRE-EXISTS** the
  sealed-body change — it is not a regression from it.
- **MEASURED:** the hitch lands **MID-FLIGHT**, not at the start of the ramp.
- **MEASURED:** 3x3 worst frame gap is ~43 ms and reads as smooth; 7x7 worst is
  133 ms and does not.
- **MEASURED:** dev server vs built app makes **no difference** (117 ms vs 114
  ms at 7x7, a 2.6% spread) → ruled out as HMR or unminified-module overhead.
- **MEASURED:** Firefox reports **ZERO long tasks** (>50 ms main-thread blocks)
  during the rotation → ruled out as script/main-thread work.
- **MEASURED:** worst frame gap with the cube element's children **detached** is
  still 19 ms at 3x3 and 72 ms at 7x7 → part of the cost is independent of the
  content.

## What Didn't Work

### Failed hypotheses

| Hypothesis                                    | Verdict                        | Why                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"The cause is NOT element count"**          | **RULED OUT (falsified)**      | The attach/detach experiment shows a content part that disappears when children are removed: 24 ms of 43 ms at 3x3, 61 ms of 133 ms at 7x7. What survives is weaker: element count is **not the whole** cause and is a **capped lever**.                                              |
| **Element count is the sole cause**           | **RULED OUT**                  | 7x7 still stalls 72 ms with the element completely empty. Both parts are real.                                                                                                                                                                                                        |
| **A frame-rate collapse**                     | **RULED OUT**                  | It is one stall, not a depressed frame rate. ⚠ But the supporting "average frame gap ~17 ms" figure appears to be an **unlabelled median** — as a mean it is arithmetically impossible for a rotation shorter than ~6.5 s (see _Arithmetic corrections_ #5).                          |
| **Pre-warming the first frame**               | **RULED OUT (by position)**    | The hitch is mid-flight, so it cannot be a first-frame warm-up cost.                                                                                                                                                                                                                  |
| **Dev-server / unminified-module cost**       | **RULED OUT (by measurement)** | 117 ms vs 114 ms.                                                                                                                                                                                                                                                                     |
| **Script / main-thread work**                 | **RULED OUT (by measurement)** | Zero long tasks in Firefox. The earlier "JS cost per frame is ~0.1 ms" note was a **read-latency proxy only** and is not evidence either way.                                                                                                                                         |
| **Squaring the `.cubie-interior` corners**    | **MEASURED-NULL**              | Changed nothing. Note the CSS also records a **correctness** objection independent of performance: the rounded wall corners are what stop the far side of the cube showing through (`basic-view.module.css` ~line 126), so this lever would trade a sealed-body property for nothing. |
| **Rebuilding the pre-sealed-body DOM**        | **MEASURED-NULL**              | Fewer elements per cubie changed nothing. Consistent with the fixed part dominating at the sizes tried, and with the element lever being capped.                                                                                                                                      |
| **`will-change: transform` on the cube**      | **MEASURED-NULL**              | Changed nothing. Likeliest reason, recorded for the next attempt: a 3D rendering context is **broken by promoting a descendant of it**, so the cube is the wrong element to promote.                                                                                                  |
| **Backface culling (re-enabled, diagnostic)** | **MEASURED-NULL (perf only)**  | Changed nothing for speed, and is separately **not viable**: culling is what produces the opposite-face flash documented in `ui-bugs/backface-culling-flash-during-view-rotation.md`.                                                                                                 |

### The failed measurement instrument (why the nulls above are weak evidence)

**MEASURED:** the sampler contaminated every mitigation measurement. Calling
`getComputedStyle` plus a forced layout read **every tick** over a ~2000-element
`preserve-3d` tree added **~180 ms of blocking in Chromium** — 2 long tasks vs 1
with a timestamp-only sampler. The four mitigations were therefore measured
through an instrument whose own overhead was the same order as the effect being
looked for. **Rule:** sample with timestamps only (or a GPU-benchmarking trace),
never DOM reads.

This is the same failure family as the sibling record's "a harness that cannot
be seen to fail is not evidence"
(`ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md`) — but a stronger
version: here the harness _could_ fail and silently _would not_, because its own
cost swamped the signal.

## Arithmetic corrections

Six quoted figures did not survive re-derivation. The originals live in
`TODO.md`'s previous revision; these are the corrected versions.

| #   | Original claim                                                        | Recomputed                                                                                                                                                                                                                                                                                                                                         | Verdict                                                                                                                                                          |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fit `24 + 0.046 x elements` "predicts 39/52/69/91/117"                | Least-squares refit of the same six points is **`21.90 + 0.04694 x elements`**; the slope agrees but the intercept does not. Residuals under the written fit: **+0.31 / +1.59 / +2.29 / +4.40 / -1.07 / -0.13**, worst at 5x5 = **4.40 ms (6.8%)**. The quoted "predicts" list also mixes truncation with rounding (39 from 39.59; 91 from 90.93). | **WRONG as presented** — and the residual signs are **not random** (four negatives then two positives), so the linear form is mis-specified or 5x5 is an outlier |
| 2   | "element count accounts for roughly half the hitch (61 ms of 133 ms)" | 61/133 = **45.9%**, so "roughly half" is defensible — **for the worst-gap decomposition**. But the document's own fit implies `0.046 x 2019 = 92.9` of 117 = **79.4%**                                                                                                                                                                             | **OK but internally contradicted** — 46% and 79% are the same doc's answers                                                                                      |
| 3   | "9 -> 6 face elements per cubie recovers only ~20 ms of 133 ms"       | 3 fewer x 218 cubies = 654 elements x **0.0302** (the 7x7 content rate) = **19.8 ms** ✓. But at the fit slope 0.046 it is **30.1 ms**. Separately, "9 per cubie" is wrong: a surface cubie is **6 walls + 1..3 stickers**, i.e. **1602/218 = 7.35 average** at 7x7                                                                                 | **OK only at the content rate**; wrong at the headline slope, and the premise count is wrong                                                                     |
| 4   | "12.7x the elements gives only 3.8x the gap"                          | 2019/159 = **12.70**; 117/31 = **3.77** ✓                                                                                                                                                                                                                                                                                                          | **OK**                                                                                                                                                           |
| 5   | "average frame gap ~17 ms" alongside a 133 ms gap                     | As a **mean**, incompatible for any rotation shorter than ~6.5 s (`133 + 16.7(N-1) = 17N` -> N ~ 388 frames). For an 18-frame (300 ms) rotation the mean would be **23.4 ms (~43 fps)**                                                                                                                                                            | **Almost certainly an unlabelled MEDIAN** — relabel or recompute                                                                                                 |
| 6   | 3x3 "~43 ms, roughly one dropped frame"                               | 43/16.67 = **2.58** intervals, i.e. **~1.6 frames dropped**                                                                                                                                                                                                                                                                                        | **IMPRECISE** — nearer two than one                                                                                                                              |

**Checked and OK:** 133 - 16.7 = 116.3 ~ 120 ms (#8 in the original numbering);
the 12.7x vs 3.8x compression (#4).

## What Is Established

### 1. Two parts, separated by attach/detach at fixed size (MEASURED)

The same rotation with the cube element's children attached vs detached,
**alternated** so drift affects both equally. Firefox, **worst frame gap**:

| size | full   | no content | content part | fixed part |
| ---- | ------ | ---------- | ------------ | ---------- |
| 3x3  | 43 ms  | 19 ms      | 24 ms        | ~19 ms     |
| 7x7  | 133 ms | 72 ms      | 61 ms        | ~72 ms     |

- **(a) FIXED part** — survives with the element **completely empty**: the cost
  of animating a `preserve-3d` element whose ancestor carries `perspective`.
  Grows with **size** (19 -> 72 ms, 3.8x), not with element count.
- **(b) CONTENT part** — disappears when children are removed: 61/2019 =
  **0.0302 ms per element** at 7x7. Attributed to re-rasterising a subtree that
  `preserve-3d` will not promote to its own compositing layer, so it is
  **repainted rather than moved** — a mechanism, not a measurement.
- ⚠ **The content part is sub-linear in element count:** 0.071 ms/element at 3x3
  vs 0.030 ms/element at 7x7. The rate halves while elements grow ~6x. "Scales
  with element count" is true in **direction only**.

### 2. The hitch grows with cube size at FIXED screen area (MEASURED)

Screen area held at 19421 px at every size, so pixel area is controlled for:

| size | elements | median gap |
| ---- | -------- | ---------- |
| 2x2  | 159      | 31 ms      |
| 3x3  | 339      | 38 ms      |
| 4x4  | 615      | 50 ms      |
| 5x5  | 987      | 65 ms      |
| 6x6  | 1455     | 92 ms      |
| 7x7  | 2019     | 117 ms     |

⚠ **This table cannot support the claim it is used for.** The elements column is
a **deterministic function of the size**: it is exactly `48n^2 - 60n + 87`
(verified — it reproduces all six rows with a constant second difference of 96).
Element count and cube size are therefore **perfectly collinear**, and gap-vs-
elements is indistinguishable from gap-vs-size or gap-vs-n^2. **Only the
attach/detach experiment (#1), which varies elements at fixed size, can separate
the two causes.** This table supports "the hitch grows with size" and nothing
more.

- **Fit as written:** `24 + 0.046 x elements`. **Least-squares refit:
  `21.90 + 0.04694 x elements`.** See correction #1 — the written fit is not the
  LSQ fit of its own data and its residuals have a non-random sign pattern.
- The additive constant is what compresses the ratio: 12.70x the elements gives
  3.77x the gap.
- ⚠ **The elements column is not walls + stickers.** Code-implied (6 walls +
  `6n^2` stickers over `6n^2-12n+8` surface cubies) is **72 / 210 / 432 / 738 /
  1128 / 1602**, against the table's 159 / 339 / 615 / 987 / 1455 / 2019 — a
  shortfall of 87 / 129 / 183 / 249 / 327 / 417, which fits a cubic (second
  difference 12). **What the column actually counts is unknown.** Re-count with
  `cubeEl.querySelectorAll('*').length`.

### 3. Attribution conflicts inside the records (⚠)

| Decomposition                                | 3x3 element share | 7x7 element share |
| -------------------------------------------- | ----------------- | ----------------- |
| Attach/detach, **worst** gap (24/43, 61/133) | 55.8%             | **45.9%**         |
| Written fit, **median** gap                  | 39%               | **79.4%**         |

Both cannot be "the" element-count share. They are different statistics (worst
vs median) and the records present them as though they describe one "content
part". Likewise the fit's **size-invariant 24 ms constant** cannot be the same
quantity as the **measured** fixed part (19 ms at 3x3, 72 ms at 7x7). "Roughly
half" is true only under the worst-gap decomposition.

### 4. What the code actually contains (CONFIRMED by reading)

- `.cube-wrapper` carries `perspective: 1000px`; `.cube` and `.cubie` carry
  `transform-style: preserve-3d` (`basic-view.module.css` lines 21, 32, 46). The
  fixed part's structural precondition is present exactly as described.
- `.sticker` and `.cubie-interior` both deliberately keep
  `backface-visibility: visible`; changing that is not a free lever.
- Each surface cubie is **6 `.cubie-interior` walls + 1..3 stickers** -> **7.35
  face elements per cubie on average at 7x7** (1602 / 218), not 9. 3x3 has 26
  surface cubies; 7x7 has 218.
- The rotation is a **WAAPI ramp** on the `.cube` element's transform
  (`rendering.ts`, `updateRotation` -> `animateRotation`), not a CSS transition
  and not script-per-frame.

## What Is Still Open

| Open question                                                                        | Status                | Experiment that would settle it                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does promoting the cubie subtree to its own compositing layer(s) remove either part? | **UNTESTED**          | Add a compositor-only property to `.cubie` (or a wrapper) and re-measure with a **timestamp-only** sampler. Both parts are compositor costs, so this is the biggest lever. ⚠ `preserve-3d` is load-bearing for depth sorting, so also re-check occlusion — the sealed body depends on it. |
| Does moving `perspective` to an ancestor change the fixed part?                      | **UNTESTED**          | Move `perspective` one level up; re-measure the detached-children case only.                                                                                                                                                                                                              |
| Does `will-change: transform` on the **ancestor** / wrapper help?                    | **UNTESTED**          | The cube-level attempt was inert; a 3D rendering context is broken by promoting a descendant, so the ancestor is the correct target.                                                                                                                                                      |
| Does reducing elements per cubie pay anything like ~20 ms?                           | **UNTESTED**          | Ceiling is **19.8 ms at the content rate, 30.1 ms at the fit slope, out of 133 ms (15-23%)** — and note `.cubie-interior` rounding is already load-bearing for occlusion.                                                                                                                 |
| Is "average frame gap ~17 ms" a mean or a median?                                    | **OPEN**              | Recompute both from raw frame timestamps. As a mean it is arithmetically impossible for a short rotation containing a 133 ms gap.                                                                                                                                                         |
| Is the 5x5 median really 65 ms?                                                      | **OPEN**              | It is the worst residual in the fit (4.40 ms, 6.8%). Re-measure it before fitting any further model.                                                                                                                                                                                      |
| What is the elements column counting?                                                | **OPEN**              | `cubeEl.querySelectorAll('*').length` at each size, printed beside the cubie/sticker counts.                                                                                                                                                                                              |
| Can the element effect be separated from the size effect?                            | **OPEN / NOT PROVEN** | The two are collinear in the size sweep. Requires varying size at fixed element count, which is not currently possible — another reason to trust only the attach/detach manipulation.                                                                                                     |

## Fix candidates (none validated)

Ordered by expected payoff. **None validated**; three of the nulls above were
measured with a contaminated instrument, so even those are weak evidence.

1. **Promote the cubie subtree to its own compositing layer(s).** The biggest
   lever, since both parts are compositor costs. ⚠ Care: `preserve-3d` is what
   makes 3D depth sorting correct, and the sealed body depends on depth sorting
   for occlusion — verify against the seam defect, not only against frame
   timing.
2. **Move `perspective` to an ancestor; try `will-change: transform` on the
   ancestor and the wrapper.** A 3D rendering context is broken by promoting a
   **descendant**, which is the likeliest reason the cube-level attempt was
   inert.
3. **Reduce elements per cubie** — only after 1 and 2. Capped at ~20 ms of 133
   ms at best, and not a free change for the reason in #4 above.

**Re-measure before re-modelling:** 5x5 is the outlier, and the whole size-sweep
fit rests on a regressor that is collinear with the rival cause.

## Prevention

**The durable lesson is instrument bias, not cube geometry.**

1. **A profiler that forces style/layout reads changes what it measures.** A
   per-tick `getComputedStyle` + forced layout read over a ~2000-element
   `preserve-3d` tree added **~180 ms of blocking in Chromium** (2 long tasks vs
   1). Four mitigations were measured through that instrument and all read null.
   Sample with timestamps only, and always run a control with the sampler
   disabled before trusting a timing from a DOM-reading harness.
2. **Name the statistic.** "Worst frame gap", "median frame gap" and "mean frame
   gap" are three different quantities. Mixing them produced both the 46%-vs-79%
   contradiction and the impossible 17 ms mean. Label every number.
3. **Check that your regressor is not a deterministic function of the rival
   cause.** Element count is an exact quadratic in `n`, so gap-vs-elements
   cannot be distinguished from gap-vs-size. When two causes are collinear, only
   a **manipulation** (detach the children) can separate them; a regression
   never will. This single check would have prevented the headline
   mis-attribution.
4. **When you state a fit, state its residuals.** The original fit was quoted
   with a hand-written "predicts vs measured" list that hid a 4.40 ms (6.8%)
   miss and mixed truncation with rounding. Print the residual column; if its
   signs are not random, say the model is wrong rather than the data noisy.
5. **A falsified claim needs a replacement sentence, not just a retraction.**
   "Not element count" became "not the whole cause, and a capped lever" — state
   the surviving version explicitly so the next reader does not re-derive the
   wrong conclusion.

## Related

- `TODO.md` — the source entry this document absorbs.
- `docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md` —
  precedent for the NOT-FIXED / evidence-label format, and the sibling record of
  an instrument producing wrong numbers.
- `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`
  — the coordinate-space trap for measuring inside `perspective` +
  `preserve-3d`.
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` — why
  backface culling cannot be re-enabled as a performance lever, and the
  `config_error` precedent for a CSS-declaration cause in this view.
- `docs/solutions/best-practices/cdp-animation-capture-global-timeline-2026-04-19.md`
  — timeline-freeze technique for capturing a mid-flight animation frame.
- `src/views/basic/rendering.ts` — `updateRotation` / `animateRotation`, the
  owner of the rotation lifecycle.
- `src/views/basic/basic-view.module.css` — `.cube-wrapper` (`perspective`),
  `.cube` / `.cubie` (`preserve-3d`), `.cubie-interior`.
- `src/views/basic/animations.ts` — `animateRotation`, `animateLayer`.
- `scripts/scratch-debug/verify-rotation-fix.mjs`,
  `scripts/scratch-debug/verify-tilt-animation.mjs` — existing rotation
  harnesses.
- `scripts/scratch-debug/firefox-basic-artifact/probe-compositor-cache.mjs` —
  existing compositor probe, and the control-pair pattern worth reusing.
- `docs/plans/2026-09-23-001-fix-seal-cubie-face-planes-plan.md` — the
  sealed-body change this hitch pre-exists.
