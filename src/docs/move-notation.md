# Rubik's Cube Move Notation

## Official Standard Reference

This document describes Rubik's cube move notation based on the official World
Cube Association (WCA) regulations.

> **Official Reference:** World > Cube Association Regulations, > Article 12:
> Notation
>
> **URL:**
> <https://www.worldcubeassociation.org/regulations/#article-12-notation>
>
> **Version:** July 17, 2025

The WCA is the governing body for official Rubik's cube competitions worldwide,
and their regulations establish the authoritative standard for move notation
used in competitive solving.

---

## 📋 Document Structure

This document covers:

1. **WCA Standard Notation** - Officially defined moves per WCA regulations
2. **Community Extensions** - Widely used notations not officially in WCA
   regulations
3. **Project Extensions** - Custom notations and implementation details for this
   project

---

## WCA Standard Notation

### Face Moves

| Notation                   | Description                               |
| -------------------------- | ----------------------------------------- |
| **R, L, U, D, F, B**       | Clockwise 90° rotation of respective face |
| **R', L', U', D', F', B'** | Counter-clockwise 90° rotation            |
| **R2, L2, U2, D2, F2, B2** | 180° rotation                             |

### Outer Block Moves (Wide Moves)

| Notation                               | Description                                |
| -------------------------------------- | ------------------------------------------ |
| **nRw, nLw, nUw, nDw, nFw, nBw**       | Rotate outer n layers from respective face |
| **nRw', nLw', nUw', nDw', nFw', nBw'** | Counter-clockwise rotation                 |
| **nRw2, nLw2, nUw2, nDw2, nFw2, nBw2** | 180° rotation                              |

> Note: For 3×3×3, n=2 is implicit (Rw = 2Rw)

### Cube Rotations

| Notation       | Description                           |
| -------------- | ------------------------------------- |
| **x, y, z**    | 90° clockwise rotation of entire cube |
| **x', y', z'** | 90° counter-clockwise rotation        |
| **x2, y2, z2** | 180° rotation                         |

WCA defines: x = same direction as R or L', y = same direction as U or D', z =
same direction as F or B'

---

## Community Extensions

These notations are widely used in the speedcubing community but are not
officially defined in WCA regulations for 3×3×3.

### Slice Moves (3×3×3)

| Notation       | Description                                    | Direction                    |
| -------------- | ---------------------------------------------- | ---------------------------- |
| **M**          | Middle layer between L and R (X-axis, layer 1) | Follows **L** face direction |
| **E**          | Middle layer between D and U (Y-axis, layer 1) | Follows **D** face direction |
| **S**          | Middle layer between F and B (Z-axis, layer 1) | Follows **F** face direction |
| **M', E', S'** | Counter-clockwise rotation                     |                              |
| **M2, E2, S2** | 180° rotation                                  |                              |

> **Note**: Slice moves follow the direction of the first (layer 0) face on
> their axis:
>
> - M rotates like L (not R)
> - E rotates like D (not U)
> - S rotates like F (not B)

### Alternative Wide Move Notation

| Notation             | Alternative            | Description          |
| -------------------- | ---------------------- | -------------------- |
| **r, l, u, d, f, b** | Rw, Lw, Uw, Dw, Fw, Bw | Lowercase wide moves |

---

## Project Extensions

These are custom notations and implementation details specific to this project.

## Coordinate System and Rotation Semantics

### Axis-Based Rotation Definition

All rotations are defined relative to the cube's coordinate system:

- **X-axis**: Left (-X) to Right (+X)
- **Y-axis**: Bottom (-Y) to Top (+Y)
- **Z-axis**: Front (-Z) to Back (+Z)

**Clockwise (CW)** means clockwise when viewed from negative to positive on the
axis of rotation.

### Face-to-Axis Mapping

| Face  | Axis | Index      | External Description         | Internal Semantics |
| ----- | ---- | ---------- | ---------------------------- | ------------------ |
| **R** | X    | cubeSize-1 | Rotate right face clockwise  | CCW from -X to +X  |
| **L** | X    | 0          | Rotate left face clockwise   | CW from -X to +X   |
| **U** | Y    | cubeSize-1 | Rotate top face clockwise    | CCW from -Y to +Y  |
| **D** | Y    | 0          | Rotate bottom face clockwise | CW from -Y to +Y   |
| **F** | Z    | 0          | Rotate front face clockwise  | CW from -Z to +Z   |
| **B** | Z    | cubeSize-1 | Rotate back face clockwise   | CCW from -Z to +Z  |

**Important**: External move behavior remains identical. Only the internal
coordinate-based description changes.

### Extended Slice Moves (4×4+)

For cubes larger than 3×3, slices are numbered from the outer layer inward.

| Notation          | Description                |
| ----------------- | -------------------------- |
| **2M, 3M, 4M...** | Vertical slices (X-axis)   |
| **2E, 3E, 4E...** | Horizontal slices (Y-axis) |
| **2S, 3S, 4S...** | Standing slices (Z-axis)   |

### Alternative Layer Notation

> **Status: Planned — Not Yet Implemented.** The notations in this section
> (Indexed Face Layers, Axis Notation, Two-Axis Notation) are design proposals.
> The parser does not currently support them.

#### Indexed Face Layers

Specify layers by distance from the face (0 = outer layer).

| Notation | Description              | Example (5×5) |
| -------- | ------------------------ | ------------- |
| **2L**   | Second layer from left   | x=1           |
| **2R**   | Second layer from right  | x=3           |
| **2U**   | Second layer from top    | y=3           |
| **2D**   | Second layer from bottom | y=1           |
| **2F**   | Second layer from front  | z=1           |
| **2B**   | Second layer from back   | z=3           |

#### Axis Notation

Specify layers by axis and index directly.

| Notation | Description | Example (5×5)           |
| -------- | ----------- | ----------------------- |
| **0X**   | Plane x=0   | Left face               |
| **2X**   | Plane x=2   | Middle vertical slice   |
| **4X**   | Plane x=4   | Right face              |
| **0Y**   | Plane y=0   | Bottom face             |
| **2Y**   | Plane y=2   | Middle horizontal slice |
| **0Z**   | Plane z=0   | Front face              |

#### Two-Axis Notation

Specify plane by intersection of two axes (must include index).

| Notation | Equivalent | Description                                  |
| -------- | ---------- | -------------------------------------------- |
| **0XY**  | 0Z         | Plane where x and y axes intersect (z-plane) |
| **2XY**  | 2Z         | z=2 plane                                    |
| **1YZ**  | 1X         | x=1 plane                                    |
| **3XZ**  | 3Y         | y=3 plane                                    |

## Notation Normalization

> **Status: Planned — Not Yet Implemented.** The normalization rules described
> below are a design proposal. The current parser only normalizes apostrophe
> character variants.

For consistency in move history and algorithms, alternative notations should be
normalized to standard form:

### Normalization Rules

1. **Wide moves**: Keep as-is (`Rw`, `3Uw`)
2. **Slice moves**: Normalize to numbered form
   - 3×3: `M` → `1M`, `E` → `1E`, `S` → `1S`
   - 4×4+: Keep numbered form
3. **Indexed layers**: Convert to standard notation
   - `2L` → `1M` (if applicable) or keep descriptive
4. **Axis notation**: Convert to face notation when possible
   - `0X` → `L`, `4X` (5×5) → `R`
5. **Two-axis**: Convert to single axis
   - `0XY` → `0Z` → `F`

---

## Move Sequences and Algorithms

### Sequence Notation

Moves are written in sequence, separated by spaces:

```plaintext
R U R' U'           // Sexy move
F R U R' U' F'      // F2L pair insertion
R U R' U R U2 R'    // Sune algorithm
```

### Comments

Use `//` for inline comments:

```plaintext
R U R' U'  // Sexy move
R U R' U'  // Repeat
```

### Grouping

Use parentheses for repeated sequences:

```plaintext
(R U R' U') × 6    // Repeat 6 times
[R' D' R D] × 3    // Repeat 3 times
```

---

## Special Cases

### Even-Sized Cubes (4×4, 6×6, etc.)

Even-sized cubes have no fixed center cubies and may require **parity
algorithms**:

- **OLL Parity**: Single edge appears flipped
- **PLL Parity**: Two edges need to swap

**Note**: Parity handling is deferred to a later implementation phase.

### 2×2×2 Cube

Only face moves are valid (no slices or wide moves):

```plaintext
Valid: R, L, U, D, F, B (and ', 2 modifiers)
Invalid: M, E, S, Rw, etc.
```

---

## Examples by Cube Size

### 3×3×3 Cube Moves

```plaintext
R U R' U'           // Standard moves
M U M' U'           // Community slice moves
Rw U Rw' U'         // Wide moves
```

### 4×4×4 Cube Moves

```plaintext
R U R' U'           // Outer layer
Rw U Rw' U'         // 2 layers
r U r' U'           // Same as Rw (alternative notation)
2R U 2R' U'         // Second layer from right
```

### 5×5×5 Cube Moves

```plaintext
R U R' U'           // Outer layer
Rw U Rw' U'         // 2 layers
3Rw U 3Rw' U'       // 3 layers
2M U 2M' U'         // Middle slice
```

### 7×7×7 Cube Moves

```plaintext
R U R' U'           // Outer layer
3Rw U 3Rw' U'       // 3 layers
2E R 2E' R'         // Second horizontal slice
3M 4M 2S            // Multiple slice moves
```

---

## Implementation Notes

### Parser Requirements

1. Support face moves, wide moves, slice moves, cube rotations, and their
   modifiers (`'`, `2`)
2. Normalize apostrophe character variants to standard `'`
3. Validate moves against pre-built move tables for the current cube size

> **Note:** Sequence parsing (comments, whitespace splitting, grouping, and
> repetition) is not yet implemented. Moves are currently parsed individually.

### Move Validation

```typescript
function isValidMove(move: string, cubeSize: number): boolean {
  // Check if move is valid for given cube size
  // E.g., M,E,S invalid for 2×2×2
  // Slice indices must be < cubeSize
}
```

### String-to-Move Conversion

```typescript
interface Move {
  layer: string; // "R", "2M", "0X", etc.
  direction: 1 | -1 | 2; // CW, CCW, 180°
}

function parseMove(notation: string): Move {
  // Parse notation string to Move object
  // Handle ', 2 modifiers
  // Normalize layer notation
}
```
