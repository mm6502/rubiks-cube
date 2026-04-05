import { Application } from '@/application';
import { EventName } from '@/types';

import { createBasicInteractionAdapter } from './basic-interaction-adapter';
import { attachContainerListeners } from './initialization';

describe('basic-interaction-adapter', () => {
    afterEach(() => {
        Application.eventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('provides a no-op compatibility scaffold', () => {
        // Act
        const adapter = createBasicInteractionAdapter();

        // Assert
        expect(adapter.mapDragDirection).toBeUndefined();
        expect(adapter.inferAxisCircleNotation).toBeUndefined();
        expect(adapter.inferWholeCubeNotation).toBeUndefined();
        expect(adapter.inferFaceRotationNotation).toBeUndefined();
    });

    it('keeps basic tentative click semantics unchanged', () => {
        // Arrange
        const container = document.createElement('div');
        const cubeElement = document.createElement('div');
        const blocker = document.createElement('div');
        blocker.setAttribute('data-face', 'front');
        cubeElement.appendChild(blocker);
        container.appendChild(cubeElement);
        document.body.appendChild(container);

        const state = {
            viewType: 'basic-front',
            isHovered: false,
            pendingMoveFace: undefined as string | undefined,
            cubeElement,
            container,
            cubeContainer: container,
            styles: {},
            variant: 'front' as const,
            isTilted: false,
            isPitched: false,
            yRotation: 0,
            xRotation: 0,
            zRotation: 0,
        };

        const emitSpy = vi.spyOn(Application.eventBus, 'emit');
        attachContainerListeners(container, cubeElement, state);

        // Act
        blocker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        cubeElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        // Assert
        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: 'front',
            viewId: 'basic-front',
            tentative: true,
        });
        expect(emitSpy).toHaveBeenCalledWith(EventName.MOVE_REQUESTED, {
            moveNotation: 'front',
            viewId: 'basic-front',
            tentative: false,
        });

        container.remove();
    });
});
