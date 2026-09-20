// Animation system for the Basic per-cubie view
import { Axis, QuarterTurn } from '@/cube/types';
import type { Vector3 } from '@/cube/types';
import { MoveExecutedEvent } from '@/types';

import { axisToCss } from './rotation-math';

/**
 * Animation configuration for the Basic view.
 */
export type BasicAnimationConfig = {
    /** Duration in milliseconds */
    duration: number;
    /** CSS easing function */
    easing: string;
};

/**
 * Default animation configuration.
 *
 * Owned here, in the module that performs the animation, so that every consumer
 * — move animation and view rotation alike — shares one duration rather than
 * each carrying its own copy that can drift.
 */
export const DEFAULT_BASIC_ANIMATION_CONFIG: BasicAnimationConfig = {
    duration: 300,
    easing: 'ease-out',
};

/**
 * How one rotation animation is started.
 */
export type RotationAnimationOptions = {
    /**
     * Transform text placed *before* the rotation in every keyframe, and
     * {@link suffix} after it. The caller composes its own stack this way: view
     * rotation needs the base tilt inside the rotation and the basis matrix
     * underneath it, while move animation needs neither.
     */
    prefix?: string;
    /** Transform text placed after the rotation in every keyframe. */
    suffix?: string;
    /** Duration override, in milliseconds. */
    duration?: number;
    /** Easing override. */
    easing?: string;
};

/**
 * A started rotation animation.
 */
export type RotationAnimation = {
    /** The underlying animation, so the caller can cancel or inspect it. */
    animation: Animation;
    /**
     * Settles exactly once, with `true` when the rotation ran to completion and
     * `false` when it was cancelled.
     *
     * It deliberately never rejects. Cancellation is the normal path when one
     * rotation interrupts another, so surfacing it as a rejection would make the
     * common case an unhandled-rejection hazard — and the caller needs to close
     * its rotation on *both* outcomes anyway.
     */
    finished: Promise<boolean>;
};

/**
 * Animate a rotation as an angle ramped about a known axis.
 *
 * This is the one primitive behind both rotation animations in the Basic view.
 * It exists because the alternative — writing a new `matrix3d` and letting a CSS
 * `transition: transform` interpolate it — blends the matrix *entries*, so every
 * intermediate frame leaves the rotation group and shears the cube. Interrupting
 * such a transition adopts the already-sheared matrix as the next start, which is
 * the visible unwind users reported. Ramping a single angle keeps every frame a
 * genuine rotation of the cube.
 *
 * Deliberately narrow, per the plan's lifecycle decision:
 *
 * - It does **not** set `transform-origin`. Move animation wants the cube centre
 *   (`faceHalf, faceHalf, 0`) while `.cube` carries `50% 50% 0`; baking either in
 *   would silently misplace the other.
 * - It does **not** create, wrap, or reparent any element, and does not bake the
 *   settled transform. Move animation reparents cubies into a pivot and reparents
 *   them back; view rotation has no pivot at all.
 * - The angle arrives as a plain number and is used verbatim. It is never
 *   normalised to a shortest arc, so a 270° sweep stays 270° — narrowing it to
 *   −90° would land on the same orientation while travelling the wrong way.
 *
 * @param element - The element to animate.
 * @param axis - Rotation axis, in the same space as the composed transform. A
 *   caller working in a different space applies its own sign convention first —
 *   move animation negates Y and Z to match CSS space.
 * @param fromDeg - Angle at the start of the ramp.
 * @param toDeg - Angle at the end of the ramp.
 * @param options - Transform prefix/suffix and timing overrides.
 * @returns The animation and its completion signal.
 */
export function animateRotation(
    element: HTMLElement,
    axis: Vector3,
    fromDeg: number,
    toDeg: number,
    options: RotationAnimationOptions = {}
): RotationAnimation {
    const prefix = options.prefix ?? '';
    const suffix = options.suffix ?? '';
    const cssAxis = axisToCss(axis);
    const frame = (deg: number): string => `${prefix}rotate3d(${cssAxis},${deg}deg)${suffix}`;

    const animation = element.animate(
        [{ transform: frame(fromDeg) }, { transform: frame(toDeg) }],
        {
            duration: options.duration ?? DEFAULT_BASIC_ANIMATION_CONFIG.duration,
            easing: options.easing ?? DEFAULT_BASIC_ANIMATION_CONFIG.easing,
            fill: 'forwards',
        }
    );

    const finished = animation.finished.then(
        () => true,
        () => false
    );

    return { animation, finished };
}

/**
 * Result of starting a layer animation.
 */
export type AnimateMoveResult = {
    animation: Animation;
    pivot: HTMLElement;
    cubieElements: HTMLElement[];
};

/**
 * Get the cubie DOM elements that belong to a move's layer.
 *
 * Uses the cubie IDs from movedCubies.before (the authoritative set of cubies
 * currently in the layer) to look up DOM elements. This is correct across all
 * move sequences because cubie.id is a stable identity key while cubie.position
 * reflects the current location — the ID-coordinate filtering approach fails
 * after any move because IDs encode initial positions, not current positions.
 *
 * @param cubieIds - Stable cubie IDs in the layer (from movedCubies.before)
 * @param cubeElement - The cube DOM element
 * @returns Array of matching cubie elements
 */
export function getLayerCubieElements(cubieIds: string[], cubeElement: HTMLElement): HTMLElement[] {
    return cubieIds.reduce<HTMLElement[]>((acc, id) => {
        const el = cubeElement.querySelector(`[data-cubie-id="${id}"]`) as HTMLElement | null;
        if (el) acc.push(el);
        return acc;
    }, []);
}

/**
 * Animate a layer of cubies rotating around an axis using a pivot element.
 *
 * The pivot div sits at (0,0,0) = cube center. A rotate3d on the pivot
 * rotates all child cubies around the cube's axis — exactly the same as
 * a physical layer rotation.
 *
 * @param cubieElements - The cubie elements to animate
 * @param axis - The axis of rotation
 * @param angle - The rotation angle in degrees
 * @param cubeElement - The cube DOM element (parent for pivot)
 * @param config - Animation configuration
 * @returns The animation handle and pivot element
 */
export function animateLayer(
    cubieElements: HTMLElement[],
    axis: Axis,
    angle: QuarterTurn,
    cubeElement: HTMLElement,
    config: BasicAnimationConfig = DEFAULT_BASIC_ANIMATION_CONFIG
): { animation: Animation; pivot: HTMLElement } {
    // The cube's content is positioned in (0..faceSize) space — its geometric
    // center is at (faceHalf, faceHalf, 0). Set transform-origin on the pivot
    // so that rotate3d orbits cubies around the cube's true center, without
    // needing to adjust each cubie's translate3d.
    const faceSize = parseFloat(cubeElement.style.width) || 300;
    const faceHalf = faceSize / 2;

    // Create pivot element at cube origin (0,0) with transform-origin at cube center
    const pivot = document.createElement('div');
    pivot.style.cssText =
        `position:absolute;left:0;top:0;` +
        `transform-origin:${faceHalf}px ${faceHalf}px 0;` +
        `transform-style:preserve-3d;width:0;height:0;`;
    cubeElement.appendChild(pivot);

    // Move cubies into pivot — no position adjustment needed since pivot is at (0,0)
    cubieElements.forEach(el => pivot.appendChild(el));

    // Determine axis vector and CSS angle
    const axisVec: Record<Axis, Vector3> = {
        [Axis.X]: { x: 1, y: 0, z: 0 },
        [Axis.Y]: { x: 0, y: 1, z: 0 },
        [Axis.Z]: { x: 0, y: 0, z: 1 },
    };

    // Calculate CSS rotation angle from MoveDefinition angle (already in degrees).
    //
    // CSS 3D coordinate axes are:
    //   CSS X = model X  (same direction)
    //   CSS Y = model -Y (model Y is inverted: y=max → CSS top)
    //   CSS Z = model -Z (model Z is centered at +Z → CSS front)
    //
    // So Y and Z axis rotations must be negated to match CSS space. This
    // convention is specific to how a *move* axis maps to screen space, so it
    // stays here rather than moving into the shared primitive.
    const effectiveAngle = axis === Axis.Y || axis === Axis.Z ? -angle : angle;

    const { animation } = animateRotation(pivot, axisVec[axis], 0, effectiveAngle, config);

    return { animation, pivot };
}

/**
 * Finalize a layer animation: reparent cubies back to cube, remove pivot.
 *
 * @param pivot - The pivot element
 * @param cubieElements - The cubie elements that were animated
 * @param cubeElement - The cube DOM element
 */
export function finalizeLayer(
    pivot: HTMLElement,
    cubieElements: HTMLElement[],
    cubeElement: HTMLElement
): void {
    // Move cubies back to cube
    cubieElements.forEach(el => cubeElement.appendChild(el));

    // Remove pivot
    pivot.remove();
}

/**
 * Animate a move: identify layer cubies, create pivot animation.
 *
 * Respects `prefers-reduced-motion` — if true, returns null so the
 * caller falls through to instant updateCubiePositions.
 *
 * @param event - The move executed event
 * @param cubeElement - The cube DOM element
 * @param config - Animation configuration (optional)
 * @returns Animation result, or null to skip animation
 */
export function animateMove(
    event: MoveExecutedEvent,
    cubeElement: HTMLElement,
    config?: BasicAnimationConfig
): AnimateMoveResult | null {
    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return null;
    }

    const move = event.moveDetails?.definition;
    if (!move) return null;

    const movedBefore = event.moveDetails?.movedCubies?.before;
    if (!movedBefore || movedBefore.length === 0) return null;
    const cubieIds = movedBefore.map(c => c.id);

    const cubieElements = getLayerCubieElements(cubieIds, cubeElement);
    if (cubieElements.length === 0) return null;

    const { animation, pivot } = animateLayer(
        cubieElements,
        move.axis,
        move.angle,
        cubeElement,
        config ?? DEFAULT_BASIC_ANIMATION_CONFIG
    );

    return { animation, pivot, cubieElements };
}
