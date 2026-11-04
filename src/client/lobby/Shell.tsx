import type { ReactNode } from "react";
import { brandMark } from "../ui/iso.ts";

// The frame every dedicated page shares (ADR 0014): the brand, a way back to
// the table, and the page's own sections. The pages are the workshop's other
// rooms (the lobby, the account, the collection, the showcase), so they keep
// the table's cream, red and yellow, without its 3D scene.

const MARK = brandMark();

export type Section = "lobby" | "account" | "collection" | "showcase";

const NAV: { id: Section; href: string; label: string }[] = [
  { id: "lobby", href: "/build/", label: "Rooms" },
  { id: "collection", href: "/build/?view=collection", label: "My collection" },
  { id: "showcase", href: "/build/?view=showcase", label: "Showcase" },
  { id: "account", href: "/build/?view=account", label: "Account" },
];

export function PageShell({ section, accountLabel, children, wide = false }: { section?: Section; accountLabel?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`kit page${wide ? " page-wide" : ""}`}>
      <header className="page-bar">
        <a className="brand home-link" href="/" aria-label="Brick Commons (working title): back to the table">
          <span className="mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARK }} />
          <span className="brand-name">Brick Commons</span>
        </a>
        <nav className="page-nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={n.href} aria-current={n.id === section ? "page" : undefined}>
              {n.id === "account" && accountLabel ? accountLabel : n.label}
            </a>
          ))}
        </nav>
        <a className="btn btn-small to-table" href="/">
          <span aria-hidden="true">←</span> Back to the table
        </a>
      </header>
      {children}
    </div>
  );
}

/** A page's title block: a heading and one short line, nothing more. */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="lobby-header page-head">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
