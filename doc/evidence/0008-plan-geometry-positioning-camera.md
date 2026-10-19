# Evidence 0008: plan geometry, positioning, plan visibility, placement feedback and camera

Collected by the agent on 19 October 2026 (AEDT). All results were gathered
against a local, isolated server built from the working tree. That tree
became
[`7cc7a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7cc7a4d),
[`4f768b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4f768b9)
and
[`1112a96`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1112a96),
plus the camera-hint position on phones and the screenshot naming in
`scripts/plan-geometry.ts`, which went into the same commit as this file.

- Server: `DATA_DIR=/tmp/bc-test PORT=8361`, a fresh throwaway database.
- The dense-plan screenshots came from a second throwaway server
  (`DATA_DIR=/tmp/bc-p3 PORT=8360`).
- Never the persistent dev database and never the deployed app. Nothing was
  pushed or deployed.
- Decision record: ADR 0012.

## Environment

- macOS (Darwin 24.6.0), Node and pnpm via `mise exec`.
- **Google Chrome**, local install, driven by Playwright (`channel: "chrome"`,
  `--enable-unsafe-swiftshader`).
- **Playwright's WebKit build** (`webkit-2359` in the Playwright cache).
  This is WebKit, the engine Safari uses, but **not Safari itself**.
  Safari.app was not driven.
- The 390×844 runs use Chrome's touch emulation (`isMobile`, `hasTouch`) with
  touch gestures dispatched through the DevTools protocol. This is **not a
  physical phone**. Touch gestures were not run in WebKit, because
  Playwright has no multi-touch API there.
- "Two independent browsers" means two browser contexts with separate cookie
  jars, and so two separate visitor identities, in one browser process on one
  machine.

## Automated suite

`APP_URL=http://localhost:8361 pnpm check`: typecheck clean, **156/156
passed** in 17 files. The count was 126 before ADR 0012.

New coverage:
- `spec/domain/plan-geometry.test.ts`, 23 tests:
  - placing a plan on the plot, on real studs (including an overhang), and
    on a standing plan
  - a roof on a planned wall
  - floating refused
  - duplicate, partial sideways and partial vertical overlaps refused
  - adjacency and bridging allowed
  - slope and ridge stud rules
  - planning beyond stock
  - out of bounds
  - a real part on a plan refused, and a real part where a plan is allowed
  - realization needs real support and real stock, and a failed one keeps
    the plan
  - wall then roof
  - withdraw, remove and rotate refused with `plan_depends`, with
    alternative support allowed
  - turning a part into a plan's space allowed
  - no cascade
  - legacy and overtaken plans: reported, give no support, block nothing,
    withdrawable
  - Plan-mode heights equal what `validatePlan` accepts
- `spec/server/legacy-plans.test.ts`, 5 tests. Plans are inserted straight
  into SQLite as an older server would have left them (floating, duplicate,
  on a floating plan). They are:
  - served unchanged with their fits
  - non-blocking for unrelated work
  - each withdrawable
  - ordered by commit, even when two share a `created_at` millisecond
  - kept as conflicting, with stock untouched, when a real part is built
    into one
- `spec/plans-and-attribution.test.ts`, at the HTTP level:
  - floating refused
  - wall plus roof, and realization order
  - collisions with real parts, plans and partial overlaps; adjacency
  - real-on-plan refused
  - withdraw, remove and rotate refused with `plan_depends`
  - two concurrent overlapping proposals from A and B: exactly one commits

**Obsolete tests updated at the author's direction (ADR 0012):**
- In `spec/plans-and-attribution.test.ts`, "a future roof floating with
  nothing below is accepted" and "a plan may overlap a real part" are
  replaced by the refusals above.
- `spec/realtime.test.ts`: its plan now rests on the plot.
- `spec/domain/planned-remaining.test.ts`: plans are spaced so they no
  longer overlap.
- `scripts/plan-mode.ts` step 5 no longer climbs Higher into unsupported
  space. Step 6 checks that the preview is kept and refused instead.
- `scripts/review-fixes.ts` §2: the future roof is planned on a planned
  wall.
- `scripts/interaction.ts`: orbit checks use the right button, not the left
  (the left button builds), and a "middle-drag pans too" check was added.

## Browser runs (all against port 8361, sequentially)

| Script | Engine | Result |
|---|---|---|
| `scripts/plan-geometry.ts` | Chrome | **61/61** |
| `scripts/plan-geometry.ts` | Playwright WebKit | **54/54** (no touch section) |
| `scripts/plan-mode.ts` | Chrome | 42/42 |
| `scripts/review-fixes.ts` | Chrome | 15/15 (prints only; no results file) |
| `scripts/multiplayer.ts` | Chrome | 17/17 |
| `scripts/interaction.ts` | Chrome | 85/85 |

Result files: `shots/plan-geometry/results-*.json`.

`scripts/plan-geometry.ts` drives visible controls in two contexts, A and B:

- **Geometry:**
  - A plans a brick, stacks a plan, then a roof plan on the stacked top.
    Each commit equals the preview read beforehand.
  - On bare plot Higher offers nothing.
  - A duplicate isn't offered.
  - A directly sent overlapping plan is refused.
  - B receives all three live.
  - B's withdrawal of the base is refused with a message naming the
    dependant.
  - In Build mode the pointer looks through plans.
  - Realizing the base spends one real brick and keeps both plans above.
  - Two simultaneous overlapping proposals from A and B: one committed.
- **Drop animation:**
  - on B's screen, from realization: starts about 0.2 up, eases down
    monotonically, ends at rest
  - on A's screen, from the pushed change
  - never for plans
  - the part's own y is final throughout
  - no replay without a new commit, none after reload, none for a recolour
  - once on each screen for an ordinary placement
  - none at all under `prefers-reduced-motion`
- **Positioning:**
  - Plan → Build and Build → Plan keep the exact preview.
  - A plan-only preview shown in Build mode is refused by Place and by
    Enter.
  - Moving across the scene to the dock's commit button doesn't drag the
    preview, and the button commits the rested preview.
- **Camera:**
  - Right-drag orbits about the centre.
  - Shift+right and middle drag pan.
  - Orbiting after a pan turns round the panned centre.
  - The wheel zooms.
  - The horizon stays level.
  - No gesture edits.
  - Focus selected is disabled with nothing selected and enabled once the
    top brick of a six-brick tower is selected. F centres on it, framed
    closer.
  - T gives a top view over that centre, and Reset view restores the
    default framing.
  - The Orbit and Pan tools are pressed. With one on, a left drag navigates,
    the held preview stays frozen, and a click doesn't place. Esc leaves
    the tool while keeping the part, and a click then builds.
  - F, P and T typed in a text field aren't shortcuts.
- **Touch (Chrome, emulated):**
  - tap-to-preview, then a tap proposes
  - a tap on the preview stacks a plan
  - one finger orbits, two fingers pan, a pinch zooms; none of them propose
  - the header fits in two rows

## Screenshots, inspected

All in `shots/plan-geometry/`:

- `dense-selected-desktop.png` and `dense-selected-low-angle.png`: a
  three-course planned wall, about 15 plans, with one plan selected in the
  middle course. Default view, then a low angle with houses and bright sky
  behind. The selected plan's cyan edges and lighter fill stand out in
  both. Unselected plans stay subdued blue, and nothing is solid.
  - An earlier, subtler selected-plan treatment was judged too
    weak in the first screenshot and strengthened before commit
    [`4f768b9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4f768b9).
- `dense-selected-phone.png`: the same at 390×844, emulated touch.
  - The camera hint first sat above the dock and overlapped the notice.
    It was moved under the header on phones (in this commit) and
    re-checked.
- `chromium-b-selected-plan-dense.png` and `webkit-b-selected-plan-dense.png`:
  B's view of A's three stacked plans with the base selected. Chrome and
  WebKit render it the same way.
- `chromium-a-invalid-in-build.png` and `webkit-a-invalid-in-build.png`:
  a preview valid only as a plan, after switching to Build. It stays in
  place, drawn red with "✕ Can't place", and the dock gives the reason
  and disables Place.
- `chromium-camera-focus-high.png` and `webkit-camera-focus-high.png`: after
  F on the top of a six-brick tower, the brick is centred and close.
- `chromium-mobile-plan-stack.png`: a phone in Top view with two stacked
  plans; the dock shows Plan mode and planning demand.

## Not tested

- Safari.app, iOS Safari, Firefox, and any physical phone or tablet.
- Multi-touch in WebKit.
- A trackpad's two-finger gestures. Wheel events were sent; real trackpad
  pinch was not.
- Two people on two machines over a real network. The two contexts shared
  one machine and localhost.
- The deployed site. Nothing was pushed or deployed for this change.
