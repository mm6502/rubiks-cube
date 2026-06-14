// Per-cubie DOM rendering for Basic 2 view
import { Face, resolveCubeColor } from '@/cube/types';
import type { Position3D, ReadonlyCubie, StickerId } from '@/cube/types';
import { getPositionKey } from '@/cube/utils/coordinates';

import type { BasicViewInternalData } from './basic-2-view';

/**
 * Build a single cubie DOM element with its sticker faces.
 *
 * Each cubie is a `div.cubie` containing child `div.sticker` elements,
 * one per visible face.  Colors never change — only positions do.
 *
 * @param cubie - The cubie data (position, stickers, etc.)
 * @param cubieSize - Pixel size of one cubie edge
 * @param styles - CSS module styles object
 * @param onStickerSelected - Callback when a sticker face is clicked
 * @returns The constructed `div.cubie` element
 */
export function buildCubieElement(
    cubie: ReadonlyCubie,
    cubieSize: number,
    cubeSize: number,
    styles: Record<string, string>,
    onStickerSelected: (id: StickerId) => void
): HTMLElement {
    const cubieEl = document.createElement('div');
    cubieEl.className = styles['cubie'] ?? '';
    cubieEl.setAttribute('data-cubie-id', cubie.id);

    // Calculate 3D position matching the basic view coordinate system:
    // X: 0 → faceSize (left to right), matches face grid
    // Y: 0 → faceSize (top to bottom), model Y is inverted (model y=max is CSS top)
    // Z: centered at 0 (±faceSize/2), matching face translateZ(±halfSize)
    const cubieHalf = cubieSize / 2;
    const cx = cubie.position.x * cubieSize;
    const cy = (cubeSize - 1 - cubie.position.y) * cubieSize;
    const cz = ((cubeSize - 1) / 2 - cubie.position.z) * cubieSize;

    cubieEl.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;
    cubieEl.style.width = `${cubieSize}px`;
    cubieEl.style.height = `${cubieSize}px`;

    // Create sticker face divs for each visible face
    cubie.stickers.forEach(sticker => {
        const faceEl = document.createElement('div');
        faceEl.className = styles['sticker'] ?? '';
        faceEl.setAttribute('data-sticker-id', sticker.id);
        faceEl.setAttribute('data-basic-face', sticker.currentFace);
        faceEl.style.backgroundColor = resolveCubeColor(sticker.color);

        // Set face transform based on current face
        faceEl.style.transform = getFaceTransform(sticker.currentFace, cubieHalf);

        // Add click listener
        faceEl.addEventListener('click', () => onStickerSelected(sticker.id));

        cubieEl.appendChild(faceEl);
    });

    return cubieEl;
}

/**
 * Get the CSS transform for a sticker face based on its current face.
 */
function getFaceTransform(face: Face, halfSize: number): string {
    switch (face) {
        case Face.F:
            return `translateZ(${halfSize}px)`;
        case Face.B:
            return `rotateY(180deg) translateZ(${halfSize}px)`;
        case Face.R:
            return `rotateY(90deg) translateZ(${halfSize}px)`;
        case Face.L:
            return `rotateY(-90deg) translateZ(${halfSize}px)`;
        case Face.U:
            return `rotateX(90deg) translateZ(${halfSize}px)`;
        case Face.D:
            return `rotateX(-90deg) translateZ(${halfSize}px)`;
        default:
            return `translateZ(${halfSize}px)`;
    }
}

/**
 * Check if a cubie is a surface cubie (has at least one coordinate at 0 or max).
 */
function isSurfaceCubie(position: Position3D, cubeSize: number): boolean {
    const max = cubeSize - 1;
    return (
        position.x === 0 ||
        position.x === max ||
        position.y === 0 ||
        position.y === max ||
        position.z === 0 ||
        position.z === max
    );
}

/**
 * Initialize all cubie DOM elements for the cube.
 *
 * Creates one `div.cubie` per surface cubie and appends them to the cube element.
 * Works for any cube size (3×3, 4×4, etc.).
 *
 * @param state - The basic view internal data
 * @param size - Visual size of the cube in pixels
 */
export function initializeCubies(state: BasicViewInternalData, size: number): void {
    if (!state.cubeElement || !state.model) return;

    const cubeState = state.model.getCurrentState();
    const cubeSize = cubeState.cubeSize ?? 3;
    const cubieSize = size / cubeSize;

    // Clear existing cubies
    const existingCubies = state.cubeElement.querySelectorAll('[data-cubie-id]');
    existingCubies.forEach(el => el.remove());

    // Create cubies for all surface positions
    for (let x = 0; x < cubeSize; x++) {
        for (let y = 0; y < cubeSize; y++) {
            for (let z = 0; z < cubeSize; z++) {
                const position = { x, y, z };

                // Skip interior cubies
                if (!isSurfaceCubie(position, cubeSize)) continue;

                // Get cubie from model by position
                const cubie = getCubieAtPosition(cubeState, position);
                if (!cubie) continue;

                // Build and append cubie element
                const cubieEl = buildCubieElement(cubie, cubieSize, cubeSize, state.styles, () => {
                    // Sticker selection handled by touch handler
                });

                state.cubeElement.appendChild(cubieEl);
            }
        }
    }

    // Store cubie size for later use
    (state as BasicViewInternalData & { cubieSize?: number }).cubieSize = cubieSize;
}

/**
 * Get a cubie at a specific position from the cube state.
 */
function getCubieAtPosition(
    cubeState: import('@/cube/types').CubeState,
    position: Position3D
): ReadonlyCubie | undefined {
    const posKey = getPositionKey(position, cubeState.cubeSize);
    const cubie = cubeState.cubiesByPosition.get(posKey);
    return cubie;
}

/**
 * Update cubie positions and sticker faces after a move.
 *
 * Called after animation completes or when skipping animation.
 * Updates each moved cubie's `translate3d` and sticker face transforms.
 *
 * @param cubeElement - The cube DOM element
 * @param movedCubies - The after-state cubies from a move
 */
export function updateCubiePositions(
    cubeElement: HTMLElement,
    movedCubies: { after: ReadonlyCubie[] }
): void {
    const cubeSize = getCubeSizeFromElement(cubeElement);

    movedCubies.after.forEach(cubie => {
        // Find the cubie DOM element
        const cubieEl = cubeElement.querySelector(`[data-cubie-id="${cubie.id}"]`) as HTMLElement;
        if (!cubieEl) return;

        // Calculate new position
        const cubieSize = cubeElement.style.width
            ? parseFloat(cubeElement.style.width) / cubeSize
            : 100;
        const cubieHalf = cubieSize / 2;

        const cx = cubie.position.x * cubieSize;
        const cy = (cubeSize - 1 - cubie.position.y) * cubieSize;
        const cz = ((cubeSize - 1) / 2 - cubie.position.z) * cubieSize;

        cubieEl.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;

        // Update sticker faces
        cubie.stickers.forEach(sticker => {
            const faceEl = cubieEl.querySelector(
                `[data-sticker-id="${sticker.id}"]`
            ) as HTMLElement;
            if (!faceEl) return;

            // Update face transform
            faceEl.style.transform = getFaceTransform(sticker.currentFace, cubieHalf);
            faceEl.setAttribute('data-basic-face', sticker.currentFace);
        });
    });
}

/**
 * Get cube size from cube element style width.
 */
function getCubeSizeFromElement(cubeElement: HTMLElement): number {
    // The cube element's width is set to the visual size; cubeSize is stored
    // as a data attribute or derived from cubieSize stored on the element.
    const cubieSize = (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize;
    if (cubieSize && cubeElement.style.width) {
        return Math.round(parseFloat(cubeElement.style.width) / cubieSize);
    }
    return 3; // default fallback
}
