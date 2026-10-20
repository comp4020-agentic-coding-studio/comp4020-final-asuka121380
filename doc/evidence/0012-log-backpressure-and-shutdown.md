# Evidence 0012: logging under backpressure, and shutdown exit status

Collected by the agent on 20 October 2026 (AEDT), against isolated local
servers. Each server had a fresh temporary `DATA_DIR` and its own child
process. The tree became
[`bcd0b2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bcd0b2c).
No production data was touched, and nothing was pushed or deployed.
Decision record: ADR 0013, "Output under backpressure" and "Fatal and
background errors, and stopping".

## Review findings, checked against the code (`b9ec1ed`)

| Finding | Verified | Notes |
|---|---|---|
| Every line goes through `writeLineSync` | yes | `log.ts`, the `sink` |
| EAGAIN retried in a synchronous loop for about 2 s per line | yes, in code | Here it didn't even apply: see below |
| `emit` swallows failures, so delivery isn't guaranteed | yes | Kept on purpose; now stated plainly |
| `server.stop` emitted before the deadline timer is armed | yes | |
| A blocked event loop stops a timer firing | yes | |
| Once `stopping`, a later fatal error returns early, so the exit status could stay 0 | yes | `server.close`'s callback exited with the original 0 |

**The first finding was worse than the review said.** I started the server
with its stdout piped to a parent that never read it, then sent requests.

- After about 80 KB of log output (the kernel pipe plus the reader's
  buffer), the server **stopped answering completely**. A request with a
  3 s timeout got nothing.
- The process sat at 0% CPU in state S, blocked in the kernel. On this
  machine stdout's pipe fd is in blocking mode, so `fs.writeSync` never
  returned EAGAIN; it just waited.
- SIGTERM couldn't be handled, because its handler needs the same event
  loop. Only SIGKILL ended it.

In production that needs a stalled log shipper, but it is a real
availability defect, introduced by `b9ec1ed`.

## What changed

See ADR 0013 for the full design.

- **Logging:** a bounded asynchronous queue in front of stdout.
  - 1,000 lines or 1 MiB.
  - New lines are dropped when it is full.
  - One `log.dropped` line with `lost: N` is written in the gap's place.
  - Output that errors or closes stops for good.
  - Flushing before exit is best effort, for at most 1 s.
- **Shutdown:**
  - The deadline timer is armed first.
  - The exit status only rises, and `process.exitCode` follows it.
  - A fatal error during a graceful shutdown escalates the status to 1 and
    is logged once.
  - Cleanup waits one loop turn before the final flush.

## Results

**Repro, re-run after the change.** Stdout was never read; 3,000 requests
were sent in batches of 20.
- All 3,000 were answered: p50 0 ms, p99 1 ms, max 69 ms.
- Server stderr was empty.
- Before the change the same run wedged the server, as described above.

**Tests and what each proves:**

| Test | Kind | What it shows | Result |
|---|---|---|---|
| `spec/server/log-queue.test.ts` (9) | unit, fake stream | Order kept; waits for `'drain'`; line and byte bounds; the `log.dropped` line sits exactly in the gap; two episodes are reported separately; error, close and a throwing `write()` all stop output without throwing; a bounded flush returns `false` on time | 9/9 |
| `spec/server/log-backpressure.test.ts` (7) | real child process, real pipe | See below | 7/7 |
| `spec/server/process-lifecycle.test.ts` (8) | real child process | Fatal exits 1 with a stream open; the crash line arrives when stdout is congested but read; recoverable versus fatal background errors; SIGTERM bounded; data kept across restart | 8/8 |

`log-backpressure.test.ts` covers:
- 3,000 requests all answered correctly with stdout unread, and a room
  created meanwhile.
- After reading resumes, the kept lines arrive in time order, and the loss
  is reported. The room line logged while the queue was full is among the
  lost, which is the policy.
- A room created afterwards is logged after the report.
- With stdout closed (EPIPE), API results stay correct, the server keeps
  serving, and SIGTERM exits 0.
- SIGTERM with stdout unread, lines pending and an SSE stream open exits 0
  in under 4.5 s.
- A fatal error during a graceful shutdown, on the next tick or as a
  same-tick microtask, exits 1, logging `process.crash` and
  `server.stop … escalated_uncaught_exception`.
- A signal after a fatal error leaves the exit status at 1.
- Five signals give one cleanup and exit 0.
- No sentinel reaches stdout or stderr.

**Control.** `log-backpressure.test.ts` against the previous `index.ts` and
`log.ts`: 4 of 7 failed.
- Requests stalled with stdout unread: batches hit the 5 s fetch timeout.
- There was no exit within the deadline with stdout unread.
- A fatal error during shutdown exited 0, in both timings.

The 3 that passed (EPIPE, fatal then signal, repeated signals) were already
correct.

**Test adjustment.** Output is now asynchronous, so a line can reach the
test a moment after its HTTP response. `log-events.test.ts` now waits for
each line rather than reading at once. Before that change, 2 of its checks
failed under full-suite load.

**Whole suite.**
- `pnpm build` passed; `pnpm check:evidence` clean.
- `APP_URL=… pnpm check`: **225/225, three runs in a row**, each on a fresh
  server a minute apart; server stderr 0 bytes each time.

**Browser regressions** (Playwright with local Chrome), each on a fresh
server:

| Script | Result |
|---|---|
| `log-rehearsal` | 13/13 |
| `identity-race` | 18/18 |
| `session-revocation` | 5/5 |
| `multiplayer` | 17/17 |
| `interaction` | 85/85 |
| `inactive-member` | 6/6 |

Each server stopped on SIGTERM with a final `server.stop ok sigterm` line,
and its stderr was 0 bytes.

## What these tests do not show

- **Not proof against every blocked event loop.** The external test
  timeouts detect hangs in the cases tested. A loop blocked by something
  other than logging would still defeat the in-process deadline; Fly's
  SIGKILL is the backstop.
- **One platform only.** Checked on macOS (Darwin 24.6.0) only, where the
  stdout pipe was blocking. Linux on Fly was not tested; the queue doesn't
  depend on the fd mode.
- **Real log loss, as designed.** Under sustained overload the server
  drops log lines. The `log.dropped` count says how many, but not which.
- **Not run against the deployed app**, and no two-person test was done.

## Live deployment, 20 October 2026 (added after the push)

The author said "push and deploy".
- `git push origin main` moved `f325e2e` → `6b1fda1` (14 commits: ADR 0013
  logging, the identity-ordering fix, the fatal-error and backpressure
  corrections).
- That triggered the `checks` workflow, run 39370218138:
  - `check` succeeded, 04:33:38–04:34:56 UTC
  - `deploy` succeeded, 04:34:58–04:36:18 UTC
- Fly release **v11** (`flyctl releases`). No manual deploy was needed.

Checked on the live app, read-only apart from one probe:
- `/`, `/build/`, `/readme/`, `/api/rooms` and `/api/showcase` answered
  200.
- Responses carry `X-Request-Id`.
- The lobby serves the same bundle as the local build
  (`lobby-gjpj5ZEZ.js`). Its shared chunk contains the identity gate
  ("Couldn't start your session") and the Web Lock name `brick-identity`.
- `flyctl logs` shows the new format: `server.start` at 04:36:15Z, and one
  `visitor.new` (reason `no_cookie`, route `/api/me`) for the agent's
  single anonymous `/api/me` probe. That probe created one anonymous
  visitor row on production; nothing else was written.

Not done on the live app: browser runs, the two-classmate rehearsal, and
any test of backpressure or shutdown.
