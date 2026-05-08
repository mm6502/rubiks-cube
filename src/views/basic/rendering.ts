import { Face, ReadOnlyCubeModel, Size2D, Vector3, resolveCubeColor } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils';
import { computeAvailableContentSize } from '@/cube/utils/view-utils';
import { MoveExecutedEvent } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { BASIC_VIEW_ANGLES, BASIC_VIEW_SCALE } from './constants';

/**
 * Maps an axis-aligned unit vector expressed in **CSS 3D space** to the
 * corresponding cube Face.
 *
 * Differs from `vectorToFace` only on the Y axis: in the CSS 3D cube layout
 * the Face.U element is positioned at CSS −Y (visual up) and Face.D at CSS +Y
 * (visual down), which is the opposite of the model convention where Face.U
 * lives at model +Y.
 *
 * Convention: CSS +X=R, CSS −X=L, CSS +Y=D, CSS −Y=U, CSS +Z=F, CSS −Z=B.
 */
function faceFromCSSDir(v: Vector3): Face {
    if (v.x === 1) return Face.R;
    if (v.x === -1) return Face.L;
    if (v.y === 1) return Face.D; // CSS +Y is visual-down = model Down face
    if (v.y === -1) return Face.U; // CSS −Y is visual-up  = model Up   face
    if (v.z === 1) return Face.F;
    return Face.B;
}

/**
 * Updates the CSS transform of the cube element based on current rotation values.
 *
 * The user-controlled orientation is expressed as three orthogonal unit vectors
 * (viewRight, viewUp, viewForward) stored in model space.  These are combined
 * into a CSS matrix3d (column-major) so the cube always shows exactly the right
 * face toward the viewer, with no accumulated floating-point error.
 *
 * Base aesthetic angles (isTilted / isPitched) are applied first as simple
 * rotateX / rotateY so the cube sits at a comfortable viewing angle.
 */
export function updateRotation(state: BasicViewInternalData, skipAnimation?: boolean): void {
    if (!state.cubeElement) return;

    const baseX = state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X;
    const baseY = state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y;

    // Build a column-major CSS matrix3d from the orientation vectors.
    // R (rows = vR, vU, vF) maps model directions to screen directions:
    //   R * vR = (1,0,0)  (model viewRight → screen right)
    //   R * vU = (0,1,0)  (model viewUp    → screen up)
    //   R * vF = (0,0,1)  (model viewFwd   → toward viewer)
    // CSS matrix3d column-major:
    //   col1 = (vR.x, vU.x, vF.x, 0)
    //   col2 = (vR.y, vU.y, vF.y, 0)
    //   col3 = (vR.z, vU.z, vF.z, 0)
    //   col4 = (0, 0, 0, 1)
    const { viewRight: vR, viewUp: vU, viewForward: vF } = state;
    const m = `matrix3d(${vR.x},${vU.x},${vF.x},0, ${vR.y},${vU.y},${vF.y},0, ${vR.z},${vU.z},${vF.z},0, 0,0,0,1)`;

    const transforms = [`rotateX(${baseX}deg)`, `rotateY(${baseY}deg)`, m];

    if (state.isHovered && state.layoutMode !== LayoutMode.Tabbed) {
        transforms.push(`scale(${BASIC_VIEW_SCALE.HOVER})`);
    }

    const transition = state.cubeElement.style.transition;

    if (skipAnimation === true) {
        state.cubeElement.style.transition = 'none';
    }

    state.cubeElement.style.transform = transforms.join(' ');

    if (skipAnimation === true) {
        void state.cubeElement.offsetHeight;
        state.cubeElement.style.transition = transition;
    }
}

/**
 * Calculates which faces should be visible for label placement based on
 * current orientation vectors.
 *
 * The three orientation vectors (viewForward, viewRight, viewUp) each point to
 * one of the six axis-aligned model directions (±X, ±Y, ±Z) which correspond
 * directly to the six cube faces (R, L, U, D, F, B).
 *
 * The isTilted flag controls which CSS slot layout is used (mirroring the base
 * aesthetic Y-angle of ±35°).  The isPitched flag controls which set of three
 * faces counts as "visible".
 */
export function getVisibleFacesWithPositions(state: BasicViewInternalData): {
    visibleFaces: Array<{ face: Face; position: string }>;
    hiddenFaces: Array<{ face: Face; position: string }>;
} {
    const { viewForward: vF, viewRight: vR, viewUp: vU } = state;

    // Each face is identified by its CSS-space direction.
    // vU maps to CSS +Y (visual-DOWN), so the visual-top face is in the neg(vU)
    // CSS direction; visual-bottom is in the +vU CSS direction.
    const fwdFace = faceFromCSSDir(vF);
    const rightFace = faceFromCSSDir(vR);
    const upFace = faceFromCSSDir({ x: -vU.x || 0, y: -vU.y || 0, z: -vU.z || 0 });
    const backFace = faceFromCSSDir({ x: -vF.x || 0, y: -vF.y || 0, z: -vF.z || 0 });
    const leftFace = faceFromCSSDir({ x: -vR.x || 0, y: -vR.y || 0, z: -vR.z || 0 });
    const downFace = faceFromCSSDir(vU);

    const slotFaces: Record<string, Face> = {};

    if (state.isTilted) {
        // Tilted layout: base Y = +35° (looking from slightly left).
        // Front face appears at bottom-right, left face at bottom-left.
        slotFaces['top'] = upFace;
        slotFaces['bottom-left'] = leftFace;
        slotFaces['bottom-right'] = fwdFace;
        slotFaces['top-left'] = backFace;
        slotFaces['top-right'] = rightFace;
        slotFaces['middle-bottom'] = downFace;
    } else {
        // Normal layout: base Y = -35° (looking from slightly right).
        // Front face appears at bottom-left, right face at bottom-right.
        slotFaces['top'] = upFace;
        slotFaces['bottom-left'] = fwdFace;
        slotFaces['bottom-right'] = rightFace;
        slotFaces['top-left'] = leftFace;
        slotFaces['top-right'] = backFace;
        slotFaces['middle-bottom'] = downFace;
    }

    let visiblePositions: string[];
    let hiddenPositions: string[];

    if (state.isPitched) {
        // When pitched (+25° X), the bottom face comes toward the viewer.
        // The faces previously visible at bottom-left/right shift to the top row;
        // the faces previously hidden at top-left/right drop to the bottom row.
        const prevTopLeft = slotFaces['top-left'];
        const prevTopRight = slotFaces['top-right'];
        slotFaces['top-left'] = slotFaces['bottom-left'];
        slotFaces['top-right'] = slotFaces['bottom-right'];
        slotFaces['bottom-left'] = prevTopLeft;
        slotFaces['bottom-right'] = prevTopRight;
        slotFaces['middle-bottom-pitched'] = slotFaces['middle-bottom'];
        visiblePositions = ['top-left', 'middle-bottom-pitched', 'top-right'];
        hiddenPositions = ['top', 'bottom-left', 'bottom-right'];
    } else {
        visiblePositions = ['top', 'bottom-left', 'bottom-right'];
        hiddenPositions = ['top-left', 'top-right', 'middle-bottom'];
    }

    const visibleFaces = visiblePositions.map(position => ({
        face: slotFaces[position],
        position,
    }));

    const hiddenFaces = hiddenPositions.map(position => ({
        face: slotFaces[position],
        position,
    }));

    return { visibleFaces, hiddenFaces };
}

/**
 * Builds a map of CSS face position → original face letter by reading the
 * virtual center cubies from the model.  After whole-cube rotations the
 * virtual centers track where each original face ended up.
 *
 * Returns null when the model is unavailable or doesn't have virtual centers.
 */
function buildFaceMap(model: ReadOnlyCubeModel | undefined): Map<Face, Face> | null {
    if (!model) return null;
    try {
        const cubeState = model.getCurrentState();
        const result = new Map<Face, Face>();
        const allFaces = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
        for (const originalFace of allFaces) {
            const vc = CubeStateUtils.getVirtualCenterCubie(cubeState, originalFace);
            const sticker = vc.stickers.first();
            if (sticker) {
                // sticker.currentFace = which CSS position this original face is now at
                result.set(sticker.currentFace as Face, originalFace);
            }
        }
        return result;
    } catch {
        return null;
    }
}

const pendingLabelTimers = new WeakMap<Element, Map<string, ReturnType<typeof setTimeout>>>();

type LabelTarget = {
    posKey: string;
    face: Face;
    baseClass: string; // 'face-label' or 'hidden-face-label'
    posClass: string; // e.g. 'face-label-front-top'
    viewPrefix: string;
};

function buildTargets(
    state: BasicViewInternalData,
    faceMap: Map<Face, Face> | null
): LabelTarget[] {
    const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(state);
    const viewPrefix = `${state.variant}${state.isTilted ? '-tilted' : ''}${state.isPitched ? '-pitched' : ''}`;
    const targets: LabelTarget[] = [];
    visibleFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const resolvedFace = faceMap?.get(face) ?? face;
        targets.push({
            posKey: position,
            face: resolvedFace,
            baseClass: state.styles['face-label'],
            posClass: state.styles[`face-label-${viewPrefix}-${position}`],
            viewPrefix,
        });
    });
    hiddenFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const resolvedFace = faceMap?.get(face) ?? face;
        targets.push({
            posKey: `hidden:${position}`,
            face: resolvedFace,
            baseClass: state.styles['hidden-face-label'],
            posClass: state.styles[`hidden-face-label-${viewPrefix}-${position}`],
            viewPrefix,
        });
    });
    return targets;
}

function createLabelElement(target: LabelTarget, spinInClass: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `${target.baseClass} ${target.posClass}${spinInClass ? ` ${spinInClass}` : ''}`;
    el.textContent = target.face;
    el.dataset['pos'] = target.posKey;
    el.dataset['face'] = target.face;
    el.dataset['prefix'] = target.viewPrefix;
    return el;
}

/**
 * Updates face label DOM elements, animating only the labels that actually
 * changed (different face letter or layout prefix).  Unchanged labels are
 * left alone.
 *
 * @param direction Controls the animation axis: 'horizontal' (scaleX, default)
 *                  for left/right rotations, 'vertical' (scaleY) for up/down.
 */
export function updateFaceLabels(
    state: BasicViewInternalData,
    direction: 'horizontal' | 'vertical' = 'horizontal'
): void {
    if (!state.cubeContainer) return;

    const faceMap = buildFaceMap(state.model);
    const targets = buildTargets(state, faceMap);

    // Build a map of existing labels by position key.
    const existingByPos = new Map<string, HTMLElement>();
    state.cubeContainer
        .querySelectorAll<HTMLElement>(`[data-pos]`)
        .forEach(el => existingByPos.set(el.dataset['pos']!, el));

    // First render — no animation.
    if (existingByPos.size === 0) {
        targets.forEach(t => state.cubeContainer!.appendChild(createLabelElement(t, '')));
        return;
    }

    // Retrieve (or create) the per-container timer map.
    let timerMap = pendingLabelTimers.get(state.cubeContainer);
    if (!timerMap) {
        timerMap = new Map();
        pendingLabelTimers.set(state.cubeContainer, timerMap);
    }

    const isVertical = direction === 'vertical';
    const spinOutClass = isVertical
        ? state.styles['face-label-spinning-out-vertical']
        : state.styles['face-label-spinning-out'];
    const spinInClass = isVertical
        ? state.styles['face-label-spinning-in-vertical']
        : state.styles['face-label-spinning-in'];
    const container = state.cubeContainer;

    // Determine which positions are being removed (not in new targets).
    const newPosKeys = new Set(targets.map(t => t.posKey));
    existingByPos.forEach((el, posKey) => {
        if (!newPosKeys.has(posKey)) {
            el.remove();
        }
    });

    targets.forEach(target => {
        const existing = existingByPos.get(target.posKey);
        const unchanged =
            existing !== undefined &&
            existing.dataset['face'] === target.face &&
            existing.dataset['prefix'] === target.viewPrefix;

        if (unchanged) {
            // Nothing to do — label is already correct.
            return;
        }

        // Cancel any in-flight timer for this position.
        const prev = timerMap!.get(target.posKey);
        if (prev !== undefined) clearTimeout(prev);

        // Spin out the old label (if any).
        if (existing) {
            existing.classList.add(spinOutClass);
        }

        // After spin-out, remove old and insert new with spin-in.
        const posKey = target.posKey;
        const timer = setTimeout(() => {
            timerMap!.delete(posKey);
            container.querySelector(`[data-pos="${posKey}"]`)?.remove();
            container.appendChild(createLabelElement(target, spinInClass));
        }, 120);

        timerMap!.set(posKey, timer);
    });
}

/**
 * Initializes 3D CSS positioning for all cube faces to a given pixel size.
 */
export function initializeFaces(state: BasicViewInternalData, size: number): void {
    if (!state.cubeElement) return;

    const faces = state.cubeElement.querySelectorAll(
        `.${state.styles.face}`
    ) as NodeListOf<HTMLElement>;
    faces.forEach(face => {
        face.style.width = `${size}px`;
        face.style.height = `${size}px`;
    });

    const blockers = state.cubeElement.querySelectorAll(
        `.${state.styles['cube-blocker']}`
    ) as NodeListOf<HTMLElement>;
    blockers.forEach(blocker => {
        blocker.style.width = `${size}px`;
        blocker.style.height = `${size}px`;
    });

    const halfSize = size / 2;
    const blockerInset = 4;

    const q = (selector: string) =>
        state.cubeElement!.querySelector(selector) as HTMLElement | null;

    const front = q(`.${state.styles.face}.${state.styles.front}`);
    const back = q(`.${state.styles.face}.${state.styles.back}`);
    const right = q(`.${state.styles.face}.${state.styles.right}`);
    const left = q(`.${state.styles.face}.${state.styles.left}`);
    const top = q(`.${state.styles.face}.${state.styles.top}`);
    const bottom = q(`.${state.styles.face}.${state.styles.bottom}`);

    const frontBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.front}`);
    const backBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.back}`);
    const rightBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.right}`);
    const leftBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.left}`);
    const topBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.top}`);
    const bottomBlocker = q(`.${state.styles['cube-blocker']}.${state.styles.bottom}`);

    if (front) front.style.transform = `translateZ(${halfSize}px)`;
    if (back) back.style.transform = `rotateY(180deg) translateZ(${halfSize}px)`;
    if (right) right.style.transform = `rotateY(90deg) translateZ(${halfSize}px)`;
    if (left) left.style.transform = `rotateY(-90deg) translateZ(${halfSize}px)`;
    if (top) top.style.transform = `rotateX(90deg) translateZ(${halfSize}px)`;
    if (bottom) bottom.style.transform = `rotateX(-90deg) translateZ(${halfSize}px)`;

    const blockerZ = halfSize - blockerInset;
    if (frontBlocker) frontBlocker.style.transform = `translateZ(${blockerZ}px)`;
    if (backBlocker) backBlocker.style.transform = `rotateY(180deg) translateZ(${blockerZ}px)`;
    if (rightBlocker) rightBlocker.style.transform = `rotateY(90deg) translateZ(${blockerZ}px)`;
    if (leftBlocker) leftBlocker.style.transform = `rotateY(-90deg) translateZ(${blockerZ}px)`;
    if (topBlocker) topBlocker.style.transform = `rotateX(90deg) translateZ(${blockerZ}px)`;
    if (bottomBlocker) bottomBlocker.style.transform = `rotateX(-90deg) translateZ(${blockerZ}px)`;
}

/**
 * Recalculates and applies the cube size from the available container space.
 */
export function updateSize(state: BasicViewInternalData): void {
    if (!state.cubeElement || !state.container) return;

    const availableSize = computeAvailableContentSize(state.container);
    if (availableSize.width <= 0 || availableSize.height <= 0) return;

    // We want more space around the cube in Tabbed mode
    // to leave more space where background can be dragged.
    const scale =
        state.layoutMode === LayoutMode.Tabbed ? BASIC_VIEW_SCALE.TABBED : BASIC_VIEW_SCALE.DEFAULT;
    const faceSize = Math.min(availableSize.width, availableSize.height) * scale;

    state.cubeElement.style.width = `${faceSize}px`;
    state.cubeElement.style.height = `${faceSize}px`;

    const defaultSize = 300;
    const scaledPerspective = 1000 * (faceSize / defaultSize);
    const cubeWrapper = state.cubeElement.parentElement as HTMLElement;
    if (cubeWrapper) {
        cubeWrapper.style.perspective = `${scaledPerspective}px`;
    }

    initializeFaces(state, faceSize);
}

/**
 * Triggers a size recalculation (called on container resize events).
 */
export function resize(state: BasicViewInternalData): void {
    updateSize(state);
}

/**
 * Returns the minimum recommended size for this view.
 */
export function getMinimumSize(): Size2D {
    return { width: 300, height: 300 };
}

/**
 * Full repaint: syncs all sticker colours and IDs from the model.
 */
export function update(state: BasicViewInternalData, model: ReadOnlyCubeModel): void {
    if (!state.cubeElement) return;

    const cubeState = model.getCurrentState();
    const cubeSize = cubeState.cubeSize ?? 3;
    const faces: Face[] = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
    const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];

    faces.forEach((face, faceIdx) => {
        const faceDiv = state.cubeElement!.querySelector(
            `.${state.styles.face}.${state.styles[faceNames[faceIdx]]}`
        ) as HTMLElement;
        if (!faceDiv) return;

        const stickerElements = faceDiv.querySelectorAll(`.${state.styles.sticker}`);
        for (let i = 0; i < cubeSize * cubeSize; i++) {
            const sticker = CubeStateUtils.getStickerAt(cubeState, face, i);
            if (!sticker) continue;

            const element = stickerElements[i] as HTMLElement;
            if (element) {
                element.style.backgroundColor = resolveCubeColor(sticker.color);
                element.setAttribute('data-sticker-id', sticker.id);
            }
        }
    });
}

/**
 * Selective repaint: updates only the stickers that moved in the last operation.
 */
export function updateSelective(state: BasicViewInternalData, event: MoveExecutedEvent): void {
    if (!state.cubeElement || !state.model) return;

    const cubeState = state.model.getCurrentState();
    const cubeSize = cubeState.cubeSize ?? 3;
    const positionsToUpdate = new Set<string>();

    event.moveDetails.movedCubies?.after.forEach(cubie => {
        cubie.stickers.forEach(sticker => {
            positionsToUpdate.add(`${sticker.currentFace}_${sticker.facePosition}`);
        });
    });

    const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];
    const faces: Face[] = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];

    faces.forEach((face, faceIdx) => {
        const faceDiv = state.cubeElement!.querySelector(
            `.${state.styles.face}.${state.styles[faceNames[faceIdx]]}`
        ) as HTMLElement;
        if (!faceDiv) return;

        const stickerElements = faceDiv.querySelectorAll(`.${state.styles.sticker}`);

        for (let position = 0; position < cubeSize * cubeSize; position++) {
            if (!positionsToUpdate.has(`${face}_${position}`)) continue;

            const sticker = CubeStateUtils.getStickerAt(cubeState, face, position);
            if (!sticker) continue;

            const element = stickerElements[position] as HTMLElement;
            if (!element) continue;

            element.style.backgroundColor = resolveCubeColor(sticker.color);
            element.setAttribute('data-sticker-id', sticker.id);
        }
    });
}
