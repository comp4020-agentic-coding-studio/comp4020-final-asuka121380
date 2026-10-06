# ADR 0001: Stack and persistence

- Status: accepted (the author decided the stack on 6 October 2026; the
  agent drafted this record)
- Date: 2026-10-06

## Context

The course fixes one shared-cpu-1x machine with 256 MB, one volume at
`/data`, HTTP on `0.0.0.0:$PORT`, and `README.md` served at `/readme/` in the
server-sent HTML. The game is an interactive 3D workbench whose durable state
is a build: placed parts, stock and a revision. It continues past C8 into
real-time co-op (C9), action logs (C10), material requests, planning and
exhibit views.

## Options considered

1. **Plain Three.js with HTML controls, Express and node:sqlite.** This was
   the agent's first recommendation, for fewer layers on a 21-hour clock.
2. **React with React Three Fiber, Vite, Express and better-sqlite3.** This is
   the design brief's proposal.
3. **React with React Three Fiber, Vite, Express and node:sqlite.**

## Decision

Option 3.
- React and R3F for the client. The author's reason: the project grows into
  co-op controls, requests, planning and exhibit views, and composing those is
  what React is for.
- Express for the one same-origin server.
- SQLite through Node's built-in `node:sqlite` rather than better-sqlite3.
  better-sqlite3 needs a native build, and pnpm 11 must explicitly allow its
  build script.
- Domain state stays independent of React and three.js. It lives in
  `src/domain` as plain data and functions, shared by the server, which
  decides, and the client, which previews.
- The server is TypeScript run directly by Node 24, which strips types. Only
  the client has a build step.

## Consequences

- One database file on the volume. Every durable change runs in a single
  `BEGIN IMMEDIATE` transaction: the part, the stock and the revision, plus a
  command-id record that makes retries safe.
- Restart and redeploy persistence was verified on Fly (evidence 0002).
- `node:sqlite` is not yet marked stable in Node's documentation. All access
  goes through `src/server/db.ts`, so changing driver touches one file.
- The client bundle is about 1.2 MB (326 kB gzipped), mostly three.js. That's
  acceptable for now, with lazy loading available if mobile load time becomes
  a problem.
- Real-time sync for C9 can hook in after a successful commit in
  `runCommand`, without changing the solo path.
