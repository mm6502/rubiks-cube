---
title:
  'Backface culling made a face flash its opposite during view rotation
  (Firefox)'
date: 2026-09-22
category: ui-bugs
module: src/views/basic
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - 'With R on top, repeated whole-cube right rotation briefly turned the R face
    green (the L colour) and then back.'
  - 'With pitch on, L (normally green) briefly turned blue — the R colour — so
    the flashing face showed its OPPOSITE face in both cases.'
  - 'Only view rotation (Alt+Arrow or the equivalent background drag) reproduced
    it; whole-cube x/y/z moves never did.'
  - 'Firefox only — Chromium and Edge were unaffected.'
  - 'No colour was ever written during the gesture: zero inline colour writes
    and zero colour transients across every colour-bearing element.'
root_cause: config_error
resolution_type: code_fix
severity: medium
related_components:
  - testing_framework
tags:
  - basic-view
  - backface-visibility
  - preserve-3d
  - css-3d
  - view-rotation
  - firefox
  - gecko
  - cross-engine
---

# Backface culling made a face flash its opposite during view rotation (Firefox)

## Problem

In the Basic 3D view, repeated view rotation made a face briefly paint the
colour of the face directly **behind** it, then snap back. With R on top of the
cube, the R face flashed green (L); with pitch on, L flashed blue (R). Both are
the same defect seen on a different face, and it was Firefox-only.

The impact is cosmetic but highly visible: a full face appears to change colour
for the length of a rotation, which reads as the cube being scrambled.

## Symptoms

- With R on top, repeated whole-cube right rotation briefly turned the R face
  green (the L colour) and then back.
- With pitch on, L (normally green) briefly turned blue — the R colour — so the
  flashing face showed its opposite face in both cases.
- Only view rotation (`Alt+Arrow`, or the equivalent background drag) reproduced
  it; whole-cube `x`/`y`/`z` moves never did.
- Firefox only — Chromium and Edge were unaffected.
- No colour was ever written during the gesture: zero inline colour writes and
  zero colour transients across every colour-bearing element.

## What Didn't Work

- **Treating it as a recolour.** Every colour-bearing element was watched per
  frame on both `background-color` and `fill`, plus a synchronous
  `MutationObserver` on every `style` write under the cube. Result: **zero**
  writes and **zero** `A -> B -> A` colour transients. The colours never change,
  so no colour-based detector can see this bug.
- **A stale-pose hypothesis.** The prediction was that `updateRotation` starts a
  ramp while the element's inline `style.transform` still holds the previous
  settled pose, so one frame shows the old pose. Falsified: at every ramp start
  the inline transform already equals the animation's `keyframe[0]` (4/4 ramps).
- **An engine interpolation difference.** Both engines were handed the same
  composed `rotateX · rotateY · rotate3d · matrix3d` keyframe pair on a bare
  element. Max deviation from the intended rotation-at-interpolated-angle:
  **0.000** across 12 cases. Both engines also reported valid
  `getComputedTiming().progress` throughout.
- **A 3D-context / flattening difference.** The app emits **byte-identical** CSS
  to both engines — 32/32 transform lines and 156/156 3D-context property lines
  (`transform-style`, `perspective`, `opacity`, `filter`, `overflow`,
  `isolation`, `mix-blend-mode`, `contain`, `clip-path`, `mask`, `will-change`,
  `backface-visibility`, `display`) across 8 ramps.
- **Four of five runtime CSS candidates.** `will-change: transform` on the cube,
  `backface-visibility: hidden` on the cubie, and `border-radius: 0` on the
  sticker all produced **no change** to the symptom. `width/height` on the cube
  broke its centre of rotation and also changed nothing about the colour.
- **Reproducing it in headless Playwright.** This environment cannot: both
  headless engines reported **0 stickers with zero painted area**, i.e. backface
  culling is not active at all there, so it can neither reproduce the defect nor
  validate a fix for it.
- **The harness trap that nearly produced a false fix.** A candidate-fix harness
  reported "GREEN GONE" for all five candidates — including the control. The
  control reporting no bug means the harness was not reproducing, so every
  candidate would have looked successful. Always confirm the control reproduces
  before believing a fix verdict.

## Solution

Three coupled declarations in `src/views/basic/basic-view.module.css`. Occlusion
now comes from painted, depth-sorted geometry instead of the backface test.

```css
/* Before — culling did the occlusion, and culled a face that was still visible */
.cubie {
  position: absolute;
  transform-style: preserve-3d;
}
.sticker {
  /* … */
  backface-visibility: hidden;
}
.cubie-interior {
  /* … */
  backface-visibility: hidden;
}
```

```css
/* After */
.cubie {
  position: absolute;
  transform-style: preserve-3d;
  /* Deliberately NO background. A quad here sits in the cubie's own XY plane at z=0,
     half an edge behind the face planes, so it cannot seal the seams and at grazing
     angles paints over the stickers instead. */
}
.sticker {
  /* … */
  /* Deliberately NOT `hidden` — see "Why This Works". */
  backface-visibility: visible;
}
/* Six of these per cubie, one per face, on the face planes. Together they are the
   cubie's opaque box, so occlusion comes from painted geometry rather than from the
   backface test. */
.cubie-interior {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: var(--color-domain-cube-interior);
  border-radius: 15%;
  backface-visibility: visible;
}
/* The wall that shares its face with a sticker is squared. A sticker is a 100% box
   WITH a border under `box-sizing: border-box`, so its content box is smaller than the
   wall's: the same percentage radius is measured from two different boxes, which puts
   the sticker's rounded bound outside the wall's. Square removes that dependency. */
.cubie-interior[data-sticker-backed] {
  border-radius: 0;
}
```

The four declarations are load-bearing as a set. Breaking any one of them
reintroduces a visible defect:

| Declaration reverted                       | Result                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `.sticker` back to `hidden`                | The flash returns (Firefox).                                                                                                   |
| `.cubie-interior` back to `hidden`         | The cube body is open, so the far side shows through the seams. This is exactly what a partial fix produced in a real browser. |
| `.cubie` re-gains an opaque background     | The centre-plane quad returns: it cannot seal the seams and paints over stickers at grazing angles.                            |
| a sticker-backed wall loses its square arc | The seal becomes a function of the radius again, and the corner exposes a subpixel fringe of the stickers' antialiasing.       |

**Correction (2026-09-24).** This record previously showed an "After" with
`background-color` on `.cubie`, and its table asserted that losing that
background would leak the far side. Both are now wrong: the cubie background was
removed precisely because it could not seal the face-plane seams, and the seal
moved onto the six `.cubie-interior` walls. The record is updated to the
wall-based implementation so it cannot mislead the next fix in this area.

**Measured, not reasoned (2026-09-24).** Whether the rounded corner of a
sticker-backed wall leaks was settled by measurement rather than argument
(`scripts/scratch-debug/junction-hole-probe.mjs`, Chromium **and** Firefox,
3×3-7×7, driving the real app and diffing the shipped CSS against a squared-wall
alternative with the declaration applied at runtime, verified applied before the
result was accepted). Of the pixels the rounded corner exposed, **98.4 % were
body `#222` or sticker border `#333`** — dark in both alternatives — and the
remaining 1-2 pixels per cube were the stickers' antialiased corner fringe
(`rgb(54,54,54)` → `rgb(48,48,48)`). So the squared wall closes a subpixel edge
per facelet, not a far-side leak; it earns its place by making the seal
independent of the radius, not by fixing a visible hole.

A 2D reduction of the same scene reports a large leak and is **wrong**: with the
perpendicular and back walls omitted, the background sits directly behind the
hole. A cubie is a closed box, so the ray through a clipped corner lands on the
far wall of the _same_ cubie — painted the same colour as the wall whose corner
is clipped. Two instruments disagreeing was resolved by looking at the pixels,
not by preferring the larger number.

**Verification.** Confirmed in a real browser (Firefox and Edge): setting
`backface-visibility: visible` at runtime removes the flash in both. At rest the
cube still renders as exactly **3 faces** (U, F, R) with `preserve-3d` intact on
the wrapper, cube and cubie — no far-side bleed-through. The repo's Firefox
rotation-traversal guard still passes 8/8, and the full suite passes (2759
tests). Type-check, Prettier and ESLint are clean.

## Why This Works

**Root cause.** Each face's own transform is a 90° rotation
(`getFaceTransform`). While the cube ramps through a view rotation, every face
therefore passes through **edge-on** to the viewer. At that instant its facing
sign is approximately zero, and Gecko and Blink resolve the near-zero backface
test differently: Firefox transiently culls a face that should still be painted,
exposing the face directly behind it — which is the opposite face.

This single mechanism accounts for every symptom:

- R (blue) showing green means showing **L** — R's opposite.
- With pitch on, L showing blue means showing **R** — again the opposite. Pitch
  changes the base tilt, so a different face crosses edge-on first.
- Only view rotation reproduces it, because that is the only path that puts a
  `rotate3d` ramp on the cube element. Whole-cube `x`/`y`/`z` moves rebuild the
  cubie DOM instead and never put a face through that edge-on traversal.
- Firefox-only, because the divergence is entirely in culling: the CSS handed to
  both engines is byte-identical.

**Why the fix is sufficient.** Painting the back faces removes the culling
decision that engines disagree about. The cube still occludes its own far side
because every cubie face is opaque and depth-sorted, and the cubie's own opaque
background seals the seams left by the rounded sticker corners. Nothing depends
on the near-zero backface test any more.

## Prevention

- **Guard the coupled declarations.**
  `src/views/basic/backface-culling.contract.test.ts` pins all three
  declarations plus the surrounding `preserve-3d` context. Mutation-verified:
  reverting any one of the three fails its own test, so the guard cannot
  silently become a no-op.
- **A CSS contract test is the honest guard here.** jsdom implements no layout,
  no compositing and no 3D, so it can never observe a culling difference. A test
  claiming to would assert the mechanism while proving nothing about behaviour.
  Real verification is a real-browser check — and specifically a real Firefox,
  not Playwright's patched build.
- **Read raw CSS with `node:fs`, not `?raw`.** Vite's CSS-modules plugin
  intercepts a `.module.css` path: `import.meta.glob(…, { query: '?raw' })`
  returns a class-name proxy and `?inline` returns an empty string (both
  measured). The `node` types are pulled in for that one file with a
  `/// <reference types="node" />` rather than by widening the project's `types`
  array, so no other test gains an implicit Node dependency.
- **Prefer the narrowest reproduction, and check the control.** The defect is
  Firefox-only and view-rotation-only. Restricting the reproduction to that path
  early would have avoided several dead ends, and checking the control is what
  exposed a harness that had stopped reproducing.
- **Do not trust a green candidate matrix without a positive control.** A
  harness that reports "no bug" for the control will report every candidate as a
  fix.

## Related Issues

- `src/views/basic/rendering.ts` — `updateRotation`, the single owner of the
  rotation lifecycle; `getFaceTransform` in `cubie-rendering.ts` defines the 90°
  face transforms that put each face edge-on.
- `docs/solutions/logic-errors/ctrl-arrow-slice-direction-rotated-view.md` — the
  adjacent view-rotation defect (keyboard slice direction), which shares the
  `rotate3d` / `matrix3d` convention this fix left untouched.
- `docs/solutions/ui-bugs/circular-ghost-selective-hide-2026-05-03.md` and
  `docs/solutions/ui-bugs/overflow-priority-greedy-fill-flicker-2026-04-19.md` —
  other visual-defect learnings in the same category.
