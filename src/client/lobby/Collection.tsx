import { lazy, Suspense, useEffect, useState } from "react";
import type { Placement } from "../../domain/rules.ts";
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

// The collection (a visitor's own saved snapshots) and the public showcase
// (ADR 0009). Both open a read-only SnapshotView; "Continue" creates a new,
// independent room from a snapshot, taking the visitor straight there.
// None of this ever modifies the source room or snapshot: every save and
// continue is a fresh copy, read by id, never referenced live.

const SnapshotView = lazy(() => import("../scene/SnapshotView.tsx").then((m) => ({ default: m.SnapshotView })));

const short = (id: string): string => id.slice(0, 8);
const dateOf = (iso: string): string => new Date(iso).toLocaleString();

function partsOf(detail: SnapshotDetail): Placement[] {
  return detail.parts.map((p) => ({ partId: p.partId, x: p.x, y: p.y, z: p.z, rot: p.rot as Placement["rot"], colour: p.colour }));
}

/** Who built what, kept distinct: publisher / contributors to this version / inherited source credits / current-room members are never merged (the brief). */
function Credits({ detail, publishedBy, selfId, onFriend }: { detail: SnapshotDetail; publishedBy?: string; selfId: string | null; onFriend: (id: string) => void }) {
  const ids = [publishedBy, detail.savedBy, ...detail.contributors.map((c) => c.visitorId), ...detail.inheritedCredits.map((c) => c.visitorId)].filter(
    (id): id is string => !!id,
  );
  const names = useDisplayNames(ids);
  const FriendButton = ({ id }: { id: string }) =>
    id !== selfId ? (
      <button className="btn btn-small" onClick={() => onFriend(id)} title="Send a friend request">
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
        <strong>Saved by</strong> {who(detail.savedBy, selfId, names)}{" "}
        {detail.savedBy !== publishedBy && <FriendButton id={detail.savedBy} />}
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
        <p className="fineprint">
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
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    const room = await continueSnapshot(detail.id, visibility, allowPublish);
    // the server clamps a restricted snapshot's lineage to invite-only,
    // non-publishable regardless of what was asked for; say so if it did
    if (room.visibility !== visibility || room.allowPublish !== allowPublish) {
      setStatus("This version's publication restriction carried over, so the new room is invite-only and not publishable.");
      setTimeout(() => onContinued(room.roomId), 1200);
      return;
    }
    onContinued(room.roomId);
  };

  return (
    <div className="continue-box">
      <h3>Continue this version</h3>
      <p className="lobby-hint">Creates a brand-new, independent room from exactly what's shown here. The saved version itself never changes.</p>
      <fieldset className="field">
        <legend>Who can join the new room</legend>
        <label className="radio-row">
          <input type="radio" name="continue-visibility" checked={visibility === "public"} onChange={() => { setVisibility("public"); setAllowPublish(true); }} />
          <span>Public</span>
        </label>
        <label className="radio-row">
          <input type="radio" name="continue-visibility" checked={visibility === "invite_only"} onChange={() => { setVisibility("invite_only"); setAllowPublish(false); }} />
          <span>Invite-only</span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={allowPublish} onChange={(e) => setAllowPublish(e.target.checked)} />
        <span>Let any member publish a saved copy of the new room</span>
      </label>
      <button className="btn btn-red" onClick={() => void go()} aria-disabled={busy}>
        {busy ? "Creating…" : "Continue in a new room"}
      </button>
      {status && <p className="lobby-hint" role="status">{status}</p>}
    </div>
  );
}

/** A read-only view of one saved or published version: the construction, its credits, and the path to continue it. */
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
      ? showcaseEntry(id).then((e) => { setEntry(e); return e.snapshot; })
      : getSnapshot(id);
    load.then(setDetail).catch(() => setError("Couldn't load that saved version."));
  }, [id, published]);

  const friend = async (to: string) => {
    const r = await sendFriendRequest(to);
    setFriendStatus(r.ok ? "Friend request sent." : r.code === "already_friends" ? "Already friends." : "Couldn't send that request.");
  };

  if (error) return <div className="card lobby-card"><p className="lobby-error">{error}</p></div>;
  if (!detail) return <div className="card lobby-card"><p className="lobby-hint">Loading…</p></div>;

  const partCount = detail.parts.length;
  const kinds = new Set(detail.parts.map((p) => p.partId)).size;
  const alreadyMine = detail.savedBy === selfId;

  // a direct copy into this viewer's own collection — never creates or
  // joins a room, and never touches the version being viewed (section 10).
  // `detail.id` is always the real snapshot id; `id` (the prop) is the
  // publication id when viewing via the showcase, which /api/snapshots
  // doesn't accept.
  const collect = async () => {
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
    <div className="snapshot-page">
      <div className="card snapshot-viewer">
        <Suspense fallback={<div className="viewer-loading">Loading the view…</div>}>
          <SnapshotView parts={partsOf(detail)} />
        </Suspense>
      </div>
      <div className="card lobby-card">
        <h2>Saved version{published ? ", published" : ""}</h2>
        <p className="lobby-hint">
          {partCount} part{partCount === 1 ? "" : "s"} ({kinds} kind{kinds === 1 ? "" : "s"}), saved {dateOf(detail.savedAt)}. Read-only:
          nothing here can be changed.
        </p>
        <Credits detail={detail} publishedBy={entry?.publishedBy} selfId={selfId} onFriend={(id) => void friend(id)} />
        {friendStatus && <p className="lobby-hint" role="status">{friendStatus}</p>}
        {!alreadyMine && (
          <p>
            <button className="btn btn-small" onClick={() => void collect()} aria-disabled={collecting}>
              {collecting ? "Saving…" : "Save to my collection"}
            </button>
          </p>
        )}
        {collectResult && (
          <p className="lobby-hint" role="status">
            {collectResult.ok ? (
              <>
                Saved to your collection. <a href={`/build/?snapshot=${collectResult.id}`}>View it</a>
              </>
            ) : (
              "Couldn't save it; try again."
            )}
          </p>
        )}
        <ContinueControls detail={detail} onContinued={(roomId) => { location.href = `/build/room/${roomId}`; }} />
      </div>
    </div>
  );
}

export function SnapshotViewerPage({ id, published, selfId }: { id: string; published?: boolean; selfId: string | null }) {
  return (
    <main className="lobby-grid">
      <SnapshotPage id={id} published={published} selfId={selfId} />
      <p>
        <a href="/build/">← Back to the room lobby</a>
      </p>
    </main>
  );
}

export function CollectionPage({ selfId }: { selfId: string | null }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => void mySnapshots().then(setSnapshots), []);

  const publish = async (id: string) => {
    const r = await publishSnapshot(id);
    setStatus(r.ok ? "Published to the public showcase." : r.code === "not_allowed" ? "This version isn't eligible to publish." : "Couldn't publish it.");
  };

  return (
    <main className="lobby-grid">
      <header className="lobby-header">
        <h1>Your collection</h1>
        <p className="lobby-hint">Every version you've saved, as it was at that moment. Saving never changes the room it came from.</p>
      </header>
      <div className="card lobby-card">
        {status && <p className="lobby-hint" role="status">{status}</p>}
        {snapshots === null ? (
          <p className="lobby-hint">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="lobby-hint">Nothing saved yet. Open a room and use "Save a copy" from its Room panel.</p>
        ) : (
          <ul className="room-list">
            {snapshots.map((s) => (
              <li key={s.id} className="room-row">
                <span className="room-name">
                  Saved {dateOf(s.savedAt)} <span className="room-tag room-tag-muted">revision {s.revision}</span>
                  {!s.allowPublish && <span className="room-tag room-tag-muted">not publishable</span>}
                </span>
                <span className="field-row">
                  <a className="btn btn-small" href={`/build/?snapshot=${s.id}`}>
                    View
                  </a>
                  <button className="btn btn-small" onClick={() => void publish(s.id)} aria-disabled={!s.allowPublish}>
                    Publish
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>
        <a href="/build/">← Back to the room lobby</a>
      </p>
    </main>
  );
}

export function ShowcasePage({ selfId }: { selfId: string | null }) {
  const [entries, setEntries] = useState<ShowcaseEntry[] | null>(null);
  useEffect(() => void showcaseList().then(setEntries), []);
  const names = useDisplayNames((entries ?? []).map((e) => e.publishedBy));
  return (
    <main className="lobby-grid">
      <header className="lobby-header">
        <h1>Public showcase</h1>
        <p className="lobby-hint">Published versions anyone can view, save to their own collection, and continue.</p>
      </header>
      <div className="card lobby-card">
        {entries === null ? (
          <p className="lobby-hint">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="lobby-hint">Nothing published yet.</p>
        ) : (
          <ul className="room-list">
            {entries.map((e) => (
              <li key={e.publicationId} className="room-row">
                <span className="room-name">Published {dateOf(e.publishedAt)} by {who(e.publishedBy, selfId, names)}</span>
                <a className="btn btn-small btn-red" href={`/build/?showcase=${e.publicationId}`}>
                  View
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>
        <a href="/build/">← Back to the room lobby</a>
      </p>
    </main>
  );
}
