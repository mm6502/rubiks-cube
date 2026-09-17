import { Axis } from '@/cube/types';
import { axisLayerToMoveBase } from '@/interaction/move-inference';
import { isAxisLayerReversedFromCanonical } from '@/views/circular/touch-handler-geometry';

/**
 * Notation-label content for the Circular view's ring labels.
 *
 * Two rules combine: the base move letter (which moves exist at this size), and
 * the direction glyph (which way the ring rotates). Both are reused from the
 * view's runtime modules rather than restated, so a label can never disagree
 * with the move the same ring actually performs.
 */

export interface LabelContent {
    /** Base move notation, e.g. `B`, `S`, `R`. */
    base: string;
    /** Glyph indicating rotation direction: `↻` clockwise, `↺` counter-clockwise. */
    glyph: string;
    /** Visible label text, base plus glyph. */
    text: string;
    /** Tooltip prose describing the move. */
    title: string;
}

/**
 * Build the label content for one ring.
 *
 * The base letter comes from the size-aware notation mapping, so a size with no
 * middle layers simply never produces `M`, `E`, or `S`. The glyph follows from
 * the axis/layer parity rule the drag handler already uses, which is why the
 * reused helper takes `cubeSize` — the "canonical" direction is size-dependent.
 */
export function labelContent(axis: Axis, layerIndex: number, cubeSize: number): LabelContent {
    const base = axisLayerToMoveBase(axis, layerIndex, cubeSize);

    // The ring's canonical clockwise move is reversed relative to the axis's
    // positive direction for some layers; that parity decides which glyph the
    // label shows.
    const reversed = isAxisLayerReversedFromCanonical(axis, layerIndex, cubeSize);
    const isClockwise = !reversed;
    const glyph = isClockwise ? '↻' : '↺';

    return {
        base,
        glyph,
        text: `${base}${glyph}`,
        title: buildTitle(axis, layerIndex, base, isClockwise, cubeSize),
    };
}

/** Tooltip prose. Inner (slice) moves note which face they follow. */
function buildTitle(
    axis: Axis,
    layerIndex: number,
    base: string,
    isClockwise: boolean,
    cubeSize: number
): string {
    const direction = isClockwise ? 'clockwise' : 'counter-clockwise';
    const follows = isMiddleLayer(layerIndex, cubeSize) ? sliceFollowsFace(axis) : undefined;
    const suffix = follows ? ` (follows ${follows})` : '';
    return `[${axis.toLowerCase()}:${layerIndex}] ${base} move rotates this circle ${direction}.${suffix}`;
}

/** A layer is a slice only when it is neither of the axis's two extremes. */
function isMiddleLayer(layerIndex: number, cubeSize: number): boolean {
    const last = cubeSize - 1;
    if (last <= 1) return false;
    return layerIndex !== 0 && layerIndex !== last;
}

/**
 * For a slice move, the face whose direction it follows.
 *
 * Z slices follow F, Y slices follow D, X slices follow L — matching the
 * reference asset's tooltips.
 */
function sliceFollowsFace(axis: Axis): string {
    if (axis === Axis.Z) return 'F';
    if (axis === Axis.Y) return 'D';
    return 'L';
}
