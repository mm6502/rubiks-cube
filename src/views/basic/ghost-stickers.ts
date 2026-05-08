import { Face, ReadOnlyCubeModel, resolveCubeColor } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import ghostStyles from './ghost-stickers.module.css';

/** Get the 3 sticker positions on a face's edge in strip display order. */
function getEdgePositions(edgeDir: 'top' | 'bottom' | 'left' | 'right'): number[] {
    switch (edgeDir) {
        case 'top':
            return [0, 1, 2];
        case 'bottom':
            return [6, 7, 8];
        case 'left':
            return [0, 3, 6];
        case 'right':
            return [2, 5, 8];
    }
}

// Shared ghost visibility state for Basic Front and Basic Back views.
// Opacity levels cycle: 75% → 100% → off
const GHOST_OPACITY_LEVELS = [0, 0.75, 1.0] as const;
let ghostOpacityIndex = 0; // starts off

export function isGhostVisible(): boolean {
    return ghostOpacityIndex > 0;
}

export function getGhostOpacity(): number {
    return GHOST_OPACITY_LEVELS[ghostOpacityIndex];
}

export function setGhostVisible(value: boolean): void {
    ghostOpacityIndex = value ? 1 : 0;
}

export function setGhostOpacityIndex(index: number): void {
    ghostOpacityIndex = Math.max(0, Math.min(index, GHOST_OPACITY_LEVELS.length - 1));
}

export function getGhostOpacityIndex(): number {
    return ghostOpacityIndex;
}

/**
 * Describes one edge of the cube: a shared boundary between two adjacent faces.
 * Each edge has a direction on each face (top/bottom/left/right).
 */
type CubeEdge = {
    faceA: Face;
    edgeOnA: 'top' | 'bottom' | 'left' | 'right';
    faceB: Face;
    edgeOnB: 'top' | 'bottom' | 'left' | 'right';
};

/**
 * All 12 physical edges of the cube — adjacency and edge directions only.
 * Sticker positions are resolved at runtime from the cube model.
 */
export const CUBE_EDGE_MAP: CubeEdge[] = [
    { faceA: Face.F, edgeOnA: 'top', faceB: Face.U, edgeOnB: 'bottom' },
    { faceA: Face.F, edgeOnA: 'bottom', faceB: Face.D, edgeOnB: 'top' },
    { faceA: Face.F, edgeOnA: 'left', faceB: Face.L, edgeOnB: 'right' },
    { faceA: Face.F, edgeOnA: 'right', faceB: Face.R, edgeOnB: 'left' },
    { faceA: Face.B, edgeOnA: 'top', faceB: Face.U, edgeOnB: 'top' },
    { faceA: Face.B, edgeOnA: 'bottom', faceB: Face.D, edgeOnB: 'bottom' },
    { faceA: Face.B, edgeOnA: 'right', faceB: Face.L, edgeOnB: 'left' },
    { faceA: Face.B, edgeOnA: 'left', faceB: Face.R, edgeOnB: 'right' },
    { faceA: Face.U, edgeOnA: 'left', faceB: Face.L, edgeOnB: 'top' },
    { faceA: Face.U, edgeOnA: 'right', faceB: Face.R, edgeOnB: 'top' },
    { faceA: Face.D, edgeOnA: 'left', faceB: Face.L, edgeOnB: 'bottom' },
    { faceA: Face.D, edgeOnA: 'right', faceB: Face.R, edgeOnB: 'bottom' },
];

type GhostStripState = {
    element: HTMLElement;
    edge: CubeEdge;
    /** Whether this strip is currently displayed (independent of global toggle). */
    isShowing: boolean;
};

/**
 * Self-contained module for ghost hint stickers in the Basic (3D) view.
 *
 * Ghost strips are thin rows/columns of semi-transparent stickers placed
 * just outside visible face edges to hint at hidden face colours. Only
 * silhouette edges (visible↔hidden face boundary) get strips.
 */
export class GhostStickers {
    private strips: GhostStripState[] = [];
    private cubeElement: HTMLElement;
    private pendingFadeTimer: number | null = null;
    private getModel: () => ReadOnlyCubeModel | null;

    constructor(cubeElement: HTMLElement, getModel: () => ReadOnlyCubeModel | null) {
        this.cubeElement = cubeElement;
        this.getModel = getModel;
    }

    /**
     * Build all ghost strip elements attached directly to the cube element
     * (not inside face divs, which have overflow:hidden).
     * Each strip gets the same CSS positioning class as its host face so it
     * appears in the correct 3D position, then uses absolute positioning
     * to place itself just outside the face boundary.
     */
    create(): void {
        this.strips = [];

        for (const edge of CUBE_EDGE_MAP) {
            this.createStripForEdge(edge, 'A');
            this.createStripForEdge(edge, 'B');
        }

        this.setVisible(isGhostVisible());
    }

    private createStripForEdge(edge: CubeEdge, side: 'A' | 'B'): void {
        const hostFace = side === 'A' ? edge.faceA : edge.faceB;
        const edgeDir = side === 'A' ? edge.edgeOnA : edge.edgeOnB;
        const sourceFace = side === 'A' ? edge.faceB : edge.faceA;

        // Find the face element by data attribute
        const faceEl = this.cubeElement.querySelector(
            `[data-basic-face="${hostFace}"]:not([data-basic-pos])`
        ) as HTMLElement | null;
        /* c8 ignore if */
        if (!faceEl) return;

        const strip = document.createElement('div');
        strip.className = ghostStyles['ghost-strip'];
        strip.setAttribute('data-edge', edgeDir);
        strip.setAttribute('data-host-face', hostFace);
        strip.setAttribute('data-source-face', sourceFace);
        strip.setAttribute('aria-hidden', 'true');
        strip.style.display = 'none';

        // Create 3 ghost sticker placeholders (colours set by updateColors)
        for (let i = 0; i < 3; i++) {
            const ghost = document.createElement('div');
            ghost.className = ghostStyles['ghost-sticker'];
            strip.appendChild(ghost);
        }

        faceEl.appendChild(strip);
        this.strips.push({ element: strip, edge, isShowing: false });
    }

    /**
     * Update which ghost strips are visible based on current face visibility.
     * Shows strips only on silhouette edges (one face visible, other hidden).
     */
    updateVisibleEdges(
        visibleFaces: Array<{ face: Face; position?: string }>,
        hiddenFaces: Array<{ face: Face; position?: string }>,
        isTilted = false,
        isPitched = false
    ): void {
        if (!isGhostVisible()) return;

        const visibleSet = new Set(visibleFaces.map(f => f.face));
        const hiddenSet = new Set(hiddenFaces.map(f => f.face));

        // Identify the front face (nearest to camera) and back face (farthest, hidden).
        // Strips on the front face = near, strips sourced from the back face = far, rest = mid.
        const frontPosition = isPitched
            ? isTilted
                ? 'top-right'
                : 'top-left'
            : isTilted
              ? 'bottom-right'
              : 'bottom-left';
        const backPosition = isPitched
            ? isTilted
                ? 'bottom-left'
                : 'bottom-right'
            : isTilted
              ? 'top-left'
              : 'top-right';

        const nearFace = visibleFaces.find(f => f.position === frontPosition)?.face ?? null;
        const farSourceFace = hiddenFaces.find(f => f.position === backPosition)?.face ?? null;

        // Cancel any pending delayed fade-in
        if (this.pendingFadeTimer !== null) {
            clearTimeout(this.pendingFadeTimer);
            this.pendingFadeTimer = null;
        }

        // Immediately hide ALL currently showing strips
        for (const stripState of this.strips) {
            if (stripState.isShowing) {
                stripState.isShowing = false;
                stripState.element.style.display = 'none';
                for (const child of stripState.element.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
        }

        // Determine which strips should be visible after rotation
        const toShow: GhostStripState[] = [];
        for (const stripState of this.strips) {
            const hostFace = stripState.element.getAttribute('data-host-face') as Face;
            const sourceFace = stripState.element.getAttribute('data-source-face') as Face;
            const shouldShow = visibleSet.has(hostFace) && hiddenSet.has(sourceFace);
            if (shouldShow) {
                // near: strip is on the front face; far: strip sources from the back face; mid: everything else
                const depth =
                    hostFace === nearFace ? 'near' : sourceFace === farSourceFace ? 'far' : 'mid';
                stripState.element.setAttribute('data-depth', depth);
                toShow.push(stripState);
            }
        }

        // Delayed fade-in: appear just before the cube rotation ends (200ms of 250ms)
        if (toShow.length > 0) {
            this.pendingFadeTimer = window.setTimeout(() => {
                this.pendingFadeTimer = null;
                for (const stripState of toShow) {
                    this.fadeInStrip(stripState);
                }
                this.updateColors();
            }, 200);
        }
    }

    /**
     * Update ghost sticker colours using the cube model.
     * For each ghost sticker on a host face edge, find the cubie at that
     * position, then read its sibling sticker colour on the source (hidden) face.
     */
    updateColors(): void {
        if (!isGhostVisible()) return;
        const model = this.getModel();
        if (!model) return;

        const state = model.getCurrentState();

        for (const stripState of this.strips) {
            if (!stripState.isShowing) continue;

            const hostFace = stripState.element.getAttribute('data-host-face') as Face;
            const sourceFace = stripState.element.getAttribute('data-source-face') as Face;
            const edgeDir = stripState.element.getAttribute('data-edge') as
                | 'top'
                | 'bottom'
                | 'left'
                | 'right';

            // Get the 3 positions along this edge on the host face
            const hostPositions = getEdgePositions(edgeDir);

            const children = stripState.element.children;
            for (let i = 0; i < children.length && i < hostPositions.length; i++) {
                const ghost = children[i] as HTMLElement;
                const hostPos = hostPositions[i];

                // Find the sticker at this position on the host face
                const hostSticker = CubeStateUtils.getStickerAt(state, hostFace, hostPos);
                /* c8 ignore if */
                if (!hostSticker) continue;

                // Get the cubie that owns this sticker
                const cubie = CubeStateUtils.getCubieById(state, hostSticker.cubieId);
                /* c8 ignore if */
                if (!cubie) continue;

                // Find the sibling sticker on the source (hidden) face
                let color = '';
                for (const [, sibling] of cubie.stickers) {
                    if (sibling.currentFace === sourceFace) {
                        color = resolveCubeColor(sibling.color);
                        break;
                    }
                }

                ghost.style.backgroundColor = color;
            }
        }
    }

    /** Show or hide all ghost strips (used for toggle). */
    setVisible(visible: boolean, animate = false): void {
        if (visible) {
            // Don't show all — only show based on current edge visibility
            // The caller should call updateVisibleEdges after setVisible(true)
            if (!animate) {
                // When not animating, just ensure state is consistent
                for (const strip of this.strips) {
                    if (!strip.isShowing) {
                        strip.element.style.display = 'none';
                    }
                }
            }
        } else {
            // Hide all strips
            for (const strip of this.strips) {
                if (animate && strip.isShowing) {
                    this.fadeOutStrip(strip);
                } else {
                    strip.element.style.display = 'none';
                    strip.isShowing = false;
                    for (const child of strip.element.children) {
                        (child as HTMLElement).style.opacity = '0';
                    }
                }
            }
        }
    }

    /** Cycle ghost opacity: off → 75% → 100% → off. */
    toggle(
        visibleFaces?: Array<{ face: Face }>,
        hiddenFaces?: Array<{ face: Face }>,
        isTilted = false,
        isPitched = false
    ): void {
        const wasVisible = isGhostVisible();
        ghostOpacityIndex = (ghostOpacityIndex + 1) % GHOST_OPACITY_LEVELS.length;
        if (isGhostVisible() && visibleFaces && hiddenFaces) {
            if (wasVisible) {
                // Already showing — just smoothly transition opacity
                this.applyOpacity();
            } else {
                // Turning on from off — need to determine which strips to show
                this.updateVisibleEdges(visibleFaces, hiddenFaces, isTilted, isPitched);
                this.applyOpacity();
            }
        } else if (!isGhostVisible()) {
            this.setVisible(false, true);
        }
    }

    /** Whether ghosts are currently shown. */
    isVisible(): boolean {
        return isGhostVisible();
    }

    /** Get ghost opacity index for serialization. */
    getShowGhosts(): boolean {
        return isGhostVisible();
    }

    /** Get current opacity index for serialization. */
    getOpacityIndex(): number {
        return ghostOpacityIndex;
    }

    /** Set ghost state from deserialization. */
    setShowGhosts(
        visible: boolean,
        visibleFaces?: Array<{ face: Face }>,
        hiddenFaces?: Array<{ face: Face }>,
        isTilted = false,
        isPitched = false
    ): void {
        ghostOpacityIndex = visible ? 1 : 0;
        if (visible && visibleFaces && hiddenFaces) {
            this.updateVisibleEdges(visibleFaces, hiddenFaces, isTilted, isPitched);
        } else {
            this.setVisible(visible);
        }
    }

    /** Set opacity index directly (for cross-view sync). */
    setOpacityIndex(
        index: number,
        visibleFaces?: Array<{ face: Face }>,
        hiddenFaces?: Array<{ face: Face }>,
        isTilted = false,
        isPitched = false
    ): void {
        // Use instance-level strip state, not the shared module variable,
        // because the source view's toggle() already mutated the global before emitting.
        const wasVisible = this.strips.some(s => s.isShowing);
        setGhostOpacityIndex(index);
        if (isGhostVisible() && visibleFaces && hiddenFaces) {
            if (wasVisible) {
                // Already showing — just smoothly transition opacity
                this.applyOpacity();
            } else {
                // Turning on from off — need to determine which strips to show
                this.updateVisibleEdges(visibleFaces, hiddenFaces, isTilted, isPitched);
                this.applyOpacity();
            }
        } else if (!isGhostVisible()) {
            this.setVisible(false, true);
        }
    }

    /** Apply current ghost opacity to all showing strips. */
    private applyOpacity(): void {
        const opacity = String(getGhostOpacity());
        for (const strip of this.strips) {
            if (strip.isShowing) {
                for (const child of strip.element.children) {
                    (child as HTMLElement).style.opacity = opacity;
                }
            }
        }
    }

    private fadeInStrip(stripState: GhostStripState): void {
        stripState.isShowing = true;
        stripState.element.style.display = '';
        // Start at opacity 0, then transition to target
        const targetOpacity = String(getGhostOpacity());
        for (const child of stripState.element.children) {
            (child as HTMLElement).style.opacity = '0';
        }
        // Force reflow
        void stripState.element.offsetHeight;
        for (const child of stripState.element.children) {
            (child as HTMLElement).style.opacity = targetOpacity;
        }
    }

    private fadeOutStrip(stripState: GhostStripState): void {
        stripState.isShowing = false;
        for (const child of stripState.element.children) {
            (child as HTMLElement).style.opacity = '0';
        }
        // Hide after transition completes (only if still hidden)
        const first = stripState.element.querySelector(`.${ghostStyles['ghost-sticker']}`);
        /* istanbul ignore else */
        if (first) {
            const hide = () => {
                // Only hide if strip hasn't been re-shown during transition
                if (!stripState.isShowing) {
                    stripState.element.style.display = 'none';
                }
                first.removeEventListener('transitionend', hide);
            };
            first.addEventListener('transitionend', hide, { once: true });
            setTimeout(hide, 400);
        } else {
            stripState.element.style.display = 'none';
        }
    }
}
