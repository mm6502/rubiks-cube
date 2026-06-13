// Initialization for Basic 2 view — builds cube DOM with blockers only (no face divs)
import { Application } from '@/application';
import { ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { EventName } from '@/types';
import { getDefaultVectors } from '@/views/basic/navigation';

import * as cubieRendering from './cubie-rendering';
import type { BasicVariant, BasicViewInternalData } from './basic-2-view';
import { initializeBlockers, updateSize } from './rendering';

/**
 * Builds the full DOM structure for a Basic 2 cube view and returns the
 * populated internal state object.
 *
 * Unlike the static Basic view, Basic 2 uses a per-cubie DOM: each surface
 * cubie is its own `div.cubie` in 3D space with sticker-face children.
 * There are no face divs or sticker grids.
 */
export function initialize(
    container: HTMLElement,
    model: ReadOnlyCubeModel,
    styles: Record<string, string>,
    variant: BasicVariant,
    viewType: string,
    onStickerSelected: (id: StickerId) => void
): BasicViewInternalData {
    container.tabIndex = 0;

    const cubeElement = buildCubeElement(model, styles, viewType, onStickerSelected);

    let cubeContainer = container.querySelector('.cube-container') as HTMLElement;
    if (!cubeContainer) {
        cubeContainer = document.createElement('div');
        cubeContainer.className = styles['cube-container'] ?? '';
        container.appendChild(cubeContainer);
    }

    const cubeWrapper = document.createElement('div');
    cubeWrapper.className = styles['cube-wrapper'] ?? '';
    cubeWrapper.appendChild(cubeElement);
    cubeContainer.appendChild(cubeWrapper);

    // Build the state object before attaching remaining event listeners
    const defaultVectors = getDefaultVectors(variant);
    const state: BasicViewInternalData = {
        model,
        container,
        cubeElement,
        cubeContainer,
        styles,
        stickerClass: styles['cubie-face'] ?? 'cubie-face',
        highlightedClass: styles['highlighted'] ?? 'highlighted',
        variant,
        viewType,
        viewRight: defaultVectors.viewRight,
        viewUp: defaultVectors.viewUp,
        viewForward: defaultVectors.viewForward,
        isTilted: false,
        isPitched: false,
        isHovered: false,
        layoutMode: 'floating' as const,
        currentSelected: undefined,
    };

    attachContainerListeners(container, cubeElement, state);

    // Set initial size (also initializes cubies)
    updateSize(state);
    if (!cubeElement.style.width) {
        cubieRendering.initializeCubies(state, 300);
        initializeBlockers(state, 300);
    }

    return state;
}

/**
 * Removes the cube DOM element from the document.
 */
export function destroy(state: BasicViewInternalData): void {
    state.cubeElement?.remove();
}

/**
 * Build the cube element with blocker divs only (no face divs for Basic 2).
 */
function buildCubeElement(
    model: ReadOnlyCubeModel,
    styles: Record<string, string>,
    _viewType: string,
    _onStickerSelected: (id: StickerId) => void
): HTMLElement {
    const cubeElement = document.createElement('div');
    cubeElement.className = styles['cube'] ?? '';
    cubeElement.setAttribute('data-view-type', _viewType);

    // Create blocker divs (unchanged from basic view)
    const cubeSize = model.getCurrentState().cubeSize ?? 3;
    const halfSize = 150; // Will be updated by initializeBlockers

    const blockerPositions = [
        { face: 'front', transform: `translateZ(${halfSize}px)` },
        { face: 'back', transform: `rotateY(180deg) translateZ(${halfSize}px)` },
        { face: 'right', transform: `rotateY(90deg) translateZ(${halfSize}px)` },
        { face: 'left', transform: `rotateY(-90deg) translateZ(${halfSize}px)` },
        { face: 'top', transform: `rotateX(90deg) translateZ(${halfSize}px)` },
        { face: 'bottom', transform: `rotateX(-90deg) translateZ(${halfSize}px)` },
    ];

    blockerPositions.forEach(({ face, transform }) => {
        const blocker = document.createElement('div');
        blocker.className = `${styles['cube-blocker'] ?? ''} ${styles[face] ?? ''}`;
        blocker.style.transform = transform;
        blocker.style.width = `${cubeSize * 100}px`;
        blocker.style.height = `${cubeSize * 100}px`;
        blocker.style.background = 'var(--color-domain-cube-interior)';
        blocker.style.pointerEvents = 'none';
        cubeElement.appendChild(blocker);
    });

    return cubeElement;
}

/**
 * Emits a HIGHLIGHT_CHANGED event with the sticker's id for the given view.
 */
export function handleStickerMouseOver(element: HTMLElement, viewType: string): void {
    const stickerId = element.getAttribute('data-sticker-id');
    Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, { stickerId, viewId: viewType });
}

/**
 * Emits a HIGHLIGHT_CHANGED event to clear the highlight for the given view.
 */
export function handleStickerMouseOut(viewType: string): void {
    Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
        stickerId: undefined,
        viewId: viewType,
    });
}

/**
 * Attaches mouse/touch event listeners to the container and cube element.
 */
function attachContainerListeners(
    _container: HTMLElement,
    cubeElement: HTMLElement,
    state: BasicViewInternalData
): void {
    // Mouseover/out for highlighting
    cubeElement.addEventListener('mouseover', (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const stickerEl = target.closest('[data-sticker-id]');
        if (stickerEl) {
            handleStickerMouseOver(stickerEl as HTMLElement, state.viewType);
        }
    });

    cubeElement.addEventListener('mouseout', (event: MouseEvent) => {
        const relatedTarget = event.relatedTarget as HTMLElement;
        if (!cubeElement.contains(relatedTarget)) {
            handleStickerMouseOut(state.viewType);
        }
    });
}
