// @vitest-environment jsdom
import {
    MockedFunction,
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { Application } from '@/application';
import { CubeModel, CubeView } from '@/cube/types';
import { LogLevel, logger } from '@/diagnostics/logger';
import { EventName, ViewStateChangedEvent } from '@/types';

import { CommandManager } from './command-manager';
import { PanelInteractionHandler } from './panel-interaction-handler';
import { loadPanelState, savePanelState } from './panel-positioning';
import { ViewLifecycleManager } from './view-lifecycle-manager';
import { createView, getAvailableViews, getViewTitle } from './view-registry';

// Mock modules
vi.mock('@/diagnostics/logger');
vi.mock('@/application');
vi.mock('./view-registry');
vi.mock('./panel-positioning');

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

beforeEach(() => {
    localStorage.clear();
});

describe('ViewLifecycleManager', () => {
    let viewLifecycleManager: ViewLifecycleManager;
    let mockCubeModel: CubeModel;
    let mockPanelInteractionHandler: PanelInteractionHandler;
    let mockCommandManager: CommandManager;
    let mockActiveViews: Map<string, { view: CubeView; container: HTMLElement }>;
    let mockOnUpdateFocus: MockedFunction<(viewId: string) => void>;
    let mockVisualizationsContainer: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock CubeModel
        mockCubeModel = {
            getReadOnlyModel: vi.fn().mockReturnValue({}),
        } as any;

        // Mock PanelInteractionHandler
        mockPanelInteractionHandler = {
            setInitialPanelPosition: vi.fn(),
            addResizeHandlesToPanel: vi.fn(),
        } as any;

        // Mock CommandManager
        mockCommandManager = {
            registerViewCommands: vi.fn(),
            updateViewHeaderCommands: vi.fn(),
            renderGlobalCommands: vi.fn(),
        } as any;

        // Mock activeViews
        mockActiveViews = new Map();

        // Mock callbacks
        mockOnUpdateFocus = vi.fn();

        // Mock visualizations container
        mockVisualizationsContainer = document.createElement('div');

        // Mock Application.eventBus
        vi.spyOn(Application.eventBus, 'on').mockImplementation(vi.fn());

        // Mock view registry
        vi.mocked(getAvailableViews).mockReturnValue(['basic-front', 'flat']);
        vi.mocked(getViewTitle).mockImplementation(viewType => `Title for ${viewType}`);
        vi.mocked(createView).mockImplementation(viewType => {
            const mockView: CubeView = {
                getViewType: vi.fn().mockReturnValue(viewType),
                create: vi.fn(),
                update: vi.fn(),
                updateSelective: vi.fn(),
                updateHighlight: vi.fn(),
                resize: vi.fn(),
                getMinimumSize: vi.fn().mockReturnValue({ width: 100, height: 100 }),
                getCubeElement: vi.fn(),
                getCommands: vi.fn().mockReturnValue([]),
                handleKeyDown: vi.fn(),
                handleKeyUp: vi.fn(),
                destroy: vi.fn(),
                getState: vi.fn(),
                setState: vi.fn(),
            };
            return mockView;
        });

        // Mock panel positioning
        vi.mocked(loadPanelState).mockReturnValue(undefined);
        vi.mocked(savePanelState).mockImplementation(vi.fn());

        viewLifecycleManager = new ViewLifecycleManager(
            mockCubeModel,
            {
                'view-panel': 'view-panel',
                'view-header': 'view-header',
                'view-title': 'view-title',
                'view-content': 'view-content',
            },
            mockVisualizationsContainer,
            mockPanelInteractionHandler,
            mockActiveViews,
            mockCommandManager,
            {
                onUpdateFocus: mockOnUpdateFocus,
                getLayoutMode: () => 'floating' as const,
            }
        );
    });

    describe('constructor', () => {
        it('should initialize with provided parameters', () => {
            expect(viewLifecycleManager).toBeDefined();
            expect(Application.eventBus.on).toHaveBeenCalledWith(
                EventName.VIEW_STATE_CHANGED,
                expect.any(Function)
            );
        });
    });

    describe('createViewControls', () => {
        beforeEach(() => {
            // Create view-controls container
            const container = document.createElement('div');
            container.className = 'view-controls';
            document.body.appendChild(container);
        });

        afterEach(() => {
            document.body.innerHTML = '';
        });
        it('should create checkboxes for available views', () => {
            viewLifecycleManager.createViewControls();

            const checkboxes = document.querySelectorAll('.view-checkbox input[type="checkbox"]');
            expect(checkboxes).toHaveLength(2);
            expect((checkboxes[0] as HTMLInputElement).id).toBe('show-basic-front');
            expect((checkboxes[1] as HTMLInputElement).id).toBe('show-flat');
        });

        it('should set default checked state for basic-front and flat views', () => {
            viewLifecycleManager.createViewControls();

            const basicFrontCheckbox = document.getElementById(
                'show-basic-front'
            ) as HTMLInputElement;
            const flatCheckbox = document.getElementById('show-flat') as HTMLInputElement;

            expect(basicFrontCheckbox.checked).toBe(true);
            expect(flatCheckbox.checked).toBe(true);
        });

        it('should add event listeners to checkboxes', () => {
            viewLifecycleManager.createViewControls();

            const checkbox = document.getElementById('show-basic-front') as HTMLInputElement;

            // Mock showView and hideView
            const showViewSpy = vi.spyOn(viewLifecycleManager as any, 'showView');
            const hideViewSpy = vi.spyOn(viewLifecycleManager as any, 'hideView');
            const persistSpy = vi.spyOn(viewLifecycleManager as any, 'persistVisibleViews');

            // Simulate checking the checkbox
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            expect(showViewSpy).toHaveBeenCalledWith('basic-front');
            expect(persistSpy).toHaveBeenCalled();

            // Simulate unchecking the checkbox
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));

            expect(hideViewSpy).toHaveBeenCalledWith('basic-front');
            expect(persistSpy).toHaveBeenCalledTimes(2);
        });

        it('should restore visibility settings on creation', () => {
            const restoreSpy = vi.spyOn(viewLifecycleManager as any, 'restoreVisibleViews');
            viewLifecycleManager.createViewControls();

            expect(restoreSpy).toHaveBeenCalled();
        });

        it('should show initially checked views', () => {
            const showViewSpy = vi.spyOn(viewLifecycleManager as any, 'showView');
            viewLifecycleManager.createViewControls();

            expect(showViewSpy).toHaveBeenNthCalledWith(1, 'basic-front', false);
            expect(showViewSpy).toHaveBeenNthCalledWith(2, 'flat', false);
        });

        it('should set focus to basic-front by default', () => {
            viewLifecycleManager.createViewControls();

            expect(mockOnUpdateFocus).toHaveBeenLastCalledWith('basic-front');
        });

        it('should warn if view controls container not found', () => {
            document.body.innerHTML = '';
            const warnSpy = vi.spyOn(logger, 'warn');

            viewLifecycleManager.createViewControls();

            expect(warnSpy).toHaveBeenCalledWith('View controls container not found');
        });
    });

    describe('showView', () => {
        it('should not show view if already active', () => {
            const mockView = { view: {} as CubeView, container: document.createElement('div') };
            mockActiveViews.set('basic-front', mockView);

            viewLifecycleManager['showView']('basic-front');

            expect(mockActiveViews.size).toBe(1);
        });

        it('should create and show a new view', () => {
            viewLifecycleManager['showView']('basic-front');

            expect(mockActiveViews.has('basic-front')).toBe(true);
            const activeView = mockActiveViews.get('basic-front')!;
            expect(activeView).toBeDefined();
            expect(mockPanelInteractionHandler.setInitialPanelPosition).toHaveBeenCalled();
            expect(mockCommandManager.registerViewCommands).toHaveBeenCalledWith(
                'basic-front',
                activeView.view
            );
            expect(mockCommandManager.updateViewHeaderCommands).toHaveBeenCalledWith('basic-front');
            expect(mockCommandManager.renderGlobalCommands).toHaveBeenCalled();
            expect(mockOnUpdateFocus).toHaveBeenCalledWith('basic-front');
        });

        it('should load and apply saved state if available', () => {
            const mockState: any = {
                x: 10,
                y: 20,
                width: 100,
                height: 200,
                viewState: { some: 'state' },
            };
            vi.mocked(loadPanelState).mockReturnValue(mockState);

            viewLifecycleManager['showView']('basic-front');

            const activeView = mockActiveViews.get('basic-front')!;
            expect(activeView.view.setState).toHaveBeenCalledWith({ some: 'state' });
            expect(activeView.view.update).toHaveBeenCalled();
        });

        it('should persist panel position', () => {
            viewLifecycleManager['showView']('basic-front');

            expect(vi.mocked(savePanelState)).toHaveBeenCalled();
        });

        it('should not persist panel position in tabbed mode', () => {
            const mockOnPanelAdded = vi.fn();
            const tabbedManager = new ViewLifecycleManager(
                mockCubeModel,
                {
                    'view-panel': 'view-panel',
                    'view-header': 'view-header',
                    'view-title': 'view-title',
                    'view-content': 'view-content',
                },
                mockVisualizationsContainer,
                mockPanelInteractionHandler,
                mockActiveViews,
                mockCommandManager,
                {
                    onUpdateFocus: mockOnUpdateFocus,
                    getLayoutMode: () => 'tabbed' as const,
                    onPanelAdded: mockOnPanelAdded,
                }
            );

            tabbedManager['showView']('basic-front');

            expect(vi.mocked(savePanelState)).not.toHaveBeenCalled();
            expect(mockOnPanelAdded).toHaveBeenCalledWith('basic-front', expect.any(HTMLElement));
        });
    });

    describe('hideView', () => {
        let mockView: CubeView;
        let mockContainer: HTMLElement;

        beforeEach(() => {
            mockView = {
                destroy: vi.fn(),
            } as any;
            mockContainer = document.createElement('div');
            mockActiveViews.set('basic-front', { view: mockView, container: mockContainer });
            mockVisualizationsContainer.appendChild(mockContainer);
        });

        it('should destroy and remove active view', () => {
            const removeFromFocusStack = vi.fn();
            const updateVisualFocus = vi.fn();

            viewLifecycleManager['hideView'](
                'basic-front',
                removeFromFocusStack,
                updateVisualFocus
            );

            expect(mockView.destroy).toHaveBeenCalled();
            expect(mockVisualizationsContainer.contains(mockContainer)).toBe(false);
            expect(mockActiveViews.has('basic-front')).toBe(false);
            expect(removeFromFocusStack).toHaveBeenCalledWith('basic-front');
            expect(updateVisualFocus).toHaveBeenCalled();
            expect(mockCommandManager.renderGlobalCommands).toHaveBeenCalled();
        });

        it('should save panel state before destroying', () => {
            viewLifecycleManager['hideView']('basic-front');

            expect(vi.mocked(savePanelState)).toHaveBeenCalled();
        });

        it('should save only view state (not position) before destroying in tabbed mode', () => {
            const tabbedManager = new ViewLifecycleManager(
                mockCubeModel,
                {
                    'view-panel': 'view-panel',
                    'view-header': 'view-header',
                    'view-title': 'view-title',
                    'view-content': 'view-content',
                },
                mockVisualizationsContainer,
                mockPanelInteractionHandler,
                mockActiveViews,
                mockCommandManager,
                {
                    onUpdateFocus: mockOnUpdateFocus,
                    getLayoutMode: () => 'tabbed' as const,
                }
            );

            tabbedManager['hideView']('basic-front');

            expect(vi.mocked(savePanelState)).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                false
            );
        });

        it('should do nothing if view is not active', () => {
            viewLifecycleManager['hideView']('non-existent');

            expect(mockActiveViews.size).toBe(1);
        });
    });

    describe('handleViewStateChanged', () => {
        it('should save panel state when view state changes', () => {
            const mockView = { view: {} as CubeView, container: document.createElement('div') };
            mockActiveViews.set('basic-front', mockView);

            const event: ViewStateChangedEvent = { viewType: 'basic-front' };

            viewLifecycleManager['handleViewStateChanged'](event);

            expect(vi.mocked(savePanelState)).toHaveBeenCalled();
        });

        it('should save only view state (not position) when view state changes in tabbed mode', () => {
            const tabbedManager = new ViewLifecycleManager(
                mockCubeModel,
                {
                    'view-panel': 'view-panel',
                    'view-header': 'view-header',
                    'view-title': 'view-title',
                    'view-content': 'view-content',
                },
                mockVisualizationsContainer,
                mockPanelInteractionHandler,
                mockActiveViews,
                mockCommandManager,
                {
                    onUpdateFocus: mockOnUpdateFocus,
                    getLayoutMode: () => 'tabbed' as const,
                }
            );
            const mockView = { view: {} as CubeView, container: document.createElement('div') };
            mockActiveViews.set('basic-front', mockView);

            const event: ViewStateChangedEvent = { viewType: 'basic-front' };

            tabbedManager['handleViewStateChanged'](event);

            expect(vi.mocked(savePanelState)).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                false
            );
        });

        it('should do nothing if view is not active', () => {
            const event: ViewStateChangedEvent = { viewType: 'non-existent' };

            viewLifecycleManager['handleViewStateChanged'](event);

            expect(vi.mocked(savePanelState)).not.toHaveBeenCalled();
        });
    });

    describe('persistVisibleViews', () => {
        beforeEach(() => {
            const container = document.createElement('div');
            container.className = 'view-controls';
            document.body.appendChild(container);
        });

        afterEach(() => {
            document.body.innerHTML = '';
            localStorage.clear();
        });

        it('should save view states to localStorage', () => {
            viewLifecycleManager['createViewControls']();

            const checkbox = document.getElementById('show-basic-front') as HTMLInputElement;
            checkbox.checked = false;

            viewLifecycleManager['persistVisibleViews']();

            const saved = localStorage.getItem('rubiksCubeVisibleViews');
            expect(saved).toBe(JSON.stringify({ 'basic-front': false, flat: true }));
        });
    });

    describe('restoreVisibleViews', () => {
        beforeEach(() => {
            const container = document.createElement('div');
            container.className = 'view-controls';
            document.body.appendChild(container);
        });

        afterEach(() => {
            document.body.innerHTML = '';
            localStorage.clear();
        });

        it('should load view states from localStorage', () => {
            localStorage.setItem(
                'rubiksCubeVisibleViews',
                JSON.stringify({ 'basic-front': false, flat: true })
            );

            viewLifecycleManager['createViewControls']();

            const basicFrontCheckbox = document.getElementById(
                'show-basic-front'
            ) as HTMLInputElement;
            const flatCheckbox = document.getElementById('show-flat') as HTMLInputElement;

            expect(basicFrontCheckbox.checked).toBe(false);
            expect(flatCheckbox.checked).toBe(true);
        });

        it('should do nothing if no saved states', () => {
            viewLifecycleManager['createViewControls']();

            const checkbox = document.getElementById('show-basic-front') as HTMLInputElement;
            expect(checkbox.checked).toBe(true); // default
        });
    });
});
