// @vitest-environment jsdom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeView } from '@/cube/types/view';
import { LogLevel, logger } from '@/diagnostics/logger';

import { calculateDefaultPosition, loadPanelState, savePanelState } from './panel-positioning';

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Mock getViewDefaultConfig
vi.mock('./view-registry', () => ({
    getViewDefaultConfig: vi.fn((viewType: string) => ({
        x: viewType === 'test-view' ? 50 : 0,
        y: viewType === 'test-view' ? 50 : 0,
    })),
}));

describe('Panel Positioning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadPanelState', () => {
        beforeEach(() => {
            // Suppress expected warnings in tests
            logger.setLogLevel(LogLevel.NONE);
        });

        afterAll(() => {
            // Restore log level after tests.
            logger.setLogLevel(LogLevel.WARN);
        });

        it('should return undefined when no saved state exists', () => {
            // Arrange
            localStorageMock.getItem.mockReturnValue(null);

            // Act
            const result = loadPanelState('test-view');

            // Assert
            expect(result).toBeUndefined();
            expect(localStorageMock.getItem).toHaveBeenCalledWith('view-panel-test-view');
        });

        it('should return parsed state when saved state exists', () => {
            // Arrange
            const savedState = {
                position: { x: 10, y: 20 },
                size: { width: 300, height: 200 },
            };
            localStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));

            // Act
            const result = loadPanelState('test-view');

            // Assert
            expect(result).toEqual(savedState);
            expect(localStorageMock.getItem).toHaveBeenCalledWith('view-panel-test-view');
        });

        it('should handle invalid JSON gracefully', () => {
            // Arrange
            localStorageMock.getItem.mockReturnValue('invalid json');

            // Act
            const result = loadPanelState('test-view');

            // Act & Assert
            expect(result).toBeUndefined();
        });
    });

    describe('savePanelState', () => {
        it('should save panel state with container rect', () => {
            // Arrange
            const mockContainer = {
                id: 'test-view-panel',
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 100,
                    top: 150,
                    width: 300,
                    height: 200,
                }),
                style: { left: '0px', top: '0px' },
            } as unknown as HTMLElement;

            const mockView = {
                getState: vi.fn().mockReturnValue({ someViewState: true }),
            } as unknown as CubeView;

            const mockVisualizationsContainer = {
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 50,
                    top: 100,
                }),
            } as unknown as HTMLElement;

            // Act
            savePanelState(
                { view: mockView, container: mockContainer },
                mockVisualizationsContainer
            );

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'view-panel-test-view',
                JSON.stringify({
                    position: { x: 50, y: 50 }, // 100 - 50, 150 - 100
                    size: { width: 300, height: 200 },
                    viewState: { someViewState: true },
                })
            );
        });

        it('should save panel state without container rect', () => {
            // Arrange
            const mockContainer = {
                id: 'test-view-panel',
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 100,
                    top: 150,
                    width: 300,
                    height: 200,
                }),
                style: { left: '25px', top: '35px' },
            } as unknown as HTMLElement;

            const mockView = {
                getState: vi.fn().mockReturnValue(undefined),
            } as unknown as CubeView;

            // Act
            savePanelState({ view: mockView, container: mockContainer }, null);

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'view-panel-test-view',
                JSON.stringify({
                    position: { x: 25, y: 35 },
                    size: { width: 300, height: 200 },
                })
            );
        });

        it('should handle view without getState method', () => {
            // Arrange
            const mockContainer = {
                id: 'test-view-panel',
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 100,
                    top: 150,
                    width: 300,
                    height: 200,
                }),
                style: { left: '0px', top: '0px' },
            } as unknown as HTMLElement;

            const mockView = {} as CubeView;

            // Act
            savePanelState({ view: mockView, container: mockContainer }, null);

            // Assert
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'view-panel-test-view',
                JSON.stringify({
                    position: { x: 20, y: 20 }, // fallback
                    size: { width: 300, height: 200 },
                })
            );
        });
    });

    describe('calculateDefaultPosition', () => {
        const createMockContainer = (width: number, height: number) => {
            const container = {
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 0,
                    top: 0,
                    width,
                    height,
                }),
                querySelector: vi.fn(),
            } as unknown as HTMLElement;
            return container;
        };

        const createMockPanel = (x: number, y: number, width: number, height: number) =>
            ({
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: x,
                    top: y,
                    width,
                    height,
                }),
            }) as unknown as HTMLElement;

        it('should return default position when no container', () => {
            // Arrange & Act
            const result = calculateDefaultPosition(
                undefined,
                new Map(),
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 20, y: 20 });
        });

        it('should use preferred position when available', () => {
            // Arrange
            const container = createMockContainer(800, 600);

            // Act
            const result = calculateDefaultPosition(
                container,
                new Map(),
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 50, y: 50 }); // from mocked getViewDefaultConfig
        });

        it('should clamp preferred position to container bounds', () => {
            // Arrange
            const container = createMockContainer(300, 200);

            // Act
            const result = calculateDefaultPosition(
                container,
                new Map(),
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 50, y: 50 }); // clamped to fit within container
        });

        it('should find grid position when preferred is occupied', () => {
            // Arrange
            const container = createMockContainer(400, 300);
            const occupiedPanel = createMockPanel(0, 0, 200, 150);
            const activeViews = new Map([['occupied', { container: occupiedPanel }]]);

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            // Should find a position that doesn't overlap
            expect(result.x).toBeGreaterThanOrEqual(0);
            expect(result.y).toBeGreaterThanOrEqual(0);
            expect(result.x + 200).toBeLessThanOrEqual(400);
            expect(result.y + 150).toBeLessThanOrEqual(300);
        });

        it('should cascade from active panel when grid search fails', () => {
            // Arrange
            const container = createMockContainer(400, 300);
            // Fill the container with panels to force cascade
            const panels = [];
            for (let i = 0; i < 4; i++) {
                panels.push(createMockPanel(i * 100, i * 75, 100, 75));
            }
            const activeViews = new Map(
                panels.map((panel, i) => [`panel-${i}`, { container: panel }])
            );

            // Mock header height
            (container.querySelector as any).mockReturnValue({
                querySelector: vi.fn().mockReturnValue({
                    offsetHeight: 30,
                }),
            });

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 },
                () => 'panel-0' // active panel
            );

            // Assert
            expect(result).toBeDefined();
        });

        it('should fallback to gap position when all strategies fail', () => {
            // Arrange
            const container = createMockContainer(100, 100); // Very small container
            const occupiedPanel = createMockPanel(0, 0, 100, 100); // Occupies entire container
            const activeViews = new Map([['full', { container: occupiedPanel }]]);

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 }, // Larger than container
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 12, y: 12 }); // PANEL_GAP
        });

        it('should handle invalid container dimensions', () => {
            // Arrange
            const container = {
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 0,
                    top: 0,
                    width: NaN, // Invalid width
                    height: Infinity, // Invalid height
                }),
                querySelector: vi.fn(),
            } as unknown as HTMLElement;

            // Mock window dimensions
            Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
            Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });

            // Act
            const result = calculateDefaultPosition(
                container,
                new Map(),
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 50, y: 50 });
        });

        it('should handle unreasonably large container dimensions', () => {
            // Arrange
            const container = {
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 0,
                    top: 0,
                    width: 100000, // Too large
                    height: 50000, // Too large
                }),
                querySelector: vi.fn(),
            } as unknown as HTMLElement;

            Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
            Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });

            // Act
            const result = calculateDefaultPosition(
                container,
                new Map(),
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toEqual({ x: 50, y: 50 });
        });

        it('should handle panels with invalid dimensions', () => {
            // Arrange
            const container = createMockContainer(400, 300);
            const invalidPanel = createMockPanel(0, 0, NaN, Infinity); // Invalid dimensions
            const activeViews = new Map([['invalid', { container: invalidPanel }]]);

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 },
                () => undefined
            );

            // Assert
            expect(result).toBeDefined();
        });

        it('should handle cascade when no active panel exists', () => {
            // Arrange
            const container = createMockContainer(400, 300);
            // Fill container to force cascade
            const panels = [];
            for (let i = 0; i < 4; i++) {
                panels.push(createMockPanel(i * 100, i * 75, 100, 75));
            }
            const activeViews = new Map(
                panels.map((panel, i) => [`panel-${i}`, { container: panel }])
            );

            (container.querySelector as any).mockReturnValue({
                querySelector: vi.fn().mockReturnValue({
                    offsetHeight: 30,
                }),
            });

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 },
                () => undefined // No active panel
            );

            // Assert
            expect(result).toBeDefined();
        });

        it('should handle cascade when header query fails', () => {
            // Arrange
            const container = createMockContainer(400, 300);
            const occupiedPanel = createMockPanel(0, 0, 200, 150);
            const activeViews = new Map([['occupied', { container: occupiedPanel }]]);

            // Mock failed header query
            (container.querySelector as any).mockReturnValue(null);

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 },
                () => 'occupied'
            );

            // Assert
            expect(result).toBeDefined();
        });

        it('should return undefined from cascade when no position found after max steps', () => {
            // Arrange
            // Create a very small container that forces cascade failure
            const container = createMockContainer(50, 50); // Very small container
            // Create a panel that occupies most of the space
            const blockingPanel = createMockPanel(0, 0, 40, 40); // Leaves only 10x10 gap
            const activeViews = new Map([['blocker', { container: blockingPanel }]]);

            (container.querySelector as any).mockReturnValue({
                querySelector: vi.fn().mockReturnValue({
                    offsetHeight: 30,
                }),
            });

            // Act
            const result = calculateDefaultPosition(
                container,
                activeViews,
                'test-view',
                { width: 200, height: 150 }, // Much larger than container
                () => 'blocker' // Use blocker as anchor
            );

            // Assert
            // Should fallback to gap position since cascade fails
            expect(result).toEqual({ x: 12, y: 12 });
        });
    });
});
