# ADR 0012: Plans obey construction geometry; positioning, plan visibility, placement feedback and camera

- **Status:** accepted.
  - The author approved this rule change on 19 Oct 2026, after ADR 0011
    shipped. Rules marked "author" come from that brief.
  - Implementation choices the agent made are marked "agent".
- **Date:** 2026-10-19
- **Supersedes:**
  - ADR 0009's 13 Oct correction ("plans never require support") and the
    rule that a plan may overlap anything
  - ADR 0011's "Higher climbs past the topmost real height in Plan mode"
    (`planFits` / `planHeights`)
  - ADR 0003's left-drag-orbits mouse mapping
- **Unchanged:** plans cost no real stock, and planning demand (ADR 0011)
  is derived, may be negative and is never consulted by a rule. Real
  placement and realization are decided by real stock and real support
  alone, on the server, in one transaction. Attribution (ADR 0009). The
  single command path. The Build/Plan modes and their one commit path
  (ADR 0011).

## Context

Under ADR 0009 a plan was checked only for well-formed input and bounds.
Rooms could therefore hold plans floating in mid-air, exact duplicates
and plans inside other plans. A plan that nothing can ever hold up does not
work as a shared suggestion. The author decided that a plan must describe
something that could really be built, given what is built and planned
around it.

The same round of feedback reported several interaction problems:
- In Plan mode, Higher climbed into unsupported space.
- Switching modes could move the preview.
- Travelling to a dock button re-aimed it.
- A selected plan was hard to pick out among other plans.
- Placing a part gave no feedback in the scene.
- Left-drag both built and orbited.

## Decision

### Plan geometry (author)

- A **new** plan is validated against the **planned structure**: the real
  parts plus every open plan that is currently *standing* (below).
  - It may rest on the plot.
  - Above the plot it needs stud support from that structure (real parts,
    standing plans, or both), with the same "at least one stud" threshold
    as a real part.
  - It may not collide with a real part or a standing plan. Exact
    duplicates and partial horizontal or vertical overlaps are all
    rejected, using the catalogue's collision boxes.
  - The catalogue's stud rules apply unchanged: a slope's face, a ridge and
    decorative parts carry nothing, planned or real.
- **Stock stays exempt.** Planning beyond the real kit is allowed (ADR
  0011's negative planning demand).
- **Real parts need real support.** A plan never holds up a real part, and
  realizing a plan needs real stock and real support (re-running
  `validatePlacement` against live state, as before). A failed realization
  leaves the plan open. Realization is one transaction and can't collide
  with the plan it replaces. It keeps `proposed_by` and records
  `placed_by`.
- **Wall, then roof.** A roof can be planned on a planned wall. It becomes
  realizable once the wall is real. Realizing a supporting plan keeps the
  plans resting on it, which are then supported by the new real part.
- **Plans reserve nothing.** A real part may still be placed where a plan
  is. The plan is kept, shown as conflicting, and gives no support while
  it conflicts.
- **No pulling support from under a plan.** Withdrawing a plan, or removing
  or turning a real part, is refused (`plan_depends`) while a standing plan
  rests on it **alone**. If another part or plan also supports it, the
  operation is allowed. Nothing cascades. The message names the dependant
  and says what to do: "Can't withdraw this plan yet: a planned Brick 2×4
  rests on it. Withdraw that one first, or give it other support."
  Turning a real part *into* a plan's space is allowed (the plan just
  becomes a conflict).
- **Authority.** Every check runs on the server inside the existing
  `BEGIN IMMEDIATE` command transaction, through the same
  `src/domain/rules.ts` functions the client previews with. Two
  overlapping proposals sent at the same moment: one commits, the other is
  refused `collision`.

### Standing, conflict and unsupported, in commit order (agent)

`planFits(state)` assigns each open plan one fit, in commit order:
- `standing`: it fits the planned structure built from the plans before
  it, and supports later ones.
- `conflict`: it overlaps a real part or an earlier standing plan.
- `unsupported`: nothing standing holds it up.

The fit is derived, never stored, and computed identically on the server
and on every client from the pushed snapshot. Commit order is decided
from SQLite's `rowid`: every read of plans (`rooms.ts`, `snapshots.ts`) is
`ORDER BY rowid`. Ordering by `created_at` alone broke ties at
millisecond resolution by random id. A full-suite run caught this: an
upper plan was evaluated before its base and judged unsupported.
`spec/server/legacy-plans.test.ts` now covers the tie.

### Compatibility policy for existing plans (author: no deletion or moving; agent: mechanism)

Plans written under ADR 0009 may float or overlap. On upgrade:
- **None is deleted, moved or rewritten.** No migration runs.
- Each is shown by its derived fit. An invalid one is drawn in a distinct
  red-tinted "plan-bad" style, and the selected-plan panel says why
  ("✕ Conflicts with the current construction…" or "✕ Nothing holds this
  plan up any more…"), that it is kept, and what to do.
- An invalid plan gives no support and blocks nothing. Only standing
  plans count as structure, so a conflicting duplicate never stands in the
  way of a new plan (its standing original still does).
- An invalid plan can always be withdrawn, since nothing standing can
  depend on it.
- It never blocks unrelated real placements, removals, rotations or plans
  elsewhere in the room.
- Snapshots continued into a new room restore plans in their original
  order, with the same fits.

### Positioning (author, with agent mechanisms)

- **Higher/Lower** step only through the current mode's supported heights:
  `fitHeights` over the real parts in Build mode, and over the planned
  structure in Plan mode. The unsupported Plan-mode climb (`planHeights`)
  is removed. The preview's verdict is mode-specific (`modeRejection`).
- **A mode switch keeps the exact displayed preview** (the store pins the
  shown level with `snap: false`). If that preview is invalid in the new
  mode it is shown invalid there and the commit is refused. It is never
  moved to a valid spot.
- **Pointer travel over UI never re-aims** (agent mechanism). The scene
  records a short trail of aimed spots and marks a spot *paused* if the
  pointer stayed within 6 px of it for 120 ms. When the pointer enters the
  dock, the header or Help, a preview set by a moving pointer (a sweep on
  the way to a button) is undone back to the newest paused spot. A
  preview set by a key, a button or a tray choice is its own seed, so
  nothing reverts it. Click, Enter and the dock button therefore commit
  the preview the player was looking at.
- **P** toggles the mode except while typing. **Escape** puts the part
  down and never changes the mode (ADR 0011).

### Selected-plan visibility (author, agent's values)

- Unselected plans: subdued, transparent blue with a thin blue outline. An
  invalid plan uses a red-tinted ghost and a red outline.
- **Selected plan:** a bright cyan surface tint (`#2ee6ff`), about 0.14 more
  opaque than an unselected plan and capped at 0.5 so it is never solid.
  It gets a white outline and an outer cyan (`#00d8ff`) outline, both
  drawn on top of the scene. The held preview keeps its own valid/invalid
  look, and a mark keeps its purple. No flashing or pulsing.
- Checked in screenshots among a dense three-course planned wall, from the
  default view, from a low angle against the sky and houses, at 390×844,
  and in WebKit (evidence 0008).

### Placement feedback (author, agent's values)

- A part that has just become real drops from 0.2 units (half a plate) above
  its place to rest in **180 ms** with a cubic ease-out and no bounce. This
  covers the player's own placement, a realized plan, and placements pushed
  from other members over SSE.
- Purely visual: a child group's `y` is animated in `useFrame`. The part's
  committed position, hit-testing and selection use the real position
  from the first frame.
- Only part ids new relative to the previous snapshot animate
  (`adoptLive`). The SSE catch-up event sent after every (re)connect is
  adopted without animation, so neither the initial load, a reload, a
  reconnect nor opening saved work replays. Plans, refused commands,
  recolours and rotations never animate, and a duplicate push doesn't
  restart an animation.
- With `prefers-reduced-motion: reduce` there is no animation at all.

### Camera (author, agent's values)

- **Mouse:**
  - left button: building only
  - right drag: orbits about the current centre
  - Shift+right drag and middle drag: pan (screen-space, so a tall build
    can be inspected)
  - the wheel: zooms
  - the context menu is suppressed over the scene
- **Keys and buttons:**
  - **F** and a visible **Focus selected** button (disabled with nothing
    selected) move the centre to the selected part or plan and frame it
    closer, clamped to the pan box
  - **T** / Top view: top-down over the current centre
  - **Home** / Reset view: the default framing
- **Orbit and Pan tools** (header, `aria-pressed`): while one is on, a left
  drag orbits or pans and a left click never edits. Escape, clicking the
  tool again, choosing a part or turning on the Delete tool leaves it. A
  dark hint says how to get back.
- **Touch:** one finger orbits, two fingers pan, and a pinch zooms (drei
  `TOUCH.ROTATE` / `DOLLY_PAN`).
- **Constraints:**
  - The centre is clamped to the plot plus 4 studs around it, up to the
    tallest build plus 2.
  - Distance is 6–95.
  - The polar angle is 0.02–1.36, so the camera never goes below the
    ground. The existing house boxes keep it out of neighbours.
  - Up stays world up, so there is no roll.
  - During any drag, or while a navigation tool is on, the held preview is
    frozen: no hover re-aims it.
  - A press that moves more than 6 px (10 px on touch) is a drag and never
    edits.
  - Shortcuts don't fire in text fields.
- **A visible controls hint** under the header:
  - desktop: "Right-drag orbit · Shift+right or middle-drag pan · scroll zoom
    · F focus · Home reset"
  - touch: "One finger orbits · two fingers pan and zoom"

## Alternatives considered

- **Keep plans support-free, but reject collisions only.** That still lets
  plans float, and the author asked for buildable suggestions.
- **Validate plans only against real parts.** A roof could then never be
  planned on a planned wall, which the author named as required.
- **Delete or relocate invalid legacy plans during migration.** The
  author ruled this out: it would silently destroy other people's
  suggestions.
- **Cascade-withdraw dependants.** Ruled out, consistent with removal of
  real parts (`CLAUDE.md`: no cascade delete).
- **Freeze the preview whenever the pointer is over UI** (instead of the
  paused-spot trail). Rejected: the sweep *onto* the dock already re-aimed
  the preview before the pointer entered the UI.
- **Server-provided plan fit.** Rejected: the fit is a pure function of the
  pushed snapshot, so the server would send redundant data that could
  drift.

## Consequences

- Obsolete tests that asserted a floating plan, a plan overlapping a real
  part, or Higher climbing into unsupported space were rewritten, at the
  author's direction, to the new rule. They appear in the 7cc7a4d and
  1112a96 commit messages and in evidence 0008.
- New domain tests: `spec/domain/plan-geometry.test.ts`. Legacy-database
  tests: `spec/server/legacy-plans.test.ts`. HTTP and concurrency tests:
  `spec/plans-and-attribution.test.ts`. The two-context browser
  verification is `scripts/plan-geometry.ts` (Chrome and Playwright
  WebKit).
- The left mouse button no longer orbits. Players used to ADR 0003's
  mapping must use the right button or the Orbit tool. The hint and Help
  say so.
- The protocol and database schema are unchanged. Old databases need no
  migration, and old plans may simply show as invalid.
