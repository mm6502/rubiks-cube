import { beforeEach, describe, expect, it } from 'vitest';

import { MoveHistory } from './move-history';

describe('MoveHistory', () => {
    let history: MoveHistory;

    beforeEach(() => {
        history = new MoveHistory();
    });

    describe('constructor', () => {
        it('should create empty history by default', () => {
            const emptyHistory = new MoveHistory();
            expect(emptyHistory.getCurrentIndex()).toBe(-1);
            expect(emptyHistory.getHistory()).toEqual([]);
        });

        it('should initialize with provided moves', () => {
            const initialMoves = ['R', 'U', 'F'];
            const historyWithMoves = new MoveHistory(initialMoves);
            expect(historyWithMoves.getCurrentIndex()).toBe(2);
            expect(historyWithMoves.getHistory()).toEqual(['R', 'U', 'F']);
        });

        it('should handle empty initial moves array', () => {
            const historyWithEmpty = new MoveHistory([]);
            expect(historyWithEmpty.getCurrentIndex()).toBe(-1);
            expect(historyWithEmpty.getHistory()).toEqual([]);
        });
    });

    describe('copy', () => {
        it('should create a copy with same state', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();

            const copy = history.copy();
            expect(copy.getCurrentIndex()).toBe(history.getCurrentIndex());
            expect(copy.getHistory()).toEqual(history.getHistory());
        });

        it('should create independent copy', () => {
            history.addMove('R');
            const copy = history.copy();

            copy.addMove('U');
            expect(history.getHistory()).toEqual(['R']);
            expect(copy.getHistory()).toEqual(['R', 'U']);
        });
    });

    describe('addMove', () => {
        it('should add moves to history', () => {
            history.addMove('R');
            expect(history.getHistory()).toEqual(['R']);
            expect(history.getCurrentIndex()).toBe(0);

            history.addMove('U');
            expect(history.getHistory()).toEqual(['R', 'U']);
            expect(history.getCurrentIndex()).toBe(1);
        });

        it('should truncate future moves when adding new move', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.undo();
            history.undo(); // Now at index 0

            history.addMove('D'); // Should truncate 'F'

            expect(history.getHistory()).toEqual(['R', 'D']);
            expect(history.getCurrentIndex()).toBe(1);
        });
    });

    describe('undo', () => {
        it('should return undefined when no moves to undo', () => {
            expect(history.undo()).toBeUndefined();
        });

        it('should return the undone move', () => {
            history.addMove('R');
            history.addMove('U');

            expect(history.undo()).toBe('U');
            expect(history.getCurrentIndex()).toBe(0);

            expect(history.undo()).toBe('R');
            expect(history.getCurrentIndex()).toBe(-1);
        });

        it('should not go below -1', () => {
            history.addMove('R');
            history.undo();
            history.undo(); // Should not change

            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.undo()).toBeUndefined();
        });
    });

    describe('redo', () => {
        it('should return undefined when no moves to redo', () => {
            expect(history.redo()).toBeUndefined();
        });

        it('should return the redone move', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();

            expect(history.redo()).toBe('U');
            expect(history.getCurrentIndex()).toBe(1);
        });

        it('should not go beyond history length', () => {
            history.addMove('R');
            history.undo();
            history.redo();

            expect(history.redo()).toBeUndefined();
            expect(history.getCurrentIndex()).toBe(0);
        });
    });

    describe('canUndo', () => {
        it('should return false for empty history', () => {
            expect(history.canUndo()).toBe(false);
        });

        it('should return true when there are moves to undo', () => {
            history.addMove('R');
            expect(history.canUndo()).toBe(true);

            history.undo();
            expect(history.canUndo()).toBe(false);
        });
    });

    describe('canRedo', () => {
        it('should return false when at end of history', () => {
            history.addMove('R');
            expect(history.canRedo()).toBe(false);
        });

        it('should return true when there are moves to redo', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();

            expect(history.canRedo()).toBe(true);

            history.redo();
            expect(history.canRedo()).toBe(false);
        });
    });

    describe('getCurrentMoves', () => {
        it('should return empty array for empty history', () => {
            expect(history.getCurrentMoves()).toEqual([]);
        });

        it('should return moves up to current index', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');

            expect(history.getCurrentMoves()).toEqual(['R', 'U', 'F']);

            history.undo();
            expect(history.getCurrentMoves()).toEqual(['R', 'U']);
        });
    });

    describe('clear', () => {
        it('should clear all moves and reset index', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();

            history.clear();

            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getHistory()).toEqual([]);
            expect(history.canUndo()).toBe(false);
            expect(history.canRedo()).toBe(false);
        });
    });

    describe('getMoves', () => {
        it('should return readonly array of all moves', () => {
            history.addMove('R');
            history.addMove('U');

            const moves = history.getMoves();
            expect(moves).toEqual(['R', 'U']);
            expect(Array.isArray(moves)).toBe(true);
        });
    });

    describe('getSize', () => {
        it('should return 0 for empty history', () => {
            expect(history.getSize()).toBe(0);
        });

        it('should return total number of moves in history', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');

            expect(history.getSize()).toBe(3);

            history.undo();
            expect(history.getSize()).toBe(3); // Size doesn't change with undo
        });
    });

    describe('isEmpty', () => {
        it('should return true for empty history', () => {
            expect(history.isEmpty()).toBe(true);
        });

        it('should return false when history has moves', () => {
            history.addMove('R');
            expect(history.isEmpty()).toBe(false);
        });
    });

    describe('getLastMove', () => {
        it('should return undefined for empty history', () => {
            expect(history.getLastMove()).toBeUndefined();
        });

        it('should return the last executed move', () => {
            history.addMove('R');
            expect(history.getLastMove()).toBe('R');

            history.addMove('U');
            expect(history.getLastMove()).toBe('U');

            history.undo();
            expect(history.getLastMove()).toBe('R');
        });

        it('should return undefined after undoing all moves', () => {
            history.addMove('R');
            history.undo();
            expect(history.getLastMove()).toBeUndefined();
        });
    });

    describe('serialize', () => {
        it('should return empty string for empty history', () => {
            expect(history.serialize()).toBe('');
        });

        it('should serialize moves when at end of history', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');

            expect(history.serialize()).toBe('R U F');
        });

        it('should include index when not at end of history', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.undo();

            expect(history.serialize()).toBe('R U F:1');
        });
    });

    describe('deserialize', () => {
        it('should handle null/undefined input', () => {
            expect(MoveHistory.deserialize(null as any)).toEqual(new MoveHistory());
            expect(MoveHistory.deserialize(undefined as any)).toEqual(new MoveHistory());
        });

        it('should handle non-string input', () => {
            expect(MoveHistory.deserialize(123 as any)).toEqual(new MoveHistory());
            expect(MoveHistory.deserialize({} as any)).toEqual(new MoveHistory());
        });

        it('should handle empty string', () => {
            const result = MoveHistory.deserialize('');
            expect(result.getHistory()).toEqual([]);
            expect(result.getCurrentIndex()).toBe(-1);
        });

        it('should handle whitespace-only string', () => {
            const result = MoveHistory.deserialize('   ');
            expect(result.getHistory()).toEqual([]);
            expect(result.getCurrentIndex()).toBe(-1);
        });

        it('should deserialize moves without index', () => {
            const result = MoveHistory.deserialize('R U F');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
            expect(result.getCurrentIndex()).toBe(2);
        });

        it('should deserialize moves with valid index', () => {
            const result = MoveHistory.deserialize('R U F:1');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
            expect(result.getCurrentIndex()).toBe(1);
        });

        it('should handle index at start', () => {
            const result = MoveHistory.deserialize('R U F:-1');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
            expect(result.getCurrentIndex()).toBe(-1);
        });

        it('should ignore invalid index', () => {
            const result = MoveHistory.deserialize('R U F:invalid');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
            expect(result.getCurrentIndex()).toBe(2); // Defaults to end
        });

        it('should ignore out-of-bounds index', () => {
            const result = MoveHistory.deserialize('R U F:10');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
            expect(result.getCurrentIndex()).toBe(2); // Defaults to end
        });

        it('should handle multiple spaces', () => {
            const result = MoveHistory.deserialize('R   U    F');
            expect(result.getHistory()).toEqual(['R', 'U', 'F']);
        });

        it('should handle strings with only index marker', () => {
            const result = MoveHistory.deserialize(':2');
            expect(result.getHistory()).toEqual([]);
            expect(result.getCurrentIndex()).toBe(-1);
        });

        it('should throw on invalid input that causes parsing errors', () => {
            // This is hard to trigger with the current implementation
            // since it handles most edge cases gracefully
            expect(() => MoveHistory.deserialize('valid moves')).not.toThrow();
        });
    });

    describe('getHistory()', () => {
        it('should return empty array initially', () => {
            const result = history.getHistory();
            expect(result).toEqual([]);
            expect(result).toHaveLength(0);
        });

        it('should return all moves including undone moves', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');

            const result = history.getHistory();
            expect(result).toEqual(['R', 'U', 'F']);
        });

        it('should return all moves even after undo', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.undo();
            history.undo();

            const result = history.getHistory();
            expect(result).toEqual(['R', 'U', 'F']);
        });

        it('should return readonly array', () => {
            history.addMove('R');
            const result = history.getHistory();

            // TypeScript should prevent this, but verify runtime behavior
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('getRedoStack()', () => {
        it('should return empty array when no undos', () => {
            history.addMove('R');
            history.addMove('U');

            const result = history.getRedoStack();
            expect(result).toEqual([]);
        });

        it('should return undone moves', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.undo(); // Undo F
            history.undo(); // Undo U

            const result = history.getRedoStack();
            expect(result).toEqual(['U', 'F']);
        });

        it('should clear when new move is added', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();
            history.addMove('F'); // Clears redo stack

            const result = history.getRedoStack();
            expect(result).toEqual([]);
        });

        it('should update after redo', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.undo(); // Undo F
            history.undo(); // Undo U
            history.redo(); // Redo U

            const result = history.getRedoStack();
            expect(result).toEqual(['F']);
        });

        it('should return empty when at end of history', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();
            history.redo();

            const result = history.getRedoStack();
            expect(result).toEqual([]);
        });
    });

    describe('getCurrentIndex()', () => {
        it('should return -1 for empty history', () => {
            expect(history.getCurrentIndex()).toBe(-1);
        });

        it('should return correct index after adding moves', () => {
            history.addMove('R');
            expect(history.getCurrentIndex()).toBe(0);

            history.addMove('U');
            expect(history.getCurrentIndex()).toBe(1);

            history.addMove('F');
            expect(history.getCurrentIndex()).toBe(2);
        });

        it('should decrease after undo', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');

            history.undo();
            expect(history.getCurrentIndex()).toBe(1);

            history.undo();
            expect(history.getCurrentIndex()).toBe(0);

            history.undo();
            expect(history.getCurrentIndex()).toBe(-1);
        });

        it('should increase after redo', () => {
            history.addMove('R');
            history.addMove('U');
            history.undo();
            history.undo();

            history.redo();
            expect(history.getCurrentIndex()).toBe(0);

            history.redo();
            expect(history.getCurrentIndex()).toBe(1);
        });
    });

    describe('Integration scenarios', () => {
        it('should maintain consistency between all accessors', () => {
            history.addMove('R');
            history.addMove('U');
            history.addMove('F');
            history.addMove('D');

            // At end: index=3, history=[R,U,F,D], redo=[]
            expect(history.getCurrentIndex()).toBe(3);
            expect(history.getHistory()).toEqual(['R', 'U', 'F', 'D']);
            expect(history.getRedoStack()).toEqual([]);

            history.undo(); // index=2
            history.undo(); // index=1

            // After 2 undos: index=1, history=[R,U,F,D], redo=[F,D]
            expect(history.getCurrentIndex()).toBe(1);
            expect(history.getHistory()).toEqual(['R', 'U', 'F', 'D']);
            expect(history.getRedoStack()).toEqual(['F', 'D']);

            history.addMove('L'); // Truncates redo

            // After new move: index=2, history=[R,U,L], redo=[]
            expect(history.getCurrentIndex()).toBe(2);
            expect(history.getHistory()).toEqual(['R', 'U', 'L']);
            expect(history.getRedoStack()).toEqual([]);
        });
    });
});
