# Evidence 0010: server logs that say who did what

The agent collected this on 20 October 2026 (AEDT), against isolated local
servers built from the working tree. The tree became these commits:
- [`eddc87d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/eddc87d)
- [`cd1b5fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cd1b5fe)
- [`c365c02`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c365c02)

Each server ran with a fresh temporary `DATA_DIR`. None of this used the
persistent dev database, the deployed app or any real user's data, and
nothing was pushed or deployed. Decision record: ADR 0013.

## What is assessed, and what is our design

- **What Crit 10 asks (course):**
  - distinguish users
  - enforce permissions on the server and write them down
  - log who did what on the server, and keep logging after the crit
  - two classmates use the URL alone while the author narrates from the
    logs
- **Our own choice:** the event coverage below (rooms, construction, plans,
  snapshots, identity, invitations, friends, SSE). It is a proportionate
  design for this app, not a checklist from the course.

## Kinds of test, kept separate

| Kind | What ran | Result |
|---|---|---|
| Unit | `spec/server/log-format.test.ts` (12): allowlist, validators, hashing, error classification, stack frames that carry text | 12/12 passed |
| Unit, in-memory DB | `spec/server/log-metadata.test.ts` (7): builder and proposer read from state and captured before removal or realization; duplicate revision; leave and sweep results; already-admitted join | 7/7 passed |
| HTTP, real server in its own process | `spec/server/log-errors.test.ts` (5) and `spec/server/log-events.test.ts` (11): two cookie jars; stdout and stderr captured; temporary `DATA_DIR`; the process is killed and the directory removed afterwards | 16/16 passed |
| Full suite | `APP_URL=http://localhost:8396 pnpm check`: typecheck plus all projects | **196/196 passed**, 22 files (161 before) |
| Browser automation (Playwright, local Chrome) | `scripts/log-rehearsal.ts` (Procedure A, 13 checks), plus the existing `interaction` 85, `multiplayer` 17, `plan-mode` 42, `review-fixes` 15, `invites` 7, `session-revocation` 5, `inactive-member` 6 | all passed; server stderr empty (0 bytes) |
| Real people | none | **not done**: Procedure B is for the author and two classmates |

`pnpm check:evidence` was clean, and so was `pnpm build`.

**Regression proof for the error fix.** I ran `log-errors.test.ts` against
the previous `index.ts` (its start line renamed so the harness could see it
start). Three tests failed.

On the previous server, running with `NODE_ENV=production`, a malformed body
`x=1` sent to `/api/account/sign-in` printed this to stderr:

```
SyntaxError: Unexpected token 'x', "x=1" is not valid JSON
```

That is the start of the request body. On the new server the same request
returns the same response: 400, the same HTML page and the same security
headers, plus an added `X-Request-Id` header. Its stderr is 0 bytes, and
stdout gets one line:

```
{"t":"…","event":"http.refused","outcome":"invalid","status":400,"method":"POST","route":"/api/*","kind":"malformed_json","req":"…"}
```

## Actual capture: a scripted local run of Procedure A

These are real server lines from `scripts/log-rehearsal.ts` against
`http://localhost:8395`. They are a scripted run in two Playwright browser
contexts, **not two people**.

- Full excerpt: [`logs/0010-rehearsal-procedure-a.jsonl`](logs/0010-rehearsal-procedure-a.jsonl), 33 lines.
- Checks: [`logs/0010-rehearsal-results.json`](logs/0010-rehearsal-results.json).

I checked the excerpt against the never-logged list. It contains no cookie,
token, password, room label or IP. The only text matching "cookie" is the
reason value `no_cookie`.

Below are the same lines through the narration filter in ADR 0013, which
hides SSE, successful previews and no-ops. The `t` and `req` fields are
dropped for width.

```
visitor.new           changed  no_cookie        actor 84160485   (B arrives)
visitor.new           changed  no_cookie        actor ca802602   (A arrives)
room.create           changed  invite_only      actor ca802602
room.preview          denied   no_invitation    actor 84160485   (B tries the link)
friend.link           changed                   actor ca802602
friend.link_open      ok                        actor 84160485   peer ca802602
friend.response       changed  accepted         actor 84160485   peer ca802602
room.invite           changed                   actor ca802602   peer 84160485
room.invite_response  changed  accepted         actor 84160485
command place         changed  1,0,2,0          actor ca802602
command propose-plan  changed  1,3,3,0          actor 84160485
command realize-plan  changed  1,3,3,0          actor ca802602   author 84160485
command remove        rejected would_unsupport  actor 84160485   author ca802602
```

**What this proves.** The server's own log separates two server-resolved
identities, and shows each of these:
- the invite-only refusal at the door
- the friendship and the invitation that changed it
- who built
- who proposed
- who built whose plan
- a removal the server refused

**What it doesn't prove.** It says nothing about whether two classmates,
given only the URL, would find these actions or understand them.

**Hidden by the filter.** The unfiltered excerpt also shows the editor's
routine `room.preview ok`, `room.join unchanged`, and `sse.open`/`sse.close`
on every page load.

**A side effect visible in the excerpt.** In this run each browser shows one
`visitor.new`. That is because the script reloads each page before reading
its identity, and only lines for the two surviving identities were kept.

## Behaviour the log made visible (not changed)

**On a first visit, parallel requests each create a visitor.** In the
browser-driven runs a cookie-less first page load sent `/api/me`,
`/api/my/rooms`, `/api/my/invites` and `/api/friends` together. They
produced four `visitor.new` lines within a few milliseconds, each with
its own `route`. In one `multiplayer.ts` run, all four fell between
02:37:05.326 and 02:37:05.329 UTC.

The browser keeps whichever cookie arrives last. That was `/api/friends`,
not `/api/me`, in one run, so the identity a script read too early differed
from the one the page went on to use.

The behaviour predates this change, and identity establishment was out of
scope. It is recorded as an open issue for the author. For narration, the
extra identities never act again.

## Representative lines from the HTTP test

These lines are from `log-events.test.ts`, at the shapes asserted there:
- B's direct command while not admitted logs `"outcome":"denied","reason":"not_admitted"`, while the public response stays 403 `bad_request`.
- The same command id sent twice logs `changed` and then `duplicate`, with the same `cmd` and the first `rev`.
- B recolours A's brick, and then A edits it from a stale view. This logs `changed` with `actor` B and `author` A, then `conflict part_conflict` with `actor` A.
- A non-UUID command id is logged as `h-<16 hex>`, both times the same, and never as its text.
- A wrong sign-in logs `denied bad_credentials` with no username.
- A sign-out logs `account.sign_out changed`, then a new `visitor.new` for the fresh anonymous cookie.
- An SSE disconnect logs `sse.close ok client_gone` with `open: 0`, and no `room.leave`.

The full browser run also produced:
- `sse.close revoked` (3)
- `presence.end signed_out` and `session_replaced` (1 each)
- `presence.end expired` (93, from the sweep between scripts)

## Limitations and manual checks still needed

- **Procedure B has not happened.** The author still needs to run the
  two-classmate rehearsal against the deployed app while watching
  `flyctl logs`, and record only what actually happened.
- **The deployed app runs the old logging** until the author authorizes a
  push. CI deploys on push.
- **Fly's log retention is short and not under our control.** Excerpts
  worth keeping have to be saved as evidence.
- **The 8-character label is not guaranteed unique.** The full request id
  is the reliable key.
- **Browser runs used Playwright with local Chrome on one machine.** No
  Safari, no physical device, and no network between the two "people".

## Follow-up, 20 October 2026 (later the same day)

The text above is kept exactly as observed. Corrections and later results:

- **The first-visit behaviour was an ownership bug, not only log noise.**
  "For narration, the extra identities never act again" understated it. A
  slow first response could leave something the player had just made (in
  testing, a friend link) owned by an identity the browser then lost.
  - Fixed in
    [`a04c99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a04c99e).
  - Details and tests are in
    [evidence 0011](0011-identity-ordering-and-fatal-errors.md).
- **Scope of "who did what".** The
  [`cd1b5fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cd1b5fe)
  commit message and the agent's handoff said every server-observed action
  writes a line. What is covered is ADR
  0013's table of defined significant events. Several things are
  intentionally not all logged:
  - routine reads such as lobby lists, snapshot views and showcase reads
  - polling
  - heartbeats
  - pointer and preview movement
  - clicks the editor refuses locally before sending anything
- **Crash lines could be lost on a backed-up stdout pipe.** That is fixed
  in
  [`b9ec1ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b9ec1ed)
  (evidence 0011, section 2).
- **Rehearsal checks under the new client.** `log-rehearsal.ts` still
  passes 13/13 with the identity fix. Its excerpt now begins with one
  `visitor.new` per browser, from `/api/me`.
