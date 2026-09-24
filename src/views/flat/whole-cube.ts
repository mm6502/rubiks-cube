/**
 * Whole-cube rotation inference for the Flat view.
 *
 * Maps a drag's screen-space displacement to a whole-cube rotation notation
 * (`x`/`x'`/`y`/`y'`, promoted to their `2` variants past a distance threshold).
 *
 * This is the logic that previously lived in `legend-drag.ts` as
 * `inferLegendMove` / `inferLegendNotation`. The "legend" name described where
 * the gesture happened to be wired, not what the logic meant: the mapping is a
 * property of the Flat view's fixed layout orientation (`isRotated`), so the
 * same screen direction means the same cube rotation whether the drag starts on
 * the legend, on the empty background, or anywhere else in the view.
 *
 * Deliberately view-local: this direction mapping is specific to the Flat layout
 * (its sign convention and its `isRotated` flag), and does not belong in the
 * shared `@/interaction/move-inference` module, which has its own, different
 * whole-cube policy for other views.
 */
import { toFar } from '@/interaction/move-inference';

/**
 * Map a drag's screen-space displacement to a whole-cube quarter turn.
 *
 * Not rotated (desktop):
 *   left (negative deltaX) → `y`,   right (positive deltaX) → `y'`
 *   up (negative deltaY) → `x`,     down (positive deltaY) → `x'`
 *
 * Rotated (mobile, layout turned -90°):
 *   left → `x'`, right → `x`, up → `y`, down → `y'`
 *
 * A diagonal falls to whichever axis is larger (strictly), so at exactly 45° the
 * vertical branch wins. There is deliberately no `z` branch: the Flat legend and
 * background gestures only ever rotate around the screen's horizontal/vertical
 * axes.
 *
 * @param deltaX - Horizontal displacement (px, positive = right).
 * @param deltaY - Vertical displacement (px, positive = down).
 * @param isRotated - Whether the Flat layout is rotated 90° (mobile).
 */
export function inferWholeCubeDirection(
    deltaX: number,
    deltaY: number,
    isRotated: boolean
): string {
    if (isRotated) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            return deltaX > 0 ? 'x' : "x'";
        }
        return deltaY > 0 ? "y'" : 'y';
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        return deltaX > 0 ? "y'" : 'y';
    }
    return deltaY > 0 ? "x'" : 'x';
}

/**
 * The notation a whole-cube drag asks for, at the distance it was dragged.
 *
 * A drag past the far-drag threshold means the doubled rotation, spelled as the
 * `2` variant of the direction's quarter turn — `y` → `y2`, `x'` → `x2'`. This
 * is the same promotion the layer drags in this view already make, through the
 * same helper, so the two gesture families cannot drift apart.
 */
export function inferWholeCubeNotation(
    deltaX: number,
    deltaY: number,
    isRotated: boolean,
    farDragThresholdPx: number
): string {
    const base = inferWholeCubeDirection(deltaX, deltaY, isRotated);
    const distance = Math.hypot(deltaX, deltaY);
    return distance > farDragThresholdPx ? toFar(base) : base;
}
