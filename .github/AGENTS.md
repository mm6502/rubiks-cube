---
description: Rubik's Cube — AI agent workspace instructions
applyTo: '**'
---

# Rubik's Cube — Agent Instructions

TypeScript + Vite web app that simulates and visualizes a Rubik's Cube. Compiles to a single portable HTML file. Architecture docs live in `src/docs/`.

---

## CLI Commands (run from project root)

| Task                             | Command                 |
| -------------------------------- | ----------------------- |
| Build (single HTML output)       | `npm run build`         |
| Type-check only                  | `npm run type-check`    |
| Run tests (once, immediate exit) | `npm test`              |
| Run tests with coverage          | `npm run test:coverage` |
| Watch tests                      | `npm run test:watch`    |
| Lint + auto-fix imports          | `npm run lint:imports`  |
| Format all source                | `npm run format`        |
| Full quality gate                | `npm run all`           |

> `npm run all` runs: lint → type-check → format → test:coverage → build. Run before finalizing any change.

---

## Architecture Overview

```plaintext
Application
  ├── CubeController          (CubeModel / ReadOnlyCubeModel)
  │     ├── cube/core/        Pure cube logic (no DOM)
  │     │     ├── CubieManager     Creates all cubies for any n×n×n
  │     │     ├── StateManager     Single mutation point; holds original + current state
  │     │     ├── MoveEngine       Pure function: computes MoveResult (no side effects)
  │     │     ├── LayerManager     Filters cubies by layer
  │     │     ├── MoveHistory      Undo/redo stack
  │     │     ├── MoveParser       Parses WCA notation strings → MoveDefinition
  │     │     └── StatePersistence Serializes state; localStorage + file download/upload
  │     └── cube/types/       Domain types (Cubie, CubeState, Move, Face, Color…)
  │
  ├── ViewManager             Multi-window coordinator
  │     ├── ViewRegistry      Dynamic view-type discovery/registration
  │     ├── ViewLifecycleManager  Open/close/minimize/maximize
  │     ├── CommandManager    Collects + dispatches commands from active view
  │     ├── CommandRenderer   Renders command buttons in toolbar
  │     └── Panel utilities   Drag, resize, positioning
  │
  └── EventBus (static on Application)   Pub/sub wiring between all components
```

**Data flow:** User action → EventBus (`MOVE_REQUESTED`) → `CubeController.applyMove()` → `MoveEngine` (pure computation) → `StateManager` mutates immutable state → EventBus (`MOVE_EXECUTED`) → all Views re-render.

**Key design decisions (read `src/docs/` for full detail):**

- Cube state stored as **Immutable.js Maps** (`immutable` package).
- **Discrete orientation model**: corners ∈ {0,1,2}, edges ∈ {0,1} — no floating-point rotation.
- **Virtual center cubies** (`virtual_center_F` etc.) track face identity through whole-cube rotations.
- **Single-file build**: `vite-plugin-singlefile` inlines all JS/CSS into `dist/index.html`; code splitting is disabled.
- `Application.eventBus` is a class-level static property — effectively a singleton. Components import `Application` to access it.

---

## Folder Map

```plaintext
src/
├── main.ts                    Entry point
├── application.ts             App orchestrator (two-phase: constructor + initialize())
├── global.ts                  Branded<T,B> utility type + detectOS() helper
├── cube-controller.ts         CubeModel impl — applyMove, scramble, reset, undo/redo, import/export
├── cube-controller.commands.ts  Command definitions for all moves (R, L, U, D, F, B…)
├── cube/core/                 Pure cube logic (zero DOM)
├── cube/types/                Domain types + interfaces
├── cube/utils/                Coordinate helpers, face utils, state conversion, legality checks
├── diagnostics/               Structured logger (LogLevel 0–5, colorized, timestamps)
├── events/event-bus.ts        SimpleEventEmitter wrapped by type-safe EventBus
├── interaction/               Pointer/touch drag state machine; infers cube moves from drag gestures
│     ├── drag-state-machine.ts  Pointer event FSM → emits DragGesture callbacks
│     ├── move-inference.ts      Maps drag direction + face + cubie position → move notation
│     └── types.ts               DragDirection, DragGesture, MoveInferenceInput types
├── types/commands.ts          Command, CommandCategory, KeyBinding types
├── types/events.ts            EventName constants + all EventPayload interfaces
├── icons/index.ts             Icon asset exports
├── styles/buttons.module.css  Shared button CSS module
├── styles/tokens.scss         Global CSS custom properties (design tokens)
├── view-manager/              Multi-window UI coordinator (see architecture above)
├── views/basic/               Basic pseudo 3D view (includes interaction adapter for drag→move)
├── views/circular/            SVG concentric-ring view
├── views/flat/                Flat 2D projection view
├── views/moves/               Move history list view
└── docs/                      Architecture documentation (read these first for domain knowledge)
```

---

## Code Conventions

### Imports

- **Always use `@/` alias** — never relative `../` parent imports. Enforced by ESLint.
- No explicit `.ts` or `.js` extensions in import paths. Enforced by ESLint.
- Run `npm run lint:imports` to auto-fix import order/style.

### TypeScript

- `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`.
- All new code must type-check cleanly (`npm run type-check`).
- `isolatedModules: true` — each file must be independently transpilable (no `const enum` with cross-file references, no namespace merging).

### CSS / Styling

- **CSS Modules** for all component styles: `*.module.css` co-located with the component file.
- Global styles only in `src/main.css`.
- Plain CSS only — no preprocessors.
- Shared reusables go in `src/styles/`.

### Testing

- **Vitest** with `jsdom` environment; `globals: true` + `"vitest/globals"` in `tsconfig.test.json` — `describe`/`it`/`expect`/`vi` are global at both runtime and the type level. Do **not** import them from `'vitest'`; the imports are redundant and should be removed.
- Tests are **co-located** with source: `foo.ts` → `foo.test.ts` (or `foo.concern.test.ts` for large files).
- Coverage thresholds: 70% lines/functions/branches/statements. Don't regress below them.
- `vitest.setup.ts` suppresses jsdom navigation noise and provides `LocalStorageMock`.

### Formatting

- Prettier is enforced as an ESLint rule — formatting violations are lint errors.
- Run `npm run format` before committing to auto-fix all formatting.

---

## Key Documentation Files

Before working on domain logic, read the relevant doc(s) in `src/docs/`:

| Doc                                 | When to read it                                       |
| ----------------------------------- | ----------------------------------------------------- |
| `architecture-overview.md`          | Adding or refactoring major components                |
| `coordinate-system.md`              | Anything involving cubie IDs, positions, or faces     |
| `discrete-orientation-system.md`    | Orientation math, sticker faces, invariant validation |
| `move-notation.md`                  | Parsing or adding moves                               |
| `commanding-and-eventing-system.md` | Adding commands, keyboard bindings, or events         |
| `circular-view.md`                  | Working on the circular SVG view                      |
| `state-import-export.md`            | State serialization, localStorage, or file I/O        |
| `color-system.md`                   | Adding or changing colors, design tokens, theming     |
| `user-interface-design.md`          | Adding UI features or new view types                  |
| `implementation-guide.md`           | Core component APIs and file organization             |
| `quickstart-contributors.md`        | New contributor onboarding, environment prerequisites |

---

## Common Pitfalls

- **Don't mutate cube state directly.** All state changes go through `StateManager`; cube state uses Immutable.js Maps.
- **`Application.eventBus` is the only event bus.** Don't create new `EventBus` instances for inter-component communication.
- **`applyMove()` flags matter.** The `skipUndoLogic`, `hiddenMove`, and `emitEvent` boolean flags on `CubeController.applyMove()` have specific meanings — check existing usages before adding new callers.
- **`dist/` is the single-file build output.** Don't commit `dist/` artifacts unless explicitly building a release.
- **View face labels ≠ model face labels.** The views can remap face names / sticker ids (SVG "F" = cube model R, etc.) — see `src/docs/circular-view.md`.
- **`isolatedModules: true`** means `const enum` from one file cannot be used in another file via re-export — use regular `enum` or `const` objects for cross-file enums.
- **DO NOT start implementing, before you have 95% confidence in your understanding of the relevant architecture and domain concepts.** Read the docs, ask questions, and review existing code until you do.
- **When in doubt, ask.** The architecture is complex and non-obvious; it's better to ask for clarification than to make assumptions.
- **When you need a helper function, check if it already exists.** The codebase has many utility functions that may already do what you need; avoid creating duplicates.

---

## Development Guidelines

1. **Confirm project root** before running any command.
2. **Read relevant `src/docs/` files** before touching domain logic.
3. **Run `npm run type-check`** after every non-trivial change.
4. **Run `npm test`** to verify nothing is broken before finishing.
5. **Ask before** making destructive changes.
6. **The Vite dev server runs automatically via a VS Code extension** — do not start it manually.
7. **Build verification**: run `npm run build` after significant changes to confirm the single-file output still produces correctly.
