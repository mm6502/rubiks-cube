# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

- [x] Basic View - after fixing face culling in Firefox, now there are colors
      leaking from adjacent faces through the gaps among cubies. See
      [docs/visuals/firefox-color-leak.png](./docs/visuals/firefox-color-leak.png)

- [ ] Basic View - Whole-cube rotation animation loses the ±180° sign (the
      orientation matrix cannot distinguish them), so one direction animates the
      wrong way. Carry the signed angle from the gesture into the animation
      instead of re-deriving it from the matrix. See
      [docs/brainstorms/2026-09-24-view-gesture-inference-fixes-requirements.md](./docs/brainstorms/2026-09-24-view-gesture-inference-fixes-requirements.md).

- [ ] Basic View - Hit-testing resolves a drag's sticker from the mid-flight DOM
      (face/position lags until the post-move rebuild), so a move started before
      the animation settles targets the wrong layer (D then expect L' but get
      B'). Resolve the hit from the model's sticker identity, not the flying
      element.

- [ ] Flat View - Does not display move inference cross / line during a drag
      (Basic view does). Reuse the Basic view's cross/line indicator.

- [ ] Flat View - Whole-cube legend drag only ever emits quarter turns. Promote
      a far drag to the '2' variant (x2/y2/z2) using the existing far-drag
      threshold.

- Investigate possibility of simplifying move table such as key will be the
  primary/canonical "identifier" of the move and alternative notations will be
  placed in an alternative notation list in the value object (move descriptor?).

- Basic View - In Firefox, resizing or MOVING a view panel leaves dark streaks
  across a face that persist once they appear. Firefox-only. **UNRESOLVED** —
  investigated in
  [docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md](./docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md)

- Basic View - 7×7 view rotation hitches once, ~120 ms, mid-flight. Frame rate
  stays at 60 fps, so it is one stall, not a collapse. Firefox and Chromium.
  **UNRESOLVED** — recorded in
  [docs/solutions/performance-issues/basic-view-rotation-hitch-large-cubes.md](./docs/solutions/performance-issues/basic-view-rotation-hitch-large-cubes.md).
  ⚠ That doc corrects six quoted figures: the element-count attribution, the
  fit, and the "~17 ms average frame gap" (almost certainly a median). Next:
  re-measure 5×5 (the fit outlier), re-count the elements column, then try
  promoting the cubie subtree to its own compositing layer.

- Decide whether the cubie-element index stays rebuilt per call or moves to view
  state with an explicit invalidation boundary. No user-visible symptom; ~1.2 ms
  per call against a ~35 ms rebuild. Reasoning and the two flip triggers in
  [docs/solutions/design-patterns/cubie-element-index-caching-trade-off.md](./docs/solutions/design-patterns/cubie-element-index-caching-trade-off.md).
  ⚠ Decide only after re-measuring `resizeCubies` with phases itemised — 48% of
  the recorded 1620 ms → 12 ms win is currently unattributed.

(nothing atm)
