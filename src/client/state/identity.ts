// Establishes this browser's identity before anything that depends on it
// (ADR 0006/0013, corrected 20 Oct 2026).
//
// The cookie is created by the server, on whichever request first arrives
// without one, and it is HttpOnly, so the page can't see it. Before this, a
// first visit to the lobby sent four requests at once with no cookie; each
// made a visitor, and the browser kept whichever cookie came back last. The
// page could then show one identity as "you" while its later requests ran as
// another, and anything made in between (a friend link, a room, membership,
// a saved copy) could belong to an identity the browser no longer held.
//
// The rule now: one request (`GET /api/me`) establishes or resolves the
// identity; only after its response has arrived, so the browser has stored
// any new cookie, do identity-dependent requests or the realtime stream
// start. The server stays the authority: this only orders requests, and
// never reads, invents or stores an identity itself.
//
// Within a page, concurrent callers share one in-flight promise. Across tabs
// of one browser, the request runs under a Web Lock, so two tabs opened at
// once on a first visit can't each create a visitor: the second waits, and
// its request then carries the first tab's cookie (the cookie jar is shared).
// Without Web Locks (very old browsers) only the in-page ordering applies.

export interface Me {
  visitorId: string;
  account: { id: string; username: string; displayName: string } | null;
}

/** Thrown when the identity request fails or times out; the caller shows a retry. */
export class IdentityError extends Error {}

const LOCK = "brick-identity";
const TIMEOUT_MS = 10_000;

let current: Promise<Me> | null = null;

async function request(): Promise<Me> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", signal: ctrl.signal });
    if (!res.ok) throw new IdentityError(`couldn't start your session (HTTP ${res.status})`);
    return (await res.json()) as Me;
  } catch (e) {
    if (e instanceof IdentityError) throw e;
    throw new IdentityError(ctrl.signal.aborted ? "starting your session took too long" : "couldn't reach the server to start your session");
  } finally {
    clearTimeout(timer);
  }
}

function locked(): Promise<Me> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  // the lock is released when the callback settles, success or failure, and
  // the request inside it is bounded by TIMEOUT_MS, so no tab waits forever
  return locks ? (locks.request(LOCK, request) as Promise<Me>) : request();
}

/**
 * Resolves once this browser has an identity the server recognises, with
 * who it is. Concurrent callers share one request. A failure is not cached:
 * the next call tries again.
 */
export function ensureIdentity(): Promise<Me> {
  if (!current) {
    const attempt = locked();
    current = attempt;
    attempt.catch(() => {
      if (current === attempt) current = null;
    });
  }
  return current;
}

/**
 * Forget the cached answer after something on this page changed who the
 * browser is (sign-in, sign-out, recovery) or another tab reported it. The
 * response that changed it already carried the new cookie, so the next
 * `ensureIdentity()` re-asks the server rather than trusting a stale "you".
 */
export function resetIdentity(): void {
  current = null;
}
