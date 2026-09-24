// Rendering for Basic view — per-cubie (no face divs)
import { Face, ReadOnlyCubeModel, Size2D, Vector3 } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils';

import * as cubieRendering from './cubie-rendering';
import {
    type RotationAnimation,
    animateRotation,
    animateTransformPair,
    prefersReducedMotion,
} from './animations';
import { type Orientation, type RotationPlan, axisToCss, planRotation } from './rotation-math';
import type { BaseAngles, BasicViewInternalData } from './types';

/**
 * CSS angle constants for basic view base orientation.
 */
export const BASIC_VIEW_ANGLES = {
    BASE_X: -25,
    BASE_Y: -35,
    PITCHED_BASE_X: 25,
    TILTED_BASE_Y: 35,
} as const;

/**
 * Maps an axis-aligned unit vector expressed in CSS 3D space to the
 * corresponding cube Face.
 */
function faceFromCSSDir(v: Vector3): Face {
    if (v.x === 1) return Face.R;
    if (v.x === -1) return Face.L;
    if (v.y === 1) return Face.D;
    if (v.y === -1) return Face.U;
    if (v.z === 1) return Face.F;
    return Face.B;
}

/**
 * What happened when a rotation was written.
 *
 * Returned rather than swallowed so the caller can close its rotation exactly
 * once, at the right moment — immediately for a settled write, or when the ramp
 * finishes. Both outcomes settle; a cancelled ramp settles too, which is why the
 * caller does not have to distinguish them.
 */
export type RotationResult =
    | { kind: 'settled' }
    | { kind: 'animating'; animation: Animation; finished: Promise<boolean> };

/**
 * Reads the cube's current orientation as the shape the rotation maths expects.
 */
function orientationOf(state: BasicViewInternalData): Orientation {
    return {
        viewRight: state.viewRight,
        viewUp: state.viewUp,
        viewForward: state.viewForward,
    };
}

/**
 * The rotation ramp currently animating, or null.
 */
function activePlan(state: BasicViewInternalData): RotationPlan | null {
    return state.rotationPlan ?? null;
}

/**
 * How far through a running ramp the cube is, as a 0..1 fraction.
 *
 * Read from `getComputedTiming().progress` rather than the clock, because that
 * is the value the compositor is actually rendering — the easing curve is
 * already applied, and it is `null` once the animation is done. Falls back to the
 * raw time fraction, then to the ramp's start, so an implementation without the
 * timing API degrades to "restart from the beginning" rather than jumping to the
 * end.
 */
function rampProgress(animation: Animation | undefined): number {
    if (!animation) return 1;
    try {
        const progress = animation.effect?.getComputedTiming().progress;
        if (typeof progress === 'number' && Number.isFinite(progress)) {
            return Math.max(0, Math.min(1, progress));
        }
    } catch {
        // A detached or already-released effect — treat the ramp as finished.
        return 1;
    }
    return 1;
}

/**
 * The angle a running ramp is at right now, in degrees.
 */
function currentRampAngle(state: BasicViewInternalData, animation: Animation | undefined): number {
    const plan = activePlan(state);
    if (!plan) return 0;
    const progress = rampProgress(animation);
    return plan.fromDeg + (plan.toDeg - plan.fromDeg) * progress;
}

/**
 * The transform text that sits *before* the rotation slot: the view's base tilt.
 *
 * The tilt is part of the cube's presentation, not its orientation — which is why
 * the rotation slot goes inside it, so the animation turns about a world axis
 * rather than the tilted one.
 */
function tiltPrefix(state: BasicViewInternalData, angles = baseAnglesOf(state)): string {
    return `rotateX(${angles.x}deg) rotateY(${angles.y}deg)`;
}

/**
 * The base tilt/pitch the view is currently *asked* for, from its flags.
 *
 * Separate from {@link tiltPrefix} so the rendered angles can be passed in: a
 * running presentation ramp animates between two of these, and the prefix has to
 * carry the frame's angles rather than the flags' current ones.
 */
export function baseAnglesOf(state: BasicViewInternalData): BaseAngles {
    return {
        x: state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X,
        y: state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y,
    };
}

/**
 * The `matrix3d(...)` for an orientation, in the column-major order CSS expects
 * the sixteen arguments to appear in.
 */
function basisMatrix(basis: Orientation): string {
    return (
        `matrix3d(${basis.viewRight.x},${basis.viewUp.x},${basis.viewForward.x},0, ` +
        `${basis.viewRight.y},${basis.viewUp.y},${basis.viewForward.y},0, ` +
        `${basis.viewRight.z},${basis.viewUp.z},${basis.viewForward.z},0, 0,0,0,1)`
    );
}

/**
 * Compose the cube element's full transform string.
 *
 * The order is load-bearing: `baseTilt · rotate3d(axis, angle) · matrix3d(base)`.
 * The rotation multiplies the basis from the left — exactly the slot the rotation
 * maths derives its axis for.
 */
function composeTransform(
    state: BasicViewInternalData,
    plan: RotationPlan | null,
    angleDeg: number,
    base: BaseAngles = state.renderedBase ?? baseAnglesOf(state)
): string {
    const basis = plan ? plan.base : orientationOf(state);
    if (!plan) return `${tiltPrefix(state, base)} ${basisMatrix(basis)}`;
    return `${tiltPrefix(state, base)} rotate3d(${axisToCss(plan.axis)},${angleDeg}deg) ${basisMatrix(basis)}`;
}

/**
 * Updates the cube element's transform so it shows the view's current orientation.
 *
 * This is the **single owner of the rotation lifecycle**. Every orientation-
 * changing path funnels through it — the rotation entry points, `resetView`,
 * `alignCubeToView`, `setState`, the keyboard/touch handlers, and the tilt and
 * pitch commands — so no caller has to remember to pair a "begin" with an "end",
 * which is where the previous three-way disagreement between paths came from.
 *
 * The orientation is mutated by the caller *before* this runs (R8): `getState()`,
 * `STATE_CHANGED` and the selection re-anchor must see the new orientation
 * immediately, and this function is only the visual layer.
 *
 * Three ways a call can land:
 *
 * - **Already correct, or `skipAnimation`.** Writes the settled transform and
 *   reports `settled`. `skipAnimation` is used by `setState`/`alignCubeToView`,
 *   where jumping is the intent, and by the tilt/pitch commands, which change the
 *   base tilt rather than the orientation.
 * - **Nothing in flight.** Starts a ramp from the rendered basis to the new
 *   orientation, on the axis derived from those two orientations.
 * - **A ramp in flight.** Extends or re-bases it — see `planRotation` — so the
 *   cube continues from where it is rather than restarting from a stale start.
 *   The previous animation is cancelled, and `fill: 'forwards'` is dropped once
 *   the new one starts, so only one animation is ever driving the element.
 *
 * @param state - The view's internal state.
 * @param skipAnimation - Jump straight to the settled transform.
 * @param stepAnchor - The pose after one elementary step of the gesture that
 *   produced the current orientation, when that gesture applied its steps before
 *   asking for a single animation (a far drag). A composed half turn is the same
 *   matrix either way round, so the gesture's sense has to come from one of its
 *   quarter turns — see `planRotation` in `rotation-math.ts`. Omitted by every
 *   entry point that rotates a single step at a time.
 * @returns Whether the rotation settled now or is still animating.
 */
export function updateRotation(
    state: BasicViewInternalData,
    skipAnimation?: boolean,
    stepAnchor?: Orientation
): RotationResult {
    if (!state.cubeElement) return { kind: 'settled' };

    const plan = activePlan(state);
    const previousAnimation = state.rotationAnimation;
    const target = orientationOf(state);

    // What the element is showing when nothing is ramping. Only consulted when
    // there is no plan; a running ramp carries its own goal.
    const rendered = state.renderedBasis ?? target;

    // The base tilt is a separate animation slot from the orientation rotation, so it
    // is resolved before the orientation branches below. A tilt/pitch toggle changes
    // these angles and *nothing else* — the orientation is identical before and after —
    // so without this it falls through every orientation branch as a no-op and can only
    // ever snap.
    //
    // It used to be animated implicitly by `transition: transform` on `.cube`, which
    // commit f63f041 removed because it would run a competing second animation against
    // the WAAPI rotation ramp. That removal silently un-animated tilt and pitch, which
    // is the reported regression: the commands still asked to skip the orientation
    // animation (correctly — there is no orientation to animate), leaving nothing at all
    // to drive the change.
    const renderedBase = state.renderedBase ?? baseAnglesOf(state);
    const requestedBase = baseAnglesOf(state);
    const baseChanged = renderedBase.x !== requestedBase.x || renderedBase.y !== requestedBase.y;

    if (skipAnimation === true) {
        state.rotationPlan = null;
        cancelRotationAnimation(state);
        cancelBaseAnimation(state);
        // Re-basing here is deliberate: a jump means nothing is on screen that a
        // later rotation should continue from.
        state.renderedBasis = target;
        state.renderedBase = requestedBase;
        state.cubeElement.style.transform = composeTransform(state, null, 0, requestedBase);
        return { kind: 'settled' };
    }

    // R4: honour `prefers-reduced-motion` by applying the new orientation without
    // animating, matching what `animateMove` already does for moves. The same
    // branch covers an environment with no Web Animations support at all (a bare
    // jsdom), where a ramp is impossible rather than merely unwanted — the
    // orientation still has to land.
    if (prefersReducedMotion() || typeof state.cubeElement.animate !== 'function') {
        state.rotationPlan = null;
        cancelRotationAnimation(state);
        state.renderedBasis = target;
        state.renderedBase = requestedBase;
        state.cubeElement.style.transform = composeTransform(state, null, 0, requestedBase);
        return { kind: 'settled' };
    }

    // A presentation-only change: animate the base angles and leave the orientation
    // slot exactly as it is. Checked before the orientation path because a tilt/pitch
    // request is otherwise indistinguishable from "the orientation is already correct",
    // which is the settled no-op branch further down.
    //
    // Declines while a plan is in flight: the orientation ramp already owns the
    // element's `transform` with `fill: forwards`, and starting a second animation on
    // the same property is the competing-animation shape this view removed. A tilt in
    // that window rides along on the orientation ramp instead, because the ramp's prefix
    // is rebuilt from the *requested* angles below.
    if (baseChanged && !plan) {
        cancelBaseAnimation(state);
        const { animation, finished } = animateBaseChange(state, renderedBase, requestedBase);
        state.baseAnimation = animation;
        state.renderedBase = requestedBase;
        return { kind: 'animating', animation, finished };
    }

    const next = planRotation({
        plan,
        rendered,
        target,
        currentAngleDeg: currentRampAngle(state, previousAnimation),
        stepAnchor,
    });

    // `null` means the requested orientation is already the one on screen — a
    // four-step burst, say — or that the ramp had already reached it.
    if (!next) {
        state.rotationPlan = null;
        cancelRotationAnimation(state);
        cancelBaseAnimation(state);
        state.renderedBasis = plan ? plan.target : target;
        // Recorded because this branch writes `requestedBase` into the transform below:
        // `renderedBase` is the record of what the element is displaying, so leaving it
        // holding the previous angles would break that invariant even though nothing
        // reads it again until the next presentation change.
        state.renderedBase = requestedBase;
        state.cubeElement.style.transform = composeTransform(state, null, 0, requestedBase);
        return { kind: 'settled' };
    }

    // Cancel the outgoing animation before starting the next one, so two
    // `fill: forwards` animations are never both holding the element.
    cancelRotationAnimation(state);

    const { animation, finished } = animateRotation(
        state.cubeElement,
        next.axis,
        next.fromDeg,
        next.toDeg,
        {
            suffix: ` ${basisMatrix(next.base)}`,
            // Built from the *requested* angles rather than the recorded ones, so a tilt
            // that arrives mid-rotation is on screen from the very next frame instead of
            // waiting a turn for the orientation to settle.
            prefix: `${tiltPrefix(state, requestedBase)} `,
        }
    );

    // Bookkeeping to match: this ramp is displaying the requested base, so that is what
    // a later presentation ramp should treat as the rendered state.
    state.renderedBase = requestedBase;
    state.rotationPlan = next;
    state.rotationAnimation = animation;
    // What the element will display once this ramp settles.
    state.renderedBasis = next.target;
    return { kind: 'animating', animation, finished };
}

/**
 * Cancel and forget the running rotation animation, if any.
 *
 * Used both when a new rotation supersedes the old one and when the element is
 * about to be rebuilt, so no settled write ever lands on replaced DOM.
 */
export function cancelRotationAnimation(state: BasicViewInternalData): void {
    state.rotationAnimation?.cancel();
    state.rotationAnimation = undefined;
}

/**
 * Cancel and forget the running base-tilt animation, if any.
 *
 * The presentation slot has its own animation, so cancelling it must not disturb a
 * rotation ramp running alongside it.
 */
export function cancelBaseAnimation(state: BasicViewInternalData): void {
    state.baseAnimation?.cancel();
    state.baseAnimation = undefined;
}

/**
 * Ramp the base tilt/pitch from one pair of angles to another.
 *
 * Deliberately built on the shared animation primitive rather than reaching for a
 * CSS transition, which is the scheme this view removed: a transition on `transform`
 * would interpolate the *whole* composed string component-wise — shearing the cube
 * and competing with the orientation ramp on the same property.
 *
 * The orientation slot is frozen into both keyframes at the angle it is currently
 * showing, so a presentation change cannot disturb the cube's facing, and the two
 * angles are ramped together (a toggle changes one of them, but the prefix is a
 * pair and animating it as one keeps the composed string consistent).
 */
function animateBaseChange(
    state: BasicViewInternalData,
    from: BaseAngles,
    to: BaseAngles
): RotationAnimation {
    const plan = activePlan(state);
    // The angle the rotation slot is showing right now — mid-ramp if one is running.
    // Frozen so this animation drives only the prefix.
    const angle = currentRampAngle(state, state.rotationAnimation);
    return animateTransformPair(
        state.cubeElement!,
        composeTransform(state, plan, angle, from),
        composeTransform(state, plan, angle, to)
    );
}

/**
 * Drop any running rotation and leave the cube showing its settled transform.
 *
 * The orientation itself is not touched — the model is authoritative there (R8),
 * and this only concerns the visual layer.
 */
function resetRotationAnimation(state: BasicViewInternalData): void {
    if (!state.rotationPlan && !state.rotationAnimation) return;
    // Bake what the ramp was heading for, so the resting orientation is the one
    // the view already believes it has.
    state.renderedBasis = state.rotationPlan?.target ?? state.renderedBasis;
    state.rotationPlan = null;
    cancelRotationAnimation(state);
    // The presentation ramp has to go too, for the same reason: a rebuilt element
    // must not be left holding a keyframe from an animation that belongs to the DOM
    // that was just replaced.
    cancelBaseAnimation(state);
    state.renderedBase = baseAnglesOf(state);
    if (state.cubeElement) {
        state.cubeElement.style.transform = composeTransform(state, null, 0);
    }
}

/**
 * Calculates which faces should be visible for label placement.
 */
export function getVisibleFacesWithPositions(state: BasicViewInternalData): {
    visibleFaces: Array<{ face: Face; position: string }>;
    hiddenFaces: Array<{ face: Face; position: string }>;
} {
    const { viewForward: vF, viewRight: vR, viewUp: vU } = state;

    const fwdFace = faceFromCSSDir(vF);
    const rightFace = faceFromCSSDir(vR);
    const upFace = faceFromCSSDir({ x: -vU.x || 0, y: -vU.y || 0, z: -vU.z || 0 });
    const backFace = faceFromCSSDir({ x: -vF.x || 0, y: -vF.y || 0, z: -vF.z || 0 });
    const leftFace = faceFromCSSDir({ x: -vR.x || 0, y: -vR.y || 0, z: -vR.z || 0 });
    const downFace = faceFromCSSDir(vU);

    const slotFaces: Record<string, Face> = {};

    if (state.isTilted) {
        slotFaces['top'] = upFace;
        slotFaces['bottom-left'] = leftFace;
        slotFaces['bottom-right'] = fwdFace;
        slotFaces['top-left'] = backFace;
        slotFaces['top-right'] = rightFace;
        slotFaces['middle-bottom'] = downFace;
    } else {
        slotFaces['top'] = upFace;
        slotFaces['bottom-left'] = fwdFace;
        slotFaces['bottom-right'] = rightFace;
        slotFaces['top-left'] = leftFace;
        slotFaces['top-right'] = backFace;
        slotFaces['middle-bottom'] = downFace;
    }

    let visiblePositions: string[];
    let hiddenPositions: string[];

    if (state.isPitched) {
        const prevTopLeft = slotFaces['top-left'];
        const prevTopRight = slotFaces['top-right'];
        slotFaces['top-left'] = slotFaces['bottom-left'];
        slotFaces['top-right'] = slotFaces['bottom-right'];
        slotFaces['bottom-left'] = prevTopLeft;
        slotFaces['bottom-right'] = prevTopRight;
        slotFaces['middle-bottom-pitched'] = slotFaces['middle-bottom'];
        visiblePositions = ['top-left', 'middle-bottom-pitched', 'top-right'];
        hiddenPositions = ['top', 'bottom-left', 'bottom-right'];
    } else {
        visiblePositions = ['top', 'bottom-left', 'bottom-right'];
        hiddenPositions = ['top-left', 'top-right', 'middle-bottom'];
    }

    const visibleFaces = visiblePositions.map(position => ({
        face: slotFaces[position],
        position,
    }));

    const hiddenFaces = hiddenPositions.map(position => ({
        face: slotFaces[position],
        position,
    }));

    return { visibleFaces, hiddenFaces };
}

/**
 * Recalculates and applies the cube size from the available container space.
 */
export function updateSize(state: BasicViewInternalData): void {
    if (!state.cubeElement || !state.container) return;

    // A rebuild underneath an in-flight ramp would leave an interpolated
    // transform applied over a freshly built grid, so settle the view first.
    resetRotationAnimation(state);

    const containerWidth = state.container.clientWidth;
    const containerHeight = state.container.clientHeight;
    const availableSize = {
        width: containerWidth > 0 ? containerWidth : 300,
        height: containerHeight > 0 ? containerHeight : 300,
    };

    const scale = state.layoutMode === LayoutMode.Tabbed ? 0.5 : 0.55;
    const faceSize = Math.min(availableSize.width, availableSize.height) * scale;

    state.cubeElement.style.width = `${faceSize}px`;
    state.cubeElement.style.height = `${faceSize}px`;

    const defaultSize = 300;
    const scaledPerspective = 1000 * (faceSize / defaultSize);
    const cubeWrapper = state.cubeElement.parentElement as HTMLElement;
    if (cubeWrapper) {
        cubeWrapper.style.perspective = `${scaledPerspective}px`;
    }

    // Try an in-place resize first; fall back to a full rebuild when the
    // existing DOM does not correspond to the current model.
    const inPlaceOk = cubieRendering.resizeCubies(state, faceSize);
    if (!inPlaceOk) {
        cubieRendering.initializeCubies(state, faceSize);
    }

    // Update ghost-anchor sizes and transforms
    initializeGhostAnchors(state, faceSize);
}

/**
 * Initialize the ghost-anchor wrapper and its six per-face host divs, with
 * correct transforms and sizes.
 *
 * These anchors exist purely so the shared `GhostStickers` module (which
 * queries `[data-face="X"]:not([data-basic-pos])` for a host element)
 * has a valid full-face target in the Basic view's per-cubie DOM. They are built
 * inside a dedicated `.ghost-anchor-container` wrapper — never alongside
 * cubie sticker divs — so the query can never resolve to the wrong element.
 * The wrapper reference is stored on `state.ghostAnchorContainer` so it can
 * be passed to `GhostStickers` as its scoped root instead of the whole cube.
 */
export function initializeGhostAnchors(state: BasicViewInternalData, size: number): void {
    if (!state.cubeElement) return;

    const halfSize = size / 2;

    let wrapper = state.cubeElement.querySelector(
        `.${state.styles['ghost-anchor-container']}`
    ) as HTMLElement | null;
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = state.styles['ghost-anchor-container'] ?? '';
        wrapper.setAttribute('aria-hidden', 'true');
        state.cubeElement.appendChild(wrapper);
    }
    state.ghostAnchorContainer = wrapper;

    const faces = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];

    faces.forEach(face => {
        let anchor = wrapper!.querySelector(`[data-face="${face}"]`) as HTMLElement | null;
        if (!anchor) {
            anchor = document.createElement('div');
            anchor.className = state.styles['ghost-anchor'] ?? '';
            anchor.setAttribute('data-face', face);
            wrapper!.appendChild(anchor);
        }
        anchor.style.transform = cubieRendering.getFaceTransform(face, halfSize);
        anchor.style.width = `${size}px`;
        anchor.style.height = `${size}px`;
    });
}

/**
 * Triggers a size recalculation.
 */
export function resize(state: BasicViewInternalData): void {
    updateSize(state);
}

/**
 * Returns the minimum recommended size for this view.
 */
export function getMinimumSize(): Size2D {
    return { width: 300, height: 300 };
}

/**
 * Full repaint: syncs all cubie positions and sticker faces from the model.
 */
export function update(state: BasicViewInternalData, _model: ReadOnlyCubeModel): void {
    if (!state.cubeElement) return;

    // Same reasoning as `updateSize`: the cubie DOM is rebuilt here, so a ramp
    // in flight would be animating elements that are about to be discarded.
    resetRotationAnimation(state);

    // Reinitialize all cubies from the model state
    const faceSize = state.cubeElement.style.width
        ? parseFloat(state.cubeElement.style.width)
        : 300;

    // Clear existing cubies
    const existingCubies = state.cubeElement.querySelectorAll('[data-cubie-id]');
    existingCubies.forEach(el => el.remove());

    cubieRendering.initializeCubies(state, faceSize);
}

// =========================================================================
// Face Labels
// =========================================================================

/**
 * Builds a map of CSS face position → original face letter by reading the
 * virtual center cubies from the model.  After whole-cube rotations the
 * virtual centers track where each original face ended up.
 */
function buildFaceMap(model: ReadOnlyCubeModel | undefined): Map<Face, Face> | null {
    if (!model) return null;
    try {
        const cubeState = model.getCurrentState();
        const result = new Map<Face, Face>();
        const allFaces = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
        for (const originalFace of allFaces) {
            const vc = CubeStateUtils.getVirtualCenterCubie(cubeState, originalFace);
            const sticker = vc.stickers.first();
            if (sticker) {
                result.set(sticker.currentFace as Face, originalFace);
            }
        }
        return result;
    } catch {
        return null;
    }
}

const pendingLabelTimers = new WeakMap<Element, Map<string, ReturnType<typeof setTimeout>>>();

type LabelTarget = {
    posKey: string;
    face: Face;
    baseClass: string;
    posClass: string;
    viewPrefix: string;
};

function buildTargets(
    state: BasicViewInternalData,
    faceMap: Map<Face, Face> | null
): LabelTarget[] {
    const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(state);
    const viewPrefix = `${state.variant}${state.isTilted ? '-tilted' : ''}${state.isPitched ? '-pitched' : ''}`;
    const targets: LabelTarget[] = [];
    visibleFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const resolvedFace = faceMap?.get(face) ?? face;
        targets.push({
            posKey: position,
            face: resolvedFace,
            baseClass: state.styles['face-label'],
            posClass: state.styles[`face-label-${viewPrefix}-${position}`],
            viewPrefix,
        });
    });
    hiddenFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const resolvedFace = faceMap?.get(face) ?? face;
        targets.push({
            posKey: `hidden:${position}`,
            face: resolvedFace,
            baseClass: state.styles['hidden-face-label'],
            posClass: state.styles[`hidden-face-label-${viewPrefix}-${position}`],
            viewPrefix,
        });
    });
    return targets;
}

function createLabelElement(target: LabelTarget, spinInClass: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `${target.baseClass} ${target.posClass}${spinInClass ? ` ${spinInClass}` : ''}`;
    el.textContent = target.face;
    el.dataset['pos'] = target.posKey;
    el.dataset['face'] = target.face;
    el.dataset['prefix'] = target.viewPrefix;
    return el;
}

/**
 * Updates face label DOM elements, animating only the labels that actually
 * changed (different face letter or layout prefix).  Unchanged labels are
 * left alone.
 */
export function updateFaceLabels(
    state: BasicViewInternalData,
    direction: 'horizontal' | 'vertical' = 'horizontal'
): void {
    /* c8 ignore if */
    if (!state.cubeContainer) return;

    const faceMap = buildFaceMap(state.model);
    const targets = buildTargets(state, faceMap);

    const existingByPos = new Map<string, HTMLElement>();
    state.cubeContainer
        .querySelectorAll<HTMLElement>(`[data-pos]`)
        .forEach(el => existingByPos.set(el.dataset['pos']!, el));

    if (existingByPos.size === 0) {
        targets.forEach(t => state.cubeContainer!.appendChild(createLabelElement(t, '')));
        return;
    }

    let timerMap = pendingLabelTimers.get(state.cubeContainer);
    if (!timerMap) {
        timerMap = new Map();
        pendingLabelTimers.set(state.cubeContainer, timerMap);
    }

    const isVertical = direction === 'vertical';
    const spinOutClass = isVertical
        ? state.styles['face-label-spinning-out-vertical']
        : state.styles['face-label-spinning-out'];
    const spinInClass = isVertical
        ? state.styles['face-label-spinning-in-vertical']
        : state.styles['face-label-spinning-in'];
    const container = state.cubeContainer;

    const newPosKeys = new Set(targets.map(t => t.posKey));
    existingByPos.forEach((el, posKey) => {
        if (!newPosKeys.has(posKey)) {
            el.remove();
        }
    });

    targets.forEach(target => {
        const existing = existingByPos.get(target.posKey);
        const unchanged =
            existing !== undefined &&
            existing.dataset['face'] === target.face &&
            existing.dataset['prefix'] === target.viewPrefix;

        if (unchanged) return;

        const prev = timerMap!.get(target.posKey);
        if (prev !== undefined) clearTimeout(prev);

        if (existing) {
            existing.classList.add(spinOutClass);
        }

        const posKey = target.posKey;
        const timer = setTimeout(() => {
            timerMap!.delete(posKey);
            container.querySelector(`[data-pos="${posKey}"]`)?.remove();
            container.appendChild(createLabelElement(target, spinInClass));
        }, 120);

        timerMap!.set(posKey, timer);
    });
}
