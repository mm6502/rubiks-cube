/**
 * Tests for State Persistence Module (String Format)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeState } from '@/cube/types';
import { LogLevel, logger } from '@/diagnostics/logger';

import { MoveHistory } from './move-history';
import { StateManager } from './state-manager';
import { StatePersistence } from './state-persistence';

beforeAll(() => {
    // Suppress logs during tests.
    logger.setLogLevel(LogLevel.NONE);
});

afterAll(() => {
    // Restore log level after tests.
    logger.setLogLevel(LogLevel.WARN);
});

describe('StatePersistence (String Format)', () => {
    let testState: CubeState;
    let stateManager: StateManager;

    beforeEach(() => {
        // Ensure a clean localStorage between tests. Provide a simple mock when not present.
        StatePersistence.clearState();

        // Create a test state using StateManager
        stateManager = new StateManager(3);
        testState = stateManager.getCurrentState();
    });

    afterEach(() => {
        // Clean up after each test
        if (localStorage && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('stateToString', () => {
        it('should convert state to string', () => {
            const str = StatePersistence.stateToString(testState);
            expect(typeof str).toBe('string');
            expect(str.length).toBeGreaterThan(0);
        });

        it('should include cube size', () => {
            const str = StatePersistence.stateToString(testState);
            expect(str.startsWith('3:')).toBe(true);
        });

        it('should include face order', () => {
            const str = StatePersistence.stateToString(testState);
            const parts = str.split(':');
            expect(parts[1]).toBe('UDFBLR');
        });

        it('should include all 6 faces', () => {
            const str = StatePersistence.stateToString(testState);
            const parts = str.split(':');
            // Should be: cubeSize + faceOrder + 6 faces = 8 parts
            expect(parts.length).toBe(8);
        });

        it('should include move history when provided', () => {
            const history = new MoveHistory(['R', 'U', 'F']);
            const str = StatePersistence.stateToString(testState, history);
            const lines = str.split('\n');
            expect(lines.length).toBe(2);
            expect(lines[1]).toBe('R U F');
        });

        it('should not include empty move history', () => {
            const history = new MoveHistory();
            const str = StatePersistence.stateToString(testState, history);
            const lines = str.split('\n');
            expect(lines.length).toBe(1);
        });
    });

    describe('parseStateString', () => {
        it('should parse valid state string', () => {
            const str = StatePersistence.stateToString(testState);
            const parsed = StatePersistence.parseStateString(str);

            expect(parsed).not.toBeNull();
            expect(parsed?.cubeSize).toBe(3);
            expect(parsed?.faceOrder).toBe('UDFBLR');
            expect(parsed?.faceColors.length).toBe(6);
        });

        it('should parse state string with move history', () => {
            const history = new MoveHistory(['R', 'U']);
            const str = StatePersistence.stateToString(testState, history);
            const parsed = StatePersistence.parseStateString(str);

            expect(parsed).not.toBeNull();
            expect(parsed?.moveHistory).toBeDefined();
            expect(parsed?.moveHistory?.getHistory().length).toBe(2);
        });

        it('should reject invalid format', () => {
            const invalid = 'invalid string';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject too few parts', () => {
            const invalid = '3';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject wrong cube size', () => {
            const invalid = '99:UDFBLR:W:Y:O:R:G:B';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject cube size too small', () => {
            const invalid = '1:UDFBLR:W:Y:O:R:G:B';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject cube size too large', () => {
            const invalid = '11:UDFBLR:W:Y:O:R:G:B';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject invalid face order length', () => {
            const invalid = '3:UD:UDFBLR:W:Y:O:R:G:B';
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject wrong number of faces', () => {
            const invalid = '3:UDFBLR:W:Y:O:R:G'; // Only 5 faces
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should reject face with wrong number of stickers', () => {
            const invalid = '3:UDFBLR:WWW:Y:O:R:G:B'; // First face has 3 instead of 9
            const parsed = StatePersistence.parseStateString(invalid);
            expect(parsed).toBeNull();
        });

        it('should handle empty move history line', () => {
            const str = StatePersistence.stateToString(testState) + '\n';
            const parsed = StatePersistence.parseStateString(str);
            expect(parsed).not.toBeNull();
            expect(parsed?.moveHistory?.isEmpty()).toBe(true);
        });

        it('should handle whitespace-only move history line', () => {
            const str = StatePersistence.stateToString(testState) + '\n   ';
            const parsed = StatePersistence.parseStateString(str);
            expect(parsed).not.toBeNull();
            expect(parsed?.moveHistory?.isEmpty()).toBe(true);
        });
    });

    describe('saveState and loadState', () => {
        it('should save and load state string', () => {
            const result = StatePersistence.saveState(testState);
            expect(result).toBe(true);

            const loaded = StatePersistence.loadState();
            expect(loaded).not.toBeNull();
            expect(typeof loaded).toBe('string');
        });

        it('should return null when no state exists', () => {
            const loaded = StatePersistence.loadState();
            expect(loaded).toBeNull();
        });

        it('should not save identical state', () => {
            // Save initial state
            StatePersistence.saveState(testState);
            const firstSave = StatePersistence.loadState();

            // Try to save the same state again
            const result = StatePersistence.saveState(testState);
            expect(result).toBe(true); // Should still return true

            const secondSave = StatePersistence.loadState();
            expect(secondSave).toBe(firstSave); // Should be identical
        });

        it('should save when state changes', () => {
            // Save initial state
            StatePersistence.saveState(testState);
            const originalSave = StatePersistence.loadState();

            // Modify state
            const move = stateManager.getMoveDefinition('R');
            stateManager.applyMove(move);
            const modifiedState = stateManager.getCurrentState();

            // Save modified state
            const result = StatePersistence.saveState(modifiedState);
            expect(result).toBe(true);

            const newSave = StatePersistence.loadState();
            expect(newSave).not.toBe(originalSave);
        });
    });

    describe('validateStateString', () => {
        it('should validate correct format', () => {
            const str = StatePersistence.stateToString(testState);
            expect(StatePersistence.validateStateString(str)).toBe(true);
        });

        it('should reject invalid format', () => {
            expect(StatePersistence.validateStateString('invalid')).toBe(false);
        });
    });

    describe('clearState', () => {
        it('should clear saved state', () => {
            StatePersistence.saveState(testState);
            expect(StatePersistence.hasSavedState()).toBe(true);

            StatePersistence.clearState();
            expect(StatePersistence.hasSavedState()).toBe(false);
        });
    });

    describe('hasSavedState', () => {
        it('should return false when no state', () => {
            expect(StatePersistence.hasSavedState()).toBe(false);
        });

        it('should return true when state exists', () => {
            StatePersistence.saveState(testState);
            expect(StatePersistence.hasSavedState()).toBe(true);
        });
    });

    describe('exportState', () => {
        it('should export state as string', () => {
            const exported = StatePersistence.exportState(testState);
            expect(typeof exported).toBe('string');
            expect(exported.length).toBeGreaterThan(0);
        });
    });

    describe('integration with moves', () => {
        it('should persist state after moves', () => {
            const move = stateManager.getMoveDefinition('R');
            stateManager.applyMove(move);

            const movedState = stateManager.getCurrentState();
            const result = StatePersistence.saveState(movedState);

            expect(result).toBe(true);

            const loaded = StatePersistence.loadState();
            expect(loaded).not.toBeNull();
        });
    });

    describe('stringToState', () => {
        it('should reconstruct state from valid string', () => {
            const str = StatePersistence.stateToString(testState);
            const result = StatePersistence.stringToState(str);

            expect(result).not.toBeNull();
            expect(result?.state.cubeSize).toBe(3);
        });

        it('should preserve sticker colors during reconstruction', () => {
            // Create a state string
            const originalString = StatePersistence.stateToString(testState);

            // Reconstruct the state
            const result = StatePersistence.stringToState(originalString);

            expect(result).not.toBeNull();

            // Convert back to string and compare
            const reconstructedString = StatePersistence.stateToString(result!.state);
            expect(reconstructedString).toBe(originalString);
        });

        it('should handle scrambled cube state', () => {
            // Scramble the cube
            const move = stateManager.getMoveDefinition('R');
            stateManager.applyMove(move);
            const scrambledState = stateManager.getCurrentState();

            // Convert to string
            const stateString = StatePersistence.stateToString(scrambledState);

            // Reconstruct
            const result = StatePersistence.stringToState(stateString);

            expect(result).not.toBeNull();

            // Verify the reconstruction matches
            const reconstructedString = StatePersistence.stateToString(result!.state);
            expect(reconstructedString).toBe(stateString);
        });

        it('should return null for invalid string', () => {
            const invalid = 'invalid string';
            const reconstructed = StatePersistence.stringToState(invalid);
            expect(reconstructed).toBeNull();
        });

        it('should handle unknown color letters gracefully', () => {
            // Create a string with invalid color letters
            const validStr = StatePersistence.stateToString(testState);
            const parts = validStr.split(':');
            // Replace some colors with invalid letters
            parts[2] = 'XXXXXXXXX';
            const invalidStr = parts.join(':');

            const result = StatePersistence.stringToState(invalidStr);
            // Should still reconstruct but with some default colors
            expect(result).not.toBeNull();
        });

        it('should correctly map all face colors', () => {
            const str = StatePersistence.stateToString(testState);
            const result = StatePersistence.stringToState(str);

            expect(result).not.toBeNull();

            // Verify all cubies have valid stickers
            for (const cubie of result!.state.cubiesById.values()) {
                expect(cubie.stickers.size).toBeGreaterThan(0);

                // Check each sticker has a valid color
                for (const sticker of cubie.stickers.values()) {
                    expect(sticker.color).toBeDefined();
                    expect(['white', 'yellow', 'red', 'orange', 'blue', 'green']).toContain(
                        sticker.color
                    );
                }
            }
        });

        it('should maintain cubie count after reconstruction', () => {
            const str = StatePersistence.stateToString(testState);
            const result = StatePersistence.stringToState(str);

            expect(result).not.toBeNull();
            expect(result!.state.cubiesById.size).toBe(testState.cubiesById.size);
        });

        it('should handle different cube sizes', () => {
            const stateManager4 = new StateManager(4);
            const state4x4 = stateManager4.getCurrentState();
            const str4x4 = StatePersistence.stateToString(state4x4);
            const result = StatePersistence.stringToState(str4x4);

            expect(result).not.toBeNull();
            expect(result!.state.cubeSize).toBe(4);
        });
    });

    describe('per-size storage slots', () => {
        it('stores each size in its own slot (4x4 round-trips)', () => {
            const sm4 = new StateManager(4);
            const state4 = sm4.getCurrentState();
            expect(StatePersistence.saveState(state4)).toBe(true);
            const loaded = StatePersistence.loadState(4);
            expect(loaded).not.toBeNull();
            const roundTripped = StatePersistence.stringToState(loaded!);
            expect(roundTripped).not.toBeNull();
            expect(roundTripped!.state.cubeSize).toBe(4);
            expect(StatePersistence.stateToString(roundTripped!.state)).toBe(
                StatePersistence.stateToString(state4)
            );
        });

        it('sizes 2 and 5 keep distinct saved states', () => {
            const sm2 = new StateManager(2);
            const sm5 = new StateManager(5);
            StatePersistence.saveState(sm2.getCurrentState());
            StatePersistence.saveState(sm5.getCurrentState());

            const loaded2 = StatePersistence.loadState(2);
            const loaded5 = StatePersistence.loadState(5);
            expect(loaded2).not.toBeNull();
            expect(loaded5).not.toBeNull();
            // Each slot holds its own size.
            expect(StatePersistence.stringToState(loaded2!)!.state.cubeSize).toBe(2);
            expect(StatePersistence.stringToState(loaded5!)!.state.cubeSize).toBe(5);
            // Loading a size with no saved state returns null.
            expect(StatePersistence.loadState(6)).toBeNull();
        });

        it('size 3 reuses the legacy single key', () => {
            // Saving the default (size 3) state lands on the legacy key so a
            // prior single-slot autosave loads without migration.
            StatePersistence.saveState(testState);
            expect(localStorage.getItem('rubikCube_autoSave')).not.toBeNull();
            expect(StatePersistence.loadState()).not.toBeNull();
            expect(StatePersistence.loadState(3)).not.toBeNull();
        });

        it('hasSavedState and clearState are size-scoped', () => {
            const sm4 = new StateManager(4);
            StatePersistence.saveState(sm4.getCurrentState());
            expect(StatePersistence.hasSavedState(4)).toBe(true);
            expect(StatePersistence.hasSavedState(5)).toBe(false);
            StatePersistence.clearState(4);
            expect(StatePersistence.hasSavedState(4)).toBe(false);
        });
    });

    describe('last size accessors', () => {
        it('round-trips the last selected size', () => {
            expect(StatePersistence.saveLastSize(6)).toBe(true);
            expect(StatePersistence.loadLastSize()).toBe(6);
        });

        it('returns null when no last size is saved', () => {
            expect(StatePersistence.loadLastSize()).toBeNull();
        });

        it('rejects out-of-range or malformed stored values', () => {
            localStorage.setItem('rubikCube_lastSize', '99');
            expect(StatePersistence.loadLastSize()).toBeNull();
            localStorage.setItem('rubikCube_lastSize', 'abc');
            expect(StatePersistence.loadLastSize()).toBeNull();
        });
    });

    describe('even-size import', () => {
        it('importing a 2x2 state emits no spurious logs and round-trips', () => {
            const errorSpy = vi.spyOn(logger, 'error');
            const sm2 = new StateManager(2);
            const state2 = sm2.getCurrentState();
            const str2 = StatePersistence.stateToString(state2);

            const result = StatePersistence.stringToState(str2);
            expect(result).not.toBeNull();
            expect(result!.state.cubeSize).toBe(2);

            // No "Unknown color letter" or "Invalid position" errors from
            // non-integer virtual-center positions.
            const messages = errorSpy.mock.calls.map(c => String(c[0] ?? ''));
            expect(messages.some(m => m.includes('Unknown color letter'))).toBe(false);
            expect(messages.some(m => m.includes('Invalid position'))).toBe(false);

            // Round-trip equality.
            expect(StatePersistence.stateToString(result!.state)).toBe(str2);
            errorSpy.mockRestore();
        });

        it('importing a 4x4 scrambled state round-trips with no errors', () => {
            const errorSpy = vi.spyOn(logger, 'error');
            const sm4 = new StateManager(4);
            sm4.applyMove(sm4.getMoveDefinition('R'));
            const state4 = sm4.getCurrentState();
            const str4 = StatePersistence.stateToString(state4);

            const result = StatePersistence.stringToState(str4);
            expect(result).not.toBeNull();
            expect(result!.state.cubeSize).toBe(4);
            expect(StatePersistence.stateToString(result!.state)).toBe(str4);

            const messages = errorSpy.mock.calls.map(c => String(c[0] ?? ''));
            expect(messages.some(m => m.includes('Unknown color letter'))).toBe(false);
            errorSpy.mockRestore();
        });
    });

    describe('downloadState', () => {
        let createElementSpy: ReturnType<typeof vi.spyOn>;
        let appendChildSpy: ReturnType<typeof vi.spyOn>;
        let removeChildSpy: ReturnType<typeof vi.spyOn>;
        let clickSpy: ReturnType<typeof vi.fn>;
        let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
        let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            // Mock document methods
            createElementSpy = vi.spyOn(document, 'createElement');
            appendChildSpy = vi
                .spyOn(document.body, 'appendChild')
                .mockReturnValue(document.createElement('div'));
            removeChildSpy = vi
                .spyOn(document.body, 'removeChild')
                .mockReturnValue(document.createElement('div'));
            clickSpy = vi.fn();

            // Mock URL methods
            createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
            revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

            const mockLink = {
                href: '',
                download: '',
                click: clickSpy,
            } as any;
            createElementSpy.mockReturnValue(mockLink);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should create download link and trigger download', () => {
            StatePersistence.downloadState(testState);

            expect(createElementSpy).toHaveBeenCalledWith('a');
            expect(appendChildSpy).toHaveBeenCalled();
            expect(clickSpy).toHaveBeenCalled();
            expect(removeChildSpy).toHaveBeenCalled();
            expect(createObjectURLSpy).toHaveBeenCalled();
            expect(revokeObjectURLSpy).toHaveBeenCalled();
        });

        it('should set correct href and download attributes', () => {
            const mockLink = {
                href: '',
                download: '',
                click: clickSpy,
            } as any;
            createElementSpy.mockReturnValue(mockLink);

            StatePersistence.downloadState(testState);

            expect(mockLink.href).toBe('blob:test-url');
            expect(mockLink.download).toMatch(/rubiks-cube-state-\d+\.txt/);
        });
    });

    describe('uploadState', () => {
        let createElementSpy: ReturnType<typeof vi.spyOn>;
        let clickSpy: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            createElementSpy = vi.spyOn(document, 'createElement');
            clickSpy = vi.fn();

            const mockInput = {
                type: '',
                accept: '',
                click: clickSpy,
                onchange: null,
            } as any;
            createElementSpy.mockReturnValue(mockInput);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should create file input and trigger click', async () => {
            StatePersistence.uploadState();

            expect(createElementSpy).toHaveBeenCalledWith('input');
            expect(clickSpy).toHaveBeenCalled();
        });

        it('should set correct input attributes', async () => {
            const mockInput = {
                type: '',
                accept: '',
                click: clickSpy,
                onchange: null,
            } as any;
            createElementSpy.mockReturnValue(mockInput);

            StatePersistence.uploadState();

            expect(mockInput.type).toBe('file');
            expect(mockInput.accept).toBe('.txt,.cube');
        });

        it('should handle file selection and parsing', async () => {
            const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
            const mockEvent = {
                target: {
                    files: [mockFile],
                },
            };

            // Mock File.text() method
            mockFile.text = vi.fn().mockResolvedValue('test content');

            let changeHandler: ((e: Event) => Promise<void>) | null = null;

            const mockInput = {
                type: '',
                accept: '',
                click: clickSpy,
                set onchange(handler: (e: Event) => Promise<void>) {
                    changeHandler = handler;
                },
                get onchange() {
                    return changeHandler!;
                },
            } as any;
            createElementSpy.mockReturnValue(mockInput);

            StatePersistence.uploadState();

            // Simulate file selection
            await changeHandler!(mockEvent as any);

            expect(mockFile.text).toHaveBeenCalled();
        });
    });
});
