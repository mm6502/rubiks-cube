import type { Axis } from '@/cube/types/common';
import type { Face } from '@/cube/types/common';
import type { ReadOnlyCubeModel } from '@/cube/types/model';
import type { StickerId } from '@/cube/types/sticker';
import { getAxisComponent } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { facePositionTo3D } from '@/cube/utils/sticker-position';
import type { CommandGenerationOptions } from '@/types';

/**
 * The three slice families, named by the letter that identifies them.
 * M turns X (between L and R), E turns Y (between U and D), S turns Z
 * (between F and B).
 */
export type SliceBase = 'M' | 'E' | 'S';

/**
 * A resolved slice move: which layer it turns, and the notation that names it.
 */
export type SliceTarget = {
    /** Zero-based layer index the slice turns. */
    layerIndex: number;
    /** Notation to execute (e.g. `"M"` at 3×3, `"3E"` on a 5×5). */
    notation: string;
};

/**
 * A sticker's layer along one axis — the `layerIndices` entry a slice move
 * would need in order to turn that sticker's slice.
 *
 * The layer is derived from the sticker's *theoretical* position (its face plus
 * face position), not from its owning cubie, so a sticker keeps reporting the
 * layer it visually occupies. Both inputs are pre-computed on every
 * {@link Sticker}, so no search of the cube state is required.
 *
 * @param sticker - The sticker to locate (only its face and face position are read).
 * @param axis - The axis to measure along.
 * @param cubeSize - Edge length of the cube.
 * @returns The zero-based layer index (0 … cubeSize − 1).
 */
export function stickerLayerOnAxis(
    sticker: { readonly currentFace: Face; readonly facePosition: number },
    axis: Axis,
    cubeSize: number
): number {
    const position = facePositionTo3D(sticker.facePosition, sticker.currentFace, cubeSize);
    return getAxisComponent(position, axis);
}

/**
 * Whether a layer index is an interior (slice-able) layer of the cube.
 * Layers 0 and cubeSize − 1 are the outer faces, which face moves already
 * cover, so a slice never applies to them.
 */
function isInteriorLayer(layerIndex: number, cubeSize: number): boolean {
    return layerIndex >= 1 && layerIndex <= cubeSize - 2;
}

/**
 * Resolve which layer an M/E/S slice command should turn.
 *
 * The rule is size-dependent, because "the middle slice" means different things
 * at different sizes:
 *
 * - **Below 3×3 there is no interior layer**, so M/E/S are unavailable. A 2×2
 *   has nothing between its faces to turn.
 * - **At 3×3 the slices keep their conventional meaning**: M/E/S name the single
 *   interior layer (index 1) directly, independent of any selection. Nothing is
 *   gated off, and history keeps the familiar bare `M`/`E`/`S` spelling.
 * - **Above 3×3 the selection picks the layer.** Bare M/E/S have no well-defined
 *   layer there (they would alias `2M`/`2E`/`2S` regardless of what the user is
 *   looking at), so the active view's selected sticker decides the layer and the
 *   command is spelled with its layer number (`2M`, `3E`, …). A slice is
 *   unavailable when nothing is selected, or when the selection sits on that
 *   axis's outer layer — turning an outer layer is a face move, not a slice.
 *
 * @param base - Which slice family the command belongs to.
 * @param axis - The axis that family turns.
 * @param cubeSize - Edge length of the cube.
 * @param options - Host-supplied live state; see {@link CommandGenerationOptions}.
 * @returns The resolved target, or undefined when the slice does not apply.
 */
export function resolveSliceTarget(
    base: SliceBase,
    axis: Axis,
    cubeSize: number,
    options?: CommandGenerationOptions
): SliceTarget | undefined {
    // No interior layer exists, so the slices are meaningless.
    if (cubeSize < 3) return undefined;

    // Conventional meaning: the single middle slice, spelled bare.
    if (cubeSize === 3) return { layerIndex: 1, notation: base };

    const layerIndex = options?.resolveSelectedLayer?.(axis);
    if (layerIndex === undefined || !isInteriorLayer(layerIndex, cubeSize)) return undefined;

    return { layerIndex, notation: `${layerIndex + 1}${base}` };
}

/**
 * Layer of the selected sticker along an axis, for use as
 * {@link CommandGenerationOptions.resolveSelectedLayer}.
 *
 * @param state - Current cube state (supplies the size and stickers).
 * @param stickerId - Selected sticker, if any.
 * @param axis - The axis to measure along.
 * @returns The layer index, or undefined when nothing valid is selected.
 */
export function selectedLayerOnAxis(
    state: { cubeSize: number } & Parameters<typeof CubeStateUtils.getStickerById>[0],
    stickerId: StickerId | undefined,
    axis: Axis
): number | undefined {
    if (!stickerId) return undefined;
    const sticker = CubeStateUtils.getStickerById(state, stickerId);
    if (!sticker) return undefined;
    return stickerLayerOnAxis(sticker, axis, state.cubeSize);
}

/**
 * Build a {@link CommandGenerationOptions.resolveSelectedLayer} callback that
 * reads the selection from a live cube model.
 *
 * @param getModel - Supplies the current model (queried per resolution, so the
 *   callback stays valid across state imports).
 * @param getSelectedStickerId - Supplies the active view's selected sticker.
 * @param getAxis - Unused; retained for symmetry with the callback it returns.
 */
export function createSelectedLayerResolver(
    getModel: () => ReadOnlyCubeModel,
    getSelectedStickerId: () => StickerId | undefined
): NonNullable<CommandGenerationOptions['resolveSelectedLayer']> {
    return axis => selectedLayerOnAxis(getModel().getCurrentState(), getSelectedStickerId(), axis);
}
