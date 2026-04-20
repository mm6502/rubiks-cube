---
title:
  Panel header buttons flicker during resize after overflow priority refactor
date: 2026-04-19
category: ui-bugs
module: view-manager
problem_type: ui_bug
component: tooling
symptoms:
  - Buttons in panel header swap positions rapidly with each pixel of resize
  - Flickering most visible near breakpoints where buttons transition between
    inline and overflow
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [overflow, resize, greedy-algorithm, sort-stability, command-renderer]
---

# Panel header buttons flicker during resize after overflow priority refactor

## Problem

After refactoring the panel header overflow system to separate `displayOrder`
(left-to-right positioning) from `overflowPriority` (survival during shrink),
gradually resizing a view panel caused buttons to flicker and swap positions
rapidly with each pixel of width change.

## Symptoms

- Buttons appeared to randomly swap between inline rail and overflow dropdown as
  panel width changed incrementally
- Flickering was most noticeable when resizing slowly near the breakpoint where
  buttons switch between inline and overflow
- Different button combinations appeared at nearly identical panel widths

## What Didn't Work

No failed investigation attempts — the root causes were identified through
direct code review of the new overflow algorithm. The symptom description
("unstable sort order?") pointed directly at the algorithm.

## Solution

Two complementary fixes in `src/view-manager/command-renderer.ts`:

**Fix 1: Change `continue` to `break` in the greedy fill loop:**

```typescript
// Before (broken) — skips unfitting buttons, tries smaller ones
for (const entry of byOverflow) {
  const cost = (inlineSet.size === 0 ? 0 : gap) + entry.width;
  if (used + cost > availableForInline) continue;
  used += cost;
  inlineSet.add(entry.index);
}

// After (fixed) — stops when space runs out
for (const entry of byOverflow) {
  const cost = (inlineSet.size === 0 ? 0 : gap) + entry.width;
  if (used + cost > availableForInline) break;
  used += cost;
  inlineSet.add(entry.index);
}
```

**Fix 2: Add stable sort tiebreaker:**

```typescript
// Before (broken) — buttons with same overflowPriority have undefined order
.sort((a, b) => b.overflowPriority - a.overflowPriority);

// After (fixed) — tiebreak by index descending for stable ordering
.sort(
    (a, b) =>
        b.overflowPriority - a.overflowPriority || b.index - a.index
);
```

## Why This Works

The two bugs amplified each other:

1. **`continue` created combinatorial instability.** With `break`, once a button
   doesn't fit, the algorithm stops — the inline set is deterministic for any
   given width. With `continue`, the algorithm skips unfitting buttons and tries
   smaller ones further down the list. As width changes by 1px, different button
   combinations suddenly become feasible, so the visible set shifts
   unpredictably.

2. **Unstable sort made the instability non-deterministic.** When multiple
   buttons share the same `overflowPriority` (the common case — most buttons
   fall back to `displayOrder`), their relative order was undefined. Combined
   with `continue`, the same panel width could yield different button sets on
   different renders.

`break` restores greedy determinism. The `b.index - a.index` tiebreaker ensures
that when buttons tie on priority, leftmost buttons overflow first — a stable,
predictable policy.

## Prevention

- **Always add tiebreakers to sort comparators** when the primary key can have
  duplicates. A missing tiebreaker means the sort is unstable and behavior
  depends on engine internals.
- **Prefer `break` over `continue` in greedy selection loops** — `continue`
  turns a greedy algorithm into a knapsack variant where the selection set is
  sensitive to input ordering and available capacity, producing visual
  instability.
- **Test incremental resize behavior** around breakpoints, not just static
  sizes. A test that resizes by 1px increments and asserts the inline button set
  only changes monotonically (buttons leave/enter one at a time, never swap)
  would catch this class of bug.

## Related Issues

- None
