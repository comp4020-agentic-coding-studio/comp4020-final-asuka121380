# Evidence 0022: artistic identity refinement (full-width framing, lobby-grid rooms, shared header, readable About)

Collected by the agent on 5 November 2026 (AEDT), for the refinement pass
described in ADR 0014's "Refinement: full-width framing, lobby-grid rooms,
shared header, readable About" section, following a real browser review of
evidence 0021's build at `http://localhost:9301` that found several
concrete layout and contrast defects. Against a production build, served
from confirmed-empty local ports (9301) with fresh temporary `DATA_DIR`s.
Nothing pushed or deployed.

## 1. The full-width bug, and how it was actually found

`doc/evidence/shots/0021` already showed `.page-beam` reaching the viewport
edges, which made the earlier pass's screenshots look correct. A later,
closer browser check — `getComputedStyle(document.body)` on
`http://localhost:9301/build/` at 1920×1080 — returned `max-width: 1088px`
and `margin: 0px 416px`, which no rule had been written to put on `<body>`.
Tracing it: `build/index.html` sets `<body class="lobby">` (for
`site-colors.css`'s palette scoping), and `lobby.css` separately declared
`.lobby` for the *inner* room-lobby content wrapper. Both rules matched the
same `<body>` element on every dedicated page, not only the room lobby,
confining the whole document to a centred column regardless of what
`.page-beam` itself did. This was not visible by reading `lobby.css` in
isolation — the bug lived in a class name collision between two separate
files, found only by inspecting the live computed box model.

Fix: the inner wrapper renamed to `.lobby-page` (`LobbyApp.tsx`); `.lobby`
is no longer declared as a page-width class in `lobby.css` at all; `html`,
`body` and `.page` carry no `max-width`.

## 2. Automated checks

- `pnpm typecheck` — clean.
- `pnpm build` — succeeds.
- `APP_URL=http://localhost:9301 pnpm test` — **228/228 passed**, including
  `spec/invariants.test.ts` 2/2 (the README's heading-order contract still
  holds after moving its header to the shared `pageHeaderHtml()` builder).
- `pnpm check:evidence` — clean.
- `node --experimental-strip-types scripts/tabletop.ts http://localhost:9301 <dir>`:
  1. First run: 170/171 passed. The one failure,
     `README: has a Back to the table link`, looked for the old, About-only
     `a.back` class; About's header is now the shared `pageHeaderHtml()`
     markup, whose equivalent element carries `.to-table` instead. Fixed
     the selector to `.page-beam .to-table` (specifically the header's own
     link, since the closing scene has a second, separate "Back to the
     table" button) — the same real behaviour (a working way back from
     About's header) is still checked, nothing weakened.
  2. Second run after the fix: **173/173 passed**, clean.

## 3. Visual review (Chrome, software WebGL via swiftshader)

All screenshots in `doc/evidence/shots/0022/`.

| File | What it shows |
|---|---|
| `lobby-desktop-fullwidth.png` | The room lobby at 1920×1080: the red beam and the page background both reach the viewport edges with no outer margin, confirmed this time by the fix above, not just by eye. |
| `account-fullwidth.png` | The account page at 1200×900: full-width header, a centred reading column for the one form, since that page has exactly one thing to show. |
| `lobby-tablet-768.png` | The lobby at 768×1024 (iPad portrait): the nav wraps so "Back to the table" sits on its own row, the start section recomposes to one column. |
| `mobile-lobby-discover.png` | The lobby's discovery section at 390×844, scrolled to "Find a room": single-column room cards, full width, no horizontal scroll. |
| `lobby-many-rooms-grid.png` | The lobby with 43 disposable test public rooms (created for this check only): a responsive card grid using the full page width, a visible "43" count, 12 cards shown with a "Load more (31 more rooms)" button — no tall isolated column beside a short static one. |
| `lobby-loadmore.png` | After pressing "Load more": the full room set rendered, including a deliberately very long test room name ("A very very very long room na…", clipped with an ellipsis, not breaking its card) and a deliberately pre-filled room ("Saturday build", 1/2 here). |
| `lobby-room-full-state.png` | A deliberately filled (2/2) test room's card, close-up: "Full", disabled, distinct from the normal "Join" state. |
| `tabletop-noticeboard-compact.png` | The 3D tabletop's own "Join a room" panel, confirmed to keep its original compact row-per-room treatment (not forced into the dedicated lobby's wide grid) — the tabletop scene itself is otherwise unaffected. |
| `mobile-collection-brand-white.png` | The collection page at 390×844: "Brick Commons" now renders white, not blue, confirming the second nav-contrast fix (`.kit .page-beam .home-link`). |
| `lobby-hover-state.png` | Desktop collection page: the primary empty-state button under a real `:hover`. |
| `lobby-focus-state.png` | Same page, keyboard-tabbed: a clear blue `:focus-visible` ring on a nav link, distinct from both the white "current page" pill and red primary actions. |
| `readme-top-shared-nav.png` | `/readme/`'s opening: the same five-item shared nav (Rooms, My collection, Showcase, Account, About) as every other dedicated page, with "About" marked `aria-current="page"` — no longer a separate, nav-less header. |
| `readme-chapter-wide.png` | The "A shared building, a shared memory" chapter in its new `.chapter-wide` composition: full-width, comfortably-measured prose, its illustration floated as a smaller accent beside the heading rather than squeezed into a narrow permanent column — and no heading clipped under the sticky beam. |
| `readme-chapter-support.png` | The two shorter chapters ("Build somewhere, not in a void", "Join, build, and keep a creation") in the `.chapter-support` composition: a comfortable text measure beside a proportionate, not oversized, illustration column. |
| `readme-chapter-compact-finale.png` | The closing, informational chapter ("What is checked, and what needs judgement") in its compact single-column composition with a small inline icon, followed by the required closing scene: "Made with love ♥ by Asuka121380", a heart-capped-brick motif, and a working "Back to the table" button. |
| `readme-mobile-chapter-noclip.png` | The wide chapter at 390×844: the heading is fully visible, not clipped under the taller, wrapped mobile beam — the `scroll-margin-top` fix's mobile-specific value confirmed by screenshot, not assumed from the CSS alone. |
| `readme-reduced-motion.png` | `/readme/` under `prefers-reduced-motion: reduce`: the joining illustration's proposed brick is already in place (not mid-drop), confirming the animation-cancelling rule still applies to the redrawn illustration. |
| `editor-no-about-toolbar.png` | The game editor's full toolbar and Help panel closed: no persistent About entry (unchanged from the prior pass). |
| `editor-help-panel-no-about.png` | The Help panel open: the "About Brick Commons" fine-print link found in the prior pass is now removed; a live DOM count of `a[href="/readme/"]` inside the editor returned 0. Gameplay help content (building, camera, keyboard shortcuts) is otherwise unchanged. |

## 4. Scope check

No change to account/identity behaviour, room creation/admission/capacity/
publication rules, friends/invitations, persistence/realtime, collection/
showcase access rules, direct URLs or browser history, the tabletop's
camera-led interactions, or any gameplay visual, construction rule or
saved-creation rendering — confirmed by the unchanged 228/228 full test
suite (including every room/persistence/publication/friend-related test)
and the unchanged `src/domain/`, `src/server/rooms.ts`,
`src/server/index.ts`. `publicLobby()` in `src/server/rooms.ts` was read,
not modified, before choosing client-side "Load more" pagination over a
server-side change, since it already returns every public room in one
response.

## 5. Limitations

- All checks were Chrome/Playwright with the swiftshader software GPU
  path, not a physical device or Safari.
- The 43-room test dataset, the deliberately full room, and the
  deliberately long room name were created via direct API calls for this
  check and are not part of any seeded/shipped data; they exist only in
  the disposable local `DATA_DIR`s used for this evidence.
