import { useState, type KeyboardEvent } from "react";
import { partDef } from "../domain/catalog.ts";
import { COLOURS, colourName } from "../domain/colours.ts";
import {
  cancel,
  catalog,
  choosePart,
  cycleSelection,
  moveAnchor,
  placePreview,
  preview,
  recolourSelected,
  removeSelected,
  retry,
  rotate,
  scene,
  select,
  setTool,
  useApp,
  getState,
} from "./state/store.ts";
import { Workbench, type Framing } from "./scene/Workbench.tsx";

function SaveStatus() {
  const save = useApp((s) => s.save);
  const durable = useApp((s) => s.durable);
  if (!durable) return <span className="status status-local">Preview: not saved</span>;
  switch (save.status) {
    case "loading":
      return <span className="status">Loading your build…</span>;
    case "load-failed":
      return (
        <span className="status status-error">
          Couldn't load your build ({save.message}). <button onClick={() => location.reload()}>Reload</button>
        </span>
      );
    case "saving":
      return <span className="status">Saving…</span>;
    case "saved":
      return <span className="status status-ok">✓ Saved</span>;
    case "failed":
      return (
        <span className="status status-error">
          Not saved ({save.message}). <button onClick={retry}>Retry</button>
        </span>
      );
  }
}

function Tray() {
  const tool = useApp((s) => s.tool);
  const inventory = useApp((s) => s.snapshot?.inventory);
  return (
    <section className="panel" aria-labelledby="parts-heading">
      <h2 id="parts-heading">Parts</h2>
      <ul className="parts" role="list">
        {catalog.map((def) => {
          const left = inventory?.[def.id] ?? 0;
          const chosen = tool.mode === "build" && tool.partId === def.id;
          return (
            <li key={def.id}>
              <button
                className={`part${chosen ? " chosen" : ""}`}
                aria-pressed={chosen}
                onClick={() => choosePart(def.id)}
                title={def.name}
              >
                <span className="code">{def.code}</span>
                <span className="name">{def.name}</span>
                <span className={`count${left === 0 ? " none" : ""}`} aria-label={`${left} left`}>
                  ×{left}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
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

function usePreview() {
  const tool = useApp((s) => s.tool);
  const snapshot = useApp((s) => s.snapshot);
  return tool.anchor && snapshot ? preview(getState()) : null;
}

function PlaceControls() {
  const tool = useApp((s) => s.tool);
  const saving = useApp((s) => s.save.status === "saving");
  const def = partDef(tool.partId)!;
  const pv = usePreview();
  return (
    <section className="panel" aria-labelledby="place-heading">
      <h2 id="place-heading">
        Placing: {def.name} <span className="code">{def.code}</span> · {colourName(tool.colour)}
      </h2>
      <p className={`preview-state${pv?.rejection ? " bad" : ""}`} aria-live="polite">
        {!pv ? "Point at the plot, or use the arrow keys, to preview." : pv.rejection ? `✗ ${pv.rejection.message}` : "✓ Fits here."}
      </p>
      <div className="row">
        <button className="primary" onClick={() => void placePreview()} disabled={!pv || !!pv.rejection || saving}>
          Place <kbd>Enter</kbd>
        </button>
        <button onClick={rotate} disabled={def.rotations.length < 2}>
          Rotate <kbd>R</kbd>
        </button>
        <button onClick={cancel} disabled={!tool.anchor}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </section>
  );
}

function ColourControls() {
  const tool = useApp((s) => s.tool);
  const def = partDef(tool.partId)!;
  return (
    <section className="panel" aria-labelledby="colour-heading">
      <h2 id="colour-heading">
        Colour{def.colourRegion ? ` (${def.colourRegion})` : ""}: {colourName(tool.colour)}
      </h2>
      <Swatches value={tool.colour} onPick={(colour) => setTool({ colour })} label="Colour for the next part" />
    </section>
  );
}

function AdjustControls() {
  const tool = useApp((s) => s.tool);
  return (
    <section className="panel" aria-labelledby="adjust-heading">
      <h2 id="adjust-heading">Move the preview</h2>
      <div className="row nudge">
        <button onClick={() => moveAnchor(-1, 0)} aria-label="Move left">←</button>
        <button onClick={() => moveAnchor(0, -1)} aria-label="Move back">↑</button>
        <button onClick={() => moveAnchor(0, 1)} aria-label="Move forward">↓</button>
        <button onClick={() => moveAnchor(1, 0)} aria-label="Move right">→</button>
      </div>
      <div className="row">
        <button onClick={() => setTool({ lift: tool.lift + 1 })} disabled={!tool.anchor} aria-label="Raise preview one plate">
          Raise <kbd>PgUp</kbd>
        </button>
        <button onClick={() => setTool({ lift: tool.lift - 1 })} disabled={!tool.anchor} aria-label="Lower preview one plate">
          Lower <kbd>PgDn</kbd>
        </button>
      </div>
      <p className="hint">Parts snap onto whatever is underneath. Raise and lower are only for reaching a gap the snap can't.</p>
    </section>
  );
}

function SelectControls() {
  const selectedId = useApp((s) => s.selectedId);
  const part = useApp((s) => s.snapshot?.parts.find((p) => p.id === s.selectedId));
  const saving = useApp((s) => s.save.status === "saving");
  const def = part && partDef(part.partId);
  return (
    <section className="panel" aria-labelledby="select-heading">
      <h2 id="select-heading">Selected part</h2>
      {!part || !def ? (
        <p className="hint">Click or tap a part you've placed, or press <kbd>[</kbd> / <kbd>]</kbd> to step through them.</p>
      ) : (
        <>
          <p>
            <strong>{def.name}</strong> <span className="code">{def.code}</span> · {colourName(part.colour)}
          </p>
          <p className="hint">Recolour{def.colourRegion ? ` (${def.colourRegion})` : ""}:</p>
          <Swatches value={part.colour} onPick={(c) => void recolourSelected(c)} label="Recolour the selected part" />
          <div className="row">
            <button onClick={() => void removeSelected()} disabled={saving}>
              Remove <kbd>Del</kbd>
            </button>
            <button onClick={() => select(null)} disabled={!selectedId}>
              Deselect <kbd>Esc</kbd>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function onKey(e: KeyboardEvent): void {
  const { tool } = getState();
  const handled = (() => {
    switch (e.key) {
      case "ArrowLeft":
        return tool.mode === "build" && (moveAnchor(-1, 0), true);
      case "ArrowRight":
        return tool.mode === "build" && (moveAnchor(1, 0), true);
      case "ArrowUp":
        return tool.mode === "build" && (moveAnchor(0, -1), true);
      case "ArrowDown":
        return tool.mode === "build" && (moveAnchor(0, 1), true);
      case "PageUp":
        return tool.anchor && (setTool({ lift: tool.lift + 1 }), true);
      case "PageDown":
        return tool.anchor && (setTool({ lift: tool.lift - 1 }), true);
      case "r":
      case "R":
        return tool.mode === "build" && (rotate(), true);
      case "Enter":
        return tool.mode === "build" && (void placePreview(), true);
      case "Escape":
        return cancel(), true;
      case "Delete":
      case "Backspace":
        return tool.mode === "select" && (void removeSelected(), true);
      case "[":
        return cycleSelection(-1), true;
      case "]":
        return cycleSelection(1), true;
      case "b":
      case "B":
        return setTool({ mode: "build" }), true;
      case "s":
      case "S":
        return setTool({ mode: "select", anchor: null }), true;
      default:
        return false;
    }
  })();
  if (handled) e.preventDefault();
}

function Notice() {
  const notice = useApp((s) => s.notice);
  return (
    <p className={`notice${notice?.kind === "error" ? " notice-error" : ""}`} role="status" aria-live="polite">
      {notice?.text ?? ""}
    </p>
  );
}

export function App() {
  const mode = useApp((s) => s.tool.mode);
  const placed = useApp((s) => s.snapshot?.parts.length ?? 0);
  const [framing, setFraming] = useState<Framing>(() => (window.innerWidth < 700 ? "plot" : "street"));
  const [resetKey, setResetKey] = useState(0);
  const [trayOpen, setTrayOpen] = useState(true);

  return (
    <div className="app">
      <header className="bar">
        <h1>Brick-built streetscape <span className="sub">working title</span></h1>
        <SaveStatus />
        <nav>
          <a href="/readme/">About</a>
        </nav>
      </header>

      <main
        className="stage"
        tabIndex={0}
        onKeyDown={onKey}
        aria-label={`Build plot, ${scene.bounds.w} by ${scene.bounds.d} studs, ${placed} parts placed. Arrow keys move the preview, R rotates, Enter places, Escape cancels; S to select parts, B to build.`}
      >
        <Workbench framing={framing} resetKey={resetKey} />
        <div className="stage-tools">
          <button onClick={() => setFraming(framing === "plot" ? "street" : "plot")}>
            {framing === "plot" ? "Show the street" : "Focus on the plot"}
          </button>
          <button onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
        </div>
        <Notice />
      </main>

      <aside className={`side${trayOpen ? "" : " closed"}`} aria-label="Building controls" onKeyDown={(e) => e.key === "Escape" && onKey(e)}>
        <button className="tray-toggle" aria-expanded={trayOpen} onClick={() => setTrayOpen((o) => !o)}>
          {trayOpen ? "Hide controls" : "Show controls"}
        </button>
        <div className="modes" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === "build"} onClick={() => setTool({ mode: "build" })}>
            Build <kbd>B</kbd>
          </button>
          <button role="tab" aria-selected={mode === "select"} onClick={() => setTool({ mode: "select", anchor: null })}>
            Select <kbd>S</kbd>
          </button>
        </div>
        {mode === "build" ? (
          <>
            <PlaceControls />
            <Tray />
            <ColourControls />
            <AdjustControls />
          </>
        ) : (
          <SelectControls />
        )}
        <details className="panel help">
          <summary>How to build</summary>
          <p>
            Build the house on the grey plot. Pick a part, point or tap where it should go, and it snaps onto the studs
            underneath. On a phone, tap once to preview and again (or press Place) to place it.
          </p>
          <p>
            Parts need studs underneath them; the sloped face of a roof slope has none. You can't remove a part while
            something rests only on it, so take things off from the top down.
          </p>
          <p>
            Your build is saved on the server against this browser. Clearing this site's cookies, or using another
            device, starts a new build: there are no accounts.
          </p>
        </details>
      </aside>
    </div>
  );
}
