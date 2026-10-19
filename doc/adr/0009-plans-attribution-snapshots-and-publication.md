# ADR 0009: Transparent plans, live marks, durable attribution, and snapshot/publication provenance

- **Status:** accepted.
  - The author set the publication policy and the plans-in-snapshots policy
    explicitly on 13 Oct 2026; the agent's implementation choices are
    marked "agent".
- **Date:** 2026-10-13

## Context

The project's definition of good (README) rests on people being able to
propose ideas, respond to others' ideas, and keep a shared memory of what
they built together, without a prescribed result being imposed. The brief's
sections 7–11 translate that into four linked mechanisms that all need a
shared data model: plans (proposals that cost nothing and commit nobody),
live marks ("look here", not "build this"), permanent attribution
(separate from current presence), and immutable, provenance-preserving
snapshots feeding an optional public showcase. This ADR records the shape
of all four together, because they share tables and because the
publication policy depends on how snapshots carry lineage.

## Decision

### Plans

- New table `plans`: `id`, `room_id`, `part_id` (catalog id), `x, y, z,
  rot`, `suggested_colour`, `proposed_by` (visitor id), `created_at`,
  `status` (`open` | `realized` | `withdrawn`).
- *(Superseded on support by the 13 Oct correction below: plans never
  require support.)* A plan is validated against **bounds and the supported-component rule
  only** (author: "must still obey reasonable scene bounds and supported
  component rules"), not against current occupancy or stock: it may
  describe a position real construction can't reach yet (a roof over a
  wall that isn't built), and it never consumes or reserves inventory
  (author). It is checked with a relaxed variant of `checkFit` that skips
  the collision test against *real* parts but still rejects being outside
  `scene.bounds`, and still requires that *if* it rests above y=0, there
  exists at least a plausible support cell beneath it in the footprint
  (agent: this is deliberately looser than `supporters()`, since a plan may
  describe a future state where the support doesn't exist yet either — the
  rule is "not nonsense geometry", not "buildable right now").
- **Realizing** a plan (any member, not only its proposer — the brief does
  not restrict this, and restricting it would work against "anyone who can
  help, should be able to") is one command, `realize-plan`, handled inside
  the same transactional path as `place`: it re-validates the plan's
  placement against **current** real state (full `validatePlacement`,
  exactly as a normal placement would be), and if it fits, atomically:
  consumes stock, inserts the real part with `placed_by` = the realizer
  **and** `proposed_by` = the plan's original proposer carried onto the
  part, marks the plan `status = 'realized'`, linked by `realized_part_id`.
  If it no longer fits (someone built something incompatible in the
  meantime), the command is rejected with a specific reason and the plan
  stays `open`, unchanged (author: "without silently deleting the proposal
  or misrepresenting it as buildable" — the UI shows the rejection, not a
  silent no-op).
- Revising or removing a plan: its proposer, or any member, may withdraw it
  (author decision, consistent with the shared-building model already
  adopted for real parts — nothing in this project locks contributions to
  their author). Withdrawing sets `status = 'withdrawn'`; plans are never
  hard-deleted, so a snapshot taken before a withdrawal remains accurate.

### Marking a plan for everyone

- New table `plan_marks`: `id`, `plan_id`, `marked_by`, `created_at`. Not a
  durable feature record — it is explicitly transient (brief: "temporary
  marks need not become permanent activity history").
- Pushed over the same SSE channel as part changes (ADR 0008), as a
  `plan-marked` event naming the plan and who marked it; the client shows a
  restrained outline/pulse and a label, and lets it fade after ~6s locally
  (agent) without needing a server-side expiry record — the mark's
  *effect* is ephemeral client UI, not stored state that needs cleanup.
  Repeated marks on the same plan within a short window **coalesce**: the
  server only emits a fresh event if the plan has had no mark in the last
  3s (agent's modest anti-spam limit), and does not persist a growing
  table of historical marks.
- Any room member may mark, not only the proposer (author's brief, section
  7, explicit). Marking never forces another player's camera to move
  (author); an optional "locate" affordance the client can offer only pans
  the viewer's *own* camera, never anyone else's.

### Permanent contributor records

- New table `room_contributors`: `room_id`, `visitor_id`,
  `first_contribution_at`. A row is inserted (if absent) the moment a
  visitor's `place` or `realize-plan` command **succeeds** in a room — not
  on join, not on proposing a plan alone, matching the brief precisely:
  "once a player successfully places any real brick... permanently record
  them as a contributor... visiting alone does not count as building."
  This row is never deleted by leaving, disconnecting, or by every one of
  that visitor's parts later being removed (author).
- This is distinct from `room_members.active` (current presence) and from
  `room_members` existing at all (historical membership without ever
  building). A contributor list shown in the UI reads `room_contributors`,
  not `room_members`.
- **Plan-only participation is recorded separately and distinctly**, never
  conflated with having placed a real brick (author: "preserve planning
  authorship too, without falsely claiming that a plan-only participant
  placed real bricks"). The UI and any credits list distinguish "proposed
  N plans" from "placed N parts" rather than merging them into one count,
  and the project avoids brick-count comparisons or rankings entirely
  (author/brief).

### Edit attribution without losing the original builder

- `parts` gains `edited_by` (visitor id, nullable) and `edited_at`
  (nullable), separate from the existing `placed_by`/`created_at`.
  Recolouring or rotating a part updates only `edited_by`/`edited_at`;
  `placed_by` is never overwritten (author: "must not replace original
  builder attribution... record later editors separately").
- A part realized from a plan carries both `proposed_by` (copied from the
  plan at realization) and `placed_by` (the realizer); these may be the
  same visitor or different ones, and both are shown wherever a part's
  provenance is displayed.

### Snapshots are immutable, server-revision-consistent captures

- New table `snapshots`: `id`, `room_id`, `scene_id`, `template_version`,
  `revision` (the room's revision at capture), `saved_by`, `saved_at`,
  `allow_publish` (copied at capture time — see publication, below),
  `source_snapshot_id` (nullable: set when this room was itself created by
  continuing another snapshot, for lineage).
- `snapshot_parts`, `snapshot_inventory`, `snapshot_contributors`,
  `snapshot_plans` are captured **together, inside one transaction reading
  one consistent room revision** (author: "must not mix construction from
  one revision with inventory or contributor data from another"). Any room
  member may save, at any time, without pausing or altering the live room
  (author: "this is not restricted to the host... does not pause, close,
  or modify the shared room").
- Plans are captured into `snapshot_plans` but **excluded from the default
  read-only viewing presentation** and **restored when a new room is
  created by continuing the snapshot** (author's explicit decision: "keep
  this separate... hide them in the default read-only viewing
  presentation, and restore them when continuing"). Temporary
  `plan_marks` and any live-presence data are never captured (author:
  "do not preserve temporary attention markers or online presence" — and
  independently, the brief's general instruction not to snapshot transient
  pings/cursors/invitations).
- Two players saving at different times get independent, immutable items
  even if the room keeps changing afterward (brief's worked example);
  nothing about a later room edit reaches back to update either saved
  item, because a snapshot only ever reads, never references, the live
  room's current row.

### Continuing a saved work

- `POST /api/snapshots/:id/continue` creates a **new** room: new `rooms`
  row, fresh `room_members` (just the continuer, as the new room's host),
  fresh `room_contributors` seeded from the snapshot's **source**
  contributors (so prior contributors are credited on the new room's
  "inherited from" list, but are never listed as current members or as
  having "joined" the new room — author/brief: "do not describe inherited
  creators as people who joined the new room"). Parts/inventory/plans are
  copied from the snapshot (not referenced), so the new room is fully
  independent; editing it never mutates the snapshot, its source room, or
  any public listing (author).
- The new room gets its **own** visibility, invitations and `allow_publish`
  setting, chosen fresh at creation — it never inherits private-room access
  credentials or host privileges from the source (author/brief, explicit).

### Publication policy (author, 13 Oct 2026, final; supersedes the agent's
initial host-only recommendation)

- **`allow_publish` is a room-creation setting**, not a later toggle and
  not an implicit role check: chosen when the room is created, shown to a
  prospective joiner before they join (so nobody discovers after the fact
  that their contribution became publishable), and **fixed for that room's
  lifetime** in this phase.
- **Default:** `true` for a `public`-visibility room, `false` for an
  `invite_only` room — but it is a genuine, visible, independent setting at
  creation time, not merely inferred from visibility at read time, so a
  host can flip a public room's publishing off, or (separately) an
  invite-only room is simply never offered the "allow publish" toggle in
  this phase's UI, since the author's brief frames invite-only + publish as
  the risky combination to guard, not something to make easy to opt into.
- **Any room member may save privately, always**, regardless of
  `allow_publish` (author: "every room member may always save a private
  snapshot").
- **If `allow_publish` is true, any member — not only the host — may
  publish their own saved snapshot** (author, explicit correction of the
  agent's host-only recommendation), retaining full contributor and source
  credit on the published work: publishing is an act on *your own saved
  snapshot*, not a room-admin privilege.
- **Restriction inherits through derivation, checked again at read time,
  not only trusted from the setting that created a row.** A snapshot's
  `allow_publish` is computed at save time as `room.allow_publish AND
  (source_snapshot.allow_publish OR no source)` — i.e. a snapshot can never
  be *more* publishable than the room it was saved from, nor than the
  snapshot (if any) that room was continued from. `POST
  /api/snapshots/:id/publish` re-checks the snapshot's own stored
  `allow_publish` field, and the public showcase's list/read endpoints
  (`GET /api/showcase`, `GET /api/showcase/:id`) only ever return rows from
  a `publications` table that this check already gated at write time —
  there is no code path that serves a showcase preview or listing straight
  from `snapshots`/`rooms` without that gate, which is what closes the
  specific bypass the brief names: creating a new room from a restricted
  snapshot, and then trying to publish *that* room's own snapshot, inherits
  the same `false` and is refused for the same reason, at both write time
  (publish attempt) and read time (nothing restricted is ever exposed
  through a derived room's public preview either, since "public preview"
  of a *room* — as opposed to a published snapshot — does not exist in this
  design at all: only published, explicitly-approved snapshots are ever
  publicly readable).
- **Migrated C8 builds are private and non-publishable by default**
  (author), matching ADR 0007's migration to `invite_only` rooms with
  `allow_publish = false`.

## As built, corrected (independent review, 13 Oct 2026): plans never require support

The first implementation's `plausibleSupport` (described above) still
rejected a plan with *nothing at all* — real or planned — beneath it,
including at height 0 in some code paths, reasoning that this excluded
only "floating over nothing", not genuine future positions. An independent
review found this still too strict against the brief's own example: a
roof proposed before *any* of its supporting walls exist (not merely
before the wall directly beneath that one roof panel) was refused with
`unsupported`, which is exactly the scenario the brief's "planning a
future roof before its supporting structure exists" was written to allow.

`validatePlan` (`src/domain/rules.ts`) no longer checks support at all,
in either its strict (`supporters()`) or relaxed (`plausibleSupport`)
form. It validates only: known part/kit membership, allowed rotation,
palette colour, integer position, and scene bounds — the same "not
nonsense geometry" standard the original decision intended, now applied
consistently rather than stopping short of it. `checkFit` was split into
`checkBoundsAndCollision` (shared) plus the support check (used only by
real placement, via `checkFit` itself), so the two paths no longer
duplicate bounds/collision logic while genuinely diverging on support.
**Realizing** a plan is unchanged: it still re-validates full
`validatePlacement`, support included, against live state, so a plan can
describe something not yet buildable but can never become a real part
until it actually is.

The client's height-stepping (`src/client/state/store.ts`) needed a
matching change to make this reachable through the UI, not only through
the API: `fitHeights` (real, supported heights) and a new `planHeights`
(no collision, not required to be supported) are now tracked separately
as a preview's `fits`/`planFits`. Lower is unchanged; Higher, once past
the topmost real height, climbs one level at a time through positions
only a plan could occupy, so "propose a future roof with nothing under
it" is something a player can actually steer the preview onto with the
visible Higher button, not only something the backend happens to accept
if a client somehow constructed the right command. `scripts/review-fixes.ts`
verifies exactly this path end to end (stepping Higher past the real
heights, confirming Place is refused there but Propose instead is
enabled, and that clicking it actually creates the plan).

*Superseded in the UI by ADR 0011 (19 Oct 2026):* the `Propose instead`
button is gone. Plans are created by clicking the scene in an explicit
Plan mode, and Higher climbs past the real heights only in Plan mode. The
server-side rules in this section are unchanged.

## As built (agent; revises the plan above)

- **Inherited credits are their own table, not folded into
  `room_contributors`.** The first implementation seeded a continued room's
  `room_contributors` directly from the source snapshot's contributors,
  which — on reflection, before any UI was built on top of it — conflated
  two things the brief keeps distinct: "credited from an earlier version"
  and "actually placed a part in this room" (brief: "do not describe
  inherited creators as people who joined the new room"). Fixed with two
  new tables, `room_inherited_credits` and `snapshot_inherited_credits`
  (`room_id`/`snapshot_id`, `visitor_id`, `first_contribution_at`),
  populated only by `seedFromSnapshot`/`saveSnapshot` and never merged into
  `room_contributors`/`snapshot_contributors`. `snapshotOf()` and
  `getSnapshot()` return `contributors` and `inheritedCredits` as two
  separate arrays; the client (`Collection.tsx`'s `Credits`) renders them
  under two separate headings and never sums them into one count.
- **A restricted snapshot cannot be laundered through a public derived
  room either**, closing a second bypass found the same way: the first
  `createRoom` let a continuer request `visibility: "public"` for a room
  built from a non-publishable snapshot. A public room is listed in the
  open lobby and joinable by any visitor while capacity allows (ADR 0007)
  — a disclosure path independent of the showcase, and one the brief
  explicitly names as something publication restriction must survive.
  `createRoom` now reads the source snapshot's `allow_publish` and clamps
  the new room to `invite_only`/`allowPublish: false` whenever it is
  false, regardless of what was requested; the client's "Continue in a new
  room" control detects the clamp in the server's response and tells the
  continuer their choice was overridden rather than silently honouring
  their request. `spec/snapshots-and-showcase.test.ts` covers both the
  publish-attempt refusal and this room-visibility refusal (listing,
  direct join, direct `GET`) as separate assertions.
- **Collection, snapshot-viewer and showcase UI** (brief sections 8–10)
  are lightweight-routed off `/build/` by query parameter
  (`?snapshot=id`, `?showcase=id`, `?view=collection`, `?view=showcase`)
  rather than adding a router dependency, consistent with the rest of the
  lobby (ADR 0007). `SnapshotView.tsx` is a separate lazy-loaded chunk
  (confirmed via the production build's output, not pulled into the base
  lobby bundle) so the read-only viewer's three.js cost is paid only by a
  visitor who actually opens one, matching the site-identity rule that the
  homepage/lobby must not load three.js unnecessarily.
- **Verification**: `scripts/showcase.ts` drives two independent browser
  identities through the real UI — save, read-only view, continue into an
  independent room (checking the source snapshot is provably unchanged by
  reading it back over HTTP), publish, a second stranger continuing the
  published version, and the credits distinguishing publisher/contributors/
  inherited credits with working friend-request buttons — plus the two
  negative cases above, 16 checks total, passing consistently across
  multiple clean reruns.

## As built, corrected (independent review, 13 Oct 2026): continuation requires authorization, not just a known id

`POST /api/snapshots/:id/continue` originally authorized nothing: it only
checked that a snapshot with that id existed, then copied its contents and
made the requester host of a new room from it. `GET /api/snapshots/:id`,
by contrast, already refused a stranger with a 404. An independent review
showed this was a real bypass, not merely redundant with the showcase
gate: a private snapshot id obtained any way (a shared link, a guess, a
leaked URL) let a complete stranger copy its real construction and
attribution immediately, regardless of what the *derived* room's own
visibility turned out to be — by the time `continue` returns 200, the
disclosure has already happened. Fixed with `canAccessSnapshot()`
(`src/server/snapshots.ts`): a visitor may read, copy or continue a
snapshot only if they saved it themselves, are a current member of the
room it was saved from, or it has been published. `GET`, `continue` and
the new `collect` endpoint (below) all call the identical function, so the
policy is enforced the same way at every entry point, not re-derived
per-route. A regression test specifically covers "GET correctly refuses
it, but continue used to let it through anyway", with a snapshot
containing real construction and attribution, not an empty kit.

## As built (added, not revised): saving a published version directly to a collection

Section 10 of the follow-up review asked for a direct "save to my
collection" action on a viewed (saved-or-published) version, distinct
from continuing it into a room: "creating a room and saving from that
room is not equivalent to collecting a work for later." `collectSnapshot`
(`src/server/snapshots.ts`) copies every child row (`snapshot_parts`,
`snapshot_inventory`, `snapshot_contributors`, `snapshot_inherited_credits`,
`snapshot_plans`) from the source snapshot directly into a brand-new
snapshot row owned by the collector, inheriting `allow_publish` and
`source_snapshot_id` from the source (never more permissive than it,
exactly as `saveSnapshot`'s own lineage rule already requires) — and
creates or joins no room at all. Authorized by the same
`canAccessSnapshot()` check as viewing and continuing.

## Consequences

- Six new tables (`plans`, `plan_marks` [ephemeral, may be pruned
  aggressively or kept only in memory — agent to decide at implementation,
  see below], `room_contributors`, `snapshots` + its three child tables,
  `publications`), plus two new columns on `parts` (`edited_by`,
  `edited_at`) and one on `parts`/plans (`proposed_by` where realized).
- `plan_marks` is a candidate for an in-memory-only structure (keyed by
  room, cleared on process restart) rather than a durable table, since
  nothing in the brief requires a mark to survive a restart and the brief
  explicitly says it need not become activity history; this is an
  implementation detail, not a policy the author needs to approve, and is
  decided when the code is written.
- The showcase's data path is deliberately narrow: only `publications` rows
  are ever publicly readable, so a bug in room or snapshot visibility logic
  cannot by itself leak anything through the showcase, because the
  showcase doesn't read those tables at all.
