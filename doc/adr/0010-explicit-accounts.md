# ADR 0010: Explicit, local-credential accounts, layered over the existing cookie identity

- **Status:** accepted.
  - The author explicitly changed scope on 13 Oct 2026, overriding ADR
    0006's earlier decision to keep identity cookie-first for this phase:
    "I now want a real, visible account system, replacing the earlier
    product decision to rely primarily on browser cookies and recovery
    codes." The agent's architecture recommendation and implementation
    choices are marked "agent".
- **Date:** 2026-10-13
- **Supersedes:** ADR 0006's framing of recovery codes as the *primary*
  cross-device mechanism. ADR 0006's recovery-code mechanism itself is
  kept, unchanged, as a secondary, account-independent way to link a second
  browser to the same underlying visitor identity (see Consequences).

## Context

An independent review of the phase-2 multiplayer build found that identity
being cookie-first, with an opt-in one-time recovery code as the only
cross-device path, did not give players an understandable way to reliably
reach the same rooms, friends and collection from a different browser or
device, and did not show other players a recognizable name anywhere —
every list (members, contributors, friends, invitations, credits) showed a
raw UUID prefix. The author's follow-up instruction asked for a real
registration/sign-in flow, explained trade-offs between a local credential
system and a maintained external provider, and set firm constraints: no
hand-rolled cryptography, no external dependency or email without asking
first, and no silent merging or reassignment of a browser's existing
anonymous work when an account enters the picture.

## Decision: local, not external

The agent recommended, and implemented, **local username/password
accounts, hashed with Node's own `scrypt`**, rather than a maintained
external identity provider (Auth0, Clerk, Supabase Auth, etc.).

Reasoning (full comparison given to the author before implementation):
calling an external provider at runtime is explicitly forbidden by
CLAUDE.md's existing "never call a model, an LLM or any external service at
runtime" rule, generalized here to any third-party runtime dependency; a
provider would also need the author's separate go-ahead as a "change to the
no-runtime-external-services rule", an email-sending dependency, and
plausibly a signup and cost — none of which were requested. Local accounts
need no new infrastructure beyond one more SQLite table on the volume
already in use, and `scrypt` is a long-established, audited primitive in
Node's own standard library: using it is not hand-rolled cryptography, only
not *externally delegated* password storage. The trade accepted is real:
no "forgot password" email flow is possible, which is stated below as a
limitation rather than solved.

## Decision: layered over the existing visitor model, not a replacement

- **New `accounts` table**: `id`, `username` (unique, case-insensitive),
  `display_name`, `password_hash`, `password_salt`, `created_at`.
  `visitors` gains a nullable `account_id`, with a **partial unique index**
  ensuring at most one visitor row is ever an account's "primary" visitor.
- **An account is a durable label and login over exactly one visitor_id**,
  never a second identity system. Every existing table — `rooms`,
  `room_members`, `room_contributors`, `room_inherited_credits`,
  `friendships`, `friend_requests`, `snapshots`, `publications` — keeps
  using `visitor_id` exactly as before ADR 0010. Signing in never creates a
  visitor row; it issues a **fresh session** (ADR 0006's existing
  multi-session mechanism, unchanged) for the account's one primary
  visitor, so a second browser reaches the *same* rooms/friends/collection
  the first browser already had, with zero schema change to any of those
  tables. This was the deciding reason to layer rather than replace: it
  keeps ADR 0006/0007/0008/0009 correct as written, and the two systems'
  invariants (one visitor can hold several sessions; a visitor is the
  server's sole unit of authorization) are untouched.
- **Registering while using an existing anonymous identity** (brief case
  1) links that visitor directly: nothing is copied or migrated, because
  there is nothing to migrate — the same visitor_id simply becomes
  reachable by login, in addition to this browser's existing cookie.
- **Signing into an existing account while the current browser holds a
  different anonymous identity's work** (brief case 2, the one genuine
  migration hazard) is handled as an explicit, two-step action:
  1. `POST /api/account/sign-in` verifies the password and reports whether
     the *current* browser's own anonymous visitor has any rooms,
     friendships or snapshots of its own — but sets no cookie and creates
     no session. Checking credentials, reloading, or retrying can
     therefore never itself complete a switch.
  2. The client shows a conflict screen only if that check came back
     positive, explaining that nothing is deleted and that the current
     identity's work stays reachable only via its own recovery code
     (generated beforehand, from the existing ADR 0006 panel) once this
     browser switches away from it. `POST /api/account/sign-in/confirm` —
     called either immediately (no conflict) or after the explicit
     "I understand, continue" — re-verifies the password and only then
     issues the session.
  - This was tightened mid-implementation: the first cut set the cookie
    inside the single `sign-in` call and only showed the warning
    afterward, which meant the switch had already silently happened by the
    time the player saw it — found by `scripts/accounts.ts`'s own "viewing
    the warning never silently switches the browser yet" check failing.
    Splitting verify-only from confirm-and-switch closes this.
  - No automatic merge of the two identities' rooms/friendships/snapshots
    is implemented in this phase: that is exactly the "reassigning other
    people's work" risk the brief named, and is left as a limitation
    rather than guessed at.

## Security

- **Passwords**: Node's `scrypt` (via `scryptSync`), a fresh random 16-byte
  salt per account, compared only with `timingSafeEqual` — never `===` on
  hash bytes, and the plaintext password is never logged, stored beyond the
  hash, or placed in a URL.
- **Sessions/cookies**: reuses ADR 0006's existing `sessions` table and
  `HttpOnly`/`SameSite=Lax` cookie unchanged; sign-out (`deleteSession`)
  removes the session row itself, so a stolen or cached cookie stops
  working the moment sign-out is clicked, not only once the client
  discards it locally.
- **CSRF**: every state-changing `/api/*` request is checked against the
  request's own `Origin` (falling back to `Referer`) matching this
  server's `Host` header; a cross-origin browser request cannot forge
  either header, and the existing `SameSite=Lax` cookie already blocks a
  plain cross-site form POST from carrying the session at all. This needed
  no change to any existing client or test code, unlike a
  custom-header-based scheme, which was considered and rejected for that
  reason.
- **Rate limiting**: the same in-process, per-source-IP counter style as
  ADR 0006's existing recovery-code limiter, applied to both
  register/sign-in attempts (one counter) — proportionate to the course's
  single shared-cpu-1x machine with no separate store.
- **Non-enumerating errors**: a wrong password and a nonexistent username
  return the identical `401` with the identical message, verified by
  `scripts/accounts.ts`.
- **Realtime on identity change**: corrected 14 Oct 2026 — see "As built,
  corrected" below. An in-progress SSE connection IS now actively revoked
  the moment its authorizing session ends, rather than being left to find
  out only on its own next reload.

## Display names

`accounts.displayNamesFor` (server) / `useDisplayNames` (client,
`src/client/state/names.ts`) resolve a batch of visitor ids to account
display names wherever "who" is shown: friends, invitations, room members,
contributors, plan/mark attribution, and snapshot/showcase credits. A
visitor with no linked account has no name to resolve, and the UI falls
back to a short, labelled anonymous placeholder — never a raw UUID.

## Which actions require sign-in

**None do.** Browsing (the public lobby, the showcase, a read-only saved
or published version) and participating (building, saving, publishing,
friending, inviting) all work exactly as before, fully anonymously, for a
visitor who never registers — matching the brief's "keep browsing
lightweight" instruction and the project's existing "the homepage must not
create a visitor by browsing" rule (`/api/me` is only even called from the
homepage's account-nav link when a visitor cookie already exists). Signing
in is offered purely as a way to make an *already-usable* identity also
reachable from another device, never as a gate in front of a feature.

## As built, corrected (independent review, 14 Oct 2026): a session's SSE streams are revoked when it ends

The original implementation deleted a session's row on sign-out
(`deleteSession`), which correctly stops any FUTURE request from
authenticating with that cookie — but an already-open SSE connection
(`GET /api/rooms/:id/events`) was never told anything had changed. The
review reproduced this directly: account A opens a private room's stream;
a second session signs into the same account; the first session signs
out; the second session's edit still arrives on the first, now-logged-out
session's open connection, indefinitely.

Fixed with a session-keyed connection registry (`registerConnection`/
`revokeSession`, `src/server/realtime.ts`): every SSE connection is
registered by the hash of the exact session token that opened it (never
the visitor id alone, and never the raw token), and `sign-out` and
`sign-in/confirm` (an account switch) both call `revokeSession()` on the
PRIOR token before proceeding, which closes every connection opened under
that specific session and ends its HTTP response outright. A different,
still-valid session for the same visitor (ADR 0006: one visitor, several
sessions) is untouched, since it's keyed by a different token hash — "do
not revoke other independently valid sessions unnecessarily" holds by
construction, not by a separate check. Revoking also clears that visitor's
active presence in any room whose last live connection was just closed
(reusing `leave()`'s own logic), so a stale stream can't keep renewing
presence via its own 10s keep-alive in the meantime, and reconnecting
afterward goes through the same `isMember` + capacity-checked
`markActive()` path a fresh connection always has.

**Cross-tab coherence** (client, `src/client/state/session-events.ts`): a
`localStorage` write on sign-out/account-switch fires the browser's native
`storage` event in every OTHER open tab of the same origin (never the tab
that wrote it) — no new dependency, no server round trip. The editor
(`store.ts`'s `start()`) and the lobby (`LobbyApp.tsx`) both listen, and
on notification the editor clears any held/selected tool and reloads the
room through the normal `start()` path, which re-resolves `selfId` and
re-runs the join-on-load check (ADR 0007) — so a tab left open under an
identity that just signed out somewhere else lands on the ordinary
access-denied screen if it's no longer entitled to that room, rather than
continuing to show (or let the player edit) state that belonged to the
identity it no longer has a session for. This is a UX nicety, not the
enforcement: a tab that misses the notification (storage disabled, private
browsing) is still refused server-side the next time it tries to mutate
anything, by the exact same session check every other request goes
through.

`spec/session-revocation.test.ts` covers sign-out, account-switching, a
stale session's direct mutation attempt, SSE reconnection, and a second
valid session remaining unaffected; `scripts/session-revocation.ts`
verifies the cross-tab behaviour through two real tabs of one browser
context.

## As built, corrected (independent review, 14 Oct 2026): guest recovery cannot bypass a password-protected account

A genuinely critical gap, found while checking the brief's explicit
instruction to "verify that guest recovery cannot become a weaker bypass
into a password-protected account": `createRecoveryCode` took only a
visitor id, with no check on whether that visitor was linked to an
account. A visitor signed in to a password-protected account could
generate a recovery code for THEMSELVES (the code mechanism has no notion
of accounts at all — by design, ADR 0006 — so nothing stopped this), and
redeeming that code from any other browser granted a full, authenticated
session for that visitor — and therefore full access to the account — with
**no password check whatsoever**. Reproduced directly: register an
account, call `POST /api/identity/recovery-code` on the same
already-signed-in cookie, redeem the returned code from a fresh browser
with no cookie at all, and `GET /api/me` on the result showed the full
account.

Fixed with two checks in `src/server/index.ts` (the only place both
`accounts.ts` and `identity.ts` are both visible, keeping the two modules'
clean separation intact rather than teaching `identity.ts` about
accounts):
- `POST /api/identity/recovery-code` refuses outright to generate a code
  for a visitor currently linked to an account.
- `POST /api/identity/recover` refuses to redeem a code that (even if it
  was generated before the account existed) resolves to an account-linked
  visitor, and separately refuses to redeem ANY code at all while the
  requesting browser's own current cookie is itself signed in to an
  account — closing a second, related gap: redeeming a guest code while
  signed in silently switched the browser's cookie away from the account
  with no sign-out, no migration-conflict warning, and no confirmation,
  exactly the kind of silent identity switch the two-step sign-in
  (above) exists to prevent.

The client (`LobbyApp.tsx`'s `IdentityPanel`) now shows a different,
explanatory message instead of the generate/redeem controls whenever the
browser is signed in, rather than letting the action fail server-side with
no warning first. `spec/friends-and-identity.test.ts` covers generating
while signed in, redeeming a now-account-linked code, and redeeming any
code while signed in; `scripts/guest-preservation.ts` verifies the fixed
Identity panel's copy and controls through a real browser.

## As built, added (independent review, 14 Oct 2026): an inline guest-identity preservation path before switching accounts

Section 4 of the review asked for "a usable preservation path using the
existing recovery mechanism" before a guest identity with real work is
switched away from — the original migration-conflict screen explained the
risk but only pointed at the separate "Identity and another device" panel
to do anything about it. `MigrationWarning`
(`src/client/lobby/Account.tsx`) now generates and displays a recovery
code for the CURRENT guest identity inline, on the same screen, before the
switch — the confirm button's own label changes ("I've saved my code —
continue signing in" vs. "Continue without saving a recovery code") so
skipping the step is a visible, deliberate choice rather than silent.
Sign-out and the account page explicitly confirm the return to guest mode
in words ("Signed out. This browser is back to its own guest identity"),
and both the account page and the lobby header now say "Guest mode"/
"Guest — sign in" rather than a bare "Sign in" with no stated current
status. `scripts/guest-preservation.ts` verifies the generated code
genuinely recovers the original guest identity's room on a separate
browser context afterward, end to end.

## Consequences

- ADR 0006's recovery-code mechanism is unchanged and still useful on its
  own: it links a second browser to the same visitor_id without requiring
  (or creating) an account at all — the two mechanisms solve overlapping
  but distinct problems (a one-time code needs no username/password to set
  up in advance; an account is memorable and reusable, but requires having
  registered first).
- **No password recovery in this phase.** There is no email on file and no
  password-reset flow; the account-registration screen says so plainly.
  The underlying visitor identity itself can still be recovered via ADR
  0006's existing code mechanism, independent of the account layer, but a
  forgotten account *password* has no recovery path. This is a named,
  accepted limitation, not a silently dropped requirement.
- Migration between two already-worked-in identities (case 2's resolution
  beyond showing the warning and refusing to auto-merge) is out of scope
  for this phase; a future pass could offer an explicit, confirmed
  "transfer this room to my account" action per room, rather than a bulk
  merge.
- `scripts/accounts.ts` is the browser-driven verification: registering
  preserves an existing room unchanged; the same account from an
  independent browser context reaches the same rooms; the migration
  conflict is shown, never silently resolved, and the pre-conflict
  identity's room is neither deleted nor reassigned; sign-out invalidates
  the session server-side; auth errors are non-enumerating; browsing needs
  no account at all. 13/13, reproduced across clean reruns.
