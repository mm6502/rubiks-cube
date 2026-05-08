import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { getMoveDefinition } from '@/cube/core/move-engine';
import { Axis, Color, ColorMap, CubeState, FACE_COLORS, StickerId } from '@/cube/types';
import { CubieType, Face, ReadonlyCubie } from '@/cube/types';
import { CubeStateUtils, getPositionKey } from '@/cube/utils';
import { MoveExecutedEvent } from '@/types';

import * as highlights from './highlights';
import { animateMove } from './animations';
import { CircularCubeViewInternalData } from './circular-view';
import { GHOST_OPACITY_LEVELS } from './constants';

/**
 * Sets the fill attribute for a sticker SVG element if present in cache
 */
export function setStickerFillById(
    state: CircularCubeViewInternalData,
    svgId: string,
    colorValue: string
): void {
    const circle = state.svgElementCache.get(svgId);
    if (circle) circle.setAttribute('fill', colorValue);
}

/**
 * Render the whole cube state into the provided SVG state. Expects a getFillColor helper.
 */
export function renderState(state: CircularCubeViewInternalData, cubeState: CubeState): void {
    if (!state.svgReady || !cubeState || !state.stickerLookupMap) return;

    state.svgIdToStickerId.clear();
    state.stickerIdToSvgId.clear();

    for (const cubie of cubeState.cubiesById.values()) {
        if (cubie.type === CubieType.VIRTUAL_CENTER) continue;

        const posKey = getPositionKey(cubie.position, cubeState.cubeSize);
        const faceMap = state.stickerLookupMap.get(posKey);
        if (!faceMap) continue;

        for (const [_, sticker] of cubie.stickers) {
            const svgId = faceMap.get(sticker.currentFace);
            if (svgId) {
                const fill = getFillColor(sticker.color, sticker.currentFace);
                setStickerFillById(state, svgId, fill);

                state.svgIdToStickerId.set(svgId, sticker.id);
                state.stickerIdToSvgId.set(sticker.id, svgId);

                const circle = state.svgElementCache.get(svgId);
                if (circle) circle.setAttribute('data-sticker-id', sticker.id);
            }
        }
    }

    // Sync ghost hint stickers: copy fill from their source stickers.
    updateGhostStickers(state);
}

/**
 * Copy the fill color from each ghost sticker's source element.
 * Ghost stickers are semi-transparent, non-interactive hints placed
 * at the far side of axis-circle gaps.
 */
function updateGhostStickers(state: CircularCubeViewInternalData): void {
    if (!state.svgRoot) return;
    state.ghostElements ??= Array.from(
        state.svgRoot.querySelectorAll<SVGCircleElement>('circle.ghost-sticker')
    );
    for (const ghost of state.ghostElements) {
        const sourceId = ghost.getAttribute('data-ghost-source');
        if (!sourceId) continue;
        const source = state.svgElementCache.get(sourceId);
        if (source) ghost.setAttribute('fill', source.getAttribute('fill') ?? '');
    }
}

/**
 * Show or hide ghost hint stickers based on the showGhosts flag.
 */
export function setGhostVisibility(state: CircularCubeViewInternalData): void {
    if (!state.svgRoot) return;
    const wrapper = state.svgRoot.querySelector<SVGGElement>('.ghost-sticker-wrapper');
    if (!wrapper) return;
    wrapper.style.display = state.showGhosts ? '' : 'none';
    if (state.showGhosts) {
        const opacity = GHOST_OPACITY_LEVELS[state.ghostOpacityIndex] ?? 0.75;
        setGhostOpacity(state, opacity);
    }
}

/**
 * Set the opacity of ghost hint stickers.
 */
export function setGhostOpacity(state: CircularCubeViewInternalData, opacity: number): void {
    if (!state.svgRoot) return;
    state.ghostElements ??= Array.from(
        state.svgRoot.querySelectorAll<SVGCircleElement>('circle.ghost-sticker')
    );
    for (const ghost of state.ghostElements) {
        ghost.style.opacity = opacity.toString();
    }
}

/**
 * Returns the subset of ghost sticker elements whose source sticker is part of
 * the given moved cubies. Only these ghosts need to be hidden during a move
 * animation — ghosts for unaffected faces should remain visible.
 */
function collectAffectedGhostElements(
    state: CircularCubeViewInternalData,
    movedCubies: ReadonlyCubie[]
): SVGCircleElement[] {
    if (!state.svgRoot) return [];
    state.ghostElements ??= Array.from(
        state.svgRoot.querySelectorAll<SVGCircleElement>('circle.ghost-sticker')
    );
    const affectedIds = new Set<StickerId>();
    for (const cubie of movedCubies) {
        for (const sticker of cubie.stickers.values()) {
            affectedIds.add(sticker.id);
        }
    }
    return state.ghostElements.filter(ghost => {
        const sourceId = ghost.getAttribute('data-ghost-source');
        if (!sourceId) return false;
        const stickerId = state.svgIdToStickerId.get(sourceId);
        return stickerId !== undefined && affectedIds.has(stickerId);
    });
}

/*
 * Public API: ghost-toggle animation
 *
 * `animateGhostToggle` implements the user-facing animation for showing/hiding
 * ghost hint stickers. The implementation lives in `animations.ts` because it
 * relies on axis-circle math and other low-level helpers. We intentionally
 * re-export it here so callers (for example, the view command toolbar) can
 * import from a single, higher-level module (`rendering`) instead of depending
 * directly on animation internals.
 *
 * Reasons to prefer this re-export:
 * - Avoids spreading low-level dependencies across many callers.
 * - Reduces the chance of accidental circular imports (`animations` already
 *   imports view/types in order to type `CircularCubeViewInternalData`).
 * - Keeps the view surface (`rendering`) as the documented, stable API for
 *   rendering-related effects.
 */
export { animateGhostToggle } from './animations';

/**
 * Update sticker mappings (data attributes and reverse maps) for a given cube state.
 * This is needed before animations so they can correctly look up moved stickers.
 * The animation expects data-sticker-id to reflect the PRE-state (current visible stickers),
 * then it looks up where those stickers end up in the POST-state.
 */
export function updateStickerMappings(
    state: CircularCubeViewInternalData,
    cubeState: CubeState
): void {
    if (!state.svgReady || !cubeState || !state.stickerLookupMap) return;

    state.svgIdToStickerId.clear();
    state.stickerIdToSvgId.clear();

    for (const cubie of cubeState.cubiesById.values()) {
        if (cubie.type === CubieType.VIRTUAL_CENTER) continue;

        const posKey = getPositionKey(cubie.position, cubeState.cubeSize);
        const faceMap = state.stickerLookupMap.get(posKey);
        if (!faceMap) continue;

        for (const [_, sticker] of cubie.stickers) {
            const svgId = faceMap.get(sticker.currentFace);
            if (!svgId) continue;

            state.svgIdToStickerId.set(svgId, sticker.id);
            state.stickerIdToSvgId.set(sticker.id, svgId);

            const circle = state.svgElementCache.get(svgId);
            if (!circle) continue;

            circle.setAttribute('data-sticker-id', sticker.id);
        }
    }
}

/**
 * Resolve the axis of a move from a MoveExecutedEvent.
 * Returns undefined if the axis cannot be determined.
 */
function getMoveAxis(event: MoveExecutedEvent): Axis | undefined {
    if (event.moveDetails?.definition?.axis) return event.moveDetails.definition.axis;
    try {
        const invariants = getCubeInvariants(event.preState.cubeSize);
        return getMoveDefinition(invariants, event.moveDetails.notation).axis;
    } catch {
        /* c8 ignore next */
        return undefined;
    }
}

/** All three axes for iteration. */
const ALL_AXES: Axis[] = [Axis.X, Axis.Y, Axis.Z];

/**
 * Extended tracker state attached to CircularCubeViewInternalData at runtime.
 * Tracks per-axis pending animation counts and the latest postState per axis
 * so that only the last finishing animation in a concurrent same-axis group
 * triggers renderState.
 */
type AnimationTracker = CircularCubeViewInternalData & {
    _axisPending?: Record<Axis, number>;
    _latestPostState?: CubeState;
    _pendingTotal?: number;
};

/**
 * UpdateSelective: handles animated update behavior with per-axis parallelism.
 *
 * Moves on the **same** axis animate in parallel — their stickers are disjoint,
 * so concurrent WAAPI transforms never collide. Moves on **different** axes are
 * serialized because they share edge/corner stickers.
 *
 * When 2+ moves on the same axis are already queued, additional incoming moves
 * skip their animation and only update colors, preventing unbounded queues.
 */
export function updateSelective(
    state: CircularCubeViewInternalData,
    event: MoveExecutedEvent
): Promise<void> {
    const axis = getMoveAxis(event);
    const tracker = state as AnimationTracker;

    // Initialize per-axis tracking if needed.
    tracker._axisPending ??= { X: 0, Y: 0, Z: 0 };
    tracker._pendingTotal ??= 0;

    // If axis is unknown, fall back to fully serial behaviour on all axes.
    if (!axis) {
        state.animationChain = Promise.all(ALL_AXES.map(a => state.axisAnimationChains[a])).then(
            async () => {
                renderState(state, event.postState);
            }
        );
        for (const a of ALL_AXES) state.axisAnimationChains[a] = state.animationChain;
        return state.animationChain;
    }

    // Track this move.
    const moveAxis = axis; // Capture narrowed axis for closures.
    tracker._axisPending[moveAxis]++;
    tracker._pendingTotal++;
    tracker._latestPostState = event.postState;

    // This animation must wait for all OTHER axis chains (cross-axis serialization)
    // but NOT for its own axis chain (same-axis parallelism).
    const otherAxes = ALL_AXES.filter(a => a !== moveAxis);
    const prerequisite = Promise.all(otherAxes.map(a => state.axisAnimationChains[a]));

    const thisAnimation = prerequisite.then(async () => {
        const pending = tracker._axisPending![moveAxis];

        // Skip animation when 2+ same-axis moves are still waiting after this one,
        // preventing unbounded queue growth during rapid input.
        const skipAnimation = pending > 2;

        if (!state.svgReady || !event || !state.stickerLookupMap) {
            finishAnimation();
            return;
        }

        const movedCubies = event.moveDetails?.movedCubies?.after;
        if (!movedCubies || movedCubies.length === 0 || skipAnimation) {
            finishAnimation();
            return;
        }

        if (!state.svgRoot) {
            finishAnimation();
            return;
        }

        // Determine currently selected sticker before animation.
        const selected = state.currentSelected as StickerId | undefined;
        const stickerBefore = CubeStateUtils.getStickerById(event.preState, selected);
        /* istanbul ignore next 3 */
        const stickerAfter = CubeStateUtils.getStickerAt(
            event.postState,
            stickerBefore?.currentFace,
            stickerBefore?.facePosition
        );

        // Clear selection during animation
        highlights.removeSelectionHighlight(state, state.styles);

        // Hide only the ghost stickers whose source is part of this move.
        if (state.showGhosts) {
            const affectedGhosts = collectAffectedGhostElements(state, movedCubies);
            for (const ghost of affectedGhosts) {
                ghost.style.opacity = '0';
            }
        }

        // Ensure mappings reflect PRE-state for this move's stickers.
        // Same-axis moves have disjoint stickers, so concurrent mapping
        // updates do not conflict.
        updateStickerMappings(state, event.preState);

        // Run animation
        await animateMove(event, state.svgRoot!, state.axisCircles, state.stickerLookupMap!);

        finishAnimation(stickerAfter?.id);

        function finishAnimation(restoreSelectionId?: StickerId) {
            tracker._axisPending![moveAxis]--;
            tracker._pendingTotal!--;

            // Only the last finishing animation renders the final state.
            // Use the latest postState which includes all applied moves.
            if (tracker._pendingTotal! <= 0) {
                tracker._pendingTotal = 0;
                const targetOpacity = GHOST_OPACITY_LEVELS[state.ghostOpacityIndex] ?? 0.75;
                // Render first so ghost sticker colors are updated before they become visible.
                renderState(state, tracker._latestPostState ?? event.postState);
                setGhostOpacity(state, targetOpacity);
                if (restoreSelectionId) {
                    highlights.updateSelected(state, state.styles, restoreSelectionId);
                }
            }
        }
    });

    // Update this axis chain: include the new animation alongside any existing
    // concurrent same-axis animations.
    state.axisAnimationChains[moveAxis] = Promise.all([
        state.axisAnimationChains[moveAxis],
        thisAnimation,
    ]).then(() => {});

    // Derive the global animationChain for external callers (e.g. tests).
    state.animationChain = Promise.all(ALL_AXES.map(a => state.axisAnimationChains[a])).then(
        () => {}
    );

    return state.animationChain;
}

/**
 * Helper to get the fill color for a given sticker, with fallbacks.
 */
function getFillColor(color: Color | undefined, face: Face): string {
    if (!color) color = FACE_COLORS[face];

    const mapped = ColorMap[color as Color];
    return mapped;
}
