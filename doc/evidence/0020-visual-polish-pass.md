# Evidence 0020: visual polish pass (backgrounds, selection colour, page structure, empty states, one emblem)

Collected by the agent on 5 November 2026 (AEDT), for the bounded
non-gameplay visual polish pass described in ADR 0014's "Visual polish
pass" section. Against a production build, served from a confirmed-empty
local port (9105) with a fresh temporary `DATA_DIR`. Nothing pushed or
deployed.

## 1. Why port 9105

Earlier in this pass a port believed free (9101) turned out to be served
by a stale process from an unrelated earlier run of this session, serving
a build that predated the emblem work (confirmed via `curl .../readme/ |
grep brand` showing no inline SVG). Rather than killing an unrelated
process, every check in this evidence used a freshly confirmed-empty port
(`lsof -i :9105 -sTCP:LISTEN` returning nothing before starting), and the
server's health was re-checked (`curl /api/me/peek` → `200`,
`{"account":null,"invitations":0}`) before any screenshot or scripted
check.

## 2. Automated checks

- `pnpm typecheck` — clean, no errors.
- `APP_URL=http://localhost:9105 pnpm test` — **228/228 passed**. Same
  count as evidence 0019's baseline; this pass touched no server route,
  domain rule or test file.
- `node --experimental-strip-types scripts/tabletop.ts http://localhost:9105 <dir>`,
  run three times:
  1. 127/129 passed. One failure was a stale assertion
     (`scripts/tabletop.ts`'s "Your rooms says so when there are none"
     check) that still expected the pre-polish bare `.kit-state` text
     ending in a period; this pass's new `EmptyState` component uses that
     text as a heading with no trailing period. Fixed the check's
     selector/expected text to match the new, intentionally different
     markup (see ADR 0014) — not a weakened assertion, the same real
     behaviour (an empty state appears for a fresh visitor) is still
     checked.
  2. 168/169 passed after the fix. A single, different, unrelated timeout
     appeared mid-way through the mobile-emulation block
     (`page.waitForFunction` timeout), in a step this pass did not touch.
  3. **173/173 passed**, clean, no timeouts anywhere.

  The two earlier isolated timeouts, in different and unrelated steps
  each time, did not reproduce on the third, clean run — judged machine
  load on this development machine (headless Chrome under swiftshader
  software rendering, run back-to-back with other checks in this
  session), not a change caused by this pass. Nothing this pass touched
  changes camera, dock or interaction timing; all touched files are CSS,
  one shared SVG-string builder, and presentational React components.

## 3. Visual review (Chrome, software WebGL via swiftshader)

All screenshots in `doc/evidence/shots/0020/`.

| File | What it shows |
|---|---|
| `lobby_rooms.png` | Dedicated lobby, 1200×900, empty public-room list and empty friends panel: solid blue `.page-bar` header with white brand/nav text, pale cool-grey body background reaching the full viewport (no beige margin), "Public" radio and the publish checkbox both in the new blue selected style, new empty states in the public-lobby and friends cards. |
| `lobby_rooms_populated.png` | Same page after creating two disposable local rooms: populated room cards rendering correctly against the new palette. |
| `friends_panel_empty.png` | The tabletop's own Friends-and-invitations dialog, Invitations tab, compact `EmptyState` ("No invitations right now"). |
| `friends_tab_empty.png` | Same dialog, Friends tab, compact `EmptyState` ("No friends yet"). |
| `collection_empty.png` | `/build/?view=collection` with nothing saved: full-size `EmptyState` ("Nothing saved yet"), shelf illustration, *Start building* (red) and *Browse the showcase* (secondary) actions. |
| `collection_populated.png` | Same page after saving one disposable local snapshot: populated card, new blue-bordered "Publish" button. |
| `showcase_empty.png` | `/build/?view=showcase` with nothing published: full-size `EmptyState` ("Nothing published yet"), single *Start building* action (no secondary, since there is nothing else to route to). |
| `showcase_populated.png` | Same page after publishing one disposable local snapshot: populated card against the new palette. |
| `account_panel.png` | `/build/?view=account`, guest state: unchanged account logic, now inside the blue-header page shell. |
| `mobile_lobby.png` | Dedicated lobby at 390×844: header wraps to two rows, no horizontal scroll, blue selection preserved. |
| `mobile_table.png` | The tabletop itself at 390×844, included to show this pass left the immersive 3D scene's own layout and branding (small top-left emblem + "Brick Commons", "Quick links") unchanged — no navigation bar was added over it, per the brief. |

Loading-screen and README-header emblem placements were visually
re-confirmed present and legible (static splash, React loading state,
tabletop brand link, dedicated-page headers, README header) but are not
re-screenshotted here since their correctness was already evidenced in
0019 for the generic loading/README work; this pass only changed the
emblem's own geometry (widened for legibility) and its CSS sizing at each
of those same call sites, confirmed via the screenshots above showing it
rendered correctly in-context (e.g. the 22px brand mark visible in
`mobile_table.png`, the header mark in `lobby_rooms.png`).

## 4. Known limitations

- All browser checks used Chrome/Playwright with the `--enable-unsafe-swiftshader`
  software GPU path, not a physical device and not Safari/WebKit.
- Disposable local rooms, snapshots and one publication were created
  directly against the local test server's API to populate the collection
  and showcase screenshots; none of this exists outside this throwaway
  `DATA_DIR` and nothing was pushed or deployed.
- `spec/plans-and-attribution.test.ts`'s four pre-existing failures,
  documented in evidence 0019 as unrelated to any file that session or
  this one touched, were not re-investigated here; `pnpm test`'s 228/228
  count already reflects them resolved on this branch (no regression was
  reintroduced).
