/**
 * State Persistence Module
 *
 * Handles serialization, storage, and restoration of cube states.
 * Supports both automatic persistence (on app exit) and manual import/export.
 *
 * String Format:
 * <cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...
 * [optional newline]
 * [optional move history]
 *
 * Example for solved 3x3x3:
 * 3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
 *
 * Example with move history:
 * 3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
 * R U R' U'
 *
 * Colors: W=White, Y=Yellow, O=Orange, R=Red, G=Green, B=Blue
 */
import { Map as IMap } from 'immutable';

import { CubieManager } from '@/cube/core/cubie-manager';
import {
    Color,
    CubeState,
    Cubie,
    CubieId,
    CubieType,
    Face,
    PositionKey,
    Sticker,
    StickerId,
} from '@/cube/types';
import { getPositionKey } from '@/cube/utils/coordinates';
import { createFlatView } from '@/cube/utils/state-conversion';
import { logger } from '@/diagnostics/logger';

import { MoveHistory } from './move-history';

const STORAGE_KEY = 'rubikCube_autoSave';
const DEFAULT_FACE_ORDER = 'UDFBLR';
const DELIMITER = ':';

/** Color to letter mapping */
const COLOR_TO_LETTER: Record<Color, string> = {
    [Color.WHITE]: 'W',
    [Color.YELLOW]: 'Y',
    [Color.ORANGE]: 'O',
    [Color.RED]: 'R',
    [Color.GREEN]: 'G',
    [Color.BLUE]: 'B',
};

/** Letter to color mapping */
const LETTER_TO_COLOR: Record<string, Color> = {
    W: Color.WHITE,
    Y: Color.YELLOW,
    O: Color.ORANGE,
    R: Color.RED,
    G: Color.GREEN,
    B: Color.BLUE,
};

/** Face letter to Face mapping */
const LETTER_TO_FACE: Record<string, Face> = {
    U: Face.U,
    D: Face.D,
    F: Face.F,
    B: Face.B,
    L: Face.L,
    R: Face.R,
};

/**
 * State Persistence Manager
 * Provides methods to save and load cube states using plain string format.
 */
export class StatePersistence {
    /**
     * Convert a cube state to a plain string format.
     * Format: <cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...
     * Optionally followed by a newline and move history
     * @param state The cube state to serialize.
     * @param moveHistory Optional MoveHistory instance to include.
     * @returns String representation.
     */
    static stateToString(state: CubeState, moveHistory?: MoveHistory): string {
        const n = state.cubeSize;
        const faceGrids = createFlatView(state);
        const parts: string[] = [];

        // Add cube size.
        parts.push(n.toString());

        // Add face order.
        parts.push(DEFAULT_FACE_ORDER);

        // Add colors for each face in order.
        for (const faceLetter of DEFAULT_FACE_ORDER) {
            const face = LETTER_TO_FACE[faceLetter];
            const faceGrid = faceGrids.get(face);

            if (!faceGrid) {
                throw new Error(`Missing face grid for ${face}`);
            }

            let faceColors = '';

            // Read grid in row-major order.
            for (let row = 0; row < n; row++) {
                for (let col = 0; col < n; col++) {
                    const sticker = faceGrid.grid[row][col];
                    if (sticker) {
                        const letter = COLOR_TO_LETTER[sticker.color];
                        faceColors += letter;
                    } else {
                        // Unknown/missing sticker.
                        faceColors += '?';
                    }
                }
            }

            parts.push(faceColors);
        }

        let result = parts.join(DELIMITER);

        // Optionally append move history.
        if (moveHistory && !moveHistory.isEmpty()) {
            result += '\n' + moveHistory.serialize();
        }

        return result;
    }

    /**
     * Parse a plain string into state components.
     * @param str The string to parse.
     * @returns Parsed components (including optional move history) or null if invalid.
     */
    static parseStateString(str: string): {
        cubeSize: number;
        faceOrder: string;
        faceColors: string[];
        moveHistory?: MoveHistory;
    } | null {
        try {
            // Split by newline first to separate state from optional move history.
            const lines = str
                .trim()
                .split('\n')
                .map(line => line.trim());
            const stateLine = lines[0];
            const moveHistoryLine = lines.length > 1 ? lines[1] : undefined;

            const parts = stateLine.split(DELIMITER);

            if (parts.length < 2) {
                logger.errorWithTrace('Invalid format: too few parts');
                return null;
            }

            // Parse cube size.
            const cubeSize = parseInt(parts[0], 10);
            if (!cubeSize || cubeSize < 2 || cubeSize > 10) {
                logger.errorWithTrace('Invalid cube size');
                return null;
            }

            // Parse face order.
            const faceOrder = parts[1];
            if (faceOrder.length !== 6) {
                logger.errorWithTrace('Invalid face order length');
                return null;
            }

            // Parse face colors.
            const expectedLength = cubeSize * cubeSize;
            const faceColors = parts.slice(2);

            if (faceColors.length !== 6) {
                logger.errorWithTrace(`Expected 6 faces, got ${faceColors.length}`);
                return null;
            }

            // Validate each face has correct number of stickers.
            for (const colors of faceColors) {
                if (colors.length !== expectedLength) {
                    logger.errorWithTrace(
                        `Face has ${colors.length} stickers, expected ${expectedLength}`
                    );
                    return null;
                }
            }

            // Parse move history if present.
            const moveHistory =
                moveHistoryLine && moveHistoryLine.length > 0
                    ? MoveHistory.deserialize(moveHistoryLine)
                    : new MoveHistory();

            return { cubeSize, faceOrder, faceColors, moveHistory };
        } catch (error) {
            logger.errorWithTrace('Failed to parse state string:', error);
            return null;
        }
    }

    /**
     * Reconstruct a CubeState from a state string.
     * Creates a fresh cube state and updates sticker colors based on the string data.
     * @param stateString The state string to reconstruct from.
     * @returns Object with reconstructed CubeState and optional move history, or null if reconstruction fails.
     */
    static stringToState(
        stateString: string
    ): { state: CubeState; moveHistory?: MoveHistory } | null {
        try {
            // Parse the state string.
            const parsed = this.parseStateString(stateString);
            if (!parsed) {
                logger.errorWithTrace('Failed to parse state string');
                return null;
            }

            const { cubeSize, faceOrder, faceColors, moveHistory } = parsed;

            // Create a fresh cube state using CubieManager.
            const cubieManager = new CubieManager(cubeSize);
            const cubies = cubieManager.createAllCubies();

            // Create FaceGrid data structure from the string.
            const faceGrids = new Map<Face, string[][]>();

            for (let i = 0; i < faceOrder.length; i++) {
                const faceLetter = faceOrder[i];
                const face = LETTER_TO_FACE[faceLetter];
                const colors = faceColors[i];

                // Convert flat string to 2D grid.
                const grid: string[][] = [];
                for (let row = 0; row < cubeSize; row++) {
                    const rowColors: string[] = [];
                    for (let col = 0; col < cubeSize; col++) {
                        const index = row * cubeSize + col;
                        rowColors.push(colors[index]);
                    }
                    grid.push(rowColors);
                }
                faceGrids.set(face, grid);
            }

            // Update sticker colors based on FaceGrid data.
            const updatedCubies = new Map<CubieId, Cubie>();

            for (const [cubieId, cubie] of cubies) {
                // For each cubie, update its sticker colors.
                let updatedStickers = IMap<StickerId, Sticker>();

                for (const [stickerId, sticker] of cubie.stickers) {
                    const currentFace = sticker.currentFace;
                    const facePosition = sticker.facePosition;

                    // Get the color from the face grid.
                    const grid = faceGrids.get(currentFace);
                    if (!grid) {
                        logger.error(`No grid found for face ${currentFace}`);
                        continue;
                    }

                    // Convert facePosition (index) to row/col.
                    const row = Math.floor(facePosition / cubeSize);
                    const col = facePosition % cubeSize;

                    if (row < 0 || row >= cubeSize || col < 0 || col >= cubeSize) {
                        logger.error(
                            `Invalid position: row=${row}, col=${col} for cubeSize=${cubeSize}`
                        );
                        continue;
                    }

                    const colorLetter = grid[row][col];
                    const newColor = LETTER_TO_COLOR[colorLetter];

                    if (!newColor) {
                        logger.error(`Unknown color letter: ${colorLetter}`);
                        continue;
                    }

                    // Create updated sticker with new color.
                    const updatedSticker: Sticker = {
                        ...sticker,
                        color: newColor,
                    };

                    updatedStickers = updatedStickers.set(stickerId, updatedSticker);
                }

                // Create updated cubie with new stickers.
                const updatedCubie: Cubie = {
                    ...cubie,
                    stickers: updatedStickers,
                };

                updatedCubies.set(cubieId, updatedCubie);
            }

            // Build the final state.
            let cubiesById = IMap<CubieId, Cubie>();
            let cubiesByPosition = IMap<PositionKey, Cubie>();

            for (const [cubieId, cubie] of updatedCubies) {
                cubiesById = cubiesById.set(cubieId, cubie);

                // Only physical cubies go in cubiesByPosition.
                if (cubie.type !== CubieType.VIRTUAL_CENTER) {
                    const positionKey = getPositionKey(cubie.position, cubeSize);
                    cubiesByPosition = cubiesByPosition.set(positionKey, cubie);
                }
            }

            const newState: CubeState = {
                cubeSize: cubeSize,
                cubiesById: cubiesById,
                cubiesByPosition: cubiesByPosition,
                timestamp: Date.now(),
            };

            logger.info('Successfully reconstructed cube state from string');
            return { state: newState, moveHistory };
        } catch (error) {
            logger.error('Failed to reconstruct state from string:', error);
            return null;
        }
    }

    /**
     * Save the current cube state to localStorage.
     * @param state The cube state to save.
     * @param moveHistory Optional move history to save with the state.
     * @returns True if save was successful.
     */
    static saveState(state: CubeState, moveHistory?: MoveHistory): boolean {
        try {
            // Serialize state to string.
            const stateString = this.stateToString(state, moveHistory);

            // Check if state has changed since last export.
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && stored === stateString) {
                logger.trace('Exported state is identical to last export; no changes detected.');
                return true;
            }

            // Save to localStorage.
            localStorage.setItem(STORAGE_KEY, stateString);
            logger.info('Cube state saved');
            logger.debug('Saved state string:', stateString);
            return true;
        } catch (error) {
            logger.error('Failed to save cube state:', error);
            return false;
        }
    }

    /**
     * Load a previously saved cube state from localStorage.
     * Returns the string representation which can be used for reconstruction.
     * @returns The state string, or null if none exists.
     */
    static loadState(): string | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                logger.info('No saved cube state found');
                return null;
            }

            logger.info('Cube state loaded');
            return stored;
        } catch (error) {
            logger.error('Failed to load cube state:', error);
            return null;
        }
    }

    /**
     * Clear the saved cube state from localStorage.
     * @returns True if clear was successful.
     */
    static clearState(): boolean {
        try {
            localStorage.removeItem(STORAGE_KEY);
            logger.info('Saved cube state cleared');
            return true;
        } catch (error) {
            logger.error('Failed to clear cube state:', error);
            return false;
        }
    }

    /**
     * Check if a saved state exists.
     * @returns True if a saved state exists.
     */
    static hasSavedState(): boolean {
        return localStorage.getItem(STORAGE_KEY) !== null;
    }

    /**
     * Export cube state as a plain string for manual backup.
     * @param state The cube state to export.
     * @param moveHistory Optional move history to export with the state.
     * @returns Plain string representation of the state.
     */
    static exportState(state: CubeState, moveHistory?: MoveHistory): string {
        return this.stateToString(state, moveHistory);
    }

    /**
     * Validate a state string format.
     * @param stateString The string to validate.
     * @returns True if valid, false otherwise.
     */
    static validateStateString(stateString: string): boolean {
        return this.parseStateString(stateString) !== null;
    }

    /**
     * Download cube state as a text file.
     * @param state The cube state to download.
     * @param moveHistory Optional move history to include in the file.
     * @param filename Optional filename (defaults to timestamp-based name).
     */
    static downloadState(state: CubeState, moveHistory?: MoveHistory, filename?: string): void {
        const stateString = this.exportState(state, moveHistory);
        const blob = new Blob([stateString], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `rubiks-cube-state-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Upload and import cube state string from a file.
     * @returns Promise that resolves to object with state and optional move history, or null.
     */
    static async uploadState(): Promise<{ state: CubeState; moveHistory?: MoveHistory } | null> {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.cube';

            input.onchange = async (e: Event) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) {
                    resolve(null);
                    return;
                }

                const text = await file.text();
                const trimmed = text.trim();

                // Validate the format.
                if (!this.validateStateString(trimmed)) {
                    logger.error('Invalid state string format');
                    resolve(null);
                    return;
                }

                // Parse the state string.
                const result = this.stringToState(trimmed);
                resolve(result);
            };

            input.click();
        });
    }
}
