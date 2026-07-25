/**
 * Visual overlay management for the circular touch handler.
 *
 * Exports functions that manage the SVG overlay elements: halo ring,
 * face overlay, drag-decision cross, cancel zone, drag label, axis
 * detection bands, and axis circle previews.
 */
import { Axis, Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { normalize2 } from '@/cube/utils/math';
import { computeDragLabelPosition } from '@/interaction/drag-label-positioning';
import { inferMoveFromDrag } from '@/interaction/move-inference';
import { DragDirection } from '@/interaction/types';
import type { Point2D } from '@/interaction/types';

import { type FaceScreenBasis, buildFaceScreenBasisFromHint } from './direction-mapping';
import { clientToSvgPoint, svgToClientPoint } from './svg-tools';
import {
    computeBiasedBoundaries,
    parseAxisCircleKey,
    setLineFromBasis,
} from './touch-handler-geometry';
import { buildCrossingBasisAtPoint, getLbdTrianglePoints } from './touch-handler-hit-testing';
import {
    DRAG_CROSS_ARM_LENGTH_FLOATING,
    DRAG_CROSS_ARM_LENGTH_TABBED,
    SVG_NS,
} from './touch-handler-types';
import type { TouchHandlerState } from './touch-handler-types';
// ── Commit threshold ────────────────────────────────────────────────────────

import { COMMIT_DISTANCE_PX, COMMIT_DISTANCE_TABBED_PX } from './touch-handler-types';

// ── Drag-decision cross ─────────────────────────────────────────────────────

/**
 * Pre-compute the four cardinal move notations for a sticker and show
 * the drag-decision cross at the pointer-down position.
 */
export function setupStickerDragCross(
    state: TouchHandlerState,
    sticker: { face: Face; row: number; col: number },
    clientX: number,
    clientY: number
): void {
    const svgPoint = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const basis =
        buildCrossingBasisAtPoint(state.axisCircles, sticker.face, svgPoint) ??
        buildFaceScreenBasisFromHint(sticker.face);
    const cubeSize = state.getCubeSize();
    const { face, row, col } = sticker;

    state.pendingStickerCross = {
        basis,
        upMove: inferMoveFromDrag({
            face,
            row,
            col,
            direction: DragDirection.UP,
            cubeSize,
            distancePx: 0,
        }),
        downMove: inferMoveFromDrag({
            face,
            row,
            col,
            direction: DragDirection.DOWN,
            cubeSize,
            distancePx: 0,
        }),
        rightMove: inferMoveFromDrag({
            face,
            row,
            col,
            direction: DragDirection.RIGHT,
            cubeSize,
            distancePx: 0,
        }),
        leftMove: inferMoveFromDrag({
            face,
            row,
            col,
            direction: DragDirection.LEFT,
            cubeSize,
            distancePx: 0,
        }),
    };

    showDragDecisionCross(state, basis, clientX, clientY);
}

/**
 * Render the two-armed drag-decision cross whose arms are zone bisectors
 * between the four cardinal drag directions derived from `basis`.
 */
export function showDragDecisionCross(
    state: TouchHandlerState,
    basis: FaceScreenBasis,
    clientX: number,
    clientY: number
): void {
    const center = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const armLength =
        state.layoutMode === LayoutMode.Tabbed
            ? DRAG_CROSS_ARM_LENGTH_TABBED
            : DRAG_CROSS_ARM_LENGTH_FLOATING;

    const arm1Dir =
        normalize2({
            x: basis.upDir.x + basis.rightDir.x,
            y: basis.upDir.y + basis.rightDir.y,
        }) ?? basis.upDir;
    const arm2Dir =
        normalize2({
            x: basis.upDir.x - basis.rightDir.x,
            y: basis.upDir.y - basis.rightDir.y,
        }) ?? basis.rightDir;

    setLineFromBasis(state.dragCrossPrimaryEl, center, arm1Dir, armLength);
    setLineFromBasis(state.dragCrossSecondaryEl, center, arm2Dir, armLength);
    state.dragCrossSecondaryEl.removeAttribute('visibility');
    state.dragCrossGroupEl.setAttribute('visibility', 'visible');
}

/**
 * Show a single-arm drag-decision line (used for halo and face-ellipse
 * gestures where only a radial guide is needed).
 */
export function showDragDecisionLine(
    state: TouchHandlerState,
    dir: Point2D,
    clientX: number,
    clientY: number
): void {
    const center = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const armLength =
        state.layoutMode === LayoutMode.Tabbed
            ? DRAG_CROSS_ARM_LENGTH_TABBED
            : DRAG_CROSS_ARM_LENGTH_FLOATING;

    setLineFromBasis(state.dragCrossPrimaryEl, center, dir, armLength);
    state.dragCrossSecondaryEl.setAttribute('visibility', 'hidden');
    state.dragCrossGroupEl.setAttribute('visibility', 'visible');
}

/** Hide the drag-decision cross and clear the pending sticker cross state. */
export function hideDragDecisionCross(state: TouchHandlerState): void {
    state.pendingStickerCross = undefined;
    state.dragCrossGroupEl.setAttribute('visibility', 'hidden');
}

// ── Halo guide line ─────────────────────────────────────────────────────────

/**
 * Show a single radial guide line from the selected face centre through
 * the pointer position, used during halo (face-rotation) drags.
 */
export function setupHaloGuideLine(
    state: TouchHandlerState,
    clientX: number,
    clientY: number
): void {
    if (!state.selectedFace) {
        hideDragDecisionCross(state);
        return;
    }
    const ellipse = state.svgRoot.getElementById(
        `${state.selectedFace}-face-ellipse`
    ) as SVGEllipseElement | null;
    if (!ellipse) {
        hideDragDecisionCross(state);
        return;
    }

    const faceCx = Number(ellipse.getAttribute('cx') ?? 0);
    const faceCy = Number(ellipse.getAttribute('cy') ?? 0);
    const touchSvg = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const radialDir = normalize2({ x: touchSvg.x - faceCx, y: touchSvg.y - faceCy });
    if (!radialDir) {
        hideDragDecisionCross(state);
        return;
    }

    showDragDecisionLine(state, radialDir, clientX, clientY);
}

/**
 * Show a radial guide line from the given face centre through the
 * pointer position, used for face-ellipse and face-direct gestures.
 */
export function setupFaceEllipseGuideLine(
    state: TouchHandlerState,
    face: Face,
    clientX: number,
    clientY: number
): void {
    const ellipse = state.svgRoot.getElementById(
        `${face}-face-ellipse`
    ) as SVGEllipseElement | null;
    if (!ellipse) {
        hideDragDecisionCross(state);
        return;
    }

    const faceCx = Number(ellipse.getAttribute('cx') ?? 0);
    const faceCy = Number(ellipse.getAttribute('cy') ?? 0);
    const touchSvg = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const radialDir = normalize2({ x: touchSvg.x - faceCx, y: touchSvg.y - faceCy });
    if (!radialDir) {
        hideDragDecisionCross(state);
        return;
    }

    showDragDecisionLine(state, radialDir, clientX, clientY);
}

// ── Halo (face selection ring) ──────────────────────────────────────────────

/**
 * Position and show the selection halo ring and invisible face overlay
 * to match the geometry of the given face's ellipse.
 */
export function showHaloForFace(state: TouchHandlerState, face: Face): void {
    const faceEllipse = state.svgRoot.getElementById(
        `${face}-face-ellipse`
    ) as SVGEllipseElement | null;

    if (faceEllipse) {
        const cx = faceEllipse.getAttribute('cx') ?? '0';
        const cy = faceEllipse.getAttribute('cy') ?? '0';
        const rx = faceEllipse.getAttribute('rx') ?? '0';
        const ry = faceEllipse.getAttribute('ry') ?? '0';
        const transform = faceEllipse.getAttribute('transform');

        state.haloEl.setAttribute('cx', cx);
        state.haloEl.setAttribute('cy', cy);
        state.haloEl.setAttribute('rx', rx);
        state.haloEl.setAttribute('ry', ry);
        if (transform) {
            state.haloEl.setAttribute('transform', transform);
        } else {
            state.haloEl.removeAttribute('transform');
        }
        state.haloEl.setAttribute('visibility', 'visible');

        state.faceOverlayEl.setAttribute('cx', cx);
        state.faceOverlayEl.setAttribute('cy', cy);
        state.faceOverlayEl.setAttribute('rx', rx);
        state.faceOverlayEl.setAttribute('ry', ry);
        if (transform) {
            state.faceOverlayEl.setAttribute('transform', transform);
        } else {
            state.faceOverlayEl.removeAttribute('transform');
        }
        state.faceOverlayEl.setAttribute('pointer-events', 'all');
    }
}

/** Hide the selection halo and disable pointer events on the face overlay. */
export function hideHalo(state: TouchHandlerState): void {
    state.haloEl.setAttribute('visibility', 'hidden');
    state.faceOverlayEl.setAttribute('pointer-events', 'none');
}

/**
 * Undo a temporary face-direct activation: restore the face that was
 * selected before the gesture started (or hide the halo if none).
 */
export function restoreTempFaceState(state: TouchHandlerState): void {
    if (state.directModeTempFace === undefined) {
        return;
    }
    state.selectedFace = state.previousSelectedFace;
    if (state.previousSelectedFace) {
        showHaloForFace(state, state.previousSelectedFace);
    } else {
        hideHalo(state);
    }
    state.directModeTempFace = undefined;
    state.previousSelectedFace = undefined;
}

/** Return `true` if `element` is the halo ring or invisible face overlay. */
export function isHaloElement(state: TouchHandlerState, element: Element | null): boolean {
    return element === state.haloEl || element === state.faceOverlayEl;
}

/** Return the client-pixel coordinates of a face's ellipse centre, or `undefined` if not found. */
export function getFaceCenterClient(
    state: TouchHandlerState,
    face: Face | undefined
): { x: number; y: number } | undefined {
    if (!face) {
        return undefined;
    }

    const ellipse = state.svgRoot.getElementById(
        `${face}-face-ellipse`
    ) as SVGEllipseElement | null;
    if (!ellipse) {
        return undefined;
    }

    const cx = Number(ellipse.getAttribute('cx') ?? 0);
    const cy = Number(ellipse.getAttribute('cy') ?? 0);
    return svgToClientPoint(state.svgRoot, cx, cy, { x: cx, y: cy });
}

// ── Cancel zone ─────────────────────────────────────────────────────────────

/** Show the circular cancel-zone indicator at the pointer-down position. */
export function showCancelZone(state: TouchHandlerState, clientX: number, clientY: number): void {
    const center = clientToSvgPoint(state.svgRoot, clientX, clientY);
    const edge = clientToSvgPoint(state.svgRoot, clientX + getCommitThresholdPx(state), clientY);
    const svgRadius = Math.hypot(edge.x - center.x, edge.y - center.y);
    state.cancelZoneEl.setAttribute('cx', `${center.x}`);
    state.cancelZoneEl.setAttribute('cy', `${center.y}`);
    state.cancelZoneEl.setAttribute('r', `${svgRadius}`);
    state.cancelZoneEl.setAttribute('visibility', 'visible');
}

/** Hide the cancel-zone indicator. */
export function hideCancelZone(state: TouchHandlerState): void {
    state.cancelZoneEl.setAttribute('visibility', 'hidden');
}

/** Return the commit-distance threshold in pixels for the current layout mode. */
export function getCommitThresholdPx(state: TouchHandlerState): number {
    return state.layoutMode === LayoutMode.Tabbed ? COMMIT_DISTANCE_TABBED_PX : COMMIT_DISTANCE_PX;
}

// ── Detection bands ─────────────────────────────────────────────────────────

/**
 * Render a debug annular band (donut) between `innerR` and `outerR`
 * for the given axis, clipped to the exterior of the LBD triangle.
 */
export function showDetectionBand(
    state: TouchHandlerState,
    cx: number,
    cy: number,
    innerR: number,
    outerR: number,
    axis: Axis
): void {
    const entry = state.axisDetectionBands.get(axis);
    if (!entry) return;
    updateDetectionBandClip(state, axis, entry.clipEl);

    const d = [
        `M ${cx + outerR} ${cy}`,
        `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
        `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
        `M ${cx + innerR} ${cy}`,
        `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
        `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
        'Z',
    ].join(' ');
    entry.bandEl.setAttribute('d', d);
    for (const [a, { bandEl }] of state.axisDetectionBands) {
        bandEl.setAttribute('visibility', a === axis ? 'visible' : 'hidden');
    }
}

/** Hide all axis detection bands. */
export function hideDetectionBand(state: TouchHandlerState): void {
    for (const { bandEl } of state.axisDetectionBands.values()) {
        bandEl.setAttribute('visibility', 'hidden');
    }
}

/** Compute biased radial boundaries for `target` and show the detection band. */
export function showDetectionBandForCircle(
    state: TouchHandlerState,
    target: { axis: Axis; layer: number; cx: number; cy: number; r: number }
): void {
    const group = state.axisCircles.filter(c => c.axis === target.axis).sort((a, b) => a.r - b.r);
    if (group.length === 0) return;

    const boundaries = computeBiasedBoundaries(group);

    const idx = group.findIndex(c => c.layer === target.layer);
    if (idx < 0) return;

    showDetectionBand(
        state,
        target.cx,
        target.cy,
        boundaries[idx],
        boundaries[idx + 1],
        target.axis
    );
}

/**
 * Rebuild a detection-band clip path so the band is visible only on
 * the exterior side of the LBD triangle edge facing this axis.
 */
export function updateDetectionBandClip(
    state: TouchHandlerState,
    axis: Axis,
    clipEl: SVGClipPathElement
): void {
    while (clipEl.firstChild) clipEl.removeChild(clipEl.firstChild);

    const mkPath = (d: string) => {
        const el = document.createElementNS(SVG_NS, 'path');
        el.setAttribute('d', d);
        return el;
    };

    const pts = getLbdTrianglePoints(state.svgRoot);

    if (!pts) {
        clipEl.appendChild(mkPath('M -9999 -9999 L 9999 -9999 L 9999 9999 L -9999 9999 Z'));
        return;
    }

    const { topLeft, topRight, bottom } = pts;

    const edgeByAxis: Record<Axis, { a: Point2D; b: Point2D }> = {
        [Axis.Y]: { a: topLeft, b: topRight },
        [Axis.X]: { a: topRight, b: bottom },
        [Axis.Z]: { a: bottom, b: topLeft },
    };

    const { a, b } = edgeByAxis[axis];
    const FAR = 9999;
    const dx = b.x - a.x,
        dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ex = (dx / len) * FAR,
        ey = (dy / len) * FAR;
    const nx = (dy / len) * FAR,
        ny = -(dx / len) * FAR;
    const p1x = a.x - ex,
        p1y = a.y - ey;
    const p2x = b.x + ex,
        p2y = b.y + ey;
    clipEl.appendChild(
        mkPath(
            `M ${p1x} ${p1y} L ${p2x} ${p2y}` +
                ` L ${p2x + nx} ${p2y + ny} L ${p1x + nx} ${p1y + ny} Z`
        )
    );
}

// ── Axis circle previews ────────────────────────────────────────────────────

/** Look up the SVG `<circle>` element for an axis circle key (e.g. `"X-1"`). */
export function getAxisCircleElementByKey(
    state: TouchHandlerState,
    key: string
): SVGCircleElement | undefined {
    const parsed = parseAxisCircleKey(key);
    if (!parsed) {
        return undefined;
    }

    const axisCircle = state.axisCircles.find(
        circle => circle.axis === parsed.axis && circle.layer === parsed.layer
    );
    if (!axisCircle) {
        return undefined;
    }

    return state.svgRoot.getElementById(axisCircle.id) as SVGCircleElement | undefined;
}

/** Add or remove the CSS selected class on an axis circle element. */
export function setAxisSelectedClass(
    state: TouchHandlerState,
    key: string,
    selected: boolean,
    knownElement?: SVGCircleElement
): void {
    const className = state.styles['circular-axis-selected'] ?? 'circular-axis-selected';
    const element = knownElement ?? getAxisCircleElementByKey(state, key);
    if (!element) {
        return;
    }

    if (selected) {
        element.classList.add(className);
        return;
    }

    element.classList.remove(className);
}

/** Remove the selected CSS class from all axis circles and clear the selection set. */
export function clearAxisSelections(state: TouchHandlerState): void {
    for (const key of state.selectedAxisCircles) {
        setAxisSelectedClass(state, key, false);
    }
    state.selectedAxisCircles.clear();
}

/** Transiently highlight a set of axis circle keys as a drag preview. */
function showAxisKeysPreview(state: TouchHandlerState, keys: Iterable<string>): void {
    const className = state.styles['circular-axis-selected'] ?? 'circular-axis-selected';
    state.previewAxisKeys ??= new Set<string>();
    for (const key of keys) {
        const el = getAxisCircleElementByKey(state, key);
        if (!el) continue;
        el.classList.add(className);
        state.previewAxisKeys.add(key);
    }
}

/**
 * Preview the circle(s) that will move on drag commit. If the hit circle
 * is part of a multi-circle selection, previews all selected circles;
 * otherwise previews only the hit circle.
 */
export function showAxisCirclePreview(state: TouchHandlerState, hitKey: string): void {
    const keys =
        state.selectedAxisCircles.has(hitKey) && state.selectedAxisCircles.size > 1
            ? state.selectedAxisCircles
            : [hitKey];
    showAxisKeysPreview(state, keys);
}

/** Remove all transient axis-circle preview highlights, respecting persistent selections and fretboard ownership. */
export function hideAxisPreviewAll(state: TouchHandlerState): void {
    if (!state.previewAxisKeys || state.previewAxisKeys.size === 0) return;
    const className = state.styles['circular-axis-selected'] ?? 'circular-axis-selected';
    for (const key of Array.from(state.previewAxisKeys)) {
        if (state.selectedAxisCircles.has(key)) continue;
        if (state.fretboardVisualKeys.has(key)) continue;
        const el = getAxisCircleElementByKey(state, key);
        if (!el) continue;
        el.classList.remove(className);
    }
    state.previewAxisKeys.clear();
}

// ── Drag label ──────────────────────────────────────────────────────────────

/**
 * Show the floating drag label near the pointer with the given move-notation text.
 * In tabbed layout the label uses fixed positioning to escape the panel bounds.
 */
export function showDragLabel(
    state: TouchHandlerState,
    label: string,
    clientX: number,
    clientY: number
): void {
    const hostRect = state.host.getBoundingClientRect();
    state.dragLabelEl.textContent = label;
    state.dragLabelEl.style.display = 'block';

    const labelWidth = state.dragLabelEl.offsetWidth || 40;
    const labelHeight = state.dragLabelEl.offsetHeight || 22;

    const result = computeDragLabelPosition({
        layoutMode: state.layoutMode,
        clientX,
        clientY,
        hostRect,
        labelWidth,
        labelHeight,
    });

    state.dragLabelEl.style.position = result.position;
    state.dragLabelEl.style.zIndex = result.zIndex;
    state.dragLabelEl.style.left = `${result.x}px`;
    state.dragLabelEl.style.top = `${result.y}px`;
}

/** Hide the floating drag label and reset its positioning style. */
export function hideDragLabel(state: TouchHandlerState): void {
    state.dragLabelEl.style.display = 'none';
    state.dragLabelEl.style.position = '';
    state.dragLabelEl.style.zIndex = '';
}
