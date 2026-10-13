import { useEffect, useState } from "react";
import { confirmSignIn, migrationCheck, register, signIn, signOut, whoAmI, type Account, type RegisterCode } from "../state/api.ts";

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
  };

  const afterSignIn = (username: string, password: string, priorHadOwnWork: boolean) => {
    if (priorHadOwnWork) {
      setPending({ username, password });
      setMode("migration-warning");
      return;
    }
    void finishSignIn(username, password);
  };

  const doSignOut = async () => {
    await signOut();
    setAccount(null);
    setPending(null);
    refresh();
  };

  if (mode === "loading") return <div className="card lobby-card"><p className="lobby-hint">Loading…</p></div>;

  if (mode === "migration-warning" && pending) {
    return (
      <div className="card lobby-card">
        <h2>This browser has other work</h2>
        <p className="lobby-hint">
          This browser is currently reaching a different, anonymous identity with its own rooms, friendships or saved
          versions. Signing in as <strong>{pending.username}</strong> will switch this browser to that account instead.
        </p>
        <p className="lobby-hint">
          <strong>Nothing is deleted.</strong> That anonymous identity's work stays exactly where it is in the database —
          this browser just won't have a cookie pointing at it anymore, unless you already generated (or now generate) a
          recovery code for it from the "Identity and another device" panel, <em>before</em> continuing.
        </p>
        {confirmError && <p className="lobby-error">{confirmError}</p>}
        <div className="context-actions">
          <button className="btn btn-red" onClick={() => void finishSignIn(pending.username, pending.password)}>
            I understand, continue signing in
          </button>
          <button
            className="btn"
            onClick={() => {
              setPending(null);
              setMode("choose");
            }}
          >
            Cancel and stay as I was
          </button>
        </div>
      </div>
    );
  }

  if (mode === "signed-in" && account) {
    return (
      <div className="card lobby-card">
        <h2>Account</h2>
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
      <h2>Account</h2>
      <p className="lobby-hint">
        You don't need an account to build, save or publish — this browser already has its own identity
        {migration?.hasOwnWork ? ", with rooms, friends or saved versions of its own" : ""}. An account just lets you reach
        the same rooms, friends and collection from another browser or device, by signing in rather than copying a
        recovery code.
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
