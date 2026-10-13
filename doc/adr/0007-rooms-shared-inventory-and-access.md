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

## What's still out of scope for this phase

- A full room-management UI (renaming, transferring host, kicking a
  member) beyond what's needed to create, join, invite and leave.
- Per-scene capacity beyond the one number; no per-room override of a
  scene's configured maximum.

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
