# Design token system refactor requirements

## Overview

Simplify `src/styles/tokens.scss`. The token system has grown organically and
accumulated redundant entries, inconsistent naming, and raw literals that bypass
the token layer entirely. The goal is a smaller, more coherent set of tokens
that is easier to reason about — not a larger or more disciplined one. Every
change should reduce complexity or remove something; additions are only
acceptable when an existing token genuinely cannot cover the case.

## Problem

- The token file has grown without a clear simplification pass: there are
  descriptive palette names mixed with numeric ones (`near-black`, `neutral-50`,
  `gray-550`), tokens that are never referenced, raw hex/rgba literals that
  bypass the token layer in component CSS, and at least one reference to a token
  that does not exist.
- As a result, adding or adjusting a color requires understanding an
  inconsistent naming scheme, and it's unclear which tokens are safe to remove.
- The system should be simpler and smaller after the refactor than it is today.

## Goals

- **Reduce, don't proliferate.** Before adding a new token, verify no existing
  one already covers the use case (same or visually indistinguishable value).
  New tokens are introduced only when nothing current fits.
- Keep component CSS referencing only semantic tokens (`--color-*`), not raw
  palette values.
- Standardize palette/shade naming so theme variants are easier to reason about
  and reuse.
- Enable the same semantic tokens to work in both themes, with theme-specific
  palette assignment centralized in `tokens.scss`.
- Create a naming/structure pattern that can also support future non-color
  tokens like spacing, radius, and shadows.
- **Evaluate** whether a polarity-based shade family (e.g.
  `--palette-positive-200`) can replace the parallel white/black shade
  hierarchies, so a component can use a single token that resolves to a lighter
  value in light mode and a darker value in dark mode. Ship only if the concept
  covers the real use-cases without awkward exceptions.

## In scope

- Refactoring `src/styles/tokens.scss` to make the palette and semantic token
  layers more systematic.
- Preserving the existing theme architecture: a shared palette layer, a semantic
  token layer, and a dark-theme override block at the bottom of `tokens.scss`.
- Updating `src/docs/color-system.md` to document the revised token rules and
  naming conventions.
- Fixing raw hex/rgba literals in component `.module.css` files — by mapping
  each literal to an existing token where possible, or adding a new token only
  if nothing current is a fit.

## Out of scope

- Rewriting component `.module.css` files to adopt a new styling framework.
- Implementing a full CSS-in-JS or token tooling migration.
- Migrating existing styling to new non-color tokens in this pass; non-color
  token support is scoped to the naming model and documentation only.
- **Drop-shadow exception applies at the palette → Layer 2 boundary only.**
  Because `box-shadow` shorthand combines offset, blur, spread, and color in a
  single value, Layer 2 semantic shadow tokens in `tokens.scss` may contain raw
  hex/rgba literals where a pure `--palette-*` reference would be awkward.
  Components must still use `var(--color-*)` tokens — no raw hex/rgba literals
  are permitted in `.module.css` files, even for shadows.

## Proposed direction

1. Keep the current three-layer structure in `src/styles/tokens.scss`:
   - Layer 1: `--palette-*` primitive swatches
   - Layer 2: `--color-*` semantic tokens used by components
   - Layer 3: theme assignments for light and dark
2. Give palette values a more systematic shade naming pattern, e.g. `100`,
   `200`, `300`, or `50`/`100` style names, instead of mixed numeric and
   descriptive names.
3. Use shade names intentionally so the same semantic token can map to a lighter
   or darker palette swatch depending on theme.
4. When resolving raw literals in component files: first scan existing
   `--color-*` tokens for a match (same value, or close enough that the visual
   difference is imperceptible). Use the existing token. Only add a new one when
   nothing current fits.
5. **Evaluate** a `--palette-positive-N` / `--palette-negative-N` family that
   expresses polarity rather than absolute lightness. In light mode
   `positive-100` would be a near-white; in dark mode the same name would map to
   a near-black. If the majority of white/black shade usages can be covered
   without creating more exceptions than the current approach, adopt the
   polarity model. Otherwise fall back to separate named families per color
   role.
6. Document the pattern in `src/docs/color-system.md` and add a short guidance
   note for future non-color tokens, such as:
   - use `--size-*` or `--radius-*` naming for non-color primitives
   - add semantic tokens like `--size-panel-gap` or `--radius-card` in the same
     layered style

## Success criteria

- **Zero hex/rgba literals** in component `.module.css` files after the refactor
  (verifiable by grep; no exceptions).
- **All dark-mode overrides** live in a single
  `:root[data-theme-effective='dark']` block in `src/styles/tokens.scss` — no
  theme-specific rules in component CSS.
- **Every `--color-*` semantic token** defined in Layer 2 resolves to a
  `--palette-*` value in Layer 3; no direct hex/rgba literals in Layer 2.
- **Palette shade names are numeric and monotonic** (e.g. `100` = lightest,
  `900` = darkest within a family) — no descriptive outliers like `near-black`
  or mixed naming.
- **Polarity evaluation is documented**: either the `positive/negative` model is
  adopted for white/black families, or the decision to reject it (and why) is
  recorded in `src/docs/color-system.md`.
- `src/docs/color-system.md` is updated with the revised naming rules and
  guidance for future non-color tokens.

## Assumptions

- The existing two-layer color architecture is still appropriate for the app's
  needs.
- The dark theme will continue to be handled by
  `:root[data-theme-effective='dark']` rather than by adding theme-specific
  styles in component CSS.
- Non-color token implementation can remain a future step after the naming model
  is set.
