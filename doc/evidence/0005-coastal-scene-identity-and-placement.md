# Evidence 0005: coastal scene, shared identity and surface-aware placement

Collected by the agent on 6 October 2026 (AEDT). Everything here ran locally
against `node src/server/index.ts` on port 8080, serving a fresh
`pnpm build`, with a local `./data` database. **None of this revision is
deployed.** The live site is still
[`fde2560`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/fde2560),
Fly release v4 (evidence 0004).

The revision covers these commits:

| Commit | What |
| --- | --- |
| [`24a8853`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/24a8853) | harness and ADRs 0004 and 0005 |
| [`cbe7d30`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cbe7d30) | homepage at `/`, editor at `/build/`, `GET /api/summary` |
| [`40e2eb4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/40e2eb4) | surface-aware height, Higher and Lower, camera-relative moves |
| [`d6746df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d6746df) | shared identity and the designed homepage |
| [`57549ea`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/57549ea) | the coastal scene |
| [`c1de11b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c1de11b) | editor restyle and route checks |
| [`b76a01f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b76a01f) | scene cover and the cache rule |

## Results

There were two runs. The screenshots and result files in
[`shots/coastal-c1de11b/`](shots/coastal-c1de11b/) come from the first. The
second repeated the suites at HEAD `b76a01f` after the cover and cache
change.

| Check | Engine | Run 1 (21:05–21:11, code of `c1de11b`) | Run 2 (21:26–21:28, HEAD `b76a01f`) |
| --- | --- | --- | --- |
| `pnpm check` with `APP_URL=http://localhost:8080` (typecheck, spec and persistence tests) | Node | 49/49 | 49/49 |
| `scripts/interaction.ts` | Chrome | 81/81: desktop mouse 48, keyboard only 13, touch emulated at 390×844 10, routes 10 | 81/81: desktop mouse 48, keyboard only 13, touch emulated 10, routes 10 |
| `scripts/placement.ts` | Chrome | 31/31: desktop heights 15, desktop directions 11, touch emulated 5 | 31/31: heights 15, directions 11, touch emulated 5 |
| `scripts/placement.ts` | Playwright WebKit 26.6 | 31/31 | 31/31 |

Every one of these runs reported no console errors.

### What the placement run shows (ADR 0005)

- **Lower spots stay reachable.**
  - With a part already at a higher level, pointing at the plot beneath it
    previews the lower spot.
  - Both heights that fit are offered, and the height is stated in words
    ("on the plot · height 1 of 2").
  - The Higher and Lower buttons, and PageUp and PageDown, step between
    those heights.
- **Confirming places what is shown.** A click commits the preview on
  screen (the lower one), not the spot under the pointer.
- **A chosen height survives horizontal moves.** Where it doesn't fit, it
  is kept and explained, not replaced.
- **Invalid lower spots are refused.** Under a gap too low for the part, the
  preview is shown there, refused in words, and clicking it sends nothing.
- **Arrows follow the camera.** From the front, both sides, the back, two
  oblique angles and top view (both orientations), → moves right on screen
  and ↑ moves up on screen. The → button and the → key make the same step.
  Near 45° the mapping holds until 55° and switches back only below 35°.
- **Touch matches.** Emulated taps build the same overhang, and the Lower
  button is present on a phone layout and reaches the plot.

### What the routes run shows (ADR 0004)

- A fresh homepage offers "Start building".
- The homepage loads no editor, environment or three.js chunk, and sets no
  cookie. Its scripts are `home-*.js` (about 2.4 KB) and `iso-*.js` (about
  7.7 KB).
- After a placement, the Home link leads to "Continue my build".
- Going home → build → home → build keeps the same build and stock.
- A reload keeps the build, `/build` redirects to `/build/`, and `/readme/`
  answers.

### Caching (manual check, `curl -I`)

- `/` and `/scenes/beach-houses.webp` returned `Cache-Control: no-cache`.
- `/assets/*.js` returned `public, max-age=31536000, immutable`.

## Screenshots

All are in [`shots/coastal-c1de11b/`](shots/coastal-c1de11b/), taken in
Chrome at 1920×1080 (desktop) and 390×844 (mobile, emulated) unless marked
WebKit. Each was viewed by the agent.

| File | Shows |
| --- | --- |
| `home-desktop.png`, `home-mobile.png` | the homepage: hero, how it works, the planned cooperation (labelled), the scene card with its cover, and the About section |
| `editor-default.png` | the opening view, from the beach side |
| `editor-coast-oblique.png` | a back-oblique view: the plot, the promenade, the beach and the sea together |
| `editor-top.png` | Top view |
| `editor-far-inland.png` | full zoom-out from inland |
| `desktop-holding.png`, `mobile-preview.png` | holding a part: the snapped preview with "Fits", and the dock's height and action row |
| `desktop-selected.png`, `mobile-selected.png` | a selected part, with recolour, rotate and delete |
| `desktop-delete-tool.png` | the delete tool naming its target |
| `mobile-idle.png` | the phone layout with nothing held |
| `desktop-lower-preview.png`, `desktop-lower-placed.png`, `mobile-lower-preview.png` | a lower placement beside and under a higher part, before and after |
| `webkit/desktop-lower-preview.png`, `webkit/mobile-lower-preview.png` | the same lower placement in Playwright's WebKit build |

The result files are `interaction-results.json`,
`placement-results-chrome.json` and `webkit/placement-results-webkit.json`.
They contain check names, results and part layouts, with no cookies or
identifiers.

## Emulated or physical

- **Everything was browser automation on one Mac.** Nothing was checked on a
  physical phone or tablet.
- **Touch** is Playwright's touch emulation (`isMobile`, `hasTouch`) at
  390×844 with device scale 2. It ran in Chrome for both scripts, and in
  WebKit for the placement script only.
- **WebKit** is Playwright's WebKit 26.6 build, run headless. **It is not
  Safari**, and no Safari version was used. Only `scripts/placement.ts` ran
  in WebKit. `scripts/interaction.ts` did not, because its touch run drives
  Chrome through the DevTools protocol.
- Mobile screenshots are viewport emulation: a desktop browser at a phone's
  size, not a phone.

## Not tested

- Safari on macOS or iOS, Firefox, and any physical touch device.
- The deployed app: this revision has not been pushed or deployed.
- Frame rate and load time on a low-end phone. The heavier environment
  (ADR 0004, Consequences) was only seen to render on this Mac.
- The upgrade path on the live database. The scene keeps its id and kit
  version 2, so no migration is expected (ADR 0004), but it was not
  exercised against copies of the live builds.
- Screen readers. Labels and roles were checked by the scripts; no screen
  reader was used.

## Visual limitations seen in the screenshots

- In top view, pale parts and the grey plot take a slight blue cast from the
  sky fill.
- Seen from the side at full zoom, a neighbour can hide the plot. That is
  ordinary occlusion, and orbiting clears it; the camera keep-out stops the
  camera only from going inside houses and palms.
- From inland, the house backs are in shade, because the sun is on the sea
  side.
- The promenade's dashed yellow cycle-lane line could be read as a road
  marking.
- On a phone, holding a part stacks the dock (title, swatches, height,
  actions, hint, tabs, tray) to about 40% of the screen's height
  (`mobile-preview.png`). The plot stays
  visible above it.
- The far hills are a painted canvas texture on the inland side only. They
  read as distant ridges at normal zoom; at full zoom-out from the sea side,
  the town in front of them is simple boxes.

## Asset provenance

- **Scene cover** (`src/client/public/scenes/beach-houses.webp`, 1200×750):
  rendered by the agent from this project's own scene, in Chrome, with the
  UI hidden. It contains no third-party imagery.
- **Textures, sky and sea:** generated in code (shaders and canvas). No
  image files.
- **Fonts:** Fredoka and Nunito, `@fontsource-variable` 5.3.0, SIL OFL 1.1,
  bundled and self-hosted.
- **Homepage illustrations and brand mark:** SVG drawn by
  `src/client/ui/iso.ts`.
- **Not committed:** the 11035 PDF and its renders, the reference
  photograph, the concept image, and third-party screenshots. The visual
  research is text only, in
  [`doc/research/0001-visual-identity.md`](../research/0001-visual-identity.md).
