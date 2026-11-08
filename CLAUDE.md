# Harness

<!-- Rules tagged (author) are decisions the author gave the agent; (course)
     come from the course's fixed contract; (proposed) are the agent's
     proposals, awaiting the author's review. Edit freely: this file is the
     author's. -->

## Current project and scope (author, 9 Nov 2026)

Brick Commons is a browser-based shared brick-building space. Its implemented scope includes the interactive tabletop homepage, dedicated account/lobby/collection/showcase pages, server-rendered About page, shared construction, plans and marks, contributor attribution, saved versions, and three playable scenes:

- Beach Houses: up to 2 builders.
- Medieval Castle: up to 4 builders.
- Woodland Commons: up to 6 builders.

All planned tabletop entrances are implemented; their behaviour is documented in ADR 0014. This replaces the earlier C10 milestone description, not the technical and behavioural constraints developed during those milestones. A build belongs to a room, with a scene-configured capacity (ADR 0007). Real-time sync, shared inventory, plans, marks, attribution and immutable snapshots remain governed by ADRs 0006–0009.

Still out of scope without author approval: similarity scoring, built-in text/voice chat or player-written communication beyond plans and marks, runtime LLM features, additional playable scenes beyond the three above, physics/collapse, competitive scoring and brick-count rankings. The castle and Woodland scope changes are recorded in ADRs 0015 and 0016.

Distinguish implemented features from verified behaviour. Consult the current code, DEVELOPMENT_LOG.md, and relevant evidence before making completion claims. Historical results are not proof that a newly changed version passes. Never claim a brief's requirement is met before its tests and evidence exist.

**Explicit accounts (author, 13 Oct 2026; ADR 0010; author-approved scope
change, overriding ADR 0006's earlier cookie-first-only framing).** A real,
visible registration/sign-in flow is now in scope: local username/password
accounts (Node's own `scrypt`, never a hand-rolled algorithm), layered OVER
the existing anonymous-visitor model rather than replacing it — an account
is a durable label and login for exactly one visitor_id, so every room,
friendship and snapshot stays keyed on `visitor_id` unchanged. No external
identity provider, no email, no password-reset flow: these all remain out
of scope unless the author separately asks for them (a change to the
no-runtime-external-services rule below). Browsing and building still need
no account at all; see ADR 0010 for the full architecture and the
migration-conflict handling.

## Expressive intention and design consistency (author, 9 Nov 2026)

The author’s central intention is to return to childhood experiences of gathering around LEGO bricks with friends and sometimes strangers, making something together, and keeping a trace of that time.

README.md states the argument. This harness turns it into constraints. The tabletop, environments, navigation, construction tools, and saved creations must support that same intention. For a proposed feature or redesign, explain how it contributes to this experience. A familiar product feature, more decoration, or a larger feature list is not sufficient justification.

### Space and visual design

- Preserve the tabletop as a place of activity: meaningful objects, unfinished work, materials, and a composition that suggests building in progress.
- Treat physical navigation objects as functional parts of that setting. Preserve approach-and-interact behaviour where it suits the task.
- Use dedicated pages when the function needs them. Maintain the site’s visual identity and clear routes between the table and those pages.
- Preserve the non-gameplay site’s warm, red-led identity and recognisable brick construction. Decorative studs alone do not establish a coherent design.
- Keep gameplay visual changes outside a website-only styling task unless explicitly authorised.
- Let lighting, composition, geometry, and motion support the activity and information. They must not obscure controls, readable text, the construction area, or the placement preview.
- Maintain usable keyboard, pointer, and touch interactions, responsive layouts, reduced-motion behaviour, and the documented fallbacks.
- Do not introduce fake interactive objects. Any future unfinished entrance remains decoration without hover, click, or accessibility cues suggesting it works. Existing functions must remain reachable through working navigation.

### Social scope and creative freedom

- Concentrate social mechanisms on gathering, proposing, responding, building, and retaining shared creations.
- Keep built-in text/voice chat, competitive rankings, similarity scoring, and compulsory reference-model completion outside the approved scope.
- Reference buildings are optional inspiration. Do not turn them into prescribed outcomes or use resemblance as a measure of success.
- Preserve one shared room inventory. Plans express proposals and derived demand; they do not reserve or consume real stock.
- Preserve admitted collaborators’ ability to edit the shared construction. Do not make each placed part editable only by its original author.
- Retain contribution attribution without equating brick counts with the value of a person’s contribution.
- Preserve immutable saved versions, independent continuations, and the existing access and publication restrictions.
- A new scene must provide a usable building environment, appropriate framing and controls, and consistent rules—not only additional scenery or a different kit.

## Author direction and implementation workflow (author, 9 Nov 2026)

The author decides expressive intention, product scope, and acceptance of the experience. Claude investigates the codebase, proposes implementation mechanisms, implements the authorised work, and performs technical verification.

For substantial work:

1. Inspect the current repository, relevant rules, ADRs, and working tree.
2. Translate the requested outcome into concrete implementation and acceptance criteria. Identify affected systems and material trade-offs.
3. Use reviewable stages where a new interaction pattern or large redesign benefits from one complete example before expansion.
4. Complete the authorised stage, including necessary verification, and provide a runnable result for the author’s inspection.
5. Incorporate the author’s concrete feedback and recheck the affected behaviour.
6. Record consequential decisions, corrections, and actual verification results in their established locations.

Continue autonomously within authorised scope. Do not turn ordinary implementation choices into repeated approval requests. When the task establishes an author-review boundary, provide a concrete, reviewable result at that boundary.

A completion report must distinguish:

- What changed.
- What was actually checked, where, and with what result.
- What the author has reviewed or accepted.
- Any remaining problem or untested condition.

Passing tests does not replace rendered-page inspection. Claude must inspect the result it produces and must not claim that the author is satisfied unless the author has said so.

README.md, PROCESS.md, and reflections remain author-directed documents; the authorship and factual-record rules below continue to apply.

## Corrections and verification (author, 9 Nov 2026)

Investigate a failure before choosing a repair. Distinguish application defects, test defects, stale builds, wrong server targets, and environment limitations.

- Reproduce the relevant failure where practical.
- Add or update a meaningful check or harness constraint when the correction protects a continuing promise.
- Verify that a regression check detects the failure it is intended to prevent, where practical.
- Remove speculative repairs when their premise is disproved.
- Do not weaken assertions, skip checks, or repeat runs merely to obtain a green result.
- Separate automated checks, agent browser inspection, and author-observed user testing in reports and evidence.
- Run checks appropriate to the changed systems. Broaden testing when failures or unresolved risks justify it.
- Keep original course invariant tests unchanged.

## Production packaging and deployment verification (author, 9 Nov 2026)

A working source tree is not sufficient evidence that the production image works.

- Inspect the transitive runtime imports from the server entry point when changing server-rendered pages or shared modules.
- Ensure required source modules, runtime packages, and assets exist in the Dockerfile’s final stage. Update packaging alongside dependency changes.
- Build and test the actual image when Docker is available.
- If Docker is unavailable, state that limitation and verify the final-stage file layout and import closure. Do not describe that simulation as an image build.
- Require the existing CI image build and checks to pass before describing the image as verified.
- Do not change course-provided hosting limits or bypass CI, evidence checks, or secret scans to make a deployment pass.
- Obtain explicit author authorisation before pushing or deploying, according to the existing repository rule below.
- Preserve production data and verified backups. A deployment is not permission to reset, restore, or migrate content beyond the authorised scope.
- After deployment, check the actual HTTPS site and relevant existing data. Do not substitute a local result or HTTP status alone for functional verification.
- Verify persistence through controlled restart or redeployment when the task affects persistence or requires release acceptance.
- Use isolated test data for fixture-generating suites; do not fill production with automated test records.
- Record failures and recovery accurately. Do not describe an incomplete or failed deployment as successful.

## Development log and commits (author, 6 Oct 2026)

`DEVELOPMENT_LOG.md` is the running factual record. Each kind of record has
one home:
- running history: `DEVELOPMENT_LOG.md`
- detailed results: `doc/evidence/`
- decisions: `doc/adr/`

The author writes `README.md`, `PROCESS.md` and `reflections/`. Never write
personal experience, opinion, participant feedback, design decisions, prompt quotations, tutor feedback or lessons learned on the
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
  the rules (author, from the design brief). One exception (author, 7 Nov
  2026; ADR 0016): a scene's **fixed structure**, such as the tree in
  Woodland Commons, is explicit scene configuration (`SceneTemplate.fixed`)
  that the rules treat as already built. Its volumes block every part and
  plan, and only its platform boxes carry parts. It is never in the build,
  the kit or the stock, and no command can select, recolour, turn or remove
  it. Its coordinates are frozen with the scene id. No invisible supports:
  every support box is drawn where it is.
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
- Log a request body, header, cookie, session token or its hash, password,
  username, display name, recovery code, friend-link token, room label, IP
  address, raw error message or stack, original URL or query string; or
  build a log line any way other than `src/server/log.ts`'s allowlisted
  fields. Never let a logging failure change an API response, and never let
  Express's (or Node's) default handlers print an error (author, 20 Oct
  2026; ADR 0013, after a malformed body's start was found in Express's
  error output).
- Store a recovery code anywhere but its hash, put one in a log or a URL, or
  let a friend-request link double as a recovery or login credential
  (ADR 0006).
- Snapshot live presence, plan marks, or room invitations as part of a saved
  work (ADR 0009).
- Let possessing a snapshot id alone authorize reading, copying or
  continuing it. Access requires having saved it, being a current member of
  the room it came from, or its having been published — checked identically
  at every read and write path, not only at the one a prior pass happened to
  cover (ADR 0009, corrected 13 Oct 2026 after an independent review found
  `continue` skipped the check `GET` already had).
- Let a visitor's historical room membership (a `room_members` row existing
  at all) substitute for an active-capacity check. Every admission to an
  active slot — a fresh join, a returning member, an accepted invitation, an
  SSE reconnect — goes through the one capacity-checking path regardless of
  prior membership (ADR 0007, corrected 13 Oct 2026 after an independent
  review demonstrated a returning member exceeding a room's capacity).
- Subtract plans from real inventory, store a second ("planned") stock, or
  let planning demand affect whether anyone may place or realize a real part
  (author, 19 Oct 2026; ADR 0011).
- Accept a new PLAN that floats or collides. A new plan rests on the plot or
  on studs of real parts and/or standing open plans (same threshold and
  catalogue stud rules as a real part), and may not overlap a real part or
  another standing plan. Only stock is exempt. Never let a plan support a
  real part, and never cascade-withdraw: withdrawing, removing or turning
  whatever alone holds up a standing plan is refused with `plan_depends`
  (author, 19 Oct 2026; ADR 0012, superseding ADR 0009's 13 Oct "plans never
  need support" correction).
- Delete, move or rewrite an existing plan because it no longer fits.
  Legacy or overtaken plans stay, are shown as conflicting/unsupported,
  support and block nothing, and can always be withdrawn (ADR 0012
  compatibility policy). Plans are read `ORDER BY rowid` everywhere so
  standing is decided in commit order identically on server and clients.
- Hand-roll password hashing, store a password anywhere but its salted
  `scrypt` hash, or let checking credentials alone (without an explicit
  confirmation step) switch a browser away from an anonymous identity that
  already has rooms, friendships or saved work of its own (ADR 0010).
- Let a visitor's historical room membership (a `room_members` row existing
  at all) authorize MUTATING the room, as opposed to merely being listed as
  having been there. Every command, and every plan mark, checks `active = 1`
  (or the solo default room's host-exception), not just that a row exists
  (ADR 0007, corrected 14 Oct 2026 after an independent review found a
  replaced, no-longer-active member could still place/edit/remove parts and
  mark plans directly).
- Admit anyone through a direct room link, or by a pasted room id, before
  showing room name, scene, capacity, visibility and the publication
  setting and getting an explicit confirmation — except for an
  already-admitted/returning player, who skips straight through (ADR 0007,
  corrected 14 Oct 2026).
- Let an already-open SSE connection keep streaming a room's private
  updates after the session that authorized it has signed out or been
  superseded by an account switch, and never revoke a DIFFERENT,
  independently valid session for the same visitor when one specific
  session ends (ADR 0010, corrected 14 Oct 2026).
- Let a recovery code generated for (or redeemed into) a visitor linked to
  an account grant access to that account, or let redeeming any code at
  all while the requesting browser is itself signed in to an account
  silently switch it away with no confirmation (ADR 0006/0010, corrected
  14 Oct 2026 after an independent review found recovery could fully
  bypass a password with the right sequence of calls).

## Server logs (author, 20 Oct 2026; ADR 0013)

- Server output is the diagnostic channel for "who did what": one JSON line
  per defined significant event (ADR 0013's table, not every request) on
  stdout, read with
  `mise exec -- flyctl logs -a comp4020-final-asuka121380`. It is not room
  history, and it is never shown to players. There is no activity feed,
  history API or admin page. `room_activity` stays as it is: committed
  construction commands only.
- Every line goes through `src/server/log.ts`:
  - a typed `Fields` allowlist, with a validator per field
  - client-supplied ids logged only when UUID-shaped (else "unrecognised",
    or a hash for command ids)
  - visitors shown as the 8-hex label (`actor`); never names, usernames or
    IPs
  - one server-generated request id (`req`, `X-Request-Id`) per HTTP
    request
- A new server action that changes state, or refuses someone, gets an event
  in the same change, emitted after its transaction. Use the outcome
  vocabulary in ADR 0013, and keep these apart:
  - a commit from a no-op
  - a duplicate from a second action
  - a rule refusal from a permission refusal
  - an expected refusal from an unexpected error
- Attribution (`author`: original builder or plan proposer) comes from
  server state, never the client. Public error codes and response shapes
  don't change for the sake of the log.
- No per-frame, heartbeat, pointer or preview lines. No client telemetry for
  clicks the editor refuses locally.
- Fatal errors (uncaught exception, unhandled rejection, a background
  failure that leaves the database mid-transaction) stop the process with a
  non-zero status through the one bounded `shutdown()`. It is never kept
  serving, and nothing is retried in-process. Recoverable background errors
  keep serving and say so. The exit status only rises: a fatal error during
  a graceful shutdown still ends non-zero, and a later signal never lowers
  it. The 3 s shutdown deadline is a JS timer that fires only while the event
  loop runs; never block the loop (ADR 0013, corrected 20 Oct 2026).
- Never write log lines synchronously (`fs.writeSync` to stdout blocked the
  whole server when the pipe went unread). Lines go through `log.ts`'s
  bounded queue: 1,000 lines or 1 MiB. Overflow drops new lines and reports
  `log.dropped` with a count; failed output stops writing and counts. Never
  claim delivery is guaranteed, and never retry or log about the logger.
- Fly's retention is short and not ours to promise. Logging stays on in the
  normal app. Excerpts worth keeping go into `doc/evidence/` after a check
  against the never-logged list.

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
  same visitor and build.
- **The homepage is a building table (author, 2 Nov 2026; ADR 0014,
  superseding ADR 0004's "no three.js on the homepage").** A lightweight,
  modular 3D scene is now authorised, where physical objects are the site's
  entrances and the camera moves towards the one chosen.
  - Its entry script imports no three.js; the scene loads only after a
    WebGL probe.
  - Anything that stops the table being shown falls back to plain links to
    every core function. Never a blank canvas.
  - It never loads the editor or the game's scene. Reuse only pure geometry
    (`scene/scenery.ts`, `scene/geometry.ts`, `scene/Batched.tsx`), never
    the game's assets or state.
  - Viewing it never calls `/api/me` or creates a visitor; only the
    read-only `/api/me/peek`.
  - Its styles stay scoped under `body.home`.
  - **Current status (author, 4 Nov 2026; ADR 0014 "Entrances pass").**
    Every planned entrance is implemented. Some complete their interaction
    within the table: the sign (account), the scene tray (choosing to
    build alone or setting up a new room, then straight into the editor),
    the noticeboard (join a room) and the Friends stand (friends and
    invitations). Others intentionally lead to dedicated
    pages: the shelf previews and links to the collection and showcase,
    and the booklet opens `/readme/`.
  - **Permanent rule (author), which still applies with every current
    entrance complete:**
    - Any future unfinished entrance stays clearly non-interactive
      decoration (inert, `aria-hidden`, no hover affordance, no button),
      and never implies a function that doesn't exist.
    - Every existing function stays reachable through working navigation,
      such as Quick links, the fallback links and the dedicated pages.
  - Only playable scenes appear on the table.
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

## Second scene: Medieval Castle (author, 5 Nov 2026; ADR 0015)

- Its kit comes from the primary model in the official LEGO Creator 31120
  instructions (booklet 1, bags 1–3 and 6), counted from the step callouts,
  never from photographs or the set's piece count. Allocated quantity is
  `ceil(required × 1.30)`. Sources, page references, counts, mapping and
  every substitution are in `doc/research/0002-medieval-castle-reference.md`.
  The booklets and their renders stay outside the repo and `public/`.
- New castle rooms start empty. The adapted reference is a target picture
  and a test fixture, never pre-placed.
- Arches and the inverted slope rest only on their `sockets` (legs, back
  row) and collide as their whole box. Parts without `sockets` rest on
  their whole footprint, so Beach Houses' rules are unchanged.
- The environment is a bright medieval valley: stone road and open grass in
  front, with nothing tall between the default camera and the courtyard;
  the plot as a paved courtyard; low ruins outside the bounds; hills, sparse
  woodland and mountains behind, with a quiet skyline behind the courtyard;
  a clear afternoon with the sun to the side or rear-side. No moat, fog,
  darkness or colour grading.

## Third scene: Woodland Commons (author, 7 Nov 2026; ADR 0016)

- A co-op tree-house settlement round one fixed central tree, for up to 6
  players. Beach Houses stays at 2 and the castle at 4.
- Its kit comes from the cabin, roof and stair bags (7–13, 15) of the
  official LEGO Ideas 21318 instructions, counted from the step callouts,
  never from photographs or the set's piece count. Allocated quantity is
  `ceil(required × 1.30)`. The tree, base and foliage are the fixed
  environment, never in the kit. Accessories and mechanisms are omitted.
  Sources, pages, counts, mapping and every substitution are in
  `doc/research/0003-tree-house-reference.md`. The booklet and its renders
  stay outside the repo and `public/`.
- The tree is the scene's fixed structure: a trunk, roots and branches
  (solid, studless) and three platforms (support surfaces) at three
  heights. Players build cabins, platforms, stairs, railings and
  connections. No rope physics, sway, collapse or arbitrary angles.
- New rooms start empty. The adapted reference is a target picture and a
  test fixture, never pre-placed.
- The environment is a clearing at a forest edge on a bright early-autumn
  afternoon: the trunk behind the main working area, a sparse canopy above,
  behind and to the sides, and an open front at every height. No night,
  fog or heavy filters. "Hide leaves" is a local, per-viewer view setting
  that hides only the canopy foliage; it never changes the rules or what
  others see.

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
  - never below the ground, never inside a neighbouring house, no roll
  - zoom and pan bounded so the build can't be lost and the world's edges
    don't show
  - working Top view and Reset view controls
- A drag that moves the camera never places, selects or deletes on release.
- **Mapping (author, 19 Oct 2026; ADR 0012, superseding ADR 0003's left-drag
  orbit):** the left button is for building only; right drag orbits about
  the current centre; Shift+right and middle drag pan; the wheel zooms.
  F and a visible Focus selected button (disabled with nothing selected)
  centre on the selection; T is top view over the current centre; Home /
  Reset view is the default framing. Orbit and Pan tools give left-drag
  navigation with a visible way back (Esc or the tool again). Touch: one
  finger orbits, two fingers pan, pinch zooms. The held preview is frozen
  during any drag or while a navigation tool is on. A visible controls hint
  is shown.

## Interaction (author, 6 Oct 2026; supersedes the Build/Select modes; one Build/Plan mode re-added 19 Oct 2026, ADR 0011)

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
    exactly the preview on screen; a click or tap never re-aims first, and
    moving the pointer across the scene to a dock button doesn't re-aim it
    (ADR 0012).
  - Arrow keys and the direction buttons move the preview relative to the
    camera, snapped to the grid's axes with hysteresis. Height is a separate
    control.
  - Mouse, keyboard, visible buttons and touch give the same placement
    results. Collision, bounds, stock and support rules are unchanged.
  - A click places the part, and the part stays held while stock lasts.
  - Esc, or choosing the same tray item again, puts it down. Esc never
    changes the construction mode.
- **Build and Plan modes (author, 19 Oct 2026; ADR 0011).** The one mode in
  the editor. It is local to each browser, shown with words, pressed state
  and an icon (never colour alone), toggled by visible buttons and **P**.
  - In Plan mode the same aiming, rotation, nudges and Higher/Lower apply,
    and a click (or Enter, or the dock button) proposes exactly the
    displayed preview as a plan. In Build mode it places a real part. All
    of them go through one mode-checked commit path, so neither can create
    the other kind of object.
  - The mode stays as chosen while proposing; returning to Build is always
    explicit.
  - Higher/Lower step only through the current mode's supported heights:
    real parts in Build mode, real parts plus standing plans in Plan mode.
    Nothing climbs into unsupported space (ADR 0012). Only in Plan mode can
    the pointer aim at a plan's surface; in Build mode it looks through
    plans.
  - A mode switch keeps the exact displayed preview; if it doesn't fit the
    new mode it is shown invalid and the commit is refused, never moved
    (ADR 0012).
  - There is no separate "propose" button that needs pointer travel.
  - Clicking existing parts while holding one goes through the placement
    rules.
- **Selected part:** compact controls to identify, recolour, rotate (90° steps,
  with the whole build re-validated, through the command path) and delete.
- **Delete tool:** a persistent toolbar button.
  - Targets both real parts and plans. Real parts use remove; plans use
    withdraw-plan, without returning real stock. Both retain support checks.
  - Keyboard target cycling includes plans while deleting; touch retains
    first-tap target, second-tap remove. The tool stays on after removal.
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

- **Identity.** A visitor is still a browser cookie by default (ADR
  0001/0003). A page establishes it before anything acts as it: the lobby
  and the editor wait on one shared `GET /api/me` (`state/identity.ts`, under
  the Web Lock `brick-identity` across tabs). Only then may they send an
  identity-dependent request or open a realtime stream. A new page entry
  point goes through `IdentityGate`. Never fix identity problems by
  suppressing `visitor.new`, letting commands create visitors, or weakening
  admission (author, 20 Oct 2026). A player may opt in to a single-use recovery code, generated
  from an identity panel, to link a second browser to the same identity
  without registering anything. Recovery codes are stored only as a hash,
  rate-limited, never logged or put in a URL, and are a completely separate
  mechanism from friend-request links (ADR 0006) **and** from account
  passwords (ADR 0010). A player may also register an explicit, visible
  account (local username/password, `scrypt`-hashed) as the primary way to
  reliably reach the same rooms/friends/collection from another device;
  this never replaces the cookie/visitor model, only layers a login over
  one visitor_id (ADR 0010).
- **Rooms, not per-visitor builds.** A build belongs to a room with up to
  the scene's configured `maxPlayers` (Beach Houses: 2; Medieval Castle: 4;
  Woodland Commons: 6).
  A room's scene is chosen when it is created, stored on the room, and read
  from there by every server and client path; it never changes. Continuing
  a snapshot keeps its scene. A visitor has one solo plot per scene
  (ADR 0015, 0016). A room is public
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
  never blocks real construction; it must, however, be buildable against
  real parts plus standing plans (ADR 0012), and a real part built into its
  space leaves it kept but conflicting. A selected plan is drawn with bright
  cyan outlines and a slightly more opaque, never solid, surface; no
  flashing. A newly real part (own, realized, or pushed) drops about half a
  plate in ~180 ms, never on load/reconnect, for plans, or under
  `prefers-reduced-motion` (ADR 0012). **Planning demand** (ADR 0011) is derived
  on each client as real stock minus the room's open plans, per part type,
  counting every member's plans. It is shown only in Plan mode, beside the
  real count and never as owned stock. It may be negative, is never stored,
  and is never consulted by any rule. Real placement and realization are
  decided by real stock alone, on the server. Any member may realize one (atomically
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
- After any change to a server route or the command path, run the logging
  tests (`spec/server/log-*.test.ts`, in `pnpm check`). For a change that
  adds or changes events, also run `node scripts/log-rehearsal.ts <local-url>
  <server-stdout-file> <out-dir>` against a local server, and read the lines
  it produced. Say whether log evidence came from a scripted local run or
  from people using the deployed app (author, ADR 0013).
- After any change to interaction, the camera or the dock, run
  `node scripts/interaction.ts <url> <out-dir>` against a running server, and
  add a check when adding a rule or shortcut (proposed).
- Use `mise exec --` for every tool, from the repo root (proposed).
