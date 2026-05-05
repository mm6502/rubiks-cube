# Color System

All design tokens live in `src/styles/tokens.scss`. Components consume semantic
`--color-*` tokens only.

## Layers

| Layer                 | Naming              | Purpose                          |
| --------------------- | ------------------- | -------------------------------- |
| 1 — Primitive palette | `--palette-*`       | Raw swatches and numeric scales. |
| 2 — Semantic tokens   | `--color-*`         | What a token means in the UI.    |
| 3 — Theme assignments | `:root` / dark root | Maps semantics per theme.        |

Layer 1 is never referenced directly by components.

## Theming

Dark mode is handled by a single `:root[data-theme-effective='dark']` block at
the bottom of `tokens.scss`. Components do not carry theme-specific rules.

Alpha transparency should use
`color-mix(in srgb, <color> <percent>, transparent)` so opacity remains
tokenized.

## Rules

- **Palette shades are numeric and monotonic.** Use numeric steps within a
  family. Avoid descriptive one-offs like `near-black`, `near-white`, or
  non-standard steps like `gray-550`.
- **Reserve endpoints for absolutes.** `gray-0` is absolute white and
  `gray-1000` is absolute black.
- **Components reference Layer 2 only.** If a component needs a new meaning, add
  a `--color-*` token first and map it in `tokens.scss`.
- **Reuse before adding.** When replacing a raw literal, first check whether an
  existing semantic token already covers the use case closely enough.
- **No raw hex/rgba literals in component `.module.css` files.** All component
  colors, including shadows, must go through `var(--color-*)` tokens.
- **Layer 2 may hold composed values.** Semantic tokens in `tokens.scss` may use
  `color-mix()` and, for awkward shadow shorthands, may be the only place where
  a raw color literal is tolerated.

## Polarity Decision

We evaluated a `--palette-positive-N` / `--palette-negative-N` family for
white/black polarity and rejected it.

The existing system already handles polarity at the semantic layer:

- `--color-surface-tint` flips between dark and light endpoints by theme.
- `--color-overlay-positive-*` and `--color-overlay-negative-*` build on that
  flip.

Adding a second polarity family in the palette layer would duplicate the same
mechanism without covering a new real use case.

## Future Non-Color Tokens

Future spacing, radius, elevation, or similar tokens should follow the same
structure:

- Layer 1: numeric scale or primitive values
- Layer 2: semantic aliases by UI meaning
- Layer 3: theme-specific assignments where theme variance is needed

Keep that model small and additive only when an existing token cannot serve the
case.
