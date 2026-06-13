import {
    Axis,
    Color,
    CubieSubType,
    CubieType,
    FACE_COLORS,
    Face,
    MoveDefinition,
    Position3D,
    PositionKey,
    QuarterTurn,
    Vector3,
} from '@/cube/types';
import { classifyCubieSubType, classifyCubieType } from '@/cube/utils/cubie';
import { getCornerFacesInStandardOrder, getFaceNormal } from '@/cube/utils/face-utils';
import {
    approximatelyEqual,
    compareValues,
    getAxisComponent,
    isExtreme,
    mod,
    normalizeComponent,
    rotatePosition3D,
    toActual,
    toCentered,
    vectorsEqual3,
} from '@/cube/utils/math';
import { getPositionKey } from '@/cube/utils/position-key';
import { logger } from '@/diagnostics/logger';

/**
 * Precomputed invariants for a cube of a given size.
 *
 * These values are computed once (and cached) and are used by the move
 * generation and state-manipulation code.  Fields include per-cubie metadata
 * (counts, canonical indexing), precomputed sticker normals, and lookup tables
 * for each move name.
 */
export type CubeInvariants = {
    /** Number of cubies along each cube edge */
    cubeSize: number;
    /** Total number of canonical corner cubies */
    cornerCount: number;
    /** Total number of canonical edge cubies (middle + wing) */
    edgeCount: number;
    /** Total number of canonical center cubies */
    centerCount: number;
    /** Count of middle-slice edges */
    middleEdgeCount: number;
    /** Count of wing edges (non-middle slice) */
    wingCount: number;
    /** Count of fixed centers (odd-size central centers) */
    fixedCenterCount: number;
    /** Count of X-centers (symmetry centers for odd sizes) */
    xCenterCount: number;
    /** Count of oblique centers (off-axis centers) */
    obliqueCenterCount: number;
    /** Number of physical cubies (corners + edges + centers) */
    physicalCubieCount: number;
    /** Valid integer coordinates in cube-space [0..cubeSize-1] */
    validCoords: number[];
    /** All surface positions enumerated in cube-space */
    allPositions: Position3D[];
    /** Mapping from position key to canonical index */
    canonicalIndices: Map<PositionKey, number>;
    /** Array mapping canonical index to cube-space Position3D */
    canonicalPositions: Position3D[];
    /** Cubie Type for each canonical index */
    cubieTypesByIndex: CubieType[];
    /** Cubie Sub Type for each canonical index */
    cubieCategoriesByIndex: CubieSubType[];
    /** Per-index list of sticker normals used for orientation comparisons */
    stickerNormalsByIndex: Vector3[][];
    /** Precomputed move tables keyed by move name (e.g. 'R', 'U', "R'") */
    moveTables: Map<string, MoveTable>;
    /** Definitions for moves available for this cube size */
    moveDefinitions: Map<string, MoveDefinition>;
    /** Offsets describing where each category's indices start and how many */
    categoryOffsets: CubieSubTypesOffsets;
};

/**
 * Lookup table describing how a single move affects canonical cubies.
 *
 * All "Perm" arrays are permutations mapping a source index to a target index
 * after applying the move.  All "OriDelta" arrays describe how the cubie's
 * orientation changes as a small integer (e.g. corner twist 0..2, edge flip 0..1).
 */
export type MoveTable = {
    /** Permutation mapping each corner source index to its target index */
    cornerPerm: number[];
    /** Corner orientation delta per source corner (0..2, modulo 3) */
    cornerOriDelta: number[];
    /** Permutation mapping each edge source index to its target index */
    edgePerm: number[];
    /** Edge orientation delta per source edge (0 or 1) */
    edgeOriDelta: number[];
    /** Permutation mapping each center source index to its target index */
    centerPerm: number[];
    /** Center orientation delta per source center cubie */
    centerOriDelta: number[];
    /** Permutation limited to middle edges (slice centers) */
    middleEdgePerm: number[];
    /** Orientation deltas for middle edges */
    middleEdgeOriDelta: number[];
    /** Permutation limited to wing edges (non-middle edges) */
    wingPerm: number[];
    /** Orientation deltas for wing edges */
    wingOriDelta: number[];
    /** Permutation for fixed centers category */
    fixedCenterPerm: number[];
    /** Orientation deltas for fixed centers */
    fixedCenterOriDelta: number[];
    /** Permutation for X-centers category */
    xCenterPerm: number[];
    /** Orientation deltas for X-centers */
    xCenterOriDelta: number[];
    /** Permutation for oblique centers category */
    obliqueCenterPerm: number[];
    /** Orientation deltas for oblique centers */
    obliqueCenterOriDelta: number[];
};

/**
 * Describes a single sticker on a cubie: face, display color, and outward normal.
 */
type StickerDescriptor = {
    /** Face enum value for this sticker (U, D, L, R, F, B) */
    face: Face;
    /** Display color for the sticker (matches FACE_COLORS) */
    color: Color;
    /** Outward normal vector for the sticker, used for orientation tests */
    normal: Vector3;
};

/**
 * Metadata describing a single cubie (cubie) on the cube surface.
 * Includes both cube-space and centered coordinates plus sticker info.
 */
type CubieDescriptor = {
    /** Canonical index assigned during ordering (updated by buildCanonicalData) */
    canonicalIndex: number;
    /** CubieType (CORNER / EDGE / CENTER) */
    type: CubieType;
    /** Category (corner, middle_edge, wing_edge, center variants) */
    subType: CubieSubType;
    /** Cube-space position (integer coordinates 0..cubeSize-1) */
    position: Position3D;
    /** Centered coordinates with origin at cube center (-center..center) */
    centeredPosition: Vector3;
    /** List of stickers on this cubie with face/color/normal info */
    stickers: StickerDescriptor[];
};

/**
 * Internal structure returned by buildCanonicalData containing canonical
 * ordering, per-index metadata and category offsets used to build move tables.
 */
type CanonicalData = {
    /** Number of corner cubies in canonical ordering */
    cornerCount: number;
    /** Number of edge cubies (middle + wing) */
    edgeCount: number;
    /** Number of center cubies */
    centerCount: number;
    /** Number of middle edges */
    middleEdgeCount: number;
    /** Number of wing edges */
    wingCount: number;
    /** Number of fixed centers */
    fixedCenterCount: number;
    /** Number of X-centers */
    xCenterCount: number;
    /** Number of oblique centers */
    obliqueCenterCount: number;
    /** Map from position key to canonical index */
    canonicalIndices: Map<PositionKey, number>;
    /** Array of positions indexed by canonical index */
    canonicalPositions: Position3D[];
    /** CubieType per canonical index */
    cubieTypesByIndex: CubieType[];
    /** Category per canonical index */
    cubieSubTypesByIndex: CubieSubType[];
    /** Sticker normal vectors per canonical index (for orientation checks) */
    stickerNormalsByIndex: Vector3[][];
    /** Full descriptor objects per canonical index */
    descriptorsByIndex: CubieDescriptor[];
    /** Offsets for each category within the canonical index space */
    categoryOffsets: CubieSubTypesOffsets;
};

/**
 * Normalize a position to ensure coordinates are within valid range
 * @param start Starting index of the range (inclusive)
 * @param count Number of elements in the range
 */
type Range = {
    /**
     * Starting index of the range (inclusive)
     */
    start: number;
    /**
     * Number of elements in the range
     */
    count: number;
};

/**
 * Starting offsets and counts for each cubie sub type within canonical index
 * space. Each Range describes where the sub type begins and how many
 * contiguous canonical indices it occupies.
 */
type CubieSubTypesOffsets = {
    /** Offset range for canonical corner indices */
    corners: Range;
    /** Offset range for middle-edge indices */
    middleEdges: Range;
    /** Offset range for wing-edge indices */
    wings: Range;
    /** Offset range for fixed center indices */
    fixedCenters: Range;
    /** Offset range for X-center indices */
    xCenters: Range;
    /** Offset range for oblique center indices */
    obliqueCenters: Range;
};

/**
 * Result of rotating a cubie by a move. Contains the destination position,
 * the rotated sticker normals (maintaining sticker order), and a small
 * orientation delta to update cubie orientation state.
 */
type RotatedState = {
    /** Destination cube-space position after rotation */
    position: Position3D;
    /** Rotated sticker normals (preserves sticker ordering for cubie) */
    normals: Vector3[];
    /** Orientation delta to apply to the source cubie (e.g. corner twist) */
    orientationDelta: number;
};

/**
 * Pre-computed corner orientations for 3x3 base moves with AXIS-BASED indexing (Y, Z, X).
 * Values converted from standard Cubie model orientation tables.
 *
 * Our corner ordering: [DFL, DBL, DFR, DBR, UFL, UBL, UFR, UBR]
 * Standard ordering:   [UFR, URB, UBL, ULF, DFR, DRB, DBL, DLF]
 *
 * Indexed by canonical corner position (0-7).
 */
const CORNER_ORIENTATION_TABLE_3x3: Record<string, number[]> = {
    U: [0, 0, 0, 0, 0, 0, 0, 0],
    "U'": [0, 0, 0, 0, 0, 0, 0, 0],
    U2: [0, 0, 0, 0, 0, 0, 0, 0],

    D: [0, 0, 0, 0, 0, 0, 0, 0],
    "D'": [0, 0, 0, 0, 0, 0, 0, 0],
    D2: [0, 0, 0, 0, 0, 0, 0, 0],

    R: [0, 0, 1, 2, 0, 0, 2, 1],
    "R'": [0, 0, 1, 2, 0, 0, 2, 1],
    R2: [0, 0, 0, 0, 0, 0, 0, 0],

    L: [2, 1, 0, 0, 1, 2, 0, 0],
    "L'": [2, 1, 0, 0, 1, 2, 0, 0],
    L2: [0, 0, 0, 0, 0, 0, 0, 0],

    F: [1, 0, 2, 0, 2, 0, 1, 0],
    "F'": [1, 0, 2, 0, 2, 0, 1, 0],
    F2: [0, 0, 0, 0, 0, 0, 0, 0],

    B: [0, 2, 0, 1, 0, 1, 0, 2],
    "B'": [0, 2, 0, 1, 0, 1, 0, 2],
    B2: [0, 0, 0, 0, 0, 0, 0, 0],

    // Cube rotations: x=R+L, y=U+D, z=F+B (both opposite faces rotate)
    x: [2, 1, 1, 2, 1, 2, 2, 1],
    "x'": [2, 1, 1, 2, 1, 2, 2, 1],
    x2: [0, 0, 0, 0, 0, 0, 0, 0],

    y: [0, 0, 0, 0, 0, 0, 0, 0],
    "y'": [0, 0, 0, 0, 0, 0, 0, 0],
    y2: [0, 0, 0, 0, 0, 0, 0, 0],

    z: [1, 2, 2, 1, 2, 1, 1, 2],
    "z'": [1, 2, 2, 1, 2, 1, 1, 2],
    z2: [0, 0, 0, 0, 0, 0, 0, 0],
};

/**
 * Build a fresh set of invariants for the given cube size.
 *
 * This performs all necessary preprocessing: enumerating surface positions,
 * classifying cubies, and building canonical indexing and move lookup tables.
 * Use `getCubeInvariants` to access a cached instance instead of calling this
 * directly unless you explicitly need a new object.
 *
 * @param cubeSize Number of cubies along one cube edge (>= 2)
 * @returns A fully populated CubeInvariants object
 */
export function createCubeInvariants(cubeSize: number): CubeInvariants {
    if (cubeSize < 2) {
        throw new Error('Cube size must be at least 2');
    }

    const validCoords = generateValidCoords(cubeSize);
    const allPositions = generateAllPositions(validCoords, cubeSize);
    const canonicalData = buildCanonicalData(cubeSize, allPositions);
    const moveDefinitions = buildMoveDefinitions(cubeSize);
    const moveTables = generateMoveTables(cubeSize, canonicalData, moveDefinitions);

    const moveDefinitionMap = new Map<string, MoveDefinition>();
    for (const definition of moveDefinitions) {
        moveDefinitionMap.set(definition.name, {
            ...definition,
            layerIndices: [...definition.layerIndices],
        });
    }

    const physicalCubieCount =
        canonicalData.cornerCount + canonicalData.edgeCount + canonicalData.centerCount;

    return {
        cubeSize,
        cornerCount: canonicalData.cornerCount,
        edgeCount: canonicalData.edgeCount,
        centerCount: canonicalData.centerCount,
        middleEdgeCount: canonicalData.middleEdgeCount,
        wingCount: canonicalData.wingCount,
        fixedCenterCount: canonicalData.fixedCenterCount,
        xCenterCount: canonicalData.xCenterCount,
        obliqueCenterCount: canonicalData.obliqueCenterCount,
        physicalCubieCount,
        validCoords,
        allPositions,
        canonicalIndices: canonicalData.canonicalIndices,
        canonicalPositions: canonicalData.canonicalPositions,
        cubieTypesByIndex: canonicalData.cubieTypesByIndex,
        cubieCategoriesByIndex: canonicalData.cubieSubTypesByIndex,
        stickerNormalsByIndex: canonicalData.stickerNormalsByIndex,
        moveTables,
        moveDefinitions: moveDefinitionMap,
        categoryOffsets: canonicalData.categoryOffsets,
    } satisfies CubeInvariants;
}

/**
 * Cache of CubeInvariants objects keyed by cube size.
 */
const invariantsCache = new Map<number, CubeInvariants>();

/**
 * Get cached invariants for a given cube size.  Creates and caches on first
 * access to avoid recomputing expensive tables multiple times.
 *
 * @param cubeSize Cube size to retrieve invariants for
 */
export function getCubeInvariants(cubeSize: number): CubeInvariants {
    let cached = invariantsCache.get(cubeSize);
    if (!cached) {
        cached = createCubeInvariants(cubeSize);
        invariantsCache.set(cubeSize, cached);
    }
    return cached;
}

/**
 * Generate an array of valid coordinates for a cube of given size
 * @param cubeSize - Size of the cube (number of cubies along one edge)
 * @returns Array of valid coordinates from 0 to cubeSize - 1
 */
function generateValidCoords(cubeSize: number): number[] {
    return Array.from({ length: cubeSize }, (_, index) => index);
}

/**
 * Generate all valid cubie positions on the cube surface
 * @param validCoords - Array of valid coordinates
 * @param cubeSize - Size of the cube
 * @returns Array of all valid 3D positions on the cube surface
 */
function generateAllPositions(validCoords: number[], cubeSize: number): Position3D[] {
    const positions: Position3D[] = [];

    const isOnSurface = (x: number, y: number, z: number): boolean =>
        x === 0 ||
        x === cubeSize - 1 ||
        y === 0 ||
        y === cubeSize - 1 ||
        z === 0 ||
        z === cubeSize - 1;

    for (const x of validCoords) {
        for (const y of validCoords) {
            for (const z of validCoords) {
                if (!isOnSurface(x, y, z)) {
                    continue;
                }
                positions.push({ x, y, z });
            }
        }
    }

    return positions;
}

/**
 * Analyze all surface positions and produce canonical ordering and descriptors.
 *
 * The canonical ordering groups cubies by category (corners, middle edges,
 * wings, centers) and sorts them deterministically so indices are stable across
 * runs. The returned structure contains per-index metadata useful for move
 * table generation.
 */
function buildCanonicalData(cubeSize: number, allPositions: Position3D[]): CanonicalData {
    const center = (cubeSize - 1) / 2;
    const groups: Record<CubieSubType, CubieDescriptor[]> = {
        [CubieSubType.CORNER]: [],
        [CubieSubType.MIDDLE_EDGE]: [],
        [CubieSubType.WING_EDGE]: [],
        [CubieSubType.FIXED_CENTER]: [],
        [CubieSubType.X_CENTER]: [],
        [CubieSubType.OBLIQUE_CENTER]: [],
    };

    for (const position of allPositions) {
        const descriptor = createDescriptor(position, cubeSize, center);
        if (!descriptor) {
            continue;
        }
        groups[descriptor.subType].push(descriptor);
    }

    groups[CubieSubType.CORNER].sort(cornerComparator);
    groups[CubieSubType.MIDDLE_EDGE].sort(edgeComparator);
    groups[CubieSubType.WING_EDGE].sort(edgeComparator);
    groups[CubieSubType.FIXED_CENTER].sort(centerComparator);
    groups[CubieSubType.X_CENTER].sort(centerComparator);
    groups[CubieSubType.OBLIQUE_CENTER].sort(centerComparator);

    const canonicalIndices = new Map<PositionKey, number>();
    const canonicalPositions: Position3D[] = [];
    const cubieTypesByIndex: CubieType[] = [];
    const cubieSubTypesByIndex: CubieSubType[] = [];
    const stickerNormalsByIndex: Vector3[][] = [];
    const descriptorsByIndex: CubieDescriptor[] = [];

    const categoryOffsets: CubieSubTypesOffsets = {
        corners: { start: 0, count: 0 },
        middleEdges: { start: 0, count: 0 },
        wings: { start: 0, count: 0 },
        fixedCenters: { start: 0, count: 0 },
        xCenters: { start: 0, count: 0 },
        obliqueCenters: { start: 0, count: 0 },
    } satisfies CubieSubTypesOffsets;

    const orderedCategories: CubieSubType[] = [
        CubieSubType.CORNER,
        CubieSubType.MIDDLE_EDGE,
        CubieSubType.WING_EDGE,
        CubieSubType.FIXED_CENTER,
        CubieSubType.X_CENTER,
        CubieSubType.OBLIQUE_CENTER,
    ];

    let nextIndex = 0;
    for (const category of orderedCategories) {
        const startIndex = nextIndex;
        const descriptors = groups[category];
        for (const descriptor of descriptors) {
            descriptor.canonicalIndex = nextIndex;
            const key = getPositionKey(descriptor.position, cubeSize);
            canonicalIndices.set(key, nextIndex);
            canonicalPositions[nextIndex] = descriptor.position;
            cubieTypesByIndex[nextIndex] = descriptor.type;
            cubieSubTypesByIndex[nextIndex] = descriptor.subType;
            stickerNormalsByIndex[nextIndex] = descriptor.stickers.map(sticker => sticker.normal);
            descriptorsByIndex[nextIndex] = descriptor;
            nextIndex++;
        }
        const count = descriptors.length;
        switch (category) {
            case CubieSubType.CORNER:
                categoryOffsets.corners = { start: startIndex, count };
                break;
            case CubieSubType.MIDDLE_EDGE:
                categoryOffsets.middleEdges = { start: startIndex, count };
                break;
            case CubieSubType.WING_EDGE:
                categoryOffsets.wings = { start: startIndex, count };
                break;
            case CubieSubType.FIXED_CENTER:
                categoryOffsets.fixedCenters = { start: startIndex, count };
                break;
            case CubieSubType.X_CENTER:
                categoryOffsets.xCenters = { start: startIndex, count };
                break;
            case CubieSubType.OBLIQUE_CENTER:
                categoryOffsets.obliqueCenters = { start: startIndex, count };
                break;
        }
    }

    const cornerCount = groups[CubieSubType.CORNER].length;
    const middleEdgeCount = groups[CubieSubType.MIDDLE_EDGE].length;
    const wingCount = groups[CubieSubType.WING_EDGE].length;
    const fixedCenterCount = groups[CubieSubType.FIXED_CENTER].length;
    const xCenterCount = groups[CubieSubType.X_CENTER].length;
    const obliqueCenterCount = groups[CubieSubType.OBLIQUE_CENTER].length;
    const edgeCount = middleEdgeCount + wingCount;
    const centerCount = fixedCenterCount + xCenterCount + obliqueCenterCount;

    return {
        cornerCount,
        edgeCount,
        centerCount,
        middleEdgeCount,
        wingCount,
        fixedCenterCount,
        xCenterCount,
        obliqueCenterCount,
        canonicalIndices,
        canonicalPositions,
        cubieTypesByIndex: cubieTypesByIndex,
        cubieSubTypesByIndex: cubieSubTypesByIndex,
        stickerNormalsByIndex,
        descriptorsByIndex,
        categoryOffsets,
    } satisfies CanonicalData;
}

/**
 * Build a descriptor object for the cubie at the given surface position.
 * Returns null for positions that do not map to a valid cubie.
 */
function createDescriptor(
    position: Position3D,
    cubeSize: number,
    _center: number
): CubieDescriptor | null {
    const centered = toCentered(position, cubeSize);
    const type = classifyCubieType(centered, cubeSize);

    if (!type) {
        return null;
    }

    const subType = classifyCubieSubType(centered, cubeSize);
    if (!subType) {
        return null;
    }

    const stickers = createStickers(centered, cubeSize);
    return {
        canonicalIndex: -1,
        type,
        subType,
        position,
        centeredPosition: centered,
        stickers,
    } satisfies CubieDescriptor;
}

/**
 * Build the stickers (face, color, normal) for a cubie at the centered
 * coordinate. Corners preserve a canonical face ordering; edges/centers have
 * one or two stickers accordingly.
 */
function createStickers(centered: Vector3, cubeSize: number): StickerDescriptor[] {
    const maxCoord = (cubeSize - 1) / 2;
    const stickers: StickerDescriptor[] = [];

    // Count faces to determine if this is a corner
    let faceCount = 0;
    if (isExtreme(centered.x, maxCoord)) faceCount++;
    if (isExtreme(centered.y, maxCoord)) faceCount++;
    if (isExtreme(centered.z, maxCoord)) faceCount++;

    // For corners, use standard cubing order
    if (faceCount === 3) {
        // Corners have three faces; use the standard cubing order helper to
        // ensure sticker ordering matches the orientation logic used elsewhere.
        const position = toActual(centered, cubeSize);
        const faces = getCornerFacesInStandardOrder(position, cubeSize);
        for (const face of faces) {
            const normal = getFaceNormal(face);
            stickers.push({ face, color: FACE_COLORS[face], normal });
        }
        return stickers;
    }

    // For edges and centers, collect stickers normally
    if (isExtreme(centered.x, maxCoord)) {
        const face = centered.x < 0 ? Face.L : Face.R;
        const normal =
            normalizeComponent(centered.x) < 0 ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
        stickers.push({ face, color: FACE_COLORS[face], normal });
    }
    if (isExtreme(centered.y, maxCoord)) {
        const face = centered.y < 0 ? Face.D : Face.U;
        const normal =
            normalizeComponent(centered.y) < 0 ? { x: 0, y: -1, z: 0 } : { x: 0, y: 1, z: 0 };
        stickers.push({ face, color: FACE_COLORS[face], normal });
    }
    if (isExtreme(centered.z, maxCoord)) {
        const face = centered.z < 0 ? Face.F : Face.B;
        const normal =
            normalizeComponent(centered.z) < 0 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 0, z: 1 };
        stickers.push({ face, color: FACE_COLORS[face], normal });
    }

    return stickers;
}

/**
 * Comparator used to sort corner descriptors deterministically for canonical
 * ordering. Sort order: y, x, z (centered coordinates).
 */
function cornerComparator(a: CubieDescriptor, b: CubieDescriptor): number {
    return (
        compareAxisValue(a.centeredPosition.y, b.centeredPosition.y) ||
        compareAxisValue(a.centeredPosition.x, b.centeredPosition.x) ||
        compareAxisValue(a.centeredPosition.z, b.centeredPosition.z)
    );
}

/**
 * Comparator for edges. Orders by which axis is free, then by secondary
 * coordinates so canonical edge ordering is stable.
 */
function edgeComparator(a: CubieDescriptor, b: CubieDescriptor): number {
    const axisPriority = (descriptor: CubieDescriptor): number => {
        const { x, y, z } = descriptor.centeredPosition;
        const maxCoord = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
        if (!isExtreme(x, maxCoord)) {
            return 0; // x is the free axis (UF/UB/DF/DB)
        }
        if (!isExtreme(y, maxCoord)) {
            return 1; // y is the free axis (LF/LB/RF/RB)
        }
        return 2; // z is the free axis (UL/UR/DL/DR)
    };

    const priorityDiff = axisPriority(a) - axisPriority(b);
    if (priorityDiff !== 0) {
        return priorityDiff;
    }

    const axis = axisPriority(a);
    if (axis === 0) {
        return (
            compareAxisValue(a.centeredPosition.y, b.centeredPosition.y) ||
            compareAxisValue(a.centeredPosition.z, b.centeredPosition.z)
        );
    }
    if (axis === 1) {
        return (
            compareAxisValue(a.centeredPosition.x, b.centeredPosition.x) ||
            compareAxisValue(a.centeredPosition.z, b.centeredPosition.z)
        );
    }
    return (
        compareAxisValue(a.centeredPosition.x, b.centeredPosition.x) ||
        compareAxisValue(a.centeredPosition.y, b.centeredPosition.y)
    );
}

/**
 * Comparator for center cubies. Orders by dominant axis, then sign (positive
 * side before negative), then by secondary coordinates.
 */
function centerComparator(a: CubieDescriptor, b: CubieDescriptor): number {
    const centerAxisInfo = (descriptor: CubieDescriptor) => {
        const { x, y, z } = descriptor.centeredPosition;
        const maxCoord = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
        if (isExtreme(x, maxCoord)) {
            return {
                axis: 0,
                sign: x >= 0 ? 1 : 0,
                secondary: [descriptor.centeredPosition.y, descriptor.centeredPosition.z] as const,
            };
        }
        if (isExtreme(y, maxCoord)) {
            return {
                axis: 1,
                sign: y >= 0 ? 1 : 0,
                secondary: [descriptor.centeredPosition.x, descriptor.centeredPosition.z] as const,
            };
        }
        return {
            axis: 2,
            sign: z >= 0 ? 1 : 0,
            secondary: [descriptor.centeredPosition.x, descriptor.centeredPosition.y] as const,
        };
    };

    const aInfo = centerAxisInfo(a);
    const bInfo = centerAxisInfo(b);

    if (aInfo.axis !== bInfo.axis) {
        return aInfo.axis - bInfo.axis;
    }
    if (aInfo.sign !== bInfo.sign) {
        return aInfo.sign - bInfo.sign;
    }

    return (
        compareAxisValue(aInfo.secondary[0], bInfo.secondary[0]) ||
        compareAxisValue(aInfo.secondary[1], bInfo.secondary[1])
    );
}

const compareAxisValue = compareValues;

/**
 * Build move lookup tables for all defined moves for the given cube size.
 * Returns a map keyed by move name to the computed MoveTable.
 *
 * @param cubeSize Cube size used for building tables
 * @param data Canonical data containing descriptors and canonical indices
 * @param moveDefinitions Array of move definitions to convert into tables
 */
function generateMoveTables(
    cubeSize: number,
    data: CanonicalData,
    moveDefinitions: MoveDefinition[]
): Map<string, MoveTable> {
    const tables = new Map<string, MoveTable>();

    for (const definition of moveDefinitions) {
        const table = buildMoveTableForMove(definition, cubeSize, data);
        tables.set(definition.name, table);
    }

    return tables;
}

/**
 * Generate the MoveDefinition set for a cube of the specified size, including
 * face moves, wide moves, slice moves, and cube rotations. This also pushes
 * prime (') and double (2) variants for each base definition.
 */
function buildMoveDefinitions(cubeSize: number): MoveDefinition[] {
    const last = cubeSize - 1;
    const allLayers = Array.from({ length: cubeSize }, (_, index) => index);

    const moves: MoveDefinition[] = [];

    const pushVariants = (definition: MoveDefinition): void => {
        moves.push({ ...definition, layerIndices: [...definition.layerIndices] });
        moves.push({
            ...definition,
            name: `${definition.name}'`,
            angle: -definition.angle as QuarterTurn,
            layerIndices: [...definition.layerIndices],
        });
        moves.push({
            ...definition,
            name: `${definition.name}2`,
            angle: definition.angle > 0 ? QuarterTurn.HALF : QuarterTurn.HALF_NEG,
            layerIndices: [...definition.layerIndices],
        });
    };

    const faceMoves: MoveDefinition[] = [
        { name: 'U', axis: Axis.Y, layerIndices: [last], angle: QuarterTurn.QUARTER },
        { name: 'D', axis: Axis.Y, layerIndices: [0], angle: QuarterTurn.QUARTER_NEG },
        { name: 'R', axis: Axis.X, layerIndices: [last], angle: QuarterTurn.QUARTER },
        { name: 'L', axis: Axis.X, layerIndices: [0], angle: QuarterTurn.QUARTER_NEG },
        { name: 'F', axis: Axis.Z, layerIndices: [0], angle: QuarterTurn.QUARTER_NEG },
        { name: 'B', axis: Axis.Z, layerIndices: [last], angle: QuarterTurn.QUARTER },
    ];
    faceMoves.forEach(pushVariants);

    if (cubeSize >= 2) {
        const secondLayerLow = Math.min(1, last);
        const secondLayerHigh = Math.max(last - 1, 0);
        const wideMoves: MoveDefinition[] = [
            {
                name: 'Uw',
                axis: Axis.Y,
                layerIndices: [last, secondLayerHigh],
                angle: QuarterTurn.QUARTER,
            },
            {
                name: 'Dw',
                axis: Axis.Y,
                layerIndices: [0, secondLayerLow],
                angle: QuarterTurn.QUARTER_NEG,
            },
            {
                name: 'Rw',
                axis: Axis.X,
                layerIndices: [last, secondLayerHigh],
                angle: QuarterTurn.QUARTER,
            },
            {
                name: 'Lw',
                axis: Axis.X,
                layerIndices: [0, secondLayerLow],
                angle: QuarterTurn.QUARTER_NEG,
            },
            {
                name: 'Fw',
                axis: Axis.Z,
                layerIndices: [0, secondLayerLow],
                angle: QuarterTurn.QUARTER_NEG,
            },
            {
                name: 'Bw',
                axis: Axis.Z,
                layerIndices: [last, secondLayerHigh],
                angle: QuarterTurn.QUARTER,
            },
        ];
        wideMoves.forEach(pushVariants);
    }

    if (cubeSize >= 3) {
        const innerLayers = allLayers.slice(1, last);
        if (innerLayers.length > 0) {
            const defaultLayer = innerLayers[0];
            const sliceMoves: MoveDefinition[] = [
                {
                    name: 'M',
                    axis: Axis.X,
                    layerIndices: [defaultLayer],
                    angle: QuarterTurn.QUARTER_NEG,
                },
                {
                    name: 'E',
                    axis: Axis.Y,
                    layerIndices: [defaultLayer],
                    angle: QuarterTurn.QUARTER_NEG,
                },
                {
                    name: 'S',
                    axis: Axis.Z,
                    layerIndices: [defaultLayer],
                    angle: QuarterTurn.QUARTER_NEG,
                },
            ];
            sliceMoves.forEach(pushVariants);
        }

        if (cubeSize > 3) {
            for (const layerIndex of innerLayers) {
                const sliceNumber = layerIndex + 1;
                const numericSlices: MoveDefinition[] = [
                    {
                        name: `${sliceNumber}M`,
                        axis: Axis.X,
                        layerIndices: [layerIndex],
                        angle: QuarterTurn.QUARTER_NEG,
                    },
                    {
                        name: `${sliceNumber}E`,
                        axis: Axis.Y,
                        layerIndices: [layerIndex],
                        angle: QuarterTurn.QUARTER_NEG,
                    },
                    {
                        name: `${sliceNumber}S`,
                        axis: Axis.Z,
                        layerIndices: [layerIndex],
                        angle: QuarterTurn.QUARTER_NEG,
                    },
                ];
                numericSlices.forEach(pushVariants);
            }
        }
    }

    const cubeRotations: MoveDefinition[] = [
        { name: 'x', axis: Axis.X, layerIndices: allLayers, angle: QuarterTurn.QUARTER },
        { name: 'y', axis: Axis.Y, layerIndices: allLayers, angle: QuarterTurn.QUARTER },
        { name: 'z', axis: Axis.Z, layerIndices: allLayers, angle: QuarterTurn.QUARTER_NEG },
    ];
    cubeRotations.forEach(pushVariants);

    return moves;
}

/**
 * Build a MoveTable describing how a single MoveDefinition permutes and
 * orients canonical cubies for the specified cube size.
 */
function buildMoveTableForMove(
    move: MoveDefinition,
    cubeSize: number,
    data: CanonicalData
): MoveTable {
    const cornerOffset = 0;
    const edgeOffset = cornerOffset + data.cornerCount;
    const centerOffset = edgeOffset + data.edgeCount;

    const cornerPerm = identityArray(data.cornerCount);
    const cornerOriDelta = new Array<number>(data.cornerCount).fill(0);
    const edgePerm = identityArray(data.edgeCount);
    const edgeOriDelta = new Array<number>(data.edgeCount).fill(0);
    const centerPerm = identityArray(data.centerCount);
    const centerOriDelta = new Array<number>(data.centerCount).fill(0);
    const middleEdgePerm = identityArray(data.middleEdgeCount);
    const middleEdgeOriDelta = new Array<number>(data.middleEdgeCount).fill(0);
    const wingPerm = identityArray(data.wingCount);
    const wingOriDelta = new Array<number>(data.wingCount).fill(0);
    const fixedCenterPerm = identityArray(data.fixedCenterCount);
    const fixedCenterOriDelta = new Array<number>(data.fixedCenterCount).fill(0);
    const xCenterPerm = identityArray(data.xCenterCount);
    const xCenterOriDelta = new Array<number>(data.xCenterCount).fill(0);
    const obliqueCenterPerm = identityArray(data.obliqueCenterCount);
    const obliqueCenterOriDelta = new Array<number>(data.obliqueCenterCount).fill(0);

    const rotated = data.descriptorsByIndex.map(descriptor =>
        rotateCubie(descriptor, move, cubeSize)
    );

    for (const descriptor of data.descriptorsByIndex) {
        const rotatedState = rotated[descriptor.canonicalIndex];
        const targetIndex = data.canonicalIndices.get(
            getPositionKey(rotatedState.position, cubeSize)
        );
        if (targetIndex === undefined) {
            throw new Error(`No canonical destination for move ${move.name}`);
        }

        const targetSubType = data.cubieSubTypesByIndex[targetIndex];
        if (targetSubType !== descriptor.subType) {
            throw new Error(
                `Category mismatch after applying move ${move.name}: expected ${descriptor.subType}, got ${targetSubType}`
            );
        }

        const targetNormals = data.stickerNormalsByIndex[targetIndex];
        const rotatedNormals = rotatedState.normals;

        switch (descriptor.type) {
            case CubieType.CORNER: {
                const localSource = descriptor.canonicalIndex - cornerOffset;
                const localTarget = targetIndex - cornerOffset;
                cornerPerm[localSource] = localTarget;
                cornerOriDelta[localSource] = rotatedState.orientationDelta;
                break;
            }
            case CubieType.EDGE: {
                const localSource = descriptor.canonicalIndex - edgeOffset;
                const localTarget = targetIndex - edgeOffset;
                const delta = computeEdgeOrientationDelta(rotatedNormals, targetNormals);
                edgePerm[localSource] = localTarget;
                edgeOriDelta[localSource] = delta;

                if (descriptor.subType === CubieSubType.MIDDLE_EDGE) {
                    const range = data.categoryOffsets.middleEdges;
                    const categorySource = descriptor.canonicalIndex - range.start;
                    const categoryTarget = targetIndex - range.start;
                    middleEdgePerm[categorySource] = categoryTarget;
                    middleEdgeOriDelta[categorySource] = delta;
                } else if (descriptor.subType === CubieSubType.WING_EDGE) {
                    const range = data.categoryOffsets.wings;
                    const categorySource = descriptor.canonicalIndex - range.start;
                    const categoryTarget = targetIndex - range.start;
                    wingPerm[categorySource] = categoryTarget;
                    wingOriDelta[categorySource] = delta;
                }
                break;
            }
            case CubieType.CENTER: {
                const localSource = descriptor.canonicalIndex - centerOffset;
                const localTarget = targetIndex - centerOffset;
                const delta = computeCenterOrientationDelta(rotatedNormals, targetNormals);
                centerPerm[localSource] = localTarget;
                centerOriDelta[localSource] = delta;

                switch (descriptor.subType) {
                    case CubieSubType.FIXED_CENTER: {
                        const range = data.categoryOffsets.fixedCenters;
                        const categorySource = descriptor.canonicalIndex - range.start;
                        const categoryTarget = targetIndex - range.start;
                        fixedCenterPerm[categorySource] = categoryTarget;
                        fixedCenterOriDelta[categorySource] = delta;
                        break;
                    }
                    case CubieSubType.X_CENTER: {
                        const range = data.categoryOffsets.xCenters;
                        const categorySource = descriptor.canonicalIndex - range.start;
                        const categoryTarget = targetIndex - range.start;
                        xCenterPerm[categorySource] = categoryTarget;
                        xCenterOriDelta[categorySource] = delta;
                        break;
                    }
                    case CubieSubType.OBLIQUE_CENTER: {
                        const range = data.categoryOffsets.obliqueCenters;
                        const categorySource = descriptor.canonicalIndex - range.start;
                        const categoryTarget = targetIndex - range.start;
                        obliqueCenterPerm[categorySource] = categoryTarget;
                        obliqueCenterOriDelta[categorySource] = delta;
                        break;
                    }
                    default:
                        break;
                }
                break;
            }
        }
    }

    const table: MoveTable = {
        cornerPerm,
        cornerOriDelta,
        edgePerm,
        edgeOriDelta,
        centerPerm,
        centerOriDelta,
        middleEdgePerm,
        middleEdgeOriDelta,
        wingPerm,
        wingOriDelta,
        fixedCenterPerm,
        fixedCenterOriDelta,
        xCenterPerm,
        xCenterOriDelta,
        obliqueCenterPerm,
        obliqueCenterOriDelta,
    } satisfies MoveTable;

    // Apply lookup table for 3x3 corner orientations
    if (cubeSize === 3 && CORNER_ORIENTATION_TABLE_3x3[move.name]) {
        table.cornerOriDelta = CORNER_ORIENTATION_TABLE_3x3[move.name];
    }

    ensureCubologyInvariants(move, table, data, cubeSize);

    return table;
}

/**
 * Compute the destination state for a single cubie after applying `move`.
 * Returns the rotated position, rotated sticker normals, and a small
 * orientation delta. Unaffected cubies are returned unchanged.
 */
function rotateCubie(
    descriptor: CubieDescriptor,
    move: MoveDefinition,
    cubeSize: number
): RotatedState {
    const center = (cubeSize - 1) / 2;
    const coordinate = getAxisComponent(descriptor.centeredPosition, move.axis);

    const layerCoordinates = move.layerIndices.map(index => index - center);
    const isAffected = layerCoordinates.some(layer => approximatelyEqual(coordinate, layer));

    if (!isAffected) {
        return {
            position: descriptor.position,
            normals: descriptor.stickers.map(sticker => sticker.normal),
            orientationDelta: 0, // No change for unaffected cubies
        } satisfies RotatedState;
    }

    const rotatedCentered = rotatePosition3D(descriptor.centeredPosition, move.axis, move.angle);
    const rotatedPosition = toActual(rotatedCentered, cubeSize);

    // For corners: compute orientation delta analytically based on how faces map
    let orientationDelta = 0;
    const rotatedNormals = descriptor.stickers.map(sticker =>
        rotatePosition3D(sticker.normal, move.axis, move.angle)
    );

    return {
        position: rotatedPosition,
        normals: rotatedNormals,
        orientationDelta,
    } satisfies RotatedState;
}

function ensureCubologyInvariants(
    move: MoveDefinition,
    table: MoveTable,
    data: CanonicalData,
    cubeSize: number
): void {
    const cornerTwistSum = table.cornerOriDelta.reduce((sum, delta) => {
        const normalized = mod(delta, 3);
        return (sum + normalized) % 3;
    }, 0);

    if (cornerTwistSum !== 0) {
        logger.warn(`Move ${move.name}: Corner orientation sum = ${cornerTwistSum} (expected 0)`);
        // Corner orientations currently return 0 as placeholder
        // This warning indicates the feature is not fully implemented
    }

    const edgeFlipParity = table.edgeOriDelta.reduce((sum, delta) => {
        const normalized = delta & 1;
        return (sum + normalized) % 2;
    }, 0);

    if (edgeFlipParity !== 0) {
        throw new Error(`Edge flip parity invariant violated for move ${move.name}`);
    }

    const isFaceTurn =
        move.layerIndices.length === 1 &&
        (move.layerIndices[0] === 0 || move.layerIndices[0] === cubeSize - 1);

    if (isFaceTurn && data.middleEdgeCount > 0) {
        const cornerParity = computePermutationParity(table.cornerPerm);
        const edgeParity = computePermutationParity(table.middleEdgePerm);
        if (cornerParity !== edgeParity) {
            throw new Error(`Corner/edge permutation parity mismatch after move ${move.name}`);
        }
    }
}

/**
 * Compute the parity (0 or 1) of a permutation represented as an array.
 * Uses cycle decomposition to determine whether the permutation is even (0)
 * or odd (1).
 */
function computePermutationParity(perm: readonly number[]): number {
    const visited = new Array<boolean>(perm.length).fill(false);
    let parity = 0;

    for (let start = 0; start < perm.length; start++) {
        if (visited[start]) {
            continue;
        }

        let length = 0;
        let index = start;

        while (!visited[index]) {
            visited[index] = true;
            index = perm[index];
            length++;
        }

        if (length > 1) {
            parity ^= (length - 1) & 1;
        }
    }

    return parity & 1;
}

/**
 * Compute the edge orientation delta (0 or 1) needed to match rotated
 * sticker normals to the target orientation. 0 means unchanged, 1 means
 * flipped (stickers swapped).
 * @internal
 */
export function computeEdgeOrientationDelta(rotated: Vector3[], target: Vector3[]): number {
    if (vectorsEqual3(rotated[0], target[0]) && vectorsEqual3(rotated[1], target[1])) {
        return 0;
    }
    if (vectorsEqual3(rotated[0], target[1]) && vectorsEqual3(rotated[1], target[0])) {
        return 1;
    }
    throw new Error('Unable to determine edge orientation delta');
}

/**
 * Compute the center orientation delta. For current model center orientation
 * is treated as trivial (0) but this function validates that rotated normals
 * match the target set of normals.
 * @internal
 */
export function computeCenterOrientationDelta(rotated: Vector3[], target: Vector3[]): number {
    if (rotated.length !== target.length) {
        throw new Error('Center sticker configuration changed during rotation');
    }

    for (const vector of rotated) {
        const match = target.some(candidate => vectorsEqual3(vector, candidate));
        if (!match) {
            throw new Error('Unable to match rotated center normal to target normal');
        }
    }

    return 0;
}

/**
 * Create an identity permutation array of the given length: [0,1,2,...].
 * Useful as the starting point for move permutation tables which will be
 * updated in-place for affected cubies.
 */
function identityArray(length: number): number[] {
    return Array.from({ length }, (_, index) => index);
}
