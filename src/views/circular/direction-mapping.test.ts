import { describe, expect, it } from 'vitest';

import { Face, QuarterTurn } from '@/cube/types';
import { DragDirection } from '@/interaction/types';

import {
    FACE_TOP_DIRECTION_HINTS,
    FaceScreenBasis,
    buildFaceScreenBasisByFace,
    buildFaceScreenBasisFromHint,
    createCircularDirectionRemapper,
    mapDirectionToFaceBasis,
    tiltAngleFromHint,
} from './direction-mapping';

describe('FACE_TOP_DIRECTION_HINTS', () => {
    it('contains an entry for every face', () => {
        expect(Object.keys(FACE_TOP_DIRECTION_HINTS)).toHaveLength(6);
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            expect(FACE_TOP_DIRECTION_HINTS[face]).toBeDefined();
        }
    });

    it('has non-zero vectors for every face', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const { x, y } = FACE_TOP_DIRECTION_HINTS[face];
            expect(Math.hypot(x, y)).toBeGreaterThan(0);
        }
    });
});

describe('mapDirectionToFaceBasis', () => {
    // Identity basis: upDir = screen-up, rightDir = screen-right
    const identityBasis: FaceScreenBasis = {
        upDir: { x: 0, y: -1 },
        rightDir: { x: 1, y: 0 },
    };

    it('maps RIGHT to RIGHT with identity basis', () => {
        expect(mapDirectionToFaceBasis(DragDirection.RIGHT, identityBasis)).toBe(
            DragDirection.RIGHT
        );
    });

    it('maps LEFT to LEFT with identity basis', () => {
        expect(mapDirectionToFaceBasis(DragDirection.LEFT, identityBasis)).toBe(DragDirection.LEFT);
    });

    it('maps UP to UP with identity basis', () => {
        expect(mapDirectionToFaceBasis(DragDirection.UP, identityBasis)).toBe(DragDirection.UP);
    });

    it('maps DOWN to DOWN with identity basis', () => {
        expect(mapDirectionToFaceBasis(DragDirection.DOWN, identityBasis)).toBe(DragDirection.DOWN);
    });

    it('remaps RIGHT to LEFT when basis is flipped horizontally', () => {
        const flippedBasis: FaceScreenBasis = {
            upDir: { x: 0, y: -1 },
            rightDir: { x: -1, y: 0 },
        };
        expect(mapDirectionToFaceBasis(DragDirection.RIGHT, flippedBasis)).toBe(DragDirection.LEFT);
    });

    it('remaps UP to DOWN when basis is flipped vertically', () => {
        const flippedBasis: FaceScreenBasis = {
            upDir: { x: 0, y: 1 },
            rightDir: { x: 1, y: 0 },
        };
        expect(mapDirectionToFaceBasis(DragDirection.UP, flippedBasis)).toBe(DragDirection.DOWN);
    });

    it('remaps RIGHT to UP when basis is rotated 90° CCW', () => {
        // upDir = screen-right, rightDir = screen-down
        // dragging RIGHT (screen +x) → dot with upDir={1,0} = 1 → best candidate is UP
        const rotatedBasis: FaceScreenBasis = {
            upDir: { x: 1, y: 0 },
            rightDir: { x: 0, y: 1 },
        };
        expect(mapDirectionToFaceBasis(DragDirection.RIGHT, rotatedBasis)).toBe(DragDirection.UP);
    });
});

describe('buildFaceScreenBasisFromHint', () => {
    it('returns a FaceScreenBasis for every face', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const basis = buildFaceScreenBasisFromHint(face);
            expect(basis).toHaveProperty('upDir');
            expect(basis).toHaveProperty('rightDir');
        }
    });

    it('returns normalized upDir (length ≈ 1)', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const { upDir } = buildFaceScreenBasisFromHint(face);
            expect(Math.hypot(upDir.x, upDir.y)).toBeCloseTo(1, 5);
        }
    });

    it('returns normalized rightDir (length ≈ 1)', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const { rightDir } = buildFaceScreenBasisFromHint(face);
            expect(Math.hypot(rightDir.x, rightDir.y)).toBeCloseTo(1, 5);
        }
    });

    it('upDir and rightDir are perpendicular (dot ≈ 0)', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const { upDir, rightDir } = buildFaceScreenBasisFromHint(face);
            const dot = upDir.x * rightDir.x + upDir.y * rightDir.y;
            expect(Math.abs(dot)).toBeCloseTo(0, 5);
        }
    });
});

describe('buildFaceScreenBasisByFace', () => {
    it('returns a basis for all 6 faces', () => {
        const result = buildFaceScreenBasisByFace();
        const faces = [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R];
        for (const face of faces) {
            expect(result[face]).toBeDefined();
            expect(result[face]).toHaveProperty('upDir');
            expect(result[face]).toHaveProperty('rightDir');
        }
    });

    it('produced bases match buildFaceScreenBasisFromHint', () => {
        const byFace = buildFaceScreenBasisByFace();
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const fromHint = buildFaceScreenBasisFromHint(face);
            expect(byFace[face].upDir.x).toBeCloseTo(fromHint.upDir.x, 5);
            expect(byFace[face].upDir.y).toBeCloseTo(fromHint.upDir.y, 5);
            expect(byFace[face].rightDir.x).toBeCloseTo(fromHint.rightDir.x, 5);
            expect(byFace[face].rightDir.y).toBeCloseTo(fromHint.rightDir.y, 5);
        }
    });
});

describe('createCircularDirectionRemapper', () => {
    it('returns a function', () => {
        expect(typeof createCircularDirectionRemapper()).toBe('function');
    });

    it('remapper falls back to original direction for unknown face', () => {
        const remapper = createCircularDirectionRemapper();
        // Pass an unknown face value — no entry in basisByFace → returns original direction
        const unknownFace = 'X' as unknown as Face;
        expect(remapper(DragDirection.RIGHT, unknownFace)).toBe(DragDirection.RIGHT);
    });

    it('remapper returns a valid DragDirection for every face and direction', () => {
        const remapper = createCircularDirectionRemapper();
        const directions = [
            DragDirection.UP,
            DragDirection.DOWN,
            DragDirection.LEFT,
            DragDirection.RIGHT,
        ];
        const faces = [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R];
        const validDirections = new Set<string>(directions);

        for (const face of faces) {
            for (const dir of directions) {
                const result = remapper(dir, face);
                expect(validDirections.has(result)).toBe(true);
            }
        }
    });

    it('Face.F with identity-like hint maps directions consistently', () => {
        const remapper = createCircularDirectionRemapper();
        // Verify same input produces same output (deterministic)
        const r1 = remapper(DragDirection.UP, Face.F);
        const r2 = remapper(DragDirection.UP, Face.F);
        expect(r1).toBe(r2);
    });
});

describe('tiltAngleFromHint', () => {
    it('returns 0° for a pure screen-up vector {0, -1}', () => {
        expect(tiltAngleFromHint({ x: 0, y: -1 })).toBeCloseTo(0, 5);
    });

    it('returns 90° for a pure screen-right vector {1, 0}', () => {
        expect(tiltAngleFromHint({ x: 1, y: 0 })).toBeCloseTo(QuarterTurn.QUARTER, 5);
    });

    it('returns -90° for a pure screen-left vector {-1, 0}', () => {
        expect(tiltAngleFromHint({ x: -1, y: 0 })).toBeCloseTo(QuarterTurn.QUARTER_NEG, 5);
    });

    it('returns 180° for a pure screen-down vector {0, 1}', () => {
        expect(Math.abs(tiltAngleFromHint({ x: 0, y: 1 }))).toBeCloseTo(QuarterTurn.HALF, 5);
    });

    it('returns a value in [-180, 180] for all face hints', () => {
        for (const face of [Face.U, Face.D, Face.F, Face.B, Face.L, Face.R]) {
            const angle = tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[face]);
            expect(angle).toBeGreaterThanOrEqual(QuarterTurn.HALF_NEG);
            expect(angle).toBeLessThanOrEqual(QuarterTurn.HALF);
        }
    });

    it('returns correct approximate angle for Face.F hint (~13.9°)', () => {
        const angle = tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.F]);
        expect(angle).toBeCloseTo(13.9, 0);
    });

    it('returns correct approximate angle for Face.L hint (~76.1°)', () => {
        const angle = tiltAngleFromHint(FACE_TOP_DIRECTION_HINTS[Face.L]);
        expect(angle).toBeCloseTo(76.1, 0);
    });
});
