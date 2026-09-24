# firefox-basic-artifact — measuring the Firefox-only Basic-view stripes

**Not part of the app. Not imported by it.** These are the instruments for the
unfixed defect tracked in `TODO.md` ("Basic View - In Firefox resizing the view
panel produces unexpected visual issue" and the move counterpart).

The parent folder is scoped to rotation-animation verification; these scripts
are a different topic, so they live here.

## The defect

Dark stripes eating face colour in the Basic 3D view of **desktop** Firefox,
during/after a panel resize or move. Persistent once it appears. Firefox-only.

See `docs/plans/firefox-basic-artifact-repro-procedure.md` for the full
procedure, the traps, the reference measurements, and the candidate fixes.

## Why these cannot be unit tests

The defect is a property of what the browser **paints**, which jsdom cannot
observe at all:

- jsdom has no compositor, so nothing renders to pixels.
- The trigger is a **fractional `devicePixelRatio`** (1.7647058823529411,
  ~176.47% Windows scaling). Playwright's Firefox runs at dpr **1** and Chromium
  at dpr **1**, so a whole-pixel border is already whole and the effect cannot
  occur.
- Playwright **cannot attach** to this Firefox at all: CDP is disabled on the
  desktop build, so Marionette on port 2828 is the only channel.

## Inventory

| Script                       | What it answers                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe-basic-geometry.mjs`   | The geometry chain (`faceSize`, `perspective`, `cubieSize`, `border`) and the authored → computed → snapped-device-px border maths. Printed the two snapping data points in `TODO.md`.      |
| `capture-session-state.mjs`  | Window rect + viewport + panel/DOM state + screenshot in **one** Marionette session, so they share a coordinate space. Records the position and size of the window the artifact appears in. |
| `probe-u-centerline.mjs`     | Honest pixel ground truth: real RGB runs along a sticker's projected centre line.                                                                                                           |
| `probe-border3.mjs`          | Authored → computed → snapped device px, read end to end.                                                                                                                                   |
| `ascii-image.mjs`            | Renders an image as glyphs so a vision-less agent can read it.                                                                                                                              |
| `probe-image-provenance.mjs` | Photo-vs-screenshot discriminator, exact-colour census, band profile.                                                                                                                       |
| `probe-face-stripes.mjs`     | Locates the bright face by mask and counts dark bands and thin-run fringes.                                                                                                                 |
| `probe-stripe-period.mjs`    | Band count, thickness, spacing and orientation via a structure tensor.                                                                                                                      |
| `probe-compositor-cache.mjs` | Compositor-cache vs content geometry, **with a control pair**.                                                                                                                              |
| `win-restore-rect.ps1`       | Real window rect from Windows, restoring first.                                                                                                                                             |
| `ask-image.mjs`              | Local VLM wrapper — **read the caveat below**.                                                                                                                                              |

## Running

Needs the desktop Firefox up under Marionette and the dev server on `:5173`:

```bash
# desktop Firefox with Marionette on 2828
node scripts/scratch-debug/firefox-basic-artifact/probe-basic-geometry.mjs
node scripts/scratch-debug/firefox-basic-artifact/capture-session-state.mjs <label>

# a captured screenshot
node scripts/scratch-debug/firefox-basic-artifact/ascii-image.mjs <image> [cols] [rows] [x y w h] [dpr]
node scripts/scratch-debug/firefox-basic-artifact/probe-u-centerline.mjs
```

⚠ **Never call `WebDriver:DeleteSession`** in a capture run — it shuts the
browser down and destroys the reporter's session. Just `socket.end()`.

## Traps these scripts encode

Both were expensive, and both are the reason some numbers from this
investigation had to be retracted:

- ⚠ **Never mix pre- and post-transform geometry in one expression.**
  `getBoundingClientRect()` is **post**-transform;
  `getComputedStyle().borderTopWidth` and `.width` are **pre**-transform. A 3D
  transform foreshortens the border too, so `height - 2*border` overstates the
  border's share. That produced a confident, self-consistent, wrong
  `vRatio 0.533` on a render that is clean.
- ⚠ **Never count pixels inside the bounding rect of a rotated quad.** The four
  triangular corners lie outside it and show what is behind.
- ⚠ **Never downscale with a nearest-neighbour kernel** for inspection: it
  samples one source pixel per cell, so a single dark pixel becomes a whole dark
  character, fabricating thin dark lines indistinguishable from the defect.
  `ascii-image.mjs` uses the averaging kernel deliberately.
- ⚠ **Check a crop's dark/bright composition before trusting its statistics.**
  One crop was 92.7% background, making every number from it meaningless.
- ⚠ **A harness that cannot be seen to fail is not evidence.**
  `probe-compositor-cache.mjs` takes a control pair first and refuses to
  continue when the control is not identical. Its own result is currently
  **inconclusive** — the bug was not on screen — and it must be re-run while the
  stripes are visible.
- ⚠ **`ask-image.mjs` must never decide whether a defect is present.** On the
  defect screenshot the local Qwen2.5-VL hallucinated a whole scene, inventing
  faces and colours that are not in the image. It is fine for inventory
  questions about a crop it can genuinely see.

## Deleted, deliberately

`u-stripe-ratio.mjs` and `measure-u-painted.mjs` were removed rather than kept:
they encode the first two traps above and their output was wrong.
`u-cross-section.mjs` was removed because it depended on `getBoxQuads()`, which
this Firefox build does not implement. Do not resurrect them as-is.
