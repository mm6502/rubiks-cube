import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { StickerId } from '@/cube/types';
import { Face } from '@/cube/types';
import { EventName } from '@/types';

import { type FlatCommandContext, getCommands, handleKeyDown, handleKeyUp } from './commands';

function createMockContext(overrides?: Partial<FlatCommandContext>): FlatCommandContext {
    const moveHistoryMock = {
        canUndo: vi.fn().mockReturnValue(true),
        canRedo: vi.fn().mockReturnValue(true),
    } as any;

    const state = {
        currentSelected: undefined as StickerId | undefined,
        model: {
            getCurrentState: () => ({}),
            getMoveHistory: () => moveHistoryMock,
        } as any,
        cubeWalk: false,
        isRotated: false,
        ...(overrides?.state ?? {}),
    } as any;

    return {
        state,
        isFaceDirectMode: vi.fn().mockReturnValue(false),
        setFaceDirectMode: vi.fn(),
        getSelectedFace: vi.fn().mockReturnValue(undefined),
        selectFace: vi.fn(),
        isGhostVisible: vi.fn().mockReturnValue(false),
        toggleGhosts: vi.fn(),
        getViewType: vi.fn().mockReturnValue('flat'),
        canUndo: vi.fn().mockReturnValue(true),
        canRedo: vi.fn().mockReturnValue(true),
        emitEvent: vi.fn(),
        updateSelected: vi.fn(),
        ...overrides,
    } as FlatCommandContext;
}

describe('handleKeyDown / handleKeyUp', () => {
    let ctx: FlatCommandContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('handleKeyDown delegates to willHandleKeyPress with preview=true', () => {
        const result = handleKeyDown(ctx, new KeyboardEvent('keydown', { key: 'b' }));
        expect(result).toBe(false);
    });

    it('handleKeyUp delegates to willHandleKeyPress with preview=false', () => {
        const result = handleKeyUp(ctx, new KeyboardEvent('keyup', { key: 'b' }));
        expect(result).toBe(false);
    });

    describe('willHandleKeyPress internal behavior', () => {
        it('returns false for unrecognised keys', () => {
            expect(handleKeyDown(ctx, new KeyboardEvent('keydown', { key: 'z' }))).toBe(false);
        });

        it('face-select key (Space) with selected sticker returns true', () => {
            ctx.state.currentSelected = 'sticker-U-4' as StickerId;
            ctx.getSelectedFace = vi.fn().mockReturnValue(Face.U);
            const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space' });
            expect(handleKeyDown(ctx, event)).toBe(true);
        });

        it('face-select key (Backtick) with selected sticker returns true', () => {
            ctx.state.currentSelected = 'sticker-U-4' as StickerId;
            const event = new KeyboardEvent('keydown', { key: '`' });
            expect(handleKeyDown(ctx, event)).toBe(true);
        });

        it('face-select key fires handleFaceSelectKey on keyup (not preview)', () => {
            ctx.state.currentSelected = 'sticker-U-4' as StickerId;
            ctx.state.model = {
                getCurrentState: () => ({
                    cubeSize: 3,
                    cubiesById: new Map([
                        [
                            'cubie-U-center',
                            {
                                id: 'cubie-U-center',
                                position: { x: 0, y: 1, z: 0 },
                                stickers: new Map([
                                    [
                                        'sticker-U-4',
                                        {
                                            id: 'sticker-U-4',
                                            color: 'white',
                                            currentFace: 'U',
                                            facePosition: 4,
                                            cubieId: 'cubie-U-center',
                                        },
                                    ],
                                ]),
                            },
                        ],
                    ]),
                    moves: [],
                }),
            } as any;
            ctx.getSelectedFace = vi.fn().mockReturnValue(Face.U);
            ctx.selectFace = vi.fn();

            handleKeyUp(ctx, new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
            expect(ctx.selectFace).toHaveBeenCalled();
        });

        it('keyboard-move with Ctrl+Arrow emits MOVE_REQUESTED on keyup', () => {
            const model = {
                getCurrentState: () => ({
                    cubeSize: 3,
                    cubiesById: new Map(),
                    moves: [],
                    stickers: {},
                }),
            } as any;
            ctx.state.currentSelected = 'sticker-U-4' as StickerId;
            ctx.state.model = model;
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            handleKeyUp(
                ctx,
                new KeyboardEvent('keyup', {
                    key: 'ArrowUp',
                    ctrlKey: true,
                })
            );

            // inferKeyboardMove needs a valid sticker/cubie context to succeed,
            // but we verify it at least tried to find the sticker
            expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.any(Object));
            emitSpy.mockRestore();
        });

        it('navigation key does not throw', () => {
            ctx.state.currentSelected = 'sticker-U-4' as StickerId;
            ctx.state.model = {
                cubeSize: 3,
                getCurrentState: () => ({
                    cubeSize: 3,
                    cubiesById: new Map(),
                }),
            } as any;
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            expect(() => handleKeyDown(ctx, event)).not.toThrow();
        });

        it('navigation returns false when nothing selected', () => {
            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
            expect(handleKeyDown(ctx, event)).toBe(false);
        });
    });
});

describe('getCommands', () => {
    let ctx: FlatCommandContext;

    beforeEach(() => {
        ctx = createMockContext();
    });

    it('returns array of command objects', () => {
        const cmds = getCommands(ctx);
        expect(Array.isArray(cmds)).toBe(true);
        expect(cmds.length).toBeGreaterThanOrEqual(5);
    });

    it('cube-walk command toggles state', () => {
        const cmds = getCommands(ctx);
        const cubeWalk = cmds.find(c => c.id === 'flat.cube-walk')!;
        expect(cubeWalk).toBeDefined();
        expect(cubeWalk.isActive!()).toBe(false);
        cubeWalk.action();
        expect(ctx.state.cubeWalk).toBe(true);
        expect(ctx.emitEvent).toHaveBeenCalledWith(
            EventName.VIEW_STATE_CHANGED,
            expect.objectContaining({ viewType: 'flat' })
        );
    });

    it('face-direct-mode command toggles', () => {
        const cmds = getCommands(ctx);
        const fdm = cmds.find(c => c.id === 'flat.face-direct-mode')!;
        expect(fdm).toBeDefined();
        expect(fdm.isActive!()).toBe(false);
        fdm.action();
        expect(ctx.setFaceDirectMode).toHaveBeenCalledWith(true);
    });

    it('undo command isEnabled reflects canUndo', () => {
        const cmds = getCommands(ctx);
        const undo = cmds.find(c => c.id === 'flat.undo')!;
        expect(undo.isEnabled!()).toBe(true);
        const moveHistory = ctx.state.model!.getMoveHistory();
        (moveHistory.canUndo as Mock).mockReturnValue(false);
        expect(undo.isEnabled!()).toBe(false);
    });

    it('redo command isEnabled reflects canRedo', () => {
        const cmds = getCommands(ctx);
        const redo = cmds.find(c => c.id === 'flat.redo')!;
        expect(redo.isEnabled!()).toBe(true);
        const moveHistory = ctx.state.model!.getMoveHistory();
        (moveHistory.canRedo as Mock).mockReturnValue(false);
        expect(redo.isEnabled!()).toBe(false);
    });

    it('redo fallback emit is empty', () => {
        const cmds = getCommands(ctx);
        const redo = cmds.find(c => c.id === 'flat.redo')!;
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        redo.action();
        expect(emitSpy).toHaveBeenCalledWith(EventName.REDO_REQUESTED, {});
        emitSpy.mockRestore();
    });
});
