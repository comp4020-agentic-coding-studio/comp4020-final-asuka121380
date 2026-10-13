import { useEffect, useState } from "react";
import { sceneInfo } from "../scenes/registry.ts";
import { STREET_SCENE as scene } from "../../domain/scene.ts";
import { brandMark } from "../ui/iso.ts";
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
  publicLobby,
  redeemRecoveryCode,
  respondToFriendRequest,
  respondToInvite,
  sendFriendRequest,
  whoAmI,
  type FriendRequest,
  type JoinCode,
  type LobbyRoom,
  type MyRoom,
  type RoomInvite,
} from "../state/api.ts";

// The room lobby (ADR 0007), at /build/. A player creates a room (public or
// invite-only, with its publication setting), joins a public one, resumes
// one of their own rooms, or acts on a friend request or room invitation.
// Joining a room goes straight into its editor at /build/room/:id.

const info = sceneInfo(scene.id);
const MARK = brandMark();

const short = (id: string): string => id.slice(0, 8);

const JOIN_MESSAGE: Record<JoinCode, string> = {
  room_full: "That room is full right now.",
  forbidden: "That room is invite-only, and you don't have an accepted invitation.",
  not_found: "That room doesn't exist (or isn't public).",
};

/** Solo building stays immediately usable (the brief): one click reaches your own private room, same as C8's single build. */
function BuildAlone({ onOpen }: { onOpen: (roomId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const { roomId } = await myDefaultRoom();
    onOpen(roomId);
  };
  return (
    <div className="card lobby-card lobby-card-solo">
      <h2>Build on your own</h2>
      <p className="lobby-hint">Your own private plot, saved as you go. No one else can join it.</p>
      <button className="btn btn-yellow btn-big" onClick={() => void open()} aria-disabled={busy}>
        {busy ? "Opening…" : "Build alone"}
      </button>
    </div>
  );
}

function CreateRoom({ onCreated }: { onCreated: (roomId: string) => void }) {
  const [visibility, setVisibility] = useState<"public" | "invite_only">("public");
  const [allowPublish, setAllowPublish] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the author's policy (ADR 0009): default on for public, off for
  // invite-only, but always a real, visible, independent choice
  const onVisibility = (v: "public" | "invite_only") => {
    setVisibility(v);
    setAllowPublish(v === "public");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(visibility, allowPublish, label.trim() || undefined);
      onCreated(room.roomId);
    } catch {
      setError("Couldn't create the room; try again.");
      setBusy(false);
    }
  };

  return (
    <div className="card lobby-card">
      <h2>Start a room</h2>
      <label className="field">
        <span>Room name (optional)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Saturday build" maxLength={80} />
      </label>
      <fieldset className="field">
        <legend>Who can join</legend>
        <label className="radio-row">
          <input type="radio" name="visibility" checked={visibility === "public"} onChange={() => onVisibility("public")} />
          <span>
            <strong>Public</strong> — listed in the lobby below, anyone can join while there's room.
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="visibility" checked={visibility === "invite_only"} onChange={() => onVisibility("invite_only")} />
          <span>
            <strong>Invite-only</strong> — unlisted; only people you invite (who must already be a friend) can join.
          </span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={allowPublish} onChange={(e) => setAllowPublish(e.target.checked)} />
        <span>
          Let any member publish a saved copy of this room to the public showcase. Fixed once the room is created
          {visibility === "invite_only" && allowPublish && " — unusual for an invite-only room, but your choice"}.
        </span>
      </label>
      {error && <p className="lobby-error">{error}</p>}
      <button className="btn btn-red" onClick={() => void submit()} aria-disabled={busy}>
        {busy ? "Creating…" : "Create and open"}
      </button>
    </div>
  );
}

function JoinByCode({ onJoined }: { onJoined: (roomId: string) => void }) {
  const [id, setId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const roomId = id.trim();
    if (!roomId) return;
    setBusy(true);
    setStatus(null);
    const result = await joinRoom(roomId);
    setBusy(false);
    if (result.ok) onJoined(roomId);
    else setStatus(JOIN_MESSAGE[result.code]);
  };

  return (
    <div className="card lobby-card">
      <h2>Join a room by its code</h2>
      <p className="lobby-hint">Paste the room id a friend shared with you (or that you see in its web address).</p>
      <div className="field-row">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Room id" aria-label="Room id" />
        <button className="btn btn-red" onClick={() => void submit()} aria-disabled={busy || !id.trim()}>
          Join
        </button>
      </div>
      {status && <p className="lobby-error" role="status">{status}</p>}
    </div>
  );
}

function PublicLobbyList({ onJoined }: { onJoined: (roomId: string) => void }) {
  const [rooms, setRooms] = useState<LobbyRoom[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const refresh = () => void publicLobby().then(setRooms);
  useEffect(() => {
    refresh();
    // honest, real occupancy, polled rather than pushed: the lobby itself
    // isn't a "room" with its own SSE stream (ADR 0008 scopes realtime to a
    // joined room), so this is a plain periodic refresh, never fabricated
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  const join = async (roomId: string) => {
    setJoining(roomId);
    setStatus(null);
    const result = await joinRoom(roomId);
    setJoining(null);
    if (result.ok) onJoined(roomId);
    else setStatus(JOIN_MESSAGE[result.code]);
  };

  return (
    <div className="card lobby-card">
      <h2>Public lobby</h2>
      {status && <p className="lobby-error" role="status">{status}</p>}
      {rooms === null ? (
        <p className="lobby-hint">Loading…</p>
      ) : rooms.length === 0 ? (
        <p className="lobby-hint">No public rooms right now. Start one above.</p>
      ) : (
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.id} className="room-row">
              <span className="room-name">{r.label || `Room ${short(r.id)}`}</span>
              <span className="room-meta">
                {r.occupancy}/{r.capacity} here
              </span>
              <button className="btn btn-small" onClick={() => void join(r.id)} aria-disabled={joining === r.id || r.occupancy >= r.capacity}>
                {r.occupancy >= r.capacity ? "Full" : joining === r.id ? "Joining…" : "Join"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyRooms({ onOpen }: { onOpen: (roomId: string) => void }) {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  useEffect(() => void myRooms().then(setRooms), []);
  if (rooms === null) return null;
  if (rooms.length === 0) return null;
  return (
    <div className="card lobby-card">
      <h2>Your rooms</h2>
      <ul className="room-list">
        {rooms.map((r) => (
          <li key={r.id} className="room-row">
            <span className="room-name">
              {r.isDefault ? "Your solo build" : r.label || `Room ${short(r.id)}`}
              {r.isHost && !r.isDefault && <span className="tag room-tag">Host</span>}
              <span className="tag room-tag room-tag-muted">{r.visibility === "public" ? "Public" : "Invite-only"}</span>
            </span>
            <button className="btn btn-small btn-red" onClick={() => onOpen(r.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Invites({ onJoined }: { onJoined: (roomId: string) => void }) {
  const [invites, setInvites] = useState<RoomInvite[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const refresh = () => void myInvites().then(setInvites);
  useEffect(refresh, []);
  if (invites === null || invites.length === 0) return null;
  const respond = async (id: string, roomId: string, accept: boolean) => {
    const result = await respondToInvite(id, accept);
    if (accept && result.ok) {
      onJoined(roomId); // accepting admits you straight away; go there
      return;
    }
    if (accept && !result.ok) setStatus(result.code === "room_full" ? "That room is full now." : "Couldn't accept it; try again.");
    refresh();
  };
  return (
    <div className="card lobby-card">
      <h2>Room invitations</h2>
      {status && <p className="lobby-error" role="status">{status}</p>}
      <ul className="room-list">
        {invites.map((i) => (
          <li key={i.id} className="room-row">
            <span className="room-name">{i.label || `Room ${short(i.roomId)}`} from {short(i.invitedBy)}</span>
            <span className="field-row">
              <button className="btn btn-small btn-red" onClick={() => void respond(i.id, i.roomId, true)}>
                Accept
              </button>
              <button className="btn btn-small btn-danger danger" onClick={() => void respond(i.id, i.roomId, false)}>
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Friends({ selfId }: { selfId: string | null }) {
  const [friends, setFriends] = useState<string[] | null>(null);
  const [pending, setPending] = useState<FriendRequest[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [openToken, setOpenToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => void myFriends().then((r) => { setFriends(r.friends); setPending(r.pending); });
  useEffect(refresh, []);

  const makeLink = async () => {
    const { token } = await createFriendLink();
    setLink(`${location.origin}/build/?friend=${token}`);
  };

  const respond = async (id: string, accept: boolean) => {
    await respondToFriendRequest(id, accept);
    refresh();
  };

  const openByToken = async () => {
    const token = openToken.trim();
    if (!token) return;
    const result = await openFriendLink(token);
    if (!result.ok || !result.requestId) {
      setStatus(result.code === "self" ? "That's your own link." : result.code === "already_friends" ? "You're already friends." : "That link isn't valid.");
      return;
    }
    const sent = await sendFriendRequestFromLink(result.requestId, true);
    setStatus(sent ? "Friend request accepted." : "Couldn't accept it; try again.");
    refresh();
  };

  // accepting a link reuses the same respond endpoint as a direct request
  const sendFriendRequestFromLink = async (requestId: string, accept: boolean): Promise<boolean> => {
    const r = await respondToFriendRequest(requestId, accept);
    return r.ok;
  };

  return (
    <div className="card lobby-card">
      <h2>Friends</h2>
      <p className="lobby-hint">Friendship never opens an invite-only room by itself; you still need a specific invitation.</p>
      {pending.length > 0 && (
        <ul className="room-list">
          {pending.map((p) => (
            <li key={p.id} className="room-row">
              <span className="room-name">Friend request from {short(p.fromVisitor)}</span>
              <span className="field-row">
                <button className="btn btn-small btn-red" onClick={() => void respond(p.id, true)}>
                  Accept
                </button>
                <button className="btn btn-small btn-danger danger" onClick={() => void respond(p.id, false)}>
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="lobby-hint">
        {friends === null ? "" : friends.length === 0 ? "No friends yet." : `${friends.length} friend${friends.length === 1 ? "" : "s"}.`}
      </p>
      <div className="field-row">
        <button className="btn btn-small" onClick={() => void makeLink()}>
          Get a friend-request link
        </button>
        {link && (
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Your friend-request link" />
        )}
      </div>
      <div className="field-row">
        <input value={openToken} onChange={(e) => setOpenToken(e.target.value)} placeholder="Paste a friend's link token" aria-label="Friend link token" />
        <button className="btn btn-small" onClick={() => void openByToken()} aria-disabled={!openToken.trim()}>
          Use it
        </button>
      </div>
      {status && <p className="lobby-error" role="status">{status}</p>}
      {selfId && <p className="lobby-hint fineprint">Your id, for inviting you directly: {selfId}</p>}
    </div>
  );
}

function IdentityPanel() {
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
      <p className="lobby-hint">
        You don't need an account to build. If you want to reach the same rooms and friends from a second device, generate
        a one-time code here and enter it there — it only works once.
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
      {status && <p className="lobby-hint" role="status">{status}</p>}
    </details>
  );
}

export function LobbyApp() {
  const [selfId, setSelfId] = useState<string | null>(null);
  useEffect(() => void whoAmI().then((r) => setSelfId(r.visitorId)), []);

  const goTo = (roomId: string) => {
    // the browser test harness's ?debug flag (and any future query param)
    // carries through from the lobby into the editor it opens
    location.href = `/build/room/${roomId}${location.search}`;
  };

  return (
    <div className="lobby">
      <header className="lobby-header">
        <a className="brand home-link" href="/" title="Home" aria-label="Brick Commons (working title): home">
          <span className="mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARK }} />
          <span className="brand-name">Brick Commons</span>
        </a>
        <h1>{info?.title ?? scene.id}: choose a room</h1>
        <p className="lobby-hint">
          Up to {scene.maxPlayers} people share one room's inventory and construction. Plans and marks let you suggest
          ideas without spending anyone's stock.
        </p>
      </header>
      <main className="lobby-grid">
        <BuildAlone onOpen={goTo} />
        <Invites onJoined={goTo} />
        <MyRooms onOpen={goTo} />
        <CreateRoom onCreated={goTo} />
        <JoinByCode onJoined={goTo} />
        <PublicLobbyList onJoined={goTo} />
        <Friends selfId={selfId} />
        <IdentityPanel />
      </main>
    </div>
  );
}
