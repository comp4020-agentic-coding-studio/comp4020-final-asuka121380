import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { partDef, type PartDefinition } from "../domain/catalog.ts";
import { COLOURS, colourName } from "../domain/colours.ts";
import { Workbench } from "./scene/Workbench.tsx";
import { pictures, type Pictures } from "./scene/thumbnails.ts";
import {
  catalog,
  choosePart,
  cycle,
  getState,
  lift,
  moveAnchor,
  placeHeld,
  preview,
  putDown,
  recolourSelected,
  remove,
  requestCamera,
  retry,
  rotate,
  scene,
  select,
  setColour,
  toggleDelete,
  useApp,
} from "./state/store.ts";

// a touch screen gets "tap" wording, and the two-tap confirmations spelled out
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

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
      return (
        <span className="chip chip-error">
          Couldn't load ({save.message}) <button onClick={() => location.reload()}>Reload</button>
        </span>
      );
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

function Swatches({ value, onPick, label }: { value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {COLOURS.map((c) => (
        <button
          key={c.id}
          role="radio"
          aria-checked={value === c.id}
          aria-label={c.name}
          title={c.name}
          className="swatch"
          style={{ background: c.hex }}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );
}

/** Step through the placed parts, newest last: the buttons for [ and ]. */
function Step() {
  return (
    <span className="step">
      <button onClick={() => cycle(-1)} aria-label="Previous part" title="Previous part">
        ‹ <kbd>[</kbd>
      </button>
      <button onClick={() => cycle(1)} aria-label="Next part" title="Next part">
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
            <button className="danger" onClick={() => !saving && void remove(target.id)} aria-disabled={saving}>
              Remove it <kbd>Enter</kbd>
            </button>
          )}
          <Step />
          <button onClick={() => toggleDelete(false)}>
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
            className="primary place-button"
            aria-disabled={!pv || !!pv.rejection || saving}
            onClick={() => !saving && void placeHeld()}
          >
            Place <kbd>Enter</kbd>
          </button>
          <button onClick={() => void rotate()} disabled={def.rotations.length < 2}>
            Rotate <kbd>R</kbd>
          </button>
          <button onClick={putDown}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
        <details className="nudge">
          <summary>Fine-tune</summary>
          <div className="nudge-pad">
            <button onClick={() => moveAnchor(-1, 0)} aria-label="Move preview left">←</button>
            <button onClick={() => moveAnchor(0, -1)} aria-label="Move preview back">↑</button>
            <button onClick={() => moveAnchor(0, 1)} aria-label="Move preview forward">↓</button>
            <button onClick={() => moveAnchor(1, 0)} aria-label="Move preview right">→</button>
            <button onClick={() => lift(1)} aria-label="Raise preview one plate">Raise</button>
            <button onClick={() => lift(-1)} aria-label="Lower preview one plate">Lower</button>
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
          <button onClick={() => !saving && void rotate()} disabled={def.rotations.length < 2} aria-disabled={saving}>
            Rotate <kbd>R</kbd>
          </button>
          <button className="danger" onClick={() => !saving && void remove(selected.id)} aria-disabled={saving}>
            Delete <kbd>Del</kbd>
          </button>
          <Step />
          <button onClick={() => select(null)}>
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
                className={`part${held === def.id ? " held" : ""}${left === 0 ? " empty" : ""}`}
                aria-pressed={held === def.id}
                aria-label={`${def.name}, ${left} left`}
                title={`${def.name} (${def.code})`}
                onClick={(e) => {
                  choosePart(def.id);
                  // chosen from the keyboard: start the preview mid-plot and hand focus
                  // to Place, so Enter places rather than choosing the part again
                  if (e.detail === 0 && getState().held) {
                    if (!getState().held!.anchor) moveAnchor(0, 0);
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
          <p className="fineprint">
            Your build is saved on the server against this browser. Clearing this site's cookies, or another device, starts
            afresh: there are no accounts.
          </p>
        </div>
      )}
    </>
  );
}

export function App() {
  const deleting = useApp((s) => s.deleting);
  const placed = useApp((s) => s.snapshot?.parts.length ?? 0);
  const [pics, setPics] = useState<Pictures | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);
  const [targetOpen, setTargetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [reserve, setReserve] = useState(0);

  useEffect(() => {
    void pictures(scene.reference).then(setPics);
  }, []);
  useLayoutEffect(() => {
    const el = dockRef.current!;
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

  return (
    <div className="app" style={{ "--dock-h": `${dockHeight}px` } as CSSProperties}>
      <div className="stage" role="img" aria-label={`The street, with your plot of ${scene.bounds.w} by ${scene.bounds.d} studs; ${placed} parts placed.`}>
        <Workbench dock={reserve} />
      </div>

      <header className="overlay overlay-left">
        <h1 className="chip chip-title">
          Street 01 <span className="sub">working title</span>
        </h1>
        <Target pics={pics} open={targetOpen} onToggle={() => setTargetOpen((o) => !o)} />
      </header>

      <nav className="overlay overlay-right" aria-label="View and status">
        <SaveStatus />
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
            <button className={`delete-tool${deleting ? " on" : ""}`} aria-pressed={deleting} aria-label="Delete tool" onClick={() => toggleDelete()}>
              <span aria-hidden="true">⌫</span> <span className="label">Delete tool</span> <kbd>D</kbd>
            </button>
            <button
              className="fold"
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
