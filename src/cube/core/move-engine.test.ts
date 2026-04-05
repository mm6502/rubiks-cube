import { beforeEach, describe, expect, it } from 'vitest';

import { MoveEngine } from '@/cube/core/move-engine';
import { StateManager } from '@/cube/core/state-manager';
import { CubieId, Face } from '@/cube/types';
import { MoveDefinition, MoveResult } from '@/cube/types/move';

const assertCubiesRearranged = (result: MoveResult, expectedCount: number): void => {
    expect(result.movedCubies.before.length).toBe(expectedCount);
    expect(result.movedCubies.after.length).toBe(expectedCount);

    const beforeIds = result.movedCubies.before.map(p => p.id).sort();
    const afterIds = result.movedCubies.after.map(p => p.id).sort();
    expect(afterIds).toEqual(beforeIds);

    const anyChanged = result.movedCubies.before.some(beforeCubie => {
        const matching = result.movedCubies.after.find(p => p.id === beforeCubie.id);
        if (!matching) {
            return false;
        }

        return (
            matching.position.x !== beforeCubie.position.x ||
            matching.position.y !== beforeCubie.position.y ||
            matching.position.z !== beforeCubie.position.z
        );
    });

    expect(anyChanged).toBe(true);
};

describe('MoveEngine', () => {
    let moveEngine: MoveEngine;
    let stateManager: StateManager;
    let moveDefinitions: Map<string, MoveDefinition>;

    beforeEach(() => {
        stateManager = new StateManager(3);
        moveEngine = new MoveEngine(stateManager.getOriginalState());
        moveDefinitions = stateManager.getInvariants().moveDefinitions;
    });

    describe('constructor', () => {
        it('should create move engine for valid cube sizes', () => {
            // Arrange
            const sm2 = new StateManager(2);
            const sm3 = new StateManager(3);
            const sm4 = new StateManager(4);

            // Act & Assert
            expect(() => new MoveEngine(sm2.getOriginalState())).not.toThrow();
            expect(() => new MoveEngine(sm3.getOriginalState())).not.toThrow();
            expect(() => new MoveEngine(sm4.getOriginalState())).not.toThrow();
        });
    });

    describe('executeMove', () => {
        it('should execute F move', () => {
            // Arrange
            const move = moveDefinitions.get('F');

            // Act
            const result = moveEngine.executeMove(move!, stateManager.getCurrentState());

            // Assert
            assertCubiesRearranged(result, 9);
            stateManager.applyMoveResult(result);
        });

        it('should execute U move', () => {
            // Arrange
            const move = moveDefinitions.get('U');

            // Act
            const result = moveEngine.executeMove(move!, stateManager.getCurrentState());

            // Assert
            assertCubiesRearranged(result, 9);
            stateManager.applyMoveResult(result);
        });

        it('should execute counter-clockwise moves', () => {
            // Arrange
            const clockwise = moveDefinitions.get('R');
            const counterClockwise = moveDefinitions.get("R'");

            // Act
            const result1 = moveEngine.executeMove(clockwise!, stateManager.getCurrentState());
            stateManager.applyMoveResult(result1);

            const result2 = moveEngine.executeMove(
                counterClockwise!,
                stateManager.getCurrentState()
            );
            stateManager.applyMoveResult(result2);

            // Assert
            expect(stateManager.isSolved()).toBeTruthy();
        });

        it('should execute moves without throwing on valid targets', () => {
            // Arrange
            const move = moveDefinitions.get('F');

            // Act & Assert
            expect(() =>
                moveEngine.executeMove(move!, stateManager.getCurrentState())
            ).not.toThrow();
        });
    });

    describe('executeMoves', () => {
        it('should execute multiple moves in sequence', () => {
            // Arrange
            const moves: MoveDefinition[] = ['F', 'R', 'U'].map(
                notation => moveDefinitions.get(notation)!
            );
            const initialState = stateManager.getCurrentState();

            // Act
            stateManager.executeMoves(moves);

            // Assert
            const finalState = stateManager.getCurrentState();
            expect(finalState).not.toBe(initialState);
        });
    });

    describe('rotation logic', () => {
        it('should correctly execute axis rotations', () => {
            // Arrange
            // (no specific setup needed beyond test initialization)

            // Act & Assert
            expect(() =>
                moveEngine.executeMove(moveDefinitions.get('F')!, stateManager.getCurrentState())
            ).not.toThrow();
            expect(() =>
                moveEngine.executeMove(moveDefinitions.get('U')!, stateManager.getCurrentState())
            ).not.toThrow();
            expect(() =>
                moveEngine.executeMove(moveDefinitions.get('L')!, stateManager.getCurrentState())
            ).not.toThrow();
        });

        it('should keep virtual centers fixed on face turns', () => {
            // Arrange
            const frontId = 'virtual_center_F' as CubieId;
            const initialState = stateManager.getCurrentState();
            const originalFront = initialState.cubiesById.get(frontId);
            if (!originalFront) {
                throw new Error('Missing virtual center F');
            }
            const originalPosition = { ...originalFront.position };

            // Act
            const move = moveDefinitions.get('F')!;
            const result = moveEngine.executeMove(move, initialState);
            stateManager.applyMoveResult(result);

            const updatedFront = stateManager.getCurrentState().cubiesById.get(frontId);
            if (!updatedFront) {
                throw new Error('Missing virtual center F after move');
            }

            expect(updatedFront.position).toEqual(originalPosition);
        });

        it('should rotate virtual centers on full cube rotations', () => {
            // Arrange
            const frontId = 'virtual_center_F' as CubieId;
            const move = moveDefinitions.get('x')!;
            const initialState = stateManager.getCurrentState();

            // Act
            const result = moveEngine.executeMove(move, initialState);
            stateManager.applyMoveResult(result);

            // Assert
            const updatedFront = stateManager.getCurrentState().cubiesById.get(frontId);
            if (!updatedFront) {
                throw new Error('Missing virtual center F after cube rotation');
            }

            expect(updatedFront.position).toEqual({ x: 1, y: 2, z: 1 });
        });

        it('should rotate up virtual center onto right face with z rotation', () => {
            // Arrange
            const upId = 'virtual_center_U' as CubieId;
            const move = moveDefinitions.get('z')!;
            const initialState = stateManager.getCurrentState();
            const upBefore = initialState.cubiesById.get(upId);
            if (!upBefore) {
                throw new Error('Missing virtual center U before rotation');
            }
            expect(upBefore.position).toEqual({ x: 1, y: 2, z: 1 });

            // Act
            const result = moveEngine.executeMove(move, initialState);
            stateManager.applyMoveResult(result);

            // Assert
            const updatedUp = stateManager.getCurrentState().cubiesById.get(upId);
            if (!updatedUp) {
                throw new Error('Missing virtual center U after rotation');
            }

            expect(updatedUp.position).toEqual({ x: 2, y: 1, z: 1 });

            // check that U face moved to R face
            const [firstEntry] = Array.from(updatedUp.stickers.entries());
            if (!firstEntry) {
                throw new Error('Virtual center U should have a sticker');
            }
            const [, sticker] = firstEntry;
            const faceAfterRotation = sticker.currentFace;
            expect(faceAfterRotation).toBe(Face.R);
        });
    });
});
