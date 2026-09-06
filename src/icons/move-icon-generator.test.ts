import { COMMANDS_ICONS, MOVE_ICONS } from './index';
import {
    ensureMoveIconSpriteLoaded,
    generateMoveIconSvg,
    isMoveNotation,
    resolveMoveIcon,
} from './move-icon-generator';

function getMoveSymbolArrowRef(symbolId: string): string | null {
    const arrowUse = document.querySelector<SVGUseElement>(
        `#${symbolId} g use[href^="#arrow-"]:last-of-type`
    );

    return arrowUse?.getAttribute('href') ?? null;
}

describe('move icon generator', () => {
    it('generates F icon wrapper with symbol reference', () => {
        // Act
        const svg = generateMoveIconSvg('F');

        // Assert
        expect(svg).toContain('href="#move-icon-f"');
    });

    it('injects sprite root once into document', () => {
        // Arrange
        const before = document.getElementById('move-icon-sprite-root');
        if (before) before.remove();

        // Act
        generateMoveIconSvg('F');
        const first = document.getElementById('move-icon-sprite-root');

        // Assert
        expect(first).toBeTruthy();

        // Act
        generateMoveIconSvg("F'");
        const all = document.querySelectorAll('#move-icon-sprite-root');

        // Assert
        expect(all).toHaveLength(1);
    });

    it('lazily caches generated move metadata objects', () => {
        // Act
        const first = MOVE_ICONS['F'];
        const second = MOVE_ICONS['F'];

        // Assert
        expect(first).toBe(second);
        expect(first.labelPosition).toBe('top-right');
    });

    it('keeps command icons wired to move icon cache for all move groups', () => {
        // Assert
        expect(COMMANDS_ICONS['move-f']).toBe(MOVE_ICONS['F']);
        expect(COMMANDS_ICONS['move-bp']).toBe(MOVE_ICONS["B'"]);
        expect(COMMANDS_ICONS['move-y2']).toBe(MOVE_ICONS['y2']);
    });

    it('calls all COMMANDS_ICONS getters and MOVE_ICONS proxy for coverage', () => {
        // All possible move notations (from MOVE_ICON_PRESETS)
        const moveKeys = [
            'F',
            "F'",
            'F2',
            "F2'",
            'B',
            "B'",
            'B2',
            "B2'",
            'U',
            "U'",
            'U2',
            "U2'",
            'D',
            "D'",
            'D2',
            "D2'",
            'L',
            "L'",
            'L2',
            "L2'",
            'R',
            "R'",
            'R2',
            "R2'",
            'M',
            "M'",
            'M2',
            "M2'",
            'E',
            "E'",
            'E2',
            "E2'",
            'S',
            "S'",
            'S2',
            "S2'",
            'x',
            "x'",
            'x2',
            "x2'",
            'y',
            "y'",
            'y2',
            "y2'",
            'z',
            "z'",
            'z2',
            "z2'",
        ];
        // Test MOVE_ICONS proxy
        for (const key of moveKeys) {
            const icon = MOVE_ICONS[key];
            expect(icon).toBeDefined();
            expect(typeof icon.svg).toBe('string');
        }
        // Test COMMANDS_ICONS getters
        const commandKeys = Object.keys(COMMANDS_ICONS);
        for (const key of commandKeys) {
            const icon = COMMANDS_ICONS[key];
            expect(icon).toBeDefined();
            expect(typeof icon.svg).toBe('string');
        }
    });

    it('returns undefined for invalid MOVE_ICONS proxy key', () => {
        // Assert
        expect(MOVE_ICONS['not-a-move']).toBeUndefined();
    });

    it('validates move notation type guard', () => {
        // Assert
        expect(isMoveNotation('F')).toBe(true);
        expect(isMoveNotation("R'")).toBe(true);
        expect(isMoveNotation("S2'")).toBe(true);
        expect(isMoveNotation('INVALID')).toBe(false);
        expect(isMoveNotation('')).toBe(false);
    });

    it('uses prime-specific half-turn arrows for directional 2-prime slice icons', () => {
        // Arrange
        const root = document.getElementById('move-icon-sprite-root');
        if (root) root.remove();

        // Act
        generateMoveIconSvg("M2'");
        generateMoveIconSvg("E2'");
        generateMoveIconSvg("S2'");

        // Assert
        expect(getMoveSymbolArrowRef('move-icon-m2p')).toBe('#arrow-x-0-180-prime');
        expect(getMoveSymbolArrowRef('move-icon-e2p')).toBe('#arrow-y-0-180-prime');
        expect(getMoveSymbolArrowRef('move-icon-s2p')).toBe('#arrow-z-0-180-prime');
    });

    it('does not inject sprite when root already exists', () => {
        // Arrange
        const before = document.getElementById('move-icon-sprite-root');
        if (!before) {
            const host = document.createElement('div');
            host.id = 'move-icon-sprite-root';
            document.body.appendChild(host);
        }
        const appendSpy = vi.spyOn(document.body, 'appendChild');

        // Act
        ensureMoveIconSpriteLoaded();

        // Assert
        expect(appendSpy).not.toHaveBeenCalled();
        appendSpy.mockRestore();
    });

    it('returns early when parsed sprite has no first element child', () => {
        // Arrange
        const originalCreateElement = document.createElement.bind(document);
        const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((
            tagName: string
        ) => {
            const element = originalCreateElement(tagName);
            if (tagName.toLowerCase() === 'div') {
                Object.defineProperty(element, 'firstElementChild', {
                    get: () => null,
                    configurable: true,
                });
            }
            return element;
        }) as typeof document.createElement);
        const appendSpy = vi.spyOn(document.body, 'appendChild');

        const root = document.getElementById('move-icon-sprite-root');
        if (root) root.remove();

        // Act
        ensureMoveIconSpriteLoaded();

        // Assert
        expect(appendSpy).not.toHaveBeenCalled();
        createSpy.mockRestore();
        appendSpy.mockRestore();
    });

    it('uses documentElement when body is not available', () => {
        // Arrange
        const originalDocument = globalThis.document;
        const appendChild = vi.fn();
        const spriteNode = document.createElement('svg');
        const fakeWrapper = {
            innerHTML: '',
            firstElementChild: spriteNode,
        };
        const fakeDocument = {
            getElementById: vi.fn().mockReturnValue(null),
            body: null,
            documentElement: { appendChild },
            createElement: vi.fn().mockReturnValue(fakeWrapper),
        } as any;
        vi.stubGlobal('document', fakeDocument);

        // Act
        ensureMoveIconSpriteLoaded();

        // Assert
        expect(fakeDocument.createElement).toHaveBeenCalledWith('div');
        expect(appendChild).toHaveBeenCalledWith(spriteNode);

        vi.stubGlobal('document', originalDocument);
    });

    it('returns early when neither body nor documentElement are available', () => {
        // Arrange
        const originalDocument = globalThis.document;
        const fakeDocument = {
            getElementById: vi.fn().mockReturnValue(null),
            body: null,
            documentElement: null,
            createElement: vi.fn(),
        } as any;
        vi.stubGlobal('document', fakeDocument);

        // Act
        ensureMoveIconSpriteLoaded();

        // Assert
        expect(fakeDocument.createElement).not.toHaveBeenCalled();

        vi.stubGlobal('document', originalDocument);
    });

    it('returns early when sprite root already exists in document lookup', () => {
        // Arrange
        const originalDocument = globalThis.document;
        const fakeDocument = {
            getElementById: vi.fn().mockReturnValue({ id: 'move-icon-sprite-root' }),
            body: document.body,
            documentElement: document.documentElement,
            createElement: vi.fn(),
        } as any;
        vi.stubGlobal('document', fakeDocument);

        // Act
        ensureMoveIconSpriteLoaded();

        // Assert
        expect(fakeDocument.getElementById).toHaveBeenCalledWith('move-icon-sprite-root');
        expect(fakeDocument.createElement).not.toHaveBeenCalled();

        vi.stubGlobal('document', originalDocument);
    });

    it('returns early when document is undefined', () => {
        // Arrange
        const originalDocument = globalThis.document;
        vi.stubGlobal('document', undefined as any);

        // Act & Assert
        expect(() => ensureMoveIconSpriteLoaded()).not.toThrow();

        vi.stubGlobal('document', originalDocument);
    });
});

describe('resolveMoveIcon (size-specific icon fallback)', () => {
    it('returns the exact icon for an exact-preset notation (AE3 / R2)', () => {
        for (const move of ['R', "R'", 'R2', "R2'", 'M', "M'", 'x', 'z2']) {
            const result = resolveMoveIcon(move, 3);
            expect(result, move).toBeDefined();
            expect(result!.kind).toBe('exact');
        }
    });

    it('keeps exact icons unchanged on any size (R8)', () => {
        const three = resolveMoveIcon('R', 3);
        const five = resolveMoveIcon('R', 5);
        expect(five).toEqual(three);
        expect(five!.kind).toBe('exact');
    });

    it('resolves a numbered slice to its family base glyph with the notation label (AE1/R3)', () => {
        const result = resolveMoveIcon('3E', 5);
        expect(result).toEqual({
            kind: 'family',
            symbolId: 'move-icon-e',
            labelPosition: 'top-left',
            label: '3E',
        });

        // Prime variant keeps the E base glyph, never a prime-variant symbol.
        const prime = resolveMoveIcon("2M'", 5);
        expect(prime).toMatchObject({ kind: 'family', symbolId: 'move-icon-m', label: "2M'" });
    });

    it('resolves numbered slices by axis to M/E/S families (AE1)', () => {
        // 4E -> E (Y axis), 3M' -> M (X axis), 4S -> S (Z axis).
        expect(resolveMoveIcon('4E', 5)!.symbolId).toBe('move-icon-e');
        expect(resolveMoveIcon("3M'", 5)!.symbolId).toBe('move-icon-m');
        expect(resolveMoveIcon('4S', 5)!.symbolId).toBe('move-icon-s');
    });

    it('resolves a numbered wide to its face base glyph with the notation label (AE2/R4)', () => {
        const rw2 = resolveMoveIcon('3Rw2', 7);
        expect(rw2).toMatchObject({ kind: 'family', symbolId: 'move-icon-r', label: '3Rw2' });

        const uw = resolveMoveIcon("4Uw'", 7);
        expect(uw).toMatchObject({ kind: 'family', symbolId: 'move-icon-u', label: "4Uw'" });
    });

    it('resolves a bare wide to its face base glyph (R4/Rw on 3x3)', () => {
        // Bare Rw is table-valid on 3x3 (cubeSize >= 2), canonicalFamily 'wide'.
        const rw = resolveMoveIcon('Rw', 3);
        expect(rw).toMatchObject({ kind: 'family', symbolId: 'move-icon-r', label: 'Rw' });
    });

    it('resolves a trailing 2-prime via the 2 table entry (R12/KTD7)', () => {
        // "3E2'" looks up the "3E2" table entry and keeps the 2' spelling as label.
        const e2p = resolveMoveIcon("3E2'", 7);
        expect(e2p).toMatchObject({ kind: 'family', symbolId: 'move-icon-e', label: "3E2'" });

        const rw2p = resolveMoveIcon("Rw2'", 5);
        expect(rw2p).toMatchObject({ kind: 'family', symbolId: 'move-icon-r', label: "Rw2'" });
    });

    it('falls back by wide shape when the numbered-wide gate excludes a size (origin R6 exception)', () => {
        // "2Rw" imported into a 3x3 history: not in the 3x3 table (numbered-wide
        // gate is cubeSize > 3), but still a recognizable wide form -> face glyph.
        const twoRw = resolveMoveIcon('2Rw', 3);
        expect(twoRw).toMatchObject({ kind: 'family', symbolId: 'move-icon-r', label: '2Rw' });
    });

    it('returns undefined for a malformed notation without throwing (R7/AE4)', () => {
        expect(resolveMoveIcon('ZZ9', 5)).toBeUndefined();
        expect(resolveMoveIcon('', 5)).toBeUndefined();
        expect(() => resolveMoveIcon('ZZ9', 5)).not.toThrow();
    });

    it('does not treat a malformed token with a w as a wide move (R7)', () => {
        // ZZ9w has a 'w' but the face-identifying letters are not a valid face.
        expect(resolveMoveIcon('ZZ9w', 5)).toBeUndefined();
    });
});
