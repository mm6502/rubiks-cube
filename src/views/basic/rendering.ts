import { Face, ReadOnlyCubeModel, Size2D, resolveCubeColor } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import { findClosestEquivalentAngle as mathFindClosestEquivalentAngle } from '@/cube/utils/math';
import { computeAvailableContentSize } from '@/cube/utils/view-utils';
import { MoveExecutedEvent } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { BASIC_VIEW_ANGLES } from './constants';

/**
 * Re-export so callers that only need the angle helper can import it from here.
 */
export function findClosestEquivalentAngle(current: number, target: number): number {
    return mathFindClosestEquivalentAngle(current, target);
}

/**
 * Updates the CSS transform of the cube element based on current rotation values.
 */
export function updateRotation(state: BasicViewInternalData, skipAnimation?: boolean): void {
    if (!state.cubeElement) return;

    const baseX = state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X;
    const baseY = state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y;
    const baseZ = BASIC_VIEW_ANGLES.BASE_Z;

    const transforms = [
        `rotateX(${baseX}deg)`,
        `rotateY(${baseY}deg)`,
        `rotateY(${baseZ}deg)`,
        `rotateX(${state.xRotation}deg)`,
        `rotateY(${state.yRotation}deg)`,
        `rotateZ(${state.zRotation}deg)`,
    ];

    if (state.isHovered) {
        transforms.push('scale(1.05)');
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
 * current rotation state.
 */
export function getVisibleFacesWithPositions(state: BasicViewInternalData): {
    visibleFaces: Array<{ face: Face; position: string }>;
    hiddenFaces: Array<{ face: Face; position: string }>;
} {
    const orientation: Record<'front' | 'back' | 'right' | 'left' | 'up' | 'down', Face> = {
        front: Face.F,
        back: Face.B,
        right: Face.R,
        left: Face.L,
        up: Face.U,
        down: Face.D,
    };

    const rotateOrientationX = (dir: 1 | -1) => {
        const { front, back, up, down } = orientation;
        if (dir === 1) {
            orientation.front = down;
            orientation.up = front;
            orientation.back = up;
            orientation.down = back;
        } else {
            orientation.front = up;
            orientation.up = back;
            orientation.back = down;
            orientation.down = front;
        }
    };

    const rotateOrientationY = (dir: 1 | -1) => {
        const { front, back, right, left } = orientation;
        if (dir === 1) {
            orientation.front = right;
            orientation.right = back;
            orientation.back = left;
            orientation.left = front;
        } else {
            orientation.front = left;
            orientation.left = back;
            orientation.back = right;
            orientation.right = front;
        }
    };

    const rotateOrientationZ = (dir: 1 | -1) => {
        const { up, right, down, left } = orientation;
        if (dir === 1) {
            orientation.up = left;
            orientation.left = down;
            orientation.down = right;
            orientation.right = up;
        } else {
            orientation.up = right;
            orientation.right = down;
            orientation.down = left;
            orientation.left = up;
        }
    };

    const applySteps = (steps: number, rotatePositive: () => void, rotateNegative: () => void) => {
        let count = steps;
        while (count > 0) {
            rotatePositive();
            count--;
        }
        while (count < 0) {
            rotateNegative();
            count++;
        }
    };

    const ySteps = Math.round(-state.yRotation / 90);
    applySteps(
        ySteps,
        () => rotateOrientationY(1),
        () => rotateOrientationY(-1)
    );

    const xSteps = Math.round(state.xRotation / 90);
    applySteps(
        xSteps,
        () => rotateOrientationX(1),
        () => rotateOrientationX(-1)
    );

    const zSteps = Math.round(-state.zRotation / 90);
    applySteps(
        zSteps,
        () => rotateOrientationZ(1),
        () => rotateOrientationZ(-1)
    );

    const slotFaces: Record<string, Face> = {};

    const assignFrontNormal = () => {
        slotFaces['top'] = orientation.up;
        slotFaces['bottom-left'] = orientation.front;
        slotFaces['bottom-right'] = orientation.right;
        slotFaces['top-left'] = orientation.left;
        slotFaces['top-right'] = orientation.back;
        slotFaces['middle-bottom'] = orientation.down;
    };

    const assignFrontTilted = () => {
        slotFaces['top'] = orientation.up;
        slotFaces['bottom-left'] = orientation.left;
        slotFaces['bottom-right'] = orientation.front;
        slotFaces['top-left'] = orientation.back;
        slotFaces['top-right'] = orientation.right;
        slotFaces['middle-bottom'] = orientation.down;
    };

    const assignBackNormal = () => {
        slotFaces['top'] = orientation.up;
        slotFaces['bottom-left'] = orientation.front;
        slotFaces['bottom-right'] = orientation.right;
        slotFaces['top-left'] = orientation.left;
        slotFaces['top-right'] = orientation.back;
        slotFaces['middle-bottom'] = orientation.down;
    };

    const assignBackTilted = () => {
        slotFaces['top'] = orientation.up;
        slotFaces['bottom-left'] = orientation.left;
        slotFaces['bottom-right'] = orientation.front;
        slotFaces['top-left'] = orientation.back;
        slotFaces['top-right'] = orientation.right;
        slotFaces['middle-bottom'] = orientation.down;
    };

    if (state.variant === 'back') {
        if (state.isTilted) {
            assignBackTilted();
        } else {
            assignBackNormal();
        }
    } else {
        if (state.isTilted) {
            assignFrontTilted();
        } else {
            assignFrontNormal();
        }
    }

    let visiblePositions: string[];
    let hiddenPositions: string[];

    if (state.isPitched) {
        slotFaces['middle-bottom-pitched'] = slotFaces['middle-bottom'];
        visiblePositions = ['middle-bottom-pitched', 'bottom-left', 'bottom-right'];
        hiddenPositions = ['top-left', 'top-right', 'top'];
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
 * Rebuilds face label DOM elements based on current rotation state.
 */
export function updateFaceLabels(state: BasicViewInternalData): void {
    if (!state.cubeContainer) return;

    const existingLabels = state.cubeContainer.querySelectorAll(
        `.${state.styles['face-label']}, .${state.styles['hidden-face-label']}`
    );
    existingLabels.forEach((label: Element) => label.remove());

    const { visibleFaces, hiddenFaces } = getVisibleFacesWithPositions(state);

    const basePrefix = state.variant;
    const tiltSuffix = state.isTilted ? '-tilted' : '';
    const pitchSuffix = state.isPitched ? '-pitched' : '';
    const viewPrefix = `${basePrefix}${tiltSuffix}${pitchSuffix}`;

    visibleFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const label = document.createElement('div');
        const className = `face-label-${viewPrefix}-${position}`;
        label.className = `${state.styles['face-label']} ${state.styles[className]}`;
        label.textContent = face;
        state.cubeContainer!.appendChild(label);
    });

    hiddenFaces.forEach(({ face, position }: { face: Face; position: string }) => {
        const label = document.createElement('div');
        const className = `hidden-face-label-${viewPrefix}-${position}`;
        label.className = `${state.styles['hidden-face-label']} ${state.styles[className]}`;
        label.textContent = face;
        state.cubeContainer!.appendChild(label);
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

    const faceSize = Math.min(availableSize.width, availableSize.height) * 0.6;

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
    const faces: Face[] = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
    const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];

    faces.forEach((face, faceIdx) => {
        const faceDiv = state.cubeElement!.querySelector(
            `.${state.styles.face}.${state.styles[faceNames[faceIdx]]}`
        ) as HTMLElement;
        if (!faceDiv) return;

        const stickerElements = faceDiv.querySelectorAll(`.${state.styles.sticker}`);
        for (let i = 0; i < 9; i++) {
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

        for (let position = 0; position < 9; position++) {
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
