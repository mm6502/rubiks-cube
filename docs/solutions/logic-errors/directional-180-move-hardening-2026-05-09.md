---
title: Directional 180-degree move hardening
date: 2026-05-09
category: logic-errors
module: cube-controller-notation-animation
problem_type: logic_error
component: development_workflow
symptoms:
  - Directional half-turn notation like U2' could regress because parser history
    animation and event seams were only indirectly covered
  - Circular animation and move event payloads relied on implicit signed-angle
    assumptions instead of explicit checks
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - directional-180
  - move-notation
  - parser
  - animation
  - undo
  - event-payload
---

# Directional 180-degree move hardening

## Problem

Directional half-turn notation such as U2' added a signed direction to moves
that still land on the same cube state as U2. Code review exposed gaps where
that signed behavior was not locked down directly enough across controller
events, drag promotion, parser behavior, and animation tie-breaking.

## Symptoms

- MOVE_EXECUTED emission in the controller still depended on a type-suppression
  style shape instead of proving the move definition was present before
  emitting.
- Circular-view animation behavior for exact 180-degree transitions depended on
  implicit direction handling and lacked a regression test for deterministic
  tie-breaking.
- Adapter hooks could accidentally return 2-move notation directly even though
  far-drag promotion is supposed to happen in shared interaction logic.
- Parser, inference, and undo flows had broad coverage but not enough direct
  tests around U2', inverse-of-inverse behavior, and signed half-turn payloads.

## What Didn't Work

- Treating half-turns as effectively directionless. For this feature, R2 and R2'
  are distinct inverse partners even if they reach the same cube state.
- Relying on integration behavior alone. That left parser angle sign, toFar
  promotion, undo payloads, and animation tie-breaks under-specified.
- Leaving adapter expectations implicit. Without a documented contract, a custom
  adapter could return R2 directly and conflict with shared far-drag promotion.

## Solution

The fix hardened the feature at each seam where signed half-turn semantics
matter.

In the controller, the MOVE_EXECUTED path now emits only when both the move
result and resolved definition exist, so TypeScript narrows correctly and no
cast is needed:

```ts
if (emitEvent && lastResult && lastDefinition) {
  Application.eventBus.emit(EventName.MOVE_EXECUTED, {
    moveDetails: {
      notation: move,
      definition: lastDefinition,
      movedCubies: lastResult.movedCubies,
    },
    preState: lastResult.preState,
    postState: lastResult.postState,
  });
}
```

In the parser, directional half-turn notation still reuses the canonical 2-turn
lookup path, then flips the resolved angle sign when the original token was
2-prime. In the interaction layer, the adapter contract is now documented
explicitly: inferAxisCircleNotation should return only base or prime
quarter-turn notation, while shared logic owns far-drag promotion to 180-degree
moves. The move-inference typing was also tightened so default angles are
represented as QuarterTurn values rather than loose numeric literals.

The tests were extended exactly where the review found gaps:

- direct parser angle coverage for U2' and L2', plus inverse and
  inverse-of-inverse checks for additional directional half-turn forms
- direct toFar coverage for quarter-turn to 2-turn promotion, including prime
  notation
- a regression test for deterministic negative-180 animation tie-breaking
- undo integration coverage proving U2' returns the cube to solved state
- event assertions proving undo and redo payloads preserve signed 180-degree
  definitions

## Why This Works

The feature now treats directional 180-degree notation as a signed rotation all
the way through the stack instead of as a cosmetic parser variant. The parser
resolves the right sign, history logic can distinguish inverse partners,
controller events carry the resolved definition safely, adapters no longer
compete with shared far-drag promotion, and animation code has a locked
regression test for the exact 180-degree tie case.

That combination removes the gap between state equivalence and behavioral
equivalence: even when two half-turn notations reach the same cube state, the
system still preserves the direction needed for undo, redo, and animation.

## Prevention

- Add direct tests whenever a move-notation feature introduces a new semantic
  distinction, even if existing integration tests already pass.
- Keep inverse laws explicit for half-turns: inverse(inverse(move)) should
  round-trip for both 2 and 2-prime forms.
- If shared logic owns far-drag promotion, document that ownership at the
  adapter boundary and back it with focused tests.
- Prefer controller guards that let TypeScript prove payload completeness
  instead of repairing uncertainty with casts.
- Preserve deterministic animation assertions for exact 180-degree transitions
  so future refactors cannot reintroduce ambiguous keyframe direction.

## Related Issues

- Related area:
  [../ui-bugs/circular-ghost-selective-hide-2026-05-03.md](../ui-bugs/circular-ghost-selective-hide-2026-05-03.md)
- Touched implementation areas: src/cube-controller.ts,
  src/cube/core/move-parser.ts, src/interaction/move-inference.ts,
  src/interaction/types.ts, src/views/circular/animations.test.ts
