import { describe, expect, it } from 'vitest';

import { addResizeHandles } from './panel-resize-utils';

// Simple tests to ensure resize utility logic is executed and not mocked out.
describe('panel-resize-utils', () => {
    it('adds eight resize handles with proper classes and directions', () => {
        // Arrange
        const panel = document.createElement('div');
        const styles: Record<string, string> = {
            'resize-handle': 'rh',
            nw: 'nw',
            ne: 'ne',
            sw: 'sw',
            se: 'se',
            n: 'n',
            s: 's',
            w: 'w',
            e: 'e',
        };

        // Act
        addResizeHandles(panel, styles);
        const handles = panel.querySelectorAll('div');

        // Assert
        expect(handles.length).toBe(8);

        const validDirs = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
        handles.forEach(h => {
            const dir = h.getAttribute('data-resize-direction');
            expect(validDirs).toContain(dir);
            // base class should always be present
            expect(h.className).toContain('rh');
        });
    });
});
