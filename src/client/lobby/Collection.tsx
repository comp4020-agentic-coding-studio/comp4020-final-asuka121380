import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Placement } from "../../domain/rules.ts";
import { sceneInfo } from "../scenes/registry.ts";
import { ensureIdentity } from "../state/identity.ts";
import {
  collectSnapshot,
  continueSnapshot,
  getSnapshot,
  mySnapshots,
  publishSnapshot,
  sendFriendRequest,
  showcaseEntry,
  showcaseList,
  type ShowcaseEntry,
  type SnapshotDetail,
  type SnapshotSummary,
} from "../state/api.ts";
import { useDisplayNames, who } from "../state/names.ts";
import { creationSvg } from "../ui/creationPreview.ts";
import { EmptyState, PageHead } from "./Shell.tsx";

// The collection (a visitor's own saved versions) and the public showcase
// (ADR 0009), as display pages in the workshop (ADR 0014): each creation on
// a small stage with its label underneath. A card's picture is drawn from
// the version's real parts as a flat isometric sketch (ui/creationPreview),
// so a page of creations never starts a 3D scene per card; opening one
// shows the full, read-only 3D view. "Continue" creates a new, independent
// room from a version, taking the visitor straight there. Nothing here ever
// modifies the source room or version: every save and continue is a fresh
// copy, read by id, never referenced live.

const SnapshotView = lazy(() => import("../scene/SnapshotView.tsx").then((m) => ({ default: m.SnapshotView })));

const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const timeOf = (iso: string): string => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const sceneTitle = (sceneId: string): string => sceneInfo(sceneId)?.title ?? "A scene";

function partsOf(detail: SnapshotDetail): Placement[] {
  return detail.parts.map((p) => ({ partId: p.partId, x: p.x, y: p.y, z: p.z, rot: p.rot as Placement["rot"], colour: p.colour }));
}

// ---- details for cards, a few at a time -------------------------------------------

/**
 * Loads one version's details for its card (its parts for the picture, its
 * contributors for the label). Requests are queued a few at a time, so a long
 * collection never fires dozens of requests at once.
 */
const queue: (() => Promise<void>)[] = [];
let running = 0;
function enqueue(job: () => Promise<void>): void {
  queue.push(job);
  const next = () => {
    while (running < 4 && queue.length) {
      const j = queue.shift()!;
      running++;
      void j().finally(() => {
        running--;
        next();
      });
    }
  };
  next();
}

function useDetail(load: () => Promise<SnapshotDetail>, key: string): SnapshotDetail | null | "failed" {
  const [detail, setDetail] = useState<SnapshotDetail | null | "failed">(null);
  useEffect(() => {
    let live = true;
    enqueue(() =>
      load().then(
        (d) => {
          if (live) setDetail(d);
        },
        () => {
          if (live) setDetail("failed");
        },
      ),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return detail;
}

/** The picture on a card's stage: the version's real parts, or an honest note. */
function Stage({ detail, label }: { detail: SnapshotDetail | null | "failed"; label: string }) {
  const svg = useMemo(() => (detail && detail !== "failed" ? creationSvg(detail.parts, label) : null), [detail, label]);
  return (
    <div className="creation-stage">
      {detail === null ? (
        <p className="kit-fine">Loading the picture…</p>
      ) : detail === "failed" ? (
        <p className="kit-fine">The picture couldn't be loaded.</p>
      ) : svg ? (
        <span className="creation-picture" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="kit-fine">An empty plot: nothing was placed yet.</p>
      )}
    </div>
  );
}

/** Who built it, as names, never counted or ranked. */
function Builders({ detail, selfId }: { detail: SnapshotDetail | null | "failed"; selfId: string | null }) {
  const ids = detail && detail !== "failed" ? [...detail.contributors, ...detail.inheritedCredits].map((c) => c.visitorId) : [];
  const names = useDisplayNames(ids);
  if (!detail || detail === "failed") return null;
  if (detail.contributors.length === 0) return <p className="creation-meta">No parts placed yet.</p>;
  const shown = detail.contributors.map((c) => who(c.visitorId, selfId, names)).filter(Boolean);
  return (
    <p className="creation-meta">
      Built by {shown.join(", ")}
      {detail.inheritedCredits.length > 0 && <> · continued from an earlier version</>}
    </p>
  );
}

// ---- one saved or published version ------------------------------------------------

/** Who built what, kept distinct: publisher / contributors to this version / inherited source credits are never merged (the brief). */
function Credits({ detail, publishedBy, selfId, onFriend }: { detail: SnapshotDetail; publishedBy?: string; selfId: string | null; onFriend: (id: string) => void }) {
  const ids = [publishedBy, detail.savedBy, ...detail.contributors.map((c) => c.visitorId), ...detail.inheritedCredits.map((c) => c.visitorId)].filter(
    (id): id is string => !!id,
  );
  const names = useDisplayNames(ids);
  const FriendButton = ({ id }: { id: string }) =>
    id !== selfId ? (
      <button className="btn btn-small" onClick={() => onFriend(id)} title="Send a friend request" aria-label={`Send ${who(id, selfId, names)} a friend request`}>
        + friend
      </button>
    ) : null;
  return (
    <div className="credits">
      {publishedBy && (
        <p>
          <strong>Published by</strong> {who(publishedBy, selfId, names)} <FriendButton id={publishedBy} />
        </p>
      )}
      <p>
        <strong>Saved by</strong> {who(detail.savedBy, selfId, names)} {detail.savedBy !== publishedBy && <FriendButton id={detail.savedBy} />}
      </p>
      <p>
        <strong>Contributors to this version</strong>{" "}
        {detail.contributors.length === 0 ? (
          "no one has placed a part yet"
        ) : (
          <span className="credit-list">
            {detail.contributors.map((c) => (
              <span key={c.visitorId} className="credit-chip">
                {who(c.visitorId, selfId, names)} <FriendButton id={c.visitorId} />
              </span>
            ))}
          </span>
        )}
      </p>
      {detail.inheritedCredits.length > 0 && (
        <p>
          <strong>Also credited from an earlier version</strong>{" "}
          <span className="credit-list">
            {detail.inheritedCredits.map((c) => (
              <span key={c.visitorId} className="credit-chip">
                {who(c.visitorId, selfId, names)} <FriendButton id={c.visitorId} />
              </span>
            ))}
          </span>
        </p>
      )}
      {detail.sourceSnapshotId && (
        <p className="kit-fine">
          Continued from <a href={`/build/?snapshot=${detail.sourceSnapshotId}`}>an earlier saved version</a>.
        </p>
      )}
    </div>
  );
}

function ContinueControls({ detail, onContinued }: { detail: SnapshotDetail; onContinued: (roomId: string) => void }) {
  const [visibility, setVisibility] = useState<"public" | "invite_only">("invite_only");
  const [allowPublish, setAllowPublish] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const go = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const room = await continueSnapshot(detail.id, visibility, allowPublish);
      // the server clamps a restricted version's lineage to invite-only,
      // non-publishable regardless of what was asked for; say so if it did
      if (room.visibility !== visibility || room.allowPublish !== allowPublish) {
        setStatus("This version's publication restriction carried over, so the new room is invite-only and not publishable.");
        setTimeout(() => onContinued(room.roomId), 1200);
        return;
      }
      onContinued(room.roomId);
    } catch {
      setError("Couldn't start the new room. Nothing was created; try again.");
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="continue-box">
      <h3>Continue this version</h3>
      <p className="lobby-hint">Starts a brand-new, independent room from exactly what's shown here. The saved version itself never changes.</p>
      <fieldset className="field">
        <legend>Who can join the new room</legend>
        <label className="radio-row">
          <input type="radio" name="continue-visibility" checked={visibility === "public"} onChange={() => { setVisibility("public"); setAllowPublish(true); }} />
          <span>
            <strong>Public</strong> — anyone can join while there's room
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="continue-visibility" checked={visibility === "invite_only"} onChange={() => { setVisibility("invite_only"); setAllowPublish(false); }} />
          <span>
            <strong>Invite-only</strong> — only people you invite
          </span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={allowPublish} onChange={(e) => setAllowPublish(e.target.checked)} />
        <span>Let any member publish a saved copy of the new room</span>
      </label>
      {error && <p className="lobby-error" role="alert">{error}</p>}
      <div className="kit-actions">
        <button className="btn btn-red" onClick={() => void go()} aria-disabled={busy}>
          {busy ? "Creating…" : "Continue in a new room"}
        </button>
        <span className="kit-fine">Opens the building editor.</span>
      </div>
      {status && <p className="lobby-hint" role="status">{status}</p>}
    </div>
  );
}

/** A read-only view of one saved or published version: the construction, its credits, and what can be done with it. */
function SnapshotPage({ id, published, selfId }: { id: string; published?: boolean; selfId: string | null }) {
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [entry, setEntry] = useState<ShowcaseEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<{ ok: boolean; id?: string } | null>(null);
  const [collecting, setCollecting] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    const load = published
      ? showcaseEntry(id).then((e) => {
          setEntry(e);
          return e.snapshot;
        })
      : getSnapshot(id);
    load.then(setDetail).catch(() => setError(published ? "That published version isn't available." : "Couldn't load that saved version. It may not exist, or it isn't yours to view."));
  }, [id, published]);

  const friend = async (to: string) => {
    const r = await sendFriendRequest(to);
    setFriendStatus(r.ok ? "Friend request sent." : r.code === "already_friends" ? "Already friends." : "Couldn't send that request.");
  };

  const back = published ? { href: "/build/?view=showcase", label: "All published creations" } : { href: "/build/?view=collection", label: "Your collection" };

  if (error)
    return (
      <main className="lobby-grid page-narrow">
        <a className="step-back" href={back.href}>
          <span aria-hidden="true">←</span> {back.label}
        </a>
        <div className="card lobby-card">
          <p className="lobby-error" role="alert">{error}</p>
        </div>
      </main>
    );
  if (!detail)
    return (
      <main className="lobby-grid page-narrow">
        <p className="kit-state" role="status">Loading…</p>
      </main>
    );

  const partCount = detail.parts.length;
  const kinds = new Set(detail.parts.map((p) => p.partId)).size;
  const alreadyMine = detail.savedBy === selfId;

  // a direct copy into this viewer's own collection: never creates or joins
  // a room, and never touches the version being viewed. `detail.id` is
  // always the real version id; `id` (the prop) is the publication id when
  // viewing via the showcase, which /api/snapshots doesn't accept.
  const collect = async () => {
    if (collecting) return;
    setCollecting(true);
    try {
      const copy = await collectSnapshot(detail.id);
      setCollectResult({ ok: true, id: copy.id });
    } catch {
      setCollectResult({ ok: false });
    } finally {
      setCollecting(false);
    }
  };

  return (
    <main className="snapshot-page">
      <a className="step-back" href={back.href}>
        <span aria-hidden="true">←</span> {back.label}
      </a>
      <div className="snapshot-layout">
        <div className="card snapshot-viewer">
          <Suspense fallback={<div className="viewer-loading">Loading the view…</div>}>
            <SnapshotView parts={partsOf(detail)} sceneId={detail.sceneId} />
          </Suspense>
          <p className="viewer-hint">Drag to look around. Read-only: nothing here can be changed.</p>
        </div>
        <div className="card lobby-card snapshot-info">
          <h2>
            Saved version{published ? ", published" : ""}
            {published && <span className="tag room-tag tag-ok">In the showcase</span>}
          </h2>
          <p className="lobby-hint">
            {sceneTitle(detail.sceneId)} · {partCount} part{partCount === 1 ? "" : "s"} ({kinds} kind{kinds === 1 ? "" : "s"}) · saved {timeOf(detail.savedAt)}
          </p>
          <Credits detail={detail} publishedBy={entry?.publishedBy} selfId={selfId} onFriend={(id) => void friend(id)} />
          {friendStatus && <p className="lobby-hint" role="status">{friendStatus}</p>}
          {!alreadyMine && (
            <div className="kit-actions">
              <button className="btn btn-yellow" onClick={() => void collect()} aria-disabled={collecting}>
                {collecting ? "Saving…" : "Save to my collection"}
              </button>
              <span className="kit-fine">A copy of your own; no room is created.</span>
            </div>
          )}
          {collectResult && (
            <p className={collectResult.ok ? "kit-ok" : "lobby-error"} role="status">
              {collectResult.ok ? (
                <>
                  Saved to your collection. <a href={`/build/?snapshot=${collectResult.id}`}>View it</a>
                </>
              ) : (
                "Couldn't save it; try again."
              )}
            </p>
          )}
          <ContinueControls detail={detail} onContinued={(roomId) => (location.href = `/build/room/${roomId}`)} />
        </div>
      </div>
    </main>
  );
}

export function SnapshotViewerPage({ id, published, selfId }: { id: string; published?: boolean; selfId: string | null }) {
  return <SnapshotPage id={id} published={published} selfId={selfId} />;
}

// ---- the collection ----------------------------------------------------------------

function CollectionCard({ s, selfId, onPublish, publishing }: { s: SnapshotSummary; selfId: string | null; onPublish: (id: string) => void; publishing: boolean }) {
  const detail = useDetail(() => getSnapshot(s.id), s.id);
  const title = `${sceneTitle(s.sceneId)}, saved ${dateOf(s.savedAt)}`;
  return (
    <li className="room-row creation-card">
      <Stage detail={detail} label={`A sketch of ${title}`} />
      <div className="creation-label">
        <h3>{title}</h3>
        <Builders detail={detail} selfId={selfId} />
        <div className="creation-tags">
          <span className="tag room-tag room-tag-muted">revision {s.revision}</span>
          {s.savedBy !== selfId && <span className="tag room-tag room-tag-muted">collected</span>}
          {!s.allowPublish && <span className="tag room-tag room-tag-muted">not publishable</span>}
        </div>
        <div className="kit-actions">
          <a className="btn btn-small btn-red" href={`/build/?snapshot=${s.id}`} aria-label={`View ${title}`}>
            View
          </a>
          <button className="btn btn-small" onClick={() => onPublish(s.id)} aria-disabled={!s.allowPublish || publishing} title={s.allowPublish ? "Show it in the public showcase" : "The room it came from doesn't allow publishing"}>
            Publish
          </button>
        </div>
      </div>
    </li>
  );
}

export function CollectionPage({ selfId }: { selfId: string | null }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null | "failed">(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    void ensureIdentity()
      .then(() => mySnapshots())
      .then(setSnapshots, () => setSnapshots("failed"));
  }, []);

  const publish = async (id: string) => {
    if (publishing) return;
    setPublishing(true);
    const r = await publishSnapshot(id).catch(() => ({ ok: false, code: "error" }) as { ok: boolean; code?: string });
    setPublishing(false);
    setStatus(
      r.ok
        ? { ok: true, text: "Published to the public showcase." }
        : r.code === "already_published"
          ? { ok: true, text: "That version is already in the showcase." }
          : r.code === "not_allowed"
            ? { ok: false, text: "This version isn't eligible to publish." }
            : { ok: false, text: "Couldn't publish it." },
    );
  };

  return (
    <main className="lobby-grid">
      <PageHead title="Your collection">
        <p className="lobby-hint">Every version you've saved or collected, as it was at that moment. Saving never changes the room it came from.</p>
      </PageHead>
      {status && (
        <p className={status.ok ? "kit-ok" : "lobby-error"} role="status">
          {status.text}
        </p>
      )}
      {snapshots === null ? (
        <p className="kit-state" role="status">Loading your collection…</p>
      ) : snapshots === "failed" ? (
        <p className="lobby-error" role="alert">Couldn't load your collection; try again in a moment.</p>
      ) : snapshots.length === 0 ? (
        <EmptyState
          heading="Nothing saved yet"
          body={`Open a room and use "Save a copy" from its Room panel, or save one you like from the public showcase.`}
          primary={{ href: "/build/", label: "Start building" }}
          secondary={{ href: "/build/?view=showcase", label: "Browse the showcase" }}
        />
      ) : (
        <ul className="creation-grid">
          {snapshots.map((s) => (
            <CollectionCard key={s.id} s={s} selfId={selfId} onPublish={(id) => void publish(id)} publishing={publishing} />
          ))}
        </ul>
      )}
    </main>
  );
}

// ---- the showcase --------------------------------------------------------------------

function ShowcaseCard({ e, selfId, publisher }: { e: ShowcaseEntry; selfId: string | null; publisher: string | null }) {
  const detail = useDetail(() => showcaseEntry(e.publicationId).then((x) => x.snapshot), e.publicationId);
  const title = `${sceneTitle(e.sceneId)}, published ${dateOf(e.publishedAt)}`;
  return (
    <li className="room-row creation-card">
      <Stage detail={detail} label={`A sketch of ${title}`} />
      <div className="creation-label">
        <h3>{title}</h3>
        <p className="creation-meta">Published by {publisher}</p>
        <Builders detail={detail} selfId={selfId} />
        <div className="kit-actions">
          <a className="btn btn-small btn-red" href={`/build/?showcase=${e.publicationId}`} aria-label={`View ${title}`}>
            View
          </a>
        </div>
      </div>
    </li>
  );
}

export function ShowcasePage({ selfId }: { selfId: string | null }) {
  const [entries, setEntries] = useState<ShowcaseEntry[] | null | "failed">(null);
  useEffect(() => void showcaseList().then(setEntries, () => setEntries("failed")), []);
  const list = Array.isArray(entries) ? entries : [];
  const names = useDisplayNames(list.map((e) => e.publishedBy));
  return (
    <main className="lobby-grid">
      <PageHead title="Public showcase">
        <p className="lobby-hint">Creations people chose to publish. Anyone can look, save a copy to their own collection, or continue one in a new room.</p>
      </PageHead>
      {entries === null ? (
        <p className="kit-state" role="status">Loading the showcase…</p>
      ) : entries === "failed" ? (
        <p className="lobby-error" role="alert">Couldn't load the showcase; try again in a moment.</p>
      ) : entries.length === 0 ? (
        <EmptyState heading="Nothing published yet" body="When someone publishes a saved version, it appears here." primary={{ href: "/build/", label: "Start building" }} />
      ) : (
        <ul className="creation-grid">
          {entries.map((e) => (
            <ShowcaseCard key={e.publicationId} e={e} selfId={selfId} publisher={who(e.publishedBy, selfId, names)} />
          ))}
        </ul>
      )}
    </main>
  );
}
