---
title:
  'fix: Selective ghost sticker hiding during move animations in Circular view'
type: fix
status: active
date: 2026-05-02
---

# fix: Selective ghost sticker hiding during move animations in Circular view

## Overview

During a move animation in the Circular view, all ghost hint stickers are
currently blanked out (`opacity: 0`) before the animation starts and restored
afterward. This is broader than necessary: only ghost stickers whose **source
sticker is physically moved by that animation** need to be hidden. Ghost
stickers for unaffected faces should stay visible throughout.

## Problem Frame

The `updateSelective` function in `src/views/circular/rendering.ts` calls
`setGhostOpacity(state, 0)` unconditionally before every animation. A user
watching, e.g., an `R` move sees the hints for the Left, Up, Down, Front, and
Back faces all disappear even though none of those stickers move. The fix is to
compute which ghost elements are "owned" by the move and suppress only those.

## Requirements Trace

- R1. Ghost stickers whose `data-ghost-source` points to a sticker that is part
  of `movedCubies.before` are hidden for the duration of their move animation.
- R2. Ghost stickers not in the affected set remain at their current opacity
  throughout the animation.
- R3. When the last pending animation finishes, all ghost stickers are restored
  to the target opacity via the existing `setGhostOpacity` call — no change
  needed there.
- R4. When `state.showGhosts` is `false` the selective hide is a no-op (the
  wrapper is already `display:none`; no opacity changes are needed).

## Scope Boundaries

- Circular view only — no changes to Flat or Basic view ghost logic.
- The restore path (`setGhostOpacity(state, targetOpacity)` inside
  `finishAnimation`) is unchanged; it always restores all ghosts when all
  pending animations complete.
- No changes to the `animateGhostToggle` animation path.
- No visual fade animation on the selective hide — instant opacity change,
  matching the current behavior.

## Context & Research

### Relevant Code and Patterns

- `src/views/circular/rendering.ts` — `updateSelective`, `setGhostOpacity`,
  `updateStickerMappings`; the three-line block to replace is:
  ```
  // Set ghosts transparent during animation
  setGhostOpacity(state, 0);
  ```
- `src/views/circular/rendering.ts` —
  `CircularCubeViewInternalData.ghostElements` (lazily populated
  `SVGCircleElement[]`), each with `data-ghost-source` attribute holding the SVG
  ID of the source sticker circle.
- `src/views/circular/rendering.ts` —
  `state.svgIdToStickerId: Map<svgId, StickerId>` — reverse-maps an SVG element
  ID to the sticker it currently displays; reflects the last rendered state.
- `src/cube/types/cubie.ts` — `ReadonlyCubie.stickers: IMap<StickerId, Sticker>`
  — iterating `.values()` yields all stickers for a cubie.
- `src/types/events.ts` —
  `MoveExecutedEvent.moveDetails.movedCubies.before: ReadonlyCubie[]` — the
  cubies involved in the move as they appear in the pre-state (same sticker IDs
  as what the view currently shows).

### Key Data-Flow

```
movedCubies.before
  → collect all StickerId values from each cubie's stickers
  → for each ghost element, read data-ghost-source (SVG ID)
  → state.svgIdToStickerId.get(sourceId) → StickerId
  → if StickerId ∈ affected set → hide this ghost element
```

Sticker IDs are stable (tied to canonical cubie position, not face position) so
`movedCubies.before` and `movedCubies.after` yield the same IDs; `before` is the
correct choice because `svgIdToStickerId` reflects the pre-state at the point of
the check.

## Key Technical Decisions

- **Use `movedCubies.before`**, not `after`, because `svgIdToStickerId` reflects
  the pre-state at the time of the opacity call.
- **Ordering**: the selective hide should occur after `state.ghostElements` is
  populated (lazy init) but before `updateStickerMappings`. The
  `svgIdToStickerId` map reflects the last `renderState` call, which for the
  first animation in a sequence is the current display state — consistent with
  `movedCubies.before`. For concurrent same-axis animations the sticker sets are
  disjoint, so no race condition exists.
- **`showGhosts` guard**: wrap the selective hide in `if (state.showGhosts)` to
  skip any opacity work when ghosts are globally off.
- **No change to `finishAnimation` restore path**:
  `setGhostOpacity(state, targetOpacity)` already restores every ghost element
  once all pending animations settle. Restoring unaffected ghosts to the same
  value they already hold is a safe no-op visually.
- **Extract a named helper** `collectAffectedGhostElements` rather than inlining
  the logic — keeps `updateSelective` readable and makes the helper
  independently testable.

## Open Questions

### Resolved During Planning

- _Can an unaffected ghost sticker's position be obscured by an animated sticker
  traveling over it?_ Ghost stickers in the Circular view live on axis-circle
  endpoints at the far side of arc gaps. Stickers that animate along an axis
  circle travel on the same circle as the ghost stickers for that axis — and
  those source stickers are in `movedCubies`, so they are in the affected set
  and will be hidden. Ghosts on other axis circles are spatially separated and
  should not overlap. Accepted as low risk; can be observed visually after
  implementation.

### Deferred to Implementation

- _Exact sticker ID iteration API for `IMap<StickerId, Sticker>`_: whether
  `.values()` returns a native iterable or requires `.valueSeq()` (Immutable.js
  vs native Map) — resolve by reading the actual Immutable.js version in use.
- _Whether `state.ghostElements` needs explicit re-initialization_ when ghosts
  are turned on/off between animations — existing lazy-init pattern handles
  this, but verify at implementation time.

## Implementation Units

- [ ] **Unit 1: Add `collectAffectedGhostElements` helper and integrate into
      `updateSelective`**

**Goal:** Replace the blanket `setGhostOpacity(state, 0)` call in
`updateSelective` with a targeted hide of only the ghost elements whose source
sticker is part of the current move.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**

- Modify: `src/views/circular/rendering.ts`
- Test: `src/views/circular/rendering.test.ts`

**Approach:**

- Add a module-private helper
  `collectAffectedGhostElements(state, movedCubies)`:
  - Ensure `state.ghostElements` is populated (mirror the existing lazy-init
    one-liner already used in `updateGhostStickers`).
  - Build a `Set<StickerId>` by iterating each cubie in `movedCubies.before` and
    collecting all sticker IDs from `cubie.stickers`.
  - Return the subset of `state.ghostElements` whose `data-ghost-source`
    resolves (via `state.svgIdToStickerId`) to a sticker ID in that set.
- In `updateSelective`, replace the `setGhostOpacity(state, 0)` call with:
  1. Guard: `if (!state.showGhosts) { /* skip */ }`.
  2. Call `collectAffectedGhostElements(state, movedCubies.before)`.
  3. Set `style.opacity = '0'` on each returned element individually.
- The `finishAnimation` restore path (`setGhostOpacity(state, targetOpacity)`)
  is untouched.

**Patterns to follow:**

- Lazy-init of `state.ghostElements` — see `updateGhostStickers` in
  `src/views/circular/rendering.ts` (lines ~67–69).
- `state.svgIdToStickerId` lookup pattern — see `updateStickerMappings` in the
  same file.
- Existing `if (!state.showGhosts)` guard pattern is not present today; model
  the guard structure on `setGhostVisibility`.

**Test scenarios:**

- Happy path: `collectAffectedGhostElements` returns only the ghost elements
  whose source sticker ID is in the moved cubies — other ghosts are excluded.
- Happy path: `updateSelective` sets `opacity: 0` on the affected ghosts and
  leaves unaffected ghosts' opacity unchanged before animation.
- Happy path: after `finishAnimation` runs (all pending settled), all ghost
  elements have `targetOpacity` via the existing `setGhostOpacity` call.
- Edge case: `movedCubies.before` is empty → `collectAffectedGhostElements`
  returns an empty array; no ghost opacity changes occur.
- Edge case: a ghost's `data-ghost-source` has no match in `svgIdToStickerId` →
  that ghost is skipped (not treated as affected).
- Edge case: `state.showGhosts` is `false` → selective hide block is skipped
  entirely; ghost opacity is not touched.
- Edge case: `state.ghostElements` is `undefined` (not yet lazily populated) →
  helper initializes it before proceeding.
- Integration: two concurrent same-axis animations each hide their own disjoint
  ghost subsets; when both finish, all ghosts are restored to target opacity.

**Verification:**

- All existing `rendering.test.ts` tests continue to pass.
- New tests pass.
- Manually: trigger an `R` move — ghost stickers for the Left face remain
  visible throughout the animation; only Right-layer ghost stickers disappear
  and reappear.

## System-Wide Impact

- **Interaction graph:** Only `updateSelective` in `rendering.ts` is modified;
  the public function signature does not change.
- **Unchanged invariants:** `setGhostOpacity`, `setGhostVisibility`,
  `animateGhostToggle`, and the `finishAnimation` restore path are all
  unchanged.
- **API surface parity:** No other views or callers are affected.

## Risks & Dependencies

| Risk                                                                           | Mitigation                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svgIdToStickerId` stale at the moment of the check for rapid concurrent moves | Same-axis moves use disjoint sticker sets — no conflict. Cross-axis moves are serialized — mapping is always current. Accept and verify during implementation. |
| Ghost positioned at the visual path of an animated sticker on another axis     | Geometrically unlikely given axis-circle layout; accepted as low risk and verifiable visually after implementation.                                            |

## Sources & References

- Related code: `src/views/circular/rendering.ts` — `updateSelective`
  (~line 195)
- Related code: `src/views/circular/rendering.ts` — `setGhostOpacity` (~line 96)
- Related code: `src/cube/types/cubie.ts` — `ReadonlyCubie`
- Related code: `src/types/events.ts` —
  `MoveExecutedEvent.moveDetails.movedCubies`
