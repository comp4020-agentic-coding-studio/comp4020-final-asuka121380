# ADR 0013: Server logs that say who did what

- **Status:** accepted.
  - The author approved the investigation and the design on 20 Oct 2026,
    along with these adjustments: allowlisted event builders, safe error
    handling first, the short visitor label without names or a new identity
    scheme, `room_activity` left unchanged, and no player-facing log.
  - Choices the agent made are marked "agent".
- **Date:** 2026-10-20
- **Relates to:**
  - ADR 0006 and ADR 0010 (identity)
  - ADR 0007 (rooms and admission)
  - ADR 0008 (commands and realtime)
  - ADR 0009 (plans, attribution, snapshots)
  - ADR 0011 and ADR 0012 (Plan mode and plan rules)
- **Corrects:** ADR 0006's statement that "the structured log in `index.ts`
  never receives request bodies". That was true of the command log line, but
  Express's default error handler printed error stacks, and the stack of a
  JSON parse error quotes the start of the body.

## Context

### What Crit 10 requires (course)

These are the course's requirements, summarised from the Crit 10 brief.
- The app tells users apart.
- Visibility and edit rights are enforced on the server, and the decision
  is written down in the repo with its reasons.
- The server logs who did what, and that logging stays in the app after the
  crit.
- At the crit, two classmates use the deployed URL alone in separate Chrome
  profiles while the author narrates from the logs
  (`flyctl logs` in a terminal is enough), without operating the app.

The brief does not ask for an activity feed, a dashboard, or any particular
retention period.

### What the app had before this change

- One `command` line per command that reached the transaction.
- Nothing for rooms, admission, invitations, snapshots, identity or
  friends.
- No target, part, position or original author on command lines.
- No line for early command refusals.
- A raw error stack for anything unexpected.

### What this ADR decides (ours)

Which events to log, and which fields, is the project's own proportionate
design for this app. It is not a checklist the course imposes.

## Decision

### Where each kind of record lives

| Record | Home | Who can read it |
|---|---|---|
| "Who did what", refusals, errors (diagnostic) | One JSON line per event on stdout, collected by Fly (`flyctl logs -a comp4020-final-asuka121380`) | The author and agents with Fly access |
| Committed construction history (provenance) | SQLite `room_activity`, **unchanged**: committed construction commands only | Nobody through the app (no API reads it) |
| Sanitized excerpts used as evidence | `doc/evidence/` | Public with the repo |
| Decisions and their history | ADRs, `DEVELOPMENT_LOG.md` | Public with the repo |

**Nothing is player-facing (author).** There is no history API, activity feed
or admin page. A future shared-memory feature would be a separate product
decision.

**Retention is Fly's and is short.** The repo promises no retention period.
Logging stays on in the normal app, so it outlives the crit. Excerpts worth
keeping are saved as sanitized evidence (see "Capturing evidence" below).

### Line format (agent, within the author's constraints)

- **Built by typed builders.** `src/server/log.ts` writes only the keys of
  its `Fields` type, in a fixed order, and each value passes a validator for
  its kind:
  - ids must be UUID-shaped
  - names must match `[a-z0-9_-]`
  - positions must look like `x,y,z,rot`
  - routes must be route templates
- **Nothing raw is ever serialized:** no request, body, header, cookie,
  token, error object, error message or stack.
- **Client-supplied values are logged only in a safe form:**
  - a route parameter that isn't a UUID becomes `"unrecognised"`
  - an unknown command type becomes `"unrecognised"`
  - a command id that isn't a UUID becomes `h-` plus the first 16 hex
    digits of its SHA-256, so a retry can still be matched without logging
    the text
- **Logging never fails or stalls a request.** A line is queued, never
  written synchronously, and an output failure is absorbed (see "Output
  under backpressure"). Mutation
  events are emitted after their transaction has committed.

### Identifiers (author)

- **`actor`:** the first 8 hex characters of the server-resolved visitor id.
  - It is the same short label the UI already shows ("a guest builder
    (xxxxxxxx)").
  - It is readable for narration, but **not guaranteed unique**.
  - It never comes from a request body.
  - No usernames, display names, IP addresses or new pseudonym scheme.
- **`author`:** the original builder of a real part, or the proposer of a
  plan. It is read from server state inside the transaction, before a
  removal or realization makes it unavailable.
- **`peer`:** the other visitor in an invitation, a friend action, a sign-in
  or a recovery.
- **`req`:** a full server-generated UUID per HTTP request, also returned as
  the `X-Request-Id` header. This is the reliable correlation key.
  Background events (presence expiry) have none.
- **`cmd`:** the client's command id (see above). Two lines with the same
  `cmd` are one action delivered twice.

### Outcomes

| Outcome | Meaning |
|---|---|
| `changed` | a state change was committed |
| `ok` | succeeded without persisting anything: a preview, a mark broadcast, an SSE connection, a password check |
| `unchanged` | an idempotent no-op: already admitted, already left, already invited |
| `duplicate` | a retried command whose first delivery already committed (`rev` is the first delivery's revision) |
| `rejected` | a rule refused it, or its object doesn't exist |
| `conflict` | a stale edit of a part someone else changed first |
| `denied` | authorization or admission refused it |
| `invalid` | a malformed request |
| `limited` | rate limited or cooling down |
| `error` | an unexpected failure |

**Public error codes are unchanged.**
- A non-admitted member's command still answers `bad_request`, and the log
  says `not_admitted`.
- Publish still answers `not_allowed`, and the log says `not_saver` or
  `publish_disallowed`.
- "Missing" and "not yours" still share one 404, and the log says which.

### Events

| Event | Fields beyond `actor`/`req` | Notes |
|---|---|---|
| `visitor.new` | `reason` (no_cookie, unknown_session), `route` | Since 20 Oct, a first visit to the lobby or editor creates exactly one, from `/api/me` (see "Identity is established first") |
| `account.register`, `account.sign_in`, `account.sign_out` | `peer` on sign-in | Step one of sign-in is `ok` with reason `verified`; only the confirm step is `changed`. No usernames or passwords |
| `identity.recovery_code`, `identity.recover` | `peer` on recover | Never the code |
| `room.create` | `room`, `visibility` | Never the free-text label |
| `room.preview` | `room` | The editor's first request for a room link; an invite-only refusal happens here |
| `room.join` | `room`, `reason` | `unchanged` when already admitted (every editor load re-joins) |
| `room.leave` | `room` | Explicit Leave only |
| `room.read` | `room` | Refusals only |
| `room.invite`, `room.invite_response` | `peer`, `room`, `target` | |
| `presence.end` | `room`, `reason` (expired, signed_out, session_replaced) | Presence expiry is a background event, with no `req` |
| `sse.open`, `sse.close` | `room`, `open`, `ms`, `reason` (client_gone, revoked) | Connection events. A close is never treated as leaving. No heartbeat lines |
| `command` | `type`, `room`, `target`, `part`, `at`, `colour`, `author`, `rev`, `cmd` | Includes early refusals: no_session, not_json, too_fast, bad_envelope |
| `plan.mark` | `room`, `target`, `author` | `ok` or `limited` (cooldown). Marks are never persisted (ADR 0009) |
| `friend.link`, `friend.link_open`, `friend.request`, `friend.response` | `peer`, `target` | Never the link token |
| `snapshot.save`, `snapshot.publish`, `snapshot.collect`, `snapshot.continue`, `snapshot.read` | `room`, `target`, `source`, `rev` | `read` logs refusals only |
| `http.refused`, `http.error` | `status`, `method`, `route`, `kind`; for errors also `error`, `errcode`, `where` | From the one error handler |
| `server.start`, `server.stop` | `reason` (sigterm, sigint, uncaught_exception, unhandled_rejection, open_transaction, escalated_<kind>) | `server.stop` outcome is `ok` for a signal and `error` for a fatal stop. A second, `escalated_` line means a fatal error arrived during a graceful shutdown |
| `log.dropped` | `reason` (output_backpressure), `lost` | Written where lines were dropped because stdout couldn't keep up |
| `background.error` | `kind` (presence_sweep, sse_keepalive), `reason` (recoverable, fatal_open_transaction), `error`, `errcode`, `where` | Recoverable: the server keeps serving |
| `process.crash` | `kind` (uncaught_exception, unhandled_rejection), `error`, `errcode`, `where` | Always followed by a fatal `server.stop` |

**Scope: the defined events, not every request.** The table lists the
significant actions this design covers. Some things are intentionally left
out, listed below.

**Not logged:**
- Reads that change nothing and refuse nothing, such as lobby lists,
  snapshot views and showcase reads.
- Heartbeats, pointer or preview movement.
- Clicks the editor refuses locally. The editor checks every command
  against the shared rules first (`submit` in `store.ts`), so an ordinary
  invalid click never reaches the server. No client telemetry was added to
  capture them.

### Unexpected errors (author: fix first)

There is one final Express error handler:
- It logs only the fixed `kind`, the route template, status, method and
  request id.
- For a 500 it also logs the error's class name, its code, and up to three
  of the app's own stack frames as `src/…:line`. Each frame is checked
  against a strict pattern, so the message line never passes.
- Statuses are kept: malformed JSON 400, oversized body 413, otherwise
  500.
- The response is the page Express itself sent in production (standard
  status text, same security headers). Unlike Express in development, it
  never includes a stack.
- After headers have been sent, the handler ends the response itself
  instead of falling back to Express's default.
- Uncaught exceptions and failures in background timers are logged the same
  way. An uncaught exception still exits with status 1.

### Output under backpressure (corrected 20 Oct 2026, agent)

*Superseded design, kept for the record:* the first review (`b9ec1ed`)
made every line synchronous (`writeLineSync`), with a 2 s retry on EAGAIN,
so that a crash line couldn't be lost on exit. That was wrong. Here
stdout's pipe is in blocking mode, so with the pipe unread, `writeSync`
blocked the whole server in the kernel. No requests were answered, no
timers ran, and SIGTERM couldn't be handled; only SIGKILL ended it.

**Now** (`bcd0b2c`), `log.ts` keeps a bounded in-memory queue in front of
stdout:
- Lines are handed to `process.stdout.write` one at a time. When a write
  reports the stream full, the queue waits for `'drain'` before the next
  one.
- Logging never blocks the event loop, and lines that are kept arrive in
  the order they were logged.
- **Limits:** 1,000 lines or 1 MiB queued, whichever comes first.
- **Overflow policy:** a new line that doesn't fit is dropped, and the
  older queued lines are kept, so what survives is contiguous. The gap is
  marked. When output reaches it, one line is written in its place:
  `{"event":"log.dropped","outcome":"error","reason":"output_backpressure","lost":N}`.
  A line logged while the queue is full is lost too, whatever it says.
- **Failed output.** If the stream errors (EPIPE), closes, or its `write()`
  throws, output stops for good. Later lines are counted, never retried,
  and nothing logs about the logger.
- **The honest trade-off:** a stalled or broken log pipe costs log lines,
  never service. Delivery is not guaranteed.

### Fatal and background errors, and stopping (reviewed, then corrected 20 Oct 2026, agent)

- **Fatal errors** (an uncaught exception or unhandled rejection anywhere
  outside a request's own handling) never let the process go on serving:
  - The process's state may be inconsistent, so it logs `process.crash`
    and stops.
  - It exits with status 1, and Fly restarts the machine.
  - Nothing is retried in-process.
- **Recoverable background errors.** The presence sweep and the SSE
  keep-alive each run one idempotent statement in a transaction that rolls
  back on failure. They are logged as `background.error` with reason
  `recoverable`, and run again on the next tick while the server keeps
  serving. If the database is left inside a transaction (the rollback
  itself failed), every later write would fail, so that case is fatal
  (`fatal_open_transaction`).
- **One way to stop** (`shutdown()`), for SIGTERM, SIGINT and fatal errors:
  1. arm a 3 s deadline timer, before anything else
  2. log `server.stop`
  3. stop accepting connections
  4. end every open connection (SSE streams would otherwise keep the
     process alive)
  5. close the database, which checkpoints the WAL
  6. wait one turn of the event loop, so an error raised during cleanup
     has logged and counted itself
  7. flush queued log lines for at most 1 s (best effort; an unread pipe is
     not waited on beyond that)
  8. exit with the status as it then stands

  Every SQLite call is synchronous, so no request can be part-way through a
  transaction while this runs.
- **The exit status only rises.** A signal asks for 0, and anything fatal
  raises the status to 1. `process.exitCode` is kept in step, so every way
  out carries it.
  - A fatal error during a graceful shutdown is not ignored. It logs
    `process.crash`, then one `server.stop` with reason
    `escalated_<kind>`. The running shutdown finishes and exits 1.
  - A later signal never lowers the status. Repeated signals start no
    second cleanup.
  - *Corrected:* the first review ignored any second call while stopping,
    so a fatal error during a graceful shutdown could still exit 0.
- **What the deadline does and does not guarantee.** It is a JavaScript
  timer, so it fires only while the event loop runs.
  - Logging can no longer block the loop, and each SQLite call is short,
    so in this app the deadline normally applies.
  - A loop blocked some other way (a runaway synchronous computation, a
    blocking system call) defeats any in-process timer. That case is
    ended from outside: Fly sends SIGKILL a few seconds after its stop
    signal.
  - The earlier wording "shutdown can never hang" was wrong and is
    withdrawn.

### Identity is established first (20 Oct 2026, agent; ADR 0006 unchanged)

**The problem.** The cookie is issued by whichever request first arrives
without one. The lobby used to send several requests at once on a first
visit. Each created a visitor, and the browser kept the last cookie. Two
things followed:
- The page could show one identity as "you" while acting as another.
- With a slow response, something made in the meantime could end up owned
  by an identity the browser had already lost. A friend link did, in
  testing; rooms, membership and saved copies were exposed the same way.

**The fix** (`src/client/state/identity.ts`):
- The lobby and the editor first send one `GET /api/me`, shared by every
  caller on the page.
- They send nothing else that depends on identity, and open no realtime
  stream, until it has answered.
- A failure shows a retry and never a half-started page.
- Across tabs of one browser, that request runs under the Web Lock
  `brick-identity`, so a second tab waits for the first tab's cookie.
  Without Web Locks only the in-page ordering applies.
- The server is unchanged, and remains the only authority on who a request
  is.

### Permissions, consolidated (decided in ADRs 0007 and 0009; restated here for Crit 10)

| Who | May | Enforced at |
|---|---|---|
| Any visitor | Get an anonymous identity from the cookie; browse public rooms and the showcase; create rooms | `identify` (`index.ts`) |
| A visitor with an accepted invitation, the host, or anyone for a public room, while capacity allows | Join a room | `join` / `admitActive` (`rooms.ts`) |
| Only the host | Invite to an invite-only room, and only a friend | `inviteToRoom` (`rooms.ts`), `areFriends` (`index.ts`) |
| A **currently admitted** member | Place, remove, recolour or rotate any real part; propose, withdraw or realize any plan; mark a plan | `runCommand` → `isActiveMember` (`builds.ts`), the mark route |
| Any member, past or present | See an invite-only room and save a snapshot of it | `isMember` |
| The visitor who saved a snapshot, a member of its room, or anyone once published | View, collect or continue it | `canAccessSnapshot` (`snapshots.ts`) |
| Only the visitor who saved it, if its lineage allows publishing | Publish it | `publishSnapshot` (`snapshots.ts`) |

**Why parts aren't locked to their builder.** No member can alter what is
"the other's" alone, because nothing in a room belongs to one member: parts
and plans are shared on purpose, and any admitted member may change any part
(ADR 0009, CLAUDE.md "Never: lock a placed part to its original builder").
The log keeps that sharing accountable: every edit names both the `actor`
and the original `author`.

**What the boundaries are.** Room membership and admission, invitation, and
snapshot ownership.

## Demonstration procedures

### A. Permission verification (scripted)

Run locally by `scripts/log-rehearsal.ts`, or by hand.

1. A creates an invite-only room.
2. B opens its link without an invitation and is refused (`room.preview
   denied no_invitation`).
3. A and B become friends.
4. A invites B, and B accepts and joins.
5. Both build. B proposes a plan, A builds it (`realize-plan` with `author`
   = B), and B's attempt to remove a sole support is refused.

This uses one private room and two identities. As a scripted check it shows
the server and the log behave correctly. It is not evidence that anyone can
find their way unassisted.

### B. The Crit 10 rehearsal (two people)

1. Two classmates get only the deployed URL and use separate Chrome
   profiles (or incognito).
2. The author runs `mise exec -- flyctl logs -a comp4020-final-asuka121380`
   and narrates without touching the app.
3. A quieter view of the same stream:

   ```
   mise exec -- flyctl logs -a comp4020-final-asuka121380 | grep -v '"event":"sse\.\|"event":"room.preview","outcome":"ok"\|"outcome":"unchanged"'
   ```

4. Nothing about what they do is scripted or coached. Their actions and
   any feedback are recorded only as they happened.

### Capturing evidence

- Copy the relevant lines from the terminal.
- Keep the 8-character labels and the outcomes.
- Before committing, check the excerpt against the never-logged list
  (cookies, tokens, passwords, codes, names, labels, IPs). By construction
  none should appear, but the check is still made.
- Say whether an excerpt came from a scripted local run or from people
  using the deployed app.

## Alternatives considered

- **Log everything, then strip known sensitive keys.** The author ruled this
  out: a denylist fails open on the next field nobody thought of.
- **Account display names in the log.** Easier narration, but they would put
  a person's chosen name into Fly's logs. The author kept the pseudonymous
  label.
- **Persist all events in SQLite, or expose `room_activity`.** That would be
  a product feature with its own privacy and retention questions. The
  author left `room_activity` unchanged.
- **Client telemetry for locally refused clicks.** That is noisy, can't be
  trusted, and isn't needed to narrate server decisions.

## Consequences

- **Tests protect the logging, so it outlives the crit:**
  - `spec/server/log-format.test.ts`: the builder, the classifier, frame
    filtering
  - `spec/server/log-metadata.test.ts`: attribution and presence at the
    source
  - `spec/server/log-errors.test.ts` and `spec/server/log-events.test.ts`:
    the real server in its own process with a temporary `DATA_DIR`,
    checking statuses, a two-actor journey, and that no sentinel, cookie
    token, password or label reaches stdout or stderr
- **Two existing behaviours became visible:**
  - **First visit** (as first recorded; *fixed 20 Oct 2026*, see "Identity
    is established first"). A cookie-less first page load sent several
    lobby requests at once, and each created a visitor. The browser kept
    the last cookie, so for a moment early requests disagreed about who
    the page was. The log showed this as several `visitor.new` lines with
    different `route`s within a few milliseconds. Further investigation
    showed it was an ownership bug, not just noise.
  - **Every editor load re-joins.** Each load produces `room.preview ok`,
    `room.join unchanged` and an `sse.open`. The filter above hides that.
- **Response bodies and statuses are unchanged.** The only added header is
  `X-Request-Id`.
- **Fatal-error and identity behaviour are protected by tests:**
  - `spec/server/process-lifecycle.test.ts`
  - `spec/client/identity.test.ts`
  - `scripts/identity-race.ts` (real Chrome, with its own delaying and
    failing proxy)
