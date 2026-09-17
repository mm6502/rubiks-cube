# Circular layout tooling

Analysis and search tools for the Circular view's per-size geometry. They exist
to answer "what configuration should this size use?" — a question the test suite
deliberately does not answer.

## Why these are not tests

The tests under `src/views/circular/svg-generator*.test.ts` **assert**
invariants about the configuration that is already committed: stickers land
where they should, ellipses do not interpenetrate, ghosts stay enclosed, the
canvas contains what is drawn. They answer "is this configuration valid?".

These scripts **search**. They sweep parameter ranges, bisect for a binding
constraint, and report what the geometry would allow:

| script                    | question it answers                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `analyse-tangency.ts`     | Grown until the inner trio touches, what are the inter-cluster gaps?                |
| `analyse-ghost-enclosure` | Which offset pairs enclose ghosts **and** keep ellipses apart? (2-objective)        |
| `analyse-labels.ts`       | How far is each face label from its ellipse, and what would "touching" require?     |
| `check-shipped.ts`        | Does every size the app renders have ghosts enclosed?                               |
| `check-canvas.ts`         | Does one specific SVG's viewBox contain everything visible?                         |
| `check-3x3-fidelity.ts`   | Does regenerating 3x3 still preserve the stickers and rings the fidelity tests pin? |
| `render-previews.ts`      | What does configuration D actually look like, per size, at one common scale?        |

The `analyse-*` scripts are the ones to reach for when **parameterising further
or hunting a new configuration** — they are the durable replacement for the
throwaway scripts used while the layout was originally derived. `check-*` are
verifiers for a specific artifact; `render-previews` is the visual one.

## Running them

```bash
npx tsx scripts/circular-layout/analyse-tangency.ts
npx tsx scripts/circular-layout/analyse-ghost-enclosure.ts
npx tsx scripts/circular-layout/analyse-labels.ts
npx tsx scripts/circular-layout/check-shipped.ts
npx tsx scripts/circular-layout/check-3x3-fidelity.ts
npx tsx scripts/circular-layout/check-canvas.ts <svg> [svg...]   # takes paths
npm run svg:layout-preview                                       # render-previews.ts
```

Only `render-previews` has an npm script. The rest are `tsx` one-shots, run by
hand when the question comes up. They print to stdout and write nothing into
`src/` — `render-previews` writes to `scripts/circular-layout/out/`, which is
gitignored.

## They read the generator, not the disk

**Committing `view-<n>.svg` is optional** (see
`scripts/circular-svg/README.md`). The loader serves a committed asset when
present and builds the size from `parameters.json` otherwise.

These scripts take their markup from the same generator, so they work whether or
not the assets are committed, and they describe what the app will actually
render. `check-shipped.ts` reports which source each size took (`committed` or
`generated`), because a table that silently went empty once the assets stopped
being committed read as "no problems" rather than "no input".

Use `render-previews` when you need to _see_ a configuration. It emits one SVG
and one PNG per size plus an `index.html` that draws every size at one common
scale, which is the only way to compare the progression across sizes directly.

## Changing a configuration

1. Edit the per-size values in
   `src/views/circular/svg-generator/parameters.json`.
2. Run the relevant `analyse-*` script to see what geometry that buys you — for
   example whether raising `innerRadius` opens the inter-cluster room you need.
3. `npm run svg:layout-preview` to look at it.
4. `npm test` — the generator suite asserts the invariants, and the fidelity
   tests compare against `fixtures/reference-3x3.svg`.
5. If 3x3's ring geometry moves, run `check-3x3-fidelity.ts` first: it is the
   contract that says whether the fidelity tests still test anything.

Regenerating a committed asset, when you want one:

```bash
npm run svg:circular -- <n>            # writes src/views/circular/view-<n>.svg
```

## Two traps these scripts hit, worth not re-discovering

- **The apex height is hand-rounded** to `0.87·d` rather than `√3/2`, so the
  120-degree symmetry is approximate. Measured spread within one orbit reaches
  0.63 units. Any search that assumes exact symmetry will be wrong by more than
  its own tolerance.
- **A boundary sampled at too few points under-reports crossings.** An
  intersection falling between samples is invisible. Two defences are in use:
  `analyse-ghost-enclosure` takes 2048 directions and uses the support function,
  which is exact for the direction tested; `check-shipped` avoids sampling
  entirely with the closed-form radial distance to an ellipse. If you write a
  new clearance check, do one of those rather than a coarse loop — a clearance
  that is merely _large_ at the sampled points is not the same as one that is
  never negative.
