/**
 * Runtime gateway between the TS layer and the SVG sprite.
 * Loads the sprite once, exposes move metadata, and emits wrapper SVG markup
 * so UI callers never deal with raw icon strings directly.
 */
import moveIconSprite from './move-icon-sprite.svg?raw';

export type MoveNotation =
    | 'F'
    | "F'"
    | 'F2'
    | 'B'
    | "B'"
    | 'B2'
    | 'U'
    | "U'"
    | 'U2'
    | 'D'
    | "D'"
    | 'D2'
    | 'L'
    | "L'"
    | 'L2'
    | 'R'
    | "R'"
    | 'R2'
    | 'M'
    | "M'"
    | 'M2'
    | 'E'
    | "E'"
    | 'E2'
    | 'S'
    | "S'"
    | 'S2'
    | 'x'
    | "x'"
    | 'x2'
    | 'y'
    | "y'"
    | 'y2'
    | 'z'
    | "z'"
    | 'z2';

export type LabelPosition =
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'center'
    | 'none';

export interface MoveIconPreset {
    readonly labelPosition: LabelPosition;
    readonly symbolId: string;
}

export const MOVE_ICON_PRESETS: Readonly<Record<MoveNotation, MoveIconPreset>> = {
    F: { labelPosition: 'top-right', symbolId: 'move-icon-f' },
    "F'": { labelPosition: 'top-right', symbolId: 'move-icon-fp' },
    F2: { labelPosition: 'top-right', symbolId: 'move-icon-f2' },
    B: { labelPosition: 'bottom-left', symbolId: 'move-icon-b' },
    "B'": { labelPosition: 'bottom-left', symbolId: 'move-icon-bp' },
    B2: { labelPosition: 'bottom-left', symbolId: 'move-icon-b2' },
    U: { labelPosition: 'bottom-right', symbolId: 'move-icon-u' },
    "U'": { labelPosition: 'bottom-right', symbolId: 'move-icon-up' },
    U2: { labelPosition: 'bottom-right', symbolId: 'move-icon-u2' },
    D: { labelPosition: 'top-left', symbolId: 'move-icon-d' },
    "D'": { labelPosition: 'top-left', symbolId: 'move-icon-dp' },
    D2: { labelPosition: 'top-left', symbolId: 'move-icon-d2' },
    L: { labelPosition: 'bottom-right', symbolId: 'move-icon-l' },
    "L'": { labelPosition: 'bottom-right', symbolId: 'move-icon-lp' },
    L2: { labelPosition: 'bottom-right', symbolId: 'move-icon-l2' },
    R: { labelPosition: 'top-left', symbolId: 'move-icon-r' },
    "R'": { labelPosition: 'top-left', symbolId: 'move-icon-rp' },
    R2: { labelPosition: 'top-left', symbolId: 'move-icon-r2' },
    M: { labelPosition: 'bottom-right', symbolId: 'move-icon-m' },
    "M'": { labelPosition: 'bottom-right', symbolId: 'move-icon-mp' },
    M2: { labelPosition: 'bottom-right', symbolId: 'move-icon-m2' },
    E: { labelPosition: 'top-left', symbolId: 'move-icon-e' },
    "E'": { labelPosition: 'top-left', symbolId: 'move-icon-ep' },
    E2: { labelPosition: 'top-left', symbolId: 'move-icon-e2' },
    S: { labelPosition: 'top-right', symbolId: 'move-icon-s' },
    "S'": { labelPosition: 'top-right', symbolId: 'move-icon-sp' },
    S2: { labelPosition: 'top-right', symbolId: 'move-icon-s2' },
    x: { labelPosition: 'top-left', symbolId: 'move-icon-x' },
    "x'": { labelPosition: 'top-left', symbolId: 'move-icon-xp' },
    x2: { labelPosition: 'top-left', symbolId: 'move-icon-x2' },
    y: { labelPosition: 'bottom-right', symbolId: 'move-icon-y' },
    "y'": { labelPosition: 'bottom-right', symbolId: 'move-icon-yp' },
    y2: { labelPosition: 'bottom-right', symbolId: 'move-icon-y2' },
    z: { labelPosition: 'top-right', symbolId: 'move-icon-z' },
    "z'": { labelPosition: 'top-right', symbolId: 'move-icon-zp' },
    z2: { labelPosition: 'top-right', symbolId: 'move-icon-z2' },
};

/**
 * Injects the consolidated SVG sprite into the DOM if it is not present yet.
 * Consumers call this indirectly through {@link generateMoveIconSvg}.
 */
export function ensureMoveIconSpriteLoaded(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById('move-icon-sprite-root')) return;

    const container = document.body || document.documentElement;
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = moveIconSprite;
    const spriteEl = wrapper.firstElementChild;
    if (!spriteEl) return;

    container.appendChild(spriteEl);
}

/** Narrowing helper for dynamic move inputs. */
export function isMoveNotation(value: string): value is MoveNotation {
    return value in MOVE_ICON_PRESETS;
}

/**
 * Creates the small wrapper SVG (the bit that views insert into the DOM).
 * The wrapper references the sprite symbol so it stays tiny and deterministic.
 */
export function generateMoveIconSvg(move: MoveNotation): string {
    ensureMoveIconSpriteLoaded();
    const preset = MOVE_ICON_PRESETS[move];

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="200" height="180" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="#${preset.symbolId}" /></svg>`;
}
