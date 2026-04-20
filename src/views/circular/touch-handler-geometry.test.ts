import { describe, expect, it } from 'vitest';

import { Axis, Face } from '@/cube/types';
import { DragDirection, HitKind } from '@/interaction/types';

import type { AxisCircle } from './svg-tools';
import {
    axisToWholeCubeNotation,
    circleProximity,
    collectAxisCentersByAxis,
    compareAxisLayer,
    computeBiasedBoundaries,
    createCircularInteractionAdapter,
    getAxisCircleKey,
    getNearestAxisByPoint,
    getStartViewPointFromContext,
    isAxisLayerReversedFromCanonical,
    isPointInTriangle,
    orientedTangentAtPoint,
    parseAxisCircleKey,
    setLineFromBasis,
} from './touch-handler-geometry';

// ── Test helpers ────────────────────────────────────────────────────────────

function makeCircle(axis: Axis, layer: number, cx = 0, cy = 0, r = 50): AxisCircle {
    return { id: `${axis}-${layer}`, axis, layer, cx, cy, r };
}

// ── setLineFromBasis ────────────────────────────────────────────────────────

describe('setLineFromBasis', () => {
    it('should set line attributes from center, axis direction and arm length', () => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        setLineFromBasis(line, { x: 100, y: 100 }, { x: 1, y: 0 }, 50);

        expect(line.getAttribute('x1')).toBe('50');
        expect(line.getAttribute('y1')).toBe('100');
        expect(line.getAttribute('x2')).toBe('150');
        expect(line.getAttribute('y2')).toBe('100');
    });

    it('should handle diagonal axis direction', () => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const dir = { x: 0, y: 1 };
        setLineFromBasis(line, { x: 50, y: 50 }, dir, 30);

        expect(line.getAttribute('x1')).toBe('50');
        expect(line.getAttribute('y1')).toBe('20');
        expect(line.getAttribute('x2')).toBe('50');
        expect(line.getAttribute('y2')).toBe('80');
    });
});

// ── collectAxisCentersByAxis ────────────────────────────────────────────────

describe('collectAxisCentersByAxis', () => {
    it('should return first circle center for each axis', () => {
        const circles: AxisCircle[] = [
            makeCircle(Axis.X, 0, 10, 20),
            makeCircle(Axis.X, 1, 30, 40),
            makeCircle(Axis.Y, 0, 50, 60),
        ];

        const result = collectAxisCentersByAxis(circles);

        expect(result[Axis.X]).toEqual({ x: 10, y: 20 });
        expect(result[Axis.Y]).toEqual({ x: 50, y: 60 });
        expect(result[Axis.Z]).toBeUndefined();
    });

    it('should return empty object for empty array', () => {
        const result = collectAxisCentersByAxis([]);
        expect(result).toEqual({});
    });
});

// ── getNearestAxisByPoint ───────────────────────────────────────────────────

describe('getNearestAxisByPoint', () => {
    it('should return the nearest axis', () => {
        const centers = {
            [Axis.X]: { x: 0, y: 0 },
            [Axis.Y]: { x: 100, y: 100 },
        };
        expect(getNearestAxisByPoint({ x: 10, y: 10 }, centers)).toBe(Axis.X);
        expect(getNearestAxisByPoint({ x: 90, y: 90 }, centers)).toBe(Axis.Y);
    });

    it('should return undefined for empty centers', () => {
        expect(getNearestAxisByPoint({ x: 0, y: 0 }, {})).toBeUndefined();
    });

    it('should skip axes with no center', () => {
        const centers: Partial<Record<Axis, { x: number; y: number }>> = {
            [Axis.Z]: { x: 50, y: 50 },
        };
        expect(getNearestAxisByPoint({ x: 0, y: 0 }, centers)).toBe(Axis.Z);
    });
});

// ── getStartViewPointFromContext ─────────────────────────────────────────────

describe('getStartViewPointFromContext', () => {
    it('should extract view point from context metadata', () => {
        const context = {
            metadata: { startViewPointX: 10, startViewPointY: 20 },
            cubeSize: 3,
            hitKind: HitKind.STICKER,
        } as any;
        expect(getStartViewPointFromContext(context)).toEqual({ x: 10, y: 20 });
    });

    it('should return undefined when metadata is missing', () => {
        const context = { cubeSize: 3, hitKind: HitKind.STICKER } as any;
        expect(getStartViewPointFromContext(context)).toBeUndefined();
    });

    it('should return undefined when coordinates are not numbers', () => {
        const context = {
            metadata: { startViewPointX: 'abc', startViewPointY: 20 },
            cubeSize: 3,
            hitKind: HitKind.STICKER,
        } as any;
        expect(getStartViewPointFromContext(context)).toBeUndefined();
    });
});

// ── axisToWholeCubeNotation ─────────────────────────────────────────────────

describe('axisToWholeCubeNotation', () => {
    it('should return lowercase axis for clockwise', () => {
        expect(axisToWholeCubeNotation(Axis.X, true)).toBe('x');
        expect(axisToWholeCubeNotation(Axis.Y, true)).toBe('y');
        expect(axisToWholeCubeNotation(Axis.Z, true)).toBe('z');
    });

    it('should append prime for counter-clockwise', () => {
        expect(axisToWholeCubeNotation(Axis.X, false)).toBe("x'");
        expect(axisToWholeCubeNotation(Axis.Y, false)).toBe("y'");
        expect(axisToWholeCubeNotation(Axis.Z, false)).toBe("z'");
    });
});

// ── getAxisCircleKey / parseAxisCircleKey ────────────────────────────────────

describe('getAxisCircleKey', () => {
    it('should produce canonical key', () => {
        expect(getAxisCircleKey(Axis.X, 0)).toBe('X-0');
        expect(getAxisCircleKey(Axis.Y, 2)).toBe('Y-2');
    });
});

describe('parseAxisCircleKey', () => {
    it('should parse valid key', () => {
        expect(parseAxisCircleKey('X-0')).toEqual({ axis: Axis.X, layer: 0 });
        expect(parseAxisCircleKey('Z-2')).toEqual({ axis: Axis.Z, layer: 2 });
    });

    it('should return undefined for invalid format', () => {
        expect(parseAxisCircleKey('invalid')).toBeUndefined();
        expect(parseAxisCircleKey('A-0')).toBeUndefined();
        expect(parseAxisCircleKey('X-')).toBeUndefined();
        expect(parseAxisCircleKey('')).toBeUndefined();
    });
});

// ── isAxisLayerReversedFromCanonical ────────────────────────────────────────

describe('isAxisLayerReversedFromCanonical', () => {
    it('should reverse non-last X layers', () => {
        expect(isAxisLayerReversedFromCanonical(Axis.X, 0, 3)).toBe(true);
        expect(isAxisLayerReversedFromCanonical(Axis.X, 1, 3)).toBe(true);
        expect(isAxisLayerReversedFromCanonical(Axis.X, 2, 3)).toBe(false);
    });

    it('should reverse non-last Y layers', () => {
        expect(isAxisLayerReversedFromCanonical(Axis.Y, 0, 3)).toBe(true);
        expect(isAxisLayerReversedFromCanonical(Axis.Y, 2, 3)).toBe(false);
    });

    it('should only reverse last Z layer', () => {
        expect(isAxisLayerReversedFromCanonical(Axis.Z, 0, 3)).toBe(false);
        expect(isAxisLayerReversedFromCanonical(Axis.Z, 1, 3)).toBe(false);
        expect(isAxisLayerReversedFromCanonical(Axis.Z, 2, 3)).toBe(true);
    });
});

// ── compareAxisLayer ────────────────────────────────────────────────────────

describe('compareAxisLayer', () => {
    it('should sort by axis first', () => {
        expect(
            compareAxisLayer({ axis: Axis.X, layer: 0 }, { axis: Axis.Y, layer: 0 })
        ).toBeLessThan(0);
        expect(
            compareAxisLayer({ axis: Axis.Z, layer: 0 }, { axis: Axis.X, layer: 0 })
        ).toBeGreaterThan(0);
    });

    it('should sort by layer within same axis', () => {
        expect(
            compareAxisLayer({ axis: Axis.X, layer: 0 }, { axis: Axis.X, layer: 2 })
        ).toBeLessThan(0);
        expect(
            compareAxisLayer({ axis: Axis.X, layer: 2 }, { axis: Axis.X, layer: 0 })
        ).toBeGreaterThan(0);
    });

    it('should return 0 for equal', () => {
        expect(compareAxisLayer({ axis: Axis.Y, layer: 1 }, { axis: Axis.Y, layer: 1 })).toBe(0);
    });
});

// ── circleProximity ─────────────────────────────────────────────────────────

describe('circleProximity', () => {
    it('should return 0 for point exactly on circle', () => {
        const circle = makeCircle(Axis.X, 0, 0, 0, 10);
        expect(circleProximity({ x: 10, y: 0 }, circle)).toBeCloseTo(0);
    });

    it('should return positive distance for point off circle', () => {
        const circle = makeCircle(Axis.X, 0, 0, 0, 10);
        expect(circleProximity({ x: 15, y: 0 }, circle)).toBeCloseTo(5);
    });
});

// ── isPointInTriangle ───────────────────────────────────────────────────────

describe('isPointInTriangle', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 5, y: 10 };

    it('should return true for point inside triangle', () => {
        expect(isPointInTriangle({ x: 5, y: 3 }, a, b, c)).toBe(true);
    });

    it('should return true for point on edge', () => {
        expect(isPointInTriangle({ x: 5, y: 0 }, a, b, c)).toBe(true);
    });

    it('should return false for point outside triangle', () => {
        expect(isPointInTriangle({ x: -5, y: -5 }, a, b, c)).toBe(false);
    });

    it('should return true for point on vertex', () => {
        expect(isPointInTriangle({ x: 0, y: 0 }, a, b, c)).toBe(true);
    });
});

// ── computeBiasedBoundaries ─────────────────────────────────────────────────

describe('computeBiasedBoundaries', () => {
    it('should handle single-circle group', () => {
        const group = [makeCircle(Axis.X, 0, 0, 0, 50)];
        const result = computeBiasedBoundaries(group);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe(50);
        expect(result[1]).toBe(50);
    });

    it('should handle empty group via fallback', () => {
        const result = computeBiasedBoundaries([]);
        expect(result).toHaveLength(2);
    });

    it('should return N+1 boundaries for N circles', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const result = computeBiasedBoundaries(group);
        expect(result).toHaveLength(4);
        // Boundaries should be ordered
        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i]).toBeLessThanOrEqual(result[i + 1]);
        }
    });

    it('should give all layers equal-width bands', () => {
        const group = [
            makeCircle(Axis.X, 0, 0, 0, 30),
            makeCircle(Axis.X, 1, 0, 0, 50),
            makeCircle(Axis.X, 2, 0, 0, 70),
        ];
        const b = computeBiasedBoundaries(group);
        const innerBand = b[1] - b[0];
        const middleBand = b[2] - b[1];
        const outerBand = b[3] - b[2];

        // All bands should be the same width
        expect(innerBand).toBeCloseTo(middleBand);
        expect(outerBand).toBeCloseTo(middleBand);
        // Boundaries at gap midpoints
        expect(b[1]).toBeCloseTo(40);
        expect(b[2]).toBeCloseTo(60);
    });
});

// ── orientedTangentAtPoint ──────────────────────────────────────────────────

describe('orientedTangentAtPoint', () => {
    it('should return tangent aligned with hint direction', () => {
        const circle = makeCircle(Axis.X, 0, 0, 0, 10);
        // Point on the right of circle, hint pointing up
        const result = orientedTangentAtPoint({ x: 10, y: 0 }, circle, { x: 0, y: -1 });
        expect(result).toBeDefined();
        // Tangent at (10,0) on circle centered at origin is vertical
        expect(Math.abs(result!.x)).toBeCloseTo(0);
        expect(result!.y).toBeLessThan(0); // aligned with up hint
    });

    it('should flip tangent when hint points opposite', () => {
        const circle = makeCircle(Axis.X, 0, 0, 0, 10);
        const result = orientedTangentAtPoint({ x: 10, y: 0 }, circle, { x: 0, y: 1 });
        expect(result).toBeDefined();
        expect(result!.y).toBeGreaterThan(0); // aligned with down hint
    });

    it('should return undefined when point is at circle center', () => {
        const circle = makeCircle(Axis.X, 0, 50, 50, 10);
        const result = orientedTangentAtPoint({ x: 50, y: 50 }, circle, { x: 1, y: 0 });
        expect(result).toBeUndefined();
    });
});

// ── createCircularInteractionAdapter ────────────────────────────────────────

describe('createCircularInteractionAdapter', () => {
    const circles: AxisCircle[] = [
        makeCircle(Axis.X, 0, 100, 100, 30),
        makeCircle(Axis.X, 1, 100, 100, 50),
        makeCircle(Axis.X, 2, 100, 100, 70),
        makeCircle(Axis.Y, 0, 300, 100, 30),
        makeCircle(Axis.Y, 1, 300, 100, 50),
        makeCircle(Axis.Y, 2, 300, 100, 70),
        makeCircle(Axis.Z, 0, 200, 300, 30),
        makeCircle(Axis.Z, 1, 200, 300, 50),
        makeCircle(Axis.Z, 2, 200, 300, 70),
    ];

    it('should create an adapter with all required methods', () => {
        const adapter = createCircularInteractionAdapter(circles);
        expect(adapter.mapDragDirection).toBeDefined();
        expect(adapter.inferAxisCircleNotation).toBeDefined();
        expect(adapter.inferWholeCubeNotation).toBeDefined();
        expect(adapter.inferFaceRotationNotation).toBeDefined();
    });

    it('mapDragDirection should remap through face basis', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = { cubeSize: 3, hitKind: HitKind.STICKER } as any;
        const result = adapter.mapDragDirection!(DragDirection.UP, Face.F, context);
        // Should return a valid DragDirection
        expect([
            DragDirection.UP,
            DragDirection.DOWN,
            DragDirection.LEFT,
            DragDirection.RIGHT,
        ]).toContain(result);
    });

    it('inferAxisCircleNotation should return a move notation', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = { cubeSize: 3, hitKind: HitKind.STICKER } as any;
        const result = adapter.inferAxisCircleNotation!(Axis.X, 2, true, context);
        expect(typeof result).toBe('string');
        expect(result!.length).toBeGreaterThan(0);
    });

    it('inferWholeCubeNotation should return notation without startViewPoint', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = { cubeSize: 3, hitKind: HitKind.BACKGROUND } as any;
        const result = adapter.inferWholeCubeNotation!(100, 0, context);
        expect(typeof result).toBe('string');
    });

    it('inferWholeCubeNotation should use nearest axis when startViewPoint provided', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = {
            cubeSize: 3,
            hitKind: HitKind.BACKGROUND,
            metadata: { startViewPointX: 100, startViewPointY: 100 },
        } as any;
        const result = adapter.inferWholeCubeNotation!(0, -50, context);
        expect(typeof result).toBe('string');
        // Should produce an axis-based notation
        expect(result).toMatch(/^[xyz]'?$/);
    });

    it('inferFaceRotationNotation should return face move notation', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = { cubeSize: 3, hitKind: HitKind.STICKER } as any;
        const result = adapter.inferFaceRotationNotation!(Face.R, true, context);
        expect(result).toBe('R');
    });

    it('inferFaceRotationNotation should handle counter-clockwise', () => {
        const adapter = createCircularInteractionAdapter(circles);
        const context = { cubeSize: 3, hitKind: HitKind.STICKER } as any;
        const result = adapter.inferFaceRotationNotation!(Face.R, false, context);
        expect(result).toBe("R'");
    });
});
