import { LayoutMode, ReadOnlyCubeModel, StickerId, Vector3 } from '@/cube/types';

import type { Orientation, RotationPlan } from './rotation-math';

/**
 * Variant type for basic view (front or back).
 */
export const BasicVariant = {
    Front: 'front',
    Back: 'back',
} as const;

export type BasicVariant = (typeof BasicVariant)[keyof typeof BasicVariant];

/**
 * State persisted for the basic view.
 */
export interface BasicViewState {
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
    isTilted: boolean;
    isPitched: boolean;
    faceDirectMode: boolean;
    linked: boolean;
    ghostOpacityIndex: number;
}

/**
 * Full internal state shared between all basic-view modules.
 * Defined here so modules can import it as a type without creating runtime
 * circular dependencies.
 */
export type BasicViewInternalData = {
    model?: ReadOnlyCubeModel;
    onStickerSelected?: (id: StickerId) => void;
    container: HTMLElement | null;
    cubeElement: HTMLElement | null;
    cubeContainer: HTMLElement | null;
    ghostAnchorContainer?: HTMLElement | null;
    styles: Record<string, string>;
    stickerClass: string;
    highlightedClass: string;
    variant: BasicVariant;
    viewType: string;
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
    isTilted: boolean;
    isPitched: boolean;
    layoutMode: LayoutMode;
    currentSelected?: StickerId;
    /**
     * The sticker currently hover-highlighted, if any.
     *
     * Tracked so the highlight — like the selection — can be re-derived at the
     * rebuild boundary. Cubie elements are replaced wholesale on every resize
     * and model update, which drops the `highlighted` class while the pointer is
     * still resting on that sticker. Without this the DOM disagreed with the app
     * about which sticker was highlighted, and `setHighlightedSticker`'s
     * unchanged-value early return left no path to repair it until the pointer
     * moved away and back.
     */
    currentHighlight?: StickerId;
    selectedFace?: string;
    selectedCubiePosition?: Vector3;
    cubieSize?: number;
    /**
     * The rotation ramp currently animating the cube element, if any.
     *
     * Held on state because an animation is a visual layer over an orientation
     * that has already changed (R8): the model-side orientation moves
     * immediately, so a second rotation arriving mid-flight has to consult what
     * is *rendered* — this plan — to work out what to animate from, not what the
     * stored orientation currently says.
     */
    rotationPlan?: RotationPlan | null;
    /** The animation currently driving {@link rotationPlan}, if any. */
    rotationAnimation?: Animation;
    /**
     * The orientation the cube element displays when no ramp is running.
     *
     * Distinct from the view's orientation, and that distinction is the point:
     * the orientation changes the instant a rotation is requested (R8), so a
     * second rotation arriving mid-flight cannot use it to work out what to
     * animate *from*. This records what is actually on screen at rest, which is
     * what a fresh ramp starts from.
     */
    renderedBasis?: Orientation;
};
