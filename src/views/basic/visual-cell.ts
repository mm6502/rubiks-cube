import { Face, StickerId, Vector3 } from '@/cube/types';
import { facePositionTo3D } from '@/cube/utils/sticker-position';

/**
 * Visual-cell resolution for the Basic view.
 *
 * ## Why this exists
 *
 * The view's selection is stored as a *sticker id*, which is model-anchored: it
 * names a physical piece of the cube. Rotating the view changes which faces face
 * the viewer but does not change that sticker, so a rotation can leave the
 * selection on a face behind the cube — the user sees nothing, while the app
 * still reports a selection.
 *
 * To keep the selection visible across a rotation, what must be preserved is its
 * *visual cell*: where it sits on screen. This module converts between a sticker
 * and that visual cell so a rotation can re-anchor the selection to whatever
 * sticker now occupies the same cell on the newly-front face.
 *
 * ## Why not just keep the face position
 *
 * A sticker's `facePosition` index is **not** a screen cell. Face bases orient
 * differently relative to the viewer — on `F` the column runs screen-right, on
 * `R` it runs screen-left — so copying an index onto a different face lands on
 * the mirrored side. The observable consequence: with the top-left of `F`
 * selected, rotating so `R` becomes front keeps the selection **top-left**, not
 * top-right. Copying the index would put it top-right.
 *
 * ## The rule
 *
 * A cell is the sticker's offset from the cube's centre, projected onto the two
 * screen axes:
 *
 *     visualX = dot(position − centre, viewRight)
 *     visualY = −dot(position − centre, viewUp)
 *
 * `viewRight` / `viewUp` are model-space axes that point screen-right and
 * screen-up (see the coordinate notes in `navigation.ts`). The third axis — the
 * one whose face became front — is free, which is exactly what allows a rotation
 * to slide the selection along it while the visual position is held.
 *
 * Both components are **signed and must stay signed**. Taking magnitudes would
 * discard the mirroring above and reintroduce the bug.
 *
 * The vertical component is negated so the cell follows CSS screen orientation,
 * where Y grows downward and therefore matches the projection convention already
 * documented in `navigation.ts`. A sticker above the cube's centre consequently
 * has a *negative* `visualY`.
 *
 * Zero is normalised so a sticker lying exactly on a centre line yields `0` rather
 * than `-0` — the comparison is exact, and `-0` and `0` are not equal under
 * `Object.is`.
 *
 * ## Precision
 *
 * Comparisons are exact. Positions are integral half-steps and the view vectors
 * are axis-aligned units, so the projection lands exactly on half-step values —
 * measured deviation is zero at every supported size (2 through 7). An epsilon
 * would add nothing except the ability to hide a genuine mismatch behind a fuzzy
 * match.
 */

/** A signed visual cell: offsets along the screen-right and screen-up axes. */
export type VisualCell = {
    readonly visualX: number;
    readonly visualY: number;
};

/** The view orientation this module resolves against. */
export type ViewOrientation = {
    readonly viewRight: Vector3;
    readonly viewUp: Vector3;
};

/** A sticker paired with the position it occupies on the cube. */
export type PositionedSticker = {
    readonly id: StickerId;
    readonly face: Face;
    readonly position: number;
};

/** Dot product of a position offset with a model-space axis. */
function dot(position: Vector3, axis: Vector3): number {
    return position.x * axis.x + position.y * axis.y + position.z * axis.z;
}

/**
 * Collapse `-0` to `0`.
 *
 * Comparison here is exact, and `Object.is(-0, 0)` is `false`. A sticker lying
 * exactly on the centre line projects to zero, and the negation below would turn
 * that into `-0` on one axis while the other axis stayed `0` — so two cells that
 * are genuinely identical would compare unequal and a resolution would miss.
 */
function normalizeZero(value: number): number {
    return value === 0 ? 0 : value;
}

/** The model-space centre of a cube, as a half-step coordinate. */
function cubeCentre(cubeSize: number): Vector3 {
    const mid = (cubeSize - 1) / 2;
    return { x: mid, y: mid, z: mid };
}

/**
 * The visual cell a 3D position occupies, given the current view orientation.
 *
 * @param position The sticker's 3D position on the cube
 * @param cubeSize The size of the cube (edge length)
 * @param orientation The view's orientation vectors
 * @returns The signed screen-space cell
 */
export function visualCellOf(
    position: Vector3,
    cubeSize: number,
    orientation: ViewOrientation
): VisualCell {
    const centre = cubeCentre(cubeSize);
    const offset: Vector3 = {
        x: position.x - centre.x,
        y: position.y - centre.y,
        z: position.z - centre.z,
    };

    return {
        visualX: normalizeZero(dot(offset, orientation.viewRight)),
        // CSS screen Y grows downward; model Y grows upward. So a sticker above
        // the centre reads as a NEGATIVE visualY, matching the projection
        // convention documented in `navigation.ts` (`screen_y = -model_y`).
        visualY: normalizeZero(-dot(offset, orientation.viewUp)),
    };
}

/**
 * The visual cell occupied by a sticker identified by face and face position.
 *
 * Convenience wrapper over {@link visualCellOf} for callers that hold the
 * model's own sticker addressing rather than a 3D position.
 */
export function visualCellOfSticker(
    sticker: { readonly face: Face; readonly position: number },
    cubeSize: number,
    orientation: ViewOrientation
): VisualCell {
    return visualCellOf(
        facePositionTo3D(sticker.position, sticker.face, cubeSize),
        cubeSize,
        orientation
    );
}

/**
 * Find the sticker on the current front face that occupies a given visual cell.
 *
 * This is the step that keeps the selection on screen: after the view rotates,
 * the cell the selection used to occupy is looked up on the *new* front face, and
 * the sticker found there becomes the new selection.
 *
 * Returns `undefined` when no candidate matches — the caller is expected to keep
 * the previous selection rather than clearing it, so a resolution miss degrades
 * to the old behaviour instead of a selected-nothing state. A miss is reachable
 * legitimately: a cell that exists at one cube size has no equivalent at a
 * smaller size.
 *
 * @param cell The visual cell to resolve
 * @param frontFace The face currently facing the viewer
 * @param candidates The stickers to search (typically the front face's cells)
 * @param cubeSize The size of the cube
 * @param orientation The view's orientation vectors
 * @returns The matching sticker, or `undefined` when the cell is unoccupied
 */
export function stickerAtVisualCell(
    cell: VisualCell,
    frontFace: Face,
    candidates: readonly PositionedSticker[],
    cubeSize: number,
    orientation: ViewOrientation
): PositionedSticker | undefined {
    for (const candidate of candidates) {
        if (candidate.face !== frontFace) continue;

        const candidateCell = visualCellOfSticker(candidate, cubeSize, orientation);
        if (candidateCell.visualX === cell.visualX && candidateCell.visualY === cell.visualY) {
            return candidate;
        }
    }

    return undefined;
}
