# ADR 0015: The Medieval Castle, a second playable scene

- **Status:** accepted.
  - The author's brief of 5 Nov 2026 asked for the castle scene, its
    sources, the allocation formula, four players, the environment and
    the integration points, and explicitly superseded the single
    playable-scene rule for this scene.
  - Choices the agent made are marked "agent".
- **Date:** 2026-11-05
- **Relates to:**
  - ADR 0003 (versioned kits, additive upgrades)
  - ADR 0004 (site identity, the scene registry)
  - ADR 0007 (rooms, shared inventory, `maxPlayers`)
  - ADR 0009 (snapshots and continuing them)
  - ADR 0012 (plans use the same geometry as real parts)
  - ADR 0013 (server logs)
  - ADR 0014 (the tabletop homepage)
- **Supersedes:** the "multiple playable scenes" item in CLAUDE.md's
  out-of-scope list, for this one scene only.
- **Research:** `doc/research/0002-medieval-castle-reference.md`.

## Context

The site was built to hold several scenes (ADR 0004), but only Beach Houses
was playable. The scene's id was stored on every room, build and snapshot
from the start, yet the server and the editor read one fixed template, so
a room's stored scene was never consulted.

The author's brief asked for a medium-sized medieval castle scene:
- with a kit derived from the official LEGO Creator 31120 instructions
  (primary model only), allocated as `ceil(required × 1.30)`;
- for up to four players, while Beach Houses stays at two;
- in a bright medieval valley with an unobstructed front;
- selectable everywhere a scene is chosen, carried to the server and
  persisted, with existing rooms, inventories, snapshots and ids untouched.

## Decision

### Scene resolution is per room (agent)

- `SCENES` (`src/domain/scene.ts`) now has two templates:
  - `street-01` (Beach Houses, unchanged: version 2, 16×8×42, 2 players)
  - `castle-01` (Medieval Castle, `src/domain/castle.ts`: version 1,
    32×26×48, 4 players)
- `sceneById(room.scene_id)` replaces the server's fixed template in every
  path:
  - the version upgrade, room creation, the capacity check (`admitActive`,
    the one admission path, ADR 0007)
  - invitations, the public lobby, the admission preview, `snapshotOf`
  - command validation (`builds.ts`)
- **Creating a room** takes an optional `sceneId`.
  - `POST /api/rooms` accepts `sceneId`, checked against `SCENES`; an
    unknown one is a 400 and creates nothing. If it's absent the room is
    Beach Houses, so existing clients and scripts behave as before.
- **Continuing a snapshot** always creates a room of the snapshot's own
  scene, whatever is asked for.
- **The solo plot** is now one per visitor and scene.
  - `GET /api/build?scene=<id>` (default Beach Houses) returns that
    scene's default room, creating it on first use.
  - `/api/summary` counts parts across a visitor's solo plots.
- **Logging (ADR 0013):** `room.create` and `snapshot.continue` gain a
  `scene` field: the stored scene id, a token from a fixed set. The
  rejected unknown-scene create is logged as `rejected`, `unknown_scene`.

### One schema change, additive

Migration 5 replaces the unique index `rooms_one_default_per_host
(host_id) WHERE is_default = 1` with `rooms_one_default_per_host_scene
(host_id, scene_id) WHERE is_default = 1`.
- No row is read, changed or deleted.
- Every existing solo room stays its visitor's Beach Houses solo room.
- `spec/server/scene-migration.test.ts` opens a database left at
  `user_version` 4 and checks rooms, parts and stock are unchanged, then
  that a castle plot can be added beside the existing one.

### The kit and the reference

- The kit is the research record's required quantities, each allocated
  as `ceil(required × 1.30)`. `allocate()` uses integer arithmetic
  (×130, /100), so 10 × 1.30 is 13, not 14.
- The kit has 20 part types:
  - 11 existing: bricks 1×2, 2×2 and 2×4; plates 2×2 and 2×8; slopes 2×1
    and 2×2; the ridge; the door; the round plate; the window.
  - 9 new: brick 1×1; brick 1×4; round brick 1×1; plates 1×2, 2×4 and 6×6;
    arches 1×4 and 1×8×2; the inverted slope 2×2.
- The kit is colour-agnostic and shared by the room (ADR 0007).
- Version 1 has no additions; any later change is additive (ADR 0003).
- The reference (393 parts) is an adapted castle, not the official layout:
  - a gate arch between two square towers
  - curtain walls with a wall-walk and battlements
  - a small courtyard
  - a hall with a door, windows and a gable roof
- The reference is a target picture and a test fixture. **New rooms start
  empty**; nothing pre-places it.

### A small rules extension: sockets (agent)

- A part may list `sockets`: the footprint cells with an anti-stud
  underneath. A part rests only on studs below one of its sockets.
  Without the list, sockets are the whole footprint.
- The arches list their two legs, and the inverted slope lists its back
  row. A part under an arch's opening, or under an inverted slope's
  overhang, never holds it up.
- Collision is still the whole footprint box for every part.
- No existing part lists sockets, so Beach Houses' rules are exactly as
  before (a test checks every part without sockets rests on its whole
  footprint).
- Plans use the same `supporters` function, so plan geometry follows the
  same sockets (ADR 0012).

### The editor and the pages follow the room

- **The editor** (`state/store.ts`) adopts the scene of the snapshot it
  loads, before the snapshot reaches the UI. From that scene come:
  - bounds, tray and camera framing
  - the plot's tone, the starting colour and the suggested colours
  - the target picture, its label and alt text
  - the environment and the page title
  The workbench mounts only once the scene is known.
- **The pre-join screen and snapshot view** take the scene from the room
  or snapshot.
- **`?local&scene=castle-01`** previews the castle with nothing saved.
- **The lobby (`/build/`)** gains a scene choice above its two start
  tiles. Each option shows:
  - the scene's cover, rendered from the scene itself
  - its title and setting
  - its real capacity and plot size
  "Build alone" and "Create and open" name the chosen scene. Beach Houses
  is chosen by default.
- **The homepage's scene-tray panel** lists both scenes as cards, with the
  same facts. The 3D tray and the table's composition are unchanged; only
  its label reads "Scenes" instead of "Beach Houses".

### The environment (agent, within the brief)

`src/client/scenes/castle/` holds the scene's metadata, sky, terrain and
environment, built with the shared `Batch` toolkit:
- **In front:** a stone road, open grass, nothing tall. Every tree, rock
  and ruin stays out of the corridor between the default view and the
  courtyard.
- **In the middle:** the plot as a stone-paved courtyard with subtly
  varied flagstones, a paved apron round it, and a low coursed retaining
  wall behind and beside it (the grass there stands 0.9 higher). Three
  low ruins, under about 2.4 high, sit outside the bounds.
- **Behind:** low hills with sparse woodland and rocks, and a mountain
  range with peaks to the sides and a quieter, lower saddle behind the
  courtyard.
- **Light:** a warm, clear afternoon, with the sun to the side and slightly
  behind. A generous sky fill keeps the faces turned away from the sun
  readable. No fog, no darkness, no colour grading, and no moat.
- **Assets:** nothing photoreal and nothing moving. The cover
  (`public/scenes/medieval-castle.webp`) is rendered from the scene, with
  the UI hidden.

## Consequences

- Beach Houses is unchanged: its id, version, kit, bounds, capacity,
  reference, environment and rules. Existing rooms, inventories, snapshots
  and ids are untouched; the migration only loosens one index.
- A room's scene is fixed at creation. Continuing a snapshot keeps its
  scene. A room can't change scene.
- The capacity a client is shown (lobby, invitations, preview, editor)
  always comes from the room's own scene on the server.
- Two existing browser scripts (`multiplayer.ts`, `interaction.ts`) had
  stopped reaching the editor since `731c920` hid the lobby's room form
  behind the shared tile. They now click it first. Other scripts that
  click "Create and open" on `/build/` have the same pre-existing problem
  and were not changed in this pass.
- `main.tsx` never started the editor on paths with nothing to confirm
  (`?local`, the bare `/build/room/` path) after `3a47ed9`. It now starts
  once on mount in that case. Found while previewing the castle.

## Out of scope still

Still out of scope:
- a moat or water features
- moving characters, animals, physics, collapse
- the drawbridge mechanism
- a scene switch inside an existing room
- more than these two playable scenes
