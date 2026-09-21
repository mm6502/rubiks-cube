# Shared rotation animation primitive — Requirements

**Status:** Draft **Date:** 2026-09-20 **Scope:** Standard **Origin:** Debugging
investigation of the Basic view's Firefox "unwind" note
(`implementation-status.md`), which proved to be a wider defect.

## Problem

Basic view rotation animates by writing the **whole** orientation as one
`matrix3d(...)` and letting CSS interpolate it (`src/views/basic/rendering.ts`,
`.cube { transition: transform 0.25s }` in
`src/views/basic/basic-view.module.css`).

Matrix-to-matrix interpolation happens **component-wise on the matrix entries**,
not as a rotation of an angle. The interpolated value therefore leaves the
rotation group: the geometry shears. Two user-visible consequences:

- a delta near 180° or beyond does not travel the intended path;
- **interrupting** a transition mid-flight takes the in-progress,
  already-sheared matrix as the new starting point, so the next rotation visibly
  unwinds the wrong way.

The second is the reported symptom. It is reproducible in **both** Chromium and
Firefox, so it is a defect in this codebase's animation scheme, not a browser
quirk. See Assumptions for the measured evidence.

Move animations do not have this defect: `animateLayer`
(`src/views/basic/animations.ts`) already animates a **pivot** with WAAPI
`rotate3d`, i.e. it animates an _angle_. The two rotation systems therefore
solve the same underlying problem two different ways, and only one of them is
correct.

## Goals

- View rotation animates as a rotation of an angle, so no intermediate state can
  sheare the cube — including when a rotation interrupts another.
- One shared animation primitive serves **both** view rotation and move
  animations, so the codebase has a single rotation-animation mechanism instead
  of two.
- Animation duration has a single source of truth.
- View rotation honours `prefers-reduced-motion`, matching move animations.

## Non-goals

- Changing the persisted orientation format. Orientation stays the three
  orthonormal vectors (`viewRight`/`viewUp`/`viewForward`) in `BasicViewState`;
  only how a change is animated is in scope.
- Changing view rotation semantics (which face comes forward for a given gesture
  or key). The destination orientation is unchanged.
- Changing move-animation _timing_ or _easing_ as perceived today.
- Redesigning the ghost-strip visual concept.

## Requirements

### R1 — View rotation animates an angle, not a matrix pair

A view rotation must be animated by ramping an **angle about a known axis**, so
every intermediate frame is a valid rotation. The concrete acceptance test: at
no point during a view rotation does the interpolated transform leave the
rotation group (its rotation-block determinant stays 1).

### R2 — The rotation axis is derived from state per rotation

The axis differs by current orientation: across the 24 reachable orientations a
given rotation gesture uses **six** distinct world axes (±X, ±Y, ±Z), always by
90°. A fixed axis is not merely imprecise — it is wrong for essentially every
case (96/96 verified; see Assumptions). Orientation and axis must therefore be
derived together from current state at animation start.

### R3 — Interruption behaviour follows the existing Circular precedent

Rapid input is handled the way `updateSelective` already handles it in the
Circular view (`src/views/circular/rendering.ts`): a bounded pending queue, and
once **two or more** rotations are already waiting, further rotations **skip
their animation** and apply the orientation directly. This reuses an established
in-repo pattern rather than introducing a third overlord strategy.

Consequences:

- A single background drag commits two steps and must animate as **one** ramp
  over the full delta (`finalizeBackgroundGesture` already applies both steps
  before calling back once).
- Every animation starts from a settled 90° multiple about a known axis, so a
  sheared starting state is unrepresentable.

### R4 — View rotation honours `prefers-reduced-motion`

When reduced motion is requested, view rotation applies the new orientation
without animating, exactly as `animateMove` already does
(`src/views/basic/animations.ts`).

### R5 — One animation primitive, one duration

A single shared primitive performs a rotation animation, and both view rotation
and move animations call it. The animation duration is owned in one place rather
than restated in CSS and in code.

### R6 — `implementation-status.md` states the true defect

The known-issue entry currently describes a **Firefox-specific** failure of
`matrix3d` + `transition` that is "not carried over by default". Both claims are
wrong: the defect occurs in Chromium too, and it is live for the default view.
The entry must be corrected or removed; it must not be re-scoped to describe a
non-existent browser-specific limitation.

### R7 — Ghost strips hide for the whole sequence and return on a settled signal

Ghost strips are hidden during a rotation for two reasons: they distract during
animation, and while the orientation is changing there is no coherent reading of
what a strip represents. That reasoning applies to a whole _sequence_ of
rotations, not to a single one — so strips stay hidden for the entire sequence
and return only once the cube has settled.

There is no such signal today. The existing approximations are local: a
hard-coded 200 ms delay for synchronous rotation entry points, `0` for callers
that already awaited their own animation, and a `transitionend` listener used
only to _hide_ a strip. The settled signal must be introduced as part of this
work, and the delay constants and the `turnAlreadyFinished` parameter must
retire with it.

### R8 — State stays immediate; the animation is only a visual layer

Adopting an awaitable animation must not move state or events behind it. The
orientation, `STATE_CHANGED`, and the selection re-anchor (see
`src/views/basic/reanchor.ts`) all apply immediately, exactly as today; the
animation only catches up visually.

This is a constraint on the refactor, not a change: it is how the code already
behaves, and it is the property that keeps persistence and linked views from
observing an orientation that the app no longer holds. Re-anchoring in
particular must not be deferred to the end of an animation — its target
interface reads orientation _before_ and _after_ the mutation, and delaying it
would resolve the captured screen cell against an orientation that has already
moved on.

## Success criteria

- A rapid sequence of view rotations — including a rotation that interrupts
  another — never shows the cube unwinding against the intended direction, in
  Chromium and Firefox.
- A two-step background drag reads as one continuous half-turn.
- Ghost strips stay hidden for a whole rapid sequence of rotations and return
  once, after the cube settles — not between rotations.
- `getState()` never reports an orientation the cube has not yet reached while a
  rotation is still animating.
- Enabling reduced motion makes view rotation instantaneous.
- Move animations are visually unchanged.
- The `matrix3d` writer is no longer the mechanism that animates a view
  rotation.

## Assumptions

- **The >180° framing in the issue is not achievable by the app.** `steps` is
  capped at 2 (`src/views/basic/touch-handler.ts`), and `rotateViewToFace`
  applies at most two steps. The reachable trigger is therefore interruption,
  not a large delta. _(Verified in source.)_
- **Component-wise matrix interpolation shears the geometry.** Measured in a
  standalone reproduction in headed Chromium and headed Firefox, which agreed:
  identity → net-270° did not travel the intended path, and the interpolated
  rotation block degenerated mid-flight. _(Verified by measurement.)_
- **A fixed-axis pivot cannot animate view rotation.** Verified exactly over all
  24 orientations × 4 rotations: a fixed world-Y pivot is wrong in 96/96 cases,
  while a state-derived axis is correct in 96/96. _(Verified by computation.)_
- **The engine used for automated Firefox verification is not the user's
  browser.** Playwright's bundled Firefox is a patched build and cannot stand in
  for the shipped Firefox; browser-specific claims must be confirmed in the real
  browser. _(Verified.)_

## Deferred

Out of scope for this work, recorded so planning does not absorb them:

- Any change to how orientation is _persisted_ or _serialized_.
- Unifying the **reparenting** mechanics of move animations (pivot creation,
  cubie re-homing) with view rotation. The shared surface is the animation
  technique, not the DOM handling around it; the two have genuinely different
  targets.
- Reworking the ghost-strip _concept_ itself. In scope is only when strips are
  revealed relative to a rotation sequence (R7).
