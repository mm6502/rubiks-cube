// Unit tests for cubie-rendering.ts — covers face transforms and the new
// per-cubie interior-face rendering for Basic 2.
import { describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import { buildCubieElement, getFaceTransform, updateCubiePositions } from './cubie-rendering';

const styles: Record<string, string> = {
    cubie: 'cubie',
    sticker: 'sticker',
    'cubie-interior': 'cubie-interior',
};

function createCubie(stickerFaces: Face[]): any {
    return {
        id: 'cubie-1',
        position: { x: 0, y: 0, z: 0 },
        stickers: stickerFaces.map((face, index) => ({
            id: `${face}-${index}` as any,
            currentFace: face,
            color: 'white',
        })),
    };
}

describe('cubie-rendering - getFaceTransform', () => {
    it('returns a plain translateZ for Face.F', () => {
        expect(getFaceTransform(Face.F, 150)).toBe('translateZ(150px)');
    });

    it('returns a 180deg Y rotation + translateZ for Face.B', () => {
        expect(getFaceTransform(Face.B, 150)).toBe('rotateY(180deg) translateZ(150px)');
    });

    it('returns a 90deg Y rotation + translateZ for Face.R', () => {
        expect(getFaceTransform(Face.R, 150)).toBe('rotateY(90deg) translateZ(150px)');
    });

    it('returns a -90deg Y rotation + translateZ for Face.L', () => {
        expect(getFaceTransform(Face.L, 150)).toBe('rotateY(-90deg) translateZ(150px)');
    });

    it('returns a 90deg X rotation + translateZ for Face.U', () => {
        expect(getFaceTransform(Face.U, 150)).toBe('rotateX(90deg) translateZ(150px)');
    });

    it('returns a -90deg X rotation + translateZ for Face.D', () => {
        expect(getFaceTransform(Face.D, 150)).toBe('rotateX(-90deg) translateZ(150px)');
    });

    it('does not throw and returns a valid transform string for halfSize = 0', () => {
        expect(() => getFaceTransform(Face.F, 0)).not.toThrow();
        expect(getFaceTransform(Face.F, 0)).toBe('translateZ(0px)');
    });
});

describe('cubie-rendering - interior faces', () => {
    it('creates one interior face per non-sticker side for corner, edge, and face-center cubies', () => {
        const cornerCubie = createCubie([Face.F, Face.U, Face.R]);
        const edgeCubie = createCubie([Face.F, Face.U]);
        const centerCubie = createCubie([Face.F]);

        const cornerEl = buildCubieElement(cornerCubie, 100, 3, styles, vi.fn());
        const edgeEl = buildCubieElement(edgeCubie, 100, 3, styles, vi.fn());
        const centerEl = buildCubieElement(centerCubie, 100, 3, styles, vi.fn());

        expect(cornerEl.querySelectorAll('.cubie-interior')).toHaveLength(3);
        expect(edgeEl.querySelectorAll('.cubie-interior')).toHaveLength(4);
        expect(centerEl.querySelectorAll('.cubie-interior')).toHaveLength(5);
    });

    it('marks each interior face as non-interactive and aria-hidden, with the cube-interior color token', () => {
        const cubie = createCubie([Face.F, Face.U]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, vi.fn());
        const interiorFaces = Array.from(
            cubieEl.querySelectorAll('.cubie-interior')
        ) as HTMLElement[];

        expect(interiorFaces).not.toHaveLength(0);
        interiorFaces.forEach(face => {
            expect(face.getAttribute('aria-hidden')).toBe('true');
            expect(face.style.pointerEvents).toBe('none');
            expect(face.style.backgroundColor).toBe('var(--color-domain-cube-interior)');
        });
    });

    it('does not fire the sticker callback when an interior face is clicked', () => {
        const onStickerSelected = vi.fn();
        const cubie = createCubie([Face.F]);
        const cubieEl = buildCubieElement(cubie, 100, 3, styles, onStickerSelected);
        const interiorFace = cubieEl.querySelector('.cubie-interior') as HTMLElement;

        interiorFace.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onStickerSelected).not.toHaveBeenCalled();
    });

    it('rebuilds interior faces when cubie stickers change during a position update', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        cubeElement.style.height = '300px';
        (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize = 100;

        const initialCubie = createCubie([Face.F, Face.U, Face.R]);
        const initialEl = buildCubieElement(initialCubie, 100, 3, styles, vi.fn());
        cubeElement.appendChild(initialEl);

        const updatedCubie = createCubie([Face.B]);
        updatedCubie.id = initialCubie.id;
        updateCubiePositions(cubeElement, { after: [updatedCubie] });

        const rebuiltInteriorFaces = cubeElement.querySelectorAll('.cubie-interior');
        expect(rebuiltInteriorFaces).toHaveLength(5);
    });

    it('keeps the sticker-selection callback wired after a position update rebuilds sticker faces', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        cubeElement.style.height = '300px';
        (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize = 100;

        const initialCubie = createCubie([Face.F, Face.U, Face.R]);
        const initialEl = buildCubieElement(initialCubie, 100, 3, styles, vi.fn());
        cubeElement.appendChild(initialEl);

        const updatedCubie = createCubie([Face.F, Face.U, Face.R]);
        updatedCubie.id = initialCubie.id;
        const onStickerSelected = vi.fn();
        updateCubiePositions(cubeElement, { after: [updatedCubie] }, styles, onStickerSelected);

        const stickerFace = cubeElement.querySelector('[data-sticker-id]') as HTMLElement;
        stickerFace.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onStickerSelected).toHaveBeenCalledTimes(1);
    });
});
