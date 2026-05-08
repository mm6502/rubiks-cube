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

- **Status:** ✅ Done (2026-05-08). All four normative changes shipped; see
  [`circular-view-multi-size-prep-requirements.md`](./circular-view-multi-size-prep-requirements.md)
  for the full requirements and implementation outcome.
- **What shipped:**
  - R1: `data-cube-size="3"` on `<svg>` root in `view.svg`.
  - R3: `parseAxisCircles()` now uses `querySelectorAll('circle[data-axis]')`;
    throws if empty.
  - R4: `svgToCubeMapping()` receives `cubeSize` from `buildStickerLookupMap`;
    uses `cubeSize - 1` for far-face coordinates; throws on missing/invalid
    `data-cube-size`.
  - R5: Sticker ID regex updated to `\d+` — multi-digit indices now matched.
  - Convention (mask `data-mask-*` attributes) remains a recommended authoring
    guideline, not enforced at runtime.
- **Design premise:** One hand-crafted SVG file per N; TS reads any conforming
  SVG without code changes. SVG Conformance Checklist defined in the detail
  document.
- **Geometry constraints:** Formal geometric invariants for any N are captured
  in
  [`circular-view-svg-geometry-spec.md`](./circular-view-svg-geometry-spec.md).
- **Open question — runtime-generated overlay elements:** `CircularTouchHandler`
  currently creates the halo, face-overlay ellipses, and detection-band
  `<path>`/`<clipPath>` elements in JS at runtime rather than baking them into
  the SVG. For N=3 this works because the shapes (6 face ellipses, 3 bands) are
  simple enough to compute from the static elements on the fly. For higher N the
  face ellipses may need deliberate hand-tuning (shape, rotation, margin), and
  the detection-band geometry grows with N. Worth deciding: should these overlay
  elements be authored into the SVG (so the generator produces them and they can
  be inspected/adjusted), or continue generating them purely at runtime?

#### Basic view — static DOM (Prep Area 2)

- **Status:** ✅ Effectively ready.
- all three hardcoded-9 loop bounds replaced with `cubeSize * cubeSize`,
  `buildCubeFace()`, `update()`, and `updateSelective()` now read `cubeSize`
  from model state and iterate N×N stickers for any cube size.
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
| Circular view — 3 TS + 1 SVG normative fixes | Small  | ✅ Done                         | [detail doc](./circular-view-multi-size-prep-requirements.md) |
| Basic view — 3 hardcoded-9 sites             | Small  | ✅ Done                         | -                                                             |
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
