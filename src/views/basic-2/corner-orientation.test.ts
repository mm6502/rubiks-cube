// Test to reproduce corner cubie orientation regression after animated moves
// on non-3x3 cubes in Basic 2 view.
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('corner-orientation - verify sticker currentFace after non-3 moves', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Verify that after a U move on 4x4, the corner cubies have correct
     * sticker currentFace values (not wrong orientation).
     */
    it('4x4: corner cubies have correct currentFace values after U move', async () => {
        const { CubeController } = await import('@/cube-controller');
        const model = new CubeController(4);

        // Apply U move
        const result = model.applyMove('U');
        expect(result).not.toBeNull();
        expect(result!.movedCubies.after.length).toBeGreaterThan(0);

        // Get a corner cubie from the moved set (corners have 3 stickers)
        const corner = result!.movedCubies.after.find(c => c.stickers.size === 3);
        expect(corner).toBeDefined();

        if (!corner) return;

        // Verify all stickers have valid currentFace values
        const stickerFaces: string[] = [];
        corner.stickers.forEach(sticker => {
            expect(sticker.currentFace).toBeDefined();
            expect(['F', 'B', 'R', 'L', 'U', 'D']).toContain(sticker.currentFace);
            stickerFaces.push(sticker.currentFace);
        });

        // Each corner should have exactly 3 different faces
        expect(stickerFaces.length).toBe(3);
        expect(new Set(stickerFaces).size).toBe(3);

        // Verify the sticker faces match what's available at corner position
        const expectedFaces = getExpectedCornerFaces(corner.position, 4);
        const actual = new Set(stickerFaces);
        const expected = new Set(expectedFaces);
        expect(actual).toEqual(expected);
    });

    /**
     * Verify that after a U move on 4x4, rendering the cubies with updateCubiePositions
     * produces sticker elements with correct data-basic-face attributes.
     */
    it('4x4: renderCubieFaces produces correct sticker DOM after U move', async () => {
        const { CubeController } = await import('@/cube-controller');
        const { buildCubieElement } = await import('./cubie-rendering');
        const model = new CubeController(4);

        const styles = {
            cubie: 'cubie',
            sticker: 'sticker',
            'cubie-interior': 'cubie-interior',
        };

        // Apply U move
        const result = model.applyMove('U');
        expect(result).not.toBeNull();

        // Get a corner cubie
        const corner = result!.movedCubies.after.find(c => c.stickers.size === 3);
        expect(corner).toBeDefined();

        if (!corner) return;

        // Build DOM element with the corner cubie
        const cubieEl = buildCubieElement(corner, 100, 4, styles, vi.fn());

        // Verify sticker elements have correct data-basic-face attributes
        const stickerEls = Array.from(cubieEl.querySelectorAll('.sticker'));
        expect(stickerEls.length).toBe(3);

        const facesInDOM = stickerEls.map(el =>
            (el as HTMLElement).getAttribute('data-basic-face')
        );
        const expectedFaces = getExpectedCornerFaces(corner.position, 4);

        expect(facesInDOM.sort()).toEqual(expectedFaces.sort());
    });

    /**
     * Simulate what happens with consecutive moves: apply U move twice
     * and verify that the second move's data is correct (to check if
     * stale data accumulates).
     */
    it('4x4: consecutive U moves preserve correct corner orientation', async () => {
        const { CubeController } = await import('@/cube-controller');
        const model = new CubeController(4);

        // Apply first U move
        const result1 = model.applyMove('U');
        expect(result1).not.toBeNull();

        // Apply second U move
        const result2 = model.applyMove('U');
        expect(result2).not.toBeNull();

        // After two U moves, corners should have rotated back 180 degrees
        // Check that all moved cubies in second move have valid currentFace values
        for (const cubie of result2!.movedCubies.after) {
            if (cubie.stickers.size !== 3) continue; // Only check corners

            cubie.stickers.forEach(sticker => {
                expect(['F', 'B', 'R', 'L', 'U', 'D']).toContain(sticker.currentFace);
            });

            // Verify faces match position
            const stickerFaces: string[] = [];
            cubie.stickers.forEach(s => stickerFaces.push(s.currentFace));
            const expectedFaces = getExpectedCornerFaces(cubie.position, 4);
            expect(new Set(stickerFaces)).toEqual(new Set(expectedFaces));
        }
    });

    /**
     * Test R move (X axis rotation) - corners should have correct orientation
     */
    it('4x4: corner cubies have correct currentFace values after R move', async () => {
        const { CubeController } = await import('@/cube-controller');
        const model = new CubeController(4);

        // Apply R move (X axis)
        const result = model.applyMove('R');
        expect(result).not.toBeNull();
        expect(result!.movedCubies.after.length).toBeGreaterThan(0);

        // Check all corners in R-layer
        for (const cubie of result!.movedCubies.after) {
            if (cubie.stickers.size !== 3) continue; // Only corners

            const stickerFaces: string[] = [];
            cubie.stickers.forEach(sticker => {
                expect(sticker.currentFace).toBeDefined();
                expect(['F', 'B', 'R', 'L', 'U', 'D']).toContain(sticker.currentFace);
                stickerFaces.push(sticker.currentFace);
            });

            // Verify correct number and variety of faces
            expect(stickerFaces.length).toBe(3);
            expect(new Set(stickerFaces).size).toBe(3);

            // Verify the sticker faces match what's available at corner position
            const expectedFaces = getExpectedCornerFaces(cubie.position, 4);
            expect(new Set(stickerFaces)).toEqual(new Set(expectedFaces));
        }
    });
});

/**
 * Helper: get expected corner faces for a 3D position on a cube
 */
function getExpectedCornerFaces(
    position: { x: number; y: number; z: number },
    cubeSize: number
): string[] {
    const max = cubeSize - 1;
    const faces: string[] = [];

    if (position.x === 0) faces.push('L');
    else if (position.x === max) faces.push('R');

    if (position.y === 0) faces.push('D');
    else if (position.y === max) faces.push('U');

    if (position.z === 0) faces.push('F');
    else if (position.z === max) faces.push('B');

    return faces;
}
