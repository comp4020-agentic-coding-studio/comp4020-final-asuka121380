import { useEffect, useRef, useState } from "react";

// Real links to everything the table's unfinished entrances will open later
// (ADR 0014, phase 1). Discreet and subordinate to the table: a small tab in
// the corner, never a navigation bar. The same list is the fallback's body.

export const LINKS: { href: string; label: string; note: string }[] = [
  { href: "/build/", label: "Build or join a room", note: "Build alone, start a room, or join one" },
  { href: "/build/#friends", label: "Friends and invitations", note: "Room invitations appear at the top of the lobby" },
  { href: "/build/?view=collection", label: "My collection", note: "Versions you saved" },
  { href: "/build/?view=showcase", label: "Public showcase", note: "Creations people published" },
  { href: "/readme/", label: "About this project", note: "The README" },
];

export function LinkList({ className = "" }: { className?: string }) {
  return (
    <ul className={`link-list ${className}`}>
      {LINKS.map((l) => (
        <li key={l.href}>
          <a href={l.href}>
            <span className="link-label">{l.label}</span>
            <span className="link-note">{l.note}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function QuickLinks({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (hidden) return null;
  return (
    <div
      ref={root}
      className={`quick-links${open ? " is-open" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button ref={toggle} type="button" className="quick-links-toggle" aria-expanded={open} aria-controls="quick-links-list" onClick={() => setOpen((o) => !o)}>
        Quick links
      </button>
      <nav id="quick-links-list" aria-label="Quick links" hidden={!open}>
        <p className="quick-links-note">The other objects on the table open these later. For now:</p>
        <LinkList />
      </nav>
    </div>
  );
}
