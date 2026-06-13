import { Axis, Face, PositionKey, ReadOnlyCubeModel, StickerId } from '@/cube/types';

import { AxisCircle } from './svg-tools';
import { CircularTouchHandler } from './touch-handler';
import { ZoomPanController } from './zoom-pan';

/**
 * Mapping from position keys to face-to-SVG ID maps.
 * Extracted here to break the initialization ↔ circular-view circular dependency.
 */
export type StickerLookupMap = Map<PositionKey, Map<Face, string>>;

/**
 * Internal data for CircularCubeView.
 * Holds references to DOM elements and mappings.
 * @internal
 */
export type CircularCubeViewInternalData = {
    /**
     * The cube model associated with this view.
     */
    model?: ReadOnlyCubeModel;

    /**
     * The container element for the view.
     */
    container: HTMLElement | undefined | null;

    /**
     * Styles applied to the view.
     */
    styles: Record<string, string>;

    /**
     * The root SVG element.
     */
    svgRoot: SVGSVGElement | undefined | null;

    /**
     * Flag indicating if the SVG is ready for interaction.
     */
    svgReady: boolean;

    /**
     * Array of axis circles for rotation animations.
     * Empty if not initialized.
     */
    axisCircles: AxisCircle[];

    /**
     * Mapping from position keys to face-to-SVG ID maps.
     * Null if not initialized.
     */
    stickerLookupMap?: StickerLookupMap;

    /**
     * Cache of SVG elements by their ID.
     */
    svgElementCache: Map<string, SVGCircleElement>;

    /**
     * Mapping from SVG element IDs to Sticker IDs.
     */
    svgIdToStickerId: Map<string, StickerId>;

    /**
     * Mapping from Sticker IDs to SVG element IDs.
     */
    stickerIdToSvgId: Map<StickerId, string>;

    /**
     * Currently selected sticker for keyboard navigation
     */
    currentSelected?: StickerId;

    /**
     * Face of the currently selected sticker (spatial anchor for selection).
     */
    selectedFace?: string;

    /**
     * Position on face of the currently selected sticker (spatial anchor).
     */
    selectedPosition?: number;

    /**
     * Serializes move animations so they never run concurrently.
     * Each updateSelective call chains onto this promise.
     */
    animationChain: Promise<void>;
    /**
     * Per-axis animation chains. Moves on the same axis animate in parallel
     * (their stickers are disjoint), while moves on different axes are serialized.
     */
    axisAnimationChains: Record<Axis, Promise<void>>;
    /** Whether keyboard walking follows real cube surface topology. */
    cubeWalk: boolean;
    /** Whether ghost hint stickers are visible. */
    showGhosts: boolean;
    /** Ghost opacity level index (0=off, 1=0.75, 2=1.0). */
    ghostOpacityIndex: number;
    /** Cached ghost-sticker SVG elements (lazily populated by rendering). */
    ghostElements?: SVGCircleElement[];
    /** Zoom/pan controller — set up in create(), torn down in destroy(). */
    zoomPan: ZoomPanController | null;
    /** Touch handler for drag gestures and face selection. */
    touchHandler: CircularTouchHandler | null;
    /** Whether left-drag pans instead of performing move gestures. */
    panMode: boolean;
};

export type CircularViewState = {
    faceDirectMode: boolean;
    panMode: boolean;
    cubeWalk: boolean;
    showGhosts: boolean;
    ghostOpacityIndex: number;
};
