import { CubeController } from '@/cube-controller';
import { Face, StickerId } from '@/cube/types';
import { getPositionKey } from '@/cube/utils';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { NavDirection } from '@/types';

import { getAdjacentStickerOnSurface } from './surface-walking';

describe('getAdjacentStickerOnSurface', () => {
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
    });

    function stickerAt(face: Face, pos: number): StickerId {
        const s = CubeStateUtils.getStickerAt(model.getCurrentState(), face, pos);
        if (!s) throw new Error(`No sticker at ${face}:${pos}`);
        return s.id;
    }

    function faceAndPos(stickerId: StickerId): { face: Face; pos: number } {
        const s = CubeStateUtils.getStickerById(model.getCurrentState(), stickerId);
        if (!s) throw new Error(`No sticker with id ${stickerId}`);
        return { face: s.currentFace, pos: s.facePosition };
    }

    // ---------------------------------------------------------------
    // Within-face movement (Face.F center → 4 directions)
    // ---------------------------------------------------------------

    describe('within-face movement', () => {
        it('should move up within F from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.F, 4),
                NavDirection.Up
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.F, pos: 1 });
        });

        it('should move down within F from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.F, 4),
                NavDirection.Down
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.F, pos: 7 });
        });

        it('should move left within F from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.F, 4),
                NavDirection.Left
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.F, pos: 3 });
        });

        it('should move right within F from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.F, 4),
                NavDirection.Right
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.F, pos: 5 });
        });

        it('should move within U from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.U, 4),
                NavDirection.Up
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.U, pos: 1 });
        });

        it('should move within L from center', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                stickerAt(Face.L, 4),
                NavDirection.Right
            );
            expect(faceAndPos(result!)).toEqual({ face: Face.L, pos: 5 });
        });
    });

    // ---------------------------------------------------------------
    // Cross-edge transitions from Face.F
    // ---------------------------------------------------------------

    describe('cross-edge from F', () => {
        it('F top-center → U (cubie continuity)', () => {
            const startId = stickerAt(Face.F, 1);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Up
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.U);
            // Same cubie — check cubieId matches
            const startSticker = CubeStateUtils.getStickerById(model.getCurrentState(), startId);
            const endSticker = CubeStateUtils.getStickerById(model.getCurrentState(), result!);
            expect(endSticker!.cubieId).toBe(startSticker!.cubieId);
        });

        it('F bottom-center → D (cubie continuity)', () => {
            const startId = stickerAt(Face.F, 7);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Down
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.D);
            const startSticker = CubeStateUtils.getStickerById(model.getCurrentState(), startId);
            const endSticker = CubeStateUtils.getStickerById(model.getCurrentState(), result!);
            expect(endSticker!.cubieId).toBe(startSticker!.cubieId);
        });

        it('F left-center → L (cubie continuity)', () => {
            const startId = stickerAt(Face.F, 3);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.L);
            const startSticker = CubeStateUtils.getStickerById(model.getCurrentState(), startId);
            const endSticker = CubeStateUtils.getStickerById(model.getCurrentState(), result!);
            expect(endSticker!.cubieId).toBe(startSticker!.cubieId);
        });

        it('F right-center → R (cubie continuity)', () => {
            const startId = stickerAt(Face.F, 5);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Right
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.R);
            const startSticker = CubeStateUtils.getStickerById(model.getCurrentState(), startId);
            const endSticker = CubeStateUtils.getStickerById(model.getCurrentState(), result!);
            expect(endSticker!.cubieId).toBe(startSticker!.cubieId);
        });
    });

    // ---------------------------------------------------------------
    // Cross-edge transitions from other faces
    // ---------------------------------------------------------------

    describe('cross-edge from other faces', () => {
        it('U up → B (cubie continuity)', () => {
            const startId = stickerAt(Face.U, 1);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Up
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.B);
        });

        it('U down → F (cubie continuity)', () => {
            const startId = stickerAt(Face.U, 7);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Down
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.F);
        });

        it('U left → L (cubie continuity)', () => {
            const startId = stickerAt(Face.U, 3);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.L);
        });

        it('U right → R (cubie continuity)', () => {
            const startId = stickerAt(Face.U, 5);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Right
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.R);
        });

        it('D up → F (cubie continuity)', () => {
            const startId = stickerAt(Face.D, 1);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Up
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.F);
        });

        it('D down → B (cubie continuity)', () => {
            const startId = stickerAt(Face.D, 7);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Down
            );
            expect(result).toBeDefined();
            const { face } = faceAndPos(result!);
            expect(face).toBe(Face.B);
        });

        it('L up → U', () => {
            const startId = stickerAt(Face.L, 1);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Up
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.U);
        });

        it('L down → D', () => {
            const startId = stickerAt(Face.L, 7);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Down
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.D);
        });

        it('L left → B', () => {
            const startId = stickerAt(Face.L, 3);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.B);
        });

        it('L right → F', () => {
            const startId = stickerAt(Face.L, 5);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Right
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.F);
        });

        it('R left → F', () => {
            const startId = stickerAt(Face.R, 3);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.F);
        });

        it('R right → B', () => {
            const startId = stickerAt(Face.R, 5);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Right
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.B);
        });

        it('B left → R', () => {
            const startId = stickerAt(Face.B, 3);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.R);
        });

        it('B right → L', () => {
            const startId = stickerAt(Face.B, 5);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Right
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.L);
        });
    });

    // ---------------------------------------------------------------
    // Corner sticker cross-edge
    // ---------------------------------------------------------------

    describe('corner sticker transitions', () => {
        it('F top-left up → U', () => {
            const startId = stickerAt(Face.F, 0);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Up
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.U);
        });

        it('F top-left left → L', () => {
            const startId = stickerAt(Face.F, 0);
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                startId,
                NavDirection.Left
            );
            expect(result).toBeDefined();
            expect(faceAndPos(result!).face).toBe(Face.L);
        });
    });

    // ---------------------------------------------------------------
    // Edge cases
    // ---------------------------------------------------------------

    describe('edge cases', () => {
        it('returns undefined for invalid stickerId', () => {
            const result = getAdjacentStickerOnSurface(
                model.getCurrentState(),
                'nonexistent' as StickerId,
                NavDirection.Up
            );
            expect(result).toBeUndefined();
        });

        it('center sticker has no cross-edge (center cubie has only one face)', () => {
            // F center → all 4 directions stay within F
            for (const dir of [
                NavDirection.Up,
                NavDirection.Down,
                NavDirection.Left,
                NavDirection.Right,
            ]) {
                const result = getAdjacentStickerOnSurface(
                    model.getCurrentState(),
                    stickerAt(Face.F, 4),
                    dir
                );
                expect(result).toBeDefined();
                expect(faceAndPos(result!).face).toBe(Face.F);
            }
        });

        it('returns undefined when in-bounds neighbour cubie is missing from state', () => {
            // Build a state where the in-bounds neighbour position has been removed
            // from cubiesByPosition so getCubieAtPosition returns undefined.
            const state = model.getCurrentState();

            // Face.F is at z=0.  Position 1 (top-center of F) is at {x:1,y:2,z:0}.
            // Moving Down (face-intrinsic −y) lands at {x:1,y:1,z:0} — the F center.
            const key = getPositionKey({ x: 1, y: 1, z: 0 }, state.cubeSize);
            const prunedState = {
                ...state,
                cubiesByPosition: state.cubiesByPosition.delete(key),
            };

            const startId = stickerAt(Face.F, 1);
            const result = getAdjacentStickerOnSurface(prunedState, startId, NavDirection.Down);
            expect(result).toBeUndefined();
        });
    });
});
