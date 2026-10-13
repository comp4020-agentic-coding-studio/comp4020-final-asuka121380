# ADR 0008: Server-sent events for realtime; per-part conflict detection, not a whole-room lock

- **Status:** accepted.
- **Date:** 2026-10-13
- **This is the crit 9 decision record**, required by the crit's spec:
  "one decision about how the app behaves when several people use it at once
  is made and written down in the repo, and you can say why." It names the
  mechanism (this ADR's first half) and, as the spec asks for "one level
  up", the behavioural decision about simultaneous edits (the second half).

## Context

C8's command path (`runCommand` in `src/server/builds.ts`) is already
transactional and idempotent: validate against live state, write, bump a
revision, record the command id. What's missing for C9 is (a) a way for a
change one person makes to reach every other open session on the same room
within about a second without a reload, and (b) a stated, defended decision
about what happens when two people change things "at once" — the crit's
explicit ask, judged against the project's own definition of good.

The project's definition of good (README) centres on people being able to
contribute and respond to each other's ideas without a result being
imposed on them. That bears directly on the concurrency decision: a design
where one person's edit frequently invalidates another's attempted edit
would quietly recreate exactly the "my result over yours" dynamic the
project says it wants to avoid.

## Part 1: transport mechanism

### Options considered

1. **WebSockets.** Full duplex, lowest latency, but the server would need
   to accept client-initiated messages over the socket too, which means a
   second code path for writes alongside the existing authenticated,
   validated `POST /api/command` — or discarding that path's shape to fold
   writes into the socket protocol. Either way is more surface for the
   single 256MB machine to hold in memory per open connection, and more
   protocol to design, for a game whose writes are already infrequent,
   discrete, user-paced actions (a placement, not a stream of positions).
2. **Fast polling.** Simplest to implement, but "about a second" means
   polling every room every ~1s from every open client, which multiplies
   badly with `max_players` rooms × however many are open, against a
   256MB/shared-cpu-1x machine (`fly.toml`) with one SQLite file as the
   only store — and polling intervals are a per-client guess, not a
   server-driven guarantee.
3. **Server-sent events (SSE).** One extra `GET` per open session
   (`GET /api/rooms/:id/events`), held open; the server pushes a line each
   time the room's revision changes. Writes keep using the existing
   `POST /api/command` unchanged. Reconnection is exactly "open the stream
   again"; HTTP infrastructure (Fly's proxy, browsers) already understands
   one-directional long-lived GETs, and there's no new write path to keep
   in sync with the validated one.

### Decision

**Server-sent events** (agent recommendation; no objection raised).
Rationale: writes are already one well-defined, validated, idempotent HTTP
path, and SSE adds only the push half without duplicating or bypassing it.
It costs one open connection per active session per room — on `max_players
= 2` (ADR 0007), that is at most 2 live connections per room, well within a
single small machine, and simpler to reason about for `auto_stop_machines`
(an open SSE stream counts as app activity, so the machine doesn't stop out
from under a live room; Fly's proxy buffers nothing and forwards each
`data:` line as it's flushed).

**Mechanism** (agent):
- `runCommand` gains a success hook: after a transaction commits, the new
  snapshot (or, cheaper, just the new revision and the single changed/
  removed/added part) is handed to an in-process `EventEmitter` keyed by
  `room_id`.
- `GET /api/rooms/:id/events` (SSE) subscribes to that emitter for the
  room, sends the current snapshot as the first event (so a client that
  just reconnected needs no separate "catch-up" fetch), then forwards
  subsequent deltas as they're committed.
- Because the whole app is one process on one machine (ADR 0001), the
  emitter needs no cross-instance fan-out (no Redis pub/sub, no second Fly
  app): every write and every subscriber live in the same Node process.
  This is revisited if the app ever runs more than one machine.
- A client that misses events (connection drop) gets the full current
  snapshot on reconnect, which is strictly simpler and strictly correct
  compared to replaying a missed delta log, at the cost of re-sending the
  whole (small) parts list on every reconnect rather than only the gap.

## Part 2: the concurrency decision (crit 9's required choice)

The spec names this as one level above the mechanism: "what happens when
two people change the same thing at once." Two shapes were considered.

### Option A: a whole-room optimistic lock (reject on stale revision, always)

Today's `expectedRevision !== build.revision` check (`runCommand`) already
does this for a single-visitor build, where only one actor can ever send
commands between two of their own requests, so it never actually fires
against another person. Carried into a shared room unchanged, it means:
**any** committed change by anyone invalidates every other member's
in-flight command, even an unrelated placement in an empty corner of the
plot. With two people building the same small plot (`maxPlayers = 2`), this
would very commonly reject an ordinary second placement sent moments after
the first — not because the two changes conflict, but because the global
counter moved.

- **Cost:** judged against the project's definition of good, this fails
  directly: two people trying to each add something, at the same time, on
  a shared plot — exactly the scenario the project exists for — would
  routinely see one of them rejected and told to retry, for no reason
  related to what they were actually doing. That reads as the opposite of
  "respond to each other's ideas without conformity being imposed"; it
  imposes an arbitrary winner by network timing instead.

### Option B: validate and commit against live state; reject only on an actual conflict

A placement is checked against whatever the room's live parts and
inventory are *at commit time*, inside the existing `BEGIN IMMEDIATE`
transaction — not against a revision number the client last saw. Two
people placing into two different empty cells both succeed, because
neither placement collides with, nor depends on, anything the other
touched. A real conflict — both aiming at the same cell, or one editing
(removing/recolouring/rotating) a part the other just removed — is still
caught, because `checkFit`, `validateRemoval` etc. (`src/domain/rules.ts`)
already check the *current* occupancy and existence of the targeted part,
not a cached copy.

- **`place` commands drop the `expectedRevision` gate entirely**: a
  placement's validity depends only on current occupancy, stock and
  bounds, all of which `validatePlacement` re-checks against live state
  inside the transaction regardless of what revision the client thought it
  was.
- **`remove`/`recolour`/`rotate` commands are gated on the targeted part's
  own last-known state**, not the room's global revision: the client sends
  the part id plus the revision at which it last saw that specific part
  (a per-part version, stored as the part's `updated_at`/rowid-derived
  value, not the whole-room counter). If that part has since been removed
  or changed by someone else, the command is rejected with a part-specific
  conflict ("someone already changed that part") and the client's UI
  refreshes just that part from the pushed snapshot — not "your build
  changed somewhere else, reload," which is what C8's global-conflict
  message says today and which would otherwise fire constantly in a shared
  room.
- This still prevents every conflict the brief lists as needing protection
  (duplicate commands after retries — unchanged, by `commandId`; two
  people consuming the last component — unchanged, by the stock check
  inside the transaction; conflicting edits to the same part — now
  detected per-part instead of globally; simultaneous independent
  placements — now explicitly allowed to both succeed).

### Decision

**Option B** (author approved the direction when approving the broader
concurrency requirement in the brief; mechanism is the agent's). Ordinary
simultaneous building on different parts of the plot is not treated as a
conflict. A genuine conflict — two people acting on the *same* placed part,
or racing for the *same* cell/last stock unit — is still caught exactly
once, by whichever commits first inside the transaction, and reported to
the other with a specific, accurate reason rather than a generic "the
world moved" message.

**What this costs:** a slightly more complex client reconciliation (a
rejected `remove`/`recolour`/`rotate` needs to resolve against "this one
part changed", not "reload everything"), and the server does marginally
more per-part bookkeeping (tracking a version per part, not only per
build). Both are judged worth it against the alternative's cost: routinely
punishing the exact cooperative behaviour — two people building at once —
that the project's own definition of good says should be possible without
one person's success crowding out another's.

## The alternative the pod will argue (per the crit's instructions)

The crit explicitly has the pod argue for the option not picked: the
whole-room optimistic lock (Option A). Its genuine case: it is simpler to
reason about and test (one counter, one comparison), and it guarantees a
client is never shown a part it doesn't know has changed, at any instant —
useful if the project's good depended on everyone having an *identical*,
synchronously-agreed view at every moment, rather than on being able to act
concurrently. This project's definition of good weighs concurrent
contribution over synchronous identical state, so Option A is rejected
here, but the trade is real and scene-dependent: a scene with tight
structural dependencies between far-apart parts might reasonably need
something closer to Option A.

## Consequences

- `commands` table gains nothing new for `place`; `remove`/`recolour`/
  `rotate` envelopes change shape: `expectedRevision` (room-level) is kept
  for backward compatibility with the snapshot shown to the client, but the
  authoritative check for those three command types becomes
  `expectedPartRevision` against the specific `placedId`.
- The SSE push payload is a full snapshot on connect/reconnect and a
  targeted delta (`{type: "part-added" | "part-removed" | "part-changed" |
  "inventory-changed", ...}`) on each subsequent commit, so a client can
  patch its local view without waiting for the next full reload.
- `spec/realtime.test.ts` (new) is the testable half of this ADR: two
  independent fetches joining the same room, one placing, the other
  observing the SSE stream, asserting the event arrives well under the
  roughly-one-second bar, and that two non-conflicting placements from two
  clients both succeed without either reporting a conflict.
