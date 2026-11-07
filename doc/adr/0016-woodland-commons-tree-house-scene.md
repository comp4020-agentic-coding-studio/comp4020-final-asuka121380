# ADR 0016: Woodland Commons, a tree-house scene with a fixed structure

- **Status:** accepted.
  - The author's brief of 7 Nov 2026 asked for the scene:
    - its official source, the inventory method and the allocation formula
    - six players
    - explicit, scene-configured fixed supports kept consistent across
      every rule path
    - the environment, the camera and the "Hide leaves" control
    - the homepage and lobby integration
  - The brief explicitly allowed one change to the rules: the fixed tree
    takes part in them.
  - Choices the agent made are marked "agent".
- **Date:** 2026-11-07
- **Relates to:**
  - ADR 0003 (versioned kits, additive upgrades)
  - ADR 0005 (heights and aiming)
  - ADR 0007 (rooms, shared inventory, `maxPlayers`)
  - ADR 0009 (snapshots)
  - ADR 0012 (plans use the same geometry as real parts)
  - ADR 0013 (server logs)
  - ADR 0014 (the tabletop homepage)
  - ADR 0015 (per-room scenes, the castle, sockets)
- **Amends:** CLAUDE.md's rule "never put fixed scenery in the build, the
  kit or the rules". A scene's fixed structure is now in the rules, never
  in the build or the kit.
- **Research:** `doc/research/0003-tree-house-reference.md`.

## Context

The brief asks for a third scene, inspired by LEGO Ideas Tree House 21318:
- one fixed central tree with a trunk, a few structural branches, and
  explicit fixed supports or starting platforms
- players build cabins, platforms, stairs, railings and connections, in
  three loose height zones (ground, middle, upper)
- up to six players and one shared inventory

Until now, every surface a part could rest on was either the plot (y = 0)
or a placed part's studs. Fixed scenery was drawn by the client and was
invisible to the rules (CLAUDE.md, Never). A tree drawn that way would let
a part float through its trunk, and give nothing to build on halfway up.
That would be a decorative tree beside ordinary houses, which the brief
rules out.

## Decision

### A scene's fixed structure (agent, within the brief)

- **`SceneTemplate.fixed`** (`src/domain/scene.ts`) is an optional,
  versioned list of `FixedPiece` boxes, in the parts' own grid.
- **Each box has** an id, a kind (`trunk`, `root`, `branch`, `deck`), a
  minimum corner, a size, and whether its top face carries studs.
- **Blocking and support:**
  - Every box blocks: no part or plan may overlap it.
  - Only a box with studs is a support surface, carrying parts on its top
    face over its whole footprint.
  - Woodland Commons has three such boxes, the platforms. The trunk,
    roots and branches are solid and studless, so nothing rests on them
    and nothing passes through them.
- **One consistent rule path.** The rules (`rules.ts`) build an occupancy
  map and a stud map from the scene's boxes once per template, and use
  them in two helpers:
  - `checkBoundsAndCollision`: a fixed box in the way is a `collision`
    naming it ("the tree's trunk", "a fixed platform").
  - `isHeld`: a part is held up on the plot, on a fixed platform's studs
    under one of its sockets, or on a placed part's studs.
- **Who uses those helpers:**
  - placement, plans and realizing plans
  - rotation, including its stranded-dependant check
  - removal: a part also resting on a platform keeps that support
  - `planFits` and `plannedStructure` (ADR 0012), withdrawal's
    dependency check, and `fitHeights`, which drives Higher/Lower and the
    preview
- **Threading the scene through.** `validateRemoval`, `validateWithdrawPlan`,
  `planFits` and `plannedStructure` take an optional `scene` argument.
  - Omitted, there is no fixed structure, so every existing caller and
    test behaves exactly as before.
  - `validateCommand` (the server and the local preview) and the editor's
    store pass the room's scene.
- **The tree is not a part.** It has no row in the build, the kit or the
  stock. A command naming a fixed box's id is `not_found`, so nothing can
  select, recolour, turn or remove it. It costs nothing.
- **Frozen coordinates.** The coordinates are frozen with the scene id
  `treehouse-01`. Saved builds rest on them. A different tree would be a
  new scene id, never a new version of this one: versions only add kit
  part types (ADR 0003). `fixed.version` (1) is recorded so a reader can
  tell which tree a build was made against.
- **Box sizes match what is drawn.** No invisible supports: the client
  draws every box where it is, and the drawn trunk and platforms enclose
  exactly the cells the rules block.

### Woodland Commons (`treehouse-01`)

- **Template:** version 1; plot 32 × 28 studs, 72 plates high;
  `maxPlayers` 6.
- **The tree** (`TREE_PIECES` in `src/domain/treehouse.ts`):
  - The trunk stands at x 13–18, z 1–10, behind the main working area,
    so the front 17 rows are open at every height.
  - It is 35 plates up to the crown deck, and a narrower stem rises to
    the ceiling behind it.
  - Three roots spread on the ground.
  - Two branches carry the side platforms.
- **The platforms**, one per height zone above the ground:
  - left, 8 × 8, top at 12 plates (one stairs flight up)
  - right, 8 × 8, top at 24
  - the crown deck on the trunk, 10 × 8, top at 36
- **The kit** is the research record's required quantities, each
  allocated as `ceil(required × 1.30)` in integer arithmetic (the
  castle's `allocate()` rule):
  - 22 part types, 1,090 required, 1,426 allocated
  - three new parts: plate 1×1, plate 1×4, and the stairs 2×4×4
  - colour-agnostic and shared by the room (ADR 0007)
- **The stairs 2×4×4** stand on their bottom step and carry studs only on
  their top step, so a second flight rests on the first. They collide as
  their whole box: nothing tucks under a flight.
- **A colour** `nougat` (warm timber) is added at the end of the palette.
  No existing colour changes (ADR 0004).
- **The reference** (450 parts) is an adapted assembly, built only from
  the kit and checked through the rules:
  - three cabins, one on each platform
  - stairs from the ground to both side platforms and from the right
    porch to the crown
  - porch railings and a picnic spot

  It is a target picture and a test fixture. **New rooms start empty.**

### Server and logs

- **No schema change.** Migration 5's index (one solo room per visitor and
  scene) already holds a third scene. Rooms, snapshots and continuation
  read the scene from the room as before (ADR 0015).
- **Logs:** the `scene` log field is a token, and `treehouse-01` passes
  it unchanged. No allowlist change was needed.

## Consequences

- **Beach Houses and the castle are unchanged:** their ids, versions,
  kits, bounds, capacities, references and rules. Neither has a `fixed`
  structure, so their rule paths compute exactly as before. A test checks
  this, and the whole existing suite passes unchanged.
- **Saved data is untouched.** Existing rooms, inventories, snapshots and
  ids keep working. No migration runs.
- **The CLAUDE.md "fixed scenery" rule** now has one written exception,
  this structure. Drawn-only scenery (hills, houses, distant woods, the
  canopy's leaves) stays out of the rules.

## Out of scope still

Still out of scope:
- rope bridges, physics, sway or collapse
- angled or curved walls and roofs
- a scene switch inside an existing room
- changing the tree of `treehouse-01`
- more than these three playable scenes
