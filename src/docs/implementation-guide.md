# Implementation Guide

This guide provides detailed implementation information for working with the Rubik's Cube codebase.

## File Organization

```plaintext
src/
├── cube/
│   ├── types/
│   │   ├── common.ts          # Shared types (Face, Color, Axis)
│   │   ├── cubie.ts           # Cubie, Position3D, CubieType, DiscreteOrientation
│   │   ├── sticker.ts         # Sticker interface with localIndex
│   │   ├── cube-state.ts      # CubeState with Immutable.js Maps
│   │   ├── move.ts            # MoveDefinition, MoveResult, QuarterTurn
│   │   ├── model.ts           # CubeModel and ReadOnlyCubeModel interfaces
│   │   ├── view.ts            # View-related type definitions
│   │   └── index.ts           # Re-exports for cube types
│   ├── core/
│   │   ├── cubie-manager.ts       # Cubie creation and initialization
│   │   ├── state-manager.ts       # State lifecycle and mutation control
│   │   ├── layer-manager.ts       # Static layer filtering utilities
│   │   ├── move-engine.ts         # Pure move computation
│   │   ├── cube-invariants.ts     # Pre-computed lookup tables
│   │   ├── move-history.ts        # Undo/redo tracking
│   │   ├── move-parser.ts         # Parse WCA notation strings → MoveDefinition
│   │   └── state-persistence.ts   # Serialization and storage
│   └── utils/
│       ├── coordinates.ts        # ID generation, type determination
│       ├── cubie.ts              # Cubie utilities and helpers
│       ├── face-utils.ts         # Face computation logic
│       ├── sticker-position.ts   # Sticker positioning on faces
│       ├── state-conversion.ts   # 3D to 2D view conversion
│       ├── state-legality.ts     # Cubology invariant validation
│       ├── math.ts               # Vector math and rotations
│       ├── surface-walking.ts    # Surface traversal utilities
│       ├── view-utils.ts         # View helper utilities
│       └── index.ts              # Re-exports for cube utils
├── interaction/
│   ├── drag-state-machine.ts     # Pointer event FSM → emits DragGesture callbacks
│   ├── move-inference.ts         # Maps drag direction + face → move notation
│   ├── keyboard-moves.ts         # Keyboard shortcut → cube move mapping
│   └── types.ts                  # DragDirection, DragGesture, MoveInferenceInput
├── types/
│   ├── commands.ts               # Command, CommandCategory, KeyBinding types
│   ├── events.ts                 # EventName constants + EventPayload interfaces
│   └── index.ts                  # Re-exports for app-level types
├── diagnostics/
│   ├── diagnostics.ts            # Diagnostic utilities
│   └── logger.ts                 # Structured logger (LogLevel 0–5, colorized)
├── view-manager/
│   ├── view-manager.ts           # Multi-view coordination
│   ├── view-registry.ts          # View type registration
│   └── panel-*.ts                # Panel interaction handlers
├── views/
│   ├── basic/                    # Pseudo-3D net view
│   ├── circular/                 # Concentric-ring SVG view
│   ├── flat/                     # Flat 2D projection view
│   └── moves/                    # Move history list view
├── events/
│   └── event-bus.ts              # Global event system
└── docs/
    ├── README.md                          # Documentation index
    ├── architecture-overview.md           # System design
    ├── circular-view.md                   # Circular SVG view details
    ├── color-system.md                    # Color tokens and theming
    ├── commanding-and-eventing-system.md  # Commands and events
    ├── coordinate-system.md               # 3D coordinates and IDs
    ├── discrete-orientation-system.md     # Integer orientation model
    ├── move-notation.md                   # Move specification
    ├── state-import-export.md             # State persistence and I/O
    ├── user-interface-design.md           # UI layout and behavior
    └── implementation-guide.md            # This file
```

## Core Component APIs

### 1. CubieManager

**File**: `src/cube/core/cubie-manager.ts`

**Constructor:**

```typescript
const cubieManager = new CubieManager(cubeSize);
```

**Creating Cubies:**

```typescript
// Create all cubies (physical + virtual centers)
const cubies: Map<CubieId, Cubie> = cubieManager.createAllCubies();

// Returns:
// - Physical cubies at surface positions
// - 6 virtual center cubies (virtual_center_F, virtual_center_U, etc.)
```

**Virtual Centers:**

Virtual centers are created for face tracking:

```typescript
// Virtual center IDs:
// "virtual_center_F", "virtual_center_U", "virtual_center_R"
// "virtual_center_B", "virtual_center_L", "virtual_center_D"

// These cubies:
// - Have type CubieType.VIRTUAL_CENTER
// - Are NOT in cubiesByPosition map
// - ARE in cubiesById map
// - Participate only in whole-cube rotations (x, y, z)
```

### 2. StateManager

**File**: `src/cube/core/state-manager.ts`

**Constructor:**

```typescript
const stateManager = new StateManager(cubeSize);
// Automatically creates original state and current state
```

**Accessing State:**

```typescript
// Get immutable original state (solved cube)
const originalState: CubeState = stateManager.getOriginalState();

// Get current state (mutable through StateManager only)
const currentState: CubeState = stateManager.getCurrentState();

// Both states include:
// - cubiesById: IMap<CubieId, Cubie>
// - cubiesByPosition: IMap<PositionKey, Cubie> (physical cubies only)
// - cubeSize: number
// - timestamp: number
```

**Applying Moves:**

```typescript
// StateManager is the ONLY component that mutates state
const moveResult: MoveResult = moveEngine.executeMove(moveDefinition, currentState);
stateManager.applyMoveResult(moveResult);
```

**Reset:**

```typescript
// Reset to original solved state
stateManager.resetToOriginal();
```

### 3. LayerManager

**File**: `src/cube/core/layer-manager.ts`

All methods are static. No instantiation needed.

**Get Cubies in a Slice:**

```typescript
// Get all cubies at specific coordinate
const cubies: ReadonlyCubie[] = LayerManager.getSliceCubies(
  // axis
  Axis.X,
  // coordinate (0 to cubeSize-1)
  2,
  // current cube state
  state
);

// Returns physical cubies only (excludes virtual centers)
```

**Get Cubies for a Move:**

```typescript
// Get all cubies affected by a move (including virtual centers if whole-cube)
const moveDefinition: MoveDefinition = moveEngine.getMoveDefinition('R');
const affectedCubies: ReadonlyCubie[] = LayerManager.getCubiesForMove(moveDefinition, state);

// For standard moves: returns physical cubies in the layer
// For whole-cube rotations (x, y, z): includes all virtual centers
```

**Check Whole-Cube Rotation:**

```typescript
const isWholeCube: boolean = LayerManager.isWholeCubeRotation(moveDefinition);
// Returns true for x, y, z moves (regardless of modifiers)
```

### 4. MoveEngine

**File**: `src/cube/core/move-engine.ts`

**Constructor:**

```typescript
const moveEngine = new MoveEngine(originalState);
// Requires original state for initialization
```

**Get Move Definition:**

```typescript
// Retrieve canonical move definition by notation
const moveDefinition: MoveDefinition = moveEngine.getMoveDefinition('R');
const moveDefinition2: MoveDefinition = moveEngine.getMoveDefinition("U'");
const moveDefinition3: MoveDefinition = moveEngine.getMoveDefinition('F2');

// MoveDefinition structure:
interface MoveDefinition {
  name: string; // "R", "U'", "F2", etc.
  axis: Axis; // X, Y, or Z
  layerIndices: number[]; // Affected layer coordinates
  angle: QuarterTurn; // 90, -90, 180
}
```

**Execute Move (Pure Computation):**

```typescript
// Compute transformation without mutating state
const result: MoveResult = moveEngine.executeMove(moveDefinition, currentState);

// MoveResult structure:
interface MoveResult {
  movedCubies: {
    before: ReadonlyCubie[]; // Cubies before transformation
    after: Cubie[]; // Cubies after transformation
  };
  preState: CubeState; // State before move
  postState: CubeState; // State after move (new object)
}

// MoveEngine never mutates the input state
```

**Complete Move Execution Pattern:**

```typescript
// 1. Get move definition
const move = moveEngine.getMoveDefinition('R');

// 2. Compute transformation (pure function)
const result = moveEngine.executeMove(move, stateManager.getCurrentState());

// 3. Apply transformation (only StateManager mutates state)
stateManager.applyMoveResult(result);

// 4. Access updated state
const updatedState = stateManager.getCurrentState();
```

### 5. CubeInvariants

**File**: `src/cube/core/cube-invariants.ts`

**Getting Invariants:**

```typescript
import { getCubeInvariants } from '@/cube/core/cube-invariants';

const invariants: CubeInvariants = getCubeInvariants(3);

// Cached per cube size - subsequent calls return same instance
```

**Using Invariants:**

```typescript
// Access cube metadata
const cornerCount = invariants.cornerCount; // 8
const edgeCount = invariants.edgeCount; // 12 (3x3)
const centerCount = invariants.centerCount; // 6 (physical centers)

// Access canonical positions
const positions: Position3D[] = invariants.canonicalPositions;
const cornerPositions = positions.slice(0, cornerCount);

// Access move definitions
const rMove: MoveDefinition = invariants.moveDefinitions.get('R')!;

// Access move tables
const rTable: MoveTable = invariants.moveTables.get('R')!;
// rTable.cornerPerm: permutation array
// rTable.cornerOriDelta: orientation changes
```

**Cubie Classification:**

```typescript
// Fine-grained cubie subtypes
const category: CubieSubType = invariants.cubieCategoriesByIndex[canonicalIndex];

// Possible values:
// - CubieSubType.CORNER
// - CubieSubType.WING_EDGE (outer edges)
// - CubieSubType.MIDDLE_EDGE (inner edges)
// - CubieSubType.FIXED_CENTER (odd-size central centers)
// - CubieSubType.X_CENTER (symmetry centers)
// - CubieSubType.OBLIQUE_CENTER (off-axis centers)
```

### 6. MoveHistory

**File**: `src/cube/core/move-history.ts`

**Creating History:**

```typescript
// Empty history
const history = new MoveHistory();

// With initial moves
const history = new MoveHistory(['R', 'U', "R'", "U'"]);
```

**Recording Moves:**

```typescript
// Add move to history
history.addMove('R');
history.addMove("U'");

// Truncates future moves if not at end
```

**Undo/Redo:**

```typescript
// Check availability
if (history.canUndo()) {
  const move: string = history.undo()!;
  // Returns the move that was undone
  // Execute inverse move to undo
}

if (history.canRedo()) {
  const move: string = history.redo()!;
  // Returns the move to reapply
  // Execute this move to redo
}
```

**Accessing History:**

```typescript
// Get current position in history
const currentMoves: string[] = history.getCurrentMoves();
// Returns moves from start to current position

// Get all moves (including future if any)
const allMoves: readonly string[] = history.getMoves();
```

### 7. StatePersistence

**File**: `src/cube/core/state-persistence.ts`

All methods are static.

**Serialize State:**

```typescript
// Convert state to string
const stateString: string = StatePersistence.stateToString(state);

// With move history
const stateString: string = StatePersistence.stateToString(state, moveHistory);

// Format:
// 3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
// R U R' U'
```

**Deserialize State:**

```typescript
// Parse string back to state
const state: CubeState | null = StatePersistence.stringToState(stateString);

// Returns null if invalid
```

**Validate State String:**

```typescript
// Check validity before parsing
const validation: ValidationResult = StatePersistence.validateStateString(stateString);

if (validation.valid) {
  const state = StatePersistence.stringToState(stateString);
}
```

**Auto-Save/Load:**

```typescript
// Save to localStorage
StatePersistence.autoSave(state, moveHistory);

// Load from localStorage
const loaded = StatePersistence.autoLoad();
if (loaded) {
  const { state, moveHistory } = loaded;
}
```

## Utility Functions

### Coordinate Utilities

**File**: `src/cube/utils/coordinates.ts`

**Generate IDs:**

```typescript
// Generate position key / cubie ID
const cubieId: CubieId = getCubieId({ x: 0, y: 0, z: 0 }, 3);
// Returns: "pos_00_00_00"

const positionKey: PositionKey = getPositionKey({ x: 2, y: 1, z: 0 }, 3);
// Returns: "pos_02_01_00"

// Virtual center ID
const virtualId: CubieId = createVirtualCenterCubieId(Face.F);
// Returns: "virtual_center_F"

// Sticker ID
const stickerId: StickerId = getStickerId(cubieId, Face.F);
// Returns: "pos_00_00_00_F_sticker"
```

**Determine Cubie Type:**

```typescript
const cubieType: CubieType = getCubieType({ x: 0, y: 0, z: 0 }, 3);
// Returns: CubieType.CORNER

const edgeType: CubieType = getCubieType({ x: 0, y: 1, z: 0 }, 3);
// Returns: CubieType.EDGE
```

**Get All Positions:**

```typescript
// Get all surface positions for cube size
const positions: Position3D[] = getAllPositions(3);
// Returns array of all valid surface positions
```

### Cubie Utilities

**File**: `src/cube/utils/cubie.ts`

**Create Cubie Copy:**

```typescript
// Create immutable cubie with updated sticker faces
const newCubie: Cubie = createCubieFromCubie(cubie, cubeSize);
// Deep copies cubie, recomputes sticker faces/positions, freezes result
```

**Check Virtual Center:**

```typescript
const isVirtual: boolean = isVirtualCenterCubie(cubie);
// Returns true if cubie.type === CubieType.VIRTUAL_CENTER
```

### State Conversion

**File**: `src/cube/utils/state-conversion.ts`

**Convert to 2D Face View:**

```typescript
// Create flat 2D representation for legacy views
const faceGrids: Map<Face, Color[][]> = createFlatView(state);

// Returns 2D color arrays for each face
// faceGrids.get(Face.F) → [[Color.RED, ...], [...], ...]
```

### State Legality

**File**: `src/cube/utils/state-legality.ts`

**Validate State:**

```typescript
import { checkCornerTwist, checkEdgeFlip, isStateLegal } from '@/cube/utils/state-legality';

// Full legality check
const legal: boolean = isStateLegal(state);

// Individual checks
const cornerTwistValid: boolean = checkCornerTwist(state); // Sum ≡ 0 (mod 3)
const edgeFlipValid: boolean = checkEdgeFlip(state); // Even parity
```

## Common Implementation Patterns

### Pattern 1: Execute a Move

```typescript
// Complete move execution with state mutation
function executeMove(notation: string) {
  // 1. Get move definition
  const moveDefinition = moveEngine.getMoveDefinition(notation);

  // 2. Get current state
  const currentState = stateManager.getCurrentState();

  // 3. Compute transformation (pure function)
  const result = moveEngine.executeMove(moveDefinition, currentState);

  // 4. Apply to state (only mutation point)
  stateManager.applyMoveResult(result);

  // 5. Record in history
  moveHistory.addMove(notation);

  // 6. Emit event for views
  eventBus.emit('move-executed', {
    move: moveDefinition,
    result,
  });
}
```

### Pattern 2: Undo a Move

```typescript
function undoMove() {
  // 1. Get move from history
  const move = moveHistory.undo();
  if (!move) return;

  // 2. Compute inverse move
  const inverseName = getInverseMove(move);

  // 3. Execute inverse (without recording)
  const moveDefinition = moveEngine.getMoveDefinition(inverseName);
  const currentState = stateManager.getCurrentState();
  const result = moveEngine.executeMove(moveDefinition, currentState);
  stateManager.applyMoveResult(result);

  // 4. Emit event
  eventBus.emit('move-undone', { move, result });
}

function getInverseMove(move: string): string {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith('2')) return move;
  return move + "'";
}
```

### Pattern 3: Reset to Solved State

```typescript
function resetCube() {
  // 1. Reset state
  stateManager.resetToOriginal();

  // 2. Clear history
  moveHistory.clear();

  // 3. Emit event
  eventBus.emit('cube-reset', {
    state: stateManager.getCurrentState(),
  });
}
```

### Pattern 4: Query Layer Cubies

```typescript
function highlightRightFace(cubeSize: number) {
  // 1. Get current state
  const state = stateManager.getCurrentState();

  // 2. Get right face cubies (x = cubeSize - 1)
  const cubies = LayerManager.getSliceCubies(Axis.X, cubeSize - 1, state);

  // 3. Extract cubie IDs for highlighting
  const cubieIds = cubies.map(c => c.id);

  // 4. Emit highlight event
  eventBus.emit('highlight-cubies', { cubieIds });
}
```

### Pattern 5: Save/Load State

```typescript
// Save current state
function saveState() {
  const state = stateManager.getCurrentState();
  const stateString = StatePersistence.stateToString(state, moveHistory);

  // Save to file or localStorage
  localStorage.setItem('savedCube', stateString);
}

// Load saved state
function loadState(stateString: string): boolean {
  // 1. Validate
  const validation = StatePersistence.validateStateString(stateString);
  if (!validation.valid) {
    console.error(validation.errors);
    return false;
  }

  // 2. Parse
  const state = StatePersistence.stringToState(stateString);
  if (!state) return false;

  // 3. Apply (would need method on StateManager)
  // stateManager.setState(state);

  return true;
}
```

### Pattern 6: Iterate Over Cubies by Type

```typescript
function processCorners(state: CubeState) {
  const invariants = getCubeInvariants(state.cubeSize);

  // Get corner positions
  const cornerPositions = invariants.canonicalPositions.slice(0, invariants.cornerCount);

  // Access corners from state
  for (const position of cornerPositions) {
    const key = getPositionKey(position, state.cubeSize);
    const cubie = state.cubiesByPosition.get(key);

    if (cubie && cubie.type === CubieType.CORNER) {
      // Process corner cubie
      console.log(`Corner at ${key}: orientation=${cubie.orientation}`);
    }
  }
}
```

## Type System Quick Reference

### Key Types

```typescript
// Position
type Position3D = { x: number; y: number; z: number };

// IDs
type CubieId = string; // "pos_XX_YY_ZZ" or "virtual_center_F"
type PositionKey = string; // "pos_XX_YY_ZZ"
type StickerId = string; // "{cubieId}_{face}_sticker"

// Cubie Types
enum CubieType {
  CORNER = 'corner',
  EDGE = 'edge',
  CENTER = 'center',
  VIRTUAL_CENTER = 'virtual_center',
}

// Cubie Subtypes
enum CubieSubType {
  CORNER = 'corner',
  WING_EDGE = 'wing_edge',
  MIDDLE_EDGE = 'middle_edge',
  FIXED_CENTER = 'fixed_center',
  X_CENTER = 'x_center',
  OBLIQUE_CENTER = 'oblique_center',
}

// Discrete Orientation
type DiscreteOrientation = number; // 0, 1, or 2

// Cubie
interface Cubie {
  id: CubieId;
  type: CubieType;
  position: Position3D;
  orientation: DiscreteOrientation;
  canonicalIndex: number;
  stickers: IMap<StickerId, Sticker>;
}

// Sticker
interface Sticker {
  id: StickerId;
  color: Color;
  cubieId: CubieId;
  localIndex: number;
  currentFace: Face;
  facePosition: Vector2;
}

// State
interface CubeState {
  cubiesById: IMap<CubieId, Cubie>;
  cubiesByPosition: IMap<PositionKey, Cubie>;
  cubeSize: number;
  timestamp: number;
}

// Move Definition
interface MoveDefinition {
  name: string;
  axis: Axis;
  layerIndices: number[];
  angle: QuarterTurn;
}

// Move Result
interface MoveResult {
  movedCubies: {
    before: ReadonlyCubie[];
    after: Cubie[];
  };
  preState: CubeState;
  postState: CubeState;
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- cubie-manager.test.ts

# Run with coverage
npm test -- --coverage
```

### Test File Locations

Tests are co-located with source files:

```plaintext
src/cube/core/cubie-manager.ts
src/cube/core/cubie-manager.test.ts

src/cube/utils/coordinates.ts
src/cube/utils/coordinates.test.ts
```

### Example Test Pattern

```typescript
import { describe, expect, it } from 'vitest';

import { CubieManager } from './cubie-manager';

describe('CubieManager', () => {
  it('should create all cubies for 3x3', () => {
    const manager = new CubieManager(3);
    const cubies = manager.createAllCubies();

    // 26 physical + 6 virtual = 32 total
    expect(cubies.size).toBe(32);
  });
});
```

## Performance Considerations

### Immutability

- States use Immutable.js Maps for zero-copy sharing
- Cubie and Sticker objects are frozen (Object.freeze)
- Position objects are frozen to prevent mutation

### Caching

- CubeInvariants cached per cube size
- Move definitions pre-computed in invariants
- Canonical indices computed once

### Lazy Evaluation

- Layers computed on-demand (not stored)
- Sticker faces computed dynamically
- No redundant storage of derived data

### Optimization Tips

```typescript
// ✅ Good: Reuse invariants
const invariants = getCubeInvariants(3);
for (const move of moves) {
  const def = invariants.moveDefinitions.get(move);
}

// ❌ Bad: Repeated lookups
for (const move of moves) {
  const invariants = getCubeInvariants(3); // Re-creates/re-fetches
}

// ✅ Good: Filter virtual centers once
const physicalCubies = Array.from(state.cubiesById.values()).filter(
  c => c.type !== CubieType.VIRTUAL_CENTER
);

// ✅ Good: Use cubiesByPosition for position lookups
const cubie = state.cubiesByPosition.get(positionKey);

// ❌ Bad: Linear search through cubiesById
const cubie = Array.from(state.cubiesById.values()).find(
  c => getPositionKey(c.position) === positionKey
);
```

## Debugging Tips

### Logging State

```typescript
import { logger } from '@/diagnostics/logger';

// Log cubie state
logger.info('Cubie state', {
  id: cubie.id,
  type: cubie.type,
  position: cubie.position,
  orientation: cubie.orientation,
});

// Log move execution
logger.debug('Move executed', {
  move: moveDefinition.name,
  affectedCubies: result.movedCubies.after.length,
});
```

### Inspecting State in DevTools

```typescript
// Make state accessible in console (development only)
if (import.meta.env.DEV) {
  (window as any).debugState = () => stateManager.getCurrentState();
  (window as any).debugInvariants = (size: number) => getCubeInvariants(size);
}

// In console:
// > debugState().cubiesById.size
// > debugInvariants(3).cornerCount
```
