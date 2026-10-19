# Evidence 0007: Plan mode and planning demand

Collected by the agent on 19 October 2026 (AEDT), against a local, isolated
server built from the working tree that became
[`c7ad154`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c7ad154)
(`DATA_DIR=/tmp/bc-plan2 PORT=8352`, a fresh throwaway database; never the
persistent dev database, never the deployed app). Nothing was pushed or
deployed. Decision record: ADR 0011.

## Environment

- macOS (Darwin 24.6.0), Node 24.21.0 and pnpm 11.9.0 via `mise exec`.
- Browser checks: Playwright driving the locally installed **Google Chrome**
  (`channel: "chrome"`, `--enable-unsafe-swiftshader`). No Safari or WebKit
  run was made for this change.
- The 390×844 runs are Chrome's touch emulation (`isMobile`, `hasTouch`),
  **not a physical phone**.
- "Two independent browsers" means two Playwright browser contexts: separate
  cookie jars and so separate visitor identities, in one Chrome process on one
  machine. That is not two people on two devices.

## Automated suite

- `APP_URL=http://localhost:8352 pnpm check`: typecheck clean;
  **126/126 tests passed** in 15 files (116 before this change; 10 added:
  4 domain tests in `spec/domain/planned-remaining.test.ts`, 5 HTTP tests in
  the new "planning demand" block of `spec/plans-and-attribution.test.ts`,
  1 SSE test in `spec/realtime.test.ts`).
- `pnpm check:evidence`: clean.

## Browser scripts (all against the same server, final build)

| Script | Result | What it covers for this change |
| --- | --- | --- |
| `scripts/plan-mode.ts` (new) | **37/37** | below |
| `scripts/multiplayer.ts` (updated) | **17/17** | plan now created by a Plan-mode click on the scene, matched against the preview; B's Plan-mode tray shows A's plan as demand |
| `scripts/review-fixes.ts` (updated) | **14/14** | unsupported future roof reached with Higher in Plan mode and proposed through `Propose plan` |
| `scripts/interaction.ts` (updated) | **84/84** | P and the Build/Plan buttons; `p` typed in a text field is not a shortcut; every pre-existing interaction check unchanged |

`scripts/plan-mode.ts` results (`shots/plan-mode/results.json`), two
contexts A and B in one public room, 1440×900:

- Build mode: a scene click places a real part and spends real stock.
- The visible Plan button enters Plan mode (`aria-pressed`, a text tag); B
  stays in Build mode; the held part survives; `Propose instead` no longer
  exists.
- Plan mode: a scene click creates a plan, not a part; the plan equals the
  preview read just before the click (`brick-2x4@8,0,1r0:sky` both); real
  stock unchanged; the mode and the held part persist.
- B's stream received the plan in 2–5 ms across runs.
- Higher reaches an unsupported height (y=4) in Plan mode; the label reads
  "Plan here"; Enter proposes exactly that position.
- P returns to Build mode; Higher can no longer climb into unsupported space
  there; a click then places a real part at the preview, not a plan.
- Plan-mode tray labels on both screens: "Brick 2×4, planned remaining 15;
  17 real left"; Build mode: "Brick 2×4, 17 left".
- Planning beyond stock: 6 Brick 1×2 plans against 4 real gives planned
  remaining −2 on A, badge `◇ -2`, and the same value on B within 7 ms.
- With demand at −2, B still places a real Brick 1×2.
- B (not the proposer) withdraws one of A's plans; A's demand rises by one.
- Realizing a plan: real stock 17 → 16 and planned remaining unchanged
  (15 → 15), the plan gone.
- With real Brick 1×2 stock at 0, `realize-plan` returns `out_of_stock` and
  the plan stays open. This is the deliberate 422 the console check allows.
- Escape puts the part down and leaves Plan mode on; typing `pP` in a text
  field changes nothing.
- Phone emulation: the Plan button is on screen and ≥40 px tall; first tap
  previews, second tap on the preview proposes exactly the shown plan; the
  dock fits 390 px.

## Dock height (agent's own regression check)

The first layout made the dock taller in both modes and covered the front of
the plot at 1280×720. `scripts/review-fixes.ts` caught it: a click it had
always made landed on the dock. A HEAD build (`9625f82`) on a separate
throwaway server measured the Build-mode dock top at y=444 at 1280×720. The
final layout matches that exactly in Build mode (dock 264.5 px tall).
Plan mode is one row taller (307.7 px), for the counts line
(`shots/plan-mode/dock-build-1280x720.png`, `dock-plan-1280x720.png`).

## Screenshots looked at

`a-plan-mode-unsupported.png`, `a-planned-negative.png`,
`mobile-plan-preview.png`, `mobile-plan-proposed.png`, and the two dock
captures were viewed, not only counted.

## Not verified

- No physical phone, no Safari/WebKit, no deployed instance.
- No human playtest: whether two people actually use Plan mode to negotiate a
  design is unobserved.

## Live deployment (added 19 Oct 2026, after the author's "push" and "deploy")

- `git push origin main` moved `origin/main` from `9625f82` to
  [`e0c3a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e0c3a3e),
  with no force push. Before pushing, a scan of the diff found no token,
  private-key, cookie or password patterns, and showed no change to
  `fly.toml`, the `Dockerfile` or `spec/invariants.test.ts`.
- The repository is public, so the push itself triggered the `checks`
  workflow (run 39195594737). Its `check` job (the spec against the built
  image) and its `deploy` job both succeeded, producing Fly release **v9**.
  No manual `flyctl deploy` was run.
- Live checks on https://comp4020-final-asuka121380.fly.dev/: `/`, `/build/`
  and `/readme/` returned 200. The served editor bundle contains
  "Plan mode" and "Propose plan", and no "Propose instead".
- `node scripts/plan-mode.ts https://comp4020-final-asuka121380.fly.dev`:
  **37/37**, same environment as above (local Chrome, two contexts, emulated
  phone). The created plan matched the preview; B received it in 4 ms;
  planned remaining reached −2 with real stock at 4; realizing spent real
  stock once (17 → 16) with planned remaining unchanged.
- That run left three test rooms ("Plan mode check …" and two unnamed) in
  the production database, as earlier browser scripts have. The full HTTP
  suite was not rerun against production; CI ran it against the deployed
  image.
