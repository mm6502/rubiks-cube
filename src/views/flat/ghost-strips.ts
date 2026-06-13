// fallow-ignore-file unused-class-member
import { Face, FaceEdge } from '@/cube/types';

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
    edge: FaceEdge;
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
    { face: Face.U, edge: FaceEdge.LEFT, sourceFace: Face.L, sourcePositions: [0, 1, 2] },
    { face: Face.L, edge: FaceEdge.TOP, sourceFace: Face.U, sourcePositions: [0, 3, 6] },
    // U-R: U right col ↔ R top row
    { face: Face.U, edge: FaceEdge.RIGHT, sourceFace: Face.R, sourcePositions: [2, 1, 0] },
    { face: Face.R, edge: FaceEdge.TOP, sourceFace: Face.U, sourcePositions: [8, 5, 2] },
    // U-B: U top row ↔ B top row (reversed)
    { face: Face.U, edge: FaceEdge.TOP, sourceFace: Face.B, sourcePositions: [2, 1, 0] },
    { face: Face.B, edge: FaceEdge.TOP, sourceFace: Face.U, sourcePositions: [2, 1, 0] },
    // D-L: D left col ↔ L bottom row
    { face: Face.D, edge: FaceEdge.LEFT, sourceFace: Face.L, sourcePositions: [8, 7, 6] },
    { face: Face.L, edge: FaceEdge.BOTTOM, sourceFace: Face.D, sourcePositions: [6, 3, 0] },
    // D-R: D right col ↔ R bottom row
    { face: Face.D, edge: FaceEdge.RIGHT, sourceFace: Face.R, sourcePositions: [6, 7, 8] },
    { face: Face.R, edge: FaceEdge.BOTTOM, sourceFace: Face.D, sourcePositions: [2, 5, 8] },
    // D-B: D bottom row ↔ B bottom row (reversed)
    { face: Face.D, edge: FaceEdge.BOTTOM, sourceFace: Face.B, sourcePositions: [8, 7, 6] },
    { face: Face.B, edge: FaceEdge.BOTTOM, sourceFace: Face.D, sourcePositions: [8, 7, 6] },
    // L-B: L left col ↔ B right col
    { face: Face.L, edge: FaceEdge.LEFT, sourceFace: Face.B, sourcePositions: [2, 5, 8] },
    { face: Face.B, edge: FaceEdge.RIGHT, sourceFace: Face.L, sourcePositions: [0, 3, 6] },
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
    private static readonly OPACITY_LEVELS = [0, 0.75, 1.0] as const;
    private opacityIndex = 1; // starts visible at 75%
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
            /* c8 ignore if */
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
        this.setVisible(this.opacityIndex > 0);
    }

    /** Copy the background colour of each source sticker to its ghost. */
    updateColors(): void {
        /* c8 ignore if */
        if (this.opacityIndex === 0) return;

        for (const ghost of this.ghostElements) {
            const face = ghost.getAttribute('data-ghost-source-face');
            const pos = ghost.getAttribute('data-ghost-source-pos');
            if (!face || !pos) continue;

            const sourceEl = this.container.querySelector(
                `.${this.stickerStyles['flat-sticker']}[data-face="${face}"][data-pos="${pos}"]`
            ) as HTMLElement | null;
            /* c8 ignore else */
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
        const targetOpacity = visible ? String(GhostStrips.OPACITY_LEVELS[this.opacityIndex]) : '0';

        if (!animate) {
            this._setVisibleImmediate(strips, visible, targetOpacity);
            return;
        }

        if (visible) {
            this._fadeIn(strips, targetOpacity);
        } else {
            this._fadeOut(strips);
        }
    }

    /** Toggle display and opacity instantly, no animation. */
    private _setVisibleImmediate(
        strips: NodeListOf<HTMLElement>,
        visible: boolean,
        targetOpacity: string
    ): void {
        for (const strip of strips) {
            strip.style.display = visible ? '' : 'none';
            for (const child of strip.children) {
                (child as HTMLElement).style.opacity = visible ? targetOpacity : '0';
            }
        }
    }

    /** Show strips (display on, opacity 0), force reflow, then set target opacity for CSS transition. */
    private _fadeIn(strips: NodeListOf<HTMLElement>, targetOpacity: string): void {
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
                (child as HTMLElement).style.opacity = targetOpacity;
            }
        }
    }

    /** Fade all strips to opacity 0, then hide them after the transition ends. */
    private _fadeOut(strips: NodeListOf<HTMLElement>): void {
        for (const strip of strips) {
            for (const child of strip.children) {
                (child as HTMLElement).style.opacity = '0';
            }
        }
        const firstSticker = strips[0]?.querySelector(`.${ghostStyles['flat-ghost-sticker']}`);
        if (firstSticker) {
            this._hideAfterTransition(strips, firstSticker);
        } else {
            /* c8 ignore else — strips always have children from create() */
            for (const strip of strips) {
                strip.style.display = 'none';
            }
        }
    }

    /** Listen for transitionend on one element, then hide all strips (with setTimeout fallback). */
    private _hideAfterTransition(strips: NodeListOf<HTMLElement>, trigger: Element): void {
        const hide = () => {
            for (const strip of strips) strip.style.display = 'none';
            trigger.removeEventListener('transitionend', hide);
        };
        trigger.addEventListener('transitionend', hide, { once: true });
        // Fallback in case transitionend doesn't fire (e.g. zero-duration)
        setTimeout(hide, 400);
    }

    /** Cycle ghost opacity: off → 75% → 100% → off. */
    toggle(): void {
        this.opacityIndex = (this.opacityIndex + 1) % GhostStrips.OPACITY_LEVELS.length;
        if (this.opacityIndex > 0) {
            this.updateColors();
            this.setVisible(true, true);
        } else {
            this.setVisible(false, true);
        }
    }

    /** Whether ghosts are currently shown. */
    isVisible(): boolean {
        return this.opacityIndex > 0;
    }

    /** Get ghost state for serialization. */
    getShowGhosts(): boolean {
        return this.opacityIndex > 0;
    }

    /** Get current opacity index for serialization. */
    getOpacityIndex(): number {
        return this.opacityIndex;
    }

    /** Set ghost state from deserialization (legacy boolean). */
    setShowGhosts(visible: boolean): void {
        this.opacityIndex = visible ? 1 : 0;
        this.setVisible(this.opacityIndex > 0);
        if (this.opacityIndex > 0) this.updateColors();
    }

    /** Set opacity index directly from deserialization. */
    setOpacityIndex(index: number): void {
        this.opacityIndex = Math.max(0, Math.min(index, GhostStrips.OPACITY_LEVELS.length - 1));
        this.setVisible(this.opacityIndex > 0);
        if (this.opacityIndex > 0) this.updateColors();
    }
}
