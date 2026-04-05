// CubeController core functionality tests
import { beforeEach, describe, expect, it } from 'vitest';

import { CubeController } from './cube-controller';
import { Face } from './cube/types';

describe('CubeController Core Functionality', () => {
    let model: CubeController;

    beforeEach(() => {
        model = new CubeController();
    });

    describe('initialization', () => {
        it('should be solved initially', () => {
            // Act
            // Assert
            expect(model.isSolved()).toBe(true);
        });
    });

    describe('reset', () => {
        it('should reset to solved state after moves', () => {
            // Act
            model.applyMove('U');
            model.applyMove('F');
            model.reset();

            // Assert
            expect(model.isSolved()).toBe(true);
        });
    });

    describe('applyMove', () => {
        it('should accept move strings', () => {
            // Act
            // Assert
            expect(() => model.applyMove('U')).not.toThrow();
        });

        it('should make cube unsolved after move', () => {
            // Act
            model.applyMove('U');

            // Assert
            expect(model.isSolved()).toBe(false);
        });

        it('should return to solved after U and U prime', () => {
            // Act
            model.applyMove('U');
            model.applyMove("U'");

            // Assert
            expect(model.isSolved()).toBe(true);
        });
    });

    describe('move history and undo/redo', () => {
        it('should track moves in history', () => {
            // Act
            model.applyMove('U');
            model.applyMove('F');

            // Assert
            const readonly = model;
            const history = readonly.getMoveHistory();
            expect(history.getCurrentMoves()).toEqual(['U', 'F']);
        });
    });

    describe('scramble', () => {
        it('should scramble the cube with default move count', () => {
            // Act
            const moves: string[] = model.scramble();

            // Assert
            expect(moves).toHaveLength(20);
            expect(model.isSolved()).toBe(false);
            expect(model.getMoveHistory().getCurrentMoves()).toHaveLength(0);
        });

        it('should scramble the cube with custom move count', () => {
            // Act
            const moves = model.scramble(10);

            // Assert
            expect(moves).toHaveLength(10);
            expect(model.isSolved()).toBe(false);
            expect(model.getMoveHistory().getCurrentMoves()).toHaveLength(0);
        });

        it('should return valid move strings', () => {
            // Act
            const moves: string[] = model.scramble(5);

            // Assert
            moves.forEach(move => {
                expect(typeof move).toBe('string');
                expect(move.length).toBeGreaterThan(0);
                expect(move.length).toBeLessThanOrEqual(2);
                expect(Object.values(Face)).toContain(move[0] as Face);
                if (move.length === 2) {
                    expect(["'", '2']).toContain(move[1]);
                }
            });
        });
    });

    describe('importState and exportState', () => {
        it('should export current state and move history', () => {
            // Arrange
            model.applyMove('U');
            model.applyMove('F');

            // Act
            const exported = model.exportState();

            // Assert
            expect(exported).toHaveProperty('state');
            expect(exported).toHaveProperty('moveHistory');
            expect(exported.moveHistory.getCurrentMoves()).toEqual(['U', 'F']);
            expect(exported.state).toBeDefined();
        });

        it('should import state with move history', () => {
            // Arrange
            model.applyMove('U');
            model.applyMove('F');
            const exported = model.exportState();

            // reset and import
            model.reset();
            model.importState(exported.state, exported.moveHistory);

            // Assert
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['U', 'F']);
            expect(model.isSolved()).toBe(false);
        });

        it('should import state without move history', () => {
            // Arrange
            model.applyMove('U');
            const exported = model.exportState();

            // reset and import without move history
            model.reset();
            model.importState(exported.state);

            // Assert
            expect(model.getMoveHistory().getCurrentMoves()).toEqual([]);
            expect(model.isSolved()).toBe(false);
        });

        it('should clear move history when importing without move history', () => {
            // Arrange
            model.applyMove('U');
            model.applyMove('F');
            const exported = model.exportState();

            // Act
            model.importState(exported.state); // no move history

            // Assert
            expect(model.getMoveHistory().getCurrentMoves()).toEqual([]);
        });
    });

    describe('auto-undo on inverse move', () => {
        it('should auto-undo when inverse move is performed (R then R prime)', () => {
            // Arrange
            model.applyMove('R');
            const historyAfterR = model.getMoveHistory();
            expect(historyAfterR.getCurrentMoves()).toEqual(['R']);

            // Act - perform inverse
            model.applyMove("R'");

            // Assert - history pointer decremented, R is "undone", R' not added
            const history = model.getMoveHistory();
            expect(history.getHistory()).toEqual(['R']);
            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getCurrentMoves()).toEqual([]);
            expect(model.isSolved()).toBe(true);
        });

        it('should auto-undo whole-cube rotation (x then x prime)', () => {
            // Arrange
            model.applyMove('x');
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['x']);

            // Act
            model.applyMove("x'");

            // Assert
            const history = model.getMoveHistory();
            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getCurrentMoves()).toEqual([]);
        });

        it('should auto-undo self-inverse double move (R2 then R2)', () => {
            // Arrange
            model.applyMove('R2');
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R2']);

            // Act
            model.applyMove('R2');

            // Assert
            const history = model.getMoveHistory();
            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getCurrentMoves()).toEqual([]);
            expect(model.isSolved()).toBe(true);
        });

        it('should NOT auto-undo when move is not the inverse of the last', () => {
            // Arrange
            model.applyMove('R');

            // Act
            model.applyMove('U');

            // Assert - both moves in history
            const history = model.getMoveHistory();
            expect(history.getCurrentMoves()).toEqual(['R', 'U']);
        });

        it('should NOT auto-undo when history is empty', () => {
            // Act
            model.applyMove('R');

            // Assert - move added normally
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R']);
        });

        it('should preserve redo stack entries when auto-undoing', () => {
            // Arrange: build R, U, F — then undo twice to get redo stack [U, F]
            model.applyMove('R');
            model.applyMove('U');
            model.applyMove('F');
            model.undo(); // currentIndex → 1, redo stack: [F]
            model.undo(); // currentIndex → 0, redo stack: [U, F]
            expect(model.getMoveHistory().getCurrentIndex()).toBe(0);
            expect(model.getMoveHistory().getRedoStack()).toEqual(['U', 'F']);

            // Act - perform inverse of last executed move (R)
            model.applyMove("R'");

            // Assert - auto-undo decrements pointer, redo stack includes R plus prior redo entries
            const history = model.getMoveHistory();
            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getRedoStack()).toEqual(['R', 'U', 'F']);
            expect(history.getHistory()).toEqual(['R', 'U', 'F']);
        });

        it('should chain: each inverse auto-undoes the previous move', () => {
            // Arrange
            model.applyMove('R');
            model.applyMove('U');
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R', 'U']);

            // Act - undo U via inverse
            model.applyMove("U'");
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R']);

            // Act - undo R via inverse
            model.applyMove("R'");
            expect(model.getMoveHistory().getCurrentMoves()).toEqual([]);
            expect(model.isSolved()).toBe(true);
        });
    });

    describe('auto-redo on matching redo stack move', () => {
        it('should auto-redo when performed move matches next redo entry', () => {
            // Arrange: R, U, F — undo twice → redo stack = [U, F]
            model.applyMove('R');
            model.applyMove('U');
            model.applyMove('F');
            model.undo();
            model.undo();
            expect(model.getMoveHistory().getCurrentIndex()).toBe(0);
            expect(model.getMoveHistory().getRedoStack()).toEqual(['U', 'F']);

            // Act - repeat next redo move
            model.applyMove('U');

            // Assert - pointer advanced, redo stack still has F, no new entry added
            const history = model.getMoveHistory();
            expect(history.getCurrentIndex()).toBe(1);
            expect(history.getCurrentMoves()).toEqual(['R', 'U']);
            expect(history.getRedoStack()).toEqual(['F']);
            expect(history.getHistory()).toEqual(['R', 'U', 'F']);
        });

        it('should NOT auto-redo when move does not match next redo entry', () => {
            // Arrange: R, U — undo once → redo stack = [U]
            model.applyMove('R');
            model.applyMove('U');
            model.undo();
            expect(model.getMoveHistory().getRedoStack()).toEqual(['U']);

            // Act - different move
            model.applyMove('F');

            // Assert - redo stack truncated, F appended as new entry
            const history = model.getMoveHistory();
            expect(history.getCurrentMoves()).toEqual(['R', 'F']);
            expect(history.getRedoStack()).toEqual([]);
        });

        it('should chain auto-redo through full redo stack', () => {
            // Arrange: R, U, F — undo all three
            model.applyMove('R');
            model.applyMove('U');
            model.applyMove('F');
            model.undo();
            model.undo();
            model.undo();
            expect(model.getMoveHistory().getCurrentIndex()).toBe(-1);
            expect(model.getMoveHistory().getRedoStack()).toEqual(['R', 'U', 'F']);

            // Act - replay all three moves
            model.applyMove('R');
            model.applyMove('U');
            model.applyMove('F');

            // Assert - history fully restored, no duplicates
            const history = model.getMoveHistory();
            expect(history.getHistory()).toEqual(['R', 'U', 'F']);
            expect(history.getCurrentIndex()).toBe(2);
            expect(history.getRedoStack()).toEqual([]);
        });

        it('auto-redo restores cube to previously seen state', () => {
            // Arrange
            model.applyMove('R');
            model.applyMove('U');
            model.undo();
            // Cube is back to just-R state
            const stateAfterR = model.getCurrentState();

            // The normal redo via CubeController.redo() should reach same state
            model.undo(); // undo R too
            model.applyMove('R'); // auto-redo R
            const currentState = model.getCurrentState();
            expect(currentState.cubeSize).toEqual(stateAfterR.cubeSize);
            expect(currentState.cubiesById).toEqual(stateAfterR.cubiesById);
            expect(currentState.cubiesByPosition).toEqual(stateAfterR.cubiesByPosition);
        });
    });
});
