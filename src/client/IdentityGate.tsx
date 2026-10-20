import { useEffect, useState, type ReactNode } from "react";
import { ensureIdentity } from "./state/identity.ts";

// Renders its children only once this browser's identity is established
// (state/identity.ts), so nothing a page mounts can send an identity-
// dependent request, or open a realtime stream, before the cookie exists.
// A failure shows a retry, never a page acting as an uncertain identity.

type Status = { kind: "waiting" } | { kind: "ready" } | { kind: "failed"; message: string };

export function IdentityGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: "waiting" });

  const attempt = () => {
    setStatus({ kind: "waiting" });
    ensureIdentity().then(
      () => setStatus({ kind: "ready" }),
      (e: unknown) => setStatus({ kind: "failed", message: e instanceof Error ? e.message : "couldn't start your session" }),
    );
  };
  useEffect(attempt, []);

  if (status.kind === "ready") return <>{children}</>;
  return (
    <div className="access-screen identity-gate">
      <div className="card access-card" role={status.kind === "failed" ? "alert" : "status"}>
        {status.kind === "waiting" ? (
          <p>Starting your session…</p>
        ) : (
          <>
            <h1>Couldn't start your session</h1>
            <p>{status.message.charAt(0).toUpperCase() + status.message.slice(1)}. Nothing was changed.</p>
            <button className="btn btn-red" onClick={attempt}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
