---
title: Basic View — Ghost hint stickers (implemented)
date: 2026-05-03
category: design-patterns
module: basic-view
problem_type: design_pattern
component: frontend_stimulus
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
  relative to face elements and a small 2px in-plane gap to keep the strips off
  the face edge (`bottom/right: calc(100% + 2px)` in `ghost-stickers.module.css`
  — the strips carry no `translateZ`; the 3D offset belongs to the anchor host,
  which `rendering.ts` transforms with `getFaceTransform`).
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
- Live update during manual rotation: per-edge fade-in/out. The turn paths pass
  a delay of **0** so strips appear immediately — a fade-in delay there was
  measured as a 233 ms dead pause and removed (`ghost-stickers.ts`). A 200 ms
  `DEFAULT_FADE_DELAY_MS` survives only for non-turn callers. to align visually
  with rotate gestures.
- Colour sync: reads the source sticker colour via cube model and applies it to
  ghost elements using `updateColors()`.

Where to look

- Implementation: `src/views/basic/ghost-stickers.ts`
- Styling: `src/views/basic/ghost-stickers.module.css`
- Commands: `src/views/basic/commands.ts`
- Integration: `src/views/basic/basic-view.ts`

Related docs

- Origin requirements (title: "Basic View — Ghost stickers") — **no longer in
  the repo.** The design intent it carried is summarised in the Summary and Why
  sections above, which were written from it.
- Implementation plan (dated 2026-05-01, same feature) — **no longer in the
  repo.**
- Ideation note (dated 2026-05-01, "base view ghost stickers") — **no longer in
  the repo.**

All three upstream documents were removed in a later docs cleanup rather than
moved, and nothing else references them. This entry is therefore now the
surviving record for the feature, which is why the Summary and Why sections are
written to stand alone.

Recommended next steps

- Add visual regression screenshot tests covering ghost strip appearance at
  representative orientations.
- Tweak the 2px in-plane gap and opacity values if the strips crowd the face
  issues are observed at extreme pitches.
