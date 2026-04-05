import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeView } from '@/cube/types';
import { logger } from '@/diagnostics/logger';

import * as panelPositioning from './panel-positioning';
import * as panelResizeUtils from './panel-resize-utils';
import * as viewRegistry from './view-registry';
import { PanelInteractionHandler } from './panel-interaction-handler';

vi.mock('./panel-resize-utils');
vi.mock('./panel-positioning');
vi.mock('./view-registry');
vi.mock('@/diagnostics/logger');

function createMockView(
    options: {
        getMinimumSize?: () => { width: number; height: number };
        resize?: () => void;
    } = {}
): CubeView {
    return {
        getViewType: vi.fn(() => 'test-view'),
        create: vi.fn(),
        update: vi.fn(),
        updateHighlight: vi.fn(),
        resize: options.resize || vi.fn(),
        getMinimumSize: options.getMinimumSize || vi.fn(() => ({ width: 100, height: 100 })),
        getCommands: vi.fn(() => []),
        destroy: vi.fn(),
    };
}

describe('PanelInteractionHandler', () => {
    let visualizationsContainer: HTMLElement;
    let styles: Record<string, string>;
    let activeViews: Map<string, { view: CubeView; container: HTMLElement }>;
    let zIndexCounter: number;
    let getActiveViewId: () => string | undefined;
    let onPanelClick: (viewType: string) => void;
    let handler: PanelInteractionHandler;

    beforeEach(() => {
        // Set up DOM
        document.body.innerHTML = '<div id="visualizations-container"></div>';
        visualizationsContainer = document.getElementById('visualizations-container')!;

        // Polyfill setPointerCapture and releasePointerCapture for jsdom
        if (!HTMLElement.prototype.setPointerCapture) {
            HTMLElement.prototype.setPointerCapture = vi.fn();
        }
        if (!HTMLElement.prototype.releasePointerCapture) {
            HTMLElement.prototype.releasePointerCapture = vi.fn();
        }

        // Mock getBoundingClientRect for container
        vi.spyOn(visualizationsContainer, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 1000,
            height: 800,
            right: 1000,
            bottom: 800,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        styles = {
            'view-panel': 'view-panel',
            'view-header': 'view-header',
            'resize-handle': 'resize-handle',
            dragging: 'dragging',
            resizing: 'resizing',
        };

        activeViews = new Map();
        zIndexCounter = 0;
        getActiveViewId = vi.fn(() => undefined);
        onPanelClick = vi.fn();

        handler = new PanelInteractionHandler(
            visualizationsContainer,
            styles,
            activeViews,
            zIndexCounter,
            getActiveViewId,
            onPanelClick
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('setupDragAndResizeHandlers', () => {
        it('should set up event listeners', () => {
            // Arrange
            const addEventListenerSpy = vi.spyOn(visualizationsContainer, 'addEventListener');
            const documentAddEventListenerSpy = vi.spyOn(document, 'addEventListener');

            // Act
            handler.setupDragAndResizeHandlers();

            // Assert
            expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
            expect(documentAddEventListenerSpy).toHaveBeenCalledWith(
                'pointermove',
                expect.any(Function)
            );
            expect(documentAddEventListenerSpy).toHaveBeenCalledWith(
                'pointerup',
                expect.any(Function)
            );
        });

        it('should call onPanelClick when panel is clicked', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            visualizationsContainer.appendChild(panel);
            const event = new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 100,
                clientY: 100,
            });

            // Act
            panel.dispatchEvent(event);

            // Assert
            expect(onPanelClick).toHaveBeenCalledWith('basic');
        });

        it('should start drag when clicking on header', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 50,
                top: 50,
                width: 200,
                height: 200,
                right: 250,
                bottom: 250,
                x: 50,
                y: 50,
                toJSON: () => ({}),
            });
            const header = document.createElement('div');
            header.className = styles['view-header'];
            panel.appendChild(header);
            visualizationsContainer.appendChild(panel);
            const event = new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 100,
                clientY: 60,
            });

            // Act
            header.dispatchEvent(event);

            // Assert
            expect(panel.classList.contains(styles.dragging)).toBe(true);
        });

        it('should start resize when clicking on resize handle', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 50,
                top: 50,
                width: 200,
                height: 200,
                right: 250,
                bottom: 250,
                x: 50,
                y: 50,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'se');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);
            const event = new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 100,
                clientY: 100,
            });

            // Act
            handle.dispatchEvent(event);

            // Assert
            expect(panel.classList.contains(styles.resizing)).toBe(true);
        });

        it('should handle drag movement', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 50,
                top: 50,
                width: 200,
                height: 200,
                right: 250,
                bottom: 250,
                x: 50,
                y: 50,
                toJSON: () => ({}),
            });
            const header = document.createElement('div');
            header.className = styles['view-header'];
            panel.appendChild(header);
            visualizationsContainer.appendChild(panel);

            // Act
            header.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 60,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 150,
                    clientY: 100,
                })
            );

            // Assert
            expect(panel.style.left).toBeTruthy();
            expect(panel.style.top).toBeTruthy();
        });

        it('should handle resize movement', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
                resize: vi.fn(),
            });
            activeViews.set('basic', {
                view: mockView,
                container: document.createElement('div'),
            });
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 50,
                top: 50,
                width: 200,
                height: 200,
                right: 250,
                bottom: 250,
                x: 50,
                y: 50,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'se');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);

            // Act
            handle.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 250,
                    clientY: 250,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 300,
                    clientY: 300,
                })
            );

            // Assert
            expect(panel.style.width).toBeTruthy();
            expect(panel.style.height).toBeTruthy();
            expect(mockView.resize).toHaveBeenCalled();
        });

        it('should end drag on pointer up', () => {
            // Arrange
            vi.mocked(panelPositioning.savePanelState).mockImplementation(() => {});
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 50,
                top: 50,
                width: 200,
                height: 200,
                right: 250,
                bottom: 250,
                x: 50,
                y: 50,
                toJSON: () => ({}),
            });
            const header = document.createElement('div');
            header.className = styles['view-header'];
            panel.appendChild(header);
            visualizationsContainer.appendChild(panel);
            header.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 60,
                })
            );
            expect(panel.classList.contains(styles.dragging)).toBe(true);

            // Act
            document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

            // Assert
            expect(panel.classList.contains(styles.dragging)).toBe(false);
            expect(panelPositioning.savePanelState).toHaveBeenCalled();
        });

        it('should not handle events when not clicking on a panel', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const event = new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: 100,
                clientY: 100,
            });

            // Act
            visualizationsContainer.dispatchEvent(event);

            // Assert
            expect(onPanelClick).not.toHaveBeenCalled();
        });
    });

    describe('setInitialPanelPosition', () => {
        it('should use saved panel state when available and visible', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue({
                position: { x: 100, y: 100 },
                size: { width: 300, height: 250 },
            });
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic', mockView);

            // Assert
            expect(panel.style.position).toBe('absolute');
            expect(panel.style.left).toBe('100px');
            expect(panel.style.top).toBe('100px');
            expect(panel.style.width).toBe('300px');
            expect(panel.style.height).toBe('250px');
            expect(logger.debug).toHaveBeenCalled();
        });

        it('should recalculate position when saved state is mostly outside visible area', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue({
                position: { x: 900, y: 700 },
                size: { width: 300, height: 250 },
            });
            vi.mocked(panelPositioning.calculateDefaultPosition).mockReturnValue({
                x: 50,
                y: 50,
            });
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic', mockView);

            // Assert
            expect(panelPositioning.calculateDefaultPosition).toHaveBeenCalled();
            expect(panel.style.left).toBe('50px');
            expect(panel.style.top).toBe('50px');
        });

        it('should use default config when no saved state', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue(undefined);
            vi.mocked(viewRegistry.getViewDefaultConfig).mockReturnValue({
                x: 0,
                y: 0,
                width: 400,
                height: 300,
            });
            vi.mocked(panelPositioning.calculateDefaultPosition).mockReturnValue({
                x: 200,
                y: 150,
            });
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic', mockView);

            // Assert
            expect(viewRegistry.getViewDefaultConfig).toHaveBeenCalledWith('basic');
            expect(panelPositioning.calculateDefaultPosition).toHaveBeenCalled();
            expect(panel.style.width).toBe('400px');
            expect(panel.style.height).toBe('300px');
        });

        it('should enforce minimum size from view', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue({
                position: { x: 100, y: 100 },
                size: { width: 50, height: 50 }, // Smaller than minimum
            });
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 200, height: 150 }),
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic', mockView);

            // Assert
            expect(panel.style.width).toBe('200px');
            expect(panel.style.height).toBe('150px');
        });

        it('should handle container with zero dimensions (jsdom)', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.spyOn(visualizationsContainer, 'getBoundingClientRect').mockReturnValue({
                left: 0,
                top: 0,
                width: 0, // zero-size container (common in jsdom)
                height: 0,
                right: 0,
                bottom: 0,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            });
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue({
                position: { x: 100, y: 100 },
                size: { width: 300, height: 250 },
            });
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic', mockView);

            // Assert
            expect(panel.style.left).toBe('100px');
            expect(panel.style.top).toBe('100px');
        });

        it('should set z-index on panel', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue(undefined);
            vi.mocked(viewRegistry.getViewDefaultConfig).mockReturnValue({
                x: 0,
                y: 0,
                width: 400,
                height: 300,
            });
            vi.mocked(panelPositioning.calculateDefaultPosition).mockReturnValue({
                x: 200,
                y: 150,
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic');

            // Assert
            expect(panel.style.zIndex).toBeTruthy();
        });

        it('should use default minimum size when view not provided', () => {
            // Arrange
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            vi.mocked(panelPositioning.loadPanelState).mockReturnValue(undefined);
            vi.mocked(viewRegistry.getViewDefaultConfig).mockReturnValue({
                x: 0,
                y: 0,
                width: 50, // Smaller than default minimum
                height: 50,
            });
            vi.mocked(panelPositioning.calculateDefaultPosition).mockReturnValue({
                x: 200,
                y: 150,
            });

            // Act
            handler.setInitialPanelPosition(panel, 'basic');

            // Assert
            expect(panel.style.width).toBe('100px');
            expect(panel.style.height).toBe('100px');
        });

        it('should be a no-op in tabbed mode', () => {
            // Arrange
            handler.setLayoutMode('tabbed');
            const panel = document.createElement('div');
            panel.id = 'basic-panel';

            // Act
            handler.setInitialPanelPosition(panel, 'basic');

            // Assert
            expect(panel.style.position).toBe('');
            expect(panel.style.left).toBe('');
            expect(panel.style.top).toBe('');
            expect(panel.style.width).toBe('');
            expect(panel.style.height).toBe('');
            expect(panelPositioning.loadPanelState).not.toHaveBeenCalled();
        });
    });

    describe('addResizeHandlesToPanel', () => {
        it('should call addResizeHandles with panel and styles', () => {
            // Arrange
            const panel = document.createElement('div');

            // Act
            handler.addResizeHandlesToPanel(panel);

            // Assert
            expect(panelResizeUtils.addResizeHandles).toHaveBeenCalledWith(panel, styles);
        });
    });

    describe('resize direction handling', () => {
        it('should resize east direction correctly', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
                resize: vi.fn(),
            });
            activeViews.set('basic', {
                view: mockView,
                container: document.createElement('div'),
            });
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 100,
                width: 200,
                height: 200,
                right: 300,
                bottom: 300,
                x: 100,
                y: 100,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'e');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);

            // Act
            handle.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 300,
                    clientY: 200,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 350,
                    clientY: 200,
                })
            );

            // Assert
            expect(parseInt(panel.style.width)).toBeGreaterThan(200);
        });

        it('should resize west direction correctly', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 100, height: 100 }),
                resize: vi.fn(),
            });
            activeViews.set('basic', {
                view: mockView,
                container: document.createElement('div'),
            });
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 100,
                width: 200,
                height: 200,
                right: 300,
                bottom: 300,
                x: 100,
                y: 100,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'w');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);

            // Act
            handle.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 200,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 50,
                    clientY: 200,
                })
            );

            // Assert
            expect(parseInt(panel.style.width)).toBeGreaterThan(200);
            expect(parseInt(panel.style.left)).toBeLessThan(100);
        });

        it('should enforce minimum size during resize', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const mockView = createMockView({
                getMinimumSize: () => ({ width: 150, height: 150 }),
                resize: vi.fn(),
            });
            activeViews.set('basic', {
                view: mockView,
                container: document.createElement('div'),
            });
            const panel = document.createElement('div');
            panel.id = 'basic-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 100,
                width: 200,
                height: 200,
                right: 300,
                bottom: 300,
                x: 100,
                y: 100,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'se');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);

            // Act
            handle.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 300,
                    clientY: 300,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 150,
                    clientY: 150,
                })
            );

            // Assert
            expect(parseInt(panel.style.width)).toBeGreaterThanOrEqual(150);
            expect(parseInt(panel.style.height)).toBeGreaterThanOrEqual(150);
        });

        it('should use default minimum size when view not in activeViews', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel = document.createElement('div');
            panel.id = 'unknown-panel';
            panel.className = styles['view-panel'];
            panel.style.position = 'absolute';
            vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 100,
                width: 200,
                height: 200,
                right: 300,
                bottom: 300,
                x: 100,
                y: 100,
                toJSON: () => ({}),
            });
            const handle = document.createElement('div');
            handle.className = styles['resize-handle'];
            handle.setAttribute('data-resize-direction', 'se');
            panel.appendChild(handle);
            visualizationsContainer.appendChild(panel);

            // Act
            handle.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 300,
                    clientY: 300,
                })
            );
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 110,
                    clientY: 110,
                })
            );

            // Assert
            expect(parseInt(panel.style.width)).toBeGreaterThanOrEqual(20);
            expect(parseInt(panel.style.height)).toBeGreaterThanOrEqual(20);
        });
    });

    describe('z-index management', () => {
        it('should increment z-index when bringing panel to front', () => {
            // Arrange
            handler.setupDragAndResizeHandlers();
            const panel1 = document.createElement('div');
            panel1.id = 'basic-panel';
            panel1.className = styles['view-panel'];
            visualizationsContainer.appendChild(panel1);
            const panel2 = document.createElement('div');
            panel2.id = 'circular-panel';
            panel2.className = styles['view-panel'];
            visualizationsContainer.appendChild(panel2);

            // Act
            panel1.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 100,
                })
            );
            const zIndex1 = parseInt(panel1.style.zIndex);
            panel2.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 100,
                })
            );
            const zIndex2 = parseInt(panel2.style.zIndex);

            // Assert
            expect(zIndex2).toBeGreaterThan(zIndex1);
        });
    });
});
