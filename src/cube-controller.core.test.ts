// CubeController core functionality tests
import { getCubeInvariants } from '@/cube/core/cube-invariants';

import { CubeController } from './cube-controller';
import { CubieType } from './cube/types';

/**
 * Map of center-cubie ID to its position, used to assert that a scramble
 * actually relocates centers on large cubes. Tracking by ID (not position) is
 * required because the set of center positions is invariant across moves —
 * only which cubie occupies each position changes.
 */
function centerIdToPosition(cube: CubeController): Map<string, string> {
    const map = new Map<string, string>();
    for (const cubie of cube.getCurrentState().cubiesById.values()) {
        if (cubie.type === CubieType.CENTER) {
            map.set(cubie.id, `${cubie.position.x},${cubie.position.y},${cubie.position.z}`);
        }
    }
    return map;
}

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

            // Assert — default count is size-scaled: max(11, 20 × (3−2)) = 20.
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

        it('returns only single-layer turns that are in the move table', () => {
            // Act
            const moves: string[] = model.scramble(20);
            const defs = getCubeInvariants(3).moveDefinitions;

            // Assert — every move must exist in the table and describe a turn
            // of exactly one layer, so wide moves and whole-cube rotations
            // (which turn several layers at once) can never appear.
            moves.forEach(move => {
                const def = defs.get(move);
                expect(def).toBeDefined();
                expect(def!.layerIndices).toHaveLength(1);
            });
        });

        it('drops the bare M/E/S exception and never doubles an alias', () => {
            // A physical turn can be registered as both the bare slice (M) and
            // the numbered slice (2M). The pool keeps the numbered spelling
            // and drops the bare M/E/S exception (per the scramble design), so
            // for sizes 4+ no emitted move is a bare M/E/S, and each physical
            // (axis, layer, angle) is always spelled the same way.
            for (const size of [3, 4, 5]) {
                const cube = new CubeController(size);
                const moves = cube.scramble(40);
                const defs = getCubeInvariants(size).moveDefinitions;
                const nameByTurn = new Map<string, string>();
                moves.forEach(move => {
                    if (size > 3) {
                        // Bare M/E/S never reaches the emitted scramble.
                        expect(move).not.toMatch(/^[MES]['2]?$/);
                    }
                    const def = defs.get(move)!;
                    const key = `${def.axis}:${def.layerIndices.join(',')}:${def.angle}`;
                    const seenName = nameByTurn.get(key);
                    if (seenName !== undefined) {
                        expect(move).toBe(seenName);
                    } else {
                        nameByTurn.set(key, move);
                    }
                });
            }
        });

        it('never repeats a rotation axis on consecutive moves', () => {
            const sizes = [2, 3, 4, 5, 6, 7];
            for (const size of sizes) {
                const cube = new CubeController(size);
                const moves = cube.scramble();
                const defs = getCubeInvariants(size).moveDefinitions;
                for (let i = 1; i < moves.length; i++) {
                    const prevAxis = defs.get(moves[i - 1])!.axis;
                    const axis = defs.get(moves[i])!.axis;
                    expect(axis).not.toBe(prevAxis);
                }
            }
        });

        it('scales default scramble length with cube size (max(11, 20 × (n−2)))', () => {
            expect(new CubeController(2).scramble()).toHaveLength(11);
            expect(new CubeController(3).scramble()).toHaveLength(20);
            expect(new CubeController(4).scramble()).toHaveLength(40);
            expect(new CubeController(5).scramble()).toHaveLength(60);
            expect(new CubeController(6).scramble()).toHaveLength(80);
            expect(new CubeController(7).scramble()).toHaveLength(100);
        });

        it('honors an explicit move count regardless of size', () => {
            expect(new CubeController(7).scramble(10)).toHaveLength(10);
            expect(new CubeController(2).scramble(10)).toHaveLength(10);
        });

        it('a 4x4 scramble produces a legal, non-solved state', () => {
            const four = new CubeController(4);
            const moves = four.scramble();
            expect(moves).toHaveLength(40);
            expect(four.isSolved()).toBe(false);
            expect(four.getMoveHistory().getCurrentMoves()).toHaveLength(0);
        });

        it('produces a deterministic sequence from a seeded random source', () => {
            // mulberry32: a small deterministic PRNG with 32-bit state. The
            // same seed always yields the same [0,1) sequence, so the scramble
            // is exactly reproducible without stubbing Math.random.
            const seedable = (seed: number) => {
                let state = seed >>> 0;
                return () => {
                    state |= 0;
                    state = (state + 0x6d2b79f5) | 0;
                    let t = Math.imul(state ^ (state >>> 15), 1 | state);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            };
            const a = new CubeController(4).scramble(20, seedable(42));
            const b = new CubeController(4).scramble(20, seedable(42));
            expect(a).toEqual(b);
        });

        it('displaces at least one center cubie for sizes 4+', () => {
            for (const size of [4, 5, 7]) {
                const cube = new CubeController(size);
                const before = centerIdToPosition(cube);
                cube.scramble();
                const after = centerIdToPosition(cube);
                expect(after).not.toEqual(before);
            }
        });

        it('clears move history after scrambling', () => {
            model.applyMove('U');
            expect(model.getMoveHistory().getCurrentMoves()).toHaveLength(1);
            model.scramble(5);
            expect(model.getMoveHistory().getCurrentMoves()).toHaveLength(0);
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

        it('should NOT auto-undo 180° double move (R2 then R2)', () => {
            // With directional 180°, R2 and R2' are different moves.
            // Two consecutive R2s are both forward moves, not an undo.
            // Arrange
            model.applyMove('R2');
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R2']);

            // Act
            model.applyMove('R2');

            // Assert
            const history = model.getMoveHistory();
            expect(history.getCurrentMoves()).toEqual(['R2', 'R2']);
            expect(history.getCurrentIndex()).toBe(1);
        });

        it("should auto-undo directional 180° (R2 then R2')", () => {
            // R2' is now the inverse of R2.
            // Applying R2 then R2' should auto-undo, leaving empty history.
            // Arrange
            model.applyMove('R2');
            expect(model.getMoveHistory().getCurrentMoves()).toEqual(['R2']);

            // Act
            model.applyMove("R2'");

            // Assert
            const history = model.getMoveHistory();
            expect(history.getCurrentIndex()).toBe(-1);
            expect(history.getCurrentMoves()).toEqual([]);
            expect(model.isSolved()).toBe(true);
        });

        it("undo of U2' returns cube to solved state", () => {
            model.applyMove("U2'", false, false, true);
            expect(model.isSolved()).toBe(false);

            const didUndo = model.undo();

            expect(didUndo).toBe(true);
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

    describe('multi-size support', () => {
        it('reports the configured cube size', () => {
            expect(new CubeController().getCubeSize()).toBe(3);
            expect(new CubeController(2).getCubeSize()).toBe(2);
            expect(new CubeController(7).getCubeSize()).toBe(7);
        });

        it('parses moves against the active size (4x4 R rotates the far layer)', () => {
            const four = new CubeController(4);
            const result = four.applyMove('R');
            // For a 4x4, R is layer index 3. The moved cubies should sit on x=3
            // both before and after the move.
            expect(result).not.toBeNull();
            const movedBefore = result!.movedCubies.before;
            expect(movedBefore.length).toBeGreaterThan(0);
            expect(movedBefore.every(c => c.position.x === 3)).toBe(true);
        });

        it('whole-cube rotation on a 5x5 produces a legal state', () => {
            const five = new CubeController(5);
            five.applyMove('x');
            expect(five.isSolved()).toBe(false);
            // Whole-cube rotation permutes all 6 faces but keeps the cube legal:
            // applying the inverse x' returns to solved.
            five.applyMove("x'");
            expect(five.isSolved()).toBe(true);
        });

        it('2x2 cube stays legal under U and R moves', () => {
            const two = new CubeController(2);
            two.applyMove('U');
            two.applyMove('R');
            // 2x2 has 8 physical cubies (no centers) plus 6 virtual-center
            // cubies; moves must not throw and must unsolve the cube.
            expect(two.isSolved()).toBe(false);
            const cubies = two.getCurrentState().cubiesById;
            const physicalCount = [...cubies.values()].filter(
                c => c.type !== 'virtual_center'
            ).length;
            expect(physicalCount).toBe(8);
        });

        it('undo/redo parse at the active size', () => {
            const four = new CubeController(4);
            four.applyMove('R');
            expect(four.isSolved()).toBe(false);
            expect(four.undo()).toBe(true);
            expect(four.isSolved()).toBe(true);
            expect(four.redo()).toBe(true);
            expect(four.isSolved()).toBe(false);
        });
    });
});
