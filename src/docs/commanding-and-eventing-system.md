# Commanding and Eventing System

**Overview:** This system provides a centralized command and event architecture for handling user interactions across views, separating cube state manipulation from view-specific controls, and managing animations coherently.

**Requirements Analysis:**

1. **Centralized Keyboard Handling:** Keyboard input should be handled by a centralized component, unprocessed are handed down to active view ("last interacted with" view). This implies a focus management system where View Manager or other centralized component tracks which view is in focus.

2. **View Mouse Events:** Each view handles its own mouse interactions over its visualization (e.g., clicking stickers, dragging for rotation). Views emit events for significant actions like "sticker selected" or "layer rotated". This can be PRE-move, or POST-move depending on the action. For example: for dragging and rotating a layer we want to emit an event when the drag is about to start (to allow or forbid it for example) and when it ends (to make the controller update cube state, and emit the move event, so other views can animate).

   Notes:
   - Views should not directly modify cube state; they only request actions via events/commands.
   - Some views may not support certain interactions (e.g., a 2D net view may not support layer rotations).
   - Views should be able to declare which commands they support.
   - Views should be able to declare which keyboard shortcuts they support.

3. **Animation Coordination:** When a user rotates a layer via mouse drag on a view, the view performs the animation locally, but the controller executes the move and notifies all views. To avoid duplicate animations, the originating view should skip re-animating the notified move.

4. **Command Declaration:** Cube state commands (e.g., Move F, Move F') are global and affect cube state. View actions (commands) (e.g., camera movement in 3D views) are view-specific.

5. **UI Rendering:** Cube state commands are rendered as buttons in the Application interface by ViewManager, separate from view action commands (e.g., view-specific toolbars). Only the "current" view's commands are rendered and active. View action commands can be of two types:
   - Commands to be rendered as global buttons in the Application toolbar, e.g. "+" - "Rotate the whole cube clockwise by 90 degrees" (only affecting the view, not the mapping of the cube faces).
   - Commands that are injected as buttons to the View's header (these should be rendered as part of the view's toolbar, but still able to be activated by key press via ViewManager).
   - View action commands can be dual (to be rendered in both places), for example "Tilt" in Basic view.

**Proposed Solutions (Implemented):**

- **Event System:** Implemented a pub/sub event system using EventBus for communication between views, controller, and ViewManager. Events include:
  - `stickerSelected`: Emitted by views on mouse click, payload: {stickerId, viewId}.
  - `moveRequested`: Emitted by views to request moves, payload: {notation, viewId}.
  - `moveExecuted`: Emitted after moves, with comprehensive state change information.
  - `highlightChanged`: For sticker highlighting.
  - `viewInteracted`: For focus management.

**Enhanced MoveExecutedEvent Benefits (Implemented):**

The `moveExecuted` event provides comprehensive information about state changes, enabling advanced view features:

- **Selective Updates**: Views can update only changed stickers, improving performance
- **Animation Data**: `movedCubies` provides before/after cubie states for smooth animations
- **State Safety**: `preState`/`postState` are `Readonly<>` to prevent accidental mutations
- **Move Definition**: `definition` exposes cube axis/layer/angle metadata

**View Update Strategies (Implemented):**

Views implement different update strategies:

1. **Selective Update Mode** (preferred): Use `movedCubies` to update only changed stickers
2. **Full Update Mode** (fallback): Update entire view when detailed data unavailable

- **Command System:** Implemented Command interface with:
  - `id`: Unique string identifier.
  - `label`: Display name.
  - `keyBindings`: Optional keyboard shortcuts with modifiers.
  - `category`: 'controller' | 'cube' | 'view'.
  - `action`: Function to execute.
  - Additional fields: `icon`, `tooltip`, `group`, `showInHeader`, `priority`, `labelPosition`. Views register commands with ViewManager on initialization.

- **Keyboard Handling:** ViewManager listens for global keyboard events, checks controller commands first, then active view commands, and delegates to view's handleKeyDown if unhandled.

- **Mouse Handling:** Views attach mouse event listeners directly. Views emit `moveRequested` for moves and `stickerSelected` for interactions.

- **Animation Handling:** `moveExecuted` includes full before/after state and move detail metadata. Views derive animation behavior from move details and rendering context.

- **UI Separation:** ViewManager collects renders current view's commands and renders them as needed. For specifics see section 5. **UI Rendering:**.

**Implementation Notes:**

1. **Focus Determination:** Stack-based system where last interacted view has priority. Views emit `viewInteracted` on mouse enter/click. ViewManager maintains stack.

2. **Event Granularity:** Core events implemented: `stickerSelected`, `moveRequested`, `moveExecuted`, `highlightChanged`, `viewInteracted`.

3. **Animation Synchronization:** On mouse drag begin, query controller if intended move is allowed. If not, provide feedback (e.g., change cursor, show tooltip). Views emit `moveRequested` with `tentative: true` on drag start. Controller responds synchronously with allow/forbid. If allowed, proceed with animation; if not, revert cursor/feedback. On drag end, emit `tentative: false` to commit.
