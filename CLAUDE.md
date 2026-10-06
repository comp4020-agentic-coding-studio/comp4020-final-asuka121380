# Harness

<!-- Rules tagged (author) are decisions the author gave the agent; (course)
     come from the course's fixed contract; (proposed) are the agent's
     proposals, awaiting the author's review. Edit freely: this file is the
     author's. -->

A browser 3D brick-building game set in an inviting residential street. The
current milestone is C8: a working, server-saved solo build. Multiplayer,
material requests, shared planning, similarity scoring, galleries, accounts
and runtime LLM features are out of scope until the author says otherwise
(author).

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
  visitor from the cookie (proposed).
- Patch stock by hand. For every part type, kit = held + placed. Invalid
  actions and cancelled previews cost nothing (author).
- Make colour a stock dimension, or put fixed scenery in the build, the kit or
  the rules (author, from the design brief).
- Cascade-delete, drag-to-demolish or add undo. Removal is refused while any
  remaining part would lose its only support, and removed parts return to the
  kit (author).
- Change an existing saved kit or invalidate a saved build. Kit changes are
  additive and versioned, and old builds are upgraded in place (author;
  mechanism in ADR 0003).
- Add gravity, collapse, rigid-body physics or ray tracing (author).
- Add people, minifigures, traffic or moving vehicles (author).
- Call a model, an LLM or any external service at runtime (author).
- Commit or serve the 11035 PDF or its renders, the reference photograph, the
  concept image, or LEGO branding (author: reference images stay out of
  public assets).
- Change `fly.toml`'s limits, the shipped `spec/invariants.test.ts`,
  `0.0.0.0:$PORT`, or `/readme/` (course).
- Push, deploy, make the repo public or run /comp4020:ship without the
  author's explicit go-ahead in the current conversation (author).

## Shape of the code

- `src/domain` is plain TypeScript: no React, three.js, Express or SQLite. The
  server decides with it and the client previews with it (author).
- Geometry (`src/client/scene/geometry.ts`) is appearance only. Connection and
  collision live in the catalogue, and must agree with what is drawn: a door
  sits in a real wall opening, never as a slab on a solid wall (author).
- All SQLite access goes through `src/server/db.ts` (author).
- Server files run directly under Node, so use only TypeScript syntax that
  erases (`erasableSyntaxOnly`) and import with `.ts` extensions.

## Scene and camera (author, 6 Oct 2026; supersedes the finite base and restricted orbit in ADR 0002)

- The 3D world fills the viewport behind floating UI. There is a sky, distant
  surroundings, and ground and street extending past the working area. No
  "platform ending in empty space".
- One street of houses with the player's plot clearly marked. Neighbours have
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
  geometry; on mobile it collapses.

## Before saying something works

- `pnpm check` against a running app: locally, or against the deployed app
  with `APP_URL`. Also `pnpm check:evidence` (course).
- For anything visual or interactive, run it in a real browser (`scripts/`).
  Say which checks were browser-emulated and which were on a physical device
  (author).
- Use `mise exec --` for every tool, from the repo root (proposed).
