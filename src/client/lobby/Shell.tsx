import type { ReactNode } from "react";
import { decorativeEmblemMark } from "../ui/iso.ts";

// The frame every dedicated page shares (ADR 0014): the brand, a way back to
// the table, and the page's own sections. The pages are the workshop's other
// rooms (the lobby, the account, the collection, the showcase), so they keep
// the table's red, blue and yellow identity, without its 3D scene.
//
// `decorativeEmblemMark` (ui/iso.ts) is the one non-gameplay emblem, also
// used by the table's own brand link, the loading screen and the README
// header — never `brandMark`, which is the game editor's own corner mark.

const MARK = decorativeEmblemMark();

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

/**
 * A small brick-built display base with nothing on it: the one empty-state
 * illustration family (ADR 0014, "Visual polish pass"), reused with
 * different heading/body/actions for the collection, the showcase, the
 * public-rooms list, friends and invitations. Never implies there IS
 * something there — no placeholder cards, no fabricated activity.
 */
function EmptyShelf() {
  return (
    <svg className="empty-shelf-art" viewBox="0 0 120 70" aria-hidden="true">
      <rect x="10" y="52" width="100" height="10" rx="2" fill="var(--blue-soft, #e6f0fa)" stroke="var(--blue)" strokeWidth="2" />
      <rect x="24" y="38" width="72" height="4" rx="2" fill="var(--line)" />
      <circle cx="34" cy="40" r="2.6" fill="var(--line-strong)" />
      <circle cx="60" cy="40" r="2.6" fill="var(--line-strong)" />
      <circle cx="86" cy="40" r="2.6" fill="var(--line-strong)" />
    </svg>
  );
}

/**
 * One empty-state family, in a full-page or compact (in-panel) size.
 * Distinct from loading (a `role="status"` message elsewhere) and from a
 * failed request (a `lobby-error`/`kit-error`) — this renders only once
 * a request has genuinely succeeded with zero results.
 */
export function EmptyState({
  heading,
  body,
  primary,
  secondary,
  compact = false,
}: {
  heading: string;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " empty-state-compact" : ""}`}>
      <EmptyShelf />
      <h2>{heading}</h2>
      <p>{body}</p>
      {(primary || secondary) && (
        <div className="empty-state-actions">
          {primary && (
            <a className="btn btn-red btn-small" href={primary.href}>
              {primary.label}
            </a>
          )}
          {secondary && (
            <a className="btn btn-small" href={secondary.href}>
              {secondary.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
