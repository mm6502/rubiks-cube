---
title:
  'Basic-view panel move and resize drop a cube face in desktop Firefox (fixed
  by the Firefox 157 update)'
date: 2026-09-24
last_updated: 2026-10-01
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
    138.6 px the front red face reads 35 300 px healthy (whole-image
    exact-colour count) but 0 px for panel top 120, 130 and 140 CSS px, with
    partial values at the edges.'
  - 'The trigger is the VALUE of perspective, not the property. The shipped
    value 3.333 x faceSize sat dead centre of a narrow bad band; values just
    outside it rendered healthy.'
  - 'A live reproduction and the firefox-move-issue5.png screenshot show the
    same structure, so the reported artifact and the controlled one agree.'
root_cause: environment_dependent
resolution_type: external_fix
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
  - resolved
---

# Basic-view panel move and resize drop a cube face in desktop Firefox (fixed by the Firefox 157 update)

> **STATUS: RESOLVED — by the browser, not by a change in this repository.**
> Re-measured on **desktop Firefox 157.0** on 2026-10-01: the defect no longer
> reproduces anywhere it used to, and nothing in the app changed to make that
> true. `resolution_type: external_fix` records exactly that. The contributing
> mechanism and the quantified signature below are kept intact, because they are
> what let the regression be recognised as gone rather than assumed gone.
>
> Firefox 156.0.1 → 157.0 is the only variable that moved. No commit in this
> repository between 2026-09-26 (when the defect was last reproduced, on
> 156.0.1) and 2026-10-01 touches `perspective`, the cube transform, the sticker
> geometry or the panel layout.
>
> Every claim carries its evidence level: **MEASURED** (read from a live browser
> or a byte-verified image), **CONFIRMED** (reproduced and verified), **RULED
> OUT** (tested and falsified), **OPEN / NOT PROVEN** (hypothesis without
> sufficient evidence).

## Resolution

**MEASURED — the defect is gone on Firefox 157.0, with every precondition
intact.** The reproduction needs a fractional dpr; that has not changed:

| quantity                 | value on 2026-10-01            |
| ------------------------ | ------------------------------ |
| Firefox                  | **157.0** (`rv:157.0`)         |
| `devicePixelRatio`       | **1.7647058823529411** (30/17) |
| `faceSize`               | **138.6 px** — identical       |
| shipped `perspective`    | **462 px** — identical         |
| cube bounding rect (CSS) | **122.1 x 159.1** — identical  |
| panel position, shipped  | top 0, left 604 CSS px         |

Against those unchanged preconditions:

| test                                                        | 156.0.1 (recorded)                  | **157.0 (measured)**                |
| ----------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| panel top **130** (the documented fully-broken position)    | **0 red blobs, 72 red px**          | **9 blobs, 33 130 red px**          |
| documented band, tops 100→166 step 6 (12 positions)         | 5 of 12 fully collapsed             | **12/12 healthy, 9 blobs**          |
| perspective sweep at top 130: 440…660 px, incl. 460 and 462 | collapsed at the centre of the band | **all healthy, 9 blobs**            |
| drag by header, away and back                               | reported trigger                    | **9 blobs**                         |
| resize by handle                                            | reported trigger                    | **9 blobs**                         |
| size sweep: `faceSize` 138.6 → 358.6 px (85 samples)        | —                                   | **all non-clipped samples 9 blobs** |

The metric of record did not change: an absolute count of the exact design token
`#C41E3A` over the panel crop, plus the **blob count** (a healthy face is a 3x3
grid, so nine separate pieces; a collapsed one is zero). Both are the same
figures quoted in the original write-up, so the comparison is like-for-like.

**CONFIRMED — the metric could still be seen to fail.** A metric that reports
"healthy" everywhere proves nothing unless it is sensitive. Two checks were run
before the clean reading was accepted:

1. The archived broken screenshots still measure broken/degraded — their numbers
   are unchanged, so the defect signature is still detectable in principle.
2. A **sensitivity control**: repaint every red sticker pixel of a _healthy_
   live 157.0 frame with the sticker-border colour. That is precisely the
   failure the defect produced — the border colour absorbing the face colour.
   The metric returned **red = 0, blobs = 0**, while the border count rose. The
   metric can therefore detect exactly the state the sweep is now failing to
   find.

> ⚠ **Correction to the previous revision.** It quotes `firefox-move-issue5.png`
> at **630 red px**. Two independent decode paths (sharp `removeAlpha`→raw and
> raw RGBA, each counting `#C41E3A` exactly) both give **4 074**. The 630 figure
> is wrong, and the mechanism that likely produced it — an alpha channel or a
> colour-profile conversion shifting the triples — is the reason the earlier
> tooling treated exact-token matching as fragile. The qualitative claim for
> that file (the face-drop variant) still stands; only the number was wrong.

## Problem

In the Basic 3D cube view on **desktop Firefox only**, moving or resizing a view
panel makes a cube face stop being painted. The face colour is replaced by the
sticker-border colour, and the corruption **persists** once it appears, so it is
lasting visual damage rather than a transient animation frame.

There are three reported triggers, and all three reached the same paint fault:

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
| desktop Firefox 157.0      | **no**     | **1.7647058823529411** (30/17) |
| Playwright Firefox         | no         | 1                              |
| Playwright / real Chromium | no         | 1                              |

> ⚠ **The dpr was necessary but not sufficient, and that is now proven.** Two
> Firefox versions with the _same_ fractional dpr behave differently: 156.0.1
> reproduces, 157.0 does not. A fractional dpr is what makes the scene capable
> of exhibiting the fault; a change inside Gecko between those releases is what
> decided whether it actually did. The previous revision's framing — that the
> defect "needs a fractional `devicePixelRatio`" — remains true as a
> precondition statement, and is now shown not to be a sufficient explanation.

## Reproduction (historically — see Resolution for the current status)

On Firefox 156.0.1 the defect needed **three** things at once — desktop Firefox
at fractional dpr, the Basic view, and a panel top inside a specific band —
which is why it resisted reproduction for several sessions. On 157.0 the same
procedure runs clean at every position, so it now serves as a **regression
test**. The procedure is kept because it is still the correct way to look.

### 1. Bring the browser up under Marionette

CDP is disabled on this build (port 9222 returns 404), so Playwright **cannot**
attach. Marionette is the only control channel.

```powershell
$profile = Join-Path $env:TEMP 'ff-marionette-profile'
& "$env:ProgramFiles\Mozilla Firefox\firefox.exe" `
  -marionette -profile $profile http://localhost:5173
Get-NetTCPConnection -LocalPort 2828 -State Listen
```

Use `http://localhost:5173`, or `http://127.0.0.1:5173` once vite is started
with an explicit host. Confirm the version is the one you think it is: read
`navigator.userAgent` and `devicePixelRatio` from the live session and quote
those, rather than inferring them from the label.

> ⚠ **There is no "works on 156, broken on 157" rule.** The relevant check is
> the measured behaviour, not the version string. If a future release regresses,
> confirm the metrics are still sensitive (see the calibration under
> **Resolution**) before trusting a clean reading, then run the position sweep.

### 2. Park the panel and read the face

`top` is CSS px on the `.basic-front-view` panel
(`[data-view-panel="basic-front"]`):

```js
document.querySelector('[data-view-panel="basic-front"]').style.top = '130px';
```

Then count red ink over a crop of the panel. **Map the crop through the page's
own `mozInnerScreenX/Y * dpr`** rather than assuming a chrome offset, and verify
the crop lands on the cube before trusting any statistic from it — see trap 3
below.

### Threshold of proof

`red 35 300 -> 72` together with `9 blobs -> 0 blobs`. The blob count is the
stronger check: it is structural, so neither a threshold nor a crop offset can
fake it.

> The absolute red figure is **not** portable between runs: it depends on the
> crop, which depends on the panel rect. The **blob count** is the portable
> metric — nine for a healthy 3x3 face, fewer as stickers are lost. On 157.0
> every non-clipped sample returns nine.

## The mechanism that was observed on 156.0.1

> The findings in this section are **historical**: they describe what was
> measured while Firefox 156.0.1 was current. They are kept because they are the
> baseline against which the 157.0 re-measurement was compared, and because the
> "fix candidates" table is now useful chiefly as a record of changes that are
> **no longer needed**.

### NO LONGER APPLICABLE — the trigger was the `perspective` VALUE

This was the most useful finding while the defect was live, and it came from
sweeping the value rather than from reading the CSS.

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

Sweeping absolute `perspective` at that fixed size on 156.0.1, each value
measured three times in a row (repeatability confirmed):

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

**MEASURED conclusion at the time:** the shipped `3.333` sat **dead centre** of
a narrow bad band, and every value outside it was healthy. The defect was not
"3D transforms are broken"; it was "this particular projected depth is broken".

**MEASURED conclusion now (157.0):** the whole band is gone. The same sweep at
the same position returns **9 blobs at every value**, including 460 and 462, so
the ratio no longer decides anything on this build.

> A mid-investigation reading that `660 px` also collapsed was **instrument
> noise**. It did not survive repetition, and the run above measured it three
> times as healthy. Do not quote the earlier value.

### Fix candidates this produced — none adopted

Measured on 156.0.1 with the front-face red as the yardstick. "Removes the
defect" means the face was fully back at **every** position tested across the
band (12 positions, top 100 to 166 step 6), where the shipped value was broken
at 5 of them.

| change                 | broken positions | cube width (device px) | cost                  |
| ---------------------- | ---------------- | ---------------------- | --------------------- |
| **shipped 462 px**     | **5 / 12**       | 215                    | —                     |
| perspective **480 px** | **0 / 12**       | 214                    | ~1 px, ratio 3.463    |
| perspective **500 px** | **0 / 12**       | 214                    | ~1 px, ratio 3.608    |
| perspective 550 px     | 0 / 12           | 213                    | ratio 3.968           |
| perspective 700 px     | 0 / 12           | 210                    | ratio 5.05            |
| `perspective: none`    | 0 / 12           | 200                    | **loses 3D entirely** |

`perspective: none` was a **known workaround, not a fix** — 215 -> 200 device px
is a visible change to the 3D look.

> **Nothing here was ever needed on 157.0.** The shipped `462 px` is now healthy
> at **every** position and size tested, so adopting one of these constants
> would have changed the cube's projection for no benefit. In particular the
> suggestion below — gating a mitigation to Firefox via `canColorizeOutput`'s
> `/Firefox/` test or `@supports (-moz-appearance: none)` — was **not**
> implemented and should not be, now that the trigger is the Gecko version
> rather than anything this repository controls.

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

## The ratio-vs-absolute question, answered

The previous revision listed this as **the most important open question**: is
the bad band a **ratio** of `faceSize` or an **absolute** pixel range? If it
were a ratio, the shipped `3.333` would be broken at every cube size and one
constant change would have fixed them all; if absolute, the defect would come
and go with the panel size.

**It is neither, on 157.0 — and the earlier "ratio" reading was a one-size
measurement, not a law.** The size sweep now covers `faceSize` 138.6 → 358.6 px,
i.e. `perspective` 462 → 1195.33 px:

| `faceSize` | derived `perspective` | samples | result                        |
| ---------- | --------------------- | ------- | ----------------------------- |
| 138.6 px   | 462 px                | 32      | **9 blobs at every position** |
| 193.6 px   | 645.333 px            | 15      | **9 blobs at every position** |
| 248.6 px   | 828.667 px            | 15      | **9 blobs at every position** |
| 303.6 px   | 1012 px               | 10      | **9 blobs at every position** |
| 358.6 px   | 1195.33 px            | 7       | **9 blobs at every position** |

The only readings below nine blobs were panels **partially past the viewport
edge** — a geometric clipping artifact, not the defect. A genuine face dropout
makes the border count _rise_ as it absorbs the face; these rows show both
counts falling together, which is occlusion.

So on 156.0.1 the band was, at the one size that could be measured, equivalent
to a ratio — but "ratio" was an inference from a single `faceSize`, and the
ratio framing should not be treated as an established law. On 157.0 the question
is moot: no band exists at any size sampled.

### Still not proven (and no longer worth pursuing)

| open question                                                    | status                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Why did the face become EMPTY rather than partially painted?** | **NOT PROVEN**, and now uninvestigable on 157.0 — the state no longer occurs. Would have needed a Gecko raster log at a healthy and a broken value.                                                                                                                                |
| **Was the mechanism perspective-specific at all?**               | **OPEN**, unresolved, and moot for the same reason.                                                                                                                                                                                                                                |
| **What changed inside Gecko between 156.0.1 and 157.0?**         | **NOT INVESTIGATED.** No Mozilla bug number has been identified and no `about:support` graphics data was collected. A report is no longer actionable for this repository, but the evidence below is self-contained if one is ever wanted.                                          |
| **Does it come back?**                                           | **WATCH.** The defect was a browser behaviour that this repository does not control. The reproduction is cheap, and the metrics, the position band and the sensitivity checks are all recorded below, so a future Firefox release can be re-tested without re-deriving the method. |

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
   > The 2026-10-01 re-run replaced the whole-image count with a panel-scoped
   > crop, mapped viewport → screen through the page's own
   > `mozInnerScreenX/Y * dpr`, and verified the crop against the cube's body
   > walls before reporting. That is the safe form of the same idea: the offset
   > is **read from the page**, never assumed from a constant.
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
    that survived here were the ones that refused to report when their control
    failed. A harness that cannot be seen to fail is not evidence.
11. ⚠ **`WebDriver:DeleteSession` TERMINATES the browser.** It destroyed a live
    session the reporter had arranged. Detach with `socket.destroy()`, and never
    call `process.exit()` with the socket open: Marionette serves one session at
    a time, so an abandoned socket stays `Established` and blocks the channel.
12. ⚠ **A minimized window has no screen pixels.** `x=-18133` in a window rect
    means minimized and any capture is a stale cache. Check `IsIconic()` first.
13. ⚠ **Capturing the whole virtual desktop makes the control pair fail.**
    Re-confirmed 2026-10-01: the desktop here is **8960x2160 across two
    monitors**, and unrelated changing content on the second monitor produced 2
    211 051 differing pixels between two captures of the _same_ app state. Crop
    to the browser window, and bound it from the page's own metrics so the
    figures do not depend on how many monitors are attached.
14. ⚠ **Setting a panel's inline `width`/`height` does NOT recompute
    `faceSize`.** The app re-measures only inside `updateSize()`, reached from
    the resize gesture or from a window `resize` event (debounced 100 ms). Every
    size sample in a first attempt silently kept the previous `faceSize` —
    `faceSize 138.6px` reported for panels nominally 300 to 1000 px wide. This
    is trap 4 in a new costume. Dispatch a real `resize` event and **read the
    app's computed values back** before trusting the row.
15. ⚠ **A panel past the viewport edge produces genuine <9-blob readings.** They
    are occlusion, not the defect. The discriminator is that **both** the face
    and the border counts fall together; in a real dropout the border count
    _rises_ to absorb the face. Flag such rows and exclude them.
16. ⚠ **A frame with every design token absent is a capture failure, not a
    finding.** One sample returned `red=0 blobs=0 border=0 interior=0` — no
    token present at all, i.e. a blank or occluded frame. Check for this
    explicitly, because `blobs=0` on its own is the _documented signature of the
    defect_ and would otherwise be reported as one.
17. ⚠ **Clearing a panel's inline styles collapses the layout.** A "reset the
    panel" helper that blanks `width`/`height`/`top`/`left` left every panel
    stacked at 20,125 with wrong sizes. Reload the page instead; the app
    restores its persisted geometry.
18. ⚠ **`System.Drawing.Common` cannot be `Add-Type`-referenced under PowerShell
    7 / .NET 9.** A capture helper's `Image.FromHbitmap` path fails with
    `Unable to find type [Cap]` and
    `error CS1069: ... forwarded to assembly System.Drawing.Common`. Pull the
    pixels with `GetDIBits` as top-down 32-bit BGRA and encode on the Node side
    instead.
19. ⚠ **The panel's resize handles are real and selectable** —
    `[data-resize-direction="se"]` (also `n`/`s`/`e`/`w`), class
    `_resize-handle_*`. The panel is `id="basic-front-panel"`, class
    `basic-front-view`. A synthetic `pointerdown` → `pointermove`×N →
    `pointerup` sequence drives a genuine resize (verified: 300 → 400 px,
    `faceSize` 138.6 → 193.6 px, `perspective` 462 → 645.333 px).

## Live environment reference

| quantity                | value                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| desktop Firefox         | **157.0** as re-measured 2026-10-01; **156.0.1** while the defect reproduced                                |
| `devicePixelRatio`      | **1.7647058823529411** (30/17) on both — the dpr was necessary but **not sufficient**                       |
| display                 | 3840x2160 at 175% scaling (`LOGPIXELSX` 168); virtual desktop **8960x2160** (two monitors)                  |
| CDP (port 9222)         | **disabled** (404) — Playwright **cannot** attach                                                           |
| control channel         | **Marionette 2828**, spoken by hand                                                                         |
| Marionette framing      | `length:json`, length is **BYTE** length; out `[0, msgId, command, params]`, in `[1, msgId, error, result]` |
| dev server              | `http://localhost:5173` — IPv6 `::1` only; `127.0.0.1` is refused                                           |
| measured `faceSize`     | 138.6 px (panel 300x300), cube rect 215x281 device px                                                       |
| computed sticker border | 0.566667 px                                                                                                 |
| `#333333`               | `--palette-domain-sticker-border`, the sticker's own frame                                                  |
| `#222222`               | `--palette-domain-cube-interior`, the body walls                                                            |

## Visual evidence

| file                       | size      | largest `#333` blob | red px (exact `#C41E3A`) | role                                             |
| -------------------------- | --------- | ------------------- | ------------------------ | ------------------------------------------------ |
| `firefox-move-issue5.png`  | 3839x2159 | 38 847              | **4 074**                | face-drop variant; the archived broken reference |
| `firefox-move-issue2.png`  | 3839x2159 | 119 332             | **14 780**               | striped variant, face colour reduced             |
| `firefox-resize-issue.png` | 744x1355  | 88 667              | **41 339**               | resize trigger, different texture                |
| `firefox-color-leak.png`   | 820x557   | 22 510              | 42 092                   | separate colour-leak report                      |

> ⚠ **The `red px` column was corrected on 2026-10-01.** The three figures in
> bold were re-measured with two independent decode paths and disagree with the
> values previously listed here (630, 15 032, 41 526). The direction of the
> correction is consistent — the old numbers were low — which points at a
> colour-space or alpha conversion in the earlier tooling rather than at a
> different measurement. Treat the re-measured values as authoritative; the
> qualitative roles are unaffected.

Three earlier files were removed as part of the 2026-09-26 revision:
`firefox-move-issue3.png` (2697x2074) and `firefox-move-issue4.png` (2610x2069)
were rescaled rather than native captures, and `firefox-move-issue1.png` was
redundant — its red count of 44 752 px is essentially healthy and describes a
striped variant already better shown by `issue2`.

## Re-testing after a Firefox update

The scratch harness that produced the 2026-10-01 measurements has been removed,
so a future re-test means rebuilding the instrument rather than re-running a
committed script. The pieces it needs are all described in this document:

```bash
npm install
npx vite --host 127.0.0.1 --port 5173   # the dev server the page is loaded from

# desktop Firefox under Marionette, in a fresh profile
& "$env:ProgramFiles\Mozilla Firefox\firefox.exe" -marionette `
  -profile (Join-Path $env:TEMP 'ff-marionette') http://127.0.0.1:5173
```

Then drive Marionette directly — the framing is `length:json`, in
`[0, msgId, command, params]` and out `[1, msgId, error, result]` — and capture
the real screen rather than the API screenshot. The metric of record is the
**blob count** of the exact face colour over a panel crop, with the position
band and the calibration points from the sections above as the expected result.

Before trusting a clean reading, run the two sensitivity checks under
**Resolution**: the archived screenshots must still measure broken, and
repainting a healthy frame's face as the border colour must drive the count to
zero.

## Related

- `docs/plans/firefox-basic-artifact-repro-procedure.md` — the operational
  procedure, still accurate for bringing the browser up and reading pixels back.
  Its "not reproducible on demand" status was superseded on 2026-09-26, and the
  defect it describes is now resolved on Firefox 157.0.
- `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`
  — the pre-transform vs post-transform rule that invalidated an earlier
  finding.
- `docs/solutions/ui-bugs/backface-culling-flash-during-view-rotation.md` — the
  other Firefox Basic-view paint defect, which **is** fixed.
