# Coordinate System and ID Conventions

## 3D Coordinate System

The cube uses a right-handed 3D coordinate system with origin at (0,0,0).

### Axes Definition

- **x-axis**: 0 to n-1 (left → right)
- **y-axis**: 0 to n-1 (bottom → top)
- **z-axis**: 0 to n-1 (front → back)

### Origin Location

- **Position**: Front-Left-Bottom corner (FLD)
- **Coordinates**: (0, 0, 0)

### Face-to-Coordinate Mapping

**Important**: Layer numbering is **viewer-dependent** - layers are numbered
from the viewer's perspective when looking at each face. This means opposite
faces share the same physical planes but number them in reverse order.

| Face          | Coordinate Plane | Index Range                       |
| ------------- | ---------------- | --------------------------------- |
| **Front (F)** | z = 0            | F0=z:0, F1=z:1, ..., Fn-1=z:n-1   |
| **Back (B)**  | z = n-1          | B0=z:n-1, B1=z:n-2, ..., Bn-1=z:0 |
| **Left (L)**  | x = 0            | L0=x:0, L1=x:1, ..., Ln-1=x:n-1   |
| **Right (R)** | x = n-1          | R0=x:n-1, R1=x:n-2, ..., Rn-1=x:0 |
| **Down (D)**  | y = 0            | D0=y:0, D1=y:1, ..., Dn-1=y:n-1   |
| **Up (U)**    | y = n-1          | U0=y:n-1, U1=y:n-2, ..., Un-1=y:0 |

**Layer Equivalences for 3×3×3 Cube**:

- 0F (z:0) = 2B (z:0) — Front face outer layer = Back face inner layer
- 0L (x:0) = 2R (x:0) — Left face outer layer = Right face inner layer
- 0D (y:0) = 2U (y:0) — Down face outer layer = Up face inner layer

**Physical Planes**:

- **0XY = 0Z = F face** (0F when viewing front, 2B when viewing back)
- **2XY = 2Z = B face** (2F when viewing front, 0B when viewing back)
- **0YZ = 0X = L face** (0L when viewing left, 2R when viewing right)
- **2YZ = 2X = R face** (2L when viewing left, 0R when viewing right)
- **0XZ = 0Y = D face** (0D when viewing down, 2U when viewing up)
- **2XZ = 2Y = U face** (2D when viewing down, 0U when viewing up)

## Rotation Semantics

### Axis-Based Rotation Definition

All rotations are defined relative to the cube's coordinate system with
consistent direction semantics:

- **Clockwise (CW)**: Clockwise when viewed from negative to positive on the
  axis of rotation
- **Counter-Clockwise (CCW)**: Counter-clockwise when viewed from negative to
  positive on the axis of rotation

### Face Rotation Mapping

| Face  | Axis | Index      | External Description         | Internal Semantics |
| ----- | ---- | ---------- | ---------------------------- | ------------------ |
| **R** | X    | cubeSize-1 | Rotate right face clockwise  | CCW from -X to +X  |
| **L** | X    | 0          | Rotate left face clockwise   | CW from -X to +X   |
| **U** | Y    | cubeSize-1 | Rotate top face clockwise    | CCW from -Y to +Y  |
| **D** | Y    | 0          | Rotate bottom face clockwise | CW from -Y to +Y   |
| **F** | Z    | 0          | Rotate front face clockwise  | CW from -Z to +Z   |
| **B** | Z    | cubeSize-1 | Rotate back face clockwise   | CCW from -Z to +Z  |

**Important**: External move behavior remains identical. Only the internal
coordinate-based description changes to provide consistent axis-based semantics.

## ID Conventions

### Cubie IDs

**Format**: `"pos_XX_YY_ZZ"` (position key with zero-padded coordinates)

**Physical Cubies** (on cube surface):

```plaintext
"pos_00_00_00" → FLD corner (x=0, y=0, z=0)
"pos_01_01_01" → Center cubie (x=1, y=1, z=1)
"pos_02_00_00" → FRD corner (x=2, y=0, z=0)
"pos_02_02_02" → BRU corner (x=2, y=2, z=2)
"pos_00_01_00" → DL edge (x=0, y=1, z=0)
```

**Virtual Center Cubies** (for face tracking):

```plaintext
"virtual_center_F" → Front face virtual center
"virtual_center_U" → Up face virtual center
"virtual_center_R" → Right face virtual center
"virtual_center_B" → Back face virtual center
"virtual_center_L" → Left face virtual center
"virtual_center_D" → Down face virtual center
```

**Examples for 4×4×4 Cube**:

```plaintext
"pos_00_00_00" → FLD corner
"pos_01_01_01" → Inner cubie near FLD
"pos_03_03_03" → BRU corner
```

### Sticker IDs

**Format**: `"pos_{cubie_id}_{face}_sticker"`

**Examples**:

```plaintext
"pos_00_00_00_F_sticker" → Front sticker on FLD corner
"pos_00_00_00_L_sticker" → Left sticker on FLD corner
"pos_00_00_00_D_sticker" → Down sticker on FLD corner
"pos_01_01_01_R_sticker" → Right sticker on center (3×3)
"pos_02_02_02_U_sticker" → Up sticker on BRU corner
```

### ID Generation Utilities

```typescript
// Generate position key / cubie ID from coordinates
function getPositionKey(position: Position3D, cubeSize: number): PositionKey {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `pos_${pad(position.x)}_${pad(position.y)}_${pad(position.z)}`;
}

// Generate cubie ID from coordinates (uses getPositionKey internally)
function getCubieId(position: Position3D, cubeSize: number): CubieId {
  return getPositionKey(position, cubeSize) as CubieId;
}

// Generate virtual center cubie ID from face
function createVirtualCenterCubieId(face: Face): CubieId {
  return `virtual_center_${face}`;
}

// Generate sticker ID
function getStickerId(cubieId: CubieId, face: Face): StickerId {
  return `${cubieId}_${face}_sticker`;
}
```

## Cubie Type Determination

Cubie types are determined automatically from coordinate positions:

### Cubie Type Enum

```typescript
const CubieType = {
  CORNER: 'corner',
  EDGE: 'edge',
  CENTER: 'center',
  VIRTUAL_CENTER: 'virtual_center', // For face tracking
} as const;
```

### Algorithm (Physical Cubies)

```typescript
function getCubieType(position: Position3D, cubeSize: number): CubieType {
  // Convert to centered coordinates for easier extreme detection
  const centered = toCentered(position, cubeSize);
  const maxCoord = (cubeSize - 1) / 2;
  const extremes = [centered.x, centered.y, centered.z].filter(value =>
    isExtreme(value, maxCoord)
  );

  if (extremes.length === 3) return CubieType.CORNER;
  if (extremes.length === 2) return CubieType.EDGE;
  if (extremes.length === 1) return CubieType.CENTER;
  return CubieType.CENTER; // Inner cubies on large cubes
}
```

### Virtual Centers

In addition to physical cubies, the system maintains **virtual center cubies**
for each face:

- **Purpose**: Track face identity through whole-cube rotations
- **Count**: 6 virtual cubies (one per face: F, U, R, B, L, D)
- **Behavior**: Affected only by whole-cube rotations (x, y, z moves)
- **Storage**: Included in `cubiesById` map but excluded from `cubiesByPosition`

### Classification Rules

| Cubie Type         | Coordinate Pattern            | Count (3×3) | Count (4×4) | Count (5×5) |
| ------------------ | ----------------------------- | ----------- | ----------- | ----------- |
| **Corner**         | All coords are 0 or n-1       | 8           | 8           | 8           |
| **Edge**           | Exactly 2 coords are 0 or n-1 | 12          | 24          | 36          |
| **Center**         | Exactly 1 coord is 0 or n-1   | 6           | 24          | 54          |
| **Inner**          | No coords are 0 or n-1        | 1           | 8           | 27          |
| **Virtual Center** | N/A (not position-based)      | 6           | 6           | 6           |

**Notes**:

- For 2×2×2 cubes, there are only corners (8 physical cubies)
- Virtual centers exist for all cube sizes to track face identity

### Examples by Cube Size

**2×2×2 Cube** (8 cubies, all corners):

```plaintext
(0,0,0), (1,0,0), (0,1,0), (1,1,0)
(0,0,1), (1,0,1), (0,1,1), (1,1,1)
```

**3×3×3 Cube** (27 cubies):

- Corners: `(0,0,0)`, `(2,2,2)`, etc. → 8 cubies
- Edges: `(0,1,0)`, `(1,0,2)`, etc. → 12 cubies
- Centers: `(0,1,1)`, `(1,1,0)`, etc. → 6 cubies
- Core: `(1,1,1)` → 1 cubie

**4×4×4 Cube** (64 cubies):

- Corners: 8 cubies (all extremes)
- Edges: 24 cubies (2 extremes)
- Centers: 24 cubies (1 extreme)
- Inner: 8 cubies (no extremes)

## Layer Management

### Lazy Evaluation

Layers are **not stored** in memory. Instead, they are computed on-demand by
filtering cubies based on coordinates. All LayerManager methods are **static**
and operate on CubeState.

### Benefits of Lazy Evaluation

1. **Memory Efficiency**: No redundant storage of layer memberships
2. **Always Current**: Layer contents automatically reflect current cubie
   positions
3. **Dynamic Cube Sizes**: Works for any cube size without pre-computation
4. **Flexibility**: Easy to query arbitrary slices and layers

### Layer Queries

Common queries supported by the system:

```typescript
// Get all cubies at coordinate x = cubeSize - 1 (right face)
const rightFace = LayerManager.getSliceCubies(Axis.X, cubeSize - 1, state);

// Get all cubies at coordinate x = 1 (second slice from left)
const secondSlice = LayerManager.getSliceCubies(Axis.X, 1, state);

// Get all cubies affected by R move (including virtual centers if whole-cube)
const rMoveDefinition = moveEngine.getMoveDefinition('R');
const rCubies = LayerManager.getCubiesForMove(rMoveDefinition, state);

// Check if a move is a whole-cube rotation
const isWholeCube = LayerManager.isWholeCubeRotation(move); // true for x, y, z
```

## Benefits of Coordinate-Based System

1. **Generic Size Support**: Works for any n×n×n cube (n≥2) without modification
2. **Simple Mapping**: Direct correspondence between position and ID
3. **Debuggability**: IDs immediately reveal cubie location
4. **Type Inference**: Cubie type determined from coordinates alone
5. **Algorithm Friendly**: Natural for layer-based operations
6. **Extensibility**: Scales automatically for larger cubes
7. **Consistency**: Uniform naming across all cube sizes
8. **Lazy Evaluation**: Layers computed on-demand from coordinates

## Type System Architecture: Unified Face/Layer/Plane Support

### Architectural Overview

The Rubik's Cube type system has been designed with a unified approach that
supports Faces, Layers, and Planes through a hierarchical, object-based model.
This design eliminates string literals for Faces, Planes, and Layers, enhancing
type safety, code clarity, and maintainability. The system is based on the
existing codebase in `CubeController.ts` and related type definitions, with
notation standards aligned to the [Move Notation](./move-notation.md) document.

### Current Unified Type System

The system now relies on the shared `MoveDefinition` structure from
`cube/core/cube-invariants` to describe rotations:

```typescript
interface MoveDefinition {
  name: string; // e.g., "R", "U2", "x"
  axis: Axis; // X, Y, or Z
  layerIndices: number[]; // affected layers; use all layers for whole-axis rotations
  angle: QuarterTurn; // rotation in quarter turns (90, -90, 180, ...)
}
```

This replaces the `AxisRotation` abstraction and provides a single source of
truth for:

- **Face rotations**: `layerIndices` contains one outer-layer index
- **Layer rotations**: `layerIndices` enumerates the specific layers
- **Whole-axis rotations**: `layerIndices` enumerates every layer on the axis

The direction of rotation is encoded by the `angle` sign, so no separate
`RotationDirection` enum is needed. Consumers derive clockwise/counter-clockwise
semantics directly from the angle and axis.

#### Integration with Existing Code

- `CubeController` and `MoveEngine` fetch canonical `MoveDefinition` instances
  from the invariants map.
- `LayerManager` enumerates affected cubies using `MoveDefinition.layerIndices`,
  including virtual centers.
- String-based layer identifiers have been removed from the core path; tests and
  utilities consume `MoveDefinition` objects instead.

### Architectural Benefits

- **Type Safety**: Eliminates string literals and runtime errors; TypeScript
  catches mismatches at compile time.
- **Clarity/Maintainability**: Explicit relationships between
  Faces/Layers/Planes; readable code (e.g., `if (target.kind === 'layer')`).
  Combines Plane and direction into a single, coherent rotation specification.
  Uses named interfaces for better type documentation and IntelliSense support.
- **Extensibility**: Easy addition of new concepts (e.g., arbitrary depths for
  larger cubes).
- **Consistency**: Aligns with recent const object refactoring (e.g., Face).
  Uses named const objects for kind literals, following the same pattern as
  other enums in the codebase.
- **Reduced Boilerplate**: Less regex parsing and assertions; type-driven
  validation. No need to handle direction separately in move objects.

### Design Considerations

- **Complexity**: Adds cognitive/performance overhead (object creation vs.
  strings).
- **Backward Compatibility**: Backward compatibility is not needed, but requires
  migration/refactoring; potential breaking changes.
- **Notation Mapping**: Rubik's notation (e.g., `M`) doesn't map directly to
  hierarchy; may need special handling.
- **Performance**: Increased memory usage for large simulations (though minor
  for 3x3).
- **Adoption**: Views/events need updates; consistency enforcement challenging.

## Related Documentation

- [Move Notation](./move-notation.md) - How moves are specified and parsed
- [Discrete Orientation System](./discrete-orientation-system.md) - How cubie
  orientations work
- [Architecture Overview](./architecture-overview.md) - Overall system design
