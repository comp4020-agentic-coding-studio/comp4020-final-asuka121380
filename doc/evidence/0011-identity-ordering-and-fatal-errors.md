# Evidence 0011: first-visit identity ordering, and fatal-error handling

Collected by the agent on 20 October 2026 (AEDT).
- The servers were local and isolated, each with a fresh temporary
  `DATA_DIR`, built from the working tree that became
  [`a04c99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a04c99e),
  [`498bdfe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/498bdfe)
  and
  [`b9ec1ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b9ec1ed).
- No production data was touched, and nothing was pushed or deployed.
- Decision record: ADR 0013, sections "Identity is established first" and
  "Fatal and background errors, and stopping".

## 1. First-visit identity race

### How it was found

Evidence 0010 recorded that a first page load produced several `visitor.new`
lines at once. The author asked whether this was only log noise, or whether
responses, rooms, commands or streams could belong to different identities.

### Traced paths (code)

- **Homepage `/`:** asks only `/api/summary`, which creates no visitor. It
  asks `/api/me` only when a cookie already exists. No race.
- **Lobby `/build/`, all views:** mounted components fetched `/api/me`,
  `/api/my/rooms`, `/api/my/invites`, `/api/friends` and `/api/rooms`
  together. On a first visit none carried a cookie, and every one except
  `/api/rooms` called `identify()`, so each made a visitor.
- **Editor, direct link `/build/room/:id`:** before confirming, the
  pre-join gate sends only `/api/rooms/:id/preview`. So on a first visit
  that single request made the visitor, and the race could not happen
  there.
- **Editor after confirming, and the editor opened from the lobby:**
  `store.start()` sent `/api/me` without waiting, alongside `load()`'s join
  and read. A cookie always existed by then, so no visitor was created.
  There was still no ordering guarantee.

### Confirmed in Chrome (Playwright, local Chrome; isolated server)

**Plain first visit to `/build/`.**
- Five requests went out without a cookie, and four of them set one.
- In one run the browser kept the cookie from `/api/friends`, while
  `/api/me` had answered with a different visitor.
- So the lobby's "you" (`selfId`) was a different identity from the one
  every later request ran as.

**A slow first response.** A local proxy held `/api/friends` back 2.5 s,
as a cold start might.
- A friend link created in the lobby meanwhile was owned by `8fe7b6c4`.
- When the delayed response arrived, the browser became `6a8b5580`.
- The player's own link then belonged to an identity this browser no
  longer held.
- The same window applies to a room created, a membership taken or a copy
  saved in that time. Those were reasoned from the same mechanism, not
  each reproduced.

**Three tabs, same profile, opened at once.** Four visitors were created
(`visitor.new` ×4).

**Not reproduced.** A direct room link on a first visit, because the
preview request is alone.

**Not tested.** Other browsers' cookie ordering.

### The fix

ADR 0013, "Identity is established first":
- `ensureIdentity()` sends one shared `GET /api/me`, under the Web Lock
  `brick-identity`.
- `IdentityGate` wraps the lobby and the editor (not `?local`).
- `store.start()` waits for the identity before `load()` and SSE.
- `resetIdentity()` runs after sign-in, sign-out and another tab's change.
- A failure shows "Couldn't start your session" with Try again.
- The server is unchanged.

### Results

**`spec/client/identity.test.ts`: 5/5.**
- Concurrent callers share one request.
- A failure isn't cached, and the next call retries.
- A network failure rejects; it doesn't stay pending.
- Reset re-asks the server.
- The Web Lock is used when available.

**`scripts/identity-race.ts`: 18/18** in real Chrome, with its own proxy in
front of an isolated server. The results are in
[`logs/0011-identity-race-results.json`](logs/0011-identity-race-results.json).

| Scenario | Result |
|---|---|
| First visit | 1 visitor, created by `/api/me`; only `/api/me` goes uncookied |
| A response held back 2.5 s | identity unchanged; the friend link owned by the identity the browser keeps; 1 visitor |
| Same profile, 3 tabs at once | 1 shared identity, 1 visitor (Web Locks present) |
| 2 separate profiles at once | 2 distinct identities |
| Direct room link, first visit | 1 visitor, created before the preview. The editor's `selfId`, its join, SSE stream and a command are all the same identity |
| Refresh with an existing identity | same visitor, no new one |
| `/api/me` fails once | retry screen, no lobby, nothing identity-dependent sent; Try again opens the lobby with 1 visitor |
| Register, sign out, sign in | the sign-out issues one fresh anonymous identity; sign-in returns to the account's identity; the lobby shows it |

**Control.** The same script against the previous client:
- 8 checks failed: 4 visitors per first visit; 5 uncookied requests; the
  identity switched (`791ad27c` → `1eb535cd`); the link was owned by the
  abandoned identity; 4 visitors across 3 tabs; the direct link's first
  visitor came from the preview.
- It then timed out at the missing retry screen.
- The direct-link "same identity" checks passed on the old client too,
  which matches the code trace above.

### Cross-tab: what is and isn't covered

**Covered:** tabs of **one browser profile** that share a cookie jar. The
Web Lock serialises their identity requests, so the second tab's request
carries the first tab's cookie. Checked with 3 tabs in one Chromium
context.

**Not covered:**
- Browsers without Web Locks. Chrome, Edge and Firefox have them, as does
  Safari 15.4+. In other browsers only the in-page ordering applies.
- WebKit and Firefox runs. They weren't made for this change.
- Separate profiles or incognito windows are separate people by design.
  They stayed distinct, and that is correct.

**Recovery switching identity** (redeeming a code) reloads its own tab but
doesn't notify other tabs. That predates this change and is unchanged. The
server still refuses anything a stale tab is no longer allowed to do.

## 2. Fatal-error and background-error handling

**Method.** The real server ran in its own process. Fatal errors were
triggered by test-only `node --import` preloads, written by the test, which
throw, reject, flood stdout, or make node:sqlite fail. The server itself
carries no test hook.

| Behaviour | Before (`8c090e0`) | After (`b9ec1ed`) |
|---|---|---|
| Request errors (malformed, too large, 500) | Safe line, statuses kept (evidence 0010) | Unchanged |
| Uncaught exception, unhandled rejection | Safe line, exit 1 at once, nothing served after | Same, through one bounded `shutdown()` with a `server.stop` line |
| Crash line with stdout as a backed-up pipe | **Lost.** 287 of 20,000 preceding lines and no `process.crash` arrived; exit status 1 | Arrives; log lines are written synchronously |
| SIGTERM with SSE streams open | Exit 0 at once; database closed while connections were open; no stop line | Stops accepting, ends streams, closes the database, exits 0; 3 s hard deadline; one `server.stop` |
| Background timer failure | Logged, kept serving | Logged as `recoverable`, keeps serving; **fatal** if it leaves the database mid-transaction |
| Raw message, stack, sentinel in stdout or stderr | none | none; stderr empty in every case |

**`spec/server/process-lifecycle.test.ts`: 8/8.**
- An uncaught exception exits 1 within 5 s with a stream open, logs only
  `TypeError`, and refuses connections afterwards.
- An unhandled rejection exits 1.
- The crash line survives a backed-up pipe.
- A failing sweep is recoverable, and `/api/rooms` still answers.
- A failing rollback is fatal and exits 1.
- SIGTERM with two streams open exits 0 in under 3.5 s.
- A second signal starts no second shutdown.
- A part committed before SIGTERM is there for the next process on the
  same data directory.

**Control.** Against the previous `index.ts` and `log.ts`, 4 of the first 6
tests failed: the lost crash line, and the missing `server.stop` line.

## 3. Whole-suite and regression runs (after all three commits)

- `pnpm build`: passed.
- `APP_URL=… pnpm check`: **209/209**, 24 files.
- `pnpm check:evidence`: clean.

Browser scripts, each against its own fresh isolated server (the in-memory
per-IP auth limiter is restarted between scripts), all with server stderr
0 bytes:

| Script | Result |
|---|---|
| `identity-race` | 18/18 |
| `log-rehearsal` | 13/13 |
| `interaction` | 85/85 |
| `multiplayer` | 17/17 |
| `plan-mode` | 42/42 |
| `plan-geometry` | 61/61 |
| `review-fixes` | 15/15 (×2) |
| `invites` | 7/7 |
| `session-revocation` | 5/5 |
| `inactive-member` | 6/6 |
| `accounts` | 13/13 |
| `pre-join` | 13/13 |
| `guest-preservation` | 12/12 |
| `showcase` | 16/16 (×2) |

**What went wrong along the way, and why:**
- **Two collection checks needed a new wait.** `review-fixes` and
  `showcase` counted collection rows immediately after navigation. That
  relied on the old race, since the list now renders after identity is
  established. My first wait was an invalid selector that failed
  silently; `498bdfe` corrects it.
- **The auth rate limit, not a regression.** An earlier batch run on one
  shared server showed `guest-preservation` failing at sign-in. The new
  log lines showed why: `account.register limited` ×5 and
  `account.sign_in limited` ×6. The per-IP limit of 10 per minute was
  doing its job across back-to-back account scripts. On a fresh server
  `guest-preservation` passed 12/12.

## Evidence boundaries

- Automated Playwright contexts on one machine are not people. Separate
  "profiles" here are separate browser contexts.
- Nothing ran against the deployed site. The deployed app runs neither this
  fix nor the ADR 0013 logging until the author authorizes a push.
- The two-classmate rehearsal (Procedure B) has not happened.
