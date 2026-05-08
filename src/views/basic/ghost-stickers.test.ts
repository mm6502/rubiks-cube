import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateManager } from '@/cube/core/state-manager';
import { Face, ReadOnlyCubeModel } from '@/cube/types';

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
            faceDiv.setAttribute('data-basic-face', face);
            // Add 9 stickers
            for (let i = 0; i < 9; i++) {
                const sticker = document.createElement('div');
                sticker.setAttribute('data-basic-face', face);
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
