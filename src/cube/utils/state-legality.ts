import { CubeInvariants, getCubeInvariants } from '@/cube/core/cube-invariants';
import { CubeState, Cubie, CubieType } from '@/cube/types';
import { Color, FACE_COLORS } from '@/cube/types/common';
import { getCanonicalIndexFromInvariants as getCanonicalIndex } from '@/cube/utils/coordinates';
import { computeStickerFace } from '@/cube/utils/face-utils';

export const LegalityIssueCode = {
    CORNER_ORIENTATION_SUM: 'corner_orientation_sum',
    EDGE_FLIP_PARITY: 'edge_flip_parity',
    PERMUTATION_PARITY_MISMATCH: 'permutation_parity_mismatch',
    CENTER_COLOR_MISMATCH: 'center_color_mismatch',
    COLOR_COUNT_MISMATCH: 'color_count_mismatch',
    SLOT_MISMATCH: 'slot_mismatch',
} as const;

export type LegalityIssueCode = (typeof LegalityIssueCode)[keyof typeof LegalityIssueCode];

export type LegalityIssue = {
    code: LegalityIssueCode;
    message: string;
    details?: Record<string, unknown>;
};

export type StateLegalityReport = {
    isLegal: boolean;
    issues: LegalityIssue[];
    diagnostics: {
        cornerOrientationSumMod3: number;
        edgeFlipSumMod2: number;
        cornerPermutationParity: number | undefined;
        edgePermutationParity: number | undefined;
    };
};

/**
 * Check the legality of a given cube state.
 * Returns a report indicating whether the state is legal and any issues found.
 * @param state The cube state to check
 * @returns StateLegalityReport
 */
export function checkStateLegality(state: CubeState): StateLegalityReport {
    const invariants = getCubeInvariants(state.cubeSize);
    const issues: LegalityIssue[] = [];

    const cornerCubies = collectCubies(state, CubieType.CORNER);
    const edgeCubies = collectCubies(state, CubieType.EDGE);
    const centerCubies = collectCubies(state, CubieType.CENTER);

    const cornerOrientationSum = cornerCubies.reduce(
        (sum, cubie) => sum + normalizeMod(cubie.orientation, 3),
        0
    );
    const cornerOrientationMod3 = cornerOrientationSum % 3;
    if (cornerOrientationMod3 !== 0) {
        issues.push({
            code: LegalityIssueCode.CORNER_ORIENTATION_SUM,
            message: `Corner orientation sum is ${cornerOrientationMod3}, expected 0 modulo 3`,
            details: { value: cornerOrientationMod3 },
        });
    }

    const edgeFlipSum = edgeCubies.reduce(
        (sum, cubie) => sum + normalizeMod(cubie.orientation, 2),
        0
    );
    const edgeFlipMod2 = edgeFlipSum % 2;
    if (edgeFlipMod2 !== 0) {
        issues.push({
            code: LegalityIssueCode.EDGE_FLIP_PARITY,
            message: 'Edge flip parity is odd, expected even parity',
            details: { value: edgeFlipMod2 },
        });
    }

    const cornerPermutation = buildCornerPermutation(state, invariants, issues);
    const edgePermutation = buildEdgePermutation(state, invariants, issues);

    const cornerParity = cornerPermutation ? computeParity(cornerPermutation) : undefined;
    const edgeParity = edgePermutation ? computeParity(edgePermutation) : undefined;

    if (cornerParity !== undefined && edgeParity !== undefined && cornerParity !== edgeParity) {
        issues.push({
            code: LegalityIssueCode.PERMUTATION_PARITY_MISMATCH,
            message: `Corner parity (${cornerParity}) does not match edge parity (${edgeParity})`,
            details: { cornerParity, edgeParity },
        });
    }

    const colorCounts = new Map<Color, number>();
    for (const cubie of [...cornerCubies, ...edgeCubies, ...centerCubies]) {
        for (const sticker of cubie.stickers.values()) {
            const currentColor = sticker.color;
            colorCounts.set(currentColor, (colorCounts.get(currentColor) ?? 0) + 1);
        }
    }

    const expectedColorCount = state.cubeSize * state.cubeSize;
    for (const color of Object.values(Color)) {
        const actual = colorCounts.get(color as Color) ?? 0;
        if (actual !== expectedColorCount) {
            issues.push({
                code: LegalityIssueCode.COLOR_COUNT_MISMATCH,
                message: `Color ${color} appears ${actual} times, expected ${expectedColorCount}`,
                details: { color, actual, expected: expectedColorCount },
            });
        }
    }

    for (const cubie of centerCubies) {
        for (const sticker of cubie.stickers.values()) {
            const face = computeStickerFace(
                cubie.position,
                cubie.orientation,
                sticker.localIndex,
                cubie.type,
                state.cubeSize
            );
            const expectedColor = FACE_COLORS[face];
            if (sticker.color !== expectedColor) {
                issues.push({
                    code: LegalityIssueCode.CENTER_COLOR_MISMATCH,
                    message: `Center sticker color mismatch on face ${face}: found ${sticker.color}, expected ${expectedColor}`,
                    details: { face, found: sticker.color, expected: expectedColor },
                });
            }
        }
    }

    return {
        isLegal: issues.length === 0,
        issues,
        diagnostics: {
            cornerOrientationSumMod3: cornerOrientationMod3,
            edgeFlipSumMod2: edgeFlipMod2,
            cornerPermutationParity: cornerParity,
            edgePermutationParity: edgeParity,
        },
    } satisfies StateLegalityReport;
}

function collectCubies(state: CubeState, type: CubieType): Cubie[] {
    const result: Cubie[] = [];
    for (const cubie of state.cubiesById.values()) {
        if (cubie.type === type) {
            result.push(cubie);
        }
    }
    return result;
}

function normalizeMod(value: number, modulus: number): number {
    const normalized = value % modulus;
    return normalized < 0 ? normalized + modulus : normalized;
}

function buildCornerPermutation(
    state: CubeState,
    invariants: CubeInvariants,
    issues: LegalityIssue[]
): number[] | undefined {
    const { corners } = invariants.categoryOffsets;
    const permutation = new Array<number>(invariants.cornerCount).fill(-1);

    for (const cubie of state.cubiesById.values()) {
        if (cubie.type !== CubieType.CORNER) {
            continue;
        }

        try {
            const slotCanonicalIndex = getCanonicalIndex(invariants, cubie.position);
            const slotIndex = slotCanonicalIndex - corners.start;
            const cubieIndex = cubie.canonicalIndex - corners.start;

            if (
                !isWithinBounds(slotIndex, invariants.cornerCount) ||
                !isWithinBounds(cubieIndex, invariants.cornerCount)
            ) {
                issues.push({
                    code: LegalityIssueCode.SLOT_MISMATCH,
                    message: `Corner cubie ${cubie.id} is in an invalid slot`,
                    details: { slotIndex, cubieIndex },
                });
                return undefined;
            }

            permutation[slotIndex] = cubieIndex;
        } catch (error) {
            issues.push({
                code: LegalityIssueCode.SLOT_MISMATCH,
                message: `Failed to resolve canonical index for corner cubie ${cubie.id}`,
                details: { error: error instanceof Error ? error.message : String(error) },
            });
            return undefined;
        }
    }

    if (permutation.some(value => value < 0)) {
        issues.push({
            code: LegalityIssueCode.SLOT_MISMATCH,
            message: 'Incomplete corner permutation detected',
            details: { permutation },
        });
        return undefined;
    }

    return permutation;
}

function buildEdgePermutation(
    state: CubeState,
    invariants: CubeInvariants,
    issues: LegalityIssue[]
): number[] | undefined {
    if (invariants.edgeCount === 0) {
        return [];
    }

    const { middleEdges, wings } = invariants.categoryOffsets;
    const permutation = new Array<number>(invariants.edgeCount).fill(-1);

    for (const cubie of state.cubiesById.values()) {
        if (cubie.type !== CubieType.EDGE) {
            continue;
        }

        try {
            const slotCanonicalIndex = getCanonicalIndex(invariants, cubie.position);
            const slotIndex = toEdgeRelativeIndex(
                slotCanonicalIndex,
                invariants,
                middleEdges.start,
                middleEdges.count,
                wings.start,
                wings.count
            );
            const cubieIndex = toEdgeRelativeIndex(
                cubie.canonicalIndex,
                invariants,
                middleEdges.start,
                middleEdges.count,
                wings.start,
                wings.count
            );

            if (
                !isWithinBounds(slotIndex, invariants.edgeCount) ||
                !isWithinBounds(cubieIndex, invariants.edgeCount)
            ) {
                issues.push({
                    code: LegalityIssueCode.SLOT_MISMATCH,
                    message: `Edge cubie ${cubie.id} is in an invalid slot`,
                    details: { slotIndex, cubieIndex },
                });
                return undefined;
            }

            permutation[slotIndex] = cubieIndex;
        } catch (error) {
            issues.push({
                code: LegalityIssueCode.SLOT_MISMATCH,
                message: `Failed to resolve canonical index for edge cubie ${cubie.id}`,
                details: { error: error instanceof Error ? error.message : String(error) },
            });
            return undefined;
        }
    }

    if (permutation.some(value => value < 0)) {
        issues.push({
            code: LegalityIssueCode.SLOT_MISMATCH,
            message: 'Incomplete edge permutation detected',
            details: { permutation },
        });
        return undefined;
    }

    return permutation;
}

function toEdgeRelativeIndex(
    canonicalIndex: number,
    invariants: CubeInvariants,
    middleStart: number,
    middleCount: number,
    wingStart: number,
    wingCount: number
): number {
    if (
        middleCount > 0 &&
        canonicalIndex >= middleStart &&
        canonicalIndex < middleStart + middleCount
    ) {
        return canonicalIndex - middleStart;
    }

    if (wingCount > 0 && canonicalIndex >= wingStart && canonicalIndex < wingStart + wingCount) {
        return invariants.middleEdgeCount + canonicalIndex - wingStart;
    }

    return -1;
}

function isWithinBounds(index: number, size: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < size;
}

function computeParity(permutation: number[]): number {
    const visited = new Array<boolean>(permutation.length).fill(false);
    let parity = 0;

    for (let start = 0; start < permutation.length; start++) {
        if (visited[start]) {
            continue;
        }

        let cycleLength = 0;
        let current = start;

        while (!visited[current]) {
            visited[current] = true;
            current = permutation[current];
            cycleLength++;
        }

        if (cycleLength > 0) {
            parity ^= (cycleLength - 1) & 1;
        }
    }

    return parity;
}
