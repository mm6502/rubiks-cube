import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { getMoveDefinition } from '@/cube/core/move-engine';
import { Axis, CubeState, Face, Position3D, QuarterTurn, StickerId, Vector2 } from '@/cube/types';
import { MoveDefinition } from '@/cube/types/move';
import { getFaceRotationAxis, getPositionKey } from '@/cube/utils';
import { MoveExecutedEvent } from '@/types';

import { CircularCubeViewInternalData } from './circular-view';
import { GHOST_OPACITY_LEVELS } from './constants';
import { StickerLookupMap } from './initialization';
import { AxisCircle, getCenterOfElement, getStickersForFace, isPointOnCircle } from './svg-tools';

/**
 * Animation configuration
 * @field duration - Duration of the animation in milliseconds
 * @field easing - CSS easing function for the animation
 * @field steps - Number of keyframes to generate for curved animations
 */
export type AnimationConfig = {
    duration: number; // milliseconds
    easing: string; // CSS easing function
    steps: number; // Number of keyframes to generate for curved animations
};

/**
 * Default animation configuration
 */
export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
    duration: 300,
    steps: 10,
    easing: 'ease-out',
};

/**
 * Maps axis to the faces that rotate when that axis is turned
 * Index 0 corresponds to layer 0, index 1 to layer 2
 * Based on cube coordinate system:
 * - X-axis: L (x=0) at layer 0, R (x=2) at layer 2
 * - Y-axis: D (y=0) at layer 0, U (y=2) at layer 2
 * - Z-axis: F (z=0) at layer 0, B (z=2) at layer 2
 */
const AXIS_TO_FACES: Record<Axis, Face[]> = {
    [Axis.X]: [Face.L, Face.R],
    [Axis.Y]: [Face.D, Face.U],
    [Axis.Z]: [Face.F, Face.B],
};

/**
 * Determines which faces are affected by a move
 * @internal
 */
export function getAffectedFaces(move: MoveDefinition): Face[] {
    const faces = AXIS_TO_FACES[move.axis];
    const affectedFaces: Face[] = [];

    // Layer 0 affects the first face in the array
    if (move.layerIndices.includes(0)) {
        affectedFaces.push(faces[0]);
    }

    // Layer 2 affects the second face in the array
    if (move.layerIndices.includes(2)) {
        affectedFaces.push(faces[1]);
    }

    return affectedFaces;
}

/**
 * Calculate the center point of a face from its stickers
 * @internal
 */
export function calculateFaceCenter(faceStickers: SVGCircleElement[]): Vector2 | undefined {
    if (faceStickers.length === 0) {
        return undefined;
    }

    // Calculate bounding box of sticker centers.

    // Get the centers of all stickers.
    const centers = faceStickers.map(s => getCenterOfElement(s));

    // Find min and max x/y.
    const maxx = Math.max(...centers.map(c => c.x));
    const minx = Math.min(...centers.map(c => c.x));
    const maxy = Math.max(...centers.map(c => c.y));
    const miny = Math.min(...centers.map(c => c.y));

    // Center is the midpoint of the bounding box.
    const centerStickerX = (maxx + minx) / 2;
    const centerStickerY = (maxy + miny) / 2;

    // Return as Vector2.
    return { x: centerStickerX, y: centerStickerY };
}

/**
 * Build a map from sticker ID -> target SVG element after the move
 */
function buildTargetStickerMap(
    stickers: SVGCircleElement[],
    postState: CubeState,
    svgRoot: SVGSVGElement,
    stickerLookupMap: StickerLookupMap
): Map<StickerId, SVGCircleElement> {
    const targetMap = new Map<StickerId, SVGCircleElement>();

    for (const sticker of stickers) {
        const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;
        if (!stickerId) continue;

        // Find this sticker in the post-state to determine where it moved.
        let targetFace: Face | undefined;
        let targetPosition: Position3D | undefined;

        for (const cubie of postState.cubiesById.values()) {
            for (const [_, cubieSticker] of cubie.stickers) {
                if (cubieSticker.id === stickerId) {
                    targetFace = cubieSticker.currentFace;
                    targetPosition = cubie.position;
                    break;
                }
            }
            if (targetFace && targetPosition) break;
        }

        if (targetFace && targetPosition) {
            const posKey = getPositionKey(targetPosition);
            const faceMap = stickerLookupMap.get(posKey);
            const targetSvgId = faceMap?.get(targetFace);
            if (targetSvgId) {
                const targetSticker = svgRoot.querySelector(`#${targetSvgId}`) as SVGCircleElement;
                if (targetSticker) {
                    targetMap.set(stickerId, targetSticker);
                }
            }
        }
    }

    return targetMap;
}

/**
 * Get all stickers that lie on a specific axis circle (adjacent stickers on other faces)
 */
function getStickersOnAxisCircle(
    svgRoot: SVGSVGElement,
    axisCircle: AxisCircle,
    excludeFace?: Face
): SVGCircleElement[] {
    const allStickers = Array.from(svgRoot.querySelectorAll<SVGCircleElement>('circle.sticker'));
    const stickersOnCircle: SVGCircleElement[] = [];

    for (const sticker of allStickers) {
        // Skip stickers from the excluded face
        if (excludeFace && sticker.getAttribute('data-face') === excludeFace) {
            continue;
        }

        const center = getCenterOfElement(sticker);
        if (isPointOnCircle(center, axisCircle)) {
            stickersOnCircle.push(sticker);
        }
    }

    return stickersOnCircle;
}

/**
 * Animate a move by rotating the affected faces
 */
export async function animateMove(
    event: MoveExecutedEvent,
    svgRoot: SVGSVGElement,
    axisCircles: AxisCircle[],
    stickerLookupMap: StickerLookupMap
): Promise<void> {
    // Get move definition from event or cube invariants if not provided.
    let moveDefinition = event.moveDetails?.definition;
    if (!moveDefinition) {
        const invariants = getCubeInvariants(event.preState.cubeSize);
        moveDefinition = getMoveDefinition(invariants, event.moveDetails.notation);
    }

    // Validate inputs.
    if (!svgRoot || !moveDefinition) {
        return;
    }

    // Determine affected faces based on the move definition.
    const affectedFaces = getAffectedFaces(moveDefinition);

    // Animations steps adjustment.
    var animationConfig = { ...DEFAULT_ANIMATION_CONFIG };

    // Animate each affected face (state is NOT updated yet,
    // so we animate from current positions).
    const animations: Promise<void>[] = [];

    if (affectedFaces.length > 0) {
        // Face moves: animate face rotations.
        for (const face of affectedFaces) {
            const stickers = getStickersForFace(svgRoot, face);
            if (stickers.length === 0) {
                continue;
            }

            // Animate rotation - pass postState and lookup map to find target positions.
            animations.push(
                animateFaceRotation(
                    face,
                    stickers,
                    moveDefinition,
                    event,
                    svgRoot,
                    axisCircles,
                    stickerLookupMap,
                    animationConfig
                )
            );
        }
    } else {
        // Middle slice moves (M, E, S): animate only adjacent stickers.
        // Pass undefined as face since there's no face rotation.
        animations.push(
            animateFaceRotation(
                undefined,
                [], // No face stickers to animate.
                moveDefinition,
                event,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                animationConfig
            )
        );
    }

    // Wait for all face animations to complete.
    await Promise.all(animations);
}

/**
 * Animate stickers rotating by looking up their target positions.
 * This accounts for the irregular shape of faces based on axis circle intersections.
 */
export function animateFaceRotation(
    face: Face | undefined,
    stickers: SVGCircleElement[],
    move: MoveDefinition,
    eventOrPostState: MoveExecutedEvent | CubeState,
    svgRoot: SVGSVGElement,
    axisCircles: AxisCircle[],
    stickerLookupMap: StickerLookupMap,
    config: AnimationConfig = DEFAULT_ANIMATION_CONFIG
): Promise<void> {
    const event: MoveExecutedEvent =
        'postState' in (eventOrPostState as MoveExecutedEvent)
            ? (eventOrPostState as MoveExecutedEvent)
            : ({ postState: eventOrPostState } as MoveExecutedEvent);

    return new Promise(resolve => {
        const animations: Animation[] = [];

        // Animate face stickers if we have a face (skip for middle slice moves).
        if (!!face) {
            const faceAnims = animateFaceStickersCurved(
                face,
                stickers,
                move,
                event,
                svgRoot,
                stickerLookupMap,
                config
            );
            animations.push(...faceAnims);
        }

        // Animate adjacent stickers - moves can affect multiple layers.
        for (const layerIndex of move.layerIndices) {
            const adjacentAnims = animateAdjacentStickersAroundAxis(
                move,
                event.postState,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                face,
                config,
                layerIndex
            );
            animations.push(...adjacentAnims);
        }

        // Wait for all animations to complete.
        Promise.all(animations.map(a => a.finished)).then(() => {
            // Cancel animations to clear the transforms.
            for (const animation of animations) {
                animation.cancel();
            }
            resolve();
        });
    });
}

/**
 * Animate face stickers moving along curved paths to their target positions.
 *
 * Each sticker moves from its current position to its target position by interpolating
 * both the angle and distance from the face center. This creates smooth, curved motion
 * where each sticker follows its own arc, properly accounting for varying distances
 * from the center (e.g., corner vs edge stickers).
 */
function animateFaceStickersCurved(
    face: Face,
    stickers: SVGCircleElement[],
    move: MoveDefinition,
    event: MoveExecutedEvent,
    svgRoot: SVGSVGElement,
    stickerLookupMap: StickerLookupMap,
    config: AnimationConfig
): Animation[] {
    // Array to hold all animations.
    const animations: Animation[] = [];

    // Compute rotation mapping for the face after the move.
    const { effectiveAngle } = getFaceRotationAxis(face, move.angle as QuarterTurn);

    // Build target sticker map from post-state.
    const targetStickerMap = buildTargetStickerMap(
        stickers,
        event.postState,
        svgRoot,
        stickerLookupMap
    );

    // Calculate face center.
    const faceCenter = calculateFaceCenter(stickers);
    if (!faceCenter) return animations;

    // Animate each sticker along its curved path.
    for (const sticker of stickers) {
        // Get the sticker ID to look up in cube state.
        const stickerId = sticker.getAttribute('data-sticker-id') as StickerId;
        if (!stickerId) {
            continue;
        }

        const targetSticker = targetStickerMap.get(stickerId);
        if (!targetSticker) {
            // Skip this sticker if we can't find its target.
            continue;
        }

        // Get current and target centers.
        const currentCenter = getCenterOfElement(sticker);
        const targetCenter = getCenterOfElement(targetSticker);

        // Create animation for this sticker and store it.
        const animation = createFaceStickerCurvedAnimation(
            sticker,
            currentCenter,
            targetCenter,
            faceCenter,
            effectiveAngle,
            config
        );

        // Store the animation for later management.
        animations.push(animation);
    }

    return animations;
}

/**
 * Animate face stickers moving along curved paths to their target positions.
 *
 * Animate face stickers along individual curved paths.
 * Each sticker moves from its current position to its target position by interpolating
 * both the angle and distance from the face center. This creates smooth, curved motion
 * where each sticker follows its own arc, properly accounting for varying distances
 * from the center (e.g., corner vs edge stickers).
 * */
function createFaceStickerCurvedAnimation(
    sticker: SVGCircleElement,
    currentCenter: Vector2,
    targetCenter: Vector2,
    faceCenter: Vector2,
    effectiveAngle: number,
    config: AnimationConfig
): Animation {
    // Calculate the current and target angles/distances from face center.
    const currentAngle = Math.atan2(currentCenter.y - faceCenter.y, currentCenter.x - faceCenter.x);
    const targetAngle = Math.atan2(targetCenter.y - faceCenter.y, targetCenter.x - faceCenter.x);
    const currentDist = Math.sqrt(
        Math.pow(currentCenter.x - faceCenter.x, 2) + Math.pow(currentCenter.y - faceCenter.y, 2)
    );
    const targetDist = Math.sqrt(
        Math.pow(targetCenter.x - faceCenter.x, 2) + Math.pow(targetCenter.y - faceCenter.y, 2)
    );

    // Build keyframes for curved motion.
    const numSteps = config.steps;
    const keyframes: Keyframe[] = [];

    for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;

        // Interpolate angle (with proper wrapping).
        let angleDiff = targetAngle - currentAngle;
        // Normalize to -PI to PI.
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Force rotation to match the move's direction (important for 180° moves).
        const moveAngleInRadians = (effectiveAngle * Math.PI) / 180;
        if (moveAngleInRadians > 0 && angleDiff < 0) {
            angleDiff += 2 * Math.PI;
        } else if (moveAngleInRadians < 0 && angleDiff > 0) {
            angleDiff -= 2 * Math.PI;
        }

        // Interpolate angle and distance.
        const interpAngle = currentAngle + angleDiff * t;
        const interpDist = currentDist + (targetDist - currentDist) * t;

        // Calculate position along the arc.
        const x = faceCenter.x + interpDist * Math.cos(interpAngle);
        const y = faceCenter.y + interpDist * Math.sin(interpAngle);

        // Add keyframe with 2D transform; Firefox has unreliable SVG translate3d behavior.
        keyframes.push({
            transform: `translate(${x - currentCenter.x}px, ${y - currentCenter.y}px)`,
            offset: t,
        });
    }

    // Animation options.
    const options: KeyframeAnimationOptions = {
        duration: config.duration,
        // Use linear since we're pre-computing the curve.
        easing: 'linear',
        fill: 'none',
    };

    // Create and return the animation for the caller to manage.
    return sticker.animate(keyframes, options);
}

/**
 * Animate adjacent stickers rotating around the axis circle center to their targets.
 *
 * Animate adjacent stickers from neighboring faces that lie on the axis circle.
 * These stickers rotate around the axis circle center to their target positions.
 * For example, during an F move, edge and corner stickers from U, R, D, and L faces
 * that lie on the front layer's axis circle will rotate around that circle.
 * Each sticker's rotation angle is calculated based on its current and target positions
 * on the circle, ensuring smooth curved motion along the circular path.
 */
function animateAdjacentStickersAroundAxis(
    move: MoveDefinition,
    postState: CubeState,
    svgRoot: SVGSVGElement,
    axisCircles: AxisCircle[],
    stickerLookupMap: StickerLookupMap,
    face: Face | undefined,
    config: AnimationConfig,
    layerIndex?: number
): Animation[] {
    // Array to hold all animations.
    const animations: Animation[] = [];

    // Find the axis circle for this layer.
    const axisCircle = axisCircles.find(c => c.axis === move.axis && c.layer === layerIndex);
    if (!axisCircle) return animations;

    // Get stickers on this axis circle, excluding the face being turned (if any).
    const adjacentStickers = getStickersOnAxisCircle(svgRoot, axisCircle, face);

    // Animate each adjacent sticker to its target position.
    for (const sticker of adjacentStickers) {
        // Get the sticker ID to look up in cube state.
        const stickerId = sticker.getAttribute('data-sticker-id');
        if (!stickerId) continue;

        // Find this sticker in the post-state to see where it ended up.
        let targetFace: Face | undefined = undefined;
        let targetPosition: Position3D | undefined = undefined;

        // Locate the sticker in the post-move cube state.
        for (const cubie of postState.cubiesById.values()) {
            for (const [_, cubieSticker] of cubie.stickers) {
                if (cubieSticker.id === stickerId) {
                    targetFace = cubieSticker.currentFace;
                    targetPosition = cubie.position;
                    break;
                }
            }
            if (targetFace) break;
        }

        // If we couldn't find the target face/position, skip this sticker.
        if (!targetFace || !targetPosition) continue;

        // Look up the SVG element at that target position.
        const posKey = getPositionKey(targetPosition);
        const faceMap = stickerLookupMap.get(posKey);
        if (!faceMap) continue;

        const targetSvgId = faceMap.get(targetFace);
        if (!targetSvgId) continue;

        const targetSticker = svgRoot.querySelector(`#${targetSvgId}`) as SVGCircleElement;
        if (!targetSticker) continue;

        // Get current and target centers.
        const currentCenter = getCenterOfElement(sticker);
        const targetCenter = getCenterOfElement(targetSticker);

        // Calculate the angle to rotate around the axis circle.
        const currentAngle =
            Math.atan2(currentCenter.y - axisCircle.cy, currentCenter.x - axisCircle.cx) *
            (180 / Math.PI);
        const targetAngle =
            Math.atan2(targetCenter.y - axisCircle.cy, targetCenter.x - axisCircle.cx) *
            (180 / Math.PI);
        let rotationAngle = targetAngle - currentAngle;

        // Normalize to -180 to 180 and choose the correct direction.
        while (rotationAngle > 180) rotationAngle -= 360;
        while (rotationAngle < -180) rotationAngle += 360;

        // Adjacent stickers on F and B faces need inverted rotation direction.
        // For middle slices (face is null), use axis to determine direction.
        let adjacentAngle: number;
        if (!face) {
            // Middle slice moves: M, E, S.
            // S (Z-axis) needs inversion like F/B.
            adjacentAngle = move.axis === Axis.Z ? -move.angle : move.angle;
        } else {
            adjacentAngle = face === Face.F || face === Face.B ? -move.angle : move.angle;
        }

        // Force the rotation to match the move's direction.
        // If adjacentAngle is positive, rotation should be counter-clockwise (positive).
        // If adjacentAngle is negative, rotation should be clockwise (negative).
        if (adjacentAngle > 0 && rotationAngle < 0) {
            rotationAngle += 360;
        } else if (adjacentAngle < 0 && rotationAngle > 0) {
            rotationAngle -= 360;
        }

        // Animate rotation around the axis circle center.
        // Use translate→rotate→translate to encode the pivot point in the transform itself,
        // because Firefox ignores `transformOrigin` as a keyframe property in the Web Animations API.
        const pivot = `translate(${axisCircle.cx}px, ${axisCircle.cy}px)`;
        const unpivot = `translate(-${axisCircle.cx}px, -${axisCircle.cy}px)`;
        const keyframes = [
            { transform: `${pivot} rotate(0deg) ${unpivot}` },
            { transform: `${pivot} rotate(${rotationAngle}deg) ${unpivot}` },
        ];

        // Animation options.
        const options: KeyframeAnimationOptions = {
            duration: config.duration,
            easing: config.easing,
            fill: 'none',
        };

        // Create and store the animation.
        const animation = sticker.animate(keyframes, options);
        animations.push(animation);
    }

    return animations;
}

// ---------------------------------------------------------------------------
// Ghost-sticker toggle animation
// ---------------------------------------------------------------------------

const GHOST_TOGGLE_DURATION = 400;

/**
 * Animate ghost stickers when toggled on or off.
 *
 * Toggle ON: each ghost travels along its axis circle from the source sticker
 * position to its own destination, starting fully opaque and fading to 0.4.
 *
 * Toggle OFF: ghosts fade out in place, then the wrapper is hidden.
 *
 * NOTE: although this function is exported from `animations.ts`, the preferred
 * import surface for consumers is `rendering.ts` (which re-exports it). That
 * indirection keeps the public rendering API stable and helps avoid
 * runtime circular-imports — `animations.ts` depends on view types and
 * geometry helpers, so many callers should import via `rendering` instead.
 */
export async function animateGhostToggle(state: CircularCubeViewInternalData): Promise<void> {
    if (!state.svgRoot) return;

    state.ghostElements ??= Array.from(
        state.svgRoot.querySelectorAll<SVGCircleElement>('circle.ghost-sticker')
    );

    const wrapper = state.svgRoot.querySelector<SVGGElement>('.ghost-sticker-wrapper');
    if (!wrapper) return;

    if (state.showGhosts) {
        // --- Toggle ON / opacity change: show at current level ---
        const targetOpacity = String(GHOST_OPACITY_LEVELS[state.ghostOpacityIndex] ?? 0.75);
        for (const ghost of state.ghostElements) {
            const sourceId = ghost.getAttribute('data-ghost-source');
            if (!sourceId) continue;
            const source = state.svgElementCache.get(sourceId);
            if (source) ghost.setAttribute('fill', source.getAttribute('fill') ?? '');
        }
        wrapper.style.display = '';

        // Fade in from 0 to target opacity
        const startOpacity = parseFloat(state.ghostElements[0]?.style.opacity || '0');
        if (startOpacity < parseFloat(targetOpacity)) {
            const animations: Animation[] = [];
            for (const ghost of state.ghostElements) {
                ghost.style.opacity = targetOpacity;
                ghost.style.transform = '';
                const anim = ghost.animate(
                    [{ opacity: startOpacity }, { opacity: targetOpacity }],
                    {
                        duration: GHOST_TOGGLE_DURATION / 2,
                        easing: 'ease-out',
                        fill: 'forwards',
                    }
                );
                animations.push(anim);
            }
            await Promise.all(animations.map(a => a.finished));
            for (const a of animations) a.cancel();
        } else {
            for (const ghost of state.ghostElements) {
                ghost.style.opacity = targetOpacity;
                ghost.style.transform = '';
            }
        }
    } else {
        // --- Toggle OFF: fade out in place ---
        const currentOpacity = parseFloat(state.ghostElements[0]?.style.opacity || '0.75');
        const animations: Animation[] = [];
        for (const ghost of state.ghostElements) {
            const anim = ghost.animate([{ opacity: currentOpacity }, { opacity: 0 }], {
                duration: GHOST_TOGGLE_DURATION / 2,
                easing: 'ease-in',
                fill: 'forwards',
            });
            animations.push(anim);
        }

        await Promise.all(animations.map(a => a.finished));
        for (const ghost of state.ghostElements) {
            ghost.style.opacity = '0';
        }
        for (const a of animations) a.cancel();
        wrapper.style.display = 'none';
    }
}
