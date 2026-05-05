---
date: 2026-05-05
topic: multi-size-readiness-overview
---

# Multi-Size Cube Support — Readiness Overview

## Summary

Supporting cube sizes 2×2 through ~7×7 is a long-term goal. The core logic layer
was designed size-agnostic from the start and requires no changes. Three
preparation areas exist across the view and application layers where targeted
work will prevent technical debt accumulating and silent regressions when
multi-size is eventually built. One of those areas (Circular view) has its own
detailed requirements document.

---

## Architecture Layers

### Core layer — no changes needed

| Component                                                         | Status   | Notes                                                                                  |
| ----------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `CubeController`                                                  | ✅ Ready | `constructor(cubeSize: number = 3)` — parameterized                                    |
| `createCubeInvariants`                                            | ✅ Ready | Explicitly validates `cubeSize >= 2`; all derived lookup tables are size-driven        |
| `StateManager` / `MoveEngine` / `CubieManager` / `LayerManager`   | ✅ Ready | All size-agnostic; operate on whatever invariants are given                            |
| State serialization                                               | ✅ Ready | Format `<cubeSize>:<faceOrder>:<face1Colors>:...` already encodes cube size            |
| Move notation / parser                                            | ✅ Ready | `parseStringMove(move, cubeSize)` parameterized; wide-move notation (`nRw`) documented |
| Interaction layer (`types.ts`, `moveInference`, `keyboard-moves`) | ✅ Ready | `cubeSize` is carried through gesture context types and used in layer inference        |

---

### View layer — preparation needed

#### Circular view (Prep Area 1)

- **Status:** Targeted preparation work identified; detailed in
  [`circular-view-multi-size-prep-requirements.md`](./circular-view-multi-size-prep-requirements.md).
- **Summary of gaps:** Four normative changes + one recommended authoring
  convention:
  - R1: `<svg>` root needs `data-cube-size` attribute.
  - R3: `parseAxisCircles()` iterates a hardcoded `layer <= 2` loop — must
    switch to DOM query over `data-axis` elements; throws on empty result.
  - R4: `svgToCubeMapping()` hardcodes far-face coordinate as `2` — must use
    `cubeSize - 1` read from SVG root.
  - R5: Sticker ID regex `/^sticker-([UDFLBR])-\d$/` matches only single-digit
    indices; silently drops positions 10+ on 4×4 faces.
  - Convention: `data-mask-axis` / `data-mask-layer-index` on mask `<rect>`
    elements.
- **Design premise:** One hand-crafted SVG file per N; TS reads any conforming
  SVG without code changes. SVG Conformance Checklist defined in the detail
  document.

#### Basic view — static DOM (Prep Area 2)

- **Status:** Current implementation is ready for 3×3 static rendering only.
- **Gaps:** Three hardcoded-9 sites across initialization and rendering:
  - `buildCubeFace()` in `initialization.ts` (hardcodes
    `for (let i = 0; i < 9; i++)`).
  - `update()` in `rendering.ts` line 444 (full-repaint path, called on every
    model state change).
  - `updateSelective()` in `rendering.ts` line 483 (selective-repaint path). All
    three must change to `cubeSize * cubeSize`, with `cubeSize` passed through
    each call chain.
- **Scale:** Small. `basic-view.ts` already reads `getCubeSize()` from model
  state (`cubeSize ?? 3`); the value is available but does not yet reach the
  rendering paths.
- **TODO:** A detailed requirements document (parallel to the Circular view
  spec) will be needed before implementation — to define success criteria and
  scope for all three fix sites.
- **Note:** The CSS 3D geometry (perspective, `translateZ`, face positioning) is
  tuned for a 3×3 grid. Rendering a 4×4 in the same physical cube shell will
  require CSS adjustments (sticker size, gap, face dimensions). This is a visual
  design task, not a structural one — not blocking.

#### Flat view — already adaptive

- **Status:** ✅ Effectively ready.
- `flat-view.ts` reads `getCubeSize()` dynamically from model state.
  `rendering.ts` iterates the `FaceGrid` data structure (which is N×N), not a
  hardcoded count. No changes needed for structural multi-size support.
- Minor: minimum size calculation (`getMinimumSize()`) returns hardcoded
  `{width: 300, height: 300}` — may need adjustment for very large or very small
  cubes, but not a blocker.

---

### Application layer — no size-selector yet (Prep Area 3)

- **`Application` constructor:** `new CubeController()` — uses the default
  `cubeSize = 3`. No mechanism to instantiate a different cube size at startup
  or at runtime.
- **This is by design for now:** Multi-size UI (a size selector or URL
  parameter) is intentionally out of scope for the preparation work. The
  preparation areas above are about removing hardcoded assumptions from the view
  initialization paths, not about building the UI.
- **When the UI lands:** The entry point change will be in `application.ts`. The
  design question (size selector in settings, URL query parameter, or separate
  application instances) is deferred.
- **Investment note:** This preparation work is a speculative investment — it
  reduces future friction but delivers no user-visible value independently. A
  scope and priority reassessment is recommended before scheduling multi-size
  implementation proper.

---

## Preparation Summary

| Area                                         | Effort | Blocking for multi-size         | Document                                                      |
| -------------------------------------------- | ------ | ------------------------------- | ------------------------------------------------------------- |
| Circular view — 3 TS + 1 SVG normative fixes | Small  | Yes — silent failures on ≥ 4×4  | [detail doc](./circular-view-multi-size-prep-requirements.md) |
| Basic view — 3 hardcoded-9 sites             | Small  | Yes — wrong sticker count       | None yet                                                      |
| Flat view                                    | None   | Not blocking                    | —                                                             |
| Core / interaction                           | None   | Not blocking                    | —                                                             |
| Application size-selector UI                 | Large  | Out of scope (separate feature) | —                                                             |

---

## What Is Explicitly Out of Scope Here

- Building the size-selector UI or any user-facing entry point for size
  selection.
- Creating N-size SVG files for Circular view (authoring task, done when a
  specific size is targeted).
- CSS visual adjustments for Basic view at non-3×3 sizes.
- Parity algorithm differences for 4×4+ (different cubie types, OLL/PLL parity —
  core engine concern, separate from this preparation).
