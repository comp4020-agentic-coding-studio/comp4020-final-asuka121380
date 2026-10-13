# ADR 0006: Identity stays cookie-first, with an opt-in recovery code

- **Status:** accepted.
  - The author set the requirements on 13 Oct 2026, after the agent raised
    this as one of four decisions to make before multiplayer implementation.
  - The agent's implementation choices are marked "agent".
- **Date:** 2026-10-13

## Context

C8's identity is a single `brick_visitor` cookie (`src/server/index.ts`,
`src/server/builds.ts`): the server looks up or creates a visitor row from
it, and there is no way back into that identity from another browser or
after the cookie is cleared. Multiplayer (ADR 0007 onward) needs a stable
identity to hang friendships, room membership and durable contributor
records off, which raises the recovery question the C8 README already names
as a limitation.

The brief for this phase asked that, before implementing identity further,
the agent explain:
- how a returning player retrieves rooms, friends and collections
- whether identity works across devices
- what happens when browser storage is cleared
- how existing anonymous builds are retained
- what limitations remain

## Options considered

1. **Cookie only, no recovery (status quo).** Simplest; a cleared cookie or
   a new device is unrecoverably a new person.
2. **Optional email magic-link.** Recoverable without anything to keep, but
   adds an email-sending dependency and an accounts surface the brief says
   isn't required.
3. **Cookie first, with an opt-in one-time recovery code.** Play starts
   immediately with no setup; a player who wants cross-device access
   generates a code from an identity panel, enters it on the other device,
   and that device links to the same identity.

## Decision

Option 3 (author).

- **Nothing changes for a visitor who never asks for one.** The existing
  cookie flow is untouched: first visit creates a visitor row and a cookie,
  exactly as today. A build, friendships and room membership all hang off
  the visitor id already in that row.
- **A recovery code is generated on request, not by default** (author),
  from a new identity/settings panel. It is a cryptographically strong
  random credential (agent: 20 bytes from `randomBytes`, rendered as a
  grouped base32 string for a person to type, e.g. `k3f9-…`). Only its
  SHA-256 hash is stored, in a new `recovery_codes` table keyed by visitor
  id, never the code itself (author: "store only its secure hash").
- **Single-use.** Redeeming a code links the visitor id to the requesting
  browser (same mechanism as login: a cookie is issued for that visitor id)
  and immediately deletes the stored hash. The success response tells the
  player their code is now spent and offers "Generate a new one", so they
  are not left thinking their original code still works (author).
- **Separate from friend-request links.** Recovery codes and friend links
  are different tables and different endpoints; a friend link never
  authenticates anyone into another identity, and a recovery code is never
  shown inside a shared or logged context (author; see ADR 0007 for
  friend-link shape).
- **Rate-limited.** `POST /api/identity/recover` is limited per source IP
  (agent: a small in-memory counter in the same style as the existing
  per-visitor command throttle in `src/server/index.ts`, since the course's
  infrastructure is one machine with no separate store). A wrong code
  counts against the limit; a right one does not reset it early.
- **Never logged, never in a URL.** The code travels only in a POST body
  over HTTPS (Fly terminates TLS); the structured log in `index.ts` never
  receives request bodies, and this stays true for the new route.
- **Existing anonymous builds are untouched.** A visitor row created before
  this change behaves identically: it can still generate a recovery code
  going forward, and its existing build becomes a single-member room under
  ADR 0007's migration, kept private.

## What this does and doesn't give a player

- **Cross-device, opt-in only.** Without ever generating a code, a player's
  identity (and therefore their rooms, friends and collection) is tied to
  one browser's cookie, exactly as C8. With a code, exactly one other
  browser can be linked, once, before a new code is needed for a further
  device.
- **Clearing storage loses the code's trail but not the identity's
  existence.** If a player cleared their cookie *and* never recorded a
  recovery code, their original identity still exists in the database (its
  rooms, friendships and contributor records are untouched) but nothing can
  reach it again: this is the same limitation C8's README already states,
  carried forward rather than solved. Generating and keeping a code before
  clearing storage is the only way to avoid that.
- **No password, no email, no external service.** There is nothing to
  forget beyond the one code, and nothing the project depends on besides
  its own database.

## Consequences

- One new table (`recovery_codes`: visitor id, code hash, created_at) and
  two new endpoints: `POST /api/identity/recover-code` (generate, requires
  an existing session) and `POST /api/identity/recover` (redeem, does not
  require one).
- The identity model stays anonymous: a recovered identity has no name or
  password, only whatever display name the player has set (ADR 0007).
- Because recovery is opt-in, most visitors keep today's exact risk profile;
  the feature adds a path out for anyone who wants it, without adding
  account-creation friction for anyone who doesn't.
