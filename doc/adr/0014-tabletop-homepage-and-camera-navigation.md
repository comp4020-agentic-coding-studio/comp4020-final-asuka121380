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
- A move lasts 650 ms with an ease-in-out curve and starts from wherever
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
  and stacked in depth, and the sign is 1.35× larger.
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
