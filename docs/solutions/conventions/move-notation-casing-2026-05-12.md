---
title: Move Notation Casing — Face Moves vs Cube Rotations
date: 2026-05-12
category: docs/solutions/conventions/
module: move-notation
problem_type: convention
component: documentation
severity: low
applies_when:
  - Writing or reviewing move notation strings in code, docs, or tests
  - Generating icon IDs or symbol names derived from move notation
  - Parsing or validating user-entered move sequences
tags: move-notation, notation, wca, cube-rotation, casing
---

# Move Notation Casing — Face Moves vs Cube Rotations

## Context

During a review of `src/icons/move-icon-sprite.svg` symbol IDs and a notation
listing exercise, it was easy to accidentally write cube-rotation moves (x, y,
z) with uppercase letters (X, Y, Z) — matching the uppercase pattern used for
face moves. This is incorrect per WCA standard and the project's own
`src/docs/move-notation.md`.

## Guidance

**Face moves use UPPERCASE. Cube rotations use lowercase.**

| Group          | Notation      | Examples                                                                                      |
| -------------- | ------------- | --------------------------------------------------------------------------------------------- |
| Face moves     | UPPERCASE     | `R R' R2 R2'` · `L L' L2 L2'` · `U U' U2 U2'` · `D D' D2 D2'` · `F F' F2 F2'` · `B B' B2 B2'` |
| Slice moves    | UPPERCASE     | `M M' M2 M2'` · `E E' E2 E2'` · `S S' S2 S2'`                                                 |
| Cube rotations | **lowercase** | `x x' x2 x2'` · `y y' y2 y2'` · `z z' z2 z2'`                                                 |

The sprite symbol IDs follow the same convention:

- `move-icon-r`, `move-icon-rp`, `move-icon-r2`, `move-icon-r2p`
- `move-icon-x`, `move-icon-xp`, `move-icon-x2`, `move-icon-x2p` ← lowercase `x`

## Why This Matters

The WCA Regulations (Article 12) define cube rotations as lowercase x, y, z.
Using uppercase X, Y, Z is simply wrong notation and will confuse any solver or
parser that follows the standard. The project's `src/docs/move-notation.md`
explicitly documents this distinction.

Icon ID mismatches (e.g. looking up `move-icon-X` instead of `move-icon-x`) will
silently produce missing icons — no runtime error, just a blank.

## When to Apply

- Generating the full move-notation list (for testing, docs, or UI labels)
- Naming SVG symbol IDs for rotation icons
- Writing move-sequence parsers or validators
- Any context where all 48 standard moves (16 face/slice + 12 cube-rotation) are
  enumerated

## Examples

**Correct full notation list, grouped by axis and anchor:**

```plaintext
── X axis, anchor x-0 (left) ──     ── X axis, anchor x-2 (right) ──
L    M                               R    x
L'   M'                              R'   x'
L2   M2                              R2   x2
L2'  M2'                             R2'  x2'

── Y axis, anchor y-0 (bottom) ──   ── Y axis, anchor y-2 (top) ──
D    E                               U    y
D'   E'                              U'   y'
D2   E2                              U2   y2
D2'  E2'                             U2'  y2'

── Z axis, anchor z-0 (front) ──    ── Z axis, anchor z-2 (back) ──
F    S    z                          B
F'   S'   z'                         B'
F2   S2   z2                         B2
F2'  S2'  z2'                        B2'
```

**Wrong (uppercase rotations):**

```plaintext
R    x      ← x is correct
R    X      ← X is WRONG
```

## Related

- `src/docs/move-notation.md` — authoritative project notation reference (WCA
  Article 12)
- `src/icons/move-icon-sprite.svg` — SVG sprite using this convention for symbol
  IDs
