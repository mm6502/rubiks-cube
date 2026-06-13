---
title: 'refactor: Clean up dead code and unused exports flagged by fallow'
type: refactor
status: completed
date: 2026-06-06
---

## Summary

Clean up unused exports, dead files, unresolved imports, duplicate exports, and
stale suppressions reported by `npx fallow dead-code`. Excludes the
`src/views/basic-2/` module (still under active development) and CSS module
false positives. Target is 0 actionable fallow findings outside basic-2.

## Problem Frame

The codebase has accumulated dead code from decomposition refactors (circular
and flat touch-handler split, barrel re-exports) and from the shared barrel at
`src/views/basic/shared.ts`. Fallow reports 8 unused files, 67 unused exports, 9
unused types, 2 unresolved imports, 2 duplicate exports, and 3 stale
suppressions. Most of these fall into three buckets:

1. **basic-2** — 7 unused files + ~18 CSS exports. Actively developed, out of
   scope for this plan.
2. **basic/shared.ts** — 20+ re-exports from a barrel file that nothing imports
   (except 2 basic-2 files using `@/views/basic/shared`). The file served an
   ESLint workaround but is now dead.
3. **Scattered dead exports** — internal-only functions marked `export` after
   decomposition, unused types, false positives from `import.meta.glob`, stale
   suppression comments.

## Requirements

- **R1.** `basic/shared.ts` and its 20+ re-exports are either removed or
  replaced with direct imports in the 2 basic-2 consumers.
- **R2.** All internally-only function exports (`classifyCenterSubType`,
  `getAvailableFaces`, `setEventBus`, `defaultWholeCubeNotationPolicy`) are
  de-exported (remove `export` keyword) or removed if truly dead.
- **R3.** Unused types (`FaceSelectionState`) are removed.
- **R4.** False-positive fallow hits (`default` exports via `import.meta.glob`,
  barrel re-exports like `EventName`, `NavDirection`, `ViewModule`,
  `TouchHandlerState`, `StickerLookupMap`, `BasicVariant`, `getViewFactory`) are
  suppressed with `// fallow-ignore-file unused-export` comments, not deleted.
- **R5.** Unresolved imports in `main.ts` and `main.test.ts` are investigated
  and fixed.
- **R6.** Duplicate exports (`isInLbdDeadZone`, `view-command-btn`) are
  resolved.
- **R7.** Stale suppression comments (3 locations) are removed.
- **R8.** All tests pass and `npx fallow dead-code` reports zero actionable
  findings outside `src/views/basic-2/`.

## Key Technical Decisions

1. **Remove `basic/shared.ts` rather than fixing it.** Rationale: The file is a
   barrel re-export layer for basic views that no consumer uses (except 2
   basic-2 files that import 1-2 symbols each). Basic-2 should import directly
   from the source modules instead of through a dead barrel. This eliminates 20+
   fallow findings at once.

2. **De-export rather than delete internal-only functions.** Rationale:
   Functions like `classifyCenterSubType`, `getAvailableFaces`, and
   `defaultWholeCubeNotationPolicy` are called internally in their own files.
   Removing `export` keeps them accessible within the module while fixing the
   fallow warning.

3. **Suppress false positives with `// fallow-ignore-file` comments.**
   Rationale: `default` exports consumed via `import.meta.glob` and barrel
   re-exports (`EventName`, `NavDirection`) are intentional API surface.
   Deleting them would break consumers. A file-level suppression is the correct
   signal to both fallow and future readers.

4. **`setEventBus` — keep exported.** Rationale: Called by `Application` from a
   different module. Fallow may not trace the dynamic assignment path. This is a
   legitimate public API.

## Implementation Units

### U1. Remove `src/views/basic/shared.ts` and rewire basic-2 consumers

**Goal:** Eliminate the dead barrel file and its 20+ re-exports from the fallow
report.

**Requirements:** R1

**Files:**

- Delete: `src/views/basic/shared.ts`
- Modify: `src/views/basic-2/initialization.ts` — replace
  `import { getDefaultVectors } from '@/views/basic/shared'` with direct import
  from `@/views/basic/navigation`
- Modify: `src/views/basic-2/basic-2-view.ts` — replace shared barrel imports
  with direct imports from the original modules

**Approach:**

1. Read `basic-2/initialization.ts` and `basic-2/basic-2-view.ts` to identify
   exactly which symbols they import from `@/views/basic/shared`.
2. Replace each import with a direct import from the original module (e.g.,
   `@/views/basic/navigation`, `@/views/basic/ghost-stickers`).
3. Delete `src/views/basic/shared.ts`.
4. Run `npx tsc --noEmit` and `npm test` to verify.

**Test scenarios:**

- Basic-2 view still initializes and renders correctly after import change
- No TypeScript errors from removed barrel file
- All existing tests pass

**Verification:** `npx fallow dead-code` no longer reports
`src/views/basic/shared.ts` as an unused file.

---

### U2. De-export internal-only functions

**Goal:** Remove `export` keyword from functions that are only called internally
within their own file.

**Requirements:** R2

**Dependencies:** None

**Files:**

- Modify: `src/cube/utils/cubie.ts` — `classifyCenterSubType` (line 142)
- Modify: `src/cube/utils/face-utils.ts` — `getAvailableFaces` (line 94)
- Modify: `src/interaction/move-inference.ts` — `defaultWholeCubeNotationPolicy`
  (check line)

**Approach:**

1. For each function, verify via grep that it is only called within its own file
   (already confirmed in Phase 1 research).
2. Remove the `export` keyword, making each function module-private.
3. Run tests to confirm no breakage.

**Test scenarios:**

- All existing tests pass (these functions are already tested internally)

**Verification:** `npx fallow dead-code` no longer reports these exports.

---

### U3. Remove unused type `FaceSelectionState`

**Goal:** Delete the unused type export.

**Requirements:** R3

**Files:**

- Modify: `src/interaction/types.ts` — remove `FaceSelectionState` export

**Approach:**

1. Confirm via grep that `FaceSelectionState` is not imported anywhere.
2. Remove the type definition.
3. Check for barrel re-exports that might reference it.

**Verification:** `npx fallow dead-code` no longer reports `FaceSelectionState`.

---

### U4. Suppress fallow false positives

**Goal:** Add file-level suppression comments to files whose exports are
intentional API surface that fallow cannot trace.

**Requirements:** R4

**Files:**

- Modify: `src/views/circular/index.ts` — add
  `// fallow-ignore-file unused-export` (default export via import.meta.glob)
- Modify: `src/views/flat/index.ts` — same
- Modify: `src/views/basic/index.ts` — same (default +
  createBasicInteractionAdapter)
- Modify: `src/cube/types/cubie.ts` — add `// fallow-ignore-file unused-type`
  (CubieSubType const+type pattern)
- Modify: `src/types/events.ts` — add `// fallow-ignore-file unused-type`
  (EventName barrel re-export)
- Modify: `src/types/geometry.ts` — add `// fallow-ignore-file unused-type`
  (NavDirection barrel re-export)
- Modify: `src/view-manager/view-registry.ts` — add at top:
  `// fallow-ignore-file unused-export unused-type` (getViewFactory +
  ViewModule)
- Modify: `src/views/basic/basic-view.ts` — add
  `// fallow-ignore-file unused-type` (BasicVariant re-export)
- Modify: `src/views/circular/circular-view.ts` — add
  `// fallow-ignore-file unused-type` (StickerLookupMap? verify)
- Modify: `src/views/circular/touch-handler.ts` — add
  `// fallow-ignore-file unused-type` (TouchHandlerState? verify)

**Approach:**

1. For each file, add the suppression comment on line 1 (above any imports).
2. For `view-registry.ts`, suppress both `unused-export` and `unused-type` since
   both `getViewFactory` and `ViewModule` are flagged.
3. For `StickerLookupMap` and `TouchHandlerState`, verify they are used before
   suppressing.

**Test scenarios:** Not applicable — comments only.

**Verification:** `npx fallow dead-code` no longer reports these as unused.

---

### U5. Fix unresolved imports

**Goal:** Investigate and fix the 2 unresolved imports in `main.ts` and
`main.test.ts`.

**Requirements:** R5

**Files:**

- Investigate: `src/main.ts` — find which import is unresolved
- Investigate: `src/main.test.ts` — find which import is unresolved

**Approach:**

1. Run `npx tsc --noEmit` to see exact error messages for unresolved imports.
2. Fix each: either add the missing module, correct the import path, or remove
   the dead import.
3. Verify clean compilation.

**Test scenarios:**

- `npx tsc --noEmit` passes with zero errors
- All existing tests pass

**Verification:** Zero TypeScript errors. Fallow no longer reports unresolved
imports.

---

### U6. Resolve duplicate exports

**Goal:** Resolve the 2 duplicate export conflicts.

**Requirements:** R6

**Files:**

- `src/views/circular/touch-handler-hit-testing.ts` — defines `isInLbdDeadZone`
  (line 196)
- `src/views/circular/touch-handler-overlays.ts` — re-exports as
  `isInLbdDeadZone` (line 599), already suppressed with
  `// fallow-ignore-next-line duplicate-export`

**Approach:**

1. `isInLbdDeadZone`: Already handled — the overlays version is a thin wrapper
   that calls the hit-testing version. The suppression comment at line 598 is
   valid. Verify the suppression is correctly placed (it's at line 598 for the
   export at line 599). This is NOT stale — keep the suppression.
2. `view-command-btn`: This is a CSS class name used in
   `command-renderer.ts:547` via `this.styles['view-command-btn']`. Fallow
   likely detects it as duplicate because both the CSS module and test files
   reference it. Investigate the exact conflict and add a suppression if it's a
   false positive.

**Verification:** `npx fallow dead-code` no longer reports duplicate exports.

---

### U7. Remove stale suppressions

**Goal:** Remove 3 stale fallow suppression comments that no longer suppress
anything.

**Requirements:** R7

**Files:**

- Modify: `src/styles/buttons.module.css` — remove stale suppression at line 95
- Modify: `src/view-manager/view-manager.module.css` — remove stale suppression
  at line 408
- Modify: `src/views/circular/touch-handler-overlays.ts` — check if suppression
  at line 598 is stale (the `isInLbdDeadZone` duplicate export)

**Approach:**

1. Read each file at the specified line to identify the suppression comment.
2. Remove the comment.
3. Run fallow to confirm no new issues appear.

**Test scenarios:** Not applicable — comment removal only.

**Verification:** `npx fallow dead-code` reports 0 stale suppressions.

---

### U8. Final verification and quality gate

**Goal:** Confirm all fallow findings outside basic-2 are resolved and all tests
pass.

**Requirements:** R8

**Dependencies:** U1, U2, U3, U4, U5, U6, U7

**Approach:**

1. Run `npx tsc --noEmit` — must exit 0.
2. Run `npm test` — all tests must pass.
3. Run `npx fallow dead-code` — verify zero unused files, unused exports, unused
   types, unresolved imports, duplicate exports, and stale suppressions outside
   `src/views/basic-2/`.
4. Review fallow output for any new issues introduced by the cleanup.

**Verification:**

- `npx tsc --noEmit` exits 0
- `npm test` passes all tests
- `npx fallow dead-code` reports zero actionable findings outside basic-2

## Sources / Research

- `npx fallow dead-code --format json` (full output, 2026-06-06)
- `src/views/basic/shared.ts` — barrel re-export file, 20+ exports, 0 importers
  except basic-2 (2 files)
- `src/views/basic-2/initialization.ts:5` — imports `getDefaultVectors` from
  `@/views/basic/shared`
- `src/views/basic-2/basic-2-view.ts:49` — imports from `@/views/basic/shared`
- `src/view-manager/view-registry.ts:73` — uses `import.meta.glob` with
  `.default` (explains false-positive `default` exports)
- `src/views/circular/touch-handler-overlays.ts:598-599` — existing
  `// fallow-ignore-next-line duplicate-export` for `isInLbdDeadZone`
