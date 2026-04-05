import { beforeEach, describe, expect, it } from 'vitest';

import { StickerId } from '@/cube/types';

import * as selection from './selection';
import type { BasicViewInternalData } from './basic-view';

describe('BasicCubeSelector', () => {
    let container: HTMLElement;
    let styles: Record<string, string>;
    let state: BasicViewInternalData;

    beforeEach(() => {
        // create a simple DOM structure with two stickers
        container = document.createElement('div');
        container.innerHTML = `
            <div class="sticker" data-sticker-id="st1"></div>
            <div class="sticker" data-sticker-id="st2"></div>
        `;

        styles = {
            sticker: 'sticker',
            highlighted: 'highlighted',
            selected: 'selected',
        };

        state = {
            container,
            styles,
            currentSelected: undefined,
            model: undefined,
            cubeElement: null,
            cubeContainer: null,
            variant: 'front',
            viewType: 'basic-front',
            isTilted: false,
            isPitched: false,
            yRotation: 0,
            xRotation: 0,
            zRotation: 0,
            isHovered: false,
            pendingMoveFace: undefined,
        };
    });

    describe('updateHighlight', () => {
        it('applies highlight class to the requested sticker', () => {
            // Arrange
            // container already has two sticker elements

            // Act
            selection.updateHighlight(state, 'st1' as StickerId);
            const first = container.querySelector('[data-sticker-id="st1"]');
            const second = container.querySelector('[data-sticker-id="st2"]');

            // Assert
            expect(first?.classList.contains('highlighted')).toBe(true);
            expect(second?.classList.contains('highlighted')).toBe(false);
        });

        it('removes previous highlight when a new one is set', () => {
            // Arrange
            selection.updateHighlight(state, 'st1' as StickerId);

            // Act
            selection.updateHighlight(state, 'st2' as StickerId);

            // Assert
            expect(
                container
                    .querySelector('[data-sticker-id="st1"]')
                    ?.classList.contains('highlighted')
            ).toBe(false);
            expect(
                container
                    .querySelector('[data-sticker-id="st2"]')
                    ?.classList.contains('highlighted')
            ).toBe(true);
        });

        it('clears highlight if undefined is passed', () => {
            // Arrange
            selection.updateHighlight(state, 'st1' as StickerId);

            // Act
            selection.updateHighlight(state, undefined);

            // Assert
            expect(
                container
                    .querySelector('[data-sticker-id="st1"]')
                    ?.classList.contains('highlighted')
            ).toBe(false);
            expect(
                container
                    .querySelector('[data-sticker-id="st2"]')
                    ?.classList.contains('highlighted')
            ).toBe(false);
        });
    });

    describe('updateSelected', () => {
        it('marks the correct sticker as selected and updates currentSelected', () => {
            // Arrange
            // base DOM and state already ready

            // Act
            selection.updateSelected(state, 'st2' as StickerId);
            const first = container.querySelector('[data-sticker-id="st1"]');
            const second = container.querySelector('[data-sticker-id="st2"]');

            // Assert
            expect(first?.classList.contains('selected')).toBe(false);
            expect(second?.classList.contains('selected')).toBe(true);
            expect(state.currentSelected).toBe('st2');
        });

        it('clears previous selection when a new one is chosen', () => {
            // Arrange
            selection.updateSelected(state, 'st1' as StickerId);

            // Act
            selection.updateSelected(state, 'st2' as StickerId);

            // Assert
            expect(
                container.querySelector('[data-sticker-id="st1"]')?.classList.contains('selected')
            ).toBe(false);
            expect(
                container.querySelector('[data-sticker-id="st2"]')?.classList.contains('selected')
            ).toBe(true);
        });

        it('clears selection when undefined is passed', () => {
            // Arrange
            selection.updateSelected(state, 'st1' as StickerId);

            // Act
            selection.updateSelected(state, undefined);

            // Assert
            expect(
                container.querySelector('[data-sticker-id="st1"]')?.classList.contains('selected')
            ).toBe(false);
            expect(
                container.querySelector('[data-sticker-id="st2"]')?.classList.contains('selected')
            ).toBe(false);
            expect(state.currentSelected).toBeUndefined();
        });

        it('does not throw when an unknown sticker id is passed', () => {
            // Act & Assert
            expect(() => selection.updateSelected(state, 'not-there' as StickerId)).not.toThrow();
            expect(state.currentSelected).toBe('not-there' as StickerId);
        });
    });
});
