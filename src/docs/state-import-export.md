# State Import/Export System

## Overview

The Rubik's Cube application provides comprehensive state persistence, allowing
users to:

- **Automatically save** cube states when closing the application
- **Automatically restore** the last cube state when reopening the application
- **Manually export** cube states as plain text files for backup or sharing
- **Manually import** cube states from plain text files

This enables users to preserve their progress, share interesting cube
configurations, and work across multiple sessions without losing data.

## String Format

States are persisted using a compact string format:

`<cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...`

Optionally followed by a newline and space-separated move history:

```plaintext
<cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...
<move1> <move2> <move3> ...
```

**Example for solved 3x3x3:**

```plaintext
3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
```

**Example with move history:**

```plaintext
3:UDFBLR:WWWWWWWWW:YYYYYYYYY:OOOOOOOOO:RRRRRRRRR:GGGGGGGGG:BBBBBBBBB
R U R' U'
```

**Color codes:** W=White, Y=Yellow, O=Orange, R=Red, G=Green, B=Blue

## Architecture

### Components

1. **StatePersistence**
   ([src/cube/core/state-persistence.ts](../cube/core/state-persistence.ts))
   - Core module for serialization and storage
   - Handles localStorage operations
   - Provides import/export functionality
   - Manages file download/upload
   - Uses string format (not JSON)

2. **StateManager**
   ([src/cube/core/state-manager.ts](../cube/core/state-manager.ts))
   - Extended with `importState()` and `exportState()` methods
   - Validates imported states before applying
   - Ensures state integrity

3. **CubeController** ([src/cube-controller.ts](../cube-controller.ts))
   - Provides high-level import/export API
   - Resets move history on state import
   - Delegates to StateManager

4. **Application** ([src/application.ts](../application.ts))
   - Orchestrates automatic persistence
   - Restores state on startup
   - Handles event listeners for manual import/export
   - Sets up periodic auto-save (every 30 seconds)

## Features

### Automatic State Persistence

The application automatically saves the cube state in two scenarios:

1. **On Application Exit**: When the browser window is closed or refreshed, the
   current cube state is saved to localStorage
2. **Periodic Auto-Save**: Every 30 seconds, the current state is automatically
   saved to prevent data loss

On application startup, if a saved state exists, it is automatically restored.

### Manual State Management

Users can manually manage cube states through commands:

#### Export State

- Trigger via command system
- Downloads a plain text file with the current cube configuration
- Filename format: `rubiks-cube-state-{timestamp}.txt`
- File contains string-formatted cube state

#### Import State

- Trigger via command system
- Select a previously exported text file
- Cube immediately updates to the imported state
- Move history is cleared on import
- Validation ensures cube size compatibility

#### Clear Saved Data

- Trigger via command system
- Removes all saved states from localStorage
- Clears both automatic saves and view layout preferences
- Useful for starting fresh or troubleshooting

## Storage Format

### String Structure

```plaintext
<cubeSize>:<faceOrder>:<face1Colors>:<face2Colors>:...
[optional newline]
[optional move history]
```

**Components:**

- `cubeSize`: Size of the cube (e.g., "3" for 3x3x3)
- `faceOrder`: Face sequence (always "UDFBLR")
- `faceNColors`: String of color codes for each face (n² characters)
- `moveHistory`: Optional space-separated move notations (e.g., "R U R' U'")

### localStorage Key

The automatic save feature uses the key `rubikCube_autoSave` in localStorage.

### Data Preservation

The serialization preserves:

- All cubie positions and orientations
- All sticker colors and positions
- Cube size
- Move history (optional)

## API Reference

### StatePersistence

#### Core Conversion Methods

**`stateToString(state: CubeState, moveHistory?: MoveHistory): string`**

- Converts a cube state to string format
- Optionally includes move history on a new line using `MoveHistory.serialize()`
- Returns compact string representation

**`stringToState(stateString: string): { state: CubeState; moveHistory?: MoveHistory } | null`**

- Reconstructs a CubeState from a string
- Returns object with state and optional MoveHistory instance, or `null` on
  error
- Uses `MoveHistory.deserialize()` for move history parsing
- Validates format and cube size

**`parseStateString(str: string): { cubeSize: number; faceOrder: string; faceColors: string[]; moveHistory?: MoveHistory } | null`**

- Parses a state string into components
- Extracts optional move history as MoveHistory instance if present
- Returns parsed data or `null` if invalid

**`validateStateString(stateString: string): boolean`**

- Validates a state string format
- Returns `true` if valid

#### localStorage Methods

**`saveState(state: CubeState, moveHistory?: MoveHistory): boolean`**

- Saves a cube state to localStorage
- Optionally saves move history using `MoveHistory.serialize()`
- Returns `true` if successful, `false` on error

**`loadState(): string | null`**

- Loads the saved cube state string from localStorage
- Returns the string or `null` if none exists

**`clearState(): boolean`**

- Clears the saved state from localStorage
- Returns `true` if successful

**`hasSavedState(): boolean`**

- Checks if a saved state exists
- Returns `true` if a state is saved

#### File Operations

**`exportState(state: CubeState, moveHistory?: MoveHistory): string`**

- Exports a cube state as a plain string
- Optionally includes move history using `MoveHistory.serialize()`
- Returns string representation

**`downloadState(state: CubeState, moveHistory?: MoveHistory, filename?: string): void`**

- Downloads a cube state as a text file
- Optionally includes move history in the file
- Optional custom filename (default: `rubiks-cube-state-{timestamp}.txt`)

**`uploadState(): Promise<{ state: CubeState; moveHistory?: MoveHistory } | null>`**

- Opens file picker to upload a state file
- Returns a promise resolving to object with state and optional MoveHistory
  instance
- Uses `MoveHistory.deserialize()` to reconstruct move history
- Accepts `.txt` and `.cube` files

### StateManager

**`importState(state: CubeState): void`**

- Imports a cube state into the state manager
- Validates cube size compatibility
- Throws error if state is invalid

**`exportState(): CubeState`**

- Exports a deep copy of the current state
- Safe for serialization

### CubeController

**`importState(state: CubeState, moveHistory?: MoveHistory): void`**

- Imports a cube state
- Optionally replaces current move history with imported MoveHistory instance
- Clears existing move history if none provided
- Delegates to StateManager

**`exportState(): { state: CubeState; moveHistory: MoveHistory }`**

- Exports the current cube state and move history
- Returns object with state and MoveHistory instance
- MoveHistory can be serialized using its `serialize()` method
- Suitable for persistence

## Error Handling

The system handles various error conditions gracefully:

1. **Storage Quota Exceeded**: Returns `false` and logs error
2. **Invalid Format**: Returns `null` and logs error
3. **Cube Size Mismatch**: Throws error with descriptive message
4. **Missing Required Fields**: Returns `null` with error log

All errors are logged to the console for debugging.

## Performance Considerations

- **Auto-save Frequency**: 30 seconds balances data safety with performance
- **State Size**: A 3x3x3 cube state is approximately 80 characters
- **localStorage Limits**: Most browsers support 5-10 MB per origin
- **Deep Copy**: State copies ensure immutability but have memory cost

## Security Considerations

- **User Data**: All data is stored locally in the user's browser
- **No Server Transmission**: States are never sent to external servers
- **File Upload**: Only text files (`.txt`, `.cube`) are accepted for import
- **Validation**: Imported states are validated before application

## Testing

Comprehensive test suite in
[state-persistence.test.ts](../cube/core/state-persistence.test.ts) covers:

- Save/load operations
- Export/import functionality
- Error handling
- String format validation
- Integration with StateManager
- State preservation across moves

Run tests:

```bash
npm test state-persistence
```

## See Also

- [Architecture Overview](./architecture-overview.md)
- [Cube State Types](../cube/types/cube-state.ts)
- [State Manager](../cube/core/state-manager.ts)
