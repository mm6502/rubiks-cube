---
title: Basic View — Ghost hint stickers (implemented)
date: 2026-05-03
category: feature
module: basic-view
problem_type: feature
severity: low
tags:
  - ghost
  - basic-view
  - ui
  - accessibility
---

# Basic View — Ghost hint stickers

Summary

Implemented semi-transparent ghost sticker strips for the Basic (3D) view to
reveal colours of hidden faces along the cube silhouette edges. This solution
consolidates the original brainstorming, ideation, and implementation plan into
a single reference for future maintainers.

Why

Users of the 3D Basic view can only see three faces at a time. Ghost stickers
provide at-a-glance hints about the colours on hidden faces without forcing a
rotation. The implementation follows the existing Flat view pattern while
adapting for 3D positioning and live rotation updates.

Key implementation notes

- Module: `src/views/basic/ghost-stickers.ts` — `GhostStickers` class,
  `CUBE_EDGE_MAP`, DOM creation, per-edge show/hide and colour sync.
- Styling: `src/views/basic/ghost-stickers.module.css` — absolute positioning
  relative to face elements and small `translateZ` offset to avoid z-fighting.
- Commands: `src/views/basic/commands.ts` exposes `basic-view.ghost-hints`
  toggle in the header; toggle state is shared between `basic-front` and
  `basic-back`.
- Integration: `src/views/basic/basic-view.ts` creates/initializes the module
  and calls `updateVisibleEdges` + `updateColors` during rotation and state
  updates.

Behavior & API

- Toggle command: `basic-view.ghost-hints` (icon: 👻, keybinding: `Ctrl+3`) —
  cycles opacity states (off → 75% → 100%).
- Strips appear only on silhouette edges (host face visible, source face
  hidden).
- Live update during manual rotation: per-edge fade-in/out with delayed fade-in
  to align visually with rotate gestures.
- Colour sync: reads the source sticker colour via cube model and applies it to
  ghost elements using `updateColors()`.

Where to look

- Implementation: `src/views/basic/ghost-stickers.ts`
- Styling: `src/views/basic/ghost-stickers.module.css`
- Commands: `src/views/basic/commands.ts`
- Integration: `src/views/basic/basic-view.ts`

Related docs

- Origin: docs/brainstorms/basic-view-ghost-stickers-requirements.md
- Plan: docs/plans/2026-05-01-001-feat-basic-view-ghost-stickers-plan.md
- Ideation: docs/ideation/base-view-ghost-stickers-2026-05-01.md

Recommended next steps

- Add visual regression screenshot tests covering ghost strip appearance at
  representative orientations.
- Tweak `translateZ` offset and opacity values if z-fighting or readability
  issues are observed at extreme pitches.
