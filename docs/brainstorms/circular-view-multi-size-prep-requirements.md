---
date: 2026-05-05
topic: circular-view-multi-size-prep
status: completed
---

# Circular View — Multi-Size Preparation

## Summary

Four normative changes (plus one recommended authoring convention) to
`src/views/circular/view.svg` and `src/views/circular/initialization.ts` that
remove hardcoded size assumptions from the Circular view, making it ready to
support per-N SVG files without TS code changes when multi-size (2×2 – 7×7)
support is eventually built.

---

## Problem Frame

The project's long-term goal includes support for cube sizes 2×2 through ~7×7.
The core layer (`StateManager`, `MoveEngine`, `CubeInvariants`) was designed
size-agnostic from the start and requires no changes. The Circular view,
however, has four specific places where the current 3×3 size is hardcoded in
ways that would silently break or require TS code edits when a new per-N SVG is
introduced:

1. `parseAxisCircles()` in `initialization.ts` iterates
   `for (let layer = 0; layer <= 2; layer++)` — a hardcoded upper bound that
   would miss any rings beyond index 2 even if they are present in the SVG.

2. `svgToCubeMapping()` in `initialization.ts` hardcodes the far-face coordinate
   as `2` (e.g., `{ x: 2, y, z }` for face R) — this must equal `cubeSize - 1`
   and is wrong for any other size.

3. The SVG root element (`<svg>`) carries no machine-readable declaration of
   which cube size it represents. Code that needs this value has nowhere to read
   it from without inspecting the sticker data indirectly.

4. The sticker ID parsing regex in `initialization.ts` is
   `/^sticker-([UDFLBR])-\d$/`, where `\d` matches only a single digit (0–9). A
   4×4 has 16 stickers per face (indices 0–15); any sticker with a two-digit
   index is silently skipped, producing an incomplete lookup map.

The design premise for multi-size is: one SVG file per N (because layout and
element proportions are too complex to compute programmatically), with TS
consuming any conforming SVG without modification. These four gaps prevent that
premise from working.

---

## Requirements

**SVG metadata:**

- R1. The `<svg>` root element declares the cube size it represents via a
  `data-cube-size` attribute (e.g., `data-cube-size="3"`).
- _(R2 removed — downgraded to the Convention below.)_
- _(Convention)_ Each label-mask `<rect>` element in `<defs>` is encouraged to
  carry `data-mask-axis` and `data-mask-layer-index` attributes identifying
  which axis circle the mask hole belongs to (e.g.,
  `data-mask-axis="Z" data-mask-layer-index="0"`). This is not enforced at
  runtime — it is a recommended authoring convention for designer clarity and
  future tooling.

**TS initialization:**

- R3. `parseAxisCircles()` discovers axis circle elements via a DOM query for
  all `<circle>` elements with a `data-axis` attribute, rather than iterating a
  hardcoded layer count. Each circle's layer index is read from its
  `data-layer-index` attribute (already present on all axis circles in the
  current SVG). The result is equivalent for the current 3-ring SVG and
  automatically correct for any N-ring SVG. If no matching elements are found,
  the function must throw — absence of axis circles indicates a broken or
  mismatched SVG file.
- R4. `svgToCubeMapping()` reads the cube size from the SVG root
  `data-cube-size` attribute (established by R1) and uses `cubeSize - 1` for
  far-face coordinates, removing the hardcoded `2`. `buildStickerLookupMap` must
  throw if `data-cube-size` is absent or its parsed value is not a positive
  integer — the same hard-fail semantics as R3.
- R5. The sticker ID parsing regex is updated to support multi-digit position
  indices (current: `/^sticker-([UDFLBR])-\d$/`, which matches only indices
  0–9). The updated pattern must match indices from 0 up to `cubeSize² - 1` to
  support 4×4 (0–15) and larger faces.

---

## Success Criteria

- A designer can produce a valid 4×4 Circular view SVG following the same
  element conventions as the current `view.svg`, drop it in, and the TS
  initialization code builds a correct sticker lookup map without any TS
  changes.
- The current 3×3 behavior is unchanged — all existing tests pass and no visual
  regression occurs.
- It is unambiguous from the SVG alone which cube size it represents (via R1).

---

## Scope Boundaries

- No changes to the sticker `data-axis-circles`, `data-face`, or `data-pos`
  attributes — these are already size-agnostic.
- No changes to ghost sticker attributes — these are already size-agnostic and
  per-SVG geometry.
- No TS changes outside `initialization.ts`.
- No new SVG files for other sizes — this work only makes the existing
  infrastructure ready; actual N-size SVGs are out of scope.
- No UI for selecting cube size — out of scope for this preparation work.
- No changes to the face ellipses, face labels, or axis label groups — they
  carry `data-face` / `data-axis` already; no further metadata is needed for
  size-agnosticism.
- Discovery-based axis circle parsing (R3) does not change the interaction
  logic, animation system, or hit-testing behavior downstream of
  `buildStickerLookupMap()`.

---

## Key Decisions

- **Per-N SVG files, not a single programmatically-generated SVG:** The layout
  complexity (ring spacing, radii, sticker positions, ghost placements) makes a
  static SVG the right design tool. Each N gets its own authored file. TS reads
  whatever conforming SVG is provided.
- **`data-cube-size` on the SVG root, not inferred from sticker count:**
  Inferring size from sticker count is fragile (requires counting, assumes
  completeness). An explicit declaration is cheaper and unambiguous.
- **Mask `data-mask-*` attributes are a recommended convention, not a normative
  requirement:** TS does not read them at runtime — the mask is pure SVG visual.
  Adding them to a new N-size SVG is strongly encouraged for designer clarity
  and potential future tooling, but omitting them does not break functionality.

---

## Dependencies / Assumptions

- The existing sticker `data-axis-circles="Z:2 X:2"` encoding (axis + layer
  index pairs) is authoring metadata that documents the ring membership
  geometrically encoded by each sticker's position; ring membership is
  determined at runtime by geometric intersection testing in
  `computeAxisCoords()`, not by reading this attribute. No changes needed there.
- `svgToCubeMapping()` is the only place in `initialization.ts` where far-face
  coordinates are hardcoded as `2`; no other TS code duplicates this assumption.
- A new N-size SVG will follow the same element naming conventions
  (`{AXIS}-layer-{index}` circle IDs, `sticker-{FACE}-{POS}` circle IDs,
  `data-face` / `data-axis` / `data-layer-index` attributes) as the current
  `view.svg`.

---

## SVG Conformance Checklist

A conforming N-size Circular view SVG must satisfy the following structural
conventions (in addition to the normative requirements R1 and R3–R5):

**Root element:**

- `<svg>` carries `data-cube-size="N"` (R1).

**Axis circles:**

- One `<circle>` element per ring, with `data-axis` set to the ring's axis
  letter (`X`, `Y`, or `Z`) and `data-layer-index` set to the zero-based layer
  index.
- IDs follow the pattern `{AXIS}-layer-{INDEX}` (e.g., `Z-layer-0`).

**Stickers:**

- One `<circle class="sticker">` per visible sticker position, with `data-face`
  (one of `U`, `D`, `F`, `B`, `L`, `R`), `data-pos` (zero-based index), and
  `id="sticker-{FACE}-{POS}"`.
- For an N×N face, `data-pos` ranges from `0` to `N² - 1`.

**Ghost stickers:** _(visual overlap indicators)_

- Carry `data-ghost-axis`, `data-ghost-layer`, `data-ghost-face`,
  `data-ghost-index`, `data-ghost-target`, and `data-ghost-source` attributes
  consistent with the existing `view.svg` pattern.

**Face elements:**

- Face ellipses and labels carry `data-face`.

**Label masks:** _(convention only)_

- Mask `<rect>` elements in `<defs>` are encouraged to carry `data-mask-axis`
  and `data-mask-layer-index`. Omitting these attributes does not break runtime
  behavior.

---

## Outstanding Questions

### Resolved

- [Affects R3] `parseAxisCircles()` must throw if the SVG contains no `<circle>`
  elements with `data-axis`. The SVG file is assumed to be a valid, correctly
  authored file set up during initialization — absence of axis circles indicates
  a broken or mismatched SVG, which is a hard fail, not a recoverable condition.
- [Affects R4] `buildStickerLookupMap` must throw if `data-cube-size` is absent
  or parses to a non-positive integer — same hard-fail semantics as R3. A
  missing or invalid size attribute indicates a broken or non-conforming SVG.

### Deferred to Planning

- ~~[Affects R4] [Technical] `svgToCubeMapping()` receives `svgFace` and
  `axisCoords` but not a reference to the SVG root. The `cubeSize` value should
  be read once at the top of `buildStickerLookupMap` (from
  `svgRoot.getAttribute('data-cube-size')`) and passed through to
  `svgToCubeMapping`. `svgToCubeMapping` is a private, unexported function with
  exactly one call site (within `buildStickerLookupMap`); the signature change
  is safe.~~

---

## Implementation Outcome (2026-05-08)

All requirements (R1–R5) shipped in commit
`feat(circular): make initialization size-agnostic for multi-size SVG support`
(branch: `changes`, 3 files, +357/−35).

**Delivered:**

- R1: `data-cube-size="3"` on `<svg>` root in `view.svg`
- R3: `parseAxisCircles()` via `querySelectorAll('circle[data-axis]')`, throws
  if empty
- R4: `cubeSize` read once in `buildStickerLookupMap`, validated, passed to
  `svgToCubeMapping`; `cubeSize - 1` replaces hardcoded `2`; throws on
  missing/invalid
- R5: sticker ID regex `\d` → `\d+`

One notable implementation decision: `cubeSize` is read via
`getAttribute('data-cube-size')` (not `dataset.cubeSize`) for consistency with
the rest of the file's attribute access pattern.
