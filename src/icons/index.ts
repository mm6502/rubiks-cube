import {
    LabelPosition,
    MOVE_ICON_PRESETS,
    MoveNotation,
    generateMoveIconSvg,
    isMoveNotation,
} from './move-icon-generator';

/**
 * Metadata for move icons including SVG content and label positioning
 */
export interface MoveIconMetadata {
    svg: string;
    labelPosition?: LabelPosition;
}

/** Caches generated SVG wrappers + label info per move to avoid regeneration. */
const moveIconCache = new Map<MoveNotation, MoveIconMetadata>();

function getMoveIcon(move: MoveNotation): MoveIconMetadata {
    const cached = moveIconCache.get(move);
    if (cached) return cached;

    const preset = MOVE_ICON_PRESETS[move];
    const generated: MoveIconMetadata = {
        svg: generateMoveIconSvg(move),
        labelPosition: preset.labelPosition,
    };

    moveIconCache.set(move, generated);
    return generated;
}

/**
 * Map of move notation to icon metadata.
 * Used by moves-view for history display and view-manager for command buttons.
 */
export const MOVE_ICONS: Record<string, MoveIconMetadata> = new Proxy(
    {},
    {
        get(_target, property: string): MoveIconMetadata | undefined {
            if (!isMoveNotation(property)) return undefined;
            return getMoveIcon(property);
        },
    }
);

/**
 * Icon map using kebab-case keys with metadata.
 * Used by view-manager for button icons.
 * Allows to add not move related command icons in the future.
 */
export const COMMANDS_ICONS: Record<string, MoveIconMetadata> = {
    get 'move-f'() {
        return MOVE_ICONS['F'];
    },
    get 'move-fp'() {
        return MOVE_ICONS["F'"];
    },
    get 'move-f2'() {
        return MOVE_ICONS['F2'];
    },
    get 'move-b'() {
        return MOVE_ICONS['B'];
    },
    get 'move-bp'() {
        return MOVE_ICONS["B'"];
    },
    get 'move-b2'() {
        return MOVE_ICONS['B2'];
    },
    get 'move-u'() {
        return MOVE_ICONS['U'];
    },
    get 'move-up'() {
        return MOVE_ICONS["U'"];
    },
    get 'move-u2'() {
        return MOVE_ICONS['U2'];
    },
    get 'move-d'() {
        return MOVE_ICONS['D'];
    },
    get 'move-dp'() {
        return MOVE_ICONS["D'"];
    },
    get 'move-d2'() {
        return MOVE_ICONS['D2'];
    },
    get 'move-l'() {
        return MOVE_ICONS['L'];
    },
    get 'move-lp'() {
        return MOVE_ICONS["L'"];
    },
    get 'move-l2'() {
        return MOVE_ICONS['L2'];
    },
    get 'move-r'() {
        return MOVE_ICONS['R'];
    },
    get 'move-rp'() {
        return MOVE_ICONS["R'"];
    },
    get 'move-r2'() {
        return MOVE_ICONS['R2'];
    },
    get 'move-m'() {
        return MOVE_ICONS['M'];
    },
    get 'move-mp'() {
        return MOVE_ICONS["M'"];
    },
    get 'move-m2'() {
        return MOVE_ICONS['M2'];
    },
    get 'move-e'() {
        return MOVE_ICONS['E'];
    },
    get 'move-ep'() {
        return MOVE_ICONS["E'"];
    },
    get 'move-e2'() {
        return MOVE_ICONS['E2'];
    },
    get 'move-s'() {
        return MOVE_ICONS['S'];
    },
    get 'move-sp'() {
        return MOVE_ICONS["S'"];
    },
    get 'move-s2'() {
        return MOVE_ICONS['S2'];
    },
    get 'move-x'() {
        return MOVE_ICONS['x'];
    },
    get 'move-xp'() {
        return MOVE_ICONS["x'"];
    },
    get 'move-x2'() {
        return MOVE_ICONS['x2'];
    },
    get 'move-y'() {
        return MOVE_ICONS['y'];
    },
    get 'move-yp'() {
        return MOVE_ICONS["y'"];
    },
    get 'move-y2'() {
        return MOVE_ICONS['y2'];
    },
    get 'move-z'() {
        return MOVE_ICONS['z'];
    },
    get 'move-zp'() {
        return MOVE_ICONS["z'"];
    },
    get 'move-z2'() {
        return MOVE_ICONS['z2'];
    },
};

// Global counter to ensure every isolated SVG gets a unique suffix.
let _svgIdCounter = 0;

/**
 * Rewrites all IDs in an inline SVG string to be globally unique.
 * Prevents ID collisions when multiple SVGs are injected into the same HTML
 * document — otherwise markers (arrowheads), filters and other <defs>
 * references resolve to the wrong element from a previously injected SVG.
 */
export function isolateSvgIds(svg: string): string {
    const suffix = `i${++_svgIdCounter}`;
    const idMap = new Map<string, string>();

    const idsRewritten = svg.replace(/\bid="([^"]+)"/g, (_match, id: string) => {
        const next = `${id}-${suffix}`;
        idMap.set(id, next);
        return `id="${next}"`;
    });

    return idsRewritten
        .replace(/\bhref="#([^"]+)"/g, (match, id: string) => {
            const mapped = idMap.get(id);
            return mapped ? `href="#${mapped}"` : match;
        })
        .replace(/url\(#([^)]+)\)/g, (match, id: string) => {
            const mapped = idMap.get(id);
            return mapped ? `url(#${mapped})` : match;
        });
}
