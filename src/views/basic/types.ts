import { LayoutMode, ReadOnlyCubeModel, StickerId, Vector3 } from '@/cube/types';

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
    container: HTMLElement | null;
    cubeElement: HTMLElement | null;
    cubeContainer: HTMLElement | null;
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
    isHovered: boolean;
    layoutMode: LayoutMode;
    currentSelected?: StickerId;
    selectedFace?: string;
    selectedCubiePosition?: Vector3;
};
