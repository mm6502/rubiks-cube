---
title:
  'Measure 3D-transformed DOM in one coordinate space, not by mixing pre- and
  post-transform values'
date: 2026-09-23
category: best-practices
module: src/views/basic
problem_type: best_practice
component: frontend_stimulus
severity: medium
applies_when:
  - 'Measuring the geometry of elements that live inside a CSS 3D transform
    (perspective, transform-style: preserve-3d)'
  - 'A visual defect reproduces in one engine or at one display scale but not
    the other, and the cause has to be pinned by measurement'
  - 'Deciding whether a share of painted pixels reflects a real defect or the
    measurement itself'
tags:
  - css-3d
  - measurement
  - getboundingclientrect
  - getcomputedstyle
  - devicepixelratio
  - border
  - firefox
  - gecko
  - verification
---

# Measure 3D-transformed DOM in one coordinate space, not by mixing pre- and post-transform values

## Context

While investigating dark stripes that eat face colour in the Basic 3D view of
the Rubik's Cube app (desktop Firefox only, triggered by panel resize and move),
I built four measurement harnesses. They disagreed with each other, and the
disagreement was not in the app — it was in my measurement conventions.

`getBoundingClientRect()` reports a box **after** transforms are applied;
`getComputedStyle().borderTopWidth` (and `.width`) report values **before**
them. An element inside `perspective` + `preserve-3d` is foreshortened, and its
border is foreshortened with it. Subtracting a pre-transform scalar from a
post-transform extent therefore mixes coordinate spaces and is simply not a
ratio of anything.

That produced a confident, internally self-consistent, and completely wrong
result: `vRatio 0.533` for a sticker that, measured properly, renders clean.

Two further traps of the same family appeared in the same investigation:

- Counting pixels inside the axis-aligned **bounding rect** of a rotated quad.
  The four triangular corners lie outside the quad and show whatever is behind,
  so they were classified as "dark" and inflated the dark share.
- Rendering an image to ASCII with a **nearest-neighbour** downscale. It samples
  one source pixel per output cell, so a single dark pixel inside a white block
  becomes a whole dark character — fabricating thin dark lines that are
  indistinguishable from the defect under investigation.

## Guidance

Pick one coordinate space per measurement and never combine values from two.

- For a **layout** question (how large did the code make this?), read inline
  style, custom properties, and `getComputedStyle` — all pre-transform.
- For an **appearance** question (what is painted on screen?), read pixels. Do
  not derive it from layout numbers.
- To sample a rotated element, walk the **centre line of its bounding box**. The
  box centre is inside the projected quad, and a convex quad keeps a
  horizontal/vertical line through that point inside for the full box extent.
  The box **corners** are what fall outside — never sample there.
- When downscaling an image for inspection, use an **averaging** kernel so each
  output cell is a block average. Never `nearest` on a downscale.
- Anchor every derived quantity to at least one value fixed **outside** the
  derivation. A formula can be perfectly self-consistent and still wrong.

`getBoxQuads()` is the API that returns real projected quads in viewport
coordinates and would remove the ambiguity entirely, but it is **not available**
on desktop Firefox 156 (`TypeError: e.getBoxQuads is not a function`) and is
gated behind a pref on other builds. Do not build a method around it without
probing for it first.

## Why This Matters

Each trap produces a number that looks like evidence and is not. The failure
mode is not a crash or an exception — it is a plausible ratio that survives
re-derivation and agrees with itself. Two of my harnesses disagreed, and the
correct response was not to pick the more believable one but to find a quantity
they must both satisfy and test that instead.

The cost of getting this wrong is a wrong root cause. My derived metric pointed
at a border that "eats 47% of the face", which was an artefact; the same
investigation later showed the authored border is snapped by the browser in a
way that changes it by only ~3.7%. Chasing the first number would have meant
"fixing" something that was not the problem.

## When to Apply

- Any measurement of elements inside `perspective`,
  `transform-style: preserve-3d`, or an animated `transform`.
- Any engine-or-scale-specific rendering bug where the only signal is pixels.
- Any time two of your own harnesses disagree: treat that as a bug in your
  convention, not as a choice between two candidate answers.

## Examples

Wrong — mixes pre-transform `border` with post-transform `h`:

```js
// h is post-transform (foreshortened). border is pre-transform (not foreshortened).
// The subtraction is not a ratio of anything that exists on screen.
const colourH =
  rect.height - 2 * parseFloat(getComputedStyle(el).borderTopWidth);
const vRatio = colourH / rect.height; // reported a fake 0.533 of a clean render
```

Right — read the painted pixels along the box centre line, and name the real
tokens:

```js
// The box centre is inside the projected quad; the corners are not.
const cx = x0 + Math.floor(w / 2),
  cy = y0 + Math.floor(h / 2);
const runs = []; // runs of actual colour along the line
for (let i = 0; i < w; i++) runs.push(classify(px(x0 + i, cy)));
// => [35..252] 218px 72.2% WHITE   (one contiguous white run: the sticker is clean)
```

Right — one coordinate space per question:

```js
// Layout question: did the code make this size?  All pre-transform.
const cubieSize = parseFloat(cube.style.width) / n;
const border = getComputedStyle(cube)
  .getPropertyValue('--cubie-border-width')
  .trim();

// Appearance question: how many device pixels is it painted as?  Pixels only.
const snappedDevicePx = Math.round(
  parseFloat(computedBorder) * devicePixelRatio
);
```

The second snippet is what surfaced the real mechanism in this investigation —
see Related Issues. Note the trap it avoids: `Math.round(raw)` in
`stickerBorderWidth()` makes the **authored** border a whole CSS pixel, but at a
fractional DPR a whole CSS pixel is **not** a whole device pixel, so Firefox
snaps it and `getComputedStyle` reports the snapped value back (measured live:
authored `10px` -> computed `9.63333px`, because `9.63333 * 1.764706 = 17.0`
device pixels exactly).

## Related Issues

- `docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md` —
  **the defect record for the coverage loss this rule was derived from.** That
  doc owns the bug's status, the reproduction, and the fix candidates; this doc
  owns the measurement convention and does not restate them. Note its trigger is
  the **`perspective` value**, not the DPR snapping described below — see
  `stickerBorderWidth()` further down for what the snapping measurement does and
  does not explain.
- `docs/plans/firefox-basic-artifact-repro-procedure.md` — the operational
  runbook (launch command, Marionette protocol, reference measurements).
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` — the
  sibling Firefox-only 3D defect in the same view; same "Firefox resolves a
  near-zero 3D case differently" family.
- The artifact itself is **not fixed** as of 2026-09-26. It is now reproduced on
  demand by panel position, and its trigger is the `perspective` VALUE rather
  than the DPR snapping shown above. The snapping is real and measured, but a
  FIXED cube size renders an identical border in the healthy and the broken
  state, so snapping cannot be what distinguishes them — see the defect record
  for the evidence and for what remains open.
