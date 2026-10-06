# Evidence 0003: open street, camera and contextual interaction

Collected by the agent on 6 October 2026 (AEDT). It records what was run and
what it showed.
- Decisions: ADR 0003.
- Running history: `DEVELOPMENT_LOG.md`.
- Screenshots:
  - `shots/interaction/`
  - `shots/street/`

Everything here ran against a **local** server. The deployed app still runs
[`9202f3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/9202f3f),
so none of this has been checked on Fly.

## Commits covered

- [`a4ed156`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a4ed156)
  The rotate command, the window, fence and planter parts, and the scene
  version 2 kit with its in-place upgrade.
- [`7c59819`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7c59819)
  The open street: sky, fog, the extended ground and road, neighbours with
  real openings, the back row, and the distant ring.
- [`3875ab0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3875ab0)
  The contextual interaction, the window-level keyboard, the bounded 360°
  camera, the floating dock and the thumbnails.
- [`d992b5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d992b5f)
  `scripts/interaction.ts` and its first results: 70/70 at 18:28, on a
  build of `3875ab0`.
- [`493a556`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/493a556)
  Previous and Next part buttons for `[` and `]`, plus a check for them. The
  results below are from this tree.

## Setup

- `pnpm build`, then `DATA_DIR=./data PORT=8080 node src/server/index.ts`.
- The source was the tree committed as `493a556`. The only uncommitted files
  were this evidence file and the ADR 0003 edits.
- Chrome from the local install, driven by `playwright-core` with
  `--enable-unsafe-swiftshader`, so WebGL was software-rendered.
- Each run used a fresh browser context, which means a new visitor cookie and
  an empty build.

## `pnpm check`, 18:34 AEDT

- Typecheck clean.
- 42/42 tests passed in 5 files: the shipped invariants, domain, rotation and
  decorative parts, the version 1 → 2 upgrade on in-memory SQLite, and
  persistence over HTTP.

## Browser interaction, `scripts/interaction.ts`, 18:34 AEDT

The raw results are in `shots/interaction/results.json`. Overall: 71/71
passed, with no console errors in any run.

| Run | Input | Viewport | Passed |
| --- | --- | --- | --- |
| `desktop-mouse` | Playwright mouse and keyboard | 1920×1080, then 1280×720 and 390 wide | 48/48 |
| `keyboard-only` | keyboard only, starting from Tab | 1920×1080 | 13/13 |
| `touch-emulated-390x844` | **Chrome touch emulation** (`hasTouch`, `isMobile`, CDP `Input.dispatchTouchEvent`) | 390×844 | 10/10 |

### What the checks cover, with observed values

**Holding a part:**
- Choosing a tray part holds it.
- Hover shows a snapped preview, and its text says it fits.
- A click places the part where the preview was. The part stays held, and
  stock drops by one per placement.
- The save chip reads "Saved" only after the server commits.
- Esc puts the part down, and so does choosing the same tray part again.
- Clicking a placed part while holding one stacks the new part on its studs:
  2×4 at (0, 3, 0).

**Selected part:**
- The selection is named by part and code.
- Recolouring goes through the server.
- Pressing R right after clicking a swatch still reaches rotate. This one was
  refused with "Can't turn it there: that would stick out of the build plot."
- A valid rotate is a server command: a 2×4 at (10, 0, 3) became (11, 0, 2)
  with rot 1.
- The Next and Previous part buttons step the selection away and back
  without a revision.

**Focus:**
- A button clicked with the mouse doesn't keep focus.
- Enter on a keyboard-focused Rotate turns the part once (one revision), and
  the button keeps focus through the save.

**Delete tool:**
- Hover names the target.
- Pressing Enter after clicking the tool button reaches the delete action. On
  a part that holds another up it is refused with "Can't remove this yet: it's
  the only support for a Brick 2×4 above it. Remove that first."; nothing
  cascades.
- A click removes the part, and it goes back in the kit.
- The tool stays on until it is turned off. Esc turns it off, D turns it on,
  and choosing a tray part leaves it.

**Drags never edit** (checked in three states):
- holding a part
- nothing held, starting on a part
- delete tool on, starting on a part

**Camera:**
- The orbit went past 360° (419° turned).
- Dragging down stops at polar 1.360, with the camera at y 10.74, above the
  ground.
- Zoom stops at 14.0 and 95.0.
- Panning clamps the target to (22.0, 4.0, 14.0).
- T and Home move the camera.

**Decorative parts:**
- The window, fence and planters place as ordinary parts.
- The planter runs out after three, and the tray shows it as empty.
- The fourth attempt is refused in the browser before any request is sent:
  "Can't place there: No Planter with flowers (PL2) left in your kit."

**Target card:** it opens and shows the app's own render of the reference
model it was built from. That render is drawn from catalogue geometry; it is
not an image from the instructions.

**Reload:** the build (8 parts) and the kit are exactly as they were.

**Resize:**
- At 1280×720 the part stays held, places where aimed, and the dock fits.
- At 390 wide the dock stays on screen.

**Keyboard only:**
- Tab reaches a tray part, and the focus ring is visible (solid).
- Enter holds the part, starts the preview and focuses Place.
- The arrow keys move the preview.
- Enter places exactly once, and a second Enter stacks on top.
- `[` and `]` select.
- Delete is refused for the bottom part and removes the top one.
- D, `]` and Enter remove with the delete tool.
- Letters typed in a text field are not shortcuts.

**Touch (emulated):**
- The dock folds from 224 px to 59 px.
- A tap holds a tray part.
- The first tap on the plot previews without placing, and a second tap on the
  preview places.
- A one-finger drag orbits (azimuth 0.00 → −1.04) and places nothing.
- A two-finger pinch zooms (distance 75.3 → 15.1) and places nothing.
- A tap selects a placed part.
- With the delete tool, the first tap only names the target and the second
  removes it.

### Camera distances measured with `?debug`

| Viewport | Reset view | Top view |
| --- | --- | --- |
| 1920×1080 | 32.2 | 26.0 |
| 390×844 | 71.3 | 75.3 |

The 75.3 is above the drafted maximum distance of 75. That is why the
maximum became 95 (ADR 0003).

## Screenshots

`shots/street/`, from `scripts/shoot.ts`, show a fresh visitor's empty plot.
They were taken at 18:28 on a build of `3875ab0`. `493a556` changes only the
selected and delete rows, which aren't on screen in these shots.
- `street-desktop.png`, at 1920×1080
- `street-mobile.png`, at 390×844

`shots/interaction/`, from the runs above:

- desktop:
  - `desktop-idle.png`
  - `desktop-holding.png`
  - `desktop-selected.png`
  - `desktop-delete-tool.png`
  - `desktop-after-orbit-reset.png`
  - `desktop-decor.png`
  - `desktop-target.png`
- mobile:
  - `mobile-idle.png`
  - `mobile-folded.png`
  - `mobile-preview.png`
  - `mobile-selected.png`
  - `mobile-delete-target.png`

## Emulated, not physical

- All touch results come from Chrome's touch emulation on a laptop. No
  physical phone or tablet was used.
- Emulated touch shows that the event paths work: tap, the two-tap
  confirmation, one-finger orbit and two-finger pinch. It does not show:
  - how the dock feels under a thumb
  - whether hit targets are large enough on a real screen
  - how the browser's own gestures (pull-to-refresh, edge swipes) interact
    with the canvas

## Not checked

- A physical phone or tablet.
- Real trackpad gestures. Two-finger scroll and pinch on macOS were not
  driven.
- Frame rate, on any device. Headless Chrome used SwiftShader; GPU
  performance and low-end devices were not measured.
- Browsers other than Chrome.
- A screen reader.
- The deployed app. None of these commits has been deployed.
- Anyone other than the agent using it.

## Visible departures from the art-direction image

The author's art-direction image is an AI-generated mood reference, not a
spec. It is kept outside the repo. Compared with it:
- There are no people, minifigures or vehicles. This is the author's rule in
  CLAUDE.md.
- The street is generated geometry in the brick idiom, not modelled scenery.
  The distant houses are simple boxes with roofs, fading into fog.
- The dock carries more controls than the image's: the context row, the tabs
  and the Delete tool.
- The top-bar controls are text buttons.
