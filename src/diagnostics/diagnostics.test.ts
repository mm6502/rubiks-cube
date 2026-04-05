import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateManager } from '@/cube/core/state-manager';
import { Color, Face } from '@/cube/types';

import { dumpAsFlatView, dumpFlatView, faceGridsToString } from './diagnostics';
import { logger } from './logger';

describe('Diagnostics', () => {
    let manager: StateManager;
    let state: any;

    beforeEach(() => {
        manager = new StateManager(3);
        state = manager.getCurrentState();
    });

    describe('dumpAsFlatView', () => {
        it('should call createFlatView and dumpFlatView with the state', () => {
            // Arrange
            // Mock logger.groupScoped to return null (disabled logging)
            const groupScopedSpy = vi.spyOn(logger, 'groupScoped').mockReturnValue(null);

            // Act
            // Call the function
            dumpAsFlatView(state);

            // Assert
            // Verify groupScoped was called
            expect(groupScopedSpy).toHaveBeenCalledWith('Flat View Dump');

            groupScopedSpy.mockRestore();
        });
    });

    describe('dumpFlatView', () => {
        it('should log the flat view string and virtual centers', () => {
            // Arrange
            // Create mock face grids
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: [
                    [{ color: Color.WHITE }, { color: Color.WHITE }, { color: Color.WHITE }],
                    [{ color: Color.WHITE }, { color: Color.WHITE }, { color: Color.WHITE }],
                    [{ color: Color.WHITE }, { color: Color.WHITE }, { color: Color.WHITE }],
                ],
                virtualCenter: { color: Color.WHITE },
            });
            faceGrids.set(Face.F, {
                grid: [
                    [{ color: Color.GREEN }, { color: Color.GREEN }, { color: Color.GREEN }],
                    [{ color: Color.GREEN }, { color: Color.GREEN }, { color: Color.GREEN }],
                    [{ color: Color.GREEN }, { color: Color.GREEN }, { color: Color.GREEN }],
                ],
                virtualCenter: { color: Color.GREEN },
            });

            // Mock logger methods
            const groupScopedSpy = vi.spyOn(logger, 'groupScoped').mockReturnValue({
                info: vi.fn(),
                groupEnd: vi.fn(),
            } as any);

            // Act
            // Call the function
            dumpFlatView(faceGrids);

            // Assert
            // Verify groupScoped was called
            expect(groupScopedSpy).toHaveBeenCalledWith('Flat View Dump');

            const mockScope = groupScopedSpy.mock.results[0].value;
            expect(mockScope.info).toHaveBeenCalledTimes(3); // header, faceGridsToString, and virtual centers
            expect(mockScope.groupEnd).toHaveBeenCalledTimes(1);

            groupScopedSpy.mockRestore();
        });

        it('should handle missing virtual centers', () => {
            // Arrange
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: [[{ color: Color.WHITE }]],
                virtualCenter: undefined,
            });

            const groupScopedSpy = vi.spyOn(logger, 'groupScoped').mockReturnValue({
                info: vi.fn(),
                groupEnd: vi.fn(),
            } as any);

            // Act
            dumpFlatView(faceGrids);

            // Assert
            const mockScope = groupScopedSpy.mock.results[0].value;
            // Check that virtual centers string contains U:? for missing center
            const virtualCentersCall = mockScope.info.mock.calls.find((call: any[]) =>
                call[0].startsWith('Virtual Centers:')
            );
            expect(virtualCentersCall[0]).toContain('U:?');

            groupScopedSpy.mockRestore();
        });
    });

    describe('faceGridsToString', () => {
        it('should generate a string representation of face grids', () => {
            // Arrange
            // Create simple face grids
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: [[{ color: Color.WHITE }]],
                virtualCenter: { color: Color.WHITE },
            });

            // Act
            const result = faceGridsToString(faceGrids);

            // Assert
            // Should return a non-empty string
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);

            // Should contain the color initial
            expect(result).toContain('W');
        });

        it('should handle undefined stickers', () => {
            // Arrange
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: [[{ color: Color.WHITE }, undefined, { color: Color.WHITE }]],
                virtualCenter: { color: Color.WHITE },
            });

            // Act
            const result = faceGridsToString(faceGrids);

            // Assert
            // Should contain ? for undefined sticker
            expect(result).toContain('?');
        });

        it('should handle stickers with undefined color', () => {
            // Arrange
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: [[{ color: undefined as any }, { color: Color.WHITE }]],
                virtualCenter: { color: Color.WHITE },
            });

            // Act
            const result = faceGridsToString(faceGrids);

            // Assert
            // Should contain ? for sticker with undefined color
            expect(result).toContain('?');
        });

        it('should handle different cube sizes', () => {
            // Arrange
            // Test with 2x2 cube (n=2)
            const faceGrids = new Map();
            faceGrids.set(Face.U, {
                grid: Array(2)
                    .fill(null)
                    .map(() => Array(2).fill({ color: Color.WHITE })),
                virtualCenter: { color: Color.WHITE },
            });

            // Act
            const result = faceGridsToString(faceGrids);
            const lines = result.split('\n');

            // Assert
            // n=2, so 3*2 + 2 = 8 rows, 4*2 + 3 = 11 columns
            expect(lines).toHaveLength(8);
            lines.forEach(line => expect(line).toHaveLength(11));
        });

        it('should handle missing faces gracefully', () => {
            // Arrange
            const faceGrids = new Map();
            // Only add U face, others will be missing
            faceGrids.set(Face.U, {
                grid: [[{ color: Color.WHITE }]],
                virtualCenter: { color: Color.WHITE },
            });

            // Act
            const result = faceGridsToString(faceGrids);

            // Assert
            // Should still generate the full grid with dots for missing faces
            expect(result).toContain('.'); // Missing faces should show dots
            expect(result).toContain('W'); // U face should show W
        });
    });
});
