import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { EventName } from '@/types';

import * as rendering from './rendering';
import { BasicView, BasicViewState } from './basic-view';

// Exercises the "core" surface of BasicView which is not covered by the
// more specialized navigation and manual-rotation suites.

describe('BasicView core API', () => {
    let view: BasicView;
    let model: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        model = new CubeController();
        view = new BasicView({ viewType: 'basic-back' });
        container = document.createElement('div');
        view.create(container, model);
    });

    it('should report the configured view type and expose the cube element', () => {
        // Arrange - view created in beforeEach

        // Act
        const type = view.getViewType();
        const elt = view.getCubeElement();

        // Assert
        expect(type).toBe('basic-back');
        expect(elt).toBeInstanceOf(HTMLElement);
    });

    it('getCommands returns a full command list and running actions updates state', () => {
        // Arrange
        const spyEmit = vi.spyOn(Application.eventBus, 'emit');
        view.updateRotation = vi.fn();
        view.updateFaceLabels = vi.fn();

        // Act
        const commands = view.getCommands();
        const ids = commands.map(c => c.id);

        // Assert list properties
        expect(commands.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

        // Undo/redo present and use view-type-scoped IDs
        expect(ids).toContain('basic-back.undo');
        expect(ids).toContain('basic-back.redo');
        const undo = commands.find(c => c.id === 'basic-back.undo')!;
        const redo = commands.find(c => c.id === 'basic-back.redo')!;
        expect(undo.showInHeader).toBe(true);
        expect(redo.showInHeader).toBe(true);
        // No moves made yet — both should be disabled
        expect(undo.isEnabled!()).toBe(false);
        expect(redo.isEnabled!()).toBe(false);

        // Arrange further for command actions
        const tilt = commands.find(c => c.id === 'tilt-view');
        const pitch = commands.find(c => c.id === 'pitch-view');
        const reset = commands.find(c => c.id === 'reset-view');
        expect(tilt).toBeDefined();
        expect(pitch).toBeDefined();
        expect(reset).toBeDefined();

        // Act/Assert tilt
        expect((view as any).state.isTilted).toBe(false);
        tilt!.action();
        expect((view as any).state.isTilted).toBe(true);
        expect(spyEmit).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
            viewType: view.getViewType(),
        });

        // Act/Assert pitch
        expect((view as any).state.isPitched).toBe(false);
        pitch!.action();
        expect((view as any).state.isPitched).toBe(true);

        // Act/Assert reset behaviour
        (view as any).state.yRotation = 123;
        (view as any).state.xRotation = 456;
        reset!.action();
        const finalY = (view as any).state.yRotation;
        expect(finalY % 180).toBe(0);
        const finalX = (view as any).state.xRotation;
        expect(finalX % 180).toBe(0);
    });

    it('getState and setState allow persisting/restoring the view state', () => {
        // Arrange: mutate some values
        (view as any).state.isTilted = true;
        (view as any).state.yRotation = 270;

        // Act: capture state
        const persisted = view.getState();

        // Assert persisted structure
        expect(persisted).toEqual<BasicViewState>({
            isTilted: true,
            isPitched: false,
            yRotation: 270,
            xRotation: 0,
            zRotation: 0,
        });

        // Arrange: fresh view
        const another = new BasicView({ viewType: 'basic-front' });
        another.create(container, model);

        // Act: restore state
        another.setState(persisted);

        // Assert restoration
        expect((another as any).state.isTilted).toBe(true);
        expect((another as any).state.yRotation).toBe(270);

        // Act & Assert: garbage inputs don't throw
        another.setState(null);
        another.setState({});
        another.setState({ isTilted: 'nope' } as any);
    });

    it('public helpers delegate to the rendering module', () => {
        // Arrange — spy on the module functions the view delegates to
        const updateSpy = vi.spyOn(rendering, 'update').mockImplementation(() => {});
        const updateSelectiveSpy = vi
            .spyOn(rendering, 'updateSelective')
            .mockImplementation(() => {});
        const resizeSpy = vi.spyOn(rendering, 'resize').mockImplementation(() => {});
        vi.spyOn(rendering, 'getMinimumSize').mockReturnValue({ width: 111, height: 222 });
        const event = { some: 'event' } as any;

        // Act & Assert
        view.update(model);
        expect(updateSpy).toHaveBeenCalledWith(expect.anything(), model);

        view.updateSelective(event);
        expect(updateSelectiveSpy).toHaveBeenCalledWith(expect.anything(), event);

        view.resize();
        expect(resizeSpy).toHaveBeenCalled();

        expect(view.getMinimumSize()).toEqual({ width: 111, height: 222 });

        vi.restoreAllMocks();
    });

    it('destroy clears references', () => {
        // Arrange
        const elt = view.getCubeElement();
        expect(elt).toBeInstanceOf(HTMLElement);

        // Act
        view.destroy();

        // Assert
        expect(view.getCubeElement()).toBeNull();
        expect((view as any).state.container).toBeNull();
        expect((view as any).state.model).toBeUndefined();
    });
});
