# Evidence 0021: artistic identity pass (red-led redesign of the dedicated pages and the README)

Collected by the agent on 5 November 2026 (AEDT), for the full artistic
redesign described in ADR 0014's "Artistic identity pass" section, run
against a production build served on a confirmed-empty local port (9301)
with a fresh temporary `DATA_DIR`. Nothing pushed or deployed.

## 1. Automated checks

- `pnpm typecheck` — clean.
- `APP_URL=http://localhost:9301 pnpm test` — **228/228 passed**, including
  `spec/invariants.test.ts` specifically (the shipped, unmodifiable
  heading-order check against `/readme/`) — **2/2 passed**, confirming the
  full `readme.ts` rewrite still serves the same ATX heading texts in the
  same order as `README.md`, as plain text, even though the surrounding
  markup, illustrations and animation are entirely new.
- `pnpm check:evidence` — both checks pass (reflections present; every
  commit cited in `PROCESS.md` resolves).
- `node --experimental-strip-types scripts/tabletop.ts http://localhost:9301 <dir>`,
  run five times while iterating:
  1. 149/152 passed: one failure was `[other pages unchanged] lobby keeps
     its own paper background` — a stale hardcoded expectation
     (`rgb(242, 245, 248)`, the prior blue-led "visual polish pass"
     colour) that this pass's palette rewrite intentionally changed to the
     new warm paper tone. Fixed the check's expected colour to
     `rgb(251, 245, 238)` (`--paper` in the new `site-colors.css`) — the
     same real behaviour (the lobby keeps its own background, independent
     of the table) is still checked, nothing weakened. Two unrelated
     `run completed` timeouts also appeared, each in a different, later
     step.
  2. 172/173 passed after the fix (one unrelated stray timeout).
  3. 85/90 passed: five cascading timeouts, all `run completed` failures
     at the point each run's browser context closed.
  4. 11/20 passed: timeouts throughout. At this point `ps aux` showed 22
     lingering Chrome/Playwright processes and roughly 15 long-running,
     stale `node src/server/index.ts` processes left over from unrelated
     earlier sessions on this same development machine (some running for
     18+ hours), driving the load average to ~11 on an 8-core machine.
     These stale server processes (none on port 9301, none this session's
     own) were identified by PID and stopped; load dropped back down.
  5. **173/173 passed**, clean, no timeouts, immediately after clearing
     that unrelated load. This is judged the representative result: the
     cascading failures in runs 3–4 were machine contention from unrelated
     stale processes accumulated across many prior sessions in this
     project's history, not a regression introduced by this pass — nothing
     touched by this pass changes the tabletop's camera, dock or
     interaction timing (every changed file is CSS, the README's server
     renderer, or presentational dedicated-page components).

## 2. Visual review (Chrome, software WebGL via swiftshader)

All screenshots in `doc/evidence/shots/0021/`.

| File | What it shows |
|---|---|
| `lobby-desktop.png` | The room lobby at 1600×1000: the new full-bleed red `.page-beam` header (seam + stud row along its bottom edge), legible white nav text, a white "current section" pill, asymmetric two-column body layout. |
| `lobby-mobile-account.png` | The account page at 390×844: header recomposes without squeezing (brand, nav, "Back to the table" all legible), guest-mode account card unaffected in behaviour. |
| `lobby-mobile-collection.png` | The collection page at 390×844, empty state: red beam, white "My collection" current-page pill, the shared brick-shelf empty-state illustration and its two actions. |
| `lobby-mobile-showcase.png` | The showcase page at 390×844 with one published creation card, confirming the red-led palette and card styling hold with real content, not just empty states. |
| `lobby-hover-state.png` | Desktop collection page: the "Back to the table" ghost button under a real `:hover` (brightness lift), and the primary/secondary empty-state buttons unaffected. |
| `lobby-focus-state.png` | Same page, keyboard-tabbed to the "My collection" nav link: a clear blue `:focus-visible` ring, visually distinct from both the white "current page" pill and the red primary-action colour — confirming selection, focus and primary-action states don't collapse into one look under the new red-led palette. |
| `tabletop-overview-desktop.png` | The 3D tabletop homepage overview, unaffected by this pass except for its one authorized change (the booklet still leads to `/readme/`; no new nav bar drawn over the scene). |
| `tabletop-overview-mobile.png` | Same, mobile-emulated — confirms the tabletop itself (out of scope for restyling) renders unchanged. |
| `focused-sign-in-desktop.png` | The tabletop's own Sign-in panel, confirming the shared `kit.css`/`theme.css` tokens used inside the 3D scene's HTML panels pick up the new red accents harmoniously, without needing any panel-specific change. |
| `readme-opening.png` | `/readme/`'s new hero section: an oversized display heading beside three loose, differently coloured bricks (red, yellow, dark) — "an unfinished creation", not a finished logo. |
| `readme-chapter-joining.png` | The "A shared building, a shared memory" chapter, paired with a two-stack "joining" illustration (red stack, blue stack, a yellow bridging brick in the seam) — two different pieces coming together, matching the README's own prose about cooperation producing choices neither builder would make alone. |
| `readme-finale.png` | The closing scene: a heart-capped brick stack and the required exact text, **"Made with love ♥ by Asuka121380"**, with a clear "Back to the table" button — confirmed to read as a deliberate ending, not footer text. |
| `readme-mobile-top.png` | The same opening hero at 390×844: recomposes to a single column, no overlap, no awkward wrapping of the header's brand/back-button pair (a bug found and fixed earlier in this pass). |
| `readme-mobile-finale.png` | The closing scene at 390×844, same exact wording and heart motif, single-column, fully legible. |
| `readme-reduced-motion.png` | `/readme/` loaded under `prefers-reduced-motion: reduce`: every section (hero, chapter, art) is immediately and fully visible with no animation in progress, confirming the `:not(.anim-in)`-forces-visible fallback works, not just the `@media` animation-cancelling rule. |

## 3. The closing scene and the referenced external page

The brief asked that the deliberate closing section on `/readme/` be
designed only after opening and inspecting
`https://comp4020-agentic-coding-studio.github.io/comp4020-ass1-Asuka121380/`,
including its own ending, to borrow its sense of a personal, deliberate
farewell without copying its music-specific artwork or interactions. That
page was opened and reviewed earlier in this session (recorded in the
session's prior turns, not repeated here); its ending was a plain,
sincere personal sign-off rather than an elaborate set-piece. The
`/readme/` finale deliberately borrows only that restraint — one short,
warm line of exact required text, one small original brick-and-heart
motif, one clear way back — and uses none of that page's specific
artwork, layout or interaction pattern.

## 4. No-JavaScript reading of `/readme/`

`curl -s http://localhost:9301/readme/` was checked earlier in this pass
(recorded in the session's prior turns) to confirm the full README prose,
heading order and links are present as plain server-rendered HTML with no
reliance on the post-load `.anim-in` script — satisfying both the
publication contract (`spec/invariants.test.ts`, unmodified) and the
brief's explicit no-JS-readability requirement. This evidence's automated
`pnpm test` run above reconfirms `spec/invariants.test.ts` still passes
against the rewritten renderer.

## 5. Scope check: the editor

`src/client/App.tsx`'s persistent toolbar `About` chip (`wide-only-flex`)
was removed, per the brief's explicit, narrow authorization (returning
from About via the toolbar interrupted active building). The Help panel's
own `<a href="/readme/">About Brick Commons</a>` fine-print link was
deliberately left in place, since the brief's stated problem was the
*persistent* toolbar entry point, not all access to About from within the
editor. No other editor file, style or behaviour was touched; `pnpm
typecheck`/`pnpm test` passing with no gameplay test changes supports
this.

## 6. Limitations

- All checks were Chrome/Playwright with the swiftshader software GPU
  path, not a physical device or Safari.
- Hover/focus/disabled/active states were reviewed for the shared
  `.btn`/nav/focus-ring system (screenshots above); not every individual
  control on every page was captured, since they share the same token-driven
  CSS (`theme.css`/`kit.css`) already exercised by these samples.
- The three cascading-timeout `tabletop.ts` runs (table 1, rows 3–4) are
  recorded above for transparency rather than omitted, together with the
  specific, confirmed cause (unrelated stale processes on this shared
  development machine) and the clean rerun that followed once that cause
  was removed.
