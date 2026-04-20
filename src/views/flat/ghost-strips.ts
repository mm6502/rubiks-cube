import { Face } from '@/cube/types';

import ghostStyles from './ghost-strips.module.css';

/**
 * Describes one ghost strip: a row/column of 3 semi-transparent stickers
 * placed just outside a face edge to hint at the cube-adjacent face that
 * is not visually adjacent in the T-shaped layout.
 */
type GhostEdge = {
    /** Face that owns this ghost strip (the strip is rendered outside this face). */
    face: Face;
    /** Which edge of the owning face the strip sits on. */
    edge: 'top' | 'bottom' | 'left' | 'right';
    /** Source face whose stickers provide the ghost colours. */
    sourceFace: Face;
    /** Ordered source sticker positions (length 3 for a 3×3 cube). */
    sourcePositions: number[];
};

/**
 * All 14 ghost strips (7 non-adjacent cube-edge pairs × 2 directions).
 *
 * T-layout adjacency (already connected, no ghosts needed):
 *   U↔F (U bottom / F top), F↔L, F↔R, F↔D, R↔B
 *
 * Non-adjacent cube-edge pairs that need ghosts:
 *   U↔L, U↔R, U↔B, D↔L, D↔R, D↔B, L↔B
 */
const GHOST_EDGES: GhostEdge[] = [
    // U-L: U left col ↔ L top row
    { face: Face.U, edge: 'left', sourceFace: Face.L, sourcePositions: [0, 1, 2] },
    { face: Face.L, edge: 'top', sourceFace: Face.U, sourcePositions: [0, 3, 6] },
    // U-R: U right col ↔ R top row
    { face: Face.U, edge: 'right', sourceFace: Face.R, sourcePositions: [2, 1, 0] },
    { face: Face.R, edge: 'top', sourceFace: Face.U, sourcePositions: [8, 5, 2] },
    // U-B: U top row ↔ B top row (reversed)
    { face: Face.U, edge: 'top', sourceFace: Face.B, sourcePositions: [2, 1, 0] },
    { face: Face.B, edge: 'top', sourceFace: Face.U, sourcePositions: [2, 1, 0] },
    // D-L: D left col ↔ L bottom row
    { face: Face.D, edge: 'left', sourceFace: Face.L, sourcePositions: [8, 7, 6] },
    { face: Face.L, edge: 'bottom', sourceFace: Face.D, sourcePositions: [6, 3, 0] },
    // D-R: D right col ↔ R bottom row
    { face: Face.D, edge: 'right', sourceFace: Face.R, sourcePositions: [6, 7, 8] },
    { face: Face.R, edge: 'bottom', sourceFace: Face.D, sourcePositions: [2, 5, 8] },
    // D-B: D bottom row ↔ B bottom row (reversed)
    { face: Face.D, edge: 'bottom', sourceFace: Face.B, sourcePositions: [8, 7, 6] },
    { face: Face.B, edge: 'bottom', sourceFace: Face.D, sourcePositions: [8, 7, 6] },
    // L-B: L left col ↔ B right col
    { face: Face.L, edge: 'left', sourceFace: Face.B, sourcePositions: [2, 5, 8] },
    { face: Face.B, edge: 'right', sourceFace: Face.L, sourcePositions: [0, 3, 6] },
];

/**
 * Self-contained module for ghost hint stickers in the Flat view.
 *
 * Ghost strips are small rows/columns of semi-transparent stickers placed
 * just outside face edges to hint at cube-adjacent faces that are not
 * visually adjacent in the T-shaped layout.
 *
 * Owns its own visibility state and cached ghost DOM elements.
 */
export class GhostStrips {
    private showGhosts = true;
    private ghostElements: HTMLElement[] = [];
    private container: HTMLElement;
    private stickerStyles: Record<string, string>;

    constructor(container: HTMLElement, stickerStyles: Record<string, string>) {
        this.container = container;
        this.stickerStyles = stickerStyles;
    }

    /**
     * Build all ghost strips and attach them to the appropriate face elements.
     * Each strip is a small row/column of `<div>`s positioned just outside the
     * face boundary using absolute positioning + `top/bottom/left/right: 100%`.
     */
    create(): void {
        this.ghostElements = [];

        for (const ge of GHOST_EDGES) {
            // Find the face element that owns this ghost strip
            const faceEl = this.container.querySelector(
                `.${this.stickerStyles['flat-face']}:has(.${this.stickerStyles['flat-sticker']}[data-face="${ge.face}"])`
            ) as HTMLElement | null;
            if (!faceEl) continue;

            const strip = document.createElement('div');
            strip.className = ghostStyles['flat-ghost-strip'];
            strip.setAttribute('data-edge', ge.edge);
            strip.setAttribute('aria-hidden', 'true');

            for (const srcPos of ge.sourcePositions) {
                const ghost = document.createElement('div');
                ghost.className = ghostStyles['flat-ghost-sticker'];
                ghost.setAttribute('data-ghost-source-face', ge.sourceFace);
                ghost.setAttribute('data-ghost-source-pos', srcPos.toString());
                strip.appendChild(ghost);
                this.ghostElements.push(ghost);
            }

            faceEl.appendChild(strip);
        }

        // Initial colour sync and visibility
        this.updateColors();
        this.setVisible(this.showGhosts);
    }

    /** Copy the background colour of each source sticker to its ghost. */
    updateColors(): void {
        if (!this.showGhosts) return;

        for (const ghost of this.ghostElements) {
            const face = ghost.getAttribute('data-ghost-source-face');
            const pos = ghost.getAttribute('data-ghost-source-pos');
            if (!face || !pos) continue;

            const sourceEl = this.container.querySelector(
                `.${this.stickerStyles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
            ) as HTMLElement | null;
            if (sourceEl) {
                ghost.style.backgroundColor = sourceEl.style.backgroundColor;
            }
        }
    }

    /** Show or hide all ghost strips, with an optional fade animation. */
    setVisible(visible: boolean, animate = false): void {
        const strips = this.container.querySelectorAll<HTMLElement>(
            `.${ghostStyles['flat-ghost-strip']}`
        );

        if (!animate) {
            for (const strip of strips) {
                strip.style.display = visible ? '' : 'none';
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = visible ? '' : '0';
                }
            }
            return;
        }

        if (visible) {
            // Make strips visible first with opacity 0, then fade in
            for (const strip of strips) {
                strip.style.display = '';
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
            // Force reflow so the browser registers opacity 0 before transitioning
            void this.container.offsetHeight;
            for (const strip of strips) {
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '';
                }
            }
        } else {
            // Fade out, then hide strips after the transition ends
            for (const strip of strips) {
                for (const child of strip.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
            const first = strips[0]?.querySelector(`.${ghostStyles['flat-ghost-sticker']}`);
            if (first) {
                const hide = () => {
                    for (const strip of strips) strip.style.display = 'none';
                    first.removeEventListener('transitionend', hide);
                };
                first.addEventListener('transitionend', hide, { once: true });
                // Fallback in case transitionend doesn't fire (e.g. zero-duration)
                setTimeout(hide, 400);
            } else {
                for (const strip of strips) strip.style.display = 'none';
            }
        }
    }

    /** Toggle ghost visibility with animation. */
    toggle(): void {
        this.showGhosts = !this.showGhosts;
        if (this.showGhosts) this.updateColors();
        this.setVisible(this.showGhosts, true);
    }

    /** Whether ghosts are currently shown. */
    isVisible(): boolean {
        return this.showGhosts;
    }

    /** Get ghost state for serialization. */
    getShowGhosts(): boolean {
        return this.showGhosts;
    }

    /** Set ghost state from deserialization. */
    setShowGhosts(visible: boolean): void {
        this.showGhosts = visible;
        this.setVisible(this.showGhosts);
        if (this.showGhosts) this.updateColors();
    }
}
