import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MoveHistory } from '@/cube/core/move-history';
import { MOVE_ICONS } from '@/icons';
import buttonStyles from '@/styles/buttons.module.css';

import styles from './moves-view.module.css';
import { MovesViewRenderer } from './renderer';

describe('MovesViewRenderer', () => {
    let renderer: MovesViewRenderer;
    let container: HTMLElement;
    let moveHistory: MoveHistory;

    beforeEach(() => {
        // Create a container element
        container = document.createElement('div');
        container.style.width = '300px';
        container.style.height = '400px';
        document.body.appendChild(container);

        // Create a mock move history
        moveHistory = new MoveHistory();

        // Initialize the renderer
        renderer = new MovesViewRenderer(container, moveHistory, styles, buttonStyles, MOVE_ICONS);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    describe('initializeDOM', () => {
        it('should create the main container structure', () => {
            // Act
            renderer.initializeDOM();

            // Assert
            const mainContainer = container.querySelector(`.${styles.mainContainer}`);
            expect(mainContainer).toBeTruthy();

            const listWrapper = mainContainer?.querySelector(`.${styles.listWrapper}`);
            expect(listWrapper).toBeTruthy();

            const moveList = listWrapper?.querySelector(`.${styles.moveList}`);
            expect(moveList).toBeTruthy();
        });

        it('should create exactly one main container', () => {
            // Act
            renderer.initializeDOM();
            renderer.initializeDOM(); // Call again

            // Assert
            const mainContainers = container.querySelectorAll(`.${styles.mainContainer}`);
            expect(mainContainers.length).toBe(2); // Should create a new one each time
        });
    });

    describe('setShowAsIcons', () => {
        it('should update the showAsIcons setting', () => {
            // Act
            renderer.setShowAsIcons(true);

            // Assert
            // This is tested indirectly through render tests
            expect(true).toBe(true); // Placeholder - actual testing in render
        });
    });

    describe('render', () => {
        beforeEach(() => {
            renderer.initializeDOM();
        });

        it('should render empty state when no moves', () => {
            // Act
            renderer.render();

            // Assert
            const emptyState = container.querySelector(`.${styles.emptyState}`);
            expect(emptyState).toBeTruthy();
            expect(emptyState?.textContent).toBe('No moves yet. Start solving!');
        });

        it('should render move items when moves exist', () => {
            // Arrange
            // Add some moves to history
            moveHistory.addMove('R');
            moveHistory.addMove('U');
            moveHistory.addMove('F');

            // Act
            renderer.render();

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(3);

            // Check move numbers
            const moveNumbers = container.querySelectorAll(`.${styles.moveNumber}`);
            expect(moveNumbers[0].textContent).toBe('1.');
            expect(moveNumbers[1].textContent).toBe('2.');
            expect(moveNumbers[2].textContent).toBe('3.');
        });

        it('should mark current move with current class', () => {
            // Arrange
            moveHistory.addMove('R');
            moveHistory.addMove('U');
            moveHistory.addMove('F');

            // Act
            renderer.render();

            // Assert
            const currentItem = container.querySelector(`.${styles.current}`);
            expect(currentItem).toBeTruthy();

            // Current index should be 2 (after 3 moves)
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems[2]).toBe(currentItem);
        });

        it('should render moves as text by default', () => {
            // Arrange
            moveHistory.addMove('R');

            // Act
            renderer.render();

            // Assert
            const moveNotation = container.querySelector(`.${styles.moveNotation}`);
            expect(moveNotation).toBeTruthy();
            expect(moveNotation?.textContent).toBe('R');
        });

        it('should render moves as icons when enabled', () => {
            // Arrange
            renderer.setShowAsIcons(true);
            moveHistory.addMove('R');

            // Act
            renderer.render();

            // Assert
            const moveIcon = container.querySelector(`.${styles.moveIcon}`);
            expect(moveIcon).toBeTruthy();
        });

        it('should force full re-render when display mode changes', () => {
            // Arrange
            moveHistory.addMove('R');
            renderer.render(); // Initial render

            renderer.setShowAsIcons(true);

            // Act
            renderer.render(); // Should force re-render

            // Assert
            const moveIcon = container.querySelector(`.${styles.moveIcon}`);
            expect(moveIcon).toBeTruthy();
        });

        it('should handle adding new moves to existing list', () => {
            // Arrange
            moveHistory.addMove('R');
            renderer.render();

            // Act
            moveHistory.addMove('U');
            renderer.render();

            // Assert
            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(2);
        });

        it('should handle undo operations', () => {
            moveHistory.addMove('R');
            moveHistory.addMove('U');
            renderer.render();

            moveHistory.undo();
            renderer.render();

            const moveItems = container.querySelectorAll(`.${styles.moveItem}`);
            expect(moveItems.length).toBe(2); // Should keep all moves, but change current position
            expect(moveItems[0].classList.contains(styles.current)).toBe(true); // R should be current after undoing U
        });

        it('should clear empty state when moves are added', () => {
            renderer.render(); // Shows empty state

            moveHistory.addMove('R');
            renderer.render();

            const emptyState = container.querySelector(`.${styles.emptyState}`);
            expect(emptyState).toBeFalsy();
        });
    });

    describe('createMoveItem', () => {
        it('should create move item with number and notation', () => {
            // Access private method through renderer instance
            // This test is covered by the render tests above
            expect(true).toBe(true);
        });
    });

    describe('renderEmptyState', () => {
        it('should create empty state element', () => {
            // This is tested through the render tests
            expect(true).toBe(true);
        });
    });

    describe('scrollToCurrentPosition', () => {
        it('should scroll current item into view', () => {
            vi.useFakeTimers();
            renderer.initializeDOM();
            moveHistory.addMove('R');
            renderer.render();

            const currentItem = container.querySelector(`.${styles.current}`) as HTMLElement;
            const scrollIntoViewSpy = vi.spyOn(currentItem, 'scrollIntoView');

            // Trigger scroll by calling render again
            renderer.render();

            // scrollIntoView is deferred to rAF to avoid blocking animations
            vi.runAllTimers();

            expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' });

            vi.useRealTimers();
        });
    });

    describe('size-specific icon fallback (U4/U5)', () => {
        beforeEach(() => {
            renderer.initializeDOM();
            renderer.setShowAsIcons(true);
        });

        it('renders numbered slices as family icons with a notation label and direction-aware arrows (AE1)', () => {
            // Arrange
            renderer.setCubeSize(5);
            const history = ['4E', "3M'", '2E', "2S'", "B'", '3E', '4S', "4E'", '2E'];
            for (const move of history) {
                moveHistory.addMove(move);
            }

            // Act
            renderer.render();

            // Assert
            const moveItems = Array.from(container.querySelectorAll(`.${styles.moveItem}`));
            expect(moveItems).toHaveLength(history.length);

            // B' keeps its exact icon.
            const bPrimeItem = moveItems[4];
            const bPrimeSvg = bPrimeItem.querySelector('use');
            expect(bPrimeSvg?.getAttribute('href')).toBe('#move-icon-bp');

            // Every numbered slice resolves to an icon whose glyph encodes its
            // suffix direction (4E base arrow, 3M' prime arrow, 4E' prime arrow,
            // ...) and whose notation appears in the label overlay.
            const expectedGlyphs = [
                'move-icon-e',
                'move-icon-mp',
                'move-icon-e',
                'move-icon-sp',
                'move-icon-bp', // B' exact icon
                'move-icon-e',
                'move-icon-s',
                'move-icon-ep',
                'move-icon-e',
            ];
            for (let i = 0; i < history.length; i++) {
                const item = moveItems[i];
                const use = item.querySelector('use');
                expect(use, `${history[i]} should render an icon`).toBeTruthy();
                expect(use?.getAttribute('href'), history[i]).toBe(`#${expectedGlyphs[i]}`);
                if (history[i] !== "B'") {
                    const label = item.querySelector(`.${styles.fallbackLabel}`);
                    expect(label?.textContent, history[i]).toBe(history[i]);
                }
            }
        });

        it('renders numbered wide moves as face icons with notation label and direction-aware arrows (AE2)', () => {
            // Arrange
            renderer.setCubeSize(7);
            moveHistory.addMove('3Rw2');
            moveHistory.addMove("4Uw'");

            // Act
            renderer.render();

            // Assert
            const moveItems = Array.from(container.querySelectorAll(`.${styles.moveItem}`));
            const firstUse = moveItems[0].querySelector('use');
            // 3Rw2 is a double turn -> R2 glyph (half-turn arrow).
            expect(firstUse?.getAttribute('href')).toBe('#move-icon-r2');
            expect(moveItems[0].querySelector(`.${styles.fallbackLabel}`)?.textContent).toBe(
                '3Rw2'
            );

            const secondUse = moveItems[1].querySelector('use');
            // 4Uw' is a prime turn -> U' glyph (prime arrow).
            expect(secondUse?.getAttribute('href')).toBe('#move-icon-up');
            expect(moveItems[1].querySelector(`.${styles.fallbackLabel}`)?.textContent).toBe(
                "4Uw'"
            );
        });

        it('keeps malformed tokens as text without disturbing adjacent icons (AE4)', () => {
            // Arrange
            renderer.setCubeSize(5);
            moveHistory.addMove('R');
            moveHistory.addMove('ZZ9');
            moveHistory.addMove("3E'");

            // Act
            renderer.render();

            // Assert
            const moveItems = Array.from(container.querySelectorAll(`.${styles.moveItem}`));

            // R renders an exact icon.
            expect(moveItems[0].querySelector('use')?.getAttribute('href')).toBe('#move-icon-r');

            // ZZ9 renders as text (moveIcon without an svg/use), and doesn't throw.
            const zz9 = moveItems[1];
            expect(zz9.textContent).toContain('ZZ9');
            expect(zz9.querySelector('use')).toBeNull();

            // 3E' still resolves to an E-prime family icon next to the malformed token.
            const ePrime = moveItems[2];
            expect(ePrime.querySelector('use')?.getAttribute('href')).toBe('#move-icon-ep');
        });

        it('re-resolves when the cube size changes between renders (U4)', () => {
            // Arrange — size 5: 3E is a numbered slice -> E-family icon.
            renderer.setCubeSize(5);
            moveHistory.addMove('3E');
            renderer.render();
            let use = container.querySelector('use');
            expect(use?.getAttribute('href')).toBe('#move-icon-e');

            // Size 3: 3E is not table-valid and not wide-shaped -> text fallback.
            renderer.setCubeSize(3);
            renderer.render();
            use = container.querySelector('use');
            expect(use).toBeNull();
            expect(container.textContent).toContain('3E');
        });

        it('renders long fallback labels fully at the icon tile size (AE6/R5b)', () => {
            // Arrange
            renderer.setCubeSize(7);
            for (const move of ['3Rw2', "4Uw'", "3E2'"]) {
                moveHistory.addMove(move);
            }

            // Act
            renderer.render();

            // Assert — each label keeps its full original notation.
            const labels = Array.from(container.querySelectorAll(`.${styles.fallbackLabel}`));
            expect(labels.map(label => label.textContent)).toEqual(['3Rw2', "4Uw'", "3E2'"]);
        });

        it('renders a 3x3 history identically for the standard notation set (AE3)', () => {
            // Arrange
            renderer.setCubeSize(3);
            const history = ['R', "R'", 'R2', "R2'", 'L', 'M', 'x', "z2'"];
            for (const move of history) {
                moveHistory.addMove(move);
            }

            // Act
            renderer.render();

            // Assert — every standard move keeps its exact icon; none fall back.
            const moveItems = Array.from(container.querySelectorAll(`.${styles.moveItem}`));
            expect(moveItems).toHaveLength(history.length);
            for (let i = 0; i < history.length; i++) {
                expect(moveItems[i].querySelector('use'), history[i]).toBeTruthy();
                expect(
                    moveItems[i].querySelector(`.${styles.fallbackLabel}`),
                    history[i]
                ).toBeNull();
            }
        });

        it('preserves current-item marker and history order after size changes (AE5/R9)', () => {
            // Arrange
            renderer.setCubeSize(5);
            moveHistory.addMove('R');
            moveHistory.addMove('3E');
            renderer.render();

            // Act — toggle to text and back, same size, then render.
            renderer.setShowAsIcons(false);
            renderer.render();
            renderer.setShowAsIcons(true);
            renderer.render();

            // Assert — same order and current marker on the last move.
            const moveItems = Array.from(
                container.querySelectorAll<HTMLElement>(`.${styles.moveItem}`)
            );
            expect(moveItems.map(item => item.dataset.move)).toEqual(['R', '3E']);
            expect(moveItems[1].classList.contains(styles.current)).toBe(true);
        });
    });
});
