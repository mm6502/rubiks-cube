import { describe, expect, it } from 'vitest';

import { computeAvailableContentSize } from './view-utils';

describe('computeAvailableContentSize', () => {
    it('should return zero size when no panel is found', () => {
        // Arrange
        // Create a container element not inside a panel
        const container = document.createElement('div');

        // Act
        const result = computeAvailableContentSize(container);

        // Assert
        expect(result).toEqual({ width: 0, height: 0 });
    });

    it('should calculate available size when panel and header are found', () => {
        // Arrange
        // Create panel
        const panel = document.createElement('div');
        panel.setAttribute('data-view-panel', '');
        panel.style.width = '400px';
        panel.style.height = '300px';
        // Mock clientWidth and clientHeight
        Object.defineProperty(panel, 'clientWidth', { value: 400 });
        Object.defineProperty(panel, 'clientHeight', { value: 300 });

        // Create header
        const header = document.createElement('div');
        header.setAttribute('data-view-header', '');
        header.style.height = '50px';
        Object.defineProperty(header, 'offsetHeight', { value: 50 });

        // Create container
        const container = document.createElement('div');

        // Append to DOM
        panel.appendChild(header);
        panel.appendChild(container);
        document.body.appendChild(panel);

        // Act
        const result = computeAvailableContentSize(container);

        // Assert
        // availableWidth = 400 - 32 = 368
        // availableHeight = 300 - 50 - 32 = 218
        expect(result).toEqual({ width: 368, height: 218 });

        // Cleanup
        document.body.removeChild(panel);
    });

    it('should use default header height when header is not found', () => {
        // Arrange
        // Create panel
        const panel = document.createElement('div');
        panel.setAttribute('data-view-panel', '');
        Object.defineProperty(panel, 'clientWidth', { value: 500 });
        Object.defineProperty(panel, 'clientHeight', { value: 400 });

        // Create container (no header)
        const container = document.createElement('div');

        // Append to DOM
        panel.appendChild(container);
        document.body.appendChild(panel);

        // Act
        const result = computeAvailableContentSize(container);

        // Assert
        // availableWidth = 500 - 32 = 468
        // availableHeight = 400 - 44 - 32 = 324 (default header 44)
        expect(result).toEqual({ width: 468, height: 324 });

        // Cleanup
        document.body.removeChild(panel);
    });

    it('should handle small panel sizes and return minimum zero', () => {
        // Arrange
        // Create panel with very small size
        const panel = document.createElement('div');
        panel.setAttribute('data-view-panel', '');
        Object.defineProperty(panel, 'clientWidth', { value: 20 }); // Less than 32
        Object.defineProperty(panel, 'clientHeight', { value: 50 }); // Less than 44 + 32

        // Create header
        const header = document.createElement('div');
        header.setAttribute('data-view-header', '');
        Object.defineProperty(header, 'offsetHeight', { value: 40 });

        // Create container
        const container = document.createElement('div');

        // Append to DOM
        panel.appendChild(header);
        panel.appendChild(container);
        document.body.appendChild(panel);

        // Act
        const result = computeAvailableContentSize(container);

        // Assert
        // availableWidth = max(0, 20 - 32) = 0
        // availableHeight = max(0, 50 - 40 - 32) = max(0, -22) = 0
        expect(result).toEqual({ width: 0, height: 0 });

        // Cleanup
        document.body.removeChild(panel);
    });

    it('should handle zero panel dimensions', () => {
        // Arrange
        // Create panel with zero size
        const panel = document.createElement('div');
        panel.setAttribute('data-view-panel', '');
        Object.defineProperty(panel, 'clientWidth', { value: 0 });
        Object.defineProperty(panel, 'clientHeight', { value: 0 });

        // Create header
        const header = document.createElement('div');
        header.setAttribute('data-view-header', '');
        Object.defineProperty(header, 'offsetHeight', { value: 0 });

        // Create container
        const container = document.createElement('div');

        // Append to DOM
        panel.appendChild(header);
        panel.appendChild(container);
        document.body.appendChild(panel);

        // Act
        const result = computeAvailableContentSize(container);

        // Assert
        // availableWidth = max(0, 0 - 32) = 0
        // availableHeight = max(0, 0 - 0 - 32) = 0
        expect(result).toEqual({ width: 0, height: 0 });

        // Cleanup
        document.body.removeChild(panel);
    });
});
