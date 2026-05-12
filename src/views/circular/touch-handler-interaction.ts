/**
 * Interaction logic for the circular touch handler.
 *
 * Hit detection, gesture-intent building, move inference, axis selection
 * management, and tap handling — everything that decides *what* the user
 * intended and turns it into cube-move notations.
 */
import { Application } from '@/application';
import { Axis } from '@/cube/types';
import {
    axisLayerToNotation,
    inferMoveFromFaceRotation,
    inferWholeCubeMove,
    toFar,
} from '@/interaction/move-inference';
import {
    type DragGesture,
    type GestureIntent,
    HitKind,
    type InteractionContext,
} from '@/interaction/types';
import { EventName, type MoveRequestedEvent } from '@/types';

import { clientToSvgPoint, svgToClientPoint } from './svg-tools';
import {
    fretboardPerpDistancePx,
    getFretboardHighlightTarget,
    setupFretboard,
    setupFretboardFromBackground,
    updateFretboardHighlight,
} from './touch-handler-fretboard';
import {
    axisToWholeCubeNotation,
    collectAxisCentersByAxis,
    compareAxisLayer,
    computeBiasedBoundaries,
    getAxisCircleKey,
    getNearestAxisByPoint,
    isAxisLayerReversedFromCanonical,
    parseAxisCircleKey,
} from './touch-handler-geometry';
import { getFaceEllipseHit, resolveStickerHit } from './touch-handler-hit-testing';
import { findNearestStickerOnFace } from './touch-handler-hit-testing';
import {
    clearAxisSelections,
    getCommitThresholdPx,
    getFaceCenterClient,
    hideDragDecisionCross,
    hideDragLabel,
    hideHalo,
    isHaloElement,
    isInLbdDeadZone,
    setAxisSelectedClass,
    setupFaceEllipseGuideLine,
    setupHaloGuideLine,
    setupStickerDragCross,
    showAxisCirclePreview,
    showCancelZone,
    showDetectionBand,
    showDetectionBandForCircle,
    showDragLabel,
    showHaloForFace,
} from './touch-handler-overlays';
import { FRETBOARD_BG_KEY } from './touch-handler-types';
import type { AxisHit, InteractionStart, TouchHandlerState } from './touch-handler-types';

// ── Hit detection ───────────────────────────────────────────────────────────

/**
 * Determine what the user touched at pointer-down by testing candidates
 * in priority order: halo → sticker → face ellipse → LBD dead zone →
 * axis circle (element + proximity) → background.
 */
export function getInteractionStart(
    state: TouchHandlerState,
    target: EventTarget | null,
    clientX: number,
    clientY: number
): InteractionStart {
    const element = target instanceof Element ? target : null;

    if (isHaloElement(state, element)) {
        return { kind: HitKind.HALO };
    }

    const sticker = element?.closest('circle.sticker') as SVGCircleElement | null;
    if (sticker && state.svgRoot.contains(sticker)) {
        const stickerId = sticker.getAttribute('data-sticker-id') ?? undefined;
        const resolved = resolveStickerHit(stickerId, state.getCubeState, state.getCubeSize);
        if (resolved) {
            return {
                kind: HitKind.STICKER,
                sticker: resolved,
            };
        }

        return { kind: HitKind.NONE };
    }

    const faceEllipse = getFaceEllipseHit(state.svgRoot, element);
    if (faceEllipse) {
        return { kind: HitKind.FACE_ELLIPSE, face: faceEllipse };
    }

    if (isInLbdDeadZone(state, clientX, clientY)) {
        return { kind: HitKind.NONE };
    }

    const axis = getAxisHit(state, element, clientX, clientY);
    if (axis) {
        return { kind: HitKind.AXIS_CIRCLE, axis };
    }

    if (element && state.svgRoot.contains(element)) {
        return { kind: HitKind.BACKGROUND };
    }

    return { kind: HitKind.NONE };
}

/**
 * Resolve an axis-circle hit from a DOM element or, failing that, via
 * proximity-based detection with biased radial boundaries that favour
 * middle-slice circles.
 */
export function getAxisHit(
    state: TouchHandlerState,
    element: Element | null,
    clientX: number,
    clientY: number
): AxisHit | undefined {
    const axisCircleElement = element?.closest('circle[id]') as SVGCircleElement | null;
    const axisMatch = axisCircleElement?.id?.match(/^([xyz])-layer-(\d+)$/i);
    if (axisMatch && axisCircleElement) {
        const axisChar = axisMatch[1].toUpperCase();
        const layer = Number(axisMatch[2]);
        const axis = axisChar as Axis;

        const axisCircle = state.axisCircles.find(c => c.axis === axis && c.layer === layer);
        if (!axisCircle) {
            return undefined;
        }

        const svgPoint = clientToSvgPoint(state.svgRoot, clientX, clientY);

        showDetectionBandForCircle(state, axisCircle);

        return {
            axis,
            layer,
            key: getAxisCircleKey(axis, layer),
            element: axisCircleElement,
            circleCenterClient: svgToClientPoint(
                state.svgRoot,
                axisCircle.cx,
                axisCircle.cy,
                svgPoint
            ),
        };
    }

    const svgPoint = clientToSvgPoint(state.svgRoot, clientX, clientY);

    const byAxis: Record<string, typeof state.axisCircles> = { X: [], Y: [], Z: [] };
    for (const c of state.axisCircles) {
        byAxis[c.axis.toUpperCase()]?.push(c);
    }

    const axisCenters = collectAxisCentersByAxis(state.axisCircles);
    const nearestAxis = getNearestAxisByPoint(svgPoint, axisCenters);
    if (!nearestAxis) return undefined;

    const group = (byAxis[nearestAxis.toUpperCase()] || []).slice().sort((a, b) => a.r - b.r);
    if (group.length === 0) return undefined;

    const boundaries = computeBiasedBoundaries(group);

    const dx = svgPoint.x - group[0].cx;
    const dy = svgPoint.y - group[0].cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    let chosen: (typeof group)[0] | undefined;
    let chosenLow = 0;
    let chosenHigh = 0;
    for (let i = 0; i < group.length; i += 1) {
        const low = boundaries[i];
        const high = boundaries[i + 1];
        if (d >= low && d <= high) {
            chosen = group[i];
            chosenLow = low;
            chosenHigh = high;
            break;
        }
    }

    if (!chosen) {
        return undefined;
    }

    showDetectionBand(state, chosen.cx, chosen.cy, chosenLow, chosenHigh, chosen.axis);

    const el = state.svgRoot.getElementById(chosen.id) as SVGCircleElement | null;
    if (!el) return undefined;

    return {
        axis: chosen.axis,
        layer: chosen.layer,
        key: getAxisCircleKey(chosen.axis, chosen.layer),
        element: el,
        circleCenterClient: svgToClientPoint(state.svgRoot, chosen.cx, chosen.cy, svgPoint),
    };
}

// ── Tap handling ────────────────────────────────────────────────────────────

/**
 * Process a tap (pointer-up without drag) on the given hit target.
 * Toggles face selection, axis-circle selection, or clears both.
 */
export function handleTap(state: TouchHandlerState, hit: InteractionStart): void {
    if (hit.kind === HitKind.AXIS_CIRCLE) {
        toggleAxisSelection(state, hit.axis);
        return;
    }

    clearAxisSelections(state);

    if (hit.kind === HitKind.HALO) {
        state.selectedFace = undefined;
        state.onStickerSelected(undefined);
        hideHalo(state);
        return;
    }

    if (hit.kind === HitKind.STICKER) {
        state.selectedFace = state.selectedFace === hit.sticker.face ? undefined : hit.sticker.face;
        state.onStickerSelected(state.selectedFace ? hit.sticker.stickerId : undefined);

        if (!state.selectedFace) {
            hideHalo(state);
            return;
        }

        showHaloForFace(state, state.selectedFace);
        return;
    }

    if (hit.kind === HitKind.FACE_ELLIPSE) {
        state.selectedFace = state.selectedFace === hit.face ? undefined : hit.face;

        if (!state.selectedFace) {
            hideHalo(state);
            return;
        }

        showHaloForFace(state, state.selectedFace);
        return;
    }

    state.selectedFace = undefined;
    hideHalo(state);
}

// ── Axis selection ──────────────────────────────────────────────────────────

/** Toggle the persistent selection state of an axis circle (add or remove). */
export function toggleAxisSelection(state: TouchHandlerState, hit: AxisHit): void {
    if (state.selectedAxisCircles.has(hit.key)) {
        state.selectedAxisCircles.delete(hit.key);
        setAxisSelectedClass(state, hit.key, false);
        return;
    }

    selectAxisCircle(state, hit);
}

/** Add an axis circle to the selection, clearing circles from other axes first. */
export function selectAxisCircle(state: TouchHandlerState, hit: AxisHit): void {
    const existingAxis = getSelectedAxis(state);
    if (existingAxis !== undefined && existingAxis !== hit.axis) {
        clearAxisSelections(state);
    }

    state.selectedAxisCircles.add(hit.key);
    setAxisSelectedClass(state, hit.key, true, hit.element);
}

/** Return the axis shared by all currently selected circles, or `undefined` if none are selected. */
export function getSelectedAxis(state: TouchHandlerState): Axis | undefined {
    const firstKey = state.selectedAxisCircles.values().next().value as string | undefined;
    if (firstKey === undefined) {
        return undefined;
    }
    return parseAxisCircleKey(firstKey)?.axis;
}

/**
 * Return the axis for which all layers are selected, or `undefined`.
 * Used to collapse a full-axis selection into a single whole-cube move.
 */
function getFullySelectedAxis(state: TouchHandlerState, cubeSize: number): Axis | undefined {
    for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
        let allSelected = true;
        for (let layer = 0; layer < cubeSize; layer += 1) {
            if (!state.selectedAxisCircles.has(getAxisCircleKey(axis, layer))) {
                allSelected = false;
                break;
            }
        }
        if (allSelected) {
            return axis;
        }
    }

    return undefined;
}

/**
 * Infer move notations for all currently selected axis circles.
 * When every layer of one axis is selected, emits a single whole-cube
 * move; otherwise emits one move per selected layer, normalised to
 * canonical axis direction.
 */
function inferSelectedAxisNotations(
    state: TouchHandlerState,
    isClockwise: boolean,
    context: InteractionContext
): string[] {
    const cubeSize = context.cubeSize;
    const selected = Array.from(state.selectedAxisCircles)
        .map(parseAxisCircleKey)
        .filter((entry): entry is { axis: Axis; layer: number } => Boolean(entry));

    if (selected.length === 0) {
        return [];
    }

    const fullAxis = getFullySelectedAxis(state, cubeSize);
    if (fullAxis) {
        return [axisToWholeCubeNotation(fullAxis, isClockwise)];
    }

    const sorted = selected.sort(compareAxisLayer);
    if (!isClockwise) sorted.reverse();
    return sorted.map(entry => {
        const reversed = isAxisLayerReversedFromCanonical(entry.axis, entry.layer, cubeSize);
        const effectiveClockwise = reversed ? !isClockwise : isClockwise;
        return (
            state.adapter.inferAxisCircleNotation?.(
                entry.axis,
                entry.layer,
                effectiveClockwise,
                context
            ) ?? axisLayerToNotation(entry.axis, entry.layer, effectiveClockwise, cubeSize)
        );
    });
}

// ── Gesture intent building ─────────────────────────────────────────────────

/**
 * Map the raw drag gesture and the captured `start` hit-kind into a
 * `GestureIntent` that carries view-space context (SVG start point,
 * axis, layer, face) alongside the generic drag metrics.
 */
export function buildGestureIntent(state: TouchHandlerState, gesture: DragGesture): GestureIntent {
    const startViewPoint = clientToSvgPoint(state.svgRoot, gesture.start.x, gesture.start.y);

    if (state.start.kind === HitKind.HALO) {
        return {
            hitKind: HitKind.HALO,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            startViewPoint,
            angularDisplacementRad: gesture.angularDisplacementRad,
        };
    }

    if (state.start.kind === HitKind.AXIS_CIRCLE) {
        return {
            hitKind: HitKind.AXIS_CIRCLE,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            startViewPoint,
            angularDisplacementRad: gesture.angularDisplacementRad,
            axis: state.start.axis.axis,
            layer: state.start.axis.layer,
        };
    }

    if (state.start.kind === HitKind.STICKER) {
        return {
            hitKind: HitKind.STICKER,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            startViewPoint,
            angularDisplacementRad: gesture.angularDisplacementRad,
            face: state.start.sticker.face,
            row: state.start.sticker.row,
            col: state.start.sticker.col,
        };
    }

    if (state.start.kind === HitKind.FACE_ELLIPSE) {
        return {
            hitKind: HitKind.FACE_ELLIPSE,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            startViewPoint,
            angularDisplacementRad: gesture.angularDisplacementRad,
            face: state.start.face,
        };
    }

    if (state.start.kind === HitKind.BACKGROUND) {
        return {
            hitKind: HitKind.BACKGROUND,
            direction: gesture.direction,
            distancePx: gesture.distancePx,
            deltaX: gesture.deltaX,
            deltaY: gesture.deltaY,
            startViewPoint,
            angularDisplacementRad: gesture.angularDisplacementRad,
        };
    }

    return {
        hitKind: HitKind.NONE,
        direction: gesture.direction,
        distancePx: gesture.distancePx,
        deltaX: gesture.deltaX,
        deltaY: gesture.deltaY,
        startViewPoint,
        angularDisplacementRad: gesture.angularDisplacementRad,
    };
}

/** Create a minimal `InteractionContext` snapshot for move-inference functions. */
export function createInteractionContext(state: TouchHandlerState): InteractionContext {
    return {
        cubeSize: state.getCubeSize(),
        selectedFace: state.selectedFace,
    };
}

// ── Move inference ──────────────────────────────────────────────────────────

/**
 * Central move-inference router. Examines the gesture intent and active
 * fretboard state to produce zero or more WCA move-notation strings.
 * Handles halo rotation, fretboard (axis-circle + background), sticker
 * drag-cross, and bare-background whole-cube moves.
 */
export function inferMovesForGesture(state: TouchHandlerState, gesture: DragGesture): string[] {
    const context = createInteractionContext(state);
    const intent = buildGestureIntent(state, gesture);

    const isFretboardActive =
        state.fretboardHighlightKey !== undefined &&
        (intent.hitKind === HitKind.AXIS_CIRCLE || intent.hitKind === HitKind.BACKGROUND);

    if (!isFretboardActive && intent.distancePx < getCommitThresholdPx(state)) {
        return [];
    }

    if (intent.hitKind === HitKind.HALO && state.selectedFace) {
        const angular = intent.angularDisplacementRad;
        if (angular === undefined || Math.abs(angular) < 0.1) {
            return [];
        }
        const notation =
            state.adapter.inferFaceRotationNotation?.(state.selectedFace, angular > 0, context) ??
            inferMoveFromFaceRotation(state.selectedFace, angular > 0);
        if (gesture.distancePx > state.dragStateMachine.farDragThresholdPx) {
            return [toFar(notation)];
        }
        return [notation];
    }

    if (
        (intent.hitKind === HitKind.AXIS_CIRCLE || intent.hitKind === HitKind.BACKGROUND) &&
        state.fretboardHighlightKey !== undefined
    ) {
        const perpDist = fretboardPerpDistancePx(state, gesture);
        const effectiveDistance = perpDist ?? gesture.distancePx;

        if (effectiveDistance < getCommitThresholdPx(state)) {
            return [];
        }

        if (state.fretboardHighlightKey === FRETBOARD_BG_KEY) {
            const angular = intent.angularDisplacementRad;
            if (angular === undefined || Math.abs(angular) < 0.1) {
                return [];
            }
            const axis = state.fretboardAxis;
            if (!axis) {
                return [];
            }
            const isClockwise = angular > 0;
            const notation = axisToWholeCubeNotation(axis, isClockwise);
            if (effectiveDistance > state.dragStateMachine.farDragThresholdPx) {
                return [toFar(notation)];
            }
            return [notation];
        }

        const fretTarget = getFretboardHighlightTarget(state);
        const axis = fretTarget?.axis ?? intent.axis;
        const layer = fretTarget?.layer ?? intent.layer;
        const angular = intent.angularDisplacementRad;
        if (
            axis === undefined ||
            layer === undefined ||
            angular === undefined ||
            Math.abs(angular) < 0.1
        ) {
            return [];
        }
        const isClockwiseOnScreen = angular > 0;
        const reversed = isAxisLayerReversedFromCanonical(axis, layer, context.cubeSize);
        const isClockwise = reversed ? !isClockwiseOnScreen : isClockwiseOnScreen;

        const dragAxisKey = getAxisCircleKey(axis, layer);
        if (state.selectedAxisCircles.size > 0 && state.selectedAxisCircles.has(dragAxisKey)) {
            const notations = inferSelectedAxisNotations(state, isClockwiseOnScreen, context);
            if (effectiveDistance > state.dragStateMachine.farDragThresholdPx) {
                return notations.map(toFar);
            }
            return notations;
        }

        const notation =
            state.adapter.inferAxisCircleNotation?.(axis, layer, isClockwise, context) ??
            axisLayerToNotation(axis, layer, isClockwise, context.cubeSize);
        if (effectiveDistance > state.dragStateMachine.farDragThresholdPx) {
            return [toFar(notation)];
        }
        return [notation];
    }

    if (intent.hitKind === HitKind.AXIS_CIRCLE) {
        const angular = intent.angularDisplacementRad;
        if (
            intent.axis === undefined ||
            intent.layer === undefined ||
            angular === undefined ||
            Math.abs(angular) < 0.1
        ) {
            return [];
        }
        const reversed = isAxisLayerReversedFromCanonical(
            intent.axis,
            intent.layer,
            context.cubeSize
        );
        const isClockwise = reversed ? angular <= 0 : angular > 0;
        const notation =
            state.adapter.inferAxisCircleNotation?.(
                intent.axis,
                intent.layer,
                isClockwise,
                context
            ) ?? axisLayerToNotation(intent.axis, intent.layer, isClockwise, context.cubeSize);
        if (gesture.distancePx > state.dragStateMachine.farDragThresholdPx) {
            return [toFar(notation)];
        }
        return [notation];
    }

    if (intent.hitKind === HitKind.STICKER && intent.face !== undefined) {
        if (!state.pendingStickerCross) {
            return [];
        }

        const { basis, upMove, downMove, rightMove, leftMove } = state.pendingStickerCross;
        const startSvg = clientToSvgPoint(state.svgRoot, gesture.start.x, gesture.start.y);
        const endSvg = clientToSvgPoint(state.svgRoot, gesture.current.x, gesture.current.y);
        const dx = endSvg.x - startSvg.x;
        const dy = endSvg.y - startSvg.y;
        const dUp = dx * basis.upDir.x + dy * basis.upDir.y;
        const dRight = dx * basis.rightDir.x + dy * basis.rightDir.y;
        const move =
            Math.abs(dUp) >= Math.abs(dRight)
                ? dUp > 0
                    ? upMove
                    : downMove
                : dRight > 0
                  ? rightMove
                  : leftMove;
        if (gesture.distancePx > state.dragStateMachine.farDragThresholdPx) {
            return [toFar(move)];
        }
        return [move];
    }

    if (intent.hitKind === HitKind.BACKGROUND) {
        const contextWithStart: InteractionContext = {
            ...context,
            metadata: {
                ...(context.metadata ?? {}),
                startViewPointX: intent.startViewPoint?.x,
                startViewPointY: intent.startViewPoint?.y,
            },
        };

        const notation = inferWholeCubeMove(intent.deltaX, intent.deltaY, (deltaX, deltaY) =>
            state.adapter.inferWholeCubeNotation?.(deltaX, deltaY, contextWithStart)
        );
        if (notation && gesture.distancePx > state.dragStateMachine.farDragThresholdPx) {
            return [toFar(notation)];
        }
        return notation ? [notation] : [];
    }

    return [];
}

// ── Drag callbacks ──────────────────────────────────────────────────────────

/**
 * Drag-update callback wired to `DragStateMachine.onDragUpdate`.
 * Refreshes the fretboard highlight when fretting and updates the
 * floating drag label with the inferred notation.
 */
export function onDragUpdate(state: TouchHandlerState, gesture: DragGesture): void {
    if (
        (state.start.kind === HitKind.AXIS_CIRCLE || state.start.kind === HitKind.BACKGROUND) &&
        state.fretboardHighlightKey
    ) {
        updateFretboardHighlight(state, gesture.current.x, gesture.current.y);
    }

    const notations = inferMovesForGesture(state, gesture);
    if (notations.length === 0) {
        hideDragLabel(state);
        return;
    }

    const label =
        notations.length <= 2 ? notations.join('+') : `${notations[0]} +${notations.length - 1}`;
    showDragLabel(state, label, gesture.current.x, gesture.current.y);
}

/**
 * Drag-end callback wired to `DragStateMachine.onDragEnd`.
 * Infers the final move notation(s) and emits `MOVE_REQUESTED` events.
 */
export function onDragEnd(state: TouchHandlerState, gesture: DragGesture): void {
    const notations = inferMovesForGesture(state, gesture);
    hideDragLabel(state);

    if (notations.length === 0) {
        return;
    }

    for (const notation of notations) {
        const payload: MoveRequestedEvent = {
            moveNotation: notation,
            viewId: 'circular',
            tentative: false,
        };
        Application.eventBus.emit(EventName.MOVE_REQUESTED, payload);
    }
}

// ── Pointer-down sub-handlers ───────────────────────────────────────────────

/**
 * Master pointer-down handler. Determines the hit target, sets up the
 * appropriate visual guides (drag cross, halo guide, fretboard), and
 * starts the drag state machine with the correct rotation centre.
 */
export function handlePointerDown(
    state: TouchHandlerState,
    event: PointerEvent,
    target: EventTarget | null
): void {
    if (state.activePointerId !== undefined) {
        return;
    }

    state.activePointerId = event.pointerId;
    showCancelZone(state, event.clientX, event.clientY);

    const hit = getInteractionStart(state, target, event.clientX, event.clientY);
    if (hit.kind === HitKind.STICKER) {
        setupStickerDragCross(state, hit.sticker, event.clientX, event.clientY);
    } else if (
        hit.kind !== HitKind.HALO &&
        hit.kind !== HitKind.AXIS_CIRCLE &&
        hit.kind !== HitKind.FACE_ELLIPSE &&
        hit.kind !== HitKind.BACKGROUND
    ) {
        hideDragDecisionCross(state);
    }

    if (
        state.selectedFace &&
        hit.kind === HitKind.STICKER &&
        hit.sticker.face === state.selectedFace
    ) {
        state.start = { kind: HitKind.NONE };
        state.dragStateMachine.onPointerDown(event);
        hideDragDecisionCross(state);
        return;
    }

    if (
        state.faceDirectMode &&
        (hit.kind === HitKind.STICKER || hit.kind === HitKind.FACE_ELLIPSE)
    ) {
        const face = hit.kind === HitKind.STICKER ? hit.sticker.face : hit.face;
        state.directModeTempFace = face;
        state.previousSelectedFace = state.selectedFace;
        state.selectedFace = face;
        showHaloForFace(state, face);
        state.start = { kind: HitKind.HALO };
        state.dragStateMachine.onPointerDown(event, {
            rotationCenter: getFaceCenterClient(state, face),
        });
        setupFaceEllipseGuideLine(state, face, event.clientX, event.clientY);
        return;
    }

    state.start = hit;

    if (hit.kind === HitKind.HALO) {
        setupHaloGuideLine(state, event.clientX, event.clientY);
        state.dragStateMachine.onPointerDown(event, {
            rotationCenter: getFaceCenterClient(state, state.selectedFace),
        });
        return;
    }

    if (hit.kind === HitKind.AXIS_CIRCLE) {
        showAxisCirclePreview(state, hit.axis.key);
        setupFretboard(state, hit.axis, event.clientX, event.clientY);
        state.dragStateMachine.onPointerDown(event, {
            rotationCenter: hit.axis.circleCenterClient,
        });
        return;
    }

    if (hit.kind === HitKind.FACE_ELLIPSE) {
        const startSvg = clientToSvgPoint(state.svgRoot, event.clientX, event.clientY);
        const nearestSticker = findNearestStickerOnFace(
            state.svgRoot,
            hit.face,
            startSvg,
            state.getCubeState,
            state.getCubeSize
        );
        if (nearestSticker) {
            state.start = { kind: HitKind.STICKER, sticker: nearestSticker };
            setupStickerDragCross(state, nearestSticker, event.clientX, event.clientY);
        } else {
            setupFaceEllipseGuideLine(state, hit.face, event.clientX, event.clientY);
        }
        state.dragStateMachine.onPointerDown(event);
        return;
    }

    if (hit.kind === HitKind.BACKGROUND) {
        setupFretboardFromBackground(state, event.clientX, event.clientY);
        const svgPoint = clientToSvgPoint(state.svgRoot, event.clientX, event.clientY);
        const axisCenters = collectAxisCentersByAxis(state.axisCircles);
        const nearestAxis = getNearestAxisByPoint(svgPoint, axisCenters);
        const axisCenter = nearestAxis ? axisCenters[nearestAxis] : undefined;
        const rotationCenter = axisCenter
            ? svgToClientPoint(state.svgRoot, axisCenter.x, axisCenter.y, axisCenter)
            : undefined;
        state.dragStateMachine.onPointerDown(event, { rotationCenter });
        return;
    }

    state.dragStateMachine.onPointerDown(event);
}
