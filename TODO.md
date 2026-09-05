# TODO List

If there are no tasks listed below, it means there are no immediate plans for
new features or changes. In that case see
[implementation-status.md](implementation-status.md) for current implementation
status and future plans.

## Current tasks

- [ ] Moves view icon fallback for size-specific moves — numbered slice/wide
      moves (`2M`, `3E`, `4S`, `2Rw`, ...) render no icon on n>3 cubes; add a
      family-glyph + notation-label fallback reusing the existing icon set (zero
      new SVG assets). Requirements:
      [docs/brainstorms/2026-09-05-moves-view-icon-fallback-requirements.md](docs/brainstorms/2026-09-05-moves-view-icon-fallback-requirements.md)
  - [ ] Feasibility check (at planning): numbered-wide engine support (path A)
        vs. notation-regex fallback (path C); scramble pool probability check
  - [ ] Resolver design (canonical-family on `MoveDefinition`)
  - [ ] Renderer integration in the Moves view
  - [ ] Unit tests + browser verification (sizes 4–7)

- [ ] Add Circular view support for custom cube sizes (2×2–7×7)
  - [ ] Add 2×2 support (independent follow-up)
  - [ ] Add 4×4 support (independent follow-up)
  - [ ] Add 5×5 support (independent follow-up)
  - [ ] Add 6×6 support (independent follow-up)
  - [ ] Add 7×7 support (independent follow-up)

## Future Tasks

This section outlines tasks that may be addressed in the future, though they are
not currently scheduled for implementation. Examples include resolving package
overrides due to security concerns.

Currently, there are no items in this category.
