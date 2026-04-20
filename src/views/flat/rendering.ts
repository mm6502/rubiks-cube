import { Face, FaceGrid, ReadOnlyCubeModel, resolveCubeColor } from '@/cube/types';
import { createFlatView } from '@/cube/utils/state-conversion';
import { computeAvailableContentSize } from '@/cube/utils/view-utils';
import { MoveExecutedEvent } from '@/types';

import type { FlatViewInternalData } from './flat-view';

/**
 * Full repaint: synchronise every sticker's colour from the model.
 */
export function update(state: FlatViewInternalData, model: ReadOnlyCubeModel): void {
    if (!state.container) return;

    const displayGrid = createFlatView(model.getCurrentState());
    const faces: Face[] = [Face.U, Face.D, Face.F, Face.B, Face.R, Face.L];

    faces.forEach(face => {
        const faceGrid = displayGrid.get(face);
        if (!faceGrid) return;

        const n = faceGrid.grid.length;
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const stickerObj = faceGrid.grid[row][col];
                if (!stickerObj) continue;

                const pos = row * n + col;
                const stickerEl = state.container!.querySelector(
                    `.${state.styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
                ) as HTMLElement;
                if (stickerEl) {
                    stickerEl.style.backgroundColor = resolveCubeColor(stickerObj.color);
                    stickerEl.setAttribute('data-sticker-id', stickerObj.id);
                }
            }
        }
    });
}

/**
 * Selective repaint: update only stickers affected by the last move.
 */
export function updateSelective(
    state: FlatViewInternalData,
    event: MoveExecutedEvent | undefined
): void {
    if (!state.container || !state.model) return;

    const cubeState = state.model.getCurrentState();
    const displayGrid = createFlatView(cubeState);
    const displayedFaces: Face[] = [Face.U, Face.F, Face.R, Face.B, Face.L, Face.D];

    // Collect positions that need updating
    const positionsToUpdate = new Set<string>();

    event?.moveDetails?.movedCubies?.after.forEach(cubie => {
        cubie.stickers.forEach(sticker => {
            const currentFace = sticker.currentFace;
            if (displayedFaces.includes(currentFace)) {
                const position = sticker.facePosition;
                positionsToUpdate.add(`${currentFace}_${position}`);
            }
        });
    });

    if (!positionsToUpdate.size) return;

    // Update each affected position using FaceGrid data
    displayedFaces.forEach(face => {
        const faceGrid = displayGrid.get(face);
        if (!faceGrid) return;

        const n = faceGrid.grid.length;
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const pos = row * n + col;
                const key = `${face}_${pos}`;
                if (!positionsToUpdate.has(key)) continue;

                const stickerObj = faceGrid.grid[row][col];
                if (!stickerObj) continue;

                const stickerEl = state.container!.querySelector(
                    `.${state.styles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
                ) as HTMLElement | null;
                if (stickerEl) {
                    stickerEl.style.backgroundColor = resolveCubeColor(stickerObj.color);
                    stickerEl.setAttribute('data-sticker-id', stickerObj.id);
                }
            }
        }
    });
}

/**
 * Recalculate grid scale / rotation for the current viewport and rebuild
 * the legend HTML.
 */
export function handleResize(state: FlatViewInternalData): void {
    if (!state.container) return;

    const available = computeAvailableContentSize(state.container);

    const isMobile = window.innerWidth < 769;
    let scale: number;
    let transform: string;
    if (isMobile) {
        scale = Math.min(available.width / 300, available.height / 400);
        transform = `rotate(90deg) scale(${Math.max(scale, 0.1)})`;
    } else {
        scale = Math.min(available.width / 400, available.height / 300);
        transform = `scale(${Math.max(scale, 0.1)})`;
    }

    state.isRotated = isMobile;

    const grid = state.container.querySelector(`.${state.styles['flat-grid']}`) as HTMLElement;
    if (grid) {
        grid.style.transform = transform;
    }

    if (state.legendElement) {
        state.legendElement.innerHTML = buildLegendHTML(state.styles, isMobile);
    }
}

/**
 * Returns the legend's inner HTML for the given orientation.
 */
export function buildLegendHTML(styles: Record<string, string>, isMobile: boolean): string {
    const s = styles;
    if (isMobile) {
        return [
            `<div class="${s['legend-row']}"><span></span><span>L</span><span></span></div>`,
            `<div class="${s['legend-row']}"><span>D</span><span>F</span><span>U</span></div>`,
            `<div class="${s['legend-row']}"><span></span><span>R</span><span></span></div>`,
            `<div class="${s['legend-row']}"><span></span><span>B</span><span></span></div>`,
        ].join('');
    }
    return [
        `<div class="${s['legend-row']}"><span></span><span>U</span><span></span><span></span></div>`,
        `<div class="${s['legend-row']}"><span>L</span><span>F</span><span>R</span><span>B</span></div>`,
        `<div class="${s['legend-row']}"><span></span><span>D</span><span></span><span></span></div>`,
    ].join('');
}

/**
 * Create a single face element with its sticker grid (DOM only, no event
 * listeners). The caller is responsible for attaching interaction events.
 */
export function createFaceElement(
    face: Face,
    faceGrid: FaceGrid,
    styles: Record<string, string>
): HTMLElement {
    const faceDiv = document.createElement('div');
    faceDiv.className = styles['flat-face'];

    const n = faceGrid.grid.length;
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const stickerObj = faceGrid.grid[row][col];
            if (!stickerObj) continue;

            const pos = row * n + col;
            const sticker = document.createElement('div');
            sticker.className = styles['flat-sticker'];
            sticker.setAttribute('data-sticker-id', stickerObj.id);
            sticker.setAttribute('data-face', face);
            sticker.setAttribute('data-pos', pos.toString());
            sticker.style.backgroundColor = resolveCubeColor(stickerObj.color);

            faceDiv.appendChild(sticker);
        }
    }

    return faceDiv;
}
