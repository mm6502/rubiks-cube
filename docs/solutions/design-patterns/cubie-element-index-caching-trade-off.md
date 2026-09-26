---
title:
  'Cubie-element index: rebuild per call, or promote to view state with an
  invalidation boundary'
date: 2026-09-24
category: design-patterns
module: src/views/basic
problem_type: design_pattern
component: frontend_stimulus
severity: low
applies_when:
  - 'Deciding whether to cache a derived DOM index, or rebuild it at each call
    site'
  - 'The cached value would be a live element reference rather than plain data'
  - 'A stale value fails silently instead of throwing'
tags:
  - dom
  - caching
  - invalidation
  - decision-pending
  - cubie-rendering
  - performance
---

# Cubie-element index: rebuild per call, or promote to view state with an invalidation boundary

> **STATUS: NOT DECIDED.** There is no bug here and no fix. This records an open
> trade-off: a deliberately per-call rebuild that currently costs nothing
> measurable, with two named conditions that would flip the decision. The
> recommendation below is a recommendation, not a decision that has been made.
> Evidence labels: **MEASURED**, **CONFIRMED**, **RULED OUT**, **OPEN / NOT
> PROVEN**, **UNTESTED**.

## Context

`collectCubieElements` (`src/views/basic/cubie-rendering.ts`, line 352) builds
an id-keyed `Map` on **every call** rather than caching one. That is what
removed the per-cubie `querySelector` cost — it is a fix, not a defect — but it
leaves an open question about whether the index should instead be promoted to
view state.

Nothing is currently slow because of the choice. The entry exists because the
invariant ("rebuilt at every rebuild boundary") is held **by convention**, not
structurally.

## Guidance

**Recommendation on the current evidence: keep rebuilding per call. Revisit only
on a named trigger.**

- The per-call build is **~1.2 ms** against a **~35 ms** full rebuild =
  **3.4%**. Caching buys nothing measurable today.
- No per-frame path pays it: `animateLayer` receives its elements **once** and
  then animates the pivot.
- A cache adds a failure mode the per-call build cannot have: a stale index
  yields a **silently detached element**. It does not throw.

**The two triggers that would flip it:**

1. **A lookup lands on a per-frame animation path**, where 1.2 ms per frame
   starts to matter. Today it does not.
2. **The number of call sites grows** to where "rebuilt at every rebuild
   boundary" is hard to hold. There are three today.

**If it is revisited, the invalidation must be structural, not conventional** —
e.g. the index owned by the view and invalidated by _the same function that
rebuilds the DOM_, so a stale index is **impossible** rather than merely
discouraged.

### Two behaviours that must survive any refactor

Both are non-obvious, both are load-bearing, and both are currently protected
only by a doc comment:

- **The descendant selector, not `children`.** `collectCubieElements` uses
  `cubeElement.querySelectorAll('[data-cubie-id]')`. During a layer animation
  `animateLayer` **reparents** the moving cubies into a `pivot` div _inside_ the
  cube element, so a children-only walk finds **none** of the moving layer
  mid-move (measured: 0/49).
- **The `count` return.** A count greater than the index size means two elements
  claimed the same cubie id, so a caller can treat it as an inconsistent DOM
  rather than silently writing to one of them.

## Why This Matters

The decision is currently being made on an **incomplete cost model**, and that
is the more important finding than the decision itself.

⚠ **OPEN — a 48% unattributed speed-up.** The historic win is recorded as
`resizeCubies` **1620 ms -> 12 ms**. The documented components are 826 ms of id
lookups + 1.2 ms Map build = ~**861 ms, or 52%** of the 1620 ms baseline, and
they cannot produce 12 ms. So **~782 ms (48%) of the 1608 ms saving is
unattributed.** Candidate: the 218 per-cubie
`el.querySelectorAll('[data-face]')` calls in the mutation pass, unmeasured.
**Re-measure before deciding**, because the wrong phase may have been credited.

⚠ **OPEN — the per-call cost is internally inconsistent.** The code comment
documents **~1.25 ms per call**, but the bulk measurement is **826 / 436 = 1.894
ms per call** (1.5x higher). Quote whichever is real, or state the range.

## When to Apply

- When a derived index would hold **live DOM references** rather than plain
  data.
- When the invalidation boundary would be enforced by convention across more
  than a couple of call sites.
- When the build cost is a small fraction of the operation it precedes — the
  case here (3.4%), where caching on principle would add a silent failure mode
  for nothing.

## Examples

Correct today (per-call build, no second source of truth):

```ts
// cubie-rendering.ts — a fresh index per call; nothing to invalidate.
export function collectCubieElements(cubeElement: HTMLElement): {
  byId: Map<string, HTMLElement>;
  count: number;
} {
  const byId = new Map<string, HTMLElement>();
  let count = 0;
  // DESCENDANT selector, not `cubeElement.children`: `animateLayer` reparents
  // the moving cubies into a pivot div INSIDE the cube element, so a
  // children-only walk finds none of them mid-move (measured: 0/49).
  for (const el of cubeElement.querySelectorAll<HTMLElement>(
    '[data-cubie-id]'
  )) {
    count++;
    const id = el.getAttribute('data-cubie-id');
    if (id) byId.set(id, el);
  }
  return { byId, count };
}
```

If it is promoted to view state, the invalidation must be owned by the rebuild:

```ts
// Sketch, NOT implemented — the point is the ownership, not the shape.
// The function that rebuilds the DOM is the same function that clears the index,
// so a stale index is impossible rather than discouraged.
function rebuildCubieDom(state: BasicViewInternalData): void {
  state.cubieIndex = null; // invalidate FIRST
  renderCubieFaces(state);
  state.cubieIndex = collectCubieElements(state.cubeElement); // rebuild
}
```

The per-call form is preferable _while the build is cheap_, precisely because it
has no invalidation contract to get wrong.

## Related

- `TODO.md` — the source entry this document absorbs.
- `src/views/basic/cubie-rendering.ts` — `collectCubieElements` (line 352),
  `resizeCubies` (line 392), `getLayerCubieElements` (line 493),
  `updateCubiePositions` (line 511).
- `src/views/basic/animations.ts` — the single production caller of
  `getLayerCubieElements` (line ~300), via `animateMove`.
- `src/views/basic/animations.test.ts`, `src/views/basic/rendering.test.ts`
  (~lines 242, 247) — the existing coverage for these functions.
- `docs/solutions/performance-issues/basic-view-rotation-hitch-large-cubes.md` —
  the Basic view's other open performance question. **Deliberately separate:**
  the hitch is on the _view-rotation_ path, while `collectCubieElements` is on
  the _move_ path (`getLayerCubieElements` has one caller, `animateMove`), so
  the two are not coupled. The adjacency is a search convenience, not a shared
  cause.
- `docs/solutions/ui-bugs/firefox-basic-view-panel-resize-move-artifacts.md` —
  precedent for the NOT-DECIDED / evidence-label format.
