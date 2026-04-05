import { CubeState, Face, FaceGrid } from '@/cube/types';
import { StickerPositionMapper, createFlatView } from '@/cube/utils/state-conversion';

import { logger } from './logger';

/**
 * Dumps the cube state to console by generating and printing the flat view.
 *
 * This function generates the grids map via createFlatView and prints each mapping
 * to the console with appropriate labels. Useful for normal operation debugging
 * where you want to dump state directly.
 *
 * @param state - The CubeState3D object representing the cube state
 * @param mapper - Optional mapping function for stickers
 *
 * @example
 * ```typescript
 * const controller = new CubeController(3);
 * controller.applyMove('F');
 * dumpAsFlatView(controller, { mode: 'display' });
 * ```
 */
export function dumpAsFlatView(state: CubeState, mapper?: StickerPositionMapper): void {
    const grids = createFlatView(state, mapper);
    dumpFlatView(grids);
}

/**
 * Prints a flat view grid map to console with labels.
 *
 * This function takes a pre-computed grids map (typically from createFlatView)
 * and prints each mapping with appropriate labels. Useful for unit tests and
 * other scenarios where you already have the grids map.
 *
 * @param faceGrids - A map of Face to FaceGrid (display-oriented mapping)
 *
 * @example
 * ```typescript
 * const grids = createFlatView(state, { mode: 'both' });
 * dumpFlatView(grids);
 * ```
 */
export function dumpFlatView(faceGrids: Map<Face, FaceGrid>): void {
    const scope = logger.groupScoped('Flat View Dump');
    if (!scope) return;
    scope.info('=== DISPLAY MAPPING ===');
    scope.info(faceGridsToString(faceGrids));

    const virtualCenters = [Face.U, Face.F, Face.R, Face.B, Face.L, Face.D]
        .map(face => {
            const vc = faceGrids.get(face)?.virtualCenter;
            return vc ? `${face}:${vc.color[0].toUpperCase()}` : `${face}:?`;
        })
        .join(' ');
    scope.info(`Virtual Centers: ${virtualCenters}`);
    scope.groupEnd();
}

/**
 * Converts face grids to a string representation for console output.
 * @param faceGrids A map from each face to its corresponding 2D grid of stickers.
 * @returns A string representation of the cube's unfolded T-net layout.
 **/
export function faceGridsToString(faceGrids: Map<Face, FaceGrid>): string {
    const n = faceGrids.get(Face.U)?.grid?.[0]?.length ?? 3;
    // Add spacing between faces: 3 vertical spacing rows + 3 horizontal spacing columns
    const rows = Array.from({ length: 3 * n + 2 }, () => Array(4 * n + 3).fill('.'));

    function writeFace(faceIndexX: number, faceIndexY: number, face: Face) {
        const faceGrid = faceGrids.get(face);
        if (!faceGrid) return;

        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const sticker = faceGrid.grid[r]?.[c];
                const char = sticker?.color ? sticker.color[0].toUpperCase() : '?';

                // Add spacing: each face Y position gets an extra row before it, each face X gets extra column
                const globalR = faceIndexY * (n + 1) + r;
                const globalC = faceIndexX * (n + 1) + c;
                rows[globalR][globalC] = char;
            }
        }
    }

    writeFace(1, 0, Face.U);
    writeFace(0, 1, Face.L);
    writeFace(1, 1, Face.F);
    writeFace(2, 1, Face.R);
    writeFace(3, 1, Face.B);
    writeFace(1, 2, Face.D);

    return rows.map(row => row.join('')).join('\n');
}
