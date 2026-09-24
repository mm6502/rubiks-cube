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

Copy the client from
`scripts/scratch-debug/firefox-basic-artifact/probe-basic-geometry.mjs`:
connect, concatenate chunks, split on `0x3a`, `parseInt` the length, slice by
**byte** length, `JSON.parse`, match on `frame[1] === msgId`.

All scripts named in this document live in
`scripts/scratch-debug/firefox-basic-artifact/` — see its `README.md` for the
inventory and the traps.

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

The artifact appears **during/after a panel resize or move** and is **persistent
once it appears** — so it is present in a static screenshot, not only mid-drag.
It is **not** reproducible on demand: it was absent in the captured state even
after the reporter had just navigated to it.

Procedure:

1. Bring the window up (section 2) and maximise it.
2. Drag the Basic panel's **resize handle** (`[data-resize-direction="se"]`),
   then drag the panel **header** to move it, in a real browser session.
3. **As soon as stripes are visible, capture before touching anything else** —
   both scripts below, in the order given.

```
node scripts/scratch-debug/firefox-basic-artifact/capture-session-state.mjs <label>
node scripts/scratch-debug/firefox-basic-artifact/probe-basic-geometry.mjs
```

`capture-session-state.mjs` writes `<label>.json` + `<label>.png` under
`d:/llms/vision/artifact/` and prints window rect, viewport, panel rects,
perspective, cubie/sticker counts and the border pipeline.
`probe-basic-geometry.mjs` verifies the whole geometry chain and prints the
border device-pixel maths.

Then read the pixels back (section 5) and only afterwards start changing things.

---

## 5. Reading an image without vision

Two tools are sound. **The local VLM is not.**

### ASCII render — `firefox-basic-artifact/ascii-image.mjs`

```
node scripts/scratch-debug/firefox-basic-artifact/ascii-image.mjs <image> [cols] [rows] [x y w h] [dpr]
```

Each character is the **block average** classified into a coarse palette
(`.`=interior#222, `x`=border#333, `W`=white, `R`,`O`,`Y`,`G`,`B`,`c`,`s`,`#`).
Region args are CSS px, scaled by `dpr`.

⚠ Never let this use a nearest-neighbour downscale. It samples one source pixel
per cell, so a single dark pixel inside a white block becomes a whole dark
character — **fabricating thin dark lines that look exactly like the defect.**

### Real pixel runs — `firefox-basic-artifact/probe-u-centerline.mjs`

Prints the actual runs with real token names, e.g.
`[35..252] 218px 72.2% WHITE`. Sampling the **centre line of the bounding box**
is safe even for a rotated element: the box centre is inside the projected quad,
and a convex quad keeps a horizontal/vertical line through it inside for the
full box extent. The box **corners** are what fall outside.

### Supporting probes

| script                       | what it answers                                                 |
| ---------------------------- | --------------------------------------------------------------- |
| `probe-image-provenance.mjs` | photo vs screenshot; exact-colour census; band profile          |
| `probe-face-stripes.mjs`     | locates the bright face, counts dark bands and thin-run fringes |
| `probe-stripe-period.mjs`    | band count/thickness/spacing/orientation via a structure tensor |
| `probe-compositor-cache.mjs` | compositor-cache vs content geometry, **with a control pair**   |
| `win-restore-rect.ps1`       | real window rect from Windows (restores if minimized)           |
| `ask-image.mjs`              | local Qwen2.5-VL — **see the warning below**                    |

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
   `probe-compositor-cache.mjs` implements this and refuses to continue when the
   control is unstable.

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

**The artifact is NOT fixed and NOT reproduced on demand.** The mechanism is
understood in one respect (border snapping at fractional DPR, above) and
**unconfirmed** in another: the stripes were not on screen in the captured
state, and a scan of the artifact screenshot showed the dark structure does
**not** multiply the 3x3 grid into extra stripes (max 3 bright runs per line)
but does **eat** the bright face colour (mean only 2.33 bright runs per line).

The reporter's read is that it "looks like a compositor or driver bug". That is
still open: `probe-compositor-cache.mjs` gave a clean control but an
**inconclusive** result, because a negative from a session without the bug
present proves nothing. Re-run it **while the stripes are visible**.

Candidate fixes, none validated:

1. Make the border a whole number of **device** px:
   `Math.round(raw * dpr) / dpr` in `stickerBorderWidth()` — which currently
   takes only `cubieSize`, so the DPR has to reach it.
2. Drop the border from `.sticker` and separate with `outline` or `box-shadow`,
   which do not participate in border-box layout.
3. Use an inset `box-shadow` instead of a border.
