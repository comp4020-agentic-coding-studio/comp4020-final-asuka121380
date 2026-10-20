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

### 2026-10-06 21:28 AEDT — [`b184781`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b184781) Evidence 0005, visual-identity research note, ADR 0004 reconciled

**Changes:**
- New [doc/evidence/0005-coastal-scene-identity-and-placement.md](doc/evidence/0005-coastal-scene-identity-and-placement.md). It records:
  - two local runs: run 1 on the code of `c1de11b`, run 2 at `b76a01f`
  - what each placement and routes check shows
  - the cache headers observed
  - what was emulated and what was not tested
  - the visual limitations
  - where the assets came from
- New `doc/evidence/shots/coastal-c1de11b/`: 15 screenshots (Chrome desktop
  and emulated mobile, two from Playwright's WebKit build) and three result
  files. The result files hold no cookies or identifiers.
- New [doc/research/0001-visual-identity.md](doc/research/0001-visual-identity.md):
  text-only notes, for the official LEGO.com design (as read by third
  parties), the LEGO Builder app, LEGO Fortnite's build UI and react-legos.
  It ends with a comparison table against this project's tokens.
- [ADR 0004](doc/adr/0004-site-identity-homepage-and-coastal-scene.md) now
  records what was built:
  - the registry split into homepage-safe metadata and lazily loaded
    environments
  - the light kept as code in the scene's folder, not as registry parameters
  - the sun at about 19°
  - the near, middle and far tiers, with the far one a painted inland canvas
  - the camera keep-out
  - the fonts and the outline focus ring
  - the cache rule
  - the self-rendered cover

**Why.** These are step 8 of the revision brief: verify, capture, and bring
the ADR into line with the implementation.

**Who decided:** the agent wrote these. The research note says that the web
searches were run after the identity was built, as a check, and that nothing
was changed because of them.

**Tests:**
- `pnpm check:evidence` failed with four items, all of them author
  materials:
  - no `reflections/crit-8.md`
  - `PROCESS.md` still holds the template comment
  - two example hashes, `a1b2c3d` and `e4f5a6b`, cited by the template
    text in `PROCESS.md`
- No check was changed to make it pass.

**Limitations:** none of this revision is deployed. The live site remains
`fde2560`, release v4.

### 2026-10-06 21:45 AEDT — Deployment: [`c10dfcd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c10dfcd) live as Fly release v5

**What happened.** The author explicitly authorised pushing and deploying the
revision `bbbcdbc`…`c10dfcd`.
- `origin/main` was pushed from `fde2560` to `c10dfcd`, without force. The
  repository stays private.
- The CI deploy job is conditional on a public repo, so it didn't run.
  `flyctl deploy --remote-only --ha=false` was run by hand: release v5, on
  machine `84e1dea2790d38`.

**Checks, against https://comp4020-final-asuka121380.fly.dev/:**
- `/`, `/build/`, `/readme/`, the scene cover and `/api/summary` returned
  200, and `/build` returned a 301 redirect.
- Pages and the cover are served `no-cache`.
- The live editor page names the same hashed bundle as the local build.
- `APP_URL=… pnpm check`: 49/49.
- `scripts/interaction.ts`: 81/81, with fresh test visitors.
- `scripts/placement.ts` in Chrome: 31/31.
- Details: [evidence 0006](doc/evidence/0006-live-deploy-c10dfcd.md).

**Limitations:**
- No database snapshot was taken this time. The read-only query used for
  evidence 0004 was refused by the session's permission policy.
- `src/server/db.ts` and `src/domain/scene.ts` are unchanged since `fde2560`
  and there is no migration, but the existing builds were not observed.
- Touch was emulated. Safari and physical devices were not tested. The
  author's own build was not opened.

### 2026-10-06 21:49 AEDT — [`6dcc2f4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/6dcc2f4) Evidence 0006: c10dfcd deployed as Fly release v5, verified live

**Changes:**
- New [doc/evidence/0006-live-deploy-c10dfcd.md](doc/evidence/0006-live-deploy-c10dfcd.md),
  recording the push, the pre-push scan, the deploy, and the live checks
  listed in the deployment entry above.
- New `doc/evidence/shots/live-c10dfcd/`: four live screenshots and two
  result files. The result files hold no cookies or identifiers.
- The deployment entry for release v5, in this log.

**Who decided:** the author authorised the deploy; the agent wrote the
record.

**Tests:** none beyond the live runs this commit records.

**Limitations:** this commit is local only; it is not pushed.

### 2026-10-07 12:22 AEDT — [`7e06dec`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7e06dec) C8 argument, process and reflection

**Changes:**
- Replaced the `README.md` template with the definition of good: collective
  creative decisions, complementary contributions and a building that can
  carry shared memories. Distinguishes planned cooperation from the implemented
  solo foundation, cites references, and states tested promises and limitations.
- Replaced the `PROCESS.md` template with the C8 account, linking 14 existing
  commits to stack choices, environment and interaction revisions, verification
  and the limits of the visual research. Retains explicit AI-writing provenance.
- Added `reflections/crit-8.md`, answering both standing prompts around the
  author's breakthrough: moving from an isolated model to building in a place.
- No application code, infrastructure, saved data or test expectations changed.

**Why and who decided:** the author explicitly asked Codex to draft these
documents from their design discussions and the repository history, specified
the reflection's breakthrough, requested the stronger collective-creation
argument, then authorised committing and pushing. This is a task-specific
authorisation to draft the normally author-written documents, not a change to
the standing harness rule. Codex wrote and checked the documents. The committed
diff and its file statistics were inspected before this log entry was written.

**Checks run by Codex before this commit:**
- `pnpm check:evidence`: passed; the C8 reflection exists and all 14 cited
  PROCESS commits resolve.
- `APP_URL=http://localhost:8080 pnpm check`: typecheck passed, 49/49 tests
  passed against the local app, using fresh local test visitors.
- `git diff --check`: clean.
- The course secret scanner fetched remote refs and scanned the publishable
  worktree and Git history: clean. Pattern scanning is not a guarantee.
- GitHub reports the repository is already public. The latest earlier CI run
  was skipped; this entry does not claim a successful deployment of this commit.

**Limitations:** visual and physical-device checks were not repeated for this
documentation-only change. Online README verification, CI and the C8 tag still
need checking after the push; no result is asserted in advance here.

### 2026-10-13 16:29 AEDT — [`d8e9f27`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d8e9f27) Harness and ADRs 0006-0009: identity recovery, rooms, realtime, plans

**Changes:**
- New `doc/adr/0006-identity-and-recovery.md`: cookie-first identity stays
  as it was; an opt-in, single-use recovery code (stored only as a hash,
  rate-limited, never logged or put in a URL, separate from friend links)
  lets a player link a second browser to the same identity.
- New `doc/adr/0007-rooms-shared-inventory-and-access.md`: a build belongs
  to a room, not a visitor. Beach Houses' room capacity is 2, set in scene
  configuration. Invite-only rooms require a checked, server-side
  invitation; friendship never substitutes for one. The host has no
  runtime authority and a room survives the host leaving.
- New `doc/adr/0008-realtime-transport-and-concurrent-editing.md`: the
  crit 9 decision record. Server-sent events for the transport. A
  placement is validated against live state only, never gated on a stale
  whole-room revision; an edit to an existing part is gated on that part's
  own last-known state instead, so an unrelated change elsewhere never
  rejects it. Records the alternative (a whole-room lock) and its cost.
- New `doc/adr/0009-plans-attribution-snapshots-and-publication.md`:
  transparent plans cost no stock and never block real construction; any
  member may realize or mark one; attribution is layered (placedBy never
  overwritten, editedBy and proposedBy recorded separately); a snapshot is
  an immutable, single-revision capture any member may take; publication
  is a room-creation setting whose restriction is computed once from the
  room's continuation lineage, never re-derived from a possibly-changed
  setting later.
- `CLAUDE.md`: the milestone, Never list and a new "Rooms, realtime and
  cooperation" section are updated to match. The old personal-inventory
  design is marked explicitly superseded rather than silently dropped.

**Why.** These are the phase 2 brief's four decisions, raised by the agent
and settled by the author (13 Oct 2026) before any implementation: identity
and recovery, Beach Houses' room capacity, publication rights, and plans
in saved snapshots.

**Who decided:** the author set all four policies, including a correction
of the agent's initial host-only publication recommendation to "any member
may publish, if the room allows it." The agent wrote the records and the
implementation choices marked "agent" within them.

**Tests:** none; this commit is documentation only.

**Limitations:** none of the behaviour these ADRs describe is implemented
by this commit alone; the following commits build it.

### 2026-10-13 16:29 AEDT — [`1b01620`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1b01620) Domain: plans, per-part conflict checks, maxPlayers

**Changes:**
- `src/domain/rules.ts`: `Plan` type; `validatePlan` (bounds and a looser
  `plausibleSupport` check, never real-part occupancy), `validateWithdrawPlan`,
  `validateRealizePlan` (re-validates with the ordinary `validatePlacement`
  against current state) and their `apply*` counterparts. `checkPartRevision`
  for ADR 0008's per-part conflict check. `PlacedPart` gains `placedBy`,
  `editedBy`, `proposedBy`, `rev`. `validateCommand`/`applyCommand` dispatch
  the three new command types and take an `actorId`.
- `src/domain/commands.ts`: `Command` gains `propose-plan`, `withdraw-plan`,
  `realize-plan`; `remove`/`recolour`/`rotate` gain optional `expectedRev`.
  `Snapshot` gains `plans`, `contributors`, `members`, `maxPlayers`, `roomId`,
  `visibility`, `allowPublish`, `hostId`.
- `src/domain/scene.ts`: `SceneTemplate.maxPlayers`. Beach Houses: 2.

**Why.** The shared rules the server validates with, and the client previews
with, need the same new vocabulary (ADR 0007-0009) before either side can be
written against it.

**Who decided:** the agent, implementing the author's ADR decisions.

**Tests:** `pnpm typecheck` passed at this point in the sequence (the
server and client were updated in the next two commits; this one alone
left both non-compiling against the new domain types, which is expected
mid-sequence and was not a state the app was ever run in).

**Limitations:** none beyond what the later commits in this sequence
complete.

### 2026-10-13 16:30 AEDT — [`ba5d94f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ba5d94f) Server: rooms, realtime SSE, plans, friends, snapshots, publication

**Changes:**
- `src/server/db.ts`: migration 2 adds `rooms`, `room_members`,
  `room_invites`, `room_contributors`, `plans`, `recovery_codes`,
  `sessions`, `friendships`, `friend_requests`, `snapshots` and its four
  child tables, `publications`, `room_activity`; `parts` gains
  `edited_by`/`edited_at`/`proposed_by`/`rev`. A startup `backfillRooms`
  gives every pre-existing build an invite-only, non-publishable room with
  its original visitor as host and sole member, touching no part, quantity
  or revision.
- New `src/server/identity.ts`, `rooms.ts`, `realtime.ts`, `friends.ts`,
  `snapshots.ts` (see ADRs 0006-0009 for what each does).
- `src/server/builds.ts` is rewritten around `room_id`; `runCommand`
  records `room_activity`, contributor rows and per-part `rev` bumps, and
  pushes the committed snapshot over `realtime.ts`.
- `src/server/index.ts` adds the room, identity, friends and
  snapshot/showcase routes. `POST /api/command` is kept as a back-compat
  path onto the caller's own default room, and still refuses a request
  with no visitor cookie outright, exactly as C8.
- New `spec/realtime.test.ts`, `plans-and-attribution.test.ts`,
  `snapshots-and-showcase.test.ts`, `friends-and-identity.test.ts`.

**Why.** This is the brief's slice A/B/C/D/E server-side implementation,
built in one commit because the modules are small and mutually dependent;
the ADRs record the decisions separately from this commit's mechanics.

**Who decided:** the agent, implementing the author's ADR decisions.

**Tests:**
- Migration verified against a database seeded with the live `c10dfcd`
  schema (one visitor, one build, one part, real stock): after upgrading,
  the original cookie still resolved, through the new `sessions` table, to
  a room containing the exact original part (`brick-2x4@3,0,2`, navy) and
  its original stock (`brick-2x4: 10`), unchanged.
- `pnpm check` (local, fresh server): 75/75 (49 existing plus 26 new across
  the four new spec files), run against a live server with every test
  using its own freshly created visitor and room.
- `pnpm check:evidence`: unaffected, still green.

**Limitations:**
- The realtime bus is in-process, with no cross-instance fan-out; noted in
  ADR 0008 as revisited only if the app ever runs more than one machine,
  which it does not (`fly.toml`: one machine).
- No UI yet for the public lobby, friend requests or the showcase; the
  server routes exist and are tested over HTTP, but nothing in the editor
  links to them yet.

### 2026-10-13 16:30 AEDT — [`26377d7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/26377d7) Client: realtime sync, propose/realize/withdraw/mark a plan

**Changes:**
- `src/client/state/store.ts`: `start()` opens an `EventSource` on the
  loaded snapshot's room once the transport is durable; a pushed snapshot
  replaces the live one, and a `plan-marked` event is recorded for the
  Workbench to draw. `rotate`/`remove`/`recolourSelected` now send the
  target part's own `rev`. New `proposeHeld`, `withdrawPlan`,
  `realizePlan`, `markPlanForEveryone`, and `selectedPlanId`.
- `src/client/scene/Workbench.tsx` and `PartMesh.tsx`: open plans render
  as the same translucent ghost a live preview uses, with a blue outline
  when selected and a brighter pulse (locally faded after 6s) when marked.
  Clicking a plan selects it unless a part is held or the delete tool is on.
- `src/client/App.tsx`: "Propose instead" while holding a part; a selected
  plan's own panel (Build this / Mark for everyone / Withdraw / Deselect).
- `src/client/keyboard.ts`: Enter builds a selected plan; Delete/Backspace
  withdraws one.

**Why.** The brief's non-verbal cooperation slice (B): plans and marks need
to be visible and actionable in the actual 3D editor, not only over the API.

**Who decided:** the agent. The visual treatment (reusing the existing
ghost material, a blue outline family distinct from the amber
selection/red delete tints already in use) follows the project's existing
identity rather than introducing a new one.

**Tests:**
- `pnpm check` (local): 75/75.
- `scripts/interaction.ts` in Chrome: 81/81 (unchanged from before this
  phase; confirms the solo C8 experience is untouched).
- `scripts/placement.ts`: 31/31 in Chrome and 31/31 in Playwright's WebKit
  build (unchanged).
- Two independent Chromium browser contexts (two distinct cookies, never
  sharing one, per the brief's instruction not to verify multiplayer with
  two tabs of one identity): one proposed a plan and called "mark for
  everyone"; the other, already subscribed to the room's own SSE stream
  before the mark was sent, received the `plan-marked` event on its own
  connection. This is the real client/server path exercised live, not a
  simulated one, though it was run from a throwaway script, not committed.

**Limitations:**
- No room-switching UI yet: the editor still only ever opens the visitor's
  own default room (the back-compat `/api/build` path). Joining another
  room, or a second room's live view, has only been exercised directly
  over the API and in the ad hoc two-context script above, not through the
  editor's own interface.
- No UI yet for creating a room with chosen visibility/publish settings,
  the public lobby, friend requests, saving/publishing a snapshot, or
  continuing one. These exist and are tested server-side (previous commit)
  but are not reachable from the editor.
- The "mark for everyone" cue's colour (blue) is shared with the plan
  "selected" outline; on the same screen they are distinguishable by
  brightness and the accompanying "Selected a proposed…" notice, but this
  has not been checked for a colourblind viewer.

### 2026-10-13 16:31 AEDT — [`8fa3046`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/8fa3046) Spec: upgrade test uses the new identity/db exports

**Changes:**
- `spec/server/upgrade.test.ts`: imports `visitorFor` from the new
  `identity.ts` instead of `builds.ts`; its v1 seed now calls the exported
  `backfillRooms` (which a real restart runs automatically via
  `openDatabase`) so the manually-seeded pre-rooms build gets a room row
  before `buildFor` reads it; its `runCommand` call site gains the room id;
  its first assertion is loosened to `objectContaining`, since a part now
  carries `placedBy`/`rev` the original exact-equality check didn't expect.

**Why.** `visitorFor` moved modules in the same commit sequence (ADR
0006/0007); this test needed to follow it to keep compiling and testing
the real upgrade path, not a stale one.

**Who decided:** the agent.

**Tests:** part of the 75/75 reported in `ba5d94f`.

**Limitations:** none.

### 2026-10-13 18:15 AEDT — [`e132a5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e132a5f) Routing split into home/lobby/editor; room reachability fixes

**Changes:**
- `/build/` becomes a room lobby (served from the existing
  `src/client/build/index.html`, repurposed); the editor moves to
  `/build/room/:id`, a new route backed by `src/client/build/room/index.html`,
  registered in `src/server/index.ts` ahead of `express.static` so it isn't
  shadowed by that directory's own index page. `vite.config.ts` builds all
  three entries (home, lobby, editor).
- `src/server/rooms.ts`: `join`, `leave` and `sweepPresence` now push a
  snapshot over SSE on any real presence transition (an away member
  reconnecting; someone joining or leaving), not only on a command commit.
  The SSE keep-alive's own 10-second heartbeat is excluded, so it never
  spams a snapshot to the room on its own.
- `respondToInvite`: accepting an invitation now admits the visitor as a
  room member in the same transaction (still capacity-checked against
  `scene.maxPlayers`), instead of only marking the invitation accepted and
  leaving them with no way to reach the room.
- `src/client/state/transport.ts`: loading a room's data now calls its join
  endpoint first, so a direct link, a reload, or the browser's own
  `EventSource` reconnect are all checked exactly as a fresh join would be.
- `spec/persistence.test.ts`'s route test is rewritten for the three-page
  structure.

**Why.** Driving the actual lobby and editor with two independent browser
identities (not the API directly) surfaced all three gaps: a joining member
was invisible to the room until someone else built something; an accepted
invitation was a dead end; and a reload of an invite-only room the visitor
was already in was indistinguishable, in the client's eyes, from one they'd
never been let into.

**Who decided:** the agent, implementing the author's priority order
("implement the public lobby and room creation/joining first, then
friendship and invitations").

**Tests:**
- `pnpm check` (local): 75/75.
- `scripts/interaction.ts`: 83/83. `scripts/placement.ts`: 31/31 in Chrome
  and 31/31 in Playwright's WebKit build.
- `pnpm check:evidence`: unaffected, still green.

**Limitations:** see `cbe7d30`-era routes; no change to the homepage.
Evidence of the end-to-end fixes themselves is in `e388b98`'s entry below.

### 2026-10-13 18:16 AEDT — [`e29fe11`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e29fe11) Lobby UI: create/join a room, friends, invitations, identity recovery

**Changes:**
- New `src/client/lobby/`: `LobbyApp.tsx` (build alone; start a room with a
  real, independent visibility and publish choice; join by code; the
  public lobby's live, polled, never-fabricated list; room invitations;
  friends; the opt-in recovery-code panel), `lobby.css` (the editor's
  tokens and components, no new visual language), `main.tsx`.
- `src/client/state/api.ts` (moved from `lobby/` once the editor needed it
  too): every fetch wrapper for rooms, friends, invites and snapshots.
- `src/client/App.tsx`: a Room panel in the header (current members and
  permanent contributors kept visibly distinct, invite a friend by id,
  save a copy, leave), a `ConnectionChip` for the realtime stream's own
  state, and a full-page `AccessScreen` for a room that can't be opened at
  all (invite-only with no invitation, full, or gone).
- `src/client/state/store.ts`: `ConnectionStatus`, `selfId`, the room id set
  once at startup. `src/client/state/transport.ts`: `RoomFullError`
  alongside the existing `AccessError`.
- `scripts/interaction.ts`/`placement.ts`: the editor is reached by driving
  the lobby's own buttons, and every `networkidle` wait is replaced with
  `domcontentloaded`, since an open SSE connection means the network
  never truly idles.

**Why.** A working server is not a usable feature until the interface
reaches it; this is the brief's priority 1–4 made clickable.

**Who decided:** the agent. The visual choices (reusing `.chip`, `.card`,
`.btn`, `.tag` and the dock's help-panel pattern for the Room panel) follow
the author's instruction to integrate functionally, not redesign.

**Tests:**
- `pnpm check` (local): 75/75. `scripts/interaction.ts`: 83/83.
  `scripts/placement.ts`: 31/31 in Chrome and 31/31 in WebKit.
- Screenshots in `doc/evidence/shots/rooms-lobby/` (committed in `e388b98`).

**Limitations:** no UI yet for browsing, continuing or publishing a saved
snapshot (the server endpoints exist; "Save a copy" is reachable, nothing
else is yet).

### 2026-10-13 18:17 AEDT — [`e388b98`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e388b98) Two-identity verification: multiplayer.ts, invites.ts; evidence screenshots

**Changes:**
- New `scripts/multiplayer.ts`: two independent browser contexts (distinct
  cookies, never two tabs of one identity) driven entirely through visible
  controls. A creates a public room through the lobby; B discovers and
  joins it from the public list; both place, recolour and remove real
  bricks, with propagation measured from each side's own live state; two
  simultaneous placements in different spots both succeed; a plan is
  proposed, selected, marked and realized, each step's propagation also
  measured; a reload is confirmed to restore the authoritative room.
- New `scripts/invites.ts`: a friend-request link that never grants
  friendship merely by being opened; an invite-only room that refuses both
  an uninvited friend and an uninvited stranger; a host invitation that,
  once accepted, admits the acceptor immediately and usably.
- New `doc/evidence/shots/rooms-lobby/`: the lobby page, the editor's Room
  panel open on an invite-only room, and each identity's final screen from
  the multiplayer run.

**Why.** The author's instruction: "verify the complete flow through
visible browser controls using two independent browser identities...
measure propagation of actual building changes... do not rely on manually
injected room membership or API-only setup as proof."

**Who decided:** the agent.

**Tests, run against a local server (this commit's own evidence):**
- `scripts/multiplayer.ts`: 15/15. Measured propagation: a placement 2-4ms,
  a recolour 2-3ms, a removal 2-4ms, two simultaneous placements 2-4ms, a
  proposed plan 2-4ms, a live mark 9-50ms, a realized plan 2-4ms — all well
  under the brief's roughly-one-second bar, and all measured as the time
  until the *other* browser's own live state reflected the change, not a
  server-side timestamp.
- `scripts/invites.ts`: 7/7.
- `pnpm check`: 75/75. `pnpm check:evidence`: unaffected.

**Limitations:**
- Both scripts ran once, locally, in Chrome only, on one machine; the
  measured times are not a statistical guarantee, only a demonstration
  that propagation is not accidentally slow.
- Neither the deployed app nor a physical second device was used; this
  revision has not been pushed or deployed.

### 2026-10-13 19:33 AEDT — [`62cdb5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/62cdb5f) Separate inherited credits from room contributors; close public-room publication bypass

**Changes:**
- `src/server/db.ts`: migration 3 adds `room_inherited_credits` and
  `snapshot_inherited_credits` (`room_id`/`snapshot_id`, `visitor_id`,
  `first_contribution_at`).
- `src/server/rooms.ts`: `seedFromSnapshot` now writes a continued room's
  prior contributors into `room_inherited_credits`, not `room_contributors`
  — the earlier implementation had merged the two, conflating "credited
  from an earlier version" with "actually built in this room", which
  ADR 0009 explicitly requires stay distinct. `createRoom` now reads the
  source snapshot's `allow_publish` when `opts.fromSnapshotId` is set, and
  clamps the new room's `visibility`/`allowPublish` to `invite_only`/
  `false` whenever it is false, regardless of what was requested.
  `snapshotOf` returns `inheritedCredits` separately from `contributors`.
- `src/server/snapshots.ts`: `saveSnapshot` persists `source_snapshot_id`
  and writes `room_inherited_credits` into the new
  `snapshot_inherited_credits` table, kept distinct from
  `snapshot_contributors`. `getSnapshot`/`snapshotsSavedBy` read and
  return both credit kinds and `sourceSnapshotId`.
- `src/domain/commands.ts`: `Snapshot` gains `inheritedCredits` alongside
  `contributors`; `src/client/state/transport.ts`'s local (solo) transport
  updated to satisfy the new field.

**Why.** Reviewing the already-implemented backend against the brief's
exact wording before building UI on top of it surfaced two real gaps,
neither flagged by a failing test: (1) the brief says "do not describe
inherited creators as people who joined the new room", which the
contributor-merging code was silently violating; (2) the brief's
publication-restriction requirement says a restricted snapshot must not
be exposed "through a public room or preview", and `createRoom` was only
enforcing the publish flag, not room visibility/listing — a public,
listed, joinable-by-anyone room is itself a disclosure path independent
of the showcase.

**Who decided:** the agent, by re-reading the approved brief and ADR 0009
against the existing implementation.

**Tests:**
- `pnpm check` (local, fresh server): 76/76 (was 75 before this session;
  one new test added in `ab6aef9`).
- `spec/snapshots-and-showcase.test.ts`'s existing "no laundering" test
  was updated in the same work (committed separately in `ab6aef9`) because
  its old assertions expected the pre-fix (vulnerable) behaviour.

**Limitations:** none known beyond what's noted in ADR 0009's "As built"
section.

### 2026-10-13 19:33 AEDT — [`eb17e4b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/eb17e4b) Collection, read-only snapshot viewer and public showcase UI

**Changes:**
- New `src/client/lobby/Collection.tsx`: `CollectionPage` (lists a
  visitor's saved snapshots via `mySnapshots()`, with View/Publish
  actions), `ShowcasePage` (lists published entries via `showcaseList()`),
  `SnapshotViewerPage` (loads a snapshot or showcase entry, renders it
  read-only via `SnapshotView`, shows `Credits` and `ContinueControls`).
  `Credits` shows publisher, saved-by, contributors to this version, and
  (if any) credits inherited from an earlier continued version, each
  distinctly labelled, with an inline "+ friend" button for anyone who
  isn't the viewer. `ContinueControls` lets the viewer choose visibility
  and publish settings for a new room and reports when the server clamped
  that choice because the source snapshot is restricted.
- New `src/client/scene/SnapshotView.tsx`: a read-only R3F canvas reusing
  the existing `Plot`, `PartMesh` and scene environment components, with
  `OrbitControls` but no tray or edit controls. Confirmed in the
  production build to be its own lazy chunk, not part of the base lobby
  bundle.
- `src/client/lobby/LobbyApp.tsx`: query-param routing added
  (`?snapshot=id`, `?showcase=id`, `?view=collection`, `?view=showcase`)
  and header links to the collection/showcase pages.
- `src/client/App.tsx`: the Room panel's "Save a copy" action now tracks
  and links to the saved snapshot ("View it"), and gained a "My
  collection" link.
- `src/client/state/api.ts`: `SnapshotSummary`/`SnapshotDetail` gained
  `sourceSnapshotId`/`inheritedCredits`; `continueSnapshot` returns the
  server's (possibly clamped) `visibility`/`allowPublish`.

**Why.** The author's instruction: "continue with the collection,
snapshot viewing/continuation, and public showcase UI... these are
already within the approved scope." Backend-only endpoints do not count as
completed product features per the prior instruction, so this makes all
six of the brief's numbered steps reachable through visible controls.

**Who decided:** the agent for layout/wording, following the author's
"keep the current visual style and scope" instruction; the credit
categories and continue-controls behaviour follow ADR 0009's policy as
approved by the author.

**Tests:** `pnpm check` (local, fresh server): 76/76; `pnpm typecheck`
clean. Interactive verification is the next commit.

**Limitations:** no UI yet to browse or revoke a specific published entry
beyond what's listed; no pagination for a collection/showcase with many
entries (not required by the brief at this scale).

### 2026-10-13 19:33 AEDT — [`ab6aef9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ab6aef9) Verify collection/showcase flow with two independent identities; evidence

**Changes:**
- `spec/snapshots-and-showcase.test.ts`: updated the existing "no
  laundering" test's assertions to the corrected behaviour
  (`allowPublish: false`, `visibility: "invite_only"` on the derived
  room), and added a new test asserting the derived room is also absent
  from the public lobby listing, refuses a stranger's direct join, and
  refuses a stranger's direct `GET`.
- New `scripts/showcase.ts`: two independent browser identities (distinct
  cookie jars) driven through visible controls only, covering: (1) saving
  a room to the collection, (2) opening it read-only with no edit
  controls and finding it listed on the collection page, (3) continuing it
  into an independent room while confirming the source snapshot is
  unchanged (read back over HTTP), (4) publishing it and finding it listed
  on the showcase, (5) a second, independent identity continuing the
  published version into their own room, (6) the credits distinguishing
  publisher/contributors/inherited credits with working friend-request
  buttons, plus the negative case: a restricted snapshot's publish attempt
  is refused (403), its continue request is clamped server-side rather
  than honoured, its derived room is absent from the public lobby and
  refuses a stranger's join, and there is no endpoint that serves it by
  its raw snapshot id (404).
- `scripts/multiplayer.ts`, `scripts/invites.ts`: fixed a race where
  `__project` could be called before `Workbench.tsx`'s debug-hook effect
  had installed it, which was producing occasional "not a function"
  failures; both now wait for `__project` alongside the snapshot.
- New `doc/evidence/shots/collection-showcase/`: the read-only snapshot
  viewer, the collection page, and the showcase list page.

**Why.** The author's instruction: "verify this complete flow through
visible UI using independent identities... include a negative test
showing that a restricted snapshot cannot be exposed through publication,
a public derived room, or a public preview."

**Who decided:** the agent.

**Tests, run against a fresh local server (this commit's own evidence):**
- `pnpm check`: 76/76. `pnpm check:evidence`: clean.
- `scripts/showcase.ts`: 16/16, reproduced across multiple clean reruns
  (rebuild + fresh database + fresh server each time).
- `scripts/multiplayer.ts`: 15/15. `scripts/invites.ts`: 7/7.
- `scripts/placement.ts`: 31/31 in Chrome, 31/31 in WebKit.

**Limitations:**
- All verification ran once per check, locally, in Chrome (plus WebKit for
  `placement.ts`), on one machine; not a statistical guarantee.
- Neither the deployed app nor a physical second device was used; this
  revision has not been pushed or deployed.
- No pagination or search across a large collection/showcase; not
  exercised at scale.

### 2026-10-13 23:06 AEDT — [`3248d41`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3248d41) Fix critical security review findings: unauthorized snapshot continuation, capacity bypass; correct plan-support rule

**Changes:**
- `src/server/snapshots.ts`: new `canAccessSnapshot()` (saved it yourself,
  current member of its room, or it has been published); `src/server/
  index.ts`'s `POST /api/snapshots/:id/continue` now calls it (previously
  it checked nothing beyond the snapshot existing, while `GET
  /api/snapshots/:id` already did), and the new `collect` endpoint (see
  `84de4e7`) uses the same function.
- `src/server/rooms.ts`: new `admitActive()`, the one function that
  decides whether a visitor may hold an active room slot right now,
  capacity-checked for every inactive→active transition regardless of
  prior historical membership; `join`, `respondToInvite`'s acceptance
  branch, and `markActive` (the SSE connect/keep-alive path, in
  `index.ts`) all call it, replacing three separate, inconsistent ad hoc
  checks.
- `src/domain/rules.ts`: `validatePlan` no longer checks structural
  support in any form (previously a "plausible support" relaxation still
  required *something*, real or planned, beneath a plan above y=0).
  `checkFit` split into `checkBoundsAndCollision` (shared) plus the
  support check, used only by real placement.
- `src/server/index.ts`'s `POST /api/rooms/:id/mark` now checks the
  target is a real, currently-open plan in that specific room before
  broadcasting (previously any string was accepted and broadcast as
  `sent: true`).

**Why.** An independent review of the deployed-equivalent build found four
issues: possessing a private snapshot id was sufficient to copy its
contents via `continue`, bypassing the access check `GET` already
enforced; a returning room member could exceed a 2-player room's capacity
because the capacity check only ran for visitors with no `room_members`
row at all; a plan was rejected for lacking support, contradicting the
approved "a future roof before its walls" design; and an isolated test
found `/mark` accepted a nonexistent plan id.

**Who decided:** the author identified the four issues; the agent
diagnosed root causes and chose the fixes.

**Tests:** `pnpm check` (fresh server): 94/94 (new:
`spec/server/capacity.test.ts`, 7 scenarios covering leave/rejoin after
replacement, presence-sweep expiry, the returning host, multiple tabs,
an accepted invite re-admitting past capacity, SSE reconnect, and
concurrent attempts for the last slot; `spec/snapshots-and-showcase.test.ts`
gained the "GET refused but continue let it through anyway" regression,
using a snapshot with real construction and attribution, not an empty
kit; `spec/plans-and-attribution.test.ts` gained the no-support-at-all
plan case and four mark-validation cases). `pnpm check:evidence`: clean.

**Limitations:** this commit alone left the client's height-stepping UI
unable to actually reach the now-unsupported plan positions through
Higher/Lower; fixed in the next commit (`84de4e7`) once
`scripts/placement.ts`'s existing "Lower then finds the plot" check (run
before committing either change) caught the regression.

### 2026-10-13 23:08 AEDT — [`84de4e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/84de4e7) Explicit accounts, display names, friend-link UI, attribution display, and UI fixes from the review

**Changes:**
- New `src/server/accounts.ts` and `src/client/lobby/Account.tsx`: local
  username/password accounts (`scrypt`-hashed), layered over the existing
  visitor model; a two-step sign-in (verify, then confirm) specifically so
  checking credentials alone can never switch a browser away from an
  anonymous identity with its own work before the player has seen and
  confirmed the migration-conflict warning.
- New `src/client/state/names.ts`: resolves visitor ids to account display
  names wherever "who" is shown, falling back to a short anonymous label.
- `src/client/lobby/LobbyApp.tsx`: `?friend=token` now renders a
  `FriendLinkPage` showing the sender and an explicit accept/decline
  (previously the link was generated but never read by the page itself);
  the Friends panel lists actual friends by name, not a count; room
  invitation uses a selectable dropdown of real friends instead of a raw
  visitor-id text field; friends and invitations poll every 4s while open.
- `src/client/App.tsx`: a selected part shows who placed it and, once
  edited by someone else, who last changed it, distinctly; a selected plan
  shows its proposer and, while marked, who marked it; the Room panel
  shows inherited credits separately from current contributors, each with
  a friend-request button.
- `src/client/lobby/Collection.tsx`: a "Save to my collection" button
  calling the new `/collect` endpoint directly, creating no room (fixed a
  bug my own verification script found: it was passed the showcase's
  publication id rather than the snapshot id).
- Publication setting disclosed in the public lobby list, the pending-
  invitation list, and a new `previewRoom()` check before a direct-id
  join.
- `src/client/state/store.ts`: `fits` (real, supported heights) and
  `planFits` (also reachable by a plan) tracked separately; Higher climbs
  into plan-only territory once past the topmost real height, making the
  no-support-required plan rule (previous commit) actually reachable
  through the visible UI, not only through the API.
- `src/client/index.html`: homepage copy updated to describe shared-room
  building, plans, marks and publication as implemented, replacing the
  pre-multiplayer "in development" narrative.

**Why.** The author's explicit scope change (accounts) plus the review's
remaining numbered gaps: friend links not working as shared links, no
friend/invitation UI beyond a raw id, attribution stored but not shown,
no direct collect-to-collection action, publication policy undisclosed
before joining, and stale homepage copy.

**Who decided:** the agent, following the author's architecture-approval
request (local accounts, explained and approved before implementation)
and the review's explicit UI gaps.

**Tests:** `pnpm check`: 94/94. `pnpm typecheck`: clean. Browser
verification in the next commit.

**Limitations:** no account-password recovery in this phase (stated in
the registration form itself); no automatic merge of two already-worked-in
identities when a migration conflict occurs, only the explicit warning
and refusal to proceed without confirmation.

### 2026-10-13 23:10 AEDT — [`44b2354`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/44b2354) Browser verification for the review fixes and the account system; evidence

**Changes:**
- New `scripts/review-fixes.ts`: two independent identities through
  visible controls — opening the actual generated friend-request link URL
  and completing accept/decline; stepping Higher past real heights to
  propose a future roof with nothing supporting it, confirming Place is
  refused there but Propose instead works; attribution shown for a
  selected part before and after another member edits it; saving a
  published version directly to a collection with no room created; the
  public lobby disclosing the publication setting before joining.
- New `scripts/accounts.ts`: registering preserves an existing anonymous
  room unchanged; signing in from a genuinely independent browser context
  (a fresh `BrowserContext`, never a shared cookie jar) reaches the same
  rooms and construction; signing in while a different browser's
  anonymous identity has its own work shows the conflict warning, never
  switches silently, and that identity's room is neither deleted nor
  reassigned afterward; sign-out deletes the session server-side (the old
  cookie stops resolving, not merely cleared client-side); a wrong
  password and a nonexistent username return the identical non-
  enumerating response; the showcase loads with no account and no prior
  cookie.
- `scripts/invites.ts` updated to select the invited friend from the new
  dropdown rather than filling a raw-id field that no longer exists.
- `doc/evidence/shots/review-fixes/`: the account choose/register/signed-
  in states and the friend-request link page.

**Why.** The author's instruction to verify every fix and new feature
through visible UI using independent identities, not API-only setup.

**Who decided:** the agent.

**Tests, run against a fresh local server (this commit's own evidence):**
- `scripts/review-fixes.ts`: 14/14. `scripts/accounts.ts`: 13/13.
- Full regression after all three commits: `pnpm check` 94/94, `pnpm
  check:evidence` clean, `scripts/multiplayer.ts` 15/15 (reproduced after
  one flaky rerun unrelated to this session's changes — a pre-existing
  timing-sensitive check also present before this session),
  `scripts/invites.ts` 7/7, `scripts/showcase.ts` 16/16,
  `scripts/interaction.ts` 83/83, `scripts/placement.ts` 31/31 in both
  Chrome and WebKit.

**Limitations:** all verification ran locally, once per check (plus
confirming reruns where a flake was suspected), in Chrome (and WebKit for
`placement.ts`), on one machine; neither the deployed app nor a physical
device was used, and nothing has been pushed or deployed.

### 2026-10-14 12:07 AEDT — [`14311c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/14311c6) Fix mutation-authorization bypass and SSE session leakage; add pre-join preview endpoint

**Changes:**
- `src/server/rooms.ts`: new `isActiveMember()` — currently admitted
  (`active = 1`), not merely a historical `room_members` row — with one
  deliberate exception for the solo/default room's host, which never
  flips `active` at all since it never goes through `join`/`markActive`.
  `isMember()` is kept, unchanged, for genuinely read-only checks (view
  room, SSE connect's initial check, save-snapshot).
- `src/server/builds.ts`: `runCommand`'s membership check switched from a
  bare `room_members` row existence check to `isActiveMember()`.
- `src/server/index.ts`: `POST /api/rooms/:id/mark` switched to
  `isActiveMember()` the same way. New `GET /api/rooms/:id/preview`
  (`admissionPreview()` in `rooms.ts`) returns room name, scene,
  visibility, real occupancy/capacity, publication setting, and whether
  this visitor could join right now, with no side effects.
- `src/server/realtime.ts`: new session-token-keyed connection registry
  (`registerConnection`/`revokeSession`) — every SSE connection is
  registered by the hash of the exact session token that opened it
  (`hashToken`, new export in `src/server/identity.ts`), never the
  visitor id alone and never the raw token.
- `src/server/index.ts`: `GET /api/rooms/:id/events` now registers/
  deregisters by session token hash; `POST /api/account/sign-out` and
  `POST /api/account/sign-in/confirm` both call `revokeSession()` on the
  prior token before proceeding, closing every connection opened under
  that specific session and clearing that visitor's active presence in
  any room whose last live connection just closed.
- `src/server/index.ts`: **critical fix**, found while directly verifying
  the brief's instruction to "verify that guest recovery cannot become a
  weaker bypass into a password-protected account" — `POST
  /api/identity/recovery-code` previously had no check on whether the
  requesting visitor was linked to an account, so a signed-in account
  holder could generate a recovery code for themselves and have it
  redeemed from any other browser for a full, password-free session on
  that account. Reproduced directly with `curl`: register an account,
  call `recovery-code` on the same signed-in cookie, redeem the code from
  a fresh browser with no cookie, `GET /api/me` showed the full account.
  Fixed with two checks: `recovery-code` now refuses to generate a code
  for an account-linked visitor; `recover` refuses to redeem a code that
  resolves to an account-linked visitor, and separately refuses to redeem
  any code at all while the requester's own current cookie is itself
  signed in (closing a second, related silent-switch gap).
- `src/server/rooms.ts`: `pendingInvitesFor` now also returns live
  `occupancy`/`capacity`, so an invitation can be shown as currently full
  rather than only as a publication-flag line.

**Why.** An independent review reproduced four distinct issues against
the running multiplayer build (see the review brief, 14 Oct 2026): (1) a
capacity-refused rejoin did not stop a direct mutation attempt from the
same, now-inactive visitor; (2) a logged-out session's SSE stream kept
receiving private-room updates indefinitely; (3) a direct room link
joined before showing anything about the room, with a separate timing
gap in the join-by-code preview; (4) guest-recovery and account-switching
UX gaps, the most severe of which (above) was a genuine authentication
bypass rather than a UX issue.

**Who decided:** the agent, implementing the review's explicit
requirements; the critical recovery-code/account bypass was an
independently discovered vulnerability, not something the review
predicted in that specific form — only instructed to be verified.

**Tests:** a scratch reproduction file (`spec/server/_repro_mutation_bypass.test.ts`)
confirmed the mutation bypass against an in-memory DB before the fix, then
deleted. Full suite run in the next commits.

**Limitations:** cross-tab notification of a session change is a UX
nicety (next commit); server-side session/admission re-validation on
every request remains the actual enforcement, so a tab that misses the
notification (storage disabled, private browsing) is still refused
server-side on its next mutation attempt, not silently allowed to
continue.

### 2026-10-14 12:11 AEDT — [`3a47ed9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3a47ed9) Client: pre-join confirmation screen, cross-tab identity sync, inline guest preservation

**Changes:**
- `src/client/PreJoin.tsx` (new): `PreJoinGate` — loading/ready/invalid
  states; shows room label, scene, visibility, capacity and publication
  terms; "Join this room" disabled until the preview says `canJoin`; an
  already-admitted/returning player (`alreadyMember`) skips the screen
  entirely and proceeds immediately.
- `src/client/main.tsx`: a first-time direct room link now renders
  `PreJoinGate` before calling the real `start()` (which performs the
  actual, server-re-checked join); local/no-room-id routes are
  unaffected.
- `src/client/lobby/LobbyApp.tsx`: `JoinByCode` rewritten with an
  explicit preview state machine (`idle|checking|ready|failed`) and a
  race guard, so the Join button is disabled while the preview is
  loading or after it fails — the previous version let the button be
  clicked before the async preview had resolved. Pending invitations now
  show live occupancy/capacity and disable Accept (with a tooltip) when
  full. `IdentityPanel` now takes the current `accountName` and shows an
  explanatory message instead of recovery-code generate/redeem controls
  whenever the browser is signed in, rather than letting the action fail
  server-side with no warning.
- `src/client/state/session-events.ts` (new): `broadcastIdentityChange()`/
  `onIdentityChangedElsewhere()` using `localStorage` + the browser's
  native `storage` event (no new dependency) — fires in every OTHER open
  tab of the same origin, never the tab that wrote it.
- `src/client/state/store.ts`: `start()` registers a listener for
  identity-change notifications; on notification it clears
  `held`/`selectedId`/`selectedPlanId`/`deleting` and re-runs `start()`,
  which re-resolves `selfId` and the join-on-load check, so a tab left
  open under an identity that signed out elsewhere lands on the ordinary
  access-denied screen if it's no longer entitled to that room.
- `src/client/lobby/LobbyApp.tsx`: also listens for the same notification
  to refresh its own account-name display.
- `src/client/lobby/Account.tsx`: `MigrationWarning` now generates and
  displays a recovery code for the CURRENT guest identity inline, on the
  same screen, before a switch away from it — the confirm button's label
  changes ("I've saved my code — continue signing in" vs. "Continue
  without saving a recovery code") so skipping the step is a visible,
  deliberate choice. The signed-in and guest states now show an explicit
  "Signed in"/"Guest mode" tag; sign-out shows a plain-language
  confirmation ("Signed out. This browser is back to its own guest
  identity — no account's details are shown here anymore.").
- `src/client/state/api.ts`: `previewRoom()` replaced with
  `previewAdmission()` returning the full `AdmissionPreview` shape;
  `RoomInvite` gained `occupancy`/`capacity`.

**Why.** Directly implements the review's Issue 3 (disclose publication
terms before admission, no join-before-preview timing gap) and the UX
half of Issue 2/4 (cross-tab coherence is not itself the enforcement —
server-side checks from the prior commit are — but a tab that doesn't
notice a signed-out identity is a bad experience even when it's safely
refused) and Issue 4 (a usable, inline preservation path before switching
away from a guest identity with real work, and clear guest/account status
throughout).

**Who decided:** the agent, implementing the review's explicit UI
requirements.

**Tests:** typecheck clean. Full suite and browser verification run and
reported in the next commit.

**Limitations:** publication settings remain fixed at room creation for
this phase (unchanged from ADR 0009); cross-tab sync depends on
`localStorage`/the `storage` event being available (private browsing or
disabled storage falls back to server-side enforcement only, with no
client-side nicety).

### 2026-10-14 12:16 AEDT — [`4bcbad1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4bcbad1) Regression tests and browser verification for the three review fixes

**Changes:**
- New `spec/inactive-member-authorization.test.ts`: the exact A/B/C
  sequence from the review (A and B join a 2-player room, B leaves, C
  joins filling B's slot, B's rejoin is correctly refused, B's direct
  mutation attempt is refused and changes nothing), plus coverage for
  removal, rotation, recolouring, plan propose/withdraw/realize, plan
  marking, the solo-room exception, and multiple tabs of the same
  identity consuming no extra slot.
- New `spec/session-revocation.test.ts`: sign-out revokes the signing-out
  session's own SSE stream; account-switching (`sign-in/confirm`) revokes
  the prior session the same way; a stale, revoked session's direct
  mutation attempt is refused; SSE reconnection after revocation
  re-validates session and room admission; a second, independently valid
  session for the same visitor is left untouched.
- New `spec/admission-preview.test.ts`: the preview endpoint causes no
  side effects (member count unchanged after calling it), discloses the
  right fields for public/invite-only/full/nonexistent rooms, and
  reflects real-time occupancy.
- `spec/friends-and-identity.test.ts`: three new cases for the recovery-
  code/account-bypass fix — generating a code while signed in is refused;
  redeeming a code that has since become account-linked is refused;
  redeeming any code at all while the requester is signed in is refused.
- New `scripts/inactive-member.ts`, `session-revocation.ts`,
  `pre-join.ts`, `guest-preservation.ts`: browser-driven verification of
  the same behaviours through visible controls, using genuinely
  independent `BrowserContext`s (three identities for the inactive-member
  sequence; two tabs of one context for cross-tab session revocation).
- `scripts/review-fixes.ts`: updated to click through the new pre-join
  gate (`.getByRole("button", { name: /^Join this room/ })`) before
  proceeding, now that a first-time direct room link shows it.
- `scripts/accounts.ts`: button selector widened to a regex matching
  either of `MigrationWarning`'s two possible confirm-button labels.
- `vitest.config.ts`: `fileParallelism: false` added to the `app`
  project. The account/recovery endpoints share one real, intentional
  per-source-IP rate limiter (10 attempts/min) across every spec file and
  script hitting the same live server within a 60-second window; running
  account-heavy spec files in parallel was intermittently tripping it.
  Documented inline as explicit guidance for future test additions.

**Why.** The brief's explicit per-issue process: a regression test
demonstrating each defect before the fix, run against the existing suite,
then verified through the browser. Never weakened or removed an existing
check; redundant register/sign-in calls across spec files were
consolidated via shared hoisted variables instead of raising the rate
limiter.

**Who decided:** the agent, following the review brief's explicit
process requirement.

**Tests, run against an isolated throwaway server
(`DATA_DIR=/tmp/finalcheck2 PORT=8342`, never the persistent dev
database):**
- `pnpm vitest run` (full suite, `APP_URL=http://localhost:8342`):
  **116/116 passed**, 14 test files.
- `pnpm typecheck`: clean. `pnpm check:evidence`: clean.
- `scripts/inactive-member.ts`: 6/6.
- `scripts/session-revocation.ts`: 5/5.
- `scripts/pre-join.ts`: 13/13.
- `scripts/guest-preservation.ts`: 12/12.
- `scripts/review-fixes.ts`: 14/14 (regression, confirming the pre-join
  gate's new, correct behaviour change is handled by the updated script).
- `scripts/accounts.ts`: 13/13 (one run hit a transient rate-limit/load
  timing hiccup unrelated to any code change; an immediate rerun passed
  cleanly 13/13).
- `scripts/multiplayer.ts`: 14/15 on first run (one pre-existing,
  timing-sensitive "simultaneous placement" check, present before this
  session), 15/15 on immediate rerun — not a regression from this
  session's changes.
- `scripts/invites.ts`: 7/7.

**Limitations:** the shared per-IP rate limiter across account-heavy spec
files and scripts remains a structural test-infrastructure constraint
(documented in `vitest.config.ts`); future account-endpoint-heavy tests
should continue consolidating setup calls rather than relying on
parallelism, or space out script runs by more than 60 seconds.

### 2026-10-14 12:20 AEDT — [`768933d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/768933d) ADR 0007/0010 and CLAUDE.md: record the three review fixes as-built

**Changes:**
- `doc/adr/0007-rooms-shared-inventory-and-access.md`: two new "As built"
  sections — mutation authorization now checks current admission via
  `isActiveMember()`, not historical membership; the new pre-join
  confirmation screen and its `admissionPreview()` endpoint.
- `doc/adr/0010-explicit-accounts.md`: corrected the "Realtime on
  identity change" Security bullet (previously described the
  not-yet-fixed behaviour); three new "As built" sections — SSE
  revocation scoped by session token with cross-tab coherence; the
  critical guest-recovery-code/account-password-bypass vulnerability and
  its fix; the inline guest-identity preservation path before an account
  switch.
- `CLAUDE.md`: four new entries in the "Never" list — mutation
  authorization must check active admission, not historical membership;
  a direct or code-based room join must show pre-join terms before
  admitting; an SSE stream must be revoked when its session ends, without
  affecting other valid sessions; a recovery code must never bypass a
  password-protected account.

**Why.** The project's standing convention: a behaviour change to
authorization, session handling, or admission gets its ADR updated in the
same pass that implements it, not deferred.

**Who decided:** the agent, documenting decisions already made (above) in
the standing ADR format.

**Tests:** `pnpm check:evidence`: clean (citation check against this
log). `pnpm typecheck`: clean.

**Limitations:** none beyond those already stated in the ADRs themselves
(no account-password recovery in this phase; no automatic merge of two
already-worked identities on migration conflict; cross-tab sync is a UX
nicety, not the enforcement).

### 2026-10-14 12:42 AEDT — [`c7e73ba`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c7e73ba) C9 process and reflection

**Changes:** Rewrote `PROCESS.md` as the current C9 account, retaining C8 context while explaining shared inventory, spatial communication, concurrency, provenance, corrective review and the v7 deployment. Added `reflections/crit-9.md` (296 words including headings), answering both standing prompts through the author's stated breakthrough: narrative and original intention should guide feature selection.

**Who decided:** The author supplied the design reasoning and reflection, requested assisted drafting, reviewed the summaries, and explicitly authorized this commit and push. No product code changed.

**Verification:** `git diff --check` passed before committing; all 13 PROCESS commit references resolved locally. The reflection's filename and two headings match `reflections/README.md`. No application tests were rerun for this documentation-only change.

**Limitations:** PROCESS records the remaining account-switch/recovery-session issues and distinguishes automated checks from human multiplayer testing. Its statement that multiplayer commits were not yet pushed describes the drafting-time state; the author subsequently authorized pushing this branch together with these documents. This entry does not claim a C9 tag or ship workflow has been completed.

### 2026-10-19 14:32 AEDT — [`db4ce01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/db4ce01) Domain: derive planning demand (real stock minus open plans)

**Changes:**
- `src/domain/rules.ts`: new pure `plannedRemaining(state)` returns
  `inventory[part]` minus the number of `open` plans of each part type.
  Withdrawn and realized plans don't count. Nothing stores it and no
  validation calls it.
- `spec/domain/planned-remaining.test.ts` (new, 4 tests): five plans against
  three in stock gives −2 with real stock unchanged; withdraw raises demand;
  realize spends real stock once and drops the plan's demand; negative
  demand never blocks a real placement while stock remains; realizing with
  zero real stock is `out_of_stock` with the plan still open.

**Why.** The author asked for a Plan-mode count showing whether the room's
open plans fit its real stock, without a second stock table or any
subtraction from real inventory (ADR 0011).

**Who decided:** the author set the formula and the "derived, may be
negative, never authoritative" rule. Putting it in the domain module as a
pure helper was the agent's choice.

**Tests:** `pnpm vitest run --project domain`: 36/36 passed (4 domain files).

### 2026-10-19 14:32 AEDT — [`c7ad154`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c7ad154) Client: explicit Build/Plan mode; a click in Plan mode proposes the preview

**Changes:**
- `src/client/state/store.ts`:
  - new local `mode: "build" | "plan"`, with `setMode`, `toggleMode`,
    `plannedCounts` and `canStepHigher`
  - `commitHeld()` is the single mode-checked commit path for scene click,
    Enter and the dock button
  - `proposeHeld()` made private; it now refuses locally on `planRejection`
    and keeps the next preview on top of the new plan
  - `stepLevel` climbs into unsupported heights only in Plan mode
  - `chooseLevel` drops a side-face aim to plan heights in Plan mode
  - `choosePart` no longer warns "none left" in Plan mode
- `src/client/App.tsx`:
  - `ModeSwitch` segmented control: aria-pressed, labels "Build mode" and
    "Plan mode", a hidden description, and P shown on the Plan button
  - a separate Plan-mode context row: "Plan" tag, `Propose plan` button,
    `PlanCounts` reading "Real kit · plans · planned left"
  - the `Propose instead` button is removed
  - Build mode hints "Switch to Plan (P)" when a spot is unsupported or out
    of stock
  - Plan-mode tray badges `◇ N` with accessible names giving both counts
  - Help text updated; `Height` takes the preview and the mode
  - the mode switch sits on the tray's tab row (top row when folded)
- `src/client/keyboard.ts`: `P` toggles the mode, behind the existing
  editable-field guard.
- `src/client/scene/Workbench.tsx`:
  - a scene click goes through `commitHeld`
  - in Build mode the pointer looks through plans; in Plan mode a plan's
    top face can be aimed at
  - Plan-mode preview material, and a "◇ Plan here" / "✕ Can't plan" label
- `src/client/scene/PartMesh.tsx`: `plan` and `plan-preview` ghost
  variants (more transparent, blue cast, blue outline).
- `src/client/styles.css`: mode switch, plan tag and badges, dashed dock
  edge in Plan mode, phone layout, and a `.visually-hidden` utility.

**Why.** Moving the pointer to `Propose instead` re-aimed the preview, so a
plan could not reliably be made at the position on screen. The author asked
for Plan mode to be a real spatial tool (ADR 0011).

**Who decided:** the author set the two modes, P, click-to-propose, mode
stability, explicit return to Build, and the planned count's meaning. The
agent chose: Escape not leaving Plan mode; Build-mode Higher no longer
climbing into unsupported space; Build-mode pointer looking through plans;
aiming at plan tops in Plan mode; where the switch sits; and the compact
wording.

**Tests:** see the next entry. A first layout made the dock taller in both
modes; that was caught by a browser script and fixed before this commit
(evidence 0007, "Dock height").

### 2026-10-19 14:33 AEDT — [`81c1b2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/81c1b2c) Tests and two-context browser verification for Plan mode; evidence 0007

**Changes:**
- `spec/plans-and-attribution.test.ts`: new "planning demand" block
  (5 tests): more plans than stock (demand −2, stock unchanged); proposing
  with zero real stock; negative demand never blocking another member's
  real placement; withdraw +1 and realize spending stock once; realizing
  with no stock refused `out_of_stock` with the plan open.
- `spec/realtime.test.ts`: a proposed plan reaches B's SSE stream in under
  1 s with real stock unchanged.
- `scripts/plan-mode.ts` (new, 37 checks): two independent contexts plus a
  touch-emulated 390×844 phone.
- `scripts/multiplayer.ts`: the plan is created by a Plan-mode click and
  compared with the preview; B's Plan-mode tray shows the demand.
- `scripts/review-fixes.ts`: the future roof is proposed through Plan mode
  and `Propose plan`.
- `scripts/interaction.ts`: P and the mode buttons; `p` in a text field is
  not a shortcut.
- `doc/evidence/0007-plan-mode.md` and `doc/evidence/shots/plan-mode/`
  (screenshots, `results.json`).

**Who decided:** the agent, covering the author's verification list.

**Tests run, against an isolated server** (`DATA_DIR=/tmp/bc-plan2
PORT=8352`, fresh database, final build):
- `APP_URL=http://localhost:8352 pnpm check`: typecheck clean, 126/126
  passed in 15 files (116 before).
- `pnpm check:evidence`: clean.
- `scripts/plan-mode.ts` 37/37; `scripts/multiplayer.ts` 17/17;
  `scripts/review-fixes.ts` 14/14; `scripts/interaction.ts` 84/84.
- Comparison: a HEAD (`9625f82`) build on a separate throwaway server ran
  `scripts/review-fixes.ts` 14/14 and gave the Build-mode dock baseline used
  in evidence 0007.

**Observed:** the plan created equals the preview read before the click;
B received plans in 2–5 ms; planned remaining reached −2 on both screens;
realization with no real stock was refused and the plan stayed open.

**Limitations:** Chrome only (no Safari/WebKit); touch was emulated, not
on a physical phone; two contexts on one machine, not two people; nothing
pushed or deployed. In Plan mode the dock is one row taller than in Build
mode.

### 2026-10-19 14:35 AEDT — [`41a632f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/41a632f) ADR 0011 and CLAUDE.md: Plan mode and derived planning demand

**Changes:**
- `doc/adr/0011-plan-mode-and-planning-demand.md` (new): the two modes,
  the single commit path, what differs between modes, planning demand
  (formula, derived and never stored, may be negative, never consulted by a
  rule, server authoritative for real stock and realization), alternatives,
  consequences.
- `doc/adr/0005-...md`: a "Later change" section saying how its rules apply
  in Plan mode.
- `doc/adr/0009-...md`: notes that its original "plausible support" wording
  was superseded by its own 13 Oct correction, and that the `Propose
  instead` UI it describes was superseded by ADR 0011. Server rules
  unchanged.
- `CLAUDE.md`: the Interaction heading now records the one re-added mode; a
  new "Build and Plan modes" rule; Esc never changes the mode; planning
  demand added to "Plans are proposals"; a new "Never" entry against
  subtracting plans from inventory, storing a planned stock, or letting
  demand gate real placement or realization.

**Why.** The project keeps decisions in ADRs and binding rules in
`CLAUDE.md`, updated in the same pass as the implementation.

**Who decided:** the author approved the change and its rules; the agent
wrote it up and marked its own choices "agent" in ADR 0011.

**Tests:** `pnpm check:evidence` clean; `git diff --check` clean. No code
changed in this commit.

**Ambiguities recorded:** `CLAUDE.md` said the editor had no modes, and ADR
0009's Decision section still described a support check its own correction
removed. Both are now annotated rather than rewritten.

### 2026-10-19 14:45 AEDT — Push and deployment of `e0c3a3e` (no code commit)

The author said "push", then "deploy". `git push origin main` (`9625f82` →
`e0c3a3e`) triggered the public repo's `checks` workflow (run 39195594737):
`check` and `deploy` both succeeded, producing Fly release v9. No manual
deploy was needed. Live: routes answered 200, the editor bundle contains
Plan mode, and `scripts/plan-mode.ts` passed 37/37 against the deployed app.
Details and limitations: `doc/evidence/0007-plan-mode.md`, "Live deployment".

### 2026-10-19 15:15 AEDT — [`7cc7a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7cc7a4d) Plans obey construction geometry against real parts plus standing plans

**Changes:**
- `src/domain/rules.ts`:
  - `validatePlan` now checks bounds, collision and stud support against
    `plannedStructure(state)`: the real parts plus the standing open plans.
    Messages: "Another plan already takes that space." and "a plan needs
    studs underneath too, from real parts or other plans".
  - New `planFits(state)` labels each open plan standing, conflict or
    unsupported, in commit order.
  - New rejection code `plan_depends`, returned by `validateWithdrawPlan`,
    `validateRemoval` and `validateRotation` when a standing plan would lose
    its only support (`strandedPlans`).
  - `validateRealizePlan` gives its own "nothing real is under it" message.
  - `planHeights` is removed.
- `src/server/rooms.ts` and `src/server/snapshots.ts`: plans and snapshot
  plans are read and copied `ORDER BY rowid`.
- `spec/domain/plan-geometry.test.ts` (new, 23 tests) and
  `spec/server/legacy-plans.test.ts` (new, 5 tests).
- `spec/plans-and-attribution.test.ts`: the old floating-roof and
  overlap-real tests are replaced by refusals, wall plus roof, collisions,
  `plan_depends`, and concurrent overlapping proposals.
- `spec/realtime.test.ts` and `spec/domain/planned-remaining.test.ts`:
  positions adjusted to the new rule.

**Why.** The author changed the rule: a plan must be something that could
really be built given what is built and planned (ADR 0012). The rowid
ordering came from a full-suite failure. Plans sharing a `created_at`
millisecond were ordered by random id, so an upper plan could be judged
before its base.

**Who decided:** the author set the geometry, support, no-cascade,
realization and legacy-preservation rules. The agent chose the commit-order
fit, rowid ordering, the "only plans resting on the target" dependency rule
(so turning a part into a plan's space stays allowed) and the messages.

**Tests:** `pnpm check` 156/156 passed (126 before). Obsolete tests were
rewritten at the author's direction; they are listed in evidence 0008.

### 2026-10-19 15:54 AEDT — [`4f768b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4f768b9) Client: mode-specific heights, exact-preview commits, plan visuals, drop animation, camera remap

**Changes:**
- `src/client/state/store.ts`:
  - The preview's heights come from `fitHeights` over the current mode's
    structure, with a `modeRejection` verdict. The unsupported climb and
    `canStepHigher` are gone.
  - `setMode` pins the displayed level.
  - New `restoreHeld`, `planFitsNow`, `focusSelected`, `setNavTool` and
    `navTool`.
  - `adoptLive` gives drop timing only to new part ids. The SSE catch-up
    after each open is not animated.
  - Escape order: delete tool, then navigation tool, then held part, then
    selection.
- `src/client/scene/Workbench.tsx`:
  - Mouse mapping is left builds, right orbits, Shift+right and middle pan,
    with screen-space panning.
  - Orbit and Pan tools, touch remap, focus framing, and a tighter pan box
    (plot ±4).
  - The preview is frozen during drags.
  - The paused-spot pointer trail undoes sweeps onto UI.
  - Plans are drawn by fit.
- `src/client/scene/PartMesh.tsx`:
  - New `plan-bad` ghost.
  - The selected plan gets a cyan tint, more opacity (capped at 0.5) and
    white plus cyan outlines.
  - `dropAt`: 0.2 units, 180 ms, cubic ease-out.
- `src/client/App.tsx`:
  - New Orbit and Pan tool chips, a Focus selected button and a camera
    hint.
  - The selected-plan panel explains conflicts.
  - Phone header labels are shortened, and About moves into Help on
    phones.
- `src/client/keyboard.ts`: F focuses.
- `src/client/styles.css`: supporting styles.

**Why.** These are the author's positioning, plan-visibility, placement
feedback and camera requirements (ADR 0012).

**Who decided:** the author set the behaviours. The agent chose the
constants (0.2 units, 180 ms, cyan values, 120 ms / 6 px stillness) and the
trail mechanism, after three earlier versions failed in browser runs.

**Tests:** see the next entry.

### 2026-10-19 15:54 AEDT — [`1112a96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1112a96) Browser scripts: plan-geometry run, and older scripts updated to ADR 0012 rules

**Changes:**
- `scripts/plan-geometry.ts` (new): two independent contexts driving
  visible controls, plus camera, reduced-motion and emulated-touch runs.
  It takes `chromium` or `webkit`.
- `scripts/interaction.ts`, `scripts/plan-mode.ts` and
  `scripts/review-fixes.ts` are updated for the right-button orbit and the
  supported-heights rule. These are author-directed updates to obsolete
  checks.

**Tests run** against an isolated server (`DATA_DIR=/tmp/bc-test PORT=8361`,
fresh database):
- Chrome: plan-geometry 61/61, plan-mode 42/42, review-fixes 15/15,
  multiplayer 17/17, interaction 85/85.
- Playwright WebKit: plan-geometry 54/54. The touch section is
  Chromium-only.

### 2026-10-19 16:01 AEDT — [`53bb365`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/53bb365) ADR 0012, CLAUDE.md, evidence 0008: plan geometry, positioning, camera

**Changes:**
- `doc/adr/0012-plan-geometry-positioning-and-camera.md` (new).
- ADRs 0003, 0005, 0009 and 0011 are annotated where superseded.
- `CLAUDE.md`: the "never require support for a PLAN" rule is replaced by
  the geometry and compatibility rules. The camera mapping, Higher/Lower,
  mode-switch and plan-visibility rules are updated.
- `doc/evidence/0008-plan-geometry-positioning-camera.md`, plus
  screenshots and results in `doc/evidence/shots/plan-geometry/`.
- `src/client/styles.css`: the phone camera hint is moved under the header,
  because it overlapped the notice.
- `scripts/plan-geometry.ts`: screenshots are named by engine, and the
  phone screenshot is taken before the gestures.

**Tests:** after this commit's style and script changes, plan-geometry ran
61/61 in Chrome and 54/54 in WebKit. `pnpm check:evidence` was clean, and
so was `git diff --check`. The screenshots were inspected; see evidence
0008 for what each shows.

**Limitations:** Safari.app, Firefox and physical devices were not tested.
Touch was emulated in Chrome only. Two contexts on one machine are not two
people. Nothing was pushed or deployed.

## 19 October 2026, 16:23 AEDT — Delete tool also withdraws plans (Codex)

Commit: [`0270a00`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0270a00)
— `fix: let delete tool withdraw planned bricks`.

**Decision:** the author requested one Delete tool for real and planned
bricks, avoiding repeated select-and-withdraw steps. Codex chose to reuse
the existing authoritative withdraw-plan command and retain support checks.

**Implemented:** Workbench targets and highlights plans in Delete tool;
App, keyboard and store dispatch by target type. Keyboard target cycling
includes plans, successful withdrawal clears the target, and the tool stays
active. Five client-store regression tests and a client Vitest project were
added. A test exposed localTransport returning withdrawn plans; its snapshot
now filters to open plans, matching the server contract. CLAUDE.md records
the interaction. README, PROCESS and reflections were not edited.

**Observed checks:** typecheck and build passed; client/domain/server tests
79/79; full check against an isolated server with a fresh temporary database
161/161 across 18 files. Evidence checker and whitespace check passed.
See [evidence 0009](doc/evidence/0009-delete-plans.md).

**Limitations:** browser control was denied because its security policy
could not be verified. No browser driver workaround was used. Pointer hit
testing, visual deletion highlight and touch still need manual acceptance;
passing store and HTTP tests are not browser evidence. Nothing pushed or
deployed, and no existing user database was used for tests.

### 2026-10-20 13:32 AEDT — [`eddc87d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/eddc87d) Safe structured logging: allowlisted event lines and an error handler that never prints input

**Changes:**
- `src/server/log.ts` (new): typed `Fields` allowlist, a validator per
  field, `label` (8-hex visitor label), `safeId`, `commandRef` (hash for a
  non-UUID command id), `classifyError`, `describeError` (class, code, own
  `src/` frames only), and a test capture seam.
- `src/server/index.ts`:
  - a request id per request (`X-Request-Id`)
  - a final error handler that logs only safe fields and sends the same
    page Express sent in production: 400/413/500 status text, same CSP and
    nosniff headers, never a stack
  - uncaught exceptions and background timers logged the same way
  - `listening` becomes `server.start`, without `DATA_DIR`
  - the command line keeps its information under the new field names
- `spec/server/helpers/server-process.ts` (new): starts the real server in
  its own process on a free port with a temporary `DATA_DIR`, and captures
  stdout and stderr.
- `spec/server/log-format.test.ts` (12) and `spec/server/log-errors.test.ts`
  (5) are new.

**Why.** The investigation found that Express's default error handler
printed full stacks to stderr even in production. The stack of a JSON parse
error quotes the first characters of the body: `"x=1" is not valid JSON`,
seen on the old server. The author asked for this fixed first, with
allowlists rather than a denylist.

**Who decided:** the author set the constraints (allowlist, no raw
message, stack or URL, statuses kept, sentinel tests). The agent chose the
field set, the HTML-page compatibility, and the frame filter.

**Tests:**
- The new server tests passed.
- `log-errors.test.ts` failed 3/5 against the previous `index.ts`.
- Full suite against an isolated server: 178/178.

### 2026-10-20 13:37 AEDT — [`cd1b5fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cd1b5fe) Log who did what: rooms, commands with targets and attribution, snapshots, identity, social, SSE

**Changes:**
- `src/server/builds.ts`: `commandMeta` reads the target, part, position,
  colour and original builder or proposer from state inside the
  transaction. A duplicate reports its first revision.
- `src/server/index.ts`: events for:
  - visitors, accounts and recovery
  - room create, join, leave, refused reads and invitations
  - commands, including early refusals (`no_session`, `not_json`,
    `too_fast`, `bad_envelope`)
  - plan marks
  - friends
  - snapshots: save, publish, collect, continue, refused reads
  - SSE open and close
  - presence end (signed out, session replaced, expired)
- The public responses are unchanged. A non-admitted command still answers
  `bad_request`; the log says `not_admitted`.
- Helper return types gained log-only fields:
  - `rooms.ts`: `JoinOutcome.changed`, `leave` → boolean, `sweepPresence`
    returns who expired
  - `friends.ts`: `RespondOutcome.fromVisitor`
  - `snapshots.ts`: publish `reason`, `snapshotExists`
  - `realtime.ts`: `openConnections`
- `visitor.new` carries its creating `route`, after a browser run showed
  one first page load creating four visitors.
- `spec/server/log-events.test.ts` (11) and
  `spec/server/log-metadata.test.ts` (7) are new.

**Why.** For Crit 10's "narrate who did what from server logs", using the
coverage the author approved.

**Who decided:** the author approved the coverage and the outcome
semantics. The agent chose the event names, the field per event, and the
`route` on `visitor.new`.

**Tests:**
- Server project: 50/50.
- Full suite against an isolated server: 196/196; server stderr 0 bytes.
- `multiplayer.ts` 17/17 and `plan-mode.ts` 42/42 (Playwright, local
  Chrome).

### 2026-10-20 13:42 AEDT — [`c365c02`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c365c02) Log the pre-join refusal, and a scripted local rehearsal of the Crit 10 permission procedure

**Changes:**
- `room.preview` now logs the editor's first request for a room link. An
  invite-only room with no standing is refused there before any join, as
  `denied no_invitation` with the same public 404.
- `scripts/log-rehearsal.ts` (new) drives Procedure A through the visible
  UI in two browser contexts. It refuses any non-local host. It writes the
  run's server lines and checks they tell the story.

**Why.** The first rehearsal run found no refusal line: the UI never
reached `join`.

**Tests:**
- Rehearsal: 13/13 against an isolated server.
- Server project: 50/50.

**Observed, not changed:** on a cookie-less first visit, parallel lobby
requests each create a visitor, and the browser keeps the last cookie. The
script reads identities after the page settles. Recorded for the author in
evidence 0010.

### 2026-10-20 13:48 AEDT — [`0a200ba`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0a200ba) ADR 0013, CLAUDE.md, evidence 0010: server logs that say who did what

**Changes:**
- `doc/adr/0013-server-logs-who-did-what.md` (new) separates:
  - Crit 10's requirements (course)
  - the project's logging design: storage homes, line format, identifiers,
    outcomes, the event table, the error handler
  - a permissions table restating ADRs 0007 and 0009
  - Procedures A and B, and alternatives
- ADR 0006 is corrected and ADR 0001 annotated.
- `CLAUDE.md`:
  - the milestone is now C10
  - a "Server logs" section
  - a Never entry listing what may not be logged
  - a verification step after route changes
- `doc/evidence/0010-server-logs.md` and `doc/evidence/logs/`: a real
  excerpt from a scripted local run, checked against the never-logged list.
- `doc/evidence/0009-delete-plans.md`: a dated addendum. It cites CI run
  39204979166, whose `check` and `deploy` jobs succeeded for `f325e2e`
  (read-only `gh run view`). The original text is unchanged.

**Who decided:** the author set the separation of course requirements from
our choices, the two procedures, and the addendum rule. The agent wrote the
text.

**Tests:**
- `pnpm check:evidence` clean; `git diff --check` clean.
- No code changed in this commit.
- Against a fresh isolated server at HEAD:
  - `pnpm check` 196/196 (22 files)
  - browser scripts: interaction 85/85, multiplayer 17/17, plan-mode
    42/42, review-fixes 15/15, invites 7/7, session-revocation 5/5,
    inactive-member 6/6
  - server stderr 0 bytes

**Limitations:**
- Procedure B (two classmates, deployed app) has not happened.
- The deployed app still runs the previous logging.
- Nothing pushed or deployed.

### 2026-10-20 14:38 AEDT — [`a04c99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a04c99e) Establish the browser's identity before anything acts as it (first-visit race)

**Root cause** (code trace, then confirmed in Chrome against an isolated
server): the cookie is issued by whichever request first arrives without
one. The lobby sent five requests at once on a first visit; four created
visitors, and the browser kept whichever cookie arrived last.

**Confirmed impact:**
- The lobby showed one identity as "you" while every later request ran as
  another.
- With one response held back 2.5 s by a local proxy, a friend link made
  in that window belonged to the identity the browser then lost.
- Three same-profile tabs created four visitors.
- The direct room-link path was not affected: its only first request is
  the preview.

**Changes** (client only):
- `src/client/state/identity.ts` (new): `ensureIdentity()`, one shared
  `GET /api/me` under the Web Lock `brick-identity`, a 10 s timeout,
  failures not cached; `resetIdentity()`.
- `src/client/IdentityGate.tsx` (new): wraps the lobby and the editor (not
  `?local`), with a retry on failure.
- `store.start()` waits for identity before `load()` and SSE.
- `whoAmI()` goes through it.
- Account sign-in and sign-out, and the lobby's cross-tab handler, reset
  it.

**Who decided:** the author asked for the ordering (resolve identity,
wait, then dependent work), a cross-tab check, a recoverable failure, and
no server or identity-model change. The agent chose the shared promise,
the Web Lock and the gate placement.

**Tests:**
- `spec/client/identity.test.ts`: 5/5.
- `scripts/identity-race.ts` (new): 18/18 in Chrome.
- The same script against the previous client failed 8 checks, then timed
  out at the missing retry screen.

Details: evidence 0011.

### 2026-10-20 14:45 AEDT — [`498bdfe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/498bdfe) Browser scripts: wait for the collection list with a valid locator

`a04c99e` made `review-fixes.ts` and `showcase.ts` wait for the collection
list, which now renders after identity is established. That wait mixed CSS
and Playwright's text engine in one selector, failed silently, and left the
count racing the list. This commit replaces it with
`locator(".room-row").or(getByText(...))`.

**Tests:** both scripts passed twice each on fresh servers (15/15, 16/16).

### 2026-10-20 14:45 AEDT — [`b9ec1ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b9ec1ed) Fatal errors: synchronous log lines, one bounded shutdown, recoverable vs fatal background errors

**Found:** with stdout a backed-up pipe, `process.exit(1)` dropped the
queued `process.crash` line, because `process.stdout.write` is asynchronous
on pipes. Fatal errors already exited 1 and never kept serving.

**Changes:**
- `log.ts`: `writeLineSync`. Lines are written synchronously, with EAGAIN
  retried for at most 2 s.
- `index.ts`: one `shutdown()` for signals and fatal errors. It stops
  accepting, ends all connections including SSE, closes the database, and
  exits, with a 3 s hard deadline and re-entry ignored.
- Background timer errors are logged as `recoverable`, and as fatal if
  the database is left mid-transaction.
- `server-process.ts`: preload args, exit status and signals for tests.

**Who decided:** the author set the requirements (no swallowing fatal
errors, bounded shutdown, sanitized output, tests on real exit status, no
unargued retries). The agent chose synchronous writes over a drain-on-exit,
the 3 s deadline, and the open-transaction rule.

**Tests:**
- `spec/server/process-lifecycle.test.ts`: 8/8, using test-only
  `--import` preloads with no hook in the server.
- Against the previous server files, 4 of the first 6 failed.

**Whole suite after all three commits:**
- `pnpm build` passed.
- `pnpm check`: 209/209.
- Every browser script, each on a fresh isolated server: identity-race
  18, log-rehearsal 13, interaction 85, multiplayer 17, plan-mode 42,
  plan-geometry 61, review-fixes 15, invites 7, session-revocation 5,
  inactive-member 6, accounts 13, pre-join 13, guest-preservation 12,
  showcase 16.
- Server stderr was 0 bytes in every run.

**Correction to earlier records:** the `cd1b5fe` commit message (and the
agent's handoff) said "every server-observed action" writes a line. What is
logged is ADR 0013's table of defined significant events. Routine reads,
polling, heartbeats, pointer and preview movement, and clicks the editor
refuses locally are intentionally not all logged. ADR 0013 and CLAUDE.md
now say so, and evidence 0010 has a dated follow-up.

### 2026-10-20 14:48 AEDT — [`94be2a7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/94be2a7) ADR 0013/0006, CLAUDE.md, evidence 0011: identity ordering, fatal errors, logging scope

**Changes:**
- ADR 0013: new "Identity is established first" and "Fatal and background
  errors, and stopping" sections; event rows for `server.stop`,
  `background.error` and `process.crash`; the event table described as the
  defined significant events.
- ADR 0006: a later-change note.
- `CLAUDE.md`: the identity-ordering rule, the fatal-error rule, and the
  logging-scope wording.
- `doc/evidence/0011-identity-ordering-and-fatal-errors.md` (new), with its
  results file.
- A dated follow-up appended to evidence 0010; the original text is kept.

**Who decided:** the author set the documentation requirements (qualify
the scope claim, append rather than rewrite). The agent wrote the text.

**Tests:** `pnpm check:evidence` clean, `git diff --check` clean. No code
changed in this commit.

### 2026-10-20 15:22 AEDT — [`bcd0b2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bcd0b2c) Logging under backpressure: a bounded async queue; shutdown with an exit status that only rises

**Verified review findings** against `b9ec1ed`; all six held:
- the synchronous writer, and its 2 s EAGAIN loop
- `emit` swallowing failures
- `server.stop` emitted before the deadline timer was armed
- the timer's dependence on a running event loop
- an ignored fatal error during shutdown, which could leave exit 0

One was worse than stated. With stdout unread, `fs.writeSync` blocked in
the kernel, because the pipe fd is in blocking mode here. The server stopped
answering entirely, and only SIGKILL ended it. `b9ec1ed` introduced this.

**Changes:**
- `src/server/log.ts`: `LineQueue`, a bounded asynchronous queue (1,000
  lines or 1 MiB) in front of `process.stdout.write`, honouring `'drain'`.
  Overflow drops new lines and writes one in-place `log.dropped` line with
  `lost: N`. Stream errors or close stop output for good, counted and
  never retried. `flushLogs(ms)` is bounded and best effort. A new `lost`
  field. `writeLineSync` is removed.
- `src/server/index.ts`: the deadline timer is armed first; the exit status
  only rises (`process.exitCode` follows it); a fatal error during shutdown
  is logged as `escalated_<kind>` and exits 1; cleanup waits one loop turn
  and then flushes for at most 1 s.
- Tests:
  - `spec/server/log-queue.test.ts` (9, new)
  - `spec/server/log-backpressure.test.ts` (7, new)
  - the harness gained `pauseStdout`, `resumeStdout` and `closeStdout`
  - `log-events.test.ts` waits for each line, since output is asynchronous
  - one lifecycle test retitled to what it shows

**Who decided:** the author set the requirements (no busy-wait on the
request path, a bounded buffer with an explicit overflow policy, a
monotonic exit status, a bounded flush, honest claims). The agent chose
the limits, drop-newest with an in-place gap report, the one-turn wait
before the final flush, and `process.exitCode`.

**Tests:**
- Stall repro: before, the server wedged; after, 3,000 requests answered
  with stdout unread (p99 1 ms).
- Unit 9/9; subprocess 7/7; lifecycle 8/8.
- Against the previous code, 4 of the 7 subprocess tests failed.
- `pnpm build` passed.
- `pnpm check`: 225/225, three consecutive runs.
- Browser runs, each on a fresh server: log-rehearsal 13/13, identity-race
  18/18, session-revocation 5/5, multiplayer 17/17, interaction 85/85,
  inactive-member 6/6. Server stderr 0 bytes throughout.

Details: evidence 0012.

**Correction to the `b9ec1ed` entry above:**
- "Lines are written synchronously" was the defect described here, not a
  fix.
- Its tests showed the crash line arriving only while the reader kept
  reading.
- Its shutdown ignored a fatal error raised during a graceful shutdown.
- ADR 0013 and evidence 0011 now carry dated corrections.
- The claims "always delivered" and "shutdown can never hang" are
  withdrawn.

### 2026-10-20 15:24 AEDT — [`23f1746`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/23f1746) ADR 0013, CLAUDE.md, evidence 0012: logging under backpressure and shutdown exit status

**Changes:**
- ADR 0013:
  - a new "Output under backpressure" section, recording the superseded
    synchronous design and its defect
  - corrected shutdown steps and exit-status rules
  - what the deadline does and doesn't guarantee
  - the event table gains `log.dropped` and `escalated_<kind>`
- `CLAUDE.md`: rules against synchronous log writes; the queue's limits and
  overflow; the exit status only rises.
- `doc/evidence/0012-log-backpressure-and-shutdown.md` (new).
- A dated correction appended to evidence 0011; the original observations
  are unchanged.

**Who decided:** the author asked for honest claims and dated corrections.
The agent wrote the text.

**Tests:** `pnpm check:evidence` clean, `git diff --check` clean. No code
changed in this commit.

### 2026-10-20 15:36 AEDT — Push and deployment of `6b1fda1` (no code commit)

The author said "push and deploy".
- `git push origin main` moved `f325e2e` → `6b1fda1`, 14 commits.
- That triggered the `checks` workflow, run 39370218138: `check` and
  `deploy` both succeeded.
- Fly release v11.

Live, read-only checks: routes answered 200, `X-Request-Id` is present, the
lobby bundle matches the local build and contains the identity gate, and
`flyctl logs` shows the new event format. One anonymous `/api/me` probe
created one visitor row. Details: evidence 0012, "Live deployment".

**Not done:** the two-classmate rehearsal and browser runs against the
live app.

## 21 October 2026, 09:54 AEDT — Author-approved README update (Codex)

Commit: [`d395546`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d395546)
— `docs: update README with author-approved C10 draft`.

The author reviewed the English draft and its Chinese translation, approved
the content, and explicitly requested that the English version replace the
README without pushing or deploying. Codex applied that approved text.
It replaces C8-only and complementary-inventory descriptions with the
current shared inventory, Plan mode, rooms, accounts and saved creations;
adds the author's approved childhood motivation; and treats the reference
house as optional inspiration. The two-device synchronisation observation
is the author's report, not a new test run by Codex or a two-classmate trial.

Checks: `git diff --check` and `pnpm check:evidence` passed. This was a
documentation-only change; no application/browser tests were rerun.
PROCESS and reflections were not changed. Further design-source discussion
remains a possible README follow-up. Nothing pushed or deployed.

## 21 October 2026 (Australia/Sydney) — Author-approved C10 PROCESS update

Commit: [`c30f47d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c30f47d)
— `docs: update PROCESS with approved C10 account`.

The author reviewed the English draft and Chinese translation, requested
generic "the agent" / "agent-assisted review" wording rather than tool
names, and explicitly approved updating PROCESS without pushing or deploying.
The approved account replaces the C9 overview with the cooperation and Plan
design changes, agent-recommended stack, logging investigation, identity
ordering, backpressure correction, and current evidence limitations. It
retains the AI-assistance disclosure and distinguishes the author's reported
two-device test from agent-run checks and the outstanding classmate rehearsal.

Verification: `git diff --check` passed; `pnpm check:evidence` passed with
15 PROCESS commit citations resolving; no Claude or Codex names remain in
PROCESS. Documentation only: no application or browser tests were rerun.
README, reflections and application code were unchanged in this turn.
Nothing pushed or deployed.
