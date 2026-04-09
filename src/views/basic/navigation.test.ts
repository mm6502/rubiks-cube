// BasicCube.Navigation unit tests
import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import type { ReadonlyCubie, Vector3 } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { NavDirection } from '@/types';

import type { BasicViewInternalData } from './basic-view';
import { getAdjacentSticker, rotateViewToFace, viewFrontFace } from './navigation';

describe('BasicCubeNavigation', () => {
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
    });

    /**
     * Builds the minimal BasicViewInternalData needed by navigation functions.
     *
     * Canonical view vectors for each face approach (produced by rotateViewToFace):
     *
     *   Face  | viewForward    | viewRight      | viewUp
     *   ------+----------------+----------------+---------------
     *   F     | { 0,  0,  1 }  | { 1,  0,  0 }  | { 0,  1,  0 }  (default)
     *   B     | { 0,  0, -1 }  | {-1,  0,  0 }  | { 0,  1,  0 }
     *   U     | { 0, -1,  0 }  | { 1,  0,  0 }  | { 0,  0,  1 }
     *   D     | { 0,  1,  0 }  | { 1,  0,  0 }  | { 0,  0, -1 }
     *   L     | {-1,  0,  0 }  | { 0,  0,  1 }  | { 0,  1,  0 }
     *   R     | { 1,  0,  0 }  | { 0,  0, -1 }  | { 0,  1,  0 }
     */
    const makeViewState = (
        viewForward: Vector3,
        viewRight: Vector3 = { x: 1, y: 0, z: 0 },
        viewUp: Vector3 = { x: 0, y: 1, z: 0 }
    ): BasicViewInternalData =>
        ({ viewForward, viewRight, viewUp }) as unknown as BasicViewInternalData;

    // Shorthand: get the cubie at a 3D position and assert it exists.
    function getCubie(pos: { x: number; y: number; z: number }): ReadonlyCubie {
        const cubeState = model.getCurrentState();
        const c = CubeStateUtils.getCubieAtPosition(cubeState, pos);
        if (!c) throw new Error(`No cubie at ${JSON.stringify(pos)}`);
        return c as ReadonlyCubie;
    }

    describe('getAdjacentSticker', () => {
        // -----------------------------------------------------------------------
        // Face.F — Z-plane face (z=0).
        // Canonical view: viewForward={0,0,1}, viewRight={1,0,0}, viewUp={0,1,0}
        // Navigation axes on screen: right=+x, up=+y.
        // -----------------------------------------------------------------------
        describe('Face.F navigation', () => {
            const state = makeViewState(
                { x: 0, y: 0, z: 1 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 }
            );

            it('Up from center stays on Face.F', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 1, z: 0 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 2,
                    z: 0,
                });
            });

            it('Down from center stays on Face.F', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 1, z: 0 }),
                    NavDirection.Down
                );
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 0,
                    z: 0,
                });
            });

            it('Left from center stays on Face.F', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 1, z: 0 }),
                    NavDirection.Left
                );
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 0,
                    y: 1,
                    z: 0,
                });
            });

            it('Right from center stays on Face.F', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 1, z: 0 }),
                    NavDirection.Right
                );
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 2,
                    y: 1,
                    z: 0,
                });
            });

            it('Up from top edge transitions to Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 2, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from bottom edge transitions to Face.D', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 0, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.D);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from left edge transitions to Face.L', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 1, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.L);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from right edge transitions to Face.R', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 1, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.R);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Face.U — X-Z plane face (y=2, CSS rotateX 90°).
        // Canonical view: viewForward={0,-1,0}, viewRight={1,0,0}, viewUp={0,0,1}
        // Navigation axes on screen: right=+x, up=+z.
        // -----------------------------------------------------------------------
        describe('Face.U navigation', () => {
            const state = makeViewState(
                { x: 0, y: -1, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 0, z: 1 }
            );

            it('Up from center stays on Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 2, z: 1 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 2,
                    z: 2,
                });
            });

            it('Down from center stays on Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 2, z: 1 }),
                    NavDirection.Down
                );
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 2,
                    z: 0,
                });
            });

            it('Up from far-z edge transitions to Face.B', () => {
                // Arrange — up=+z, so the far-z row (z=2) exits to Face.B
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 2, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.B);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from near-z edge transitions to Face.F', () => {
                // Arrange — down=-z, so the near-z row (z=0) exits to Face.F
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 2, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from left edge transitions to Face.L', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 2, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.L);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from right edge transitions to Face.R', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 2, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.R);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Face.B — Z-plane face (z=2), viewed from behind.
        // Canonical view: viewForward={0,0,-1}, viewRight={-1,0,0}, viewUp={0,1,0}
        // Navigation axes on screen: right=-x (mirrored), up=+y.
        // -----------------------------------------------------------------------
        describe('Face.B navigation', () => {
            const state = makeViewState(
                { x: 0, y: 0, z: -1 },
                { x: -1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 }
            );

            it('Up from center stays on Face.B', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 1, z: 2 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.B);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 2,
                    z: 2,
                });
            });

            it('Up from top edge transitions to Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 2, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from bottom edge transitions to Face.D', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 0, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.D);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from x=2 edge transitions to Face.R', () => {
                // Arrange — right=-x so Left=+x; stepping from x=2 exits to Face.R
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 1, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.R);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from x=0 edge transitions to Face.L', () => {
                // Arrange — right=-x; stepping from x=0 exits to x=-1 → Face.L
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 1, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.L);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Face.D — X-Z plane face (y=0, CSS rotateX 90°), viewed from below.
        // Canonical view: viewForward={0,1,0}, viewRight={1,0,0}, viewUp={0,0,-1}
        // Navigation axes on screen: right=+x, up=-z.
        // -----------------------------------------------------------------------
        describe('Face.D navigation', () => {
            const state = makeViewState(
                { x: 0, y: 1, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 0, z: -1 }
            );

            it('Up from center stays on Face.D', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 1, y: 0, z: 1 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.D);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 1,
                    y: 0,
                    z: 0,
                });
            });

            it('Up from near-z edge transitions to Face.F', () => {
                // Arrange — up=-z; stepping from z=0 exits to z=-1 → Face.F
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 0, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from far-z edge transitions to Face.B', () => {
                // Arrange — down=+z; stepping from z=2 exits to z=3 → Face.B
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 1, y: 0, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.B);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from left edge transitions to Face.L', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 0, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.L);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from right edge transitions to Face.R', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 0, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.R);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Face.L — Y-Z plane face (x=0, CSS rotateY -90°).
        // Canonical view: viewForward={-1,0,0}, viewRight={0,0,1}, viewUp={0,1,0}
        // Navigation axes on screen: right=-z (viewRight=+z projects to screen-right…
        // but L-face col=z row=maxIndex-y, so right=+z), up=+y.
        // -----------------------------------------------------------------------
        describe('Face.L navigation', () => {
            const state = makeViewState(
                { x: -1, y: 0, z: 0 },
                { x: 0, y: 0, z: 1 },
                { x: 0, y: 1, z: 0 }
            );

            it('Up from center stays on Face.L', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 0, y: 1, z: 1 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.L);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 0,
                    y: 2,
                    z: 1,
                });
            });

            it('Up from top edge transitions to Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 2, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from bottom edge transitions to Face.D', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 0, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.D);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from z=2 edge transitions to Face.B', () => {
                // Arrange — right=+z so Left=-z; neg(faceRight).z=−1; stepping from z=2 exits to z=3 → Face.B
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 1, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.B);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from z=0 edge transitions to Face.F', () => {
                // Arrange — right=+z; stepping from z=0 exits to z=-1 → Face.F
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 0, y: 1, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Face.R — Y-Z plane face (x=2, CSS rotateY +90°).
        // Canonical view: viewForward={1,0,0}, viewRight={0,0,-1}, viewUp={0,1,0}
        // Navigation axes on screen: right=-z (viewRight={0,0,-1}), up=+y.
        // -----------------------------------------------------------------------
        describe('Face.R navigation', () => {
            const state = makeViewState(
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 0, z: -1 },
                { x: 0, y: 1, z: 0 }
            );

            it('Up from center stays on Face.R', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                // Act
                const result = getAdjacentSticker(
                    cubeState,
                    state,
                    getCubie({ x: 2, y: 1, z: 1 }),
                    NavDirection.Up
                );
                // Assert
                expect(result?.currentFace).toBe(Face.R);
                expect(CubeStateUtils.getCubieById(cubeState, result!.cubieId)!.position).toEqual({
                    x: 2,
                    y: 2,
                    z: 1,
                });
            });

            it('Up from top edge transitions to Face.U', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 2, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Up);
                // Assert
                expect(result?.currentFace).toBe(Face.U);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Down from bottom edge transitions to Face.D', () => {
                // Arrange
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 0, z: 1 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Down);
                // Assert
                expect(result?.currentFace).toBe(Face.D);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Left from z=0 edge transitions to Face.F', () => {
                // Arrange — right=-z so Left=+z; neg(faceRight).z=+1; stepping from z=0 exits to z=-1 → Face.F
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 1, z: 0 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Left);
                // Assert
                expect(result?.currentFace).toBe(Face.F);
                expect(result?.cubieId).toBe(cubie.id);
            });

            it('Right from z=2 edge transitions to Face.B', () => {
                // Arrange — right=-z; stepping from z=2 exits to z=3 → Face.B
                const cubeState = model.getCurrentState();
                const cubie = getCubie({ x: 2, y: 1, z: 2 });
                // Act
                const result = getAdjacentSticker(cubeState, state, cubie, NavDirection.Right);
                // Assert
                expect(result?.currentFace).toBe(Face.B);
                expect(result?.cubieId).toBe(cubie.id);
            });
        });

        // -----------------------------------------------------------------------
        // Exhaustive boundary check — every cubie that has a sticker on any face
        // must return a defined adjacent sticker for each of the four directions.
        // Catches regressions in face-transition logic.
        // -----------------------------------------------------------------------
        describe('all face boundary cubies return a sticker', () => {
            const faceFront: [Face, Vector3, Vector3, Vector3][] = [
                [Face.F, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
                [Face.B, { x: 0, y: 0, z: -1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
                [Face.U, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }],
                [Face.D, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }],
                [Face.L, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }],
                [Face.R, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }],
            ];
            const dirs: NavDirection[] = [
                NavDirection.Up,
                NavDirection.Down,
                NavDirection.Left,
                NavDirection.Right,
            ];

            it.each(faceFront)(
                'every boundary cubie on %s returns a sticker for all directions',
                (face, viewForward, viewRight, viewUp) => {
                    // Arrange
                    const cubeState = model.getCurrentState();
                    const state = makeViewState(viewForward, viewRight, viewUp);
                    // Act + Assert
                    for (const cubie of cubeState.cubiesById.values()) {
                        const hasFace = [...cubie.stickers.values()].some(
                            s => s.currentFace === face
                        );
                        if (!hasFace) continue;
                        for (const dir of dirs) {
                            const result = getAdjacentSticker(
                                cubeState,
                                state,
                                cubie as ReadonlyCubie,
                                dir
                            );
                            expect(result).toBeDefined();
                        }
                    }
                }
            );
        });
    });

    // -----------------------------------------------------------------------
    // viewFrontFace
    // Maps state.viewForward (axis-aligned unit vector) to the model Face that
    // is currently visible to the viewer. Y is inverted: model +Y = visual-down.
    // -----------------------------------------------------------------------

    describe('viewFrontFace', () => {
        const makeState = (viewForward: Vector3) =>
            ({ viewForward }) as unknown as BasicViewInternalData;

        it('returns Face.F when viewForward is +Z', () => {
            // Arrange
            const state = makeState({ x: 0, y: 0, z: 1 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.F);
        });

        it('returns Face.B when viewForward is -Z', () => {
            // Arrange
            const state = makeState({ x: 0, y: 0, z: -1 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.B);
        });

        it('returns Face.R when viewForward is +X', () => {
            // Arrange
            const state = makeState({ x: 1, y: 0, z: 0 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.R);
        });

        it('returns Face.L when viewForward is -X', () => {
            // Arrange
            const state = makeState({ x: -1, y: 0, z: 0 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.L);
        });

        it('returns Face.D when viewForward is +Y', () => {
            // Arrange — CSS +Y = visual-down, so the bottom face (D) is front
            const state = makeState({ x: 0, y: 1, z: 0 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.D);
        });

        it('returns Face.U when viewForward is -Y', () => {
            // Arrange — CSS -Y = visual-up, so the top face (U) is front
            const state = makeState({ x: 0, y: -1, z: 0 });
            // Act + Assert
            expect(viewFrontFace(state)).toBe(Face.U);
        });
    });

    // -----------------------------------------------------------------------
    // rotateViewToFace
    // Rotates view vectors so that targetFace faces the viewer (viewForward
    // aligns with the face's view direction). Uses at most two 90° rotations.
    // -----------------------------------------------------------------------

    describe('rotateViewToFace', () => {
        /** Default orientation: Face.F toward viewer (+Z), right = +X, up = +Y. */
        const makeDefaultState = (): BasicViewInternalData =>
            ({
                viewForward: { x: 0, y: 0, z: 1 },
                viewRight: { x: 1, y: 0, z: 0 },
                viewUp: { x: 0, y: 1, z: 0 },
            }) as unknown as BasicViewInternalData;

        it('no-op when target face is already front', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.F);
            // Assert
            expect(state.viewForward).toEqual({ x: 0, y: 0, z: 1 });
        });

        it('brings Face.R to front from default orientation', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.R);
            // Assert
            expect(state.viewForward).toEqual({ x: 1, y: 0, z: 0 });
        });

        it('brings Face.L to front from default orientation', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.L);
            // Assert
            expect(state.viewForward).toEqual({ x: -1, y: 0, z: 0 });
        });

        it('brings Face.U to front from default orientation', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.U);
            // Assert
            expect(state.viewForward).toEqual({ x: 0, y: -1, z: 0 });
        });

        it('brings Face.D to front from default orientation', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.D);
            // Assert
            expect(state.viewForward).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('brings Face.B to front from default orientation', () => {
            // Arrange
            const state = makeDefaultState();
            // Act
            rotateViewToFace(state, Face.B);
            // Assert
            expect(state.viewForward).toEqual({ x: 0, y: 0, z: -1 });
        });

        it('works correctly when view is already rotated (Face.R is current front)', () => {
            // Arrange — rotate to Face.R first so viewForward = {1,0,0}
            const state = makeDefaultState();
            rotateViewToFace(state, Face.R);
            // Act — from this orientation, bring Face.F back to front
            rotateViewToFace(state, Face.F);
            // Assert
            expect(state.viewForward).toEqual({ x: 0, y: 0, z: 1 });
        });
    });
});
