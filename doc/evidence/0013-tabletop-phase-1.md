# Evidence 0013: the building-table homepage, phase 1

Collected by the agent on 2 November 2026 (AEDT) against the **production
build** (`pnpm build`), served by `node src/server/index.ts` on port 8090
with a fresh temporary `DATA_DIR`. No production data was touched. Nothing
was pushed or deployed. Decision record: ADR 0014.

## What phase 1 covers

- The whole table is composed.
- **One working entrance:** the Sign in sign. Choosing it moves the camera
  to the sign, opens the account panel, and "Back to table" returns.
- The other six objects are decoration, with Quick links to the existing
  pages meanwhile.
- No user evaluation was done. Nothing here says anything about whether
  visitors find the table inviting or understand it; that needs people.

## Checks run, and their results

| Check | How | Result |
|---|---|---|
| Typecheck | `mise exec -- pnpm typecheck` | passed |
| Full spec, including logging tests | `APP_URL=http://localhost:8090 mise exec -- pnpm check` | 26 files, **227/227** passed, including 2 new |
| Evidence | `mise exec -- pnpm check:evidence` | passed |
| Whitespace | `git diff --check` | clean |
| Production build | `mise exec -- pnpm build` | built; see "Bundles" |
| Direct routes on the build | `curl` | see "Routes" |
| Browser checks | `node scripts/tabletop.ts http://localhost:8090 doc/evidence/shots/tabletop` | **57/57** passed; `shots/tabletop/results.json` |

The 2 new spec tests are in `spec/persistence.test.ts`, "the homepage
sign's read-only account peek":
- With no cookie, the peek answers `null`, sets no cookie and creates no
  visitor.
- A guest gets `null`; once that visitor registers, only the display name
  is returned.

The first run of the second test hit the server's per-IP auth limit (429),
because the other account specs share the same address. The test now sends
its own `X-Forwarded-For`. The limiter is unchanged.

### Browser checks: what was emulated

- The locally installed Chrome (`channel: "chrome"`) through Playwright,
  with **swiftshader software WebGL**.
- The "mobile" run is Chrome's device emulation at 390×844 (`isMobile`,
  `hasTouch`, DPR 2). It is **not a physical phone**.
- Reduced motion is Playwright's `reducedMotion: "reduce"` emulation.
- **Not checked:** Safari or Playwright's WebKit, a physical phone, a real
  GPU, or a screen reader. Keyboard checks drove real key events. Screen
  reader announcements were not observed.

### What the 57 checks cover (`results.json` has each one)

**Desktop, 1920×1080**
- The overview renders with no console errors.
- Viewing the page sends no `/api/me` request and sets no identity cookie.
- The sign reads "Sign in".
- Hovering the sign's post (the 3D hit area, not the HTML face) lights it.
- Clicking the post starts a camera move, and the panel waits for arrival.
- The camera ends nearer the sign, and the URL gains `focus=sign-in`.
- Focus moves to the dialog heading.
- The sign stays fully on screen, left of the panel (sign right edge
  770 px, panel left edge 1392 px).
- Opening the panel is what establishes identity.
- Tab stays inside the dialog, and the table behind is `inert`.
- Registration completes in the panel, and the sign then reads the display
  name with no reload.
- Escape closes the panel, focus returns to the sign, the URL is plain
  again and the camera is back at the overview.
- Enter on the sign reopens the panel.
- Browser Back closes the focused view and Forward reopens it.
- Sign out turns the sign back to "Sign in" with no reload.
- "Back to table" closes the panel.
- The direct link `/?focus=sign-in` opens the panel.
- Clicking twice, then Back mid-move, settles at the overview and adds
  exactly one history entry.
- Quick links hold all five destinations, and each answers 200. Escape
  closes them.

**Mobile, 390×844 (emulated)**
- The overview renders with no console errors.
- The sign's touch pad is 176×88 px, hidden from assistive technology, and
  covers the drawn sign.
- A tap on the pad below the face, over the posts, opens the panel.
- The panel is a full-width bottom sheet with the sign above it (sign
  bottom 281 px, sheet top 460 px).
- Inputs are 16 px. "Back to table" works on tap, and Quick links open on
  tap.

**Reduced motion**
- Opening and closing are both cuts, and the panel is available at once.

**Fallbacks**
- With WebGL disabled, the fallback lists account, lobby, friends,
  collection, showcase and README, and the three.js chunk is never fetched.
- Blocking the scene's chunk leads to the fallback.
- Losing the GPU context after the table has drawn (`WEBGL_lose_context`)
  leads to the fallback.
- With JavaScript disabled, the `<noscript>` links show.

**Other pages**
- `/build/`, `/build/?view=account` and `/readme/` load without errors.
- The lobby keeps its own background.
- `/build/#friends` lands on the Friends card.
- Ignored: the browser's own `/favicon.ico` request 404s on `/readme/`.
  No page declares an icon there, and this predates this change.

### Resizing the touch pad (checked separately)

A probe script resized one page through 390×844, 600×900, 1280×800,
430×932, 390×844 and 360×740.

- Two earlier designs left the pad sized for the previous window:
  - sizing it from the HTML face's measured width
  - sizing it from a frame count after the resize
- Both were replaced. The pad is now sized from the sign's corners
  projected through the camera, and covered the sign at every size in that
  sequence, in both directions.

## Routes on the built app

Probed with `curl`, no cookie:

| Route | Status | Cookie set |
|---|---|---|
| `/` | 200 | no |
| `/?focus=sign-in` | 200 | no |
| `/build/` | 200 | no |
| `/build` | 301 | no |
| `/build/?view=account`, `?view=collection`, `?view=showcase` | 200 | no |
| `/readme/` | 200, contains the README | no |
| `/readme` | 301 | no |
| `/api/me/peek` | 200 | no |
| `/api/summary` | 200 | no |

## Bundles

The homepage's HTML names:
- `home-*.js`
- the shared React chunk
- `Account-*.js`
- the shared theme CSS and `home-*.css`

None of those contains `WebGLRenderer`. The three.js chunk (930 KB, 248 KB
gzipped, shared with the editor) is fetched only by the lazy `TableScene`
import, after the WebGL probe.

Compared with a baseline build of `254aa99`:
- the editor's and lobby's CSS files are **byte-identical**
- the shared theme CSS is byte-identical (only its chunk name changed)

## A defect found in the existing account flow

The reopened panel showed "Guest mode" for a visitor who had just
registered.

- **Cause:** `AccountPage`'s `afterRegister` didn't call `resetIdentity()`,
  unlike sign-in and sign-out. The cached `/api/me` answer was therefore
  still the guest one.
- **Fix:** one line, the same call sign-in makes. The lobby had the same
  latent behaviour; it rarely showed there, because the lobby doesn't
  remount the account view without a reload.

## Screenshots (`doc/evidence/shots/tabletop/`)

Inspected by the agent after the final build:

- `overview-desktop.png`, `overview-mobile.png`: the table overview
- `hover-desktop.png`: the sign lifted and lit on hover
- `focused-sign-in-desktop.png`, `focused-sign-in-mobile.png`: arrived
  at the sign
- `register-desktop.png`, `signed-in-desktop.png`: the existing account
  flow in the panel. The password field is masked, and the account is a
  throwaway on the temporary database.
- `sign-in-form-mobile.png`: the sign-in form in the sheet
- `quick-links-desktop.png`, `quick-links-mobile.png`
- `fallback-no-webgl.png`, `fallback-no-js.png`
- `lobby-desktop.png`, `account-desktop.png`, `readme-desktop.png`: the
  other pages, which are unchanged

## Known limitations

- Six of seven entrances are decoration. Their functions are reached
  through Quick links.
- The lobby, collection, showcase and friends pages are not yet restyled
  to match the table.
- The homepage downloads the three.js chunk it shares with the editor,
  including part geometry it doesn't use.
- Painted labels are crisp close up but small on a phone's overview. They
  are decorative and hidden from assistive technology; the sign's label is
  the one that has to be read.
- The translucent proposed brick lets the red course behind it show
  through, as plans do in the game.
