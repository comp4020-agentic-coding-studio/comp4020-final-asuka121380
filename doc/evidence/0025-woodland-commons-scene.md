# Evidence 0025: Woodland Commons, a third playable scene

Collected by the agent on 7 November 2026 (AEDT), for ADR 0016 and the
research record `doc/research/0003-tree-house-reference.md`.

- **Build and server.** Against a production build (`pnpm build`), served
  by `node src/server/index.ts` on local port 8417 with a disposable
  `DATA_DIR` (`/tmp/wc-data`), restarted on fresh data before each browser
  batch.
- **The port.** 8417 was confirmed free first. Port 8080 was already held
  by an unrelated older server, started 14 Oct, which was left alone and
  never tested against.
- **Machine.** An Apple M1 MacBook on macOS 15.7.4.
- Nothing pushed or deployed.

Commits:
- `7ba5576` the domain: the fixed tree in the rules, the kit and 6 players
- `38b9bf8` the branches' correction, with the tree pinned in a test
- `705f055` the scene in the editor
- `0ba205f` the homepage tray and the lobby, with the scripts

## 1. Reference research (summary; the record has every row)

- **Source.**
  - The official instructions page for 21318 lists one booklet, "Tree
    House (1/1)", `6294836.pdf`, 436 pages.
  - It was downloaded to `/tmp/ref21318` and read there. Neither the PDF
    nor any page render or extracted part image is in the repository, in
    `public/` or in any commit.
- **Method.**
  - Every step callout in bags 1–19 was read and assigned to a bag.
  - Each part image in the buildable bags (7–13, 15) was identified and
    counted from the callouts. Only element numbers were cross-checked
    against the booklet's own parts list (pp. 429–433).
  - The set's headline piece count and photographs were never used for
    a quantity.
- **Three groups.**

  | Group | Bags | Pieces | Treatment |
  | --- | --- | --- | --- |
  | Fixed environment: base, trunk, roots, branches, crown, foliage | 1–6, 14, 17–19 | 1,422 | the scene's fixed tree and drawn surroundings |
  | Accessories: table, swing, crates | 16 | 96 | omitted |
  | Player-buildable: cabins, roofs, stairs, railings | 7–13, 15 | 1,354 | 946 mapped, 238 roof group substituted, 170 omitted (crane, furniture, accessories, small details) |

- **Result.**
  - 141 mapped part images become 22 game part types (19 existing, 3 new:
    plate 1×1, plate 1×4, stairs 2×4×4).
  - 1,090 required; `ceil(required × 1.30)` with colours consolidated
    gives **1,426 allocated**.
  - The full allocation table, with the formula per row, is in the
    research record's "Allocation" section. `spec/domain/treehouse.test.ts`
    checks every row.
- **Reconciliation** (official → adapted → final) and every substitution
  are in the record.
- **The adapted reference.** 450 parts: three cabins on the three
  platforms, four stair flights, porch railings and a picnic spot. It is
  built part by part through the rules within the kit in a test.

## 2. The fixed supports

- **The tree** is `TREE_PIECES` in `src/domain/treehouse.ts`, version 1,
  frozen with the scene id `treehouse-01`. It has 10 boxes:
  - 2 trunk, 3 roots, 2 branches: solid and studless
  - 3 decks, the platforms, with tops at plate 12, 24 and 36: the only
    support surfaces
- **In the rules.** `rules.ts` treats every box as occupied, and only deck
  tops as studs, in:
  - placement and plans
  - realizing a plan
  - rotation and removal
  - the support of plans (`planFits`, `plannedStructure`)
  - withdrawal
  - `fitHeights` (Higher/Lower and the preview)
- **The same tree everywhere.** The server and the client preview run the
  same code. The client draws the same boxes and aims at them through
  invisible pointer boxes of exactly those cells.
- **Not a part.** No box is in the build, the kit or the stock. A command
  naming one is `not_found`.

## 3. Automated checks

- `pnpm typecheck`: clean. `pnpm build`: succeeds.
- `APP_URL=http://localhost:8417 pnpm check`: **303/303 passed**, 31 files. This
  includes:
  - `spec/domain/treehouse.test.ts`, 34 tests:
    - the tree's boxes are explicit, pinned, inside the plot and not
      overlapping
    - only decks carry parts; a part just beside a platform or on a branch
      is unsupported
    - nothing passes through the trunk, roots, branches or a platform
    - `fitHeights` offers no height inside the trunk, and every offered
      height is accepted by the server check
    - plans rest on and are refused by the tree exactly as parts are, and
      realizing a plan is a real placement
    - rotation into the trunk is refused; removal keeps a platform's
      support; `plan_depends` still holds
    - no command names a fixed piece
    - the kit equals the table; the reference is buildable within it
    - the stairs carry a second flight
    - Beach Houses and the castle are unchanged
  - `spec/treehouse-scene.test.ts`, 8 HTTP tests:
    - a new room is empty with its kit and 6 places
    - one solo plot per scene
    - a part on the left platform is accepted, and one in the trunk or
      floating is refused
    - fixed ids are `not_found`
    - reload, snapshot and continue keep the scene
    - the lobby and pre-join show 6
    - six visitors are admitted, the seventh gets `room_full` (409), and
      all six share one kit live over SSE
  - `spec/server/scene-migration.test.ts`: a Woodland solo plot is added
    beside existing ones on an upgraded database.
  - the logging tests (`spec/server/log-*.test.ts`), unchanged and
    passing.
- `pnpm check:evidence`: passes (15 PROCESS citations resolve).

## 4. Browser checks (real Chrome via Playwright, against port 8417)

| Script | Result | Notes |
| --- | --- | --- |
| `scripts/woodland.ts` (new) | **46/46** | below |
| `scripts/tabletop.ts` | **174/174** | its scene-tray check now expects three scenes |
| `scripts/interaction.ts` | **85/85** | after the camera, aiming and loading changes |
| `scripts/castle.ts` | **34/34** | its lobby check now compares the first two scenes |
| `scripts/multiplayer.ts` | **17/17** | |
| `scripts/log-rehearsal.ts` | **13/13** | read below |

`scripts/showcase.ts` stops at its first step, because it still fills the
lobby's room form directly. That is the pre-existing `731c920` problem
recorded in ADR 0015, unrelated to this work, and the script was not
changed. The snapshot page that SnapshotView draws is covered by
`scripts/woodland.ts` instead.

`scripts/woodland.ts`, through the site's own controls:

- **The homepage.** The homepage scene tray lists Beach Houses, Medieval
  Castle and Woodland Commons, tagged Small / 1–2, Medium / 1–4 and
  Large / 1–6. The Woodland card shows its cover.
  - The homepage requested no editor or environment chunk (the request
    list is in the output).
  - "Build alone" from the tray opens an empty `treehouse-01` solo plot,
    titled Woodland Commons, with nougat selected and 22 tray parts.
- **Six players.**
  - The lobby offers all three scenes.
  - A public Woodland room is created; its lobby row shows "1/6 here".
  - Five more independent visitors (separate contexts and cookie jars)
    join, and the host sees six active members.
  - A seventh's pre-join screen reads "Woodland Commons … 6/6 … full".
- **Building on the tree.**
  - visitor 2: a brick on the left platform (top 12), seen live by all
  - visitor 3: stairs on the ground
  - visitor 4: a plate on the right platform (top 24)
  - Aiming over the crown offers only its top (36).
  - The server refuses a part inside the trunk: "That space is taken by
    the tree's trunk."
  - visitor 6: a plan on the crown deck.
  - All six converge on three parts, and held + placed = allocated for
    every type. The plan costs no stock.
- **Hide leaves.** L hides the canopy for the host only. The other five
  still see it, and the room's revision, parts and kit are unchanged. The
  button shows the leaves again.
- **Camera.**
  - Focus raises the orbit centre to a part on the right platform.
  - Reset returns to the scene's opening frame.
  - Zoomed close and orbited behind the tree, the camera is kept out of
    the trunk (it ends at z 11.85, in front of the bark).
  - The top view looks straight down from y ≈ 96.
- **Persistence.**
  - A reload reopens the room with its parts and plan, and with the
    leaves shown again.
  - A saved snapshot and its page name Woodland Commons.
  - Continuing it creates an independent Woodland room with the same
    parts.
- **Beach Houses unchanged:** 2 places, 14 part types, no Hide leaves, and
  L does nothing.
- **Phone emulation.** The Hide leaves button is on screen at the same
  height as Top view (36 px), and a tap hides the leaves.
- **Loading.** With the environment chunk held back for 3 s, the canvas
  draws no pixel and "Loading the scene…" shows; it is gone once loaded.
- **Console.** No console errors except the one deliberate 422 (the
  in-trunk command).

## 5. WebKit (Playwright's WebKit 26.6 build, not Safari)

A short manual script, not committed:
- loaded the Woodland reference at 1600×1000 and as a 390×844 touch
  emulation
- toggled the leaves by L and by tap: the canopy was hidden and
  `aria-pressed` became true
- opened the homepage tray: three scenes

The renderer was the Apple GPU, with 1,009 draw calls, as in Chrome. There
were no page or console errors. Screenshots: `webkit-reference-desktop`,
`webkit-reference-mobile`, `webkit-home-tray-desktop`. **Safari itself was
not run**, and no physical phone was used.

## 6. Performance (`scripts/scene-perf.ts`)

**Method.**
- Headless Chrome on this Mac, at 1920×1080. WebGL ran on the M1's GPU
  (`ANGLE Metal Renderer: Apple M1`), not SwiftShader.
- Each scene was opened as a `?local` preview, empty and with its adapted
  reference.
- "Ready" is the first frame with the environment, read from
  `__renderInfo` under `?debug`. Draw calls and triangles are the last
  frame's, shadow passes included.
- The frame interval is the mean and 95th percentile over 4 s of slow
  orbiting.

| Scene | Build | Draw calls | Triangles | Ready after | Mean / p95 frame |
| --- | --- | --- | --- | --- | --- |
| Beach Houses | empty | 110 | 196,488 | 0.8 s | 16.67 / 16.7 ms |
| Medieval Castle | empty | 35 | 512,440 | 1.1 s | 16.67 / 16.7 ms |
| Woodland Commons | empty | 61 | 291,804 | 0.9 s | 16.67 / 16.7 ms |
| Beach Houses | reference | 216 | 259,832 | 1.0 s | 16.67 / 16.7 ms |
| Medieval Castle | reference | 835 | 901,760 | 1.1 s | 16.67 / 16.7 ms |
| Woodland Commons | reference (450 parts) | 1,009 | 804,092 | 0.9 s | 16.67 / 16.7 ms |

**Reading.**
- **Batching works.** The Woodland environment is batched and instanced:
  61 draw calls for the tree, canopy, forest edge, ground and sky
  together.
- **Placed parts are the cost.** Most of the 1,009 calls with the
  reference come from the existing one-mesh-per-part rendering, which
  this work did not change, as in the castle.
- **The frame time shows no missed frames, not cost.** It sits on the
  display's 60 Hz vsync, so no frame was missed on this machine, but it
  is not a measure of headroom. A weaker GPU or a phone was not measured.
- **The homepage loads no environment for the miniatures.** They are
  built from domain data with the shared batching, in the existing
  `TableScene` chunk.

**Loading.**
- **The defect.** A first run caught one Woodland frame at about 0.5 s
  with the plot drawn unlit (solid black) on the page background, before
  the environment's light had loaded.
- **After the fix in `705f055`** (one Suspense boundary for environment,
  plot and parts):
  - nine further runs across the three scenes had no dark loading frame
  - the deliberate 3 s delay check (section 4) shows the status line and
    an empty canvas

## 7. Logs (ADR 0013)

- **The rehearsal.** `scripts/log-rehearsal.ts` passed **13/13**
  against the fresh server. It exercises Beach Houses; no event or field
  changed in this work.
- **The Woodland run.** The run's own lines were read from the server's
  stdout. Excerpt, with ids shortened:

  ```
  {"event":"room.join","outcome":"denied","reason":"room_full","actor":"7eb59fed","room":"ce118fb5-…","req":"…"}
  {"event":"room.preview","outcome":"ok","reason":"room_full","actor":"7eb25a36","room":"bbfa6b4f-…","req":"…"}
  {"event":"command","outcome":"rejected","reason":"collision","actor":"23d03175","room":"bbfa6b4f-…","type":"place","part":"brick-1x1","at":"15,9,4,0","colour":"nougat","cmd":"d88eb356-…","req":"…"}
  ```

- **Nothing forbidden.** A search of all 812 lines of that run for
  password, username, cookie, label, IP and the room's name found nothing
  except the allowed reason `no_cookie`.

## 8. Screenshots (`doc/evidence/shots/0025/`)

All are Chrome via Playwright unless named `webkit-`. Desktop is 1600×1000
or 1920×1080, downscaled to 1600 wide. Mobile is a 390×844 emulation at
device scale 2, downscaled. No physical device was used.

- **The empty site:** `empty-site-desktop`, `empty-site-mobile`.
- **The reference:** `reference-desktop`, `reference-mobile`,
  `reference-leaves-hidden-mobile`.
- **Six players' build, leaves shown and hidden:** `leaves-shown-desktop`,
  `leaves-hidden-desktop`, `construction-top-desktop`.
- **Integration:**
  - `home-tray-desktop`, `home-tray-mobile`
  - `lobby-scenes-desktop`
  - `seventh-refused-desktop`
  - `snapshot-view-desktop`
- **Loading:** `loading-desktop` (the status line while the environment is
  held back).
- **WebKit:** `webkit-reference-desktop`, `webkit-reference-mobile`,
  `webkit-home-tray-desktop`.

## 9. Limitations

- **Browsers and devices.**
  - Chrome via Playwright, plus a short WebKit-build smoke test.
  - Not Safari, not Firefox, and no physical phone or tablet: every
    mobile result is emulation.
- **Players.** The six-player check is six browser contexts in one
  process on one machine, not six people.
- **Performance** was measured on one M1 Mac only, and the frame rate is
  vsync-bound there.
- **Counts.** Part identification in the booklet was visual, from the
  callout images. The record lists each uncertain row.
- **Camera obstacles.** Only the trunk is a camera obstacle. Branches,
  platforms, canopy and forest-edge trees are not, so the camera can
  pass through a leaf clump or a far tree. No general collision
  avoidance is claimed.
- **`scripts/showcase.ts`** (and other older scripts that fill the lobby
  form directly) still have the pre-existing `731c920` problem.
