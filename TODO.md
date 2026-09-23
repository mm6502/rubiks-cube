# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

- Basic View - after fixing face culling in Firefox, now there are colors
  leaking from adjacent faces through the gaps among cubies. See
  [docs/visuals/firefox-color-leak.png](./docs/visuals/firefox-color-leak.png)

- Basic View - Whole cube rotations does not distinguish between +180 and -180
  degree turns, resulting in wrong animation for one of them.

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
