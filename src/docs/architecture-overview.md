# Architecture Overview

## System Design Philosophy

The Rubik's Cube application is built on a **discrete cubie model** architecture
with clear separation of concerns. The design supports cubes of any size (n×n×n
where n ≥ 2) and provides both legacy 2D face-based views and modern 3D
coordinate-based views.

Uses a **discrete cubie model** that with integer orientations and lookup tables
for cubies transformations. This provides:

- Deterministic state transitions (no floating-point drift)
- Easy implementation of solving algorithms
- Trivial state serialization
- Compatibility with all known cubing conventions

## Core Principles

1. **3D Coordinate System**: All cubies identified by (x, y, z) coordinates
2. **Discrete Orientations**: Corner orientations ∈ {0,1,2}, edge orientations ∈
   {0,1}
3. **Permutation-Based Moves**: Moves defined as permutations with orientation
   deltas
4. **Cubology Invariants**: Corner twist sum mod 3 = 0, edge flip parity = even
5. **State Immutability**: Original state never modified after creation
6. **Generic Cube Sizes**: All algorithms work for any n ≥ 2 (with size-specific
   lookup tables)
7. **Type Safety**: Full TypeScript type coverage with zero compilation errors
8. **Separation of Logic and Rendering**: Cube state is pure logic, 3D
   transforms derived on-demand

## Move Execution Pattern

The system uses a **compute-then-apply** pattern to eliminate bidirectional
coupling:

```typescript
// MoveEngine computes the transformation (pure function)
const result: MoveResult = moveEngine.executeMove(move);
// result.movedCubies.before: cubies before the move
// result.movedCubies.after: cubies after transformation
// result.preState: state before the move

// StateManager applies the transformation (mutation)
stateManager.applyMoveResult(result);

// Now state is updated, can query postState
const postState = stateManager.getCurrentState();
```

**Benefits:**

- **Single source of mutation**: Only StateManager modifies state
- **Pure computation**: MoveEngine is deterministic and testable
- **No bidirectional coupling**: MoveEngine → StateManager (read-only)
- **Dry-run capability**: Can compute moves without applying them
- **Simplified undo/redo**: Transformations are data, not side effects

## Component Architecture

```plaintext
┌──────────────────────────────────────────────────────────┐
│                        Application                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │        CubeController (implements CubeModel)       │  │
│  │  - Main controller and state coordinator           │  │
│  │  - Integrates all core components                  │  │
│  │  - Provides public API for views                   │  │
│  └────┬─────────────┬─────────────┬─────────────┬─────┘  │
│       │             │             │             │        │
│  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  │
│  │ Cubie    │  │ State    │  │ Layer    │  │ Move     │  │
│  │ Manager  │  │ Manager  │  │ Manager  │  │ Engine   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│       │             │             │             │        │
│  ┌────▼─────────────▼─────────────▼─────────────▼─────┐  │
│  │              Types & Utilities                     │  │
│  │  - Cubie, Sticker, Position3D, Orientation         │  │
│  │  - Coordinate utilities, ID generation             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                   ViewManager                      │  │
│  │  - Manages multiple view instances                 │  │
│  │  - Coordinates view switching                      │  │
│  └────────────────┬───────────────────────────────────┘  │
│                   │                                      │
│  ┌────────────────▼───────────────────────────────────┐  │
│  │                    Views                           │  │
│  │  - BasicView (pseudo-3D net view)                  │  │
│  │  - CircularView (concentric-ring SVG view)         │  │
│  │  - FlatView (flat 2D projection)                   │  │
│  │  - MovesView (move history list)                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                  Interaction                       │  │
│  │  - DragStateMachine (pointer event FSM)            │  │
│  │  - MoveInference (drag gesture → move notation)    │  │
│  │  - KeyboardMoves (keyboard shortcut → move)        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CubieManager

**Purpose**: Creates and manages the 3D cube structure

**Responsibilities:**

- Generate all physical cubies for any cube size
- Generate virtual center cubies for face identity tracking
- Calculate cubie types (corner, edge, center, virtual center) from coordinates
- Create stickers with proper localIndex and colors
- Initialize all cubies in solved state (orientation = 0)

**Virtual Centers**: Creates one virtual cubie per face (F, U, R, B, L, D) to
track face identity through moves, enabling proper center piece tracking even
after rotations.

**File**: `src/cube/core/cubie-manager.ts`

### 2. StateManager

**Purpose**: Single source of state mutation and state lifecycle management

**Responsibilities:**

- Maintain immutable original state and mutable current state
- Apply move transformations computed by MoveEngine
- Provide read-only access to both states
- Deep copy states when needed
- Track state changes with timestamps

**Design Pattern**: StateManager is the **only component that mutates cube
state**. All other components (MoveEngine, LayerManager, etc.) are pure
functions or operate on read-only views. This ensures:

- Clear ownership of mutations
- Predictable state changes
- Easy debugging and testing
- Immutability guarantees via Immutable.js Maps

**File**: `src/cube/core/state-manager.ts`

### 3. LayerManager

**Purpose**: Static layer enumeration and filtering service

**Responsibilities:**

- Filter cubies by axis/coordinate slices
- Enumerate cubies affected by move definitions
- Include virtual center cubies in move operations
- Support multi-layer moves (e.g., wide turns)
- Provide layer validation

**Design Note**: All methods are static and accept `CubeState` as a parameter,
making LayerManager a stateless utility. Operates on read-only cubie collections
for maximum flexibility.

**File**: `src/cube/core/layer-manager.ts`

### 4. MoveEngine

**Purpose**: Pure computation of move transformations without state mutation

**Responsibilities:**

- Compute cubie position transformations via rotation
- Calculate orientation changes using discrete model
- Generate detailed MoveResult with before/after states
- Support dry-run move simulations
- Maintain move definition registry

**Design Pattern**: MoveEngine computes transformations as **pure functions**
without side effects.

Pattern:

```typescript
// Pure computation
const result = moveEngine.executeMove(move, currentState);
// State mutation (separate step)
stateManager.applyMoveResult(result);
```

**Benefits:**

- Testable and deterministic
- Enables dry-run/preview capability
- Simplifies undo/redo (transformations are data)
- No bidirectional coupling with StateManager

**File**: `src/cube/core/move-engine.ts`

### 5. CubeInvariants

**Purpose**: Pre-computed lookup tables and metadata for cube sizes

**Responsibilities:**

- Generate canonical cubie orderings and indexing
- Build complete move tables (permutations + orientation deltas)
- Classify cubie types and subtypes (corners, wings, X-centers, etc.)
- Validate cubology invariants for all moves
- Cache invariants per cube size for performance
- Store move definitions with axis, layers, and rotation metadata

**Move Tables**: Each move has pre-computed permutations and orientation deltas
ensuring:

- Deterministic transformations
- Guaranteed cubology invariants
- Support for cubes of any size (2×2 to 7×7+)
- Corner twist sum ≡ 0 (mod 3)
- Edge flip parity = even

**Cubie Classification**: Supports fine-grained cubie subtypes:

- Corners (8 per cube)
- Edges: Wings (outer) and Middle Edges (inner)
- Centers: Fixed Centers, X-Centers, Oblique Centers

**File**: `src/cube/core/cube-invariants.ts`

### 6. MoveHistory

**Purpose**: Undo/redo capability with move sequence tracking

**Responsibilities:**

- Store move sequence as string notation
- Support undo/redo operations
- Maintain current position in history
- Truncate future moves when branching
- Export/import move sequences

**Design**: Uses simple string-based storage for compatibility with standard
cube notation and easy serialization.

**File**: `src/cube/core/move-history.ts`

### 7. StatePersistence

**Purpose**: State serialization, storage, and restoration

**Responsibilities:**

- Serialize cube state to compact string format
- Parse string format back to cube state
- Support move history persistence
- Auto-save to localStorage
- Validate state legality on import
- Convert between state representations

**String Format:**

```plaintext
<cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...
[optional move history on next line][:position in move history]
```

Example:

```plaintext
3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
R U R' U':2
```

Move history contains 4 moves, of which 2 have been undone.

**Features:**

- Validates cube size and color counts
- Checks state legality (cubology invariants)
- Supports move history serialization
- Auto-save on app exit
- Import from 54-sticker format (planned)

**File**: `src/cube/core/state-persistence.ts`

## Type System

### Core Types (Discrete Cubie Model)

```typescript
// 3D Position (discrete coordinates)
interface Position3D {
  x: number; // 0 to n-1 (cube space)
  y: number; // 0 to n-1
  z: number; // 0 to n-1
}

// Discrete Orientation
// Corners: 0, 1, or 2 (representing cyclic permutation of stickers)
// Edges: 0 or 1 (flipped or not)
// Centers: always 0
type CornerOrientation = 0 | 1 | 2;
type EdgeOrientation = 0 | 1;
type CenterOrientation = 0;

// Cubie with position and discrete orientation
interface Cubie {
  id: CubieId; // "pos_XX_YY_ZZ"
  type: CubieType; // corner, edge, center
  position: Position3D;
  orientation: number; // Discrete orientation value
  stickers: Map<StickerId, Sticker>; // Sticker IDs mapped to sticker objects
}

// Sticker with local index (position-independent color tracking)
interface Sticker {
  id: StickerId; // "{cubie_id}_{face}_sticker"
  color: Color;
  cubieId: CubieId;
  localIndex: number; // 0..2 for corners, 0..1 for edges, 0 for centers
  face: Face; // Computed dynamically from position + orientation
}

// Complete cube state (pure logic, no geometry)
interface CubeState {
  cubeSize: number;
  cubiesById: IMap<CubieId, Cubie>; // Immutable.js Map
  cubiesByPosition: IMap<PositionKey, Cubie>; // Immutable.js Map
  timestamp: number;
}
```

### Orientation Semantics

The discrete orientation system encodes how stickers are permuted relative to
the canonical (solved) configuration:

**For Corners:**

- `orientation = 0`: Sticker at localIndex 0 appears on first canonical face
- `orientation = 1`: Sticker at localIndex 1 appears on first canonical face
  (clockwise twist)
- `orientation = 2`: Sticker at localIndex 2 appears on first canonical face
  (counter-clockwise twist)

**For Edges:**

- `orientation = 0`: Stickers in canonical order
- `orientation = 1`: Stickers flipped

**Face Computation:**

```typescript
// For corners (cyclic permutation)
face = availableFaces[(localIndex + orientation) % 3]

// For edges (XOR flip)
face = availableFaces[localIndex XOR orientation]
```

**Files**: `src/cube/types/`

## ID Conventions

### Cubie IDs

- **Format**: `"pos_XX_YY_ZZ"` (zero-padded coordinates)
- **Examples**: `"pos_00_00_00"`, `"pos_01_01_01"`, `"pos_02_02_02"`

### Sticker IDs

- **Format**: `"{cubie_id}_{face}_sticker"`
- **Examples**: `"pos_00_00_00_F_sticker"`, `"pos_01_01_01_R_sticker"`

See [Coordinate System](./coordinate-system.md) for details.

## Data Flow

### Initialization

```plaintext
1. CubeInvariants generated for cube size
   - Canonical cubie positions computed
   - Move tables built with permutations and orientation deltas
   - Cubology invariants validated
   ↓
2. CubieManager creates original cube structure
   - All cubies at canonical positions
   - All orientations = 0 (solved state)
   ↓
3. Stickers created with localIndex and color
   - localIndex based on canonical face order
   - Colors assigned from position
   ↓
4. StateManager preserves original state
   ↓
5. CurrentState initialized as copy of original state
```

### Move Execution (Discrete Model)

```plaintext
1. User/Algorithm specifies move (e.g., "R")
   ↓
2. CubeInvariants provides move table
   - Corner permutation and orientation deltas
   - Edge permutation and flip flags
   ↓
3. MoveEngine applies permutation
   - Cubies move to new positions
   ↓
4. MoveEngine updates orientations
   - orientation_new = (orientation_old + delta) % 3 (corners)
   - orientation_new = orientation_old XOR flip (edges)
   ↓
5. Sticker faces recomputed dynamically
   - face = availableFaces[(localIndex + orientation) % 3]
   ↓
6. CurrentState updated
   ↓
7. Views notified of state change
```

**Key Differences from Geometric Model:**

- No trigonometric calculations
- No floating-point accumulation errors
- Deterministic state transitions
- Pre-computed move tables ensure invariants

### View Update

Views receive detailed state change notifications through the enhanced
`MoveExecutedEvent`:

```plaintext
1. View receives MoveExecutedEvent with:
   - preState/postState: Complete before/after cube states (readonly)
   - movedCubies: Detailed information about changed cubies
    - definition: Structured move metadata (axis, layers, angle)
   ↓
2. View chooses update strategy:
   - Selective Update: Update only moved cubies (preferred for performance)
   - Full Update: Re-render entire view (fallback for compatibility)
   ↓
3. View renders based on:
   - Cubie positions and orientations (3D views)
   - Sticker colors and calculated positions (2D views)
   - Animation data from movedCubies for smooth transitions
```

**Performance Optimizations:**

- Selective updates reduce DOM operations for large cubes
- Readonly states prevent accidental mutations
- Lazy evaluation of optional event fields
- Delta-only mode for memory efficiency

## Testing Strategy

### Unit Tests

- Each component tested independently
- Mock dependencies for isolation
- 100% coverage of core functionality

### Integration Tests

- Test component interactions
- Verify state consistency across moves
- Validate for multiple cube sizes (2×2 to 5×5)

**Files**: `*.test.ts` alongside source files

## Generic Cube Size Support

The architecture supports any cube size n ≥ 2:

### 2×2×2 Cube

- 8 corner cubies only
- No middle slices (M, E, S illegal)
- Simpler algorithms

### 3×3×3 Cube

- 8 corners + 12 edges + 6 centers = 26 cubies
- Standard M, E, S slices
- Classic algorithms

### 4×4×4 and Larger

- Additional center cubies
- Multiple middle slices (2M, 3M, etc.)
- More complex algorithms
- Parity cases (future implementation)

**Automatic Scaling**: All core components automatically handle different sizes
without code changes. Views are currently hardcoded for 3×3×3 (reading
`cubeSize` from state is future-proofing only).

## Performance Characteristics

### Time Complexity

- **Cubie Creation**: O(n³) - once at initialization
- **Move Execution**: O(n²) - affects one layer
- **Layer Enumeration**: O(n³) - scans all cubies
- **State Comparison**: O(n³) - compares all cubies

### Space Complexity

- **Cubie Storage**: O(n³) - one cubie per coordinate
- **Sticker Storage**: O(n³) - multiple stickers per cubie
- **Original State**: O(n³) - complete copy of initial state
- **Current State**: O(n³) - complete current configuration

### Optimizations

- Orientation copying from original state (no trigonometric calculations)
- Lazy layer evaluation (computed when needed)
- ID-based lookups (O(1) cubie/sticker access)
- Type determination from coordinates (no lookup tables)
- **Enhanced Event System**: Selective view updates reduce DOM operations from
  O(n²) to O(k) where k is moved cubies
- **Readonly States**: Compile-time safety prevents accidental mutations
- **Delta Updates**: Optional delta-only mode for memory efficiency with large
  cubes

## Related Documentation

- [Coordinate System](./coordinate-system.md) - 3D coordinate conventions and ID
  formats
- [Move Notation](./move-notation.md) - How moves are specified and parsed
- [Discrete Orientation System](./discrete-orientation-system.md) - How
  orientations are calculated and managed
