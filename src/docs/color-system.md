# Color System

All colors live in `src/styles/tokens.scss` using a two-layer custom-property
architecture.

## Layers

| Layer                     | Naming        | Purpose                                                                                                   |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| **1 — Primitive palette** | `--palette-*` | Raw named swatches (indigo-500, sky-300, domain-cube-interior…). Never referenced by components directly. |
| **2 — Semantic tokens**   | `--color-*`   | What a color _means_ (btn-primary-bg, overlay-black-20, drag-halo-ring…). Components only use this layer. |

## Theming

Dark mode is handled by a single `:root[data-theme-effective='dark']` block at
the bottom of `tokens.scss` that reassigns semantic tokens to different palette
values. No component CSS needs theme-specific overrides.

Alpha transparency is expressed with
`color-mix(in srgb, <color> <percent>, transparent)` rather than `rgba()`, so
every opacity step maps to a named token.

## Rules

- **Add colors to `tokens.scss` only** — no hex/rgba literals in component
  `.module.css` files.
- **Components reference Layer 2** — if a new semantic meaning is needed, add a
  `--color-*` token that points to an existing `--palette-*` value.
- **Shared tokens across views** — drag halos, overlays, and scrollbar colors
  are defined once and reused (e.g. `--color-drag-halo-*` is shared by circular
  and flat views).
