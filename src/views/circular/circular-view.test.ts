import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Map as IMap } from 'immutable';

import * as keyboardMoves from '@/interaction/keyboard-moves';
import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { CubeState, Cubie, CubieId, LayoutMode, PositionKey, StickerId } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { EventName } from '@/types';

import * as highlights from './highlights';
import * as initialization from './initialization';
import * as keyboard from './keyboard-cube-walking';
import * as rendering from './rendering';
import { CircularCubeView } from './circular-view';
import { circularViewFactory } from './index';
import { CircularTouchHandler } from './touch-handler';
import { ZoomPanController } from './zoom-pan';

// Minimal mock model for tests
const mockState = {
    cubeSize: 3,
    cubiesById: IMap<CubieId, Cubie>(),
    cubiesByPosition: IMap<PositionKey, Cubie>(),
    timestamp: 0,
} satisfies CubeState;

const mockModel = {
    isSolved: () => false,
    getState: () => mockState,
    getCurrentState: () => mockState,
    getMoveHistory: () => ({
        canUndo: () => false,
        canRedo: () => false,
    }),
} as any;

// Unit tests merged into same file
describe('CircularCubeView (unit)', () => {
    let view: CircularCubeView;
    let container: HTMLElement;

    beforeEach(() => {
        view = new CircularCubeView();
        container = document.createElement('div');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('create throws when initialize fails', () => {
        // Arrange
        vi.spyOn(initialization, 'initialize').mockReturnValue(undefined as any);

        // Act & Assert
        expect(() => view.create(container, mockModel)).toThrow();
    });

    it('create inlines SVG and exposes sticker groups', () => {
        // Arrange
        const view = circularViewFactory.create();
        const container = document.createElement('div');

        // Act
        view.create(container, mockModel);
        const groups = container.querySelectorAll('.sticker');

        // Assert
        // 6 faces * 9 stickers = 54
        expect(groups.length).toBe(54);

        // Cleanup
        view.destroy();
    });

    it('create attaches listeners, initializes zoom/pan, and renders initial state', () => {
        // Arrange
        const fakeState: any = {
            svgRoot: document.createElement('svg') as unknown as SVGSVGElement,
            svgReady: true,
            svgElementCache: new Map<string, SVGCircleElement>(),
            svgIdToStickerId: new Map<string, string>(),
            stickerIdToSvgId: new Map<string, string>(),
            styles: {},
            axisCircles: [],
            stickerLookupMap: new Map(),
        };

        // Create DOM structure expected by create(): clip + transform
        const clipEl = document.createElement('div');
        clipEl.setAttribute('data-role', 'clip-container');
        const transformEl = document.createElement('div');
        transformEl.setAttribute('data-role', 'transform-target');
        container.appendChild(clipEl);
        container.appendChild(transformEl);

        const initSpy = vi.spyOn(initialization, 'initialize').mockReturnValue(fakeState as any);
        const attachSpy = vi
            .spyOn(initialization, 'attachStickerEventListeners')
            .mockImplementation(() => {});
        const renderSpy = vi.spyOn(rendering, 'renderState').mockImplementation(() => {});

        const touchAttachSpy = vi.spyOn(CircularTouchHandler.prototype, 'attach');
        const zoomSetSpy = vi.spyOn(ZoomPanController.prototype, 'setGestureMode');
        const zoomResetSpy = vi.spyOn(ZoomPanController.prototype, 'reset');

        // Act
        view.create(container, mockModel);

        // Assert
        expect(initSpy).toHaveBeenCalledWith(container, mockModel, expect.any(Object));
        expect(attachSpy).toHaveBeenCalledWith(fakeState, view.getViewType(), expect.any(Function));
        expect(renderSpy).toHaveBeenCalledWith(fakeState, mockModel.getCurrentState());
        expect(touchAttachSpy).toHaveBeenCalled();

        // Pan mode toggle command should invoke ZoomPanController methods
        const panCommand = view.getCommands().find(c => c.id === 'circular-view.pan-mode');
        expect(panCommand).toBeDefined();
        panCommand?.action();
        expect(zoomSetSpy).toHaveBeenCalled();

        const resetCommand = view.getCommands().find(c => c.id === 'circular-view.reset-zoom');
        expect(resetCommand).toBeDefined();
        resetCommand?.action();
        expect(zoomResetSpy).toHaveBeenCalled();
    });

    it('update delegates to rendering.renderState when svgReady', () => {
        // Arrange
        const fakeState: any = {
            svgReady: true,
        };
        (view as any).state = fakeState;
        const renderSpy = vi.spyOn(rendering, 'renderState').mockImplementation(() => {});

        // Act
        view.update({ getCurrentState: () => 's' } as any);

        // Assert
        expect(renderSpy).toHaveBeenCalledWith(fakeState, 's');
    });

    it('updateSelective delegates to rendering.updateSelective', () => {
        // Arrange
        const fakeState: any = { svgReady: true };
        (view as any).state = fakeState;
        const updateSpy = vi.spyOn(rendering, 'updateSelective').mockResolvedValue(undefined);

        const event: any = { foo: 'bar' };

        // Act
        view.updateSelective(event as any);

        // Assert
        expect(updateSpy).toHaveBeenCalledWith(fakeState, event);
    });

    it('updateHighlight delegates to highlights.updateHighlight', () => {
        // Arrange
        const spy = vi.spyOn(highlights, 'updateHighlight').mockImplementation(() => {});
        const fakeState: any = {
            svgElementCache: new Map(),
            stickerIdToSvgId: new Map(),
            styles: {},
        };
        (view as any).state = fakeState;

        // Act
        view.updateHighlight('s1' as any);

        // Assert
        expect(spy).toHaveBeenCalledWith(fakeState, expect.any(Object), 's1');
    });

    it('updateSelected delegates to highlights.updateSelected', () => {
        // Arrange
        const spy = vi.spyOn(highlights, 'updateSelected').mockImplementation(() => {});
        const fakeState: any = {
            svgElementCache: new Map(),
            stickerIdToSvgId: new Map(),
            styles: {},
        };
        (view as any).state = fakeState;

        // Act
        view.updateSelected('s1' as any);

        // Assert
        expect(spy).toHaveBeenCalledWith(fakeState, expect.any(Object), 's1');
    });

    it('handleKeyDown and handleKeyUp call navigate when navigation key', () => {
        // Arrange
        const evt = new KeyboardEvent('keydown');
        const isNavSpy = vi.spyOn(keyboard, 'isNavigationKey').mockReturnValue(true);
        const navSpy = vi.spyOn(keyboard, 'navigate').mockReturnValue(true as any);

        // Act
        const resDown = view.handleKeyDown(evt);

        // Assert
        expect(isNavSpy).toHaveBeenCalledWith(evt);
        expect(navSpy).toHaveBeenCalledWith(evt, true, (view as any).state, expect.any(Function));
        expect(resDown).toBe(true);

        // Act
        const resUp = view.handleKeyUp(evt);

        // Assert
        expect(navSpy).toHaveBeenCalledWith(evt, false, (view as any).state, expect.any(Function));
        expect(resUp).toBe(true);
    });

    it('destroy clears container innerHTML and svgRoot', () => {
        // Arrange
        const fakeContainer = document.createElement('div');
        fakeContainer.innerHTML = '<svg></svg>';
        const fakeState: any = { container: fakeContainer, svgRoot: {} };
        (view as any).state = fakeState;

        // Act
        view.destroy();

        // Assert
        expect(fakeContainer.innerHTML).toBe('');
        expect(fakeState.svgRoot).toBeUndefined();
    });

    it('handleKeyDown and handleKeyUp call navigate when navigation key', () => {
        // Arrange
        const evt = new KeyboardEvent('keydown');
        const isNavSpy = vi.spyOn(keyboard, 'isNavigationKey').mockReturnValue(true);
        const navSpy = vi.spyOn(keyboard, 'navigate').mockReturnValue(true as any);

        // Act
        const resDown = view.handleKeyDown(evt);

        // Assert
        expect(isNavSpy).toHaveBeenCalledWith(evt);
        expect(navSpy).toHaveBeenCalledWith(evt, true, (view as any).state, expect.any(Function));
        expect(resDown).toBe(true);

        // Act
        const resUp = view.handleKeyUp(evt);

        // Assert
        expect(navSpy).toHaveBeenCalledWith(evt, false, (view as any).state, expect.any(Function));
        expect(resUp).toBe(true);
    });

    it('handleKeyDown returns false when navigation key is false', () => {
        // Arrange
        const evt = new KeyboardEvent('keydown');
        const isNavSpy = vi.spyOn(keyboard, 'isNavigationKey').mockReturnValue(false);
        const navSpy = vi.spyOn(keyboard, 'navigate');

        // Act
        const res = view.handleKeyDown(evt);

        // Assert
        expect(isNavSpy).toHaveBeenCalledWith(evt);
        expect(navSpy).not.toHaveBeenCalled();
        expect(res).toBe(false);
    });

    it('updateSelective swallows errors from rendering.updateSelective', async () => {
        // Arrange
        const fakeState: any = { svgReady: true };
        (view as any).state = fakeState;
        const updateSpy = vi
            .spyOn(rendering, 'updateSelective')
            .mockRejectedValue(new Error('boom'));

        // Act
        view.updateSelective({} as any);
        await Promise.resolve();

        // Assert
        expect(updateSpy).toHaveBeenCalledWith(fakeState, {});
    });

    it('getViewType and size/commands return expected values', () => {
        // Act & Assert
        expect(view.getViewType()).toBe('circular');
        expect(view.getMinimumSize()).toEqual({ width: 300, height: 300 });
        const commands = view.getCommands();
        expect(commands).toHaveLength(7);
        expect(commands.map(c => c.id)).toContain('circular.undo');
        expect(commands.map(c => c.id)).toContain('circular.redo');
        expect(commands.map(c => c.id)).toContain('circular-view.pan-mode');
        expect(commands.map(c => c.id)).toContain('circular-view.reset-zoom');
        expect(commands.map(c => c.id)).toContain('circular-view.ghost-hints');
        expect(commands.map(c => c.id)).toContain('circular-view.face-direct-mode');
        expect(commands.map(c => c.id)).toContain('circular-view.cube-walk');
    });

    it('face-direct-mode command toggles touch handler direct mode', () => {
        // Arrange
        const handler = {
            getFaceDirectMode: vi.fn().mockReturnValue(false),
            setFaceDirectMode: vi.fn(),
        } as any;
        (view as any).state.touchHandler = handler;

        const commands = view.getCommands();
        const faceModeCommand = commands.find(c => c.id === 'circular-view.face-direct-mode');
        expect(faceModeCommand).toBeDefined();

        // Act
        faceModeCommand?.action();

        // Assert
        expect(handler.getFaceDirectMode).toHaveBeenCalled();
        expect(handler.setFaceDirectMode).toHaveBeenCalledWith(true);
    });

    // ─── attachStickerEventListeners callback ─────────────────────────────────

    it('attachStickerEventListeners callback invokes updateSelected', () => {
        // Arrange
        let capturedCallback: ((id: StickerId) => void) | undefined;
        const fakeState: any = {
            svgRoot: document.createElement('svg') as unknown as SVGSVGElement,
            svgReady: true,
            svgElementCache: new Map(),
            svgIdToStickerId: new Map(),
            stickerIdToSvgId: new Map(),
            styles: {},
            axisCircles: [],
        };
        vi.spyOn(initialization, 'initialize').mockReturnValue(fakeState);
        vi.spyOn(initialization, 'attachStickerEventListeners').mockImplementation(
            (_state, _viewType, cb) => {
                capturedCallback = cb;
            }
        );
        vi.spyOn(rendering, 'renderState').mockImplementation(() => {});
        const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

        view.create(container, mockModel);

        // Act — invoke the captured callback directly
        capturedCallback?.('sticker-42' as any);

        // Assert
        expect(updateSelectedSpy).toHaveBeenCalledWith('sticker-42');
    });

    // ─── create: falsy clip/transform branch ─────────────────────────────────

    it('create skips zoom/pan setup when clip/transform elements are absent', () => {
        // Arrange — no data-role elements in container
        const fakeState: any = {
            svgRoot: document.createElement('svg') as unknown as SVGSVGElement,
            svgReady: true,
            svgElementCache: new Map(),
            svgIdToStickerId: new Map(),
            stickerIdToSvgId: new Map(),
            styles: {},
            axisCircles: [],
            zoomPan: null,
            touchHandler: null,
            panMode: false,
        };
        vi.spyOn(initialization, 'initialize').mockReturnValue(fakeState);
        vi.spyOn(initialization, 'attachStickerEventListeners').mockImplementation(() => {});
        vi.spyOn(rendering, 'renderState').mockImplementation(() => {});

        // Act
        expect(() => view.create(container, mockModel)).not.toThrow();

        // Assert — zoom/pan and touch handler remain null
        expect((view as any).state.zoomPan).toBeNull();
        expect((view as any).state.touchHandler).toBeNull();
    });

    // ─── create: if (f4) branch ───────────────────────────────────────────────

    it('create calls updateSelected with found f4 sticker id', () => {
        // Arrange
        const fakeState: any = {
            svgRoot: document.createElement('svg') as unknown as SVGSVGElement,
            svgReady: true,
            svgElementCache: new Map(),
            svgIdToStickerId: new Map(),
            stickerIdToSvgId: new Map(),
            styles: {},
            axisCircles: [],
        };
        vi.spyOn(initialization, 'initialize').mockReturnValue(fakeState);
        vi.spyOn(initialization, 'attachStickerEventListeners').mockImplementation(() => {});
        vi.spyOn(rendering, 'renderState').mockImplementation(() => {});
        vi.spyOn(CubeStateUtils, 'getStickerAt').mockReturnValue({ id: 'sticker-f4' } as any);
        const updateSelectedSpy = vi.spyOn(view, 'updateSelected');

        // Act
        view.create(container, mockModel);

        // Assert
        expect(updateSelectedSpy).toHaveBeenCalledWith('sticker-f4');
    });

    // ─── setLayoutMode ────────────────────────────────────────────────────────

    it('setLayoutMode delegates to touchHandler', () => {
        // Arrange
        const fakeHandler = { setLayoutMode: vi.fn() } as any;
        (view as any).state.touchHandler = fakeHandler;

        // Act
        view.setLayoutMode(LayoutMode.Tabbed);

        // Assert
        expect(fakeHandler.setLayoutMode).toHaveBeenCalledWith(LayoutMode.Tabbed);
    });

    it('setLayoutMode is a no-op when touchHandler is null', () => {
        // Act & Assert — should not throw
        expect(() => view.setLayoutMode('floating')).not.toThrow();
    });

    // ─── undo/redo commands ───────────────────────────────────────────────────

    it('undo action emits UNDO_REQUESTED', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const undoCmd = view.getCommands().find(c => c.id === 'circular.undo')!;

        // Act
        undoCmd.action();

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.UNDO_REQUESTED, {});
    });

    it('redo action emits REDO_REQUESTED', () => {
        // Arrange
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const redoCmd = view.getCommands().find(c => c.id === 'circular.redo')!;

        // Act
        redoCmd.action();

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.REDO_REQUESTED, {});
    });

    it('undo isEnabled returns false when no model is set', () => {
        // Arrange — default state has no model
        const undoCmd = view.getCommands().find(c => c.id === 'circular.undo')!;

        // Act & Assert
        expect(undoCmd.isEnabled!()).toBe(false);
    });

    it('undo isEnabled returns true when canUndo() is true', () => {
        // Arrange
        (view as any).state.model = { getMoveHistory: () => ({ canUndo: () => true }) };
        const undoCmd = view.getCommands().find(c => c.id === 'circular.undo')!;

        // Act & Assert
        expect(undoCmd.isEnabled!()).toBe(true);
    });

    it('redo isEnabled returns false when no model is set', () => {
        // Arrange — default state has no model
        const redoCmd = view.getCommands().find(c => c.id === 'circular.redo')!;

        // Act & Assert
        expect(redoCmd.isEnabled!()).toBe(false);
    });

    it('redo isEnabled returns true when canRedo() is true', () => {
        // Arrange
        (view as any).state.model = { getMoveHistory: () => ({ canRedo: () => true }) };
        const redoCmd = view.getCommands().find(c => c.id === 'circular.redo')!;

        // Act & Assert
        expect(redoCmd.isEnabled!()).toBe(true);
    });

    // ─── pan-mode command ─────────────────────────────────────────────────────

    it('pan-mode isActive reflects current panMode state', () => {
        // Arrange
        const panCmd = view.getCommands().find(c => c.id === 'circular-view.pan-mode')!;

        // Assert default
        expect(panCmd.isActive!()).toBe(false);

        // Flip
        (view as any).state.panMode = true;
        expect(panCmd.isActive!()).toBe(true);
    });

    it('pan-mode second toggle reverts to delegated-left-drag', () => {
        // Arrange — start with panMode already on
        (view as any).state.panMode = true;
        const fakeZoom = { setGestureMode: vi.fn() } as any;
        (view as any).state.zoomPan = fakeZoom;
        const panCmd = view.getCommands().find(c => c.id === 'circular-view.pan-mode')!;

        // Act — toggle off
        panCmd.action();

        // Assert
        expect((view as any).state.panMode).toBe(false);
        expect(fakeZoom.setGestureMode).toHaveBeenCalledWith('delegated-left-drag');
    });

    // ─── face-direct-mode: null handler paths ─────────────────────────────────

    it('face-direct-mode isActive returns false when touchHandler is null', () => {
        // Arrange
        (view as any).state.touchHandler = null;
        const faceCmd = view.getCommands().find(c => c.id === 'circular-view.face-direct-mode')!;

        // Act & Assert
        expect(faceCmd.isActive!()).toBe(false);
    });

    it('face-direct-mode action is a no-op when touchHandler is null', () => {
        // Arrange
        (view as any).state.touchHandler = null;
        const faceCmd = view.getCommands().find(c => c.id === 'circular-view.face-direct-mode')!;

        // Act & Assert — should not throw
        expect(() => faceCmd.action()).not.toThrow();
    });

    // ─── destroy with non-null components ────────────────────────────────────

    it('destroy calls destroy on zoomPan and touchHandler when set', () => {
        // Arrange
        const fakeZoom = { destroy: vi.fn() } as any;
        const fakeTouch = { destroy: vi.fn() } as any;
        const fakeContainer = document.createElement('div');
        (view as any).state.zoomPan = fakeZoom;
        (view as any).state.touchHandler = fakeTouch;
        (view as any).state = { ...(view as any).state, container: fakeContainer, svgRoot: {} };

        // Act
        view.destroy();

        // Assert
        expect(fakeZoom.destroy).toHaveBeenCalled();
        expect(fakeTouch.destroy).toHaveBeenCalled();
        expect((view as any).state.zoomPan).toBeNull();
        expect((view as any).state.touchHandler).toBeNull();
    });

    // ─── cube-walk command ────────────────────────────────────────────────────

    it('cube-walk command exists and is active by default', () => {
        const cmd = view.getCommands().find(c => c.id === 'circular-view.cube-walk')!;
        expect(cmd).toBeDefined();
        expect(cmd.isActive!()).toBe(true);
    });

    it('cube-walk command toggles state', () => {
        const cmd = view.getCommands().find(c => c.id === 'circular-view.cube-walk')!;
        expect(cmd.isActive!()).toBe(true);
        cmd.action();
        expect(cmd.isActive!()).toBe(false);
        cmd.action();
        expect(cmd.isActive!()).toBe(true);
    });

    it('cube-walk command emits VIEW_STATE_CHANGED', () => {
        const spy = vi.spyOn(Application.eventBus, 'emit');
        const cmd = view.getCommands().find(c => c.id === 'circular-view.cube-walk')!;
        cmd.action();
        expect(spy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: 'circular',
        });
        spy.mockRestore();
    });

    it('getState includes cubeWalk', () => {
        const state = view.getState();
        expect(state.cubeWalk).toBe(true);
    });

    // ─── handleFaceSelectKey ─────────────────────────────────────────────────

    it('face-select key toggles face selection via touchHandler', () => {
        // Arrange
        const handler = {
            getSelectedFace: vi.fn().mockReturnValue(undefined),
            selectFace: vi.fn(),
            getFaceDirectMode: vi.fn().mockReturnValue(false),
            setFaceDirectMode: vi.fn(),
            setLayoutMode: vi.fn(),
        } as any;
        (view as any).state.touchHandler = handler;
        (view as any).state.currentSelected = 'sticker-F4';
        (view as any).state.model = {
            getCurrentState: () => mockState,
            getMoveHistory: () => ({ canUndo: () => false, canRedo: () => false }),
        };

        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            currentFace: 'F',
        } as any);
        vi.spyOn(keyboardMoves, 'isFaceSelectKey').mockReturnValue(true);
        vi.spyOn(keyboardMoves, 'isKeyboardMoveKey').mockReturnValue(false);

        // Act
        const evt = new KeyboardEvent('keyup', { key: ' ' });
        view.handleKeyUp(evt);

        // Assert — selectFace should have been called with the sticker's face
        expect(handler.selectFace).toHaveBeenCalledWith('F');
    });

    it('face-select key deselects face when already selected', () => {
        const handler = {
            getSelectedFace: vi.fn().mockReturnValue('F'),
            selectFace: vi.fn(),
            getFaceDirectMode: vi.fn().mockReturnValue(false),
        } as any;
        (view as any).state.touchHandler = handler;
        (view as any).state.currentSelected = 'sticker-F4';
        (view as any).state.model = {
            getCurrentState: () => mockState,
            getMoveHistory: () => ({}),
        };

        vi.spyOn(CubeStateUtils, 'getStickerById').mockReturnValue({
            currentFace: 'F',
        } as any);
        vi.spyOn(keyboardMoves, 'isFaceSelectKey').mockReturnValue(true);
        vi.spyOn(keyboardMoves, 'isKeyboardMoveKey').mockReturnValue(false);

        const evt = new KeyboardEvent('keyup', { key: ' ' });
        view.handleKeyUp(evt);

        expect(handler.selectFace).toHaveBeenCalledWith(undefined);
    });

    it('face-select key returns false when no sticker is selected', () => {
        (view as any).state.currentSelected = undefined;
        vi.spyOn(keyboardMoves, 'isFaceSelectKey').mockReturnValue(true);

        const result = view.handleKeyUp(new KeyboardEvent('keyup', { key: ' ' }));
        expect(result).toBe(false);
    });

    // ─── handleKeyboardMove ──────────────────────────────────────────────────

    it('keyboard move emits MOVE_REQUESTED when notation is inferred', () => {
        const handler = {
            getSelectedFace: vi.fn().mockReturnValue('F'),
            getFaceDirectMode: vi.fn().mockReturnValue(false),
        } as any;
        (view as any).state.touchHandler = handler;
        (view as any).state.currentSelected = 'sticker-F4';
        (view as any).state.model = {
            getCurrentState: () => mockState,
            getMoveHistory: () => ({}),
        };

        vi.spyOn(keyboardMoves, 'isFaceSelectKey').mockReturnValue(false);
        vi.spyOn(keyboardMoves, 'isKeyboardMoveKey').mockReturnValue(true);
        vi.spyOn(keyboardMoves, 'mapArrowToDirection').mockReturnValue('up' as any);
        vi.spyOn(keyboardMoves, 'inferKeyboardMove').mockReturnValue('R');

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const evt = new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true });
        view.handleKeyUp(evt);

        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: 'R',
            viewId: 'circular',
            tentative: false,
        });
    });

    it('keyboard move does nothing when no direction mapped', () => {
        const handler = {
            getSelectedFace: vi.fn(),
            getFaceDirectMode: vi.fn(),
        } as any;
        (view as any).state.touchHandler = handler;
        (view as any).state.currentSelected = 'sticker-F4';
        (view as any).state.model = {
            getCurrentState: () => mockState,
            getMoveHistory: () => ({}),
        };

        vi.spyOn(keyboardMoves, 'isFaceSelectKey').mockReturnValue(false);
        vi.spyOn(keyboardMoves, 'isKeyboardMoveKey').mockReturnValue(true);
        vi.spyOn(keyboardMoves, 'mapArrowToDirection').mockReturnValue(undefined as any);

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        view.handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true }));

        expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
    });

    // ─── ghost-hints command ─────────────────────────────────────────────────

    it('ghost-hints command toggles showGhosts and calls animateGhostToggle', () => {
        vi.spyOn(rendering, 'animateGhostToggle').mockResolvedValue(undefined);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        // Set to off state (index 0)
        (view as any).state.showGhosts = false;
        (view as any).state.ghostOpacityIndex = 0;

        const ghostCmd = view.getCommands().find(c => c.id === 'circular-view.ghost-hints')!;
        expect(ghostCmd.isActive!()).toBe(false);

        ghostCmd.action();

        expect((view as any).state.showGhosts).toBe(true);
        expect(ghostCmd.isActive!()).toBe(true);
        expect(rendering.animateGhostToggle).toHaveBeenCalledWith((view as any).state);
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: 'circular',
        });
    });

    // ─── setState ────────────────────────────────────────────────────────────

    it('setState with showGhosts calls setGhostVisibility', () => {
        vi.spyOn(rendering, 'setGhostVisibility').mockImplementation(() => {});

        view.setState({ showGhosts: true });

        expect((view as any).state.showGhosts).toBe(true);
        expect(rendering.setGhostVisibility).toHaveBeenCalledWith((view as any).state);
    });

    it('setState with faceDirectMode delegates to touchHandler', () => {
        const handler = { setFaceDirectMode: vi.fn() } as any;
        (view as any).state.touchHandler = handler;

        view.setState({ faceDirectMode: true });

        expect(handler.setFaceDirectMode).toHaveBeenCalledWith(true);
    });

    it('setState with panMode sets zoomPan gesture mode', () => {
        const fakeZoom = { setGestureMode: vi.fn() } as any;
        (view as any).state.zoomPan = fakeZoom;

        view.setState({ panMode: true });

        expect((view as any).state.panMode).toBe(true);
        expect(fakeZoom.setGestureMode).toHaveBeenCalledWith('legacy');
    });

    it('setState ignores invalid input', () => {
        expect(() => view.setState(null)).not.toThrow();
        expect(() => view.setState(42)).not.toThrow();
        expect(() => view.setState('string')).not.toThrow();
    });

    // ─── restoreSelection success path ───────────────────────────────────────

    it('restoreSelection updates selection after update', () => {
        const fakeState: any = {
            svgReady: true,
            selectedFace: 'F',
            selectedPosition: 4,
            model: {
                getCurrentState: () => mockState,
            },
        };
        (view as any).state = fakeState;

        vi.spyOn(rendering, 'renderState').mockImplementation(() => {});
        vi.spyOn(CubeStateUtils, 'getStickerAt').mockReturnValue({ id: 'sticker-F4' } as any);
        const updateSelectedSpy = vi.spyOn(view, 'updateSelected').mockImplementation(() => {});

        view.update({ getCurrentState: () => mockState } as any);

        expect(updateSelectedSpy).toHaveBeenCalledWith('sticker-F4');
    });

    it('setState restores cubeWalk', () => {
        view.setState({ cubeWalk: false });
        expect(view.getState().cubeWalk).toBe(false);
    });

    // ─── setState: panMode and faceDirectMode ─────────────────────────────────

    it('setState with panMode=true calls zoomPan.setGestureMode("legacy")', () => {
        const fakeZoom = { setGestureMode: vi.fn() } as any;
        (view as any).state.zoomPan = fakeZoom;

        view.setState({ panMode: true });

        expect((view as any).state.panMode).toBe(true);
        expect(fakeZoom.setGestureMode).toHaveBeenCalledWith('legacy');
    });

    it('setState with panMode=false calls zoomPan.setGestureMode("delegated-left-drag")', () => {
        (view as any).state.panMode = true; // start in pan mode
        const fakeZoom = { setGestureMode: vi.fn() } as any;
        (view as any).state.zoomPan = fakeZoom;

        view.setState({ panMode: false });

        expect((view as any).state.panMode).toBe(false);
        expect(fakeZoom.setGestureMode).toHaveBeenCalledWith('delegated-left-drag');
    });

    it('setState with faceDirectMode calls touchHandler.setFaceDirectMode', () => {
        const fakeHandler = { setFaceDirectMode: vi.fn() } as any;
        (view as any).state.touchHandler = fakeHandler;

        view.setState({ faceDirectMode: true });

        expect(fakeHandler.setFaceDirectMode).toHaveBeenCalledWith(true);
    });

    it('setState ignores panMode when zoomPan is null', () => {
        (view as any).state.zoomPan = null;
        expect(() => view.setState({ panMode: true })).not.toThrow();
    });

    it('setState ignores faceDirectMode when touchHandler is null', () => {
        (view as any).state.touchHandler = null;
        expect(() => view.setState({ faceDirectMode: true })).not.toThrow();
    });

    // ─── destroy with faceLabelTilt timer ───────────────────────────────────

    it('destroy clears faceLabelTilt timer when set', () => {
        vi.useFakeTimers();
        const tilt = (view as any).faceLabelTilt;
        tilt['timer'] = setTimeout(() => {}, 9999);
        const fakeState = { container: null, svgRoot: undefined };
        (view as any).state = fakeState;

        view.destroy();

        expect(tilt['timer']).toBeNull();
        vi.useRealTimers();
    });

    // ─── handleKeyPress: face-select and keyboard-move keys ───────────────────

    it('face-select key (backtick) returns true when sticker is selected', () => {
        (view as any).state.currentSelected = 'sticker-1';
        const evt = new KeyboardEvent('keydown', { key: '`' });

        expect(view.handleKeyDown(evt)).toBe(true);
    });

    it('face-select key returns false when no sticker is selected', () => {
        (view as any).state.currentSelected = undefined;
        const evt = new KeyboardEvent('keydown', { key: '`' });

        expect(view.handleKeyDown(evt)).toBe(false);
    });

    it('keyboard-move key (Ctrl+ArrowUp) returns true when sticker is selected', () => {
        (view as any).state.currentSelected = 'sticker-1';
        const evt = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true });

        expect(view.handleKeyDown(evt)).toBe(true);
    });

    it('keyboard-move key returns false when no sticker is selected', () => {
        (view as any).state.currentSelected = undefined;
        const evt = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true });

        expect(view.handleKeyDown(evt)).toBe(false);
    });

    it('handleKeyboardMove emits MOVE_REQUESTED when model and sticker available', () => {
        // Arrange: set up model with a valid state via real CubeController
        const controller = new CubeController();
        const state = controller.getCurrentState();
        const sticker = CubeStateUtils.getStickerAt(state, 'F', 4);

        (view as any).state.model = controller.getReadOnlyModel();
        (view as any).state.currentSelected = sticker?.id;

        const fakeHandler = {
            getSelectedFace: vi.fn().mockReturnValue(undefined),
            getFaceDirectMode: vi.fn().mockReturnValue(false),
        };
        (view as any).state.touchHandler = fakeHandler;

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        // Act: Ctrl+ArrowUp on keyup
        const evt = new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true });
        view.handleKeyUp(evt);

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'circular' })
        );
    });

    it('flashFaceLabelTilt sets transform on face-label elements', () => {
        vi.useFakeTimers();

        // Create a fake SVG with face-label elements
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.id = `face-label-${face}`;
            el.setAttribute('transform', 'translate(100,200)');
            svg.appendChild(el);
        }
        (view as any).state.svgRoot = svg;
        (view as any).state.currentSelected = 'sticker-1';
        (view as any).state.model = {
            getCurrentState: () => ({ cubeSize: 3 }),
            getMoveHistory: () => ({}),
        };

        // Trigger flashFaceLabelTilt via face-select key on keyup
        const evt = new KeyboardEvent('keyup', { key: '`' });
        view.handleKeyUp(evt);

        // After keyup the face labels should have a 'rotate' transform
        const uLabel = svg.getElementById('face-label-U');
        expect(uLabel?.getAttribute('transform')).toContain('rotate');

        // After timeout, labels should reset (no rotate)
        vi.advanceTimersByTime(1600);
        expect(uLabel?.getAttribute('transform')).not.toContain('rotate');

        vi.useRealTimers();
    });
});
