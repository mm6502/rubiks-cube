import { CubeController } from '@/cube-controller';
import { Face, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import {
    inferKeyboardMove,
    isFaceSelectKey,
    isKeyboardMoveKey,
    mapArrowToDirection,
    toDoubleTurn,
} from './keyboard-moves';
import { DragDirection } from './types';

describe('keyboard-moves', () => {
    describe('isKeyboardMoveKey', () => {
        it('returns true for Ctrl+Arrow keys', () => {
            expect(
                isKeyboardMoveKey(new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true }))
            ).toBe(true);
            expect(
                isKeyboardMoveKey(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true }))
            ).toBe(true);
            expect(
                isKeyboardMoveKey(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }))
            ).toBe(true);
            expect(
                isKeyboardMoveKey(
                    new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true })
                )
            ).toBe(true);
        });

        it('returns true for Ctrl+Shift+Arrow (180° moves)', () => {
            expect(
                isKeyboardMoveKey(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        ctrlKey: true,
                        shiftKey: true,
                    })
                )
            ).toBe(true);
        });

        it('returns false for plain arrow keys', () => {
            expect(isKeyboardMoveKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe(false);
        });

        it('returns false for Alt+Arrow', () => {
            expect(
                isKeyboardMoveKey(
                    new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, ctrlKey: true })
                )
            ).toBe(false);
        });

        it('returns false for non-arrow keys with Ctrl', () => {
            expect(
                isKeyboardMoveKey(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
            ).toBe(false);
        });
    });

    describe('isFaceSelectKey', () => {
        it('returns true for Space', () => {
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: ' ' }))).toBe(true);
        });

        it('returns true for Backquote', () => {
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: 'Backquote' }))).toBe(true);
        });

        it('returns true for backtick character', () => {
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: '`' }))).toBe(true);
        });

        it('returns false when modifiers are held', () => {
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true }))).toBe(
                false
            );
            expect(
                isFaceSelectKey(new KeyboardEvent('keydown', { key: ' ', shiftKey: true }))
            ).toBe(false);
        });

        it('returns false for non-select keys', () => {
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
            expect(isFaceSelectKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
        });
    });

    describe('mapArrowToDirection', () => {
        it('maps arrow keys to DragDirection', () => {
            expect(mapArrowToDirection(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe(
                DragDirection.UP
            );
            expect(mapArrowToDirection(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(
                DragDirection.DOWN
            );
            expect(mapArrowToDirection(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(
                DragDirection.LEFT
            );
            expect(mapArrowToDirection(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(
                DragDirection.RIGHT
            );
        });

        it('returns undefined for non-arrow keys', () => {
            expect(
                mapArrowToDirection(new KeyboardEvent('keydown', { key: 'Space' }))
            ).toBeUndefined();
        });
    });

    describe('toDoubleTurn', () => {
        it('appends 2 to simple notation', () => {
            expect(toDoubleTurn('F')).toBe('F2');
            expect(toDoubleTurn('U')).toBe('U2');
        });

        it('strips prime and appends 2', () => {
            expect(toDoubleTurn("F'")).toBe('F2');
            expect(toDoubleTurn("U'")).toBe('U2');
        });

        it('handles slice moves', () => {
            expect(toDoubleTurn('M')).toBe('M2');
            expect(toDoubleTurn("M'")).toBe('M2');
        });
    });

    describe('inferKeyboardMove', () => {
        let model: CubeController;

        beforeEach(() => {
            model = new CubeController();
        });

        function findStickerOnFace(face: Face, position: number): StickerId {
            const state = model.getCurrentState();
            const sticker = CubeStateUtils.getStickerAt(state, face, position);
            return sticker!.id;
        }

        it('returns face rotation CW when face is selected and direction is DOWN', () => {
            const stickerId = findStickerOnFace(Face.F, 4); // center of F
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.DOWN,
                doubleTurn: false,
                model,
            });
            expect(result).toBe('F');
        });

        it('returns face rotation CW when direction is RIGHT', () => {
            const stickerId = findStickerOnFace(Face.F, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.RIGHT,
                doubleTurn: false,
                model,
            });
            expect(result).toBe('F');
        });

        it('returns face rotation CCW when direction is UP', () => {
            const stickerId = findStickerOnFace(Face.F, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.UP,
                doubleTurn: false,
                model,
            });
            expect(result).toBe("F'");
        });

        it('returns face rotation CCW when direction is LEFT', () => {
            const stickerId = findStickerOnFace(Face.U, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.U,
                faceDirectMode: false,
                direction: DragDirection.LEFT,
                doubleTurn: false,
                model,
            });
            expect(result).toBe("U'");
        });

        it('returns double turn when doubleTurn is true', () => {
            const stickerId = findStickerOnFace(Face.F, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.UP,
                doubleTurn: true,
                model,
            });
            expect(result).toBe('F2');
        });

        it('returns double turn for CCW direction', () => {
            const stickerId = findStickerOnFace(Face.F, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.DOWN,
                doubleTurn: true,
                model,
            });
            expect(result).toBe('F2');
        });

        it('uses sticker face in face-direct mode when no explicit face selected', () => {
            const stickerId = findStickerOnFace(Face.R, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: undefined,
                faceDirectMode: true,
                direction: DragDirection.DOWN,
                doubleTurn: false,
                model,
            });
            expect(result).toBe('R');
        });

        it('explicit selectedFace takes priority over face-direct mode', () => {
            const stickerId = findStickerOnFace(Face.R, 4);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.U,
                faceDirectMode: true,
                direction: DragDirection.RIGHT,
                doubleTurn: false,
                model,
            });
            expect(result).toBe('U');
        });

        it('infers layer move when no face selected and not in face-direct mode', () => {
            // Top-left corner sticker on F face (position 0) → row 0, col 0
            const stickerId = findStickerOnFace(Face.F, 0);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: undefined,
                faceDirectMode: false,
                direction: DragDirection.RIGHT,
                doubleTurn: false,
                model,
            });
            // Dragging right on front face, top row → U' (right drag at top of F)
            expect(result).toBe("U'");
        });

        it('infers layer move for bottom row sticker', () => {
            // Bottom-right corner sticker on F face (position 8) → row 2, col 2
            const stickerId = findStickerOnFace(Face.F, 8);
            const result = inferKeyboardMove({
                stickerId,
                selectedFace: undefined,
                faceDirectMode: false,
                direction: DragDirection.RIGHT,
                doubleTurn: false,
                model,
            });
            // Dragging right on front face, bottom row → D
            expect(result).toBe('D');
        });

        it('applies remapDirection when provided', () => {
            const stickerId = findStickerOnFace(Face.F, 4);
            // Remap that swaps UP→LEFT (would turn CW into CCW)
            const remapDirection = () => DragDirection.LEFT;

            const result = inferKeyboardMove({
                stickerId,
                selectedFace: Face.F,
                faceDirectMode: false,
                direction: DragDirection.UP,
                doubleTurn: false,
                model,
                remapDirection,
            });
            expect(result).toBe("F'");
        });

        it('returns undefined for invalid sticker ID', () => {
            const result = inferKeyboardMove({
                stickerId: 'nonexistent' as StickerId,
                selectedFace: undefined,
                faceDirectMode: false,
                direction: DragDirection.UP,
                doubleTurn: false,
                model,
            });
            expect(result).toBeUndefined();
        });
    });
});
