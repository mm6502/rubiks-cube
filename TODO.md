# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

- [x] Basic View - after fixing face culling in Firefox, now there are colors
      leaking from adjacent faces through the gaps among cubies. See
      [docs/visuals/firefox-color-leak.png](./docs/visuals/firefox-color-leak.png)

- Basic View - Whole cube rotations does not distinguish between +180 and -180
  degree turns, resulting in wrong animation for one of them.

- Flat View - Does not display move inference cross / line.

- Basic View - Making moves quickly (making next one before the animation ends)
  will result in wrong layer moved. Seems like the mousedown is getting wrong
  sticker mid flight. For example, if I start with a D move on cubie FLD and
  immediately follow with an mouse action mousedown+up I would expect L' move,
  but B' is preformed. It seems like the stickers are detected as if they belong
  to the face where they started their movement.

- Investigate possibility of simplifying move table such as key will be the
  primary/canonical "identifier" of the move and alternative notations will be
  placed in an alternative notation list in the value object (move descriptor?).

- Basic View - In Firefox resizing the view panel produces unexpected visual
  issues. Screenshot in
  [docs/visuals/firefox-resize-issue.png](./docs/visuals/firefox-resize-issue.png)
  Investigate and fix.

- Basic View - In Firefox, MOVING a view panel produces the same class of visual
  issue as resizing it. Screenshots:
  [docs/visuals/firefox-move-issue1.png](./docs/visuals/firefox-move-issue1.png),
  [docs/visuals/firefox-move-issue2.png](./docs/visuals/firefox-move-issue2.png).
  - **Non-deterministic**: the user cannot find a relation between where the
    panel is placed on screen and which face shows the artifact.
  - The artifact is **persistent once it appears** — stopping the drag at the
    moment it shows leaves it on screen. It is therefore present in a static
    screenshot, not only mid-animation.
  - **Measured signature** (pixel analysis of both screenshots, worst face
    region vs a clean render of the same view):

    | Image                     | face region | dark pixels | largest dark blob  |
    | ------------------------- | ----------- | ----------- | ------------------ |
    | `firefox-move-issue1.png` | 1040×816    | 18.3%       | 143 664 px (16.9%) |
    | `firefox-move-issue2.png` | 1056×768    | 23.3%       | 178 640 px (22.0%) |
    | clean render (control)    | 1536×432    | 4.5%        | 9 064 px (1.4%)    |

    16–20× separation between the defect and a clean render, so the metric
    discriminates reliably. In the defect the dark pixels form **jagged,
    multi-directional streaks across a face**, not the regular 3×3 gap grid a
    healthy face shows.

  - Which dark it is matters: the dominant dark colour is **#333333**
    (`--color-domain-sticker-border`, the sticker's own frame), not **#222222**
    (`--color-domain-cube-interior`, the cube body). In a comparable region the
    border colour occupies **39.6%** of the defect versus **9.3%** of a clean
    render (4.3×), while the body colour stays near-flat at 1.8% vs 0.7%. The
    artifact is therefore border-coloured pixels replacing face colour, not the
    cube's interior showing through a gap.
  - Firefox only — Chromium does not show it (same as the resize issue).
  - **Checked and ruled out** (reading the code): a per-event cubie-tree
    rebuild. `handleDrag` in `src/view-manager/panel-interaction-handler.ts`
    only writes `style.left` / `style.top` — it never resizes the view or
    touches the cubie tree, so the move path is NOT the resize path.
  - **Also ruled out**: the `face-label-spin-out` / `spin-in` keyframes
    (`basic-view.module.css`). They are `scaleX/scaleY(1) -> (0) -> (1)`, which
    matches "shrinks in one direction until it disappears, then grows back", but
    they animate the **face labels** (the F/U/R/B/L/D letters), not the
    stickers. Only four `@keyframes` exist in all of `src`, all for labels.
  - **Ruled out**: `box-sizing: border-box` on the sticker plus
    `transition: border 0.2s`. The mechanism is physically possible (a larger
    border would eat the face colour and could shrink it to nothing), but it is
    not what happens: measured in a real drag, `--cubie-border-width` stays
    `4px`, the sticker's computed border stays `4px`, and the border does not
    animate. The 4.3x excess of border-coloured pixels in the screenshots is a
    _consequence_ of the defect below, not its cause.
  - ⚠ **The border was re-examined on 2026-09-23 and the "ruled out" verdict
    above is INCOMPLETE — the border does change size, just not by animating.**
    `stickerBorderWidth()` rounds to **whole CSS pixels**, but Firefox lays
    borders out in CSS px and paints them at whole **DEVICE** px, then reports
    the snapped result back through `getComputedStyle`. At the reporter's
    display scale a whole CSS pixel is **not** a whole device pixel, so an
    integer authored border is silently resized. Measured live in desktop
    Firefox 156.0.1 at `devicePixelRatio` **1.7647058823529411** (30/17), 3x3,
    panel `730.667x748.8`:

    | quantity                        | value                         |
    | ------------------------------- | ----------------------------- |
    | cubie width                     | `128.517` css                 |
    | `cubie * 0.08`                  | `10.281`                      |
    | authored `--cubie-border-width` | **`10px`** (inline, verified) |
    | computed `border-top-width`     | **`9.63333px`**               |
    | computed x dpr                  | **`17.0` device px** (exact)  |
    | css implied by the snapped 17   | **`9.63`**                    |
    | what `10px` "should" be         | `17.647` device px            |

    `9.63333 * 1.764706 = 17.0` exactly, so Firefox snapped 10 css -> 17 device.
    The border therefore lands at `9.63333/128.517 = **7.5%**` of the cubie, not
    the intended `8%`. Live `distinct computed borders` were
    `["9.63333px", "4.53333px"]` with `distinct snapped device px` `[17, 8]` —
    the second is `.sticker`'s `.selected` rule (`border: 5px`, since
    `5 * 1.7647 = 8.82 -> 8` device -> `4.5333` css).

    **This is why the artifact is desktop-Firefox-only.** Playwright's Firefox
    is **148.0.2 Nightly at dpr 1**, and Chromium here is also dpr 1, so
    `10 * 1 = 10` is already whole, nothing is snapped, and the bug cannot
    reproduce there — which matches every earlier failed attempt to reproduce it
    in those engines.

    **A second data point reproduces the same bias.** After a resize the cubie
    grew and the authored border became **`11px`**, which snapped to **`19`**
    device px instead of the 19.412 that 11 css px "is". So the border is
    **short by 0.412 device px** at 11px, where at 10px it was **short by 0.647
    device px**. The bias varies with the authored value, which is the signature
    of per-element snapping rather than of a single scale error.

    | current state            | authored | computed    | device px | expected device | shortfall |
    | ------------------------ | -------- | ----------- | --------- | --------------- | --------- |
    | 3x3, panel 730.667x748.8 | `10px`   | `9.63333px` | `17`      | 17.647          | 0.647     |
    | after resize             | `11px`   | `10.767px`  | `19`      | 19.412          | 0.412     |

    Both rows were read with `scripts/scratch-debug/probe-basic-geometry.mjs`
    while the browser was live; the 10px row is also corroborated by
    `capture-session-state.mjs` and `probe-border3.mjs`.

  - ⚠ **Correction to the "Next step" paragraph below**: the artifact was
    re-measured on 2026-09-23 and the **U face rendered CLEAN** in the captured
    state — real pixel runs along each sticker's projected centre line gave a
    single contiguous white run (`[35..252]`, 218px, 72.2%) with a `WHITE share`
    of `74.5%` / `79.3%` and **no interior dark band**. So the `perspective`
    mechanism is verified arithmetic but is **not yet shown to be what paints
    the stripes**, and the stripes were not on screen at capture time. Note also
    that the earlier `vRatio 0.533` "stripe" measurement was an **artefact of my
    own instrument** (it subtracted a pre-transform border from a post-transform
    height); see
    `docs/solutions/best-practices/3d-transformed-dom-measurement-coordinate-spaces.md`.

  - **Reported by the user as "looks like a compositor or driver bug"**
    (`docs/visuals/firefox-move-issue3.png`, 2697x2074, added 2026-09-23 23:19).
    The image is internally consistent with a **digital capture, not a phone
    photo of the screen**: 3615 of 5376 flat 32x32 blocks have luminance
    standard deviation **exactly 0.0000** (`probe-image-provenance.mjs`), which
    camera sensor noise makes impossible, and 20.3% of the cube region is
    **byte-exact `#333333`** (the `--palette-domain-sticker-border` token) while
    the similarly dark neighbours are quantisation variants (`21,29,45`,
    `20,28,44`, `18,25,40`). So it is real pixels, not photographic noise.

    Two measurements from that image bear on the compositor idea and are
    recorded here rather than as conclusions:
    - A scan across the located white face gives **max 3 bright runs per line**
      — i.e. exactly the 3-sticker grid, so the dark structure does **not**
      multiply the grid into extra stripes.
    - The same scan finds **90 dark runs of 6px or less** in the vertical
      direction out of 2750, and a mean bright run of only **2.33 per line**
      against the ~3 a healthy face gives — i.e. the bright face colour is being
      eaten, not duplicated.

    **What the compositor hypothesis predicts, and has NOT yet been shown:**
    `handleDrag()` writes only `style.left`/`style.top`
    (`panel-interaction-handler.ts:284-285`), so a move cannot change any
    painted property — any visible change after a pure move is compositing by
    construction. This was probed with `probe-compositor-cache.mjs`, which takes
    a **control pair first** (two captures with nothing changed) and then forces
    a layer re-raster by toggling `will-change: transform`. Result: the control
    was **perfectly stable** (0 differing pixels, so the comparison is sound)
    and the re-raster produced **0 differing pixels** in all three comparisons.
    That is **inconclusive**, because the artifact was not on screen at the time
    — a negative result from a session without the bug present proves nothing.
    To settle it the same probe must be run **while the stripes are visible**.

  - **MECHANISM FOUND — `perspective` is recomputed from the container size on
    every view resize.** `updateSize()` in `src/views/basic/rendering.ts`:

    ```ts
    const scale = state.layoutMode === LayoutMode.Tabbed ? 0.5 : 0.55;
    const faceSize =
      Math.min(availableSize.width, availableSize.height) * scale;
    const scaledPerspective = 1000 * (faceSize / defaultSize); // defaultSize = 300
    cubeWrapper.style.perspective = `${scaledPerspective}px`;
    ```

    So the projection's camera distance is a function of the panel size, and it
    is driven by **`min(containerWidth, containerHeight)`**:

    `perspective = 1000 * (min(w, h) * 0.55 / 300)`
    - **This explains the diagonal.** `min()` switches which axis it follows
      exactly where `w == h` — a line running from one corner of the panel to
      the opposite corner, i.e. the diagonal the reporter described.
    - **This explains the panel-size dependence.** Verified across nine states
      of a real resize drag, the formula matched the computed perspective
      exactly every time (`allMatch: true`). Two states from that run show the
      effect the reporter sees: a `420x372` panel gives `perspective: 682px`,
      while a _larger_ `480x312` panel gives `572px` — because the smaller axis
      (312) drove it, not the larger one.
    - The CSS declares `perspective: 1000px` on `.cube-wrapper`, but JS
      overrides it on every `updateSize()`, so the authored value is never what
      is used.
    - `perspective` also sets the projection's origin, so changing it moves
      where the projection axis sits relative to the cube — which is why the
      artifact's location tracks the panel rather than being fixed.

  - **Next step**: treat the perspective as geometry that must NOT depend on the
    panel's aspect. Either keep a constant perspective, or clamp it so it cannot
    vary with `min(w, h)` alone. Real Firefox is still needed to observe the
    artifact itself — Playwright's Firefox does not reproduce it, and this
    repository already documents that its patched build cannot stand in for the
    shipped browser.
  - **Why the earlier hypotheses were wrong**: Playwright's Firefox does not
    reproduce it. Per frame during a drag, `--cubie-border-width` stayed at
    `4px`, the sticker's computed border stayed `4px`, and its box stayed
    `63.1x33.57` with zero variation across 100 samples. Real Firefox is needed
    to observe it — this repo already documents that Playwright's Firefox cannot
    stand in for the shipped browser.

- Basic View - 7×7 view rotation visibly hitches. Measured in real Firefox and
  Chromium, against both the dev server and the built app; present on `main` and
  on the sealed-body branch alike, so it PRE-EXISTS the sealed-body change.
  - average frame gap is ~17 ms, i.e. a full 60 fps, so this is NOT a frame-rate
    collapse — it is a single ~120 ms hitch per rotation. 3×3 tops out at ~43
    ms, which is roughly one dropped frame and reads as smooth.
  - the hitch lands MID-FLIGHT, not at the start, so pre-warming the first frame
    would not remove it.
  - dev server vs built app makes no difference (117 ms vs 114 ms at 7×7), so it
    is not HMR or unminified-module overhead.
  - the hitch has TWO parts, separated by measuring the same rotation with the
    cube element's children attached and detached, alternating so drift affects
    both equally. Firefox, worst frame gap:

    | size | full  | no content | content part | fixed part |
    | ---- | ----- | ---------- | ------------ | ---------- |
    | 3×3  | 43ms  | 19ms       | 24ms         | ~19ms      |
    | 7×7  | 133ms | 72ms       | 61ms         | ~72ms      |

    (a) a FIXED part that survives with the element completely empty. It is the
    cost of animating a `preserve-3d` element whose ancestor carries
    `perspective`; it grows with size but not with element count. (b) a CONTENT
    part that scales with element count — ~0.03 ms per element at 7×7 — i.e.
    re-rasterising a subtree that `preserve-3d` will not promote to its own
    compositing layer, so it is repainted rather than moved.

  - **Correction to an earlier note in this file:** this used to claim "the
    cause is NOT element count". That is falsified — element count accounts for
    roughly half the hitch (61 ms of 133 ms at 7×7). What is true is that
    element count is not the WHOLE cause, and that reducing elements is a capped
    lever: even dropping from 9 face elements per cubie to 6 would recover only
    ~20 ms of 133 ms, so it cannot fix this alone.
  - element count DOES scale the hitch, measured at a FIXED screen area (19421
    px at every size, so pixel area is controlled for):

    | size | elements | median gap |
    | ---- | -------- | ---------- |
    | 2×2  | 159      | 31 ms      |
    | 3×3  | 339      | 38 ms      |
    | 4×4  | 615      | 50 ms      |
    | 5×5  | 987      | 65 ms      |
    | 6×6  | 1455     | 92 ms      |
    | 7×7  | 2019     | 117 ms     |

    Fit: `gap ≈ 24 ms + 0.046 ms × elements` (predicts 39/52/69/91/117 against
    measured 38/50/65/92/117). The constant explains why the ratio does not
    scale proportionally — 12.7× the elements gives only 3.8× the gap.

  - it is NOT script work: Firefox reports ZERO long tasks (>50 ms main-thread
    blocks) during the rotation. An earlier note here said "JS cost per frame is
    ~0.1 ms", but that number came from a harness that measured only the cost of
    READING `getComputedStyle`/`offsetHeight` — it was a read-latency proxy, not
    total main-thread work, and it is not evidence about the hitch either way.
  - harness warning for whoever picks this up: the sampler itself contaminates
    the measurement. Calling `getComputedStyle` plus a forced layout read every
    tick over a 2000-element `preserve-3d` tree added ~180 ms of blocking in
    Chromium (2 long tasks vs 1 with a timestamp-only sampler). Sample with
    timestamps only, or macOS/Windows `--enable-gpu-benchmarking`-style traces,
    not DOM reads.
  - four mitigations were tried and ALL changed nothing: squaring the
    `.cubie-interior` corners, rebuilding the pre-sealed-body DOM (fewer
    elements per cubie), `will-change: transform` on the cube, and — as a
    diagnostic only — re-enabling backface culling. Note that the first two
    contradict the content finding above; they changed nothing because they were
    measured with the style-reading sampler and because the fixed part dominates
    at the sizes tried.
  - NEXT STEPS, in order of expected payoff, all now aimed at compositing rather
    than script:
    1. Try to get the cubie subtree promoted to its own compositing layer(s) —
       the single biggest lever, since both parts are compositor costs. Care
       needed: `preserve-3d` is what makes the 3D depth sorting correct, and the
       sealed body depends on depth sorting for occlusion.
    2. Test whether `perspective` on the ancestor (rather than on the cube)
       changes the fixed part; try `will-change: transform` on the ANCESTOR and
       on the wrapper, since a 3D rendering context is broken by promoting a
       descendant of it.
    3. Only then consider reducing elements per cubie — capped at ~20 ms of 133
       ms.

- Investigate whether a persistent cubie-element index is worth its cost.
  `collectCubieElements` (cubie-rendering.ts) builds an id-keyed Map at each
  call, which is what fixed the per-cubie `querySelector` cost (measured at 7×7:
  `resizeCubies` 1620ms → 12ms, `getLayerCubieElements` 322ms → 0.01ms, and
  ~653ms of hidden latency removed from every 7×7 move). Building it costs
  ~1.2ms against a ~35ms rebuild, so caching it currently buys nothing — but the
  per-call build is a deliberate trade, not a law. Worth revisiting if:
  - a lookup lands on a per-frame animation path, where 1.2ms per frame starts
    to matter (today `animateLayer` receives its elements once, then animates
    the pivot, so it does not);
  - the number of call sites grows and the invariant "rebuilt at every rebuild
    boundary" becomes hard to hold. A stale index yields a silently detached
    element, so a cache needs the invalidation to be enforced structurally (e.g.
    the index owned by the view and invalidated by the same function that
    rebuilds) rather than by convention.

  Decision to make: keep rebuilding per call, or promote the index to a piece of
  view state with an explicit invalidation boundary.

(nothing atm)
