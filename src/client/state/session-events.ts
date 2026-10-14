// Cross-tab notification for "the signed-in identity just changed" (sign-out
// or an account switch via Account.tsx) — regression review, 14 Oct 2026:
// "other tabs in the same browser must handle logout/account changes
// coherently: stop stale editing and refresh authentication state." A plain
// `localStorage` write is the standard, dependency-free way to reach every
// other same-origin tab: the `storage` event fires in every OTHER tab that
// has this origin open (never the tab that wrote it), with no server round
// trip and no new library. This is a UX nicety only — the server is the
// actual enforcement (ADR 0007/0010: every mutation re-checks the acting
// session's current room admission), so a tab that misses this event for any
// reason (storage disabled, private browsing) is still refused server-side
// the next time it tries to act; it just finds out a little later.

const KEY = "brick-identity-changed";

/** Call after a sign-out or a completed account switch, so every other open tab of this origin can refresh its own authentication state. */
export function broadcastIdentityChange(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage unavailable (private browsing, disabled, quota) — no cross-tab
    // nicety this time, but nothing silently breaks: see the note above
  }
}

/** Calls `onChange` whenever another tab of this origin calls `broadcastIdentityChange()`. Returns an unsubscribe function. */
export function onIdentityChangedElsewhere(onChange: () => void): () => void {
  const handler = (e: StorageEvent): void => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
