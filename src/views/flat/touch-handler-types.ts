import { Face } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { DragStateMachine } from '@/interaction/drag-state-machine';
import { ViewInteractionAdapter } from '@/interaction/types';

/**
 * Options passed to FlatTouchHandler on construction.
 */
export type FlatTouchHandlerOptions = {
    /** The container element that hosts the flat view stickers and overlays. */
    host: HTMLElement;
    /** CSS module class-name map for flat-view styling. */
    styles: Record<string, string>;
    /** Returns the current cube dimension (e.g. 3 for a 3×3). */
    getCubeSize: () => number;
    /** Whether the flat layout is rotated 90° (landscape orientation). */
    getIsRotated: () => boolean;
    /** Callback fired when a sticker is tapped/selected. */
    onStickerSelected: (stickerId?: string) => void;
    /** Optional view-specific interaction adapter for direction mapping and face-rotation notation. */
    adapter?: ViewInteractionAdapter;
};

/**
 * A sticker hit resolved from a pointer coordinate.
 */
export type StickerHit = {
    /** The DOM element of the hit sticker. */
    stickerElement: HTMLElement;
    /** The cube face the sticker belongs to. */
    face: Face;
    /** Zero-based row index within the face grid. */
    row: number;
    /** Zero-based column index within the face grid. */
    col: number;
    /** Application-level sticker identifier, if present on the element. */
    stickerId?: string;
};

/**
 * Shared mutable state for the flat touch handler.
 * Passed as the first argument to all extracted helper functions.
 */
export type FlatTouchHandlerState = {
    // ── Readonly configuration ──────────────────────────────────────────

    /** The container element that hosts the flat view stickers and overlays. */
    readonly host: HTMLElement;
    /** CSS module class-name map for flat-view styling. */
    readonly styles: Record<string, string>;
    /** Returns the current cube dimension (e.g. 3 for a 3×3). */
    readonly getCubeSize: () => number;
    /** Whether the flat layout is rotated 90° (landscape orientation). */
    readonly getIsRotated: () => boolean;
    /** Callback fired when a sticker is tapped/selected. */
    readonly onStickerSelected: (stickerId?: string) => void;
    /** View-specific interaction adapter for direction mapping and face-rotation notation. */
    readonly adapter: ViewInteractionAdapter;
    /** Manages drag threshold detection, tap-vs-drag discrimination, and gesture lifecycle. */
    readonly dragStateMachine: DragStateMachine;

    // ── Layout ──────────────────────────────────────────────────────────

    /** Current layout mode (Floating or Tabbed), affects cancel-zone sizing and drag-label positioning. */
    layoutMode: LayoutMode;

    // ── Pointer / gesture tracking ──────────────────────────────────────

    /** The currently selected (highlighted) face, or undefined if none. */
    selectedFace: Face | undefined;
    /** Pointer ID of the active interaction, used to ignore secondary pointers. */
    activePointerId: number | undefined;
    /** Pointer type of the active interaction ('mouse', 'touch', 'pen'). */
    activePointerType: string | undefined;
    /** Screen coordinates where the active pointer first went down. */
    activePointerOrigin: { x: number; y: number } | undefined;
    /** Whether the current pointer sequence is eligible to become a drag gesture. */
    activePointerAllowsDrag: boolean;
    /** The sticker hit at pointer-down, if any — drives ring-drag move inference. */
    startHit: StickerHit | undefined;
    /** True when the current drag started on the halo or via face-direct mode (whole-face rotation). */
    selectedFaceGesture: boolean;
    /** When true, the next click event is swallowed to prevent tap-through after a drag. */
    suppressNextClick: boolean;
    /** Minimum drag distance (px) required to commit a move — set to the cancel-zone radius at pointer-down. */
    activeCommitDistancePx: number;

    // ── Face-direct mode ────────────────────────────────────────────────

    /** Whether face-direct mode is active (tap any sticker to temporarily select its face for rotation). */
    faceDirectMode: boolean;
    /** The face temporarily selected during a face-direct-mode gesture. */
    directModeTempFace: Face | undefined;
    /** The face that was selected before face-direct mode temporarily overrode it. */
    previousSelectedFace: Face | undefined;

    // ── Overlay DOM elements ────────────────────────────────────────────

    /** Visual halo ring element displayed around the selected face. */
    haloEl: HTMLDivElement;
    /** Invisible rectangular hit-target covering the selected face for drag detection. */
    haloHitTargetEl: HTMLDivElement;
    /** Visual cancel-zone circle shown at the drag origin. */
    haloCancelZoneEl: HTMLDivElement;
    /** Floating label that previews the inferred move notation during a drag. */
    dragLabelEl: HTMLDivElement;
    /** Cached screen-space center and size of the selected face, used for rotation direction inference. */
    haloFaceCenter: { x: number; y: number; size: number } | undefined;

    // ── Saved host touch-action style for cleanup ───────────────────────

    /** Original `touch-action` CSS value of the host, restored on destroy. */
    previousTouchAction: string;
};

/** Minimum pointer movement (px) before a drag is recognized instead of a tap. */
export const DRAG_THRESHOLD_PX = 4;
/** Distance (px) beyond which a drag is considered a "far drag", triggering double-move notation. */
export const FAR_DRAG_THRESHOLD_PX = 60;
