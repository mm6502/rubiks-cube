// Per-cubie DOM rendering for the Basic view
import { Face, resolveCubeColor } from '@/cube/types';
import type { Position3D, ReadonlyCubie, StickerId } from '@/cube/types';
import { getPositionKey } from '@/cube/utils/coordinates';

import { reapplyHighlightMarkup, reapplySelectionMarkup } from './selection';
import type { BasicViewInternalData } from './types';

/**
 * Build a single cubie DOM element with its sticker faces.
 *
 * Each cubie is a `div.cubie` containing child `div.sticker` elements,
 * one per visible face.  Colors never change — only positions do.
 *
 * @param cubie - The cubie data (position, stickers, etc.)
 * @param cubieSize - Pixel size of one cubie edge
 * @param styles - CSS module styles object
 * @param onStickerSelected - Callback when a sticker face is clicked
 * @returns The constructed `div.cubie` element
 */
export function buildCubieElement(
    cubie: ReadonlyCubie,
    cubieSize: number,
    cubeSize: number,
    styles: Record<string, string>,
    onStickerSelected: (id: StickerId) => void
): HTMLElement {
    const cubieEl = document.createElement('div');
    cubieEl.className = styles['cubie'] ?? '';
    cubieEl.setAttribute('data-cubie-id', cubie.id);

    // Calculate 3D position matching the basic view coordinate system:
    // X: 0 → faceSize (left to right), matches face grid
    // Y: 0 → faceSize (top to bottom), model Y is inverted (model y=max is CSS top)
    // Z: centered at 0 (±faceSize/2), matching face translateZ(±halfSize)
    const cubieHalf = cubieSize / 2;
    const cx = cubie.position.x * cubieSize;
    const cy = (cubeSize - 1 - cubie.position.y) * cubieSize;
    const cz = ((cubeSize - 1) / 2 - cubie.position.z) * cubieSize;

    cubieEl.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;
    cubieEl.style.width = `${cubieSize}px`;
    cubieEl.style.height = `${cubieSize}px`;

    renderCubieFaces(cubieEl, cubie, cubieHalf, styles, onStickerSelected);

    return cubieEl;
}

function renderCubieFaces(
    cubieEl: HTMLElement,
    cubie: ReadonlyCubie,
    cubieHalf: number,
    styles: Record<string, string>,
    onStickerSelected: (id: StickerId) => void
): void {
    cubieEl.replaceChildren();

    const stickerFaces = new Set<Face>();

    cubie.stickers.forEach(sticker => {
        const faceEl = document.createElement('div');
        faceEl.className = styles['sticker'] ?? 'sticker';
        faceEl.setAttribute('data-sticker-id', sticker.id);
        // `data-face` is the ONE face-identity attribute in this view. It is set on
        // sticker AND interior elements alike, because `resizeCubies` below must
        // recompute a transform for every face element of a cubie, and interiors
        // are not interactive so they cannot carry the sticker marker instead.
        faceEl.setAttribute('data-face', sticker.currentFace);
        faceEl.style.backgroundColor = resolveCubeColor(sticker.color);
        faceEl.style.transform = getFaceTransform(sticker.currentFace, cubieHalf);
        faceEl.addEventListener('click', () => onStickerSelected(sticker.id));

        cubieEl.appendChild(faceEl);
        stickerFaces.add(sticker.currentFace);
    });

    const interiorFaces = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
    interiorFaces.forEach(face => {
        if (stickerFaces.has(face)) return;

        const interiorEl = document.createElement('div');
        interiorEl.className = styles['cubie-interior'] ?? 'cubie-interior';
        interiorEl.setAttribute('data-face', face);
        interiorEl.style.transform = getFaceTransform(face, cubieHalf);
        interiorEl.style.backgroundColor = 'var(--color-domain-cube-interior)';
        interiorEl.style.pointerEvents = 'none';
        interiorEl.setAttribute('aria-hidden', 'true');
        cubieEl.appendChild(interiorEl);
    });
}

/**
 * Get the CSS transform for a sticker face based on its current face.
 *
 * Also reused at full-face scale (halfSize = cube size / 2) to position the
 * ghost-anchor host elements in `rendering.ts`.
 */
export function getFaceTransform(face: Face, halfSize: number): string {
    switch (face) {
        case Face.F:
            return `translateZ(${halfSize}px)`;
        case Face.B:
            return `rotateY(180deg) translateZ(${halfSize}px)`;
        case Face.R:
            return `rotateY(90deg) translateZ(${halfSize}px)`;
        case Face.L:
            return `rotateY(-90deg) translateZ(${halfSize}px)`;
        case Face.U:
            return `rotateX(90deg) translateZ(${halfSize}px)`;
        case Face.D:
            return `rotateX(-90deg) translateZ(${halfSize}px)`;
        default:
            return `translateZ(${halfSize}px)`;
    }
}

/**
 * Check if a cubie is a surface cubie (has at least one coordinate at 0 or max).
 */
function isSurfaceCubie(position: Position3D, cubeSize: number): boolean {
    const max = cubeSize - 1;
    return (
        position.x === 0 ||
        position.x === max ||
        position.y === 0 ||
        position.y === max ||
        position.z === 0 ||
        position.z === max
    );
}

/**
 * The sticker border width for a given cubie size, in pixels.
 *
 * Proportional to the CUBIE rather than the viewport, so the separations between facelets
 * stay consistent when the panel is resized instead of drifting against a border that does
 * not move.
 *
 * The ratio is taken from what the app ALREADY renders, measured rather than guessed: with
 * the previous `0.5cqmin`, a 46.2px cubie showed a 4px border (8.7%), a 55px cubie 4px
 * (7.3%), and a 77px cubie 4px (5.2%) — i.e. the border was effectively fixed and its
 * proportion shrank as the cube grew. 8% reproduces that weight at those sizes while making
 * it hold at larger ones.
 *
 * Clamped: a purely proportional value goes sub-pixel on a small cube (a 2x2 or a 7x7 at a
 * short panel gives a ~33px cubie, i.e. under 3px), which would leave the facelets visually
 * merged. The floor keeps the grid legible. The ceiling only guards against an absurdly large
 * cube; it is set high enough not to bind at any size this view actually produces, because
 * capping it lower made the proportion drift (measured: 8.7% at a 46px cubie down to 6.1% at
 * 98px) — the same shrinking-relative-border defect, just in milder form.
 *
 * @param cubieSize - The cubie's edge length in pixels.
 */
export function stickerBorderWidth(cubieSize: number): number {
    const RATIO_OF_CUBIE = 0.08;
    const raw = cubieSize * RATIO_OF_CUBIE;
    // Quantised to WHOLE pixels, deliberately.
    //
    // A fractional border reintroduces the exact defect this fix removes: the browser rounds
    // each element's border independently, so a 3.7px value paints 3px on some stickers and
    // 4px on others ON THE SAME CUBE, which is the uneven-separation appearance reported.
    // Rounding here means every sticker on a cube computes the same integer.
    return Math.max(2, Math.min(16, Math.round(raw)));
}

/**
 * Initialize all cubie DOM elements for the cube.
 *
 * Creates one `div.cubie` per surface cubie and appends them to the cube element.
 * Works for any cube size (3×3, 4×4, etc.).
 *
 * @param state - The basic view internal data
 * @param size - Visual size of the cube in pixels
 */
export function initializeCubies(state: BasicViewInternalData, size: number): void {
    if (!state.cubeElement || !state.model) return;

    const cubeState = state.model.getCurrentState();
    const cubeSize = cubeState.cubeSize ?? 3;
    const cubieSize = size / cubeSize;

    // Publish the sticker border width for this cubie size, once, on the cube element.
    //
    // The `.sticker` rule cannot work this out for itself. A `cq*` unit (what this used to
    // be) resolves against the nearest `container-type` ancestor and there are none in this
    // codebase, so it silently fell back to the viewport — making the border independent of
    // the cube. A percentage is circular: `border-width` percentages resolve against the
    // containing block's width, which for a 100%-wide sticker under `box-sizing: border-box`
    // is the sticker itself.
    //
    // This is the only place the cubie size is known, so it is the only place the value can
    // be computed. Set on the cube element so it inherits to every cubie and sticker, one
    // write for the whole rebuild rather than one per element.
    state.cubeElement.style.setProperty(
        '--cubie-border-width',
        `${stickerBorderWidth(cubieSize)}px`
    );

    // Clear existing cubies
    const existingCubies = state.cubeElement.querySelectorAll('[data-cubie-id]');
    existingCubies.forEach(el => el.remove());

    // Create cubies for all surface positions
    for (let x = 0; x < cubeSize; x++) {
        for (let y = 0; y < cubeSize; y++) {
            for (let z = 0; z < cubeSize; z++) {
                const position = { x, y, z };

                // Skip interior cubies
                if (!isSurfaceCubie(position, cubeSize)) continue;

                // Get cubie from model by position
                const cubie = getCubieAtPosition(cubeState, position);
                if (!cubie) continue;

                // Build and append cubie element
                const cubieEl = buildCubieElement(
                    cubie,
                    cubieSize,
                    cubeSize,
                    state.styles,
                    state.onStickerSelected ?? (() => {})
                );

                state.cubeElement.appendChild(cubieEl);
            }
        }
    }

    // Store cubie size for later use. It lives on BOTH the cube element (so
    // getCubeSizeFromElement can derive the active cube size during a move's
    // post-animation rehome) and the state object (for external consumers).
    // Storing only on `state` was the original defect: updateCubiePositions
    // reads `cubeElement.cubieSize`, so a missing element-level value made it
    // fall back to cubeSize=3 and snap non-3 layers to wrong coordinates.
    const cubeElementWithSize = state.cubeElement as HTMLElement & { cubieSize?: number };
    cubeElementWithSize.cubieSize = cubieSize;
    (state as BasicViewInternalData & { cubieSize?: number }).cubieSize = cubieSize;

    // The rebuild above replaced every cubie element, so any derived markup —
    // notably the `selected` class — is gone while `state.currentSelected`
    // survives. Re-apply it here, at the rebuild boundary, so every caller is
    // covered: this function is reached from both `rendering.update` and the
    // resize path, and a per-caller fix would leave one of them broken.
    //
    // The highlight is the same class of derived state and is re-derived in the
    // same place, for the same reason: a rebuild while a sticker is hovered used
    // to drop its highlight, leaving this view disagreeing with the app (and
    // with the other views) about which sticker was highlighted.
    reapplySelectionMarkup(state);
    reapplyHighlightMarkup(state);
}

/**
 * Get a cubie at a specific position from the cube state.
 */
function getCubieAtPosition(
    cubeState: import('@/cube/types').CubeState,
    position: Position3D
): ReadonlyCubie | undefined {
    const posKey = getPositionKey(position, cubeState.cubeSize);
    const cubie = cubeState.cubiesByPosition.get(posKey);
    return cubie;
}

/**
 * Update every existing cubie and face element in place for a new cubie size.
 *
 * Returns `true` when the existing DOM matched the model and was mutated,
 * `false` when the DOM was missing or inconsistent (in which case the
 * caller should fall back to a full rebuild via `initializeCubies`).
 *
 * The function performs a **discovery pass** followed by a **mutation pass**:
 * it first collects each expected surface cubie's element by
 * `[data-cubie-id]` and confirms the count matches the model's surface
 * cubie count.  Only then does it mutate widths, transforms, and the
 * border-width custom property.
 *
 * @param state - The basic view internal data
 * @param faceSize - New visual size of the cube in pixels
 * @returns Whether the in-place update succeeded
 */
export function resizeCubies(state: BasicViewInternalData, faceSize: number): boolean {
    if (!state.cubeElement || !state.model) return false;

    const cubeState = state.model.getCurrentState();
    const cubeSize = cubeState.cubeSize ?? 3;
    const cubieSize = faceSize / cubeSize;
    const maxCoord = cubeSize - 1;

    // Discovery pass: collect every expected surface cubie's element and
    // build a position map keyed by cubie id.
    const expectedIds = new Set<string>();
    const positionMap = new Map<string, Position3D>();
    for (let x = 0; x < cubeSize; x++) {
        for (let y = 0; y < cubeSize; y++) {
            for (let z = 0; z < cubeSize; z++) {
                if (!isSurfaceCubie({ x, y, z }, cubeSize)) continue;
                const posKey = getPositionKey({ x, y, z }, cubeSize);
                const cubie = cubeState.cubiesByPosition.get(posKey);
                if (!cubie) continue;
                expectedIds.add(cubie.id);
                positionMap.set(cubie.id, cubie.position);
            }
        }
    }

    const existingCubies = state.cubeElement.querySelectorAll('[data-cubie-id]');
    if (existingCubies.length !== expectedIds.size) return false;

    // Verify every expected cubie is present.
    for (const id of expectedIds) {
        if (!state.cubeElement!.querySelector(`[data-cubie-id="${id}"]`)) return false;
    }

    // Mutation pass — safe to mutate because discovery passed.
    state.cubeElement.style.setProperty(
        '--cubie-border-width',
        `${stickerBorderWidth(cubieSize)}px`
    );

    const cubeElementWithSize = state.cubeElement as HTMLElement & { cubieSize?: number };
    cubeElementWithSize.cubieSize = cubieSize;
    (state as BasicViewInternalData & { cubieSize?: number }).cubieSize = cubieSize;

    const cubieHalf = cubieSize / 2;

    for (const id of expectedIds) {
        const el = state.cubeElement!.querySelector(`[data-cubie-id="${id}"]`) as HTMLElement;
        if (!el) continue;

        const pos = positionMap.get(id);
        if (!pos) continue;

        const cx = pos.x * cubieSize;
        const cy = (maxCoord - pos.y) * cubieSize;
        const cz = (maxCoord / 2 - pos.z) * cubieSize;

        el.style.width = `${cubieSize}px`;
        el.style.height = `${cubieSize}px`;
        el.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;

        // Update each face element's transform from its data-face attribute.
        const faceEls = el.querySelectorAll('[data-face]');
        faceEls.forEach(faceEl => {
            const faceAttr = faceEl.getAttribute('data-face');
            if (!faceAttr) return;
            (faceEl as HTMLElement).style.transform = getFaceTransform(faceAttr as Face, cubieHalf);
        });
    }

    return true;
}

/**
 * Update cubie positions and sticker faces after a move.
 *
 * Called after animation completes or when skipping animation.
 * Updates each moved cubie's `translate3d` and sticker face transforms.
 *
 * @param cubeElement - The cube DOM element
 * @param movedCubies - The after-state cubies from a move
 */
export function updateCubiePositions(
    cubeElement: HTMLElement,
    movedCubies: { after: ReadonlyCubie[] },
    styles?: Record<string, string>,
    onStickerSelected?: (id: StickerId) => void
): void {
    const cubeSize = getCubeSizeFromElement(cubeElement);

    movedCubies.after.forEach(cubie => {
        // Find the cubie DOM element
        const cubieEl = cubeElement.querySelector(`[data-cubie-id="${cubie.id}"]`) as HTMLElement;
        if (!cubieEl) return;

        // Calculate new position
        const cubieSize = cubeElement.style.width
            ? parseFloat(cubeElement.style.width) / cubeSize
            : 100;
        const cubieHalf = cubieSize / 2;

        const cx = cubie.position.x * cubieSize;
        const cy = (cubeSize - 1 - cubie.position.y) * cubieSize;
        const cz = ((cubeSize - 1) / 2 - cubie.position.z) * cubieSize;

        cubieEl.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;

        renderCubieFaces(cubieEl, cubie, cubieHalf, styles ?? {}, onStickerSelected ?? (() => {}));
    });
}

/**
 * Get cube size from cube element style width.
 */
function getCubeSizeFromElement(cubeElement: HTMLElement): number {
    // The cube element's width is set to the visual size; cubeSize is stored
    // as a data attribute or derived from cubieSize stored on the element.
    const cubieSize = (cubeElement as HTMLElement & { cubieSize?: number }).cubieSize;
    if (cubieSize && cubeElement.style.width) {
        const calculated = Math.round(parseFloat(cubeElement.style.width) / cubieSize);
        return calculated;
    }
    return 3; // default fallback
}
