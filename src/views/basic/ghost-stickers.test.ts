import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Face } from '@/cube/types';

import { CUBE_EDGE_MAP, GhostStickers, isGhostVisible, setGhostVisible } from './ghost-stickers';

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
    });

    describe('shared state', () => {
        it('isGhostVisible reflects module-level state', () => {
            expect(isGhostVisible()).toBe(false);
            setGhostVisible(true);
            expect(isGhostVisible()).toBe(true);
            setGhostVisible(false);
        });
    });
});
