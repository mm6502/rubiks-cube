---
date: 2026-09-05
topic: basic2-cutover
---

# Basic 2 Cutover — Replace Basic View (Requirements)

## Summary

Make Basic 2 the single, default 3D cube view: it takes over the Basic identity
(folder, viewType IDs `basic-front`/`basic-back`, titles), the old static
face-based Basic-only code is deleted, and the two near-duplicate view classes
are deduplicated into one Basic folder. Customization data (view-panel layout +
view orientation) is inherited automatically; stale `view-panel-basic-2-*` keys
are cleared on the next opportunity. Cube state is untouched (it is size-scoped,
not view-scoped).

> **Execution decision (2026-09-05):** The cutover is done "now and hard" (no
> coexistence period), but as a **separate branch off a fresh main** — not
> inside the multi-size branch. Multi-size ships first; the cutover lands
> immediately after as its own reviewable, revertable change.

## Problem Frame

The app currently ships two 3D views: the original Basic view (static face-grid
DOM, no move animations) and Basic 2 (per-cubie DOM with Web Animations API move
animations). Basic 2 was built as a clone to enable animations and has since
reached production readiness, but it is NOT yet at full parity with Basic: the
whole-cube face-label refresh is a real gap, not a dead path. Basic 2 does
receive whole-cube `x`/`y`/`z` model moves — the global `x`/`y`/`z` keys in
`src/cube-controller.commands.ts` and the `alignCubeToView` command
(`src/views/basic/navigation.ts`, present in Basic 2's command set) emit
`MOVE_REQUESTED` with whole-cube notation, which the view manager fans out to
every visible view including Basic 2. The old Basic's `updateSelective`
refreshes face labels after `x`/`y`/`z` (`basic-view.ts` `/^[xyz]['2]?$/`
branch); Basic 2's `handleMoveExecuted` never does, so after a whole-cube move
the surviving engine shows stale corner-face labels. This fix must be ported,
not deleted. (The other two suspected gaps — hover and halo ring — are
intentional removal / product-wide direction, not functional gaps.) Basic 2 also
fixes the multi-size rendering that Basic cannot: Basic's face grid is hardcoded
`repeat(3, 1fr)` (`src/views/basic/basic-view.module.css`), while Basic 2 is
per-cubie and size-agnostic.

Keeping both views is pure carrying cost: `basic-view.ts` and `basic-2-view.ts`
are near-identical clones (~28 identical `c8 ignore` guards, same
keyboard/rotation/state logic), there are two renderers, two CSS modules, and
two overlapping test surfaces. The shared interaction modules already live in
`src/views/basic/` and Basic 2 imports them, so the "replacement" is a
controlled cutover (Basic 2 absorbs Basic's identity), not a from-scratch
rebuild and not a folder delete of `src/views/basic/`.

## Key Decisions

- **Cutover, not coexistence.** Basic 2 becomes the one Basic view. Keeping both
  as selectable alternatives indefinitely is rejected — it is a duplicated
  maintenance burden with no user value once Basic 2 is the default.
- **Basic 2 absorbs the Basic identity.** The surviving code takes over folder
  `src/views/basic/` and viewType IDs `basic-front`/`basic-back`. Renaming Basic
  2's IDs (`basic-2-front`/`basic-2-back` → `basic-front`/ `basic-back`) means
  saved Basic layout state is inherited with zero migration code, because view
  state format is identical and viewType-agnostic.
- **Stale-data cleanup, not migration prompts.** Customization data
  (`view-panel-basic-2-*`, legacy visibility prefs) is cleared
  opportunistically. No keep/discard/export prompt, no migration modal, no
  export path. Cube state (`rubikCube_autoSave`, `rubikCube_state_size_N`,
  `rubikCube_lastSize`) is size-scoped and unaffected by the cutover.
- **Functional coverage during transition, full coverage on the end state.** The
  intermediate refactor state is not chased to the 70 % coverage gate — that
  would be wasted work on code that is being deduplicated. Tests are carried
  through the refactor and the end state (one Basic folder) must pass the
  quality gate. Coverage is measured on the result, not the path.
- **"Basic 1/.Front" command groups are unrelated.**
  `cube-controller.commands.ts` groups face moves by controller topology ("Basic
  1/.Front", "Basic 2/.Back" = the 3D face layout), not by view. These are NOT
  renamed by this cutover.

## Requirements

**View consolidation**

- R1. The app offers exactly one 3D cube view family with viewType IDs
  `basic-front` and `basic-back`, backed by the Basic 2 engine (per-cubie DOM,
  move animations).
- R1b. The surviving engine refreshes face labels after whole-cube `x`/`y`/`z`
  `MOVE_EXECUTED` events, matching the deleted Basic `updateSelective` behavior.
  The refresh is hooked at the top of `handleMoveExecuted` on the move notation
  so it fires on all whole-cube outcome paths: the animated path, the
  reduced-motion/no-animation fallback, and the no-`movedCubies` full-update
  path. The regression test for this is net-new (it mirrors the deleted
  `/^[xyz]['2]?$/` branch in `basic-view.ts`; no surviving Basic 2 test covers
  whole-cube label refresh today).
- R2. The old static face-based Basic rendering path is removed: its
  `basic-view.ts`, `rendering.ts`, `initialization.ts`, `basic-view.module.css`,
  and their Basic-only tests are deleted. No runtime code path may still
  reference the removed renderer.
- R3. Shared interaction modules (`commands`, `navigation`, `selection`,
  `touch-handler`, `interaction-adapter`, `linked-rotations`, `ghost-stickers`)
  are deduplicated to a single home inside the surviving `src/views/basic/`
  folder, with no `basic-2` / old-vs-new branch remaining in them.
- R4. The duplicated type declarations (`BasicVariant`, `BasicViewState`,
  `BasicViewInternalData`) and duplicated `BASIC_VIEW_ANGLES` constants are
  unified into one source of truth.
- R5. The hover-scale interaction from the old Basic view (mouseenter sets
  `isHovered`, rendering applies a 1.05 scale) is intentionally **removed**
  during consolidation — the surviving engine reads `state.isHovered` but
  nothing sets it, so it is dead there. Its removal is a deliberate product
  decision (alongside the product-wide halo-ring removal), not an unacknowledged
  parity loss; confirm no test asserts the removed behavior.

**Identity and defaults**

- R6. The surviving view is titled and registered as the "Basic" view (Basic
  (Front) / Basic (Back)), replacing the "Basic 2" labels.
- R7. `basic-front` and `basic-back` are default-checked in the view picker (as
  the previous Basic views were), so Basic is the default 3D view on first
  launch and for existing users whose visibility pref references
  `basic-front`/`basic-back`. **Visibility reconciliation:** when a returning
  user's saved `rubiksCubeVisibleViews` shows `basic-2-front`/`basic-2-back`
  enabled (the old opt-in family), the surviving `basic-front`/`basic-back`
  variant is auto-checked so no post-cutover launch leaves the user without a 3D
  Basic view — including adopters who deliberately unchecked the static
  `basic-front`/`basic-back` to declutter. If a returning user has explicitly
  hidden both `basic-front` and `basic-back` (both `false`) with no `basic-2-*`
  pref, honor the hide.
- R8. The view registry order and any panel/geometry defaults follow the
  surviving `basic-*` viewTypes; the `basic-2-*` variants no longer exist in the
  registry.

**Data migration and cleanup**

- R9. Users who previously used the Basic view keep their Basic panel layout and
  view orientation unchanged after the cutover (Basic 2 engine inherits the
  saved `view-panel-basic-front`/`view-panel-basic-back` state, whose format the
  two engines share). No legacy Euler-shape migration is required: Basic never
  wrote `xRotation`/`yRotation`/`zRotation` orientation values to storage (its
  orientation is pure vector-swaps), so the surviving `setState` migration-reset
  branch is not exercised by real saved state.
- R10. Users who previously opted into Basic 2 lose that view's panel layout and
  orientation (stored under `view-panel-basic-2-*`) when they launch after the
  cutover. This is accepted as a minor, defensible loss: Basic 2 was an opt-in,
  default-unchecked view, and only its customization is affected — never cube
  state. They boot into the surviving Basic view at the registry default. No
  layout-inheritance fallback is provided.
- R11. Stale `view-panel-basic-2-*` keys **and the `basic-2-front`/
  `basic-2-back` entries inside the `rubiksCubeVisibleViews` visibility map**
  are cleared from `localStorage`. **Ordering:** the visibility reconciliation
  in R7 reads the `basic-2-*` `rubiksCubeVisibleViews` entries on the first
  post-cutover launch, so the cleanup runs only after that first view-boot
  reconciliation pass (e.g. on the second launch, or after view creation on the
  first) — never before it. The cleanup must not use the full storage-clear
  command as its vehicle (that clears live `basic-*` keys too); it is
  prefix-scoped to the removed `basic-2-*` entries only.

**Testing and quality**

- R12. During the cutover, tests are carried through the refactor; the
  intermediate state is not forced to meet the full coverage gate.
- R13. The end state (one Basic folder) meets the project quality gate:
  `npm run all` passes (lint → format → type-check → test:coverage → build), and
  the consolidated Basic module meets the coverage thresholds.
- R14. Move animations, per-cubie rendering, layer stability, corner
  orientation, and ghost-sticker integration retain their existing functional
  coverage after the rename (the Basic 2 test files move with the code).

## Key Flows

### Launch after cutover (existing user who used Basic)

1. App boots, reads `rubiksCubeVisibleViews` → `basic-front: true` (or the
   default-checked list kicks in).
2. View manager creates the surviving Basic view under ID `basic-front`.
3. `loadPanelState('basic-front')` reads the pre-existing saved layout and view
   orientation.
4. `view.setState(...)` applies orientation — format unchanged, so Basic 2
   engine renders correctly with the user's previous Basic rotation.
5. Result: the user sees an animated Basic view exactly where their static Basic
   view was, same layout and orientation. Cube state untouched.

### One-time stale-key cleanup

1. After the first post-cutover launch has completed its view-boot
   reconciliation (R7 reads the `basic-2-*` `rubiksCubeVisibleViews` entries
   during that launch), a one-time cleanup removes the removed-family data:
   `view-panel-basic-2-front` / `view-panel-basic-2-back` panel keys and the
   `basic-2-front` / `basic-2-back` entries in `rubiksCubeVisibleViews`. This is
   prefix-scoped to `basic-2-*`; it must NOT reuse the full storage-clear
   command, which also removes live `basic-*` keys.
2. No live key is touched; no prompt is shown.

## Acceptance Examples

- AE1 (R1, R7): A fresh launch shows the animated Basic (Front) view checked and
  open by default; no "Basic 2" entry exists in the view picker.
- AE2 (R2, R3): `grep -r "basic-2" src/` on the **end state** returns no runtime
  references to a second Basic view family and no old-vs-new branch in the
  surviving shared modules. The only permitted remaining `basic-2` matches are
  (a) unrelated controller command groups and (b) "basic 2D" geometry comments.
  Category (c) — historical dual-path comments in
  `src/views/basic/touch-handler.ts`, family branching in
  `linked-rotations.ts`/`commands.ts`, and the non-moving test files that
  reference the retired family (`src/view-manager/view-registry.test.ts`, the
  cross-family case in `src/views/basic/basic-view.commands.test.ts`) — is
  **transient** (present only mid-change) and is resolved by R3 in the same
  change, so it does not appear in the end-state grep.
- AE3 (R9): With saved `view-panel-basic-front` containing a custom panel
  position and a rotated view orientation (the shared modern vector shape),
  launching after the cutover restores that exact panel position and
  orientation, now rendered with move animations.
- AE4 (R10, R11): A user who had only `view-panel-basic-2-front` saved (no
  `view-panel-basic-front` key) boots with the Basic view at the registry
  default — the Basic 2 panel layout is not inherited (accepted loss). The stale
  `basic-2-*` panel key and `rubiksCubeVisibleViews` entry are removed by the
  one-time cleanup after reconciliation, and no live `basic-*` key is affected.
  A user who enabled `basic-2-front` while hiding `basic-front` still boots with
  the animated Basic (Front) view visible (R7 reconciliation).
- AE5 (R13): `npm run all` passes on the final consolidated state, including the
  coverage gate, with no Basic-only test files left behind that test deleted
  code.
- AE6 (R1b): After a whole-cube `x`/`y`/`z` move on the surviving Basic view,
  corner-face labels refresh — on the animated path, the
  reduced-motion/no-animation path, and the no-`movedCubies` full-update path —
  via a net-new regression test in the consolidated `basic/` test surface.

## Scope Boundaries

**Deferred for later**

- Any migration prompt, keep/discard/export modal, or per-user data-migration
  UI. Accepted as out of scope because the only data affected is opt-in Basic 2
  panel customization for users who tried the default-unchecked Basic 2 view;
  cube state is never touched and Basic users' layouts are preserved.
- Deleting the shared interaction modules' history (they move/consolidate within
  `src/views/basic/` but their code predates this cutover).
- Removing the now-redundant `basic-2` references in historical docs and plans
  (kept as history).

**Outside this cutover's identity**

- Renaming the controller command groups "Basic 1/.Front", "Basic 2/.Back" —
  these describe the controller's 3D face layout, not the Basic view. NOTE:
  these strings render as visible group headers in the move palette, so a
  user-visible "Basic 2" label may persist after the cutover; this is an
  accepted consequence of the decision not to rename them (a relabel is a
  separate cosmetic change).
- Renaming "basic 2D point" comments in `src/interaction/types.ts` and
  `src/types/geometry.ts` — false positives ("basic" 2D, not "Basic 2").
- Changing cube-state persistence, size slots, or the Circular/Flat/Moves views.
- Reaching full coverage on the intermediate refactor state.

## Dependencies / Assumptions

- The shared interaction modules (`touch-handler`, `navigation`, `selection`,
  `ghost-stickers`, `commands`, `interaction-adapter`, `linked-rotations`)
  already live in `src/views/basic/` and are imported by Basic 2 — verified, so
  the cutover is a move of Basic 2 files into `basic/`, not a folder delete of
  `basic/`.
- View state format (`getState`/`setState`: viewRight/Up/Forward, isTilted,
  isPitched, faceDirectMode, linked, ghostOpacityIndex) is identical between the
  two views and viewType-agnostic — verified, which is why inheriting `basic-*`
  keys needs no migration code.
- Cube state keys are size-scoped (`rubikCube_autoSave`,
  `rubikCube_state_size_N`, `rubikCube_lastSize`), independent of view —
  verified, so the cutover does not touch user cube progress.
- The Basic 2 engine does receive whole-cube `x`/`y`/`z` model moves (via the
  global `x`/`y`/`z` keys and `alignCubeToView`), so the face-label refresh
  after whole-cube moves IS a real parity gap that must be ported (see R1b), not
  a dead path. The other two previously-suspected gaps — hover scale and halo
  ring — are intentional removal / product-wide direction (see R5).
- Basic 2 is the current weakest-covered module (≈73 % statements / 60 %
  branches per `code-quality-evaluation.md`); the consolidated Basic module must
  meet the coverage gate on the end state. Note the coverage gate is global
  (project-wide thresholds in `vitest.config.ts`), not per-module.

## Sources / Research

- View factory + variants: `src/views/basic/index.ts`,
  `src/views/basic-2/index.ts`
- Registry order + default-checked list: `src/view-manager/view-registry.ts`,
  `src/view-manager/view-lifecycle-manager.ts`
- Panel persistence: `src/view-manager/panel-positioning.ts`
  (`view-panel-<viewType>`), `src/view-manager/view-lifecycle-manager.ts`
  (`rubiksCubeVisibleViews`)
- Cube-state persistence: `src/cube/core/state-persistence.ts`
  (`rubikCube_autoSave`, `rubikCube_state_size_N`, `rubikCube_lastSize`)
- Shared-module imports into Basic 2: `src/views/basic-2/basic-2-view.ts`,
  `src/views/basic-2/initialization.ts`
- Type duplication: `src/views/basic/types.ts` vs local types in
  `src/views/basic-2/basic-2-view.ts`
- Known Basic-only multi-size bug: `src/views/basic/basic-view.module.css`
  (`repeat(3, 1fr)`), Flat's dynamic fix at `src/views/flat/rendering.ts`
- Family-scoped linked rotations: `src/views/basic/linked-rotations.ts`,
  `src/views/basic/commands.ts`
- Coverage baseline: `code-quality-evaluation.md` (last evaluated 2026-08-15)

## Deferred / Open Questions

### From 2026-09-05 review

- **Evaluate bounded deprecation window vs hard delete** — Key Decisions (P2,
  product-lens, confidence 50)

  For every current user, the static Basic view is the default 3D experience
  they were launched into; Basic 2 has never been anyone's default
  (default-unchecked), so the entire installed base is force-migrated in one
  release with no in-app opt-out, and external users cannot downgrade — making
  "revertable branch" a developer action, not user recourse. The doc rejects
  coexistence only in its "indefinitely" form, a false dichotomy that never
  evaluates a bounded deprecation (Basic 2 becomes default while static Basic
  stays selectable for one release). The cited "do nothing" cost is also
  overstated: the `repeat(3, 1fr)` grid only manifests at sizes the current
  3×3-defaulted base does not use.

  <!-- dedup-key: section="key decisions" title="evaluate bounded deprecation window vs hard delete" evidence="Keeping both as selectable alternatives indefinitely is rejected - it is a duplicated maintenance burden with no user value once Basic 2 is the default." -->

- **Decide whether per-file coverage thresholds are wanted for the surviving
  engine** — Testing and quality (R13) (P2, adversarial, confidence 75)

  The vitest thresholds in `vitest.config.ts` are global (70 across all included
  files), not per-module, and the project already passes the gate today while
  basic-2 sits at 60% branches — so R13's promise that "the consolidated Basic
  module meets the coverage thresholds" is satisfied trivially even if the
  surviving engine stays at 60% branches, making the end-state gate a false
  safety net for the exact weakness R12's relaxation defers. If the intent is to
  keep the consolidated Basic engine healthy, no configured mechanism enforces
  it; only per-file/folder thresholds keyed to the surviving `basic/*` engine
  files would.

  <!-- dedup-key: section="testing and quality (r13)" title="decide whether per-file coverage thresholds are wanted for the surviving engine" evidence="The end state (one Basic folder) meets the project quality gate: npm run all passes (lint, format, type-check, test:coverage, build), and the consolidated Basic module meets the coverage thresholds." -->

- **"Basic 2/.Back" group headers stay user-visible after the cutover: accept or
  relabel?** — Key Decisions / Scope Boundaries (P2, design-lens, confidence 75)

  The global move palette renders `command-group-header` text directly from each
  command's group string, so users currently see on-screen headers "Basic
  2/.Back", "Basic 2/.Down", etc. The doc asserts these "Basic 2" controller
  groups are unrelated to the view cutover and will NOT be renamed — meaning
  after the cutover ships, the app still presents a visible "Basic 2" label to
  users at the same time the product claims to have replaced Basic 2. The fix is
  to acknowledge the visible group headers and either accept them as intentional
  or schedule their relabel.

  <!-- dedup-key: section="key decisions / scope boundaries" title="basic 2/.back group headers stay user-visible after the cutover: accept or relabel?" evidence="Basic 1/.Front command groups are unrelated. cube-controller.commands.ts groups face moves by controller topology (Basic 1/.Front, Basic 2/.Back = the 3D face layout), not by view. These are NOT renamed by this cutover." -->
