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

    // Six walls first — one per face, ALWAYS, whether or not that face carries a
    // sticker. Together they are the cubie's sealed body: neighbouring cubies' walls
    // meet flush on the shared face plane, so the cube occludes its own far side from
    // painted geometry rather than from a flat quad in the middle.
    //
    // This replaced a `background-color` on `.cubie` itself. Because a cubie is only
    // ever translated (never rotated), that background was a quad in the cubie's XY
    // plane at z=0 — half an edge BEHIND the face planes where the seams actually are.
    // It therefore could not seal them (far-side colour showed through), and at grazing
    // angles it painted over the stickers instead (a line across the middle of a face).
    //
    // The wall behind a sticker is SQUARED (see `data-sticker-backed` below and the
    // `.cubie-interior[data-sticker-backed]` rule): a wall is a full-size box and a
    // sticker is a full-size box with a border, so the two have DIFFERENT content boxes,
    // and rounding both by the same fraction puts the sticker's rounded bound OUTSIDE
    // the wall's. The wall then cannot cover the band the sticker's border paints, and
    // the wall's own shape decides whether anything shows through. Square, it covers
    // that band by construction. Sticker-less walls stay rounded to match the stickers'
    // visible corners (requirement R9).
    // `cubie.stickers` is an Immutable Map of StickerId -> Sticker, so it is iterated
    // with `forEach` (as below) rather than built with `Array.prototype.map`.
    const stickerFaces = new Set<Face>();
    cubie.stickers.forEach(sticker => stickerFaces.add(sticker.currentFace));

    const allFaces = [Face.F, Face.B, Face.R, Face.L, Face.U, Face.D];
    allFaces.forEach(face => {
        const wallEl = document.createElement('div');
        wallEl.className = styles['cubie-interior'] ?? 'cubie-interior';
        // `data-face` is the ONE face-identity attribute in this view. It is set on
        // sticker AND wall elements alike, because `resizeCubies` below must recompute
        // a transform for every face element of a cubie, and walls are not interactive
        // so they cannot carry the sticker marker instead.
        wallEl.setAttribute('data-face', face);
        // Marks the wall that has a sticker sharing its face. The pair cannot be
        // expressed as a selector, so the relationship is recorded here rather than
        // re-derived in CSS.
        if (stickerFaces.has(face)) {
            wallEl.setAttribute('data-sticker-backed', '');
        }
        wallEl.style.transform = getFaceTransform(face, cubieHalf);
        wallEl.style.backgroundColor = 'var(--color-domain-cube-interior)';
        wallEl.style.pointerEvents = 'none';
        wallEl.setAttribute('aria-hidden', 'true');
        cubieEl.appendChild(wallEl);
    });

    // Stickers last, so each one paints on top of its own wall. A sticker is lifted a
    // hair in front of that wall (`STICKER_LIFT_PX`): the two must never share a plane,
    // or the browser depth-sorts them inconsistently and the sticker flickers.
    cubie.stickers.forEach(sticker => {
        const faceEl = document.createElement('div');
        faceEl.className = styles['sticker'] ?? 'sticker';
        faceEl.setAttribute('data-sticker-id', sticker.id);
        faceEl.setAttribute('data-face', sticker.currentFace);
        faceEl.style.backgroundColor = resolveCubeColor(sticker.color);
        faceEl.style.transform = stickerTransform(sticker.currentFace, cubieHalf);
        faceEl.addEventListener('click', () => onStickerSelected(sticker.id));

        cubieEl.appendChild(faceEl);
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
 * How far in front of its wall a sticker sits, in pixels.
 *
 * The sticker and the wall behind it describe the same face, so they would be
 * coplanar and the browser would depth-sort them inconsistently — the reported
 * "flicker" shape. A sub-pixel lift is enough to order them deterministically and
 * is not visible at any cube size the view produces.
 *
 * The lift is deliberately a small ABSOLUTE value rather than a fraction of the
 * cubie: it only has to break the tie, so scaling it with the cube would make a
 * larger cube look like its stickers are floating.
 */
export const STICKER_LIFT_PX = 0.5;

/**
 * The transform for a STICKER on a given face.
 *
 * Stickers are the only face elements that need the lift; walls use
 * {@link getFaceTransform} directly. Both the initial render and `resizeCubies`
 * go through here, so the two can never disagree about how far a sticker sits
 * off its wall — the defect this pairing exists to prevent.
 *
 * @param face - The face the sticker sits on
 * @param halfSize - Half the cubie's edge length in pixels
 */
export function stickerTransform(face: Face, halfSize: number): string {
    return getFaceTransform(face, halfSize + STICKER_LIFT_PX);
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
 * Read every cubie element under `cubeElement` into an id-keyed index, in ONE pass.
 *
 * This exists because `cubeElement.querySelector('[data-cubie-id="…"]')` is not O(1) —
 * an attribute selector is matched against every element in the subtree. Measured in
 * jsdom at 7×7 (218 cubies, 1820 elements):
 *
 *   - one such lookup         ~1.25ms
 *   - 218 of them (one pass's worth)   ~826ms   <- a full rebuild is only ~35ms
 *   - building this index instead      ~1.2ms, and 218 lookups from it ~0.1ms
 *
 * So anywhere the same tree is queried per-cubie, the per-lookup form is quadratic work
 * doing the job of a linear one. The index is built at each call rather than cached,
 * deliberately: a cached index would be a second source of truth that every rebuild
 * (resize, size change, model update) would have to remember to invalidate, and getting
 * that wrong yields a silently stale element. Building it costs ~1.2ms against a ~35ms
 * rebuild, so there is nothing to win by caching it.
 *
 * A descendant selector — not `cubeElement.children` — is load-bearing here. During a
 * layer animation `animateLayer` reparents the moving cubies into a pivot div inside
 * the cube element, so a children-only walk finds NONE of the moving layer mid-move
 * (measured: 0/49). Walking descendants still finds them.
 *
 * @param cubeElement - The cube root to index
 * @returns The index, plus how many elements were seen — a count greater than the index
 *   size means two elements claimed the same cubie id, which a caller may treat as an
 *   inconsistent DOM rather than silently writing to one of them.
 */
export function collectCubieElements(cubeElement: HTMLElement): {
    byId: Map<string, HTMLElement>;
    count: number;
} {
    const byId = new Map<string, HTMLElement>();
    let count = 0;
    for (const el of cubeElement.querySelectorAll<HTMLElement>('[data-cubie-id]')) {
        count++;
        const id = el.getAttribute('data-cubie-id');
        if (id) byId.set(id, el);
    }
    return { byId, count };
}

/**
 * Update every existing cubie and face element in place for a new cubie size.
 *
 * Returns `true` when the existing DOM matched the model and was mutated,
 * `false` when the DOM was missing or inconsistent (in which case the
 * caller should fall back to a full rebuild via `initializeCubies`).
 *
 * The function performs a **discovery pass** followed by a **mutation pass**:
 * it first indexes the cubie elements in one walk (see
 * {@link collectCubieElements} for why the index matters) and confirms the
 * result matches the model's surface cubie count. Only then does it mutate
 * widths, transforms, and the border-width custom property.
 *
 * The discovery pass reads the cubie elements ONCE into an id-keyed Map. That is
 * load-bearing, not tidiness: looking each cubie up with
 * `cubeElement.querySelector('[data-cubie-id="…"]')` instead costs ~1.25ms per
 * call in jsdom because the selector is matched against the whole subtree, and a
 * 7x7 has 218 cubies — measured, 436 such lookups took **826ms** of the
 * function's 1620ms, while building the Map cost 1.2ms and the same 218 lookups
 * from it cost 0.1ms. The build was already ~34ms, so the lookup was 47x the
 * work it was saving.
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

    const { byId: elementById, count } = collectCubieElements(state.cubeElement);

    // A duplicate cubie id means the DOM is already inconsistent, so this fails the
    // discovery rather than letting the mutation pass write to one of two competitors.
    if (count !== elementById.size) return false;
    if (elementById.size !== expectedIds.size) return false;

    // Verify every expected cubie is present.
    for (const id of expectedIds) {
        if (!elementById.has(id)) return false;
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
        const el = elementById.get(id);
        if (!el) continue;

        const pos = positionMap.get(id);
        if (!pos) continue;

        const cx = pos.x * cubieSize;
        const cy = (maxCoord - pos.y) * cubieSize;
        const cz = (maxCoord / 2 - pos.z) * cubieSize;

        el.style.width = `${cubieSize}px`;
        el.style.height = `${cubieSize}px`;
        el.style.transform = `translate3d(${cx}px, ${cy}px, ${cz}px)`;

        // Update each face element's transform from its data-face attribute. A sticker
        // is detected by its own marker rather than by class, because a wall sits on the
        // same face and must keep the un-lifted transform — they are two elements per
        // sticker face now, and only one of them is offset.
        const faceEls = el.querySelectorAll('[data-face]');
        faceEls.forEach(faceEl => {
            const faceAttr = faceEl.getAttribute('data-face');
            if (!faceAttr) return;
            const face = faceAttr as Face;
            const isSticker = faceEl.hasAttribute('data-sticker-id');
            (faceEl as HTMLElement).style.transform = isSticker
                ? stickerTransform(face, cubieHalf)
                : getFaceTransform(face, cubieHalf);
        });
    }

    return true;
}

/**
 * Get the cubie DOM elements that belong to a move's layer.
 *
 * Uses the cubie IDs from movedCubies.before (the authoritative set of cubies
 * currently in the layer) to look up DOM elements. This is correct across all
 * move sequences because cubie.id is a stable identity key while cubie.position
 * reflects the current location — the ID-coordinate filtering approach fails
 * after any move because IDs encode initial positions, not current positions.
 *
 * Lives here, next to {@link collectCubieElements}, rather than beside the
 * animation code that calls it: the lookup and the index share one explanation of
 * why per-id `querySelector` is the wrong shape, and splitting them across modules
 * is how the slow form came back the first time.
 *
 * @param cubieIds - Stable cubie IDs in the layer (from movedCubies.before)
 * @param cubeElement - The cube DOM element
 * @returns Array of matching cubie elements
 */
export function getLayerCubieElements(cubieIds: string[], cubeElement: HTMLElement): HTMLElement[] {
    const { byId } = collectCubieElements(cubeElement);
    return cubieIds.reduce<HTMLElement[]>((acc, id) => {
        const el = byId.get(id);
        if (el) acc.push(el);
        return acc;
    }, []);
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

    // One index for the whole rehome, rather than a lookup per moved cubie — see
    // `collectCubieElements`. A 7x7 move rehomes up to 49 cubies, and the per-lookup
    // form cost ~331ms of the post-move path.
    const { byId } = collectCubieElements(cubeElement);

    movedCubies.after.forEach(cubie => {
        // Find the cubie DOM element
        const cubieEl = byId.get(cubie.id);
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
