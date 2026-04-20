# User Interface Design

## Overview

This document outlines the proposed UI layout, data structures, and
functionality for the Rubik's Cube application in v1. The design emphasizes
modularity, with views dynamically discovered at build time rather than
hardcoded.

## Architecture Principles

- **Dynamic View Discovery**: Views are not hardcoded in the application.
  Instead, they are discovered and loaded dynamically during the build process
  or runtime initialization.
- **Modular Actions**: All user actions are abstracted into a command pattern,
  allowing for easy extension and undo/redo functionality.
- **State Management**: Cube state is managed centrally, with persistence
  capabilities.

## UI Layout Structure

### Main Application Container

- **Header/Toolbar**: Contains action buttons and menu to open new views
- **Desktop/Workspace Area**: A canvas-like area where multiple floating windows
  can be displayed simultaneously
- **Status Bar**: Shows current cube state information (solved status, move
  count, etc.)
- **Sidebar (optional)**: For additional controls or information

### Window Management

- **Floating Windows**: Each view instance opens in its own resizable, movable,
  and closable floating window
- **Unlimited Instances**: Users can open unlimited number of view windows,
  allowing multiple perspectives on the same cube
- **Window Controls**: Minimize, maximize, close buttons on each window
- **Z-Index Management**: Windows can be brought to front/back
- **Window State Persistence**: Save/restore window positions and sizes (future
  feature)

### View System

Views are organized in the `src/views/` directory with the following structure:

```text
views/
├── basic/
├── circular/
├── flat/
└── moves/
```

Each view type can be instantiated multiple times, each in its own floating
window. Views implement a common interface and are registered during application
initialization.

## Core Data Structures

### Cube Model

- Represents the current state of the Rubik's Cube
- Supports serialization for save/load operations
- Tracks move history for undo/redo

### View Manager

- Discovers and manages available view types
- Handles creation of multiple view instances
- Manages window lifecycle (open, close, focus)
- Coordinates between view instances and the shared cube model

### Action System

- Command pattern implementation for all user actions
- Supports undo/redo operations
- Extensible for future actions

## Available Actions

### Reset Cube

- **Options**:
  - Drop current cube model and create a new one
  - Reset existing cube to solved state
- **Implementation**: Clears move history and reinitializes cube state

### Shuffle

- **Functionality**: Performs a series of random valid moves on the cube
- **Parameters**: Configurable number of moves (default: 20-30)
- **Implementation**: Uses random move generation with validation

### Load/Save Cube State

- **Save**: Serializes current cube state to a file or local storage
- **Load**: Deserializes and applies a saved cube state
- **Formats**: JSON-based serialization for portability
- **Storage Options**: Local file system, browser localStorage, or cloud storage
  (future)

### Undo/Redo Moves

- **Undo**: Reverts the last move applied to the cube
- **Redo**: Reapplies a previously undone move
- **Implementation**: Maintains a command history stack
- **UI Integration**: Keyboard shortcuts (Ctrl+Z/Ctrl+Y) and toolbar buttons

## Navigation and Selection

### Per-View Sticker Selection

Each view maintains its own independent selected sticker state:

- **Per-View Selection State**: Selection is local to each view instance;
  different views can have different stickers selected simultaneously.
- **Keyboard Navigation**: Arrow keys move selection to adjacent stickers with
  view-specific logic, including face boundary transitions.
- **Visual Feedback**: Selected stickers are clearly highlighted.
- **Face Transitions**: Navigation handles moving across face boundaries
  appropriately within each view.

> **Note**: An earlier design had a single global selection state managed by the
> ViewManager and synchronised across all views. This was replaced with per-view
> selection to give each view independent focus, which is a better fit for the
> multi-panel / multi-perspective use case.

### Manual View Rotation (Basic View)

The Basic 3D view supports manual rotation controls to adjust the viewing angle:

- **Ctrl+Left Arrow**: Rotates the cube counterclockwise around the Y-axis (when
  viewed from above), bringing the L (Left) face toward the viewer
- **Ctrl+Right Arrow**: Rotates the cube clockwise around the Y-axis, bringing
  the R (Right) face toward the viewer
- **Ctrl+Up Arrow**: Rotates the cube to bring the D (Down) face toward the
  viewer
- **Ctrl+Down Arrow**: Rotates the cube to bring the U (Up) face toward the
  viewer

**Technical Details**:

- Rotations are cumulative and increment in 90° steps
- The viewing angle (-25° X, -35° Y for normal; 155° X, -35° Y when flipped)
  remains constant
- Only the cube rotates in its own coordinate space, not the camera

## Pointer-Based Move Input (Flat and Circular Views)

Both the Flat view and the Circular view support mouse and touch input for
performing cube moves. The implementation is split between a shared
infrastructure module (`src/interaction/`) and per-view handlers.

### Shared Infrastructure (`src/interaction/`)

| File                    | Purpose                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`              | `DragDirection`, `DragGesture`, `Point2D` and related types                                                                                                       |
| `move-inference.ts`     | `inferMoveFromDrag(face, row, col, direction, cubeSize)` — maps sticker position + drag direction to WCA notation; `inferMoveFromFaceRotation(face, isClockwise)` |
| `drag-state-machine.ts` | Pointer tracking: down/move/up/cancel, 4px commit threshold, cardinal quantization, angular displacement (atan2) for face rotation, tap-vs-drag distinction       |

### Interaction Modes

**Unselected mode** — drag a sticker: the adjacent layer corresponding to the
sticker's row/col rotates in the dragged direction.

**Selected-face mode** — tap a sticker or face ellipse to select the face; a
halo ring appears. Dragging the halo (or anywhere on the face in "face-direct
mode") rotates the face CW/CCW based on angular displacement.

### Gesture–View Compatibility Matrix

| Input                             | Flat view              | Circular view                         |
| --------------------------------- | ---------------------- | ------------------------------------- |
| Tap sticker / face                | Select face, show halo | Select face, show halo                |
| Tap empty space                   | Deselect               | Deselect axis circles                 |
| Drag sticker (unselected)         | Rotate adjacent layer  | Rotate adjacent layer                 |
| Drag sticker (selected face)      | Rotate that face       | Rotate that face                      |
| Drag halo ring                    | Rotate selected face   | Rotate selected face                  |
| Drag axis circle                  | —                      | Rotate that layer                     |
| Drag axis circle (multi-selected) | —                      | Rotate all selected layers            |
| Drag background / canvas          | —                      | Whole-cube rotation (y/x/z by sector) |
| Middle-mouse / Ctrl+drag          | —                      | Pan                                   |
| Two-finger drag                   | —                      | Pan                                   |
| Scroll / pinch                    | —                      | Zoom                                  |

### Cancellation Model

A drag that returns within the cancel zone (centred on drag origin, radius
scales with sticker size) before pointer-up cancels the pending move. A visible
cancel zone is rendered during drag to make this discoverable.

### Move Feedback Label

A floating label shows the move notation that would be committed as the user
drags. In touch mode the label is positioned above the contact point so it is
not covered by the finger.

- Transform order:
  `rotateX(viewAngleX) rotateY(viewAngleY) rotateX(cubeRotX) rotateY(cubeRotY)`
- All rotation states work correctly with the flip view feature
  (Space/Backspace)

## Responsive & Mobile Layout

### Layout Modes

The application uses two distinct layout modes chosen automatically based on
viewport width:

- **Floating (≥1025px)**: The classic desktop experience. View panels are
  absolute-positioned, draggable, and resizable floating windows on a shared
  workspace. The controls sidebar is always visible on the left.
- **Tabbed (< 1025px)**: Mobile and tablet experience. View panels are stacked
  full-width in a tab strip; only the active panel is shown at a time. Panels
  are static (no drag/resize). The controls panel is hidden off-screen and
  toggled via a hamburger button.

The layout mode switches automatically when the viewport crosses the 1025px
breakpoint, including on device rotation.

### Breakpoint Tiers

| Breakpoint     | Target                     | Key behaviour                                   |
| -------------- | -------------------------- | ----------------------------------------------- |
| Base (< 481px) | Phone                      | Tabbed panels, collapsed controls, stacked UI   |
| 481px+         | Large phone / small tablet | Slightly larger typography                      |
| 769px+         | Tablet                     | Horizontal wrapping for view selector           |
| 1025px+        | Desktop                    | Floating panels, fixed sidebar, full typography |

### Collapsible Controls Panel

On mobile/tablet, the controls panel slides in from the left edge as a drawer:

- A hamburger button in the header toggles the panel open/closed.
- An in-panel close button (✕) is visible in the drawer header for easy
  one-handed dismissal.
- Tapping the semi-transparent overlay backdrop closes the panel.
- Pressing Escape closes the panel (keyboard / accessibility).
- On desktop the drawer behaviour is removed entirely; the panel is always
  visible as a fixed sidebar.

### Tabbed View Panels

- A horizontal scrollable tab strip appears above the visualizations area in
  tabbed mode.
- Each open view gets a tab; activating a tab shows that panel and hides all
  others.
- The tab strip is hidden on desktop (floating mode).
- The tab bar is the primary navigation control for switching views on mobile;
  it is sufficient as a standalone MVP. Swipe-to-switch is explicitly deferred
  (see below).

### Touch Support

- All panel drag and resize interactions use the Pointer Events API (covers
  mouse, touch, and pen uniformly).
- Panel drag and resize are disabled in tabbed mode — panels are static on
  mobile.
- All interactive controls meet the 44px minimum tap target size (WCAG 2.5.5).
- On coarse-pointer (touch) devices, resize handles are enlarged, hover lift
  animations are suppressed, and keyboard shortcut hints are hidden from command
  buttons.
- `viewport-fit=cover` and `env(safe-area-inset-*)` padding ensure the layout
  respects notched / rounded-corner devices.

### Swipe Gestures — Intentionally Not Implemented

Horizontal swipe-to-switch-tab and swipe-to-close-drawer gestures were evaluated
and explicitly deferred. The core problem: a swipe on the visualizations surface
is geometrically indistinguishable from a deliberate touch drag on a sticker or
axis circle (the planned future touch move-input mechanism). Implementing swipe
navigation now would require a conflict-resolution contract between the swipe
detector and move-input handlers that cannot be designed until touch move input
is specified. The tab bar buttons are a sufficient navigation affordance in the
interim.

## View Discovery Mechanism

### Build-Time Discovery

- During build process, scan `src/views/` directory
- Generate view registry with metadata (name, description, capabilities)
- Create TypeScript interfaces and factory functions

### Runtime Registration

- Views register themselves with the ViewManager on application startup
- Supports hot-reloading in development mode
- Allows for plugin-like view extensions

## UI Components

### Action Toolbar

- Reset button with dropdown (new/reset)
- Shuffle button
- Load/Save buttons
- Undo/Redo buttons
- View menu: Dropdown or menu to open new view windows

### Floating Windows

- Each window contains a single view instance
- Windows are resizable, draggable, and closable
- Loading states during view initialization
- Error handling for failed view loads
- Window title shows view type and instance number

## Implementation Notes

- Use TypeScript interfaces for type safety
- Implement reactive state management (possibly Vue/React integration)
- Ensure mobile responsiveness
- Follow component-based architecture
- Include comprehensive error handling and user feedback
