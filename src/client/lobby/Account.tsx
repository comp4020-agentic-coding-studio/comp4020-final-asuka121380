import { useEffect, useState } from "react";
import { confirmSignIn, createRecoveryCode, migrationCheck, register, signIn, signOut, whoAmI, type Account, type RegisterCode } from "../state/api.ts";
import { broadcastIdentityChange } from "../state/session-events.ts";

// Explicit accounts (phase 2 corrective review, author-approved scope
// change): a real, visible registration/sign-in flow, replacing browser
// cookies as the PRIMARY way to reach the same rooms/friends/collection on
// another device. An account is layered over the existing anonymous-visitor
// model (ADR 0006/0007) rather than replacing it: every room, friendship
// and snapshot a visitor already has stays reachable exactly as before,
// whether or not that visitor is ever linked to an account.
//
// Browsing stays lightweight: this page is the only place sign-in is ever
// required or even suggested. The showcase, public lobby and read-only
// snapshot viewer never gate on it.

const REGISTER_MESSAGE: Record<RegisterCode, string> = {
  username_taken: "That username is already taken.",
  invalid_username: "Usernames are 3-24 letters, numbers, underscores or hyphens, starting with a letter or number.",
  weak_password: "Use a password of at least 8 characters.",
  already_linked: "This browser is already signed in to an account.",
};

type Mode = "loading" | "signed-in" | "choose" | "register" | "sign-in" | "migration-warning";

function RegisterForm({ onDone, onBack }: { onDone: (account: Account) => void; onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await register(username.trim(), password, displayName.trim() || username.trim());
    setBusy(false);
    if (!r.ok || !r.account) {
      setError(r.code ? REGISTER_MESSAGE[r.code] : r.message ?? "Couldn't register; try again.");
      return;
    }
    onDone(r.account);
  };

  return (
    <div className="card lobby-card">
      <h2>Create an account</h2>
      <p className="lobby-hint">
        This browser's current rooms, friends and saved versions stay exactly where they are — registering makes them
        reachable by signing in, from this browser or another one.
      </p>
      <label className="field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={24} />
      </label>
      <label className="field">
        <span>Display name (shown to other players)</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder={username || "e.g. Sam"} />
      </label>
      <label className="field">
        <span>Password (at least 8 characters)</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      {error && <p className="lobby-error" role="alert">{error}</p>}
      <div className="context-actions">
        <button className="btn btn-red" onClick={() => void submit()} aria-disabled={busy || !username.trim() || password.length < 8}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </div>
      <p className="lobby-hint fineprint">
        There is no email on file and no password-reset email. If you forget your password, there is no way to recover this
        specific account's login in this version — keep it somewhere safe. (Your underlying browser identity itself can
        still be recovered with a one-time code from the "Identity and another device" panel, independent of this
        account.)
      </p>
    </div>
  );
}

function SignInForm({ onDone, onBack }: { onDone: (username: string, password: string, priorHadOwnWork: boolean) => void; onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const u = username.trim();
    const r = await signIn(u, password);
    setBusy(false);
    if (!r.ok || !r.account) {
      setError(r.message ?? "Incorrect username or password.");
      return;
    }
    // the password is kept only in memory, only long enough to call
    // confirmSignIn next (immediately, or after the conflict screen) — it
    // is never stored, logged or put anywhere but this one follow-up request
    onDone(u, password, !!r.priorHadOwnWork);
  };

  return (
    <div className="card lobby-card">
      <h2>Sign in</h2>
      <label className="field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
      </label>
      {error && <p className="lobby-error" role="alert">{error}</p>}
      <div className="context-actions">
        <button className="btn btn-red" onClick={() => void submit()} aria-disabled={busy || !username.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

/**
 * Shown before a sign-in would switch this browser away from a guest
 * identity that has rooms, friendships or saved versions of its own (the
 * brief: "before switching away from a guest identity with meaningful
 * work, provide a usable preservation path using the existing recovery
 * mechanism"). Generating the code is done right here, inline — not a
 * pointer to go find the "Identity and another device" panel elsewhere —
 * and the code stays visible on screen through the switch, since the
 * player needs it on the OTHER device, not this one, to actually recover
 * the guest identity later.
 */
function MigrationWarning({
  pending,
  confirmError,
  onConfirm,
  onCancel,
}: {
  pending: { username: string; password: string };
  confirmError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    const r = await createRecoveryCode();
    setGenerating(false);
    setCode(r.code);
  };

  return (
    <div className="card lobby-card">
      <h2>This browser has other work</h2>
      <p className="lobby-hint">
        This browser is currently a <strong>guest identity</strong> with rooms, friendships or saved versions of its own.
        Signing in as <strong>{pending.username}</strong> will switch this browser to that account instead.
      </p>
      <p className="lobby-hint">
        <strong>Nothing is deleted</strong> — that guest identity's work stays exactly where it is. But once you switch,{" "}
        <strong>this browser will no longer reach it</strong>: having the data exist somewhere is not the same as this
        browser being able to get back to it. The only way back is a one-time recovery code, generated for THIS guest
        identity, entered on whichever browser you want to recover it on.
      </p>
      {!code ? (
        <div className="context-actions">
          <button className="btn" onClick={() => void generate()} aria-disabled={generating}>
            {generating ? "Generating…" : "Generate a recovery code for this guest identity first"}
          </button>
        </div>
      ) : (
        <div className="field-row">
          <input readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Recovery code for this guest identity" />
        </div>
      )}
      {code && (
        <p className="lobby-hint fineprint">
          Copy this somewhere safe now — it only works once, and it won't be shown again. Enter it from any browser's
          "Identity and another device" panel to reach this guest identity's rooms, friends and saved versions again.
        </p>
      )}
      {confirmError && <p className="lobby-error">{confirmError}</p>}
      <div className="context-actions">
        <button className="btn btn-red" onClick={onConfirm}>
          {code ? "I've saved my code — continue signing in" : "Continue without saving a recovery code"}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel and stay as I was
        </button>
      </div>
    </div>
  );
}

export function AccountPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [migration, setMigration] = useState<{ hasOwnWork: boolean; alreadyLinked: boolean } | null>(null);
  // the verified-but-not-yet-confirmed credentials, held only long enough
  // to either confirm immediately (no conflict) or show the warning and
  // confirm after an explicit choice — never stored beyond this page's life
  const [pending, setPending] = useState<{ username: string; password: string } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const refresh = () =>
    void whoAmI().then((r) => {
      setAccount(r.account);
      if (r.account) {
        setMode("signed-in");
      } else {
        void migrationCheck().then((m) => {
          setMigration(m);
          setMode("choose");
        });
      }
    });
  useEffect(refresh, []);

  const afterRegister = (a: Account) => {
    setAccount(a);
    setMode("signed-in");
  };

  const finishSignIn = async (username: string, password: string) => {
    const r = await confirmSignIn(username, password);
    setPending(null);
    if (!r.ok || !r.account) {
      setConfirmError(r.message ?? "Couldn't sign in; try again.");
      setMode("sign-in");
      return;
    }
    setAccount(r.account);
    setMode("signed-in");
    // this browser's identity just changed (this tab's own cookie is
    // already up to date; every OTHER open tab needs to notice and refresh
    // its own authentication state, stopping any stale editing under the
    // identity that was just switched away from)
    broadcastIdentityChange();
  };

  const afterSignIn = (username: string, password: string, priorHadOwnWork: boolean) => {
    if (priorHadOwnWork) {
      setPending({ username, password });
      setMode("migration-warning");
      return;
    }
    void finishSignIn(username, password);
  };

  const [justSignedOut, setJustSignedOut] = useState(false);

  const doSignOut = async () => {
    await signOut();
    setAccount(null);
    setPending(null);
    setJustSignedOut(true);
    broadcastIdentityChange();
    refresh();
  };

  if (mode === "loading") return <div className="card lobby-card"><p className="lobby-hint">Loading…</p></div>;

  if (mode === "migration-warning" && pending) {
    return <MigrationWarning pending={pending} confirmError={confirmError} onConfirm={() => void finishSignIn(pending.username, pending.password)} onCancel={() => { setPending(null); setMode("choose"); }} />;
  }

  if (mode === "signed-in" && account) {
    return (
      <div className="card lobby-card">
        <h2>
          Account <span className="tag room-tag">Signed in</span>
        </h2>
        <p className="lobby-hint">
          Signed in as <strong>{account.displayName}</strong> (<code>{account.username}</code>). Your rooms, friends and
          collection are reachable from here, and from anywhere else you sign in with this same account.
        </p>
        <button className="btn" onClick={() => void doSignOut()}>
          Sign out
        </button>
      </div>
    );
  }

  if (mode === "register") return <RegisterForm onDone={afterRegister} onBack={() => setMode("choose")} />;
  if (mode === "sign-in") return <SignInForm onDone={afterSignIn} onBack={() => setMode("choose")} />;

  return (
    <div className="card lobby-card">
      <h2>
        Account <span className="tag room-tag room-tag-muted">Guest mode</span>
      </h2>
      {justSignedOut && (
        <p className="lobby-hint" role="status">
          Signed out. This browser is back to its own guest identity — no account's details are shown here anymore.
        </p>
      )}
      <p className="lobby-hint">
        You don't need an account to build, save or publish — this browser is a <strong>guest identity</strong>
        {migration?.hasOwnWork ? " with rooms, friends or saved versions of its own" : ", with nothing saved yet"}. An
        account just lets you reach the same rooms, friends and collection from another browser or device, by signing in
        rather than copying a recovery code.
      </p>
      <div className="context-actions">
        <button className="btn btn-red" onClick={() => setMode("register")}>
          Create an account
        </button>
        <button className="btn" onClick={() => setMode("sign-in")}>
          Sign in
        </button>
      </div>
    </div>
  );
}
