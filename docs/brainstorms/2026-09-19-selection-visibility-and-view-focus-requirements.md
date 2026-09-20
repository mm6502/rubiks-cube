---
date: 2026-09-19
topic: selection-visibility-and-view-focus
---

# Selection Visibility and View Focus — Completion of the Intended Architecture

## Summary

Two halves of one architecture that was designed, partially built, then
abandoned mid-way. Make the selected sticker always visible by anchoring it to
the screen rather than to a fixed model face, and make view focus ownership work
by completing the `viewInteracted` pathway the architecture documents but no
code emits. Both are completion work, not new design.

---

## Problem Frame

The window-management architecture described in
`src/docs/commanding-and-eventing-system.md` specifies two mechanisms that exist
today only as stubs or half-implementations.

**Focus ownership has two competing sources of truth.**
`src/docs/commanding-and-eventing-system.md` states: _"Keyboard input should be
handled by a centralized component... This implies a focus management system
where View Manager or any other centralized component tracks which view is in
focus"_, and specifies the mechanism as an event: _"Views emit `viewInteracted`
on mouse enter/click. ViewManager maintains stack."_

Today:

- `EventName.VIEW_INTERACTED` is declared in `src/types/events.ts` and **no
  production code emits it**. Only tests reference it. It is dead machinery.
- `ViewManager` _does_ maintain a real focus stack (`focusStack`, `updateFocus`,
  `getActiveViewId` in `src/view-manager/view-manager.ts`), and it works — but
  it is driven by a click on the **panel chrome**, via
  `src/view-manager/panel-interaction-handler.ts`, never by interaction with the
  view's own content.
- Each view separately sets `container.tabIndex = 0` to be focusable
  (`src/views/basic/initialization.ts`, `src/views/circular/initialization.ts`,
  `src/views/flat/flat-view.ts`), but **only the Flat view ever calls
  `container.focus()`**. Basic and Circular set the attribute and never use it.
- A test for Basic's `attachContainerListeners` named _"should emit
  VIEW_INTERACTED and focus container on mouseenter"_ survives in the committed
  `test-results.json` from an earlier commit; the current
  `attachContainerListeners` contains only `mouseover`/`mouseout`. The focus
  behaviour was removed, and its test went with it.

The two sources can therefore disagree: the ViewManager believes a view is
active while DOM focus is somewhere else entirely.

**Why that produces the reported symptom.** `BasicTouchHandler.onPointerDown`
calls `event.preventDefault()` (to suppress native drag behaviour) without
moving focus. When focus was last placed on the cube-size radio group, an arrow
key press leaves it there. `Application.handleKeyDown` is registered as a
document-level _capture_ listener and does call `preventDefault()` — but
`preventDefault()` does not stop propagation, so the size selector's own
container-level listener still runs and calls `switchSize()`. Measured: after a
sticker pointerdown, Basic leaves `document.activeElement` on the radio `INPUT`
while Flat moves it to the view container.

**Selection visibility is anchored to the wrong thing.** Today the selection is
_model-anchored_: it holds a physical sticker via `currentSelected`, and
whole-cube view rotations (`rotateViewLeft`/`rotateViewRight`/…) change which
faces face the viewer without touching the selection. Measured: with the F-face
centre selected, one `rotateViewLeft` leaves the view showing `U/R/B` while the
selection is still the sticker on `F` — behind the cube. Two rotations put the
front face at `B` with the selection still on `F`.

`navigate()` in `src/views/basic/navigation.ts` already contains a compensating
rule ("Phase 1"): if the selected sticker is not on the current front face, an
arrow key rotates the view projection to bring that face forward. So the
intended invariant — the selection is always on the front face — is already
half-implemented; it is only the rotation commands that violate it, and only the
UI cannot show the violation until an arrow key is pressed.

**Selection markup does not survive a rebuild.** `create()` establishes the
default selection, which sets `state.currentSelected` _and_ applies the
`selected` CSS class. `ViewLifecycleManager` then calls `view.resize?.()`
immediately after `view.create(...)`, and `resize()` → `rendering.resize()` →
`updateSize()` → `cubieRendering.initializeCubies()`, which does
`existingCubies.forEach(el => el.remove())` and builds fresh elements. The
rebuilt elements never receive the `selected` class. Measured: `.selected` count
is 1 after `create()` and 0 after `create()` + `resize()`; state still reports a
selected sticker, so **assertions on `getSelectedSticker()` pass while nothing
is highlighted on screen**. A later `update()` — which calls
`restoreSelection()` — brings the class back, which is why the symptom looks
intermittent.

**One dead-state remnant belongs to the same cleanup.** `isHovered` is declared
on `BasicViewInternalData` (`src/views/basic/types.ts`), initialised to `false`
in two constructors, and read once by rendering (`src/views/basic/rendering.ts`)
— but nothing in production code ever assigns it any other value. The cutover
notes record the hover-scale behaviour as _"intentionally removed"_, leaving the
field and its read behind. It is the same class of leftover as the unemitted
`VIEW_INTERACTED`: machinery whose consumer still runs but whose producer no
longer exists.

---

## Key Decisions

- **DOM focus is the trigger; the focus stack is the consequence.** The view
  that the user actually interacts with acquires DOM focus, and that acquisition
  is what reports the interaction. The app-level `focusStack` is derived from it
  rather than maintained independently. This is what makes the two sources of
  truth incapable of disagreeing, and it matches the architecture's own
  description of views emitting `viewInteracted` on contact. It also fixes the
  arrow-key leak by construction: once focus is in the view, the size selector
  is not the focused element and its listener has no claim on the key.

- **The selection is screen-anchored, not model-anchored.** When the view
  rotates, the selection moves to whatever sticker now occupies the same
  _visual_ cell on the newly-front face — it does not follow the physical
  sticker to the back of the cube. Measured today: a rotation leaves the
  selection on the original physical sticker, which can be entirely out of
  sight.

- **"Same visual position" means visual, not index-preserving.** A face position
  index is not the same thing as a screen cell: face bases orient differently
  (on `F` the column maps to screen X, on `R` it maps inverted), so the same
  index lands on opposite sides for two different faces. Mirroring the visual
  position therefore requires a mapping between faces rather than a copy of the
  index. The visible consequence: selecting the top-left of `F` and rotating so
  `R` moves to the front keeps the selection **top-left** (not top-right).

- **Completing the architecture, not inventing a new one.** Where a mechanism is
  documented and partially present (`viewInteracted`, `focusStack`, the
  front-face invariant in `navigate()`, `container.tabIndex`), this work
  finishes it. It does not introduce a parallel system, and it does not remove
  the documented one in favour of a simpler ad-hoc one.

- **Rebuild must re-derive markup from state, not re-apply it once.** The
  underlying fault is that derived DOM state is written once at creation and
  lost whenever the DOM is rebuilt. The fix belongs at the rebuild boundary so
  that every rebuild path is covered, rather than at each call site that happens
  to build cubies.

- **Dead machinery is resolved, not left hanging.** `VIEW_INTERACTED` either
  becomes the live bridge it was designed to be, or is removed. `isHovered` is
  either re-driven or deleted. Leaving declared-but-unused events and state in
  place is what made the missing focus path invisible for so long.

---

## Requirements

The three groups are one change set but carry different risks and different
verification, so they are stated separately.

**Selection visibility**

- R1. The selected sticker is always on a face that is currently visible to the
  user. There is no reachable state in which the selection exists but is drawn
  on a face the user cannot see.
- R2. When the view rotates (whole-cube view rotation commands), the selection
  moves to the sticker occupying the same visual cell on the newly-front face,
  rather than following the physical sticker.
- R3. When the selection moves under R2, it lands on a sticker that is actually
  present at that visual cell for the active cube size — including for edge and
  corner cells, and for sizes where the 2×2 central block makes "the centre"
  ambiguous.
- R4. The visual-cell mapping is defined for every pair of faces the user can
  rotate between, and is symmetric with respect to the direction of rotation
  (rotating back returns the selection to where it started).
- R5. The invariant holds at every entry point that changes orientation, not
  only at arrow-key navigation: view rotation commands, cube-size change, and
  restoring a saved view state.
- R6. The selection's on-screen markup survives any DOM rebuild, so what the
  user sees always agrees with what the app reports as selected.

**View focus ownership**

- R7. Interacting with a view's content gives that view DOM focus. This applies
  equally to Basic, Circular and Flat; no view is a special case.
- R8. The app-level notion of "active view" is derived from where focus actually
  is, so the two cannot disagree.
- R9. When a view holds focus, keyboard events that the view handles cannot also
  be acted on by an unrelated focused control elsewhere in the app.
- R10. When a view does _not_ hold focus, keys it would otherwise consume are
  not silently swallowed on its behalf — the control the user is actually
  focused on keeps working.
- R11. Focus acquisition does not cause the page or any scroll container to
  jump; acquiring focus must not move the viewport.
- R12. The reported evidence a view gives for being interactive is the
  documented event, so the mechanism is inspectable rather than implicit.

**Machine hygiene**

- R13. No member declared in the event catalogue or on a view state bag remains
  inert in production code — i.e. declared and type-checked, but never given a
  meaningful value or never emitted. Each such member is either wired up to the
  behaviour it was declared for, or removed along with the reads that depend on
  it.
- R14. The hover-scale affordance on the Basic view is removed, not restored.
  Its state field, its angle constant, the rendering branch that consumed them,
  and the test asserting the behaviour are all gone.

---

## Key Flows

- F1. Interacting with a view claims focus and ownership
  - **Trigger:** The user clicks, taps, or otherwise contacts a view's content.
  - **Actors:** End user; the contacted view; ViewManager.
  - **Steps:** The view acquires DOM focus; focus acquisition reports the
    interaction; ViewManager records the view as active and updates which
    commands are live.
  - **Outcome:** Keyboard input now belongs to that view, and the visible focus
    indicator agrees.
  - **Covered by:** R7, R8, R12

- F2. Rotating the view keeps the selection visible
  - **Trigger:** The user invokes a whole-cube view rotation while a sticker is
    selected.
  - **Actors:** End user; the view.
  - **Steps:** The view rotates; the selection is re-resolved to the same visual
    cell on the newly-front face; the selection markup is re-applied from state.
  - **Outcome:** The selection is visible, in the position the user was looking
    at, without the user pressing anything else.
  - **Covered by:** R1, R2, R3, R4

- F3. Arrow keys reach the view, not the size selector
  - **Trigger:** The user has previously focused the cube-size control, then
    contacts the view, then presses an arrow key.
  - **Actors:** End user; the view; the size control.
  - **Steps:** Contacting the view moved focus into it; the arrow key is
    dispatched to the focused view; the size control does not receive an
    actionable key.
  - **Outcome:** The arrow key moves the selection; the cube size is unchanged.
  - **Covered by:** R7, R9, R10

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given the F-face centre selected and the view showing
  `U/F/R`, when the user rotates the view left twice so the front face is `B`,
  then the selection is on a face among the visible ones — not on `F`.
- AE2. **Covers R3.** Given the top-left corner of `F` selected, when the user
  rotates the view so `R` becomes front, then the selection is in the top-left
  visual cell, not the top-right.
- AE3. **Covers R4.** Given any non-centre cell selected on the front face, when
  the user rotates the view left and then right again, then the selection is
  back in the cell it started in.
- AE4. **Covers R3.** Given a non-3×3 cube, when the default selection is
  established and the user rotates the view, then the selection lands on a
  sticker that exists at the target cell for that size.
- AE5. **Covers R5.** Given a view whose saved state records an orientation in
  which the previous selection would be hidden, when the view is restored, then
  the selection is resolved to a visible cell rather than restored onto a hidden
  face.
- AE6. **Covers R6.** Given a newly created view and the real startup sequence
  (creation followed by the app's own resize call), when the user looks at the
  cube, then exactly one sticker is visibly marked as selected and it is the one
  the app reports.
- AE7. **Covers R6.** Given a view with a selection, when the cube DOM is
  rebuilt for any reason (resize, model update), then the selected markup is
  present afterwards without the user re-selecting.
- AE8. **Covers R7, R9.** Given focus was last on the cube-size control, when
  the user contacts the view and then presses an arrow key, then the selection
  moves and the cube size does not change.
- AE9. **Covers R10.** Given a view that does not hold focus, when the user
  presses a key the view would otherwise consume while focused on another
  control, then that other control still responds to it.
- AE10. **Covers R11.** Given the page is scrolled to a position, when the user
  contacts a view, then the scroll position is unchanged.
- AE11. **Covers R7** (parity). Given any of the three views, when the user
  contacts its content, then all three behave the same way with respect to focus
  — no view is exempt.
- AE12. **Covers R13.** Given the event catalogue and the view state bags
  (`BasicViewInternalData` and its siblings), when each declared member is
  traced to a production emitter or writer, then every member is either live or
  gone — in particular `VIEW_INTERACTED` is emitted by production code or
  removed.
- AE13. **Covers R14.** Given the Basic view's rendering path, when the cube
  element's transform is produced, then it contains no hover-driven scale term
  and no angle constant exists for one; and no state bag field remains whose
  only purpose was that affordance.

---

## Scope Boundaries

- **Not a rework of sticker navigation.** `navigate()`'s existing rule of
  rotating the view to bring a hidden selection forward is complementary to R1
  and stays; it is a different mechanism (key-driven) from the rotation-driven
  re-anchoring here. Whether the two should later collapse into one rule is not
  decided by this work.
- **Not a change to what selection _means_ for commands.** M/E/S enablement
  derives the layer from the selected sticker's face position. Re-anchoring the
  selection on rotation may therefore change which slice is available — that is
  an accepted consequence, not a target, and the slice rules themselves are out
  of scope.
- **Not a general focus-management framework.** Only the views' interaction
  pathway and the derivation of the active view are in scope. Tab ordering,
  focus trapping, roving tabindex, screen-reader announcements and cross-panel
  focus-visible styling are not addressed.
- **Not a visual redesign of the focus indicator.** The app already has a focus
  presentation for panels; this work does not restyle it.
- **The hover-scale affordance is deleted, not restored.** The cutover removed
  the behaviour but left `isHovered` declared, initialised to `false` in two
  places, read once by rendering, plus a `HOVER` angle constant and a test
  asserting `scale(1.05)`. All of it is removed (R14). This is deliberately
  _not_ an invitation to re-implement hover-scale: the affordance was dropped on
  purpose, so restoring it would be a separate product decision.
- **Hover highlighting is untouched.** The `.sticker:hover` styling and the
  `updateHighlight` / hover-cursor paths are live behaviour and are unrelated to
  the removed cube-level scale. Only the dead cube-transform scaling goes.
- **Not the removal of `preventDefault()` from the touch handlers.** Suppressing
  native drag behaviour is intentional. The fix is to make focus follow contact,
  not to stop suppressing defaults.
- **Deferred for later:** collapsing the size control's own arrow-key handling
  into the shared command system, so that it participates in the same ownership
  rules as everything else rather than being a special case.

---

## Dependencies / Assumptions

- **Verified — the front face is always one of the visible faces.** R1's
  invariant is stated in terms of visibility, so it depends on the front face
  never being hidden. Measured across the default, tilted, pitched, and
  rotated-plus-either orientations: in every case `viewFrontFace()` is among the
  faces `getVisibleFacesWithPositions()` reports as visible. The pitched branch
  reassigns which _slot_ each face occupies (the front face moves to the slot
  the tilted state calls `top-left`, and that slot is visible in the pitched
  layout), so the reassignment changes presentation order, not visibility.
  Consequence: the visual-cell mapping in R2–R4 does **not** need a separate
  rule per orientation, and the selection invariant holds in the cosmetic states
  too.
- **Assumption — the app's `focusStack` is the only supported notion of active
  view.** No other component tracks a competing "active view" concept. Verified
  for the ViewManager and command rendering; unverified for any diagnostic or
  persistence path that might read a different signal.
- **Dependency — the documented architecture is the authority for the focus
  mechanism.** `src/docs/commanding-and-eventing-system.md` specifies the event
  and the stack; this work aligns code to that document. If the document itself
  is stale, it is corrected as part of the work rather than silently diverged
  from.
- **Dependency — R6's fix sits on the rebuild boundary shared with the resize
  path**, which is also where cube-size and layout-mode changes route. A change
  there has wider blast radius than the other requirements.

---

## Outstanding Questions

**Resolve Before Planning**

(none — the visual-cell mapping question was resolved during the brainstorm; see
Dependencies / Assumptions)

**Deferred to Planning**

- For an even-sized cube's 2×2 central block, which cell is "the same visual
  cell" when rotating — and does the answer stay consistent with the existing
  even-size centre convention, or does it introduce a second convention that
  needs reconciling?
- Does the size selector keep its own arrow-key handling, or defer to the shared
  ownership rules? The boundary above defers it, but planning may find the
  deferred state incoherent once focus ownership is centralised.

---

## Success Criteria

- A user can rotate the view in any direction, at any cube size, from any
  supported entry point, and the selection remains visibly on the front face
  throughout — with no manual corrective step.
- Contacting a view is sufficient to take keyboard ownership of it, and no
  ordering of interactions with the size control can cause an arrow key to
  change cube size while the view has focus.
- The startup sequence produces a visibly selected sticker on the first paint,
  without relying on a later unrelated update to happen.
- Assertions about selection in tests observe what the user sees, so a
  state-only regression of the kind that hid this defect cannot pass.
- The event catalogue and the view state bags contain no declared-but-unused
  members.

---

## Sources / Research

- `src/docs/commanding-and-eventing-system.md` — the authoritative description
  of the intended focus mechanism (`viewInteracted` emitted by views on mouse
  enter/click, stack maintained by ViewManager) and of the event catalogue. The
  document this work aligns to.
- `src/docs/user-interface-design.md` — "Per-View Sticker Selection": confirms
  selection is per-view state and states that selected stickers are "clearly
  highlighted", which the startup sequence currently violates.
- `src/types/events.ts` — `VIEW_INTERACTED` declared here and emitted nowhere.
- `src/view-manager/view-manager.ts` — `focusStack`, `updateFocus`,
  `getActiveViewId`; `handleKeyDown`'s delegation order to the active view, then
  view commands, then controller commands.
- `src/view-manager/panel-interaction-handler.ts` — the current, panel-chrome
  driven route into `updateFocus`.
- `src/views/basic/initialization.ts` — `attachContainerListeners` (mouseover
  and mouseout only) and the `container.tabIndex = 0` that is never exercised.
- `src/views/flat/flat-view.ts` — the one view that does call
  `container.focus()`; the reference for the behaviour the others lack.
- `src/views/basic/touch-handler.ts` — the `preventDefault()` on pointer-down
  that suppresses native drag and also suppresses the focus move.
- `src/application.ts` — the document-level capture key handling, and the
  cube-size selector's own container-level keydown listener.
- `src/views/basic/cubie-rendering.ts` and `src/views/basic/rendering.ts` — the
  two call sites that rebuild the cube DOM and the removal of the old elements.
- `src/views/basic/selection.ts` — `updateSelected`, which writes both state and
  markup, and `updateHighlight`, which writes markup only.
- `src/views/basic/navigation.ts` — the existing "selection not on the front
  face" rule, and `viewFrontFace` / `rotateViewToFace`.
- `src/cube/utils/sticker-position.ts` — `facePositionTo3D`, whose per-face
  orientation is why a position index is not a screen cell.
- `docs/plans/2026-09-05-002-refactor-basic2-cutover-plan.md` and
  `docs/brainstorms/2026-09-05-basic2-cutover-requirements.md` — record the
  hover-scale removal that left `isHovered` behind. Both documents state the
  affordance was removed _intentionally_, which is why R14 deletes the leftover
  rather than restoring the behaviour.
