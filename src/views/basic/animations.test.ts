import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Axis, QuarterTurn } from '@/cube/types';
import type { MoveExecutedEvent } from '@/types';

import {
    DEFAULT_BASIC_ANIMATION_CONFIG,
    animateLayer,
    animateMove,
    animateRotation,
    finalizeLayer,
} from './animations';
import { getLayerCubieElements } from './cubie-rendering';

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

    it('still finds a layer whose cubies have been rehomed into a pivot', () => {
        // The trap this guards: during a layer animation `animateLayer` MOVES the moving
        // cubies out of the cube element and into a pivot div nested inside it. A lookup
        // that walked only direct children would silently find NOTHING mid-move, and the
        // animation would lose its elements at exactly the moment they matter. The
        // descendant walk is what makes this work, so it is pinned rather than assumed.
        const cubeElement = document.createElement('div');
        const pivot = document.createElement('div');
        cubeElement.appendChild(pivot);

        const cubie = document.createElement('div');
        cubie.setAttribute('data-cubie-id', 'cubie-1');
        pivot.appendChild(cubie);

        expect(cubeElement.children).toHaveLength(1);
        expect(cubie.parentElement).toBe(pivot);

        const result = getLayerCubieElements(['cubie-1'], cubeElement);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(cubie);
    });

    it('returns one element per id, all in a single index pass', () => {
        // The index is built once per call, so a large layer must not degrade into a
        // lookup per cubie. Asserted by construction: every requested id that exists is
        // returned exactly once, in the order asked for.
        const cubeElement = document.createElement('div');
        const ids = ['c1', 'c2', 'c3', 'c4'];
        for (const id of ids) {
            const el = document.createElement('div');
            el.setAttribute('data-cubie-id', id);
            cubeElement.appendChild(el);
        }

        const result = getLayerCubieElements(['c3', 'missing', 'c1', 'c4'], cubeElement);

        expect(result.map(el => el.getAttribute('data-cubie-id'))).toEqual(['c3', 'c1', 'c4']);
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
        // The first keyframe is now an explicit `rotate3d(…,0deg)` rather than
        // `none`, because both rotation animations go through the shared
        // angle-ramp primitive. `rotate3d(0,1,0,0deg)` is the identity transform,
        // so the rendered result is unchanged — the sign convention that this
        // test actually guards (Y negated to match CSS space) is intact.
        expect(animateMock).toHaveBeenCalledWith(
            [{ transform: 'rotate3d(0,1,0,0deg)' }, { transform: 'rotate3d(0,1,0,-90deg)' }],
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

    describe('animateRotation', () => {
        let element: HTMLElement;
        let animateMock: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            element = document.createElement('div');
            animateMock = vi.fn().mockReturnValue({
                cancel: vi.fn(),
                finished: Promise.resolve(undefined),
            } as unknown as Animation);
            Object.defineProperty(HTMLElement.prototype, 'animate', {
                configurable: true,
                writable: true,
                value: animateMock,
            });
        });

        it('ramps an angle about the given axis, from the given start', () => {
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {});

            expect(animateMock).toHaveBeenCalledWith(
                [{ transform: 'rotate3d(0,1,0,0deg)' }, { transform: 'rotate3d(0,1,0,90deg)' }],
                expect.objectContaining({ duration: 300, easing: 'ease-out' })
            );
        });

        it('emits a delta past 180° verbatim rather than taking the shortest arc', () => {
            // The regression the whole refactor exists to remove: a three-step
            // turn must sweep 270°, not fold back to −90°. Normalising to the
            // shorter arc lands on the same orientation but travels the wrong way.
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 270, {});

            expect(animateMock).toHaveBeenCalledWith(
                [{ transform: 'rotate3d(0,1,0,0deg)' }, { transform: 'rotate3d(0,1,0,270deg)' }],
                expect.anything()
            );
        });

        it('emits a negative delta verbatim', () => {
            animateRotation(element, { x: 1, y: 0, z: 0 }, 0, -90, {});

            expect(animateMock).toHaveBeenCalledWith(
                [{ transform: 'rotate3d(1,0,0,0deg)' }, { transform: 'rotate3d(1,0,0,-90deg)' }],
                expect.anything()
            );
        });

        it('ramps between two non-zero angles when resuming an interrupted turn', () => {
            // An extended ramp starts where the cube actually is, not at 0.
            animateRotation(element, { x: 0, y: 1, z: 0 }, 45, 180, {});

            expect(animateMock).toHaveBeenCalledWith(
                [{ transform: 'rotate3d(0,1,0,45deg)' }, { transform: 'rotate3d(0,1,0,180deg)' }],
                expect.anything()
            );
        });

        it('accepts a transform prefix and suffix so a caller can compose its own stack', () => {
            // View rotation needs the base tilt inside the rotation and the basis
            // matrix underneath it; move animation needs neither. The primitive
            // stays agnostic and the caller says what surrounds the rotation.
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {
                prefix: 'rotateX(-25deg) ',
                suffix: ' matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)',
            });

            expect(animateMock).toHaveBeenCalledWith(
                [
                    {
                        transform:
                            'rotateX(-25deg) rotate3d(0,1,0,0deg) matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)',
                    },
                    {
                        transform:
                            'rotateX(-25deg) rotate3d(0,1,0,90deg) matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)',
                    },
                ],
                expect.anything()
            );
        });

        it('honours an explicit duration and easing', () => {
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {
                duration: 500,
                easing: 'linear',
            });

            expect(animateMock).toHaveBeenCalledWith(expect.anything(), {
                duration: 500,
                easing: 'linear',
                fill: 'forwards',
            });
        });

        it('defaults the duration and easing when only a prefix is supplied', () => {
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, { prefix: '' });

            expect(animateMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    duration: DEFAULT_BASIC_ANIMATION_CONFIG.duration,
                    easing: DEFAULT_BASIC_ANIMATION_CONFIG.easing,
                    fill: 'forwards',
                })
            );
        });

        it('resolves its completion signal true when the animation finishes', async () => {
            const { finished } = animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {});
            await expect(finished).resolves.toBe(true);
        });

        it('resolves its completion signal false on cancellation and never rejects', async () => {
            // A cancel is the normal path when a rotation interrupts another, so it
            // must not surface as an unhandled rejection — the caller closes its
            // rotation on both outcomes.
            const cancelMock = vi.fn();
            Object.defineProperty(HTMLElement.prototype, 'animate', {
                configurable: true,
                writable: true,
                value: vi.fn().mockReturnValue({
                    cancel: cancelMock,
                    finished: Promise.reject(new Error('The user aborted a request.')),
                } as unknown as Animation),
            });

            const { finished } = animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {});
            await expect(finished).resolves.toBe(false);
        });

        it('exposes the underlying animation so a caller can cancel it', () => {
            const cancelMock = vi.fn();
            const animationStub = {
                cancel: cancelMock,
                finished: Promise.resolve(undefined),
            } as unknown as Animation;
            Object.defineProperty(HTMLElement.prototype, 'animate', {
                configurable: true,
                writable: true,
                value: vi.fn().mockReturnValue(animationStub),
            });

            const result = animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {});

            expect(result.animation).toBe(animationStub);
            result.animation.cancel();
            expect(cancelMock).toHaveBeenCalled();
        });

        it('does not set transform-origin, create a pivot, or bake a settled transform', () => {
            // Lifecycle stays with the caller: move animation reparents cubies
            // into a pivot, view rotation has no pivot at all, and each wants a
            // different transform-origin. Baking any of that in would silently
            // misplace the other consumer.
            animateRotation(element, { x: 0, y: 1, z: 0 }, 0, 90, {});

            expect(element.style.transformOrigin).toBe('');
            expect(element.children).toHaveLength(0);
            expect(element.style.transform).toBe('');
        });

        it('round-trips a non-axis-aligned axis with enough precision to be a unit vector', () => {
            // Reachable when a turn is interrupted mid-flight and the next ramp
            // re-bases onto the in-between pose: the axis is then not one of the
            // six world axes, so it must not be rounded to a whole number.
            animateRotation(
                element,
                { x: 0.7071067811865476, y: 0.7071067811865475, z: 0 },
                0,
                90,
                {}
            );

            const keyframes = animateMock.mock.calls[0][0] as Array<{ transform: string }>;
            const match = /rotate3d\(([^,]+),([^,]+),([^,]+),/.exec(keyframes[1].transform)!;
            const axis = [Number(match[1]), Number(match[2]), Number(match[3])];
            expect(Math.hypot(...axis)).toBeCloseTo(1, 9);
        });
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
