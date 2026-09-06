/**
 * Runtime gateway between the TS layer and the SVG sprite.
 * Loads the sprite once, exposes move metadata, and emits wrapper SVG markup
 * so UI callers never deal with raw icon strings directly.
 */
import { getCubeInvariants } from '@/cube/core/cube-invariants';
import { Axis } from '@/cube/types';
import type { MoveDefinition } from '@/cube/types';

import moveIconSprite from './move-icon-sprite.svg?raw';

export type MoveNotation =
    | 'F'
    | "F'"
    | 'F2'
    | "F2'"
    | 'B'
    | "B'"
    | 'B2'
    | "B2'"
    | 'U'
    | "U'"
    | 'U2'
    | "U2'"
    | 'D'
    | "D'"
    | 'D2'
    | "D2'"
    | 'L'
    | "L'"
    | 'L2'
    | "L2'"
    | 'R'
    | "R'"
    | 'R2'
    | "R2'"
    | 'M'
    | "M'"
    | 'M2'
    | "M2'"
    | 'E'
    | "E'"
    | 'E2'
    | "E2'"
    | 'S'
    | "S'"
    | 'S2'
    | "S2'"
    | 'x'
    | "x'"
    | 'x2'
    | "x2'"
    | 'y'
    | "y'"
    | 'y2'
    | "y2'"
    | 'z'
    | "z'"
    | 'z2'
    | "z2'";

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
    "F2'": { labelPosition: 'top-right', symbolId: 'move-icon-f2p' },
    B: { labelPosition: 'bottom-left', symbolId: 'move-icon-b' },
    "B'": { labelPosition: 'bottom-left', symbolId: 'move-icon-bp' },
    B2: { labelPosition: 'bottom-left', symbolId: 'move-icon-b2' },
    "B2'": { labelPosition: 'bottom-left', symbolId: 'move-icon-b2p' },
    U: { labelPosition: 'bottom-right', symbolId: 'move-icon-u' },
    "U'": { labelPosition: 'bottom-right', symbolId: 'move-icon-up' },
    U2: { labelPosition: 'bottom-right', symbolId: 'move-icon-u2' },
    "U2'": { labelPosition: 'bottom-right', symbolId: 'move-icon-u2p' },
    D: { labelPosition: 'top-left', symbolId: 'move-icon-d' },
    "D'": { labelPosition: 'top-left', symbolId: 'move-icon-dp' },
    D2: { labelPosition: 'top-left', symbolId: 'move-icon-d2' },
    "D2'": { labelPosition: 'top-left', symbolId: 'move-icon-d2p' },
    L: { labelPosition: 'bottom-right', symbolId: 'move-icon-l' },
    "L'": { labelPosition: 'bottom-right', symbolId: 'move-icon-lp' },
    L2: { labelPosition: 'bottom-right', symbolId: 'move-icon-l2' },
    "L2'": { labelPosition: 'bottom-right', symbolId: 'move-icon-l2p' },
    R: { labelPosition: 'top-left', symbolId: 'move-icon-r' },
    "R'": { labelPosition: 'top-left', symbolId: 'move-icon-rp' },
    R2: { labelPosition: 'top-left', symbolId: 'move-icon-r2' },
    "R2'": { labelPosition: 'top-left', symbolId: 'move-icon-r2p' },
    M: { labelPosition: 'bottom-right', symbolId: 'move-icon-m' },
    "M'": { labelPosition: 'bottom-right', symbolId: 'move-icon-mp' },
    M2: { labelPosition: 'bottom-right', symbolId: 'move-icon-m2' },
    "M2'": { labelPosition: 'bottom-right', symbolId: 'move-icon-m2p' },
    E: { labelPosition: 'top-left', symbolId: 'move-icon-e' },
    "E'": { labelPosition: 'top-left', symbolId: 'move-icon-ep' },
    E2: { labelPosition: 'top-left', symbolId: 'move-icon-e2' },
    "E2'": { labelPosition: 'top-left', symbolId: 'move-icon-e2p' },
    S: { labelPosition: 'top-right', symbolId: 'move-icon-s' },
    "S'": { labelPosition: 'top-right', symbolId: 'move-icon-sp' },
    S2: { labelPosition: 'top-right', symbolId: 'move-icon-s2' },
    "S2'": { labelPosition: 'top-right', symbolId: 'move-icon-s2p' },
    x: { labelPosition: 'top-left', symbolId: 'move-icon-x' },
    "x'": { labelPosition: 'top-left', symbolId: 'move-icon-xp' },
    x2: { labelPosition: 'top-left', symbolId: 'move-icon-x2' },
    "x2'": { labelPosition: 'top-left', symbolId: 'move-icon-x2p' },
    y: { labelPosition: 'bottom-right', symbolId: 'move-icon-y' },
    "y'": { labelPosition: 'bottom-right', symbolId: 'move-icon-yp' },
    y2: { labelPosition: 'bottom-right', symbolId: 'move-icon-y2' },
    "y2'": { labelPosition: 'bottom-right', symbolId: 'move-icon-y2p' },
    z: { labelPosition: 'top-right', symbolId: 'move-icon-z' },
    "z'": { labelPosition: 'top-right', symbolId: 'move-icon-zp' },
    z2: { labelPosition: 'top-right', symbolId: 'move-icon-z2' },
    "z2'": { labelPosition: 'top-right', symbolId: 'move-icon-z2p' },
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
 * Creates the small wrapper SVG (the bit that views insert into the DOM) for a
 * sprite symbol id. The wrapper references the sprite symbol so it stays tiny
 * and deterministic.
 */
export function generateSvgForSymbol(symbolId: string): string {
    ensureMoveIconSpriteLoaded();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="200" height="180" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="#${symbolId}" /></svg>`;
}

/**
 * Creates the small wrapper SVG for an exact-preset move notation.
 */
export function generateMoveIconSvg(move: MoveNotation): string {
    return generateSvgForSymbol(MOVE_ICON_PRESETS[move].symbolId);
}

/* ---------------------------------------------------------------------------
 * Icon fallback resolution for size-specific moves
 *
 * R1/R3/R4: a valid notation with no exact preset (numbered slices like "3E",
 * wide moves like "Rw"/"2Rw", and their ' / 2 / 2' forms) still renders as the
 * base glyph of its canonical family, labeled with the full notation. Validity
 * and family come from the cube-invariants move table (R6), never from
 * duplicated pattern rules in the icon layer.
 * ------------------------------------------------------------------------- */

/**
 * Base-family letter for a slice move, per rotation axis. A slice's axis fully
 * determines its family glyph: X → M, Y → E, Z → S.
 */
const SLICE_BASE_BY_AXIS: Readonly<Record<Axis, MoveNotation>> = {
    [Axis.X]: 'M',
    [Axis.Y]: 'E',
    [Axis.Z]: 'S',
};

/**
 * Base-family letter for a whole-cube rotation, per rotation axis:
 * X → x, Y → y, Z → z.
 */
const ROTATION_BASE_BY_AXIS: Readonly<Record<Axis, MoveNotation>> = {
    [Axis.X]: 'x',
    [Axis.Y]: 'y',
    [Axis.Z]: 'z',
};

/**
 * Base-family letter for a face or wide move, keyed by axis and by which end
 * its outer layer sits on. R/L and U/D and F/B share an axis, so the layer side
 * (last vs 0) disambiguates them — the same `baseOnLast` distinction the move
 * builder centralizes in FACE_TURNS.
 */
const FACE_BASE_BY_AXIS_AND_SIDE: Readonly<
    Record<Axis, { readonly last: MoveNotation; readonly zero: MoveNotation }>
> = {
    [Axis.X]: { last: 'R', zero: 'L' },
    [Axis.Y]: { last: 'U', zero: 'D' },
    [Axis.Z]: { last: 'B', zero: 'F' },
};

/**
 * Map a validated move definition to the *base* preset (base symbol id + label
 * position) of its canonical family. Only the base glyph is ever returned —
 * never a `'`/`2`/`2'` suffix-variant glyph — matching R3/R4.
 */
function familyBasePresetFor(
    definition: MoveDefinition,
    cubeSize: number
): MoveIconPreset | undefined {
    const last = cubeSize - 1;
    const onLastLayer = definition.layerIndices[0] === last;
    let baseLetter: MoveNotation | undefined;

    switch (definition.canonicalFamily) {
        case 'slice':
            baseLetter = SLICE_BASE_BY_AXIS[definition.axis];
            break;
        case 'rotation':
            baseLetter = ROTATION_BASE_BY_AXIS[definition.axis];
            break;
        case 'face':
        case 'wide':
            baseLetter = FACE_BASE_BY_AXIS_AND_SIDE[definition.axis][onLastLayer ? 'last' : 'zero'];
            break;
        default:
            return undefined;
    }

    return MOVE_ICON_PRESETS[baseLetter];
}

/**
 * The move table stores base/`'`/`2` forms only; a trailing `2'` spelling is
 * executable but absent from it (the parser resolves `2'` by looking up the `2`
 * form and negating the angle). Mirror that here so valid `2'` notations
 * ("3E2'", "Rw2'", "R2'") still resolve instead of hitting the text fallback.
 */
function lookupName(move: string): string {
    return move.endsWith("2'") ? `${move.slice(0, -2)}2` : move;
}

/**
 * Narrow defensive fallback (origin R6 exception, KTD6 step 4): a wide-shaped
 * notation absent from the active size's move table — reachable only on sizes
 * the numbered-wide gate excludes, e.g. a "2Rw" imported into a 3×3 history —
 * still resolves to its face base glyph. Only the wide family is granted by
 * shape; every other notation must be table-valid to resolve.
 */
const WIDE_SHAPED_NOTATION = /^(\d*)([UDLRFB])w(?:2'|['2])?$/i;

/**
 * Result of resolving a history notation to an icon. `undefined` means no icon
 * could be determined and the caller keeps the text fallback (R7).
 */
export type MoveIconResolution =
    | {
          /** The notation has an exact preset; its glyph is used unchanged. */
          readonly kind: 'exact';
          readonly symbolId: string;
          readonly labelPosition: LabelPosition;
      }
    | {
          /** The notation resolved to a canonical family base glyph + notation label. */
          readonly kind: 'family';
          readonly symbolId: string;
          readonly labelPosition: LabelPosition;
          /** The full original notation, shown as the label overlay. */
          readonly label: string;
      };

/**
 * Resolve a move notation (given the active cube size) to the icon that should
 * represent it. Pure — never renders or touches the DOM.
 *
 * Resolution order: (1) an exact preset always wins (KTD2/R2/R8); (2) otherwise
 * the move is looked up in the active size's move table (a trailing `2'` is
 * normalized to `2` for the lookup) and its canonical family determines the
 * base glyph (R6/R3/R4); (3) a wide-shaped notation still absent from the table
 * falls back to its face base glyph; (4) anything else returns `undefined` (R7
 * text fallback).
 */
export function resolveMoveIcon(move: string, cubeSize: number): MoveIconResolution | undefined {
    // 1. Exact preset match always wins.
    if (isMoveNotation(move)) {
        const preset = MOVE_ICON_PRESETS[move];
        return { kind: 'exact', symbolId: preset.symbolId, labelPosition: preset.labelPosition };
    }

    // 2. Table-valid: derive the family base glyph from the definition.
    const definition = getCubeInvariants(cubeSize).moveDefinitions.get(lookupName(move));
    if (definition) {
        const preset = familyBasePresetFor(definition, cubeSize);
        if (preset) {
            return {
                kind: 'family',
                symbolId: preset.symbolId,
                labelPosition: preset.labelPosition,
                label: move,
            };
        }
    }

    // 3. Wide-shaped exception for spellings the table gate excludes.
    const wideLetter = move.match(WIDE_SHAPED_NOTATION)?.[2];
    if (wideLetter) {
        const preset = MOVE_ICON_PRESETS[wideLetter.toUpperCase() as MoveNotation];
        if (preset) {
            return {
                kind: 'family',
                symbolId: preset.symbolId,
                labelPosition: preset.labelPosition,
                label: move,
            };
        }
    }

    // 4. No family/icon determinable → text fallback.
    return undefined;
}
