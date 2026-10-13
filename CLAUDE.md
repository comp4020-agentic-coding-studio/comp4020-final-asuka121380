# Harness

<!-- Rules tagged (author) are decisions the author gave the agent; (course)
     come from the course's fixed contract; (proposed) are the agent's
     proposals, awaiting the author's review. Edit freely: this file is the
     author's. -->

A browser 3D brick-building and cooperative-creation site that will hold
several scenes. The first scene is a row of colourful beach houses; it is not
the identity of the whole site (author, 6 Oct 2026 evening; ADR 0004).

**Current milestone: C9, real-time shared rooms (author, 13 Oct 2026;
supersedes the solo-only scope below).** A build now belongs to a room with
up to a scene's configured number of members (ADR 0007), not to one visitor.
Real-time sync, shared inventory, transparent plans, live marks, durable
contributor attribution and immutable snapshots are now in scope and
specified in ADRs 0006–0009. Still out of scope until the author says
otherwise: similarity scoring, text/voice chat or any player-written
communication beyond plans and marks, runtime LLM features, multiple
playable scenes, physics/collapse, and competitive scoring or brick-count
rankings (author, phase 2 brief). Cooperation is no longer only described:
it is implemented, but only to the extent recorded as DONE in
`DEVELOPMENT_LOG.md` at any given time — never claim a brief's requirement
is met before its tests and evidence exist.

## Development log and commits (author, 6 Oct 2026)

`DEVELOPMENT_LOG.md` is the running factual record. Each kind of record has
one home:
- running history: `DEVELOPMENT_LOG.md`
- detailed results: `doc/evidence/`
- decisions: `doc/adr/`

The author writes `README.md`, `PROCESS.md` and `reflections/`. Never write
personal experience, opinion, tutor feedback or lessons learned on the
author's behalf.

1. Make small, coherent commits as work progresses.
2. After every substantive commit (code, tests, assets, config, harness,
   design decisions), immediately add a `DEVELOPMENT_LOG.md` entry for it.
3. Each entry names the real commit: take the hash from `git log` after
   committing, and never predict it. Link it as
   `[`abc1234`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/abc1234)`,
   which is the URL from `git remote get-url origin`. Cite single commits for
   claims about single changes.
4. Read the actual diff (`git show --stat`, plus the hunks) before describing
   it. No vague entries such as "improved UI".
5. Keep three things distinct: what was implemented, what test was run, and
   what result was observed.
6. The log update rides in the next substantive commit. When stopping with no
   further substantive commit, make a log-only documentation commit.
7. Log-only bookkeeping commits get no entry of their own, so there is no
   chain of commits recording themselves.
8. Never amend or rewrite a cited commit to insert its own hash.
9. No credentials, tokens, cookies, private session data or unredacted
   sensitive output in the log, the evidence or the commits.

Each entry gives, in proportion to the change:
- the time and timezone
- the commit link and subject
- the concrete changes and files
- why
- who decided (author or agent)
- the tests run and the results observed
- links to evidence and ADRs
- known limitations

## Never

- Show "Saved" before the server's transaction has committed (proposed).
- Change a build any way except through the one server-side command path:
  validate with `src/domain/rules.ts`, then one transaction (author).
- Trust the client for stock, validity or identity. The server works out the
  visitor from the cookie, or from a redeemed recovery code (ADR 0006), and
  resolves every actor server-side; never accept an actor id supplied in a
  request body (author; phase 2 brief).
- Patch stock by hand. For every part type, kit = held + placed, now **per
  room** rather than per visitor (ADR 0007). Invalid actions, cancelled
  previews and transparent plans cost nothing (author).
- Make colour a stock dimension, or put fixed scenery in the build, the kit or
  the rules (author, from the design brief).
- Cascade-delete, drag-to-demolish or add undo. Removal is refused while any
  remaining part would lose its only support, and removed parts return to the
  room's shared kit (author).
- Change an existing saved kit or invalidate a saved build. Kit changes are
  additive and versioned, and old builds are upgraded in place (author;
  mechanism in ADR 0003).
- Add gravity, collapse, rigid-body physics or ray tracing (author).
- Add people, minifigures, traffic or moving vehicles (author).
- Call a model, an LLM or any external service at runtime (author).
- Commit or serve the 11035 PDF or its renders, the reference photograph, the
  concept image, LEGO branding, or third-party screenshots gathered for
  design research (author: reference images stay out of public assets).
- Reset or silently migrate saved builds or inventory. Explain any scene
  version or content migration to the author before applying it (author).
  Existing C8 solo builds are migrated to one-member, invite-only,
  non-publishable rooms (ADR 0007), never deleted or renumbered.
- Change `fly.toml`'s limits, the shipped `spec/invariants.test.ts`,
  `0.0.0.0:$PORT`, or `/readme/` (course).
- Push, deploy, make the repo public or run /comp4020:ship without the
  author's explicit go-ahead in the current conversation (author).
- **Allocate separate personal inventories, material crowdfunding, or any
  per-player stock dimension** — superseded by ADR 0007's one shared
  room-level inventory (author, phase 2 brief, explicit: "this replaces the
  earlier design of separately allocated personal inventories").
- Lock a placed part to its original builder, rank players by brick count,
  or otherwise treat contribution as competitive (author; ADR 0009).
- Let friendship alone grant access to an invite-only room; access requires
  a checked, server-side room invitation (ADR 0007).
- Let a room's host leaving close the room, or give the host's client any
  runtime authority a member's client doesn't have (ADR 0007: the server
  stays sole authority; no host-authoritative networking).
- Publish a snapshot the publication policy doesn't clear, including through
  a derived room or a showcase preview; a restricted snapshot's restriction
  follows every room and snapshot derived from it (ADR 0009).
- Store a recovery code anywhere but its hash, put one in a log or a URL, or
  let a friend-request link double as a recovery or login credential
  (ADR 0006).
- Snapshot live presence, plan marks, or room invitations as part of a saved
  work (ADR 0009).

## Shape of the code

- `src/domain` is plain TypeScript: no React, three.js, Express or SQLite. The
  server decides with it and the client previews with it (author).
- Geometry (`src/client/scene/geometry.ts`) is appearance only. Connection and
  collision live in the catalogue, and must agree with what is drawn: a door
  sits in a real wall opening, never as a slab on a solid wall (author).
- All SQLite access goes through `src/server/db.ts` (author).
- Server files run directly under Node, so use only TypeScript syntax that
  erases (`erasableSyntaxOnly`) and import with `.ts` extensions.

## Site identity, routes and scenes (author, 6 Oct 2026 evening; ADR 0004)

- `/` is a designed homepage, not the editor. The editor lives at `/build/`.
  Both survive direct links and reloads, and moving between them keeps the
  same visitor and build. The homepage must not load three.js or the scene.
- Global identity: vivid red, clean white and bright yellow, with dark text
  and restrained supporting colours. Original branding only: no LEGO logo,
  no copied artwork or buttons, nothing implying an official LEGO product.
- Shared UI (`src/client/ui/`) holds the tokens and components. It never
  hard-codes a scene's colours, scenery or wording. Scene-specific content
  (environment, lighting, decoration, cover, wording) lives in its scene's
  folder and registry entry (`src/client/scenes/`), and the kit, bounds and
  reference stay in `src/domain/scene.ts`.
- No fake activity: no online counts, teammates, rooms, or invitation
  controls that do nothing. No "coming soon" card collections.
- The homepage is expressive; the editor is quieter, so the construction
  stays the focus. Decoration never costs legibility or click-target size.

## First scene: coastal houses (author, 6 Oct 2026 evening; ADR 0004; supersedes the suburban street of ADR 0003)

- Houses face the beach: houses and small front gardens → promenade →
  beach → sea. No wide road. The open beach is the unobstructed foreground.
- A few carefully varied neighbours (silhouette, height, roof, windows,
  entrances, purposeful bright colour), not many repeated boxes. Doors and
  windows sit in real wall openings.
- Golden hour shortly before sunset, with the sun above the horizon on the
  sea side. Sky, sun and the actual light direction agree. No orange
  filter; colours stay distinct; previews stay readable.
- Terrain: gentle dunes, a slight fall to the water, small differences in
  neighbours' foundations. The plot stays level, with its grid and rules.
- True 3D near the plot. Simplified geometry in the middle distance, and
  self-made panoramic imagery only far away. Nothing near may be a flat card
  that breaks under rotation or in top view.
- Assets: self-made, or a checked licence with the source recorded. Nothing
  loaded from third-party services at runtime.

## Scene and camera (author, 6 Oct 2026; supersedes the finite base and restricted orbit in ADR 0002)

- The 3D world fills the viewport behind floating UI. There is a sky, distant
  surroundings, and ground extending past the working area. No "platform
  ending in empty space".
- One row of houses with the player's plot clearly marked. Neighbours have
  coherent sides and backs, because the camera goes round them.
- Keep the plot open and the player's construction the clearest subject. No
  tall foreground objects near the plot. Check visibility from several angles.
- Camera:
  - perspective, with full 360° horizontal orbit and a practical top-down view
  - never below the ground
  - zoom and pan bounded so the build can't be lost and the world's edges
    don't show
  - working Top view and Reset view controls
- A drag that moves the camera never places, selects or deletes on release.

## Interaction (author, 6 Oct 2026; supersedes the Build/Select modes)

- **Nothing held:** click a placed part to select it; click empty space to
  clear. Scenery can't be selected.
- **Holding a tray part:**
  - A snapped preview shows, and says in text (not colour alone) whether it
    fits.
  - Placement height is surface-aware (ADR 0005). The pointer means the
    surface it hits: the plot, or the top of a part. A higher part never
    makes a valid lower position unreachable. Higher and Lower (PageUp and
    PageDown, plus visible buttons) step through the heights that fit
    there.
  - A chosen height survives horizontal fine adjustment. Confirming commits
    exactly the preview on screen; a click or tap never re-aims first.
  - Arrow keys and the direction buttons move the preview relative to the
    camera, snapped to the grid's axes with hysteresis. Height is a separate
    control.
  - Mouse, keyboard, visible buttons and touch give the same placement
    results. Collision, bounds, stock and support rules are unchanged.
  - A click places the part, and the part stays held while stock lasts.
  - Esc, or choosing the same tray item again, puts it down.
  - Clicking existing parts while holding one goes through the placement
    rules.
- **Selected part:** compact controls to identify, recolour, rotate (90° steps,
  with the whole build re-validated, through the command path) and delete.
- **Delete tool:** a persistent toolbar button.
  - Hover names the target, and a click asks the server.
  - Esc or toggling turns it off, and choosing a part leaves it.
- **Keyboard:**
  - Shortcuts work wherever focus is, except in editable fields.
  - Enter and Space on a focused button stay the button's.
  - One keypress is one action.
  - Every shortcut has a visible button.
- **Layout:** both 1920×1080 and 390×844 must be fully usable. The dock is a
  floating bottom toolbar with real part thumbnails rendered from the part
  geometry; on mobile it collapses. It is styled from the shared UI, not
  grey glass (author, ADR 0004).

## Rooms, realtime and cooperation (author, 13 Oct 2026; ADRs 0006–0009)

- **Identity.** A visitor is still a browser cookie by default (ADR 0001/0003).
  A player may opt in to a single-use recovery code, generated from an
  identity panel, to link a second browser to the same identity. Recovery
  codes are stored only as a hash, rate-limited, never logged or put in a
  URL, and are a completely separate mechanism from friend-request links
  (ADR 0006).
- **Rooms, not per-visitor builds.** A build belongs to a room with up to
  the scene's configured `maxPlayers` (Beach Houses: 2). A room is public
  (listed, joinable while capacity allows) or invite-only (unlisted,
  requires a checked server-side invitation; friendship never substitutes
  for one). The inventory is shared by the whole room; joining or leaving
  never creates, removes or carries away stock (ADR 0007).
- **`/build/` is a room lobby, not the editor.** Build alone, start a room,
  join by code, browse the public lobby, friends and invitations all live
  there. The editor itself is `/build/room/:id`, a real route that a direct
  link or reload re-opens. Loading a room (including on reload or
  reconnect) rejoins it through the same check a fresh join uses, so an
  invite-only room with no accepted invitation, or a full room, is refused
  the same way every time, shown as its own full-page state (ADR 0007).
- **The host has no runtime authority.** The server is sole authority for
  every command, exactly as C8. A room survives its host disconnecting.
- **Realtime.** Server-sent events push committed changes to every open
  session on a room within about a second, with no reload. Writes still go
  through the one validated `POST /api/command` path; SSE only pushes
  (ADR 0008).
- **Concurrency.** A placement is valid or not against live state at commit
  time, not against a stale whole-room revision: two people building in two
  different places both succeed. Editing or removing an existing part is
  gated on that part's own last-known state, not the room's global
  revision, so an unrelated change elsewhere in the room never rejects it
  (ADR 0008).
- **Plans are proposals, not orders.** A transparent plan costs no stock and
  never blocks real construction. Any member may realize one (atomically
  consuming stock and creating the real part) or mark one for everyone
  (a restrained, fading, non-forcing visual cue naming who marked it).
  Marks are transient and are never written into permanent activity history
  (ADR 0009).
- **Attribution is permanent and layered.** `placed_by` never changes once
  set; a later edit records a separate `edited_by`. A part realized from a
  plan keeps both `proposed_by` and `placed_by`. Once any real part is
  placed, that visitor is a permanent room contributor, even after leaving,
  even if every one of their parts is later removed. Plan-only
  participation is recorded and shown separately, never merged into a
  placed-parts count (ADR 0009).
- **Snapshots are immutable, consistent, and may be continued.** Any member
  may save a room at any time without pausing or changing it. A snapshot
  captures parts, inventory and contributors at one consistent revision;
  unfinished plans are captured separately, hidden by default, and restored
  only if the snapshot is continued into a new room. Continuing creates an
  independent room with its own visibility, invitations and members, while
  crediting the snapshot's prior contributors as inherited, not as having
  joined (ADR 0009).
- **Publication is a room-creation setting, not a role.** `allow_publish` is
  fixed when a room is created (default on for public rooms, off for
  invite-only), shown to a joiner before they join. If set, any member may
  publish their own saved snapshot, keeping full credit. The setting is
  never more permissive after derivation than its source: a snapshot or a
  room continued from a non-publishable one stays non-publishable, checked
  again whenever a publish is attempted or the showcase is read, not only
  inherited silently from the setting that created it (ADR 0009). Only
  `publications` rows are ever publicly readable; nothing else exposes a
  room's or a snapshot's contents publicly.

## Before saying something works

- `pnpm check` against a running app: locally, or against the deployed app
  with `APP_URL`. Also `pnpm check:evidence` (course).
- For anything visual or interactive, run it in a real browser (`scripts/`).
  Say which checks were browser-emulated and which were on a physical device
  (author).
- Check Safari behaviour where available. If only Chrome or Playwright's
  WebKit build was used, say exactly which (author).
- For visual changes, look at real browser screenshots, not only test counts
  (author).
- After any change to interaction, the camera or the dock, run
  `node scripts/interaction.ts <url> <out-dir>` against a running server, and
  add a check when adding a rule or shortcut (proposed).
- Use `mise exec --` for every tool, from the repo root (proposed).
