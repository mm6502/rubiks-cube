import { Axis, Face } from '@/cube/types';
import type { CubeState } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import type { DragStateMachine } from '@/interaction/drag-state-machine';
import {
    CANCEL_ZONE_RADIUS_BASE_PX,
    CANCEL_ZONE_TABBED_MULTIPLIER,
    HitKind,
    type Point2D,
    type ViewInteractionAdapter,
} from '@/interaction/types';

import type { FaceScreenBasis } from './direction-mapping';
import type { AxisCircle } from './svg-tools';

// ── Options ─────────────────────────────────────────────────────────────────

/** Configuration passed to the `CircularTouchHandler` constructor. */
export type CircularTouchHandlerOptions = {
    /** The root `<svg>` element that contains the circular view. */
    svgRoot: SVGSVGElement;
    /** The host HTML element that wraps the SVG (used for drag-label positioning). */
    host: HTMLElement;
    /** CSS-module class name map for styling touch-handler overlay elements. */
    styles: Record<string, string>;
    /** All axis circles (concentric rings) present in the SVG. */
    axisCircles: AxisCircle[];
    /** Returns the current cube size (e.g. 3 for a 3×3×3). */
    getCubeSize: () => number;
    /** Returns the current immutable cube state, if available. */
    getCubeState?: () => CubeState;
    /** Callback invoked when a sticker is selected or deselected (tap). */
    onStickerSelected: (stickerId?: string) => void;
    /** Optional adapter that overrides drag-direction mapping and move-notation inference. */
    adapter?: ViewInteractionAdapter;
};

// ── Hit types ───────────────────────────────────────────────────────────────

/** Result of resolving a pointer-down target to a specific sticker on the cube. */
export type StickerHit = {
    /** The face the sticker belongs to. */
    face: Face;
    /** Zero-based row within the face grid. */
    row: number;
    /** Zero-based column within the face grid. */
    col: number;
    /** DOM data-sticker-id attribute, if present. */
    stickerId?: string;
};

/** Result of resolving a pointer-down target to an axis circle (concentric ring). */
export type AxisHit = {
    /** Which cube axis this circle belongs to. */
    axis: Axis;
    /** Layer index along the axis (0 = nearest face, cubeSize-1 = farthest). */
    layer: number;
    /** Canonical string key (e.g. `"X-1"`), matches `getAxisCircleKey()` output. */
    key: string;
    /** The `<circle>` SVG element that was hit. */
    element: SVGCircleElement;
    /** Client-pixel coordinates of the circle's center (for rotation-center tracking). */
    circleCenterClient: { x: number; y: number };
};

/**
 * Discriminated union describing what the user touched at pointer-down.
 *
 * Used to decide which drag/tap behaviour to activate.
 */
export type InteractionStart =
    | { kind: typeof HitKind.STICKER; sticker: StickerHit }
    | { kind: typeof HitKind.FACE_ELLIPSE; face: Face }
    | { kind: typeof HitKind.AXIS_CIRCLE; axis: AxisHit }
    | { kind: typeof HitKind.BACKGROUND }
    | { kind: typeof HitKind.HALO }
    | { kind: typeof HitKind.NONE };

// ── Pending sticker cross (drag-decision state) ────────────────────────────

/**
 * Pre-computed drag-decision state for a sticker drag.
 *
 * Stores the four cardinal move notations so that the drag handler can
 * resolve the intended move from the drag direction without re-computing
 * the face basis on every pointer-move.
 */
export type PendingStickerCross = {
    /** Screen-space basis (upDir / rightDir) at the touch point. */
    basis: FaceScreenBasis;
    /** Move notation when the user drags in the "up" direction. */
    upMove: string;
    /** Move notation when the user drags in the "down" direction. */
    downMove: string;
    /** Move notation when the user drags in the "right" direction. */
    rightMove: string;
    /** Move notation when the user drags in the "left" direction. */
    leftMove: string;
};

// ── Constants ───────────────────────────────────────────────────────────────

/** SVG XML namespace URI, needed for `document.createElementNS` calls. */
export const SVG_NS = 'http://www.w3.org/2000/svg';
/** Commit-distance threshold in floating (desktop) layout (pixels). Drags shorter than this are cancelled. */
export const COMMIT_DISTANCE_PX = CANCEL_ZONE_RADIUS_BASE_PX;
/** Commit-distance threshold in tabbed layout (pixels). Larger than floating to account for denser UI. */
export const COMMIT_DISTANCE_TABBED_PX = CANCEL_ZONE_RADIUS_BASE_PX * CANCEL_ZONE_TABBED_MULTIPLIER;
/** Max SVG-space distance from a touch point to qualify as "near" a circle crossing (for basis computation). */
export const CROSSING_PROXIMITY_MAX_SVG = 12;
/** Length of each arm of the drag-decision cross in floating layout (SVG units). */
export const DRAG_CROSS_ARM_LENGTH_FLOATING = 34;
/** Length of each arm of the drag-decision cross in tabbed layout (SVG units). */
export const DRAG_CROSS_ARM_LENGTH_TABBED = 64;
/** Pixel movement before a pointer-down is promoted to a drag gesture. */
export const DRAG_THRESHOLD_PX = 4;
/** Pixel distance beyond which a drag produces a double-move notation (e.g. `R2`). */
export const FAR_DRAG_THRESHOLD_PX = 70;
/** Half the perpendicular distance between the two fretboard guide lines (SVG units). */
export const FRETBOARD_HALF_GAP_SVG = 5;
/** Sentinel key for fretboardHighlightKey meaning "outside all circles → whole-cube zone". */
export const FRETBOARD_BG_KEY = 'BG';

// ── Touch handler internal state ────────────────────────────────────────────

/**
 * Mutable state bag for `CircularTouchHandler`.
 *
 * The class owns this struct and passes it into extracted module functions
 * that implement the various touch-interaction subsystems.
 */
export type TouchHandlerState = {
    // ── Readonly dependencies (set once in constructor) ─────────────
    /** Root `<svg>` element that contains all circular-view geometry. */
    readonly svgRoot: SVGSVGElement;
    /** CSS-module host element that wraps the SVG (used for drag-label positioning). */
    readonly host: HTMLElement;
    /** CSS-module class-name map for scoped styling of overlay elements. */
    readonly styles: Record<string, string>;
    /** Parsed axis circle metadata (one entry per concentric ring per axis). */
    readonly axisCircles: AxisCircle[];
    /** Returns the current cube dimension (e.g. 3 for a 3×3×3). */
    readonly getCubeSize: () => number;
    /** Returns the current immutable cube state for sticker resolution. */
    readonly getCubeState: CircularTouchHandlerOptions['getCubeState'];
    /** Callback invoked when a sticker is selected/deselected via tap. */
    readonly onStickerSelected: (stickerId?: string) => void;
    /** View-specific adapter that maps gestures to move notations. */
    readonly adapter: ViewInteractionAdapter;
    /** Tracks pointer drag lifecycle (threshold, direction, angular displacement). */
    readonly dragStateMachine: DragStateMachine;

    // ── DOM overlay elements ────────────────────────────────────────
    /** SVG ellipse rendered as the selection halo around a face. */
    readonly haloEl: SVGEllipseElement;
    /** Invisible ellipse overlay that absorbs pointer events over the selected face. */
    readonly faceOverlayEl: SVGEllipseElement;
    /** Floating HTML label that shows the inferred move notation during a drag. */
    readonly dragLabelEl: HTMLDivElement;
    /** SVG circle shown at the pointer-down position as a cancel/commit threshold indicator. */
    readonly cancelZoneEl: SVGCircleElement;
    /** SVG group containing the two drag-decision cross arms. */
    readonly dragCrossGroupEl: SVGGElement;
    /** Primary arm of the drag-decision cross (bisector between UP/RIGHT zones). */
    readonly dragCrossPrimaryEl: SVGLineElement;
    /** Secondary arm of the drag-decision cross (bisector between UP/LEFT zones). */
    readonly dragCrossSecondaryEl: SVGLineElement;
    /** SVG group containing the two parallel fretboard guide lines. */
    readonly fretboardGroupEl: SVGGElement;
    /** First parallel fret guide line (offset perpendicular from the radial axis). */
    readonly fretboardLine1El: SVGLineElement;
    /** Second parallel fret guide line (offset perpendicular from the radial axis). */
    readonly fretboardLine2El: SVGLineElement;
    /** Per-axis debug annular bands with clip paths for proximity hit visualisation. */
    readonly axisDetectionBands: Map<Axis, { bandEl: SVGPathElement; clipEl: SVGClipPathElement }>;

    // ── Mutable interaction state ───────────────────────────────────
    /** Currently selected face (shown with a halo ring). */
    selectedFace: Face | undefined;
    /** Persistently selected axis circle keys (toggled by tap). */
    selectedAxisCircles: Set<string>;
    /** Pointer ID of the active gesture; prevents multi-touch conflicts. */
    activePointerId: number | undefined;
    /** Hit target captured at pointer-down — determines gesture semantics. */
    start: InteractionStart;
    /** Precomputed four-directional moves for the sticker under the pointer. */
    pendingStickerCross: PendingStickerCross | undefined;
    /** Current layout mode — affects thresholds and label positioning. */
    layoutMode: LayoutMode;
    /** Whether face-direct mode is active (tap-and-drag rotates face immediately). */
    faceDirectMode: boolean;
    /** Face temporarily activated during a face-direct gesture. */
    directModeTempFace: Face | undefined;
    /** Face that was selected before a face-direct gesture started. */
    previousSelectedFace: Face | undefined;
    /** Transiently highlighted axis circle keys shown as a drag preview. */
    previewAxisKeys: Set<string> | undefined;

    // ── Fretboard gesture state ─────────────────────────────────────
    /** Axis selections saved at start of fretboard gesture, restored on pointer-up. */
    savedAxisSelections: Set<string> | undefined;
    /** The single axis circle key currently highlighted during a fretboard drag, or `FRETBOARD_BG_KEY` for whole-cube zone. */
    fretboardHighlightKey: string | undefined;
    /** Keys whose CSS selected-class is currently owned by the fretboard gesture. */
    fretboardVisualKeys: Set<string>;
    /** Sorted axis circles for the active fretboard gesture's axis. */
    fretboardAxisGroup: AxisCircle[] | undefined;
    /** Precomputed biased radial boundaries for the active fretboard axis group. */
    fretboardBoundaries: number[] | undefined;
    /** The axis used by the active fretboard gesture (for whole-cube inference). */
    fretboardAxis: Axis | undefined;
    /** Radial direction (unit vector, SVG space) of the fretboard center line. */
    fretboardRadialDir: Point2D | undefined;
    /** Touch-down point in SVG coordinates — origin for the fretboard center line. */
    fretboardStartSvg: Point2D | undefined;
};
