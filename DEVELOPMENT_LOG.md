# Development log

A factual, chronological record of the development of this project,
maintained by the agent (Claude) under the rules in `CLAUDE.md`. It is source
material for the author's `PROCESS.md`, not a substitute for it. It records
what changed, why, who decided, what was run and what was observed. It holds
no opinions, lessons learned or experiences on the author's behalf.

The repository is
<https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380>.
Times are Australia/Sydney (AEDT, UTC+11) unless marked.

**Conventions**

- "Decided by the author" means the author gave the decision in the
  conversation.
- "Agent's choice" means an implementation choice the author has not
  separately confirmed.
- "Run" means a command was executed in this session. "Observed" is what it
  printed or showed.
- Detailed results live in `doc/evidence/`, decisions in `doc/adr/`.

---

## Retrospective entries

The first three entries were written on 6 Oct 2026, after the event. Their
diffs were re-inspected (`git show --stat` and the config hunks) when the
entries were written. Their test results are taken from
`doc/evidence/0002-c8-checkpoint.md`; none of those tests was rerun when the
entries were written.

### 2026-10-06 16:31 — [`4b40546`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4b40546) Construction rules, the 11035 reference model and a first R3F workbench *(retrospective)*

**Changed** (25 files, +3750/−6):
- `src/domain/`: plain TypeScript with no framework imports.
  - `grid.ts`: rotation by repeated quarter turns.
  - `catalog.ts`: 11 part types, each with footprint, height, stud cells,
    allowed rotations and a separate geometry key.
  - `colours.ts`: 13 named colours.
  - `rules.ts`: placement, removal and recolour validation, and pure apply
    functions.
  - `scene.ts`: the 16×8 plot, the 46-placement reference model and the kit.
  - `commands.ts`: the command envelope types.
- `src/client/`: React + React Three Fiber.
  - `geometry.ts`: parametric parts.
  - `PartMesh`, `Street` (fixed neighbours, hedge, path, kerb on a finite base)
    and `Workbench` (orthographic camera limited to ±0.75 rad of azimuth).
  - A right-hand sidebar with Build/Select modes.
  - A client store, plus `localTransport`: an in-browser rules runner for an
    unsaved `?local` preview.
- `spec/domain/rules.test.ts`: 17 tests.
- `vitest.config.ts`: split into an `app` project (HTTP, against a running
  app) and a `domain` project.
- `tsconfig.json`: adds `src`, `jsx`, `erasableSyntaxOnly`.
- `package.json`:
  - runtime: express, marked
  - dev: react, react-dom, three, @react-three/fiber, @react-three/drei, vite,
    @vitejs/plugin-react, playwright-core and types
- `scripts/shoot.ts`, `scripts/placement-experiment.ts`: Chrome via
  playwright-core.

**Why.** The C8 milestone needs a playable solo build. The domain stays
independent of rendering so the server can reuse it.

**Who decided:**
- **Author:** React + R3F + Vite, parametric geometry kept separate from
  connection and collision metadata, the C8 removal rule, an English
  interface, and inspecting the official 11035 instructions before adapting
  them.
- **Agent:** the part list, slope stud rows, box collision, the street layout,
  the camera limits, and the Build/Select modes.

**Tests at the time:**
- `pnpm vitest run --project domain`: 17 passed.
- The placement experiment in `?local`.

**Limitations then:** nothing was saved yet. Neighbour doors were drawn in
front of solid walls.

### 2026-10-06 16:35 — [`9202f3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/9202f3f) Server: one command path into SQLite on the volume, and /readme/ *(retrospective)*

**Changed** (13 files, +636/−46):
- `src/server/db.ts`: node:sqlite, WAL, a migration table recorded in
  `user_version`, and a `transaction()` helper.
- `src/server/builds.ts`:
  - visitor tokens, stored as a SHA-256 hash
  - a build per visitor, started with the whole kit
  - `runCommand`: dedupe by command id, check the revision, check with the
    shared rules, then one transaction writing the parts, inventory, revision
    and commands rows
- `src/server/index.ts`:
  - Express routes: `GET /api/build`, `POST /api/command`, `/readme/`,
    `/readme/docs`, and static files for the built client
  - an httpOnly SameSite=Lax cookie
  - a per-visitor rate brake and a JSON line logged per command
- `src/server/readme.ts`: `marked` renders the README on the server.
- `Dockerfile`: replaced the busybox placeholder with two node:24.21.0-slim
  stages.
- `placeholder/`: deleted.
- `docs/README.md`: new.
- `.gitignore`, `.dockerignore`: ignore local `data/`.
- `spec/persistence.test.ts`: 7 HTTP tests.

**Why.** The C8 spec requires that a stranger finds their trace when they
come back.

**Who decided:**
- **Author:** Express + node:sqlite, isolated database access, and verifying
  restart and redeploy persistence on the real deployment.
- **Agent:** the schema, the cookie identity and the HTTP shapes.

**Tests at the time:**
- `pnpm check` locally: 26 passed.
- Deployed by hand from this commit (Fly release v2, 16:37), then
  `APP_URL=… pnpm check`: 26 passed.
- Restart probe: one part survived `flyctl machine restart`.
- Redeploy probe: the same part survived a redeploy to release v3 (16:39).
- Browser experiment against the live app: reload restored everything.

**Limitations then:**
- The README was still the template.
- Touch, resize and a keyboard-only pass were untested.

### 2026-10-06 16:42 — [`a9b4c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a9b4c3d) Evidence and decision drafts for the C8 checkpoint; draft harness *(retrospective)*

**Changed** (11 files, +351/−8):
- `doc/evidence/0001-reference-model.md`: the 11035 transcription.
- `doc/evidence/0002-c8-checkpoint.md`: the tests and their results.
- Five screenshots in `doc/evidence/shots/c8-checkpoint/`.
- `doc/adr/0001-stack-and-persistence.md`: accepted.
- `doc/adr/0002-shallow-street-and-part-scope.md`: proposed.
- `CLAUDE.md`: a labelled draft harness.
- `scripts/placement-experiment.ts`: added the select, recolour and remove
  steps.

**Who decided.** This is documentation of the above.

**Tests at the time.** The extended experiment ran against the live app; its
results are in the evidence file.

**Afterwards:**
- 16:43: pushed to `origin/main`, without asking the author first. The repo
  stayed private.
- This commit was never deployed; the live app runs `9202f3f`.

---

## Entries

### 2026-10-06 17:31 — [`cea2752`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cea2752) Harness: development log, new interaction and scene rules, ADR 0003

**Changed** (4 files):
- `DEVELOPMENT_LOG.md`: new, with retrospective entries for the three earlier
  commits.
- `CLAUDE.md`: rewritten.
  - adds the commit and logging rules
  - adds the scene and camera constraints
  - adds the contextual interaction and keyboard rules
  - adds the bans on physics, people and vehicles
  - adds additive, versioned kit changes
  - reference images stay out of public assets
- `doc/adr/0003-open-street-camera-and-contextual-interaction.md`: new.
- `doc/adr/0002-…`: gains a "partly superseded by 0003" note at the top.
  Nothing else in it changed.

**Why.** The author asked to separate the running diary from the assessed
`PROCESS.md`, and gave a new interaction and visual direction after trying the
checkpoint prototype.

**Who decided:**
- **Author:** the logging workflow and its ten rules; the full-viewport
  environment; 360° orbit, top view and bounds; contextual states replacing
  Build/Select; the persistent delete tool; the bottom dock with model
  thumbnails; the bounded decorative parts; additive kit changes.
- **Agent:** perspective FOV 35°; the polar and distance limits; the
  drag-versus-click thresholds; global keyboard handling; rotation about the
  footprint centre; the shapes and quantities of the three decorative parts;
  the in-place upgrade of version 1 builds. All are recorded in ADR 0003 as
  the agent's choices.

**Tests.** None (documentation only).

### 2026-10-06 17:36 AEDT — [`a4ed156`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a4ed156) Rotate command, three decorative parts, and a versioned kit with in-place upgrade

**Changed** (12 files, +514/−58):
- `src/domain/rules.ts`:
  - `validatePlacement` now hands bounds, collision and support to a shared
    `checkFit`.
  - New `validateRotation` and `rotatedPlacement`. A turn is about the
    footprint centre (floor rounding), is checked against the whole build
    with `checkFit`, and is refused if a part resting on the turned one would
    lose support.
  - New `validateCommand` and `applyCommand` dispatchers, used by both the
    server and the browser preview.
- `src/domain/commands.ts`: a `rotate` command; `no_change` added to the
  rejection codes.
- `src/domain/catalog.ts`:
  - new `window-1x2x2` (W22), `fence-1x4x1` (FN4) and `planter-1x2` (PL2)
  - a tray `group` for every part type
- `src/domain/scene.ts`: scene version 2. Its only change is stock for the
  three new types (4, 4, 3).
- `src/server/builds.ts`:
  - `upgrade()` gives a version 1 build the new stock on load (`INSERT OR
    IGNORE`). Nothing already saved changes.
  - `runCommand` gains a branch for rotate.
- `src/client/scene/geometry.ts`: geometry for the window, fence and planter.
- `src/client/state/transport.ts`: the local preview transport uses the
  shared dispatcher.
- New tests:
  - `spec/domain/rotation-and-decor.test.ts`
  - `spec/server/upgrade.test.ts`, using in-memory SQLite
  - rotate and decorative-part persistence over HTTP, in
    `spec/persistence.test.ts`
- `vitest.config.ts`: a `server` project.

**Why.** Under the author's new interaction rules, a selected part can be
rotated through the command path. The author asked for a bounded decorative
catalogue, and for kit changes that never invalidate a saved build.

**Who decided:**
- **Author:** rotation must be validated and go through the command path; the
  decorative parts must be real catalogue parts; kit changes must be additive
  and versioned.
- **Agent:** rotation about the footprint centre; the three parts' shapes,
  stud layouts and quantities; the upgrade-on-load mechanism (ADR 0003).

**Tests.** At this commit, `pnpm check` ran against a local server
(`DATA_DIR=./data`, port 8080): 42/42 tests passed and the typecheck was clean.
The browser client still had the checkpoint UI and was not exercised for
these features.

**Limitations.** No UI exposed rotate or the new parts until the client work
that follows. Not deployed: the live app still runs `9202f3f`.

### 2026-10-06 18:23 AEDT — [`7c59819`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7c59819) Open street environment: real-opening neighbours, sky, fog and surroundings

**Changes:**
- New `src/client/scene/scenery.ts`, the generated scenery in the brick idiom:
  - Each house is built from one-stud-thick courses, with gaps left in them
    for doors and windows. A door or window sits in a real opening, and every
    face (front, back, left, right) can have openings.
  - The houses have slope roofs up to a ridge, optional chimneys and
    canopies, and flower boxes.
  - Everything is merged into one geometry per colour, so a house costs a
    handful of draw calls.
  - It also holds small street furniture (`fenceRun`, `hedge`, `tree`, `lamp`),
    `farHouse` (optionally with windows on each storey), and `spire`.
- `src/client/scene/Street.tsx` was rewritten. The checkpoint's finite base
  slab (x −24..42, z −3..12) is gone, and so are its single-face windows. In
  their place:
  - a shader sky dome, background colour and fog (`[HORIZON, 70, 300]`)
  - a ground disc of radius 650, plus a hemisphere light
  - pavements on both sides, kerbs, and a road with a centre line, all 300
    long
  - the plot as a studded plate with a low stone edge on three sides, and
    nothing in front of it
  - two neighbours with openings on every face: the left one has two storeys
    at x −15; the right one has one storey, gable to the street, at x 21
  - front gardens with paths, fences, planters and hedges, plus back-garden
    fences and trees
  - a low park across the road
  - a back row behind the plot: 11 `farHouse`s at z −31 with windows, their
    garden fences at z −24, and trees
  - a seeded ring of distant houses (95–185 out) and trees, fading into the
    fog
  - instanced ground studs near the plot
  - Only the plot's invisible top plane can be hit, and it only aims
    placements. All scenery has `raycast={() => null}`.
- Bundled with it: the `DEVELOPMENT_LOG.md` entry for `a4ed156`.

**Why.** The author's scene rules (CLAUDE.md, ADR 0003) ask for:
- a world that fills the viewport, with no platform ending in empty space
- neighbours that stay coherent from all sides under 360° orbit
- doors in real openings
- an open plot that stays the clearest subject

**Who decided:**
- **Author:** those requirements.
- **Agent:** the layout, distances, colours, fog range, the back row, and the
  batching approach.

**Tests:**
- Typecheck: `tsc` was run on this commit's tree on its own (unstaged work
  stashed) and was clean. The vitest suite was not run separately at this
  commit; the scenery has no unit tests.
- Visual checks: done with `scripts/shoot.ts` during development, at
  1920×1080 and 390×844. The working tree at the time also held the client
  changes committed next, in `3875ab0`. Later screenshots of HEAD are in
  `doc/evidence/shots/street/`.

**Limitations:**
- Seen in Chrome only, with SwiftShader software rendering in headless runs.
  Frame rate on low-end devices was not measured.
- The distant ring is decorative. It is not navigable and has no detail up
  close; camera bounds keep it at a distance.

### 2026-10-06 18:24 AEDT — [`3875ab0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3875ab0) Contextual interaction, window-level keyboard, 360° bounded camera, floating dock

**Changes:**
- `src/client/state/store.ts`: the Build/Select modes are replaced by
  contextual state:
  - `held` part, `selectedId`, `deleting`, `targetId` and a camera request
  - actions: `confirm`, `escape`, `cycle`, `lift`, `moveAnchor`, `rotate`,
    `remove`, `toggleDelete`, `requestCamera`
- New `src/client/keyboard.ts`, with one `keydown` listener on the window:
  - Shortcuts work wherever focus is.
  - Editable fields are ignored. Enter and Space on a focused control are
    left to the control.
  - Action keys ignore auto-repeat.
  - A click listener blurs a control clicked with a mouse or finger
    (`e.detail !== 0`). A control pressed from the keyboard keeps its focus.
- `src/client/scene/Workbench.tsx`, the camera:
  - perspective with FOV 40, full 360° azimuth, polar angle 0.02–1.36 (the
    camera never drops below the horizontal, let alone the ground)
  - distance 14–95, with panning clamped to the plot plus 6 studs
  - Top view and Reset view requests
  - the lens shifted with `setViewOffset` so the plot frames in the area the
    dock leaves clear
  - A drag past 6 px (10 px on touch) never edits on release.
- Workbench, touch input: the first tap previews; a second tap anywhere on the
  previewed footprint places. With the delete tool, the first tap names the
  target and the second removes it. `onPointerLeave` clears the target only
  for mouse pointers.
- Workbench, `?debug` only: read-only hooks `window.__camera()` and
  `window.__project()`, plus `window.__state` from `src/client/main.tsx`.
- `src/client/App.tsx`, the floating translucent dock:
  - a context row: hint, held part, or selected part with colour swatches and
    Rotate/Delete/Deselect; Delete tool; fold
  - category tabs, and tray buttons with stock counts
  - a collapsible Target house card
  - a top bar with Saved state, help, Top view `T`, Reset view `Home` and
    About
  - Buttons that can't act while a save is in flight use `aria-disabled`, so
    they keep focus.
  - Touch-specific wording comes from `(pointer: coarse)`.
  - A `ResizeObserver` gives the camera the dock's stable height.
- New `src/client/scene/thumbnails.ts`: one offscreen renderer draws each tray
  thumbnail from the real part geometry.
- `src/client/scene/PartMesh.tsx`: a highlight tint and outline for the
  selected or targeted part.
- `src/client/styles.css`: the dock and top-bar styles, the mobile dock
  layout (one scrolling swatch row; the nudge hidden on coarse pointers),
  `.wide-only`/`.narrow-only` at 700 px, and visible focus rings.

**Why.** These follow the author's interaction and camera rules (CLAUDE.md,
ADR 0003):
- contextual states instead of modes
- shortcuts that survive clicking UI
- a bounded 360° camera with Top and Reset views
- drags that never edit
- a floating dock with real thumbnails that collapses on mobile

**Who decided:**
- **Author:** the rules above.
- **Agent:**
  - the camera constants and the lens-shift framing
  - the two-tap touch confirmation
  - the click-blur focus policy
  - the `?debug` hooks
  - the dock layout and wording

**Tests:**
- Typecheck: `tsc` on this commit's tree on its own was clean.
- At 18:27 AEDT, after rebuilding `dist/` from HEAD and restarting the local
  server (`DATA_DIR=./data`, port 8080), `pnpm check` passed 42/42 and the
  typecheck was clean.
- At 18:28 AEDT, `scripts/interaction.ts` (committed next) passed 70/70 in
  three runs in local Chrome: desktop mouse at 1920×1080, keyboard only, and
  touch emulated by Chrome at 390×844.
- The interaction results are in
  `doc/evidence/shots/interaction/results.json`.

**Limitations:**
- Touch was emulated in Chrome (CDP touch events), not tried on a physical
  phone.
- Trackpad gestures were not tested.
- Not deployed: the live app still runs `9202f3f`.

### 2026-10-06 18:29 AEDT — [`d992b5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d992b5f) Browser interaction verification: desktop mouse, keyboard-only and emulated touch

**Changes:**
- New `scripts/interaction.ts`. It drives the real app in local Chrome through
  `playwright-core`, in three runs, each with a fresh browser context (a new
  visitor):
  - `desktop-mouse` at 1920×1080, then resized to 1280×720 and 390 wide
  - `keyboard-only`
  - `touch-emulated-390x844`, with `isMobile`, `hasTouch` and CDP
    `Input.dispatchTouchEvent` for taps, a one-finger drag and a two-finger
    pinch
- The script reads state through the `?debug` hooks. It writes
  `results.json` and named screenshots.
- `scripts/placement-experiment.ts` gained a header noting that it drives the
  removed Build/Select UI. It is kept because evidence 0002 cites its runs.
- New evidence files:
  - `doc/evidence/shots/interaction/` (12 PNGs and `results.json`)
  - `doc/evidence/shots/street/` (`street-desktop.png` and
    `street-mobile.png`, from `scripts/shoot.ts`)
- Bundled with it: the log entries for `7c59819` and `3875ab0`.

**Why.** The author asked for verification:
- emulated touch, labelled as emulation
- resizing
- keyboard-only use
- reloading
- regression checks of the interaction rules in CLAUDE.md

**Who decided:**
- **Author:** what had to be verified, and that emulation be labelled.
- **Agent:** the script's design and its 70 checks.

**Tests.** At 18:28 AEDT the script was run against the local server, built
from `3875ab0`: 70/70 passed, with no console errors. The results are in
`doc/evidence/shots/interaction/results.json`; this commit holds that run's
output. At 18:27, `pnpm check` passed 42/42.

**Limitations:**
- The script is not part of `pnpm check`, because it needs a desktop Chrome
  and writes files.
- The touch run is Chrome emulation, not a physical device.

### 2026-10-06 18:34 AEDT — [`493a556`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/493a556) Visible Previous/Next part buttons for the [ and ] shortcuts

**Changes:**
- `src/client/App.tsx`: a new `Step` component, with "Previous part ‹ `[`" and
  "Next part `]` ›" buttons calling `cycle(-1)` and `cycle(1)`. They appear in
  the selected-part row and in the delete-tool row; in the delete-tool row
  they step the target.
- `src/client/styles.css`: `.step`. On narrow screens the kbd hints are
  hidden, as everywhere else, so the buttons show ‹ and ›.
- `scripts/interaction.ts`: a check that the two buttons step the selection
  away and back without a new revision.
- `doc/evidence/shots/interaction/`: the results and screenshots from the run
  below.

**Why.** CLAUDE.md requires a visible button for every shortcut. While
reconciling the docs, the agent found that `[` and `]` appeared only in the
help list.

**Who decided:**
- **Author:** the rule.
- **Agent:** the gap, and where the buttons go.

**Tests.** At 18:34 AEDT, against the local server built from this tree:
- `pnpm check` passed 42/42, with the typecheck clean.
- `scripts/interaction.ts` passed 71/71: desktop mouse 48/48, keyboard only
  13/13, emulated touch 10/10.
- The new screenshots show the buttons fitting in the dock at 1920×1080 and
  390×844.

**Limitations.** Touch was emulated, as before. Not deployed.

### 2026-10-06 18:35 AEDT — [`7afcb78`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7afcb78) Evidence 0003 and ADR 0003 reconciled with the implementation

**Changes:**
- New `doc/evidence/0003-open-street-and-interaction.md`. It records:
  - the setup, and the local `pnpm check` (42/42)
  - the `scripts/interaction.ts` run (71/71), with observed values
  - the camera distances measured through `window.__camera()`
  - the screenshots
  - what was emulated and what wasn't checked
  - visible departures from the art-direction image
- `doc/adr/0003-open-street-camera-and-contextual-interaction.md`, updated to
  match what was built:
  - FOV 40° (drafted as 35°)
  - distance 14–95 (drafted as 14–75), because at 390×844 the fitted Reset
    and Top views need 71.3 and 75.3
  - the pan box, the opening view and the lens shift around the dock
  - the two-tap touch confirmation, the focus policy and the read-only
    `?debug` hooks
- `CLAUDE.md`: one rule marked *(proposed)*, to run `scripts/interaction.ts`
  after interaction, camera or dock changes and to add a check with each new
  rule or shortcut.
- Bundled with it: the log entry for `493a556`.

**Why.** The ADR's drafted camera values no longer matched the code, and the
author asked for the docs to be reconciled and the evidence recorded.

**Who decided:**
- **Agent:** the content.
- **Author:** the CLAUDE.md rule is a proposal awaiting their review.

**Tests.** Documentation only. `pnpm check:evidence` at 18:35 AEDT failed on
items that are the author's to supply:
- there is no `reflections/crit-8.md`
- `PROCESS.md` still has its template comment
- the template's example links (`a1b2c3d`, `e4f5a6b`) are not commits in
  this repo

Every commit cited in the log and in evidence 0003 exists.

### 2026-10-06 20:01 AEDT — Deployment: [`fde2560`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/fde2560) live as Fly release v4

**What happened.** The author explicitly authorised publishing the batch
`cea2752`…`fde2560`.
- `origin/main` was pushed from `a9b4c3d` to `fde2560`. The repository stays
  private.
- The CI deploy job is conditional on a public repo, so it didn't run.
  `flyctl deploy --remote-only --ha=false` was run by hand: release v4, on
  machine `84e1dea2790d38`.

**Checks, against https://comp4020-final-asuka121380.fly.dev/:**
- `/` and `/readme/` returned 200.
- The served bundle hash matches the local build of `fde2560`.
- `APP_URL=… pnpm check` passed 42/42.
- `scripts/interaction.ts` passed 71/71, with fresh test visitors. One placed
  and saved 8 parts, and they were the same after a reload.
- Read-only database queries showed the existing 11 builds and their 25 parts
  unchanged before and after the deploy and the tests (same hash).
- Details: `doc/evidence/0004-live-deploy-fde2560.md`.

**Limitations.** Touch was emulated in Chrome. Safari and physical devices
were not tested. The author's own build was not opened.

### 2026-10-06 20:05 AEDT — [`bbbcdbc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bbbcdbc) Evidence 0004: fde2560 deployed as Fly release v4, verified live

**Changes:**
- New `doc/evidence/0004-live-deploy-fde2560.md`. It covers:
  - the push, and the manual deploy (the CI deploy job is skipped while the
    repo is private)
  - the live `pnpm check` (42/42) and the live interaction run (71/71)
  - the read-only database counts and hashes showing existing builds were
    unchanged
- `doc/evidence/shots/live-fde2560/`: `results.json` and three screenshots
  from the live run.
- The deployment entry above.

**Who decided:**
- **Author:** authorised the publication.
- **Agent:** the verification and the record.

**Tests.** None beyond those recorded in the evidence. This commit is local
only; the live app runs `fde2560`.

### 2026-10-06 20:11 AEDT — [`24a8853`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/24a8853) Harness: site identity, homepage route, coastal first scene, surface-aware placement

**Changes:**
- `CLAUDE.md`:
  - The site is described as a multi-scene brick-building and
    cooperative-creation project.
  - New sections: "Site identity, routes and scenes" and "First scene:
    coastal houses".
  - The holding-a-part rules gain surface-aware height, Higher/Lower, height
    surviving horizontal moves, commit-what's-shown, and camera-relative
    arrows.
  - New "Never" lines: committing design-research screenshots, and resetting
    or silently migrating saved builds.
  - Verification rules for Safari and for checking screenshots.
- New `doc/adr/0004-site-identity-homepage-and-coastal-scene.md` and
  `doc/adr/0005-surface-aware-height-and-camera-relative-moves.md`.
- `doc/adr/0003-…` marked as superseded in part.

**Why.** To record the author's revision brief of the evening of 6 Oct
before implementing it.

**Who decided:**
- **Author:** the direction and its requirements.
- **Agent:** the mechanisms written into ADR 0004 and ADR 0005, each marked
  "agent", and the working title "Brick Commons", recorded as a placeholder
  for the author to replace.

**Tests.** Documentation only.

### 2026-10-06 20:27 AEDT — [`cbe7d30`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cbe7d30) Routes: homepage at /, editor at /build/, read-only build summary

**Changes:**
- `vite.config.ts`: two inputs, `index.html` (home) and
  `build/index.html` (editor).
- `src/client/index.html` is now a placeholder homepage, and the editor's
  HTML moved to `src/client/build/index.html`.
- New `src/client/home/main.ts`, empty for now.
- `src/server/builds.ts`: `summaryFor()`, which reads only and never creates
  a visitor or a build.
- `src/server/index.ts`: `GET /api/summary`.
- `spec/persistence.test.ts`, three new tests:
  - the summary sets no cookie and says there's no build
  - the summary counts the same build the editor loads
  - `/` and `/build/` serve, and `/build` redirects to `/build/`
- `scripts/interaction.ts` opens `/build/?debug`.

**Why.** ADR 0004: the homepage and the editor are separate pages, and the
homepage loads no three.js.

**Who decided:**
- **Author:** the separate route.
- **Agent:** two Vite pages, and the read-only summary endpoint.

**Tests.** Run on the working tree before committing, where the placement
work described next was also present:
- `pnpm check` against the local server: 49/49, typecheck clean.
- `scripts/interaction.ts` against `/build/`: 71/71.
- On this commit's tree alone (the rest stashed), `tsc` was clean.

### 2026-10-06 20:41 AEDT — [`40e2eb4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/40e2eb4) Surface-aware placement height, Higher/Lower, camera-relative moves

**Changes:**
- `src/domain/rules.ts`: `restingHeight()` (always the tallest part under
  the footprint) is replaced by `fitHeights()`. It lists every height where
  `checkFit` accepts the part: in bounds, no collision, and on the plot or
  on studs.
- `src/client/state/store.ts`:
  - `Held` swaps `lift` for an explicit `level` and a `snap` flag.
  - `preview()` returns `fits`.
  - New `stepLevel()` (Higher/Lower), `ensureAnchor()`, `moveOnScreen()` and
    `onFootprint()`.
  - `moveAnchor()` keeps the height on screen.
  - After a placement, the preview moves to the top of the part just placed.
- New `src/client/state/view.ts`: maps the camera azimuth to one of four
  grid quadrants, with 10° of hysteresis past each diagonal.
  `screenToGrid()` turns a screen direction into a grid step.
- `src/client/scene/Workbench.tsx`:
  - `aimOf()` reads the surface: on the plot or a part's top the level is
    exact; on a side face it is approximate and may drop to a level that
    fits.
  - Hover re-aims only when the aim changes.
  - A click or tap on the ghost, or inside the shown footprint, places
    exactly what's shown. Anywhere else it only aims.
  - Parts above a low preview are faded, and hover looks through them.
  - Top view keeps the azimuth, and the azimuth is reported to `view.ts`.
  - New `?debug` hook `__orbit`, which moves only the camera.
- `src/client/scene/PartMesh.tsx`: a `faded` see-through material.
- `src/client/keyboard.ts`: the arrows call `moveOnScreen()`, and
  PageUp/PageDown call `stepLevel()`.
- `src/client/App.tsx`: a Height row (▼ Lower, the height in words with "n of
  m", ▲ Higher), visible on every device. The direction pad uses the
  screen-relative moves.
- `src/client/main.tsx`: `?debug` hooks `__preview` and `__quadrant`.
- New `scripts/placement.ts`: 31 browser checks. New
  `spec/domain/fit-heights.test.ts`: 4 tests.
- ADR 0005 updated to the snap rule as built: exact on top faces, down-only
  on side faces.

**Why.** These are the author's two confirmed bugs from testing in Safari:
lower positions were unreachable, and the arrows used world axes. ADR 0005
traces the first to four combined causes.

**Who decided:**
- **Author:** the required behaviour.
- **Agent:** the mechanism. That covers snapping only on side faces,
  downwards; the stacking default after a placement; fading with hover
  looking through; the 10° hysteresis; and the ghost being clickable.

**Tests:**
- `pnpm check` against the local server: 49/49.
- `scripts/placement.ts` in Chrome: 31/31. It checks:
  - lower placement under an overhang, with heights [0, 6] offered
  - Higher/Lower buttons and PageUp/PageDown
  - a click committing the shown low preview while the pointer is on the
    overhang's top
  - the height surviving horizontal moves, and being kept and explained
    where it doesn't fit
  - an invalid lower spot refused with no request sent
  - arrows from front, back, both sides, two oblique views and two top views
    all moving within 60° of the screen direction meant
  - the button and the key making the same step
  - the hysteresis sequence
  - emulated touch reaching the lower spot with the Lower button and
    committing it
- `scripts/interaction.ts`: 71/71.

**Limitations:**
- WebKit/Safari was not run yet at this commit.
- Touch is emulated.
- With the keyboard, continuing a course sideways after a placement needs
  Lower.

### 2026-10-06 20:38 AEDT — [`d6746df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d6746df) Shared red/white/yellow identity and a designed homepage

**Changes:**
- New `src/client/ui/theme.css`, the shared tokens and components:
  - red `#e3241b`, yellow `#ffcd00`, paper `#fffaf1` and ink `#1b1b1f`
  - tactile `.btn` variants, `.card`, `.tag` / `.tag-planned`
  - `.stud-swatch` colour studs, `.tile` tray tiles, `.brand`
- New `src/client/ui/iso.ts`, an SVG isometric brick builder (drawn column
  by column, so faces overlap correctly), plus the brand mark.
- `src/client/index.html`, `src/client/home/main.ts` and
  `src/client/home/home.css`: the homepage at `/`, in static HTML. It has:
  - a hero with an animated brick composition and a Start/Continue button
    (Continue only when `/api/summary` reports a saved build)
  - "how it works"
  - a "together" section labelled as planned, with no working-looking
    controls
  - the scene list, rendered from the registry
  - links to `/readme/`
  - a disclaimer that the site is not a LEGO product
- New `src/client/scenes/registry.ts` and `scenes/beach/info.ts`: scene
  metadata only (title, setting, blurb, cover, suggested colours). The scene
  id stays `street-01`, so saved builds are untouched.
- `src/domain/colours.ts`: six bright colours, added only.
- `package.json`: self-hosted OFL fonts (`@fontsource-variable/fredoka`,
  `/nunito`).

**Why.** The author's brief asks for a global identity separate from the
first scene, and a homepage at `/` that loads no editor code.

**Who decided:**
- **Author:** the palette direction, the homepage contents, and cooperation
  shown as planned only.
- **Agent:** the tokens, the component set, the isometric drawings, the
  font choice, and the working title "Brick Commons", which is a placeholder
  for the author to replace.

**Tests:**
- `pnpm build`.
- The homepage was checked by eye in Chrome at 1920×1080 and 390×844.
- `pnpm check` was not re-run at this commit; it is recorded with the next
  entry.

**Limitations:**
- The scene card's cover image (`/scenes/beach-houses.webp`) does not exist
  yet; the card shows a gradient placeholder.
- The editor is not restyled yet.

### 2026-10-06 21:00 AEDT — [`57549ea`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/57549ea) Coastal first scene: beachfront, golden-hour light, sea, dunes, hillside town

**Changes:**
- `src/client/scene/Street.tsx` is removed. `src/client/scenes/environments.tsx`
  maps a scene id to a lazily loaded environment, and the workbench renders
  whichever one it gets, so shared code holds no scenery.
- New `src/client/scene/Plot.tsx` holds the plot plate and the invisible aim
  plane that were in `Street.tsx`.
- New `src/client/scene/Batched.tsx` draws one mesh per colour, with glass
  and lantern materials.
- `src/client/scenes/beach/`:
  - `Environment.tsx`: four neighbours on plinths 0–1.2 high (pink with a
    flat roof and a balcony; three-storey turquoise; turned lavender; yellow
    with wide glass). Also gardens, a promenade with a low sea wall, benches,
    lamps, palms clear of the plot, lifeguard huts, beach houses along the
    shore, a pier, and a hillside town of terraced streets facing the sea.
  - `sky.ts`: one `SUN_DIR`, about 19° up over the sea. It drives the sky
    shader (gradient, glow, low clouds, sun disc), the environment map
    rendered from that same sky, the shadow-casting sun light, and the sea's
    glitter.
  - `water.ts`: a shader sea with ripples, fresnel sky reflection, sun
    glitter, a foam line and see-through shallows.
  - `terrain.ts`: the beach falls about 1.5 to the water, with low dunes away
    from the plot. The land rises inland, and painted ridges sit only on the
    inland side.
- `src/client/scene/scenery.ts`:
  - house specs gain three storeys, flat roofs, plinths with steps and
    balconies
  - wide windows
  - `Batch.bounds()`
- New `src/client/scene/obstacles.ts`. The environment registers its houses'
  and near palms' boxes. If an orbit or zoom would put the camera inside one,
  the camera is moved out towards the plot. A house between the camera and
  the plot is left alone.
- The canvas uses soft shadows and `NeutralToneMapping`, and the part
  thumbnails use the same tone mapping.

**Why.** This is the author's coastal direction (ADR 0004): houses facing the
beach, golden hour with the sun over the sea, and consistent light. An orbit
at full zoom-out could previously put the camera inside a neighbour.

**Who decided:**
- **Author:** the layout order, the light, the terrain and the hybrid
  scenery approach.
- **Agent:** the specific houses, colours, sun angle, shader treatments,
  hillside town and camera keep-out.

**Tests:**
- `pnpm check` (local): 49/49.
- `scripts/placement.ts` in Chrome: 31/31.
- `scripts/interaction.ts`: 71/71.
- Screenshots were inspected by eye in Chrome at 1920×1080 and 390×844:
  default, back-oblique (sea, beach and plot together), top, side views, and
  full zoom-out from inland and from the side.

**Limitations:**
- All textures are procedural or canvas-drawn, so there are no image assets
  or licences to track.
- In top view the pale parts take a slight blue cast from the sky fill.
- Seen from the side at full zoom-out, the plot can be hidden behind a
  neighbour; that is an ordinary occlusion and orbiting past it clears it.

### 2026-10-06 21:12 AEDT — [`c1de11b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c1de11b) Editor restyled from the shared identity; home ↔ build route checks

**Changes:**
- `src/client/styles.css` is rewritten on the tokens in `src/client/ui/theme.css`.
  It replaces the grey glass with:
  - white chips with a raised edge
  - a paper-coloured dock with a red top border
  - a recessed tray of part tiles
  - ink pill tabs and an ink notice
  - green and red preview labels
- On mobile:
  - the tray hides its scrollbar
  - tiles are 4.7rem wide with 48px thumbnails
  - part names are clamped to two lines, so the tiles stay level
  - the brand name is hidden, leaving the mark
- `src/client/App.tsx`:
  - buttons use the shared `.btn` classes (Place is `.btn-red`; Delete is
    `.btn-danger`)
  - tray parts are `.tile`s
  - colours are `.stud-swatch`es, with the scene's suggested colours first
    and the rest after a divider; the radio role and labels are unchanged
  - the title chip holds the brand mark as a Home link (`.home-link`) and the
    scene's title from the registry
  - the target card has an instruction-step header
- `src/client/ui/theme.css`:
  - the focus ring is now `outline: 3px solid var(--blue)`, not a box-shadow
  - `.btn-danger` is added
- `src/client/main.tsx` loads the Fredoka and Nunito fonts (self-hosted
  through fontsource) and `theme.css` before `styles.css`.
- `src/client/build/index.html` gets the title "Beach Houses · Brick
  Commons", a description and the red favicon.
- `scripts/interaction.ts` gains a `routes` run of 10 checks:
  - a fresh homepage offers "Start building"
  - the homepage loads no editor, environment or three.js chunk
  - the homepage sets no cookie
  - after one placement, the Home link leads to "Continue my build"
  - home → build → home → build keeps the same build and stock
  - a reload keeps the build
  - `/build` redirects to `/build/`
  - `/readme/` answers
  - no console errors
- Log entry for `57549ea`.

**Why.** ADR 0004 says the editor is styled from the shared UI, quieter than
the homepage, and not grey glass. Moving between `/` and `/build/` must keep
the same visitor and build.

**Who decided:**
- **Author:** that the editor shares the homepage's identity at lower volume,
  and the route behaviour.
- **Agent:** the component choices, the suggested-colours split, the outline
  focus ring and the route checks.

**Tests:**
- `scripts/interaction.ts` (Chrome, against the local server): 81/81 (71
  before, plus 10 routes). Before the focus-ring change, "the focused control
  shows a focus ring" failed: the tile's own box-shadow replaced the ring.
- `scripts/placement.ts`: 31/31 in Chrome and 31/31 in Playwright's WebKit
  build.
- `pnpm check` (local): 49/49.
- Screenshots were inspected at 1920×1080 and 390×844:
  [doc/evidence/shots/coastal-c1de11b/](doc/evidence/shots/coastal-c1de11b/).

**Limitations:**
- On mobile, while a part is held, the dock stacks its title, swatches,
  height and actions, hint, tabs and tray, so it takes a large share of the
  screen. The plot stays visible above it.

### 2026-10-06 21:22 AEDT — [`b76a01f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b76a01f) Beach Houses cover rendered from the scene; only hashed assets cached for good

**Changes:**
- New `src/client/public/scenes/beach-houses.webp`, 1200×750 and 41 KB. It
  shows the empty plot between the lavender and pink houses, seen from the
  lane behind, with the beach, sea and evening sky. It was rendered in
  Chrome from this project's scene, with the UI hidden.
- Until now the homepage's scene card named this path, but no file existed,
  so the card showed only its placeholder.
- `src/client/scenes/beach/info.ts`: the alt text describes the new cover.
- `src/client/home/main.ts`: the cover's `height` attribute is corrected from
  675 to 750.
- `src/server/index.ts`: only paths under `/assets/` (Vite's hashed files)
  get `public, max-age=31536000, immutable`. Everything else is now
  `no-cache`. Previously every non-HTML static file was immutable, which
  would have kept a replaced, unhashed cover stale in browsers.
- Log entry for `c1de11b`.

**Why.** The homepage's scene card needs a real picture of the scene (ADR
0004), drawn from the project's own work so that no third-party imagery is
served.

**Who decided:** the agent, on the camera angle for the cover and the cache
rule.

**Tests:**
- `curl -I` against the local server: `/` and the cover return `no-cache`,
  and `/assets/*.js` returns `immutable`.
- Homepage screenshots at 1920×1080 and 390×844 show the cover in the card.
- At this commit:
  - `pnpm check`: 49/49
  - `scripts/interaction.ts` in Chrome: 81/81
  - `scripts/placement.ts`: 31/31 in Chrome and 31/31 in Playwright's
    WebKit build
- Details are in [evidence 0005](doc/evidence/0005-coastal-scene-identity-and-placement.md).

**Limitations:** the cover is a still picture taken at one moment. It has to
be re-rendered by hand whenever the scenery changes.
