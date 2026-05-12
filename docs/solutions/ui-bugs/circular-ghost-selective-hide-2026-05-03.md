---
title: Circular View — selective ghost hiding during move animations
date: 2026-05-03
category: ui-bugs
module: circular-view
problem_type: code_fix
severity: medium
tags:
  - ghost
  - circular-view
  - animation
  - ui
---

# Circular View — Selective ghost hide during move animations

Summary

Previously, the Circular view hid all ghost hint stickers (`opacity: 0`) before
any move animation began. This caused unnecessary visual blanking for ghosts
that were not affected by the move. The implemented fix hides only the ghost
elements whose source stickers are part of the move, leaving unrelated ghosts
visible throughout animation.

Implementation notes

- Code: `src/views/circular/rendering.ts`
  - Added `collectAffectedGhostElements(state, movedCubies)` to compute the
    subset of ghost SVG elements whose `data-ghost-source` maps to a sticker in
    the `movedCubies.before` set.
  - Replaced the unconditional `setGhostOpacity(state, 0)` with a targeted
    opacity change on only the affected ghost elements prior to animation.
  - The existing restore path (`finishAnimation` / `setGhostOpacity`) still
    restores all ghosts once the pending animations complete.

Why this matters

- Visual continuity: ghosts unrelated to a move remain visible, improving
  readability during animations.
- Correctness: only source stickers that actually move (from `movedCubies`) are
  hidden, matching intent and reducing unnecessary flicker.

Where to look

- Implementation: `src/views/circular/rendering.ts`
- Animation orchestration: `src/views/circular/animations.ts`

Related plan

- Origin:
  docs/plans/2026-05-02-001-fix-selective-ghost-hiding-during-animation-plan.md
- Related learning: ../logic-errors/directional-180-move-hardening-2026-05-09.md
