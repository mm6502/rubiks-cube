# TODO List

If there are no tasks listed below, it means there are no immediate plans for new features or changes. In that case see [implementation-status.md](implementation-status.md) for current implementation status and future plans.

## Current tasks

- [ ] Debug / Fix Basic view (cube walking, rotations, face labels)
- [ ] Add mouse/touch support for performing moves in Basic view

## Future tasks

- [ ] Remove `overrides.flatted` from `package.json` once `@vitest/ui` ships with `flatted >=3.4.2`.
  - Reason: CVE [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) — prototype pollution via `flatted`'s `parse()`. Dev-only risk (vitest UI reporter), not in the production bundle. Override is a temporary workaround until upstream fixes the transitive dep.
