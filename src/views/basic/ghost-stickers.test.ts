/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateManager } from '@/cube/core/state-manager';
import { Face, ReadOnlyCubeModel } from '@/cube/types';

import { blockFor, ghostStripCss, valueOf } from './css-contract-helpers';
import {
    CUBE_EDGE_MAP,
    GhostStickers,
    getGhostOpacity,
    isGhostVisible,
    setGhostOpacityIndex,
    setGhostVisible,
} from './ghost-stickers';

describe('CUBE_EDGE_MAP', () => {
    it('contains exactly 12 entries covering all cube edges', () => {
        expect(CUBE_EDGE_MAP).toHaveLength(12);
    });

    it('each entry has face and edge direction for both sides', () => {
        for (const edge of CUBE_EDGE_MAP) {
            expect(['top', 'bottom', 'left', 'right']).toContain(edge.edgeOnA);
            expect(['top', 'bottom', 'left', 'right']).toContain(edge.edgeOnB);
        }
    });

    it('covers all 6 faces', () => {
        const faces = new Set<Face>();
        for (const edge of CUBE_EDGE_MAP) {
            faces.add(edge.faceA);
            faces.add(edge.faceB);
        }
        expect(faces.size).toBe(6);
        expect(faces).toContain(Face.F);
        expect(faces).toContain(Face.B);
        expect(faces).toContain(Face.R);
        expect(faces).toContain(Face.L);
        expect(faces).toContain(Face.U);
        expect(faces).toContain(Face.D);
    });

    it('each face appears in exactly 4 edges (4 neighbors)', () => {
        const counts = new Map<Face, number>();
        for (const edge of CUBE_EDGE_MAP) {
            counts.set(edge.faceA, (counts.get(edge.faceA) ?? 0) + 1);
            counts.set(edge.faceB, (counts.get(edge.faceB) ?? 0) + 1);
        }
        for (const [, count] of counts) {
            expect(count).toBe(4);
        }
    });
});

describe('GhostStickers', () => {
    let cubeElement: HTMLElement;
    let ghostStickers: GhostStickers;

    beforeEach(() => {
        setGhostVisible(false);

        // Build a minimal cube DOM matching initialization.ts structure
        cubeElement = document.createElement('div');

        const faces: Array<{ face: Face; cssName: string }> = [
            { face: Face.F, cssName: 'front' },
            { face: Face.B, cssName: 'back' },
            { face: Face.R, cssName: 'right' },
            { face: Face.L, cssName: 'left' },
            { face: Face.U, cssName: 'top' },
            { face: Face.D, cssName: 'bottom' },
        ];

        for (const { face, cssName } of faces) {
            const faceDiv = document.createElement('div');
            faceDiv.className = `face ${cssName}`;
            faceDiv.setAttribute('data-face', face);
            // Add 9 stickers
            for (let i = 0; i < 9; i++) {
                const sticker = document.createElement('div');
                sticker.setAttribute('data-face', face);
                sticker.setAttribute('data-basic-pos', String(i));
                sticker.style.backgroundColor = `rgb(${i * 10}, ${i * 20}, ${i * 30})`;
                faceDiv.appendChild(sticker);
            }
            cubeElement.appendChild(faceDiv);
        }

        ghostStickers = new GhostStickers(cubeElement, () => null);
    });

    describe('create()', () => {
        it('generates 24 strip elements (2 per edge × 12 edges)', () => {
            ghostStickers.create();
            const strips = cubeElement.querySelectorAll('[data-host-face]');
            expect(strips.length).toBe(24);
        });

        it('each strip has 3 sticker children', () => {
            ghostStickers.create();
            const strips = cubeElement.querySelectorAll('[data-host-face]');
            for (const strip of strips) {
                expect(strip.children.length).toBe(3);
            }
        });

        it('all strips start hidden', () => {
            ghostStickers.create();
            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            for (const strip of strips) {
                expect(strip.style.display).toBe('none');
            }
        });
    });

    describe('updateVisibleEdges()', () => {
        it('shows strips only on silhouette edges', () => {
            setGhostVisible(true);
            ghostStickers.create();

            // Default orientation: F, U, R visible; B, D, L hidden
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];

            vi.useFakeTimers();
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(250);
            vi.useRealTimers();

            // Check that strips on visible faces pointing to hidden faces are shown
            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            let shownCount = 0;
            for (const strip of strips) {
                const hostFace = strip.getAttribute('data-host-face') as Face;
                const sourceFace = strip.getAttribute('data-source-face') as Face;
                const isVisible = strip.style.display !== 'none';
                if (isVisible) {
                    // Host must be in visible set, source must be in hidden set
                    expect(visibleFaces.some(f => f.face === hostFace)).toBe(true);
                    expect(hiddenFaces.some(f => f.face === sourceFace)).toBe(true);
                    shownCount++;
                }
            }
            // With F,U,R visible and B,D,L hidden:
            // Silhouette edges: F↔L, F↔D, U↔L, U↔B, R↔B, R↔D = 6 strips shown
            // (each from visible face side)
            expect(shownCount).toBe(6);
        });

        it('shows no strips when all faces are visible', () => {
            setGhostVisible(true);
            ghostStickers.create();

            const allVisible = [
                { face: Face.F },
                { face: Face.B },
                { face: Face.R },
                { face: Face.L },
                { face: Face.U },
                { face: Face.D },
            ];
            ghostStickers.updateVisibleEdges(allVisible, []);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            for (const strip of strips) {
                expect(strip.style.display).toBe('none');
            }
        });

        it('cancels a pending fade-in timer when called again before it fires', () => {
            setGhostVisible(true);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];

            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            // Call again immediately — cancels the pending timer
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);
            vi.useRealTimers();

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            const shownCount = Array.from(strips).filter(s => s.style.display !== 'none').length;
            expect(shownCount).toBeGreaterThan(0);
        });

        it('immediately hides showing strips when called with strips already visible', () => {
            setGhostVisible(true);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);

            // Strips are now showing — call again to trigger the isShowing hide branch
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.useRealTimers();

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            for (const strip of strips) {
                expect(strip.style.display).toBe('none');
            }
        });

        it('does nothing when ghosts are toggled off', () => {
            setGhostVisible(false);
            ghostStickers.create();

            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];

            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            for (const strip of strips) {
                expect(strip.style.display).toBe('none');
            }
        });
    });

    describe('updateColors()', () => {
        it('does not throw when model is null', () => {
            setGhostVisible(true);
            ghostStickers.create();

            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            vi.useFakeTimers();
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(250);
            vi.useRealTimers();

            // With null model, updateColors bails out — no colors set, no crash
            expect(() => ghostStickers.updateColors()).not.toThrow();
        });

        it('does nothing when ghosts are hidden', () => {
            setGhostVisible(false);
            ghostStickers.create();
            expect(() => ghostStickers.updateColors()).not.toThrow();
        });

        it('sets backgroundColor on ghost sticker children when model is available', () => {
            const stateManager = new StateManager(3);
            const model: ReadOnlyCubeModel = {
                getCurrentState: () => stateManager.getCurrentState(),
                getOriginalState: () => stateManager.getCurrentState(),
                isSolved: () => false,
                getMoveHistory: vi.fn() as any,
            };
            const gs = new GhostStickers(cubeElement, () => model);
            setGhostVisible(true);
            gs.create();

            vi.useFakeTimers();
            gs.updateVisibleEdges(
                [{ face: Face.F }, { face: Face.U }, { face: Face.R }],
                [{ face: Face.B }, { face: Face.D }, { face: Face.L }]
            );
            vi.advanceTimersByTime(201);
            vi.useRealTimers();

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            let coloredCount = 0;
            for (const strip of strips) {
                if (strip.style.display !== 'none') {
                    for (const child of strip.children) {
                        if ((child as HTMLElement).style.backgroundColor) coloredCount++;
                    }
                }
            }
            expect(coloredCount).toBeGreaterThan(0);
        });
    });

    describe('setVisible()', () => {
        it('hides showing strips via transitionend when animate=true', () => {
            setGhostVisible(true);
            ghostStickers.create();

            vi.useFakeTimers();
            ghostStickers.updateVisibleEdges(
                [{ face: Face.F }, { face: Face.U }, { face: Face.R }],
                [{ face: Face.B }, { face: Face.D }, { face: Face.L }]
            );
            vi.advanceTimersByTime(201);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            const showingStrip = Array.from(strips).find(s => s.style.display !== 'none');
            expect(showingStrip).toBeDefined();

            ghostStickers.setVisible(false, true);

            const firstChild = showingStrip!.firstElementChild as HTMLElement;
            firstChild.dispatchEvent(new Event('transitionend'));

            expect(showingStrip!.style.display).toBe('none');
            vi.useRealTimers();
        });

        it('hides showing strips via 400ms setTimeout fallback when no transitionend fires', () => {
            setGhostVisible(true);
            ghostStickers.create();

            vi.useFakeTimers();
            ghostStickers.updateVisibleEdges(
                [{ face: Face.F }, { face: Face.U }, { face: Face.R }],
                [{ face: Face.B }, { face: Face.D }, { face: Face.L }]
            );
            vi.advanceTimersByTime(201);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            const showingStrip = Array.from(strips).find(s => s.style.display !== 'none');
            expect(showingStrip).toBeDefined();

            ghostStickers.setVisible(false, true);
            vi.advanceTimersByTime(401);

            expect(showingStrip!.style.display).toBe('none');
            vi.useRealTimers();
        });
    });

    describe('toggle()', () => {
        it('flips visibility state', () => {
            ghostStickers.create();
            expect(ghostStickers.isVisible()).toBe(false);

            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.toggle(visibleFaces, hiddenFaces);

            expect(ghostStickers.isVisible()).toBe(true);
        });

        it('hides strips when toggling off', () => {
            setGhostVisible(true);
            ghostStickers.create();

            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);

            // Cycle: 75% → 100% → off
            ghostStickers.toggle();
            expect(ghostStickers.isVisible()).toBe(true);
            ghostStickers.toggle();
            expect(ghostStickers.isVisible()).toBe(false);
        });

        it('cycles opacity off → 75% → 100% → off asserting getGhostOpacity()', () => {
            setGhostVisible(false);
            setGhostOpacityIndex(0);
            ghostStickers.create();

            ghostStickers.toggle();
            expect(getGhostOpacity()).toBe(0.75);

            ghostStickers.toggle();
            expect(getGhostOpacity()).toBe(1.0);

            vi.useFakeTimers();
            ghostStickers.toggle();
            vi.advanceTimersByTime(401);
            vi.useRealTimers();

            expect(isGhostVisible()).toBe(false);
        });

        it('applies opacity directly when already visible (wasVisible=true path)', () => {
            setGhostVisible(true);
            setGhostOpacityIndex(1);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);

            // Toggle from 75% → 100% while strips are already showing
            ghostStickers.toggle(visibleFaces, hiddenFaces);
            expect(getGhostOpacity()).toBe(1.0);

            vi.useRealTimers();
        });
    });

    describe('setOpacityIndex()', () => {
        it('applies opacity directly when strips are already showing (wasVisible=true)', () => {
            setGhostVisible(true);
            setGhostOpacityIndex(1);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);

            // Strips are showing — setOpacityIndex takes the wasVisible=true → applyOpacity path
            ghostStickers.setOpacityIndex(2, visibleFaces, hiddenFaces);
            expect(getGhostOpacity()).toBe(1.0);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            const showingStrip = Array.from(strips).find(s => s.style.display !== 'none');
            expect(showingStrip).toBeDefined();
            expect((showingStrip!.firstElementChild as HTMLElement).style.opacity).toBe('1');

            vi.useRealTimers();
        });

        it('shows strips when turning on from off (wasVisible=false path)', () => {
            setGhostVisible(false);
            setGhostOpacityIndex(0);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];

            // Turn on from off
            ghostStickers.setOpacityIndex(1, visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);

            const strips = cubeElement.querySelectorAll<HTMLElement>('[data-host-face]');
            const shownCount = Array.from(strips).filter(s => s.style.display !== 'none').length;
            expect(shownCount).toBeGreaterThan(0);

            vi.useRealTimers();
        });

        it('hides all strips when opacity index set to off (else-if branch)', () => {
            setGhostVisible(true);
            setGhostOpacityIndex(1);
            ghostStickers.create();

            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.updateVisibleEdges(visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);

            // Turn off — no visibleFaces provided, !isGhostVisible() path
            ghostStickers.setOpacityIndex(0);
            vi.advanceTimersByTime(401);

            expect(isGhostVisible()).toBe(false);
            vi.useRealTimers();
        });
    });

    describe('shared state', () => {
        it('isGhostVisible reflects module-level state', () => {
            expect(isGhostVisible()).toBe(false);
            setGhostVisible(true);
            expect(isGhostVisible()).toBe(true);
            setGhostVisible(false);
        });
    });

    describe('getShowGhosts() / getOpacityIndex() / setShowGhosts()', () => {
        it('getShowGhosts reflects current ghost visibility', () => {
            setGhostVisible(false);
            expect(ghostStickers.getShowGhosts()).toBe(false);
            setGhostVisible(true);
            expect(ghostStickers.getShowGhosts()).toBe(true);
            setGhostVisible(false);
        });

        it('getOpacityIndex returns current opacity index', () => {
            setGhostOpacityIndex(0);
            expect(ghostStickers.getOpacityIndex()).toBe(0);
            setGhostOpacityIndex(2);
            expect(ghostStickers.getOpacityIndex()).toBe(2);
            setGhostOpacityIndex(0);
        });

        it('setShowGhosts(true, visibleFaces, hiddenFaces) shows strips', () => {
            ghostStickers.create();
            setGhostVisible(false);
            vi.useFakeTimers();
            const visibleFaces = [{ face: Face.F }, { face: Face.U }, { face: Face.R }];
            const hiddenFaces = [{ face: Face.B }, { face: Face.D }, { face: Face.L }];
            ghostStickers.setShowGhosts(true, visibleFaces, hiddenFaces);
            vi.advanceTimersByTime(201);
            vi.useRealTimers();
            expect(isGhostVisible()).toBe(true);
        });

        it('setShowGhosts(false) hides all strips via setVisible', () => {
            setGhostVisible(true);
            ghostStickers.create();
            ghostStickers.setShowGhosts(false);
            expect(isGhostVisible()).toBe(false);
        });

        it('setShowGhosts(true) without faces calls setVisible(true)', () => {
            setGhostVisible(false);
            ghostStickers.create();
            ghostStickers.setShowGhosts(true);
            expect(isGhostVisible()).toBe(true);
            setGhostVisible(false);
        });
    });
});

// Regression guard for the ghost strips' grid metrics.
//
// Reported defect: "ghost stickers are shorter along their longer side than real
// stickers". A ghost cell stretched along an edge must be exactly as long as a real
// sticker, because a real sticker is one cubie: `anchorSize / n`. The strips are children
// of the `ghost-anchor` host, which spans a whole face, so `flex: 1` divides it into n
// cells — and that is correct ONLY if the strip carries no inset and no gap.
//
// It used to carry both, left over from the OLD face-based grid this view used before the
// per-cubie cutover: a 3.33% inset per side (the old face padding) and `gap: 3%` between
// cells (the old per-slot gap). Those are wrong against the current grid, which has no
// padding and no gap — the visible separation between facelets is each sticker's own inset
// border, not space in the layout. Measured in a real browser, the leftover inset plus a
// gap per cell shrank every ghost to 89% of a sticker at 3x3 and 75% at 7x7, the error
// growing with n because the gap count does.
//
// Why this parses the stylesheet rather than asserting on rendered geometry: jsdom
// implements no layout, so a ghost cell's width is always 0 there and a rendered assertion
// would prove nothing. What IS checkable — and what actually regressed — is that the strip
// declares no inset and no gap. The real-browser measurement is the other half of the
// guard, and is how the 89%-to-75% figures above were obtained.
describe('ghost strip grid contract (ghost length must match a sticker)', () => {
    // The selector text must match the sheet's own quoting: this stylesheet writes
    // attribute values with SINGLE quotes (`[data-edge='top']`). A double-quoted search
    // throws "no rule found" rather than silently passing, which is the point of `blockFor`
    // throwing — but it is a difference worth stating here so the next edit does not have
    // to rediscover it.
    const ROW_STRIP = ".ghost-strip[data-edge='top'], .ghost-strip[data-edge='bottom']";
    const COL_STRIP = ".ghost-strip[data-edge='left'], .ghost-strip[data-edge='right']";
    const ROW_CELL =
        ".ghost-strip[data-edge='top'] .ghost-sticker, .ghost-strip[data-edge='bottom'] .ghost-sticker";
    const COL_CELL =
        ".ghost-strip[data-edge='left'] .ghost-sticker, .ghost-strip[data-edge='right'] .ghost-sticker";

    /**
     * Split a two-value `border-width` into its parts, respecting parentheses.
     *
     * A plain `split(/\s+/)` is wrong here and was caught by its own test: the value it has
     * to parse is `1px var(--cubie-border-width, 3px)`, and that fallback contains a space,
     * so a naive split yields `['1px', 'var(--cubie-border-width,', '3px)']`. Splitting only
     * on whitespace OUTSIDE parentheses keeps the `var()` expression as one token.
     */
    function splitBorderWidth(value: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = '';
        for (const ch of value) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (/\s/.test(ch) && depth === 0) {
                if (current) parts.push(current);
                current = '';
                continue;
            }
            current += ch;
        }
        if (current) parts.push(current);
        return parts;
    }

    it('insets the strip by nothing, so n cells tile the full face edge', () => {
        const strip = blockFor(ROW_STRIP, ghostStripCss);
        expect(valueOf(strip, 'left'), 'a left inset shortens every cell').toBe('0');
        expect(valueOf(strip, 'right'), 'a right inset shortens every cell').toBe('0');
    });

    it('declares no gap between ghost cells', () => {
        // A gap is the worse of the two leftovers: it is a fixed FRACTION of the strip but
        // there are n-1 of them, so the shortfall grows with the cube size (11% at 3x3 to
        // 25% at 7x7), which is exactly the shape the defect was reported with.
        expect(
            valueOf(blockFor(ROW_STRIP, ghostStripCss), 'gap'),
            'a gap steals length from every cell'
        ).toBe('0');
        expect(
            valueOf(blockFor(COL_STRIP, ghostStripCss), 'gap'),
            'a gap steals length from every cell'
        ).toBe('0');
    });

    it('does not inset the vertical strips either', () => {
        // The same leftover padding was applied top/bottom on the column strips; both edges
        // have to stay clean or the vertical ghosts stay short while the horizontal ones
        // are fixed.
        const strip = blockFor(COL_STRIP, ghostStripCss);
        expect(valueOf(strip, 'top'), 'a top inset shortens every cell').toBe('0');
        expect(valueOf(strip, 'bottom'), 'a bottom inset shortens every cell').toBe('0');
    });

    it('keeps the cells flexed, so they share the strip equally', () => {
        // The fix removes the inset and gap; the equal division itself is what must remain.
        // If the cells stopped being flexible the strip would no longer fill the edge and
        // the grid would drift regardless of the other three assertions.
        expect(valueOf(blockFor('.ghost-sticker', ghostStripCss), 'flex')).toBe('1');
    });

    it('uses the SAME border width as a real sticker along the band, so cells separate', () => {
        // A ghost cell is a thin BAND, and its two pairs of edges do genuinely different
        // jobs, so they take different widths:
        //
        //   ALONG the band  — the separators between cells. Neither element has layout space
        //     between neighbours (stickers sit at `i * cubieSize`, the strip's `gap` is 0),
        //     so the ONLY separation between two facelets is their two borders meeting. These
        //     edges must therefore match a real sticker's border, which is 8% of the cubie,
        //     clamped to whole pixels and published as `--cubie-border-width` (4px at 3x3 down
        //     to 2px at 5x5+). A hardcoded width here cannot track the cubie and diverges.
        //
        //   ACROSS the band — the band's own thickness. Nothing separates along it, so a wide
        //     border there buys no separation and simply eats the colour: at 3x3 a uniform 4px
        //     left 2px of colour out of a 10px band (80% border).
        const rowSticker = blockFor(ROW_CELL, ghostStripCss);
        const colSticker = blockFor(COL_CELL, ghostStripCss);

        // Horizontal band: width, height = across the band, along it. So the SECOND value is
        // the separator and must be the custom property.
        const rowWidth = valueOf(rowSticker, 'border-width');
        expect(rowWidth, 'the row strip must declare its two widths').toBeDefined();
        expect(
            splitBorderWidth(rowWidth!)[1],
            'the separator width (along the band) must come from the cubie-scaled property'
        ).toContain('var(--cubie-border-width');

        // Vertical band: the axes swap, so the FIRST value is the separator.
        const colWidth = valueOf(colSticker, 'border-width');
        expect(colWidth, 'the column strip must declare its two widths').toBeDefined();
        expect(
            splitBorderWidth(colWidth!)[0],
            'the separator width (along the band) must come from the cubie-scaled property'
        ).toContain('var(--cubie-border-width');

        // And the real sticker must still be the one that publishes it, or the ghost reads a
        // property nothing sets.
        expect(
            valueOf(blockFor('.sticker'), 'border'),
            'the sticker border is the reference'
        ).toContain('var(--cubie-border-width');
    });

    it('keeps the across-the-band border minimal, so the colour is not eaten', () => {
        // The other half of the same trade-off. A full-width border on these edges consumed
        // most of a ~10px band, leaving the hint unreadable. 1px outlines the band without
        // competing with the colour.
        const rowWidth = valueOf(blockFor(ROW_CELL, ghostStripCss), 'border-width');
        const colWidth = valueOf(blockFor(COL_CELL, ghostStripCss), 'border-width');

        expect(splitBorderWidth(rowWidth!)[0], 'across the band, row strip').toBe('1px');
        expect(splitBorderWidth(colWidth!)[1], 'across the band, column strip').toBe('1px');

        // The base rule must still set the style and colour, or the per-orientation rules
        // above set only widths and the border does not render at all.
        const base = blockFor('.ghost-sticker', ghostStripCss);
        expect(valueOf(base, 'border-style'), 'the border must render').toBe('solid');
        expect(valueOf(base, 'border-color'), 'the border must be visible').toBeDefined();
    });

    it('carries no glow, so the hint does not halo over the cube', () => {
        // `.ghost-sticker` used to set `box-shadow: 0 0 4px 1px var(--color-ghost-sticker-glow)`
        // — a white glow at 30% opacity, which read as a halo around every hint facelet. It was
        // the ONLY consumer of that token and the feature's implementation note never mentions
        // it, so it was a leftover rather than a deliberate cue. `stickerBorderWidth` and the
        // strip's border already make the hint legible.
        //
        // Pinned because a glow is easy to reintroduce while tuning visibility, and because it
        // is invisible in jsdom — a rendered assertion here would prove nothing either way.
        const base = blockFor('.ghost-sticker', ghostStripCss);
        expect(
            valueOf(base, 'box-shadow'),
            'a shadow here is the halo that was removed'
        ).toBeUndefined();
        expect(valueOf(base, 'filter'), 'a filter could re-introduce a glow').toBeUndefined();
        expect(valueOf(base, 'text-shadow'), 'the hint has no text to shadow').toBeUndefined();
    });
});
