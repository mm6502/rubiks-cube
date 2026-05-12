import { MoveHistory } from '@/cube/core/move-history';
import { MOVE_ICONS, isolateSvgIds } from '@/icons';
import buttonStyles from '@/styles/buttons.module.css';

import styles from './moves-view.module.css';

/**
 * Renderer for the Moves View - handles DOM creation and rendering logic.
 */
export class MovesViewRenderer {
    private moveListContainer?: HTMLElement;
    private showAsIcons: boolean = false;
    private lastRenderShowAsIcons: boolean = false;
    /** Index of the item that currently carries the `current` CSS class, or -1 if unknown. */
    private lastCurrentIndex: number = -1;

    constructor(
        private container: HTMLElement,
        private moveHistory: MoveHistory,
        private viewStyles: typeof styles,
        private btnStyles: typeof buttonStyles,
        private moveIcons: typeof MOVE_ICONS
    ) {}

    /**
     * Initialize the DOM structure for the moves view.
     */
    initializeDOM(): void {
        // Create main container.
        const mainContainer = document.createElement('div');
        mainContainer.className = this.viewStyles.mainContainer;

        // Create padded wrapper for the list.
        const listWrapper = document.createElement('div');
        listWrapper.className = this.viewStyles.listWrapper;

        // Create scrollable move list container.
        this.moveListContainer = document.createElement('div');
        this.moveListContainer.className = this.viewStyles.moveList;

        listWrapper.appendChild(this.moveListContainer);
        mainContainer.appendChild(listWrapper);

        this.container.appendChild(mainContainer);
    }

    /**
     * Update the display mode for showing moves as icons or text.
     */
    setShowAsIcons(showAsIcons: boolean): void {
        this.showAsIcons = showAsIcons;
    }

    /** Update the move history reference (used after state import). */
    setMoveHistory(moveHistory: MoveHistory): void {
        this.moveHistory = moveHistory;
    }

    /**
     * Full render - re-renders the entire move history.
     */
    render(): void {
        if (!this.moveListContainer || !this.moveHistory) return;

        const history = this.moveHistory.getHistory();
        const currentIndex = this.moveHistory.getCurrentIndex();

        if (history.length === 0) {
            this.moveListContainer.innerHTML = '';
            this.lastCurrentIndex = -1;
            this.renderEmptyState();
            this.lastRenderShowAsIcons = this.showAsIcons;
            return;
        }

        // Get current DOM children (excluding empty state).
        const children = Array.from(this.moveListContainer.children) as HTMLElement[];

        // Remove empty state if present.
        if (children.length === 1 && children[0].classList.contains(this.viewStyles.emptyState)) {
            this.moveListContainer.innerHTML = '';
            this.lastCurrentIndex = -1;
            children.length = 0;
        }

        // Force full re-render if display mode changed.
        if (this.showAsIcons !== this.lastRenderShowAsIcons) {
            this.moveListContainer.innerHTML = '';
            this.lastCurrentIndex = -1;
            children.length = 0;
            this.lastRenderShowAsIcons = this.showAsIcons;
        }

        // Adjust DOM to match history length.
        if (children.length > history.length) {
            // History diverged (new move after undo) - remove excess items.
            for (let i = children.length - 1; i >= history.length; i--) {
                children[i].remove();
            }
        } else if (children.length < history.length) {
            // New moves added - append new items.
            for (let i = children.length; i < history.length; i++) {
                const moveItem = this.createMoveItem(history[i], i);
                this.moveListContainer.appendChild(moveItem);
            }
        }

        // Update any surviving items whose move changed (e.g. truncation after undo
        // followed by a new move replaces entries at the same index positions).
        const survivingCount = Math.min(history.length, this.moveListContainer.children.length);
        for (let i = 0; i < survivingCount; i++) {
            const item = this.moveListContainer.children[i] as HTMLElement;
            if (item.dataset.move !== history[i]) {
                const updated = this.createMoveItem(history[i], i);
                this.moveListContainer.replaceChild(updated, item);
            }
        }

        // O(1) current-marker update: only touch the two elements whose class changes.
        // This avoids iterating the entire list on every move, which on long histories
        // blocked the main thread long enough to drop animation frames.
        const allItems = this.moveListContainer.children;
        if (this.lastCurrentIndex !== currentIndex) {
            if (this.lastCurrentIndex >= 0 && this.lastCurrentIndex < allItems.length) {
                (allItems[this.lastCurrentIndex] as HTMLElement).classList.remove(
                    this.viewStyles.current
                );
            }
            if (currentIndex >= 0 && currentIndex < allItems.length) {
                (allItems[currentIndex] as HTMLElement).classList.add(this.viewStyles.current);
            }
            this.lastCurrentIndex = currentIndex;

            // Auto-scroll only when the current position actually changes so that
            // a user who has manually scrolled away is not forcibly snapped back
            // on unrelated re-renders.
            this.scrollToCurrentPosition();
        }

        // Track display mode for next render.
        this.lastRenderShowAsIcons = this.showAsIcons;
    }

    /**
     * Create a DOM element for a single move item.
     */
    private createMoveItem(move: string, index: number): HTMLElement {
        const moveItem = document.createElement('div');
        moveItem.className = this.viewStyles.moveItem;
        moveItem.dataset.move = move;

        // Create move number.
        const moveNumber = document.createElement('span');
        moveNumber.className = this.viewStyles.moveNumber;
        moveNumber.textContent = `${index + 1}.`;

        // Create move display (icon or notation).
        const moveDisplay = document.createElement('span');

        if (this.showAsIcons && this.moveIcons[move]) {
            // Render as SVG icon.
            const iconMeta = this.moveIcons[move];
            moveDisplay.className = `${this.viewStyles.moveIcon} ${this.btnStyles['btn']} ${this.btnStyles['btn-primary']} ${this.btnStyles['btn-icon']} ${this.btnStyles['btn-has-svg']}`;
            moveDisplay.innerHTML = isolateSvgIds(iconMeta.svg);

            // Add label overlay with position from metadata.
            const labelPosition = iconMeta.labelPosition || 'bottom-right';
            if (labelPosition !== 'none') {
                const labelSpan = document.createElement('span');
                labelSpan.className = `${this.btnStyles['btn-icon-label']} ${this.btnStyles[`btn-icon-label-${labelPosition}`]}`;
                labelSpan.textContent = move;
                moveDisplay.appendChild(labelSpan);
            }
        } else {
            // Fallback to text notation.
            moveDisplay.className = this.showAsIcons
                ? this.viewStyles.moveIcon
                : this.viewStyles.moveNotation;
            moveDisplay.textContent = move;
        }

        moveItem.appendChild(moveNumber);
        moveItem.appendChild(moveDisplay);

        return moveItem;
    }

    /**
     * Render the empty state when there are no moves.
     */
    private renderEmptyState(): void {
        if (!this.moveListContainer) return;

        const emptyState = document.createElement('div');
        emptyState.className = this.viewStyles.emptyState;
        emptyState.textContent = 'No moves yet. Start solving!';

        this.moveListContainer.appendChild(emptyState);
    }

    /**
     * Scroll to the current position in the move list.
     * Deferred to the next animation frame so it doesn't issue a forced synchronous
     * layout during the same JS task that starts a cube animation — which would cause
     * dropped frames when the move history is long.
     */
    private scrollToCurrentPosition(): void {
        if (!this.moveListContainer) return;

        const container = this.moveListContainer;
        const currentClass = this.viewStyles.current;

        requestAnimationFrame(() => {
            const currentItem = container.querySelector(`.${currentClass}`);
            if (currentItem) {
                currentItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
        });
    }
}
