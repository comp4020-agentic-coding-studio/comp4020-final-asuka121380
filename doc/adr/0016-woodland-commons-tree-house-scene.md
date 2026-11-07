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

### The environment (agent, within the brief)

`src/client/scenes/treehouse/`, loaded only by the editor and the snapshot
view (ADR 0004):
- **The tree is drawn from `TREE_PIECES`.** Every fixed box is drawn
  exactly where the rules have it: the trunk and stem, roots and branches
  as bark, the platforms as timber decks with studs. Above the plot's
  ceiling the tree carries on into a crown of limbs.
- **The canopy:** sparse leaf clumps in a broad dome above the crown,
  behind and to the sides, never in front of the working area. They are
  green with some gold and orange for early autumn, in one batch per
  colour.
- **The clearing:** a level grassy plot in a meadow. The forest edge
  (broad trees and pines, batched) closes in behind and to the sides and
  stays well back in front, so the view from the default camera is open
  at every height. A path runs up to the tree from the front. Wooded rises
  and a painted tree line are far off.
- **Light:** a bright early-autumn afternoon. The sun is high to the
  right, a little in front, so the cabins' fronts are lit and the trunk's
  shadow falls back and left. A plain sky gradient with a few small
  clouds. No fog, night or colour grading.
- **Camera obstacles:** the trunk boxes are registered with
  `scene/obstacles.ts`, like the beach houses, so orbiting close behind the
  tree puts the camera back on the target's side of the bark. This is
  checked in `scripts/woodland.ts`. It is not general collision
  avoidance: the canopy, the branches and the forest edge are not
  obstacles.

### Hide leaves (agent, within the brief)

- **One per-page flag** (`state/leaves.ts`). The store's `toggleLeaves()`
  acts only in a scene whose registry entry sets `foliageToggle`.
- **Controls:** **L** and a visible "Hide leaves" button (with
  `aria-pressed`, a `<kbd>L</kbd>` hint, and an entry in the help panel).
  On a phone it is an icon button the same height as Top and Reset.
- **What it hides:** the canopy group only. Never the trunk, branches,
  platforms, parts, plans or forest edge.
- **Purely local:** nothing is sent or stored. Other viewers, the room's
  revision, the kit and every rule are untouched (checked with six
  viewers). A reload shows the leaves again.

### Camera (agent, within the brief)

- **Optional camera limits.** A scene's registry entry may set `camera`:
  - the opening view's centre height (Woodland 10 world units, about 2
    cabin storeys)
  - how high the orbit centre may be panned or focused (32, the crown)
  - the farthest zoom (120)
  Without it a scene keeps the defaults, so Beach Houses and the castle
  are unchanged.
- **The default frame** is frontal and slightly oblique, through the
  existing `frame` setting.
- **Focus selected** raises the centre to a part on any platform. **Top
  view** looks straight down over the plot. **Reset** returns to the
  opening frame. Nothing moves the camera after a placement.

### Aiming at the tree (agent)

- **Pointer boxes.** `FixedSurfaces` in `Workbench.tsx` adds one invisible
  box per fixed piece, the same cells the rules block, as pointer
  surfaces.
- **Platform tops** are surfaces like a part's top, so a held part aims
  onto a platform.
- **Anything else on the tree** (the trunk's side, say) aims at the cell
  in front of it at that height, where the rules then answer.
- **Not selectable.** The boxes carry `userData.fixed` and are never
  selectable or deletable.

### Loading (agent)

- **The defect.** On a cold load the editor drew the plot before the lazy
  environment and its light had arrived: an unlit, black slab on the page
  background for about half a second. It was seen in Woodland Commons, but
  it was a race in every scene.
- **The fix.** The editor and snapshot canvases now put the environment,
  the plot and the parts in one Suspense boundary. Nothing is drawn until
  all of it can be lit, and a "Loading the scene…" status sits over the
  empty canvas meanwhile.

### Homepage and lobby (agent, within ADR 0014's frozen art direction)

- **The tray.** The homepage's scene tray holds three miniatures in three
  slots, smallest to largest:
  - Beach Houses' row
  - the castle's reference
  - the tree's fixed boxes with the Woodland reference cabins and a few
    leaf clumps
  Each is built from the scene's own domain data with the existing
  `scenery.ts`/`geometry.ts` batching. No editor or environment chunk
  loads (checked).
- **Size tags.** The panel cards and the lobby's `ScenePicker` show
  **Small / Medium / Large** before the builder counts **1–2 / 1–4 /
  1–6**.
- **Room creation.** Choosing Woodland Commons in either place creates a
  real `treehouse-01` room.
- **Cover.** Woodland's cover (`public/scenes/woodland-commons.webp`) is a
  screenshot of this scene with the UI hidden. It is not a LEGO image or
  render.

### Correction before release (agent, 7 Nov 2026)

`38b9bf8` widened the two branch boxes to run the platforms' width
(`branch-left` x 7 → 2, both w 6 → 11), after `7ba5576` had first recorded
them shorter.
- **No saved room affected.** No room outside disposable test data existed
  on `treehouse-01`, and nothing had been pushed. So this is a correction
  before release, not a change to a frozen tree.
- **Pinned from now on.** The same commit pins every box in a test, so any
  later change fails.

## Consequences

- **Beach Houses and the castle are unchanged:** their ids, versions,
  kits, bounds, capacities, references and rules. Neither has a `fixed`
  structure, so their rule paths compute exactly as before. A test checks
  this, and the whole existing suite passes unchanged.
- **Saved data is untouched.** Existing rooms, inventories, snapshots and
  ids keep working. No migration runs.
- **Every scene now loads without an unlit frame.** The Suspense change
  applies to all three scenes and the snapshot view.
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
