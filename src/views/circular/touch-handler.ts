import { Application } from '@/application';
import { Axis, Face } from '@/cube/types';
import type { CubeState } from '@/cube/types';
import type { StickerId } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { clamp, distance2, dot2, negate2, normalize2 } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import {
    axisLayerToNotation,
    inferMoveFromDrag,
    inferMoveFromFaceRotation,
    inferWholeCubeMove,
} from '@/interaction/move-inference';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    CANCEL_ZONE_TABBED_MULTIPLIER,
    DragDirection,
    DragGesture,
    GestureIntent,
    HitKind,
    InteractionContext,
    Point2D,
    ViewInteractionAdapter,
} from '@/interaction/types';
import { EventName, MoveRequestedEvent } from '@/types';

import {
    FACE_TOP_DIRECTION_HINTS,
    type FaceScreenBasis,
    buildFaceScreenBasisByFace,
    buildFaceScreenBasisFromHint,
    mapDirectionToFaceBasis,
} from './direction-mapping';
import { AxisCircle } from './svg-tools';

type CircularTouchHandlerOptions = {
    svgRoot: SVGSVGElement;
    host: HTMLElement;
    styles: Record<string, string>;
    axisCircles: AxisCircle[];
    getCubeSize: () => number;
    getCubeState?: () => CubeState;
    onStickerSelected: (stickerId?: string) => void;
    adapter?: ViewInteractionAdapter;
};

type StickerHit = {
    face: Face;
    row: number;
    col: number;
    stickerId?: string;
};

type AxisHit = {
    axis: Axis;
    layer: number;
    key: string;
    element: SVGCircleElement;
    circleCenterClient: { x: number; y: number };
};

type InteractionStart =
    | { kind: typeof HitKind.STICKER; sticker: StickerHit }
    | { kind: typeof HitKind.FACE_ELLIPSE; face: Face }
    | { kind: typeof HitKind.AXIS_CIRCLE; axis: AxisHit }
    | { kind: typeof HitKind.BACKGROUND }
    | { kind: typeof HitKind.HALO }
    | { kind: typeof HitKind.NONE };

const SVG_NS = 'http://www.w3.org/2000/svg';
// Increase the cancel/commit zone in floating (desktop) mode to make it easier to hit.
const COMMIT_DISTANCE_PX = CANCEL_ZONE_RADIUS_BASE_PX;
const COMMIT_DISTANCE_TABBED_PX = CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER;
const CROSSING_PROXIMITY_MAX_SVG = 12;
const DRAG_CROSS_ARM_LENGTH_FLOATING = 34;
const DRAG_CROSS_ARM_LENGTH_TABBED = 64;
const DRAG_THRESHOLD_PX = 4;
const FAR_DRAG_THRESHOLD_PX = 70;

export class CircularTouchHandler {
    private readonly svgRoot: SVGSVGElement;
    private readonly styles: Record<string, string>;
    private readonly axisCircles: AxisCircle[];
    private readonly getCubeSize: () => number;
    private readonly getCubeState: CircularTouchHandlerOptions['getCubeState'];
    private readonly onStickerSelected: (stickerId?: string) => void;
    private readonly adapter: ViewInteractionAdapter;

    private readonly dragStateMachine: DragStateMachine;

    private selectedFace: Face | undefined;
    private selectedAxisCircles = new Set<string>();
    private activePointerId: number | undefined;
    private start: InteractionStart = { kind: HitKind.NONE };
    private pendingStickerCross:
        | {
              basis: FaceScreenBasis;
              upMove: string;
              downMove: string;
              rightMove: string;
              leftMove: string;
          }
        | undefined;
    private layoutMode: LayoutMode = 'floating';

    private faceDirectMode = false;
    private directModeTempFace: Face | undefined;
    private previousSelectedFace: Face | undefined;

    private readonly host: HTMLElement;

    private haloEl: SVGEllipseElement;
    private faceOverlayEl: SVGEllipseElement;
    private dragLabelEl: HTMLDivElement;
    private cancelZoneEl: SVGCircleElement;
    private dragCrossGroupEl: SVGGElement;
    private dragCrossPrimaryEl: SVGLineElement;
    private dragCrossSecondaryEl: SVGLineElement;

    constructor(options: CircularTouchHandlerOptions) {
        this.svgRoot = options.svgRoot;
        this.host = options.host;
        this.styles = options.styles;
        this.axisCircles = options.axisCircles;
        this.getCubeSize = options.getCubeSize;
        this.getCubeState = options.getCubeState;
        this.onStickerSelected = options.onStickerSelected;
        this.adapter = options.adapter ?? createCircularInteractionAdapter(this.axisCircles);

        this.haloEl = document.createElementNS(SVG_NS, 'ellipse');
        this.haloEl.classList.add(this.styles['circular-halo']);
        this.haloEl.setAttribute('visibility', 'hidden');
        this.haloEl.setAttribute('pointer-events', 'none');

        // Invisible overlay that covers the selected face area and absorbs pointer events,
        // so drags anywhere on the face (not just the halo ring) trigger face rotation.
        this.faceOverlayEl = document.createElementNS(SVG_NS, 'ellipse');
        this.faceOverlayEl.classList.add(
            this.styles['circular-face-overlay'] ?? 'circular-face-overlay'
        );
        this.faceOverlayEl.setAttribute('pointer-events', 'none');

        this.dragLabelEl = document.createElement('div');
        this.dragLabelEl.className = this.styles['circular-drag-label'] ?? 'circular-drag-label';
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.setAttribute('aria-hidden', 'true');

        this.cancelZoneEl = document.createElementNS(SVG_NS, 'circle');
        this.cancelZoneEl.classList.add(
            this.styles['circular-cancel-zone'] ?? 'circular-cancel-zone'
        );
        this.cancelZoneEl.setAttribute('visibility', 'hidden');
        this.cancelZoneEl.setAttribute('pointer-events', 'none');
        this.cancelZoneEl.setAttribute('aria-hidden', 'true');

        this.dragCrossGroupEl = document.createElementNS(SVG_NS, 'g');
        this.dragCrossGroupEl.classList.add(
            this.styles['circular-drag-cross'] ?? 'circular-drag-cross'
        );
        this.dragCrossGroupEl.setAttribute('visibility', 'hidden');
        this.dragCrossGroupEl.setAttribute('pointer-events', 'none');

        this.dragCrossPrimaryEl = document.createElementNS(SVG_NS, 'line');
        this.dragCrossPrimaryEl.classList.add(
            this.styles['circular-drag-cross-arm'] ?? 'circular-drag-cross-arm'
        );
        this.dragCrossSecondaryEl = document.createElementNS(SVG_NS, 'line');
        this.dragCrossSecondaryEl.classList.add(
            this.styles['circular-drag-cross-arm'] ?? 'circular-drag-cross-arm'
        );
        this.dragCrossGroupEl.appendChild(this.dragCrossPrimaryEl);
        this.dragCrossGroupEl.appendChild(this.dragCrossSecondaryEl);

        this.dragStateMachine = new DragStateMachine(
            {
                onDragUpdate: gesture => this.onDragUpdate(gesture),
                onDragEnd: gesture => this.onDragEnd(gesture),
            },
            {
                dragThresholdPx: DRAG_THRESHOLD_PX,
                farDragThresholdPx: FAR_DRAG_THRESHOLD_PX,
            }
        );
    }

    attach(): void {
        this.svgRoot.appendChild(this.haloEl);
        this.svgRoot.appendChild(this.faceOverlayEl);
        this.svgRoot.appendChild(this.cancelZoneEl);
        this.svgRoot.appendChild(this.dragCrossGroupEl);
        this.host.appendChild(this.dragLabelEl);
    }

    getFaceDirectMode(): boolean {
        return this.faceDirectMode;
    }

    setFaceDirectMode(enabled: boolean): void {
        this.faceDirectMode = enabled;
    }

    getSelectedFace(): Face | undefined {
        return this.selectedFace;
    }

    /**
     * Programmatically select or deselect a face (for keyboard-driven face selection).
     */
    selectFace(face: Face | undefined): void {
        this.selectedFace = face;
        if (face) {
            this.showHaloForFace(face);
        } else {
            this.hideHalo();
        }
    }

    setLayoutMode(mode: LayoutMode): void {
        this.layoutMode = mode;
    }

    destroy(): void {
        this.dragStateMachine.onPointerCancel({ pointerId: this.activePointerId ?? -1 });
        this.activePointerId = undefined;
        this.start = { kind: HitKind.NONE };
        this.clearAxisSelections();
        this.haloEl.remove();
        this.faceOverlayEl.remove();
        this.cancelZoneEl.remove();
        this.dragCrossGroupEl.remove();
        this.dragLabelEl.remove();
    }

    onPointerDown(event: PointerEvent, target: EventTarget | null): void {
        if (this.activePointerId !== undefined) {
            return;
        }

        this.activePointerId = event.pointerId;
        this.showCancelZone(event.clientX, event.clientY);

        const hit = this.getInteractionStart(target, event.clientX, event.clientY);
        if (hit.kind === HitKind.STICKER) {
            this.setupStickerDragCross(hit.sticker, event.clientX, event.clientY);
        } else if (
            hit.kind !== HitKind.HALO &&
            hit.kind !== HitKind.AXIS_CIRCLE &&
            hit.kind !== HitKind.FACE_ELLIPSE &&
            hit.kind !== HitKind.BACKGROUND
        ) {
            this.hideDragDecisionCross();
        }

        if (
            this.selectedFace &&
            hit.kind === HitKind.STICKER &&
            hit.sticker.face === this.selectedFace
        ) {
            // Keep selected-face rotation to the halo, not the face center stickers.
            this.start = { kind: HitKind.NONE };
            this.dragStateMachine.onPointerDown(event);
            this.hideDragDecisionCross();
            return;
        }

        if (
            this.faceDirectMode &&
            (hit.kind === HitKind.STICKER || hit.kind === HitKind.FACE_ELLIPSE)
        ) {
            const face = hit.kind === HitKind.STICKER ? hit.sticker.face : hit.face;
            // Temporarily activate this face for the duration of the gesture so that
            // dragging immediately rotates the face without requiring prior selection.
            this.directModeTempFace = face;
            this.previousSelectedFace = this.selectedFace;
            this.selectedFace = face;
            this.showHaloForFace(face);
            this.start = { kind: HitKind.HALO };
            this.dragStateMachine.onPointerDown(event, {
                rotationCenter: this.getFaceCenterClient(face),
            });
            this.setupFaceEllipseGuideLine(face, event.clientX, event.clientY);
            return;
        }

        this.start = hit;

        if (hit.kind === HitKind.HALO) {
            this.setupHaloGuideLine(event.clientX, event.clientY);
            this.dragStateMachine.onPointerDown(event, {
                rotationCenter: this.getFaceCenterClient(this.selectedFace),
            });
            return;
        }

        if (hit.kind === HitKind.AXIS_CIRCLE) {
            this.setupAxisCircleGuideLine(hit.axis, event.clientX, event.clientY);
            this.dragStateMachine.onPointerDown(event, {
                rotationCenter: hit.axis.circleCenterClient,
            });
            return;
        }

        if (hit.kind === HitKind.FACE_ELLIPSE) {
            const nearestSticker = this.findNearestStickerOnFace(
                hit.face,
                event.clientX,
                event.clientY
            );
            if (nearestSticker) {
                this.start = { kind: HitKind.STICKER, sticker: nearestSticker };
                this.setupStickerDragCross(nearestSticker, event.clientX, event.clientY);
            } else {
                this.setupFaceEllipseGuideLine(hit.face, event.clientX, event.clientY);
            }
            this.dragStateMachine.onPointerDown(event);
            return;
        }

        if (hit.kind === HitKind.BACKGROUND) {
            this.setupBackgroundGuideLine(event.clientX, event.clientY);
        }

        this.dragStateMachine.onPointerDown(event);
    }

    onPointerMove(event: PointerEvent): void {
        this.dragStateMachine.onPointerMove(event);
    }

    onPointerUp(event: PointerEvent, target: EventTarget | null): void {
        const upResult = this.dragStateMachine.onPointerUp(event);

        // Restore any temporary face activation before tap/drag handling so that
        // handleTap sees the correct persistent selection state.
        this.restoreTempFaceState();

        if (upResult.wasTap) {
            const hit = this.getInteractionStart(target, event.clientX, event.clientY);
            this.handleTap(hit);
        }

        this.activePointerId = undefined;
        this.start = { kind: HitKind.NONE };
        this.hideDragLabel();
        this.hideCancelZone();
        this.hideDragDecisionCross();
    }

    onPointerCancel(event: PointerEvent): void {
        this.dragStateMachine.onPointerCancel(event);
        this.restoreTempFaceState();
        this.activePointerId = undefined;
        this.start = { kind: HitKind.NONE };
        this.hideDragLabel();
        this.hideCancelZone();
        this.hideDragDecisionCross();
    }

    private handleTap(hit: InteractionStart): void {
        if (hit.kind === HitKind.AXIS_CIRCLE) {
            this.toggleAxisSelection(hit.axis);
            return;
        }

        this.clearAxisSelections();

        if (hit.kind === HitKind.HALO) {
            this.selectedFace = undefined;
            this.onStickerSelected(undefined);
            this.hideHalo();
            return;
        }

        if (hit.kind === HitKind.STICKER) {
            this.selectedFace =
                this.selectedFace === hit.sticker.face ? undefined : hit.sticker.face;
            this.onStickerSelected(this.selectedFace ? hit.sticker.stickerId : undefined);

            if (!this.selectedFace) {
                this.hideHalo();
                return;
            }

            this.showHaloForFace(this.selectedFace);
            return;
        }

        if (hit.kind === HitKind.FACE_ELLIPSE) {
            this.selectedFace = this.selectedFace === hit.face ? undefined : hit.face;

            if (!this.selectedFace) {
                this.hideHalo();
                return;
            }

            this.showHaloForFace(this.selectedFace);
            return;
        }

        this.selectedFace = undefined;
        this.hideHalo();
    }

    private onDragUpdate(gesture: DragGesture): void {
        const notations = this.inferMovesForGesture(gesture);
        if (notations.length === 0) {
            this.hideDragLabel();
            return;
        }

        const label =
            notations.length === 1 ? notations[0] : `${notations[0]} +${notations.length - 1}`;
        this.showDragLabel(label, gesture.current.x, gesture.current.y);
    }

    private onDragEnd(gesture: DragGesture): void {
        const notations = this.inferMovesForGesture(gesture);
        this.hideDragLabel();

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

    private inferMovesForGesture(gesture: DragGesture): string[] {
        const context = this.createInteractionContext();
        const intent = this.buildGestureIntent(gesture);

        if (intent.distancePx < this.commitThresholdPx) {
            return [];
        }

        if (intent.hitKind === HitKind.HALO && this.selectedFace) {
            const angular = intent.angularDisplacementRad;
            if (angular === undefined || Math.abs(angular) < 0.1) {
                return [];
            }
            const notation =
                this.adapter.inferFaceRotationNotation?.(this.selectedFace, angular > 0, context) ??
                inferMoveFromFaceRotation(this.selectedFace, angular > 0);
            if (gesture.distancePx > this.dragStateMachine.farDragThresholdPx) {
                const baseNotation = notation.replace(/'$/, '');
                return [baseNotation + '2'];
            }
            return [notation];
        }

        if (intent.hitKind === HitKind.AXIS_CIRCLE) {
            const axis = intent.axis;
            const layer = intent.layer;
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
            // Normalize to WCA face-convention direction, same as the multi-select path.
            // For "reversed" layers (Z-last, X-first/middle, Y-first/middle) the screen-CW
            // direction is opposite to the face's canonical CW direction, so flip the flag.
            const reversed = isAxisLayerReversedFromCanonical(axis, layer, context.cubeSize);
            const isClockwise = reversed ? !isClockwiseOnScreen : isClockwiseOnScreen;

            const dragAxisKey = getAxisCircleKey(axis, layer);
            if (this.selectedAxisCircles.size > 0 && this.selectedAxisCircles.has(dragAxisKey)) {
                // inferSelectedAxisNotations normalizes each layer internally, so pass the
                // raw screen-CW flag — not the per-layer normalized isClockwise.
                const notations = this.inferSelectedAxisNotations(isClockwiseOnScreen, context);
                if (gesture.distancePx > this.dragStateMachine.farDragThresholdPx) {
                    return notations.map(n => n.replace(/'$/, '') + '2');
                }
                return notations;
            }

            const notation =
                this.adapter.inferAxisCircleNotation?.(axis, layer, isClockwise, context) ??
                axisLayerToNotation(axis, layer, isClockwise, context.cubeSize);
            if (gesture.distancePx > this.dragStateMachine.farDragThresholdPx) {
                const baseNotation = notation.replace(/'$/, '');
                return [baseNotation + '2'];
            }
            return [notation];
        }

        if (intent.hitKind === HitKind.STICKER && intent.face !== undefined) {
            if (!this.pendingStickerCross) {
                return [];
            }

            const { basis, upMove, downMove, rightMove, leftMove } = this.pendingStickerCross;
            const startSvg = this.clientToSvgPoint(gesture.start.x, gesture.start.y);
            const endSvg = this.clientToSvgPoint(gesture.current.x, gesture.current.y);
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
            if (gesture.distancePx > this.dragStateMachine.farDragThresholdPx) {
                const baseMove = move.replace(/'$/, '');
                return [baseMove + '2'];
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
                this.adapter.inferWholeCubeNotation?.(deltaX, deltaY, contextWithStart)
            );
            if (notation && gesture.distancePx > this.dragStateMachine.farDragThresholdPx) {
                const baseNotation = notation.replace(/'$/, '');
                return [baseNotation + '2'];
            }
            return notation ? [notation] : [];
        }

        return [];
    }

    private setupStickerDragCross(
        sticker: { face: Face; row: number; col: number },
        clientX: number,
        clientY: number
    ): void {
        const svgPoint = this.clientToSvgPoint(clientX, clientY);
        const basis =
            this.buildCrossingBasisAtPoint(sticker.face, svgPoint) ??
            buildFaceScreenBasisFromHint(sticker.face);
        const cubeSize = this.getCubeSize();
        const { face, row, col } = sticker;

        this.pendingStickerCross = {
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

        this.showDragDecisionCross(basis, clientX, clientY);
    }

    private showDragDecisionCross(basis: FaceScreenBasis, clientX: number, clientY: number): void {
        const center = this.clientToSvgPoint(clientX, clientY);
        const armLength =
            this.layoutMode === LayoutMode.Tabbed
                ? DRAG_CROSS_ARM_LENGTH_TABBED
                : DRAG_CROSS_ARM_LENGTH_FLOATING;

        // Arms are zone boundaries (bisectors between adjacent drag directions).
        // Each zone's centre aligns with a circle-tangent drag direction.
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

        setLineFromBasis(this.dragCrossPrimaryEl, center, arm1Dir, armLength);
        setLineFromBasis(this.dragCrossSecondaryEl, center, arm2Dir, armLength);
        this.dragCrossSecondaryEl.removeAttribute('visibility');
        this.dragCrossGroupEl.setAttribute('visibility', 'visible');
    }

    private showDragDecisionLine(dir: Point2D, clientX: number, clientY: number): void {
        const center = this.clientToSvgPoint(clientX, clientY);
        const armLength =
            this.layoutMode === LayoutMode.Tabbed
                ? DRAG_CROSS_ARM_LENGTH_TABBED
                : DRAG_CROSS_ARM_LENGTH_FLOATING;

        setLineFromBasis(this.dragCrossPrimaryEl, center, dir, armLength);
        this.dragCrossSecondaryEl.setAttribute('visibility', 'hidden');
        this.dragCrossGroupEl.setAttribute('visibility', 'visible');
    }

    private setupHaloGuideLine(clientX: number, clientY: number): void {
        if (!this.selectedFace) {
            this.hideDragDecisionCross();
            return;
        }
        const ellipse = this.svgRoot.getElementById(
            `${this.selectedFace}-face-ellipse`
        ) as SVGEllipseElement | null;
        if (!ellipse) {
            this.hideDragDecisionCross();
            return;
        }

        const faceCx = Number(ellipse.getAttribute('cx') ?? 0);
        const faceCy = Number(ellipse.getAttribute('cy') ?? 0);
        const touchSvg = this.clientToSvgPoint(clientX, clientY);
        const radialDir = normalize2({ x: touchSvg.x - faceCx, y: touchSvg.y - faceCy });
        if (!radialDir) {
            this.hideDragDecisionCross();
            return;
        }

        this.showDragDecisionLine(radialDir, clientX, clientY);
    }

    private setupAxisCircleGuideLine(axisHit: AxisHit, clientX: number, clientY: number): void {
        const axisCircle = this.axisCircles.find(
            c => c.axis === axisHit.axis && c.layer === axisHit.layer
        );
        if (!axisCircle) {
            this.hideDragDecisionCross();
            return;
        }

        const touchSvg = this.clientToSvgPoint(clientX, clientY);
        const radialDir = normalize2({
            x: touchSvg.x - axisCircle.cx,
            y: touchSvg.y - axisCircle.cy,
        });
        if (!radialDir) {
            this.hideDragDecisionCross();
            return;
        }

        this.showDragDecisionLine(radialDir, clientX, clientY);
    }

    private setupFaceEllipseGuideLine(face: Face, clientX: number, clientY: number): void {
        const ellipse = this.svgRoot.getElementById(
            `${face}-face-ellipse`
        ) as SVGEllipseElement | null;
        if (!ellipse) {
            this.hideDragDecisionCross();
            return;
        }

        const faceCx = Number(ellipse.getAttribute('cx') ?? 0);
        const faceCy = Number(ellipse.getAttribute('cy') ?? 0);
        const touchSvg = this.clientToSvgPoint(clientX, clientY);
        const radialDir = normalize2({ x: touchSvg.x - faceCx, y: touchSvg.y - faceCy });
        if (!radialDir) {
            this.hideDragDecisionCross();
            return;
        }

        this.showDragDecisionLine(radialDir, clientX, clientY);
    }

    private setupBackgroundGuideLine(clientX: number, clientY: number): void {
        const touchSvg = this.clientToSvgPoint(clientX, clientY);
        const axisCenters = collectAxisCentersByAxis(this.axisCircles);
        const nearestAxis = getNearestAxisByPoint(touchSvg, axisCenters);
        const center = nearestAxis ? axisCenters[nearestAxis] : undefined;
        if (!center) {
            this.hideDragDecisionCross();
            return;
        }

        const radialDir = normalize2({ x: touchSvg.x - center.x, y: touchSvg.y - center.y });
        if (!radialDir) {
            this.hideDragDecisionCross();
            return;
        }

        this.showDragDecisionLine(radialDir, clientX, clientY);
    }

    private hideDragDecisionCross(): void {
        this.pendingStickerCross = undefined;
        this.dragCrossGroupEl.setAttribute('visibility', 'hidden');
    }

    private buildCrossingBasisAtPoint(face: Face, point: Point2D): FaceScreenBasis | undefined {
        const upHint = normalize2(FACE_TOP_DIRECTION_HINTS[face]);
        if (!upHint) {
            return undefined;
        }

        // Sort all circles by proximity to the touch point, then pick the closest pair
        // that belongs to TWO DIFFERENT axes. Concentric rings of the same axis share
        // the same center, so their tangents at any point are identical — using them
        // would collapse upDir ≈ rightDir and give a degenerate (line) basis.
        const sorted = this.axisCircles
            .map(circle => ({ circle, proximity: circleProximity(point, circle) }))
            .sort((a, b) => a.proximity - b.proximity);

        const first = sorted[0];
        const second = sorted.find(entry => entry.circle.axis !== first?.circle.axis);

        if (!first || !second || second.proximity > CROSSING_PROXIMITY_MAX_SVG) {
            return undefined;
        }

        const circles = [first, second];

        const upCandidateA = orientedTangentAtPoint(point, circles[0].circle, upHint);
        const upCandidateB = orientedTangentAtPoint(point, circles[1].circle, upHint);
        if (!upCandidateA || !upCandidateB) {
            return undefined;
        }

        const useFirstForUp =
            Math.abs(dot2(upCandidateA, upHint)) >= Math.abs(dot2(upCandidateB, upHint));
        const rightCircle = useFirstForUp ? circles[1].circle : circles[0].circle;
        const upDir = useFirstForUp ? upCandidateA : upCandidateB;

        const rightHint = { x: -upHint.y, y: upHint.x };
        const rightDir = orientedTangentAtPoint(point, rightCircle, rightHint) ?? {
            x: -upDir.y,
            y: upDir.x,
        };

        const normalizedRight = normalize2(rightDir);
        if (!normalizedRight) {
            return undefined;
        }

        return {
            upDir,
            rightDir: normalizedRight,
        };
    }

    private getInteractionStart(
        target: EventTarget | null,
        clientX: number,
        clientY: number
    ): InteractionStart {
        const element = target instanceof Element ? target : null;

        if (this.isHaloElement(element)) {
            return { kind: HitKind.HALO };
        }

        const sticker = element?.closest('circle.sticker') as SVGCircleElement | null;
        if (sticker && this.svgRoot.contains(sticker)) {
            const stickerId = sticker.getAttribute('data-sticker-id') ?? undefined;
            const resolved = this.resolveStickerHit(stickerId);
            if (resolved) {
                return {
                    kind: HitKind.STICKER,
                    sticker: resolved,
                };
            }

            return { kind: HitKind.NONE };
        }

        const faceEllipse = this.getFaceEllipseHit(element);
        if (faceEllipse) {
            return { kind: HitKind.FACE_ELLIPSE, face: faceEllipse };
        }

        const axis = this.getAxisHit(element, clientX, clientY);
        if (axis) {
            return { kind: HitKind.AXIS_CIRCLE, axis };
        }

        if (element && this.svgRoot.contains(element)) {
            return { kind: HitKind.BACKGROUND };
        }

        return { kind: HitKind.NONE };
    }

    private resolveStickerHit(stickerId?: string): StickerHit | undefined {
        if (!stickerId || !this.getCubeState) {
            return undefined;
        }

        const cubeState = this.getCubeState();
        if (!cubeState) {
            return undefined;
        }

        const modelSticker = CubeStateUtils.getStickerById(cubeState, stickerId as StickerId);
        if (!modelSticker) {
            return undefined;
        }

        const cubeSize = this.getCubeSize();
        const facePosition = modelSticker.facePosition;
        if (!Number.isFinite(facePosition)) {
            return undefined;
        }

        const row = Math.floor(facePosition / cubeSize);
        const col = facePosition % cubeSize;
        if (row < 0 || row >= cubeSize || col < 0 || col >= cubeSize) {
            return undefined;
        }

        const face = modelSticker.currentFace as Face | undefined;
        if (!face) {
            return undefined;
        }

        return {
            face,
            row,
            col,
            stickerId,
        };
    }

    private findNearestStickerOnFace(
        face: Face,
        clientX: number,
        clientY: number
    ): StickerHit | undefined {
        const stickerElements =
            this.svgRoot.querySelectorAll<SVGCircleElement>('circle[data-sticker-id]');
        const startSvg = this.clientToSvgPoint(clientX, clientY);
        let bestSticker: StickerHit | undefined;
        let bestDistSq = Infinity;

        for (const el of stickerElements) {
            const stickerId = el.getAttribute('data-sticker-id') ?? undefined;
            const resolved = this.resolveStickerHit(stickerId);
            if (!resolved || resolved.face !== face) {
                continue;
            }
            const cx = Number(el.getAttribute('cx') ?? 0);
            const cy = Number(el.getAttribute('cy') ?? 0);
            const dx = cx - startSvg.x;
            const dy = cy - startSvg.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestSticker = resolved;
            }
        }
        return bestSticker;
    }

    private buildGestureIntent(gesture: DragGesture): GestureIntent {
        const startViewPoint = this.clientToSvgPoint(gesture.start.x, gesture.start.y);

        if (this.start.kind === HitKind.HALO) {
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

        if (this.start.kind === HitKind.AXIS_CIRCLE) {
            return {
                hitKind: HitKind.AXIS_CIRCLE,
                direction: gesture.direction,
                distancePx: gesture.distancePx,
                deltaX: gesture.deltaX,
                deltaY: gesture.deltaY,
                startViewPoint,
                angularDisplacementRad: gesture.angularDisplacementRad,
                axis: this.start.axis.axis,
                layer: this.start.axis.layer,
            };
        }

        if (this.start.kind === HitKind.STICKER) {
            return {
                hitKind: HitKind.STICKER,
                direction: gesture.direction,
                distancePx: gesture.distancePx,
                deltaX: gesture.deltaX,
                deltaY: gesture.deltaY,
                startViewPoint,
                angularDisplacementRad: gesture.angularDisplacementRad,
                face: this.start.sticker.face,
                row: this.start.sticker.row,
                col: this.start.sticker.col,
            };
        }

        if (this.start.kind === HitKind.FACE_ELLIPSE) {
            return {
                hitKind: HitKind.FACE_ELLIPSE,
                direction: gesture.direction,
                distancePx: gesture.distancePx,
                deltaX: gesture.deltaX,
                deltaY: gesture.deltaY,
                startViewPoint,
                angularDisplacementRad: gesture.angularDisplacementRad,
                face: this.start.face,
            };
        }

        if (this.start.kind === HitKind.BACKGROUND) {
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

    private createInteractionContext(): InteractionContext {
        return {
            cubeSize: this.getCubeSize(),
            selectedFace: this.selectedFace,
        };
    }

    private getAxisHit(
        element: Element | null,
        clientX: number,
        clientY: number
    ): AxisHit | undefined {
        // Primary: element-based hit detection (pointer landed directly on ring stroke)
        const axisCircleElement = element?.closest('circle[id]') as SVGCircleElement | null;
        const axisMatch = axisCircleElement?.id?.match(/^([xyz])-layer-(\d+)$/i);
        if (axisMatch && axisCircleElement) {
            const axisChar = axisMatch[1].toUpperCase();
            const layer = Number(axisMatch[2]);
            const axis = axisChar as Axis;

            const axisCircle = this.axisCircles.find(c => c.axis === axis && c.layer === layer);
            if (!axisCircle) {
                return undefined;
            }

            const svgPoint = this.clientToSvgPoint(clientX, clientY);
            return {
                axis,
                layer,
                key: getAxisCircleKey(axis, layer),
                element: axisCircleElement,
                circleCenterClient: this.svgToClientPoint(axisCircle.cx, axisCircle.cy, svgPoint),
            };
        }

        // Fallback: proximity-based detection to cover gaps between concentric rings.
        // The rings are spaced 15 SVG units apart; absorb up to half that gap (7.5) on each
        // side so there are no dead zones between or just outside the outermost ring.
        const PROXIMITY_THRESHOLD = 7.5;
        const svgPoint = this.clientToSvgPoint(clientX, clientY);

        let bestCircle: AxisCircle | undefined;
        let bestProximity = Infinity;

        for (const axisCircle of this.axisCircles) {
            const dx = svgPoint.x - axisCircle.cx;
            const dy = svgPoint.y - axisCircle.cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const proximity = Math.abs(d - axisCircle.r);
            if (proximity <= PROXIMITY_THRESHOLD && proximity < bestProximity) {
                bestProximity = proximity;
                bestCircle = axisCircle;
            }
        }

        if (!bestCircle) {
            return undefined;
        }

        const el = this.svgRoot.getElementById(bestCircle.id) as SVGCircleElement | null;
        if (!el) {
            return undefined;
        }

        return {
            axis: bestCircle.axis,
            layer: bestCircle.layer,
            key: getAxisCircleKey(bestCircle.axis, bestCircle.layer),
            element: el,
            circleCenterClient: this.svgToClientPoint(bestCircle.cx, bestCircle.cy, svgPoint),
        };
    }

    private getFaceEllipseHit(element: Element | null): Face | undefined {
        const ellipse = element?.closest(
            'ellipse[id$="-face-ellipse"]'
        ) as SVGEllipseElement | null;
        if (!ellipse || !this.svgRoot.contains(ellipse)) {
            return undefined;
        }

        const match = ellipse.id.match(/^([UDFBLR])-face-ellipse$/);
        if (!match) {
            return undefined;
        }

        const face = match[1] as Face;
        return Object.values(Face).includes(face) ? face : undefined;
    }

    private inferSelectedAxisNotations(
        isClockwise: boolean,
        context: InteractionContext
    ): string[] {
        const cubeSize = context.cubeSize;
        const selected = Array.from(this.selectedAxisCircles)
            .map(parseAxisCircleKey)
            .filter((entry): entry is { axis: Axis; layer: number } => Boolean(entry));

        if (selected.length === 0) {
            return [];
        }

        const fullAxis = this.getFullySelectedAxis(cubeSize);
        if (fullAxis) {
            return [axisToWholeCubeNotation(fullAxis, isClockwise)];
        }

        return selected.sort(compareAxisLayer).map(entry => {
            // Normalize to the canonical axis direction so all selected layers rotate
            // in the same physical direction regardless of their face convention:
            //   Z canonical = F (layer 0); B (last layer) has opposite CW convention
            //   X canonical = R (last layer); L/M have opposite CW convention
            //   Y canonical = U (last layer); D/E have opposite CW convention
            const reversed = isAxisLayerReversedFromCanonical(entry.axis, entry.layer, cubeSize);
            const effectiveClockwise = reversed ? !isClockwise : isClockwise;
            return (
                this.adapter.inferAxisCircleNotation?.(
                    entry.axis,
                    entry.layer,
                    effectiveClockwise,
                    context
                ) ?? axisLayerToNotation(entry.axis, entry.layer, effectiveClockwise, cubeSize)
            );
        });
    }

    private getFullySelectedAxis(cubeSize: number): Axis | undefined {
        for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
            let allSelected = true;
            for (let layer = 0; layer < cubeSize; layer += 1) {
                if (!this.selectedAxisCircles.has(getAxisCircleKey(axis, layer))) {
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

    private toggleAxisSelection(hit: AxisHit): void {
        if (this.selectedAxisCircles.has(hit.key)) {
            this.selectedAxisCircles.delete(hit.key);
            this.setAxisSelectedClass(hit.key, false);
            return;
        }

        this.selectAxisCircle(hit);
    }

    private selectAxisCircle(hit: AxisHit): void {
        // Only allow circles from the same axis to be co-selected. If the
        // incoming circle belongs to a different axis, clear existing selection.
        const existingAxis = this.getSelectedAxis();
        if (existingAxis !== undefined && existingAxis !== hit.axis) {
            this.clearAxisSelections();
        }

        this.selectedAxisCircles.add(hit.key);
        this.setAxisSelectedClass(hit.key, true, hit.element);
    }

    /** Returns the axis shared by all currently selected circles, or undefined if none selected. */
    private getSelectedAxis(): Axis | undefined {
        const firstKey = this.selectedAxisCircles.values().next().value as string | undefined;
        if (firstKey === undefined) {
            return undefined;
        }
        return parseAxisCircleKey(firstKey)?.axis;
    }

    private clearAxisSelections(): void {
        for (const key of this.selectedAxisCircles) {
            this.setAxisSelectedClass(key, false);
        }
        this.selectedAxisCircles.clear();
    }

    private setAxisSelectedClass(
        key: string,
        selected: boolean,
        knownElement?: SVGCircleElement
    ): void {
        const className = this.styles['circular-axis-selected'] ?? 'circular-axis-selected';
        const element = knownElement ?? this.getAxisCircleElementByKey(key);
        if (!element) {
            return;
        }

        if (selected) {
            element.classList.add(className);
            return;
        }

        element.classList.remove(className);
    }

    private getAxisCircleElementByKey(key: string): SVGCircleElement | undefined {
        const parsed = parseAxisCircleKey(key);
        if (!parsed) {
            return undefined;
        }

        const axisCircle = this.axisCircles.find(
            circle => circle.axis === parsed.axis && circle.layer === parsed.layer
        );
        if (!axisCircle) {
            return undefined;
        }

        return this.svgRoot.getElementById(axisCircle.id) as SVGCircleElement | undefined;
    }

    private getFaceCenterClient(face: Face | undefined): { x: number; y: number } | undefined {
        if (!face) {
            return undefined;
        }

        const ellipse = this.svgRoot.getElementById(
            `${face}-face-ellipse`
        ) as SVGEllipseElement | null;
        if (!ellipse) {
            return undefined;
        }

        const cx = Number(ellipse.getAttribute('cx') ?? 0);
        const cy = Number(ellipse.getAttribute('cy') ?? 0);
        return this.svgToClientPoint(cx, cy, { x: cx, y: cy });
    }

    private showHaloForFace(face: Face): void {
        const faceEllipse = this.svgRoot.getElementById(
            `${face}-face-ellipse`
        ) as SVGEllipseElement | null;

        if (faceEllipse) {
            const cx = faceEllipse.getAttribute('cx') ?? '0';
            const cy = faceEllipse.getAttribute('cy') ?? '0';
            const rx = faceEllipse.getAttribute('rx') ?? '0';
            const ry = faceEllipse.getAttribute('ry') ?? '0';
            const transform = faceEllipse.getAttribute('transform');

            this.haloEl.setAttribute('cx', cx);
            this.haloEl.setAttribute('cy', cy);
            this.haloEl.setAttribute('rx', rx);
            this.haloEl.setAttribute('ry', ry);
            if (transform) {
                this.haloEl.setAttribute('transform', transform);
            } else {
                this.haloEl.removeAttribute('transform');
            }
            this.haloEl.setAttribute('visibility', 'visible');

            this.faceOverlayEl.setAttribute('cx', cx);
            this.faceOverlayEl.setAttribute('cy', cy);
            this.faceOverlayEl.setAttribute('rx', rx);
            this.faceOverlayEl.setAttribute('ry', ry);
            if (transform) {
                this.faceOverlayEl.setAttribute('transform', transform);
            } else {
                this.faceOverlayEl.removeAttribute('transform');
            }
            this.faceOverlayEl.setAttribute('pointer-events', 'all');
            return;
        }
    }

    private hideHalo(): void {
        this.haloEl.setAttribute('visibility', 'hidden');
        this.faceOverlayEl.setAttribute('pointer-events', 'none');
    }

    private restoreTempFaceState(): void {
        if (this.directModeTempFace === undefined) {
            return;
        }
        this.selectedFace = this.previousSelectedFace;
        if (this.previousSelectedFace) {
            this.showHaloForFace(this.previousSelectedFace);
        } else {
            this.hideHalo();
        }
        this.directModeTempFace = undefined;
        this.previousSelectedFace = undefined;
    }

    private isHaloElement(element: Element | null): boolean {
        return element === this.haloEl || element === this.faceOverlayEl;
    }

    private get commitThresholdPx(): number {
        return this.layoutMode === LayoutMode.Tabbed
            ? COMMIT_DISTANCE_TABBED_PX
            : COMMIT_DISTANCE_PX;
    }

    private showCancelZone(clientX: number, clientY: number): void {
        const center = this.clientToSvgPoint(clientX, clientY);
        const edge = this.clientToSvgPoint(clientX + this.commitThresholdPx, clientY);
        const svgRadius = Math.hypot(edge.x - center.x, edge.y - center.y);
        this.cancelZoneEl.setAttribute('cx', `${center.x}`);
        this.cancelZoneEl.setAttribute('cy', `${center.y}`);
        this.cancelZoneEl.setAttribute('r', `${svgRadius}`);
        this.cancelZoneEl.setAttribute('visibility', 'visible');
    }

    private hideCancelZone(): void {
        this.cancelZoneEl.setAttribute('visibility', 'hidden');
    }

    private showDragLabel(label: string, clientX: number, clientY: number): void {
        const hostRect = this.host.getBoundingClientRect();
        this.dragLabelEl.textContent = label;
        this.dragLabelEl.style.display = 'block';

        const labelWidth = this.dragLabelEl.offsetWidth || 40;
        const labelHeight = this.dragLabelEl.offsetHeight || 22;

        let x: number;
        let y: number;

        if (this.layoutMode === LayoutMode.Tabbed) {
            // Fixed positioning lets the label float above the panel header when dragging near the top edge.
            this.dragLabelEl.style.position = 'fixed';
            this.dragLabelEl.style.zIndex = '10000';
            x = clientX - labelWidth / 2;
            y = clientY - labelHeight - 50;
            x = clamp(x, 4, window.innerWidth - labelWidth - 4);
            y = clamp(y, 4, window.innerHeight - labelHeight - 4);
        } else {
            this.dragLabelEl.style.position = '';
            this.dragLabelEl.style.zIndex = '';
            const localX = clientX - hostRect.left;
            const localY = clientY - hostRect.top;
            x = localX + 14;
            y = localY + 14;
            x = clamp(x, 4, hostRect.width - labelWidth - 4);
            y = clamp(y, 4, hostRect.height - labelHeight - 4);
        }

        this.dragLabelEl.style.left = `${x}px`;
        this.dragLabelEl.style.top = `${y}px`;
    }

    private hideDragLabel(): void {
        this.dragLabelEl.style.display = 'none';
        this.dragLabelEl.style.position = '';
        this.dragLabelEl.style.zIndex = '';
    }

    private clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
        if (!this.svgRoot.createSVGPoint) {
            return { x: clientX, y: clientY };
        }

        const point = this.svgRoot.createSVGPoint();
        point.x = clientX;
        point.y = clientY;

        const inverse = this.svgRoot.getScreenCTM()?.inverse();
        if (!inverse) {
            return { x: clientX, y: clientY };
        }

        const transformed = point.matrixTransform(inverse);
        return { x: transformed.x, y: transformed.y };
    }

    private svgToClientPoint(
        svgX: number,
        svgY: number,
        fallbackSvgPoint: { x: number; y: number }
    ): { x: number; y: number } {
        if (!this.svgRoot.createSVGPoint) {
            return fallbackSvgPoint;
        }

        const point = this.svgRoot.createSVGPoint();
        point.x = svgX;
        point.y = svgY;

        const ctm = this.svgRoot.getScreenCTM();
        if (!ctm) {
            return fallbackSvgPoint;
        }

        const transformed = point.matrixTransform(ctm);
        return { x: transformed.x, y: transformed.y };
    }
}

function createCircularInteractionAdapter(axisCircles: AxisCircle[]): ViewInteractionAdapter {
    const axisCentersByAxis = collectAxisCentersByAxis(axisCircles);
    const faceBasisByFace = buildFaceScreenBasisByFace();

    return {
        mapDragDirection(
            direction: DragDirection,
            face: Face,
            _context: InteractionContext
        ): DragDirection {
            const basis = faceBasisByFace[face];
            if (!basis) {
                return direction;
            }

            return mapDirectionToFaceBasis(direction, basis);
        },
        inferAxisCircleNotation(
            axis: Axis,
            layer: number,
            isClockwise: boolean,
            context: InteractionContext
        ): string {
            return axisLayerToNotation(axis, layer, isClockwise, context.cubeSize);
        },
        inferWholeCubeNotation(
            deltaX: number,
            deltaY: number,
            context: InteractionContext
        ): string {
            const startViewPoint = getStartViewPointFromContext(context);
            if (!startViewPoint) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const nearestAxis = getNearestAxisByPoint(startViewPoint, axisCentersByAxis);
            if (!nearestAxis) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const center = axisCentersByAxis[nearestAxis];
            if (!center) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const dragVector = normalize2({ x: deltaX, y: deltaY });
            const centerToStart = normalize2({
                x: startViewPoint.x - center.x,
                y: startViewPoint.y - center.y,
            });

            if (!dragVector || !centerToStart) {
                return inferWholeCubeMove(deltaX, deltaY) ?? 'y';
            }

            const cross = centerToStart.x * dragVector.y - centerToStart.y * dragVector.x;
            const isClockwise = cross > 0;
            return axisToWholeCubeNotation(nearestAxis, isClockwise);
        },
        inferFaceRotationNotation(face: Face, isClockwise: boolean): string {
            return inferMoveFromFaceRotation(face, isClockwise);
        },
    };
}

function setLineFromBasis(
    line: SVGLineElement,
    center: Point2D,
    axisDir: Point2D,
    arm: number
): void {
    line.setAttribute('x1', `${center.x - axisDir.x * arm}`);
    line.setAttribute('y1', `${center.y - axisDir.y * arm}`);
    line.setAttribute('x2', `${center.x + axisDir.x * arm}`);
    line.setAttribute('y2', `${center.y + axisDir.y * arm}`);
}

function collectAxisCentersByAxis(axisCircles: AxisCircle[]): Partial<Record<Axis, Point2D>> {
    const centers: Partial<Record<Axis, Point2D>> = {};
    for (const circle of axisCircles) {
        if (!centers[circle.axis]) {
            centers[circle.axis] = { x: circle.cx, y: circle.cy };
        }
    }
    return centers;
}

function getNearestAxisByPoint(
    point: Point2D,
    centers: Partial<Record<Axis, Point2D>>
): Axis | undefined {
    let nearest: Axis | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const axis of [Axis.X, Axis.Y, Axis.Z]) {
        const center = centers[axis];
        if (!center) {
            continue;
        }

        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
            nearest = axis;
            nearestDistance = distance;
        }
    }

    return nearest;
}

function getStartViewPointFromContext(context: InteractionContext): Point2D | undefined {
    const x = context.metadata?.['startViewPointX'];
    const y = context.metadata?.['startViewPointY'];
    if (typeof x !== 'number' || typeof y !== 'number') {
        return undefined;
    }

    return { x, y };
}

function axisToWholeCubeNotation(axis: Axis, isClockwise: boolean): string {
    const base = axis.toLowerCase();
    return isClockwise ? base : `${base}'`;
}

function getAxisCircleKey(axis: Axis, layer: number): string {
    return `${axis}-${layer}`;
}

function parseAxisCircleKey(key: string): { axis: Axis; layer: number } | undefined {
    const match = key.match(/^([XYZ])-(\d+)$/);
    if (!match) {
        return undefined;
    }

    const axis = match[1] as Axis;
    const layer = Number(match[2]);
    if (!Number.isInteger(layer)) {
        return undefined;
    }

    return { axis, layer };
}

/**
 * Returns true when the given axis/layer's WCA "clockwise" convention points in the opposite
 * direction to the axis's canonical positive direction.
 *
 * Canonical directions (matching WCA whole-cube rotations):
 *   x = R face (last layer)  — all other X layers (L, M, …) are reversed
 *   y = U face (last layer)  — all other Y layers (D, E, …) are reversed
 *   z = F face (layer 0)     — inner slices (S, …) follow F and are NOT reversed;
 *                               only B (last layer) is reversed
 */
function isAxisLayerReversedFromCanonical(
    axis: Axis,
    layerIndex: number,
    cubeSize: number
): boolean {
    if (axis === Axis.Z) {
        return layerIndex === cubeSize - 1;
    }
    return layerIndex < cubeSize - 1;
}

function compareAxisLayer(
    a: { axis: Axis; layer: number },
    b: { axis: Axis; layer: number }
): number {
    const axisRank = { [Axis.X]: 0, [Axis.Y]: 1, [Axis.Z]: 2 };
    const byAxis = axisRank[a.axis] - axisRank[b.axis];
    if (byAxis !== 0) {
        return byAxis;
    }
    return a.layer - b.layer;
}

function circleProximity(point: Point2D, circle: AxisCircle): number {
    const distance = distance2(point, { x: circle.cx, y: circle.cy });
    return Math.abs(distance - circle.r);
}

function orientedTangentAtPoint(
    point: Point2D,
    circle: AxisCircle,
    hint: Point2D
): Point2D | undefined {
    const radial = normalize2({ x: point.x - circle.cx, y: point.y - circle.cy });
    if (!radial) {
        return undefined;
    }

    const tangent = { x: -radial.y, y: radial.x };
    const aligned = dot2(tangent, hint) >= 0 ? tangent : negate2(tangent);
    return normalize2(aligned);
}
