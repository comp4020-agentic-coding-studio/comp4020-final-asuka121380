import { Component, createRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { IdentityGate } from "../IdentityGate.tsx";
import type { Account } from "../state/api.ts";
import { onIdentityChangedElsewhere } from "../state/session-events.ts";
import { AccountPanel } from "./tabletop/AccountPanel.tsx";
import { ENTRANCES, isEntrance, layoutFor, prefersReducedMotion, type Entrance, type Focus, type Layout } from "./tabletop/focus.ts";
import { LinkList, QuickLinks } from "./tabletop/QuickLinks.tsx";
import { TablePanel } from "./tabletop/TablePanel.tsx";

// The homepage (ADR 0014): a building table seen from a seat in front of it.
// three.js loads only once WebGL is known to work; until then, and if loading,
// rendering or the GPU context fails, the page is plain links (the fallback),
// never a blank canvas.
//
// Six objects are entrances. Choosing one moves the camera to it; its panel
// opens once the camera has arrived; "Back to table", Escape or browser Back
// return. The focused view is in the URL (`/?focus=rooms`), so Back closes
// it, Forward reopens it and a reload or a shared link opens it directly.
// Short tasks are completed at the table (account, choosing how to build,
// joining, friends and invitations); browsing the collection and showcase,
// and reading about the project, are pages of their own. The booklet's
// approach leads straight on to /readme/.

const TableScene = lazy(() => import("./tabletop/TableScene.tsx"));
// the panels share the lobby's components; loaded when a panel first opens
const Panels = lazy(() => import("./tabletop/panels.tsx").then((m) => ({ default: m.PanelBody })));

type Status = "loading" | "ready" | "failed";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const focusFromUrl = (): Focus => {
  const f = new URLSearchParams(location.search).get("focus");
  return isEntrance(f) ? f : "overview";
};

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
 * Who the sign should greet, and how many room invitations are waiting,
 * without creating anyone: /api/me/peek reads an existing cookie only (the
 * cookie is HttpOnly, so the page can't look). After that, the panels report
 * changes as they happen.
 */
function usePeek(): { name: string | null; invitations: number; setAccount: (a: Account | null) => void; setInvitations: (n: number) => void } {
  const [name, setName] = useState<string | null>(null);
  const [invitations, setInvitations] = useState(0);
  const refresh = useCallback(() => {
    fetch("/api/me/peek", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { account: { displayName: string } | null; invitations?: number } | null) => {
        setName(r?.account?.displayName ?? null);
        setInvitations(r?.invitations ?? 0);
      })
      .catch(() => {});
  }, []);
  useEffect(refresh, []);
  useEffect(() => onIdentityChangedElsewhere(refresh), []);
  return { name, invitations, setAccount: (a) => setName(a?.displayName ?? null), setInvitations };
}

type PanelEntrance = Exclude<Entrance, "sign-in" | "about">;
const PANELS: Record<PanelEntrance, { title: string; tone: "red" | "blue" | "yellow"; wide?: boolean }> = {
  scenes: { title: "Choose a scene", tone: "blue" },
  rooms: { title: "Join a room", tone: "blue", wide: true },
  friends: { title: "Friends and invitations", tone: "yellow" },
  shelf: { title: "Our creations", tone: "red" },
};

export function HomeApp() {
  const [status, setStatus] = useState<Status>(() => (webglAvailable() ? "loading" : "failed"));
  const [focus, setFocus] = useState<Focus>(focusFromUrl);
  // the focus the camera last reached; a panel shows only once it matches
  const [arrived, setArrived] = useState<Focus | null>(null);
  const layout = useLayout();
  const reducedMotion = useReducedMotion();
  const peek = usePeek();
  const refs = useMemo(() => Object.fromEntries(ENTRANCES.map((e) => [e.focus, createRef<HTMLButtonElement>()])) as unknown as Record<Entrance, RefObject<HTMLButtonElement | null>>, []);

  // What the page means to show, updated the moment a choice is made. Closing
  // a panel goes back through history (so entries never double), and that
  // back arrives later as a popstate. A choice made in between — "Back to
  // table", then at once another object — must not be undone by it: the
  // popstate we caused only confirms the overview, and a newer choice is
  // pushed again on top of it (reproduced: evidence 0017).
  const intended = useRef<Focus>(focus);
  const ownBack = useRef(false);
  useEffect(() => {
    const onPop = () => {
      if (ownBack.current) {
        ownBack.current = false;
        if (intended.current !== "overview") history.pushState({ tableFocus: intended.current }, "", `${location.pathname}?focus=${intended.current}`);
        return;
      }
      // the browser's own Back or Forward: follow the URL
      const f = focusFromUrl();
      intended.current = f;
      setArrived(null);
      setFocus(f);
    };
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

  // the booklet: once the camera is over its pages, go on to the README
  const leaving = useRef(false);
  useEffect(() => {
    if (status !== "ready" || focus !== "about" || arrived !== "about" || leaving.current) return;
    leaving.current = true;
    // replace, so Back from the README returns to the table, not to an
    // approach that would immediately leave again
    history.replaceState(null, "", location.pathname);
    location.assign("/readme/");
  }, [status, focus, arrived]);

  // The user's latest choice always wins. The camera retargets from wherever
  // it is; the panel opens only when it reaches this choice.
  const go = useCallback((next: Focus) => {
    if (next === intended.current) return;
    const from = intended.current;
    intended.current = next;
    setArrived(null);
    setFocus(next);
    if (ownBack.current) {
      // our back is still on its way; its popstate will settle the URL
      return;
    }
    if (next === "overview") {
      if (history.state?.tableFocus) {
        ownBack.current = true;
        history.back();
      } else history.pushState(null, "", location.pathname);
    } else if (from !== "overview" && history.state?.tableFocus) {
      // straight from one object to another: one entry for the table's focus
      history.replaceState({ tableFocus: next }, "", `${location.pathname}?focus=${next}`);
    } else {
      history.pushState({ tableFocus: next }, "", `${location.pathname}?focus=${next}`);
    }
  }, []);

  const onArrive = useCallback((f: Focus) => setArrived(f), []);
  const closeFocus = useCallback(() => go("overview"), [go]);
  const panelOpen = status === "ready" && focus !== "overview" && focus !== "about" && arrived === focus;
  const signLabel = peek.name ? peek.name : "Sign in";
  const signHint = peek.name ? "Signed in" : "or build as a guest";

  if (status === "failed") return <Fallback signedInAs={peek.name} />;

  return (
    <div className={`table-page${focus !== "overview" ? " is-focused" : ""}`} data-status={status} data-focus={focus}>
      <div className="table-stage" inert={panelOpen || undefined}>
        <SceneBoundary onError={() => setStatus("failed")}>
          <Suspense fallback={null}>
            <TableScene
              focus={focus}
              layout={layout}
              reducedMotion={reducedMotion}
              onArrive={onArrive}
              onActivate={go}
              signLabel={signLabel}
              signHint={signHint}
              invitations={peek.invitations}
              entranceRefs={refs}
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
          A shared table for building with bricks, alone or with someone else. <span className="table-intro-hint">Choose something on the table, or use Quick links.</span>
        </p>
      )}
      {status === "ready" && focus === "about" && (
        <p className="table-intro" role="status">
          Opening the booklet…
        </p>
      )}

      {panelOpen && focus === "sign-in" && <AccountPanel onClose={closeFocus} onAccountChange={peek.setAccount} returnFocus={refs["sign-in"]} signedIn={!!peek.name} />}
      {panelOpen && focus !== "sign-in" && (
        <TablePanel id={`${focus}-panel`} title={PANELS[focus].title} tone={PANELS[focus].tone} wide={PANELS[focus].wide} onClose={closeFocus} returnFocus={refs[focus]}>
          {/* the first identity-dependent act on the homepage: the same gate the lobby uses */}
          <IdentityGate>
            <Suspense fallback={<p className="kit-state">Loading…</p>}>
              <Panels which={focus} onInvitations={peek.setInvitations} />
            </Suspense>
          </IdentityGate>
        </TablePanel>
      )}

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
