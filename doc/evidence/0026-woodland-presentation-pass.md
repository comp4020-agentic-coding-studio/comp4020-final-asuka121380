# Evidence 0026: Woodland Commons presentation pass

Collected by the agent on 8 November 2026 (AEDT), for ADR 0016's
"Presentation pass" section and the research record
`doc/research/0003-tree-house-reference.md`.

- **Build and server.** Against a production build (`pnpm build`), served
  by `node src/server/index.ts` on local port 8417 with a disposable
  `DATA_DIR` (`/tmp/wp-data`). It was started fresh before the final batch,
  and `curl` confirmed the server returned 200 before any check ran.
- **Machine.** An Apple M1 MacBook on macOS 15.7.4. Google Chrome
  156.0.8078.81 via Playwright (`channel: "chrome"`), with WebGL on ANGLE's
  Metal renderer (Apple M1). Playwright's own WebKit 26.6 build was used
  for the WebKit smoke test. That build is not Safari.
- Nothing pushed or deployed.

Commits:
- `725eb58` the reference redesigned: lodge, commons, bunkhouse, lookout
- `af67301` the tree's look, the clearing, and vertex-coloured batching
- `689a4a6` the inspiration card and the tree-house opening view
- `8ad7c20` the homepage scene panel
- `f533f91` `scripts/showcase.ts` for the current lobby form, with a Woodland run
- `17a35d9` `showcase.ts` chooses a scene by its label (the radio is covered by the card's picture)

## 1. Results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `APP_URL=http://localhost:8417 pnpm check` | 304/304 (31 files), logging tests included |
| `pnpm check:evidence` | passes |
| `scripts/woodland.ts` | 64/64 |
| `scripts/tabletop.ts` | 176/177 (one failure that predates this pass, below) |
| `scripts/interaction.ts` | 85/85 |
| `scripts/castle.ts` | 34/34 |
| `scripts/multiplayer.ts` | 17/17 |
| `scripts/showcase.ts` | 20/20 (after `17a35d9`) |
| `scripts/log-rehearsal.ts` | 13/13, 33 log lines |
| WebKit smoke test (one-off script, WebKit 26.6) | no page or console errors |

- **The tabletop failure.** The check is "[entrances, desktop 1920×1080]
  scenes: clicking the object moves the camera, the panel waits for
  arrival". It reported `{"framesMoving":0,"dialogWhileMoving":0}`.
  - Before this pass, `a3cdb33` was checked out in a separate worktree,
    built, and served on port 8418 with its own copy of `tabletop.ts`. The
    same check failed the same way there (173/174).
  - This pass did not change it. It is recorded here, not fixed.
- **`showcase.ts`.** The first run of the rewritten script stopped at the
  new Woodland step. The scene radio's `check()` was intercepted by the
  card's picture, which covers the visually hidden input. `17a35d9` makes
  it click the scene card as a visitor does, then asserts the radio is
  checked. All of the script's earlier assertions are kept.
  - W1–W4 cover: a Woodland room is created from the lobby; a part is
    placed and saved as a snapshot; the snapshot view shows the tree; it
    is continued into a new room that keeps the scene and the part.
- **Log rehearsal.** All 33 lines were read, covering 13 event kinds
  (`visitor.new`, `room.create`, `room.preview`, `room.join`, `room.invite`,
  `room.invite_response`, `command`, `sse.open`/`close`, `friend.*`).
  - The fields used were `actor at author cmd colour event ms open outcome
    part peer reason req rev room route scene t target type visibility`.
  - The only match for the never-logged words was the reason code
    `no_cookie` on `visitor.new`. No cookie, token, name, address or error
    text appeared.
- **WebKit smoke test (WebKit 26.6, not Safari).**
  - The Woodland reference loaded at 1600×1000 and at 390×844 (touch),
    with renderer "Apple GPU" and 841 draw calls.
  - "Tree-house inspiration" opened by click and by tap. The heading was
    covered at 0 of 9 sample points, and the controls hint was hidden.
  - The homepage at `?focus=scenes` (1440×900): choosing Woodland Commons
    left "Build alone" at 404–448 px and "Set up a room" at 503–547 px of
    900 px.

## 2. What each brief item became, and where it was checked

- **Inspiration picture** (`689a4a6`).
  - The tree-house picture draws the fixed tree with a thinned canopy from
    the editor's own tree code, then the 389 reference parts on it.
  - The note under the picture separates "Already there" from "Yours to
    build".
  - `woodland.ts` requires solid tree pixels in the picture's top third.
    The tree never enters the build. In the built preview,
    `__state().snapshot.parts` held exactly 389 parts of 19 kit types, and
    none was a tree, trunk, branch or deck (checked in Chrome, one-off).
  - Shots: `inspiration-treehouse-1280.png`,
    `inspiration-treehouse-360.png`, `webkit-inspiration-*.png`.
- **Overlap** (`689a4a6`). `woodland.ts` §7b loops over all three scenes'
  cards ("House inspiration", "Castle inspiration", "Tree-house
  inspiration") at 1920, 1280, 1024, 390 and 360 px. At each width it
  checks:
  - the heading is not covered at any of 27 sample points;
  - the hint is absent;
  - the card stays in view and above the dock, and its last caption line
    can be reached by scrolling inside the card;
  - the toggle is free, with correct `aria-expanded` and `aria-label`.

  All pass. Shots: `inspiration-castle-360.png`,
  `inspiration-street-360.png` and `inspiration-treehouse-360.png` (the
  narrowest case, where the view chips wrap).
- **Opening camera** (`689a4a6`).
  - The opening frame shows the tree from roots to canopy, the ground plot
    and all three platforms. This holds empty and built, with the tray
    open and folded, on desktop (1920×1080) and phone (390×844).
  - `woodland.ts` checks Reset returns to polar 1.3 and the scene's own
    target. `interaction.ts` (85/85) covers the general camera rules.
  - No code path moves the camera after a placement.
  - Shots: `opening-{empty,reference}[-folded]-{desktop,mobile}.png`.
- **Focus on each level.** Desktop, built reference. A part was clicked at
  its projected position and F pressed:

  | Part | Plate | Orbit target after F |
  | --- | --- | --- |
  | ground stairs | 0 | (4, 2.4, 20) |
  | lodge door | 12 | (4, 8.4, 7.5) |
  | lookout plate | 40 | (24, 16.2, 10.5) |

  Shots: `focus-{ground,middle,upper}-desktop.png`.
  `leaves-hidden-desktop.png` shows L hiding only the canopy.
- **Tree look and clearing** (`af67301`).
  - The rule boxes in `SceneTemplate.fixed` are unchanged.
  - `spec/domain/treehouse.test.ts` still pins every box and passes inside
    `pnpm check`.
  - The bark detail, collars and foot all lie on or inside those boxes.
  - Hide leaves (local, canopy only) is checked by `woodland.ts` §4 and
    §7.
  - The open front corridor has no automated check. It is enforced in the
    grove placement (`Environment.tsx`: no tree in front of the plot
    within a widening corridor) and was seen in the opening shots.
- **Reference architecture** (`725eb58`).
  - Four structures: lodge, commons deck, bunkhouse and lookout. Stairs
    connect ground, deck, bunkhouse and crown, and there is a fire ring.
  - 389 parts, 27 % of the 1,426-part kit. Every part type is within its
    allocation.
  - It is built part by part through `src/domain/rules.ts` in
    `spec/domain/treehouse.test.ts` (35 tests).
  - Why it uses fewer parts than the kit is in the research record's
    "Reference and kit: four different numbers".
- **Homepage scene panel** (`8ad7c20`).
  - The panel keeps all three scenes with their covers, S/M/L sizes and
    1–2/1–4/1–6 builders.
  - The arrows, Home and End move the choice with one tab stop.
  - The two actions stay in view, and in the same place, for every choice.
  - `tabletop.ts` added checks for each of these, and they pass.
  - Shots: `home-scenes-woodland-{1440,390,360}.png`,
    `home-tray-woodland-desktop.png` and `webkit-home-scenes-desktop.png`.
- **Docs** (`725eb58`). The research record's "Reference and kit" section
  keeps four numbers apart:
  - the official assemblies;
  - 1,090 required;
  - 1,426 allocated, at `ceil(×1.30)` per part type;
  - the 389-part picture.

  The allocation table and the inventory are unchanged.
- **Showcase** (`f533f91`, `17a35d9`). See section 1. Shots:
  `woodland-snapshot-desktop.png`, `woodland-continued-desktop.png`.

## 3. Performance

`scripts/scene-perf.ts`, headless Chrome 156 on the M1's Metal GPU, at
1920×1080, on mains power (charging). Two runs, `--empty` and with the
reference:

| Scene | Empty: calls / triangles | Reference: calls / triangles | Mean / p95 frame (ms) |
| --- | --- | --- | --- |
| Beach Houses | 110 / 196,488 | 216 / 259,832 | 16.67 / 16.7 |
| Medieval Castle | 35 / 512,440 | 835 / 901,760 | 16.67 / 16.7 |
| Woodland Commons | 19 / 301,664 | 841 / 759,688 | 16.67 / 16.8 |

- **Draw calls.** Before this pass (evidence 0025), Woodland drew 61 calls
  empty and 1,009 with the 450-part reference.
  - The tree, the canopy and the near forest now share one vertex-coloured
    mesh each (`BatchedColoured`, `af67301`), instead of one mesh per
    colour.
  - The reference's 841 calls come from its 389 placed parts.
- **Loading.** No loading frame was dark (darkest 0.0 %). The environment
  was ready in 0.8–1.4 s.
- **Frame times.** An earlier run the same day, on battery at 19 %, gave
  33.33 ms for every scene: the Mac had throttled to 30 Hz. Those numbers
  are not used.
- **What this shows.** Frames are vsync-bound at 60 Hz on one Mac. This is
  not evidence for phones or slower GPUs. No physical phone was measured.

## 4. Limitations

- **Browsers.** Chrome 156 and Playwright's WebKit 26.6 build only, with
  no Safari, Firefox or physical phone. The 390×844 and 360×740 runs are
  device emulation in desktop browsers.
- **Performance.** One M1 Mac, vsync-bound; draw calls and triangles are
  the comparable figures.
- **Tabletop.** The pre-existing camera-arrival failure (section 1) is
  still open.
- **Focus test.** It used whichever part the pointer hit first on each
  level, so the "middle" part was the lodge door on the plate-12
  platform, not a plate-24 part.
- **Docs.** README.md, PROCESS.md and `reflections/` were not edited.
