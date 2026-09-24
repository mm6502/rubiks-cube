# Junction hole probe — firefox

Pixels whose colour changed in the REAL app when every `.cubie-interior` wall
had `border-radius` forced from `15%` to `0`. This is the area the rounded
corner failed to cover.

Cube clip: 123x160 CSS px, deviceScaleFactor 2.

| colour in the shipped arm | pixels changed |
| ------------------------- | -------------- |
| body #222                 | 1111           |
| other                     | 40             |
| border #333               | 35             |
| sticker:white             | 1              |
| **total changed**         | **1187**       |

## Verdict inputs

Sticker-coloured pixels (a face colour visible where the wall should have
covered it): **1** of 1187 changed pixels, i.e. 0.1% of them.

Face colour WAS visible where the wall should have covered it, so the review
comment describes a real, visible leak.

First differing pixel: index 221, shipped = rgb(53,53,53), squared =
rgb(44,44,44).

Note the asymmetry in what this can prove: antialiased sub-pixel slivers of the
perpendicular walls could fall below one device pixel and hide a leak, so a zero
is weaker evidence than a non-zero.
