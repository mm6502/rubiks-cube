import { COMMANDS_ICONS, MOVE_ICONS } from './index';
import {
    ensureMoveIconSpriteLoaded,
    generateMoveIconSvg,
    isMoveNotation,
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
