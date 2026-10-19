# ADR 0011: Plan mode as a spatial tool, and derived planning demand

- **Status:** accepted.
  - The author approved the change to the plan interaction and the
    inventory presentation on 19 Oct 2026. It supersedes the earlier UI
    where a plan could be created only through a `Propose instead` button.
  - Implementation choices the agent made are marked "agent".
- **Date:** 2026-10-19
- **Supersedes:**
  - the `Propose instead` interaction recorded in ADR 0009's 13 Oct
    correction
  - the "no modes" line of `CLAUDE.md`'s Interaction section (which itself
    superseded ADR 0003's Build/Select modes), for one mode only
- **Unchanged:** every server rule in ADR 0009. Plans cost no real stock,
  block nothing real and never need support (*support and collision
  superseded by ADR 0012*). Realizing a plan re-runs full
  `validatePlacement` against live state in one transaction.

## Context

Plans are meant to be the project's spatial language: one player suggests,
another responds. After choosing a part, a click on the scene placed it
for real. A plan could be made only by moving the pointer from the scene
to a `Propose instead` button in the dock. On the way the pointer crossed
the scene and re-aimed the preview, so the plan created was often not the
one the player had been looking at. ADR 0005's rule that "confirming
commits exactly the preview on screen" held for real placement but not for
plans.

Plans also gave no sense of scale. Nothing told collaborators whether the
room's pieces could cover what they had proposed.

## Decision

### Two construction modes (author)

- **Build** (default) and **Plan**. The mode is local UI state in each
  browser: it is never sent to the server, and one member's mode never
  changes another's.
- A segmented control with two buttons, "Build mode" and "Plan mode".
  Each has `aria-pressed`, a visible word and an icon (■ / ◇), and the
  group is described by a hidden explanation of both modes. Colour is
  never the only signal: Plan mode also shows a dashed "Plan" tag, the
  commit button reads `Propose plan` instead of `Place`, and the preview
  label reads "◇ Plan here" instead of "✓ Fits". **P** toggles the mode.
  Like every letter shortcut it is ignored in editable fields (agent:
  existing `isEditable` guard, now also checked by `scripts/interaction.ts`).
- Placement of the control (agent): on the tray's tab row when the tray is
  open; in the top row when the tray is folded; its own full-width row on a
  phone, with 40 px buttons. One instance at a time, so there is never a
  duplicate in the accessibility tree.
- **One commit path.** `commitHeld()` reads the mode at the moment of the
  commit and calls `placeHeld()` (Build) or `proposeHeld()` (Plan). A scene
  click inside the preview's footprint, Enter, and the dock button all go
  through it, so none can commit the other kind of object. A mode switch
  after a command is sent cannot change that command.
- **Plan mode uses the same spatial controls**: pointer aiming, rotation,
  camera-relative nudges, Higher/Lower, and touch's tap-to-preview then
  tap-to-commit. A click commits exactly the displayed preview (ADR 0005's
  rule, now true for plans too). After proposing, the part stays held and
  the next preview sits on top of the plan just made, as after a real
  placement (agent).
- **The mode is stable.** Proposing does not leave Plan mode, and switching
  back to Build is always explicit (button or P). Escape keeps its existing
  order (delete tool off, else put the part down, else deselect) and
  **does not** change the mode (agent: Escape is "put it down", and the
  author asked that switching back be explicit).
- Switching mode keeps the held part, its preview and its height, so the
  same spot can be judged both ways. Entering Plan leaves the delete tool,
  as choosing a part already does (agent).

### What differs between the modes

- *(Superseded by ADR 0012, 19 Oct 2026: in Plan mode Higher/Lower now step
  through heights supported by real parts and standing plans only; the
  unsupported climb and `planFits` are gone. A mode switch keeps the exact
  displayed preview, shown invalid if it doesn't fit the new mode.)*
- **Heights.** In Build, Higher/Lower step only through real, supported
  heights (`fits`), exactly as ADR 0005 describes. In Plan, Higher keeps
  climbing past the topmost real height, one level at a time, through
  positions nothing supports yet (`planFits`). That is how a future roof
  before its walls is reached. Before this change Build mode could also
  climb there, only so the old button could reach those heights. That
  behaviour now belongs to Plan mode alone (agent).
- **Aiming at plans.** In Plan mode a plan's top face is a surface you can
  aim at, so a planned roof can sit on a planned wall. In Build mode the
  pointer looks through plans to the real surface behind them, so a plan
  never blocks real building through the UI either (agent).
- **Preview appearance.** A plan-mode preview, and every existing plan, are
  drawn more transparent with a blue cast and a blue outline. A real-part
  preview keeps its look (agent).
- **Zero stock.** Plan mode lets a part be chosen and proposed whatever its
  real or planned count. Plans express future demand.

### Planning demand: derived, never stored (author)

- `plannedRemaining(state)` (`src/domain/rules.ts`, pure) =
  `inventory[part] − (open plans of that part)`, for every part type,
  counting **every member's** open plans.
- **No second stock table** and no server change. Plans are still never
  subtracted from `inventory`. `kit = held + placed` is untouched.
- It is computed on each client from the snapshot the server already
  pushes over SSE (ADR 0008). Every member therefore sees the same value,
  and it updates live when anyone proposes, withdraws or realizes.
  Withdrawing raises it by one. Realizing removes the plan's demand and
  spends one real piece, so the planned count stays the same while the
  real count drops by one.
- **It may be negative** ("the plans need N more than the room has").
- **It is never consulted by any rule.** A real placement, or a
  realization, is decided by real `inventory` alone, on the server, at
  commit time. Negative demand never stops anyone building for real. A
  realization with no real stock left is refused `out_of_stock` and the
  plan stays open (ADR 0009, unchanged).
- **Presentation (agent):** in Build mode the tray shows the real count
  (`×N`), exactly as before. In Plan mode each tile shows a dashed, outlined
  `◇ N` badge (red when negative) instead of the solid yellow stock badge.
  Its accessible name says both numbers ("Brick 2×4, planned remaining 15;
  17 real left"). The held part's row spells out "Real kit · plans · planned
  left". Help explains that the planned count can go below zero and that
  real building always uses the real count. Planning demand is never shown
  as owned stock and never per player.

## Alternatives considered

- **Keep the button, but freeze the preview while the pointer is over the
  dock.** That still needs travel to a separate control, it is fragile on
  touch, and a plan still isn't a direct spatial act.
- **A modifier key (Shift-click proposes).** Not discoverable, not
  available on touch, and easy to trigger by accident.
- **Reserve stock for plans on the server.** The author ruled this out. It
  would be a second, competing stock and would turn suggestions into
  claims.
- **Escape leaves Plan mode.** Rejected: it overloads "put the part down"
  and makes the mode unstable while proposing several pieces.

## Consequences

- The server, the command protocol and the database are unchanged. Every
  existing authorization, capacity and attribution rule applies unchanged
  to `propose-plan`, `withdraw-plan` and `realize-plan`.
- Build mode's Higher no longer reaches unsupported heights. That restores
  ADR 0005's "next height that fits" for real building.
- Verified by `spec/domain/planned-remaining.test.ts`, the "planning
  demand" block of `spec/plans-and-attribution.test.ts`, an SSE test in
  `spec/realtime.test.ts`, and `scripts/plan-mode.ts` (two independent
  browser contexts plus a touch-emulated phone). `scripts/multiplayer.ts`,
  `scripts/review-fixes.ts` and `scripts/interaction.ts` were updated
  accordingly. Results: `doc/evidence/0007-plan-mode.md`.
- In Plan mode the dock is one row taller, for the counts. In Build mode it
  matches its previous height exactly (evidence 0007).
