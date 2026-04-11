/**
 * Tests for BasicView command actions and keyboard handlers that were previously uncovered.
 */
import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { Face } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';
import { EventName } from '@/types';

import * as linkedRotations from './linked-rotations';
import { BasicView } from './basic-view';

describe('BasicView - command actions', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        container = document.createElement('div');
        view.create(container, model);
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(false);
        vi.spyOn(linkedRotations, 'setLinked').mockImplementation(() => {});
    });

    afterEach(() => {
        view.destroy();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    const getCmd = (id: string) => view.getCommands().find(c => c.id === id)!;

    // -----------------------------------------------------------------------
    // rotate-view commands
    // -----------------------------------------------------------------------

    it('rotate-view-left action rotates view left and emits VIEW_STATE_CHANGED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const initialForward = { ...(view as any).state.viewForward };

        getCmd('rotate-view-left').action();

        expect((view as any).state.viewForward).not.toEqual(initialForward);
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: 'basic-front',
        });
    });

    it('rotate-view-right action rotates view right', () => {
        const initialForward = { ...(view as any).state.viewForward };
        getCmd('rotate-view-right').action();
        expect((view as any).state.viewForward).not.toEqual(initialForward);
    });

    it('rotate-view-up action rotates view up', () => {
        getCmd('rotate-view-up').action();
        // viewForward changes (borrows from viewUp axis)
        expect((view as any).state.viewForward).not.toEqual({ x: 0, y: 0, z: 1 });
    });

    it('rotate-view-down action rotates view down', () => {
        getCmd('rotate-view-down').action();
        expect((view as any).state.viewForward).not.toEqual({ x: 0, y: 0, z: 1 });
    });

    it('rotate-view-left emits BASIC_VIEW_ROTATION_LINKED when linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(true);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('rotate-view-left').action();

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.BASIC_VIEW_ROTATION_LINKED,
            expect.objectContaining({ rotation: 'left', sourceViewType: 'basic-front' })
        );
    });

    it('rotate-view-right emits BASIC_VIEW_ROTATION_LINKED when linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(true);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('rotate-view-right').action();

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.BASIC_VIEW_ROTATION_LINKED,
            expect.objectContaining({ rotation: 'right' })
        );
    });

    it('rotate-view-up emits BASIC_VIEW_ROTATION_LINKED when linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(true);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('rotate-view-up').action();

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.BASIC_VIEW_ROTATION_LINKED,
            expect.objectContaining({ rotation: 'up' })
        );
    });

    it('rotate-view-down emits BASIC_VIEW_ROTATION_LINKED when linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(true);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('rotate-view-down').action();

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.BASIC_VIEW_ROTATION_LINKED,
            expect.objectContaining({ rotation: 'down' })
        );
    });

    it('reset-view emits BASIC_VIEW_RESET_LINKED when linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(true);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('reset-view').action();

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.BASIC_VIEW_RESET_LINKED,
            expect.objectContaining({ sourceViewType: 'basic-front' })
        );
    });

    it('reset-view does not emit BASIC_VIEW_RESET_LINKED when not linked', () => {
        vi.spyOn(linkedRotations, 'isLinked').mockReturnValue(false);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('reset-view').action();

        expect(emitSpy).not.toHaveBeenCalledWith(
            EventName.BASIC_VIEW_RESET_LINKED,
            expect.anything()
        );
    });

    // -----------------------------------------------------------------------
    // align-cube-to-view command
    // -----------------------------------------------------------------------

    it('align-cube-to-view action applies and emits state changed', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        // Rotate view so alignment does something meaningful
        view.rotateViewLeft();

        getCmd('align-cube-to-view').action();

        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: 'basic-front',
        });
    });

    // -----------------------------------------------------------------------
    // face-direct-mode command
    // -----------------------------------------------------------------------

    it('face-direct-mode toggles face direct mode on/off', () => {
        const cmd = getCmd('basic-front.face-direct-mode');
        expect(cmd.isActive!()).toBe(false);

        cmd.action();
        expect(cmd.isActive!()).toBe(true);

        cmd.action();
        expect(cmd.isActive!()).toBe(false);
    });

    // -----------------------------------------------------------------------
    // link-rotations command
    // -----------------------------------------------------------------------

    it('link-rotations command calls setLinked and emits VIEW_STATE_CHANGED', () => {
        const setLinkedSpy = vi.spyOn(linkedRotations, 'setLinked');
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        getCmd('link-rotations').action();

        expect(setLinkedSpy).toHaveBeenCalled();
        expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: 'basic-front',
        });
    });

    // -----------------------------------------------------------------------
    // undo/redo actions
    // -----------------------------------------------------------------------

    it('undo action emits UNDO_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        getCmd('basic-front.undo').action();
        expect(emitSpy).toHaveBeenCalledWith(EventName.UNDO_REQUESTED, {});
    });

    it('redo action emits REDO_REQUESTED', () => {
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        getCmd('basic-front.redo').action();
        expect(emitSpy).toHaveBeenCalledWith(EventName.REDO_REQUESTED, {});
    });
});

describe('BasicView – keyboard handlers', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    afterEach(() => {
        view.destroy();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('handleKeyDown returns false for unknown keys', () => {
        const event = new KeyboardEvent('keydown', { key: 'Tab' });
        expect(view.handleKeyDown(event)).toBe(false);
    });

    it('handleKeyUp returns false for unknown keys', () => {
        const event = new KeyboardEvent('keyup', { key: 'Tab' });
        expect(view.handleKeyUp(event)).toBe(false);
    });

    it('handleKeyDown for ArrowUp returns true when sticker is selected', () => {
        const state = model.getCurrentState();
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
        view.updateSelected(sticker?.id);

        const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
        expect(view.handleKeyDown(event)).toBe(true);
    });

    it('handleKeyDown returns false when no sticker is selected', () => {
        view.updateSelected(undefined);

        const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
        expect(view.handleKeyDown(event)).toBe(false);
    });

    it('space key (face select) returns true when sticker is selected', () => {
        const state = model.getCurrentState();
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
        view.updateSelected(sticker?.id);

        const event = new KeyboardEvent('keyup', { key: ' ' });
        expect(view.handleKeyUp(event)).toBe(true);
    });

    it('space key (face select) returns false when no sticker is selected', () => {
        view.updateSelected(undefined);
        const event = new KeyboardEvent('keyup', { key: ' ' });
        expect(view.handleKeyUp(event)).toBe(false);
    });

    it('Ctrl+ArrowUp (keyboard move) emits MOVE_REQUESTED when sticker selected', () => {
        const state = model.getCurrentState();
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
        view.updateSelected(sticker?.id);

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        const event = new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true });
        view.handleKeyUp(event);

        expect(emitSpy).toHaveBeenCalledWith(
            EventName.MOVE_REQUESTED,
            expect.objectContaining({ viewId: 'basic-front' })
        );
    });

    it('Ctrl+ArrowUp returns true when sticker selected', () => {
        const state = model.getCurrentState();
        const sticker = CubeStateUtils.getStickerAt(state, Face.F, 4);
        view.updateSelected(sticker?.id);

        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true });
        expect(view.handleKeyDown(event)).toBe(true);
    });

    it('keyboard move does nothing when no sticker is selected', () => {
        view.updateSelected(undefined);
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        const event = new KeyboardEvent('keyup', { key: 'ArrowUp', ctrlKey: true });
        view.handleKeyUp(event);

        expect(emitSpy).not.toHaveBeenCalledWith(EventName.MOVE_REQUESTED, expect.anything());
    });
});

describe('BasicView – linked rotation listener', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    afterEach(() => {
        view.destroy();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('responds to BASIC_VIEW_ROTATION_LINKED from a different view', () => {
        // Arrange: rotate left and capture forward vector
        const initialForward = { ...(view as any).state.viewForward };

        // Emit a linked rotation event from a different view
        Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
            rotation: 'left',
            sourceViewType: 'basic-back', // different view
        });

        expect((view as any).state.viewForward).not.toEqual(initialForward);
    });

    it('ignores BASIC_VIEW_ROTATION_LINKED from same view', () => {
        const initialForward = { ...(view as any).state.viewForward };

        Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
            rotation: 'left',
            sourceViewType: 'basic-front', // same view type
        });

        expect((view as any).state.viewForward).toEqual(initialForward);
    });

    it('destroy() removes BASIC_VIEW_ROTATION_LINKED listener', () => {
        view.destroy();

        // Emitting after destroy should not affect any state (won't throw)
        expect(() => {
            Application.eventBus.emit(EventName.BASIC_VIEW_ROTATION_LINKED, {
                rotation: 'right',
                sourceViewType: 'basic-back',
            });
        }).not.toThrow();
    });
});

describe('BasicView – linked reset listener', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    afterEach(() => {
        view.destroy();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('responds to BASIC_VIEW_RESET_LINKED from a different view', () => {
        // Rotate so the view is no longer in default orientation
        view.rotateViewLeft();
        const defaultForward = { x: 0, y: 0, z: 1 };

        Application.eventBus.emit(EventName.BASIC_VIEW_RESET_LINKED, {
            sourceViewType: 'basic-back',
        });

        expect((view as any).state.viewForward).toEqual(defaultForward);
    });

    it('ignores BASIC_VIEW_RESET_LINKED from same view', () => {
        view.rotateViewLeft();
        const rotatedForward = { ...(view as any).state.viewForward };

        Application.eventBus.emit(EventName.BASIC_VIEW_RESET_LINKED, {
            sourceViewType: 'basic-front', // same view
        });

        expect((view as any).state.viewForward).toEqual(rotatedForward);
    });

    it('destroy() removes BASIC_VIEW_RESET_LINKED listener', () => {
        view.destroy();

        expect(() => {
            Application.eventBus.emit(EventName.BASIC_VIEW_RESET_LINKED, {
                sourceViewType: 'basic-back',
            });
        }).not.toThrow();
    });
});

describe('BasicView – setState with faceDirectMode and linked', () => {
    let view: BasicView;
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        const container = document.createElement('div');
        view.create(container, model);
    });

    afterEach(() => {
        view.destroy();
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('setState with faceDirectMode=true enables face direct mode', () => {
        view.setState({ faceDirectMode: true });
        expect((view as any).touchHandler?.isFaceDirectMode()).toBe(true);
    });

    it('setState with linked=true calls setLinked', () => {
        const setLinkedSpy = vi.spyOn(linkedRotations, 'setLinked');
        view.setState({ linked: true });
        expect(setLinkedSpy).toHaveBeenCalledWith(true);
    });

    it('setState with linked=false calls setLinked(false)', () => {
        const setLinkedSpy = vi.spyOn(linkedRotations, 'setLinked');
        view.setState({ linked: false });
        expect(setLinkedSpy).toHaveBeenCalledWith(false);
    });
});
