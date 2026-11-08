import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { SCENE_LIST, sceneInfo, templateOf } from "../../scenes/registry.ts";
import { ensureIdentity } from "../../state/identity.ts";
import { getSnapshot, mySnapshots, whoAmI, type SnapshotSummary } from "../../state/api.ts";
import { creationSvg } from "../../ui/creationPreview.ts";
import { buildersOf, Friends, Invites, JoinByCode, MyRooms, NEW_ROOM, PublicRooms, RoomSettings, useCreateRoom, useSoloRoom, type RoomDraft } from "../../lobby/parts.tsx";
import { ENTER_EDITOR, StepBack } from "./TablePanel.tsx";

// What each table entrance opens (ADR 0014). The forms and lists are the
// lobby's own components (lobby/parts.tsx), so the table and /build/ never
// disagree about a rule. Opening a panel changes nothing: no room is made,
// no room joined, no link created, no invitation answered. Each of those
// is a button the visitor presses.

/** Into the editor: the one deliberate step from preparing at the table into building. */
export function enterRoom(roomId: string): void {
  const debug = new URLSearchParams(location.search).has("debug") ? "?debug" : "";
  location.href = `/build/room/${roomId}${debug}`;
}

/** Who this browser is, once its identity exists (panels mount inside an IdentityGate). */
function useSelf(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => void whoAmI().then((r) => setId(r.visitorId), () => {}), []);
  return id;
}

// ---- the scene tray: choose how to build ------------------------------------------

type ScenesStep = "choose" | "shared";

/**
 * The scene tray's panel: the playable scenes (ADR 0015), then how to build. Solo
 * opens this visitor's own solo room (created on first use, as the lobby
 * does). Shared opens the room's settings in place; creating it is the
 * final, explicit action. Stepping back keeps what was typed.
 */
export function ScenesPanel() {
  const [sceneId, setSceneId] = useState(SCENE_LIST[0].id);
  const info = sceneInfo(sceneId)!;
  const template = templateOf(info);
  const [step, setStep] = useState<ScenesStep>("choose");
  const [draft, setDraft] = useState<RoomDraft>(NEW_ROOM);
  const solo = useSoloRoom(enterRoom, sceneId);
  const create = useCreateRoom(enterRoom, sceneId);

  // a radio group: one tab stop, arrows move the choice (as native radios do)
  const choose = (i: number) => {
    const next = SCENE_LIST[(i + SCENE_LIST.length) % SCENE_LIST.length];
    flushSync(() => setSceneId(next.id));
    document.getElementById(`scene-option-${next.id}`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") choose(i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") choose(i - 1);
    else if (e.key === "Home") choose(0);
    else if (e.key === "End") choose(SCENE_LIST.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <>
      {/* compact choices: a small cover, the name, its size and builders;
          the chosen one's details follow, then the actions, which stay in
          the same place whichever scene is chosen (ADR 0016) */}
      <div className="scene-cards" role="radiogroup" aria-label="Scene">
        {SCENE_LIST.map((s, i) => {
          const chosen = s.id === sceneId;
          return (
            <button
              key={s.id}
              id={`scene-option-${s.id}`}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              className={`scene-card${chosen ? " is-chosen" : ""}`}
              onClick={() => setSceneId(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              disabled={step !== "choose"}
            >
              <img src={s.cover} alt={s.coverAlt} width={480} height={300} loading="lazy" />
              <span className="scene-card-text">
                <span className="scene-card-title">{s.title}</span>
                <span className="scene-facts">
                  <span className="tag tag-muted">{s.size}</span>
                  <span className="tag tag-muted">{buildersOf(s)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="scene-summary">
        <p className="scene-facts" aria-label={`${info.title}: plot ${template.bounds.w} by ${template.bounds.d} studs, playable`}>
          <span className="tag tag-muted">
            Plot {template.bounds.w}×{template.bounds.d} studs
          </span>
          <span className="tag tag-ok">Playable</span>
        </p>
      </div>

      {step === "choose" ? (
        <>
          <div className="choice-list" role="group" aria-label="How to build">
            <div className="choice">
              <div>
                <h3>Build on your own</h3>
                <p className="kit-help">Your own private plot, saved as you go. No one else can join it.</p>
              </div>
              <button className="btn btn-yellow" onClick={() => void solo.open()} aria-disabled={solo.busy || create.busy}>
                {solo.busy ? "Opening…" : "Build alone"}
              </button>
            </div>
            <div className="choice">
              <div>
                <h3>Start a shared room</h3>
                <p className="kit-help">Up to {template.maxPlayers} people share one plot and one kit of parts.</p>
              </div>
              <button className="btn btn-red" onClick={() => setStep("shared")} aria-disabled={solo.busy}>
                Set up a room
              </button>
            </div>
          </div>
          {solo.error && <p className="kit-error" role="alert">{solo.error}</p>}
          <p className="kit-fine">{ENTER_EDITOR} Nothing is created until you choose.</p>
          {/* every scene's notes share one cell, and only the chosen one is
              shown: the panel keeps one height, so nothing above moves */}
          <div className="scene-about">
            {SCENE_LIST.map((s) => (
              <div key={s.id} className="scene-about-one" aria-hidden={s.id !== sceneId} data-chosen={s.id === sceneId}>
                <h3 className="kit-subhead scene-about-head">About {s.title}</h3>
                <p className="scene-setting">{s.setting}.</p>
                <p className="kit-help">{s.blurb}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <form
          className="room-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create.submit(draft);
          }}
        >
          <StepBack onClick={() => setStep("choose")}>Choose how to build</StepBack>
          <h3>A shared room for {info.title}</h3>
          <RoomSettings draft={draft} onChange={setDraft} name="table-visibility" />
          {create.error && <p className="kit-error" role="alert">{create.error}</p>}
          <div className="kit-actions">
            <button type="submit" className="btn btn-red" aria-disabled={create.busy}>
              {create.busy ? "Creating…" : "Create and open"}
            </button>
            <span className="kit-fine">{ENTER_EDITOR}</span>
          </div>
        </form>
      )}
    </>
  );
}

// ---- the noticeboard: join a room ----------------------------------------------------

type RoomsTab = "public" | "code" | "mine";

/**
 * The noticeboard's panel: public rooms (polled, real occupancy), joining by
 * a code (which waits for the same admission preview a direct link shows),
 * and the visitor's own rooms. Every Join is an explicit press, and the
 * server re-checks admission, capacity, invitations and publication then.
 */
export function RoomsPanel() {
  const [tab, setTab] = useState<RoomsTab>("public");
  const tabs: { id: RoomsTab; label: string }[] = [
    { id: "public", label: "Public rooms" },
    { id: "code", label: "Join by code" },
    { id: "mine", label: "Your rooms" },
  ];
  return (
    <>
      <div className="kit-tabs" role="tablist" aria-label="Rooms">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`rooms-tab-${t.id}`} aria-controls={`rooms-pane-${t.id}`} aria-selected={tab === t.id} className="kit-tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rooms-pane-${tab}`} aria-labelledby={`rooms-tab-${tab}`} className="panel-scroll">
        {tab === "public" && (
          <>
            <p className="kit-help">Rooms people opened to anyone. Each shows its scene, how full it is, and whether members may publish, before you join.</p>
            <PublicRooms onJoined={enterRoom} bare />
          </>
        )}
        {tab === "code" && <JoinByCode onJoined={enterRoom} bare />}
        {tab === "mine" && <MyRooms onOpen={enterRoom} showEmpty bare />}
      </div>
      <p className="kit-fine">Joining {ENTER_EDITOR.toLowerCase()}</p>
    </>
  );
}

// ---- the Friends stand: friends and invitations ---------------------------------------

type FriendsTab = "invites" | "friends";

/**
 * Friends and room invitations, kept apart: a friend is someone you can
 * invite; an invitation is what lets you into an invite-only room. Opening
 * this creates no link, sends nothing and answers nothing.
 */
export function FriendsPanel({ onInvitations }: { onInvitations: (n: number) => void }) {
  const self = useSelf();
  const [tab, setTab] = useState<FriendsTab>("invites");
  const [count, setCount] = useState<number | null>(null);
  const report = (n: number) => {
    setCount(n);
    onInvitations(n);
  };
  return (
    <>
      <div className="kit-tabs" role="tablist" aria-label="Friends and invitations">
        <button type="button" role="tab" id="friends-tab-invites" aria-controls="friends-pane" aria-selected={tab === "invites"} className="kit-tab" onClick={() => setTab("invites")}>
          Invitations{count ? <span className="count">{count}</span> : null}
        </button>
        <button type="button" role="tab" id="friends-tab-friends" aria-controls="friends-pane" aria-selected={tab === "friends"} className="kit-tab" onClick={() => setTab("friends")}>
          Friends
        </button>
      </div>
      <div role="tabpanel" id="friends-pane" aria-labelledby={`friends-tab-${tab}`} className="panel-scroll">
        {tab === "invites" ? (
          <>
            <p className="kit-help">An invitation lets you into one invite-only room. Accepting takes you there.</p>
            <Invites onJoined={enterRoom} selfId={self} showEmpty bare onCount={report} />
          </>
        ) : (
          <>
            <p className="kit-help">Friends can invite each other to rooms. Being friends never opens an invite-only room by itself.</p>
            <Friends selfId={self} bare />
          </>
        )}
      </div>
      {/* keeps the invitation count fresh while the Friends tab is shown */}
      {tab === "friends" && <CountOnly onCount={report} />}
    </>
  );
}

/** Polls the invitation count without drawing the list. */
function CountOnly({ onCount }: { onCount: (n: number) => void }) {
  return (
    <span hidden>
      <Invites onJoined={() => {}} selfId={null} onCount={onCount} />
    </span>
  );
}

// ---- the shelf: saved and published work ---------------------------------------------

type Preview = { s: SnapshotSummary; svg: string | null };

/**
 * The shelf's panel: a small preview of the visitor's own most recent saved
 * versions (drawn from their real parts, no 3D scene), and the two ways on:
 * the whole collection, and the public showcase. An empty collection says
 * so; the shelf's decorative models are never shown as anybody's work.
 */
export function ShelfPanel() {
  const [items, setItems] = useState<Preview[] | null | "failed">(null);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let live = true;
    void ensureIdentity()
      .then(() => mySnapshots())
      .then(async (all) => {
        const recent = [...all].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 3);
        const withPictures = await Promise.all(
          recent.map((s) =>
            getSnapshot(s.id).then(
              (d) => ({ s, svg: creationSvg(d.parts, `A sketch of a version saved ${new Date(s.savedAt).toLocaleDateString()}`) }),
              () => ({ s, svg: null }),
            ),
          ),
        );
        if (!live) return;
        setTotal(all.length);
        setItems(withPictures);
      })
      .catch(() => live && setItems("failed"));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <h3 className="kit-subhead">Your collection</h3>
      {items === null ? (
        <p className="kit-state" role="status">Looking at your shelf…</p>
      ) : items === "failed" ? (
        <p className="kit-error" role="alert">Couldn't load your saved versions; the collection page may still work.</p>
      ) : items.length === 0 ? (
        <p className="kit-state">Nothing saved yet. In a room, "Save a copy" keeps the build as it is right then, and it appears here.</p>
      ) : (
        <ul className="shelf-preview">
          {items.map(({ s, svg }) => (
            <li key={s.id}>
              <a href={`/build/?snapshot=${s.id}`} className="shelf-item">
                <span className="shelf-item-stage">{svg ? <span className="shelf-item-picture" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="kit-fine">Empty plot</span>}</span>
                <span className="shelf-item-label">Saved {new Date(s.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="choice-list">
        <div className="choice">
          <div>
            <h3>My collection</h3>
            <p className="kit-help">{typeof items === "object" && items && total > 0 ? total === 1 ? "Your one saved version, with who built it." : `All ${total} saved versions, with who built them.` : "Every version you save or collect."}</p>
          </div>
          <a className="btn btn-red" href="/build/?view=collection">
            Open
          </a>
        </div>
        <div className="choice">
          <div>
            <h3>Public showcase</h3>
            <p className="kit-help">Creations people chose to publish. Look, save a copy, or continue one.</p>
          </div>
          <a className="btn btn-yellow" href="/build/?view=showcase">
            Browse
          </a>
        </div>
      </div>
      <p className="kit-fine">Both open as pages of their own; "Back to the table" brings you here again.</p>
    </>
  );
}

/** One entrance's panel body, by name: the homepage loads this module only when a panel first opens. */
export function PanelBody({ which, onInvitations }: { which: "scenes" | "rooms" | "friends" | "shelf"; onInvitations: (n: number) => void }) {
  if (which === "scenes") return <ScenesPanel />;
  if (which === "rooms") return <RoomsPanel />;
  if (which === "friends") return <FriendsPanel onInvitations={onInvitations} />;
  return <ShelfPanel />;
}
