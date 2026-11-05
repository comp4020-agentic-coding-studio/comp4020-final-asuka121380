import type { ReactNode } from "react";
import { pageHeaderHtml, type PageSection } from "../ui/pageHeader.ts";
import { emptyPlotScene } from "../ui/brickScenes.ts";

// The frame every dedicated page shares (ADR 0014): the brand, a way back to
// the table, and the page's own sections. The pages are the workshop's other
// rooms (the lobby, the account, the collection, the showcase, the About
// page), so they keep the table's warm red, white and yellow identity,
// without its 3D scene.
//
// The header itself (`pageHeaderHtml`, ui/pageHeader.ts) is one definition
// shared with the server-rendered README, so "use the shared navigation
// consistently, including About" is actually one piece of markup, not two
// that can drift — About keeps working with no JavaScript, since the shared
// builder is plain HTML, never a client-rendered component.

export type Section = PageSection;

/**
 * The shared frame (ADR 0014, "Artistic identity pass"): a full-bleed red
 * beam standing in for a brick wall — a seam line and small studs along its
 * top edge, never behind readable text — carrying the brand, the section
 * nav and the way back to the table edge to edge. The page body below it
 * fills the viewport's width; `wide`/the default only change how wide a
 * *reading* column gets inside that full-bleed page (set per page in
 * lobby.css), never the page frame itself.
 */
export function PageShell({ section, accountLabel, children, wide = false }: { section?: Section; accountLabel?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`kit page${wide ? " page-wide" : ""}`}>
      <div dangerouslySetInnerHTML={{ __html: pageHeaderHtml({ section, accountLabel }) }} />
      {children}
    </div>
  );
}

/**
 * A page's title block: a heading and one short line, with a small
 * decorative brick stack bleeding off its corner (ADR 0014, "Artistic
 * identity pass") — one playful graphic moment per page, not studs behind
 * every heading. `aria-hidden`: purely decorative, never load-bearing.
 */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="lobby-header page-head">
      <svg className="page-head-bricks" viewBox="0 0 64 48" aria-hidden="true">
        <rect x="6" y="26" width="26" height="16" rx="2" fill="var(--yellow)" transform="rotate(-6 19 34)" />
        <rect x="22" y="10" width="34" height="20" rx="2" fill="var(--red)" transform="rotate(4 39 20)" />
        <circle cx="30" cy="16" r="3.4" fill="var(--red-edge)" transform="rotate(4 39 20)" />
        <circle cx="42" cy="14" r="3.4" fill="var(--red-edge)" transform="rotate(4 39 20)" />
      </svg>
      <h1>{title}</h1>
      {children}
    </header>
  );
}

/**
 * An empty baseplate, ready but unbuilt: the one empty-state illustration
 * family (ADR 0014, "Bolder artistic pass", replacing the earlier flat
 * line-and-dot placeholder with the same isometric brick scene the rest of
 * the site now uses), reused with different heading/body/actions for the
 * collection, the showcase, the public-rooms list, friends and
 * invitations. Never implies there IS something there — no placeholder
 * cards, no fabricated activity.
 */
function EmptyShelf() {
  return <span className="empty-shelf-art" dangerouslySetInnerHTML={{ __html: emptyPlotScene() }} />;
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
