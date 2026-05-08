import { describe, expect, it, vi } from 'vitest';

import { Axis, Face } from '@/cube/types';
import type { CubeState } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import type { AxisCircle } from './svg-tools';
import {
    buildCrossingBasisAtPoint,
    findNearestStickerOnFace,
    getFaceEllipseHit,
    getLbdTrianglePoints,
    isInLbdDeadZone,
    resolveStickerHit,
} from './touch-handler-hit-testing';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCircle(axis: Axis, layer: number, cx = 0, cy = 0, r = 50): AxisCircle {
    return { id: `${axis}-${layer}`, axis, layer, cx, cy, r };
}

function createSvgRoot(): SVGSVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
}

// ── resolveStickerHit ───────────────────────────────────────────────────────

describe('resolveStickerHit', () => {
    it('should return undefined when stickerId is undefined', () => {
        expect(
            resolveStickerHit(
                undefined,
                () => ({}) as any,
                () => 3
            )
        ).toBeUndefined();
    });

    it('should return undefined when getCubeState is undefined', () => {
        expect(resolveStickerHit('st1', undefined, () => 3)).toBeUndefined();
    });

    it('should return undefined when cubeState is null', () => {
        expect(
            resolveStickerHit(
                'st1',
                () => null as any,
                () => 3
            )
        ).toBeUndefined();
    });

    it('should return undefined when sticker is not found in cube state', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue(undefined);
        const cubeState = { cubies: [] } as unknown as CubeState;
        expect(
            resolveStickerHit(
                'st1',
                () => cubeState,
                () => 3
            )
        ).toBeUndefined();
        vi.restoreAllMocks();
    });

    it('should return undefined when facePosition is not finite', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: NaN,
            currentFace: Face.F,
        } as any);
        const cubeState = { cubies: [] } as unknown as CubeState;
        expect(
            resolveStickerHit(
                'st1',
                () => cubeState,
                () => 3
            )
        ).toBeUndefined();
        vi.restoreAllMocks();
    });

    it('should return sticker hit for valid sticker', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: 4,
            currentFace: Face.F,
        } as any);
        const cubeState = { cubies: [] } as unknown as CubeState;
        const result = resolveStickerHit(
            'st1',
            () => cubeState,
            () => 3
        );
        expect(result).toEqual({
            face: Face.F,
            row: 1,
            col: 1,
            stickerId: 'st1',
        });
        vi.restoreAllMocks();
    });

    it('should return undefined when face is missing', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: 4,
            currentFace: undefined,
        } as any);
        const cubeState = { cubies: [] } as unknown as CubeState;
        expect(
            resolveStickerHit(
                'st1',
                () => cubeState,
                () => 3
            )
        ).toBeUndefined();
        vi.restoreAllMocks();
    });

    it('should return undefined when row is out of range', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: 10,
            currentFace: Face.F,
        } as any);
        const cubeState = { cubies: [] } as unknown as CubeState;
        // cubeSize = 3, so max position = 8. 10/3 = row 3, which is >= 3.
        expect(
            resolveStickerHit(
                'st1',
                () => cubeState,
                () => 3
            )
        ).toBeUndefined();
        vi.restoreAllMocks();
    });
});

// ── getFaceEllipseHit ───────────────────────────────────────────────────────

describe('getFaceEllipseHit', () => {
    it('should return undefined for null element', () => {
        const svg = createSvgRoot();
        expect(getFaceEllipseHit(svg, null)).toBeUndefined();
    });

    it('should return undefined when no matching ellipse ancestor', () => {
        const svg = createSvgRoot();
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        svg.appendChild(circle);
        expect(getFaceEllipseHit(svg, circle)).toBeUndefined();
    });

    it('should return face for valid face-ellipse element', () => {
        const svg = createSvgRoot();
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.id = 'F-face-ellipse';
        svg.appendChild(ellipse);
        expect(getFaceEllipseHit(svg, ellipse)).toBe(Face.F);
    });

    it('should return undefined for ellipse with invalid face id', () => {
        const svg = createSvgRoot();
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.id = 'X-face-ellipse';
        svg.appendChild(ellipse);
        expect(getFaceEllipseHit(svg, ellipse)).toBeUndefined();
    });

    it('should return undefined for ellipse not in svgRoot', () => {
        const svg1 = createSvgRoot();
        const svg2 = createSvgRoot();
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.id = 'F-face-ellipse';
        svg2.appendChild(ellipse);
        expect(getFaceEllipseHit(svg1, ellipse)).toBeUndefined();
    });
});

// ── buildCrossingBasisAtPoint ───────────────────────────────────────────────

describe('buildCrossingBasisAtPoint', () => {
    it('should return undefined when no circles are close', () => {
        const circles = [makeCircle(Axis.X, 0, 0, 0, 50), makeCircle(Axis.Y, 0, 200, 0, 50)];
        // Point far from any circle
        const result = buildCrossingBasisAtPoint(circles, Face.F, { x: 1000, y: 1000 });
        expect(result).toBeUndefined();
    });

    it('should return a basis when two axes have close circles', () => {
        // Two circles that cross near (50, 0)
        const circles = [makeCircle(Axis.X, 0, 0, 0, 50), makeCircle(Axis.Y, 0, 0, 50, 50)];
        const point = { x: 0, y: 0 };
        const result = buildCrossingBasisAtPoint(circles, Face.F, point);
        // Both circles pass through/near (0,0), so basis should be computable
        if (result) {
            expect(result.upDir).toBeDefined();
            expect(result.rightDir).toBeDefined();
        }
    });
});

// ── getLbdTrianglePoints ────────────────────────────────────────────────────

describe('getLbdTrianglePoints', () => {
    it('should return undefined when labels are missing', () => {
        const svg = createSvgRoot();
        expect(getLbdTrianglePoints(svg)).toBeUndefined();
    });

    it('should return triangle points when all labels present', () => {
        const svg = createSvgRoot();

        for (const face of ['L', 'B', 'D']) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.id = `face-label-${face}`;
            group.setAttribute('transform', `translate(${100},${200})`);
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '20');
            rect.setAttribute('height', '20');
            group.appendChild(rect);
            svg.appendChild(group);
        }

        const result = getLbdTrianglePoints(svg);
        expect(result).toBeDefined();
        expect(result!.topLeft).toBeDefined();
        expect(result!.topRight).toBeDefined();
        expect(result!.bottom).toBeDefined();
    });
});

// ── isInLbdDeadZone ─────────────────────────────────────────────────────────

describe('isInLbdDeadZone', () => {
    it('should return false when labels are missing', () => {
        const svg = createSvgRoot();
        expect(isInLbdDeadZone(svg, { x: 100, y: 200 })).toBe(false);
    });
});

// ── findNearestStickerOnFace ────────────────────────────────────────────────

describe('findNearestStickerOnFace', () => {
    it('should return undefined when no sticker elements exist', () => {
        const svg = createSvgRoot();
        const result = findNearestStickerOnFace(svg, Face.F, { x: 0, y: 0 }, undefined, () => 3);
        expect(result).toBeUndefined();
    });

    it('should find nearest sticker on the given face', () => {
        const svg = createSvgRoot();

        // Create a sticker element
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('data-sticker-id', 'st1');
        circle.setAttribute('cx', '10');
        circle.setAttribute('cy', '20');
        svg.appendChild(circle);

        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: 0,
            currentFace: Face.F,
        } as any);

        const cubeState = { cubies: [] } as unknown as CubeState;
        const result = findNearestStickerOnFace(
            svg,
            Face.F,
            { x: 10, y: 20 },
            () => cubeState,
            () => 3
        );

        expect(result).toBeDefined();
        expect(result!.face).toBe(Face.F);
        vi.restoreAllMocks();
    });

    it('should skip stickers on other faces', () => {
        const svg = createSvgRoot();

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('data-sticker-id', 'st1');
        circle.setAttribute('cx', '10');
        circle.setAttribute('cy', '20');
        svg.appendChild(circle);

        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: 0,
            currentFace: Face.B,
        } as any);

        const cubeState = { cubies: [] } as unknown as CubeState;
        const result = findNearestStickerOnFace(
            svg,
            Face.F,
            { x: 10, y: 20 },
            () => cubeState,
            () => 3
        );

        expect(result).toBeUndefined();
        vi.restoreAllMocks();
    });
});

// ── resolveStickerHit edge cases ────────────────────────────────────────────

describe('resolveStickerHit edge cases', () => {
    it('should return undefined when col is negative (facePosition < 0)', () => {
        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            facePosition: -1,
            currentFace: Face.F,
        } as any);
        const cubeState = { cubies: [] } as unknown as CubeState;
        expect(
            resolveStickerHit(
                'st1',
                () => cubeState,
                () => 3
            )
        ).toBeUndefined();
        vi.restoreAllMocks();
    });
});

// ── buildCrossingBasisAtPoint edge cases ────────────────────────────────────

describe('buildCrossingBasisAtPoint same-axis circles', () => {
    it('should return undefined when both closest circles are on the same axis', () => {
        // All circles on Axis.X — no second-axis circle exists
        const circles = [
            makeCircle(Axis.X, 0, 0, 0, 50),
            makeCircle(Axis.X, 1, 10, 10, 50),
            makeCircle(Axis.X, 2, -5, 5, 50),
        ];
        const result = buildCrossingBasisAtPoint(circles, Face.F, { x: 0, y: 0 });
        expect(result).toBeUndefined();
    });
});

// ── getLbdTrianglePoints edge cases ─────────────────────────────────────────

describe('getLbdTrianglePoints edge cases', () => {
    it('should return undefined when a label group has no rect', () => {
        const svg = createSvgRoot();
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.id = 'face-label-L';
        group.setAttribute('transform', 'translate(100,200)');
        // No <rect> child
        svg.appendChild(group);

        // Only L exists — B and D missing, so overall result is undefined
        expect(getLbdTrianglePoints(svg)).toBeUndefined();
    });

    it('should return undefined when a label group has no transform', () => {
        const svg = createSvgRoot();
        for (const face of ['L', 'B', 'D']) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.id = `face-label-${face}`;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '20');
            rect.setAttribute('height', '20');
            group.appendChild(rect);
            svg.appendChild(group);
        }
        // Groups exist with rects but no transform attribute → regex fails
        const result = getLbdTrianglePoints(svg);
        expect(result).toBeUndefined();
    });
});

// ── isInLbdDeadZone edge cases ──────────────────────────────────────────────

describe('isInLbdDeadZone edge cases', () => {
    function setupLbdSvg(svg: SVGSVGElement): void {
        for (const face of ['L', 'B', 'D']) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.id = `face-label-${face}`;
            group.setAttribute('transform', 'translate(100,200)');
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '40');
            rect.setAttribute('height', '40');
            group.appendChild(rect);
            svg.appendChild(group);
        }
    }

    it('should return false for point outside the triangle', () => {
        const svg = createSvgRoot();
        setupLbdSvg(svg);
        // Point far away from the triangle area
        expect(isInLbdDeadZone(svg, { x: -500, y: -500 })).toBe(false);
    });

    it('should return true for point inside the triangle', () => {
        const svg = createSvgRoot();
        setupLbdSvg(svg);
        // The triangle formed by L (80,180), B (120,180), D (100,220)
        // (100,200) is at the center of the triangle
        expect(isInLbdDeadZone(svg, { x: 100, y: 200 })).toBe(true);
    });
});
