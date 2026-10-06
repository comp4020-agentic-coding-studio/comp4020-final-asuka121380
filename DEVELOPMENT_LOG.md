# Development log

A factual, chronological record of the development of this project,
maintained by the agent (Claude) under the rules in `CLAUDE.md`. It is source
material for the author's `PROCESS.md`, not a substitute for it. It records
what changed, why, who decided, what was run and what was observed. It holds
no opinions, lessons learned or experiences on the author's behalf.

The repository is
<https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380>.
Times are Australia/Sydney (AEDT, UTC+11) unless marked.

**Conventions**

- "Decided by the author" means the author gave the decision in the
  conversation.
- "Agent's choice" means an implementation choice the author has not
  separately confirmed.
- "Run" means a command was executed in this session. "Observed" is what it
  printed or showed.
- Detailed results live in `doc/evidence/`, decisions in `doc/adr/`.

---

## Retrospective entries

The first three entries were written on 6 Oct 2026, after the event. Their
diffs were re-inspected (`git show --stat` and the config hunks) when the
entries were written. Their test results are taken from
`doc/evidence/0002-c8-checkpoint.md`; none of those tests was rerun when the
entries were written.

### 2026-10-06 16:31 — [`4b40546`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4b40546) Construction rules, the 11035 reference model and a first R3F workbench *(retrospective)*

**Changed** (25 files, +3750/−6):
- `src/domain/`: plain TypeScript with no framework imports.
  - `grid.ts`: rotation by repeated quarter turns.
  - `catalog.ts`: 11 part types, each with footprint, height, stud cells,
    allowed rotations and a separate geometry key.
  - `colours.ts`: 13 named colours.
  - `rules.ts`: placement, removal and recolour validation, and pure apply
    functions.
  - `scene.ts`: the 16×8 plot, the 46-placement reference model and the kit.
  - `commands.ts`: the command envelope types.
- `src/client/`: React + React Three Fiber.
  - `geometry.ts`: parametric parts.
  - `PartMesh`, `Street` (fixed neighbours, hedge, path, kerb on a finite base)
    and `Workbench` (orthographic camera limited to ±0.75 rad of azimuth).
  - A right-hand sidebar with Build/Select modes.
  - A client store, plus `localTransport`: an in-browser rules runner for an
    unsaved `?local` preview.
- `spec/domain/rules.test.ts`: 17 tests.
- `vitest.config.ts`: split into an `app` project (HTTP, against a running
  app) and a `domain` project.
- `tsconfig.json`: adds `src`, `jsx`, `erasableSyntaxOnly`.
- `package.json`:
  - runtime: express, marked
  - dev: react, react-dom, three, @react-three/fiber, @react-three/drei, vite,
    @vitejs/plugin-react, playwright-core and types
- `scripts/shoot.ts`, `scripts/placement-experiment.ts`: Chrome via
  playwright-core.

**Why.** The C8 milestone needs a playable solo build. The domain stays
independent of rendering so the server can reuse it.

**Who decided:**
- **Author:** React + R3F + Vite, parametric geometry kept separate from
  connection and collision metadata, the C8 removal rule, an English
  interface, and inspecting the official 11035 instructions before adapting
  them.
- **Agent:** the part list, slope stud rows, box collision, the street layout,
  the camera limits, and the Build/Select modes.

**Tests at the time:**
- `pnpm vitest run --project domain`: 17 passed.
- The placement experiment in `?local`.

**Limitations then:** nothing was saved yet. Neighbour doors were drawn in
front of solid walls.

### 2026-10-06 16:35 — [`9202f3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/9202f3f) Server: one command path into SQLite on the volume, and /readme/ *(retrospective)*

**Changed** (13 files, +636/−46):
- `src/server/db.ts`: node:sqlite, WAL, a migration table recorded in
  `user_version`, and a `transaction()` helper.
- `src/server/builds.ts`:
  - visitor tokens, stored as a SHA-256 hash
  - a build per visitor, started with the whole kit
  - `runCommand`: dedupe by command id, check the revision, check with the
    shared rules, then one transaction writing the parts, inventory, revision
    and commands rows
- `src/server/index.ts`:
  - Express routes: `GET /api/build`, `POST /api/command`, `/readme/`,
    `/readme/docs`, and static files for the built client
  - an httpOnly SameSite=Lax cookie
  - a per-visitor rate brake and a JSON line logged per command
- `src/server/readme.ts`: `marked` renders the README on the server.
- `Dockerfile`: replaced the busybox placeholder with two node:24.21.0-slim
  stages.
- `placeholder/`: deleted.
- `docs/README.md`: new.
- `.gitignore`, `.dockerignore`: ignore local `data/`.
- `spec/persistence.test.ts`: 7 HTTP tests.

**Why.** The C8 spec requires that a stranger finds their trace when they
come back.

**Who decided:**
- **Author:** Express + node:sqlite, isolated database access, and verifying
  restart and redeploy persistence on the real deployment.
- **Agent:** the schema, the cookie identity and the HTTP shapes.

**Tests at the time:**
- `pnpm check` locally: 26 passed.
- Deployed by hand from this commit (Fly release v2, 16:37), then
  `APP_URL=… pnpm check`: 26 passed.
- Restart probe: one part survived `flyctl machine restart`.
- Redeploy probe: the same part survived a redeploy to release v3 (16:39).
- Browser experiment against the live app: reload restored everything.

**Limitations then:**
- The README was still the template.
- Touch, resize and a keyboard-only pass were untested.

### 2026-10-06 16:42 — [`a9b4c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a9b4c3d) Evidence and decision drafts for the C8 checkpoint; draft harness *(retrospective)*

**Changed** (11 files, +351/−8):
- `doc/evidence/0001-reference-model.md`: the 11035 transcription.
- `doc/evidence/0002-c8-checkpoint.md`: the tests and their results.
- Five screenshots in `doc/evidence/shots/c8-checkpoint/`.
- `doc/adr/0001-stack-and-persistence.md`: accepted.
- `doc/adr/0002-shallow-street-and-part-scope.md`: proposed.
- `CLAUDE.md`: a labelled draft harness.
- `scripts/placement-experiment.ts`: added the select, recolour and remove
  steps.

**Who decided.** This is documentation of the above.

**Tests at the time.** The extended experiment ran against the live app; its
results are in the evidence file.

**Afterwards:**
- 16:43: pushed to `origin/main`, without asking the author first. The repo
  stayed private.
- This commit was never deployed; the live app runs `9202f3f`.

---

## Entries
