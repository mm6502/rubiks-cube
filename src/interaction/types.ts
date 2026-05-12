import { Axis, Face } from '@/cube/types';
import type { Point2D } from '@/types/geometry';

export type { Point2D } from '@/types/geometry';

/** Base radius (px) of the drag cancellation zone shown at the drag origin across all views. */
export const CANCEL_ZONE_RADIUS_BASE_PX = 16;

/** Multiplier applied to the cancellation zone radius in tabbed (mobile) layout mode. */
export const CANCEL_ZONE_TABBED_MULTIPLIER = 1.3;

/**
 * Cardinal drag directions used by gesture-based move inference.
 */
export const DragDirection = {
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
} as const;

export type DragDirection = (typeof DragDirection)[keyof typeof DragDirection];

/**
 * Basic 2D point representation in client/screen coordinates.
 */
/**
 * Canonical drag gesture details emitted by the shared drag state machine.
 */
export type DragGesture = {
    /** Pointer identifier from the originating PointerEvent. */
    pointerId: number;
    /** Screen coordinates where the drag began. */
    start: Point2D;
    /** Current screen coordinates of the pointer. */
    current: Point2D;
    /** Horizontal displacement from start to current (pixels, positive = right). */
    deltaX: number;
    /** Vertical displacement from start to current (pixels, positive = down). */
    deltaY: number;
    /** Euclidean distance between start and current (pixels). */
    distancePx: number;
    /** Dominant cardinal direction of the drag. */
    direction: DragDirection;
    /** Start angle around optional rotation center (radians). */
    startAngleRad?: number;
    /** Current angle around optional rotation center (radians). */
    currentAngleRad?: number;
    /** Signed angular displacement from start to current angle (radians). */
    angularDisplacementRad?: number;
};

/**
 * Local selected-face state owned by each view.
 */
export type FaceSelectionState = {
    /** The face currently selected in the view, or undefined if none. */
    selectedFace?: Face;
};

/**
 * Canonical interaction hit categories used across all view adapters.
 */
export const HitKind = {
    STICKER: 'sticker',
    FACE_ELLIPSE: 'face-ellipse',
    HALO: 'halo',
    AXIS_CIRCLE: 'axis-circle',
    BACKGROUND: 'background',
    NONE: 'none',
} as const;

export type HitKind = (typeof HitKind)[keyof typeof HitKind];

/**
 * Normalized gesture payload consumed by adapter-driven inference.
 */
export type GestureIntent = {
    /** Category of the element that received the initial pointer-down. */
    hitKind: HitKind;
    /** Dominant cardinal direction of the drag. */
    direction: DragDirection;
    /** Euclidean distance of the drag in pixels. */
    distancePx: number;
    /** Horizontal displacement in pixels (positive = right). */
    deltaX: number;
    /** Vertical displacement in pixels (positive = down). */
    deltaY: number;
    /**
     * Drag start in view-local coordinates (for circular view this is SVG space).
     */
    startViewPoint?: Point2D;
    /** Signed angular displacement from drag start to current position (radians). */
    angularDisplacementRad?: number;
    /** Face under the pointer when the drag started, if applicable. */
    face?: Face;
    /** Zero-based row index of the hit sticker within its face. */
    row?: number;
    /** Zero-based column index of the hit sticker within its face. */
    col?: number;
    /** Rotation axis associated with the hit element (e.g. axis-circle). */
    axis?: Axis;
    /** Layer index along the axis for axis-circle and slice moves. */
    layer?: number;
};

/**
 * Shared interaction context supplied by each view.
 */
export type InteractionContext = {
    /** Edge length of the cube (e.g. 3 for a standard 3×3×3). */
    cubeSize: number;
    /** The face currently active / selected in this view. */
    selectedFace?: Face;
    /** Visual rotation (degrees) applied to each face in the view, keyed by face. */
    faceRotationDegByFace?: Partial<Record<Face, number>>;
    /** Arbitrary view-specific flags and scalars passed through to adapter hooks. */
    metadata?: Record<string, boolean | number | string | undefined>;
};

/**
 * View-specific adapter hooks that map local interactions into shared inference.
 */
export type ViewInteractionAdapter = {
    /**
     * Optionally re-maps a canonical drag direction to account for
     * view-specific transforms (e.g. face rotation or mirroring).
     */
    mapDragDirection?: (
        direction: DragDirection,
        face: Face,
        context: InteractionContext
    ) => DragDirection;
    /**
     * Returns WCA notation for a drag on an axis-circle element,
     * or undefined to fall back to default inference.
     * Must return a base or prime quarter-turn notation (for example "R" or "R'").
     * Do not return a 2-move notation here; far-drag promotion to 180° is applied
     * by shared interaction logic.
     */
    inferAxisCircleNotation?: (
        axis: Axis,
        layer: number,
        isClockwise: boolean,
        context: InteractionContext
    ) => string | undefined;
    /**
     * Returns WCA notation for a whole-cube rotation gesture,
     * or undefined to fall back to default inference.
     */
    inferWholeCubeNotation?: (
        deltaX: number,
        deltaY: number,
        context: InteractionContext
    ) => string | undefined;
    /**
     * Returns WCA notation for a face-rotation gesture on a face ellipse or halo,
     * or undefined to fall back to default inference.
     */
    inferFaceRotationNotation?: (
        face: Face,
        isClockwise: boolean,
        context: InteractionContext
    ) => string | undefined;
};

/**
 * Input payload used to infer a move from an unselected sticker drag.
 */
export type MoveInferenceInput = {
    /** The face on which the drag started. */
    face: Face;
    /** Zero-based row index of the dragged sticker within its face. */
    row: number;
    /** Zero-based column index of the dragged sticker within its face. */
    col: number;
    /** Dominant cardinal direction of the drag. */
    direction: DragDirection;
    /** Edge length of the cube (e.g. 3 for a standard 3×3×3). */
    cubeSize: number;
    /** Drag distance in pixels; may be used for threshold checks. */
    distancePx?: number;
    /**
     * Minimum drag distance (px) to treat the gesture as a "far" drag
     * (180° move). Falls back to the DragStateMachine default when omitted.
     * */
    farDragThresholdPx?: number;
};
