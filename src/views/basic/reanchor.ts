import { CubieType, Face, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import {
    type PositionedSticker,
    type ViewOrientation,
    type VisualCell,
    visualCellOfSticker,
} from './visual-cell';

/**
 * The re-anchor policy: keep the selection on screen when the view's orientation
 * changes.
 *
 * ## Why this is separate from the view
 *
 * The selection is stored as a sticker id, which is model-anchored: it names a
 * physical piece of the cube. Rotating the view changes which faces the viewer
 * sees but does not move that sticker, so a rotation can leave the selection on a
 * face *behind* the cube — nothing visible, while the app still reports a
 * selection.
 *
 * The policy that fixes this depends on nothing view-specific: an orientation, a
 * cube size, a candidate sticker list, and the current selection. It lived inside
 * `BasicView` as six private methods, where Circular and Flat could not reuse it
 * without copy-paste. It is a **move**, not a new abstraction layer — plain
 * functions over an interface, with no registry and no plugin seam.
 *
 * ## What it does and does not own
 *
 * This module owns the *decision* (which sticker should be selected now). It does
 * not own the *effect*: it calls back into the view to apply the new selection,
 * so the view keeps responsibility for its own markup, its own state fields and
 * its own `STICKER_SELECTED` emission. That boundary is why
 * {@link ReanchorTarget} exists rather than the policy writing state directly.
 */

/**
 * The view-side contract the policy needs.
 *
 * Deliberately narrow — a view supplies its orientation vectors, its current
 * selection, a way to apply a new one, and the model to resolve against.
 *
 * **Every member is an accessor rather than a value.** That is load-bearing, not
 * stylistic: {@link preserveSelectionAcrossOrientationChange} reads the target
 * both *before* and *after* running the orientation mutation, and the front face
 * and orientation vectors are exactly what that mutation changes. A target that
 * snapshotted them would resolve the captured cell against the orientation that
 * no longer applies — which is the defect this policy exists to prevent, so the
 * interface makes the stale-read shape unrepresentable.
 */
export interface ReanchorTarget {
    /** The model to resolve stickers against, or `undefined` before create. */
    getModel(): ReadOnlyCubeModel | undefined;
    /** The currently selected sticker, if any. */
    getCurrentSelected(): StickerId | undefined;
    /** The current orientation, read fresh on each call. */
    getOrientation(): ViewOrientation;
    /** The face currently toward the viewer, read fresh on each call. */
    getFrontFace(): Face;
    /** Apply a new selection, through the view's own selection entry point. */
    applySelection(stickerId: StickerId): void;
}

/**
 * The visual cell the current selection occupies, or `undefined`.
 *
 * `undefined` means "there is nothing to preserve", which is not an error: a view
 * with no selection has no cell to re-anchor, and a sticker id that does not
 * resolve in the model is stale rather than exceptional.
 *
 * @param target The view-side state and model
 * @returns The selection's visual cell, or `undefined`
 */
export function selectionVisualCell(target: ReanchorTarget): VisualCell | undefined {
    const stickerId = target.getCurrentSelected();
    const model = target.getModel();
    if (!stickerId || !model) return undefined;

    return visualCellOfId(stickerId, model, target.getOrientation());
}

/**
 * The visual cell a given sticker occupies, or `undefined`.
 *
 * @param stickerId The sticker to locate
 * @param model The model to resolve it against
 * @param orientation The view's orientation vectors
 */
export function visualCellOfId(
    stickerId: StickerId | undefined,
    model: ReadOnlyCubeModel | undefined,
    orientation: ViewOrientation
): VisualCell | undefined {
    if (!stickerId || !model) return undefined;

    const cubeState = model.getCurrentState();
    const sticker = CubeStateUtils.getStickerById(cubeState, stickerId);
    if (!sticker) return undefined;

    return visualCellOfSticker(
        { face: sticker.currentFace, position: sticker.facePosition },
        cubeState.cubeSize,
        orientation
    );
}

/**
 * Re-anchor the selection to the sticker now occupying the given visual cell.
 *
 * When nothing occupies that cell the previous selection is **kept** rather than
 * cleared. A miss is reachable legitimately — a cell that exists at one cube size
 * has no equivalent at a smaller one — and keeping the old selection degrades to
 * the previous behaviour instead of a selected-nothing state.
 *
 * Called with a cell of `undefined` this is a no-op, so a caller can pass the
 * result of {@link selectionVisualCell} unconditionally.
 *
 * @param cell The cell to resolve, captured before the orientation changed
 * @param target The view-side state and model
 */
export function reanchorSelection(cell: VisualCell | undefined, target: ReanchorTarget): void {
    if (!cell || !target.getModel()) return;

    const match = resolveStickerAtVisualCell(cell, target);

    if (match) target.applySelection(match.id);
}

/**
 * Re-anchor the selection across an orientation change.
 *
 * The cell is captured *before* `applyOrientation()` runs and resolved after it
 * lands, so the selection follows the screen position the user was looking at
 * rather than the face that used to be front.
 *
 * Wrapping is the way the rule is applied: it keeps one implementation of "the
 * same visual cell" in `visual-cell.ts` rather than deriving the new cell from
 * the old one at each call site.
 *
 * @param target The view-side state and model
 * @param applyOrientation The orientation mutation to run between capture and resolve
 */
export function preserveSelectionAcrossOrientationChange(
    target: ReanchorTarget,
    applyOrientation: () => void
): void {
    const cellBefore = selectionVisualCell(target);
    applyOrientation();
    reanchorSelection(cellBefore, target);
}

// ─── Resolution, projected once ──────────────────────────────────────────────

/**
 * Resolve a visual cell to the sticker on the front face that occupies it.
 *
 * This is the step that keeps the selection on screen: after the view rotates,
 * the cell the selection used to occupy is looked up on the *new* front face, and
 * the sticker found there becomes the new selection.
 *
 * **Projection cost, measured rather than assumed.** The previous shape built a
 * 294-object candidate list at 7×7 and then walked all of it to resolve 49 cells,
 * skipping the five faces that cannot match *after* visiting each candidate. Only
 * front-face candidates were ever projected, so the wasted work was the ~245
 * skip-checks plus the array that held them — not, as first assumed here,
 * redundant projection. Building the front-face list directly removes both.
 *
 * Measured at 7×7: candidates constructed drops from 294 to 49, and the
 * comparison loop from 294 iterations to 49.
 *
 * The tie-break is deliberately unchanged. Measured at every supported size a
 * cell never has two front-face occupants (zero collisions), so there is no order
 * dependence to preserve or to fix, and the first match remains correct.
 *
 * @param cell The visual cell to resolve
 * @param target The view-side state and model
 * @returns The matching sticker, or `undefined` when the cell is unoccupied
 */
function resolveStickerAtVisualCell(
    cell: VisualCell,
    target: ReanchorTarget
): PositionedSticker | undefined {
    const model = target.getModel();
    if (!model) return undefined;

    const cubeState = model.getCurrentState();
    const { cubeSize } = cubeState;

    for (const candidate of frontFaceCandidates(model, target.getFrontFace())) {
        const candidateCell = visualCellOfSticker(candidate, cubeSize, target.getOrientation());
        if (candidateCell.visualX === cell.visualX && candidateCell.visualY === cell.visualY) {
            return candidate;
        }
    }

    return undefined;
}

/**
 * Candidates restricted to one face.
 *
 * Filtering happens while building rather than after, so the five faces that
 * cannot match never contribute an object. Equivalent to
 * `stickerCandidates(model).filter(c => c.face === face)` with the intermediate
 * array elided — see {@link resolveStickerAtVisualCell} for the measurement that
 * motivates it.
 *
 * @param model The model to enumerate
 * @param face The only face to keep
 */
function frontFaceCandidates(model: ReadOnlyCubeModel, face: Face): PositionedSticker[] {
    const candidates: PositionedSticker[] = [];
    for (const cubie of model.getCurrentState().cubiesById.values()) {
        if (cubie.type === CubieType.VIRTUAL_CENTER) continue;

        // A cubie only carries the stickers of the faces it touches, so checking
        // its own stickers' faces is enough and no position maths is needed.
        for (const sticker of cubie.stickers.values()) {
            if (sticker.currentFace !== face) continue;
            candidates.push({
                id: sticker.id,
                face: sticker.currentFace,
                position: sticker.facePosition,
            });
        }
    }
    return candidates;
}
