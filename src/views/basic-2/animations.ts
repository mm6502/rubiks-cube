// Animation system for Basic 2 per-cubie view
import { Axis, QuarterTurn } from '@/cube/types';
import { MoveExecutedEvent } from '@/types';

/**
 * Animation configuration for Basic 2 view.
 */
export type BasicAnimationConfig = {
    /** Duration in milliseconds */
    duration: number;
    /** CSS easing function */
    easing: string;
};

/**
 * Default animation configuration.
 */
export const DEFAULT_BASIC_ANIMATION_CONFIG: BasicAnimationConfig = {
    duration: 300,
    easing: 'ease-out',
};

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
    const axisVec: Record<Axis, string> = {
        [Axis.X]: '1,0,0',
        [Axis.Y]: '0,1,0',
        [Axis.Z]: '0,0,1',
    };

    // Calculate CSS rotation angle from MoveDefinition angle (already in degrees).
    //
    // CSS 3D coordinate axes are:
    //   CSS X = model X  (same direction)
    //   CSS Y = model -Y (model Y is inverted: y=max → CSS top)
    //   CSS Z = model -Z (model Z is centered at +Z → CSS front)
    //
    // So Y and Z axis rotations must be negated to match CSS space.
    const effectiveAngle = axis === Axis.Y || axis === Axis.Z ? -angle : angle;

    const animation = pivot.animate(
        [{ transform: 'none' }, { transform: `rotate3d(${axisVec[axis]},${effectiveAngle}deg)` }],
        {
            duration: config.duration,
            easing: config.easing,
            fill: 'forwards',
        }
    );

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
