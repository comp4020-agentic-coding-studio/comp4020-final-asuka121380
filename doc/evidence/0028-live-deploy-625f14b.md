# Evidence 0028: production reset and deployment of `625f14b`

Collected by the agent on 8 November 2026 (AEDT).

**Authorisation (the author, 8 Nov 2026).** The author authorised, in this
conversation:
- backing up and resetting the production database, which they believed
  held only their development test data;
- deploying the current version;
- the Git push the deployment workflow needs.

Not to be changed: repository visibility, hosting resources, secrets and
security settings. The author paused the work once, partway through (see
section 5), and then asked for it to be resumed.

## 1. Release

- **Production URL:** https://comp4020-final-asuka121380.fly.dev/
- **Deployed commit:**
  [`625f14b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/625f14b).
  - It is [`c4818e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c4818e2)
    (Woodland presentation pass, camera-motion check, all three scenes)
    plus the Dockerfile fix in section 5.
  - Fly release **v14**, image `deployment-01M6X5H840VKQGN970RPF1Z18K`,
    on machine `84e1dea2790d38`.
  - The live `home-JDXbhmNo.js` bundle is the same content-hashed file as
    the local release build.
- **Previous production:** release v12, built by CI from
  [`254aa99`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/254aa99)
  (image label `GH_SHA`), image `deployment-01M5DS1HV772NK4G0NKAY2VZKS`,
  database schema `user_version` 4.
- **Push.** `main` was fast-forwarded `254aa99..625f14b`, 52 commits, no
  force push. The repository is public, so CI runs on that push.
- **Fly settings unchanged:**
  - one machine, `shared-cpu-1x`, 256 MB;
  - one 1 GB volume (`vol_re1lzx816xqydol4`) at `/data`;
  - `fly.toml`, secrets and visibility unchanged.
  - The deploy command was the course one:
    `flyctl deploy --remote-only --ha=false -a comp4020-final-asuka121380`.
- **Pre-push scan** of `254aa99..625f14b`:
  - no token, key, password or cookie pattern;
  - no `.env`, `mise.local`, PDF, `.db` or reference-image file;
  - `fly.toml`, the CI workflow and `spec/invariants.test.ts` unchanged;
  - the added images are the project's own screenshots and two
    self-rendered scene covers.

## 2. Backup (before anything was reset)

- **Method.** SQLite's online backup API (`node:sqlite` `backup()`), run
  in the production machine against `/data/app.db`. It copies committed
  pages, including any still in the WAL.
  - The app was idle (auto-stopped). The logs show no write between the
    backup and the reset.
- **Locations:**
  - on the volume, outside the database path:
    `/data/backups/app-pre-reset-20261108T071919Z.db`;
  - downloaded copy, read-only, outside the repository:
    `~/brick-commons-backups/app-pre-reset-20261108T071919Z.db`.
- **Verification:**
  - both copies have SHA-256
    `24d7ff7c07513905eeac969e87f548befa0bad0c5a8ad3a8b6276c01e305fa93`,
    1,294,336 bytes;
  - `PRAGMA integrity_check` = ok, `user_version` = 4, `foreign_key_check`
    empty;
  - the hash was checked again after the reset, after the deploy and after
    the restart.
- **Contents.** Only row counts were read: 216 visitors, 7 accounts, 237
  rooms (all Beach Houses), 182 parts, 18 snapshots, 3 publications.
  Nothing else from it is in this record.
- **Untouched on the volume:** `lost+found/` and `backups/`.

## 3. Before touching production

- **Release checks.** On `c4818e2`, from a separate `git worktree`, with a
  production build (`NODE_ENV=production`) and fresh isolated data:
  - `pnpm typecheck` clean; `APP_URL=… pnpm check` 304/304;
    `check:evidence` passes;
  - woodland, castle, interaction 85/85, multiplayer 17/17, showcase
    20/20, log-rehearsal 13/13;
  - tabletop 188/188 when run alone. An earlier run alongside other
    browser checks gave 53/62, timing out at `ready()` under that load;
    the alone run is the result.
- **Upgrade on a copy of the backup** (never the backup itself), running
  the release:
  - migration 5 (an index-only change) applied, giving `user_version` 5;
  - integrity ok, no FK violations, and every table's row count
    unchanged;
  - read back over HTTP, as their owners, using a session added to the
    copy only:
    - the largest room (37 parts, stock 37);
    - the host's room list;
    - a visitor's 2 saved versions and one version's parts;
    - an account-linked visitor's account;
    - all 3 showcase entries.
  - In Chrome, the old 37-part room opened in the editor with no errors,
    and the showcase showed the three entries.
  - Screenshots of the old data were taken but are not published here.
- **Fresh database:**
  - the first visit sets the identity cookie;
  - one room per scene, as below;
  - all three open from the homepage's "Build alone" with their trays.

| Scene | Plot | Part types | Parts | Players |
| --- | --- | --- | --- | --- |
| Beach Houses | 16×8 | 14 | 74 | 2 |
| Medieval Castle | 32×26 | 20 | 871 | 4 |
| Woodland Commons | 32×28 | 22 | 1,426 | 6 |

## 4. Reset

1. **Maintenance mode** (07:45:48Z). The same machine was set to run
   `sleep` instead of the app (`flyctl machine update --command`). This
   was checked:
   - the only processes were `/fly/init` and `sleep`;
   - the only listener was SSH (port 22);
   - the public URL timed out.
2. **Reset** (07:46:55Z). `rm -f /data/app.db /data/app.db-wal
   /data/app.db-shm`.
   - Only `app.db` existed, because the old app had checkpointed on its
     clean stop.
   - `backups/` and `lost+found/` were kept.

## 5. A failed first deploy, and the fix

- **v13** (07:47Z, from `c4818e2`) failed Fly's smoke checks:
  `ERR_MODULE_NOT_FOUND: /app/src/client/ui/pageHeader.ts imported from
  /app/src/server/readme.ts`.
  - `ed0b206` (5 Nov) had made the README route import two client UI
    modules. The Dockerfile's runtime stage copies only `src/domain` and
    `src/server`.
  - The local checks ran from the full source tree, because Docker's
    daemon isn't available on this Mac, so they couldn't see it.
  - The app crashed before opening a database. It wrote nothing, and the
    backup was unaffected.
  - **The site was down from about 07:45Z to 08:49Z**, the maintenance
    window plus the failed release. The author's pause fell in this period
    (handed over in HANDOFF.md).
- **The fix,** [`625f14b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/625f14b):
  - The runtime stage also copies `src/client/ui/pageHeader.ts`,
    `brickScenes.ts` and `iso.ts`.
  - A walk of every import reachable from `src/server/index.ts` found
    exactly these three outside `src/server` and `src/domain`. They are
    plain string modules; the only bare imports are `express`, `marked`
    and Node built-ins.
- **Verified before redeploying** with a directory that reproduces the
  runtime stage (its COPY lines, prod-only install, `NODE_ENV=production`):
  - the old Dockerfile reproduced the crash exactly;
  - the fixed one started, served 200 for `/`, `/readme/`, `/build/`,
    `/build/?view=showcase`, `/api/me/peek`, `/api/showcase` and a scene
    cover;
  - and passed `pnpm check` 304/304.
- **v14** (08:49:19Z) is complete and healthy.
  - The app created a fresh `/data/app.db` (`user_version` 5) through its
    normal startup migration.
  - The machine's `init` is empty again: the image's own CMD, not the
    maintenance `sleep`.
- **CI on the push of `625f14b`:**
  - The first attempt failed in `jdx/mise-action` (HTTP 504 downloading
    mise from GitHub), so none of our checks ran.
  - On the re-run, the **`check` job passed**: CI built this Dockerfile
    with Docker, ran `pnpm check` against the container, checked evidence
    and passed both secret scans.
  - Its **`deploy` job failed** in `setup-flyctl` (HTTP 504 downloading
    flyctl), before any deploy step. Production was not touched and stays
    on v14 from the same commit. A later re-run would only redeploy the
    identical commit.

## 6. The live site (real HTTPS, real Chrome 156)

The checks ran 09:06–09:08Z with independent browser contexts, each with
its own cookie jar. The script was first rehearsed against the local
release build (56/56) to keep production fixtures to a minimum.
**Production: 56/56 passed.**

- **Homepage, fresh context:**
  - The table renders with no cookie and no `/api/me` call.
  - The scene tray lists all three scenes with 1–2 / 1–4 / 1–6 builders.
  - For the scene tray, noticeboard, shelf and Friends stand:
    - the camera moves, then the panel opens;
    - the URL records the focus;
    - Back to table returns home.
  - Browser Back closes a focused view, and Forward reopens it.
- **Pages:** `/build/`, `?view=account`, `?view=collection`,
  `?view=showcase` and `/readme/` each answer 200 and show their content.
- **Scenes:** Build alone opens each scene with the plot, part types,
  stock and capacity in the table in section 3.
- **Two identities (A and B, separate contexts)** in an invite-only
  Medieval Castle room:
  - A wrong or malformed room code gets clear feedback ("That room doesn't
    exist, or you don't have an accepted invitation to it.").
  - B accepts A's friend link explicitly. Even as a friend, the code shows
    B the room as not open to them.
  - A invites B from the room panel. B accepts in the lobby and is in the
    room, as a different visitor.
  - A and B each place a brick, and each sees the other's live.
  - Both show the same shared stock (7 → 5).
  - B turns A's brick. A sees it, with A still the builder and B recorded
    as editor.
  - B proposes a plan. It reaches A and costs no stock.
  - B leaves with "Leave room". A's room keeps both bricks, the plan and
    the stock, and B stays a contributor.
- **Saved versions:**
  - A saves a copy. It opens read-only with "Contributors to this version"
    and is in A's collection.
  - Continuing it gives an independent room with the same scene and parts.
  - Publishing that invite-only room's version is refused (403).
  - One small public Woodland room's version was published, and it is the
    only showcase entry.
- **Accounts** (disposable, random password, never printed):
  - Registering keeps the guest's identity.
  - Sign-out leaves a different anonymous visitor.
  - Signing in from a fresh browser returns the same identity and its
    room.
  - A wrong password is refused (401).
- **Stale cookie.** A genuine production cookie was taken from a fresh
  context *before* the backup (07:18Z, so its visitor is in the backup)
  and replayed after the reset:
  - homepage and lobby load;
  - `/api/me` answers 200 with a new identity, and the log shows
    `visitor.new (unknown_session)`;
  - a room can be created;
  - no console errors.
- **390×844** (Chrome device emulation):
  - the table renders;
  - the scene panel's actions are on screen;
  - the Woodland editor opens with its tray;
  - the lobby, showcase and About fit the width.
- **No console errors** in any context.

Shots are in `shots/0028/`, all `live-*`, at 1440 px desktop or 1000 px
tall for mobile.

## 7. Logs

`logs/0028-production-verification.jsonl` holds the 80 production lines
from 09:06:51Z to 09:09:54Z. Fly's log buffer no longer held the deploy's
08:49 start line. They explain the test:
- 8 new visitors, plus 2 `unknown_session`: the stale cookie, and the
  signed-out browser;
- `room.create` ×4;
- `room.preview`: ok, `not_found` for the bad codes, `no_invitation`;
- `friend.link`, `friend.response`, `room.invite`, `room.invite_response`;
- `room.join`, and `command` ×6 (two places, a turn, the plan, …);
- `snapshot.save` ×2, `snapshot.continue`, `snapshot.publish` changed and
  denied (`publish_disallowed`);
- `account.register`, `sign_out`, `sign_in` (`bad_credentials`,
  `verified`, `confirmed`);
- `room.leave`, `presence.end (expired)`, `sse.open`/`close`;
- the restart's `server.stop` (sigint) and `server.start`.

The fields used were `actor at author cmd colour event ms open outcome
part peer port reason req rev room route scene source t target type
visibility`. The lines were searched for the test username, room labels,
display name, "password", "token", "cookie=" and "recovery": **0
matches**. These are lines from a scripted run against the live app, not
from people using it.

## 8. Persistence

- **Storage.** `/data` is the Fly volume (`/dev/vdc`, ext4, rw, 1 GB),
  not the container's filesystem.
- **Recorded first**, as the disposable account, over HTTPS:
  - signed in;
  - its Beach Houses room: 1 part, stock 73;
  - the showcase entry, with its part.
  - Database counts: `user_version` 5; visitors 10, accounts 1, rooms 9,
    parts 6, plans 2, snapshots 2, publications 1, inventory rows 168.
    There are 2 more visitors than the script made: real visits.
- **Restart.** `flyctl machine restart 84e1dea2790d38` at 09:09:50Z, with
  the volume untouched. A graceful `server.stop` (exit 0) was followed by
  `server.start` 4 s later, and the site answered 200.
- **After the restart:**
  - the same reads gave identical results (`diff` empty);
  - every count was identical;
  - the backup hash was unchanged.

## 9. What production holds now (leave these)

- **Records the test created**, all named "Verify 202611080906 …":
  - the invite-only shared Medieval Castle room and the room continued
    from it;
  - one public Woodland room with its one published version;
  - the account's invite-only Beach Houses room;
  - a stale-cookie test room;
  - solo plots, created by "Build alone", one per scene;
  - one account (`verify…`).
- Plus whatever real visitors have done since.
- There was no second reset.

## 10. Recovery

- **The compatible pairs are:**
  - `625f14b` (v14) with any database at schema 5, including the current
    one;
  - `254aa99` (v12) with the schema-4 backup.
- **Never run v12 on a schema-5 database.**
- **To return to the previous release and data:**
  1. Run the machine in maintenance:
     ```
     flyctl machine update 84e1dea2790d38 -a comp4020-final-asuka121380 --command "sleep 1800" --skip-health-checks --yes
     ```
     Start it if it is stopped.
  2. Over `flyctl ssh console`, move the current `/data/app.db*` aside
     into `/data/backups/`, keeping them. Then:
     ```
     cp /data/backups/app-pre-reset-20261108T071919Z.db /data/app.db
     ```
     Check the SHA-256 against section 2. If the volume copy is gone,
     upload the local copy with `flyctl ssh sftp shell` and `put`.
  3. Deploy the v12 image, which also clears the maintenance command:
     ```
     flyctl deploy --image registry.fly.io/comp4020-final-asuka121380:deployment-01M5DS1HV772NK4G0NKAY2VZKS --ha=false -a comp4020-final-asuka121380
     ```
  4. Check that `"init": {}` is set and the site answers 200.
- **To keep the current release** but take back the old data, use the
  same steps, but deploy `625f14b`'s image
  (`deployment-01M6X5H840VKQGN970RPF1Z18K`). It migrates the schema-4
  copy to 5 on start, as rehearsed in section 3.

## Limitations

- **Browsers.** Chrome only; no Safari, Firefox or physical phone. Mobile
  is Chrome device emulation at 390×844.
- **Two users** were two browser contexts in one process on one machine,
  not two devices. A two-device check for the author:
  1. On phone A, open the site, Rooms → "Start a shared room"
     (invite-only), and place a brick.
  2. On laptop B, open the site in a private window, and accept A's
     friend-request link.
  3. A invites B from the room's Room panel. B accepts in the lobby.
  4. Each places a brick. Check that each sees the other's within a second
     or so, and that both trays show the same counts.
  5. B uses "Leave room". A's bricks and stock stay.
- **The image** was first built by Fly's remote builder. A local Docker
  build wasn't possible; CI's Docker build of the same commit then passed
  `pnpm check`.
- **CI.** The deploy job didn't run (a GitHub 504). The live release is
  the manual deploy of the same commit.
- **Downtime.** About an hour, around the pause, as recorded in section 5.
