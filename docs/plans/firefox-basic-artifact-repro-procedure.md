# Reproducing and measuring the Firefox Basic-view rendering artifact

How to get the desktop Firefox under measurement, capture the artifact, and read
the pixels back **without vision**. Written 2026-09-23 after a session in which
several harnesses produced confident wrong answers; the rules here are the
corrected versions.

Related:
`docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`.

---

## 1. Why the desktop browser and not Playwright

|                         | desktop Firefox                | Playwright Firefox | Chromium   |
| ----------------------- | ------------------------------ | ------------------ | ---------- |
| version                 | **156.0.1**                    | 148.0.2 Nightly    | —          |
| `devicePixelRatio`      | **1.7647058823529411** (30/17) | **1**              | **1**      |
| CDP (port 9222)         | **disabled** (404)             | n/a                | yes        |
| control channel         | **Marionette 2828**            | Playwright         | Playwright |
| reproduces the artifact | **yes**                        | no                 | no         |

The artifact needs a **fractional** `devicePixelRatio`. At dpr 1 an integer CSS
border is already an integer number of device pixels, so nothing is snapped and
the effect cannot occur. The reporter's Windows display scale is ~176.47%.

---

## 2. Bring the browser up under Marionette

Prefs to set in a **fresh** profile: `marionette.enabled = true` (or launch with
`-marionette`). Marionette then listens on **2828**.

launch:

```powershell
$profile = Join-Path $env:TEMP 'ff-marionette-profile'
& "$env:ProgramFiles\Mozilla Firefox\firefox.exe" `
  -marionette -remote-debugging-port 9222 -profile $profile `
  http://127.0.0.1:5173
```

confirm it is up (do this before every measurement run):

```powershell
Get-NetTCPConnection -LocalPort 2828 -State Listen
```

Also confirm the page URL is the vite dev server on **5173** and that Firefox is
at **156.0.1** (a surprise upgrade would invalidate the DPR reasoning).

> Use exactly `http://127.0.0.1:5173` or `http://localhost:5173`. Do not invent
> addresses.

---

## 3. Talk to Marionette

Framing is `length:json`, where **length is the BYTE length** of the JSON.

| direction | shape                         |
| --------- | ----------------------------- |
| out       | `[0, msgId, command, params]` |
| in        | `[1, msgId, error, result]`   |

A Marionette client is ~30 lines: connect, concatenate chunks, split on `0x3a`,
`parseInt` the length, slice by **byte** length, `JSON.parse`, match on
`frame[1] === msgId`.

Commands used: `WebDriver:NewSession`, `WebDriver:ExecuteScript`,
`WebDriver:GetWindowRect`, `WebDriver:TakeScreenshot`,
`WebDriver:DeleteSession`.

### Hard rules

- ⚠ **Never call `WebDriver:DeleteSession`** during a capture run — it shuts the
  browser down and destroys the session the reporter arranged. `socket.end()` to
  detach.
- ⚠ **`getBoxQuads()` does not exist on this build**
  (`TypeError: e.getBoxQuads is not a function`). Do not build a method around
  it.
- ⚠ **The window may be MINIMIZED.** `WebDriver:GetWindowRect` then returns the
  iconic sentinel (observed `x=-18133 y=-18133 156x26`) while the page still
  reports a full viewport. Check `IsIconic()` before trusting any window rect;
  restore with `ShowWindow(hwnd, 9)` (SW_RESTORE).
- Build embedded page JS as an **array of lines joined with `\n`**, not a
  multi-line template literal — one file failed to parse that way while
  `get_errors` insisted it was clean.
- Always `node --check <script>` before running a new scratch script.

---

## 4. Reproducing the artifact

The artifact **is reproducible on demand**, by panel POSITION alone — no gesture
is needed. Move the panel to a position inside its band and the front face stops
being painted; move it out and the face returns.

The earlier note in this document that the artifact was "not reproducible on
demand" was **wrong**, and the reason is worth keeping: the instrument used to
look for it (`WebDriver:TakeScreenshot`) **forces a repaint, and the repaint
draws the missing face**. It repaired the defect as it measured it. Any capture
taken that way will report a clean screen.

Procedure:

1. Bring the window up (section 2), maximise it, and confirm dpr is fractional:
   `window.devicePixelRatio` must be ~1.7647, not 1. At dpr 1 the defect cannot
   occur.
2. Set the panel position, in CSS px, from the page:

```js
document.querySelector('.basic-front-view').style.top = '130px';
```

3. Count red ink **over the whole capture**. Do not crop: see trap 3 below for
   why a viewport-relative rect is not a screen rect.

### The three quantities that decide it

| quantity                           | healthy   | broken    |
| ---------------------------------- | --------- | --------- |
| red ink, whole image, `#C41E3A`    | 35 300 px | 72 px     |
| red blobs (the face is a 3x3 grid) | 9         | 0         |
| `#333333` ink, whole image         | 23 445 px | 57 069 px |

The **blob count is the strongest check**: a red face is nine separate pieces,
so 9 -> 0 is structural and cannot be faked by a threshold or a crop offset.

### The band

At cube face size 138.6 px, panel top 120/130/140 CSS px are fully broken, 110
and 150 are partial, and 60/200 are healthy. The band is **narrow and bounded by
healthy values** on both sides — the earlier description of the artifact as
"non-deterministic with no relation to position" was a consequence of never
having sampled a broken position on purpose.

---

## 5. Reading an image without vision

The local VLM is **not** usable for this. Two sound substitutes:

### ASCII render

Render an image as glyphs, each character a **block average** classified into a
coarse palette (`.`=interior#222, `x`=border#333, `W`=white, and the sticker
colours). Region arguments are CSS px, scaled by `dpr`.

⚠ Never use a nearest-neighbour downscale. It samples one source pixel per cell,
so a single dark pixel inside a white block becomes a whole dark character —
**fabricating thin dark lines that look exactly like the defect.**

⚠ It also **cannot be used to compare two images** for this defect. It maps any
dark colour to the nearest palette entry, and most of these screenshots are a
dark desktop or editor behind the app window, so two quite different defect
states can render to a nearly identical grid. What looked like agreement between
a screenshot and a reproduction was agreement about the background. Compare
exact colour counts and blob structure instead, never glyphs.

### Real pixel runs along a centre line

Print the actual RGB runs with their token names, e.g.
`[35..252] 218px 72.2% WHITE`. Sampling the **centre line of the bounding box**
is safe even for a rotated element: the box centre is inside the projected quad,
and a convex quad keeps a horizontal or vertical line through it inside for the
full box extent. The box **corners** are what fall outside.

---

## 6. Traps that produced wrong answers (do not repeat)

1. **Mixing pre- and post-transform geometry.** `getBoundingClientRect()` is
   **post**-transform; `getComputedStyle().borderTopWidth` and `.width` are
   **pre**-transform. A 3D transform foreshortens the border too, so
   `height - 2*border` **overstates** the border's share. This produced a
   confident, self-consistent, completely wrong `vRatio 0.533`.

2. **Counting pixels inside the BOUNDING RECT of a rotated quad.** The four
   triangular corners lie outside the quad and show what is behind, so they were
   counted as "dark".

3. **A crop that is mostly background.** One probe region was **92.7% dark** —
   almost entirely panel background — making every statistic from it
   meaningless. Always print the dark/bright composition of a crop **before**
   trusting its statistics, and locate the face by mask rather than by
   hand-picked coordinates.

4. **The local VLM hallucinates whole scenes.** Given
   `docs/visuals/firefox-resize-issue.png` it answered "the front and the back"
   and listed blue/green/red/orange centres — **none of which are in that
   image**. A hallucinating judge is worse than no judge. Fine for inventory
   questions about a crop it can genuinely see; **never** for deciding whether a
   defect is present.

5. **A harness that cannot be seen to fail is not evidence.** Every comparison
   must begin with a **control pair** that is expected to be identical; if the
   control is not identical, stop and fix the instrument.

6. **Do not size something in one loop and measure it in another.** That pattern
   returned byte-identical pixel counts for three supposedly different cube
   sizes. Identical readings for different inputs is the fingerprint of an
   instrument that is not varying what it claims to vary.

7. **A stale application state looks like a fix.** Driving the panel height to
   vary the cube size left the app's computed `perspective` stale (faceSize
   138.6 but perspective 720px instead of 462px). In that state the defect does
   **not** reproduce, so _every_ candidate scored as a fix. Print the app's own
   computed values beside every measurement.

8. **Gate on the reproduction before scoring any candidate.** If the defect is
   not present, "does this fix it" has no answer, and a harness will report that
   everything fixes it. This is the same trap as 7 from the other direction.

---

## 7. Known-good reference measurements

Standing points, re-check these first when resuming — if they have moved, the
environment changed and prior conclusions need re-anchoring.

| quantity                        | value                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| viewport (CSS px)               | 2176 x 1092                                                                     |
| window (physical px, maximized) | 2208 x 1200 (`left=-7 top=-7 right=2201 bottom=1193`)                           |
| screens                         | DISPLAY1 primary `0,0 2194x1234`; DISPLAY2 `3072,0 2048x1152`                   |
| Marionette screenshot           | **3840x1927** (whole virtual desktop at physical scale, **not** viewport x dpr) |
| panel inline                    | `left=604px top=0px`                                                            |
| panel rect (one observed state) | `x=624 y=125.267` `730.667x748.8`, padding 0                                    |
| perspective                     | `1285.17px` inline, `= 1000 * (385.55/300) = 1285.167`                          |
| `--cubie-border-width`          | `10px` (state A) / `11px` (state B)                                             |
| computed sticker border         | `9.63333px` (A) / `10.767px` (B)                                                |
| snapped device px               | `17` (A) / `19` (B)                                                             |
| authored border as device px    | 17.647 (A) / 19.412 (B)                                                         |

### Border-snapping table

| state                       | authored | computed    | device px | expected | shortfall |
| --------------------------- | -------- | ----------- | --------- | -------- | --------- |
| A: 3x3, panel 730.667x748.8 | `10px`   | `9.63333px` | `17`      | 17.647   | 0.647     |
| B: after resize             | `11px`   | `10.767px`  | `19`      | 19.412   | 0.412     |

`9.63333 * 1.764706 = 17.0` exactly, and `10.767 * 1.764706 = 19.0` exactly, so
Firefox lays the border out in CSS px and **paints it at whole device px**,
reporting the snapped value back through `getComputedStyle`. The shortfall is
not a constant, so it is per-element snapping rather than a single scale error.

### Geometry chain (verified `MATCH`)

```
scale       = 0.55 (0.5 when tabbed)   <- note: measured 385.55/730.667 = 0.5276, so this is NOT a flat 0.55
faceSize    = min(availW, availH) * scale
perspective = 1000 * (faceSize / 300)
cubieSize   = faceSize / n
border      = clamp(round(cubieSize * 0.08), 2, 16)
```

`perspectivePredicted = 1285.167` == computed `1285.17`. **The scale step is the
one that does not reconcile — worth checking first next session.**

---

## 8. Current status

**REPRODUCED ON DEMAND, NOT FIXED.** See
`docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md` for
the full record — this plan is the operational procedure, that document is the
findings.

The load-bearing facts:

- The trigger is the **VALUE of `perspective`**. At face size 138.6 px the
  shipped value is 462 px (ratio **3.333**), and that sits **dead centre** of a
  narrow bad band. 440 px and 480 px are healthy; 460 and 462 collapse the face
  to 0 red pixels and 0 blobs. 500, 660 and 900 px are healthy.
- The defect is a **paint** fault: transform, cube rect and border width are
  identical between a healthy and a broken state, and the sticker-border colour
  absorbs almost exactly what the face colour loses.
- `perspective: none` removes it (red 72 -> 47k over the band, 0 of 12 positions
  broken) but **flattens the cube** (215 -> 200 device px), so it is a
  workaround, not a fix. 480 px and 500 px are the candidates that cost ~1
  device px.
- **The open question that gates everything:** whether the band is a **ratio**
  or an **absolute pixel range**. If a ratio, one constant change fixes every
  cube size. At face size 165 the equivalent window (551-565 px) was never
  sampled — the sweep there used a 20 px grid and stepped over it.

### Candidate fixes, none validated

1. **Move the perspective away from the shipped ratio** — measured to work at
   face size 138.6, cost ~1 device px of cube width. Must be gated to Firefox
   and re-measured at every cube size. `perspective` is written in **two**
   places: `basic-view.module.css` line 21 (authored, never used) and inline
   from `rendering.ts` (~line 484, the effective value).
2. **Make the border a whole number of DEVICE px** —
   `Math.round(raw * dpr) / dpr` in `stickerBorderWidth()`, which currently
   takes only `cubieSize`, so the DPR has to reach it.
3. **Drop the border from `.sticker`** and separate with `outline` or a
   `box-shadow`, which do not participate in border-box layout.

> ⚠ **Candidate 2 and 3 rest on the border-snapping mechanism, which this
> investigation did NOT confirm as the cause of the face dropout.** At a FIXED
> cube size the border is identical in the healthy and the broken state, so
> snapping cannot be what distinguishes them. The snapping measurements below
> are real, but their link to this defect is unproven. Do not describe them as
> "the fix" in a changelog.
