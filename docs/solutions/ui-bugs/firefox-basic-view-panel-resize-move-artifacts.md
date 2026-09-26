---
title:
  'Basic-view panel move and resize drop a cube face in desktop Firefox
  (unresolved)'
date: 2026-09-24
last_updated: 2026-09-26
category: ui-bugs
module: src/views/basic
problem_type: ui_bug
component: frontend_stimulus
severity: medium
symptoms:
  - 'Moving or resizing a Basic-view panel in desktop Firefox 156.0.1 makes a
    whole cube face stop being drawn: the face colour is replaced by the
    sticker-border colour, and the state persists once it appears.'
  - 'Firefox-only, and the discriminator is devicePixelRatio: 1.7647058823529411
    (30/17) here versus exactly 1 in every automated browser tested.'
  - 'It is a band of panel positions, not a random occurrence. At cube face size
    138.6 px the front red face reads 6802 px healthy but 0 px for panel top
    120, 130 and 140 CSS px, with partial values at the edges.'
  - 'The trigger is the VALUE of perspective, not the property. The shipped
    value 3.333 x faceSize sits dead centre of a narrow bad band; values just
    outside it render healthy.'
  - 'A live reproduction and the firefox-move-issue5.png screenshot show the
    same structure, so the reported artifact and the controlled one agree.'
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
  - perspective
  - devicepixelratio
  - visual-artifact
  - unresolved
---

# Basic-view panel move and resize drop a cube face in desktop Firefox (unresolved)

> **STATUS: UNRESOLVED — documented deliberately, not fixed.** There is no
> validated fix and no validated root cause inside Gecko. What this revision
> adds is a **reliable reproduction**, a **quantified signature**, and a
> **measured shortlist of candidates** — the three things that were missing
> while the artifact was recorded as "not reproducible on demand". `root_cause`
> and `resolution_type` above describe the confirmed contributing mechanism and
> the fact that the only landed change is this write-up; they do **not** imply
> the defect is solved.
>
> Every claim carries its evidence level: **MEASURED** (read from a live browser
> or a byte-verified image), **CONFIRMED** (reproduced and verified), **RULED
> OUT** (tested and falsified), **OPEN / NOT PROVEN** (hypothesis without
> sufficient evidence).

## Problem

In the Basic 3D cube view on **desktop Firefox only**, moving or resizing a view
panel makes a cube face stop being painted. The face colour is replaced by the
sticker-border colour, and the corruption **persists** once it appears, so it is
lasting visual damage rather than a transient animation frame.

There are three reported triggers, and all three reach the same paint fault:

| report                         | trigger                              | evidence                         |
| ------------------------------ | ------------------------------------ | -------------------------------- |
| `firefox-move-issue*.png`      | dragging a panel by its header       | user screenshots                 |
| `firefox-resize-issue.png`     | resizing a panel                     | user screenshot                  |
| **panel parked at a position** | **no gesture at all, only position** | **reproduced and measured here** |

The third row is the lever. The reporter's observation that the defect depends
on a **range of panel size and position** was correct, and it is what turned an
unreproducible report into a measurable one.

## Symptoms

**MEASURED — the signature.** From `docs/visuals/firefox-move-issue5.png` and
independently from a live reproduction at panel top 130:

| quantity                              | healthy           | broken        |
| ------------------------------------- | ----------------- | ------------- |
| red ink, whole image, exact `#C41E3A` | 35 300 px         | **72 px**     |
| red blobs (the face is a 3x3 grid)    | 9                 | **0**         |
| `#333333` ink, whole image            | 23 445 px         | 57 069 px     |
| largest single `#333333` blob         | 10 476 px         | 43 467 px     |
| cube transform (`getComputedStyle`)   | matrix3d          | **identical** |
| cube bounding rect                    | 215x281 device px | **identical** |
| sticker border width                  | 0.566667 px       | **identical** |

**CONFIRMED — a paint fault, not a layout fault.** Transform, bounding rect and
border width are byte-identical between the healthy and the broken state.
Nothing about the layout changes; only the pixels do.

**MEASURED — what replaces the face colour.** A colour census over the cube's
own area, healthy versus broken:

| colour                                      | healthy | broken | change    |
| ------------------------------------------- | ------- | ------ | --------- |
| `#C41E3A` red sticker face                  | 6 772   | 0      | **-6772** |
| `#333333` `--palette-domain-sticker-border` | 7 315   | 14 727 | **+7412** |
| `#FFFFFF` white                             | 10 958  | 10 679 | -279      |
| blue-ish wall                               | 12 179  | 12 179 | 0         |
| everything else                             | —       | —      | < 100     |

The border colour absorbs **almost exactly** what the face colour loses, and
nothing else moves. This agrees with the earlier finding from the screenshots
alone (`#333333` share 39.6% broken vs 9.3% clean) and sharpens it: in a live
reproduction the front face goes to **zero**, it does not merely thin out.

**CONFIRMED — Firefox-only, and the discriminator is `devicePixelRatio`.**

|                            | reproduces | `devicePixelRatio`             |
| -------------------------- | ---------- | ------------------------------ |
| desktop Firefox 156.0.1    | **yes**    | **1.7647058823529411** (30/17) |
| Playwright Firefox         | no         | 1                              |
| Playwright / real Chromium | no         | 1                              |

> ⚠ **Correction to the previous revision.** It stated that Playwright's Firefox
> is "148.0.2 Nightly at dpr 1". The dpr-1 reasoning holds, but a Playwright
> Firefox run in this workspace **also reported dpr 1.7647** at one point, so
> "Playwright Firefox is always dpr 1" is not safe to assume, and the version
> should not be hard-coded. The reliable statement is the table: dpr 1 does not
> reproduce.

## Reproduction

The defect needs **three** things at once — desktop Firefox at fractional dpr,
the Basic view, and a panel top inside a specific band — which is why it
resisted reproduction for several sessions.

### 1. Bring the browser up under Marionette

CDP is disabled on this build (port 9222 returns 404), so Playwright **cannot**
attach. Marionette is the only control channel.

```powershell
$profile = Join-Path $env:TEMP 'ff-marionette-profile'
& "$env:ProgramFiles\Mozilla Firefox\firefox.exe" `
  -marionette -profile $profile http://localhost:5173
Get-NetTCPConnection -LocalPort 2828 -State Listen
```

Use `http://localhost:5173`; the dev server resolves on IPv6 `::1` only and
`http://127.0.0.1:5173` is refused.

### 2. Park the panel and read the face

`top` is CSS px on the `.basic-front-view` panel:

```js
document.querySelector('.basic-front-view').style.top = '130px';
```

Then count red ink **over the whole screenshot**. The whole-image exact-colour
count is the spatial metric of record; a crop is only trustworthy once its
viewport offset has been verified (see trap 3 below).

### Threshold of proof

`red 35 300 -> 72` together with `9 blobs -> 0 blobs`. The blob count is the
stronger check: it is structural, so neither a threshold nor a crop offset can
fake it.

## The mechanism

### CONFIRMED — the trigger is the `perspective` VALUE

This is the most useful finding, and it came from sweeping the value rather than
from reading the CSS.

`perspective` is rewritten on every `updateSize()` call
(`src/views/basic/rendering.ts`, ~line 484):

```ts
const defaultSize = 300;
const scaledPerspective = 1000 * (faceSize / defaultSize);
const cubeWrapper = state.cubeElement.parentElement as HTMLElement;
if (cubeWrapper) {
  cubeWrapper.style.perspective = `${scaledPerspective}px`;
}
```

> The authored `perspective: 1000px` in `basic-view.module.css` (line 21) is
> therefore **never** the used value.

At the measured `faceSize` of **138.6 px** this yields **462 px** — a ratio of
exactly **3.333**, the `1000 / 300` constant.

Sweeping absolute `perspective` at that fixed size, each value measured three
times in a row (repeatability confirmed):

| perspective | red px | red blobs | ratio to faceSize | verdict                           |
| ----------- | ------ | --------- | ----------------- | --------------------------------- |
| 440         | 30 485 | **9**     | 3.175             | healthy                           |
| 450         | 19 390 | —         | 3.247             | degraded                          |
| **460**     | **72** | **0**     | **3.319**         | **collapsed**                     |
| **462**     | **72** | **0**     | **3.333**         | **COLLAPSED — the shipped value** |
| 470         | 12 670 | —         | 3.391             | degraded                          |
| 475         | 23 131 | —         | 3.427             | degraded                          |
| 480         | 29 470 | **9**     | 3.463             | healthy                           |
| 500         | 34 857 | **9**     | 3.608             | healthy                           |
| 660         | 33 122 | **9**     | 4.762             | healthy                           |
| 900         | 31 986 | **9**     | 6.494             | healthy                           |

**MEASURED conclusion:** the shipped `3.333` sits **dead centre** of a narrow
bad band, and every value outside it is healthy. The defect is not "3D
transforms are broken"; it is "this particular projected depth is broken".

> A mid-investigation reading that `660 px` also collapsed was **instrument
> noise**. It did not survive repetition, and the run above measured it three
> times as healthy. Do not quote the earlier value.

### Fix candidates this produces

Measured with the front-face red as the yardstick. "Removes the defect" means
the face is fully back at **every** position tested across the band (12
positions, top 100 to 166 step 6), where the shipped value was broken at 5 of
them.

| change                 | broken positions | cube width (device px) | cost                  |
| ---------------------- | ---------------- | ---------------------- | --------------------- |
| **shipped 462 px**     | **5 / 12**       | 215                    | —                     |
| perspective **480 px** | **0 / 12**       | 214                    | ~1 px, ratio 3.463    |
| perspective **500 px** | **0 / 12**       | 214                    | ~1 px, ratio 3.608    |
| perspective 550 px     | 0 / 12           | 213                    | ratio 3.968           |
| perspective 700 px     | 0 / 12           | 210                    | ratio 5.05            |
| `perspective: none`    | 0 / 12           | 200                    | **loses 3D entirely** |

`perspective: none` is a **known workaround, not a fix** — 215 -> 200 device px
is a visible change to the 3D look.

**480 px and 500 px are the interesting candidates** because they cost about one
device pixel of cube width. They are **UNTESTED on the shipped configuration**:
a mitigation must be gated to Firefox and re-measured at every cube size before
it can ship. `perspective` is currently written in two places — the CSS rule at
`basic-view.module.css` line 21 and the inline value from `rendering.ts` — so
any mitigation must account for both. `src/global.ts` already carries Firefox
detection (`canColorizeOutput` tests `/Firefox/`), which is a natural home for a
gate; `@supports (-moz-appearance: none)` is a CSS-only alternative.

### RULED OUT — changes with no effect at all

Each measured at the broken position with the shipped perspective left alone.
All kept the red face at exactly **72 px**, i.e. none of them touched the
defect:

- sticker lift `+2px`, `+8px`, `+20px` (moving the sticker further from its
  wall)
- `will-change: transform` on the sticker and on the cube
- `transform: translateZ(0)` on the cube
- `backface-visibility: hidden` on the sticker and on the cube
- `contain: paint`
- `isolation: isolate` on the cube wrapper
- `opacity: .999` and `filter: blur(0)` on the wrapper (both force a layer)
- `z-index: 1` on the sticker
- hiding the wall behind a sticker entirely

This list matters as much as the positive result: it rules out "a depth tie
between a sticker and its own interior wall" and "a missing layer promotion",
which were the two leading explanations.

**MEASURED — the paint is deterministic at a fixed position.** Four captures at
the same inline `top`, with an away-and-back move between two of them, produced
**identical SHA256** (`0ef2738e…`); a neighbours-hidden variant was likewise
stable (`06ebc704…`), and moving the panel away and back left **0 differing
pixels** in the cube region. So the state is a deterministic function of
position, not a race — which is what makes the position sweep a valid instrument
and what makes the defect reproducible on demand.

**MEASURED — every wall sits on exactly the same face plane as its
neighbour's.** `renderCubieFaces` places each wall at `translateZ(half)` with
`half` exactly `cubieSize/2`, so **17 walls share one plane on each axis**. With
the stage rotation composed against the cubie translate, the wall rotations
cancel and the whole stack becomes affine, which is why paint order decides what
covers what. This is a structural observation about the geometry, **not** a
proven cause of the dropout — the causes above are ruled out at the pixel level,
but this hints at why this scene is unusually sensitive to paint order.

> ⚠ **Confirm the build identity at capture time.** The reproduction above was
> taken on desktop Firefox 156.0.1, but a separate record from the same day
> shows a Playwright-bundled build (`firefox-1511`, UA `Firefox/148.0`) also
> reporting `devicePixelRatio` **1.7647**. Two records disagree about which
> binary was under test, so **do not infer the build from the label** — read
> `navigator.userAgent` and `devicePixelRatio` in the captured session and quote
> those. The dpr is the operative variable; the version number is not.

### MEASURED — the arithmetic chain

```
scale       = 0.55 (0.5 when tabbed)
faceSize    = min(availW, availH) * scale
perspective = 1000 * (faceSize / 300)      -> 3.333 * faceSize
cubieSize   = faceSize / n
border      = clamp(round(cubieSize * 0.08), 2, 16)
```

The ratio is constant by construction, so **`perspective` travels with the
cube**, and the trigger travels with it.

## What Is Still Open

| open question                                                     | evidence to date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | experiment that settles it                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Is the bad band a RATIO or an ABSOLUTE pixel range?**           | **UNRESOLVED — the most important question.** At `faceSize` 138.6 the band is roughly 450-478 px, ratio 3.247-3.449. If it is a ratio, the shipped `3.333` is broken at **every** cube size and one constant change fixes them all. At `faceSize` 165 the equivalent window would be 551-565 px, which was **never sampled** — that sweep used a 20 px grid (400, 420, ... 720) and stepped straight over it. An earlier statement that "`faceSize` 165 has no notch" was an artefact of that coarse grid and **must not be repeated**. | Re-run the absolute sweep at `faceSize` 165 on a 2 px grid across 540-580.                                                                 |
| **Why does the face become EMPTY rather than partially painted?** | The border colour absorbs the face's area and the face does not move or shrink, but why the raster collapses to a flat fill is **NOT PROVEN**.                                                                                                                                                                                                                                                                                                                                                                                          | A Gecko raster log at a healthy and a broken value, if a build with logging is available.                                                  |
| **Is the mechanism perspective-specific at all?**                 | The band is narrow and the shipped value sits in it, which is suspicious in a way that may be coincidence — 3.333 is also a "clean" ratio a compositor could hit a lookup boundary at. **OPEN.**                                                                                                                                                                                                                                                                                                                                        | Sweep another projection-affecting property (e.g. `translateZ` on the cube) across a matching range and see whether a similar band exists. |
| **Does it depend on cube size?**                                  | Only two sizes examined, one of them only through a grid too coarse to conclude.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Repeat the position sweep at 2x2, 4x4, 5x5, 7x7 and in tabbed mode.                                                                        |
| **Is 480 px / 500 px safe on the shipped configuration?**         | Measured safe at `faceSize` 138.6 only, and it depends entirely on the ratio-vs-absolute question above.                                                                                                                                                                                                                                                                                                                                                                                                                                | Once the law is known, re-measure the chosen constant at every cube size.                                                                  |
| **Is this reportable to Mozilla?**                                | The material is strong: the DOM reports an orthonormal matrix while the screen shows a face with no paint, the trigger is one property, and the effect is smoothly position-dependent with a centre. **No `about:support` graphics data has been collected** (gfx prefs, driver list), which a report requires.                                                                                                                                                                                                                         | Collect `about:support` and file using the reproduction above.                                                                             |

## Measurement traps (all of these produced wrong answers)

The instrument failures did more damage here than the defect. Each one looked
like a result at the time.

1. ⚠ **`WebDriver:TakeScreenshot` REPAIRS the defect as it measures it.** It
   forces a repaint, and the repaint draws the missing face. Across three
   separate sessions this produced "no defect visible" on a screen where the
   defect was plainly visible. **Never use it to measure this defect.** Capture
   the real screen instead: raise the window, then `BitBlt` the desktop.
2. ⚠ **PowerShell DPI virtualisation silently downscales the capture.** A
   non-DPI-aware process is handed a _logical_ desktop (measured: 2194x1234 for
   a 3840x2160 display). Downscaling averages pixels, so a thin dark band blends
   into the face colour and stops matching — collapsing a colour count with no
   defect present. `SetProcessDPIAware()` must run **before** any DC or Bitmap
   is created, and the capture must self-check against `DESKTOPHORZRES`.
3. ⚠ **A viewport-relative rect is not a screen rect.** `getBoundingClientRect`
   is viewport-relative; the capture is of the whole desktop. The gap is the
   browser chrome — measured at ~203 device px here (115 CSS x 1.7647). Every
   measurement taken through a "cube rect" that ignored that offset was silently
   clipped. **Whole-image exact-colour counts are the metric of record.**
4. ⚠ **A stale application state looks like a fix.** Varying the cube size by
   driving the panel height left the app's computed `perspective` stale
   (faceSize 138.6 but perspective 720 px instead of 462 px). In that state the
   defect does not reproduce, so **every** candidate scored as a fix. Print the
   app's own computed values beside every measurement.
5. ⚠ **Do not size something in one loop and measure it in another.** Doing so
   returned byte-identical pixel counts for three supposedly different cube
   sizes. Identical readings for different inputs is the fingerprint of an
   instrument that is not varying what it claims to vary.
6. ⚠ **Gate on the reproduction before scoring any candidate.** If the defect is
   absent, "does this fix it" has no answer, and a harness will cheerfully
   report that everything fixes it.
7. ⚠ **Count blobs, not only pixels.** The red face is a 3x3 grid, so a healthy
   one shows nine separate blobs. That check is structural, so it caught what
   the pixel totals did not.
8. **Never count pixels inside the axis-aligned bounding rect of a rotated
   quad.** Its four triangular corners lie outside the quad and show whatever is
   behind it. See
   `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`.
9. **Never downscale with `kernel: 'nearest'`.** It samples one source pixel per
   output cell, so a single dark pixel becomes a whole dark character —
   fabricating thin dark lines indistinguishable from the defect.
10. **Every comparison needs a control pair and a calibration.** The instruments
    that survived here are the ones that refuse to report when their control
    fails. A harness that cannot be seen to fail is not evidence.
11. ⚠ **`WebDriver:DeleteSession` TERMINATES the browser.** It destroyed a live
    session the reporter had arranged. Detach with `socket.destroy()`, and never
    call `process.exit()` with the socket open: Marionette serves one session at
    a time, so an abandoned socket stays `Established` and blocks the channel.
12. ⚠ **A minimized window has no screen pixels.** `x=-18133` in a window rect
    means minimized and any capture is a stale cache. Check `IsIconic()` first.

## Live environment reference

| quantity                | value                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| desktop Firefox         | **156.0.1**, `devicePixelRatio` **1.7647058823529411** (30/17)                                              |
| display                 | 3840x2160 at 175% scaling (`LOGPIXELSX` 168)                                                                |
| CDP (port 9222)         | **disabled** (404) — Playwright **cannot** attach                                                           |
| control channel         | **Marionette 2828**, spoken by hand                                                                         |
| Marionette framing      | `length:json`, length is **BYTE** length; out `[0, msgId, command, params]`, in `[1, msgId, error, result]` |
| dev server              | `http://localhost:5173` — IPv6 `::1` only; `127.0.0.1` is refused                                           |
| measured `faceSize`     | 138.6 px (panel 300x300), cube rect 215x281 device px                                                       |
| computed sticker border | 0.566667 px                                                                                                 |
| `#333333`               | `--palette-domain-sticker-border`, the sticker's own frame                                                  |
| `#222222`               | `--palette-domain-cube-interior`, the body walls                                                            |

## Visual evidence

| file                       | size      | largest `#333` blob | red px | role                                            |
| -------------------------- | --------- | ------------------- | ------ | ----------------------------------------------- |
| `firefox-move-issue5.png`  | 3839x2159 | 38 847              | 630    | **face-drop variant; matches the reproduction** |
| `firefox-move-issue2.png`  | 3839x2159 | 119 332             | 15 032 | striped variant, face colour reduced            |
| `firefox-resize-issue.png` | 744x1355  | 88 667              | 41 526 | resize trigger, different texture               |
| `firefox-color-leak.png`   | 820x557   | 22 510              | 42 092 | separate colour-leak report                     |

Three earlier files were removed as part of this revision:
`firefox-move-issue3.png` (2697x2074) and `firefox-move-issue4.png` (2610x2069)
were rescaled rather than native captures, and `firefox-move-issue1.png` was
redundant — its red count of 44 752 px is essentially healthy and describes a
striped variant already better shown by `issue2`.

## Related

- `docs/plans/firefox-basic-artifact-repro-procedure.md` — the operational
  procedure. Its "not reproducible on demand" status is **superseded** by the
  reproduction above, and its inventory of the scratch tooling has been removed
  along with the scripts themselves.
- `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`
  — the pre-transform vs post-transform rule that invalidated an earlier
  finding.
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` — the
  other Firefox Basic-view paint defect, which **is** fixed.
