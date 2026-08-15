import { afterEach, describe, expect, it, vi } from 'vitest';

import { Axis, QuarterTurn } from '@/cube/types';
import type { MoveExecutedEvent } from '@/types';

import { animateLayer, animateMove, finalizeLayer, getLayerCubieElements } from './animations';

describe('basic-2 animations', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('collects only matching cubie elements for a layer', () => {
        const cubeElement = document.createElement('div');
        const matched = document.createElement('div');
        matched.setAttribute('data-cubie-id', 'cubie-1');
        const ignored = document.createElement('div');
        ignored.setAttribute('data-cubie-id', 'cubie-2');
        cubeElement.appendChild(matched);
        cubeElement.appendChild(ignored);

        const result = getLayerCubieElements(['cubie-1', 'cubie-3'], cubeElement);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(matched);
    });

    it('creates a pivot, rehomes cubies, and forwards animation options', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        const cubie = document.createElement('div');
        cubie.setAttribute('data-cubie-id', 'cubie-1');
        cubeElement.appendChild(cubie);

        const animateMock = vi.fn().mockReturnValue({
            cancel: vi.fn(),
            finished: Promise.resolve(undefined),
        } as unknown as Animation);
        Object.defineProperty(HTMLElement.prototype, 'animate', {
            configurable: true,
            value: animateMock,
        });

        const result = animateLayer([cubie], Axis.Y, QuarterTurn.QUARTER, cubeElement);

        expect(result.pivot.parentElement).toBe(cubeElement);
        expect(result.pivot.children).toHaveLength(1);
        expect(result.pivot.children[0]).toBe(cubie);
        expect(animateMock).toHaveBeenCalledWith(
            [{ transform: 'none' }, { transform: 'rotate3d(0,1,0,-90deg)' }],
            expect.objectContaining({ duration: 300, easing: 'ease-out', fill: 'forwards' })
        );
    });

    it('reparents cubies back to the cube and removes the pivot', () => {
        const cubeElement = document.createElement('div');
        const pivot = document.createElement('div');
        const cubie = document.createElement('div');
        cubeElement.appendChild(pivot);
        pivot.appendChild(cubie);

        finalizeLayer(pivot, [cubie], cubeElement);

        expect(cubeElement.children).toHaveLength(1);
        expect(cubeElement.children[0]).toBe(cubie);
        expect(pivot.isConnected).toBe(false);
    });

    it('returns null for reduced-motion and missing move data, and a result for a real layer', () => {
        const cubeElement = document.createElement('div');
        cubeElement.style.width = '300px';
        const cubie = document.createElement('div');
        cubie.setAttribute('data-cubie-id', 'cubie-1');
        cubeElement.appendChild(cubie);

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue({
                matches: true,
                media: '(prefers-reduced-motion: reduce)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        });

        const reducedMotionEvent = {
            moveDetails: {
                definition: { axis: Axis.X, angle: QuarterTurn.QUARTER },
                movedCubies: { before: [{ id: 'cubie-1' }] },
            },
        } as unknown as MoveExecutedEvent;
        expect(animateMove(reducedMotionEvent, cubeElement)).toBeNull();

        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue({
                matches: false,
                media: '(prefers-reduced-motion: reduce)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        });

        const noDefinitionEvent = {
            moveDetails: {
                movedCubies: { before: [{ id: 'cubie-1' }] },
            },
        } as unknown as MoveExecutedEvent;
        expect(animateMove(noDefinitionEvent, cubeElement)).toBeNull();

        Object.defineProperty(HTMLElement.prototype, 'animate', {
            configurable: true,
            value: vi.fn().mockReturnValue({
                cancel: vi.fn(),
                finished: Promise.resolve(undefined),
            } as unknown as Animation),
        });

        const realEvent = {
            moveDetails: {
                definition: { axis: Axis.Z, angle: QuarterTurn.HALF },
                movedCubies: { before: [{ id: 'cubie-1' }] },
            },
        } as unknown as MoveExecutedEvent;
        const result = animateMove(realEvent, cubeElement);
        expect(result).not.toBeNull();
        expect(result?.cubieElements).toEqual([cubie]);
    });
});
