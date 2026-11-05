import { useEffect, useId, useRef, useState } from "react";
import { SCENE_LIST, sceneInfo, templateOf, type SceneInfo } from "../scenes/registry.ts";
import { ensureIdentity } from "../state/identity.ts";
import { useDisplayNames, who } from "../state/names.ts";
import { soloPlotScene, sharedPlotScene } from "../ui/brickScenes.ts";
import { EmptyState } from "./Shell.tsx";
import {
  createFriendLink,
  createRecoveryCode,
  createRoom,
  joinRoom,
  myDefaultRoom,
  myFriends,
  myInvites,
  myRooms,
  openFriendLink,
  previewAdmission,
  publicLobby,
  redeemRecoveryCode,
  respondToFriendRequest,
  respondToInvite,
  type AdmissionPreview,
  type FriendRequest,
  type JoinCode,
  type LobbyRoom,
  type MyRoom,
  type RoomInvite,
} from "../state/api.ts";

// The lobby's working parts (ADR 0007), shared by the /build/ pages and the
// homepage table's panels (ADR 0014), so there is one version of each form
// and each list, with one set of rules behind it. Nothing here decides
// anything the server doesn't re-check: admission, capacity, invitations and
// publication are all enforced server-side at the moment they happen.
//
// Every identity-dependent request waits for this browser's identity first
// (`ensureIdentity`), so a panel opened on the homepage can't race a first
// visit's cookie (state/identity.ts).

const short = (id: string): string => id.slice(0, 8);
export const roomName = (label: string | null, id: string): string => label || `Room ${short(id)}`;
const sceneTitle = (sceneId: string): string => sceneInfo(sceneId)?.title ?? "A scene";

export const JOIN_MESSAGE: Record<JoinCode, string> = {
  room_full: "That room is full right now.",
  forbidden: "That room is invite-only, and you don't have an accepted invitation.",
  not_found: "That room doesn't exist (or isn't public).",
};

/** Occupancy as filled and empty places, with the numbers in words for everyone. */
export function Seats({ occupancy, capacity }: { occupancy: number; capacity: number }) {
  return (
    <span className="room-meta">
      <span className="seats" aria-hidden="true">
        {Array.from({ length: capacity }, (_, i) => (
          <span key={i} className={`seat${i < occupancy ? " is-taken" : ""}`} />
        ))}
      </span>{" "}
      {occupancy}/{capacity} here
    </span>
  );
}

// ---- choosing a scene ------------------------------------------------------------

/** "1–4 builders": the scene's real room capacity, from its template. */
export const buildersOf = (info: SceneInfo): string => {
  const n = templateOf(info).maxPlayers;
  return n === 1 ? "1 builder" : `1–${n} builders`;
};

/**
 * The playable scenes as a single choice (ADR 0015): each shows its cover
 * (rendered from the scene itself), title, setting, real capacity and plot
 * size. Choosing one creates nothing; it only says which scene the next
 * solo plot or new room will build.
 */
export function ScenePicker({ value, onChange, name }: { value: string; onChange: (id: string) => void; name: string }) {
  return (
    <fieldset className="scene-picker">
      <legend>Scene</legend>
      {SCENE_LIST.map((info) => {
        const t = templateOf(info);
        return (
          <label key={info.id} className={`scene-option${value === info.id ? " is-chosen" : ""}`}>
            <input type="radio" name={name} value={info.id} checked={value === info.id} onChange={() => onChange(info.id)} />
            <img src={info.cover} alt="" width={160} height={100} loading="lazy" />
            <span className="scene-option-text">
              <strong>{info.title}</strong>
              <span>{info.setting}.</span>
              <span className="scene-facts">
                <span className="tag tag-muted">{buildersOf(info)}</span>
                <span className="tag tag-muted">
                  Plot {t.bounds.w}×{t.bounds.d} studs
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ---- building alone ------------------------------------------------------------

/** Opens this visitor's own solo room for a scene (fetched or created), then hands over its id. Guards against a double click. */
export function useSoloRoom(onOpen: (roomId: string) => void, sceneId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const open = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await ensureIdentity();
      const { roomId } = await myDefaultRoom(sceneId);
      onOpen(roomId);
    } catch {
      setError("Couldn't open your build; try again.");
      setBusy(false);
      inFlight.current = false;
    }
  };
  return { open, busy, error };
}

// ---- two ways to begin, as compact baseplates, with the room form unfolding ------

type StartPath = "solo" | "shared" | null;

/**
 * Refinement (author's brief, 5 Nov 2026, "bolder" pass): a short "Build
 * alone" card beside a much taller room-creation form left a large empty
 * area beside the short card. Two compact, visually distinctive baseplate
 * choices replace both: solo building opens immediately, as it always
 * has (one click, no form); choosing a shared room unfolds the same
 * settings `CreateRoom` always used, in a stable area below, rather than
 * showing a long form by default beside a tiny action. Choosing "shared"
 * never creates anything by itself — only the room's own "Create and
 * open" button does, exactly as before. Switching back to the choices
 * keeps whatever was typed, since the form's state lives in this
 * component rather than being unmounted. Opening the form moves focus to
 * its first field, and reduced motion only removes the expand animation,
 * never the content itself.
 */
export function StartChoices({ onOpen, onCreated }: { onOpen: (roomId: string) => void; onCreated: (roomId: string) => void }) {
  const [path, setPath] = useState<StartPath>(null);
  const [sceneId, setSceneId] = useState(SCENE_LIST[0].id);
  const scene = sceneInfo(sceneId)!;
  const solo = useSoloRoom(onOpen, sceneId);
  const [draft, setDraft] = useState<RoomDraft>(NEW_ROOM);
  const create = useCreateRoom(onCreated, sceneId);
  const formId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const chooseShared = () => {
    setPath("shared");
    // moves focus into the newly-shown form, so a keyboard or screen-reader
    // user lands somewhere useful rather than staying on the tile they
    // just activated while the page silently grows beneath them
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  return (
    <div className="start-choices">
      <ScenePicker value={sceneId} onChange={setSceneId} name="start-scene" />
      <div className="start-plots" role="group" aria-label="How to begin">
        <button
          type="button"
          className={`start-plot start-plot-solo${path === "solo" ? " is-chosen" : ""}`}
          onClick={() => setPath("solo")}
          aria-expanded={path === "solo"}
          aria-disabled={solo.busy}
        >
          <span className="start-plot-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: soloPlotScene() }} />
          <span className="start-plot-text">
            <strong>Build on your own</strong>
            <span>Your own private plot. No one else can join it.</span>
          </span>
        </button>
        <button
          type="button"
          className={`start-plot start-plot-shared${path === "shared" ? " is-chosen" : ""}`}
          onClick={chooseShared}
          aria-expanded={path === "shared"}
          aria-controls={formId}
        >
          <span className="start-plot-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sharedPlotScene() }} />
          <span className="start-plot-text">
            <strong>Start a shared room</strong>
            <span>Up to {templateOf(scene).maxPlayers} people build together, sharing one kit of parts.</span>
          </span>
        </button>
      </div>
      {path === "solo" && (
        <div className="start-unfold">
          <button className="btn btn-yellow btn-big" onClick={() => void solo.open()} aria-disabled={solo.busy}>
            {solo.busy ? "Opening…" : `Build alone: ${scene.title}`}
          </button>
          {solo.error && <p className="lobby-error" role="alert">{solo.error}</p>}
        </div>
      )}
      {path === "shared" && (
        <form
          id={formId}
          className="start-unfold start-room-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create.submit(draft);
          }}
        >
          <label className="field">
            <span>
              Room name <small>(optional)</small>
            </span>
            <input ref={firstFieldRef} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Saturday build" maxLength={80} />
          </label>
          <fieldset className="field">
            <legend>Who can join</legend>
            <label className="radio-row">
              <input type="radio" name="start-visibility" checked={draft.visibility === "public"} onChange={() => setDraft({ ...draft, visibility: "public", allowPublish: true })} />
              <span>
                <strong>Public</strong> — listed on the noticeboard and in the lobby; anyone can join while there's room.
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="start-visibility"
                checked={draft.visibility === "invite_only"}
                onChange={() => setDraft({ ...draft, visibility: "invite_only", allowPublish: false })}
              />
              <span>
                <strong>Invite-only</strong> — unlisted; only people you invite (who must already be a friend) can join.
              </span>
            </label>
          </fieldset>
          <label className="check-row">
            <input type="checkbox" checked={draft.allowPublish} onChange={(e) => setDraft({ ...draft, allowPublish: e.target.checked })} />
            <span>
              Let any member publish a saved copy of this room to the public showcase. Fixed once the room is created
              {draft.visibility === "invite_only" && draft.allowPublish && " — unusual for an invite-only room, but your choice"}.
            </span>
          </label>
          {create.error && <p className="lobby-error" role="alert">{create.error}</p>}
          <button type="submit" className="btn btn-red" aria-disabled={create.busy}>
            {create.busy ? "Creating…" : `Create and open: ${scene.title}`}
          </button>
        </form>
      )}
    </div>
  );
}

// ---- creating a room -----------------------------------------------------------

export interface RoomDraft {
  label: string;
  visibility: "public" | "invite_only";
  allowPublish: boolean;
}
/** The author's defaults (ADR 0009): public, and publishing on for public rooms. */
export const NEW_ROOM: RoomDraft = { label: "", visibility: "public", allowPublish: true };

/**
 * A room's settings as fields. Controlled, so a flow that steps back and
 * forward (the table's scene tray) keeps what was typed. Choosing who can
 * join resets publishing to that choice's default, off for invite-only and
 * on for public (ADR 0009), but it stays a real, visible, separate choice.
 */
export function RoomSettings({ draft, onChange, name = "visibility" }: { draft: RoomDraft; onChange: (d: RoomDraft) => void; name?: string }) {
  const setVisibility = (v: RoomDraft["visibility"]) => onChange({ ...draft, visibility: v, allowPublish: v === "public" });
  return (
    <>
      <label className="field">
        <span>
          Room name <small>(optional)</small>
        </span>
        <input value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} placeholder="e.g. Saturday build" maxLength={80} />
      </label>
      <fieldset className="field">
        <legend>Who can join</legend>
        <label className="radio-row">
          <input type="radio" name={name} checked={draft.visibility === "public"} onChange={() => setVisibility("public")} />
          <span>
            <strong>Public</strong> — listed on the noticeboard and in the lobby; anyone can join while there's room.
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name={name} checked={draft.visibility === "invite_only"} onChange={() => setVisibility("invite_only")} />
          <span>
            <strong>Invite-only</strong> — unlisted; only people you invite (who must already be a friend) can join.
          </span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={draft.allowPublish} onChange={(e) => onChange({ ...draft, allowPublish: e.target.checked })} />
        <span>
          Let any member publish a saved copy of this room to the public showcase. Fixed once the room is created
          {draft.visibility === "invite_only" && draft.allowPublish && " — unusual for an invite-only room, but your choice"}.
        </span>
      </label>
    </>
  );
}

/** Creates the room once per submission, however many times the button is pressed while it's in flight. */
export function useCreateRoom(onCreated: (roomId: string) => void, sceneId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const submit = async (draft: RoomDraft) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await ensureIdentity();
      const room = await createRoom(sceneId, draft.visibility, draft.allowPublish, draft.label.trim() || undefined);
      onCreated(room.roomId);
    } catch {
      setError("Couldn't create the room. Nothing was created; try again.");
      setBusy(false);
      inFlight.current = false;
    }
  };
  return { submit, busy, error };
}

// ---- joining a room ------------------------------------------------------------

type PreviewState = { kind: "idle" } | { kind: "checking" } | { kind: "ready"; preview: AdmissionPreview } | { kind: "failed" };

/** The facts a joiner sees before admission: name, scene, capacity, access, publication. */
export function AdmissionFacts({ preview }: { preview: AdmissionPreview }) {
  return (
    <dl className="facts">
      <dt>Room</dt>
      <dd>{roomName(preview.label, preview.id)}</dd>
      <dt>Scene</dt>
      <dd>{sceneTitle(preview.sceneId)}</dd>
      <dt>Here now</dt>
      <dd>
        <Seats occupancy={preview.occupancy} capacity={preview.capacity} />
      </dd>
      <dt>Access</dt>
      <dd>{preview.visibility === "public" ? "Public" : "Invite-only"}</dd>
      <dt>Publishing</dt>
      <dd>{preview.allowPublish ? "Members may publish a saved version" : "Not publishable"}</dd>
    </dl>
  );
}

/**
 * Joining by a pasted room id shows the same pre-join terms a direct link
 * does (room name, scene, capacity, visibility, publication) and requires an
 * explicit confirm. Joining waits for a successful preview of exactly the id
 * in the field; the confirm is disabled while loading or after a failure.
 */
export function JoinByCode({ onJoined, bare = false }: { onJoined: (roomId: string) => void; bare?: boolean }) {
  const [id, setId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  // guards against a stale response landing after the input changed again
  const [checkedFor, setCheckedFor] = useState("");

  const check = async () => {
    const roomId = id.trim();
    if (!roomId) {
      setPreview({ kind: "idle" });
      return;
    }
    setPreview({ kind: "checking" });
    await ensureIdentity().catch(() => {});
    const result = await previewAdmission(roomId).catch(() => null);
    if (id.trim() !== roomId) return; // the field changed again while this was in flight
    setCheckedFor(roomId);
    setPreview(result ? { kind: "ready", preview: result } : { kind: "failed" });
  };

  const submit = async () => {
    const roomId = id.trim();
    if (busy || !roomId || preview.kind !== "ready" || checkedFor !== roomId) return;
    setBusy(true);
    setStatus(null);
    const result = await joinRoom(roomId).catch(() => ({ ok: false as const, code: "not_found" as const }));
    if (result.ok) {
      onJoined(roomId);
      return;
    }
    setBusy(false);
    setStatus(JOIN_MESSAGE[result.code]);
  };

  const canConfirm = !busy && preview.kind === "ready" && preview.preview.canJoin && checkedFor === id.trim();

  const body = (
    <>
      {!bare && <h2>Join a room by its code</h2>}
      <p className="lobby-hint">Paste the room id a friend shared with you (or that you see in its web address).</p>
      <div className="field-row">
        <input
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setPreview({ kind: "idle" });
            setStatus(null);
          }}
          onBlur={() => void check()}
          onKeyDown={(e) => e.key === "Enter" && void check()}
          placeholder="Room id"
          aria-label="Room id"
        />
        <button className="btn btn-red" onClick={() => void submit()} aria-disabled={!canConfirm}>
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      {preview.kind === "checking" && <p className="lobby-hint" role="status">Checking this room…</p>}
      {preview.kind === "failed" && <p className="lobby-error">That room doesn't exist, or you don't have an accepted invitation to it.</p>}
      {preview.kind === "ready" && (
        <>
          <p className="lobby-hint">
            <strong>{roomName(preview.preview.label, preview.preview.id)}</strong> ·{" "}
            {preview.preview.visibility === "public" ? "Public" : "Invite-only"} · {preview.preview.occupancy}/{preview.preview.capacity} here ·{" "}
            {preview.preview.allowPublish ? "members may publish a saved version" : "publishing not allowed"}
            {!preview.preview.canJoin && (
              <>
                {" — "}
                <strong>{preview.preview.reason === "room_full" ? "full right now" : "not open to you"}</strong>
              </>
            )}
          </p>
        </>
      )}
      {status && <p className="lobby-error" role="status">{status}</p>}
    </>
  );
  return bare ? <div className="join-code">{body}</div> : <div className="card lobby-card">{body}</div>;
}

type ListState<T> = { kind: "loading" } | { kind: "ready"; items: T } | { kind: "failed" };

/** One card's worth of a public room, shared by both the grid and the compact list rendering below. */
function RoomCard({ r, joining, onJoin }: { r: LobbyRoom; joining: string | null; onJoin: (id: string) => void }) {
  const full = r.occupancy >= r.capacity;
  const name = roomName(r.label, r.id);
  return (
    <li className="room-card-tile">
      <div className="room-card-tile-main">
        <span className="room-card-tile-name" title={name}>
          {name}
        </span>
        <span className="room-card-tile-tags">
          <span className="tag room-tag room-tag-muted">{sceneTitle(r.sceneId)}</span>
          {/* publication policy disclosed before joining, not only after (the brief) */}
          <span className="tag room-tag room-tag-muted">{r.allowPublish ? "Publishing allowed" : "Not publishable"}</span>
        </span>
        <Seats occupancy={r.occupancy} capacity={r.capacity} />
      </div>
      <button className="btn btn-small btn-red" onClick={() => onJoin(r.id)} aria-disabled={!!joining || full} aria-label={full ? `${name} is full` : `Join ${name}`}>
        {full ? "Full" : joining === r.id ? "Joining…" : "Join"}
      </button>
    </li>
  );
}

/** How many public rooms show before "Load more" (client-side: `/api/rooms` already returns every public room in one response, so this only paces how many render at once, not what the server sends). */
const ROOMS_PAGE = 12;
const ROOMS_PAGE_COMPACT = 6;

/**
 * Public rooms, with real occupancy polled while shown: the lobby has no
 * stream of its own (ADR 0008 scopes realtime to a joined room). Each room
 * discloses what admission depends on (scene, places, publication) before
 * its Join, which is the explicit confirmation.
 *
 * Refinement (author's brief, 5 Nov 2026): with many public rooms, a single
 * growing `<ul class="room-list">` made the page a tall, narrow column with
 * nothing beside it after the first few entries. `grid` renders the same
 * data as a responsive card grid that uses the page's full width instead,
 * with "Load more" pagination (room count and all results stay reachable;
 * nothing is hidden or limited away). `bare` (the tabletop noticeboard)
 * keeps the original compact row-per-room treatment, which suits a
 * scrolling panel rather than a wide page.
 */
export function PublicRooms({ onJoined, heading = "Public lobby", bare = false, grid = false }: { onJoined: (roomId: string) => void; heading?: string; bare?: boolean; grid?: boolean }) {
  const [rooms, setRooms] = useState<ListState<LobbyRoom[]>>({ kind: "loading" });
  const [status, setStatus] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [shown, setShown] = useState(grid ? ROOMS_PAGE : ROOMS_PAGE_COMPACT);

  useEffect(() => {
    let live = true;
    const refresh = () =>
      void publicLobby().then(
        (items) => live && setRooms({ kind: "ready", items }),
        () => live && setRooms((r) => (r.kind === "ready" ? r : { kind: "failed" })),
      );
    refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const join = async (roomId: string) => {
    if (joining) return;
    setJoining(roomId);
    setStatus(null);
    await ensureIdentity().catch(() => {});
    const result = await joinRoom(roomId).catch(() => ({ ok: false as const, code: "not_found" as const }));
    if (result.ok) {
      onJoined(roomId);
      return;
    }
    setJoining(null);
    setStatus(JOIN_MESSAGE[result.code]);
  };

  const all = rooms.kind === "ready" ? rooms.items : [];
  const visible = all.slice(0, shown);
  const remaining = all.length - visible.length;
  const pageSize = grid ? ROOMS_PAGE : ROOMS_PAGE_COMPACT;

  const body = (
    <>
      {!bare && (
        <h2>
          {heading}
          {rooms.kind === "ready" && all.length > 0 && <span className="tag room-tag room-tag-muted">{all.length}</span>}
        </h2>
      )}
      {status && <p className="lobby-error" role="status">{status}</p>}
      {rooms.kind === "loading" ? (
        <p className="kit-state" role="status">Loading the rooms…</p>
      ) : rooms.kind === "failed" ? (
        <p className="lobby-error" role="alert">Couldn't load the public rooms. They'll appear here when the connection is back.</p>
      ) : all.length === 0 ? (
        <EmptyState compact={!grid} heading="No public rooms right now" body={`Start one from the scene tray, or by "Start a room".`} />
      ) : grid ? (
        <>
          <ul className="room-grid">
            {visible.map((r) => (
              <RoomCard key={r.id} r={r} joining={joining} onJoin={(id) => void join(id)} />
            ))}
          </ul>
          {remaining > 0 && (
            <div className="room-grid-more">
              <button className="btn" onClick={() => setShown((n) => n + pageSize)}>
                Load more ({remaining} more room{remaining === 1 ? "" : "s"})
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <ul className="room-list">
            {visible.map((r) => {
              const full = r.occupancy >= r.capacity;
              return (
                <li key={r.id} className="room-row">
                  <span className="room-name">
                    {roomName(r.label, r.id)}
                    <span className="tag room-tag room-tag-muted">{sceneTitle(r.sceneId)}</span>
                    <span className="tag room-tag room-tag-muted">{r.allowPublish ? "Publishing allowed" : "Not publishable"}</span>
                  </span>
                  <Seats occupancy={r.occupancy} capacity={r.capacity} />
                  <button className="btn btn-small btn-red" onClick={() => void join(r.id)} aria-disabled={!!joining || full} aria-label={full ? `${roomName(r.label, r.id)} is full` : `Join ${roomName(r.label, r.id)}`}>
                    {full ? "Full" : joining === r.id ? "Joining…" : "Join"}
                  </button>
                </li>
              );
            })}
          </ul>
          {remaining > 0 && (
            <button className="btn btn-small" onClick={() => setShown((n) => n + pageSize)}>
              Show {Math.min(remaining, pageSize)} more
            </button>
          )}
        </>
      )}
    </>
  );
  return bare ? <div>{body}</div> : grid ? <div className="lobby-rooms-panel">{body}</div> : <div className="card lobby-card">{body}</div>;
}

/** The rooms this visitor already belongs to; opening one goes straight in (a returning member's admission is re-checked by the editor). */
export function MyRooms({ onOpen, showEmpty = false, bare = false }: { onOpen: (roomId: string) => void; showEmpty?: boolean; bare?: boolean }) {
  const [rooms, setRooms] = useState<ListState<MyRoom[]>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void ensureIdentity()
      .then(() => myRooms())
      .then(
        (items) => live && setRooms({ kind: "ready", items }),
        () => live && setRooms({ kind: "failed" }),
      );
    return () => {
      live = false;
    };
  }, []);
  if (!showEmpty && (rooms.kind !== "ready" || rooms.items.length === 0)) return null;
  const body = (
    <>
      {!bare && <h2>Your rooms</h2>}
      {rooms.kind === "loading" ? (
        <p className="kit-state" role="status">Loading your rooms…</p>
      ) : rooms.kind === "failed" ? (
        <p className="lobby-error" role="alert">Couldn't load your rooms; try again in a moment.</p>
      ) : rooms.items.length === 0 ? (
        <EmptyState compact heading="You haven't joined a room yet" body="Build alone, start a room, or join one from the public lobby." primary={{ href: "/build/", label: "Build or join" }} />
      ) : (
        <ul className="room-list">
          {rooms.items.map((r) => (
            <li key={r.id} className="room-row">
              <span className="room-name">
                {r.isDefault ? "Your solo build" : roomName(r.label, r.id)}
                {r.isHost && !r.isDefault && <span className="tag room-tag">Host</span>}
                <span className="tag room-tag room-tag-muted">{r.visibility === "public" ? "Public" : "Invite-only"}</span>
              </span>
              <button className="btn btn-small btn-red" onClick={() => onOpen(r.id)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return bare ? <div>{body}</div> : <div className="card lobby-card">{body}</div>;
}

// ---- invitations -----------------------------------------------------------------

/** Real pending invitations, polled while shown. `onCount` lets a host page show how many there are. */
export function useInvites(onCount?: (n: number) => void) {
  const [invites, setInvites] = useState<ListState<RoomInvite[]>>({ kind: "loading" });
  const refresh = () =>
    void ensureIdentity()
      .then(() => myInvites())
      .then(
        (items) => {
          setInvites({ kind: "ready", items });
          onCount?.(items.length);
        },
        () => setInvites((s) => (s.kind === "ready" ? s : { kind: "failed" })),
      );
  useEffect(() => {
    refresh();
    // a new invitation arriving while this is open shows without a reload
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);
  return { invites, refresh };
}

/**
 * Room invitations, each with what accepting means: which room, from whom,
 * how full it is and whether members may publish, shown before the choice.
 * Accepting admits you to that room at once (the server re-checks capacity);
 * declining only removes the invitation.
 */
export function Invites({ onJoined, selfId, showEmpty = false, bare = false, onCount }: { onJoined: (roomId: string) => void; selfId: string | null; showEmpty?: boolean; bare?: boolean; onCount?: (n: number) => void }) {
  const { invites, refresh } = useInvites(onCount);
  const [status, setStatus] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const items = invites.kind === "ready" ? invites.items : [];
  const names = useDisplayNames(items.map((i) => i.invitedBy));
  if (!showEmpty && items.length === 0) return null;

  const respond = async (id: string, roomId: string, accept: boolean) => {
    if (acting) return;
    setActing(id);
    setStatus(null);
    const result = await respondToInvite(id, accept).catch(() => ({ ok: false, code: "error" }));
    if (accept && result.ok) {
      onJoined(roomId); // accepting admits you straight away; go there
      return;
    }
    setActing(null);
    if (accept && !result.ok) setStatus(result.code === "room_full" ? "That room is full now. The invitation stays; try again when there's a place." : "Couldn't accept it; try again.");
    if (!accept && !result.ok) setStatus("Couldn't decline it; try again.");
    refresh();
  };

  const body = (
    <>
      {!bare && <h2>Room invitations</h2>}
      {status && <p className="lobby-error" role="status">{status}</p>}
      {invites.kind === "loading" ? (
        <p className="kit-state" role="status">Checking for invitations…</p>
      ) : invites.kind === "failed" ? (
        <p className="lobby-error" role="alert">Couldn't check your invitations; try again in a moment.</p>
      ) : items.length === 0 ? (
        <EmptyState compact heading="No invitations right now" body="When a friend invites you to a room, it appears here." />
      ) : (
        <ul className="room-list">
          {items.map((i) => {
            const full = i.occupancy >= i.capacity;
            return (
              <li key={i.id} className="room-row invite-row">
                <span className="room-name">
                  {roomName(i.label, i.roomId)} from {who(i.invitedBy, selfId, names)}
                  <span className="tag room-tag room-tag-muted">{sceneTitle(i.sceneId)}</span>
                  <span className="tag room-tag room-tag-muted">
                    {i.occupancy}/{i.capacity} here
                  </span>
                  <span className="tag room-tag room-tag-muted">{i.allowPublish ? "Publishing allowed" : "Not publishable"}</span>
                  {full && <span className="tag room-tag tag-red">full right now</span>}
                </span>
                <span className="field-row">
                  <button className="btn btn-small btn-red" onClick={() => void respond(i.id, i.roomId, true)} aria-disabled={full || !!acting} title={full ? "This room is full right now, but you can still try — a slot may free up" : undefined}>
                    Accept
                  </button>
                  <button className="btn btn-small btn-danger danger" onClick={() => void respond(i.id, i.roomId, false)} aria-disabled={!!acting}>
                    Decline
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && <p className="lobby-hint fineprint">Accepting takes you into that room. Being friends never opens an invite-only room by itself; the invitation does.</p>}
    </>
  );
  return bare ? <div>{body}</div> : <div className="card lobby-card">{body}</div>;
}

// ---- friends -----------------------------------------------------------------------

type LinkState =
  | { kind: "loading" }
  | { kind: "ready"; requestId: string; fromVisitor: string }
  | { kind: "own" }
  | { kind: "already-friends" }
  | { kind: "invalid" }
  | { kind: "accepted" }
  | { kind: "declined" };

/**
 * Opening a shared friend-request link directly (`/build/?friend=token`):
 * shows who sent it and an explicit accept/decline. Viewing this page never
 * itself establishes friendship (the author's explicit requirement); only
 * the Accept button does, through the same respond endpoint a direct
 * request uses.
 */
export function FriendLink({ token }: { token: string }) {
  const [state, setState] = useState<LinkState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void openFriendLink(token).then(
      (r) => {
        if (cancelled) return;
        if (!r.ok || !r.requestId || !r.fromVisitor) {
          setState({ kind: r.code === "self" ? "own" : r.code === "already_friends" ? "already-friends" : "invalid" });
          return;
        }
        setState({ kind: "ready", requestId: r.requestId, fromVisitor: r.fromVisitor });
      },
      () => !cancelled && setState({ kind: "invalid" }),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const respond = async (requestId: string, accept: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await respondToFriendRequest(requestId, accept).catch(() => ({ ok: false }));
    setBusy(false);
    setState({ kind: r.ok ? (accept ? "accepted" : "declined") : "invalid" });
  };

  const fromVisitor = state.kind === "ready" ? state.fromVisitor : undefined;
  const names = useDisplayNames(fromVisitor ? [fromVisitor] : []);

  return (
    <div className="card lobby-card">
      <h2>Friend request</h2>
      {state.kind === "loading" && <p className="kit-state" role="status">Loading…</p>}
      {state.kind === "ready" && (
        <>
          <p className="lobby-hint">
            <strong>{who(state.fromVisitor, null, names)}</strong> shared this link to become your friend. Accepting lets you send
            each other room invitations; it never opens an invite-only room by itself.
          </p>
          <div className="context-actions">
            <button className="btn btn-red" onClick={() => void respond(state.requestId, true)} aria-disabled={busy}>
              Accept
            </button>
            <button className="btn" onClick={() => void respond(state.requestId, false)} aria-disabled={busy}>
              Decline
            </button>
          </div>
        </>
      )}
      {state.kind === "own" && <p className="lobby-hint">This is your own friend-request link — share it with someone else instead.</p>}
      {state.kind === "already-friends" && <p className="lobby-hint">You and this person are already friends.</p>}
      {state.kind === "invalid" && <p className="lobby-error">This link isn't valid (it may have already been used, or mistyped).</p>}
      {state.kind === "accepted" && <p className="kit-ok" role="status">Friend request accepted.</p>}
      {state.kind === "declined" && <p className="lobby-hint" role="status">Declined. The link stays open if you change your mind.</p>}
    </div>
  );
}

/**
 * Friends, requests waiting for an answer, and the two link actions. Every
 * change is a button press: opening this never creates a link, sends a
 * request or accepts one.
 */
export function Friends({ selfId, bare = false }: { selfId: string | null; bare?: boolean }) {
  const [friends, setFriends] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<FriendRequest[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [openToken, setOpenToken] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [acting, setActing] = useState(false);

  const refresh = () =>
    void ensureIdentity()
      .then(() => myFriends())
      .then(
        (r) => {
          setFriends(r.friends);
          setPending(r.pending);
          setFailed(false);
        },
        () => setFailed(true),
      );
  useEffect(() => {
    refresh();
    // a new request, or someone accepting one, shows without a reload
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const makeLink = async () => {
    if (making) return;
    setMaking(true);
    try {
      const { token } = await createFriendLink();
      setLink(`${location.origin}/build/?friend=${token}`);
    } catch {
      setStatus({ ok: false, text: "Couldn't make a link; try again." });
    }
    setMaking(false);
  };

  const respond = async (id: string, accept: boolean) => {
    if (acting) return;
    setActing(true);
    await respondToFriendRequest(id, accept).catch(() => setStatus({ ok: false, text: "Couldn't answer that request; try again." }));
    setActing(false);
    refresh();
  };

  // accepting a link reuses the same respond endpoint as a direct request
  const openByToken = async () => {
    const raw = openToken.trim();
    if (!raw || acting) return;
    // a whole pasted link works as well as its token
    const token = raw.includes("friend=") ? new URL(raw, location.origin).searchParams.get("friend") ?? raw : raw;
    setActing(true);
    const result = await openFriendLink(token).catch(() => ({ ok: false, code: "invalid" }) as { ok: boolean; requestId?: string; code?: string });
    if (!result.ok || !result.requestId) {
      setActing(false);
      setStatus({ ok: false, text: result.code === "self" ? "That's your own link." : result.code === "already_friends" ? "You're already friends." : "That link isn't valid." });
      return;
    }
    const r = await respondToFriendRequest(result.requestId, true).catch(() => ({ ok: false }));
    setActing(false);
    setStatus(r.ok ? { ok: true, text: "Friend request accepted." } : { ok: false, text: "Couldn't accept it; try again." });
    if (r.ok) setOpenToken("");
    refresh();
  };

  const names = useDisplayNames([...pending.map((p) => p.fromVisitor), ...(friends ?? [])]);

  const body = (
    <>
      {!bare && <h2>Friends</h2>}
      {!bare && <p className="lobby-hint">Friendship never opens an invite-only room by itself; you still need a specific invitation.</p>}
      {pending.length > 0 && (
        <>
          <h3 className="kit-subhead">Waiting for your answer</h3>
          <ul className="room-list">
            {pending.map((p) => (
              <li key={p.id} className="room-row">
                <span className="room-name">Friend request from {who(p.fromVisitor, selfId, names)}</span>
                <span className="field-row">
                  <button className="btn btn-small btn-red" onClick={() => void respond(p.id, true)} aria-disabled={acting}>
                    Accept
                  </button>
                  <button className="btn btn-small btn-danger danger" onClick={() => void respond(p.id, false)} aria-disabled={acting}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {failed && friends === null ? (
        <p className="lobby-error" role="alert">Couldn't load your friends; try again in a moment.</p>
      ) : friends === null ? (
        <p className="kit-state" role="status">Loading your friends…</p>
      ) : friends.length === 0 ? (
        <EmptyState compact heading="No friends yet" body="Send a friend-request link to someone you build with, below." />
      ) : (
        <ul className="room-list">
          {friends.map((id) => (
            <li key={id} className="room-row">
              <span className="room-name">{who(id, selfId, names)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="kit-subhead">Add a friend</h3>
      <div className="field-row">
        <button className="btn btn-small" onClick={() => void makeLink()} aria-disabled={making}>
          {making ? "Making a link…" : "Get a friend-request link"}
        </button>
        {link && <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Your friend-request link" />}
      </div>
      <p className="lobby-hint fineprint">Send it to someone you know. Whoever opens it can accept and become your friend; it never lets them into a room.</p>
      <div className="field-row">
        <input value={openToken} onChange={(e) => setOpenToken(e.target.value)} placeholder="Paste a friend's link token" aria-label="Friend link token" />
        <button className="btn btn-small" onClick={() => void openByToken()} aria-disabled={!openToken.trim() || acting}>
          Use it
        </button>
      </div>
      {status && (
        <p className={status.ok ? "kit-ok" : "lobby-error"} role="status">
          {status.text}
        </p>
      )}
    </>
  );
  return bare ? (
    <div id="friends">{body}</div>
  ) : (
    <div className="card lobby-card" id="friends">
      {body}
    </div>
  );
}

// ---- identity and another device ----------------------------------------------------

/**
 * Guest-identity recovery codes are specifically for an anonymous guest
 * identity that was never password-protected (ADR 0006), not a weaker,
 * password-free side door into an account (ADR 0010). When this browser is
 * signed in, "Generate" is hidden rather than left to fail server-side; the
 * server refuses it either way.
 */
export function IdentityPanel({ accountName }: { accountName: string | null }) {
  const [code, setCode] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const generate = async () => {
    const { code } = await createRecoveryCode();
    setCode(code);
  };

  const recover = async () => {
    const result = await redeemRecoveryCode(redeem.trim());
    setStatus(result.message ?? (result.ok ? "Recovered." : "That code didn't work."));
    if (result.ok) setTimeout(() => location.reload(), 800);
  };

  return (
    <details className="card lobby-card">
      <summary>Identity and another device</summary>
      {accountName ? (
        <p className="lobby-hint">
          You're signed in as <strong>{accountName}</strong>. Reach this account from another device by signing in there
          with its username and password — recovery codes are only for an anonymous guest identity, never a shortcut into
          a password-protected account. Sign out first if you want to switch this browser to a guest identity by code.
        </p>
      ) : (
        <>
          <p className="lobby-hint">
            You don't need an account to build. If you want to reach the same rooms and friends from a second device,
            generate a one-time code here and enter it there — it only works once.
          </p>
          <div className="field-row">
            <button className="btn btn-small" onClick={() => void generate()}>
              Generate a recovery code
            </button>
            {code && <input readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Your recovery code" />}
          </div>
          <div className="field-row">
            <input value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="Enter a code from another device" aria-label="Recovery code to redeem" />
            <button className="btn btn-small" onClick={() => void recover()} aria-disabled={!redeem.trim()}>
              Use it here
            </button>
          </div>
        </>
      )}
      {status && <p className="lobby-hint" role="status">{status}</p>}
    </details>
  );
}
