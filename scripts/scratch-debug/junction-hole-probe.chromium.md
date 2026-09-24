# Junction hole probe — chromium

Pixels whose colour changed in the REAL app when `border-radius` was removed
from `.cubie-interior` walls, i.e. the area a rounded corner failed to cover.

Cube clip: 123x160 CSS px at deviceScaleFactor 2.

## Arm B — the review comment's proposal (sticker-backed walls squared)

| colour in the shipped arm | pixels changed |
| ------------------------- | -------------- |
| **total**                 | **0**          |

Sticker-coloured pixels among them: **0** of 0.

## Arm C — every wall squared (contrast)

| colour in the shipped arm | pixels changed |
| ------------------------- | -------------- |
| body #222                 | 99             |
| border #333               | 2              |
| **total**                 | **101**        |

Sticker-coloured pixels among them: **0** of 101.

## Reading

Squaring the sticker-backed wall changes 0 device pixels, 0.000% of the crop. Of
those, 0 were a sticker colour in the shipped arm.

Every pixel the rounded corner left uncovered was dark in the shipped arm — body
`#222` or sticker border `#333`. The wall's rounded corner is congruent with the
sticker's, so it uncovers exactly the bound the sticker's border already paints;
squaring it repaints that bound in body colour. No face colour is exposed, so
the comment's predicted visible defect does not occur.

What this can and cannot prove: antialiased sub-pixel slivers of the
perpendicular walls could fall below one device pixel and hide a leak, so a
small count is weaker evidence than the colours of the pixels that DID change —
which is why the classification above, not the total, is the finding.
