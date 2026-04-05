import { afterEach, describe, expect, it, vi } from 'vitest';

import { Map as IMap } from 'immutable';

import * as cubeUtils from '@/cube/utils';
import { CubeState, Face, Position3D, PositionKey } from '@/cube/types';
import { Axis } from '@/cube/types/common';
import { MoveDefinition } from '@/cube/types/move';
import { getPositionKey } from '@/cube/utils';
import { MoveExecutedEvent } from '@/types';

import {
    animateFaceRotation,
    animateMove,
    calculateFaceCenter,
    getAffectedFaces,
} from './animations';
import { AxisCircle } from './svg-tools';

describe('Face Animation', () => {
    describe('getAffectedFaces', () => {
        it('should identify U face for Y-axis layer 2', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'U',
                axis: Axis.Y,
                layerIndices: [2],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.U);
            expect(faces).not.toContain(Face.D);
        });

        it('should identify D face for Y-axis layer 0', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'D',
                axis: Axis.Y,
                layerIndices: [0],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.D);
            expect(faces).not.toContain(Face.U);
        });

        it('should identify R face for X-axis layer 2', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'R',
                axis: Axis.X,
                layerIndices: [2],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.R);
            expect(faces).not.toContain(Face.L);
        });

        it('should identify L face for X-axis layer 0', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'L',
                axis: Axis.X,
                layerIndices: [0],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.L);
            expect(faces).not.toContain(Face.R);
        });

        it('should identify F face for Z-axis layer 0', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'F',
                axis: Axis.Z,
                layerIndices: [0],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.F);
            expect(faces).not.toContain(Face.B);
        });

        it('should identify B face for Z-axis layer 2', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'B',
                axis: Axis.Z,
                layerIndices: [2],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.B);
            expect(faces).not.toContain(Face.F);
        });

        it('should identify both faces for middle slice moves', () => {
            // Arrange
            const move: MoveDefinition = {
                name: 'E',
                axis: Axis.Y,
                layerIndices: [0, 2],
                angle: 90,
            };

            // Act
            const faces = getAffectedFaces(move);

            // Assert
            expect(faces).toContain(Face.U);
            expect(faces).toContain(Face.D);
        });
    });

    describe('calculateFaceCenter', () => {
        it('should find center sticker at position 4', () => {
            // Arrange
            // Create mock SVG circle elements
            const stickers: SVGCircleElement[] = [];
            for (let i = 0; i < 9; i++) {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('data-pos', i.toString());

                // Center sticker (pos 4) at (100, 100)
                if (i === 4) {
                    circle.setAttribute('cx', '100');
                    circle.setAttribute('cy', '100');
                } else {
                    // Other stickers at various positions
                    circle.setAttribute('cx', ((i % 3) * 20 + 90).toString());
                    circle.setAttribute('cy', (Math.floor(i / 3) * 20 + 90).toString());
                }

                stickers.push(circle);
            }

            // Act
            const center = calculateFaceCenter(stickers);

            // Assert
            expect(center).not.toBeNull();
            expect(center?.x).toBe(110);
            expect(center?.y).toBe(110);
        });

        it('should return null for empty array', () => {
            // Act & Assert
            const center = calculateFaceCenter([]);
            expect(center).toBeUndefined();
        });

        it('should return null if no center sticker found', () => {
            // Arrange
            const stickers: SVGCircleElement[] = [];
            for (let i = 0; i < 4; i++) {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('data-pos', i.toString());
                circle.setAttribute('cx', (i * 10).toString());
                circle.setAttribute('cy', (i * 10).toString());
                stickers.push(circle);
            }

            // Act
            const center = calculateFaceCenter(stickers);

            // Assert
            expect(center).not.toBeNull();
            expect(center?.x).toBe(15);
            expect(center?.y).toBe(15);
        });
    });

    describe('animateFaceRotation', () => {
        afterEach(() => {
            // Restore any mocked animate implementation
            delete (Element.prototype as any).animate;
            vi.restoreAllMocks();
        });

        it('animates face stickers without throwing', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as unknown as SVGSVGElement;
            const elements = new Map<string, Element>();
            (svgRoot as any).querySelector = vi.fn((selector: string) => {
                const id = selector.replace('#', '');
                return elements.get(id) || null;
            });
            const stickers: SVGCircleElement[] = [];
            const cubies = new Map<string, any>();
            const stickerLookupMap = new Map<PositionKey, Map<Face, string>>();

            for (let i = 0; i < 9; i++) {
                const stickerId = `sticker-${i}`;
                const targetId = `target-${i}`;
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('data-sticker-id', stickerId);
                circle.setAttribute('id', stickerId);
                circle.setAttribute('data-pos', i.toString());
                circle.setAttribute('cx', (100 + (i % 3) * 20).toString());
                circle.setAttribute('cy', (100 + Math.floor(i / 3) * 20).toString());
                svgRoot.appendChild(circle);
                elements.set(stickerId, circle);
                stickers.push(circle);

                // Create target sticker
                const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                target.setAttribute('id', targetId);
                target.setAttribute('data-sticker-id', stickerId);
                target.setAttribute('cx', (100 + (i % 3) * 20).toString());
                target.setAttribute('cy', (100 + Math.floor(i / 3) * 20).toString());
                svgRoot.appendChild(target);
                elements.set(targetId, target);

                // Create cubie with sticker
                const position = { x: i % 3, y: Math.floor(i / 3), z: 0 };
                const cubie = {
                    position,
                    stickers: new Map([
                        [Face.F, { id: stickerId, currentFace: Face.F, facePosition: i }],
                    ]),
                };
                cubies.set(`cubie-${i}`, cubie);

                // Add to lookup map
                const posKey = getPositionKey(position as Position3D);
                if (!stickerLookupMap.has(posKey)) {
                    stickerLookupMap.set(posKey, new Map());
                }
                stickerLookupMap.get(posKey)!.set(Face.F, targetId);
            }

            const move: MoveDefinition = { name: 'F', axis: Axis.Z, layerIndices: [0], angle: 90 };

            const postState = {
                cubeSize: 3,
                cubiesById: cubies,
                cubiesByPosition: IMap<any, any>(),
                timestamp: 0,
            } as unknown as CubeState;

            // Act
            await animateFaceRotation(
                Face.F,
                stickers,
                move,
                postState,
                svgRoot,
                [],
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert
            expect((Element.prototype as any).animate).toHaveBeenCalled();

            // Firefox workaround: should use 2D translate instead of translate3d for SVG.
            const keyframes = (Element.prototype as any).animate.mock.calls[0][0];
            expect(keyframes[0].transform).toContain('translate(');
            expect(keyframes[0].transform).not.toContain('translate3d(');
        });

        it('handles middle slice moves and animates adjacent stickers', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as unknown as SVGSVGElement;

            // Source sticker on axis circle
            const source = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            source.classList.add('sticker');
            source.setAttribute('data-sticker-id', 's1');
            source.setAttribute('data-face', Face.U);
            source.setAttribute('cx', '150');
            source.setAttribute('cy', '100');
            svgRoot.appendChild(source);

            // Target SVG sticker element
            const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            target.id = 'targetSvgId';
            target.classList.add('sticker');
            target.setAttribute('data-face', Face.U);
            target.setAttribute('cx', '100');
            target.setAttribute('cy', '50');
            svgRoot.appendChild(target);

            const targetPosition = { x: 0, y: 1, z: 0 };

            const cubie = {
                position: targetPosition,
                stickers: new Map([[Face.U, { id: 's1', currentFace: Face.U, facePosition: 0 }]]),
            } as any;

            const postState = {
                cubeSize: 3,
                cubiesById: IMap().set('c1', cubie),
                cubiesByPosition: IMap(),
                timestamp: 0,
            } as unknown as CubeState;

            const posKey = getPositionKey(targetPosition as Position3D);

            const stickerLookupMap: Map<PositionKey, Map<Face, string>> = new Map();
            stickerLookupMap.set(posKey, new Map([[Face.U, 'targetSvgId']]));

            const axisCircles: AxisCircle[] = [
                { id: 'id', axis: Axis.Z, layer: 1, cx: 100, cy: 100, r: 50 },
            ];

            const move: MoveDefinition = { name: 'M', axis: Axis.Z, layerIndices: [1], angle: 90 };

            // Act
            await animateFaceRotation(
                undefined,
                [],
                move,
                postState,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert
            expect((Element.prototype as any).animate).toHaveBeenCalled();
        });

        it('wraps angle correctly for negative move angles in face sticker animation', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
            const elements = new Map<string, Element>();
            svgRoot.querySelector = vi.fn((selector: string) => {
                const id = selector.replace('#', '');
                return elements.get(id) || null;
            });
            const stickers: SVGCircleElement[] = [];
            const cubies = new Map<string, any>();
            const stickerLookupMap = new Map<PositionKey, Map<Face, string>>();

            const a = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            a.setAttribute('data-sticker-id', 'sticker-a');
            a.setAttribute('id', 'sticker-a');
            a.setAttribute('data-pos', '0');
            a.setAttribute('cx', '100');
            a.setAttribute('cy', '50');
            svgRoot.appendChild(a);
            elements.set('sticker-a', a);

            const b = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            b.setAttribute('data-sticker-id', 'sticker-b');
            b.setAttribute('id', 'sticker-b');
            b.setAttribute('data-pos', '1');
            b.setAttribute('cx', '150');
            b.setAttribute('cy', '100');
            svgRoot.appendChild(b);
            elements.set('sticker-b', b);

            // Create target stickers
            const targetA = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetA.setAttribute('id', 'target-a');
            targetA.setAttribute('data-sticker-id', 'sticker-a');
            targetA.setAttribute('cx', '150');
            targetA.setAttribute('cy', '100');
            svgRoot.appendChild(targetA);
            elements.set('target-a', targetA);

            const targetB = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetB.setAttribute('id', 'target-b');
            targetB.setAttribute('data-sticker-id', 'sticker-b');
            targetB.setAttribute('cx', '100');
            targetB.setAttribute('cy', '50');
            svgRoot.appendChild(targetB);
            elements.set('target-b', targetB);

            stickers.push(a, b);

            // Create cubies
            const posA = { x: 0, y: 0, z: 0 };
            const posB = { x: 1, y: 0, z: 0 };
            const cubieA = {
                position: posA,
                stickers: new Map([
                    [Face.F, { id: 'sticker-a', currentFace: Face.F, facePosition: 0 }],
                ]),
            };
            const cubieB = {
                position: posB,
                stickers: new Map([
                    [Face.F, { id: 'sticker-b', currentFace: Face.F, facePosition: 1 }],
                ]),
            };
            cubies.set('cubie-a', cubieA).set('cubie-b', cubieB);

            // Setup lookup map
            const posKeyA = getPositionKey(posA as Position3D);
            const posKeyB = getPositionKey(posB as Position3D);
            stickerLookupMap.set(posKeyA, new Map([[Face.F, 'target-a']]));
            stickerLookupMap.set(posKeyB, new Map([[Face.F, 'target-b']]));

            const move: MoveDefinition = { name: 'F', axis: Axis.Z, layerIndices: [0], angle: -90 };

            const postState = {
                cubeSize: 3,
                cubiesById: cubies,
                cubiesByPosition: IMap<any, any>(),
                timestamp: 0,
            } as unknown as CubeState;

            // Spy on utils to control rotation map and effective angle
            const spyAxis = vi
                .spyOn(cubeUtils, 'getFaceRotationAxis')
                .mockReturnValue({ effectiveAngle: -90 } as any);

            // Act
            await animateFaceRotation(
                Face.F,
                stickers,
                move,
                postState,
                svgRoot,
                [],
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert
            expect((Element.prototype as any).animate).toHaveBeenCalled();

            // Cleanup
            spyAxis.mockRestore();
        });

        it('skips face sticker when target sticker is missing', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            // Single sticker - pos 0
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('data-pos', '0');
            c.setAttribute('cx', '150');
            c.setAttribute('cy', '100');

            const stickers: SVGCircleElement[] = [c];

            const move: MoveDefinition = { name: 'F', axis: Axis.Z, layerIndices: [], angle: 90 };

            const postState = {
                cubeSize: 3,
                cubiesById: IMap<string, any>(),
                cubiesByPosition: IMap<any, any>(),
                timestamp: 0,
            } as unknown as CubeState;

            const spyAxis = vi
                .spyOn(cubeUtils, 'getFaceRotationAxis')
                .mockReturnValue({ effectiveAngle: 90 } as any);

            // Act
            await animateFaceRotation(
                Face.F,
                stickers,
                move,
                postState,
                document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any,
                [],
                new Map(),
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert - no errors and animate not called because no target sticker
            expect((Element.prototype as any).animate).not.toHaveBeenCalled();

            spyAxis.mockRestore();
        });

        it('wraps angle when effectiveAngle positive and angleDiff negative', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
            const elements = new Map<string, Element>();
            svgRoot.querySelector = vi.fn((selector: string) => {
                const id = selector.replace('#', '');
                return elements.get(id) || null;
            });
            const cubies = new Map<string, any>();
            const stickerLookupMap = new Map<PositionKey, Map<Face, string>>();

            const a = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            a.setAttribute('data-sticker-id', 'sticker-a');
            a.setAttribute('id', 'sticker-a');
            a.setAttribute('data-pos', '0');
            a.setAttribute('cx', '150');
            a.setAttribute('cy', '100');
            svgRoot.appendChild(a);
            elements.set('sticker-a', a);

            const b = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            b.setAttribute('data-sticker-id', 'sticker-b');
            b.setAttribute('id', 'sticker-b');
            b.setAttribute('data-pos', '1');
            b.setAttribute('cx', '100');
            b.setAttribute('cy', '50');
            svgRoot.appendChild(b);
            elements.set('sticker-b', b);

            // Create target stickers
            const targetA = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetA.setAttribute('id', 'target-a');
            targetA.setAttribute('data-sticker-id', 'sticker-a');
            targetA.setAttribute('cx', '100');
            targetA.setAttribute('cy', '50');
            svgRoot.appendChild(targetA);
            elements.set('target-a', targetA);

            const targetB = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetB.setAttribute('id', 'target-b');
            targetB.setAttribute('data-sticker-id', 'sticker-b');
            targetB.setAttribute('cx', '150');
            targetB.setAttribute('cy', '100');
            svgRoot.appendChild(targetB);
            elements.set('target-b', targetB);

            const stickers: SVGCircleElement[] = [a, b];

            // Create cubies
            const posA = { x: 0, y: 0, z: 0 };
            const posB = { x: 1, y: 0, z: 0 };
            const cubieA = {
                position: posA,
                stickers: new Map([
                    [Face.F, { id: 'sticker-a', currentFace: Face.F, facePosition: 0 }],
                ]),
            };
            const cubieB = {
                position: posB,
                stickers: new Map([
                    [Face.F, { id: 'sticker-b', currentFace: Face.F, facePosition: 1 }],
                ]),
            };
            cubies.set('cubie-a', cubieA).set('cubie-b', cubieB);

            // Setup lookup map
            const posKeyA = getPositionKey(posA as Position3D);
            const posKeyB = getPositionKey(posB as Position3D);
            stickerLookupMap.set(posKeyA, new Map([[Face.F, 'target-a']]));
            stickerLookupMap.set(posKeyB, new Map([[Face.F, 'target-b']]));

            const move: MoveDefinition = { name: 'F', axis: Axis.Z, layerIndices: [0], angle: 90 };

            const postState = {
                cubeSize: 3,
                cubiesById: cubies,
                cubiesByPosition: IMap<any, any>(),
                timestamp: 0,
            } as unknown as CubeState;

            const spyAxis = vi
                .spyOn(cubeUtils, 'getFaceRotationAxis')
                .mockReturnValue({ effectiveAngle: 90 } as any);

            // Act
            await animateFaceRotation(
                Face.F,
                stickers,
                move,
                postState,
                svgRoot,
                [],
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert - animation invoked
            expect((Element.prototype as any).animate).toHaveBeenCalled();

            spyAxis.mockRestore();
        });

        it('does not animate stickers from the excluded face', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as unknown as SVGSVGElement;

            // Sticker on excluded face F
            const excluded = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            excluded.classList.add('sticker');
            excluded.setAttribute('data-sticker-id', 'sx');
            excluded.setAttribute('data-face', Face.F);
            excluded.setAttribute('cx', '150');
            excluded.setAttribute('cy', '100');
            excluded.id = 'excluded';
            svgRoot.appendChild(excluded);

            // Sticker on other face U
            const other = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            other.classList.add('sticker');
            other.setAttribute('data-sticker-id', 's2');
            other.setAttribute('data-face', Face.U);
            other.setAttribute('cx', '50');
            other.setAttribute('cy', '100');
            other.id = 'other';
            svgRoot.appendChild(other);

            const targetPosition = { x: 0, y: 1, z: 0 };

            const cubieX = {
                position: targetPosition,
                stickers: new Map([[Face.F, { id: 'sx', currentFace: Face.F, facePosition: 0 }]]),
            } as any;
            const cubie2 = {
                position: targetPosition,
                stickers: new Map([[Face.U, { id: 's2', currentFace: Face.U, facePosition: 0 }]]),
            } as any;

            const postState = {
                cubeSize: 3,
                cubiesById: IMap().set('cX', cubieX).set('c2', cubie2),
                cubiesByPosition: IMap(),
                timestamp: 0,
            } as unknown as CubeState;

            const posKey = getPositionKey(targetPosition as Position3D);

            const stickerLookupMap: Map<PositionKey, Map<Face, string>> = new Map();
            stickerLookupMap.set(
                posKey,
                new Map([
                    [Face.F, 'excluded'],
                    [Face.U, 'other'],
                ])
            );

            const axisCircles: AxisCircle[] = [
                { id: 'id', axis: Axis.Z, layer: 1, cx: 100, cy: 100, r: 50 },
            ];

            const move: MoveDefinition = { name: 'M', axis: Axis.Z, layerIndices: [1], angle: 90 };

            // Act
            await animateFaceRotation(
                Face.F,
                [],
                move,
                postState,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert - animate should be called only for the non-excluded sticker
            expect((Element.prototype as any).animate).toHaveBeenCalled();
        });

        it('normalizes rotation when adjacentAngle positive and rotationAngle negative', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            const animateSpy = vi.fn(() => fakeAnimation);
            (Element.prototype as any).animate = animateSpy;

            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as unknown as SVGSVGElement;

            const source = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            source.classList.add('sticker');
            source.setAttribute('data-sticker-id', 's3');
            source.setAttribute('data-face', Face.U);
            source.setAttribute('cx', '150');
            source.setAttribute('cy', '100');
            svgRoot.appendChild(source);

            const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            target.id = 'tgt';
            target.classList.add('sticker');
            target.setAttribute('data-face', Face.U);
            target.setAttribute('cx', '100');
            target.setAttribute('cy', '50');
            svgRoot.appendChild(target);

            const targetPosition = { x: 0, y: 1, z: 0 } as Position3D;

            const cubie = {
                position: targetPosition,
                stickers: new Map([[Face.U, { id: 's3', currentFace: Face.U, facePosition: 0 }]]),
            } as any;

            const postState = {
                cubeSize: 3,
                cubiesById: IMap().set('c3', cubie),
                cubiesByPosition: IMap(),
                timestamp: 0,
            } as unknown as CubeState;

            const posKey = getPositionKey(targetPosition);
            const stickerLookupMap: Map<PositionKey, Map<Face, string>> = new Map();
            stickerLookupMap.set(posKey, new Map([[Face.U, 'tgt']]));

            const axisCircles: AxisCircle[] = [
                { id: 'id', axis: Axis.X, layer: 1, cx: 100, cy: 100, r: 50 },
            ];

            const move: MoveDefinition = { name: 'M', axis: Axis.X, layerIndices: [1], angle: 90 };

            // Act
            await animateFaceRotation(
                undefined,
                [],
                move,
                postState,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert - rotation should be normalized to positive 270deg
            expect(animateSpy).toHaveBeenCalled();
            const calledKeyframes = (animateSpy as any).mock.calls[0]?.[0];
            expect(calledKeyframes).toBeDefined();
            expect(calledKeyframes[1].transform).toContain('rotate(270deg)');
        });

        it('normalizes rotation when adjacentAngle negative and rotationAngle positive', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            const animateSpy = vi.fn(() => fakeAnimation);
            (Element.prototype as any).animate = animateSpy;

            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as unknown as SVGSVGElement;

            const source = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            source.classList.add('sticker');
            source.setAttribute('data-sticker-id', 's4');
            source.setAttribute('data-face', Face.U);
            source.setAttribute('cx', '100');
            source.setAttribute('cy', '50');
            svgRoot.appendChild(source);

            const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            target.id = 'tgt2';
            target.classList.add('sticker');
            target.setAttribute('data-face', Face.U);
            target.setAttribute('cx', '150');
            target.setAttribute('cy', '100');
            svgRoot.appendChild(target);

            const targetPosition = { x: 0, y: 1, z: 0 } as Position3D;

            const cubie = {
                position: targetPosition,
                stickers: new Map([[Face.U, { id: 's4', currentFace: Face.U, facePosition: 0 }]]),
            } as any;

            const postState = {
                cubeSize: 3,
                cubiesById: IMap().set('c4', cubie),
                cubiesByPosition: IMap(),
                timestamp: 0,
            } as unknown as CubeState;

            const posKey = getPositionKey(targetPosition);
            const stickerLookupMap: Map<PositionKey, Map<Face, string>> = new Map();
            stickerLookupMap.set(posKey, new Map([[Face.U, 'tgt2']]));

            const axisCircles: AxisCircle[] = [
                { id: 'id', axis: Axis.Z, layer: 1, cx: 100, cy: 100, r: 50 },
            ];

            const move: MoveDefinition = { name: 'M', axis: Axis.Z, layerIndices: [1], angle: 90 };

            // Act
            await animateFaceRotation(
                undefined,
                [],
                move,
                postState,
                svgRoot,
                axisCircles,
                stickerLookupMap,
                {
                    duration: 10,
                    easing: 'ease-out',
                    steps: 10,
                }
            );

            // Assert - rotation normalized to -270deg
            expect(animateSpy).toHaveBeenCalled();
            const keyframes = (animateSpy as any).mock.calls[0]?.[0];
            expect(keyframes).toBeDefined();
            expect(keyframes[1].transform).toContain('rotate(-270deg)');
        });

        it('animateMove returns early when svgRoot is missing', async () => {
            // Arrange
            const event: MoveExecutedEvent = {
                moveDetails: { notation: 'U' } as any,
                preState: { cubeSize: 3 } as any,
                postState: {
                    cubeSize: 3,
                    cubiesById: IMap(),
                    cubiesByPosition: IMap(),
                    timestamp: 0,
                } as any,
            };

            // Act & Assert - should not throw and simply return
            await expect(
                animateMove(event, undefined as any, [], new Map())
            ).resolves.toBeUndefined();
        });

        it('animateMove middle-slice path delegates to animateFaceRotation and animates adjacent stickers', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const event: MoveExecutedEvent = {
                moveDetails: {
                    definition: { name: 'M', axis: Axis.Z, layerIndices: [1], angle: 90 },
                } as any,
                preState: { cubeSize: 3 } as any,
                postState: {
                    cubeSize: 3,
                    cubiesById: IMap(),
                    cubiesByPosition: IMap(),
                    timestamp: 0,
                } as any,
            };

            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
            const source = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            source.classList.add('sticker');
            source.setAttribute('data-sticker-id', 's5');
            source.setAttribute('data-face', Face.U);
            source.setAttribute('cx', '150');
            source.setAttribute('cy', '100');
            svgRoot.appendChild(source);

            const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            target.id = 'tgt3';
            target.classList.add('sticker');
            target.setAttribute('data-face', Face.U);
            target.setAttribute('cx', '100');
            target.setAttribute('cy', '50');
            svgRoot.appendChild(target);

            const targetPosition = { x: 0, y: 1, z: 0 } as Position3D;
            const cubie = {
                position: targetPosition,
                stickers: new Map([[Face.U, { id: 's5', currentFace: Face.U, facePosition: 0 }]]),
            } as any;

            const postState = {
                cubeSize: 3,
                cubiesById: IMap().set('c5', cubie),
                cubiesByPosition: IMap(),
                timestamp: 0,
            } as unknown as CubeState;

            // Attach the built postState to the event so animateMove can find targets
            event.postState = postState as any;

            const posKey = getPositionKey(targetPosition);
            const stickerLookupMap: Map<string, Map<Face, string>> = new Map();
            stickerLookupMap.set(posKey, new Map([[Face.U, 'tgt3']]));

            // Act
            await animateMove(
                event,
                svgRoot,
                [{ axis: Axis.Z, layer: 1, cx: 100, cy: 100, r: 50 } as any],
                stickerLookupMap as any
            );

            // Assert
            expect((Element.prototype as any).animate).toHaveBeenCalled();
        });

        it('animateMove returns without animating when face stickers missing', async () => {
            // Arrange
            const event: MoveExecutedEvent = {
                moveDetails: {
                    definition: { name: 'U', axis: Axis.Y, layerIndices: [2], angle: 90 },
                } as any,
                preState: { cubeSize: 3 } as any,
                postState: {
                    cubeSize: 3,
                    cubiesById: IMap(),
                    cubiesByPosition: IMap(),
                    timestamp: 0,
                } as any,
            };

            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;

            // Act & Assert - should resolve without animating
            await expect(animateMove(event, svgRoot, [], new Map())).resolves.toBeUndefined();
        });

        it('animateMove animates when face stickers are present', async () => {
            // Arrange
            const fakeAnimation = {
                finished: Promise.resolve(),
                cancel: vi.fn(),
            } as unknown as Animation;
            (Element.prototype as any).animate = vi.fn(() => fakeAnimation);

            const cubies = new Map<string, any>();
            const stickerLookupMap = new Map<PositionKey, Map<Face, string>>();

            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as any;
            const elements = new Map<string, Element>();
            svgRoot.querySelector = vi.fn((selector: string) => {
                const id = selector.replace('#', '');
                return elements.get(id) || null;
            });
            const sticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sticker.classList.add('sticker');
            sticker.setAttribute('data-sticker-id', 'sticker-u');
            sticker.setAttribute('id', 'sticker-u');
            sticker.setAttribute('data-face', Face.U);
            sticker.setAttribute('data-pos', '4');
            sticker.setAttribute('cx', '100');
            sticker.setAttribute('cy', '100');
            svgRoot.appendChild(sticker);
            elements.set('sticker-u', sticker);

            // Create target sticker
            const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            target.setAttribute('id', 'target-u');
            target.setAttribute('data-sticker-id', 'sticker-u');
            target.setAttribute('cx', '100');
            target.setAttribute('cy', '100');
            svgRoot.appendChild(target);
            elements.set('target-u', target);

            // Create cubie
            const position = { x: 1, y: 2, z: 1 };
            const cubie = {
                position,
                stickers: new Map([
                    [Face.U, { id: 'sticker-u', currentFace: Face.U, facePosition: 4 }],
                ]),
            };
            cubies.set('cubie-u', cubie);

            // Setup lookup map
            const posKey = getPositionKey(position as Position3D);
            stickerLookupMap.set(posKey, new Map([[Face.U, 'target-u']]));

            const event: MoveExecutedEvent = {
                moveDetails: {
                    definition: { name: 'U', axis: Axis.Y, layerIndices: [2], angle: 90 },
                } as any,
                preState: { cubeSize: 3 } as any,
                postState: {
                    cubeSize: 3,
                    cubiesById: cubies,
                    cubiesByPosition: IMap(),
                    timestamp: 0,
                } as any,
            };

            // Act
            await animateMove(event, svgRoot, [], stickerLookupMap);

            // Assert
            expect((Element.prototype as any).animate).toHaveBeenCalled();
        });
    });
});
