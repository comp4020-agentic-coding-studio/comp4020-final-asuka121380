# Evidence 0006: deployment of `c10dfcd` to Fly

Collected by the agent on 6 October 2026 (AEDT). The author explicitly
authorised pushing and deploying the revision recorded in evidence 0005
("push and deploy it").

## What was published

- Branch `main`, HEAD
  [`c10dfcd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c10dfcd).
  The working tree was clean.
- Before the push, the branch was 11 commits ahead of `origin/main`
  ([`fde2560`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/fde2560))
  and 0 behind: `bbbcdbc`, `24a8853`, `cbe7d30`, `40e2eb4`, `d6746df`,
  `57549ea`, `c1de11b`, `b76a01f`, `b184781`, `b7e081c` and `c10dfcd`.
- Pre-push scan of the diff between `fde2560` and `c10dfcd`:
  - No added line matched the secret patterns checked: Fly, Anthropic and
    GitHub token prefixes, private keys, `password =`, `set-cookie:`, and
    visitor cookie values. The only hit was evidence 0004's own sentence
    that lists those patterns.
  - No tracked file matched `mise.local*`, `.env`, `*.pdf`, `concept`,
    `11035`, `*.db` or `data/`.
  - `fly.toml`, the `Dockerfile` and `spec/invariants.test.ts` were
    unchanged.
  - The binary files added are the project's own screenshots under
    `doc/evidence/shots/` and the self-rendered scene cover.
- `git push origin main` moved `origin/main` from `fde2560` to `c10dfcd`.
  There was no force push.
- The repository is still private, so the CI deploy job did not run. The
  deploy was run by hand with the same command:
  `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-asuka121380`.
  - Ran from 10:44:21Z to 10:45:26Z.
  - Release **v5** (previously v4), on machine `84e1dea2790d38`.
  - flyctl printed its listen-address warning again, as in evidence 0004.
    The machine's smoke and health checks then passed.

## Live checks (https://comp4020-final-asuka121380.fly.dev/)

- **Routes and headers** (`curl`, 21:45 AEDT):

  | Path | Status | Cache-Control |
  | --- | --- | --- |
  | `/` | 200 | `no-cache` |
  | `/build/` | 200 | `no-cache` |
  | `/build` | 301 (to `/build/`) | |
  | `/readme/` | 200 | |
  | `/scenes/beach-houses.webp` | 200, `image/webp` | `no-cache` |
  | `/api/summary` | 200 | `no-store` |

- **Bundle:** the live `/build/` page names `assets/build-D80lsz2-.js`, the
  same content-hashed file name as the local `pnpm build` of this code.
- **`pnpm check` against the live URL, 21:45 AEDT:** 49/49 passed (6 test
  files), including the persistence tests over HTTP.
- **`scripts/interaction.ts` against the live URL, 21:46–21:47 AEDT:**
  81/81 passed:
  - desktop mouse 48/48
  - keyboard only 13/13
  - emulated touch at 390×844 10/10
  - routes 10/10: the homepage loads no editor code and sets no cookie,
    home → build → home → build keeps the build and stock, and reload,
    `/build` and `/readme/` work
  - no console errors
- **`scripts/placement.ts` in Chrome against the live URL, 21:47 AEDT:**
  31/31 passed:
  - desktop heights 15/15
  - desktop directions 11/11
  - emulated touch 5/5
- Results and four of the run's screenshots are in
  [`shots/live-c10dfcd/`](shots/live-c10dfcd/). The agent viewed
  `desktop-holding.png`, which matches the local screenshot from evidence
  0005.
- These runs created fresh test visitors, each with a new build, in the
  live database. That is the same pattern as evidence 0004.

## Existing saved work: not checked this time

- Evidence 0004 counted and hashed the live builds over `flyctl ssh
  console`. This time the agent's attempt at the same read-only query was
  refused by the session's permission policy, so no database snapshot was
  taken before or after the deploy.
- What can be said without it:
  - This revision contains no migration.
  - The scene keeps its id, `street-01`, and kit version 2 (ADR 0004).
  - The server's database code (`src/server/db.ts`) is unchanged between
    `fde2560` and `c10dfcd`.
- That is reasoning from the code, not an observation of the live data.
- The author's own build was not opened, so as not to alter it.

## Not checked

- The live database's existing builds, as above.
- Safari, and any physical device. The touch runs were emulated in Chrome.
- `scripts/placement.ts` in Playwright's WebKit against the live URL. It
  ran in WebKit only locally (evidence 0005).
