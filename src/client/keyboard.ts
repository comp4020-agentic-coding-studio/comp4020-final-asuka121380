import {
  confirm,
  cycle,
  escape,
  getState,
  lift,
  moveAnchor,
  remove,
  requestCamera,
  rotate,
  toggleDelete,
} from "./state/store.ts";

// One keyboard listener on the window. The checkpoint's handler sat on the
// stage element, so it only fired while that element had focus: one click on
// a tray or colour button and every shortcut went dead (ADR 0003). Here keys
// work wherever focus is, with two exceptions so normal controls keep
// working: nothing is intercepted inside editable fields, and Enter/Space on
// a focused button, link or summary stay that control's own.
//
// A control clicked with a mouse or a finger gives its focus back straight
// away. Otherwise a click on, say, the Delete tool button would leave it
// focused, and the next Enter would toggle the tool off instead of removing
// the target. Controls reached with Tab, or pressed from the keyboard, keep
// their focus, so keyboard users never lose their place.

const isEditable = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const isControl = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && !!t.closest("button, a[href], summary, [role='button'], [role='radio'], [role='tab']");

function handle(e: KeyboardEvent): boolean {
  const s = getState();
  const onControl = isControl(e.target);
  // arrows and page keys may repeat while held down; actions fire once per press
  const once = !e.repeat;
  switch (e.key) {
    case "Enter":
      if (onControl || !once) return false;
      confirm();
      return true;
    case "Escape":
      escape();
      return true;
    case "ArrowLeft":
      return !!s.held && (moveAnchor(-1, 0), true);
    case "ArrowRight":
      return !!s.held && (moveAnchor(1, 0), true);
    case "ArrowUp":
      return !!s.held && (moveAnchor(0, -1), true);
    case "ArrowDown":
      return !!s.held && (moveAnchor(0, 1), true);
    case "PageUp":
      return !!s.held && (lift(1), true);
    case "PageDown":
      return !!s.held && (lift(-1), true);
    case "r":
    case "R":
      if (once) void rotate();
      return true;
    case "Delete":
    case "Backspace":
      if (once && s.selectedId) void remove(s.selectedId);
      return !!s.selectedId;
    case "d":
    case "D":
      if (once) toggleDelete();
      return true;
    case "[":
      if (once) cycle(-1);
      return true;
    case "]":
      if (once) cycle(1);
      return true;
    case "t":
    case "T":
      if (once) requestCamera("top");
      return true;
    case "Home":
      if (once) requestCamera("reset");
      return true;
    default:
      return false;
  }
}

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isEditable(e.target)) return;
    if (handle(e)) e.preventDefault();
  };
  const onClick = (e: MouseEvent): void => {
    // detail is 0 for a click made with Enter or Space
    if (e.detail === 0 || !(e.target instanceof HTMLElement)) return;
    const control = e.target.closest<HTMLElement>("button, a[href], summary, [role='button'], [role='radio'], [role='tab']");
    if (control && control === document.activeElement) control.blur();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("click", onClick);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("click", onClick);
  };
}
