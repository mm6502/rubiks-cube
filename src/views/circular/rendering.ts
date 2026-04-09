import { Color, ColorMap, CubeState, FACE_COLORS, StickerId } from '@/cube/types';
import { CubieType, Face } from '@/cube/types';
import { CubeStateUtils, getPositionKey } from '@/cube/utils';
import { MoveExecutedEvent } from '@/types';

import * as highlights from './highlights';
import { animateMove } from './animations';
import { CircularCubeViewInternalData } from './circular-view';

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
}

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
 * UpdateSelective: handles animated update behavior. Caller should pass callbacks
 * for selection handling and a getFillColor helper.
 *
 * Animations are serialized via state.animationChain so that concurrent moves
 * (rapid input or undo/redo bursts) never compose WAAPI transforms on the same
 * SVG elements simultaneously — the root cause of the Firefox sticker-teleport bug.
 * When 2 or more moves are already waiting, the incoming move skips its animation
 * and only updates colors, preventing the queue from growing without bound.
 * Allowing up to 2 queued moves to animate lets compound gestures (e.g. 2 axis
 * rings selected → 2 simultaneous MOVE_REQUESTED events) play both moves visually.
 */
export function updateSelective(
    state: CircularCubeViewInternalData,
    event: MoveExecutedEvent
): Promise<void> {
    // Count how many moves are already queued by tagging the chain with a counter.
    // We use a lightweight wrapper object attached to the state for this purpose.
    const tracker = state as CircularCubeViewInternalData & { _pendingAnimations?: number };
    tracker._pendingAnimations = (tracker._pendingAnimations ?? 0) + 1;

    state.animationChain = state.animationChain.then(async () => {
        // Decrement now (at execution time) and check how many moves still wait after this one.
        tracker._pendingAnimations = Math.max(0, (tracker._pendingAnimations ?? 1) - 1);

        // Skip animation only when 2+ moves are still waiting after this one (3+ queued together).
        // This lets compound gestures (e.g. 2 axis-rings selected → 2 simultaneous MOVE_REQUESTED)
        // play both animations sequentially, while still preventing the queue from growing without
        // bound during rapid single-move input (burst of 3+ moves skips all but the last two).
        const skipAnimation = tracker._pendingAnimations > 1;

        if (!state.svgReady || !event || !state.stickerLookupMap) {
            renderState(state, event.postState);
            return;
        }

        const movedCubies = event.moveDetails?.movedCubies?.after;
        if (!movedCubies || movedCubies.length === 0 || skipAnimation) {
            renderState(state, event.postState);
            return;
        }

        if (!state.svgRoot) {
            renderState(state, event.postState);
            return;
        }

        // Determine currently selected sticker before animation.
        const selected = state.currentSelected as StickerId | undefined;
        const stickerBefore = CubeStateUtils.getStickerById(event.preState, selected);
        const stickerAfter = CubeStateUtils.getStickerAt(
            event.postState,
            stickerBefore?.currentFace,
            stickerBefore?.facePosition
        );

        // Clear selection during animation
        highlights.removeSelectionHighlight(state, state.styles);

        // Ensure mappings reflect PRE-state
        updateStickerMappings(state, event.preState);

        // Run animation
        await animateMove(event, state.svgRoot!, state.axisCircles, state.stickerLookupMap!);

        // After animation completes, update to post-state
        renderState(state, event.postState);

        // Restore selection
        highlights.updateSelected(state, state.styles, stickerAfter?.id);
    });

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
