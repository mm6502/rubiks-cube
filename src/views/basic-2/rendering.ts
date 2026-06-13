// Rendering for Basic 2 view — cubie-based (no face divs)
import { Face, ReadOnlyCubeModel, Size2D, Vector3 } from '@/cube/types';
import { LayoutMode } from '@/cube/types/view';
import { CubeStateUtils } from '@/cube/utils';

import * as cubieRendering from './cubie-rendering';
import type { BasicViewInternalData } from './basic-2-view';

/**
 * CSS angle constants for basic view base orientation.
 */
const BASIC_VIEW_ANGLES = {
    BASE_X: -25,
    BASE_Y: -35,
    PITCHED_BASE_X: 25,
    TILTED_BASE_Y: 35,
    HOVER: 1.05,
} as const;

/**
 * Maps an axis-aligned unit vector expressed in CSS 3D space to the
 * corresponding cube Face.
 */
function faceFromCSSDir(v: Vector3): Face {
    if (v.x === 1) return Face.R;
    if (v.x === -1) return Face.L;
    if (v.y === 1) return Face.D;
    if (v.y === -1) return Face.U;
    if (v.z === 1) return Face.F;
    return Face.B;
}

/**
 * Updates the CSS transform of the cube element based on current rotation values.
 */
export function updateRotation(state: BasicViewInternalData, skipAnimation?: boolean): void {
    if (!state.cubeElement) return;

    const baseX = state.isPitched ? BASIC_VIEW_ANGLES.PITCHED_BASE_X : BASIC_VIEW_ANGLES.BASE_X;
    const baseY = state.isTilted ? BASIC_VIEW_ANGLES.TILTED_BASE_Y : BASIC_VIEW_ANGLES.BASE_Y;

    const { viewRight: vR, viewUp: vU, viewForward: vF } = state;
    const m = `matrix3d(${vR.x},${vU.x},${vF.x},0, ${vR.y},${vU.y},${vF.y},0, ${vR.z},${vU.z},${vF.z},0, 0,0,0,1)`;

    const transforms = [`rotateX(${baseX}deg)`, `rotateY(${baseY}deg)`, m];

    if (state.isHovered && state.layoutMode !== LayoutMode.Tabbed) {
        transforms.push(`scale(${BASIC_VIEW_ANGLES.HOVER})`);
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
 * Calculates which faces should be visible for label placement.
 */
export function getVisibleFacesWithPositions(state: BasicViewInternalData): {
    visibleFaces: Array<{ face: Face; position: string }>;
    hiddenFaces: Array<{ face: Face; position: string }>;
} {
    const { viewForward: vF, viewRight: vR, viewUp: vU } = state;

    const fwdFace = faceFromCSSDir(vF);
    const rightFace = faceFromCSSDir(vR);
    const upFace = faceFromCSSDir({ x: -vU.x || 0, y: -vU.y || 0, z: -vU.z || 0 });
    const backFace = faceFromCSSDir({ x: -vF.x || 0, y: -vF.y || 0, z: -vF.z || 0 });
    const leftFace = faceFromCSSDir({ x: -vR.x || 0, y: -vR.y || 0, z: -vR.z || 0 });
    const downFace = faceFromCSSDir(vU);

    const slotFaces: Record<string, Face> = {};

    if (state.isTilted) {
        slotFaces['top'] = upFace;
        slotFaces['bottom-left'] = leftFace;
        slotFaces['bottom-right'] = fwdFace;
        slotFaces['top-left'] = backFace;
        slotFaces['top-right'] = rightFace;
        slotFaces['middle-bottom'] = downFace;
    } else {
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
 * Recalculates and applies the cube size from the available container space.
 */
export function updateSize(state: BasicViewInternalData): void {
    if (!state.cubeElement || !state.container) return;

    const containerWidth = state.container.clientWidth;
    const containerHeight = state.container.clientHeight;
    const availableSize = {
        width: containerWidth > 0 ? containerWidth : 300,
        height: containerHeight > 0 ? containerHeight : 300,
    };

    const scale = state.layoutMode === LayoutMode.Tabbed ? 0.5 : 0.55;
    const faceSize = Math.min(availableSize.width, availableSize.height) * scale;

    state.cubeElement.style.width = `${faceSize}px`;
    state.cubeElement.style.height = `${faceSize}px`;

    const defaultSize = 300;
    const scaledPerspective = 1000 * (faceSize / defaultSize);
    const cubeWrapper = state.cubeElement.parentElement as HTMLElement;
    if (cubeWrapper) {
        cubeWrapper.style.perspective = `${scaledPerspective}px`;
    }

    // Reinitialize cubies with updated size (positions and face transforms both depend on size)
    cubieRendering.initializeCubies(state, faceSize);

    // Update blocker sizes and transforms
    initializeBlockers(state, faceSize);
}

/**
 * Initialize blocker divs with correct transforms and sizes.
 */
export function initializeBlockers(state: BasicViewInternalData, size: number): void {
    if (!state.cubeElement) return;

    const halfSize = size / 2;
    // Each cubie's sticker faces sit at the cube element boundary:
    //   Right face:  x = faceSize  (cx + cubieSize for rightmost cubie)
    //   Left face:   x = 0
    //   Top face:    y = 0
    //   Bottom face: y = faceSize
    //   Front face:  z = +halfSize
    //   Back face:   z = -halfSize
    // The blocker planes use T = halfSize - 4 to sit just inside (4px) each face,
    // avoiding z-fighting with sticker faces while still covering the interior.

    const q = (selector: string) =>
        state.cubeElement!.querySelector(selector) as HTMLElement | null;

    const blockers = [
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.front}`),
            transform: `translateZ(${halfSize - 4}px)`,
        },
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.back}`),
            transform: `rotateY(180deg) translateZ(${halfSize - 4}px)`,
        },
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.right}`),
            transform: `rotateY(90deg) translateZ(${halfSize - 4}px)`,
        },
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.left}`),
            transform: `rotateY(-90deg) translateZ(${halfSize - 4}px)`,
        },
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.top}`),
            transform: `rotateX(90deg) translateZ(${halfSize - 4}px)`,
        },
        {
            el: q(`.${state.styles['cube-blocker']}.${state.styles.bottom}`),
            transform: `rotateX(-90deg) translateZ(${halfSize - 4}px)`,
        },
    ];

    blockers.forEach(({ el, transform }) => {
        if (el) {
            el.style.transform = transform;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
        }
    });
}

/**
 * Show or hide all blocker planes. Call with false when a layer animation
 * starts (blockers cannot cover rotating-layer gaps), and with true when
 * the animation finishes or is interrupted.
 */
export function setBlockersVisible(state: BasicViewInternalData, visible: boolean): void {
    if (!state.cubeElement) return;
    state.cubeElement
        .querySelectorAll(`.${state.styles['cube-blocker']}`)
        .forEach(el => ((el as HTMLElement).style.visibility = visible ? '' : 'hidden'));
}

/**
 * Triggers a size recalculation.
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
 * Full repaint: syncs all cubie positions and sticker faces from the model.
 */
export function update(state: BasicViewInternalData, _model: ReadOnlyCubeModel): void {
    if (!state.cubeElement) return;

    // Reinitialize all cubies from the model state
    const faceSize = state.cubeElement.style.width
        ? parseFloat(state.cubeElement.style.width)
        : 300;

    // Clear existing cubies
    const existingCubies = state.cubeElement.querySelectorAll('[data-cubie-id]');
    existingCubies.forEach(el => el.remove());

    cubieRendering.initializeCubies(state, faceSize);
}

// =========================================================================
// Face Labels
// =========================================================================

/**
 * Builds a map of CSS face position → original face letter by reading the
 * virtual center cubies from the model.  After whole-cube rotations the
 * virtual centers track where each original face ended up.
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
    baseClass: string;
    posClass: string;
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
 */
export function updateFaceLabels(
    state: BasicViewInternalData,
    direction: 'horizontal' | 'vertical' = 'horizontal'
): void {
    /* c8 ignore if */
    if (!state.cubeContainer) return;

    const faceMap = buildFaceMap(state.model);
    const targets = buildTargets(state, faceMap);

    const existingByPos = new Map<string, HTMLElement>();
    state.cubeContainer
        .querySelectorAll<HTMLElement>(`[data-pos]`)
        .forEach(el => existingByPos.set(el.dataset['pos']!, el));

    if (existingByPos.size === 0) {
        targets.forEach(t => state.cubeContainer!.appendChild(createLabelElement(t, '')));
        return;
    }

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

        if (unchanged) return;

        const prev = timerMap!.get(target.posKey);
        if (prev !== undefined) clearTimeout(prev);

        if (existing) {
            existing.classList.add(spinOutClass);
        }

        const posKey = target.posKey;
        const timer = setTimeout(() => {
            timerMap!.delete(posKey);
            container.querySelector(`[data-pos="${posKey}"]`)?.remove();
            container.appendChild(createLabelElement(target, spinInClass));
        }, 120);

        timerMap!.set(posKey, timer);
    });
}
