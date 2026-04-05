// CubeController event handling tests
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Application } from './application';
import { CubeController } from './cube-controller';
import { EventName, MoveExecutedEvent } from './types';

describe('CubeController Event Handling', () => {
    let controller: CubeController;
    let eventBusEmitSpy: any;

    beforeEach(() => {
        controller = new CubeController();
        // Spy on the event bus emit
        eventBusEmitSpy = vi.spyOn(Application.eventBus, 'emit');
    });

    afterEach(() => {
        eventBusEmitSpy.mockRestore();
    });

    describe('moveRequested handling', () => {
        it('should execute non-tentative moves and emit moveExecuted', () => {
            // Arrange
            // (no specific setup needed beyond controller initialization)

            // Act
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: 'F',
                viewId: 'test-view',
                tentative: false,
            });

            // Assert
            expect(eventBusEmitSpy).toHaveBeenCalledWith(
                EventName.MOVE_EXECUTED,
                expect.objectContaining({
                    moveDetails: expect.objectContaining({ notation: 'F' }),
                    preState: expect.any(Object),
                    postState: expect.any(Object),
                })
            );
        });

        it('should ignore tentative moves', () => {
            // Arrange
            // (no specific setup needed beyond controller initialization)

            // Act
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: 'F',
                viewId: 'test-view',
                tentative: true,
            });

            // Assert
            expect(eventBusEmitSpy).not.toHaveBeenCalledWith(
                EventName.MOVE_EXECUTED,
                expect.anything()
            );
        });

        it('should validate and execute valid moves', () => {
            // Arrange
            // (no specific setup needed beyond controller initialization)

            // Act
            Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                moveNotation: 'F',
                viewId: 'test-view',
                tentative: false,
            });

            // Assert
            expect(controller.isSolved()).toBe(false); // F move makes it unsolved
        });
    });

    describe('performance', () => {
        it('should handle rapid tentative move requests efficiently', () => {
            // Arrange
            const startTime = Date.now();
            const eventCount = 100;

            // Act
            for (let i = 0; i < eventCount; i++) {
                Application.eventBus.emit(EventName.MOVE_REQUESTED, {
                    moveNotation: 'F',
                    viewId: 'test-view',
                    tentative: true,
                });
            }

            // Assert
            const endTime = Date.now();
            const duration = endTime - startTime;
            const avgTimePerEvent = duration / eventCount;

            // Should handle each event in less than 10ms on average
            expect(avgTimePerEvent).toBeLessThan(10);
        });
    });

    describe('undo/redo event emission', () => {
        it('should emit MOVE_EXECUTED event when undoing a move', () => {
            // Arrange: add a move
            controller.applyMove('R', false, false, true);
            eventBusEmitSpy.mockClear();

            // Act: undo the move
            const result = controller.undo();

            // Assert
            expect(result).toBe(true);
            const moveExecutedCalls = eventBusEmitSpy.mock.calls.filter(
                (call: any) => call[0] === EventName.MOVE_EXECUTED
            );
            expect(moveExecutedCalls.length).toBe(1);

            const event: MoveExecutedEvent = moveExecutedCalls[0][1];
            expect(event.moveDetails.notation).toBe("R'"); // Inverse of R
        });

        it('should not emit event when undo fails (no history)', () => {
            // Arrange
            eventBusEmitSpy.mockClear();

            // Act
            const result = controller.undo();

            // Assert
            expect(result).toBe(false);
            const moveExecutedCalls = eventBusEmitSpy.mock.calls.filter(
                (call: any) => call[0] === EventName.MOVE_EXECUTED
            );
            expect(moveExecutedCalls.length).toBe(0);
        });

        it('should emit MOVE_EXECUTED event when redoing a move', () => {
            // Arrange: add and undo a move
            controller.applyMove('U', false, false, true);
            controller.undo();
            eventBusEmitSpy.mockClear();

            // Act: redo the move
            const result = controller.redo();

            // Assert
            expect(result).toBe(true);
            const moveExecutedCalls = eventBusEmitSpy.mock.calls.filter(
                (call: any) => call[0] === EventName.MOVE_EXECUTED
            );
            expect(moveExecutedCalls.length).toBe(1);

            const event: MoveExecutedEvent = moveExecutedCalls[0][1];
            expect(event.moveDetails.notation).toBe('U'); // Original move
        });

        it('should not emit event when redo fails (no redo stack)', () => {
            // Arrange
            eventBusEmitSpy.mockClear();

            // Act
            const result = controller.redo();

            // Assert
            expect(result).toBe(false);
            const moveExecutedCalls = eventBusEmitSpy.mock.calls.filter(
                (call: any) => call[0] === EventName.MOVE_EXECUTED
            );
            expect(moveExecutedCalls.length).toBe(0);
        });
    });

    describe('getMoveHistory()', () => {
        it('should return the move history object', () => {
            // Arrange
            // (no specific setup needed beyond controller initialization)

            // Act
            const history = controller.getMoveHistory();

            // Assert
            expect(history).toBeDefined();
            expect(typeof history.addMove).toBe('function');
            expect(typeof history.undo).toBe('function');
            expect(typeof history.redo).toBe('function');
        });

        it('should return the same instance', () => {
            // Arrange
            // (no specific setup needed beyond controller initialization)

            // Act
            const history1 = controller.getMoveHistory();
            const history2 = controller.getMoveHistory();

            // Assert
            expect(history1).toBe(history2);
        });

        it('should reflect current state', () => {
            // Arrange
            const history = controller.getMoveHistory();

            // Act
            controller.applyMove('R', false, false, true);
            controller.applyMove('U', false, false, true);

            // Assert
            expect(history.getHistory()).toEqual(['R', 'U']);
            expect(history.getCurrentIndex()).toBe(1);
        });
    });
});
