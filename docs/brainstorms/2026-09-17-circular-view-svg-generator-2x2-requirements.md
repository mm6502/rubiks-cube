---
date: 2026-09-17
topic: circular-view-svg-generator-2x2
---

# Circular View SVG Generator — 2×2 Support and Repeatable Per-N Authoring (Requirements)

## Summary

Build a parameterized SVG generator for the Circular view that emits a complete
conforming per-N SVG from a cube size and a small set of geometric parameters.
Its first use is 2×2, which becomes a supported, usable Circular view size. The
generated SVG is then hand-tuned, and the tuning is fed **back into the
generator** so the procedure stays repeatable. The tuned generator is then run
for 4×4 as a proof of concept to show the procedure generalizes to another N.

---

## Problem Frame

The Circular view renders each sticker at the intersection of two axis rings,
with one hand-authored SVG per cube size. Only `3×3` has an authored file
(`src/views/circular/view.svg`), and the view declares exactly that:

```ts
getSupportedSizes(): number[] {
    // Circular view is SVG-per-N; only 3×3 has an authored SVG so far.
    return [3];
}
```

Switching to any other size therefore disables the view entirely — it is
unavailable, not merely imperfect. Sizes 2, 4, 5, 6, and 7 all hit this wall.

The TS layer's geometry and id-parsing are already prepared for other sizes:
`data-cube-size` is read from the SVG root, far-face coordinates derive from
`cubeSize - 1`, and the sticker ID pattern accepts multi-digit indices. The
blocker is the absence of a per-N SVG asset — but not that asset alone: per-size
SVG selection and the enabled-sizes list still require code changes (R8, and the
loader noted under Outstanding Questions).

Authoring one by hand is possible — `view.svg` is 363 lines with 54 sticker
circles, 9 axis circles, 9 mask rects, 6 face ellipses, 6 face labels, and 72
ghost circles. But hand-authoring does not scale: repeating it for each of the
five remaining sizes re-pays the full cost per size, and geometric mistakes
surface only in the browser. The existing
`docs/brainstorms/circular-view-svg-geometry-spec.md` already captures the
geometric invariants for any N and states explicitly that it exists so "a future
generator script can be validated against these rules" — that generator does not
exist yet.

2×2 is the cheapest size that exercises the whole procedure: it has no middle
layers, so it is not a trivial scale-down of 3×3.

---

## Requirements

**Generator**

- R1. A generator produces a complete Circular view SVG for a given cube size N
  and a set of geometric parameters, as a file committed to the repo.
- R2. The generator output satisfies the SVG Conformance Checklist in
  `docs/brainstorms/circular-view-multi-size-prep-requirements.md` — root
  `data-cube-size`, axis circles with `data-axis` / `data-layer-index` and
  `{AXIS}-layer-{INDEX}` ids, sticker circles with `data-face`, `data-pos`, and
  `sticker-{FACE}-{POS}` ids, face ellipses and labels carrying `data-face`.
- R2a. The generator emits the three `face-label-L` / `face-label-B` /
  `face-label-D` elements the interaction dead-zone depends on. The Conformance
  Checklist does not cover these ids; this requirement is their sole contract.
- R3. The generator emits the ghost sticker layer, deriving it from the rule in
  Key Decisions rather than from hand-placed coordinates.
- R4. The generator validates its own output before writing, and reports
  violations rather than emitting a non-conforming SVG. Validation covers:
  - the geometric invariants (I1–I5) from `circular-view-svg-geometry-spec.md`;
  - the R2 / R2a conformance contract — element ids, classes, and
    data-attributes the Circular view's runtime modules resolve at load time;
  - the face ellipse, mask, and ghost layers, which I1–I5 do not constrain.
- R5. The generator omits layer features that do not exist at a given N —
  notably the middle-layer rings and their notation labels, which have no
  equivalent at N=2. Notation labels are derived from the existing size-aware
  mapping rather than a per-size table (see Dependencies / Assumptions).
- R6. The generator accepts the size as a parameter such that running it for a
  different N requires no code changes, only a new parameter set. It lives under
  `scripts/circular-svg/` as a standalone node script with an `npm run`
  shortcut, following the `scripts/og-image/` precedent.

**2×2 support**

- R7. A conforming 2×2 SVG exists and the Circular view loads it when the active
  cube is 2×2.
- R8. `getSupportedSizes()` for the Circular view includes 2.
- R9. The 2×2 Circular view is functionally usable: stickers reflect cube state,
  selection and highlighting work, and drag/sticker interaction produces the
  correct moves.
- R10. Layout reads correctly at 2×2 — rings, stickers, labels, and face
  ellipses are legible and positioned sensibly, with no overlapping or
  mispositioned elements.
- R11. 3×3 behavior is unchanged; no visual or interaction regression.

**Knowledge capture**

- R12. The hand-tuning applied after generating the 2×2 SVG is fed back into the
  generator, so re-running the generator reproduces the tuned result rather than
  overwriting it. The tuning loop ends when a generator run requires no manual
  post-edit to reproduce the accepted 2×2 SVG; any residual hand-edit must be
  expressed as a named generator parameter or override. The accepted SVG and a
  rendered reference image are committed so the visual parameters are reviewable
  per-parameter rather than in aggregate.
- R13. The generator, its parameters, and the derived ghost rule are documented
  in `scripts/circular-svg/README.md` — mirroring `scripts/og-image/README.md` —
  well enough that a future size is produced by choosing parameters, not by
  re-deriving geometry.

**4×4 proof of concept**

- R14. The tuned generator is run for 4×4 and produces a usable result,
  demonstrating the procedure generalizes beyond the size it was tuned on.
- R15. 4×4 is available to try in the app so the result can actually be
  inspected; whether it stays enabled is decided after trying it, not by this
  document.

**Validation targets**

- R16. N=5 is used as a non-target validation size for the ghost rule. It is not
  shipped, not added to `getSupportedSizes()`, and not selectable in the app —
  the generated asset is validated and then discarded. Ghosts derived from the
  1-edge class are `6 × (4N − 8)` of a total `24N`, so their share is `1 − 2/N`:
  absent at N=2, a third at N=3, and exactly half at N=4. N=5 is the smallest
  size where that class is a strict majority (60%), so it is the first size that
  exercises the rule where it is most likely to be wrong.

---

## Key Decisions

- **Generator, not hand-authoring.** The goal is a repeatable per-N procedure.
  Hand-authoring a single 2×2 SVG would deliver the size but leave the procedure
  unproven, and each later size would re-pay the full authoring cost.

- **Tuning flows back into the generator.** Manual adjustment after generation
  is expected and acceptable, but the generator is the source of truth. A tuned
  file that the generator cannot reproduce breaks the procedure at the first
  size and silently converts later sizes back into hand-authoring. Re-running
  the generator must not discard tuning. "Tuned" means zero required hand-edits
  — a residual hand-edit that cannot be expressed as a generator parameter is a
  failure of this decision, not an accepted cost.

- **The ghost layer is a parameter set, not hand-placed coordinates.** Ghost
  coordinates are fully determined by generator parameters (per-class radius
  offset, direction, and per-axis exclusions), so ghost tuning — like every
  other tuning — flows back into the generator and R12's no-diff property holds
  for ghosts as well as stickers.

- **The ghost rule is derivable, and is the generator's responsibility.**
  `circular-view-svg-geometry-spec.md` deliberately excludes ghost stickers as
  requiring "design judgment beyond pure geometric derivation". Auditing the 72
  ghosts in the existing 3×3 SVG shows the opposite — the placement is
  deterministic:
  - **Multiplicity follows grid-cell class.** A sticker with 2 grid edges (a
    corner) gets 2 ghosts, 1 edge gets 1, 0 edges (a face centre) gets 0. This
    holds for all 54 stickers: 24 corners × 2 + 24 edges × 1 = 72.
  - **Each ghost is tagged with an axis circle the target lies on.** The ghost
    is the target displaced tangentially along that circle by exactly one
    sticker radius ($r_s = 7$; measured 6.99–7.94). The tangent relationship is
    exact — cosine similarity against the circle tangent is 0.998–0.999 across
    all 72 ghosts, against a "toward the source sticker" hypothesis that only
    reaches 0.03 in the worst case.
  - **Direction is opposite to the source-to-target travel.** The ghost sits on
    the side the source sticker left, not the side it arrives from — 70 of 72
    ghosts have the opposite sign to the source→target arc; the 2 exceptions are
    near-zero angles where the sign is numerically unstable.
  - **Source is the adjacent sticker across that edge** on the neighbouring
    face, whose colour is copied at render time.

  This makes the ghost layer generatable and its correctness checkable, rather
  than requiring per-size manual placement.

- **2×2 is not a scaled 3×3.** It has no middle layers, so the middle-layer
  rings and their notation labels have no counterpart. The generator must
  express "this size has no layer here" rather than emitting degenerate
  elements.

- **4×4 is a proof of concept, not a shipping size.** It exists to show the
  procedure generalizes. It stays available to try during evaluation; the
  decision to keep it enabled is explicitly deferred until after it has been
  used.

- **The generator is a standalone script under `scripts/circular-svg/` with an
  `npm run` shortcut**, following the `scripts/og-image/` precedent: it computes
  geometry and writes a committed SVG artifact, and has no role in the app
  build. Per-size parameters live with the script, so adding a size means adding
  a parameter set, not editing generator logic.

- **The geometric spec is the contract — but not the whole contract.** The
  generator validates against I1–I5 from `circular-view-svg-geometry-spec.md` —
  $(N-1)\cdot\Delta r < d < 2\cdot r_{min}$ and $2\cdot r_s < \Delta r$ as the
  algebraic constraints, plus numerical checks for sticker clearance and
  third-axis non-intersection. I1–I5 constrain rings and stickers only; they say
  nothing about face ellipses, mask holes, the ghost layer, or the conformance
  contract, so a clean I1–I5 run is not evidence the SVG is loadable or usable.
  Validation therefore also covers the R2 / R2a contract and those layers (R4).
  Validation failing is a generator error, not a shipping tolerance.

---

## Scope Boundaries

- **Runtime SVG generation from `cubeSize` is out of scope.** No per-N assets,
  geometry computed at initialization. That is a separate direction with its own
  trade-offs (loses the ability to open and adjust an SVG in an editor) and is
  the subject of other plans.
- **Tuning and shipping sizes 5–7 is out of scope.** N=5 appears only as a
  validation target (R16) — the asset is validated and discarded, never shipped.
- **4×4 quality beyond "usable" is out of scope.** Further tuning of 4×4 and any
  knowledge capture from it belongs to a follow-up. Re-running the generator for
  4×4 is therefore expected to overwrite un-captured 4×4 _visual_ tuning — only
  2×2 has a captured tuning guarantee. This does not apply to ghost-rule
  failures: a ghost mismatch at any size is a generator bug to fix, not visual
  tuning.
- **`src/views/circular/view.svg` is never regenerated in place.** The shipping
  3×3 asset is not overwritten by generator output. Generated N=3 is compared
  against it off-repo (per AE3) and discarded — regenerating 3×3 is a validation
  step, not a path to landing a new 3×3 file.
- **No changes to the Circular view's interaction model.** Touch, drag, halo,
  cube-walking, and zoom/pan behavior stay as they are; this work is about the
  SVG asset and the procedure that produces it.
- **No changes to core cube, move, or persistence layers** — already
  size-agnostic.
- **No new notation or move families** for non-3 sizes.

---

## Acceptance Examples

- AE1. **Covers R4, R6.** Running the generator with a parameter set that
  violates $(N-1)\cdot\Delta r < d < 2\cdot r_{min}$ reports the violation and
  writes no SVG.
- AE2. **Covers R5.** Generating for N=2 produces no middle-layer rings and no
  E/M/S notation labels.
- AE3. **Covers R1, R2, R2a.** Generating for N=3 with the parameters extracted
  from `view.svg` produces a conforming SVG whose sticker positions match the
  existing file; differences are limited to those explained by the parameter
  set.
- AE4. **Covers R3.** The generated ghost layer for N=3 matches the existing 72
  ghosts in multiplicity, tag, offset magnitude, and direction.
- AE5. **Covers R7, R8.** With the 2×2 SVG in place and size 2 active, the
  Circular view is offered in the picker and renders rather than being disabled.
- AE6. **Covers R12.** Re-running the generator after tuning reproduces the
  tuned SVG byte-for-byte (or produces no diff), rather than reverting to the
  pre-tuning output. This holds for the ghost layer as well as the stickers.
- AE7. **Covers R11.** Existing 3×3 Circular view tests pass unchanged.
- AE8. **Covers R14.** After any 4×4 tuning, re-running the generator for 4×4
  produces no diff. The proof of concept passes only if the generator, not a
  hand-edited file, is the source of truth for 4×4.
- AE9. **Covers R16.** The generated ghost layer for N=5 matches an
  independently computed expected set — multiplicity, axis/layer tag, offset
  magnitude and direction, and source — with any mismatch treated as generator
  failure rather than a fallback to hand-tuning.
- AE10. **Covers R4.** Running the generator with an SVG whose face ellipses
  overlap, whose mask holes are missing, or whose ghost layer is inconsistent
  reports the violation and writes no SVG.
- AE11. **Covers R9, R10.** At 2×2, stickers reflect cube state after a move,
  selection and highlighting update on interaction, a sticker drag produces the
  correct move, and the rings, stickers, labels, and face ellipses are legible
  with no overlap or mispositioning on visual inspection.
- AE12. **Covers R13.** The committed `scripts/circular-svg/README.md` contains
  the parameter table and the derived ghost rule, and adding a new N requires
  only a new parameter set — no generator code change.
- AE13. **Covers R15.** With 4×4 enabled, the Circular view at size 4 is
  reachable in the app and renders the generated asset.

---

## Success Criteria

- 2×2 Circular view is usable for real work — not merely rendering without
  error, but usable for inspecting state and making moves.
- The procedure is demonstrably repeatable: after 2×2, producing 4×4 requires
  only new parameters and the expected visual tuning, with no re-derivation of
  geometry or ghost placement.
- The generator's validation catches geometric violations before they reach the
  browser.
- The knowledge captured is sufficient that a future size does not require
  re-reading the 3×3 SVG to rediscover rules.

---

## Dependencies / Assumptions

- The SVG Conformance Checklist and R1–R5 of
  `circular-view-multi-size-prep-requirements.md` are satisfied in the current
  codebase (shipped 2026-05-08); the generator builds on that contract.
- Geometric invariants and free parameters are as captured in
  `circular-view-svg-geometry-spec.md`. The generator validates against them; if
  implementing validation reveals a gap in the spec, the spec is updated rather
  than the validation weakened.
- The ghost rule was derived from the 3×3 SVG and holds for all 72 of its
  ghosts. That it holds for other N is an assumption this work tests. The
  evidence is 2×2, 4×4, and the non-target validation size N=5 (R16) — because
  2×2 and 4×4 bracket the rule's edge class rather than exercising it, N=5 is
  what actually probes the generalizable claim. A mismatch at any of the three
  is a generator failure to fix, not a size to demote to hand-tuning.
- Face labels and their tilt behavior are driven by face identity, not size;
  non-3 sizes reuse the same six labels. Notation labels (the per-ring move
  annotations) ARE size-dependent and are derived from the existing size-aware
  mapping (`axisLayerToNotation`, called with `cubeSize`) rather than a per-size
  table.
- The known runtime-generated overlay elements (halo, face overlay, detection
  bands) derive from the static SVG elements and continue to work as long as
  those elements are present and correctly placed.
- `scripts/og-image/` establishes the in-repo precedent for a generator script
  that computes geometry and writes an SVG artifact.

---

## Outstanding Questions

### Deferred to Planning

- Where the 2×2 SVG file lives alongside `view.svg`. The 3×3 asset itself is not
  regenerated in place (see Scope Boundaries); producing and comparing a
  generated 3×3 remains a validation step.
- How the view selects an SVG for the active size — the loader is currently a
  static import.
- The exact parameter values for 2×2 and 4×4, derived from the invariants at
  generation time.
- Whether 2×2's lack of middle layers requires any view-side handling beyond the
  generator omitting those elements.
