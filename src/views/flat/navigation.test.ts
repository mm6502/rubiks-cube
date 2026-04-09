import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { NavDirection } from '@/types';

import { getAdjacentPos, isNavigationKey, navigate } from './navigation';

describe('FlatViewNavigation', () => {
    const cubeSize = 3;

    describe('getAdjacentPos', () => {
        describe('within-face movement', () => {
            it('should move up within face from center', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 4, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 1 });
            });

            it('should move down within face from center', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 4, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 7 });
            });

            it('should move left within face from center', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 4, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 3 });
            });

            it('should move right within face from center', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 4, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 5 });
            });

            it('should move up from top row to adjacent face', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.U, newPos: 6 });
            });

            it('should move down from bottom row to adjacent face', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 8, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should move left from left column to adjacent face', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.L, newPos: 2 });
            });

            it('should move right from right column to adjacent face', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });
        });

        describe('face transitions', () => {
            it('should move from F up to U', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 0, NavDirection.Up, cubeSize);
                // bottom row, left column
                expect(result).toEqual({ newFace: Face.U, newPos: 6 });
            });

            it('should move from F down to D', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 6, NavDirection.Down, cubeSize);
                // top row, left column
                expect(result).toEqual({ newFace: Face.D, newPos: 0 });
            });

            it('should move from F left to L', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 0, NavDirection.Left, cubeSize);
                // left column, top row
                expect(result).toEqual({ newFace: Face.L, newPos: 2 });
            });

            it('should move from F right to R', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 2, NavDirection.Right, cubeSize);
                // right column, top row
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });

            it('should move from U down to F', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.U, 6, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 0 });
            });

            it('should not move from U up (no face above)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.U, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.U, newPos: 0 });
            });

            it('should not move from U left (no face to left)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.U, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.U, newPos: 0 });
            });

            it('should not move from U right (no face to right)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.U, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.U, newPos: 2 });
            });

            it('should move from D up to F', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.D, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 6 });
            });

            it('should not move from D down (no face below)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.D, 6, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.D, newPos: 6 });
            });

            it('should not move from D left (no face to left)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.D, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.D, newPos: 0 });
            });

            it('should not move from D right (no face to right)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.D, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.D, newPos: 2 });
            });

            it('should move from L right to F', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.L, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 0 });
            });

            it('should not move from L up (no face above)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.L, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.L, newPos: 0 });
            });

            it('should not move from L down (no face below)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.L, 6, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.L, newPos: 6 });
            });

            it('should not move from L left (no face to left)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.L, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.L, newPos: 0 });
            });

            it('should move from R left to F', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.R, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.F, newPos: 2 });
            });

            it('should move from R right to B', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.R, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.B, newPos: 0 });
            });

            it('should not move from R up (no face above)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.R, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.R, newPos: 0 });
            });

            it('should not move from R down (no face below)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.R, 6, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.R, newPos: 6 });
            });

            it('should move from B left to R', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.B, 0, NavDirection.Left, cubeSize);
                expect(result).toEqual({ newFace: Face.R, newPos: 2 });
            });

            it('should not move from B right (no face to right)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.B, 2, NavDirection.Right, cubeSize);
                expect(result).toEqual({ newFace: Face.B, newPos: 2 });
            });

            it('should not move from B up (no face above)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.B, 0, NavDirection.Up, cubeSize);
                expect(result).toEqual({ newFace: Face.B, newPos: 0 });
            });

            it('should not move from B down (no face below)', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.B, 6, NavDirection.Down, cubeSize);
                expect(result).toEqual({ newFace: Face.B, newPos: 6 });
            });
        });

        describe('edge cases', () => {
            it('should return undefined for invalid key', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 4, 'Enter' as NavDirection, cubeSize);
                expect(result).toBeUndefined();
            });

            it('should return undefined for invalid face', () => {
                // Act & Assert
                // This shouldn't happen in practice, but test robustness
                const result = getAdjacentPos('Invalid' as Face, 4, NavDirection.Up, cubeSize);
                expect(result).toBeUndefined();
            });

            it('should handle different cube sizes', () => {
                // Act & Assert
                const result = getAdjacentPos(Face.F, 0, NavDirection.Up, 4);
                expect(result).toEqual({ newFace: Face.U, newPos: 12 }); // bottom row (3) * 4 + 0
            });
        });
    });

    describe('isNavigationKey', () => {
        it('should return true for ArrowUp', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });

            // Act
            const result = isNavigationKey(event);

            // Assert
            expect(result).toBe(true);
        });

        it('should return true for ArrowDown', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

            // Act
            const result = isNavigationKey(event);

            // Assert
            expect(result).toBe(true);
        });

        it('should return true for ArrowLeft', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });

            // Act
            const result = isNavigationKey(event);

            // Assert
            expect(result).toBe(true);
        });

        it('should return true for ArrowRight', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });

            // Act
            const result = isNavigationKey(event);

            // Assert
            expect(result).toBe(true);
        });

        it('should return false for other keys', () => {
            // Arrange
            const testCases = ['Enter', 'Space', 'Tab', 'Escape', 'a', '1', 'F1', 'Shift'];

            testCases.forEach(key => {
                const event = new KeyboardEvent('keydown', { key });

                // Act
                const result = isNavigationKey(event);

                // Assert
                expect(result).toBe(false);
            });
        });
    });

    describe('navigate', () => {
        let model: CubeController;
        let eventBusEmitSpy: any;
        let getStickerByIdSpy: any;
        let getStickerAtSpy: any;

        beforeEach(() => {
            model = new CubeController();
            eventBusEmitSpy = vi.spyOn(Application.eventBus, 'emit');
            getStickerByIdSpy = vi.spyOn(CubeStateUtils, 'getStickerById');
            getStickerAtSpy = vi.spyOn(CubeStateUtils, 'getStickerAt');
        });

        afterEach(() => {
            eventBusEmitSpy.mockRestore();
            getStickerByIdSpy.mockRestore();
            getStickerAtSpy.mockRestore();
        });

        it('should return false when currentSelected is undefined', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });

            // Act
            const result = navigate(event, false, undefined, model);

            // Assert
            expect(result).toBe(false);
            expect(getStickerByIdSpy).not.toHaveBeenCalled();
        });

        it('should return false when model is null', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });

            // Act
            const result = navigate(event, false, 'sticker-1' as StickerId, null);

            // Assert
            expect(result).toBe(false);
            expect(getStickerByIdSpy).not.toHaveBeenCalled();
        });

        it('should return false when getStickerById returns null', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
            getStickerByIdSpy.mockReturnValue(null);

            // Act
            const result = navigate(event, false, 'sticker-1' as StickerId, model);

            // Assert
            expect(result).toBe(false);
            expect(getStickerByIdSpy).toHaveBeenCalledWith(model.getCurrentState(), 'sticker-1');
        });

        it('should return false when getAdjacentPos returns undefined', () => {
            // Arrange
            // Invalid key
            const event = new KeyboardEvent('keydown', { key: 'Enter' });
            const mockSticker = {
                id: 'sticker-1',
                currentFace: Face.F,
                facePosition: 4,
            };
            getStickerByIdSpy.mockReturnValue(mockSticker);

            // Act
            const result = navigate(event, false, 'sticker-1' as StickerId, model);

            // Assert
            expect(result).toBe(false);
            expect(getStickerAtSpy).not.toHaveBeenCalled();
        });

        it('should return false when getStickerAt returns null', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
            const mockSticker = {
                id: 'sticker-1',
                currentFace: Face.F,
                // Rightmost position on F
                facePosition: 2,
            };
            getStickerByIdSpy.mockReturnValue(mockSticker);
            getStickerAtSpy.mockReturnValue(null);

            // Act
            const result = navigate(event, false, 'sticker-1' as StickerId, model, false);

            // Assert
            expect(result).toBe(false);
            expect(getStickerAtSpy).toHaveBeenCalledWith(model.getCurrentState(), Face.R, 0);
        });

        it('should return false when navigating to the same sticker', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
            const mockSticker = {
                id: 'sticker-1',
                currentFace: Face.F,
                // Center position, moves within face
                facePosition: 4,
            };
            const sameSticker = { ...mockSticker }; // Same ID
            getStickerByIdSpy.mockReturnValue(mockSticker);
            getStickerAtSpy.mockReturnValue(sameSticker);

            // Act
            const result = navigate(event, false, 'sticker-1' as StickerId, model, false);

            // Assert
            expect(result).toBe(false);
            expect(eventBusEmitSpy).not.toHaveBeenCalled();
        });

        it('should navigate successfully in preview mode without emitting event', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
            const mockCurrentSticker = {
                id: 'sticker-1',
                currentFace: Face.F,
                // Rightmost position on F
                facePosition: 2,
            };
            const mockNewSticker = {
                id: 'sticker-2',
                currentFace: Face.R,
                facePosition: 0,
            };
            getStickerByIdSpy.mockReturnValue(mockCurrentSticker);
            getStickerAtSpy.mockReturnValue(mockNewSticker);

            // Act
            const result = navigate(event, true, 'sticker-1' as StickerId, model, false);

            // Assert
            expect(result).toBe(true);
            expect(eventBusEmitSpy).not.toHaveBeenCalled();
        });

        it('should navigate successfully in non-preview mode and call onSelected callback', () => {
            // Arrange
            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
            const mockCurrentSticker = {
                id: 'sticker-1',
                currentFace: Face.F,
                // Rightmost position on F
                facePosition: 2,
            };
            const mockNewSticker = {
                id: 'sticker-2',
                currentFace: Face.R,
                facePosition: 0,
            };
            getStickerByIdSpy.mockReturnValue(mockCurrentSticker);
            getStickerAtSpy.mockReturnValue(mockNewSticker);
            const onSelectedSpy = vi.fn();

            // Act
            const result = navigate(
                event,
                false,
                'sticker-1' as StickerId,
                model,
                false,
                onSelectedSpy
            );

            // Assert
            expect(result).toBe(true);
            expect(onSelectedSpy).toHaveBeenCalledWith('sticker-2');
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('sticker'),
                expect.anything()
            );
        });
    });

    describe('navigate (cubeWalk=true)', () => {
        let model: CubeController;

        beforeEach(() => {
            model = new CubeController();
        });

        function stickerAt(face: Face, pos: number): StickerId {
            const s = CubeStateUtils.getStickerAt(model.getCurrentState(), face, pos);
            if (!s) throw new Error(`No sticker at ${face}:${pos}`);
            return s.id;
        }

        function faceOfSticker(stickerId: StickerId): Face {
            const s = CubeStateUtils.getStickerById(model.getCurrentState(), stickerId);
            if (!s) throw new Error(`No sticker with id ${stickerId}`);
            return s.currentFace;
        }

        function navigateCubeWalk(
            key: string,
            startStickerId: StickerId,
            preview = false
        ): { result: boolean; selectedId?: StickerId } {
            const event = new KeyboardEvent('keydown', { key });
            let selectedId: StickerId | undefined;
            const result = navigate(event, preview, startStickerId, model, true, id => {
                selectedId = id;
            });
            return { result, selectedId };
        }

        it('should walk within face normally', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 4));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.F);
        });

        it('should cross F top edge → U', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 1));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.U);
        });

        it('should cross F bottom edge → D', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowDown', stickerAt(Face.F, 7));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.D);
        });

        it('should cross F left edge → L', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowLeft', stickerAt(Face.F, 3));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.L);
        });

        it('should cross F right edge → R', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowRight', stickerAt(Face.F, 5));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.R);
        });

        it('should cross U top edge → B (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.U, 1));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.B);
        });

        it('should cross U left edge → L (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowLeft', stickerAt(Face.U, 3));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.L);
        });

        it('should cross U right edge → R (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowRight', stickerAt(Face.U, 5));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.R);
        });

        it('should cross D bottom edge → B (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowDown', stickerAt(Face.D, 7));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.B);
        });

        it('should cross L left edge → B (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowLeft', stickerAt(Face.L, 3));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.B);
        });

        it('should cross L up edge → U (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.L, 1));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.U);
        });

        it('should cross B right edge → L (planar would stop)', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowRight', stickerAt(Face.B, 5));
            expect(result).toBe(true);
            expect(faceOfSticker(selectedId!)).toBe(Face.L);
        });

        it('should work in preview mode without calling onSelected', () => {
            const { result, selectedId } = navigateCubeWalk('ArrowUp', stickerAt(Face.F, 1), true);
            expect(result).toBe(true);
            expect(selectedId).toBeUndefined();
        });
    });
});
