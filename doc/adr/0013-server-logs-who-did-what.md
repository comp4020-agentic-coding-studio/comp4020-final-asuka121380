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
- **Logging never fails a request.** A failing write is swallowed. Mutation
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
| `visitor.new` | `reason` (no_cookie, unknown_session), `route` | A first page load creates one per parallel request (see Consequences) |
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
| `server.start`, `background.error`, `process.crash` | `kind` | |

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
- **Two existing behaviours became visible, and neither was changed here:**
  - **First visit.** A cookie-less first page load sends several lobby
    requests at once, and each creates a visitor. The browser keeps the
    last cookie, so for a moment early requests can disagree about who the
    page is. The log shows these as several `visitor.new` lines with
    different `route`s within a few milliseconds; only one of them goes on
    to act.
  - **Every editor load re-joins.** Each load produces `room.preview ok`,
    `room.join unchanged` and an `sse.open`. The filter above hides that.
- **Response bodies and statuses are unchanged.** The only added header is
  `X-Request-Id`.
