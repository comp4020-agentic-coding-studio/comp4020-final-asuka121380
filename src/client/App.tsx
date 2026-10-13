import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { partDef, type PartDefinition } from "../domain/catalog.ts";
import { COLOURS, colourName } from "../domain/colours.ts";
import { sceneInfo } from "./scenes/registry.ts";
import { brandMark } from "./ui/iso.ts";
import { Workbench } from "./scene/Workbench.tsx";
import { pictures, type Pictures } from "./scene/thumbnails.ts";
import { inviteToRoom, leaveRoom, saveRoom } from "./state/api.ts";
import {
  catalog,
  choosePart,
  cycle,
  ensureAnchor,
  getRoomId,
  getState,
  markPlanForEveryone,
  moveOnScreen,
  placeHeld,
  preview,
  proposeHeld,
  putDown,
  realizePlan,
  recolourSelected,
  remove,
  requestCamera,
  retry,
  rotate,
  scene,
  select,
  selectPlan,
  setColour,
  stepLevel,
  toggleDelete,
  useApp,
  withdrawPlan,
} from "./state/store.ts";

// a touch screen gets "tap" wording, and the two-tap confirmations spelled out
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// the scene's suggested colours come first; every colour stays available
const info = sceneInfo(scene.id);
const SUGGESTED = (info?.suggestedColours ?? []).map((id) => COLOURS.find((c) => c.id === id)!).filter(Boolean);
const OTHERS = COLOURS.filter((c) => !SUGGESTED.includes(c));

const GROUPS: { id: "all" | PartDefinition["group"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bricks", label: "Bricks" },
  { id: "roofs", label: "Roofs" },
  { id: "openings", label: "Windows & doors" },
  { id: "details", label: "Details" },
];

function SaveStatus() {
  const save = useApp((s) => s.save);
  const durable = useApp((s) => s.durable);
  if (!durable) return <span className="chip chip-warn">Preview: not saved</span>;
  switch (save.status) {
    case "loading":
      return <span className="chip">Loading your build…</span>;
    case "load-failed":
      return null; // the full-page AccessScreen (App) covers this case
    case "saving":
      return <span className="chip">Saving…</span>;
    case "saved":
      return <span className="chip chip-ok">✓ Saved</span>;
    case "failed":
      return (
        <span className="chip chip-error">
          Not saved ({save.message}) <button onClick={retry}>Retry</button>
        </span>
      );
  }
}

/** The realtime stream's own state (ADR 0008): independent of whether a command can still be sent over plain HTTP. */
function ConnectionChip() {
  const connection = useApp((s) => s.connection);
  const durable = useApp((s) => s.durable);
  if (!durable || connection === "connected") return null;
  if (connection === "reconnecting") return <span className="chip chip-warn">Reconnecting…</span>;
  if (connection === "offline") return <span className="chip chip-warn">Live updates paused</span>;
  return null; // "connecting": the initial SaveStatus "Loading…" already covers this moment
}

function Swatches({ value, onPick, label }: { value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {[SUGGESTED, OTHERS].map((list, i) => (
        <span key={i} className="swatch-run">
          {list.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={value === c.id}
              aria-label={c.name}
              title={c.name}
              className="stud-swatch swatch"
              style={{ "--c": c.hex } as CSSProperties}
              onClick={() => onPick(c.id)}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

/**
 * The preview's height, and the buttons that step it through the heights
 * that fit here: how a lower spot under an overhang is reached (ADR 0005).
 */
function Height({ y, fits }: { y: number; fits: number[] }) {
  const i = fits.indexOf(y);
  const where = y === 0 ? "on the plot" : `${y} plate${y === 1 ? "" : "s"} up`;
  return (
    <div className="height" role="group" aria-label="Height">
      <button className="btn btn-small" onClick={() => stepLevel(-1)} aria-label="Lower: the next height down that fits" disabled={!fits.some((f) => f < y)}>
        ▼ Lower <kbd>PgDn</kbd>
      </button>
      <span className="height-readout" aria-live="polite">
        {where}
        {fits.length > 1 && i >= 0 && <span className="height-of"> · height {i + 1} of {fits.length}</span>}
      </span>
      <button className="btn btn-small" onClick={() => stepLevel(1)} aria-label="Higher: the next height up that fits" disabled={!fits.some((f) => f > y)}>
        ▲ Higher <kbd>PgUp</kbd>
      </button>
    </div>
  );
}

/** Step through the placed parts, newest last: the buttons for [ and ]. */
function Step() {
  return (
    <span className="step">
      <button className="btn btn-small" onClick={() => cycle(-1)} aria-label="Previous part" title="Previous part">
        ‹ <kbd>[</kbd>
      </button>
      <button className="btn btn-small" onClick={() => cycle(1)} aria-label="Next part" title="Next part">
        <kbd>]</kbd> ›
      </button>
    </span>
  );
}

/** The dock's top row: what a click does right now, and the controls for it. */
function Context() {
  const held = useApp((s) => s.held);
  const colour = useApp((s) => s.colour);
  const snapshot = useApp((s) => s.snapshot);
  const selected = useApp((s) => s.snapshot?.parts.find((p) => p.id === s.selectedId));
  const selectedPlan = useApp((s) => s.snapshot?.plans.find((p) => p.id === s.selectedPlanId));
  const deleting = useApp((s) => s.deleting);
  const target = useApp((s) => s.snapshot?.parts.find((p) => p.id === s.targetId));
  const saving = useApp((s) => s.save.status === "saving");

  if (deleting) {
    const def = target && partDef(target.partId);
    return (
      <div className="context">
        <strong className="context-title danger">Delete tool</strong>
        <span className="context-hint" aria-live="polite">
          {def
            ? `${coarse ? "Tap it again to remove" : "Click to remove"}: ${def.name} (${def.code})`
            : `${coarse ? "Tap" : "Click"} a part to remove it; it goes back in your kit.`}
        </span>
        <div className="context-actions">
          {target && (
            <button className="btn btn-small btn-danger danger" onClick={() => !saving && void remove(target.id)} aria-disabled={saving}>
              Remove it <kbd>Enter</kbd>
            </button>
          )}
          <Step />
          <button className="btn btn-small" onClick={() => toggleDelete(false)}>
            Done <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    );
  }

  if (held) {
    const def = partDef(held.partId)!;
    const pv = held.anchor && snapshot ? preview(getState()) : null;
    return (
      <div className="context">
        <strong className="context-title">
          {def.name} <span className="code">{def.code}</span>
        </strong>
        <Swatches value={colour} onPick={setColour} label={`Colour${def.colourRegion ? ` of the ${def.colourRegion}` : ""}`} />
        <span className={`context-hint${pv?.rejection ? " bad" : ""}`} aria-live="polite">
          {!pv
            ? coarse
              ? "Tap the plot to preview it."
              : "Point at the plot, or use the arrow keys."
            : pv.rejection
              ? `✕ ${pv.rejection.message}`
              : coarse
                ? "✓ Fits. Tap the preview to place it."
                : "✓ Fits here."}
        </span>
        <div className="context-actions">
          {/* aria-disabled, not disabled: it keeps keyboard focus, and pressing it says why it can't place */}
          <button
            className="btn btn-small btn-red primary place-button"
            aria-disabled={!pv || !!pv.rejection || saving}
            onClick={() => !saving && void placeHeld()}
          >
            Place <kbd>Enter</kbd>
          </button>
          <button className="btn btn-small" onClick={() => void rotate()} disabled={def.rotations.length < 2}>
            Rotate <kbd>R</kbd>
          </button>
          <button className="btn btn-small" onClick={putDown}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
        {/* a plan costs no stock and never blocks real construction (ADR 0009) */}
        <button className="btn btn-small" aria-disabled={!pv || saving} onClick={() => !saving && void proposeHeld()} title="Show others a transparent suggestion, without placing it or spending stock">
          Propose instead
        </button>
        {pv && <Height y={pv.placement.y} fits={pv.fits} />}
        <details className="nudge">
          <summary>Move</summary>
          {/* the same screen-relative steps as the arrow keys (ADR 0005) */}
          <div className="nudge-pad">
            <button className="btn btn-small" onClick={() => moveOnScreen(-1, 0)} aria-label="Move preview left on screen" title="Left">←</button>
            <button className="btn btn-small" onClick={() => moveOnScreen(0, 1)} aria-label="Move preview away from you" title="Away">↑</button>
            <button className="btn btn-small" onClick={() => moveOnScreen(0, -1)} aria-label="Move preview towards you" title="Towards you">↓</button>
            <button className="btn btn-small" onClick={() => moveOnScreen(1, 0)} aria-label="Move preview right on screen" title="Right">→</button>
          </div>
        </details>
      </div>
    );
  }

  if (selected) {
    const def = partDef(selected.partId)!;
    return (
      <div className="context">
        <strong className="context-title">
          {def.name} <span className="code">{def.code}</span>
          <span className="context-sub">{colourName(selected.colour)}</span>
        </strong>
        <Swatches value={selected.colour} onPick={(c) => void recolourSelected(c)} label={`Recolour the ${def.colourRegion ?? "part"}`} />
        <div className="context-actions">
          {/* aria-disabled while saving, not disabled: a disabled button drops keyboard focus */}
          <button className="btn btn-small" onClick={() => !saving && void rotate()} disabled={def.rotations.length < 2} aria-disabled={saving}>
            Rotate <kbd>R</kbd>
          </button>
          <button className="btn btn-small btn-danger danger" onClick={() => !saving && void remove(selected.id)} aria-disabled={saving}>
            Delete <kbd>Del</kbd>
          </button>
          <Step />
          <button className="btn btn-small" onClick={() => select(null)}>
            Deselect <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    );
  }

  if (selectedPlan) {
    const def = partDef(selectedPlan.partId)!;
    return (
      <div className="context">
        <strong className="context-title">
          Proposed {def.name} <span className="code">{def.code}</span>
          <span className="context-sub">suggested {colourName(selectedPlan.colour)}</span>
        </strong>
        <span className="context-hint" aria-live="polite">
          A plan costs no stock and never blocks real building. Anyone can build it, or ask the room to look at it.
        </span>
        <div className="context-actions">
          <button className="btn btn-small btn-red" onClick={() => !saving && void realizePlan(selectedPlan.id)} aria-disabled={saving}>
            Build this <kbd>Enter</kbd>
          </button>
          <button className="btn btn-small" onClick={() => void markPlanForEveryone(selectedPlan.id)}>
            Mark for everyone
          </button>
          <button className="btn btn-small btn-danger danger" onClick={() => !saving && void withdrawPlan(selectedPlan.id)} aria-disabled={saving}>
            Withdraw
          </button>
          <button className="btn btn-small" onClick={() => selectPlan(null)}>
            Deselect <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="context">
      <span className="context-hint">
        <span className="wide-only">Choose a part below to build with, or click a part you've placed to change it.</span>
        <span className="narrow-only">Pick a part, or tap one you've placed.</span>
      </span>
    </div>
  );
}

function Tray({ pics }: { pics: Pictures | null }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("all");
  const held = useApp((s) => s.held?.partId);
  const inventory = useApp((s) => s.snapshot?.inventory);
  const shown = catalog.filter((d) => group === "all" || d.group === group);
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Part groups">
        {GROUPS.map((g) => (
          <button key={g.id} role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <ul className="tray" aria-label="Parts in your kit">
        {shown.map((def) => {
          const left = inventory?.[def.id] ?? 0;
          return (
            <li key={def.id}>
              <button
                className={`tile part${held === def.id ? " held" : ""}${left === 0 ? " empty" : ""}`}
                aria-pressed={held === def.id}
                aria-label={`${def.name}, ${left} left`}
                title={`${def.name} (${def.code})`}
                onClick={(e) => {
                  choosePart(def.id);
                  // chosen from the keyboard: start the preview mid-plot and hand focus
                  // to Place, so Enter places rather than choosing the part again
                  if (e.detail === 0 && getState().held) {
                    ensureAnchor();
                    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".place-button")?.focus());
                  }
                }}
              >
                {pics ? <img src={pics.parts[def.id]} alt="" width={64} height={64} /> : <span className="thumb-wait" />}
                <span className="count">×{left}</span>
                <span className="name">{def.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Notice() {
  const notice = useApp((s) => s.notice);
  return (
    <p className={`notice${notice?.kind === "error" ? " notice-error" : ""}`} role="status" aria-live="polite">
      {notice?.text ?? ""}
    </p>
  );
}

function Target({ pics, open, onToggle }: { pics: Pictures | null; open: boolean; onToggle: () => void }) {
  return (
    <div className="target">
      <button className="chip-button" aria-expanded={open} onClick={onToggle}>
        {open ? "Hide target" : "Target house"}
      </button>
      {open && (
        <figure className="target-card">
          <div className="target-head">
            <span className="target-step" aria-hidden="true">
              1
            </span>
            <span>The target</span>
          </div>
          {pics ? (
            <img src={pics.target} alt="The target: a small house with a pointed roof, a door between two walls, and a tree beside it." width={360} height={300} />
          ) : (
            <span className="thumb-wait" />
          )}
          <figcaption>What this kit was drawn from. Build it, change it, or make something else: the colours are only a suggestion.</figcaption>
        </figure>
      )}
    </div>
  );
}

function Help({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      <button className="chip-button" aria-expanded={open} aria-label="Help" onClick={onToggle}>
        ?
      </button>
      {open && (
        <div className="help" role="dialog" aria-label="How to build">
          <h2>How to build</h2>
          <p>
            Pick a part from the tray, then click the plot. It snaps onto the studs underneath and stays in your hand for
            the next one. On a touch screen, tap once to preview and again to place.
          </p>
          <p>
            Click a part you've placed to recolour, turn or delete it. Parts need studs under them, and you can't remove a
            part that something rests on alone: take things off from the top down.
          </p>
          <h3>Camera</h3>
          <p>Drag to look around, right-drag or shift-drag to slide, scroll or pinch to zoom. Dragging never builds or deletes.</p>
          <h3>Keys</h3>
          <dl className="keys">
            <dt>Arrows</dt>
            <dd>move the preview</dd>
            <dt>PgUp / PgDn</dt>
            <dd>raise / lower it</dd>
            <dt>R</dt>
            <dd>rotate the preview or the selected part</dd>
            <dt>Enter</dt>
            <dd>place, or remove the delete target</dd>
            <dt>Esc</dt>
            <dd>cancel, deselect, leave the delete tool</dd>
            <dt>[ / ]</dt>
            <dd>step through placed parts</dd>
            <dt>Del</dt>
            <dd>delete the selected part</dd>
            <dt>D</dt>
            <dd>delete tool on or off</dd>
            <dt>T / Home</dt>
            <dd>top view / reset view</dd>
          </dl>
          <h3>Plans and marks</h3>
          <p>
            Propose instead of placing to show a transparent suggestion that costs no stock. Anyone can build a plan, or
            mark it for everyone, which briefly highlights it for other people in the room.
          </p>
          <p className="fineprint">
            Your build is saved on the server against this browser. Clearing this site's cookies starts afresh unless
            you've generated a recovery code from the room lobby.
          </p>
        </div>
      )}
    </>
  );
}

/** Current members (live presence) and permanent contributors (ADR 0007/0009), kept visibly distinct. */
function RoomPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const snapshot = useApp((s) => s.snapshot);
  const selfId = useApp((s) => s.selfId);
  const roomId = getRoomId();
  const [inviteTo, setInviteTo] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savedSnapshotId, setSavedSnapshotId] = useState<string | null>(null);

  if (!snapshot || !roomId) return null; // the default-room path has no room to show a panel for

  const members = snapshot.members;
  const contributors = snapshot.contributors;
  const active = members.filter((m) => m.active).length;

  const invite = async () => {
    const to = inviteTo.trim();
    if (!to) return;
    const result = await inviteToRoom(roomId, to);
    setInviteStatus(result.ok ? "Invitation sent." : result.message ?? "Couldn't invite them — are they your friend?");
    if (result.ok) setInviteTo("");
  };

  const save = async () => {
    setSaveStatus("Saving a copy…");
    try {
      const summary = await saveRoom(roomId);
      setSavedSnapshotId(summary.id);
      setSaveStatus("Saved to your collection.");
    } catch {
      setSaveStatus("Couldn't save a copy; try again.");
    }
  };

  const leave = async () => {
    await leaveRoom(roomId);
    location.href = "/build/";
  };

  return (
    <>
      <button className="chip-button" aria-expanded={open} onClick={onToggle}>
        Room <span className="room-occupancy">{active}/{snapshot.maxPlayers}</span>
      </button>
      {open && (
        <div className="help room-panel" role="dialog" aria-label="This room">
          <h2>{snapshot.visibility === "public" ? "Public room" : "Invite-only room"}</h2>
          <h3>Here now</h3>
          <ul className="people">
            {members.map((m) => (
              <li key={m.visitorId} className={m.active ? "" : "inactive"}>
                {m.visitorId === selfId ? "You" : m.visitorId.slice(0, 8)}
                {m.isHost && <span className="tag room-tag">Host</span>}
                {!m.active && <span className="room-tag room-tag-muted">away</span>}
              </li>
            ))}
          </ul>
          <h3>Contributors</h3>
          <p className="fineprint">Everyone who has ever placed a real part here, even after leaving.</p>
          {contributors.length === 0 ? (
            <p className="fineprint">No one has placed a part yet.</p>
          ) : (
            <ul className="people">
              {contributors.map((c) => (
                <li key={c.visitorId}>{c.visitorId === selfId ? "You" : c.visitorId.slice(0, 8)}</li>
              ))}
            </ul>
          )}
          {snapshot.visibility === "invite_only" && (
            <>
              <h3>Invite a friend</h3>
              <div className="field-row">
                <input value={inviteTo} onChange={(e) => setInviteTo(e.target.value)} placeholder="Their id (from Friends)" aria-label="Friend's id to invite" />
                <button className="btn btn-small" onClick={() => void invite()} aria-disabled={!inviteTo.trim()}>
                  Invite
                </button>
              </div>
              {inviteStatus && <p className="fineprint" role="status">{inviteStatus}</p>}
            </>
          )}
          <div className="room-panel-actions">
            <button className="btn btn-small" onClick={() => void save()}>
              Save a copy
            </button>
            <button className="btn btn-small btn-danger danger" onClick={() => void leave()}>
              Leave room
            </button>
            <a className="btn btn-small" href="/build/">
              All rooms
            </a>
            <a className="btn btn-small" href="/build/?view=collection">
              My collection
            </a>
          </div>
          {saveStatus && (
            <p className="fineprint" role="status">
              {saveStatus} {savedSnapshotId && <a href={`/build/?snapshot=${savedSnapshotId}`}>View it</a>}
            </p>
          )}
        </div>
      )}
    </>
  );
}

const MARK = brandMark();

/** A full-page state for a room that couldn't be opened at all: access denied, full, or a network failure. */
function AccessScreen({ code, message }: { code?: "access_denied" | "room_full"; message?: string }) {
  const title = code === "access_denied" ? "This room isn't open to you" : code === "room_full" ? "This room is full" : "Couldn't load this room";
  const body =
    code === "access_denied"
      ? "It's invite-only, and you don't have an accepted invitation, or it no longer exists."
      : code === "room_full"
        ? "It's already got as many people as this scene allows. Try again later, or start your own room."
        : message || "Something went wrong reaching the server.";
  return (
    <div className="access-screen">
      <div className="card access-card">
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="context-actions">
          <a className="btn btn-red" href="/build/">
            Back to the room lobby
          </a>
          <button className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const deleting = useApp((s) => s.deleting);
  const placed = useApp((s) => s.snapshot?.parts.length ?? 0);
  const save = useApp((s) => s.save);
  const [pics, setPics] = useState<Pictures | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);
  const [targetOpen, setTargetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [reserve, setReserve] = useState(0);

  useEffect(() => {
    void pictures(scene.reference).then(setPics);
  }, []);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return; // not mounted when the AccessScreen replaces the dock
    // The 3D view keeps the plot above the dock, but reserves only the dock's
    // stable part: the tray and one row of controls. The top row grows and
    // shrinks with what's held or selected, and if the view followed it the
    // scene would shift under a finger between a touch preview and the tap
    // that confirms it. Extra lines of that row float over the street below
    // the plot instead.
    const ro = new ResizeObserver(() => {
      const top = el.querySelector(".dock-top")!.getBoundingClientRect().height;
      const tools = el.querySelector(".dock-tools")!.getBoundingClientRect().height;
      const dock = el.getBoundingClientRect().height;
      setDockHeight(Math.round(dock + 12));
      setReserve(Math.round(dock - top + tools + 12));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A room that couldn't be opened at all (invite-only with no invitation,
  // full, or gone) replaces the whole editor shell, rather than loading a
  // broken 3D view behind an error chip.
  if (save.status === "load-failed") return <AccessScreen code={save.code} message={save.message} />;

  return (
    <div className="app" style={{ "--dock-h": `${dockHeight}px` } as CSSProperties}>
      <div className="stage" role="img" aria-label={`${info?.title ?? "The scene"}, with your plot of ${scene.bounds.w} by ${scene.bounds.d} studs; ${placed} parts placed.`}>
        <Workbench dock={reserve} />
      </div>

      <header className="overlay overlay-left">
        <div className="chip title-chip">
          <a className="brand home-link" href="/" title="Home" aria-label="Brick Commons (working title): home">
            <span className="mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARK }} />
            <span className="brand-name">Brick Commons</span>
          </a>
          <h1 className="chip-title">{info?.title ?? scene.id}</h1>
        </div>
        <Target pics={pics} open={targetOpen} onToggle={() => setTargetOpen((o) => !o)} />
      </header>

      <nav className="overlay overlay-right" aria-label="View and status">
        <SaveStatus />
        <ConnectionChip />
        <RoomPanel open={roomOpen} onToggle={() => setRoomOpen((o) => !o)} />
        <Help open={helpOpen} onToggle={() => setHelpOpen((o) => !o)} />
        <button className="chip-button" onClick={() => requestCamera("top")}>
          Top view <kbd>T</kbd>
        </button>
        <button className="chip-button" onClick={() => requestCamera("reset")}>
          Reset view <kbd>Home</kbd>
        </button>
        <a className="chip-button" href="/readme/">
          About
        </a>
      </nav>

      <Notice />

      <section ref={dockRef} className={`dock${trayOpen ? "" : " folded"}`} aria-label="Building controls">
        <div className="dock-top">
          <Context />
          <div className="dock-tools">
            <button className={`btn btn-small delete-tool${deleting ? " on" : ""}`} aria-pressed={deleting} aria-label="Delete tool" onClick={() => toggleDelete()}>
              <span aria-hidden="true">⌫</span> <span className="label">Delete tool</span> <kbd>D</kbd>
            </button>
            <button
              className="btn btn-small fold"
              aria-expanded={trayOpen}
              aria-label={trayOpen ? "Hide the parts tray" : "Show the parts tray"}
              onClick={() => setTrayOpen((o) => !o)}
            >
              {trayOpen ? "▾" : "▴"}
            </button>
          </div>
        </div>
        {trayOpen && <Tray pics={pics} />}
      </section>
    </div>
  );
}
