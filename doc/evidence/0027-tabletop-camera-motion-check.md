# Evidence 0027: the tabletop camera-motion check, and the tree house at short heights

Collected by the agent on 8 November 2026 (AEDT). Follow-up to evidence
[0026](0026-woodland-presentation-pass.md), which recorded the failing check
below as "fails on `a3cdb33` too". That established only that the failure
predated the presentation pass. It did not establish the cause, or that the
interaction worked; 0026 now says so.

- **Build and server.** A production build (`pnpm build`) served by
  `node src/server/index.ts` on local port 8417, with a fresh disposable
  `DATA_DIR` (`/tmp/wp-data2`). The served `home-*.js` was checked against
  `dist/` before each batch, and the server was confirmed to answer first.
- **Machine.** An Apple M1 MacBook on macOS 15.7.4, plugged in. Google
  Chrome 156.0.8078.81 via Playwright 1.63 (`channel: "chrome"`).
- Nothing pushed or deployed.

## 1. The failure, reproduced

Check: "[entrances, desktop 1920×1080] scenes: clicking the object moves the
camera, the panel waits for arrival", observed `{"framesMoving":0,
"dialogWhileMoving":0}`.

The old check started a `requestAnimationFrame` sampler, clicked the scene
tray's 3D hit area, and counted samples where `__tableCamera().moving` was
true. It passed if there was at least one.

A one-off diagnostic followed the same steps (same hit-point search, same
viewport) and recorded on every frame: the time since `pointerdown`,
`moving`, the camera position and look-at target, whether a dialog was
mounted and its opacity, and the URL. Before each activation it checked:
- the page was at the overview (`data-focus="overview"`);
- `moving` was false;
- no dialog was open;
- `prefers-reduced-motion` was off;
- the camera was 50.8 units from the tray's destination.

| Renderer | Run | First frame after the click | Frames with `moving` | First frame with the dialog |
| --- | --- | --- | --- | --- |
| Chrome on the M1's GPU (Metal) | 3 runs | 34 ms, at the start pose | 41–42, over ≈700 ms | the frame after arrival |
| SwiftShader, as `tabletop.ts` launches Chrome | run 0 | **2,223 ms, already at the destination** | **0** | the next frame |
| SwiftShader | run 1 | 661 ms, 1 % from the destination | 1 | 2nd |
| SwiftShader | run 2 | ≈2.2 s | 0 | 1st |

On the GPU the timeline is a smooth ease: z goes 60.0 → 59.99 → 59.95 →
59.87 → … → 10.2 over about 700 ms. The panel mounts only after the frame
that lands.

Under SwiftShader, repeated activations at 1920×1080 and 1280×720 gave
gaps of 200–1,450 ms between frames, and 0–6 moving frames per move.

Chrome on the GPU with the CPU throttled 4× and 6× (CDP
`Emulation.setCPUThrottlingRate`): 42 and 41 moving frames over 686 and
679 ms. The move still animates on a slow CPU with a real GPU.

## 2. Root cause

The move is time-based by design (`TableScene.tsx` `CameraRig`):
- its position is `easeInOutCubic((now − start) / 700 ms)` along the path;
- arrival is reported from the frame that lands.

`scripts/tabletop.ts` launches Chrome with `--use-angle=swiftshader`, so
WebGL is drawn on the CPU. One frame of the table there can take longer
than the whole 700 ms move. The first frame after the click is then
already at t = 1, so the camera lands on it and no in-between frame
exists to sample.

So the old check measured how fast the test machine's software renderer
draws, not the app. It failed when a frame took longer than the move and
passed when one didn't. That explains why the same code passed in evidence
0025 (174/174) and failed on 8 Nov, on `a3cdb33` as well as later.

Hypotheses ruled out:
- **The camera jumps to the destination.** Not on a GPU: 41–43 eased
  frames, even at 6× CPU throttle. Under SwiftShader it lands on the first
  frame only because that frame comes after the move's duration.
- **`moving` doesn't reflect the transition.** It is true from the request
  until the landing frame, and the positions recorded with it change
  accordingly.
- **The start state or reduced motion.** At the overview, still, no
  dialog, reduced motion off, 50.8 units from the destination.

Users on a GPU see the animation. A browser rendering in software at
under about 1.5 frames per second would see the camera cut to the object.
That is the time-based design, and no slower than the panel then
appearing.

Two other checks had the opposite weakness:
- The sign-post check ("clicking the sign's post starts a camera move")
  and the booklet check read `moving` once after a fixed 80–120 ms.
  `moving` alone would pass with a camera that never moved.
- The reduced-motion check asserted only `!moving`, which a camera that
  never moved would also pass.

## 3. The change (test and debug hook only; the camera's behaviour is unchanged)

- **`src/client/home/tabletop/TableScene.tsx`.** `__tableCamera()`, which
  exists only with `?debug`, also reports `destination`: the pose last
  requested. Nothing else changes.
- **`scripts/tabletop.ts`**:
  - **`travel()`** observes one move in animation time:
    - The page's clock (`page.clock`) is installed and paused. The
      activation is made, then time is advanced 100 ms at a time with
      `fastForward`, which runs one frame per step.
    - Every step records the real camera position, whether a dialog is
      mounted, the path and the status line.
    - It passes only if all of these hold:
      - The start is still, normal-motion, and with or without a panel as
        expected.
      - The start is more than 5 units from the destination.
      - At least 3 steps are part-way: more than 0.5 units from both the
        start and the destination.
      - Each step is no farther from the destination than the one before.
      - No dialog appears while moving.
      - It lands within 0.01 of the requested destination at 600–900 ms
        of animation time.
  - **A new `motion` section** (its own browser context) runs `travel()`
    for:
    - the scene tray, noticeboard, Friends stand and shelf by mouse on the
      object, and Escape back from each;
    - the sign by keyboard (Enter on its face);
    - Back to table followed in the same tick by the noticeboard;
    - browser Back and Forward from a focused object;
    - a second choice 300 ms into a move (it continues from the current
      pose, and only the newer panel opens);
    - the booklet's approach, which then asks for `/readme/`.

    The clock stays paused for the whole section and the context is then
    closed. Resumed after stepping, the installed clock's frame timers fell
    behind SwiftShader's slow frames. The page then stopped drawing:
    `performance.now()` stood still for more than 15 s, and every later
    frame-polled wait timed out. So the other sections keep the real clock.
  - The `entrances` loop, the sign and the booklet in `desktop` still
    check everything else they checked: arrival, path clearance, URL,
    heading, focus, panel placement, no writes, Escape, focus return. They
    no longer count wall-clock frames.
  - **Reduced motion** now asserts real poses. The first changed state
    after the click is at the destination with `moving` false. The first
    after Escape is back at the overview. Both are still cuts.

**Proof that the new check can fail.** Two deliberately broken builds,
each restored afterwards (the restored `TableScene` chunk is byte-identical
in name, `TableScene-twYYptcA.js`):
- `moving` true, but the camera held still until the end: the tray check
  failed with `stepsPartWay: 0`; 13 of 18 motion checks failed.
- Always cut, as if under reduced motion: the tray check failed with
  `stepsMoving: 0`; the run then stopped (2/12).

`tabletop-scenes-move-stepped.png` shows the tray move under SwiftShader in
100 ms steps of animation time. At 700 ms the panel is mounted but has not
yet drawn its 220 ms fade-in.

## 4. Woodland Commons at short desktop heights

At 1280×720 the reference view's canopy was cut by the top edge, under the
"Preview", Orbit/Pan and view chips. Measured with the canopy's real
bounds:
- the canopy's merged geometry is x −5…37, y 28.8…46;
- the projected top point (16, 46, 4) was at y −1…0 px at 1280×720,
  1366×768, 1440×900 and 1920×1080, tray open or folded.

The opening frame fitted the tree to the very top of the canvas. At wide
screens the canopy fell between the left and right control groups; at
1280 the right-hand chips sit over it.

**The change.** `SceneInfo.camera.topClear` (default 0: unchanged for
Beach Houses and the castle) is a band in px kept out of the opening and
reset views. The orbit centre's screen position and the fit use only the
screen between that band and the dock. Woodland sets `topClear: 96`, just
under the right-hand chips (they end about 100 px down).

The fixed tree, the platforms, the rules, `frame`, `centreY`, `polar`,
`targetAt`, the Focus framing and `maxDistance` (130) are unchanged.

| Viewport | Tray | Canopy top (px) before → after | Plot front / dock top (px), after | Distance after |
| --- | --- | --- | --- | --- |
| 1280×720 | open | −1 → 83 | 488 / 479 | 130 (the limit) |
| 1280×720 | folded | 0 → 95 | 653 / 644 | 95.6 |
| 1366×768 | open | −1 → 94 | 528 / 527 | 129.4 |
| 1440×900 | open | −1 → 94 | 662 / 659 | 116.3 |
| 1920×1080 | open | −2 → 94 | 845 / 839 | 105.9 |
| 1920×1080 | folded | 0 → 95 | 1021 / 1004 | 86.8 |
| 390×844 (emulated) | open | — → 94 | 578 / 589 | 127.5 |
| 360×740 (emulated) | open | — → 73 | 488 / 485 | 130 (the limit) |

- **Empty and reference** give the same numbers: the fit doesn't depend
  on what is built.
- **At 1280×720 with the tray open** the fit reaches the zoom limit, so
  the canopy's top 10 px sit inside the band. It is clear of the chips in
  the screenshot. The tree is smaller there than at taller sizes, the
  price of fitting it all above an open tray on a short screen.
- **On a 360 px phone** the controls wrap into three rows (to about
  130 px), and the canopy's top still passes behind the last row. It was
  previously cut by the screen edge. Raising the zoom limit further for
  phones was not done: the brief asked for short desktop heights.
- **Shots:** `treehouse-1280x720-reference-before.png`;
  `treehouse-1280x720-{ref,empty}[-folded]-after.png`;
  `treehouse-1920x1080-{empty,ref}-after.png`; `treehouse-390-ref-after.png`
  and `treehouse-360-ref-after.png` (emulated).
- **woodland.ts.** The trunk-collision check zooms in with the wheel until
  the distance is under 10. It was bounded at 40 wheel steps of about 5 %,
  which the farther opening view no longer reaches. Its bound is now 80
  steps; the assertion (distance < 10, camera outside the trunk) is
  unchanged.

## 5. Checks run

Against the final build, on the fresh server above, after the last
rebuild:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `APP_URL=http://localhost:8417 pnpm check` | 304/304 (31 files) |
| `pnpm check:evidence` | passes |
| `scripts/tabletop.ts` (whole script, SwiftShader as launched) | **188/188**, including the 18 `camera motion` checks |
| `scripts/tabletop.ts motion`, alone, before the full run | 18/18 |
| `scripts/tabletop.ts reduced` | 3/3 |
| `scripts/woodland.ts` | 64/64 |
| `scripts/interaction.ts` | 85/85 |
| `scripts/castle.ts` | 34/34 |
| `scripts/showcase.ts` | 20/20 |

- **What the 188 includes** besides the motion checks:
  - mobile entrances (390×844, emulated);
  - entrances at 1280×800;
  - Back/Forward on the sign and the noticeboard;
  - direct `?focus=` links;
  - double clicks;
  - close and re-choose in one tick.
- **A discarded run.** One full run is not counted: `dist/` was rebuilt
  while it was running, and every section after that failed loading the
  page (132/138).
- **Not run:**
  - `multiplayer.ts` and `log-rehearsal.ts`: no server route, command path
    or realtime code changed.
  - WebKit: the change is to the tabletop test and one editor camera
    setting.

## 6. Remaining uncertainty

- The stepped check proves the app's move is smooth in animation time and
  lands where it was asked. How smooth it looks in wall time depends on
  the renderer. The GPU runs (41–43 frames over ≈700 ms) are one M1 Mac,
  not a phone.
- In `motion`, the clock stays paused, so the README's own load isn't
  awaited there. The `desktop` section still follows the booklet to
  `/readme/` in real time.
- Why the installed clock stopped the page's frames after `resume()`
  under SwiftShader was observed (above), not traced inside Playwright.
- Safari was not used. Mobile sizes are Chrome device emulation.
