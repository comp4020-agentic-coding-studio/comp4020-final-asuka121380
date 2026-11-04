import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// The frame every table panel shares (ADR 0014): the object's enlarged name
// label, as a modal dialog. The table stays visible round it but inert;
// focus moves to the heading on open and stays inside; Escape and "Back to
// table" close it; focus returns to the object's label button. The camera
// has already arrived when this mounts (HomeApp waits for it), and nothing
// inside moves the camera again: steps within a workflow happen in place.

export function TablePanel({
  id,
  title,
  onClose,
  returnFocus,
  children,
  tone = "red",
  wide = false,
}: {
  id: string;
  title: string;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** The frame's colour follows its object: red (sign, shelf), blue (board, tray, booklet), yellow (friends). */
  tone?: "red" | "blue" | "yellow";
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const target = returnFocus.current;
    return () => {
      // the label may re-render while open; look it up again if the ref moved on
      (returnFocus.current ?? target)?.focus({ preventScroll: true });
    };
  }, []);

  // Escape closes from anywhere while open: a step inside a flow can unmount
  // the focused button, leaving focus on the page body. Not while an input
  // method is composing text, and not if something inside handled it first.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // a step that unmounts the focused control drops focus to <body>; bring it
  // back to the dialog so Tab containment and screen readers stay with it
  useEffect(() => {
    const onFocusOut = () =>
      requestAnimationFrame(() => {
        if (document.activeElement === document.body && panel.current) heading.current?.focus({ preventScroll: true });
      });
    const el = panel.current;
    el?.addEventListener("focusout", onFocusOut);
    return () => el?.removeEventListener("focusout", onFocusOut);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const titleId = `${id}-title`;
  return (
    <div className="table-panel-layer">
      <div ref={panel} className={`table-panel kit tone-${tone}${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-panel={id} onKeyDown={onKeyDown}>
        <header className="table-panel-head">
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="btn btn-small back-to-table" onClick={onClose}>
            <span aria-hidden="true">←</span> Back to table
          </button>
        </header>
        <div className="table-panel-body">{children}</div>
      </div>
    </div>
  );
}

/** A step back inside a panel's own flow: never confused with leaving the table. */
export function StepBack({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="step-back" onClick={onClick}>
      <span aria-hidden="true">←</span> {children}
    </button>
  );
}

/** The action that leaves the table for the building editor: always says so. */
export const ENTER_EDITOR = "Opens the building editor.";
