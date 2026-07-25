// Unit tests for cubie-rendering.ts — currently scoped to the exported
// getFaceTransform helper (reused at full-face scale by rendering.ts for
// ghost-anchor placement). See docs/plans/2026-07-25-001-feat-basic-2-ghost-stickers-plan.md
import { describe, expect, it } from 'vitest';

import { Face } from '@/cube/types';

import { getFaceTransform } from './cubie-rendering';

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
