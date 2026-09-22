import { Face, FaceEdge, ReadOnlyCubeModel, resolveCubeColor } from '@/cube/types';
import { CubeStateUtils } from '@/cube/utils/state-conversion';

import ghostStyles from './ghost-stickers.module.css';

/**
 * Get the sticker positions along a face's edge in strip display order.
 * Positions vary based on cube size: n positions for an n×n×n cube.
 * @param edgeDir The direction of the edge (TOP, BOTTOM, LEFT, RIGHT)
 * @param cubeSize The size of the cube (default 3 for backward compatibility)
 */
function getEdgePositions(edgeDir: FaceEdge, cubeSize: number = 3): number[] {
    const maxIdx = cubeSize - 1;
    switch (edgeDir) {
        case FaceEdge.TOP:
            // Top row: positions 0 to cubeSize-1
            return Array.from({ length: cubeSize }, (_, i) => i);
        case FaceEdge.BOTTOM:
            // Bottom row: positions (cubeSize-1)*cubeSize to cubeSize*cubeSize-1
            return Array.from({ length: cubeSize }, (_, i) => maxIdx * cubeSize + i);
        case FaceEdge.LEFT:
            // Left column: positions 0, cubeSize, 2*cubeSize, ... (maxIdx)*cubeSize
            return Array.from({ length: cubeSize }, (_, i) => i * cubeSize);
        case FaceEdge.RIGHT:
            // Right column: positions cubeSize-1, 2*cubeSize-1, 3*cubeSize-1, ...
            return Array.from({ length: cubeSize }, (_, i) => (i + 1) * cubeSize - 1);
    }
}

// Shared ghost visibility state for Basic Front and Basic Back views.
// Opacity levels cycle: 75% → 100% → off
const GHOST_OPACITY_LEVELS = [0, 0.75, 1.0] as const;
let ghostOpacityIndex = 0; // starts off

/**
 * Default delay before a fade-in starts.
 *
 * Applies to callers that are *not* closing a cube turn — showing the strips for
 * the first time, or changing their opacity. A turn's own callers pass 0, because
 * they have already waited for the cube to settle: see
 * {@link GhostStickers.updateVisibleEdges}.
 *
 * This was previously justified as matching the cube's 250ms
 * `transition: transform`. That transition is gone — view rotation now ramps an
 * angle through the Web Animations API — so the constant no longer stands in for
 * a turn's length and must not be read as doing so.
 */
const DEFAULT_FADE_DELAY_MS = 200;

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
    edgeOnA: FaceEdge;
    faceB: Face;
    edgeOnB: FaceEdge;
};

/**
 * All 12 physical edges of the cube — adjacency and edge directions only.
 * Sticker positions are resolved at runtime from the cube model.
 */
export const CUBE_EDGE_MAP: CubeEdge[] = [
    { faceA: Face.F, edgeOnA: FaceEdge.TOP, faceB: Face.U, edgeOnB: FaceEdge.BOTTOM },
    { faceA: Face.F, edgeOnA: FaceEdge.BOTTOM, faceB: Face.D, edgeOnB: FaceEdge.TOP },
    { faceA: Face.F, edgeOnA: FaceEdge.LEFT, faceB: Face.L, edgeOnB: FaceEdge.RIGHT },
    { faceA: Face.F, edgeOnA: FaceEdge.RIGHT, faceB: Face.R, edgeOnB: FaceEdge.LEFT },
    { faceA: Face.B, edgeOnA: FaceEdge.TOP, faceB: Face.U, edgeOnB: FaceEdge.TOP },
    { faceA: Face.B, edgeOnA: FaceEdge.BOTTOM, faceB: Face.D, edgeOnB: FaceEdge.BOTTOM },
    { faceA: Face.B, edgeOnA: FaceEdge.RIGHT, faceB: Face.L, edgeOnB: FaceEdge.LEFT },
    { faceA: Face.B, edgeOnA: FaceEdge.LEFT, faceB: Face.R, edgeOnB: FaceEdge.RIGHT },
    { faceA: Face.U, edgeOnA: FaceEdge.LEFT, faceB: Face.L, edgeOnB: FaceEdge.TOP },
    { faceA: Face.U, edgeOnA: FaceEdge.RIGHT, faceB: Face.R, edgeOnB: FaceEdge.TOP },
    { faceA: Face.D, edgeOnA: FaceEdge.LEFT, faceB: Face.L, edgeOnB: FaceEdge.BOTTOM },
    { faceA: Face.D, edgeOnA: FaceEdge.RIGHT, faceB: Face.R, edgeOnB: FaceEdge.BOTTOM },
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
    /**
     * Signature of the selection {@link updateVisibleEdges} last applied.
     *
     * Needed because "are strips showing?" and "are the *right* strips showing?"
     * are different questions, and callers such as {@link setOpacityIndex} used to
     * ask the first while meaning the second. `create()` leaves every strip hidden,
     * and a selection shown for one orientation is stale the moment another is
     * restored — so the answer has to be about identity, not presence.
     */
    private appliedSelection: string | null = null;

    constructor(cubeElement: HTMLElement, getModel: () => ReadOnlyCubeModel | null) {
        this.cubeElement = cubeElement;
        this.getModel = getModel;
    }

    /**
     * A stable signature of a silhouette selection.
     *
     * Face order is normalized, so two callers that name the same three visible
     * faces in a different order produce the same signature. `isTilted`/`isPitched`
     * participate because they decide the near/far depth, and therefore which of
     * two candidate strips is the correct one.
     */
    private static selectionSignature(
        visibleFaces: Array<{ face: Face }>,
        hiddenFaces: Array<{ face: Face }>,
        isTilted: boolean,
        isPitched: boolean
    ): string {
        const names = (faces: Array<{ face: Face }>): string =>
            faces
                .map(f => f.face)
                .sort()
                .join(',');
        return `${names(visibleFaces)}|${names(hiddenFaces)}|${isTilted}|${isPitched}`;
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

    /**
     * Create a single ghost strip for one side of a cube edge.
     * Builds the DOM element with sticker placeholders (one per edge position,
     * which equals the cube size) and attaches it to the appropriate face element.
     */
    private createStripForEdge(edge: CubeEdge, side: 'A' | 'B'): void {
        const hostFace = side === 'A' ? edge.faceA : edge.faceB;
        const edgeDir = side === 'A' ? edge.edgeOnA : edge.edgeOnB;
        const sourceFace = side === 'A' ? edge.faceB : edge.faceA;

        // Find the face element by data attribute. The `:not([data-basic-pos])`
        // guard separates a full-face host from a sticker, but the real safety
        // here is the SCOPE: `this.cubeElement` is the `.ghost-anchor-container`
        // wrapper (see initializeGhostAnchors), which holds only anchors. Cubie
        // sticker and interior divs share `data-face` and live outside it.
        const faceEl = this.cubeElement.querySelector(
            `[data-face="${hostFace}"]:not([data-basic-pos])`
        ) as HTMLElement | null;
        /* c8 ignore if */
        if (!faceEl) return;

        // Get cube size from the model to determine how many stickers to create
        const model = this.getModel();
        const cubeSize = model?.getCurrentState().cubeSize ?? 3;

        const strip = document.createElement('div');
        strip.className = ghostStyles['ghost-strip'];
        strip.setAttribute('data-edge', edgeDir);
        strip.setAttribute('data-host-face', hostFace);
        strip.setAttribute('data-source-face', sourceFace);
        strip.setAttribute('aria-hidden', 'true');
        strip.style.display = 'none';

        // Create ghost sticker placeholders — one per edge position (cubeSize total)
        for (let i = 0; i < cubeSize; i++) {
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
     * Strips are categorised by depth: near (front face), far (back face),
     * or mid (everything else).
     *
     * **The turn paths pass 0.** Every rotation and move entry point in the view
     * now closes through a single settled path that runs only once the cube has
     * actually stopped, so a fade-in delay there would be a second, phantom turn —
     * measured as a 233ms dead pause between the cube stopping and the strips
     * returning. The delay has another job, though: a *fade transition* between
     * opacity levels looks better eased in, and that is what
     * {@link DEFAULT_FADE_DELAY_MS} still exists for. Those callers take the
     * default.
     *
     * @param visibleFaces Faces currently facing the viewer
     * @param hiddenFaces Faces currently turned away
     * @param isTilted Whether the view is tilted
     * @param isPitched Whether the view is pitched
     * @param fadeDelayMs Delay before the fade-in starts. Defaults to
     *   {@link DEFAULT_FADE_DELAY_MS}; pass 0 when the cube has already settled.
     */
    updateVisibleEdges(
        visibleFaces: Array<{ face: Face; position?: string }>,
        hiddenFaces: Array<{ face: Face; position?: string }>,
        isTilted = false,
        isPitched = false,
        fadeDelayMs: number = DEFAULT_FADE_DELAY_MS
    ): void {
        if (!isGhostVisible()) return;

        const visibleSet = new Set(visibleFaces.map(f => f.face));
        const hiddenSet = new Set(hiddenFaces.map(f => f.face));

        const { nearFace, farSourceFace } = this.computeDepthFaces(
            visibleFaces,
            hiddenFaces,
            isTilted,
            isPitched
        );

        this.cancelPendingFade();
        this.hideAllStrips();
        // Recorded before the reveal, because the reveal can be deferred by a fade
        // timer while this selection is already the current one.
        this.appliedSelection = GhostStickers.selectionSignature(
            visibleFaces,
            hiddenFaces,
            isTilted,
            isPitched
        );

        const toShow = this.computeStripsToShow(visibleSet, hiddenSet, nearFace, farSourceFace);

        if (toShow.length === 0) return;

        const reveal = (): void => {
            this.pendingFadeTimer = null;
            for (const stripState of toShow) {
                this.fadeInStrip(stripState);
            }
            this.updateColors();
        };

        if (fadeDelayMs <= 0) {
            reveal();
            return;
        }

        this.pendingFadeTimer = window.setTimeout(reveal, fadeDelayMs);
    }

    /**
     * Compute the near (front) and far (back) face positions based on
     * tilt and pitch state, then resolve them to actual Face values.
     */
    private computeDepthFaces(
        visibleFaces: Array<{ face: Face; position?: string }>,
        hiddenFaces: Array<{ face: Face; position?: string }>,
        isTilted: boolean,
        isPitched: boolean
    ): { nearFace: Face | null; farSourceFace: Face | null } {
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
        return { nearFace, farSourceFace };
    }

    /**
     * Cancel any pending delayed fade-in timer.
     */
    private cancelPendingFade(): void {
        if (this.pendingFadeTimer !== null) {
            clearTimeout(this.pendingFadeTimer);
            this.pendingFadeTimer = null;
        }
    }

    /**
     * Immediately hide all currently showing ghost strips, resetting
     * their display, visibility flag, and opacity.
     */
    private hideAllStrips(): void {
        for (const stripState of this.strips) {
            if (stripState.isShowing) {
                stripState.isShowing = false;
                stripState.element.style.display = 'none';
                for (const child of stripState.element.children) {
                    (child as HTMLElement).style.opacity = '0';
                }
            }
        }
    }

    /**
     * Determine which strips should be visible after rotation, based on
     * silhouette edges (visible↔hidden face boundary). Assigns a depth
     * attribute (near/far/mid) to each strip and returns the list to show.
     */
    private computeStripsToShow(
        visibleSet: Set<Face>,
        hiddenSet: Set<Face>,
        nearFace: Face | null,
        farSourceFace: Face | null
    ): GhostStripState[] {
        const toShow: GhostStripState[] = [];
        for (const stripState of this.strips) {
            const hostFace = stripState.element.getAttribute('data-host-face') as Face;
            const sourceFace = stripState.element.getAttribute('data-source-face') as Face;
            const shouldShow = visibleSet.has(hostFace) && hiddenSet.has(sourceFace);
            if (shouldShow) {
                const depth =
                    hostFace === nearFace ? 'near' : sourceFace === farSourceFace ? 'far' : 'mid';
                stripState.element.setAttribute('data-depth', depth);
                toShow.push(stripState);
            }
        }
        return toShow;
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
        const cubeSize = state.cubeSize;

        for (const stripState of this.strips) {
            if (!stripState.isShowing) continue;

            const hostFace = stripState.element.getAttribute('data-host-face') as Face;
            const sourceFace = stripState.element.getAttribute('data-source-face') as Face;
            const edgeDir = stripState.element.getAttribute('data-edge') as FaceEdge;

            // Get the positions along this edge on the host face (size-aware)
            const hostPositions = getEdgePositions(edgeDir, cubeSize);

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
            // Nothing is on screen any more, so no selection is "already applied".
            // Leaving the signature behind would let a later `setOpacityIndex` for
            // this same orientation conclude the strips are current and skip the
            // recompute — which shows nothing, because hiding just cleared them.
            this.appliedSelection = null;
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
        // Compare against the selection last *applied*, not against whether any
        // strip happens to be showing. Those differ in exactly the case this guards:
        // `create()` shows the strips for the default orientation, and a restored
        // custom orientation arrives afterwards — asking "is anything showing?"
        // answered yes and skipped the recompute, leaving the strips on the default
        // orientation's silhouette while the cube showed another.
        const applied = this.appliedSelection;
        const requested =
            visibleFaces && hiddenFaces
                ? GhostStickers.selectionSignature(visibleFaces, hiddenFaces, isTilted, isPitched)
                : null;
        const wasVisible = applied !== null && applied === requested;

        setGhostOpacityIndex(index);
        if (isGhostVisible() && visibleFaces && hiddenFaces) {
            if (wasVisible) {
                // Same silhouette as the one already shown — only the opacity changed.
                this.applyOpacity();
            } else {
                // Turning on, or the orientation changed under an existing selection.
                this.updateVisibleEdges(visibleFaces, hiddenFaces, isTilted, isPitched);
                this.applyOpacity();
            }
        } else if (!isGhostVisible()) {
            this.setVisible(false, true);
        }
    }

    /**
     * Apply the current ghost opacity level to all visible ghost strips.
     * Iterates over all showing strips and sets each ghost sticker's
     * opacity to the globally configured ghost opacity value.
     */
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

    /**
     * Fade in a single ghost strip with a CSS transition.
     * Sets the strip to visible, starts at opacity 0, forces a reflow,
     * then transitions to the target opacity.
     */
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

    /**
     * Fade out a single ghost strip, hiding it after the CSS transition completes.
     * Listens for the `transitionend` event to ensure the strip is hidden only
     * after the fade-out animation finishes, and only if the strip hasn't been
     * re-shown during the transition.
     */
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
