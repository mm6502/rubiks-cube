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
import { AxisCircle, getCenterOfElement } from './svg-tools';

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
    private axisDetectionBands: Map<Axis, { bandEl: SVGPathElement; clipEl: SVGClipPathElement }>;
    private previewAxisKeys: Set<string> | undefined;

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

        // One detection band + clipPath per axis. Each clip is a single half-plane box
        // aligned with the triangle edge that faces that axis.
        this.axisDetectionBands = new Map<
            Axis,
            { bandEl: SVGPathElement; clipEl: SVGClipPathElement }
        >();
        const uid = Math.random().toString(36).slice(2, 8);
        for (const axis of [Axis.X, Axis.Y, Axis.Z] as Axis[]) {
            const bandEl = document.createElementNS(SVG_NS, 'path');
            bandEl.classList.add(this.styles['circular-debug-band'] ?? 'circular-debug-band');
            bandEl.setAttribute('visibility', 'hidden');
            bandEl.setAttribute('pointer-events', 'none');
            bandEl.setAttribute('aria-hidden', 'true');

            const clipEl = document.createElementNS(SVG_NS, 'clipPath');
            clipEl.id = `detection-band-clip-${axis}-${uid}`;

            this.axisDetectionBands.set(axis, { bandEl, clipEl });
        }

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
        // Install per-axis clip paths into <defs> and wire each to its band.
        const defs =
            this.svgRoot.querySelector('defs') ??
            this.svgRoot.insertBefore(
                document.createElementNS(SVG_NS, 'defs'),
                this.svgRoot.firstChild
            );
        for (const [axis, { bandEl, clipEl }] of this.axisDetectionBands) {
            defs.appendChild(clipEl);
            this.updateDetectionBandClip(axis, clipEl);
            bandEl.setAttribute('clip-path', `url(#${clipEl.id})`);
            this.svgRoot.appendChild(bandEl);
        }
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
        for (const { bandEl, clipEl } of this.axisDetectionBands.values()) {
            bandEl.remove();
            clipEl.remove();
        }
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
            this.showAxisCirclePreview(hit.axis.key);
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
            // Visual preview: highlight all three circles for the nearest axis
            const svgPoint = this.clientToSvgPoint(event.clientX, event.clientY);
            const axisCenters = collectAxisCentersByAxis(this.axisCircles);
            const nearestAxis = getNearestAxisByPoint(svgPoint, axisCenters);
            if (nearestAxis) {
                this.showAxisPreview(nearestAxis);
            }
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
        this.hideDetectionBand();
        this.hideAxisPreviewAll();
    }

    onPointerCancel(event: PointerEvent): void {
        this.dragStateMachine.onPointerCancel(event);
        this.restoreTempFaceState();
        this.activePointerId = undefined;
        this.start = { kind: HitKind.NONE };
        this.hideDragLabel();
        this.hideCancelZone();
        this.hideDragDecisionCross();
        this.hideDetectionBand();
        this.hideAxisPreviewAll();
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
            notations.length <= 2
                ? notations.join('+')
                : `${notations[0]} +${notations.length - 1}`;
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

        // The interior triangle formed by the L, B and D face-ellipse centres is a
        // dead zone: axis-circle proximity detection and background dragging should
        // not fire there because the zones bleed into this empty region.
        if (this.isInLbdDeadZone(clientX, clientY)) {
            return { kind: HitKind.NONE };
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

            // Show debug band for primary element hit.
            this.showDetectionBandForCircle(axisCircle);

            return {
                axis,
                layer,
                key: getAxisCircleKey(axis, layer),
                element: axisCircleElement,
                circleCenterClient: this.svgToClientPoint(axisCircle.cx, axisCircle.cy, svgPoint),
            };
        }

        // Fallback: proximity-based detection with biased boundaries so that
        // the middle slice circles (S/M/E — layer === 1) get 3/4 of the
        // space between adjacent rings. The inner/outer rings receive the
        // remaining quarter and are shifted toward the middle ring.
        const svgPoint = this.clientToSvgPoint(clientX, clientY);

        // Group circles by axis and compute radial boundaries for each circle.
        const byAxis: Record<string, AxisCircle[]> = { X: [], Y: [], Z: [] };
        for (const c of this.axisCircles) {
            byAxis[c.axis.toUpperCase()]?.push(c);
        }

        // Find nearest axis group center for this point and use that group's boundaries.
        const axisCenters = collectAxisCentersByAxis(this.axisCircles);
        const nearestAxis = getNearestAxisByPoint(svgPoint, axisCenters);
        if (!nearestAxis) return undefined;

        const group = (byAxis[nearestAxis.toUpperCase()] || []).slice().sort((a, b) => a.r - b.r);
        if (group.length === 0) return undefined;

        // Compute adjacent gaps and biased boundaries.
        const boundaries = computeBiasedBoundaries(group);

        // Determine which ring domain contains the radial distance
        const dx = svgPoint.x - group[0].cx;
        const dy = svgPoint.y - group[0].cy;
        const d = Math.sqrt(dx * dx + dy * dy);

        let chosen: AxisCircle | undefined;
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

        this.showDetectionBand(chosen.cx, chosen.cy, chosenLow, chosenHigh, chosen.axis);

        const el = this.svgRoot.getElementById(chosen.id) as SVGCircleElement | null;
        if (!el) return undefined;

        return {
            axis: chosen.axis,
            layer: chosen.layer,
            key: getAxisCircleKey(chosen.axis, chosen.layer),
            element: el,
            circleCenterClient: this.svgToClientPoint(chosen.cx, chosen.cy, svgPoint),
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

        const sorted = selected.sort(compareAxisLayer);
        if (!isClockwise) sorted.reverse();
        return sorted.map(entry => {
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

    /**
     * Returns true when the SVG point falls inside the dead-zone triangle formed
     * by the centres of the L, B and D face ellipses. Axis-circle proximity
     * detection and background drag should be suppressed in this region.
     */
    /**
     * Compute the three vertices of the LBD dead-zone triangle from the face
     * label elements in the SVG, or return undefined when they are not present.
     */
    private getLbdTrianglePoints():
        | { topLeft: Point2D; topRight: Point2D; bottom: Point2D }
        | undefined {
        const getLabelGeometry = (id: string) => {
            const group = this.svgRoot.querySelector(`#${id}`) as SVGGElement | null;
            if (!group) return undefined;
            const rect = group.querySelector('rect') as SVGElement | null;
            if (!rect) return undefined;
            // getCenterOfElement reads cx/cy; on <rect> those are absent → returns {0,0},
            // which is the correct local-space centre for a rect centred at the origin.
            const localCenter = getCenterOfElement(rect);
            const t = group.getAttribute('transform') ?? '';
            const m = t.match(/translate\(\s*([\d.+-]+)[\s,]+([\d.+-]+)\s*\)/);
            if (!m) return undefined;
            const center = { x: Number(m[1]) + localCenter.x, y: Number(m[2]) + localCenter.y };
            const hw = parseFloat(rect.getAttribute('width') ?? '20') / 2;
            const hh = parseFloat(rect.getAttribute('height') ?? '20') / 2;
            return { center, hw, hh };
        };

        const l = getLabelGeometry('face-label-L');
        const b = getLabelGeometry('face-label-B');
        const d = getLabelGeometry('face-label-D');
        if (!l || !b || !d) return undefined;

        return {
            topLeft: { x: l.center.x - l.hw, y: l.center.y - l.hh },
            topRight: { x: b.center.x + b.hw, y: b.center.y - b.hh },
            bottom: { x: d.center.x, y: d.center.y + d.hh },
        };
    }

    private isInLbdDeadZone(clientX: number, clientY: number): boolean {
        const pts = this.getLbdTrianglePoints();
        if (!pts) return false;
        const p = this.clientToSvgPoint(clientX, clientY);
        return isPointInTriangle(p, pts.topLeft, pts.topRight, pts.bottom);
    }

    /** Keep the detection-band clip path in sync with the LBD triangle geometry. */
    private updateDetectionBandClip(axis: Axis, clipEl: SVGClipPathElement): void {
        // Clear previous children.
        while (clipEl.firstChild) clipEl.removeChild(clipEl.firstChild);

        const mkPath = (d: string) => {
            const el = document.createElementNS(SVG_NS, 'path');
            el.setAttribute('d', d);
            return el;
        };

        const pts = this.getLbdTrianglePoints();

        if (!pts) {
            // Labels not found – show full coverage (no clipping).
            clipEl.appendChild(mkPath('M -9999 -9999 L 9999 -9999 L 9999 9999 L -9999 9999 Z'));
            return;
        }

        const { topLeft, topRight, bottom } = pts;

        // Each axis is associated with the ONE triangle edge that faces its side of the view.
        // Y (top):   top edge   topLeft  → topRight  (exterior = north / above)
        // X (right): right edge topRight → bottom    (exterior = east / right)
        // Z (left):  left edge  bottom   → topLeft   (exterior = west / left)
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
        // Outward normal for a CW-wound triangle edge (a→b): (dy, −dx).
        const ex = (dx / len) * FAR,
            ey = (dy / len) * FAR;
        const nx = (dy / len) * FAR,
            ny = -(dx / len) * FAR;
        // Extend edge endpoints far along the edge, then push the far side out by the normal.
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

    private showDetectionBand(
        cx: number,
        cy: number,
        innerR: number,
        outerR: number,
        axis: Axis
    ): void {
        // Rebuild this axis's clip now that labels are guaranteed to be in the DOM.
        const entry = this.axisDetectionBands.get(axis);
        if (!entry) return;
        this.updateDetectionBandClip(axis, entry.clipEl);

        // Draw an annular ring (donut) using two concentric arcs.
        // Outer arc clockwise, inner arc counter-clockwise, forming a closed ring.
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
        // Hide all other bands, show only this one.
        for (const [a, { bandEl }] of this.axisDetectionBands) {
            bandEl.setAttribute('visibility', a === axis ? 'visible' : 'hidden');
        }
    }

    private hideDetectionBand(): void {
        for (const { bandEl } of this.axisDetectionBands.values()) {
            bandEl.setAttribute('visibility', 'hidden');
        }
    }

    /** Compute the biased radial boundaries for a given axis circle and show the debug band. */
    private showDetectionBandForCircle(target: AxisCircle): void {
        const group = this.axisCircles
            .filter(c => c.axis === target.axis)
            .sort((a, b) => a.r - b.r);
        if (group.length === 0) return;

        const boundaries = computeBiasedBoundaries(group);

        const idx = group.findIndex(c => c.layer === target.layer);
        if (idx < 0) return;

        this.showDetectionBand(
            target.cx,
            target.cy,
            boundaries[idx],
            boundaries[idx + 1],
            target.axis
        );
    }

    /** Highlight specific axis circles as a transient preview without touching selectedAxisCircles. */
    private showAxisKeysPreview(keys: Iterable<string>): void {
        const className = this.styles['circular-axis-selected'] ?? 'circular-axis-selected';
        this.previewAxisKeys ??= new Set<string>();
        for (const key of keys) {
            const el = this.getAxisCircleElementByKey(key);
            if (!el) continue;
            el.classList.add(className);
            this.previewAxisKeys.add(key);
        }
    }

    /** Preview all circles of an entire axis (e.g. whole-cube background drag). */
    private showAxisPreview(axis: Axis): void {
        const cubeSize = this.getCubeSize();
        const keys = Array.from({ length: cubeSize }, (_, layer) => getAxisCircleKey(axis, layer));
        this.showAxisKeysPreview(keys);
    }

    /**
     * Preview the circle(s) that will move on drag commit:
     * - If the hit circle is part of a multi-circle selection → preview all selected circles.
     * - Otherwise → preview only the hit circle.
     */
    private showAxisCirclePreview(hitKey: string): void {
        const keys =
            this.selectedAxisCircles.has(hitKey) && this.selectedAxisCircles.size > 1
                ? this.selectedAxisCircles
                : [hitKey];
        this.showAxisKeysPreview(keys);
    }

    private hideAxisPreviewAll(): void {
        if (!this.previewAxisKeys || this.previewAxisKeys.size === 0) return;
        const className = this.styles['circular-axis-selected'] ?? 'circular-axis-selected';
        for (const key of Array.from(this.previewAxisKeys)) {
            // Do not remove the visual class from actually selected axis circles.
            if (this.selectedAxisCircles.has(key)) continue;
            const el = this.getAxisCircleElementByKey(key);
            if (!el) continue;
            el.classList.remove(className);
        }
        this.previewAxisKeys.clear();
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

/**
 * Returns true when point `p` lies inside (or on the edge of) the triangle
 * defined by vertices a, b, c using the sign-of-cross-product method.
 */
function isPointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
    const sign = (p1: Point2D, p2: Point2D, p3: Point2D) =>
        (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
}

/**
 * Compute radial boundaries for an axis group of circles sorted by ascending radius.
 *
 * The middle layer (layer === 1) gets 2/3 of each adjacent gap; the inner/outer layers
 * get the remaining 1/3 from the gap side. The free-side extensions of the inner and
 * outer circles are sized so that every band has the same total width as the middle band.
 *
 * Returns N+1 boundary values for N circles: [innerEdge, b01, b12, ..., outerEdge].
 */
function computeBiasedBoundaries(group: AxisCircle[]): number[] {
    const MIDDLE_SHARE = 2 / 3;

    if (group.length <= 1) {
        return [group[0]?.r ?? 0, group[0]?.r ?? 0];
    }

    // Step 1: compute inter-circle boundaries (N-1 values).
    const interBoundaries: number[] = [];
    for (let i = 0; i < group.length - 1; i += 1) {
        const a = group[i];
        const b = group[i + 1];
        const gap = b.r - a.r;
        if (b.layer === 1) {
            // Middle is the upper neighbour → it gets MIDDLE_SHARE of this gap.
            interBoundaries.push(a.r + (1 - MIDDLE_SHARE) * gap);
        } else if (a.layer === 1) {
            // Middle is the lower neighbour → it gets MIDDLE_SHARE of this gap.
            interBoundaries.push(a.r + MIDDLE_SHARE * gap);
        } else {
            interBoundaries.push(a.r + 0.5 * gap);
        }
    }

    // Step 2: compute the middle-circle band width.
    const midIdx = group.findIndex(c => c.layer === 1);
    let middleBandWidth: number;
    if (midIdx >= 1 && midIdx <= interBoundaries.length - 1) {
        // Middle band spans from interBoundaries[midIdx-1] to interBoundaries[midIdx].
        middleBandWidth = interBoundaries[midIdx] - interBoundaries[midIdx - 1];
    } else {
        // Fallback: use the first gap.
        middleBandWidth = group[1].r - group[0].r;
    }

    // Step 3: extend innermost and outermost so every band has `middleBandWidth`.
    // First circle's share from the gap = interBoundaries[0] - group[0].r
    const firstGapShare = interBoundaries[0] - group[0].r;
    const innerEdge = group[0].r - (middleBandWidth - firstGapShare);

    // Last circle's share from the gap = group[last].r - interBoundaries[last]
    const lastGapShare = group[group.length - 1].r - interBoundaries[interBoundaries.length - 1];
    const outerEdge = group[group.length - 1].r + (middleBandWidth - lastGapShare);

    return [Math.max(0, innerEdge), ...interBoundaries, outerEdge];
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
