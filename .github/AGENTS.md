---
description: Rubik's Cube — AI agent workspace instructions
applyTo: '**'
---

# Rubik's Cube — Agent Instructions

TypeScript + Vite web app that simulates and visualizes a Rubik's Cube. Compiles
to a single portable HTML file.

---

## CLI Commands (run from project root)

| Task                               | Command                 |
| ---------------------------------- | ----------------------- |
| Build (single HTML output)         | `npm run build`         |
| Type-check only                    | `npm run type-check`    |
| Run tests (once, immediate exit)   | `npm test`              |
| Run tests with coverage            | `npm run test:coverage` |
| Lint + auto-fix imports            | `npm run lint:imports`  |
| Full quality gate, coverage, build | `npm run all`           |

> `npm run all` runs: lint → format → type-check → test:coverage → build. Run
> before finalizing any change.

---

## Architecture Overview

> **Full detail:** see `src/docs/architecture-overview.md` (component tree, data
> flow, domain design decisions) and
> `src/docs/commanding-and-eventing-system.md` (event bus + command system).

**AGENTS.md-specific notes (not in the docs):**

- **Single-file build**: `vite-plugin-singlefile` inlines all JS/CSS into
  `dist/index.html`; code splitting is disabled.
- `Application.eventBus` is a class-level static property — effectively a
  singleton. Components import `Application` to access it.

---

## Folder Map

> **Full detail:** see `src/docs/implementation-guide.md` (complete file tree,
> per-component APIs, and usage patterns).

- `docs/solutions/` — documented solutions to past bugs and best practices,
  organized by category with YAML frontmatter (`module`, `tags`,
  `problem_type`). Relevant when debugging or implementing in documented areas.

---

## Code Conventions

### Imports

- **Always use `@/` alias** — never relative `../` parent imports. Enforced by
  ESLint.
- No explicit `.ts` or `.js` extensions in import paths. Enforced by ESLint.
- Run `npm run lint:imports` to auto-fix import order/style.

### TypeScript

- `strict: true` + `noUnusedLocals` + `noUnusedParameters` +
  `noFallthroughCasesInSwitch`.
- All new code must type-check cleanly (`npm run type-check`).
- `isolatedModules: true` — each file must be independently transpilable (no
  `const enum` with cross-file references, no namespace merging).

### CSS / Styling

- **CSS Modules** for all component styles: `*.module.css` co-located with the
  component file.
- Global styles only in `src/main.css`.
- Plain CSS only — no preprocessors.
- Shared reusables go in `src/styles/`.

### Testing

- **Vitest** with `jsdom` environment; `globals: true` + `"vitest/globals"` in
  `tsconfig.test.json` — `describe`/`it`/`expect`/`vi` are global at both
  runtime and the type level. Do **not** import them from `'vitest'`; the
  imports are redundant and should be removed.
- Tests are **co-located** with source: `foo.ts` → `foo.test.ts` (or
  `foo.concern.test.ts` for large files).
- Coverage thresholds: 70% lines/functions/branches/statements. Don't regress
  below them.
- `vitest.setup.ts` suppresses jsdom navigation noise and provides
  `LocalStorageMock`.

### Formatting

- Prettier is enforced as an ESLint rule — formatting violations are lint
  errors.
- Run `npm run format` before committing to auto-fix all formatting.

---

## Key Documentation Files

Before working on domain logic, read the relevant doc(s) in `src/docs/`:

[- `Doc` - When to read it]

- `architecture-overview.md` - Adding or refactoring major components
- `coordinate-system.md` - Anything involving cubie IDs, positions, or faces
- `discrete-orientation-system.md` - Orientation math, sticker faces, invariant
  validation
- `move-notation.md` - Parsing or adding moves
- `commanding-and-eventing-system.md` - Adding commands, keyboard bindings, or
  events
- `circular-view.md` - Working on the circular SVG view
- `state-import-export.md` - State serialization, localStorage, or file I/O
- `color-system.md` - Adding or changing colors, design tokens, theming
- `user-interface-design.md` - Adding UI features or new view types
- `implementation-guide.md` - Core component APIs and file organization
- `quickstart-contributors.md` - New contributor onboarding, environment
  prerequisites

---

## Common Pitfalls

- **When user provides a specific task, prioritize it over context from attached
  files. Do not let coverage metrics or other context distract from the user's
  actual request.**
- **Don't mutate cube state directly.** All state changes go through
  `StateManager`; cube state uses Immutable.js Maps.
- **`Application.eventBus` is the only event bus.** Don't create new `EventBus`
  instances for inter-component communication.
- **`applyMove()` flags matter.** The `skipUndoLogic`, `hiddenMove`, and
  `emitEvent` boolean flags on `CubeController.applyMove()` have specific
  meanings — check existing usages before adding new callers.
- **`dist/` is the single-file build output.** Don't commit `dist/` artifacts
  unless explicitly building a release.
- **View face labels ≠ model face labels.** The views can remap face names /
  sticker ids (SVG "F" = cube model R, etc.) — see `src/docs/circular-view.md`.
- **`isolatedModules: true`** means `const enum` from one file cannot be used in
  another file via re-export — use regular `enum` or `const` objects for
  cross-file enums.
- **DO NOT start implementing, before you have 95% confidence in your
  understanding of the relevant architecture and domain concepts.** Read the
  docs, ask questions, and review existing code until you do.
- **When in doubt, ask.** The architecture is complex and non-obvious; it's
  better to ask for clarification than to make assumptions.
- **When you need a helper function, check if it already exists.** The codebase
  has many utility functions that may already do what you need; avoid creating
  duplicates.

---

## Development Guidelines

1. **Confirm project root** before running any command.
2. **Read relevant `src/docs/` files** before touching domain logic.
3. **Run `npm run type-check`** after every non-trivial change.
4. **Run `npm test`** to verify nothing is broken before finishing.
5. **Ask before** making destructive changes.
6. **The Vite dev server runs automatically via a VS Code extension** — do not
   start it manually.
7. **Build verification**: run `npm run build` after significant changes to
   confirm the single-file output still produces correctly.
