import { Application } from '@/application';
import { Face, ReadOnlyCubeModel, StickerId, resolveCubeColor } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils';
import { EventName } from '@/types';

import * as navigation from './navigation';
import * as rendering from './rendering';
import type { BasicVariant, BasicViewInternalData } from './types';

/**
 * Builds the full DOM structure for a basic cube view, wires up all event
 * listeners, and returns the populated internal state object.
 *
 * Event listeners close over the returned state object, so mutations applied
 * to it after this function returns are immediately visible to those handlers.
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

    // Build the state object before attaching remaining event listeners so that
    // the closures below always reference the canonical state instance.
    const defaultVectors = navigation.getDefaultVectors(variant);
    const state: BasicViewInternalData = {
        model,
        container,
        cubeElement,
        cubeContainer,
        styles,
        stickerClass: styles['sticker'] ?? 'sticker',
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

    // Render initial face labels
    rendering.updateFaceLabels(state);

    attachContainerListeners(container, cubeElement, state);

    // Set initial size; fall back to a default if the container is not yet laid out.
    rendering.updateSize(state);
    if (!cubeElement.style.width) {
        rendering.initializeFaces(state, 300);
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
 * Emits a HIGHLIGHT_CHANGED event with the sticker's id for the given view.
 * Called by the mouseover listener on each sticker element.
 *
 * @internal Exported for testing.
 */
export function handleStickerMouseOver(element: HTMLElement, viewType: string): void {
    const stickerId = element.getAttribute('data-sticker-id');
    Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, { stickerId, viewId: viewType });
}

/**
 * Emits a HIGHLIGHT_CHANGED event to clear the highlight for the given view.
 * Called by the mouseout listener on each sticker element.
 *
 * @internal Exported for testing.
 */
export function handleStickerMouseOut(viewType: string): void {
    Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
        stickerId: undefined,
        viewId: viewType,
    });
}

/**
 * Attaches mouseover, mouseout, and click listeners to a single sticker element.
 *
 * @internal Exported for testing.
 */
export function attachStickerListeners(
    stickerElement: HTMLElement,
    viewType: string,
    onStickerSelected: (id: StickerId) => void
): void {
    stickerElement.addEventListener('mouseover', e => {
        handleStickerMouseOver(e.currentTarget as HTMLElement, viewType);
    });
    stickerElement.addEventListener('mouseout', () => {
        handleStickerMouseOut(viewType);
    });
    stickerElement.addEventListener('click', e => {
        const target = e.currentTarget as HTMLElement;
        const stickerId = target.getAttribute('data-sticker-id') as StickerId;
        onStickerSelected(stickerId!);
    });
}

/**
 * Builds a single face's blocker element and face div populated with 9 sticker elements.
 *
 * @internal Exported for testing.
 */
export function buildCubeFace(
    face: Face,
    faceName: string,
    model: ReadOnlyCubeModel,
    styles: Record<string, string>,
    viewType: string,
    onStickerSelected: (id: StickerId) => void
): { blocker: HTMLElement; faceDiv: HTMLElement } {
    const blocker = document.createElement('div');
    blocker.className = `${styles['cube-blocker'] ?? ''} ${styles[faceName] ?? ''}`;
    blocker.setAttribute('data-face', faceName);

    const faceDiv = document.createElement('div');
    faceDiv.className = `${styles.face ?? ''} ${styles[faceName] ?? ''}`;
    faceDiv.setAttribute('data-basic-face', face);

    const cubeState = model.getCurrentState();
    const cubeSize = cubeState.cubeSize;
    for (let i = 0; i < cubeSize * cubeSize; i++) {
        const sticker = CubeStateUtils.getStickerAt(cubeState, face, i);
        if (!sticker) continue;

        const stickerElement = document.createElement('div');
        stickerElement.className = styles.sticker ?? '';
        stickerElement.setAttribute('data-sticker-id', sticker.id);
        stickerElement.setAttribute('data-basic-face', face);
        stickerElement.setAttribute('data-basic-pos', String(i));
        stickerElement.style.backgroundColor = resolveCubeColor(sticker.color);

        attachStickerListeners(stickerElement, viewType, onStickerSelected);
        faceDiv.appendChild(stickerElement);
    }

    return { blocker, faceDiv };
}

/**
 * Builds the entire cube element with all 6 faces and their sticker DOM elements.
 *
 * @internal Exported for testing.
 */
export function buildCubeElement(
    model: ReadOnlyCubeModel,
    styles: Record<string, string>,
    viewType: string,
    onStickerSelected: (id: StickerId) => void
): HTMLElement {
    const cubeElement = document.createElement('div');
    cubeElement.className = styles.cube ?? '';
    cubeElement.id = viewType;

    const faces: Face[] = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
    const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];

    faces.forEach((face, idx) => {
        const { blocker, faceDiv } = buildCubeFace(
            face,
            faceNames[idx],
            model,
            styles,
            viewType,
            onStickerSelected
        );
        cubeElement.appendChild(blocker);
        cubeElement.appendChild(faceDiv);
    });

    return cubeElement;
}

/**
 * Attaches container-level and cube-level event listeners:
 * mouseenter/mouseleave for hover state and focus, mousedown/mouseup for move
 * requests, and click for VIEW_INTERACTED.
 *
 * @internal Exported for testing.
 */
export function attachContainerListeners(
    container: HTMLElement,
    cubeElement: HTMLElement,
    state: BasicViewInternalData
): void {
    container.addEventListener('mouseenter', () => {
        container.focus();
        Application.eventBus.emit(EventName.VIEW_INTERACTED, { viewId: state.viewType });
    });

    cubeElement.addEventListener('mouseenter', () => {
        state.isHovered = true;
        rendering.updateRotation(state);
    });

    cubeElement.addEventListener('mouseleave', () => {
        state.isHovered = false;
        rendering.updateRotation(state);
    });

    cubeElement.addEventListener('click', () => {
        Application.eventBus.emit(EventName.VIEW_INTERACTED, { viewId: state.viewType });
    });
}
