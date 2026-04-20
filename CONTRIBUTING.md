# Contributing to Rubik's Cube

Thank you for your interest in contributing! This document covers how to get
started, the conventions used in the codebase, and what to expect from the
contribution process.

## Getting Started

**Prerequisites:** Node.js 20.19+ or 22.12+, npm, a modern code editor (VS Code
recommended), and a modern browser (Edge or Firefox).

```bash
git clone https://github.com/mm6502/rubiks-cube.git
cd rubiks-cube
npm install
npm run dev
```

For a full walkthrough of the project structure, see
[src/docs/quickstart-contributors.md](src/docs/quickstart-contributors.md).

## Development Workflow

Before submitting any change, run the full quality gate:

```bash
npm run all
```

This runs lint → format → type-check → test (with coverage) → build in sequence.
All steps must pass.

Individual commands:

| Task                    | Command                 |
| ----------------------- | ----------------------- |
| Type-check              | `npm run type-check`    |
| Run tests               | `npm test`              |
| Run tests with coverage | `npm run test:coverage` |
| Lint + fix imports      | `npm run lint:imports`  |
| Format source           | `npm run format`        |
| Build single HTML file  | `npm run build`         |

## Code Conventions

- **Imports**: always use the `@/` alias — no relative `../` parent imports.
- **TypeScript**: `strict: true`; all code must type-check cleanly. No `any`
  without justification.
- **CSS**: CSS Modules (`*.module.css`) co-located with each component. No
  preprocessors (except for `tokens.scss`).
- **Tests**: co-located with source (`foo.ts` → `foo.test.ts`). Coverage
  thresholds are enforced at 70% lines/functions/branches/statements.
- **Formatting**: Prettier is enforced as an ESLint rule. Run `npm run format`
  to auto-fix.

See [AGENTS.md](.github/AGENTS.md) for a breakdown of conventions and common
pitfalls.

## Architecture Notes

Before touching domain logic, read the relevant doc in [src/docs/](src/docs/):

- Cube state is stored with **Immutable.js** — never mutate it directly.
- All state changes go through `StateManager`.
- `Application.eventBus` is the single event bus — don't create new instances.
- The build output is a **single self-contained HTML file** (`dist/index.html`).

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Make your changes, following the code conventions above.
3. Run `npm run all` to confirm everything passes.
4. Open a pull request with a clear description of what changed and why.

There is no formal issue template, but please open an issue before starting
large or architectural changes.

## License

By contributing, you agree that your contributions will be licensed under the
[EUPL-1.2](LICENSE.txt).
