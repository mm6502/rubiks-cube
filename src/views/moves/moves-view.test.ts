import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { EventName } from '@/types';

import { MovesView } from './moves-view';
import styles from './moves-view.module.css';

describe('MovesView', () => {
    let view: MovesView;
    let container: HTMLElement;
    let controller: CubeController;

    beforeEach(() => {
        // Create a container element
        container = document.createElement('div');
        container.style.width = '300px';
        container.style.height = '400px';
        document.body.appendChild(container);

        // Initialize the controller
        controller = new CubeController();

        // Create the view
        view = new MovesView();
    });

    afterEach(() => {
        view.destroy();
        document.body.removeChild(container);
        Application.eventBus.removeAllListeners();
    });

    describe('getViewType', () => {
        it('should return correct view type', () => {
            // Act & Assert
            expect(view.getViewType()).toBe('moves');
        });
    });

    describe('create', () => {
        it('should initialize the view with DOM structure', () => {
            // Act
            view.create(container, controller.getReadOnlyModel());

            // Assert
            const mainContainer = container.querySelector(`.${styles.mainContainer}`);
            expect(mainContainer).toBeTruthy();
        });

        it('should render empty state initially', () => {
            // Act
            view.create(container, controller.getReadOnlyModel());

            // Assert
            const emptyState = container.querySelector(`.${styles.emptyState}`);
            expect(emptyState).toBeTruthy();
            expect(emptyState?.textContent).toBe('No moves yet. Start solving!');
        });
    });

    describe('update', () => {
        beforeEach(() => {
            view.create(container, controller.getReadOnlyModel());
        });

        it('should update when moves are executed', () => {
            // Arrange
            controller.applyMove('R');

            // Act
            view.update(controller.getReadOnlyModel());

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(1);
        });

        it('should show multiple moves', () => {
            // Arrange
            controller.applyMove('R');
            controller.applyMove('U');
            controller.applyMove('F');

            // Act
            view.update(controller.getReadOnlyModel());

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(3);
        });

        it('should mark current move correctly', () => {
            // Arrange
            controller.applyMove('R');
            controller.applyMove('U');

            // Act
            view.update(controller.getReadOnlyModel());

            // Assert
            const currentItem = container.querySelector(`.${styles.current}`);
            expect(currentItem).toBeTruthy();
        });
    });

    describe('updateSelective', () => {
        beforeEach(() => {
            view.create(container, controller.getReadOnlyModel());
        });

        it('should update when called', () => {
            vi.useFakeTimers();
            // Arrange
            controller.applyMove('R');

            // Act
            view.updateSelective();

            // Flush the deferred rAF
            vi.runAllTimers();

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(1);
            vi.useRealTimers();
        });
    });

    describe('getState', () => {
        it('should return default state', () => {
            // Act & Assert
            const state = view.getState();
            expect(state).toEqual({ showAsIcons: false });
        });
    });

    describe('setState', () => {
        it('should update showAsIcons from state', () => {
            // Arrange
            view.setState({ showAsIcons: true });

            // Act & Assert
            const state = view.getState();
            expect(state.showAsIcons).toBe(true);
        });

        it('should ignore invalid state', () => {
            // Arrange
            view.setState(null);
            view.setState({});
            view.setState({ invalid: true });

            // Act & Assert
            const state = view.getState();
            expect(state.showAsIcons).toBe(false);
        });
    });

    describe('getCommands', () => {
        it('should return undo, redo, and toggle commands', () => {
            // Act
            const commands = view.getCommands();
            const ids = commands.map(c => c.id);

            // Assert
            expect(commands.length).toBe(3);
            expect(ids).toContain('moves.undo');
            expect(ids).toContain('moves.redo');
            expect(ids).toContain('toggle-move-icons');

            const undo = commands.find(c => c.id === 'moves.undo')!;
            const redo = commands.find(c => c.id === 'moves.redo')!;
            expect(undo.showInHeader).toBe(true);
            expect(undo.displayOrder).toBe(900);
            expect(undo.icon).toBe('↩');
            expect(redo.showInHeader).toBe(true);
            expect(redo.displayOrder).toBe(901);
            expect(redo.icon).toBe('↪');
        });

        it('undo/redo isEnabled reflects move history state', () => {
            // Arrange: need a model so moveHistory is populated
            view.create(container, controller.getReadOnlyModel());
            const undo = view.getCommands().find(c => c.id === 'moves.undo')!;
            const redo = view.getCommands().find(c => c.id === 'moves.redo')!;

            // Initially no history
            expect(undo.isEnabled!()).toBe(false);
            expect(redo.isEnabled!()).toBe(false);

            // After a move, undo becomes available
            controller.applyMove('R');
            expect(undo.isEnabled!()).toBe(true);
            expect(redo.isEnabled!()).toBe(false);
        });

        it('should toggle icons when command is executed', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());
            controller.applyMove('R');

            // Act
            const commands = view.getCommands();
            commands.find(c => c.id === 'toggle-move-icons')!.action();

            // Assert
            // Should now show as icons
            const state = view.getState();
            expect(state.showAsIcons).toBe(true);
        });

        it('should emit view state changed event', () => {
            // Arrange
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');

            // Act
            const commands = view.getCommands();
            commands.find(c => c.id === 'toggle-move-icons')!.action();

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
                viewType: 'moves',
            });
        });
    });

    describe('getMinimumSize', () => {
        it('should return correct minimum dimensions', () => {
            // Act & Assert
            const size = view.getMinimumSize();
            expect(size).toEqual({ width: 100, height: 200 });
        });
    });

    describe('destroy', () => {
        it('should clear references', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());

            // Act
            view.destroy();

            // Assert
            // Should not throw when called again
            expect(() => view.destroy()).not.toThrow();
        });
    });

    describe('integration with move history', () => {
        beforeEach(() => {
            view.create(container, controller.getReadOnlyModel());
        });

        it('should handle undo operations', () => {
            // Arrange
            controller.applyMove('R');
            controller.applyMove('U');
            view.update(controller.getReadOnlyModel());

            // Act
            controller.undo();
            view.update(controller.getReadOnlyModel());

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(2); // Should show all moves, but current position changes
            expect(moveItems[0].classList.contains(styles.current)).toBe(true); // R should be current after undoing U
        });

        it('should handle redo operations', () => {
            // Arrange
            controller.applyMove('R');
            controller.applyMove('U');
            controller.undo();
            view.update(controller.getReadOnlyModel());

            // Act
            controller.redo();
            view.update(controller.getReadOnlyModel());

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(2); // Should show both moves again
            expect(moveItems[1].classList.contains(styles.current)).toBe(true); // U should be current after redoing
        });

        it('should handle reset', () => {
            // Arrange
            controller.applyMove('R');
            controller.applyMove('U');
            view.update(controller.getReadOnlyModel());

            // Act
            controller.reset();
            view.update(controller.getReadOnlyModel());

            // Assert
            const emptyState = container.querySelector(`.${styles.emptyState}`);
            expect(emptyState).toBeTruthy();
        });
    });

    describe('edge cases before create()', () => {
        it('updateSelective() before create() returns early without throwing', () => {
            expect(() => view.updateSelective({} as any)).not.toThrow();
        });

        it('updateHighlight() is a no-op and does not throw', () => {
            expect(() => view.updateHighlight('st1' as any)).not.toThrow();
        });

        it('updateSelected() is a no-op and does not throw', () => {
            expect(() => view.updateSelected('st1' as any)).not.toThrow();
        });

        it('setState() before create() stores value without touching renderer', () => {
            view.setState({ showAsIcons: true });
            expect(view.getState().showAsIcons).toBe(true);
        });

        it('getCommands() isEnabled returns false before create()', () => {
            const commands = view.getCommands();
            const undo = commands.find(c => c.id === 'moves.undo')!;
            const redo = commands.find(c => c.id === 'moves.redo')!;
            expect(undo.isEnabled?.()).toBe(false);
            expect(redo.isEnabled?.()).toBe(false);
        });

        it('toggle-move-icons action before create() still emits VIEW_STATE_CHANGED', () => {
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const commands = view.getCommands();
            commands.find(c => c.id === 'toggle-move-icons')!.action();
            expect(emitSpy).toHaveBeenCalledWith(EventName.VIEW_STATE_CHANGED, {
                viewType: 'moves',
            });
        });
    });

    describe('destroy with pending animation frame', () => {
        it('cancels pending rAF when destroy() is called', () => {
            view.create(container, controller.getReadOnlyModel());
            const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

            // Trigger a pending frame without flushing timers
            view.updateSelective({} as any);
            view.destroy();

            expect(cancelSpy).toHaveBeenCalled();
        });
    });

    describe('setState after create()', () => {
        it('setState with renderer updates renderer showAsIcons', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());

            // Act
            view.setState({ showAsIcons: true });

            // Assert
            expect(view.getState().showAsIcons).toBe(true);
        });

        it('setState ignores non-boolean showAsIcons', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());

            // Act
            view.setState({ showAsIcons: 'yes' });

            // Assert
            expect(view.getState().showAsIcons).toBe(false);
        });

        it('undo command action emits UNDO_REQUESTED', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const undo = view.getCommands().find(c => c.id === 'moves.undo')!;

            // Act
            undo.action();

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.UNDO_REQUESTED, {});
        });

        it('redo command action emits REDO_REQUESTED', () => {
            // Arrange
            view.create(container, controller.getReadOnlyModel());
            const emitSpy = vi.spyOn(Application.eventBus, 'emit');
            const redo = view.getCommands().find(c => c.id === 'moves.redo')!;

            // Act
            redo.action();

            // Assert
            expect(emitSpy).toHaveBeenCalledWith(EventName.REDO_REQUESTED, {});
        });
    });
});
