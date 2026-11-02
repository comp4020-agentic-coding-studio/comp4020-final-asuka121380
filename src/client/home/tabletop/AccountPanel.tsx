import { useEffect, useRef, type RefObject } from "react";
import { IdentityGate } from "../../IdentityGate.tsx";
import { AccountPage } from "../../lobby/Account.tsx";
import type { Account } from "../../state/api.ts";

// The sign's panel (ADR 0014): the existing account flow, unchanged, framed
// as the sign's nameplate. A modal dialog: the table stays visible around it
// but inert, focus stays inside, Escape and "Back to table" close it, and
// focus returns to the sign. Mounting it is the first identity-dependent act
// on the homepage, so it goes through the same IdentityGate the lobby uses.

export function AccountPanel({ onClose, onAccountChange, returnFocus, signedIn }: { onClose: () => void; onAccountChange: (a: Account | null) => void; returnFocus: RefObject<HTMLElement | null>; signedIn: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const target = returnFocus.current;
    return () => {
      // the sign's face may re-render; look it up again if the ref moved on
      (returnFocus.current ?? target)?.focus({ preventScroll: true });
    };
  }, []);

  // Escape closes from anywhere while open: a step inside the account flow
  // (registering, signing in) can unmount the focused button, leaving focus
  // on the page body. Not while an input method is composing text.
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
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement);
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

  return (
    <div className="table-panel-layer">
      <div ref={panel} className="table-panel nameplate" role="dialog" aria-modal="true" aria-labelledby="account-panel-title" onKeyDown={onKeyDown}>
        <div className="nameplate-studs" aria-hidden="true" />
        <header className="table-panel-head">
          <h2 id="account-panel-title" ref={heading} tabIndex={-1}>
            Your nameplate
          </h2>
          <button type="button" className="btn btn-small back-to-table" onClick={onClose}>
            <span aria-hidden="true">←</span> Back to table
          </button>
        </header>
        {/* the guest card below already explains guest building and accounts once */}
        {signedIn && <p className="table-panel-lede">Your rooms, friends and collection follow you to any device you sign in on.</p>}
        <div className="table-panel-body account-scope">
          <IdentityGate>
            <AccountPage onAccountChange={onAccountChange} />
          </IdentityGate>
        </div>
      </div>
    </div>
  );
}
