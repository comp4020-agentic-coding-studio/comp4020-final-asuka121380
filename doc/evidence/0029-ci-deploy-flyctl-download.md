# Evidence 0029: the CI deploy job's flyctl download, diagnosed and repaired

Collected by the agent on 8 November 2026 (AEDT). The author authorised
the workflow repair, its commit and push to `main`, the rerun and the
resulting deployment, and asked that production data and backups be
preserved.

## 1. The failures

| Run | Commit | Attempt | check job | deploy job |
| --- | --- | --- | --- | --- |
| [42464680743](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/actions/runs/42464680743) | `625f14b` | 1 | failed in `jdx/mise-action` (HTTP 504 downloading `github.com/jdx/mise/releases/download/v2026.11.4/…`) | skipped |
| 42464680743 | `625f14b` | 2 | **passed** (mise restored from the Actions cache) | failed in `setup-flyctl`: HTTP 504 |
| [42466691739](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/actions/runs/42466691739) | `0a483a1` | 1 | passed (cache hit) | failed in `setup-flyctl`: HTTP 504 |
| 42466691739 | `0a483a1` | 2 (failed job only, 09:42Z) | — | failed in `setup-flyctl`: HTTP 504 |

- **Failing action.** `superfly/flyctl-actions/setup-flyctl@ed8efb3…`
  (v1.6), with `version: latest`.
- **What its source does.**
  1. It resolves the version with
     `GET https://api.fly.io/app/flyctl_releases/Linux/x86_64/latest`.
     That answered with
     `https://github.com/superfly/flyctl/releases/download/v0.5.5/flyctl_0.5.5_Linux_x86_64.tar.gz`.
  2. It downloads that URL with `@actions/tool-cache`, retrying twice.
- **The error.** The log's "Unexpected HTTP response: 504 … Waiting N
  seconds before trying again" comes from tool-cache's download retry. So
  the version lookup succeeded and the 504 came from the **GitHub release
  download** (`github.com/<owner>/<repo>/releases/download/…`).
- **Ruled out:**
  - **Permissions and authentication:** the step fails before any token
    is used.
  - **The application:** the check job built the image and passed
    `pnpm check` whenever its own download step got through.
  - **Fly:** the Fly API answered, and no deploy started.

## 2. The cause

Probes from this machine, 09:30–09:45Z:
- **The release-download path flapped.**
  `github.com/…/releases/download/…` returned 504 for flyctl, mise (two
  versions, three file formats) and `cli/cli`, at times even for a repo's
  home page. It returned 206/200 at other times.
- **The API stayed up.** `api.github.com` answered 200 throughout,
  including the same asset through its REST endpoint.
- **GitHub's status page** showed "All Systems Operational", with no
  incident.
- **The runner never got through.** Its attempt at 09:42:44Z got an
  immediate 504 (0.35 s), at a time when the same URL fetched fully from
  here. From Actions, that host failed on **all 4 attempts** today, across
  two tools.

**Conclusion.** An external, intermittent failure of GitHub's web and
release-download tier, worst from GitHub's own runners. It is not a
configuration, permission, authentication or application problem. Simply
rerunning was tried once, after the path had looked healthy from here for
four consecutive checks, and failed. So the job needed to stop depending
on that host.

## 3. The repair: [`b225762`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b225762)

In `.github/workflows/checks.yml`, the deploy job's `setup-flyctl` step is
replaced by a step that:
- **pins flyctl 0.5.5.** This is the version `latest` resolved to that
  day; locally `flyctl` was 0.4.75;
- **downloads the same official asset** (`superfly/flyctl` release asset
  714492250, `flyctl_0.5.5_Linux_x86_64.tar.gz`) through
  `api.github.com/repos/superfly/flyctl/releases/assets/{id}`. It uses the
  job's own read-only `github.token` (`permissions: contents: read`,
  unchanged), with curl retries;
- **checks it** against the release's published SHA-256
  (`2c64e1c7…3d7ef6`), and fails closed on a mismatch;
- **checks the binary** reports `v0.5.5`, then puts it on `PATH`.

**Unchanged:**
- the check job, including mise, the Docker build, `pnpm check`, the
  evidence check and both secret scans;
- `needs: check`, the deploy job's `if` guards, `concurrency`;
- the deploy command (`flyctl deploy --remote-only --ha=false`) and the
  site check;
- `fly.toml`, secrets and repository visibility.

There is no `continue-on-error` and no check is skipped. The command was
tried locally first: the API download, the checksum OK, and the archive
holding `flyctl`.

**Residual risk.** The check job's `jdx/mise-action` downloads mise from
the same GitHub host when its cache misses. It passed here on cache hits
and was left as it is.

## 4. The successful run

**Run:** [42468652819](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/actions/runs/42468652819)
on `b225762`. Conclusion **success**.
- **check:** every step passed.
- **deploy:** every step passed:
  - "Install flyctl (pinned, checksum-verified)" logged
    `flyctl.tar.gz: OK` and `flyctl v0.5.5 linux/amd64`;
  - Deploy;
  - "Verify the deployed site is online".

**Result:** Fly release **v15**, image
`deployment-01M6X8ZWA7RR9CE304YCTV878M`.
- The image label is `GH_SHA=b225762…`, `GH_EVENT_NAME=push`.
- Same machine (`84e1dea2790d38`), `"init": {}`, same volume.
- The application code is `625f14b`'s: `b225762` and `0a483a1` change
  only the workflow and docs. The live `home-JDXbhmNo.js` is the same
  bundle as v14.

## 5. Data across the deployment

The production database was read before (09:39Z, on v14) and after
(09:50Z, on v15), read-only. No database file was replaced, reset or
restored.

| | Before | After |
| --- | --- | --- |
| `user_version` | 5 | 5 |
| visitors / accounts / rooms | 11 / 1 / 9 | 11 / 1 / 9 |
| parts / inventory rows / plans | 6 / 168 / 2 | 6 / 168 / 2 |
| snapshots / snapshot parts / publications | 2 / 3 / 1 | 2 / 3 / 1 |
| hash of every room's parts | `dec19fb3f46173a2` | `dec19fb3f46173a2` |
| hash of every inventory row | `f900c2af916ef7ec` | `f900c2af916ef7ec` |
| hash of every saved version's parts | `2df0fce9dc78fb9b` | `2df0fce9dc78fb9b` |

- **As the verification account, over HTTPS**, the room's parts and
  inventory and the published entry were identical before and after
  (`diff` empty).
- **The pre-reset backup** `/data/backups/app-pre-reset-20261108T071919Z.db`
  still has SHA-256 `24d7ff7c…305fa93`.

## 6. The live site on v15

Checked in Chrome 156, read-only:
- **Homepage:** the table renders.
- **About** (`/readme/`): 200, with the shared header. This is the route
  that crashed v13.
- **An existing room** (the verification account's Beach Houses room)
  opens in the editor: scene `street-01`, 1 part, stock 73, "Saved".
- No page errors in any of them.

Shots: `shots/0029/v15-{home,about,existing-room}-desktop.png`.

## Limitations

- **The cause** is inferred from probes and logs. GitHub published no
  incident, so the exact fault on their side is unknown.
- **Pinning** means flyctl no longer updates by itself. Bumping it is a
  three-value change in the workflow: version, asset id and SHA-256 from
  the release.
- **The commit recording this** is pushed to `main` and so triggers one
  more deploy of unchanged application code. Its result is not given a
  bookkeeping commit of its own.
