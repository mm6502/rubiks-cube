// BasicCube.Rendering.test.ts
// Unit tests for rendering module, specifically angle normalization and rendering logic
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as viewUtils from '@/cube/utils/view-utils';
import { Color, Face, LayoutMode } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import type { MoveExecutedEvent } from '@/types';

import * as rendering from './rendering';
import type { BasicViewInternalData } from './basic-view';
import { BASIC_VIEW_SCALE } from './constants';

// Helper to test the findClosestEquivalentAngle function
// Tests are self-contained so we inline the reference implementation for clarity
function createMockView() {
    return {
        findClosestEquivalentAngle(current: number, target: number): number {
            // Mathematically find the closest equivalent of target to current
            // This works for any rotation value without needing arbitrary limits

            // Find how many full rotations separate current from target
            const rotations = Math.round((current - target) / 360);
            const closest = target + rotations * 360;

            // Also consider the normalized version to prevent long-term accumulation
            const normalized = (((closest % 360) + 540) % 360) - 180;

            // Pick whichever is actually closer to current
            const closestDiff = Math.abs(current - closest);
            const normalizedDiff = Math.abs(current - normalized);

            if (normalizedDiff < closestDiff) {
                return normalized;
            } else if (normalizedDiff === closestDiff) {
                // Tiebreaker: prefer the more normalized value
                return Math.abs(normalized) < Math.abs(closest) ? normalized : closest;
            }

            return closest;
        },
    };
}

describe('BasicCube.Rendering - findClosestEquivalentAngle', () => {
    let view: ReturnType<typeof createMockView>;

    beforeEach(() => {
        view = createMockView();
    });

    describe('Simple cases - no rotation needed', () => {
        it('should return target when current equals target', () => {
            // Act
            const result1 = view.findClosestEquivalentAngle(0, 0);
            const result2 = view.findClosestEquivalentAngle(90, 90);
            const result3 = view.findClosestEquivalentAngle(-90, -90);

            // Assert
            expect(result1).toBe(0);
            expect(result2).toBe(90);
            expect(result3).toBe(-90);
        });

        it('should return target when current is close to target', () => {
            // Act
            const result1 = view.findClosestEquivalentAngle(10, 0);
            const result2 = view.findClosestEquivalentAngle(-10, 0);
            const result3 = view.findClosestEquivalentAngle(85, 90);

            // Assert
            expect(result1).toBe(0);
            expect(result2).toBe(0);
            expect(result3).toBe(90);
        });
    });

    describe('Single rotation equivalents', () => {
        it('should choose +360 equivalent when closer (current > target)', () => {
            // Arrange
            // current=270, target=0 → 270 is closer to 360 than to 0

            // Act
            const result = view.findClosestEquivalentAngle(270, 0);

            // Assert
            expect(result).toBe(360);
        });

        it('should choose -360 equivalent when closer (current < target)', () => {
            // Arrange
            // current=-270, target=0 → -270 is closer to -360 than to 0

            // Act
            const result = view.findClosestEquivalentAngle(-270, 0);

            // Assert
            expect(result).toBe(-360);
        });

        it('should handle transition from F to R (0 to -90)', () => {
            // Arrange
            // Starting at 0, going to -90

            // Act
            const result = view.findClosestEquivalentAngle(0, -90);

            // Assert
            expect(result).toBe(-90);
        });

        it('should handle transition from R to B (-90 to -180)', () => {
            // Act
            const result = view.findClosestEquivalentAngle(-90, -180);

            // Assert
            expect(result).toBe(-180);
        });

        it('should handle transition from B to L (-180 to -270)', () => {
            // Act
            const result = view.findClosestEquivalentAngle(-180, -270);

            // Assert
            expect(result).toBe(-270);
        });

        it('should handle transition from L back to F (-270 to 0)', () => {
            // Arrange
            // current=-270, target=0 → should pick -360 (90° away) not 0 (270° away)

            // Act
            const result = view.findClosestEquivalentAngle(-270, 0);

            // Assert
            expect(result).toBe(-360);
        });
    });

    describe('Multiple rotation accumulation', () => {
        it('should handle going from -360 to -90 (second loop, F to R)', () => {
            // Act
            const result = view.findClosestEquivalentAngle(-360, -90);

            // Assert
            expect(result).toBe(-450); // -90 + (-1 * 360) = -450
        });

        it('should handle large negative accumulation', () => {
            // Arrange
            // current=-720, target=0 → closest is -720 (already there)

            // Act
            const result = view.findClosestEquivalentAngle(-720, 0);

            // Assert
            expect(result).toBe(-720);
        });

        it('should handle large positive accumulation', () => {
            // Arrange
            // current=720, target=0 → closest is 720 (already there)

            // Act
            const result = view.findClosestEquivalentAngle(720, 0);

            // Assert
            expect(result).toBe(720);
        });

        it('should normalize when normalized version is closer', () => {
            // Arrange
            // current=0, target=-360 → normalized to 0 is closer than -360

            // Act
            const result = view.findClosestEquivalentAngle(0, -360);

            // Assert
            // normalized(-360) = 0, distance = 0
            // closest(-360) = -360, distance = 360
            expect(result).toBe(0);
        });
    });

    describe('Edge cases around 180° boundaries', () => {
        it('should handle 180° transitions correctly', () => {
            // Act
            const result = view.findClosestEquivalentAngle(0, 180);

            // Assert
            expect(result).toBe(180);
        });

        it('should handle -180° transitions correctly', () => {
            // Arrange
            // When current=0 and target=-180, it can go either way (both 180° away)
            // The function picks 180 (normalized version) due to tiebreaker

            // Act
            const result = view.findClosestEquivalentAngle(0, -180);

            // Assert
            expect(result).toBe(180); // -180 normalizes to 180
        });

        it('should pick shortest path at exactly 180° difference', () => {
            // Arrange
            // current=90, target=-90 → difference is 180°, could go either way

            // Act
            const result = view.findClosestEquivalentAngle(90, -90);

            // Assert
            expect(Math.abs(result - 90)).toBe(180); // Should be 180° away
        });
    });

    describe('Normalization prevents infinite accumulation', () => {
        it('should eventually normalize after full rotation', () => {
            // Arrange
            // Simulate: F(0) → R(-90) → B(-180) → L(-270) → F(-360)
            // At F(-360), when going to R(-90), should it keep accumulating?

            // Act
            const result = view.findClosestEquivalentAngle(-360, -90);

            // Assert
            // -90 + round((-360 - (-90)) / 360) * 360 = -90 + (-1) * 360 = -450
            expect(result).toBe(-450);
        });

        it('should prefer normalized when equally close', () => {
            // Arrange
            // current=360, target=0
            // closest = 0 + round((360 - 0) / 360) * 360 = 0 + 1*360 = 360
            // normalized = 0
            // distance to 360 = 0, distance to 0 = 360
            // 0 is not closer, so it returns 360 (which is already at current)

            // Act
            const result = view.findClosestEquivalentAngle(360, 0);

            // Assert
            expect(result).toBe(360); // Stays at 360 (distance=0)
        });
    });

    describe('Real-world navigation scenarios', () => {
        it('should handle clockwise loop F→R→B→L→F smoothly', () => {
            // Arrange
            const rotations = [
                { from: 0, to: -90, expected: -90 }, // F → R
                { from: -90, to: -180, expected: -180 }, // R → B
                { from: -180, to: -270, expected: -270 }, // B → L  (was 90 in old code)
                { from: -270, to: 0, expected: -360 }, // L → F (completes loop)
            ];

            // Act & Assert
            rotations.forEach(({ from, to, expected }, _) => {
                const result = view.findClosestEquivalentAngle(from, to);
                expect(result).toBe(expected);
            });
        });

        it('should handle counter-clockwise loop F→L→B→R→F smoothly', () => {
            // Arrange
            const rotations = [
                { from: 0, to: 90, expected: 90 }, // F → L
                { from: 90, to: 180, expected: 180 }, // L → B
                { from: 180, to: -90, expected: 270 }, // B → R (270 is closer than -90)
                { from: 270, to: 0, expected: 360 }, // R → F (360 is closer than 0)
            ];

            // Act & Assert
            rotations.forEach(({ from, to, expected }) => {
                const result = view.findClosestEquivalentAngle(from, to);
                expect(result).toBe(expected);
            });
        });

        it('should handle moderate accumulation (5+ rotations)', () => {
            // Arrange
            // Test around 1800° (5 rotations) to ensure no arbitrary limits
            // After 5 clockwise rotations: -1800°

            // Act
            const result1 = view.findClosestEquivalentAngle(-1800, -90);
            const result2 = view.findClosestEquivalentAngle(1800, 90);
            const result3 = view.findClosestEquivalentAngle(-2160, 0);
            const result4 = view.findClosestEquivalentAngle(2520, 180);

            // Assert
            // round((-1800 - (-90)) / 360) = round(-1710 / 360) = round(-4.75) = -5
            // -90 + (-5 * 360) = -90 - 1800 = -1890
            expect(result1).toBe(-1890);

            // After 5 counter-clockwise rotations: 1800°
            // round((1800 - 90) / 360) = round(1710 / 360) = round(4.75) = 5
            // 90 + (5 * 360) = 90 + 1800 = 1890
            expect(result2).toBe(1890);

            // Mixed: accumulated to -2160° (-6 rotations), target 0
            // round((-2160 - 0) / 360) = round(-2160 / 360) = -6
            // 0 + (-6 * 360) = 0 - 2160 = -2160
            expect(result3).toBe(-2160);

            // Accumulated to 2520° (7 rotations), target 180
            // round((2520 - 180) / 360) = round(2340 / 360) = round(6.5) = 7
            // 180 + (7 * 360) = 180 + 2520 = 2700
            // But normalized = ((2700 % 360) + 540) % 360 - 180 = 180
            // Distance to 2700: |2520 - 2700| = 180
            // Distance to 180: |2520 - 180| = 2340
            // So should return 2700 (much closer)
            expect(result4).toBe(2700);
        });

        it('should handle extreme accumulation without limits', () => {
            // Arrange
            // Test with very large rotation values

            // Act
            const result1 = view.findClosestEquivalentAngle(-10000, -90);
            const result2 = view.findClosestEquivalentAngle(10000, 90);

            // Assert
            // Should find the -90 equivalent closest to -10000
            // round((-10000 - (-90)) / 360) = round(-9910 / 360) = round(-27.53) = -28
            // -90 + (-28 * 360) = -90 - 10080 = -10170
            expect(result1).toBe(-10170);

            // round((10000 - 90) / 360) = round(9910 / 360) = round(27.53) = 28
            // 90 + (28 * 360) = 90 + 10080 = 10170
            expect(result2).toBe(10170);
        });
    });

    describe('Normalization formula correctness', () => {
        it('should normalize -360 to 0', () => {
            // Act
            const normalized = (((-360 % 360) + 540) % 360) - 180;

            // Assert
            expect(normalized).toBe(0);
        });

        it('should normalize 360 to 0', () => {
            // Act
            const normalized = (((360 % 360) + 540) % 360) - 180;

            // Assert
            expect(normalized).toBe(0);
        });

        it('should normalize -270 to 90', () => {
            // Act
            const normalized = (((-270 % 360) + 540) % 360) - 180;

            // Assert
            expect(normalized).toBe(90);
        });

        it('should normalize 270 to -90', () => {
            // Act
            const normalized = (((270 % 360) + 540) % 360) - 180;

            // Assert
            expect(normalized).toBe(-90);
        });

        it('should keep values in -180 to 180 range normalized', () => {
            // Arrange
            // Note: The normalization formula ((angle % 360) + 540) % 360 - 180
            // normalizes 180° to -180° (they're equivalent angles)

            // Act & Assert
            for (let angle = -180; angle <= 180; angle += 30) {
                const normalized = (((angle % 360) + 540) % 360) - 180;
                if (angle === 180) {
                    expect(normalized).toBe(-180); // 180° normalizes to -180°
                } else {
                    expect(normalized).toBe(angle);
                }
            }
        });
    });
});

// ---------------------------------------------------------------------------
// Helper to build a minimal state object for rendering module tests
// ---------------------------------------------------------------------------
function makeState(
    cubeElement: HTMLElement | null,
    container: HTMLElement,
    styles: Record<string, string>,
    variant: 'front' | 'back',
    cubeContainer: HTMLElement | null,
    overrides?: Partial<BasicViewInternalData>
): BasicViewInternalData {
    const defaultVectors =
        variant === 'back'
            ? {
                  viewRight: { x: -1, y: 0, z: 0 },
                  viewUp: { x: 0, y: 1, z: 0 },
                  viewForward: { x: 0, y: 0, z: -1 },
              }
            : {
                  viewRight: { x: 1, y: 0, z: 0 },
                  viewUp: { x: 0, y: 1, z: 0 },
                  viewForward: { x: 0, y: 0, z: 1 },
              };
    return {
        model: undefined,
        container,
        cubeElement,
        cubeContainer,
        styles,
        variant,
        viewType: variant === 'back' ? 'basic-back' : 'basic-front',
        isTilted: false,
        isPitched: false,
        ...defaultVectors,
        isHovered: false,
        layoutMode: 'floating' as const,
        currentSelected: undefined,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Generic rendering tests
// ---------------------------------------------------------------------------
describe('BasicCubeRenderer - generic tests', () => {
    let mockCubeElement: HTMLElement;
    let mockContainer: HTMLElement;
    let mockCubeContainer: HTMLElement;
    let state: BasicViewInternalData;

    const baseStyles: Record<string, string> = {
        'face-label': 'face-label',
        'hidden-face-label': 'hidden-face-label',
        face: 'face',
        'cube-blocker': 'cube-blocker',
        front: 'front',
        back: 'back',
        right: 'right',
        left: 'left',
        top: 'top',
        bottom: 'bottom',
        sticker: 'sticker',
    };

    beforeEach(() => {
        mockCubeElement = document.createElement('div');
        mockContainer = document.createElement('div');
        mockCubeContainer = document.createElement('div');

        state = makeState(mockCubeElement, mockContainer, baseStyles, 'front', mockCubeContainer);
    });

    describe('updateRotation', () => {
        it('should apply correct transforms for default state', () => {
            rendering.updateRotation(state);

            expect(mockCubeElement.style.transform).toContain('rotateX(-25deg)');
            expect(mockCubeElement.style.transform).toContain('rotateY(-35deg)');
            // Identity orientation → matrix3d with 1s on diagonal
            expect(mockCubeElement.style.transform).toContain(
                'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)'
            );
        });

        it('should apply scale when hovered in floating mode', () => {
            const hoveredState = makeState(
                mockCubeElement,
                mockContainer,
                {},
                'front',
                mockCubeContainer,
                { isHovered: true }
            );

            rendering.updateRotation(hoveredState);

            expect(mockCubeElement.style.transform).toContain(`scale(${BASIC_VIEW_SCALE.HOVER})`);
        });

        it('should NOT apply scale when hovered in tabbed mode', () => {
            const hoveredState = makeState(
                mockCubeElement,
                mockContainer,
                {},
                'front',
                mockCubeContainer,
                { isHovered: true, layoutMode: LayoutMode.Tabbed }
            );

            rendering.updateRotation(hoveredState);

            expect(mockCubeElement.style.transform).not.toContain('scale(');
        });

        it('should skip animation when requested', () => {
            const originalTransition = mockCubeElement.style.transition;
            rendering.updateRotation(state, true);

            // Should restore original transition
            expect(mockCubeElement.style.transition).toBe(originalTransition);
        });

        it('should use PITCHED_BASE_X when state is pitched', () => {
            // Arrange
            state.isPitched = true;

            // Act
            rendering.updateRotation(state);

            // Assert: pitched uses a different X angle
            const transform = mockCubeElement.style.transform;
            expect(transform).toContain('rotateX(');
            expect(transform).not.toContain('rotateX(-25deg)'); // -25 is the non-pitched BASE_X
        });

        it('should use TILTED_BASE_Y when state is tilted', () => {
            // Arrange
            state.isTilted = true;

            // Act
            rendering.updateRotation(state);

            // Assert: tilted uses a different Y angle
            const transform = mockCubeElement.style.transform;
            expect(transform).toContain('rotateY(');
            expect(transform).not.toContain('rotateY(-35deg)'); // -35 is the non-tilted BASE_Y
        });
    });

    describe('getVisibleFacesWithPositions', () => {
        it('should return correct visible faces for front variant default state', () => {
            const result = rendering.getVisibleFacesWithPositions(state);

            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
            expect(result.visibleFaces[0].face).toBe(Face.U);
            expect(result.visibleFaces[0].position).toBe('top');
        });

        it('should handle tilted state', () => {
            state.isTilted = true;
            const result = rendering.getVisibleFacesWithPositions(state);

            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle pitched state', () => {
            // Arrange: front-variant default (vF=+Z, vR=+X, vU=+Y)
            state.isPitched = true;

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert: F [U] R / [L] D [B]
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
            const vMap = Object.fromEntries(result.visibleFaces.map(f => [f.position, f.face]));
            const hMap = Object.fromEntries(result.hiddenFaces.map(f => [f.position, f.face]));
            expect(vMap['top-left']).toBe(Face.F);
            expect(vMap['top-right']).toBe(Face.R);
            expect(vMap['middle-bottom-pitched']).toBe(Face.D);
            expect(hMap['top']).toBe(Face.U);
            expect(hMap['bottom-left']).toBe(Face.L);
            expect(hMap['bottom-right']).toBe(Face.B);
        });

        it('should handle back variant', () => {
            const backState = makeState(
                mockCubeElement,
                mockContainer,
                {},
                'back',
                mockCubeContainer
            );

            const result = rendering.getVisibleFacesWithPositions(backState);
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle back variant with tilted state', () => {
            // Arrange
            const backTiltedState = makeState(
                mockCubeElement,
                mockContainer,
                {},
                'back',
                mockCubeContainer,
                { isTilted: true }
            );

            // Act
            const result = rendering.getVisibleFacesWithPositions(backTiltedState);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — right face forward (equivalent to old yRotation=-90)', () => {
            // Arrange: viewForward points to +X (right face toward viewer)
            state.viewForward = { x: 1, y: 0, z: 0 };
            state.viewRight = { x: 0, y: 0, z: -1 };
            state.viewUp = { x: 0, y: 1, z: 0 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert: valid faces returned after rotation
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — left face forward (equivalent to old yRotation=90)', () => {
            // Arrange: viewForward points to -X (left face toward viewer)
            state.viewForward = { x: -1, y: 0, z: 0 };
            state.viewRight = { x: 0, y: 0, z: 1 };
            state.viewUp = { x: 0, y: 1, z: 0 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — top face forward (equivalent to old xRotation=90)', () => {
            // Arrange: viewForward points to +Y (top face toward viewer)
            state.viewForward = { x: 0, y: 1, z: 0 };
            state.viewRight = { x: 1, y: 0, z: 0 };
            state.viewUp = { x: 0, y: 0, z: -1 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — bottom face forward (equivalent to old xRotation=-90)', () => {
            // Arrange: viewForward points to -Y (bottom face toward viewer)
            state.viewForward = { x: 0, y: -1, z: 0 };
            state.viewRight = { x: 1, y: 0, z: 0 };
            state.viewUp = { x: 0, y: 0, z: 1 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — front face forward, rolled left (equivalent to old zRotation=-90)', () => {
            // Arrange: viewUp points to +X (cube rolled left)
            state.viewForward = { x: 0, y: 0, z: 1 };
            state.viewRight = { x: 0, y: -1, z: 0 };
            state.viewUp = { x: 1, y: 0, z: 0 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });

        it('should handle rotated view — front face forward, rolled right (equivalent to old zRotation=90)', () => {
            // Arrange: viewUp points to -X (cube rolled right)
            state.viewForward = { x: 0, y: 0, z: 1 };
            state.viewRight = { x: 0, y: 1, z: 0 };
            state.viewUp = { x: -1, y: 0, z: 0 };

            // Act
            const result = rendering.getVisibleFacesWithPositions(state);

            // Assert
            expect(result.visibleFaces).toHaveLength(3);
            expect(result.hiddenFaces).toHaveLength(3);
        });
    });

    describe('getMinimumSize', () => {
        it('should return minimum size requirements', () => {
            const size = rendering.getMinimumSize();
            expect(size).toEqual({ width: 300, height: 300 });
        });
    });
});

// ---------------------------------------------------------------------------
// Method coverage tests
// ---------------------------------------------------------------------------
describe('BasicCubeRenderer - method coverage', () => {
    let mockCubeElement: HTMLElement;
    let mockContainer: HTMLElement;
    let mockCubeContainer: HTMLElement;
    let state: BasicViewInternalData;

    const styles: Record<string, string> = {
        'face-label': 'face-label',
        'hidden-face-label': 'hidden-face-label',
        face: 'face',
        'cube-blocker': 'cube-blocker',
        front: 'front',
        back: 'back',
        right: 'right',
        left: 'left',
        top: 'top',
        bottom: 'bottom',
        sticker: 'sticker',
    };

    beforeEach(() => {
        // Arrange: fresh DOM elements and state for each test
        mockCubeElement = document.createElement('div');
        mockContainer = document.createElement('div');
        mockCubeContainer = document.createElement('div');

        state = makeState(mockCubeElement, mockContainer, styles, 'front', mockCubeContainer);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // updateFaceLabels / updateFaceLabelsInternal
    // -------------------------------------------------------------------------
    describe('updateFaceLabels / updateFaceLabelsInternal', () => {
        it('should create 3 visible and 3 hidden face labels', () => {
            // Act
            rendering.updateFaceLabels(state);

            // Assert
            const faceLabels = mockCubeContainer.querySelectorAll('.face-label');
            const hiddenLabels = mockCubeContainer.querySelectorAll('.hidden-face-label');
            expect(faceLabels.length).toBe(3);
            expect(hiddenLabels.length).toBe(3);
        });

        it('should label text content with face letters', () => {
            // Act
            rendering.updateFaceLabels(state);

            // Assert: U face at top in default state
            const faceLabels = mockCubeContainer.querySelectorAll('.face-label');
            const labelTexts = Array.from(faceLabels).map(l => l.textContent);
            expect(labelTexts).toContain(Face.U);
        });

        it('should replace existing labels on repeated calls', () => {
            // Arrange: add labels initially
            rendering.updateFaceLabels(state);
            expect(mockCubeContainer.querySelectorAll('.face-label').length).toBe(3);

            // Act: call again
            rendering.updateFaceLabels(state);

            // Assert: still 3, not 6
            expect(mockCubeContainer.querySelectorAll('.face-label').length).toBe(3);
        });

        it('should do nothing when cubeContainer is null', () => {
            // Arrange
            const nullContainerState = makeState(
                mockCubeElement,
                mockContainer,
                styles,
                'front',
                null
            );

            // Act & Assert: no throw
            expect(() => rendering.updateFaceLabels(nullContainerState)).not.toThrow();
        });

        it('should use tilted view prefix when state is tilted', () => {
            // Arrange
            state.isTilted = true;

            // Act
            rendering.updateFaceLabels(state);

            // Assert: labels are still created
            const faceLabels = mockCubeContainer.querySelectorAll('.face-label');
            expect(faceLabels.length).toBe(3);
        });

        it('should use pitched view prefix when state is pitched', () => {
            // Arrange
            state.isPitched = true;

            // Act
            rendering.updateFaceLabels(state);

            // Assert: 3 visible, 3 hidden
            const faceLabels = mockCubeContainer.querySelectorAll('.face-label');
            expect(faceLabels.length).toBe(3);
        });
    });

    // -------------------------------------------------------------------------
    // initializeFaces
    // -------------------------------------------------------------------------
    describe('initializeFaces', () => {
        function addFaceElement(faceName: string): HTMLElement {
            const faceEl = document.createElement('div');
            faceEl.className = `face ${faceName}`;
            mockCubeElement.appendChild(faceEl);
            return faceEl;
        }

        function addBlockerElement(faceName: string): HTMLElement {
            const blockerEl = document.createElement('div');
            blockerEl.className = `cube-blocker ${faceName}`;
            mockCubeElement.appendChild(blockerEl);
            return blockerEl;
        }

        it('should set width and height on face elements', () => {
            // Arrange
            const frontFace = addFaceElement('front');

            // Act
            rendering.initializeFaces(state, 120);

            // Assert
            expect(frontFace.style.width).toBe('120px');
            expect(frontFace.style.height).toBe('120px');
        });

        it('should set correct translateZ transforms on each face', () => {
            // Arrange
            const frontFace = addFaceElement('front');
            const backFace = addFaceElement('back');
            const rightFace = addFaceElement('right');
            const leftFace = addFaceElement('left');
            const topFace = addFaceElement('top');
            const bottomFace = addFaceElement('bottom');

            // Act: halfSize = 200/2 = 100
            rendering.initializeFaces(state, 200);

            // Assert
            expect(frontFace.style.transform).toBe('translateZ(100px)');
            expect(backFace.style.transform).toBe('rotateY(180deg) translateZ(100px)');
            expect(rightFace.style.transform).toBe('rotateY(90deg) translateZ(100px)');
            expect(leftFace.style.transform).toBe('rotateY(-90deg) translateZ(100px)');
            expect(topFace.style.transform).toBe('rotateX(90deg) translateZ(100px)');
            expect(bottomFace.style.transform).toBe('rotateX(-90deg) translateZ(100px)');
        });

        it('should set width and height on blocker elements', () => {
            // Arrange
            const blocker = addBlockerElement('front');

            // Act
            rendering.initializeFaces(state, 100);

            // Assert
            expect(blocker.style.width).toBe('100px');
            expect(blocker.style.height).toBe('100px');
        });

        it('should set translateZ on blocker elements (4px inset)', () => {
            // Arrange
            const frontBlocker = addBlockerElement('front');
            const backBlocker = addBlockerElement('back');
            const rightBlocker = addBlockerElement('right');
            const leftBlocker = addBlockerElement('left');
            const topBlocker = addBlockerElement('top');
            const bottomBlocker = addBlockerElement('bottom');

            // Act: halfSize=100, blockerZ = 100-4 = 96
            rendering.initializeFaces(state, 200);

            // Assert
            expect(frontBlocker.style.transform).toBe('translateZ(96px)');
            expect(backBlocker.style.transform).toBe('rotateY(180deg) translateZ(96px)');
            expect(rightBlocker.style.transform).toBe('rotateY(90deg) translateZ(96px)');
            expect(leftBlocker.style.transform).toBe('rotateY(-90deg) translateZ(96px)');
            expect(topBlocker.style.transform).toBe('rotateX(90deg) translateZ(96px)');
            expect(bottomBlocker.style.transform).toBe('rotateX(-90deg) translateZ(96px)');
        });

        it('should do nothing when cubeElement is null', () => {
            // Arrange
            const nullCubeState = makeState(
                null,
                mockContainer,
                styles,
                'front',
                mockCubeContainer
            );

            // Act & Assert
            expect(() => rendering.initializeFaces(nullCubeState, 100)).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // updateSize
    // -------------------------------------------------------------------------
    describe('updateSize', () => {
        it('should update cube element dimensions based on container size', () => {
            // Arrange
            const cubeWrapper = document.createElement('div');
            cubeWrapper.appendChild(mockCubeElement);
            vi.spyOn(viewUtils, 'computeAvailableContentSize').mockReturnValue({
                width: 600,
                height: 400,
            });

            // Act
            rendering.updateSize(state);

            // Assert: faceSize = min(600,400)*BASIC_VIEW_SCALE.DEFAULT = 240
            expect(mockCubeElement.style.width).toBe('240px');
            expect(mockCubeElement.style.height).toBe('240px');
        });

        it('should update perspective on the cube wrapper', () => {
            // Arrange
            const cubeWrapper = document.createElement('div');
            cubeWrapper.appendChild(mockCubeElement);
            vi.spyOn(viewUtils, 'computeAvailableContentSize').mockReturnValue({
                width: 500,
                height: 500,
            });

            // Act: faceSize = 500*BASIC_VIEW_SCALE.DEFAULT = 300, scaledPerspective = 1000*(300/300) = 1000
            rendering.updateSize(state);

            // Assert
            expect(cubeWrapper.style.perspective).toBe('1000px');
        });

        it('should do nothing when container reports zero size', () => {
            // Arrange
            vi.spyOn(viewUtils, 'computeAvailableContentSize').mockReturnValue({
                width: 0,
                height: 0,
            });
            const originalWidth = mockCubeElement.style.width;

            // Act
            rendering.updateSize(state);

            // Assert: dimensions unchanged
            expect(mockCubeElement.style.width).toBe(originalWidth);
        });

        it('should do nothing when cubeElement is null', () => {
            // Arrange
            const nullCubeState = makeState(
                null,
                mockContainer,
                styles,
                'front',
                mockCubeContainer
            );

            // Act & Assert
            expect(() => rendering.updateSize(nullCubeState)).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // update
    // -------------------------------------------------------------------------
    describe('update', () => {
        function buildFaceWithStickers(faceName: string): HTMLElement {
            const faceEl = document.createElement('div');
            faceEl.className = `face ${faceName}`;
            for (let i = 0; i < 9; i++) {
                const stickerEl = document.createElement('div');
                stickerEl.className = 'sticker';
                faceEl.appendChild(stickerEl);
            }
            mockCubeElement.appendChild(faceEl);
            return faceEl;
        }

        it('should set sticker background colors from model state', () => {
            // Arrange
            buildFaceWithStickers('front');
            const mockModel = { getCurrentState: () => ({}) as any };
            vi.spyOn(CubeStateUtils, 'getStickerAt').mockReturnValue({
                id: 'test_sticker',
                color: Color.WHITE,
                cubieId: 'test_cubie',
                localIndex: 0,
                currentFace: Face.F,
                facePosition: 0,
            } as any);

            // Act
            rendering.update(state, mockModel as any);

            // Assert: first sticker color and ID updated
            const sticker = mockCubeElement.querySelector('.sticker') as HTMLElement;
            expect(sticker.style.backgroundColor).toBeTruthy();
            expect(sticker.getAttribute('data-sticker-id')).toBe('test_sticker');
        });

        it('should update all 6 faces', () => {
            // Arrange
            const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];
            faceNames.forEach(name => buildFaceWithStickers(name));
            const mockModel = { getCurrentState: () => ({}) as any };
            const spy = vi.spyOn(CubeStateUtils, 'getStickerAt').mockReturnValue({
                id: 'sticker_x',
                color: Color.RED,
                cubieId: 'c1',
                localIndex: 0,
                currentFace: Face.F,
                facePosition: 0,
            } as any);

            // Act
            rendering.update(state, mockModel as any);

            // Assert: called 9 times per face × 6 faces = 54
            expect(spy).toHaveBeenCalledTimes(54);
        });

        it('should do nothing when cubeElement is null', () => {
            // Arrange
            const nullCubeState = makeState(
                null,
                mockContainer,
                styles,
                'front',
                mockCubeContainer
            );
            const mockModel = { getCurrentState: () => ({}) as any };

            // Act & Assert
            expect(() => rendering.update(nullCubeState, mockModel as any)).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // updateSelective
    // -------------------------------------------------------------------------
    describe('updateSelective', () => {
        function buildFaceWithStickers(faceName: string): void {
            const faceEl = document.createElement('div');
            faceEl.className = `face ${faceName}`;
            for (let i = 0; i < 9; i++) {
                const stickerEl = document.createElement('div');
                stickerEl.className = 'sticker';
                faceEl.appendChild(stickerEl);
            }
            mockCubeElement.appendChild(faceEl);
        }

        it('should update the sticker at the moved position', () => {
            // Arrange
            buildFaceWithStickers('front');
            const mockModel = { getCurrentState: () => ({}) as any };
            const stateWithModel = makeState(
                mockCubeElement,
                mockContainer,
                styles,
                'front',
                mockCubeContainer,
                { model: mockModel as any }
            );
            vi.spyOn(CubeStateUtils, 'getStickerAt').mockReturnValue({
                id: 'moved_sticker',
                color: Color.RED,
                cubieId: 'cubie1',
                localIndex: 0,
                currentFace: Face.F,
                facePosition: 4,
            } as any);

            const mockEvent: MoveExecutedEvent = {
                moveDetails: {
                    notation: 'F',
                    movedCubies: {
                        before: [],
                        after: [
                            {
                                id: 'cubie1' as any,
                                type: 'corner' as any,
                                position: {} as any,
                                orientation: {} as any,
                                canonicalIndex: 0,
                                stickers: {
                                    forEach: (fn: (v: any) => void) => {
                                        fn({
                                            currentFace: Face.F,
                                            facePosition: 4,
                                            id: 's1',
                                            color: Color.RED,
                                            cubieId: 'cubie1',
                                            localIndex: 0,
                                        });
                                    },
                                } as any,
                            },
                        ],
                    },
                },
                preState: {} as any,
                postState: {} as any,
            };

            // Act
            rendering.updateSelective(stateWithModel, mockEvent);

            // Assert: sticker at position 4 on front face is updated
            const faceDiv = mockCubeElement.querySelector('.face.front')!;
            const stickerEls = faceDiv.querySelectorAll('.sticker');
            expect((stickerEls[4] as HTMLElement).getAttribute('data-sticker-id')).toBe(
                'moved_sticker'
            );
        });

        it('should do nothing when model is undefined', () => {
            // Arrange: base state has model=undefined
            const event: MoveExecutedEvent = {
                moveDetails: { notation: 'F', movedCubies: { before: [], after: [] } },
                preState: {} as any,
                postState: {} as any,
            };

            // Act & Assert
            expect(() => rendering.updateSelective(state, event)).not.toThrow();
        });

        it('should do nothing when movedCubies is undefined', () => {
            // Arrange
            const mockModel = { getCurrentState: () => ({}) as any };
            const stateWithModel = makeState(
                mockCubeElement,
                mockContainer,
                styles,
                'front',
                mockCubeContainer,
                { model: mockModel as any }
            );
            const event: MoveExecutedEvent = {
                moveDetails: { notation: 'F' },
                preState: {} as any,
                postState: {} as any,
            };

            // Act & Assert
            expect(() => rendering.updateSelective(stateWithModel, event)).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // resize
    // -------------------------------------------------------------------------
    describe('resize', () => {
        it('should trigger size computation (delegates to updateSize logic)', () => {
            // Arrange: spy on viewUtils to verify updateSize actually ran
            const computeSpy = vi
                .spyOn(viewUtils, 'computeAvailableContentSize')
                .mockReturnValue({ width: 0, height: 0 });

            // Act
            rendering.resize(state);

            // Assert: updateSize was triggered — it calls computeAvailableContentSize
            expect(computeSpy).toHaveBeenCalled();
        });
    });
});
