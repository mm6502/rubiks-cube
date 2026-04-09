import { Application } from '@/application';
import { CubeState, Face, ReadonlyCubie, Sticker, StickerId, Vector3 } from '@/cube/types';
import { FACE_BASIS } from '@/cube/utils/face-utils';
import { dot3, negate3 } from '@/cube/utils/math';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { LogLevel, logger } from '@/diagnostics/logger';
import { EventName, NavDirection, ViewRotation } from '@/types';

import { BasicVariant } from './basic-view';
import type { BasicViewInternalData } from './basic-view';

// ---------------------------------------------------------------------------
// Coordinate system (model space, right-handed)
// ---------------------------------------------------------------------------
//
//   +X = right   +Y = up   +Z = away from camera   (camera is at −Z, looking +Z)
//
// CSS projection flips both Y and Z relative to model space:
//   screen_y = −model_y,   screen_z = −model_z
//
// viewForward / viewRight / viewUp
// ---------------------------------------------------------------------------
// Axis-aligned unit vectors on BasicViewInternalData that describe the virtual
// camera orientation. They rotate on whole-cube Ctrl+Arrow moves.
//
//   viewForward — model-space axis that currently points toward the viewer
//   viewRight   — model-space axis that currently points screen-right
//   viewUp      — model-space axis that currently points screen-up
//
// Default orientation (Face.F toward viewer):
//   viewForward = { x:0, y:0, z:1 }  (+Z points at camera → front face visible)
//   viewRight   = { x:1, y:0, z:0 }
//   viewUp      = { x:0, y:1, z:0 }
//
// These are preferred over FACE_BASIS normals for navigation because FACE_BASIS
// gives canonical face-intrinsic directions, which break when a face is reached
// via a non-canonical rotation (e.g. arriving at Face.U by rotating from Face.R
// gives viewUp = {0,0,1}, not the canonical {0,1,0}).

// ---------------------------------------------------------------------------
// Cube sticker navigation using 3D model coordinates
// ---------------------------------------------------------------------------

/**
 * Returns the face adjacent to the cube when movement exits the boundary in
 * the given direction. Only called when one of tx/ty/tz is out of range.
 *
 * Each out-of-range axis maps unambiguously to a face:
 *   tx < 0             → Face.L  (left face, x=0 layer)
 *   tx >= cubeSize     → Face.R  (right face, x=max layer)
 *   ty < 0             → Face.D  (bottom face, y=0 layer)
 *   ty >= cubeSize     → Face.U  (top face, y=max layer)
 *   tz < 0             → Face.F  (front face, nearest to camera)
 *   tz >= cubeSize     → Face.B  (back face, furthest from camera)
 */
function getTransitionFace(tx: number, ty: number, tz: number, cubeSize: number): Face {
    if (tx < 0) return Face.L;
    if (tx >= cubeSize) return Face.R;
    if (ty < 0) return Face.D;
    if (ty >= cubeSize) return Face.U;
    if (tz < 0) return Face.F;
    return Face.B; // tz >= cubeSize
}

/**
 * Finds the adjacent sticker to select when navigating from the current cubie.
 *
 * Computes screen-aligned right/up directions from the current view orientation
 * and the CSS face placement geometry (F/B are Z-planes, U/D use rotateX(90deg),
 * L/R use rotateY(±90deg)), so navigation is always consistent with the viewed
 * orientation regardless of how the face was reached.
 *
 * - In-bounds: returns the neighbour cubie's sticker on the current front face.
 * - Out-of-bounds: returns the current cubie's sticker on the adjacent face.
 */
export function getAdjacentSticker(
    cubeState: CubeState,
    state: BasicViewInternalData,
    cubie: ReadonlyCubie,
    dir: NavDirection
): Sticker | undefined {
    const front = viewFrontFace(state);
    const n = cubeState.cubeSize;
    const pos = cubie.position;
    const vR = state.viewRight;
    const vU = state.viewUp;

    // Each CSS face element is placed in 3D at a different angle, which determines
    // how the view vectors (vR, vU) project onto the face's navigable (col, row) axes.
    //
    // Face placement geometry summary:
    //   F / B  — rendered in the Z-plane (no extra CSS rotation)
    //            col = model_x,  row = maxIndex − model_y
    //            ∴ screen_right ∝ +x,  screen_up ∝ −y
    //            faceRight = (vR.x, −vR.y, 0),  faceUp = (−vU.x, vU.y, 0)
    //
    //   U / D  — rendered in the X-Z plane (CSS rotateX 90°)
    //            col = model_x,  row = maxIndex − model_z
    //            ∴ screen_right ∝ +x,  screen_up ∝ −z  (after the X-rotation)
    //            faceRight = (vR.x, 0, −vR.z),  faceUp = (−vU.x, 0, vU.z)
    //
    //   L / R  — rendered in the Y-Z plane (CSS rotateY ±90°)
    //            col = model_z,  row = maxIndex − model_y
    //            ∴ screen_right ∝ +z,  screen_up ∝ −y  (L face; R face mirrors z)
    //            faceRight = (0, −vR.y, −vR.z),  faceUp = (0, vU.y, vU.z)
    //
    // The || 0 on negated components converts −0 to 0 for clean arithmetic.
    let faceRight: Vector3;
    let faceUp: Vector3;
    switch (front) {
        case Face.F:
        case Face.B:
            // Z-plane: col=x, row=maxIndex-y → right=(vR.x,−vR.y,0), up=(−vU.x,vU.y,0)
            faceRight = { x: vR.x, y: -vR.y || 0, z: 0 };
            faceUp = { x: -vU.x || 0, y: vU.y, z: 0 };
            break;
        case Face.U:
        case Face.D:
            // X-Z plane (rotateX 90°): col=x, row=maxIndex-z → right=(vR.x,0,−vR.z), up=(−vU.x,0,vU.z)
            faceRight = { x: vR.x, y: 0, z: -vR.z || 0 };
            faceUp = { x: -vU.x || 0, y: 0, z: vU.z };
            break;
        default: // Face.L, Face.R
            // Y-Z plane (rotateY ±90°): col=z, row=maxIndex-y → right=(0,−vR.y,−vR.z), up=(0,vU.y,vU.z)
            faceRight = { x: 0, y: -vR.y || 0, z: -vR.z || 0 };
            faceUp = { x: 0, y: vU.y, z: vU.z };
            break;
    }

    const d =
        dir === NavDirection.Up
            ? faceUp
            : dir === NavDirection.Down
              ? negate3(faceUp)
              : dir === NavDirection.Right
                ? faceRight
                : negate3(faceRight);

    const tx = pos.x + d.x;
    const ty = pos.y + d.y;
    const tz = pos.z + d.z;

    const stickerOnFace = (c: ReadonlyCubie, face: Face): Sticker | undefined => {
        for (const sticker of c.stickers.values()) {
            if (sticker.currentFace === face) return sticker;
        }
        return undefined;
    };

    if (tx >= 0 && tx < n && ty >= 0 && ty < n && tz >= 0 && tz < n) {
        // Neighbor cubie on the same face
        const neighbor = CubeStateUtils.getCubieAtPosition(cubeState, { x: tx, y: ty, z: tz });
        if (!neighbor) return undefined;
        return stickerOnFace(neighbor, front);
    }

    // Going over an edge — same cubie, different face
    const targetFace = getTransitionFace(tx, ty, tz, n);
    return stickerOnFace(cubie, targetFace);
}

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

/**
 * Returns true when the keyboard event is a bare arrow key (no modifiers).
 */
export function isNavigationKey(event: KeyboardEvent): boolean {
    return mapKeyToDir(event) !== undefined;
}

function mapKeyToDir(event: KeyboardEvent): NavDirection | undefined {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return undefined;

    switch (event.key) {
        case 'ArrowUp':
            return NavDirection.Up;
        case 'ArrowDown':
            return NavDirection.Down;
        case 'ArrowLeft':
            return NavDirection.Left;
        case 'ArrowRight':
            return NavDirection.Right;
        default:
            return undefined;
    }
}

// ---------------------------------------------------------------------------
// Sticker navigation
// ---------------------------------------------------------------------------

/**
 * Moves the keyboard selection in the direction indicated by the arrow key.
 *
 * @param preview - When true, checks feasibility without emitting events.
 * @param onSelected - Called with the newly selected sticker id.
 * @param onRotated - Optional callback invoked once per elementary view rotation
 *   INSTEAD of the internal standalone mutators. Use this to route rotations
 *   through class methods that handle rendering and linked-view sync.
 * @returns true if navigation succeeded (or would succeed in preview mode).
 */
export function navigate(
    event: KeyboardEvent,
    preview: boolean,
    state: BasicViewInternalData,
    onSelected?: (id: StickerId) => void,
    onRotated?: (r: ViewRotation) => void
): boolean {
    const dir = mapKeyToDir(event);
    if (!dir) return false;

    if (!state.currentSelected || !state.model) return false;

    const cubeState = state.model.getCurrentState();
    const currentSticker = CubeStateUtils.getStickerById(
        cubeState,
        state.currentSelected as StickerId
    );
    if (!currentSticker) return false;

    const cubie = CubeStateUtils.getCubieById(cubeState, currentSticker.cubieId) as ReadonlyCubie;
    if (!cubie) return false;

    const stickerFace = currentSticker.currentFace;

    // Phase 1: selection is not on the current front face.
    // Rotate the view projection to bring the selection's face to front.
    // Selection does not move; the key is fully consumed.
    if (stickerFace !== viewFrontFace(state)) {
        if (!preview) {
            rotateViewToFace(state, stickerFace, onRotated);
        }
        return true;
    }

    // Phase 2: selection is on the front face — navigate in model-space.
    const newSticker = getAdjacentSticker(cubeState, state, cubie, dir);
    if (!newSticker) return false;
    if (newSticker.id === currentSticker.id) return false;

    if (!preview) {
        if (newSticker.currentFace !== stickerFace) {
            rotateViewToFace(state, newSticker.currentFace, onRotated);
        }
        onSelected?.(newSticker.id);
    }

    return true;
}

// ---------------------------------------------------------------------------
// View-front-face helpers
// ---------------------------------------------------------------------------

/**
 * Returns the model Face that is currently facing the viewer,
 * based on state.viewForward.
 *
 * viewForward is the model-space axis pointing toward the camera:
 *   z=+1 → Face.F  (front face, normal = −Z outward)
 *   z=−1 → Face.B  (back face,  normal = +Z outward)
 *   x=+1 → Face.R  (right face, normal = +X outward)
 *   x=−1 → Face.L  (left face,  normal = −X outward)
 *   y=+1 → Face.D  (CSS +Y = visual downward → bottom face)
 *   y=−1 → Face.U  (CSS −Y = visual upward   → top face)
 *
 * The Y mapping is inverted because the CSS projection flips the Y axis:
 * model +Y is rendered at a lower screen position, so the top of the cube
 * (model +Y = Face.U) is reached by viewForward pointing −Y.
 */
export function viewFrontFace(state: BasicViewInternalData): Face {
    const v = state.viewForward;
    if (v.z === 1) return Face.F;
    if (v.z === -1) return Face.B;
    if (v.x === 1) return Face.R;
    if (v.x === -1) return Face.L;
    if (v.y === 1) return Face.D; // CSS +Y is visual-down = Face.D
    if (v.y === -1) return Face.U; // CSS -Y is visual-up  = Face.U
    return Face.F; // fallback — viewForward should always be axis-aligned
}

/**
 * Rotates the view projection so that targetFace faces the viewer.
 * Uses at most two rotateView calls (back face requires two).
 * No cube model moves are emitted.
 *
 * @param onStep - Optional callback invoked once per elementary rotation step
 *   INSTEAD of the internal standalone mutators. When provided, the caller is
 *   responsible for applying the rotation (e.g. via a class method that also
 *   handles rendering and linked-view synchronisation).
 */
export function rotateViewToFace(
    state: BasicViewInternalData,
    targetFace: Face,
    onStep?: (r: ViewRotation) => void
): void {
    // The model coordinate system flips Y and Z relative to the CSS/screen projection,
    // so the viewForward vector when a face is front equals { x: n.x, y: -n.y, z: -n.z }
    // where n is FACE_BASIS[face].normal (the outward geometric normal).
    const n = FACE_BASIS[targetFace].normal;
    const faceViewDir: Vector3 = { x: n.x, y: -n.y || 0, z: -n.z || 0 };
    const { viewForward: vF, viewRight: vR, viewUp: vU } = state;

    const applyLeft = (): void => (onStep ? onStep(ViewRotation.Left) : rotateViewLeft(state));
    const applyRight = (): void => (onStep ? onStep(ViewRotation.Right) : rotateViewRight(state));
    const applyUp = (): void => (onStep ? onStep(ViewRotation.Up) : rotateViewUp(state));
    const applyDown = (): void => (onStep ? onStep(ViewRotation.Down) : rotateViewDown(state));

    if (dot3(faceViewDir, vF) === 1) {
        // Already facing front — no-op
    } else if (dot3(faceViewDir, vF) === -1) {
        // Directly behind — rotate 180° horizontally
        applyLeft();
        applyLeft();
    } else if (dot3(faceViewDir, vR) === 1) {
        // Right face comes to front
        applyLeft();
    } else if (dot3(faceViewDir, vR) === -1) {
        // Left face comes to front
        applyRight();
    } else if (dot3(faceViewDir, vU) === 1) {
        // Top face comes to front
        applyUp();
    } else if (dot3(faceViewDir, vU) === -1) {
        // Bottom face comes to front
        applyDown();
    }
}

// ---------------------------------------------------------------------------
// Default orientation vectors
// ---------------------------------------------------------------------------

/**
 * Returns the default orientation vectors for a given variant.
 * front: cube model +Z faces viewer, +X is screen-right, +Y is screen-up.
 * back:  cube model -Z faces viewer (showing the back face), -X is screen-right.
 */
export function getDefaultVectors(variant: BasicVariant): {
    viewRight: Vector3;
    viewUp: Vector3;
    viewForward: Vector3;
} {
    if (variant === 'back') {
        return {
            viewRight: { x: -1, y: 0, z: 0 },
            viewUp: { x: 0, y: 1, z: 0 },
            viewForward: { x: 0, y: 0, z: -1 },
        };
    }
    return {
        viewRight: { x: 1, y: 0, z: 0 },
        viewUp: { x: 0, y: 1, z: 0 },
        viewForward: { x: 0, y: 0, z: 1 },
    };
}

// ---------------------------------------------------------------------------
// View rotation actions — mutate state via vector swaps (no Euler angles).
// Callers are responsible for re-rendering.
//
// Definitions (from viewer's perspective):
//   Ctrl+Left  — front goes left,   right  becomes front
//   Ctrl+Right — front goes right,  left   becomes front
//   Ctrl+Up    — front goes up,     bottom becomes front
//   Ctrl+Down  — front goes down,   top    becomes front
// ---------------------------------------------------------------------------

export function rotateViewLeft(state: BasicViewInternalData): void {
    // vF_new = vR,  vR_new = -vF,  vU unchanged
    const { viewForward: vF, viewRight: vR } = state;
    state.viewForward = vR;
    state.viewRight = negate3(vF);
    logState(state, 'left');
}

export function rotateViewRight(state: BasicViewInternalData): void {
    // vF_new = -vR, vR_new = vF,   vU unchanged
    const { viewForward: vF, viewRight: vR } = state;
    state.viewForward = negate3(vR);
    state.viewRight = vF;
    logState(state, 'right');
}

export function rotateViewUp(state: BasicViewInternalData): void {
    // vF_new = vU,  vU_new = -vF,  vR unchanged
    // Front goes up (CSS -Y = visual top), visual-bottom comes forward.
    const { viewForward: vF, viewUp: vU } = state;
    state.viewForward = vU;
    state.viewUp = negate3(vF);
    logState(state, 'up');
}

export function rotateViewDown(state: BasicViewInternalData): void {
    // vF_new = -vU, vU_new = vF,   vR unchanged
    // Front goes down (CSS +Y = visual bottom), visual-top comes forward.
    const { viewForward: vF, viewUp: vU } = state;
    state.viewForward = negate3(vU);
    state.viewUp = vF;
    logState(state, 'down');
}

/**
 * Resets all view rotations to the default orientation for this variant.
 * Preserves isTilted and isPitched (cosmetic-only flags).
 */
export function resetView(state: BasicViewInternalData): void {
    const defaults = getDefaultVectors(state.variant);
    state.viewRight = defaults.viewRight;
    state.viewUp = defaults.viewUp;
    state.viewForward = defaults.viewForward;
    logState(state, 'reset');
}

/**
 * Emits whole-cube rotation moves to align the model to the current view
 * orientation, then resets the view vectors to the default identity.
 *
 * The move sequence is derived from a lookup over all 24 possible (vF, vU)
 * orientations. After emitting, the view is reset to identity so the rendered
 * transforms go back to zero without any visual jump.
 */
export function alignCubeToView(state: BasicViewInternalData): void {
    const moves = movesForOrientation(state.viewForward, state.viewUp);
    for (const notation of moves) {
        Application.eventBus.emit(EventName.MOVE_REQUESTED, {
            moveNotation: notation,
            viewId: state.viewType,
            tentative: false,
        });
    }
    resetView(state);
    logState(state, 'alignCubeToView');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vecKey(v: Vector3): string {
    return `${v.x},${v.y},${v.z}`;
}

/**
 * Returns the sequence of whole-cube moves (x/x'/y/y'/z/z'/y2/z2) needed to
 * bring the orientation described by (vForward, vUp) to the identity
 * orientation (vF=+Z, vU=+Y).
 *
 * Derivation:
 *   Step 1 — y/x moves to bring vForward to +Z.
 *   Step 2 — z move to fix vUp to +Y.
 *
 * Move semantics (rotatePosition3D convention, matching WCA):
 *   y  = Ry(-90): +X→+Z, +Z→-X  (same direction as U face)
 *   y' = Ry(+90): +X→-Z, +Z→+X
 *   x  = Rx(+90): +Y→+Z, +Z→-Y  (same direction as R face)
 *   x' = Rx(-90): +Y→-Z, -Y→+Z
 *   z  = Rz(+90): +X→+Y, +Y→-X  (same direction as F face)
 *   z' = Rz(-90): +X→-Y, +Y→+X
 */
function movesForOrientation(vF: Vector3, vU: Vector3): string[] {
    // Map (vForward key, vUp key) → move sequence
    type Key = string;
    const table: Map<Key, string[]> = new Map([
        // vF = +Z (front, no step-1 move needed)
        [`${vecKey({ x: 0, y: 0, z: 1 })}_${vecKey({ x: 0, y: 1, z: 0 })}`, []],
        [`${vecKey({ x: 0, y: 0, z: 1 })}_${vecKey({ x: 1, y: 0, z: 0 })}`, ['z']],
        [`${vecKey({ x: 0, y: 0, z: 1 })}_${vecKey({ x: 0, y: -1, z: 0 })}`, ['z2']],
        [`${vecKey({ x: 0, y: 0, z: 1 })}_${vecKey({ x: -1, y: 0, z: 0 })}`, ["z'"]],
        // vF = +X (right face toward viewer); step-1: y
        [`${vecKey({ x: 1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 1, z: 0 })}`, ['y']],
        [`${vecKey({ x: 1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 0, z: 1 })}`, ['y', "z'"]],
        [`${vecKey({ x: 1, y: 0, z: 0 })}_${vecKey({ x: 0, y: -1, z: 0 })}`, ['y', 'z2']],
        [`${vecKey({ x: 1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 0, z: -1 })}`, ['y', 'z']],
        // vF = -Z (back face toward viewer); step-1: y2
        [`${vecKey({ x: 0, y: 0, z: -1 })}_${vecKey({ x: 0, y: 1, z: 0 })}`, ['y2']],
        [`${vecKey({ x: 0, y: 0, z: -1 })}_${vecKey({ x: 1, y: 0, z: 0 })}`, ['y2', "z'"]],
        [`${vecKey({ x: 0, y: 0, z: -1 })}_${vecKey({ x: 0, y: -1, z: 0 })}`, ['y2', 'z2']],
        [`${vecKey({ x: 0, y: 0, z: -1 })}_${vecKey({ x: -1, y: 0, z: 0 })}`, ['y2', 'z']],
        // vF = -X (left face toward viewer); step-1: y'
        [`${vecKey({ x: -1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 1, z: 0 })}`, ["y'"]],
        [`${vecKey({ x: -1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 0, z: 1 })}`, ["y'", 'z']],
        [`${vecKey({ x: -1, y: 0, z: 0 })}_${vecKey({ x: 0, y: -1, z: 0 })}`, ["y'", 'z2']],
        [`${vecKey({ x: -1, y: 0, z: 0 })}_${vecKey({ x: 0, y: 0, z: -1 })}`, ["y'", "z'"]],
        // vF = +Y (top face toward viewer); step-1: x
        [`${vecKey({ x: 0, y: 1, z: 0 })}_${vecKey({ x: 0, y: 0, z: -1 })}`, ['x']],
        [`${vecKey({ x: 0, y: 1, z: 0 })}_${vecKey({ x: -1, y: 0, z: 0 })}`, ['x', "z'"]],
        [`${vecKey({ x: 0, y: 1, z: 0 })}_${vecKey({ x: 0, y: 0, z: 1 })}`, ['x', 'z2']],
        [`${vecKey({ x: 0, y: 1, z: 0 })}_${vecKey({ x: 1, y: 0, z: 0 })}`, ['x', 'z']],
        // vF = -Y (bottom face toward viewer); step-1: x'
        [`${vecKey({ x: 0, y: -1, z: 0 })}_${vecKey({ x: 0, y: 0, z: 1 })}`, ["x'"]],
        [`${vecKey({ x: 0, y: -1, z: 0 })}_${vecKey({ x: 1, y: 0, z: 0 })}`, ["x'", 'z']],
        [`${vecKey({ x: 0, y: -1, z: 0 })}_${vecKey({ x: 0, y: 0, z: -1 })}`, ["x'", 'z2']],
        [`${vecKey({ x: 0, y: -1, z: 0 })}_${vecKey({ x: -1, y: 0, z: 0 })}`, ["x'", "z'"]],
    ]);

    const key: Key = `${vecKey(vF)}_${vecKey(vU)}`;
    return table.get(key) ?? [];
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

function logState(state: BasicViewInternalData, action?: string): void {
    const scope = logger.groupScoped('BasicCubeNavigation View Orientation', LogLevel.DEBUG);
    if (!scope) return;

    try {
        scope.debug(`After action: ${action}`);
        scope.debug(
            `vF: (${state.viewForward.x},${state.viewForward.y},${state.viewForward.z})` +
                ` vU: (${state.viewUp.x},${state.viewUp.y},${state.viewUp.z})` +
                ` vR: (${state.viewRight.x},${state.viewRight.y},${state.viewRight.z})`
        );
        scope.debug(`isTilted: ${state.isTilted}, isPitched: ${state.isPitched}`);
    } finally {
        scope.groupEnd();
    }
}
