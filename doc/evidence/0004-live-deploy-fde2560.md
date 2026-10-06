# Evidence 0004: deployment of `fde2560` to Fly

Collected by the agent on 6 October 2026 (AEDT), after the author explicitly
authorised pushing and deploying the batch that ends at `fde2560`.

## What was published

- Branch `main`, HEAD
  [`fde2560`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/fde2560).
  The working tree was clean.
- Before the push, the branch was 8 commits ahead of `origin/main`
  ([`a9b4c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a9b4c3d))
  and 0 behind: `cea2752`, `a4ed156`, `7c59819`, `3875ab0`, `d992b5f`,
  `493a556`, `7afcb78` and `fde2560`. This matched the previous report.
- Pre-push scan of the batch's diff:
  - No added line matched the secret patterns checked: Fly, Anthropic and
    GitHub token prefixes, private keys, `password =`, `set-cookie`, and
    visitor cookies.
  - No tracked file matched `mise.local*`, `.env`, `*.pdf`, `concept`,
    `11035`, `*.db` or `data/`.
  - `fly.toml` and the `Dockerfile` were unchanged.
- `git push origin main` moved `origin/main` from `a9b4c3d` to `fde2560`.
  There was no force push.
- The repository is private, so the CI deploy job (`checks.yml`, conditional
  on a public repo) did not run. The deploy was run by hand with the same
  command:
  `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-asuka121380`.
  - Ran from 09:00:35Z to 09:01:39Z.
  - Release **v4** (previously v3), on machine `84e1dea2790d38` in `syd`.
  - flyctl printed its listen-address warning during the deploy. Its machine
    health check then passed, and the app logged
    `{"event":"listening","port":8080,"data":"/data"}` at 09:01:29Z.

## Live checks (https://comp4020-final-asuka121380.fly.dev/)

- **Routes:** `/` returned 200 and `/readme/` returned 200.
- **Bundle:** the served bundle `assets/index-fVGH5WfC.js` has the same
  content hash as the local `pnpm build` of `fde2560`.
- **`pnpm check` against the live URL, 20:02 AEDT:** typecheck clean, 42/42
  tests passed, including the persistence tests over HTTP.
- **`scripts/interaction.ts` against the live URL, 20:02–20:03 AEDT:**
  - 71/71 passed: desktop mouse 48/48, keyboard only 13/13, emulated touch
    10/10. No console errors.
  - A fresh test visitor started with an empty plot, placed 8 parts that the
    server saved, and after a reload had the same build and kit.
  - The results are in `shots/live-fde2560/results.json`, with three of the
    run's screenshots.
  - The new interface (contextual dock, thumbnails, Top and Reset view) is
    visible in `shots/live-fde2560/desktop-holding.png`.

## Existing saved work

These were read-only queries over `flyctl ssh console`, running Node's
`node:sqlite` with `readOnly: true`. Only counts and a hash were printed.

| When | builds | parts | `sha256(parts)`, first 16 hex characters |
| --- | --- | --- | --- |
| before the deploy | 11, all kit version 1 | 25 | `643c2842c41a4c37` |
| after the deploy, before any test | 11, all version 1 | 25 | `643c2842c41a4c37` |
| after the live tests | 11 old builds still at version 1, plus 12 new test builds at version 2 | 25 in the old builds | `643c2842c41a4c37` (old builds only) |

- The deploy and the tests left every existing build's parts unchanged.
- Each existing build gets the additive version 2 stock (window, fence,
  planter) the next time its owner loads it (ADR 0003). Its placed parts are
  not touched.
- The 12 new builds belong to test visitors created by `pnpm check` and the
  interaction script.

## Not checked

- Touch on a physical device. The touch run was Chrome emulation.
- Safari.
- The author's own build, as opposed to its stored parts. It was not opened,
  so as not to alter it.
