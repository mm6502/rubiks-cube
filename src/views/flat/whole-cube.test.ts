import { describe, expect, it } from 'vitest';

import { inferWholeCubeDirection, inferWholeCubeNotation } from './whole-cube';

describe('inferWholeCubeNotation', () => {
    const FAR = 60;

    it('stays a quarter turn below the far-drag threshold', () => {
        expect(inferWholeCubeNotation(40, 0, false, FAR)).toBe("y'");
        expect(inferWholeCubeNotation(0, -40, false, FAR)).toBe('x');
    });

    it('promotes to the 2 variant past the threshold', () => {
        expect(inferWholeCubeNotation(100, 0, false, FAR)).toBe("y2'");
        expect(inferWholeCubeNotation(-100, 0, false, FAR)).toBe('y2');
        expect(inferWholeCubeNotation(0, 100, false, FAR)).toBe("x2'");
        expect(inferWholeCubeNotation(0, -100, false, FAR)).toBe('x2');
    });

    it('promotes in the rotated orientation too', () => {
        expect(inferWholeCubeNotation(100, 0, true, FAR)).toBe('x2');
        expect(inferWholeCubeNotation(-100, 0, true, FAR)).toBe("x2'");
        expect(inferWholeCubeNotation(0, -100, true, FAR)).toBe('y2');
    });

    it('measures distance, not either axis alone', () => {
        // A diagonal drag of 45/45 is ~64px, past a 60px threshold, even though
        // neither component exceeds it on its own.
        expect(inferWholeCubeNotation(45, 45, false, FAR)).toBe("x2'");
        // And a 40/40 diagonal is ~57px, still short.
        expect(inferWholeCubeNotation(40, 40, false, FAR)).toBe("x'");
    });

    it('is not promoted exactly at the threshold', () => {
        expect(inferWholeCubeNotation(FAR, 0, false, FAR)).toBe("y'");
        expect(inferWholeCubeNotation(FAR + 0.5, 0, false, FAR)).toBe("y2'");
    });
});

describe('inferWholeCubeDirection', () => {
    // Non-rotated (desktop):
    it('non-rotated: moves left → y', () => {
        expect(inferWholeCubeDirection(-10, 0, false)).toBe('y');
    });
    it("non-rotated: moves right → y'", () => {
        expect(inferWholeCubeDirection(10, 0, false)).toBe("y'");
    });
    it('non-rotated: moves up → x', () => {
        expect(inferWholeCubeDirection(0, -10, false)).toBe('x');
    });
    it("non-rotated: moves down → x'", () => {
        expect(inferWholeCubeDirection(0, 10, false)).toBe("x'");
    });

    // Rotated (mobile / portrait):
    it("rotated: moves left → x'", () => {
        expect(inferWholeCubeDirection(-10, 0, true)).toBe("x'");
    });
    it('rotated: moves right → x', () => {
        expect(inferWholeCubeDirection(10, 0, true)).toBe('x');
    });
    it('rotated: moves up → y', () => {
        expect(inferWholeCubeDirection(0, -10, true)).toBe('y');
    });
    it("rotated: moves down → y'", () => {
        expect(inferWholeCubeDirection(0, 10, true)).toBe("y'");
    });

    // Diagonal → falls to vertical branch:
    it("non-rotated: equal Dx/Dy → vertical branch (x')", () => {
        expect(inferWholeCubeDirection(5, 5, false)).toBe("x'");
    });
    it('non-rotated: equal Dx/Dy negative → x', () => {
        expect(inferWholeCubeDirection(-5, -5, false)).toBe('x');
    });
    it("rotated: equal Dx/Dy → vertical branch (y')", () => {
        expect(inferWholeCubeDirection(5, 5, true)).toBe("y'");
    });
    it('rotated: equal Dx/Dy negative → y', () => {
        expect(inferWholeCubeDirection(-5, -5, true)).toBe('y');
    });
});
