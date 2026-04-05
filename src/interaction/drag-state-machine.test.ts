import { DragStateMachine } from './drag-state-machine';

describe('DragStateMachine', () => {
    it('does not start dragging below threshold and reports tap on pointer up', () => {
        // Arrange
        const onDragStart = vi.fn();
        const machine = new DragStateMachine({ onDragStart }, { dragThresholdPx: 4 });

        // Act
        machine.onPointerDown({ pointerId: 1, clientX: 10, clientY: 10 });
        machine.onPointerMove({ pointerId: 1, clientX: 12, clientY: 12 });
        const result = machine.onPointerUp({ pointerId: 1, clientX: 12, clientY: 12 });

        // Assert
        expect(onDragStart).not.toHaveBeenCalled();
        expect(result).toEqual({ wasTap: true });
    });

    it('starts drag at threshold and emits update/end callbacks', () => {
        // Arrange
        const onDragStart = vi.fn();
        const onDragUpdate = vi.fn();
        const onDragEnd = vi.fn();
        const machine = new DragStateMachine(
            { onDragStart, onDragUpdate, onDragEnd },
            { dragThresholdPx: 4 }
        );

        // Act
        machine.onPointerDown({ pointerId: 2, clientX: 0, clientY: 0 });
        machine.onPointerMove({ pointerId: 2, clientX: 4, clientY: 0 });
        const upResult = machine.onPointerUp({ pointerId: 2, clientX: 6, clientY: 0 });

        // Assert
        expect(machine.isDragging()).toBe(false);
        expect(onDragStart).toHaveBeenCalledTimes(1);
        expect(onDragUpdate).toHaveBeenCalled();
        expect(onDragEnd).toHaveBeenCalledTimes(1);
        expect(upResult.wasTap).toBe(false);
        expect(upResult.gesture?.direction).toBe('right');
    });

    it('quantizes direction to dominant axis', () => {
        // Arrange
        const onDragUpdate = vi.fn();
        const machine = new DragStateMachine({ onDragUpdate }, { dragThresholdPx: 1 });

        // Act
        machine.onPointerDown({ pointerId: 3, clientX: 20, clientY: 20 });
        machine.onPointerMove({ pointerId: 3, clientX: 18, clientY: 30 });

        // Assert
        const gesture = onDragUpdate.mock.calls[0][0];
        expect(gesture.direction).toBe('down');
    });

    it('computes angular displacement when rotation center is provided', () => {
        // Arrange
        const onDragUpdate = vi.fn();
        const machine = new DragStateMachine({ onDragUpdate }, { dragThresholdPx: 1 });

        // Act
        machine.onPointerDown(
            { pointerId: 4, clientX: 10, clientY: 0 },
            { rotationCenter: { x: 0, y: 0 } }
        );
        machine.onPointerMove({ pointerId: 4, clientX: 0, clientY: 10 });

        // Assert
        const gesture = onDragUpdate.mock.calls[0][0];
        expect(gesture.startAngleRad).toBeCloseTo(0);
        expect(gesture.currentAngleRad).toBeCloseTo(Math.PI / 2);
        expect(gesture.angularDisplacementRad).toBeCloseTo(Math.PI / 2);
    });

    it('ignores move/up/cancel from non-active pointer ids', () => {
        // Arrange
        const onDragStart = vi.fn();
        const machine = new DragStateMachine({ onDragStart }, { dragThresholdPx: 1 });

        // Act
        machine.onPointerDown({ pointerId: 5, clientX: 0, clientY: 0 });
        const moveResult = machine.onPointerMove({ pointerId: 6, clientX: 50, clientY: 50 });
        const upResult = machine.onPointerUp({ pointerId: 6, clientX: 50, clientY: 50 });
        machine.onPointerCancel({ pointerId: 6 });
        machine.onPointerMove({ pointerId: 5, clientX: 2, clientY: 0 });

        // Assert
        expect(moveResult).toBeUndefined();
        expect(upResult).toEqual({ wasTap: false });
        expect(onDragStart).toHaveBeenCalledTimes(1);
    });
});
