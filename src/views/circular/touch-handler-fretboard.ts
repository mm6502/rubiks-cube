/**
 * Fretboard gesture subsystem for the circular touch handler.
 *
 * Manages the two-line radial guide ("fretboard") shown during axis-circle
 * and background drag gestures, including highlight switching as the pointer
 * slides between concentric rings.
 */
import { Axis } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { distance2 } from '@/cube/utils';
import { normalize2 } from '@/cube/utils/math';
import type { DragGesture } from '@/interaction/types';

import type { AxisCircle } from './svg-tools';
import { clientToSvgPoint, svgToClientPoint } from './svg-tools';
import {
    collectAxisCentersByAxis,
    computeBiasedBoundaries,
    getAxisCircleKey,
    getNearestAxisByPoint,
    parseAxisCircleKey,
} from './touch-handler-geometry';
import {
    clearAxisSelections,
    hideDetectionBand,
    setAxisSelectedClass,
    showDetectionBandForCircle,
} from './touch-handler-overlays';
import {
    DRAG_CROSS_ARM_LENGTH_FLOATING,
    DRAG_CROSS_ARM_LENGTH_TABBED,
    FRETBOARD_BG_KEY,
    FRETBOARD_HALF_GAP_PX,
} from './touch-handler-types';
import type { AxisHit, TouchHandlerState } from './touch-handler-types';

// ── Setup ───────────────────────────────────────────────────────────────────
/**
 * Set up the fretboard guide for an axis-circle drag gesture.
 * Saves current axis selections, computes radial boundaries, shows the
 * two parallel guide lines, and highlights the initially hit circle.
 */ export function setupFretboard(
    state: TouchHandlerState,
    axisHit: AxisHit,
    clientX: number,
    clientY: number
): void {
    const axis = axisHit.axis;

    const group = state.axisCircles.filter(c => c.axis === axis).sort((a, b) => a.r - b.r);

    if (group.length === 0) {
        return;
    }

    state.savedAxisSelections = new Set(state.selectedAxisCircles);

    if (!state.savedAxisSelections.has(axisHit.key)) {
        clearAxisSelections(state);
    }

    state.fretboardAxis = axis;
    state.fretboardAxisGroup = group;
    const boundaries = computeBiasedBoundaries(group);

    const touchSvg = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const touchD = distance2(touchSvg, { x: group[0].cx, y: group[0].cy });
    const hitIdx = group.findIndex(c => c.axis === axisHit.axis && c.layer === axisHit.layer);
    if (hitIdx >= 0) {
        boundaries[hitIdx] = Math.min(boundaries[hitIdx], touchD);
        boundaries[hitIdx + 1] = Math.max(boundaries[hitIdx + 1], touchD);
    }
    state.fretboardBoundaries = boundaries;

    showFretboardLines(state, group[0], clientX, clientY);

    setFretboardHighlight(state, axisHit.key, axisHit.element);
}

/**
 * Set up the fretboard guide for a background drag gesture.
 * Determines the nearest axis, shows fretboard lines, and starts
 * in background (whole-cube) mode. Allows sliding into axis circles.
 */
export function setupFretboardFromBackground(
    state: TouchHandlerState,
    clientX: number,
    clientY: number
): void {
    const svgPoint = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const axisCenters = collectAxisCentersByAxis(state.axisCircles);
    const nearestAxis = getNearestAxisByPoint(svgPoint, axisCenters);
    if (!nearestAxis) {
        return;
    }

    const group = state.axisCircles.filter(c => c.axis === nearestAxis).sort((a, b) => a.r - b.r);
    if (group.length === 0) {
        return;
    }

    state.savedAxisSelections = new Set(state.selectedAxisCircles);

    state.fretboardAxis = nearestAxis;
    state.fretboardAxisGroup = group;
    state.fretboardBoundaries = computeBiasedBoundaries(group);

    showFretboardLines(state, group[0], clientX, clientY);

    setFretboardHighlightBackground(state);
}

// ── Fretboard lines ─────────────────────────────────────────────────────────

/**
 * Show the two parallel radial guide rails through the touch point.
 *
 * The rails are drawn in **screen space** on a fixed viewport layer, so both the
 * gap between them and their length stay put across zoom. Their radial direction
 * is still derived from the axis centre, which is SVG geometry, so the centre is
 * projected to the screen first — the rails must point at the ring the user is
 * fretting, and that ring only exists in the cube's own coordinate space.
 *
 * The SVG-space radial direction and origin are stored as well: the drift check
 * and the commit distance are measured against cube geometry, so they stay in
 * viewBox units and are unaffected by the zoom.
 */
function showFretboardLines(
    state: TouchHandlerState,
    referenceCircle: AxisCircle,
    clientX: number,
    clientY: number
): void {
    const touchSvg = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const radialDir = normalize2({
        x: touchSvg.x - referenceCircle.cx,
        y: touchSvg.y - referenceCircle.cy,
    });
    if (!radialDir) {
        return;
    }

    state.fretboardRadialDir = radialDir;
    state.fretboardStartSvg = touchSvg;

    const centerClient = svgToClientPoint(state.svgRoot, referenceCircle.cx, referenceCircle.cy, {
        x: referenceCircle.cx,
        y: referenceCircle.cy,
    });
    const radialDirClient = normalize2({
        x: clientX - centerClient.x,
        y: clientY - centerClient.y,
    });
    if (!radialDirClient) {
        return;
    }

    const armLength =
        state.layoutMode === LayoutMode.Tabbed
            ? DRAG_CROSS_ARM_LENGTH_TABBED
            : DRAG_CROSS_ARM_LENGTH_FLOATING;

    state.fretboardRails.show(radialDirClient, clientX, clientY, FRETBOARD_HALF_GAP_PX, armLength);
}

/** Hide the fretboard guide rails and clear all fretboard geometry state. */
export function hideFretboard(state: TouchHandlerState): void {
    state.fretboardRails.hide();
    state.fretboardAxis = undefined;
    state.fretboardAxisGroup = undefined;
    state.fretboardBoundaries = undefined;
    state.fretboardRadialDir = undefined;
    state.fretboardStartSvg = undefined;
}

// ── Highlight management ────────────────────────────────────────────────────

/** Set the single highlighted axis circle during a fretboard drag. */
export function setFretboardHighlight(
    state: TouchHandlerState,
    key: string,
    knownElement?: SVGCircleElement
): void {
    state.fretboardHighlightKey = key;
    applyFretboardVisualState(state, new Set([key]), knownElement);
}

/** Switch fretboard highlight to background (whole-cube) mode, showing all circles of the axis. */
export function setFretboardHighlightBackground(state: TouchHandlerState): void {
    state.fretboardHighlightKey = FRETBOARD_BG_KEY;
    if (state.fretboardAxis) {
        const cubeSize = state.getCubeSize();
        const keys = new Set(
            Array.from({ length: cubeSize }, (_, layer) =>
                getAxisCircleKey(state.fretboardAxis!, layer)
            )
        );
        applyFretboardVisualState(state, keys);
    }
}

/**
 * Reconcile the fretboard's visual highlight state.
 * Removes the CSS class from keys that are no longer desired (unless
 * owned by `selectedAxisCircles`), adds it to newly desired keys,
 * and updates `fretboardVisualKeys` to match `desiredKeys`.
 */
function applyFretboardVisualState(
    state: TouchHandlerState,
    desiredKeys: Set<string>,
    knownElement?: SVGCircleElement
): void {
    for (const key of state.fretboardVisualKeys) {
        if (desiredKeys.has(key)) continue;
        if (state.selectedAxisCircles.has(key)) continue;
        setAxisSelectedClass(state, key, false);
    }
    for (const key of desiredKeys) {
        if (state.fretboardVisualKeys.has(key)) continue;
        if (state.selectedAxisCircles.has(key)) {
            continue;
        }
        if (knownElement && desiredKeys.size === 1) {
            setAxisSelectedClass(state, key, true, knownElement);
        } else {
            setAxisSelectedClass(state, key, true);
        }
    }
    state.fretboardVisualKeys = new Set(desiredKeys);
}

/**
 * Remove all fretboard-owned visual highlights.
 * Respects `selectedAxisCircles` — does not remove the class from
 * keys that are also part of the persistent selection.
 */
export function clearFretboardVisualState(state: TouchHandlerState): void {
    for (const key of state.fretboardVisualKeys) {
        if (state.selectedAxisCircles.has(key)) continue;
        setAxisSelectedClass(state, key, false);
    }
    state.fretboardVisualKeys.clear();
}

/**
 * ViewBox units per client pixel at the SVG's current scale.
 *
 * Needed because the fretboard now measures two different things in two different
 * spaces, and they have to agree. Which ring the pointer is over is cube geometry,
 * so it stays in viewBox units; the rails the user tracks are a screen overlay, so
 * their gap is a pixel length. The tolerance for drifting off the rails belongs to
 * the *rails* — it is the band they draw — so it has to be expressed in whatever
 * units the comparison happens in.
 *
 * Falls back to 1 when the SVG cannot be measured (a detached SVG, as in jsdom),
 * where an identity mapping is the only defensible answer.
 */
function svgUnitsPerClientPx(state: TouchHandlerState): number {
    const origin = svgToClientPoint(state.svgRoot, 0, 0, { x: 0, y: 0 });
    const probe = svgToClientPoint(state.svgRoot, 1, 0, { x: 1, y: 0 });
    const clientPerUnit = Math.hypot(probe.x - origin.x, probe.y - origin.y);
    if (!Number.isFinite(clientPerUnit) || clientPerUnit <= 0) {
        return 1;
    }
    return 1 / clientPerUnit;
}

/**
 * Half the perpendicular drift the gesture tolerates, in viewBox units.
 *
 * Derived from the *drawn* rail gap rather than from a separate constant, so the
 * band that is shown and the band that is honoured cannot drift apart. They were
 * two constants in the same space once, which coincided by construction; now that
 * the rails are pixels and the geometry is viewBox units, the conversion is what
 * keeps them coincident.
 */
function fretboardHalfGapViewBox(state: TouchHandlerState): number {
    return FRETBOARD_HALF_GAP_PX * svgUnitsPerClientPx(state);
}

/**
 * During a fretboard drag, check if the pointer has moved radially
 * past a boundary into a different circle's band. If so, switch
 * highlight, update the detection band, and recompute rotation centre.
 */
export function updateFretboardHighlight(
    state: TouchHandlerState,
    clientX: number,
    clientY: number
): void {
    const group = state.fretboardAxisGroup;
    const boundaries = state.fretboardBoundaries;
    if (!group || !boundaries || group.length === 0) {
        return;
    }

    const svgPoint = clientToSvgPoint(state.svgRoot, clientX, clientY);

    // The drift tolerance is the drawn rail gap, converted into the units the
    // measurement below is in. Using a fixed viewBox constant here would let the
    // rails promise a wider band than the gesture honours whenever the view is
    // zoomed out — the pointer would sit visibly between the rails and the
    // fretboard would still give up.
    const halfGapSvg = fretboardHalfGapViewBox(state);

    if (state.fretboardRadialDir && state.fretboardStartSvg) {
        const ddx = svgPoint.x - state.fretboardStartSvg.x;
        const ddy = svgPoint.y - state.fretboardStartSvg.y;
        const perpSvg = Math.abs(
            ddx * state.fretboardRadialDir.y - ddy * state.fretboardRadialDir.x
        );
        if (perpSvg > halfGapSvg) {
            return;
        }
    }

    const dx = svgPoint.x - group[0].cx;
    const dy = svgPoint.y - group[0].cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    let newCircle: AxisCircle | undefined;
    for (let i = 0; i < group.length; i += 1) {
        if (d >= boundaries[i] && d <= boundaries[i + 1]) {
            newCircle = group[i];
            break;
        }
    }

    if (!newCircle) {
        if (state.fretboardHighlightKey === FRETBOARD_BG_KEY) {
            return;
        }

        const innerEdge = boundaries[0];
        const outerEdge = boundaries[boundaries.length - 1];
        const marginFromBand = d < innerEdge ? innerEdge - d : d - outerEdge;
        if (marginFromBand < halfGapSvg) {
            return;
        }

        clearAxisSelections(state);
        clearFretboardVisualState(state);
        setFretboardHighlightBackground(state);
        hideDetectionBand(state);

        const circleCenterClient = svgToClientPoint(state.svgRoot, group[0].cx, group[0].cy, {
            x: group[0].cx,
            y: group[0].cy,
        });
        state.dragStateMachine.setRotationCenter(circleCenterClient);
        return;
    }

    const newKey = getAxisCircleKey(newCircle.axis, newCircle.layer);
    if (newKey === state.fretboardHighlightKey) {
        return;
    }

    if (state.savedAxisSelections && state.savedAxisSelections.has(newKey)) {
        clearAxisSelections(state);
        for (const key of state.savedAxisSelections) {
            state.selectedAxisCircles.add(key);
            setAxisSelectedClass(state, key, true);
        }
    } else {
        clearAxisSelections(state);
    }

    setFretboardHighlight(state, newKey);

    showDetectionBandForCircle(state, newCircle);

    const circleCenterClient = svgToClientPoint(state.svgRoot, newCircle.cx, newCircle.cy, {
        x: newCircle.cx,
        y: newCircle.cy,
    });
    state.dragStateMachine.setRotationCenter(circleCenterClient);
}

/**
 * Clean up fretboard state and restore previous axis selections.
 * Called on pointer-up and pointer-cancel.
 */
export function restoreFretboardState(state: TouchHandlerState): void {
    clearFretboardVisualState(state);
    state.fretboardHighlightKey = undefined;

    hideFretboard(state);

    if (state.savedAxisSelections) {
        for (const key of state.savedAxisSelections) {
            state.selectedAxisCircles.add(key);
            setAxisSelectedClass(state, key, true);
        }
        state.savedAxisSelections = undefined;
    }
}

/** Resolve the axis and layer from the current fretboard highlight key. Returns `undefined` if no fretboard gesture is active. */
export function getFretboardHighlightTarget(
    state: TouchHandlerState
): { axis: Axis; layer: number } | undefined {
    if (!state.fretboardHighlightKey) {
        return undefined;
    }
    return parseAxisCircleKey(state.fretboardHighlightKey) ?? undefined;
}

/**
 * Compute the perpendicular (tangential) distance in pixels from the
 * fretboard centre line to the current pointer position.
 *
 * The perpendicular component of the drag displacement in SVG space is
 * converted to client pixels so it can be compared against the existing
 * pixel-based commit thresholds. Returns `undefined` when no fretboard
 * gesture is active.
 */
export function fretboardPerpDistancePx(
    state: TouchHandlerState,
    gesture: DragGesture
): number | undefined {
    if (!state.fretboardRadialDir || !state.fretboardStartSvg) {
        return undefined;
    }

    const currentSvg = clientToSvgPoint(state.svgRoot, gesture.current.x, gesture.current.y);
    const dx = currentSvg.x - state.fretboardStartSvg.x;
    const dy = currentSvg.y - state.fretboardStartSvg.y;

    const perpSvg = Math.abs(dx * state.fretboardRadialDir.y - dy * state.fretboardRadialDir.x);

    const probe = svgToClientPoint(
        state.svgRoot,
        state.fretboardStartSvg.x + 1,
        state.fretboardStartSvg.y,
        state.fretboardStartSvg
    );
    const origin = svgToClientPoint(
        state.svgRoot,
        state.fretboardStartSvg.x,
        state.fretboardStartSvg.y,
        state.fretboardStartSvg
    );
    const svgToClientScale = Math.hypot(probe.x - origin.x, probe.y - origin.y) || 1;

    return perpSvg * svgToClientScale;
}
