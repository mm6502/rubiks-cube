---
title: 'refactor: Simplify design token system'
type: refactor
status: active
date: 2026-05-05
origin: docs/brainstorms/design-token-system-requirements.md
---

# refactor: Simplify design token system

## Objective

Make `src/styles/tokens.scss` smaller and more coherent. The token system has
grown organically and accumulated dead entries, inconsistent palette naming, and
raw hex/rgba literals in component CSS. Every implementation unit must reduce
complexity or remove something. Additions are permitted only when nothing
existing fits.

## Approach

Four sequential implementation units. U1 is the lowest-risk warmup (pure
cleanup). U2 renames all descriptive palette tokens. U3 fixes raw literals in
component CSS (depends on U2 for the new palette names). U4 updates
documentation.

## Out of scope

- `--color-*` semantic token name changes
- Component CSS changes beyond the three known raw literal fixes
- Non-color token implementation (guidance-only in docs)
- Rewriting component styling frameworks

---

## U1 — Fix undefined token reference + remove dead token

**Files:** `src/styles/tokens.scss`

### Changes

1. **Line ~325 (dark theme block):** Replace `var(--palette-text-on-accent)` →
   `var(--palette-slate-50)`
   - `--palette-text-on-accent` is never defined anywhere — this is a silent
     no-op in dark mode (the face label is invisible).
   - `--palette-slate-50` (`#f8fafc`) is what `--color-text-on-accent` resolves
     to in Layer 2, which is the same intent.

2. **Line ~54 (Layer 1):** Remove `--palette-neutral-50: #f9fafb`
   - Zero references anywhere in the codebase. Dead token.

### Net change

−1 token defined, 0 tokens added. One silent bug fixed.

### Verification

```
grep "palette-text-on-accent\|palette-neutral-50" src/styles/tokens.scss
```

→ zero matches.

---

## U2 — Rename descriptive palette names to numeric

**Files:** `src/styles/tokens.scss`

### Changes

Rename all descriptive palette names. Update every Layer 2/3 usage within
`tokens.scss` in the same pass. No component CSS uses `--palette-*` directly.

| Old name               | Value     | New name              | Rationale                                      |
| ---------------------- | --------- | --------------------- | ---------------------------------------------- |
| `--palette-near-black` | `#1a1a1a` | `--palette-gray-950`  | ~HSL(0,0%,10%) — fits the numeric gray scale   |
| `--palette-near-white` | `#eaeaea` | `--palette-gray-100`  | ~HSL(0,0%,92%) — fits the numeric gray scale   |
| `--palette-white`      | `#ffffff` | `--palette-gray-0`    | Pure white; zero-point of the gray scale       |
| `--palette-black`      | `#000000` | `--palette-gray-1000` | Pure black; 1000-point of the gray scale       |
| `--palette-gray-550`   | `#6c757d` | _see below_           | Non-standard step; evaluate against `gray-500` |

#### `gray-550` consolidation

`--palette-gray-500` is `#6b7280` and `--palette-gray-550` is `#6c757d`.
Difference: R+1, G+3, B−3 — imperceptible in any rendering context.
**Consolidate:** replace all four `--palette-gray-550` usages in Layer 2 with
`--palette-gray-500`, then remove the `gray-550` definition.

### Net change

−5 descriptive / non-standard names, +4 numeric names, −1 via consolidation.
Net: −2 tokens.

### Verification

```
grep "palette-near-black\|palette-near-white\|palette-white:\|palette-black:\|palette-gray-550" src/styles/tokens.scss
```

→ zero matches.

---

## U3 — Resolve raw hex/rgba literals in component CSS

**Files:** `src/views/circular/circular.module.css`,
`src/views/basic/ghost-stickers.module.css`, `src/styles/tokens.scss` (additions
only if nothing existing fits)

Depends on U2 (uses the new `--palette-gray-0` name for the ghost sticker
token).

### 3a — `circular.module.css` — axis-detection band

The class `.circular-debug-band` is misnamed — it is not a debug feature. These
are functional SVG elements (axis-detection bands) set to `visibility: hidden`
by default. They require proper semantic tokens.

**Raw literals:**

```css
fill: rgba(0, 210, 210, 0.1); /* pure teal-cyan at 10% */
stroke: rgba(0, 210, 210, 0.25); /* pure teal-cyan at 25% */
```

**Scan of existing tokens:** The nearest candidates are the drag-halo family:

- `--color-drag-halo-fill`: `color-mix(cyan-400 50%, transparent)` — `#4cc3ff`
  (blue-cyan) at 50%
- `--color-drag-halo-stroke`: `color-mix(cyan-400 75%, transparent)` — same hue
  at 75%

**Assessment:** Hue differs (`#00d2d2` teal vs `#4cc3ff` blue-cyan) and opacity
levels differ. Do not reuse drag-halo tokens. Add two new semantic tokens to
Layer 2 in `tokens.scss`:

```scss
// § Axis detection bands (circular view)
--color-detection-band-fill: color-mix(
  in srgb,
  var(--palette-cyan-500) 10%,
  transparent
);
--color-detection-band-stroke: color-mix(
  in srgb,
  var(--palette-cyan-500) 25%,
  transparent
);
```

`--palette-cyan-500` is `#00aeef` — the closest teal-family palette entry. The
minor hue shift from the original `#00d2d2` is imperceptible at these opacities.

**Update `circular.module.css`:**

```css
fill: var(--color-detection-band-fill);
stroke: var(--color-detection-band-stroke);
```

### 3b — `ghost-stickers.module.css` — ghost sticker glow

**Raw literal:**

```css
box-shadow: 0 0 4px 1px rgba(255, 255, 255, 0.3);
```

**Scan of existing tokens:** The `--color-overlay-negative-*` family uses
`--color-surface-tint-inverted`, which flips between `--palette-gray-0` (white)
in light mode and `--palette-gray-1000` (black) in dark mode.
`--color-overlay-negative-30` does not exist, and even if it did, it would
produce a black-30% glow in dark mode — wrong for a white sticker glow.

**Assessment:** The white glow is a fixed design intent, not a theme-variable
overlay. Add one semantic token to Layer 2:

```scss
// § Ghost sticker — fixed white outer glow (same in both themes)
--color-ghost-sticker-glow: color-mix(
  in srgb,
  var(--palette-gray-0) 30%,
  transparent
);
```

Using `color-mix` avoids a raw rgba literal in Layer 2 as well.

**Update `ghost-stickers.module.css`:**

```css
box-shadow: 0 0 4px 1px var(--color-ghost-sticker-glow);
```

### Net change for U3

+3 tokens in Layer 2, −3 raw literals from component CSS.

### Verification

```
grep -rn "rgba\|#[0-9a-fA-F]" src/**/*.module.css
```

→ zero matches.

---

## U4 — Update `src/docs/color-system.md`

**Files:** `src/docs/color-system.md`

### Changes

1. **Palette naming rules:** Shade names are numeric and monotonic (e.g.
   `100`–`900`). The endpoints `0` and `1000` are reserved for absolute white
   and black. No descriptive names (`near-black`, `neutral-50`) are permitted in
   Layer 1.

2. **Polarity model decision:** Document that a `--palette-positive-N` /
   `--palette-negative-N` palette family was evaluated and rejected.

   _Reason:_ Polarity is already implemented at Layer 2 via
   `--color-surface-tint` (which flips between `--palette-gray-1000` and
   `--palette-gray-0` per theme) and the `--color-overlay-positive/negative-*`
   family built on top of it. Adding a parallel polarity family to the palette
   layer would duplicate this mechanism without covering any new use-case.

3. **Drop-shadow exception:** Layer 2 semantic shadow tokens in `tokens.scss`
   may use `color-mix()` expressions referencing `--palette-*` tokens. Where
   `box-shadow` shorthand makes that awkward, raw `rgba()` literals are
   permitted in Layer 2 token _definitions_ only. No raw literals are permitted
   in component `.module.css` files, even for shadows — use `var(--color-*)`
   instead.

4. **Non-color token guidance:** Add a short note that future non-color tokens
   (spacing, radius, elevation) follow the same three-layer pattern: a named
   numeric scale in Layer 1, semantic aliases in Layer 2, theme-specific
   assignments in Layer 3.

---

## Success verification

After all units are complete:

```bash
# No raw literals in component CSS (should return zero matches)
grep -rn "rgba\|#[0-9a-fA-F]" src/**/*.module.css

# No descriptive or non-standard palette names remain
grep "palette-near-black\|palette-near-white\|palette-white:\|palette-black:\|palette-gray-550\|palette-neutral-50\|palette-text-on-accent" src/styles/tokens.scss

# Full build passes
npm run all
```
