# Commanding and Eventing System

**Overview:** This system provides a centralized command and event architecture
for handling user interactions across views, separating cube state manipulation
from view-specific controls, and managing animations coherently.

**Requirements Analysis:**

1. **Centralized Keyboard Handling:** Keyboard input should be handled by a
   centralized component, unprocessed are handed down to active view ("last
   interacted with" view). This implies a focus management system where View
   Manager or other centralized component tracks which view is in focus.

2. **View Mouse Events:** Each view handles its own mouse interactions over its
   visualization (e.g., clicking stickers, dragging for rotation). Views emit
   events for significant actions like "sticker selected" or "layer rotated".
   This can be PRE-move, or POST-move depending on the action. For example: for
   dragging and rotating a layer we want to emit an event when the drag is about
   to start (to allow or forbid it for example) and when it ends (to make the
   controller update cube state, and emit the move event, so other views can
   animate).

   Notes:
   - Views should not directly modify cube state; they only request actions via
     events/commands.
   - Some views may not support certain interactions (e.g., a 2D net view may
     not support layer rotations).
   - Views should be able to declare which commands they support.
   - Views should be able to declare which keyboard shortcuts they support.

3. **Animation Coordination:** When a user rotates a layer via mouse drag on a
   view, the view performs the animation locally, but the controller executes
   the move and notifies all views. To avoid duplicate animations, the
   originating view should skip re-animating the notified move.

4. **Command Declaration:** Cube state commands (e.g., Move F, Move F') are
   global and affect cube state. View actions (commands) (e.g., camera movement
   in 3D views) are view-specific.

5. **UI Rendering:** Cube state commands are rendered as buttons in the
   Application interface by ViewManager, separate from view action commands
   (e.g., view-specific toolbars). Only the "current" view's commands are
   rendered and active. View action commands can be of two types:
   - Commands to be rendered as global buttons in the Application toolbar, e.g.
     "+" - "Rotate the whole cube clockwise by 90 degrees" (only affecting the
     view, not the mapping of the cube faces).
   - Commands that are injected as buttons to the View's header (these should be
     rendered as part of the view's toolbar, but still able to be activated by
     key press via ViewManager).
   - View action commands can be dual (to be rendered in both places), for
     example "Tilt" in Basic view.

**Proposed Solutions (Implemented):**

- **Event System:** Implemented a pub/sub event system using EventBus for
  communication between views, controller, and ViewManager. The catalogue below
  is the complete set of 16 events declared in `src/types/events.ts`; payload
  field names are the implemented ones, so they can be used verbatim.
  - `stickerSelected`: Emitted by views on mouse click. Payload:
    `{stickerId?, viewId}`.
  - `highlightChanged`: For sticker highlighting (hover in/out). Payload:
    `{stickerId?, viewId?}`; `stickerId` is absent when the highlight is
    cleared.
  - `moveRequested`: Emitted by views to request moves. Payload:
    `{moveNotation: string, viewId: string, tentative: boolean}`. All three
    fields are required: `moveNotation` is the notation string (e.g. `'F'`,
    `'R2'`, `"U'"`, `'3Rw'`), and `tentative` distinguishes a drag-start preview
    (validated only) from a committed move.
  - `moveExecuted`: Emitted after moves, with comprehensive state change
    information (`moveDetails`, `preState`, `postState`; see below).
  - `undoRequested`: Emitted to request an undo of the last move. No payload.
  - `redoRequested`: Emitted to request a redo of the last undone move. No
    payload.
  - `viewInteracted`: For focus management. Emitted by a view when the user
    contacts its content (pointer-down anywhere in the view). Payload:
    `{viewId}`.
  - `viewStateChanged`: Emitted when a view's own state changed and should be
    persisted. Payload: `{viewType}`.
  - `cubeResetRequested`: Emitted to request a reset to the solved state. No
    payload.
  - `cubeScrambleRequested`: Emitted to request a scramble. No payload.
  - `storageClearRequested`: Emitted to request clearing persisted state (and
    view storage keys). No payload.
  - `stateExportRequested`: Emitted to request downloading the current state and
    move history. No payload.
  - `stateImportRequested`: Emitted to request importing a state file. No
    payload.
  - `basicViewRotationLinked`: Emitted by a Basic view when linked rotations are
    enabled, so the peer view applies the same rotation. Payload:
    `{rotation, sourceViewType}`.
  - `basicViewResetLinked`: Emitted by a Basic view to reset its linked peer.
    Payload: `{sourceViewType}`.
  - `basicViewGhostToggled`: Emitted when a Basic view toggles ghost-hint
    visibility. Payload: `{sourceViewType, visible, opacityIndex}`.

  **Retired members.** `COMMAND_EXECUTED` (`CommandExecutedEvent`) was removed
  from this catalogue: it was declared from the first commit with neither an
  emitter nor a subscriber, so it documented a mechanism the app never had. Its
  removal is now enforced rather than remembered - see
  `src/types/event-catalogue.test.ts`, which fails if any declared member has no
  production emitter (origin R13).

**Enhanced MoveExecutedEvent Benefits (Implemented):**

The `moveExecuted` event provides comprehensive information about state changes,
enabling advanced view features:

- **Selective Updates**: Views can update only changed stickers, improving
  performance
- **Animation Data**: `movedCubies` provides before/after cubie states for
  smooth animations
- **State Safety**: `preState`/`postState` are `Readonly<>` to prevent
  accidental mutations
- **Move Definition**: `definition` exposes cube axis/layer/angle metadata

**View Update Strategies (Implemented):**

Views implement different update strategies:

1. **Selective Update Mode** (preferred): Use `movedCubies` to update only
   changed stickers
2. **Full Update Mode** (fallback): Update entire view when detailed data
   unavailable

- **Command System:** Implemented Command interface with:
  - `id`: Unique string identifier.
  - `label`: Display name.
  - `keyBindings`: Optional keyboard shortcuts with modifiers.
  - `category`: 'controller' | 'cube' | 'view'.
  - `action`: Function to execute.
  - Additional fields: `icon`, `tooltip`, `group`, `showInHeader`,
    `displayOrder`, `overflowPriority`, `labelPosition`. Views register commands
    with ViewManager on initialization.

- **Keyboard Handling:** ViewManager listens for global keyboard events, checks
  controller commands first, then active view commands, and delegates to view's
  handleKeyDown if unhandled.

- **Mouse Handling:** Views attach mouse event listeners directly. Views emit
  `moveRequested` for moves and `stickerSelected` for interactions.

- **Animation Handling:** `moveExecuted` includes full before/after state and
  move detail metadata. Views derive animation behavior from move details and
  rendering context.

- **UI Separation:** ViewManager collects renders current view's commands and
  renders them as needed. For specifics see section 5. **UI Rendering:**.

**Implementation Notes:**

1. **Focus Determination:** Stack-based system where last interacted view has
   priority. ViewManager maintains the stack and is subscribed to
   `viewInteracted`, which views emit when the user contacts their content. Two
   independent routes reach the same call, and they are not redundant:
   - **Panel chrome.** `PanelInteractionHandler` listens for `pointerdown` on
     the `#visualizations` ancestor and resolves the panel with
     `target.closest('.view-panel')`. Because the listener is on an ancestor, a
     pointer-down anywhere inside a panel already reaches it — including a
     pointer-down on the view's content, not just its header or resize handles.
     This is why the stack is _not_ driven by panel chrome alone.
   - **View content.** Views additionally emit `viewInteracted` with their own
     id when their content is contacted. This is the documented contract, and it
     is what makes the mechanism inspectable rather than implicit.

   Contact also claims DOM focus for the view's container, so the element that
   receives keyboard events and the view the app considers active cannot
   disagree.

2. **Event Granularity:** The catalogue in **Proposed Solutions** is the full
   set — 16 events. Not all are equal in scope: the five interaction events
   (`stickerSelected`, `moveRequested`, `moveExecuted`, `highlightChanged`,
   `viewInteracted`) carry the core cube and focus behaviour, while
   `undoRequested`/`redoRequested`, the five request-style events
   (`cubeResetRequested`, `cubeScrambleRequested`, `storageClearRequested`,
   `stateExportRequested`, `stateImportRequested`), the `viewStateChanged`
   persistence signal and the three `basicView*` linked-view notifications are
   narrower. Reading this list as the whole contract was the drift this section
   used to cause; the catalogue above is authoritative.

3. **Animation Synchronization:** On mouse drag begin, query controller if
   intended move is allowed. If not, provide feedback (e.g., change cursor, show
   tooltip). Views emit `moveRequested` with `tentative: true` on drag start.
   Controller responds synchronously with allow/forbid. If allowed, proceed with
   animation; if not, revert cursor/feedback. On drag end, emit
   `tentative: false` to commit.

## Event Bus Access (Singleton)

The application uses a **single shared `EventBus`** instance for all
inter-component communication. There is exactly one bus — never create new
`EventBus` instances for inter-component messaging.

Access it through the accessor module rather than reaching into `Application`:

```typescript
import { getEventBus } from '@/event-bus-accessor';

getEventBus().emit(EventName.MOVE_REQUESTED, payload);
getEventBus().on(EventName.MOVE_EXECUTED, handler);
```

- `getEventBus()` returns the shared singleton and is the preferred access path
  from modules that should not depend on the `Application` class.
- `Application.eventBus` is a static getter that delegates to the same instance,
  so `Application.eventBus.on(...)` and `getEventBus().on(...)` are
  interchangeable.
- The singleton lives in `src/event-bus-accessor.ts`.
