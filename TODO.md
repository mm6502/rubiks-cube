# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

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
