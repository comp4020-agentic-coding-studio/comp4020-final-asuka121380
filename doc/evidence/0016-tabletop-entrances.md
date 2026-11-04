# Evidence 0016: the building table becomes the site's navigation

Collected by the agent on 4 November 2026 (AEDT) against the **production
build** (`pnpm build`), served by `node src/server/index.ts` on port 8090
with a fresh temporary `DATA_DIR`. No production data was touched. Nothing
was pushed or deployed. Decision record: ADR 0014, "Entrances pass".
Evidence 0013–0015 still describe the sign's interaction contract and the
earlier art passes.

The commits this describes:

| Commit | Change |
|---|---|
| `db06155` | The shared kit and lobby parts |
| `29a5647` | The peek count |
| `755c7cf` | The table's entrances, refinements and recomposition |
| `a609378` | The `/readme/` restyle |
| `73f709a` | The browser checks, and the `invites.ts` and `interaction.ts` fixes |

## Checks run, and their results

| Check | How | Result |
|---|---|---|
| Typecheck | `mise exec -- pnpm typecheck` | passed (exit 0) |
| Production build | `mise exec -- pnpm build` | built |
| Full spec, including logging tests | `APP_URL=http://localhost:8090 mise exec -- pnpm check` | 26 files, **228/228** passed (227 before, plus the peek-count spec) |
| Evidence | `mise exec -- pnpm check:evidence` | passed |
| Whitespace | `git diff --check` | clean |
| Table browser checks | `node scripts/tabletop.ts http://localhost:8090 doc/evidence/shots/tabletop` | **168/168** passed in one run; `shots/tabletop/results.json` |
| Lobby and editor scripts affected by the moved components | see below | all pass after the fixes below |

The browser setup is the same as in evidence 0013–0015:
- Chrome, with swiftshader software WebGL, through Playwright.
- Device emulation at 390×844. Plain viewports at 1920×1080, 1280×800 and
  768×1024.
- Emulated reduced motion.
- **Not checked:** Safari or WebKit, a physical phone or tablet, a real
  GPU, or a screen reader.

## What the table checks now cover

`scripts/tabletop.ts` keeps every earlier assertion and adds four runs.
Two earlier checks changed:
- **The phone pad.** The phone pad selector became
  `.entrance-touch[data-entrance="sign-in"]`, because every entrance now
  has a pad.
- **The no-WebGL fallback.** It no longer matches chunk names. It reads
  the **text of every script the page fetched** and asserts that none
  contains `WebGLRenderer`. This is stricter: the old name-based check
  passed while the entry was in fact importing three.js (ADR 0014,
  "a defect fixed").

**`entrances` (1920×1080)**
- **The overview.**
  - Six labelled entrance buttons.
  - No invitation tag for a new visitor.
  - The overview only peeks, with no cookie created.
- **Each of the scene tray, noticeboard, Friends stand and shelf:**
  - Hovering the object in the canvas lights its label.
  - **Arrival before the panel.** The camera and the dialog are sampled on
    every rendered frame from the click until the dialog appears. The
    camera must move on at least one frame. No frame may show the dialog
    while the camera is moving, and the first frame must have no dialog.
  - The path is clear of obstacles, and the URL carries `?focus=`.
  - The heading is right and receives focus.
  - The label sits beside the panel, not under it.
  - **Opening writes nothing.** No non-GET request is made.
  - Escape closes the panel. Focus returns to the object's label, and the
    camera returns to the overview.
- **`/api/me`.** It is first called only after a panel has opened.
- **Keyboard and tabs.** Enter opens the noticeboard. Switching its tabs
  doesn't move the camera. The empty "Your rooms" text is exactly "You
  haven't joined a room yet."
- **History and links.**
  - Back, Forward and "Back to table" all work.
  - Direct `?focus=` links work for four entrances.
  - An unknown focus shows the overview.
- **The scene tray.**
  - Only Beach Houses is shown, with its tags.
  - In the shared-room step, publishing is off when invite-only is chosen.
    Stepping back and forward keeps the name and visibility, and the
    camera doesn't move. Nothing is created by any of it.
  - A **double click** on "Create and open" creates exactly one room and
    opens `/build/room/:id`. That room has the chosen name and
    visibility.
- **The shelf.** After a real save, the shelf's preview links to that
  saved version (`/build/?snapshot=<id>`), and its links lead to the
  collection and the showcase.
- **The booklet.**
  - At about 80 ms, the camera is moving, the address is still `/`, and
    the status reads "Opening the booklet…".
  - Then the browser is at `/readme/`. Its "Back to the table" link
    points to `/`.
  - Browser Back returns to the plain table.
- No console errors throughout.

**`invitations`**
- A host and a guest become friends through the real link flow. The host
  creates an invite-only room and invites the guest.
- The guest's Friends stand shows a tag reading "1", named "1 room
  invitation waiting".
- The Friends panel lists Accept and Decline, and opening it wrote
  nothing.
- The Friends tab says that friendship never opens an invite-only room.
- Accept opens the editor. Back at the table, the tag is gone.

**`mobile-entrances` (390×844, emulated)**
- Every pad is at least 44 px.
- Each entrance opens with a tap.
- The sheet is full-width, with the object's label above it.
- There is no horizontal scroll.

**`intermediate` (1280×800 and 768×1024)**
- Every entrance's focused view keeps the object and the panel on
  screen, without overlapping.
- There is no horizontal scroll.

## The invitation count: properties verified

The author accepted the count on `/api/me/peek` on condition that it is
limited to the current visitor, read-only, creates no identity or
session, exposes no details, and keeps no-store caching.

`spec/friends-and-identity.test.ts` checks each condition against a real
server:

| Condition | Assertion |
|---|---|
| Current visitor only | The invitee sees 1. The inviting host, a new stranger, an unknown cookie and no cookie all see 0. |
| Read-only, never admits | After peeking, the count is still 1, and the room is not in the invitee's `/api/my/rooms`. |
| No identity or session | No `Set-Cookie` on any peek, with or without a cookie. |
| No details | The body's keys are exactly `account` and `invitations`. With no cookie, the body is `{ account: null, invitations: 0 }`. |
| Caching | `Cache-Control: no-store` on every peek. |

The browser run adds that the overview's only identity request is the
peek, and that no visitor cookie exists after viewing it.

## The lobby and editor scripts

These scripts exercise the components moved into `lobby/parts.tsx` and
the restyled pages. They ran about 65 s apart, because of the auth rate
limit.

The final result for each script is from the final build. "First run" is
the run before the fixes in the next section.

| Script | First run | Final |
|---|---|---|
| `showcase.ts` | 16/16 | (not rerun; unaffected by the later fixes) |
| `invites.ts` | **6/7** | **10/10** |
| `accounts.ts` | **timed out** | **13/13** |
| `guest-preservation.ts` | 12/12 | (not rerun) |
| `review-fixes.ts` | 15/15 | (not rerun) |
| `pre-join.ts` | 13/13 | (not rerun) |
| `multiplayer.ts` | 17/17 | (not rerun) |
| `interaction.ts` | **timed out** | **85/85**; `shots/interaction/results.json` |

The scripts marked "not rerun" passed against the build before the last
round of fixes. Those fixes only restored account wording, restored a
full-room signal on the Accept button, and added CSS and copy polish. None
of the four scripts touches any of them.

## Three script failures: what each was, and how it was resolved

### `invites.ts`: "C, a stranger, is refused the same way" (a test timing race)

**What C saw.** A diagnostic re-ran the script's steps:
- three new visitors
- the host creates an invite-only room with a unique name
- the outsiders open its link

For C, the diagnostic sampled the page every 100 ms from
`domcontentloaded`, and recorded C's API responses and the room's
membership.

| Time from `domcontentloaded` | C's page |
|---|---|
| +103 ms | "Starting your session…" (the identity gate, waiting on `GET /api/me`) |
| +206 ms | "This room isn't open to you" (the refusal) |

- C's requests were `GET /api/me` 200, then `GET /api/rooms/:id/preview`
  **404**.
- The room's members before and after were only the host.

**Diagnosis.**
- **The application refused C correctly.** Neither the server response,
  the rendered state nor the membership shows any admission.
- **The test read the page too early.** It read the body once, straight
  after `domcontentloaded`. For a visitor's very first page, that can
  still be the identity gate. B's identical check passed only because B's
  gate happened to resolve first.
- **Not test-data interference.** The three visitor ids were distinct, the
  room was new and uniquely named, and no one else became a member.
- **Not a regression from the new UI.** The editor route's code
  (`App.tsx`, `PreJoin.tsx`, `IdentityGate.tsx`, `state/`, `main.tsx`)
  is identical to the branch's base, `254aa99`. Since the table never
  appears on `/build/room/:id`, its navigation can't reach this page.

**Resolution** (`scripts/invites.ts`).
- Each outsider's page is now read only once it shows an explicit decided
  state: the refusal heading, the pre-join "Join this room" button, or
  the editor's tray. There is no fixed delay.
- The assertion is unchanged in substance, and slightly stricter: the
  page must show the refusal **and not** the join button.
- Three checks were added that don't depend on the page:
  - B gets a 404 on `GET /api/rooms/:id`
  - C gets a 404 on `GET /api/rooms/:id`
  - neither B nor C is in the room's members
- B's check had the same race and got the same wait.
- **A negative control.** For a public room the visitor may join, the same
  wait settles on the pre-join screen, and the refusal assertion comes
  out false. So the wait doesn't pass merely by always ending on a
  refusal.

### `accounts.ts`: a timeout (an application regression, mine)

- The script waits for the register form's sentence "This browser's
  current rooms, friends and saved versions stay exactly where they
  are…". It timed out because this stage's account restyle had shortened
  that sentence, along with two other explanations: the guest note and
  the signed-in note.
- Those texts carry meaning that the shorter versions lost:
  - registering moves nothing
  - "with nothing saved yet"
  - "rather than copying a recovery code"
- **Resolution.** The three texts were restored word for word.
  `Account.tsx` now differs from before only in classes and wrappers:
  - the caution card
  - the green "Signed in" tag
  - an actions row
- **A related loss found by comparing every string.** Moving the lobby's
  components had dropped the invitation Accept button's
  `aria-disabled` for a full room. The button still tries when clicked
  ("you can still try — a slot may free up"). That signal is restored,
  alongside the new double-submit guard.

### `interaction.ts`: a timeout (a stale script, since phase 1)

- Its `routes` section clicked the old homepage's `#start` "Start
  building" link. Phase 1 replaced that homepage in `09a3f3b`, and
  `interaction.ts` had not been run on this branch since, so the failure
  predates this stage.
- **Resolution.** The section now goes through the table's real way in:
  the scene tray, then "Build alone". It still asserts:
  - the homepage loads no editor code and sets no cookie
  - opening the tray loads no editor code
  - the editor's home link leads back to the table
  - going in the same way again reopens the same build and stock
- The "Start building" and "Continue my build" wording checks were
  removed, because ADR 0014 removed that UI by design.

## What was looked at (screenshots reviewed by the agent)

Shots are in `doc/evidence/shots/tabletop/`:
- the overview and hover states (desktop and mobile)
- each entrance focused at 1920×1080, 390×844, 1280×800 and 768×1024
- the scene tray's shared-room step
- the shelf with a real saved version
- the Friends panel with a pending invitation, and the stand's tag
- the lobby, the account page and `/readme/`
- the fallbacks

### Defects found in the shots, and fixed

- **The nameplate in the sign's view.** In the focused sign view, the
  blank nameplate stood in the foreground as a large cream block. It
  moved beside the sign, to its right and behind it, on both layouts.
- **Unreadable button text.** The shelf's red "Open" button had blue text,
  because the kit's link colour also applied to link-buttons. The kit's
  link rule now excludes `.btn`.
- **Narrow panels on the phone.** The noticeboard, Friends and shelf
  panels (the wide and coloured variants) kept their desktop width. All
  panel variants are now the full-width sheet.
- **Labels under the sheet.** On the phone, the scene tray's and Friends
  stand's labels were hidden behind the sheet. The phone arrangement was
  recomposed (the Friends stand, parts tray and nameplate moved) and those
  two viewings re-aimed. A small offline line-of-sight search over the
  obstacle boxes chose the positions, and all 12 viewings still report a
  clear sight line and path.
- **The intro over the legal line.** On the phone, the overview's intro
  overlapped the legal line, so the intro was raised.
- **Clipped previews.** Creation previews in the showcase were clipped,
  because the SVG sat in an unsized wrapper. A `.creation-picture` box now
  sizes it to the stage, with a maximum size for very small builds.
- **A gradient band on `/readme/`.** A full-page capture showed a band,
  from a fixed background. The background is no longer fixed.
- **The legal line over 3D objects.** In focused views, the legal line
  could sit over coloured objects with little contrast. It now has a
  quiet paper backing.
- **"All 1 saved version".** The shelf's wording now reads "Your one saved
  version" for a single save.

## A capture artefact found while reviewing the final shots

- **What was seen.** One run's `focused-sign-in-desktop.png` showed no
  panel, although that run's checks had measured the panel on screen
  beside the sign.
- **Measured.** The panel mounts once, with no remount, and fades in over
  220 ms of animation time. Under swiftshader, that fade took about
  415 ms of wall time. A screenshot taken 300 ms after the content
  appeared therefore caught it nearly transparent.
- **Not an app defect.** It comes from software rendering's slow frames.
- **Resolution.** Every focused-view screenshot now waits until the
  panel's entry animation has finished. This affects screenshots only;
  no assertion changed.

## Test changes made while getting the checks to pass, and why

None of these weakens what is checked.
- **A duplicate name for "Choose how to build".** The step-back button's
  name also appears in the tray's `aria-label`. The locator now uses
  `exact: true`.
- **Sampling the move.** A single 100 ms sample missed the start of the
  move. Tracing showed that Playwright's `click()` waits for the animated
  label to be stable before clicking; a DOM click starts the move at
  once. So this is not an app delay. The check now samples every frame
  from the click until the dialog appears.
- **The number of moving frames.** Under swiftshader, a 700 ms move spans
  only two or three rendered frames. "More than 2 moving frames"
  therefore measured the renderer, not the app. The check now asserts:
  - at least one moving frame
  - no frame with the dialog while moving
  - no dialog on the first frame
- **Definite values.** Several loose checks were replaced with definite
  ones:
  - the exact empty-state text
  - counting `/api/me` before the first panel opens
  - the booklet's approach state

## Known limitations

- **Software rendering only.** Visual review used swiftshader. Lighting,
  shadows and frame pacing on a real GPU, in Safari, or on a physical
  phone were not seen.
- **Very few frames per move.** Under swiftshader, a move spans two or
  three frames, so the arrival checks prove the ordering (no panel before
  arrival), not the smoothness of the motion.
- **Only one saved version.** The shelf shows the visitor's three latest
  saved versions as previews. With many saves, only those three appear on
  the table; the rest are on the collection page.
- **The booklet always leaves the table.** It opens `/readme/` as its own
  page, by design, so the README stays one server-rendered response
  (course invariant).
- **The CLAUDE.md bullet is unchanged.** CLAUDE.md still says "An
  unfinished entrance is decoration (inert, `aria-hidden`), never a
  control." No entrance is unfinished now, so the bullet is still true,
  but it describes phase 1. It was left for the author to reword.
