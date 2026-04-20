# Discrete Orientation System

## Overview

As of December 2025, the Rubik's Cube implementation uses a **discrete cubie
model** with integer orientations instead of geometric rotations (Euler
angles/quaternions). This provides deterministic state transitions, eliminates
floating-point drift, and enables compatibility with standard solving
algorithms.

## Core Concepts

### Discrete Orientations

Each cubie type has a specific orientation domain:

- **Corners**: `orientation ∈ {0, 1, 2}` - represents cyclic permutation of
  stickers
- **Edges**: `orientation ∈ {0, 1}` - represents flip state
- **Centers**: `orientation = 0` (always, centers don't rotate on standard
  cubes)

### What Orientation Represents

Orientation encodes **how the stickers are permuted** relative to the solved
(canonical) state at that position.

**For Corners:**

- `orientation = 0`: Sticker at localIndex 0 appears on the first canonical face
  (standard position)
- `orientation = 1`: Sticker at localIndex 1 appears on the first canonical face
  (clockwise twist)
- `orientation = 2`: Sticker at localIndex 2 appears on the first canonical face
  (counter-clockwise twist)

**For Edges:**

- `orientation = 0`: Stickers in canonical order
- `orientation = 1`: Stickers flipped

## Sticker Indexing System

### Local Index

Each sticker has a `localIndex` that represents its position in the **canonical
face order** at that location:

**For a corner at position UFL (Up-Front-Left):**

- Canonical face order: `[U, F, L]` (sorted by standard cubing convention)
- localIndex 0 → U face (white/yellow)
- localIndex 1 → F face (red/orange)
- localIndex 2 → L face (green/blue)

**For an edge at position UF (Up-Front):**

- Canonical face order: `[U, F]`
- localIndex 0 → U face
- localIndex 1 → F face

### Face Computation Formula

The current face on which a sticker appears is computed dynamically:

```typescript
function computeStickerFace(
  cubie: Cubie,
  sticker: Sticker,
  cubeSize: number
): Face {
  // Get the canonical face list for this position
  const availableFaces = getFacesAtPosition(cubie.position, cubeSize);

  if (cubie.type === CubieType.CORNER) {
    // Cyclic permutation: orientation shifts which sticker appears first
    const index = (sticker.localIndex + cubie.orientation) % 3;
    return availableFaces[index];
  } else if (cubie.type === CubieType.EDGE) {
    // XOR flip: orientation flips the order
    const index = sticker.localIndex ^ cubie.orientation;
    return availableFaces[index];
  } else {
    // Centers always at index 0
    return availableFaces[0];
  }
}
```

### Example: Corner Twist

**Solved State:**

```typescript
// Corner at UFL position
position = { x: 0, y: 2, z: 0 }
orientation = 0
availableFaces = [U, F, L]

// Stickers
sticker0: localIndex=0, color=WHITE → face = availableFaces[(0+0)%3] = U ✓
sticker1: localIndex=1, color=RED   → face = availableFaces[(1+0)%3] = F ✓
sticker2: localIndex=2, color=GREEN → face = availableFaces[(2+0)%3] = L ✓
```

**After Clockwise Twist (orientation = 1):**

```typescript
position = { x: 0, y: 2, z: 0 }  // Same position
orientation = 1                   // Twisted
availableFaces = [U, F, L]        // Same canonical order

sticker0: localIndex=0, color=WHITE → face = availableFaces[(0+1)%3] = F
sticker1: localIndex=1, color=RED   → face = availableFaces[(1+1)%3] = L
sticker2: localIndex=2, color=GREEN → face = availableFaces[(2+1)%3] = U
```

Now the white sticker appears on the front face, red on left, green on up - the
corner is twisted clockwise!

## Move Execution

### Permutation + Orientation Delta

Moves are defined by two components:

1. **Permutation**: Where each cubie moves
2. **Orientation Delta**: How much to add/flip the orientation

### Move Tables

Pre-computed lookup tables define both components for each move:

```typescript
interface MoveTable {
  cornerPerm: number[]; // Permutation of corner indices [0..7]
  cornerOriDelta: number[]; // Orientation deltas {0, 1, 2} for each corner
  edgePerm: number[]; // Permutation of edge indices [0..11]
  edgeOriDelta: number[]; // Flip flags {0, 1} for each edge
}
```

### Example: R Move on 3×3×3

```typescript
const R_MOVE = {
  cornerPerm: [0, 1, 6, 2, 4, 5, 7, 3], // Cycle: 2→6→7→3→2
  cornerOriDelta: [0, 0, 1, 2, 0, 0, 2, 1], // Corners 2,3,6,7 twist
  edgePerm: [0, 1, 5, 3, 4, 9, 6, 7, 8, 2, 10, 11], // Cycle edges
  edgeOriDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // No edge flips
};
```

### Applying a Move

```typescript
function applyMove(state: CubeState, moveTable: MoveTable): void {
  const corners = getCorners(state);
  const edges = getEdges(state);

  // Apply permutation and update orientations
  for (let i = 0; i < corners.length; i++) {
    const sourceCubie = corners[i];
    const destIndex = moveTable.cornerPerm[i];
    const orientDelta = moveTable.cornerOriDelta[i];

    // Move cubie to new position
    const destPosition = canonicalCornerPositions[destIndex];
    sourceCubie.position = destPosition;

    // Update orientation (modular arithmetic)
    sourceCubie.orientation = (sourceCubie.orientation + orientDelta) % 3;
  }

  // Same for edges (using XOR for flip)
  for (let i = 0; i < edges.length; i++) {
    const sourceCubie = edges[i];
    const destIndex = moveTable.edgePerm[i];
    const flipFlag = moveTable.edgeOriDelta[i];

    sourceCubie.position = canonicalEdgePositions[destIndex];
    sourceCubie.orientation = sourceCubie.orientation ^ flipFlag;
  }
}
```

## Cubology Invariants

### Corner Twist Invariant

For any valid Rubik's cube state, the sum of all corner orientations must be
divisible by 3:

```typescript
Σ(corner orientations) ≡ 0 (mod 3)
```

**Why?** Physically twisting one corner requires twisting at least two others to
maintain the cube's structure.

**In Move Tables:** Each move's orientation deltas must sum to 0 mod 3:

```typescript
// R move corner deltas
[0, 0, 1, 2, 0, 0, 2, 1];
// Sum = 0+0+1+2+0+0+2+1 = 6 ≡ 0 (mod 3) ✓
```

### Edge Flip Parity

The number of flipped edges must be even:

```typescript
Σ(edge orientations) ≡ 0 (mod 2)
```

**Why?** Flipping one edge requires flipping at least one other edge.

**In Move Tables:** Each move's flip flags must sum to 0 mod 2 (even number of
flips).

### Permutation Parity

Corner permutation parity must equal edge permutation parity:

```typescript
parity(corner permutation) = parity(edge permutation)
```

**Why?** Both are linked by the physical mechanism of the cube.

These invariants are **enforced during move table generation** and **checked
during state import** to ensure only valid cube states exist in the system.

## Corner Orientation Lookup Tables

### Why Lookup Tables?

Due to an architectural decision (stickers indexed by position-dependent
canonical order), corner orientations **cannot be computed geometrically**.
Instead, they use pre-defined values based on standard cubing conventions.

### The Architectural Limitation

When a corner moves between positions:

- **Source position** (e.g., UFL): faces `[U, F, L]` in canonical order
- **Destination position** (e.g., UBL): faces `[U, B, L]` in canonical order

The face sets are **different** (F ≠ B), so the formula:

```typescript
face = availableFaces[(localIndex + orientation) % 3];
```

...cannot produce a consistent orientation value that works at both positions.
The cyclic permutation formula assumes `availableFaces` is constant, but it
changes when corners move.

### Solution: Pre-Computed Tables

```typescript
const CORNER_ORIENTATION_TABLE_3x3: Record<string, number[]> = {
  // Y-axis moves (U/D) don't twist corners
  U: [0, 0, 0, 0, 0, 0, 0, 0],
  D: [0, 0, 0, 0, 0, 0, 0, 0],

  // X-axis moves (R/L) twist specific corners
  R: [0, 0, 1, 2, 0, 0, 2, 1],
  L: [2, 1, 0, 0, 1, 2, 0, 0],

  // Z-axis moves (F/B) have different patterns
  F: [1, 0, 2, 0, 2, 0, 1, 0],
  B: [0, 2, 0, 1, 0, 1, 0, 2],

  // Inverses have same values (orientation deltas, not absolute values)
  "R'": [0, 0, 1, 2, 0, 0, 2, 1],
  "F'": [2, 0, 1, 0, 1, 0, 2, 0],
  // etc.
};
```

**Values derived from:**

- Standard Cubie model conventions
- Kociemba algorithm orientation system
- Validated to satisfy corner twist invariant

### Corner Indexing

Corners are indexed 0-7 in canonical order:

```typescript
[
  { x: 0, y: 0, z: 0 }, // 0: DLF (Down-Left-Front)
  { x: 0, y: 0, z: 2 }, // 1: DLB (Down-Left-Back)
  { x: 2, y: 0, z: 0 }, // 2: DRF (Down-Right-Front)
  { x: 2, y: 0, z: 2 }, // 3: DRB (Down-Right-Back)
  { x: 0, y: 2, z: 0 }, // 4: ULF (Up-Left-Front)
  { x: 0, y: 2, z: 2 }, // 5: ULB (Up-Left-Back)
  { x: 2, y: 2, z: 0 }, // 6: URF (Up-Right-Front)
  { x: 2, y: 2, z: 2 }, // 7: URB (Up-Right-Back)
];
```

The table values correspond to these positions.

## State Import (Cube Scanning)

When importing a cube state from 54 sticker colors, orientations must be
**computed** from the color pattern:

### Algorithm

```typescript
function computeOrientation(
  cubie: CornerCubie,
  stickerColors: Color[]
): number {
  // Find which sticker is on the U or D face
  const uOrDIndex = stickerColors.findIndex(c => c === WHITE || c === YELLOW);

  // Orientation is how many positions to shift to put U/D sticker at index 0
  return (3 - uOrDIndex) % 3;
}
```

**For edges:**

```typescript
function computeEdgeOrientation(
  cubie: EdgeCubie,
  stickerColors: Color[]
): number {
  // Determine if edge is flipped based on which color is on which axis
  const shouldBeFirst = determineCanonicalFirst(stickerColors);
  return stickerColors[0] === shouldBeFirst ? 0 : 1;
}
```

This is the **only time** orientations are calculated rather than looked up from
tables.

## Implementation Files

- **Move Tables**: `src/cube/core/cube-invariants.ts`
- **Orientation Application**: `src/cube/core/move-engine.ts`
- **Face Computation**: `src/cube/types/sticker.ts`
- **State Validation**: `src/cube/utils/state-legality.ts`
- **Tests**: `src/cube/core/cube-invariants.test.ts`,
  `src/cube/utils/state-conversion.test.ts`

## Related Documentation

- [Architecture Overview](./architecture-overview.md) - Overall system design
- [Coordinate System](./coordinate-system.md) - Position conventions
- [Move Notation](./move-notation.md) - Move specification format
