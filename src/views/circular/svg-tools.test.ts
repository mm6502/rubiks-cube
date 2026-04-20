import { describe, expect, it } from 'vitest';

import { Axis, Face } from '@/cube/types';

import {
    type AxisCircle,
    clientToSvgPoint,
    getAxisCirclesAtPoint,
    getAxisCirclesForElement,
    getCenterOfElement,
    getStickersForFace,
    isPointOnCircle,
    svgToClientPoint,
} from './svg-tools';

describe('svg-tools', () => {
    describe('getCenterOfElement', () => {
        it('should return center coordinates from cx and cy attributes', () => {
            // Arrange
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgElement.setAttribute('cx', '100');
            svgElement.setAttribute('cy', '200');

            // Act
            const result = getCenterOfElement(svgElement as SVGElement);

            // Assert
            expect(result).toEqual({ x: 100, y: 200 });
        });

        it('should return default values when cx attribute is missing', () => {
            // Arrange
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgElement.setAttribute('cy', '200');

            // Act
            const result = getCenterOfElement(svgElement as SVGElement);

            // Assert
            expect(result).toEqual({ x: 0, y: 200 });
        });

        it('should return default values when cy attribute is missing', () => {
            // Arrange
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgElement.setAttribute('cx', '100');

            // Act
            const result = getCenterOfElement(svgElement as SVGElement);

            // Assert
            expect(result).toEqual({ x: 100, y: 0 });
        });

        it('should return default values when both cx and cy attributes are missing', () => {
            // Arrange
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

            // Act
            const result = getCenterOfElement(svgElement as SVGElement);

            // Assert
            expect(result).toEqual({ x: 0, y: 0 });
        });
    });

    describe('isPointOnCircle', () => {
        it('should return true when point is exactly on circle', () => {
            // Arrange
            const position = { x: 10, y: 0 };
            const circle: AxisCircle = {
                id: 'test',
                axis: Axis.X,
                layer: 0,
                cx: 0,
                cy: 0,
                r: 10,
            };

            // Act
            const result = isPointOnCircle(position, circle);

            // Assert
            expect(result).toBe(true);
        });

        it('should return true when point is within tolerance', () => {
            // Arrange
            const position = { x: 10.5, y: 0 };
            const circle: AxisCircle = {
                id: 'test',
                axis: Axis.X,
                layer: 0,
                cx: 0,
                cy: 0,
                r: 10,
            };

            // Act
            const result = isPointOnCircle(position, circle, 1);

            // Assert
            expect(result).toBe(true);
        });

        it('should return false when point is outside tolerance', () => {
            // Arrange
            const position = { x: 14, y: 0 };
            const circle: AxisCircle = {
                id: 'test',
                axis: Axis.X,
                layer: 0,
                cx: 0,
                cy: 0,
                r: 10,
            };

            // Act
            const result = isPointOnCircle(position, circle);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('getAxisCirclesAtPoint', () => {
        it('should return empty array when no circles match', () => {
            // Arrange
            const position = { x: 100, y: 100 };
            const axisCircles: AxisCircle[] = [
                {
                    id: 'circle1',
                    axis: Axis.X,
                    layer: 0,
                    cx: 0,
                    cy: 0,
                    r: 10,
                },
            ];

            // Act
            const result = getAxisCirclesAtPoint(position, axisCircles);

            // Assert
            expect(result).toEqual([]);
        });

        it('should return circles that contain the point', () => {
            // Arrange
            const position = { x: 10, y: 0 };
            const axisCircles: AxisCircle[] = [
                {
                    id: 'circle1',
                    axis: Axis.X,
                    layer: 0,
                    cx: 0,
                    cy: 0,
                    r: 10,
                },
                {
                    id: 'circle2',
                    axis: Axis.Y,
                    layer: 1,
                    cx: 50,
                    cy: 50,
                    r: 20,
                },
            ];

            // Act
            const result = getAxisCirclesAtPoint(position, axisCircles);

            // Assert
            expect(result).toHaveLength(1);
            expect(result![0].id).toBe('circle1');
        });

        it('should return multiple circles when point lies on multiple circles', () => {
            // Arrange
            const position = { x: 10, y: 0 };
            const axisCircles: AxisCircle[] = [
                {
                    id: 'circle1',
                    axis: Axis.X,
                    layer: 0,
                    cx: 0,
                    cy: 0,
                    r: 10,
                },
                {
                    id: 'circle2',
                    axis: Axis.X,
                    layer: 1,
                    cx: 0,
                    cy: 0,
                    r: 10,
                },
            ];

            // Act
            const result = getAxisCirclesAtPoint(position, axisCircles);

            // Assert
            expect(result).toHaveLength(2);
            expect(result!.map(c => c.id)).toEqual(['circle1', 'circle2']);
        });
    });

    describe('getAxisCirclesForElement', () => {
        it('should get axis circles for SVG element', () => {
            // Arrange
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgElement.setAttribute('cx', '10');
            svgElement.setAttribute('cy', '0');

            const axisCircles: AxisCircle[] = [
                {
                    id: 'circle1',
                    axis: Axis.X,
                    layer: 0,
                    cx: 0,
                    cy: 0,
                    r: 10,
                },
            ];

            // Act
            const result = getAxisCirclesForElement(svgElement as SVGElement, axisCircles);

            // Assert
            expect(result).toHaveLength(1);
            expect(result![0].id).toBe('circle1');
        });
    });

    describe('getStickersForFace', () => {
        it('should return empty array when no stickers found', () => {
            // Arrange
            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            // Act
            const result = getStickersForFace(svgRoot as SVGSVGElement, Face.F);

            // Assert
            expect(result).toEqual([]);
        });

        it('should return stickers for specific face', () => {
            // Arrange
            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            const sticker1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sticker1.classList.add('sticker');
            sticker1.setAttribute('data-face', Face.F);

            const sticker2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sticker2.classList.add('sticker');
            sticker2.setAttribute('data-face', Face.B);

            const nonSticker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nonSticker.setAttribute('data-face', Face.F);

            svgRoot.appendChild(sticker1);
            svgRoot.appendChild(sticker2);
            svgRoot.appendChild(nonSticker);

            // Act
            const result = getStickersForFace(svgRoot as SVGSVGElement, Face.F);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(sticker1);
        });

        it('should return all stickers for specific face', () => {
            // Arrange
            const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            const sticker1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sticker1.classList.add('sticker');
            sticker1.setAttribute('data-face', Face.F);

            const sticker2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sticker2.classList.add('sticker');
            sticker2.setAttribute('data-face', Face.F);

            svgRoot.appendChild(sticker1);
            svgRoot.appendChild(sticker2);

            // Act
            const result = getStickersForFace(svgRoot as SVGSVGElement, Face.F);

            // Assert
            expect(result).toHaveLength(2);
            expect(result).toEqual([sticker1, sticker2]);
        });
    });

    describe('clientToSvgPoint', () => {
        it('should return raw client coordinates when createSVGPoint is unavailable', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;
            // Remove createSVGPoint to simulate unsupported environment
            (svgRoot as any).createSVGPoint = undefined;

            const result = clientToSvgPoint(svgRoot, 42, 99);

            expect(result).toEqual({ x: 42, y: 99 });
        });

        it('should return raw client coordinates when getScreenCTM returns null', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;

            // Provide createSVGPoint but make getScreenCTM return null
            (svgRoot as any).createSVGPoint = () => ({ x: 0, y: 0 });
            (svgRoot as any).getScreenCTM = () => null;

            const result = clientToSvgPoint(svgRoot, 10, 20);

            expect(result).toEqual({ x: 10, y: 20 });
        });

        it('should transform coordinates when CTM inverse is available', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;

            const mockPoint = { x: 0, y: 0, matrixTransform: (_m: any) => ({ x: 5, y: 15 }) };
            (svgRoot as any).createSVGPoint = () => mockPoint;
            (svgRoot as any).getScreenCTM = () => ({
                inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
            });

            const result = clientToSvgPoint(svgRoot, 10, 20);

            expect(result).toEqual({ x: 5, y: 15 });
        });

        it('should return raw coordinates when CTM inverse throws', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;

            const mockPoint = { x: 0, y: 0 };
            (svgRoot as any).createSVGPoint = () => mockPoint;
            (svgRoot as any).getScreenCTM = () => ({
                inverse: () => undefined,
            });

            const result = clientToSvgPoint(svgRoot, 10, 20);

            // Since inverse() returns undefined (falsy), it falls back
            expect(result).toEqual({ x: 10, y: 20 });
        });
    });

    describe('svgToClientPoint', () => {
        it('should return fallback when createSVGPoint is unavailable', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;
            (svgRoot as any).createSVGPoint = undefined;

            const fallback = { x: 99, y: 88 };
            const result = svgToClientPoint(svgRoot, 10, 20, fallback);

            expect(result).toEqual({ x: 99, y: 88 });
        });

        it('should return fallback when getScreenCTM returns null', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;

            (svgRoot as any).createSVGPoint = () => ({ x: 0, y: 0 });
            (svgRoot as any).getScreenCTM = () => null;

            const fallback = { x: 77, y: 66 };
            const result = svgToClientPoint(svgRoot, 10, 20, fallback);

            expect(result).toEqual({ x: 77, y: 66 });
        });

        it('should transform coordinates when CTM is available', () => {
            const svgRoot = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            ) as SVGSVGElement;

            const mockPoint = {
                x: 0,
                y: 0,
                matrixTransform: (_m: any) => ({ x: 30, y: 40 }),
            };
            (svgRoot as any).createSVGPoint = () => mockPoint;
            (svgRoot as any).getScreenCTM = () => ({
                a: 2,
                b: 0,
                c: 0,
                d: 2,
                e: 0,
                f: 0,
            });

            const fallback = { x: 0, y: 0 };
            const result = svgToClientPoint(svgRoot, 10, 20, fallback);

            expect(result).toEqual({ x: 30, y: 40 });
        });
    });
});
