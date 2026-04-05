// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from '@/application';
import { CubeController } from '@/cube-controller';
import { LogLevel, logger } from '@/diagnostics/logger';
import { EventName, HighlightChangedEvent } from '@/types';
import { Command, CommandCategory } from '@/types/commands';

import { PanelInteractionHandler } from './panel-interaction-handler';
import { calculateDefaultPosition } from './panel-positioning';
import { ViewManager } from './view-manager';

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

describe('ViewManager', () => {
    let viewManager: ViewManager;
    let mockCubeController: CubeController;

    beforeEach(() => {
        mockCubeController = new CubeController();
        viewManager = new ViewManager(mockCubeController);
        // Ensure storage is clean before each test; vitest.setup provides a full
        // Storage mock with length/key, so we can just clear it.
        localStorage.clear();
        document.body.innerHTML = '';
    });

    it('should manage focus stack', () => {
        // Arrange & Act
        viewManager['updateFocus']('view1');
        expect(viewManager['getActiveViewId']()).toBe('view1');

        viewManager['updateFocus']('view2');
        expect(viewManager['getActiveViewId']()).toBe('view2');

        viewManager['updateFocus']('view1'); // Bring back to top

        // Assert
        expect(viewManager['getActiveViewId']()).toBe('view1');
    });

    it('should register commands', () => {
        // Arrange
        const commands = [
            {
                id: 'cmd1',
                label: 'Cmd1',
                category: CommandCategory.CUBE,
                action: vi.fn(),
                keyBindings: [{ key: 'a' }],
            },
            {
                id: 'cmd2',
                label: 'Cmd2',
                category: CommandCategory.CUBE,
                action: vi.fn(),
                keyBindings: [{ key: 'a' }],
            },
        ] as Command[];

        // Act
        viewManager['registerCommands']('view1', commands);

        // Assert
        expect(viewManager['commandRegistry'].get('view1')).toBe(commands);
    });

    it('should match key bindings', () => {
        // Arrange
        const bindings = [{ key: 'f', shiftKey: true }];
        const event = {
            key: 'f',
            altKey: false,
            shiftKey: true,
            ctrlKey: false,
            metaKey: false,
        } as KeyboardEvent;

        // Act & Assert
        expect(viewManager['matchesKeyBindings'](bindings, event)).toBe(true);
        expect(viewManager['matchesKeyBindings'](undefined, event)).toBe(false);
        expect(viewManager['matchesKeyBindings']([], event)).toBe(false);
    });

    it('should use saved position when mostly visible', () => {
        // arrange
        document.body.innerHTML =
            '<div id="visualizations" style="width:800px;height:600px;position:relative"></div>';
        const container = document.getElementById('visualizations') as HTMLElement;
        // Create saved state for view 'testview'
        localStorage.setItem(
            'view-panel-testview',
            JSON.stringify({
                position: { x: 50, y: 60 },
                size: { width: 200, height: 150 },
            })
        );

        // Recreate viewManager with container available
        viewManager = new ViewManager(mockCubeController);
        viewManager['visualizationsContainer'] = container;

        // Create panel interaction handler
        viewManager['panelInteractionHandler'] = new PanelInteractionHandler(
            container,
            {},
            viewManager['activeViews'],
            1000,
            () => undefined,
            () => {}
        );

        // create a panel element to pass to setInitialPanelPosition
        const panel = document.createElement('div');
        panel.id = 'testview-panel';
        container.appendChild(panel);

        // Act
        viewManager['panelInteractionHandler']!.setInitialPanelPosition(panel, 'testview');

        // Assert
        expect(panel.style.left).toBe('50px');
        expect(panel.style.top).toBe('60px');
    });

    it('should recalculate position if saved state mostly offscreen', () => {
        // arrange
        document.body.innerHTML =
            '<div id="visualizations" style="width:300px;height:200px;position:relative"></div>';
        const container = document.getElementById('visualizations') as HTMLElement;
        // saved state that would be mostly outside small container
        localStorage.setItem(
            'view-panel-largeview',
            JSON.stringify({
                position: { x: 500, y: 400 },
                size: { width: 400, height: 300 },
            })
        );

        viewManager = new ViewManager(mockCubeController);
        viewManager['visualizationsContainer'] = container;

        // Create panel interaction handler
        viewManager['panelInteractionHandler'] = new PanelInteractionHandler(
            container,
            {},
            viewManager['activeViews'],
            1000,
            () => undefined,
            () => {}
        );

        const panel = document.createElement('div');
        panel.id = 'largeview-panel';
        container.appendChild(panel);

        // Act
        viewManager['panelInteractionHandler']!.setInitialPanelPosition(panel, 'largeview');

        // Assert
        // Should not use saved extreme values; should be clamped inside container
        const left = parseInt(panel.style.left || '0', 10);
        const top = parseInt(panel.style.top || '0', 10);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
    });

    it('should avoid overlap when possible', () => {
        // arrange
        document.body.innerHTML =
            '<div id="visualizations" style="width:400px;height:300px;position:relative"></div>';
        const container = document.getElementById('visualizations') as HTMLElement;
        viewManager = new ViewManager(mockCubeController);
        viewManager['visualizationsContainer'] = container;

        // Add one existing panel occupying left area
        const existing = document.createElement('div');
        existing.setAttribute('data-view-panel', 'existing');
        existing.style.position = 'absolute';
        existing.style.left = '0px';
        existing.style.top = '0px';
        existing.style.width = '200px';
        existing.style.height = '300px';
        existing.id = 'existing-panel';
        container.appendChild(existing);
        viewManager['activeViews'].set('existing', { view: null as any, container: existing });

        // act
        const pos = calculateDefaultPosition(
            container,
            viewManager['activeViews'] as any,
            'newview',
            { width: 150, height: 150 },
            () => undefined
        );

        // Assert
        // Should choose a position that does not overlap existing
        const nonOverlapping =
            pos.x + 150 <= 0 + 200 ||
            pos.y + 150 <= 0 + 300 ||
            pos.x >= 0 + 200 ||
            pos.y >= 0 + 300;
        expect(nonOverlapping).toBe(true);
    });

    it('should clear view-related localStorage entries when requested', () => {
        localStorage.setItem('rubiksCubeVisibleViews', 'ok');
        localStorage.setItem('view-panel-a', 'x');
        localStorage.setItem('keep', 'y');

        viewManager.clearViewStorage();

        expect(localStorage.getItem('rubiksCubeVisibleViews')).toBeNull();
        expect(localStorage.getItem('view-panel-a')).toBeNull();
        expect(localStorage.getItem('keep')).toBe('y');
    });

    // additional regression coverage for methods introduced in refactor
    it('handleMoveExecuted delegates to updateViews', () => {
        // Arrange
        const spy = vi.spyOn(viewManager, 'updateViews');
        const event = {} as any;

        // Act
        (viewManager as any).handleMoveExecuted(event);

        // Assert
        expect(spy).toHaveBeenCalledWith(event);
    });

    it('handleHighlightChanged updates each view and skips duplicates', () => {
        // Arrange
        const view1 = { updateHighlight: vi.fn() } as any;
        viewManager['activeViews'].set('v1', {
            view: view1,
            container: document.createElement('div'),
        });

        // Act - first call
        (viewManager as any).handleHighlightChanged({ stickerId: 'foo' } as any);
        // Assert first call
        expect(view1.updateHighlight).toHaveBeenCalledWith('foo');

        view1.updateHighlight.mockClear();
        // Act - second call with same sticker
        (viewManager as any).handleHighlightChanged({ stickerId: 'foo' } as any);
        // Assert second call
        expect(view1.updateHighlight).not.toHaveBeenCalled();
    });

    it('setHighlightedSticker updates all views and emits event', () => {
        // Arrange
        const view1 = { updateHighlight: vi.fn(), getViewType: () => 'v1' } as any;
        const view2 = { updateHighlight: vi.fn(), getViewType: () => 'v2' } as any;
        viewManager['activeViews'].set('v1', {
            view: view1,
            container: document.createElement('div'),
        });
        viewManager['activeViews'].set('v2', {
            view: view2,
            container: document.createElement('div'),
        });
        const emitSpy = vi.spyOn(Application.eventBus, 'emit');

        // Act
        viewManager.setHighlightedSticker('s1' as any, view1);

        // Assert
        expect(view1.updateHighlight).toHaveBeenCalledWith('s1');
        expect(view2.updateHighlight).toHaveBeenCalledWith('s1');
        expect(emitSpy).toHaveBeenCalledWith(EventName.HIGHLIGHT_CHANGED, {
            stickerId: 's1',
            viewId: 'v1',
        } as HighlightChangedEvent);
    });

    it('handleKeyDown and handleKeyUp delegate correctly', () => {
        // Arrange
        const view = { handleKeyDown: vi.fn(() => true), handleKeyUp: vi.fn(() => true) } as any;
        viewManager['activeViews'].set('v', { view, container: document.createElement('div') });
        viewManager['focusStack'] = ['v'];

        // Act & Assert
        expect(viewManager.handleKeyDown(new KeyboardEvent('keydown'))).toBe(true);
        expect(viewManager.handleKeyUp(new KeyboardEvent('keyup'))).toBe(true);

        // Act - view refuses to handle
        view.handleKeyDown.mockReturnValue(false);
        expect(viewManager.handleKeyDown(new KeyboardEvent('keydown'))).toBe(false);
    });

    it('updateViews invokes correct update methods on views', () => {
        // Arrange
        const view1 = { updateSelective: vi.fn(), update: vi.fn() } as any;
        const view2 = { update: vi.fn() } as any;
        viewManager['activeViews'].set('v1', {
            view: view1,
            container: document.createElement('div'),
        });
        viewManager['activeViews'].set('v2', {
            view: view2,
            container: document.createElement('div'),
        });
        const evt = {} as any;

        // Act
        viewManager.updateViews(evt);

        // Assert
        expect(view1.updateSelective).toHaveBeenCalledWith(evt);
        expect(view2.update).toHaveBeenCalled();
    });

    it('registerViewCommands stores commands from the view', () => {
        // Arrange
        const fakeCmd = {
            id: 'x',
            label: 'x',
            category: CommandCategory.VIEW,
            action: vi.fn(),
        } as any;
        const view = { getCommands: vi.fn(() => [fakeCmd]) } as any;

        // Act
        viewManager.registerViewCommands('vid', view);

        // Assert
        expect(viewManager['commandRegistry'].get('vid')).toEqual([fakeCmd]);
    });

    it('showView and hideView delegate to lifecycle manager', () => {
        // Arrange
        viewManager['viewLifecycleManager'] = { showView: vi.fn(), hideView: vi.fn() } as any;

        // Act
        viewManager.showView('a');
        viewManager.hideView('b');

        // Assert
        expect(viewManager['viewLifecycleManager']!.showView).toHaveBeenCalledWith('a');
        expect(viewManager['viewLifecycleManager']!.hideView).toHaveBeenCalledWith('b');
    });

    it('should stack when no non-overlapping space', () => {
        // Arrange
        document.body.innerHTML =
            '<div id="visualizations" style="width:250px;height:200px;position:relative"></div>';
        const container = document.getElementById('visualizations') as HTMLElement;
        viewManager = new ViewManager(mockCubeController);
        viewManager['visualizationsContainer'] = container;

        // Fill container with panels so there's no room
        for (let i = 0; i < 4; i++) {
            const p = document.createElement('div');
            p.setAttribute('data-view-panel', `filled-${i}`);
            p.style.top = `${Math.floor(i / 2) * 100}px`;
            p.style.width = '125px';
            p.style.height = '100px';
            p.id = `filled-${i}-panel`;
            container.appendChild(p);
            viewManager['activeViews'].set(`filled-${i}`, { view: null as any, container: p });
        }

        // Act
        const pos = calculateDefaultPosition(
            container,
            viewManager['activeViews'] as any,
            'stackview',
            { width: 125, height: 100 },
            () => undefined
        );

        // Assert
        // Should return a position within bounds (stacking), not negative
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('should update visual focus class on focus change', () => {
        // Arrange
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        const focusClass = viewManager['styles'].focused;
        viewManager['activeViews'].set('a', { view: null as any, container: containerA });
        viewManager['activeViews'].set('b', { view: null as any, container: containerB });

        // Act
        viewManager.updateFocus('b');

        // Assert
        expect(containerA.classList.contains(focusClass)).toBe(false);
        expect(containerB.classList.contains(focusClass)).toBe(true);
    });

    it('should hide non-active panels in tabbed layout', () => {
        // Arrange
        viewManager['layoutMode'] = 'tabbed';
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        const stubView = { resize: vi.fn() } as any;
        viewManager['activeViews'].set('a', { view: stubView, container: containerA });
        viewManager['activeViews'].set('b', { view: stubView, container: containerB });
        viewManager['focusStack'] = ['b'];

        // Act
        (viewManager as any).showOnlyActivePanel();

        // Assert
        expect(containerA.style.display).toBe('none');
        expect(containerB.style.display).toBe('');
    });

    it('should apply tabbed layout to panels', () => {
        // Arrange
        const container = document.createElement('div');
        const tabbedClass = viewManager['styles']['view-panel--tabbed'] ?? 'view-panel--tabbed';

        // Act
        (viewManager as any).applyTabbedLayoutToPanel(container);

        // Assert
        expect(container.classList.contains(tabbedClass)).toBe(true);
    });

    it('should apply floating layout to panels and restore position', () => {
        // Arrange
        const container = document.createElement('div');
        const tabbedClass = viewManager['styles']['view-panel--tabbed'] ?? 'view-panel--tabbed';
        container.classList.add(tabbedClass);
        const fakeView = { setLayoutMode: vi.fn() } as any;
        const spy = vi.fn();
        viewManager['panelInteractionHandler'] = { setInitialPanelPosition: spy } as any;

        // Act
        (viewManager as any).applyFloatingLayoutToPanel('view', container, fakeView);

        // Assert
        expect(container.classList.contains(tabbedClass)).toBe(false);
        expect(spy).toHaveBeenCalledWith(container, 'view', fakeView);
    });

    it('should delegate global command rendering', () => {
        // Arrange
        const spy = vi.spyOn(viewManager['commandRenderer'], 'renderGlobalCommands');

        // Act
        viewManager.renderGlobalCommands();

        // Assert
        expect(spy).toHaveBeenCalledWith(
            viewManager['commandRegistry'],
            viewManager.getActiveViewId()
        );
    });

    it('should delegate view header command updates', () => {
        // Arrange
        const spy = vi.spyOn(viewManager['commandRenderer'], 'updateViewHeaderCommands');
        const container = document.createElement('div');
        viewManager['activeViews'].set('v', { view: null as any, container });

        // Act
        viewManager.updateViewHeaderCommands('v');

        // Assert
        expect(spy).toHaveBeenCalledWith('v', container, viewManager['commandRegistry']);
    });

    // ─── initialize ────────────────────────────────────────────────────────────

    describe('initialize', () => {
        it('should throw when visualizations container is missing', () => {
            // Arrange
            document.body.innerHTML = '';

            // Act & Assert
            expect(() => viewManager.initialize()).toThrow('Visualizations container not found');
        });

        it('should initialize successfully with a visualizations container', () => {
            // Arrange
            document.body.innerHTML = '<div id="visualizations"></div>';

            // Act & Assert
            expect(() => viewManager.initialize()).not.toThrow();
        });

        it('should debounce resize and call resizeAllViews after 100ms', () => {
            // Arrange
            vi.useFakeTimers();
            document.body.innerHTML = '<div id="visualizations"></div>';
            viewManager.initialize();
            const resizeSpy = vi.spyOn(viewManager as any, 'resizeAllViews');
            // Drain any pending rAF/timers from initialize() before counting calls
            vi.runAllTimers();
            resizeSpy.mockClear();

            // Act
            window.dispatchEvent(new Event('resize'));

            // Assert — not called yet
            expect(resizeSpy).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);

            // Assert — called after debounce
            expect(resizeSpy).toHaveBeenCalledTimes(1);
            vi.useRealTimers();
        });

        it('should cancel previous debounce timer on rapid resize events', () => {
            // Arrange
            vi.useFakeTimers();
            document.body.innerHTML = '<div id="visualizations"></div>';
            viewManager.initialize();
            const resizeSpy = vi.spyOn(viewManager as any, 'resizeAllViews');
            // Drain any pending rAF/timers from initialize() before counting calls
            vi.runAllTimers();
            resizeSpy.mockClear();

            // Act — two resize events fired quickly
            window.dispatchEvent(new Event('resize'));
            vi.advanceTimersByTime(50);
            window.dispatchEvent(new Event('resize'));
            vi.advanceTimersByTime(100);

            // Assert — only one eventual call
            expect(resizeSpy).toHaveBeenCalledTimes(1);
            vi.useRealTimers();
        });

        it('should wire MOVE_EXECUTED to handleCommandStatesRefresh via event bus', () => {
            // Arrange
            document.body.innerHTML = '<div id="visualizations"></div>';
            viewManager.initialize();
            const spy = vi.spyOn(viewManager['commandRenderer'], 'refreshCommandStates');

            // Act
            Application.eventBus.emit(EventName.MOVE_EXECUTED, {} as any);

            // Assert
            expect(spy).toHaveBeenCalled();
        });
    });

    // ─── handleCommandStatesRefresh ────────────────────────────────────────────

    it('handleCommandStatesRefresh delegates to commandRenderer.refreshCommandStates', () => {
        // Arrange
        const spy = vi.spyOn(viewManager['commandRenderer'], 'refreshCommandStates');

        // Act
        (viewManager as any).handleCommandStatesRefresh();

        // Assert
        expect(spy).toHaveBeenCalledWith(viewManager['commandRegistry']);
    });

    // ─── handleHighlightChanged ────────────────────────────────────────────────

    it('handleHighlightChanged skips views without updateHighlight function', () => {
        // Arrange
        const viewWithoutHighlight = {} as any;
        viewManager['activeViews'].set('v1', {
            view: viewWithoutHighlight,
            container: document.createElement('div'),
        });

        // Act & Assert — must not throw
        expect(() =>
            (viewManager as any).handleHighlightChanged({ stickerId: 'foo' })
        ).not.toThrow();
    });

    it('handleHighlightChanged catches errors thrown by view.updateHighlight', () => {
        // Arrange
        const badView = {
            updateHighlight: vi.fn(() => {
                throw new Error('highlight failed');
            }),
        } as any;
        viewManager['activeViews'].set('v1', {
            view: badView,
            container: document.createElement('div'),
        });

        // Act & Assert — error must be swallowed
        expect(() =>
            (viewManager as any).handleHighlightChanged({ stickerId: 'bar' })
        ).not.toThrow();
    });

    // ─── handleKeyDown / handleKeyUp extra branches ────────────────────────────

    it('handleKeyDown returns false when focus stack is empty', () => {
        // Arrange
        viewManager['focusStack'] = [];

        // Act & Assert
        expect(viewManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
    });

    it('handleKeyDown returns false when active view has no handleKeyDown method', () => {
        // Arrange
        const view = {} as any; // no handleKeyDown
        viewManager['activeViews'].set('v', { view, container: document.createElement('div') });
        viewManager['focusStack'] = ['v'];

        // Act & Assert
        expect(viewManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
    });

    it('handleKeyUp returns false when focus stack is empty and no controller command matches', () => {
        // Arrange
        viewManager['focusStack'] = [];

        // Act & Assert
        expect(viewManager.handleKeyUp(new KeyboardEvent('keyup', { key: 'x' }))).toBe(false);
    });

    it('handleKeyUp matches controller command when focus stack is empty', () => {
        // Arrange
        const action = vi.fn();
        viewManager['commandRegistry'].set('controller', [
            {
                id: 'ctrl-cmd',
                label: 'Ctrl',
                category: CommandCategory.CUBE,
                action,
                keyBindings: [{ key: 'r' }],
            } as Command,
        ]);
        viewManager['focusStack'] = [];

        // Act
        const result = viewManager.handleKeyUp(new KeyboardEvent('keyup', { key: 'r' }));

        // Assert
        expect(result).toBe(true);
        expect(action).toHaveBeenCalled();
    });

    it('handleKeyUp falls through to view commands when view.handleKeyUp returns false', () => {
        // Arrange
        const action = vi.fn();
        const view = { handleKeyUp: vi.fn(() => false) } as any;
        viewManager['activeViews'].set('v', { view, container: document.createElement('div') });
        viewManager['focusStack'] = ['v'];
        viewManager['commandRegistry'].set('v', [
            {
                id: 'view-cmd',
                label: 'View',
                category: CommandCategory.VIEW,
                action,
                keyBindings: [{ key: 's' }],
            } as Command,
        ]);

        // Act
        const result = viewManager.handleKeyUp(new KeyboardEvent('keyup', { key: 's' }));

        // Assert
        expect(result).toBe(true);
        expect(action).toHaveBeenCalled();
    });

    // ─── applyLayoutMode ───────────────────────────────────────────────────────

    it('applyLayoutMode calls setLayoutMode("tabbed") on all views in tabbed mode', () => {
        // Arrange
        const view = { setLayoutMode: vi.fn(), resize: vi.fn() } as any;
        const container = document.createElement('div');
        viewManager['activeViews'].set('v', { view, container });
        viewManager['layoutMode'] = 'tabbed';
        viewManager['tabBar'] = { show: vi.fn(), hide: vi.fn(), updateTabs: vi.fn() } as any;
        viewManager['panelInteractionHandler'] = {
            setLayoutMode: vi.fn(),
            setInitialPanelPosition: vi.fn(),
        } as any;
        viewManager['focusStack'] = ['v'];

        // Act
        (viewManager as any).applyLayoutMode();

        // Assert
        expect(view.setLayoutMode).toHaveBeenCalledWith('tabbed');
    });

    it('applyLayoutMode calls setLayoutMode("floating") on all views in floating mode', () => {
        // Arrange
        const view = { setLayoutMode: vi.fn(), resize: vi.fn() } as any;
        const container = document.createElement('div');
        viewManager['activeViews'].set('v', { view, container });
        viewManager['layoutMode'] = 'floating';
        viewManager['tabBar'] = { show: vi.fn(), hide: vi.fn(), updateTabs: vi.fn() } as any;
        viewManager['panelInteractionHandler'] = {
            setLayoutMode: vi.fn(),
            setInitialPanelPosition: vi.fn(),
        } as any;

        // Act
        (viewManager as any).applyLayoutMode();

        // Assert
        expect(view.setLayoutMode).toHaveBeenCalledWith('floating');
        expect(container.style.display).toBe('');
    });

    // ─── handlePanelAdded ──────────────────────────────────────────────────────

    it('handlePanelAdded is a no-op in floating mode', () => {
        // Arrange
        viewManager['layoutMode'] = 'floating';
        const container = document.createElement('div');
        const spy = vi.spyOn(viewManager as any, 'applyTabbedLayoutToPanel');

        // Act
        (viewManager as any).handlePanelAdded(container);

        // Assert
        expect(spy).not.toHaveBeenCalled();
    });

    it('handlePanelAdded applies tabbed layout and updates tabs in tabbed mode', () => {
        // Arrange
        viewManager['layoutMode'] = 'tabbed';
        const container = document.createElement('div');
        viewManager['tabBar'] = { updateTabs: vi.fn() } as any;
        const spy = vi.spyOn(viewManager as any, 'applyTabbedLayoutToPanel');

        // Act
        (viewManager as any).handlePanelAdded(container);

        // Assert
        expect(spy).toHaveBeenCalledWith(container);
        expect(viewManager['tabBar']!.updateTabs).toHaveBeenCalled();
    });

    // ─── resizeAllViews ────────────────────────────────────────────────────────

    it('resizeAllViews catches errors thrown by view.resize', () => {
        // Arrange
        const badView = {
            resize: vi.fn(() => {
                throw new Error('resize failed');
            }),
        } as any;
        viewManager['activeViews'].set('v', {
            view: badView,
            container: document.createElement('div'),
        });

        // Act & Assert — error must be swallowed
        expect(() => (viewManager as any).resizeAllViews()).not.toThrow();
    });

    // ─── showOnlyActivePanel ───────────────────────────────────────────────────

    it('showOnlyActivePanel is a no-op in floating mode', () => {
        // Arrange
        viewManager['layoutMode'] = 'floating';
        const container = document.createElement('div');
        const view = { resize: vi.fn() } as any;
        viewManager['activeViews'].set('v', { view, container });

        // Act
        (viewManager as any).showOnlyActivePanel();

        // Assert — display unchanged
        expect(container.style.display).toBe('');
    });

    // ─── updateViewHeaderCommands early return ─────────────────────────────────

    it('updateViewHeaderCommands is a no-op when view is not in activeViews', () => {
        // Arrange
        const spy = vi.spyOn(viewManager['commandRenderer'], 'updateViewHeaderCommands');

        // Act
        viewManager.updateViewHeaderCommands('nonexistent');

        // Assert
        expect(spy).not.toHaveBeenCalled();
    });

    // ─── setHighlightedSticker extra branches ──────────────────────────────────

    it('setHighlightedSticker is a no-op when sticker has not changed', () => {
        // Arrange
        viewManager['currentHighlightedSticker'] = 'same' as any;
        const view = { updateHighlight: vi.fn(), getViewType: () => 'v' } as any;
        viewManager['activeViews'].set('v', { view, container: document.createElement('div') });

        // Act
        viewManager.setHighlightedSticker('same' as any, view);

        // Assert
        expect(view.updateHighlight).not.toHaveBeenCalled();
    });

    it('setHighlightedSticker handles sourceView without getViewType', () => {
        // Arrange
        const view = { updateHighlight: vi.fn() } as any; // no getViewType
        viewManager['activeViews'].set('v', { view, container: document.createElement('div') });

        // Act & Assert — must not throw
        expect(() => viewManager.setHighlightedSticker('s2' as any, view)).not.toThrow();
        expect(view.updateHighlight).toHaveBeenCalledWith('s2');
    });

    it('setHighlightedSticker catches errors from eventBus.emit', () => {
        // Arrange
        vi.spyOn(Application.eventBus, 'emit').mockImplementationOnce(() => {
            throw new Error('emit failed');
        });
        const view = { updateHighlight: vi.fn(), getViewType: () => 'v' } as any;

        // Act & Assert — error must be swallowed
        expect(() => viewManager.setHighlightedSticker('s3' as any, view)).not.toThrow();
    });

    // ─── updateViews error catch ───────────────────────────────────────────────

    it('updateViews catches errors thrown by view.updateSelective', () => {
        // Arrange
        const badView = {
            updateSelective: vi.fn(() => {
                throw new Error('update failed');
            }),
        } as any;
        viewManager['activeViews'].set('v', {
            view: badView,
            container: document.createElement('div'),
        });

        // Act & Assert — error must be swallowed
        expect(() => viewManager.updateViews({} as any)).not.toThrow();
    });

    // ─── showView tabbed-mode branches ─────────────────────────────────────────

    it('showView applies tabbed layout when in tabbed mode and entry exists', () => {
        // Arrange
        const stubView = { resize: vi.fn() } as any;
        const container = document.createElement('div');
        viewManager['viewLifecycleManager'] = { showView: vi.fn(), hideView: vi.fn() } as any;
        viewManager['layoutMode'] = 'tabbed';
        viewManager['tabBar'] = { updateTabs: vi.fn() } as any;
        viewManager['focusStack'] = ['a'];
        viewManager['activeViews'].set('a', { view: stubView, container });

        // Act
        viewManager.showView('a');

        // Assert
        const tabbedClass = viewManager['styles']['view-panel--tabbed'] ?? 'view-panel--tabbed';
        expect(container.classList.contains(tabbedClass)).toBe(true);
    });

    it('showView in tabbed mode does not throw when entry is absent from activeViews', () => {
        // Arrange
        viewManager['viewLifecycleManager'] = { showView: vi.fn(), hideView: vi.fn() } as any;
        viewManager['layoutMode'] = 'tabbed';
        viewManager['tabBar'] = { updateTabs: vi.fn() } as any;

        // Act & Assert
        expect(() => viewManager.showView('ghost')).not.toThrow();
    });
});
