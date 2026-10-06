# ADR 0005: Surface-aware placement height, camera-relative moves

- **Status:** accepted.
  - The author set the requirements on the evening of 6 Oct 2026, after
    testing the local build in Safari.
  - Choices the agent made in implementing them are marked "agent".
- **Date:** 2026-10-06
- **Supersedes:**
  - the preview's "rest on the tallest part under the footprint" rule and
    the `lift` height aid (ADR 0002, kept in ADR 0003)
  - ADR 0003's fixed world-axis arrow keys

## Context

The author found two problems.

**Lower positions became unreachable.** Once a part stood higher up over
some cells, every lower position under that footprint was out of reach. The
code combined four behaviours:
1. `restingHeight()` always put the preview on the tallest part overlapping
   the footprint.
2. The pointer was reduced to a horizontal cell (`aimedCell`), dropping the
   height of the surface it hit.
3. `moveAnchor()` and `aimAt()` reset the manual `lift` to 0, so a chosen
   height was lost on every horizontal step.
4. A mouse click called `aimAt()` before `placeHeld()`. The click therefore
   re-aimed and could commit something other than the preview on screen.

**Arrow keys and direction buttons used world axes.** From behind or the
side, "left" moved the preview in a direction that had nothing to do with
the screen.

## Decision

### Height

- **The pointer picks a surface, not just a column.**
  - On the plot, the intended height is 0.
  - On the top face of a placed part, it is that part's top.
  - On a side face, it is the cell in front of the face, at the plate level
    of the hit point.
- **Candidate heights** at a footprint are every level from the plot up to
  the build's height limit where the part fits. A level fits if:
  - the part is in bounds
  - it collides with nothing
  - it is on the plot or has studs directly underneath
  The existing rules decide all three (`fitHeights()` in
  `src/domain/rules.ts`). Stock is not considered, because it applies
  equally at every height.
- **The preview's height** is an explicit level, chosen by the pointer or by
  Higher/Lower.
  - From a top face (the plot or a part's top) the level is exact. If the
    part doesn't fit there, the preview shows it there as refused, with the
    rules' reason. It never jumps to some other height on its own: that jump
    was the reported bug.
  - From a side face the hit height is only approximate. The preview drops
    to the nearest level that fits at or below it (agent).
  - A level set with the keys or buttons is kept as chosen. If the part
    doesn't fit there, the preview says why.
- **Higher and Lower** (PageUp/PageDown, plus visible buttons on every
  device) step to the next fitting level above or below. If there is none,
  they say so.
  - The context row shows the height, plus how many heights fit at this
    spot and which one is shown (agent).
- **Horizontal moves** (arrows or buttons) keep the level.
- **The first preview made from the keyboard** uses the lowest fitting level
  (agent).
- **After a placement,** the preview moves onto the part just placed (its
  top), as if pointing at its top face, so repeated Enter or clicks stack
  (agent). To continue a course
  sideways, the player moves and then presses Lower.
- **Confirming commits the preview on screen.**
  - A click or tap inside the shown footprint places exactly that preview,
    without re-aiming.
  - A mouse click elsewhere first aims there and places only if the hover
    had already shown that aim. In practice hover has always updated the
    preview before the click.
  - A tap outside the shown footprint only previews (unchanged).
- **Occlusion aid** (agent): while the preview is below other parts, placed
  parts above it whose footprint overlaps the preview's (with one stud of
  margin) are drawn faded. Faded parts cannot be picked, so the pointer can
  reach surfaces beneath them. They are restored as soon as the preview
  leaves. Nothing is removed and nothing saved changes.

### Camera-relative moves

- The camera's horizontal heading (its azimuth) is snapped to the nearest of
  the four grid axes.
  - "Right" is the axis closest to screen-right, and "up" is the axis
    closest to "away from the viewer".
  - Hysteresis (agent): the snapped quadrant only changes once the azimuth
    is more than 45° + 10° from the current one. Near the diagonals the
    mapping therefore doesn't flip back and forth.
- In top view, OrbitControls keeps the azimuth, and "up" on screen is
  "away", so the same mapping holds.
- Height is a separate control.
- The arrow keys and the visible direction buttons call the same function
  (`moveOnScreen`).

## Alternatives considered

- **Keep "tallest + manual lift" and stop resetting lift.** That still makes
  the pointer lie about where it is, and lift counts plates from the top,
  not from where the player is looking.
- **Pick the height from the hit point's y for every face.** That is
  ambiguous on studded tops (the hit point sits slightly above the top), and
  on side faces it can name levels that don't fit at all.
- **Simulate the insertion path of a real brick.** The author ruled this out
  as unnecessary.
- **Free 8-way or continuous camera-relative movement.** It doesn't stay on
  the grid, and diagonal moves are ambiguous on a stud grid.

## Consequences

- The server is unchanged: it still checks only the placement it's sent.
  The rules gain one pure helper, used only for previews.
- Placement can now go under an overhang, provided a supported position
  exists there.
- With the keyboard, sideways course-building after a placement takes one
  extra keypress (Lower).
- The browser checks must cover:
  - lower placement under an overhang
  - refusal of an unsupported lower spot
  - the height surviving horizontal moves
  - the committed placement matching the preview
  - camera-relative moves from the front, back, both sides, an oblique view
    and the top view
