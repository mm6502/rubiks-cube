# TODO List

This document lists actionable tasks. For the completeness record — what has
shipped, what is planned, known issues, and the quality snapshot — see
[implementation-status.md](implementation-status.md). The two deliberately do
not repeat each other's content, so they cannot drift apart.

## Current tasks

- Basic View - Whole cube rotations does not distinguish between +180 and -180
  degree turns, resulting in wrong animation for one of them.

- Basic View - Making moves quickly (making next one before the animation ends)
  will result in wrong layer moved. Seems like the mousedown is getting wrong
  sticker mid flight. For example, if I start with a D move on cubie FLD and
  immediately follow with an mouse action mousedown+up I would expect L' move,
  but B' is preformed. It seems like the stickers are detected as if they belong
  to the face where they started their movement.

- Investigate possibility of simplifying move table such as key will be the
  primary/canonical "identifier" of the move and alternative notations will be
  placed in an alternative notation list in the value object (move descriptor?).

- Basic View - In Firefox resizing the view panel produces unexpected visual
  issues. Screenshot in
  [docs/visuals/firefox-resize-issue.png](./docs/visuals/firefox-resize-issue.png)
  Investigate and fix.

(nothing atm)
