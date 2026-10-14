# ADR 0007: Rooms replace per-visitor builds; shared inventory; capacity and access

- **Status:** accepted.
  - The author set capacity and the publication-adjacent access rules on
    13 Oct 2026; the agent's implementation choices are marked "agent".
- **Date:** 2026-10-13
- **Supersedes:** the one-build-per-visitor model of ADR 0001/0003 "Nothing in
  `src/domain` knows about SQLite" is kept; only who a build belongs to
  changes.

## Context

C8 gives every visitor their own private build (`currentBuild` in
`src/server/builds.ts` looks up a build by `visitor_id`). The phase 2 brief
requires several distinct people, in independent browsers, to act on one
shared construction and one shared inventory, with rooms that are public
(listed, joinable) or invite-only (unlisted, invitation-gated), survive the
host disconnecting, and never let friendship alone grant access to an
invite-only room.

## Decision

### A build belongs to a room, not a visitor

- `builds` gains `scene_id`'s sibling concept **room**: a new `rooms` table
  owns one build's worth of state (parts + inventory, as today), plus
  `host_id`, `visibility` (`public` | `invite_only`), `allow_publish`
  (fixed at creation, ADR 0009), `max_players` (from scene config, not a
  constant — see below), `created_at`.
- `room_members` records who has ever been part of a room: `room_id`,
  `visitor_id`, `joined_at`, `last_seen_at`, `active` (current presence,
  distinct from historical membership — the brief requires this separation,
  and ADR 0008/0009 need "contributor" to outlive both).
- Existing single-visitor builds are migrated (agent, one-off migration in
  `src/server/db.ts`) into rooms with `visibility = 'invite_only'`,
  `allow_publish = false`, one `room_members` row (the original visitor as
  host), and that visitor as the room's only invitee. Nothing about the
  build's parts, inventory or revision changes. This keeps the author's
  "preserve existing saved builds" instruction and the publish-safety rule
  below (migrated builds are never publishable by default).

### Capacity is scene configuration

- `SceneTemplate` (`src/domain/scene.ts`) gains `maxPlayers: number`.
  **Beach Houses: `maxPlayers = 2`**, including the host (author, 13 Oct
  2026: "Beach Houses supports a maximum of 2 distinct players"). A future
  scene sets its own value; nothing in the server or domain hard-codes 2
  elsewhere.
- Capacity counts **distinct visitors**, not connections or tabs: joining
  from a second tab with the same visitor id (same cookie) reuses the
  existing `room_members` row and consumes no further capacity (author).
  The server keys an "active" count off `visitor_id`, not socket/stream
  count; a visitor may hold any number of concurrent SSE connections to the
  same room (ADR 0008) without affecting capacity.
- Joining is enforced server-side at the moment of joining, inside the same
  transaction pattern as `runCommand`: capacity is re-checked against the
  current row count under `BEGIN IMMEDIATE`, so two simultaneous joins
  cannot both succeed past the limit (closes the "two people joining the
  last slot" race named in the brief).

### Public and invite-only rooms

- **Public**: listed in a lobby endpoint (`GET /api/rooms`), joinable by any
  identity while capacity permits. The lobby shows scene, a short room
  label, current occupancy (count of `active` members) and capacity, and a
  join action — no fabricated numbers, matching the "no fake activity" rule
  already in `CLAUDE.md`.
- **Invite-only**: not returned by `GET /api/rooms`. Joining requires a
  **room invitation**, a server-held row (`room_invites`: room_id,
  invited_visitor_id, status, created_at), distinct from friendship. Being
  the host's friend is never sufficient on its own — the server checks for
  an invitation row with `status = 'accepted'` or the direct invite link's
  token, never a friendship edge, to admit someone to an invite-only room
  (author: "a room invitation is required").
- The host can invite a friend (friendship must exist first, so the server
  only shows "invite" against the host's own accepted friends); the
  invitee accepts or declines. All of this is checked server-side when the
  invitee attempts to join, never trusted from the client.

### Presence, rejoining, and the host leaving

- `room_members.active` flips to `true` on join/reconnect and `false` after
  a grace period with no open SSE connection for that visitor (agent: 30s,
  long enough to survive a reload or brief network blip without losing the
  slot, short enough that a lobby's occupancy count stays honest).
- Rejoining (same visitor, same room) never creates a second membership row
  or consumes a second slot: `room_members` is keyed `(room_id,
  visitor_id)`.
- **The host leaving does not close the room** (author brief: "prefer rooms
  that survive the host disconnecting... do not introduce host-authoritative
  networking"). `host_id` is informational (attribution of who created the
  room, and whose "invite" permission exists for invite-only rooms) and
  carries no runtime authority: the server, not the host's client, is
  authoritative for every command (unchanged from ADR 0001). A departed
  host can return and resume; the room keeps running for remaining members
  in the meantime.

### Shared inventory

- `inventory` (unchanged table shape) is now keyed by `room_id` instead of
  one visitor's build id; `kit = held + placed` still holds, for the room as
  a whole, not per member (author: "all room members use one finite scene
  inventory... this replaces the earlier design of separately allocated
  personal inventories").
- Joining or leaving a room changes nothing in `inventory` (author). A room
  created from a saved snapshot restores that snapshot's remaining stock
  exactly (ADR 0009).
- Placement/removal/recolour/rotation rules (`src/domain/rules.ts`) are
  unchanged in substance: they already operate on a `BuildState` (parts +
  inventory) that doesn't know whose it is. The only change is what
  `currentBuild`-equivalent code looks up (`room_id` instead of
  `visitor_id`) and that attribution now distinguishes "who placed this"
  from "who is in the room" (ADR 0009).

### The lobby, and reaching a room (agent; added once the first implementation
left the editor only ever opening one visitor's default room)

A working server is not a usable feature if nothing in the interface reaches
it. `/build/` is now a room lobby, not the editor directly:

- **"Build on your own"** opens the visitor's existing default room (the
  same one `/api/build` always served) in one click — the brief's "solo
  building remains meaningful and immediately usable" holds exactly as
  before, just one click further from `/`.
- **"Start a room"** creates a room with a chosen visibility and publish
  setting and opens it immediately.
- **"Join a room by its code"** and the **public lobby list** (live
  occupancy, polled every 4s, never fabricated) both join through the same
  `POST /api/rooms/:id/join` the public lobby card's own Join button uses.
- **Room invitations** and **friends** (requests, a personal link,
  acceptance) are both reachable from the same page.
- The editor itself lives at `/build/room/:id`, a real route (a direct link
  or reload re-renders the editor, not the lobby); `main.tsx` reads the id
  from the path and opens that room's transport.
- **Loading a room's data now also (re)joins it.** A direct link, a reload,
  or the browser's own EventSource auto-reconnect all go through the same
  join check as clicking Join, so "restores the correct room and
  authoritative state" (the brief's requirement) holds uniformly: an
  invite-only room with no accepted invitation refuses a reload exactly as
  it refuses a first visit, and a full room reports that too, each as its
  own full-page state (`AccessScreen` in `App.tsx`) rather than a broken
  3D view behind an error chip.
- **Membership changes are pushed live, not only the next build command.**
  The first cut only emitted an SSE event from `runCommand`, so a member
  joining produced no event: everyone already connected saw the arrival
  only once someone placed something. `rooms.ts`'s `join`, `leave` and the
  presence sweep now push a snapshot on any real transition (an away
  member reconnecting counts; the SSE keep-alive's own heartbeat does not,
  so it never spams a snapshot to the whole room every 10 seconds).
- **Accepting an invitation joins the room in the same step.** The first
  cut only flipped the invitation's status, leaving the person with no way
  to actually reach the room they'd just said yes to; `respondToInvite`
  now admits them as a member atomically (still capacity-checked), and the
  lobby takes them straight there.
- **In the editor, a Room panel** (current members vs. permanent
  contributors, kept visibly distinct per the brief; invite a friend by id;
  save a copy; leave) is reachable from the header, in the same chip
  family as Help and the view controls — no new visual language.

Verified end to end with two independent browser contexts (never two tabs
sharing one identity) driving only visible controls: creating a room,
discovering and joining it from the public lobby, both members placing,
recolouring and removing real bricks with propagation measured at 2–50 ms
(`scripts/multiplayer.ts`), and the full friend-link → accept → invite →
accept-and-join path for an invite-only room, including the refusals for an
uninvited friend and an uninvited stranger (`scripts/invites.ts`).

## As built, corrected (independent review, 13 Oct 2026): capacity enforcement unified across every admission path

The first implementation's capacity check only ran when a visitor had
*no* `room_members` row at all: `join` and `respondToInvite` each checked
`n >= maxPlayers` solely in the "brand-new member" branch, waving through
anyone who already had a historical row (ever joined, ever invited, left
or not) regardless of how many *active* members the room currently held.
An independent review demonstrated the bypass directly: with a 2-player
room at capacity (A and B both active), B leaves, C joins (now C and A
active), and B then rejoins successfully — reporting 3 active members in
a 2-player room, bypassing the limit through nothing more than having
been a member before.

Fixed by factoring every active/inactive transition through one function,
`admitActive()` (`src/server/rooms.ts`), which re-checks capacity
regardless of whether the visitor has a historical `room_members` row,
and is the *only* code path that flips a row from inactive to active or
inserts a new active one. `join`, `respondToInvite`'s acceptance branch,
and the SSE connect/keep-alive path (`markActive`, now capacity-checked
for a currently-inactive visitor rather than assumed-fine) all call it;
none has its own separate capacity arithmetic anymore. An already-active
visitor's own request (a second tab, or the periodic SSE heartbeat) is
always a cheap no-op, never re-checked and never capacity-consuming,
preserving the original "same visitor, many tabs" rule. Verified by
`spec/server/capacity.test.ts` against seven scenarios directly: leave
then replacement then rejoin, a presence-sweep expiry then replacement
then return, the returning host (no exemption for having created the
room), multiple tabs for one active identity, an accepted invitation
re-admitting past capacity, an SSE reconnect for a returning member, and
concurrent join attempts for the last slot.

## As built, corrected (independent review, 14 Oct 2026): mutation authorization checks CURRENT admission, not historical membership

The 13 Oct capacity fix (above) corrected every path that ADMITS a visitor
to an active slot. It missed a parallel gap on the path that lets an
already-admitted-then-removed visitor keep MUTATING the room they're no
longer active in: `runCommand` (`src/server/builds.ts`) and the plan-mark
endpoint (`POST /api/rooms/:id/mark`) both authorized on a bare
`room_members` row existing at all — historical membership — not on
`active = 1`. The review reproduced this precisely: A and B join a
2-player room; B leaves; C joins, filling B's slot; B's own rejoin is
correctly refused (409 `room_full`, the 13 Oct fix working as intended);
but B could still place a part directly, consuming stock, bumping the
revision, and recording B as a contributor in a room B was no longer an
active member of at all.

Fixed with `isActiveMember()` (`src/server/rooms.ts`), the one function
every mutation path now calls: active now, or (the deliberate exception)
the solo/default room's host, which never goes through `join`/`markActive`
at all on the back-compat `/api/build`+`/api/command` path and would
otherwise be locked out of their own build. `isMember()` (historical
membership) is kept, unchanged, for genuinely read-only checks that were
always meant to stay permissive — viewing a room (`GET /api/rooms/:id`),
the SSE connect's initial room-exists check (capacity is still
re-enforced separately by `markActive`), and saving a snapshot (ADR 0009:
"any member may save a private snapshot... any time"). A rejected mutation
changes nothing: no part, no stock, no plan, no revision bump, no emitted
SSE event — verified by reading the room's state immediately before and
after the refused attempt. The permanent contributor record from when B
WAS active is untouched; only further mutation while inactive is refused.
`spec/inactive-member-authorization.test.ts` covers placement, removal,
rotation, recolouring, plan propose/withdraw/realize, and marking, plus
the solo-room exception and the "multiple tabs, same identity, no extra
slot consumed" case; `scripts/inactive-member.ts` reproduces the exact
reported sequence through visible browser controls with three independent
identities.

## As built, added (independent review, 14 Oct 2026): a pre-join confirmation screen before any admission

A direct room link previously joined before showing anything about the
room — the publication setting (added 13 Oct) was disclosed only in the
public lobby LIST and the pending-invitation list, never for someone
arriving by a direct URL, who was admitted first and informed, if at all,
only after. New `GET /api/rooms/:id/preview` (`admissionPreview()` in
`rooms.ts`) is a read-only admission preview: room name, scene,
visibility, real occupancy/capacity, the publication setting, and whether
this visitor could join right now — it never joins, reserves a slot, or
discloses anything about an invite-only room's contents to a visitor with
no standing in it (returning nothing at all there, the same as a 404
would, rather than a half-populated object). The client
(`src/client/PreJoin.tsx`) gates `main.tsx`'s real `start()` (which
performs the actual, server-re-checked join) behind this screen and an
explicit "Join this room" click, for a first-time direct link; an
already-admitted/returning player (`alreadyMember`) skips it entirely, so
reload/reconnect stays exactly as immediate as before. The same preview
also now backs the lobby's "join by room id" flow (previously a timing
gap existed: the Join button was clickable the instant an id was typed,
whether or not the async preview had actually resolved) and the
invitation list (now also showing live occupancy, not only the
publication flag). `spec/admission-preview.test.ts` and
`scripts/pre-join.ts` cover both.

## What's still out of scope for this phase

- A full room-management UI (renaming, transferring host, kicking a
  member) beyond what's needed to create, join, invite and leave.
- Per-scene capacity beyond the one number; no per-room override of a
  scene's configured maximum.
- Collection, snapshot viewing/continuation and showcase interfaces in the
  editor itself: the server endpoints exist (ADR 0009) and "Save a copy" is
  reachable from the Room panel, but there is no UI yet to browse, continue
  or publish a saved snapshot.

## Consequences

- `src/server/builds.ts` is restructured around `room_id` in place of
  `visitor_id` for build lookup; a thin visitor/identity layer
  (`src/server/identity.ts`, new) becomes the single place that resolves a
  cookie to a visitor id, used by both the room code and ADR 0006's
  recovery endpoints.
- The migration (ADR 0006/0007 combined) is a single idempotent SQL step in
  `MIGRATIONS`, run once: existing `builds`/`parts`/`inventory` rows gain a
  owning room row each, with no data loss and no parts renumbered.
- Spec tests for C8 (`spec/persistence.test.ts`) exercise the one-member,
  invite-only room every migrated/new solo visitor gets by default, so they
  keep passing unchanged in spirit (a solo visitor's experience is
  identical) even though the schema underneath has moved.
