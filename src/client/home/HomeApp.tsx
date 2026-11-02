import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Account } from "../state/api.ts";
import { onIdentityChangedElsewhere } from "../state/session-events.ts";
import { AccountPanel } from "./tabletop/AccountPanel.tsx";
import { layoutFor, prefersReducedMotion, type Focus, type Layout } from "./tabletop/destinations.ts";
import { LinkList, QuickLinks } from "./tabletop/QuickLinks.tsx";

// The homepage (ADR 0014): a building table seen from a seat in front of it.
// three.js loads only once WebGL is known to work; until then, and if loading,
// rendering or the GPU context fails, the page is plain links (the fallback),
// never a blank canvas.
//
// Phase 1: the sign is the only working entrance. The focused view is in the
// URL (`/?focus=sign-in`), so Back closes it, Forward reopens it and a reload
// keeps it; `/build/?view=account` stays the account page it always was.

const TableScene = lazy(() => import("./tabletop/TableScene.tsx"));

type Status = "loading" | "ready" | "failed";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const focusFromUrl = (): Focus => (new URLSearchParams(location.search).get("focus") === "sign-in" ? "sign-in" : "overview");

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() => layoutFor(innerWidth, innerHeight));
  useEffect(() => {
    const on = () => setLayout(layoutFor(innerWidth, innerHeight));
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return layout;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Who the sign should greet, without creating anyone: /api/me/peek reads an
 * existing cookie only (the cookie is HttpOnly, so the page can't look).
 * After that, the account panel reports sign-ins and sign-outs as they happen.
 */
function useSignedInName(): [string | null, (a: Account | null) => void] {
  const [name, setName] = useState<string | null>(null);
  const peek = useCallback(() => {
    fetch("/api/me/peek", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { account: { displayName: string } | null } | null) => setName(r?.account?.displayName ?? null))
      .catch(() => {});
  }, []);
  useEffect(peek, []);
  useEffect(() => onIdentityChangedElsewhere(peek), []);
  return [name, (a) => setName(a?.displayName ?? null)];
}

export function HomeApp() {
  const [status, setStatus] = useState<Status>(() => (webglAvailable() ? "loading" : "failed"));
  const [focus, setFocus] = useState<Focus>(focusFromUrl);
  // the focus the camera last reached; the panel shows only once it matches
  const [arrived, setArrived] = useState<Focus | null>(null);
  const layout = useLayout();
  const reducedMotion = useReducedMotion();
  const [name, setAccount] = useSignedInName();
  const signButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onPop = () => setFocus(focusFromUrl());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // Loading that never finishes (a stalled chunk, a GPU that never draws)
  // gives way to the plain links rather than an empty table forever.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setStatus((s) => (s === "loading" ? "failed" : s)), 15000);
    return () => clearTimeout(t);
  }, [status]);

  const go = (next: Focus) => {
    if (next === focus) return;
    setArrived(null);
    setFocus(next);
    const url = next === "overview" ? location.pathname : `${location.pathname}?focus=${next}`;
    if (next === "overview" && history.state?.tableFocus) history.back();
    else history.pushState({ tableFocus: next }, "", url);
  };

  const onArrive = useCallback((f: Focus) => setArrived(f), []);
  const closeFocus = useCallback(() => go("overview"), [focus]);
  const panelOpen = status === "ready" && focus === "sign-in" && arrived === "sign-in";
  const signLabel = name ? name : "Sign in";
  const signHint = name ? "Signed in" : "or build as a guest";

  if (status === "failed") return <Fallback signedInAs={name} />;

  return (
    <div className={`table-page${focus !== "overview" ? " is-focused" : ""}`} data-status={status}>
      <div className="table-stage" inert={panelOpen || undefined}>
        <SceneBoundary onError={() => setStatus("failed")}>
          <Suspense fallback={null}>
            <TableScene
              focus={focus}
              layout={layout}
              reducedMotion={reducedMotion}
              onArrive={onArrive}
              onActivateSignIn={() => go("sign-in")}
              signLabel={signLabel}
              signHint={signHint}
              signButtonRef={signButton}
              onReady={() => setStatus((s) => (s === "loading" ? "ready" : s))}
              onContextLost={() => setStatus("failed")}
            />
          </Suspense>
        </SceneBoundary>
      </div>

      {status === "loading" && (
        <div className="table-loading" role="status">
          <p>Setting out the table…</p>
          <LinkList className="loading-links" />
        </div>
      )}

      <header className="table-corner" inert={panelOpen || undefined}>
        <a className="table-brand" href="/" aria-label="Brick Commons (working title): home">
          Brick Commons
        </a>
        <QuickLinks hidden={status !== "ready"} />
      </header>

      {status === "ready" && focus === "overview" && (
        <p className="table-intro" inert={panelOpen || undefined}>
          A shared table for building with bricks, alone or with someone else. <span className="table-intro-hint">Choose the sign to sign in, or use Quick links.</span>
        </p>
      )}

      {panelOpen && <AccountPanel onClose={closeFocus} onAccountChange={setAccount} returnFocus={signButton} signedIn={!!name} />}

      <p className="table-legal">An independent student project. Not made, sponsored or endorsed by the LEGO Group.</p>
    </div>
  );
}

/** Plain links to every core function: no WebGL, a failed load, or a lost GPU context. */
export function Fallback({ signedInAs }: { signedInAs: string | null }) {
  return (
    <main className="fallback">
      <div className="fallback-card">
        <h1>Brick Commons</h1>
        <p className="fallback-lede">A shared table for building with bricks, alone or with someone else. The 3D table couldn't be shown on this device, so here is everything it leads to.</p>
        <p>
          <a className="btn btn-red" href="/build/?view=account">
            {signedInAs ? `Signed in as ${signedInAs}` : "Sign in or create an account"}
          </a>
        </p>
        <LinkList />
        <p className="fallback-note">You never need an account to build.</p>
      </div>
    </main>
  );
}
