# Evidence 0030: the About page illustrates the approved README

Collected by the agent on 8 November 2026 (AEDT), against local servers
only. Nothing was pushed or deployed, and no database was touched beyond
throwaway local data directories.

- **Change:** [`0575115`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0575115).
- **Decision:** ADR 0014, "About page: the approved README's argument in
  pictures".
- **Prose source:** README.md as committed in
  [`6202b5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/6202b5b).
  It is unchanged by this work.

## 1. What changed

| File | Change |
| --- | --- |
| `src/server/readme.ts` | `CHAPTERS` maps heading slugs to treatments. Unknown sections render as a plain chapter. New compositions, chapter anchors, and once-on-entry motion. |
| `src/client/ui/aboutScenes.ts` (new) | Five layered isometric scenes, built on `isoSvg` only. |
| `Dockerfile` | The runtime COPY lists `pageHeader.ts`, `aboutScenes.ts` and `iso.ts`, the server's real imports outside `src/server` and `src/domain`. |
| `scripts/about.ts` (new) | The checks below. |

Not changed:
- `README.md`, `spec/`, `src/client/ui/brickScenes.ts`,
  `src/client/ui/iso.ts`, `src/client/ui/pageHeader.ts`;
- gameplay, the homepage scene, the backend data, `fly.toml` and the
  workflow.

## 2. The production image

**Docker could not be used.**
- The Docker CLI (29.6.2) is installed, but `docker info` got no answer
  from the daemon's socket (killed after 8 s; an earlier unbounded call
  hung).
- So no image was built here. CI's check job builds the image on the
  next push.

**Instead, the image layout was reproduced from the committed tree** (a
clean `git worktree` at `0575115`):
1. **Import closure.** A walk of every relative import from
   `src/server/index.ts` reached 22 files. Outside `src/server` and
   `src/domain` it reached exactly `src/client/ui/aboutScenes.ts`,
   `iso.ts` and `pageHeader.ts`. Bare packages: `express`, `marked` and
   `node:` built-ins only, both in `dependencies`.
2. **Runtime-stage simulation.** The Dockerfile's runtime-stage COPY
   lines were executed into an empty directory, with `dist/client` and
   `pnpm install --prod`. The result had the same 22 source files, and
   `src/client/ui` held only the three modules above.
3. **Run.** The server was started from that directory with
   `NODE_ENV=production`:
   - `/readme/` and `/` answered 200;
   - `pnpm check` passed 304/304;
   - `scripts/about.ts` passed 40/40.
4. **Negative control.** The same directory without `aboutScenes.ts` (the
   old COPY list) exited 1 with `ERR_MODULE_NOT_FOUND … aboutScenes.ts`.
   This is the v13 failure mode, so the COPY change is required.

## 3. Browser checks

`node scripts/about.ts <url> <dir>`, in Chrome through Playwright, at
1920×1080 and at 390×844 (mobile emulation, DPR 2). **40/40 passed**,
against both the dev server and the image layout.

| Check | Result |
| --- | --- |
| Server HTML: every README heading, in order | pass |
| Every README sentence (44) and both external links in the server HTML | pass |
| Every illustration `<svg>` `aria-hidden` | pass |
| Below-the-fold chapters still in their start state at load | pass, both sizes |
| Natural wheel scrolling: the planned roof visible while its chapter plays (sampled opacity 1) | pass, both sizes |
| After scrolling: every section `.in-view` and in the finished state | pass, both sizes |
| Plays once: scrolling back shows the finished state, no replay | pass, both sizes |
| No horizontal overflow | pass, both sizes |
| Sticky header: each chapter heading opened by `#anchor` sits below the beam | pass. Desktop beam bottom 74 px, headings at 211–220 px. Mobile beam 158 px, headings at 191–207 px |
| Keyboard focus: brand, 5 nav links, Back to the table, Jenkins, MDA, finale Back to the table; each with a 3 px solid ring, on screen and not under the beam | pass, both sizes |
| No page errors | pass, both sizes |
| JavaScript off: every scene finished (real roof shown, plan hidden) | pass, both sizes |
| `prefers-reduced-motion: reduce`: finished, `document.getAnimations()` empty | pass, both sizes |
| Internal links (`/`, `/build/`, collection, showcase, account, `/readme/`) answer 200 | pass |
| Signature, Back to the table and disclaimer present | pass |

**Unknown sections**, rendered by `renderReadme` from temporary README
copies (the real README.md was only read):
- An added `## A future section` with a link and a list renders as a
  plain chapter: all of its words, the link and the list, and no art.
  The four known chapters keep their art. No overflow at either size.
- A heading with different case and punctuation still finds its
  treatment.
- A file with no `#` title: the preamble is the opening, with no `<h1>`.
- A file that starts with `##`: no opening, and all four sections are
  chapters.

## 4. Regression checks (dev server, port 8440)

- `pnpm typecheck`: pass. `pnpm build`: pass.
- `APP_URL=http://localhost:8440 pnpm check`: **31 files, 304/304**,
  including the shipped `spec/invariants.test.ts`, which is unmodified.
- `pnpm check:evidence`: pass.
- `node scripts/interaction.ts`: **85/85**, including "/readme/ still
  answers" and "no console errors".
- `node scripts/tabletop.ts … others`: **5/5**, including "/readme/ loads
  without console errors".
- `node scripts/tabletop.ts … entrances`: **75/75**, including the
  booklet arriving at `/readme/`, its Back to the table link, and Back
  returning to the table.

These were run one at a time, never in parallel with another browser
suite.

## 5. Screenshots: `shots/0030/`

- `{desktop,mobile}-{0-hero,1-ch-table,2-ch-proposal,3-ch-kept,4-ch-intention,5-finale}.png`:
  each chapter after it played, viewport-sized.
- `{desktop,mobile}-full.png` and `{desktop,mobile}-nojs-full.png`: the
  whole page with and without JavaScript, downscaled.
- `{desktop,mobile}-unknown-section.png`: the added test section in place.
- `before-desktop-full.png`: the previous About page, for comparison.

All are colour-quantised to keep the repository small.

## Limitations

- **No Docker build** here; see section 2. The image check is a
  simulation of the runtime stage, not the image itself.
- **Chrome only**, through Playwright. Mobile is emulation, not a
  physical device, and Safari and WebKit were not checked.
- **The motion check samples state.** It confirms that motion starts on
  entering view, plays once and ends finished. Whether the motion looks
  good was judged from screenshots, not frame by frame.
- **Old About scenes kept.** The four scenes the previous About page used
  remain exported from `brickScenes.ts`, now unused, so the shared module
  was not changed.
- **A reworded README heading** keeps its words but loses its picture
  until its slug is added to `CHAPTERS`.
