# ADR 0002: The shallow street and the part scope

- Status: proposed.
  - Accepted by the author on 6 October 2026: parametric geometry for the
    initial catalogue, geometry kept separate from connection and collision
    metadata, and the C8 removal rule.
  - Agent recommendations awaiting the author: everything else below.
- Date: 2026-10-06
- Partly superseded by [ADR 0003](0003-open-street-camera-and-contextual-interaction.md),
  6 Oct 2026, the author's decision. The finite base, the orthographic camera
  with restricted orbit, and the street-presentation choices below are
  replaced. The part scope, connections, collision and removal rule still
  stand. The text below is left as it was decided.

## Context

The first scene is a horizontally composed, shallow street. The playable
construction is the dark-blue-roofed house and tree from LEGO Classic 11035
(evidence 0001). The brief rules out a general LEGO CAD tool and a physics
simulation. The C8 cutoff was about 21 hours away when this was written.

## Decision

- **Parts are parametric geometry** (author). They keep real proportions: a
  stud pitch of 1, a plate of 0.4, a brick of 1.2, and studs 0.6 across. LDraw
  import is deferred. The geometry in `src/client/scene/geometry.ts` knows
  nothing about rules, and the rules in `src/domain` know nothing about
  geometry.
- **Eleven part types** (agent). These are the reference model's nine, plus a
  1×2 brick and a 2×1 slope from the set's own Rebuild page. They are listed
  in `src/domain/catalog.ts`.
- **Connections** (agent):
  - Every footprint cell has an anti-stud underneath.
  - Each type lists which top cells carry studs. A slope's sloped face has
    none, and the ridge has none.
  - A part is supported if it sits on the plot, or if at least one of its
    cells sits on a stud of a part whose top is exactly at its base.
  - Rotations are 90° steps around the vertical only.
- **Collision is the footprint box** (agent). This is exact for bricks and
  plates. For slopes it means two slopes can't interlock and nothing tucks
  under an overhang. The reference model doesn't need either.
- **Removal is refused** if any remaining part would be left with no support.
  It never cascades, and removed parts return to the kit (author, for C8).
- **Composite parts** (agent). The door, frame and knob are one part, and so
  are the leaves, flower head and centre of each flower. Each has one
  colourable region: the door leaf and the petals.
- **The base plate is the plot** (agent). It is a fixed 16×8 studded plot, not
  an item in the kit.
- **The street** (agent):
  - one row of shallow frontages: a fixed neighbour either side, a hedge
    behind, and a path and kerb in front
  - a finite base with a visible edge
  - an orthographic camera, near frontal, a little raised and oblique,
    limited to ±43° of orbit

## Consequences

- The kit is countable and colour-free. `spec/domain` proves the whole
  reference builds within it, through the same rules players use.
- Some real LEGO techniques can't be expressed: sideways building, half-stud
  offsets, and slopes interlocking under overhangs. This is honest scope, and
  the README should say so.
- The neighbours use the same parts and are deliberately plainer than the
  player's house. They are never pickable, never in the kit, and never part of
  any future fidelity measure.
