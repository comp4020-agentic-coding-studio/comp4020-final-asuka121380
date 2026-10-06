# Harness

<!-- DRAFT, 6 Oct 2026. Rules tagged (author) are decisions the author gave
     the agent; rules tagged (proposed) are the agent's proposals, awaiting the
     author's review. Edit freely: this file is the author's. -->

A browser 3D brick-building game on a shallow miniature street. The current
milestone is C8: a working, server-saved solo build. Multiplayer, fidelity
scoring and the gallery are out of scope until the author says otherwise
(author).

## Never

- Show "Saved" before the server's transaction has committed (proposed).
- Write a build from a client snapshot, or let anything but the command path
  change one (author: one server-side command path).
- Trust the client for stock, validity or identity. The server works out the
  visitor from the cookie and re-checks every command with `src/domain/rules.ts`
  (proposed).
- Patch stock by hand. For every part type, kit = held + placed (proposed).
- Make colour a stock dimension, or put fixed scenery in the build, the kit or
  the rules (author, from the design brief).
- Cascade-delete parts. Removal is refused while any remaining part would lose
  its only support, and removed parts return to the solo kit (author).
- Call a model, an LLM or any external service at runtime (author, from the
  design brief).
- Commit the 11035 instruction PDF or its page renders, the reference
  photograph, or LEGO branding (proposed).
- Change `fly.toml`'s limits, the shipped `spec/invariants.test.ts`,
  `0.0.0.0:$PORT`, or `/readme/` (course).
- Make the repo public, or run /comp4020:ship, without the author's go-ahead
  (author).

## Shape of the code

- `src/domain` is plain TypeScript: no React, three.js, Express or SQLite. The
  server decides with it and the client previews with it (author: domain state
  independent of React and three.js).
- Geometry (`src/client/scene/geometry.ts`) is appearance only. Connection and
  collision live in the catalogue (author).
- All SQLite access goes through `src/server/db.ts` (author: isolate the
  database).
- Server files run directly under Node, so use only TypeScript syntax that
  erases (`erasableSyntaxOnly`) and import with `.ts` extensions.

## Pages and interaction

- Both 1920×1080 and 390×844 must be fully usable. Mobile gets the plot-focused
  view and a foldable control sheet (course, brief).
- Pointer and touch snap to attachment positions. Manual height is an aid, not
  the main path (author).
- Every action has a keyboard path and a visible button. Text says whether a
  placement fits, never colour alone (brief).
- Don't show buttons for features that don't exist yet (brief).

## Before saying something works

- `pnpm check` against a running app: locally, and against the deployed app
  with `APP_URL`. Also `pnpm check:evidence` (course).
- For anything visual or interactive, run it in a real browser
  (`scripts/placement-experiment.ts`, `scripts/shoot.ts`). Say what was
  checked in a browser and what wasn't (proposed).
- Use `mise exec --` for every tool, from the repo root (proposed: the pinned
  versions).

## Evidence and writing

- Record facts as they happen in `doc/evidence/`, and draft decisions in
  `doc/adr/`, marking which are the author's and which the agent's (author).
- The agent doesn't write the README's argument, `PROCESS.md` or reflections.
  The author does (author).
- When the agent repeats a mistake, the fix goes here or into `spec/`, not into
  a promise to be careful (course).
