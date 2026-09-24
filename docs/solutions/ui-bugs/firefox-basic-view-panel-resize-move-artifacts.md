---
title:
  'Basic-view panel resize and move paint dark streaks in desktop Firefox
  (unresolved)'
date: 2026-09-24
category: ui-bugs
module: src/views/basic
problem_type: ui_bug
component: frontend_stimulus
severity: medium
symptoms:
  - 'Resizing a Basic-view panel in desktop Firefox 156.0.1 leaves jagged,
    multi-directional dark streaks across a face, and the artifact persists once
    it appears.'
  - 'Moving a panel produces the same class of artifact. Screenshots:
    docs/visuals/firefox-resize-issue.png and firefox-move-issue1.png through
    firefox-move-issue4.png.'
  - "Firefox-only: Chromium and Playwright's Firefox 148.0.2 at devicePixelRatio
    1 both render clean."
  - '#333333 (the sticker-border token) is 39.6% of the defect region vs 9.3% of
    a clean render, while #222222 (cube interior) stays flat at 1.8% vs 0.7% -
    so border-coloured pixels replace face colour.'
  - 'Not reproducible on demand: in the one captured state the U face measured
    clean (single contiguous white run, 218 px, 72.2% of the centre line, no
    interior dark band).'
root_cause: logic_error
resolution_type: documentation_update
related_components:
  - testing_framework
  - tooling
  - documentation
tags:
  - firefox
  - gecko
  - basic-view
  - css-3d
  - devicepixelratio
  - border-snapping
  - visual-artifact
  - unresolved
---

# Basic-view panel resize and move paint dark streaks in desktop Firefox (unresolved)

> **STATUS: NOT FIXED.** This document records an open investigation. There is
> no validated root cause and no validated fix. `root_cause` and
> `resolution_type` above describe the state of the _confirmed contributing
> mechanism_ and the fact that the only change that has landed is this write-up
> — **they do not imply the defect is solved.** Every claim below is labelled
> with its evidence level: **MEASURED** (read from a live browser or a
> byte-verified image), **CONFIRMED** (reproduced and verified), **RULED OUT**
> (tested and falsified), **OPEN / NOT PROVEN** (hypothesis without sufficient
> evidence).

## Problem

In the Basic 3D cube view on **desktop Firefox only**, resizing or moving a view
panel makes dark striping appear across the cube's faces, replacing face colour
with the sticker border colour. The artifact is **persistent once it appears** —
it survives the end of the drag and is present in a static screenshot — so it is
a lasting visual corruption, not a transient animation frame.

It is not reproducible on demand (it was absent in the very state captured for
measurement), the affected face is unpredictable, and the browser that exhibits
it cannot be substituted by the project's Playwright browsers. That combination
is why it is still open after several sessions.

## Symptoms

- **CONFIRMED (reported):** dark streaks across a face after a panel **resize**
  — `docs/visuals/firefox-resize-issue.png`.
- **CONFIRMED (reported):** the same class of artifact after **moving** a panel
  by its header — `docs/visuals/firefox-move-issue1.png`,
  `firefox-move-issue2.png`, `firefox-move-issue3.png`,
  `firefox-move-issue4.png`.
- **CONFIRMED (reported):** **non-deterministic** — no relation was found
  between where the panel sits on screen and which face shows the artifact.
- **CONFIRMED (reported):** **persistent** once it appears; stopping the drag at
  the moment it shows leaves it on screen.
- **MEASURED:** the dark structure is **jagged and multi-directional**, not the
  regular 3x3 gap grid a healthy face shows.
- **MEASURED:** the dominant dark is `#333333`
  (`--palette-domain-sticker-border`, the sticker's own frame), **not**
  `#222222` (`--palette-domain-cube-interior`). The artifact is
  **border-coloured pixels replacing face colour**, not the cube interior
  showing through a gap.
- **CONFIRMED:** Firefox-only — Chromium does not show it.

### Measured signature vs a clean control

| Image                     | face region | dark pixels | largest dark blob  |
| ------------------------- | ----------- | ----------- | ------------------ |
| `firefox-move-issue1.png` | 1040x816    | 18.3%       | 143 664 px (16.9%) |
| `firefox-move-issue2.png` | 1056x768    | 23.3%       | 178 640 px (22.0%) |
| clean render (control)    | 1536x432    | 4.5%        | 9 064 px (1.4%)    |

⚠ **OPEN — a previously recorded multiplier in this table's caption was wrong.**
Earlier notes (and `TODO.md`) described this as "16–20x separation". Recomputed
from the table itself: the dark-pixel share separates by only **4.07x / 5.18x**,
and the largest blob by **12.1x / 15.7x**. The "16–20x" figure overstates the
dark-pixel metric and should not be repeated. The metric still discriminates
clearly, but note the control is **not size-matched** to the defect regions
(1536x432 = 663 552 px vs 848 640 / 811 008 px, a 1.28x / 1.22x difference), so
these are area fractions of differently-shaped regions and are not strictly
comparable. Re-measure with a size-matched control before relying on the ratio.

### Which dark it is (MEASURED)

| colour                                            | defect | clean render | ratio |
| ------------------------------------------------- | ------ | ------------ | ----- |
| `#333333` `--color-domain-sticker-border` (frame) | 39.6%  | 9.3%         | 4.3x  |
| `#222222` `--color-domain-cube-interior` (body)   | 1.8%   | 0.7%         | ~2.6x |

The border-colour excess is the signal; the body colour stays near-flat. That is
what turned the investigation toward the border and away from "interior showing
through a gap".

## What Didn't Work

### Failed hypotheses

| Hypothesis                                                                    | Verdict                                  | Why it failed                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-event cubie-tree rebuild during a move**                                | **RULED OUT**                            | `handleDrag()` in `src/view-manager/panel-interaction-handler.ts` (~lines 284-285) writes **only** `style.left` / `style.top`. It never resizes the view and never touches the cubie tree. The move path is therefore **not** the resize path.                                                                                     |
| **The `face-label-spin-out` / `spin-in` keyframes** (`basic-view.module.css`) | **RULED OUT**                            | They are `scaleX/scaleY(1) -> (0) -> (1)`, which matches the reporter's verbal description, but they animate the face **labels** (F/U/R/B/L/D letters), not the stickers. Only four `@keyframes` exist in all of `src`, all for labels.                                                                                            |
| **`box-sizing: border-box` + `transition: border 0.2s` as the cause**         | **RULED OUT, then partially reinstated** | The border does **not** animate: in a real drag `--cubie-border-width` stayed `4px` and the computed border stayed `4px`. **But the original verdict was incomplete** — the border _does_ change size, not by animating but by **device-pixel snapping** (see below). It was wrongly closed as "ruled out" and had to be reopened. |
| **Playwright as the reproduction engine**                                     | **RULED OUT (as an instrument)**         | Playwright's Firefox is **148.0.2 Nightly at dpr 1** and Chromium is **dpr 1**, so `10 * 1 = 10` is already whole, nothing snaps, and the bug **cannot** occur there. This explains every earlier failed reproduction attempt.                                                                                                     |
| **Reporter's hypothesis: "compositor or driver bug"**                         | **OPEN / NOT PROVEN**                    | A move writes only `left`/`top`, so any visible change after a pure move _is_ compositing by construction — but the probe returned **inconclusive** because the bug was not on screen.                                                                                                                                             |

### Failed measurement instruments

These produced confident, self-consistent, **wrong** numbers. Recorded because
the failure mode is the reusable lesson, not the individual script.

- **`u-stripe-ratio.mjs` — mixed coordinate spaces.** `getBoundingClientRect()`
  is **POST**-transform; `getComputedStyle().borderTopWidth` / `.width` are
  **PRE**-transform. Subtracting one from the other is meaningless, and a 3D
  transform foreshortens the border too, so `height - 2*border` **overstates**
  the border's share. It reported a `vRatio 0.533` "stripe" on a render that was
  **clean**. **DISOWNED.**
- **`measure-u-painted.mjs` — counted pixels inside the axis-aligned bounding
  rect of a rotated quad.** The four triangular corners of that rect lie
  _outside_ the quad and show whatever is behind it, so background was counted
  as dark. **DISOWNED.**
- **`ascii-image.mjs` with `kernel: 'nearest'` on a downscale** samples **one**
  source pixel per output cell, so a single dark pixel becomes a whole dark
  character — **fabricating thin dark lines indistinguishable from the defect.**
  Fixed to the averaging kernel; it is sound now.
- **One crop was 92.7% background**, which made every statistic derived from it
  meaningless. Rule adopted: always print a crop's dark/bright composition
  **before** trusting it.
- **`ask-image.mjs` (local Qwen2.5-VL-7B)** **hallucinated an entire scene** on
  `firefox-resize-issue.png`, inventing faces and colours not in the image.
  Never use it to decide whether a defect is present.
- **`u-cross-section.mjs`** was built on `getBoxQuads()` — **not available** on
  desktop Firefox 156 (`TypeError: e.getBoxQuads is not a function`).
- **A minimized-window measurement** returned the iconic sentinel
  (`x=-18133 y=-18133 156x26`) while the page still reported a full viewport.
  `IsIconic()` must be checked before trusting any window rect.

### Two operational hazards

- ⚠ **`WebDriver:DeleteSession` TERMINATES the browser.** It destroyed a live
  session the reporter had arranged. Detach with `socket.end()` instead.
- ⚠ **A helper that prepends its own prefix defeats callers that also pass it.**
  A harness had `const arg = k => argv.find(a => a.startsWith('--' + k))` and
  the caller wrote `arg('--browser')`, so it searched for `----browser`, always
  fell back to the default, and the "Firefox" and "Chromium" runs returned
  byte-identical numbers — which reads as corroboration instead of a parameter
  that never arrived. Echo received arguments at startup.

## What Is Established

### 1. MEASURED mechanism — border snapping at fractional DPR

`stickerBorderWidth()` (`src/views/basic/cubie-rendering.ts`, ~line 190) rounds
to whole **CSS** px:

```ts
export function stickerBorderWidth(cubieSize: number): number {
  const RATIO_OF_CUBIE = 0.08;
  const raw = cubieSize * RATIO_OF_CUBIE;
  // Quantised to WHOLE pixels, deliberately. ...
  return Math.max(2, Math.min(16, Math.round(raw)));
}
```

Firefox lays borders out in **CSS px** but paints them at whole **DEVICE px**,
then reports the snapped value back through `getComputedStyle`. At
`devicePixelRatio` **1.7647058823529411** (30/17, ~176.47% Windows scaling):

| state                       | authored | computed    | device px | expected device | shortfall |
| --------------------------- | -------- | ----------- | --------- | --------------- | --------- |
| A: 3x3, panel 730.667x748.8 | `10px`   | `9.63333px` | `17`      | 17.647          | 0.647     |
| B: after resize             | `11px`   | `10.767px`  | `19`      | 19.412          | 0.412     |

`9.63333 * 1.764706 = 17.0` and `10.767 * 1.764706 = 19.0`, **both exact**. The
shortfall **varies** with the authored value (0.647 at 10px, 0.412 at 11px) —
the signature of **per-element snapping**, not a single scale error.

State A in full:

| quantity                        | value                         |
| ------------------------------- | ----------------------------- |
| cubie width                     | `128.517` css                 |
| `cubie * 0.08`                  | `10.281`                      |
| authored `--cubie-border-width` | **`10px`** (inline, verified) |
| computed `border-top-width`     | **`9.63333px`**               |
| computed x dpr                  | **`17.0` device px** (exact)  |
| css implied by the snapped 17   | **`9.63`**                    |
| what `10px` "should" be         | `17.647` device px            |

So the border lands at `9.63333/128.517` = **7.5%** of the cubie, not the
intended **8%**. Live `distinct computed borders` were
`["9.63333px", "4.53333px"]` with `distinct snapped device px` `[17, 8]` — the
second is `.sticker.selected`'s `border: 5px` (`5 * 1.7647 = 8.82 -> 8` device
-> `4.5333` css).

**This is why it is desktop-Firefox-only:** Playwright's Firefox is **148.0.2
Nightly at dpr 1** and Chromium is **dpr 1**, so `10 * 1 = 10` is already whole,
nothing is snapped, and the bug cannot reproduce there.

### 2. MEASURED geometry chain

```
scale       = 0.55 (0.5 when tabbed)
faceSize    = min(availW, availH) * scale
perspective = 1000 * (faceSize / 300)   // defaultSize = 300
cubieSize   = faceSize / n
border      = clamp(round(cubieSize * 0.08), 2, 16)
```

`perspective` is **rewritten on every `updateSize()`**, so the authored CSS
`perspective: 1000px` is never the used value (`src/views/basic/rendering.ts`,
~lines 469-480):

```ts
const scale = state.layoutMode === LayoutMode.Tabbed ? 0.5 : 0.55;
const faceSize = Math.min(availableSize.width, availableSize.height) * scale;

const defaultSize = 300;
const scaledPerspective = 1000 * (faceSize / defaultSize);
const cubeWrapper = state.cubeElement.parentElement as HTMLElement;
if (cubeWrapper) {
  cubeWrapper.style.perspective = `${scaledPerspective}px`;
}
```

- **MEASURED:** `perspectivePredicted 1285.167` == computed `1285.17`,
  `allMatch: true` across nine states of a real resize drag.
- **MEASURED:** `min()` switches which axis it follows exactly where `w == h` —
  a line from one panel corner to the opposite, i.e. the diagonal the reporter
  described.
- **MEASURED:** a `420x372` panel gives `682px`, while a **larger** `480x312`
  panel gives `572px`, because the _smaller_ axis drove it.
- ⚠ **UNRECONCILED — OPEN:** measured `scale` was `385.55/730.667 = 0.5276`, not
  a flat `0.55`. **This is the one link in the chain that does not close and
  should be checked first when resuming.**

### 3. CONFIRMED — the move path cannot change layout

```ts
// panel-interaction-handler.ts, handleDrag() ~284-285
this.dragState.panel.style.left = `${newX}px`;
this.dragState.panel.style.top = `${newY}px`;
```

A pure move writes only `left`/`top`. It cannot resize the view, rebuild the
cubie tree, or change the authored border. Any visible change after a pure move
is therefore compositing, by construction.

### 4. MEASURED — what the artifact screenshot does and does not show

From `docs/visuals/firefox-move-issue3.png` (2697x2074):

- The dark structure does **NOT** multiply the 3x3 grid: **max 3 bright runs per
  line**, i.e. exactly the sticker grid.
- It **DOES** eat face colour: mean **2.33** bright runs per line (against ~3
  for a healthy face), and **90** dark runs <= 6px out of 2750.
- The image is a **digital capture, not a phone photo**: **3615 of 5376** flat
  32x32 blocks have luminance standard deviation **exactly 0.0000** (impossible
  with sensor noise), and **20.3%** of the cube region is **byte-exact
  `#333333`** while similar neighbours are quantisation variants (`21,29,45`,
  `20,28,44`, `18,25,40`).

### 5. CONFIRMED — live environment reference

| quantity                        | value                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| desktop Firefox                 | **156.0.1**, `devicePixelRatio` **1.7647058823529411** (30/17)                                              |
| Playwright Firefox / Chromium   | 148.0.2 Nightly / dpr 1 (does **not** reproduce)                                                            |
| CDP (port 9222) on desktop FF   | **disabled** (404) — Playwright **cannot** attach                                                           |
| control channel                 | **Marionette 2828**, spoken by hand                                                                         |
| Marionette framing              | `length:json`, length is **BYTE** length; out `[0, msgId, command, params]`, in `[1, msgId, error, result]` |
| viewport (CSS px)               | 2176 x 1092                                                                                                 |
| window (physical px, maximized) | 2208 x 1200 (`left=-7 top=-7 right=2201 bottom=1193`)                                                       |
| Marionette screenshot           | **3840x1927** — the whole virtual desktop at physical scale, **not** viewport x dpr                         |

## What Is Still Open

| Open question                                                                   | Current evidence                                                                                                                                                                                                                                                                                                                                                                               | Experiment that would settle it                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Does border snapping actually paint the stripes?**                            | **NOT PROVEN.** In the one captured state the U face measured **CLEAN**: real pixel runs along each sticker's projected centre line gave a single contiguous white run (`[35..252]`, 218px, 72.2%), `WHITE share` **74.5% / 79.3%**, **no interior dark band**.                                                                                                                                | Capture a session **while the stripes are on screen**, then run `probe-basic-geometry.mjs` + `capture-session-state.mjs` in that same state and correlate per-sticker computed borders with per-sticker stripe counts. |
| **Is it compositing (the reporter's hypothesis)?**                              | **INCONCLUSIVE.** `probe-compositor-cache.mjs` takes a **control pair first**, then forces a layer re-raster via `will-change: transform`. The control was **perfectly stable (0 differing pixels)** — so the instrument is sound — but the re-raster changed **nothing** (0 differing pixels in all three comparisons). A negative from a session **without the bug present proves nothing**. | Re-run the same probe **while the stripes are visible**.                                                                                                                                                               |
| **Which arithmetic link is wrong — the `0.55` scale?**                          | **UNRECONCILED.** Measured `385.55/730.667 = 0.5276`, not `0.55`. Everything downstream matched exactly, which makes this the suspect.                                                                                                                                                                                                                                                         | Instrument `updateSize()` inputs/outputs (`container.clientWidth/Height`, `faceSize`, `perspective`) across a full drag and reconcile `faceSize/scale` against the measured panel inner size.                          |
| **Is there a relation between panel position/size and which face is affected?** | **NONE FOUND** by the reporter. `min(w,h)` axis-switching at `w == h` is the only positional candidate identified.                                                                                                                                                                                                                                                                             | Log `(panelW, panelH, minAxis, affectedFace)` for many drag endpoints; test whether the affected face is predicted by which axis `min()` selected.                                                                     |
| **Is the artifact multiplicative across cube sizes (2x2 … 7x7)?**               | **UNTESTED.**                                                                                                                                                                                                                                                                                                                                                                                  | Repeat the resize/move drag at each size on the desktop browser and count stripe runs per face.                                                                                                                        |
| **Does a device-px-aligned border remove it?**                                  | **UNTESTED.**                                                                                                                                                                                                                                                                                                                                                                                  | A/B the first candidate fix below on the desktop browser while forcing the artifact on screen.                                                                                                                         |

## Fix candidates (none validated)

**No fix has been validated. Nothing here has been tested in the browser that
exhibits the bug.** Ordered by how directly each addresses the _measured_
mechanism.

1. **Make the border a whole number of DEVICE px.** In `stickerBorderWidth()`:
   `Math.round(raw * dpr) / dpr`. Caveat: the function currently takes only
   `cubieSize`, so **the DPR must reach it** (the value is published as
   `--cubie-border-width` from `initializeCubies()` / `resizeCubies()`).
2. **Drop the border from `.sticker`** and separate facelets with `outline` or
   `box-shadow`, which do not participate in border-box layout.
3. **Use an inset `box-shadow`** instead of a border.
4. **(Independent of the above) Stop `perspective` from depending on the panel's
   aspect.** Either keep a constant perspective or clamp it so it cannot vary
   with `min(w, h)` alone. This addresses the measured _diagonal_ behaviour but
   is **not** shown to be what paints the stripes.

**Do not** describe candidate 1 as "the fix" in a changelog: its premise (that
border snapping _causes_ the stripes) is exactly what remains unproven.

## Prevention

The durable value of this investigation is the measurement discipline, because a
wrong instrument did more damage here than the bug itself — three separate
harnesses generated confident, self-consistent, incorrect numbers.

1. **Never mix pre-transform and post-transform geometry in one expression.**
   `getBoundingClientRect()` is POST-transform;
   `getComputedStyle().borderTopWidth` / `.width` are PRE-transform. This single
   rule invalidated a `vRatio 0.533` finding outright. Full rule:
   `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`.
2. **Never count pixels inside the axis-aligned bounding rect of a rotated
   quad.** The four triangular corners lie outside the quad and show the
   background.
3. **Every comparison must begin with a control pair expected to be identical.**
   `probe-compositor-cache.mjs` refuses to continue when its control is
   unstable. **A harness that cannot be seen to fail is not evidence.**
4. **A negative result from a session without the bug present proves nothing.**
   State "inconclusive" rather than "ruled out" when the effect was absent at
   capture time.
5. **Calibrate on values known in advance, and print a crop's composition before
   trusting its statistics.** A crop that was 92.7% background silently
   invalidated its own statistics. Similarly, size-match a control before
   quoting a ratio from it (see the "16–20x" correction above).
6. **Never downscale with `kernel: 'nearest'`.** It fabricates thin dark lines
   that are indistinguishable from the defect.
7. **Label every claim with its evidence level** (MEASURED / CONFIRMED / RULED
   OUT / OPEN). This document exists in its current shape precisely because an
   incomplete "RULED OUT" verdict on the border had to be corrected later — the
   border _does_ change size, just by snapping rather than by animating.
8. **Do not use a small local VLM to decide whether a defect is present.** It
   hallucinated a whole cube scene on a real defect screenshot.

## Reproducing

### Why the desktop browser and not Playwright

|                         | desktop Firefox                | Playwright Firefox | Chromium   |
| ----------------------- | ------------------------------ | ------------------ | ---------- |
| version                 | **156.0.1**                    | 148.0.2 Nightly    | —          |
| `devicePixelRatio`      | **1.7647058823529411** (30/17) | **1**              | **1**      |
| CDP (port 9222)         | **disabled** (404)             | n/a                | yes        |
| control channel         | **Marionette 2828**            | Playwright         | Playwright |
| reproduces the artifact | **yes**                        | no                 | no         |

The artifact needs a **fractional** `devicePixelRatio`. At dpr 1 an integer CSS
border is already an integer number of device pixels, so nothing is snapped and
the effect cannot occur.

### Bring the browser up under Marionette

Prefs in a **fresh** profile: `marionette.enabled = true` (or launch with
`-marionette`). Marionette then listens on **2828**.

```powershell
$profile = Join-Path $env:TEMP 'ff-marionette-profile'
& "$env:ProgramFiles\Mozilla Firefox\firefox.exe" `
  -marionette -remote-debugging-port 9222 -profile $profile `
  http://127.0.0.1:5173
```

Confirm it is up **before every measurement run**:

```powershell
Get-NetTCPConnection -LocalPort 2828 -State Listen
```

Also confirm the page URL is the Vite dev server on **5173** and that Firefox is
at **156.0.1** — a surprise upgrade would invalidate the DPR reasoning. Use
exactly `http://127.0.0.1:5173` or `http://localhost:5173`.

### Talk to Marionette

Framing is `length:json`, where **length is the BYTE length** of the JSON.

| direction | shape                         |
| --------- | ----------------------------- |
| out       | `[0, msgId, command, params]` |
| in        | `[1, msgId, error, result]`   |

Copy the client from
`scripts/scratch-debug/firefox-basic-artifact/probe-basic-geometry.mjs`:
connect, concatenate chunks, split on `0x3a`, `parseInt` the length, slice by
**byte** length, `JSON.parse`, match on `frame[1] === msgId`.

Commands used: `WebDriver:NewSession`, `WebDriver:ExecuteScript`,
`WebDriver:GetWindowRect`, `WebDriver:TakeScreenshot`,
`WebDriver:DeleteSession`.

**Hard rules:** never call `WebDriver:DeleteSession` during a capture run (it
terminates the browser); `getBoxQuads()` does not exist on this build; the
window may be minimized, so check `IsIconic()` before trusting any window rect
and restore with `ShowWindow(hwnd, 9)`; build embedded page JS as an **array of
lines joined with `\n`**, not a multi-line template literal; run
`node --check <script>` before executing any new scratch script.

### Reproduce the artifact

The artifact appears **during/after a panel resize or move** and is persistent
once it appears — so it is present in a static screenshot, not only mid-drag. It
is **not** reproducible on demand (it was absent in the captured state even
after the reporter navigated to it).

1. Bring the window up and maximise it.
2. Drag the Basic panel's resize handle (`[data-resize-direction="se"]`), then
   drag the panel header to move it, in a real browser session.
3. **As soon as stripes are visible, capture before touching anything else:**

```
node scripts/scratch-debug/firefox-basic-artifact/capture-session-state.mjs <label>
node scripts/scratch-debug/firefox-basic-artifact/probe-basic-geometry.mjs
```

`capture-session-state.mjs` writes `<label>.json` + `<label>.png` and prints
window rect, viewport, panel rects, perspective, cubie/sticker counts and the
border pipeline.

**Re-check these standing points first when resuming** — if they have moved, the
environment changed and prior conclusions need re-anchoring: viewport
`2176x1092`; window `2208x1200` at `left=-7 top=-7 right=2201 bottom=1193`;
Marionette screenshot `3840x1927`; panel inline `left=604px top=0px`;
perspective `1285.17px`; `--cubie-border-width` `10px` (state A) / `11px` (state
B); computed sticker border `9.63333px` / `10.767px`; snapped device px `17` /
`19`.

## Related Issues

- `docs/plans/firefox-basic-artifact-repro-procedure.md` — the operational
  runbook for this defect: launch command, Marionette protocol, all traps,
  reference measurements, candidate fixes.
- `scripts/scratch-debug/firefox-basic-artifact/README.md` — inventory of the
  measurement instruments, with the traps each one encodes.
- `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`
  — the coordinate-space rule that invalidated `u-stripe-ratio.mjs`. **Canonical
  for the measurement convention**; not to be restated here.
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` — the
  sibling Firefox-only 3D defect in the same view. Note its framing attributes
  Firefox-only divergence to _culling_; this defect is a second, non-culling
  cause in the same family.
- `docs/plans/2026-09-21-001-fix-firefox-resize-cubie-flicker-plan.md` —
  `status: completed`; it describes a **different** resize mechanism (per-event
  cubie rebuild) that has since been removed, while the artifact survives. Its
  own Verification Notes anticipate this contingency.
- `docs/plans/2026-09-23-001-fix-seal-cubie-face-planes-plan.md` and
  `docs/brainstorms/2026-09-23-cubie-sealed-body-requirements.md` — in-flight
  work that also changes `.sticker` borders and needs the same real-Firefox
  gate.
- `src/views/basic/cubie-rendering.test.ts` — the `stickerBorderWidth` tests
  (`returns whole pixels`, the `7 < pct < 10` range) **pin the rounding
  behaviour currently under suspicion**. Any change to candidate 1 must update
  them deliberately, not incidentally.
- `TODO.md` — the two live tasks this document absorbs.

GitHub issue search: the repo has **zero issues**, so there is nothing to link.
