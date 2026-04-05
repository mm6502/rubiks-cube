import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeController } from '@/cube-controller';
import { MoveExecutedEvent } from '@/types';

import { BasicView } from './basic-view';

// This suite exercises the view-level move handling logic which used to live
// inside the selector helper.  The method now belongs on BasicView itself
// and is used by the higher-level view manager when MOVE_EXECUTED events occur.

describe('BasicView move handling', () => {
    let view: BasicView;
    let controller: CubeController;
    let container: HTMLElement;

    beforeEach(() => {
        controller = new CubeController();
        view = new BasicView({ viewType: 'basic-front' });
        container = document.createElement('div');
        view.create(container, controller);
    });

    it('updates selectively when moved cubies are present, including same-origin events', () => {
        // Arrange
        const spySelective = vi.spyOn(view, 'updateSelective');
        const spyFull = vi.spyOn(view, 'update');
        const event: MoveExecutedEvent = {
            moveDetails: { notation: 'R', movedCubies: { before: [], after: [] } },
            preState: controller.getCurrentState(),
            postState: controller.getCurrentState(),
        };

        // Act
        view.handleMoveExecuted(event);

        // Assert
        expect(spySelective).toHaveBeenCalledWith(event);
        expect(spyFull).not.toHaveBeenCalled();
    });

    it('calls updateSelective when movedCubies are provided', () => {
        // Arrange
        const spySelective = vi.spyOn(view, 'updateSelective');
        const spyFull = vi.spyOn(view, 'update');
        const event: MoveExecutedEvent = {
            moveDetails: { notation: 'U', movedCubies: { before: [], after: [] } },
            preState: controller.getCurrentState(),
            postState: controller.getCurrentState(),
        };

        // Act
        view.handleMoveExecuted(event);

        // Assert
        expect(spySelective).toHaveBeenCalledWith(event);
        expect(spyFull).not.toHaveBeenCalled();
    });

    it('falls back to full update when movedCubies is missing', () => {
        // Arrange
        const spySelective = vi.spyOn(view, 'updateSelective');
        const spyFull = vi.spyOn(view, 'update');
        const event: MoveExecutedEvent = {
            // omit movedCubies
            moveDetails: { notation: 'D' } as any,
            preState: controller.getCurrentState(),
            postState: controller.getCurrentState(),
        };

        // Act
        view.handleMoveExecuted(event);

        // Assert
        expect(spySelective).not.toHaveBeenCalled();
        expect(spyFull).toHaveBeenCalledWith(controller);
    });
});
