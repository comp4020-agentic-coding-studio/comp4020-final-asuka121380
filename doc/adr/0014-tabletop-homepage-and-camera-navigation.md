# ADR 0014: The homepage as a building table, with camera-led entrances

- **Status:** accepted for phase 1; later phases extend it.
  - The author set the direction and the phase-1 scope on 2 Nov 2026.
  - The agent's implementation choices are marked "agent".
- **Date:** 2026-11-02
- **Supersedes:** ADR 0004's rule that the homepage's script "does not import
  React Three Fiber, three.js or any scene content", and the matching
  CLAUDE.md line. Nothing else in ADR 0004 changes, and ADR 0005/0012's
  gameplay camera rules are untouched.

## Context

Brick Commons is about building with friends, and sometimes strangers, and
keeping what was made together. The author asked for the site's entrance to
be a real spatial scene: sitting in front of a table where someone has been
building, whose objects are the entrances to the site's functions. That is
not a conventional landing page with brick decoration, and it needs a 3D
scene and a camera that moves towards the object chosen.

ADR 0004 kept three.js off the homepage so that the homepage stayed light,
crawlable and usable without WebGL. The author explicitly authorised
changing that for a lightweight 3D entrance. The underlying needs remain,
so this decision keeps them by other means.

## Decision

### Phase 1 scope (author)

- The whole table is composed: table, wall, light, and all planned objects.
  These are the sign, an unfinished house with a parts tray, the scene tray,
  the "Join a room" noticeboard, the friends envelope and nameplates, the
  "Our creations" shelf and the "About" booklet.
- **One entrance works end to end: the Sign in sign.** The other objects
  are decoration with painted labels that are inert to the pointer and
  hidden from assistive technology. They never claim to work.
- A discreet "Quick links" control holds real links to the lobby, friends,
  collection, showcase and README, so every function stays reachable from
  the 3D page. It is a small corner control, not a navigation bar.
- The scene tray holds only Beach Houses, a miniature made with the game's
  own house builder. Its empty slots are plain wood, with no shapes that
  could suggest further scenes.

### Loading, and never a blank page

- `/` serves a minimal HTML shell. Its entry script imports no three.js
  (agent).
- The scene is lazily imported only after a WebGL context probe succeeds.
- Anything that stops the table being shown leads to the same plain-links
  fallback: no WebGL, a failed chunk, a render error (an error boundary), a
  lost GPU context, or loading taking more than 15 s.
- While loading, the same links show under a status line.
- A `<noscript>` block carries the links for no-JavaScript visitors.
- `/readme/` stays server-rendered and independent of all of this.

### Entrances: the object itself is clickable (author; mechanism agent)

- The sign's whole assembly (board, posts and base) has a generous invisible
  hit box in the 3D scene. Pointer hover lifts the sign slightly and lights
  the face and a glow beneath it.
- The sign's face is a real HTML `<button>`. It is drawn onto the board
  with drei's transformed `Html`, so its label is the sign's paint. It
  carries keyboard focus, touch and the accessible name.
- Both paths call the same activation. The button stops propagation, so one
  click never activates twice.
- On a phone's overview the sign is drawn small. A transparent touch pad
  sits over it, at least 120×88 CSS px, routed to the same action and
  hidden from assistive technology, so the face remains the one control.
  The pad is sized each frame from the sign's corners projected through the
  camera, not from the HTML layout, which lags a resize by a frame.

### Camera (agent)

- There are a few designed destinations, not free orbit: `overview` and
  `sign-in`, per layout, in `home/tabletop/destinations.ts`.
- A move lasts 700 ms (650 ms in phase 1) with an ease-in-out curve and starts from wherever
  the camera is. Repeated or reversed activation therefore never jumps.
- **The panel opens on arrival.** The frame that lands reports it; there is
  no timer.
- Under `prefers-reduced-motion` the move is a cut.
- A resize across the layout breakpoint re-frames at once, without
  replaying the move.
- The frame loop runs on demand, so an idle table draws nothing.

### Layout (agent)

- Wide screens show the full composition. Focusing keeps the sign in the
  left third with the tabletop behind it, and the panel stands on the right.
- Narrow screens (under 760 px wide, or narrower than 4:5) use their own
  arrangement of the same objects. Objects are drawn in towards the centre
  and stacked in depth, and the sign is 1.45× larger (1.35× in phase 1).
- The poses were fitted by projecting the objects' corners at 390×844. A
  phone recomposes the table rather than shrinking the desktop view.
- Focusing on a phone puts the whole sign above a bottom sheet.

### History (agent)

- The focused view is in the URL as `/?focus=sign-in`. Back closes it,
  Forward reopens it, and a reload or direct link opens it straight away,
  with no replay of the homepage sequence.
- Closing it with the panel's controls goes back through history when the
  focus was pushed by this page, so the history never doubles.
- `/build/?view=account` is still the account page it always was.

### The account panel (agent)

- The panel is a modal dialog (`aria-modal`), framed as the sign's
  nameplate.
- The table behind stays visible but `inert`. Tab is contained.
- Escape closes the panel from anywhere while it is open, except during
  IME composition.
- A visible "Back to table" button also closes it.
- Focus moves to the panel's heading on open and returns to the sign on
  close. If an account step unmounts the focused control, focus is pulled
  back into the dialog.
- It reuses `AccountPage` unchanged in logic, inside the same
  `IdentityGate` the lobby uses. Its form classes are restyled under
  `.account-scope` only, rather than importing `lobby.css`, whose `html`,
  `body` and bare `input` rules belong to the lobby page.

### Who the sign greets (agent; flagged for the author)

- The `brick_visitor` cookie is `HttpOnly`. The old homepage's
  `document.cookie` check could therefore never succeed, so a signed-in
  visitor was always shown "Sign in".
- Calling `/api/me` on load would create a visitor just for viewing the
  homepage, which ADR 0004 and ADR 0010 rule out.
- A new read-only route, `GET /api/me/peek`, resolves an existing cookie
  only. It never creates a visitor or sets a cookie, the same contract as
  `/api/summary`. It returns only `{ account: { displayName } | null }`.
- After that, `AccountPage` reports sign-in, registration and sign-out
  through an optional `onAccountChange` callback, so the sign changes
  without a reload. Other tabs' changes arrive through the existing
  `onIdentityChangedElsewhere` and re-peek.
- The route emits no log event: it changes nothing and refuses no one
  (ADR 0013).

### A defect found and fixed in the existing account flow (agent)

- Registering linked the visitor to an account but did not call
  `resetIdentity()`, unlike sign-in and sign-out. A later `whoAmI()` on the
  same page therefore returned the cached guest answer.
- The panel reopening after registration exposed this, showing "Guest
  mode". `afterRegister` now resets it like the others do.

### What is shared with the game, and what isn't (agent)

- The table reuses `scene/scenery.ts` (`Batch`, `house`), `scene/geometry.ts`
  (`PLATE`) and `scene/Batched.tsx`. These are pure geometry and materials:
  three.js plus the domain catalogue, no editor state. Nothing of the
  game's is changed.
- `scene/Plot.tsx` imports the editor's store and is not used.
- In the build, the editor's and lobby's CSS files are byte-identical to
  before. The homepage's styles are all scoped under `body.home`.

## Art-direction pass (author's brief, 2 Nov 2026; mechanisms agent)

The author's art-direction brief refined phase 1 without adding entrances.
Evidence: doc/evidence/0014.

**Light and materials**
- Bright warm daylight from one side, with a soft-radius shadow, a sky/
  table hemisphere fill, and a weak cool fill from the other side.
- Environment reflections built locally from three Lightformers. Nothing
  is fetched.
- Contact shadows under everything, and a faint window pattern on the wall.
- A pale wood table and a cream wall. Exposure is unchanged at 1.0.
- Plastic is slightly glossy with a light clearcoat. Wood, paper and cork
  are matte.

**Composition**
- The objects are arranged round a turned central baseplate. Each object
  is turned toward the centre.
- There are three implied working places:
  - the parts tray, with loose bricks
  - a roof experiment and a waiting window section
  - an open front seat with two blank nameplates
- Clear table is left between them.
- The sign is a small nameplate near the front left, not the largest
  object.
- The props imply that builders stepped away, never that anyone is there
  now. There are no names, figures or counts, and nothing moves on its own.

**Objects**
- The house has a door in a real opening, windows, a step, a flowerbed,
  and a stepped gable. One roof slope is missing, with a proposed slope
  drawn as a plan where it would go.
- The sign is a brick frame with seams on stacked 1×1 posts.
- The noticeboard has cork, brick frame and feet, and blank cards with
  clips.
- The shelf holds three small models, with empty space left on it.
- The booklet lies open, with page thickness and a parts diagram.
- The trays have real lips.

**Labels**
- The decorative labels are no longer DOM overlays. They are text drawn
  into textures on planes in the scene, so nearer objects hide them.
- They were never focusable or announced, and they are no longer in the
  DOM at all.
- The sign's face stays a real `<button>`.

**Camera**
- A destination is now a *viewing* of an object, not a fixed pose:
  - which object
  - a target in the object's own frame
  - a distance and an elevation along the object's face normal
  - a field of view
- Moving or turning an object in `PLACES` moves its camera with it. Later
  entrances add one viewing each: the booklet steep and downward, the board
  frontal, a tray elevated.
- The sign is never turned to face the camera; the camera goes to the
  sign's face.
- A move follows a quadratic curve. Its control point is lifted, in 1-unit
  steps up to 14, until no sample enters an expanded obstacle box (the
  house, board, shelf, sign and props). The current paths need no lift.
- The field of view changes only between each layout's designed values
  (wide: 34° overview, 36° focused). It is not a zoom effect.

**Panel**
- The panel is framed as the sign's enlarged nameplate: cream, inside a
  red brick border.
- The panel's own guest explanation was removed, because the account card
  below it already explains guest building once. A short line remains for
  signed-in visitors.
- The account flow's migration and identity-switch warnings are unchanged.
- On a phone it is a bottom sheet with a solid red edge.

## Room and reference pass (author's brief, 2 Nov 2026; mechanisms agent)

A second art-direction pass added the room around the table. Evidence:
doc/evidence/0015. Some of it supersedes the pass above:
- the warm-cream wall
- the wall's window-light pattern
- the sign at the front left
- two blank nameplates

**The reference image (author's).**
- The author supplied a reference image. The agent viewed it, and it shaped
  the decisions below.
- It stays outside the repository and is never served, traced or used as a
  background. The scene is built from code alone.

**The room** (`tabletop/room.ts`, new).
- A small corner of a sunlit room, kept quieter than the table.
- The left wall:
  - a window opening with a white frame, a transom and a deep sill
  - one potted plant on the sill
  - a painted plane of sky and greenery outside the window
- The back wall:
  - plain, off-white and cooler than the table, with a skirting board
  - standing behind the table, so there is a gap with shading
  - three taped sketches: a roof idea, a window arrangement and colour
    swatches, slightly tilted, with no text or names
- The right side: a short wall shelf with two parts boxes. One box's lid
  is ajar over a few bricks.
- The table:
  - a rounded top with a bevelled front edge
  - an apron and four legs to the floor
  - a procedural wood-grain canvas texture, restrained
- The walls cast no shadows. Only the window frame does, so its soft bars
  fall across the wall and the table, as the light does in the reference.

**Light** (supersedes "bright warm daylight from one side").
- The sun comes through the window side.
- A sky-and-table hemisphere fill keeps colour in the shadows.
- A weak fill from the right.
- Exposure is unchanged. Nothing was brightened globally.
- A light fog lowers the room's contrast against the table. There is no
  depth-of-field blur.

**Arrangement and objects.**
- The house is light blue, with white quoins and a grey base course.
  - The roof is built from stepped rows of slope bricks on stepped gables:
    one side complete, the other part-built.
  - A chimney stands on the roof.
  - The right-hand window waits on a plate beside its empty opening.
- Loose bricks link the parts tray to the house.
- Roof samples stand beside the open roof.
- The booklet lies open towards the left seat.
- There is one blank nameplate at the free front seat (was two).
- A Friends envelope leans on a brick beside its name stand. It names no
  one.
- The sign now stands at the front **right**. Its focused view looks
  across open table towards the quiet end of the room, so the panel sits
  over plain wall and table, not over the house.
- The phone layout keeps the same relationships, recomposed:
  - the sign front right, turned slightly
  - the booklet behind the sign, the house to one side

**Labels.**
- Printed labels use dark ink on cream, sized to fill their strip.
- The labels are "Join a room", "Our creations", "Beach Houses",
  "Friends" and "About".
- They are still textures on real planes, so nearer objects hide them.
- The sign's face stays a real `<button>`.

**Camera.**
- The sign's viewings were re-aimed (wide: elevation 27°, distance 26;
  narrow: 44°, distance 34) for the new placement.
- The sign is still never turned to face the camera.
- The obstacle boxes now include the props and the Friends stand. The
  path checks still pass with no lift.
- Everything else is unchanged:
  - the panel waiting for the camera to arrive
  - reduced motion
  - history
  - the direct link
  - focus handling
  - the return to the table

## Entrances pass: the table becomes the site's navigation (author's brief, 3–4 Nov 2026; mechanisms agent)

The author asked for every function to be reached from the table, with
bounded visual refinements, a shared UI kit, no new scenes, social
mechanics or permissions, and existing APIs reused. Evidence:
doc/evidence/0016. This supersedes phase 1's "one entrance works; the
others are decoration" as a statement of status. **The rule behind it
stays (author, 4 Nov 2026).** Any future unfinished entrance must be inert
decoration that implies no function, and every existing function must
stay reachable through working navigation. CLAUDE.md keeps the current
status and the permanent rule apart.

**The six entrances** (`tabletop/focus.ts` `ENTRANCES`, `TableScene.tsx`
`EntranceObject`, `TablePanel.tsx`, `panels.tsx`).

| Object | `?focus=` | What opens |
|---|---|---|
| Scene tray | `scenes` | The Beach Houses card. Build alone, or set up a shared room (visibility, publication, name), then "Create and open" into the editor |
| Noticeboard | `rooms` | Tabs for Public rooms, Join by code and Your rooms |
| Friends stand | `friends` | Tabs for Invitations (accept or decline) and Friends (link, requests, list) |
| Creation shelf | `shelf` | The visitor's three latest saved versions as previews, plus links to the collection and showcase pages |
| Booklet | `about` | The camera approaches, then `/readme/` |
| Sign | `sign-in` | The account panel, unchanged |

- **Each object works like the sign did in phase 1.**
  - An invisible 3D hit box covers the whole object, and hover lifts it
    and lights its label.
  - The printed label is a real `<button>` (`aria-haspopup="dialog"`).
  - A phone gets a transparent touch pad, hidden from assistive
    technology.
- **Panels open only on arrival.** A panel mounts on the frame the camera
  lands, inside the same `IdentityGate` the lobby uses. The panel code
  is a lazy chunk.
- **The overview never calls `/api/me`.** It is first called only after a
  panel opens.
- **Opening is never acting.** Opening a panel, switching a tab, or
  stepping back inside a flow writes nothing: no room, link, request or
  acceptance.
  - Rooms are created only by "Create and open", which is guarded
    against double submission.
  - Invitations are answered only by Accept or Decline.
- **History.**
  - Every focus is a URL, so Back, Forward, reload and direct links work
    as they did for the sign.
  - An unknown `?focus=` shows the overview.
  - The booklet replaces its history entry before leaving, so Back from
    `/readme/` returns to the plain table, not to a half-made approach.
- **The account panel's wording is kept.** The restyle changed only
  classes and wrappers. A first pass had shortened three account
  explanations, and `accounts.ts` caught it; the texts were restored word
  for word (evidence 0016).
- **Steps inside a panel never move the camera.** For example, the scene
  tray's step back keeps the name and settings already chosen. Only
  "Back to table" and Escape leave.
- **Only Beach Houses is on the tray**, and only real data is shown:
  - no invented rooms, names, friends or counts
  - empty states say so plainly (for example, "You haven't joined a room
    yet.")

**The invitation count on the Friends stand (agent; accepted by the
author on 4 Nov 2026, conditionally).**
- `GET /api/me/peek` now also returns `invitations`, the number of
  pending room invitations for the requesting visitor. The stand shows it
  as a small tag only when it is above zero.
- The author accepted it on these conditions, each verified in
  `spec/friends-and-identity.test.ts`:
  - **Limited to the current visitor.** The host who sent the invitation,
    a stranger, an unknown cookie and a request with no cookie all see 0.
  - **Read-only.** `findVisitor` never creates a visitor, and peeking
    never admits anyone: the invitation stays pending and the room isn't
    in the invitee's rooms.
  - **No identity or session.** No `Set-Cookie`, with or without a cookie.
  - **A count only.** The body's keys are exactly `account` and
    `invitations`. Rooms, labels and senders stay behind the existing
    `/api/my/invites`.
  - **`Cache-Control: no-store`.** It comes from the `/api` middleware.
- It still emits no log event: it changes nothing and refuses no one
  (ADR 0013).

**A shared UI kit** (`ui/kit.css`, new; scoped under `.kit`).
- One look for the table's panels and the dedicated `/build/…` pages:
  - cards and tags
  - fields and choice rows
  - messages, and loading and empty states
  - room cards with seats
  - tabs and the step back
  - creation cards and credits
- Only the home and lobby entries import it. The editor's CSS contains no
  `.kit` rule, so the gameplay editor is not restyled.
- Logic that the table and `/build/` both need moved out of `LobbyApp`
  into `lobby/parts.tsx`, so the two surfaces run the same code with the
  same visible labels.
- `lobby/Shell.tsx` gives every dedicated page a bar with "Back to the
  table".
- The collection and showcase show creation cards with a preview from
  `ui/creationPreview.ts`: an isometric SVG of the saved version's real
  parts, with no WebGL.

**A defect fixed: the homepage entry imported three.js.**
- Phase 1's entry script imported `destinations.ts`, which imports
  three.js, so the no-WebGL fallback still downloaded it. This
  contradicted the decision above.
- The navigation state moved to the three-free `tabletop/focus.ts`.
- In the build, the `home` chunk imports only the account panel and the
  preload helper, and only the `geometry` chunk contains `WebGLRenderer`.
- The browser check now reads the contents of every fetched script,
  rather than matching chunk names.

**Visual refinements (bounded; no new furniture).**
- The overview is lower and more seated.
- The wood grain is calmer, and the table's edge is a plain material.
- The roof:
  - The left side is a finished pitched plane.
  - The right side is the construction side: two rows laid, with the
    proposed slope drawn above them as a plan.
  - The ridge piece was removed.
- Whites and the house's blue are slightly toned down, and contact
  shadows are a little stronger.

**Composition (agent).**
- The house's obstacle box was split into the house body and its low
  baseplate. The booklet and parts tray became obstacles.
- Viewings gained a `yaw`.
- The board, tray, house, Friends stand and booklet moved in both layouts,
  so every entrance's viewing has a clear line of sight and a clear path.
  All 12 viewings were checked offline against the obstacle boxes.
- The blank nameplate sat in the foreground of the focused sign view. It
  now stands beside the sign, to its right and behind it, on both layouts.
- **The phone was recomposed.** The Friends stand, parts tray and
  nameplate moved, and the tray and Friends viewings were re-aimed. Each
  entrance's printed label then sits above the bottom sheet, rather than
  under it.

**`/readme/` restyled (`src/server/readme.ts`).**
- It now wears the site's look:
  - cream paper, with a red-edged booklet page
  - rounded headings and a comfortable reading width
  - tables that scroll
  - a sticky bar with "Back to the table"
  - the legal line
- The body is still exactly `marked.parse(README.md)`. No README text was
  changed, and the page loads no script or remote font.

## Activation reliability (author's brief, 4 Nov 2026; mechanisms agent)

The author reported that activating a table entrance sometimes did
nothing, right after loading and right after returning from a panel, but
worked again once things had settled. Two real causes were found, fixed
and verified; one suspected cause was investigated and ruled out.
Evidence: doc/evidence/0017.

- **A press and release on different elements must still choose.** A
  browser's `click` fires only on the element under both the press and
  the release. The hover lift that raises a label on hover or focus could
  move the label away from under the pointer during a held press, so the
  release landed on the canvas behind it and the activation silently
  vanished. Choosing an entrance is now decided on `pointerdown` (arming
  it) and confirmed on `pointerup` within a small distance, wherever the
  release lands; the `click` a pointer gesture still produces is spent,
  so one gesture is still one choice, and keyboard activation (a `click`
  with no pointer gesture) is unaffected. There is no time limit on the
  hold: a genuine press that took a while is never discarded, only a
  release more than 14px away, or a cancelled pointer, fails to choose.
- **The user's latest choice always wins, even across a deferred history
  event.** Closing a panel goes back through browser history so entries
  never double; that `popstate` does not fire synchronously. A choice
  made in the instant after closing could be silently overwritten when
  the deferred close's own `popstate` later arrived and reset the focus.
  The page now tracks what it means to show the instant a choice is
  made, distinguishes its own pending `history.back()` from the
  browser's real Back/Forward, and re-asserts a newer choice over its own
  superseded navigation rather than losing it. The browser's own
  Back/Forward is never overridden.
- **A suspected third cause — the camera racing ahead of what is
  painted under slow rendering — was investigated and ruled out.** It
  would have meant a press could be raycast against a camera pose several
  moves ahead of the picture the visitor is actually looking at. Direct
  measurement showed the live camera is never ahead of what is painted
  within the one synchronous tick any real pointer event spans; the
  divergence seen during diagnosis came only from the investigating
  script's own `move()` then `down()` being two separate, time-separated
  calls, not from anything in the app. A draft fix for this (overriding
  R3F's raycast camera) was written but never wired in, and was removed
  rather than landed as an untested, invasive change once the theory it
  answered was disproved.
- `scripts/tabletop.ts` gained a dedicated `activation` run that
  dispatches the exact DOM event sequences each confirmed cause needs,
  rather than waiting on a timing-dependent window, and each assertion
  was confirmed to fail on the pre-fix code (in combination, and with
  each cause isolated in turn) before being added.

## Colour system: brighter red/blue/white, scoped off the editor (author's brief, 4 Nov 2026; mechanisms agent)

The author asked for a brighter red, blue and white colour system across
the non-gameplay site (the table, the lobby/account/collection pages, the
shared UI kit), while leaving gameplay scenery, lighting, the editor's
dock/toolbar and every gameplay rule unchanged — several of these share
tokens and components with the rest of the site. Evidence: doc/evidence/0018.

- **A new, non-gameplay-scoped token file, not a `:root` edit.**
  `src/client/ui/site-colors.css` redeclares the same custom properties
  `theme.css` defines (`--red`, `--blue`, `--yellow`, `--ink`, `--paper`,
  `--white`, `--line`, …) under `body.home, body.lobby` only — the two
  bundles the editor never is. Every existing rule already reading one of
  these tokens (in `theme.css`, `kit.css`, `home.css`, `lobby.css`) picks
  up the brighter values with no per-rule edit, while the editor's own
  `:root`-resolved values are untouched: its `<body>` carries neither
  class. `--ok`/`--danger` are deliberately left alone, so green
  confirmation and red error meaning stay distinct from the brand red.
- **Local, non-shared tokens were updated directly.** Some colours
  (`home.css`'s `--wall`/`--wall-deep`/`--table-ink`/`--nameplate`,
  `kit.css`'s `.kit`-scoped tokens) are declared locally rather than from
  `theme.css`, so the shared override does not reach them; these were
  edited in place, in the same cream-to-white/pale-cool-grey direction, in
  their own already non-gameplay-only files.
- **The 3D scene's own material constants are separate from CSS
  entirely.** `src/client/home/tabletop/build.ts`'s `PALETTE` (walls,
  table wood tone, sign/board/booklet face plates) was edited directly:
  walls and face plates moved from beige/cream to pale cool-grey/white,
  the table's wood kept its natural pale tone with the orange/yellow tint
  reduced rather than shifted toward blue/white plastic. This file is
  imported only from `src/client/home/tabletop/`, never from the game's
  own scene code, so gameplay bricks, lighting and camera are unaffected.
- **Verified, not assumed, that the editor is unaffected.** Beyond
  tracing every changed file's importers, a live check opened a real room
  through the actual editor route and read the editor's own computed
  `--red`: `#e3241b`, the original value, with no `home`/`lobby` class on
  its `<body>` — not the new `#d92328`. A screenshot of the same session
  shows the dock, toolbar and gameplay scenery unchanged.
- **Not done in this pass:** the branded loading screen (Section 3 of the
  brief), a dedicated accessibility contrast audit of every new pairing
  (Section 8), and `/readme/`'s styling. All three completed in the
  follow-up pass below, once the author explicitly re-authorised styling
  `/readme/` and clarified that CLAUDE.md's restriction should be read
  narrowly (presentation only, never its URL, content, rendering or the
  shipped invariant).

## Loading screen, README styling and contrast audit (author's brief, 4 Nov 2026; mechanisms agent)

Completing the remainder of the colour/loading brief: the branded loading
screen (Section 3), README styling (now explicitly authorised, narrowly
scoped), and a contrast audit of the new palette (Section 8). Also
resolves a test-result discrepancy the author asked to be investigated
rather than assumed away. Evidence: doc/evidence/0019.

- **The apparent `pnpm test` failures were mostly a stale process, not a
  regression.** A three-week-old `tsx` dev server (predating this
  session) was still listening on port 8080, `pnpm test`'s default
  `APP_URL` target, and lacked routes added since (`/api/me/peek`). Most
  of both evidence 0018's "7" and its "13 baseline" failures were this
  one process answering, not the actual built code. Re-run against a
  correctly targeted, freshly built server: **228/228 passed.** Four
  failures in `spec/plans-and-attribution.test.ts` are real and
  unrelated to any file this session has touched — reproduced on the
  unmodified branch point, in `src/domain/rules.ts` plan logic, outside
  this task's authorised scope (ADR 0014 Section 9 excludes construction
  rules) — reported as a separate, pre-existing, unresolved issue rather
  than declared fixed or dismissed.
- **README styling** (`src/server/readme.ts`'s inline `<style>` only):
  white reading surface, blue chapter headings, a red accent on the page
  frame, a yellow underline on the title. The URL, the full rendered
  content, server-side rendering, and the shipped
  `spec/invariants.test.ts` check (which verifies heading text and order,
  never colour) are unchanged.
- **The branded loading screen**: a plain, static, no-script splash
  (`src/client/index.html`'s `#static-splash`) — a small hand-written SVG
  emblem (an unfinished house, missing its third wall), "Brick Commons",
  and "Setting out the table…" — painted before React or three.js load,
  confirmed via network-throttled DOM inspection. React's own loading
  state (`HomeApp.tsx`) shows the identical emblem and text once mounted,
  with a one-off, reduced-motion-skippable settle-in; a `loadingSlow`
  timer (4s) reveals labelled direct-navigation links only once loading
  is taking noticeably longer, never a progress bar or repeated
  announcement. The existing failure fallback (no WebGL, failed load,
  lost context) and the `<noscript>` fallback are unchanged in behaviour
  and content, only restyled. A regression this pass introduced — two
  `<noscript>` elements, caught by the existing scripted check — was
  found and fixed before landing.
- **Contrast audit**: computed WCAG contrast for every new pairing this
  colour pass introduced; two of eighteen failed and were fixed (a
  success-banner background lightened slightly; an input-field border
  darkened to meet the 3:1 non-text threshold), both scoped to `kit.css`'s
  own local tokens, never `:root` or a shared token, re-verified not to
  reach the editor.

## Visual polish pass: backgrounds, selection colour, page structure, empty states, one emblem (author's brief, 5 Nov 2026; mechanisms agent)

A bounded, non-gameplay visual pass, continuing from evidence 0019.
Preserves all tabletop interaction, loading behaviour and existing
functionality; no 3D redesign, no feature expansion. Evidence:
doc/evidence/0020.

- **Beige outer margins, fixed.** CSS custom properties inherit down the
  DOM tree only: `body.home`/`body.lobby` redeclaring the palette tokens
  never reached `<html>`'s own background, since `<html>` is `body`'s
  ancestor, not its descendant. `site-colors.css` now also matches
  `html:has(body.home), html:has(body.lobby)`, declaring the same tokens
  directly on `<html>`. Verified live: both `<html>` and `<body>` resolve
  to `rgb(242, 245, 248)` on the lobby's wide and short pages; the editor
  (neither class) is unaffected, confirmed unchanged.
- **Selection recoloured from red to blue.** `.radio-row:has(input:checked)`
  and `.check-row:has(input:checked)` (`kit.css`) used a red border and a
  near-white-pink fill — indistinguishable at a glance from an error state.
  Both now use `--blue`/`--blue-soft`, with the native checkbox/radio
  `accent-color` matched; red is reserved for primary actions and genuine
  errors. Applies uniformly to the room-creation "Public" choice, the
  publish-setting checkbox, and every other checked radio/checkbox built
  on the same two classes, in both the tabletop's panels and the dedicated
  pages (they share `kit.css`).
- **One consistent structural treatment for dedicated pages.** `Shell.tsx`'s
  shared `<header class="page-bar">` (used by every dedicated page) is now
  a solid `--blue` band with white brand text and nav links; the current
  section gets a white "pill" with blue text, matching the existing
  focused-account-panel and README treatments named as references. No
  change to the tabletop itself — no navigation bar added over the 3D
  scene, per the brief's explicit exclusion.
- **One empty-state family, not a bare dashed box.** A new `EmptyState`
  component (`Shell.tsx`): a small original illustration (a blue-bordered
  display shelf with grey studs, implying nothing is on it), a heading, one
  line of explanation, and 0–2 visible actions. Used, full-size, for the
  collection ("Nothing saved yet" → *Start building* / *Browse the
  showcase*) and the showcase ("Nothing published yet" → *Start building*);
  used, compact, inside the tabletop's own panels for the public-rooms
  list, "Your rooms", invitations and friends (`parts.tsx`). Strictly
  distinct from the pre-existing loading (`role="status"`) and failed
  (`role="alert"`) states, which are untouched and never replaced by this
  component. No fabricated sample data anywhere — every empty state still
  reflects a real, successful, zero-result response.
- **One shared emblem, not three.** `ui/iso.ts` gains `emblemMark()` /
  `decorativeEmblemMark()`: a small toy-brick assembly (a blue base, two
  studded red walls with a deliberate gap, a yellow cap) built from the
  same pure, DOM-free `isoSvg()` string builder the editor's own
  `brandMark()` already uses, kept as a fully separate export so gameplay
  branding is never touched. Used in all five required places: the static
  HTML splash and `<noscript>` fallback (`index.html`, a lightweight
  hand-written SVG kept visually in sync, documented in a comment, rather
  than inlining the generator's full ~12–16 KB output before React
  loads), the React loading state and the tabletop's own brand link and
  `Fallback` heading (`HomeApp.tsx`), every dedicated page's header
  (`Shell.tsx`), and the server-rendered README header (`readme.ts`,
  importing the same client-side generator directly, since it has no
  DOM/React dependency). No change to the no-artificial-minimum-duration,
  reduced-motion, slow-load-navigation or WebGL/no-JS fallback behaviour
  the loading screen already had.
- **A stale assertion in `scripts/tabletop.ts` was updated, not weakened.**
  One check asserted the old, bare `.kit-state` empty text ("You haven't
  joined a room yet.") for the tabletop's "Your rooms" tab; that text is
  now the new `EmptyState`'s heading (no trailing period, by the
  component's own heading convention). The selector and expected text were
  updated to match the new, intentionally different markup; nothing about
  what the check verifies (a real empty state appears when a fresh visitor
  has joined nothing) was loosened.
- **Checks run:** `pnpm typecheck` (clean); `pnpm test` against a freshly
  built server on a confirmed-empty port, with explicit `APP_URL` —
  **228/228 passed**, no change from evidence 0019's baseline;
  `node scripts/tabletop.ts <url> <dir>` — **173/173 passed** on a clean
  re-run (two earlier runs each hit one isolated timeout, in different,
  unrelated steps, that did not reproduce on a third run — judged
  machine-load flakes, not changes caused by this pass, since nothing
  touched by this pass changed interaction, camera or dock behaviour).
  Visual review in Chrome (software WebGL) at 1200×900 and mobile
  390×844: loading splash, tabletop brand link, focused account panel,
  create-room controls (selected/unselected), the dedicated lobby at a
  wide viewport (including outer margins), collection and showcase both
  empty and populated (disposable local rooms/snapshots created and
  published for this check only), the tabletop's own compact empty
  states (friends, invitations, public rooms), the README header, and a
  mobile lobby layout — screenshots in doc/evidence/shots/0020. All
  checks were Chrome/Playwright with the swiftshader software GPU path,
  not a physical device or Safari.

## Artistic identity pass: red-led redesign of the dedicated pages and the README (author's brief, 5 Nov 2026; mechanisms agent)

A full artistic redesign of the dedicated pages' shared template
(`Shell.tsx`/`lobby.css`) and `/readme/`, explicitly moving away from a
"generic dashboard" look, and **superseding the blue-led balance of the
5 Nov "visual polish pass"** above with vivid brick red as the primary
identity colour, blue demoted to limited supporting details and links.
Preserves everything out of scope: account/identity behaviour, room
creation/joining/capacity/permissions, friends/invitations,
collections/publication rules/attribution, persistence/realtime, existing
direct URLs, tabletop camera-led interactions, and all gameplay scenery,
brick models, lighting, building rules and toolbar styling. Evidence:
doc/evidence/0021.

- **A new palette, re-deriving hierarchy rather than relabelling it.**
  `site-colors.css`'s token block (still scoped to `body.home`/`body.lobby`
  via the same `html:has()`/`body` selectors, leaving the editor
  untouched) is rewritten: `--red`/`--red-edge`/`--red-deep` lead
  branding, structure and primary actions; `--white`/`--paper` carry
  readable surfaces; `--yellow` is a warmth accent; `--blue` is kept only
  for links and small supporting details; `--ink`/`--ink-soft` stay dark
  charcoal for body text. Verified with a WCAG contrast script (relative
  luminance) rather than eyeballed: every pairing in active use passes
  (white-on-red 5.21:1, red-edge-on-white 8.30:1, ink-on-paper 15.70:1,
  white-on-blue 5.33:1, ink-on-yellow 11.53:1, the 3:1 UI-component
  threshold for input borders).
- **An edge-to-edge page frame, not a boxed dashboard.** Every dedicated
  page's header (`Shell.tsx`'s `PageShell`) is now a full-bleed `.page-beam`
  standing in for a brick wall's top course: solid red, a thin seam and a
  faint row of studs along its lower edge, starting flush with the top of
  the viewport, with no outer inset or frame. A comfortable reading column
  (widened from the prior pass: 68rem default, 82rem for `page-wide`, 40rem
  for `page-narrow`) still sits inside that full-bleed page, so body text
  is never stretched edge to edge. `PageHead` adds one small decorative
  brick-stack SVG per page (not studs behind every heading), positioned as
  its own block above the `<h1>` after an earlier version was found, by
  screenshot, to overlap the heading's first letter.
- **The nav-legibility bug the brief explicitly warned against, found and
  fixed before review.** `kit.css`'s `.kit a:not(.btn)` (sets the
  site-wide link-blue colour) had equal source-order specificity with the
  new `.page-nav a` white-text rule, leaving nav links in illegible blue on
  the new red beam — the exact mistake the brief called out from the prior
  blue-header pass. Fixed by raising specificity (`.page-beam .page-nav a`),
  confirmed by screenshot: legible white nav text, and a white
  "current section" pill with red text that stays visually distinct from
  both a plain link and a keyboard `:focus-visible` ring (a separate blue
  outline), so selected/current, focused and error states never collapse
  into one look under the red-led palette.
- **An "About" link added to the shared dedicated-page nav**, pointing at
  `/readme/`, alongside the existing Rooms/My collection/Showcase/Account
  entries — not previously present in the dedicated-page nav.
- **The game editor's persistent About entry removed, narrowly.** The
  toolbar's `About` chip (`App.tsx`) is removed, per the brief's explicit,
  narrow authorization: leaving via it and returning dropped the player
  back at the homepage, interrupting active building. The Help panel's own
  `About Brick Commons` link stays, since the brief's stated problem was
  specifically the persistent toolbar entry point, not all About access
  from the editor. No other editor file, style, or behaviour changed.
- **One shared emblem, recoloured in place, not duplicated.**
  `iso.ts`'s `emblemMark()` is updated to the new red/cream/yellow brick
  assembly; every one of its five call sites (the static HTML splash and
  `<noscript>` fallback, the React loading state, the tabletop's own brand
  link and `Fallback` heading, every dedicated page's header, and the
  server-rendered README header) stays a single shared source, so the
  silhouette only needed changing once.
- **`/readme/` rebuilt into a narrative page while preserving its
  publication contract exactly.** `src/server/readme.ts` is rewritten
  around a `splitSections(md)` helper that splits `README.md` by its own
  `#`/`##` headings into chunks, each still containing its own heading
  line, so each chunk's own rendered heading text and order are unchanged
  from a plain `marked.parse(md)` — verified directly against
  `spec/invariants.test.ts`'s own assertion (fetch `/readme/`, strip
  tags/links, normalise, assert each of `README.md`'s heading texts
  appears, in order, as plain text), which does not inspect markup or
  classes at all. This gave full creative freedom over the page's HTML,
  layout and decoration while keeping the URL, the complete server-rendered
  prose and links, the heading order, and every shipped invariant check
  unchanged. No sentence of the author's own README prose was rewritten,
  and no invented user stories, testimonials or results were added — all
  decorative SVG illustrations (`heroArt`, `joiningArt`, `neighbourhoodArt`,
  `keepsakeArt`, `checklistArt`, `finaleArt`) are `aria-hidden`, original,
  and grounded in the surrounding paragraph rather than illustrating
  anything not already claimed in the prose.
  - One illustration (`joiningArt`, two brick stacks joining across a
    yellow seam) went through one visible-bug iteration: isolated
    `<circle>` studs floating apart from their rectangles read as two
    disconnected mascot shapes rather than bricks, fixed into proper
    two-tier stack geometry with each stud correctly seated on its own
    rectangle.
  - A missing `--white` custom property in `readme.ts`'s own inline
    `:root` (distinct from the client bundle's `site-colors.css`, since
    this page is server-rendered standalone HTML) caused one chapter's
    house illustration to render with solid black walls; added and
    reverified by screenshot.
- **Animation is a one-off entrance, never required to read the page.** A
  tiny inline `<script>` adds an `.anim-in` class to `[data-anim]`
  elements after load, which is the only thing CSS `@keyframes` respond
  to; `:not(.anim-in)` rules force full opacity/position with no
  animation, so the page is 100% complete and readable the instant HTML
  arrives, confirmed by `curl` (which never runs the script) showing full
  content. `prefers-reduced-motion: reduce` forces the same fully-visible,
  non-animated state even with JavaScript enabled (screenshot:
  `readme-reduced-motion.png`).
- **The closing scene.** Per the brief's explicit instruction, the page
  referenced in the brief
  (`comp4020-agentic-coding-studio.github.io/comp4020-ass1-Asuka121380`)
  was opened and its ending reviewed earlier in this session before this
  section was designed (see evidence 0021 §3): a plain, sincere personal
  sign-off, not an elaborate set-piece. `/readme/`'s finale borrows only
  that restraint — one short line of the exact required text, **"Made with
  love ♥ by Asuka121380"**, a small original heart-capped brick motif, and
  a clear "Back to the table" button — using none of that page's
  music-specific artwork, layout or interaction pattern.
- **A stale assertion in `scripts/tabletop.ts` updated, not weakened.**
  `[other pages unchanged] lobby keeps its own paper background` compared
  against the prior pass's hardcoded blue-led background colour
  (`rgb(242, 245, 248)`); updated to this pass's new warm paper tone
  (`rgb(251, 245, 238)`, `--paper`). What the check verifies (the lobby's
  background stays independent of the table's) is unchanged.
- **Checks run:** `pnpm typecheck` (clean); `pnpm test` — **228/228
  passed**, including `spec/invariants.test.ts` specifically — **2/2
  passed**; `pnpm check:evidence` (clean); `node scripts/tabletop.ts <url>
  <dir>` — **173/173 passed** on a clean run, after an intermediate run's
  cascading timeouts were traced to ~15 unrelated stale
  `node src/server/index.ts` processes accumulated from earlier, unrelated
  sessions on this shared development machine (none on this check's own
  port), stopped by PID (full account in evidence 0021 §1). Visual review
  in Chrome (software WebGL) at desktop and 390×844: the redesigned
  dedicated-page template (lobby, account, collection, showcase, both
  empty and populated), hover and keyboard-focus states, and `/readme/`'s
  full narrative (opening hero, a joining-themed chapter, the closing
  scene) at desktop and mobile widths and under `prefers-reduced-motion`.
  Screenshots in doc/evidence/shots/0021. All checks were Chrome/Playwright
  with the swiftshader software GPU path, not a physical device or Safari.

## Consequences

- The homepage now downloads three.js (about 248 KB gzipped, shared with
  the editor's chunk) once WebGL is confirmed. Visitors without WebGL never
  fetch it.
- That shared chunk also carries the part geometry module the homepage
  doesn't use. Splitting it is possible later; it was not done in phase 1.
- Each later entrance adds a destination pose, a row in `PLACES` and a
  panel, not a new system.
- The table is no longer crawlable text. The `<noscript>` block, the
  fallback and `/readme/` remain plain HTML.
- Visual quality was checked in Chrome only, with swiftshader software
  rendering in automation (doc/evidence/0013). It was not checked on a
  physical phone or in Safari.
