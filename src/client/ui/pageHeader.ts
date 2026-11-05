import { decorativeEmblemMark } from "./iso.ts";

// The one header definition shared by every dedicated page (ADR 0014,
// "Artistic identity pass" refinement): the room lobby, account, collection,
// showcase and the README all render the exact same markup, so "use the
// shared navigation consistently... including About" means one real
// definition, not two that can drift apart.
//
// This is a pure string builder (the same pattern as `iso.ts`'s `isoSvg`):
// no DOM, no React, no client-side script. `Shell.tsx` renders it with
// `dangerouslySetInnerHTML`; `src/server/readme.ts` embeds the identical
// string directly into its server-rendered HTML. Every link here is a plain
// `<a>`, so the README keeps working with no JavaScript at all — sharing
// the definition never means About needs to load the client bundle.

const MARK = decorativeEmblemMark();

export type PageSection = "lobby" | "account" | "collection" | "showcase" | "about";

const NAV: { id: PageSection; href: string; label: string }[] = [
  { id: "lobby", href: "/build/", label: "Rooms" },
  { id: "collection", href: "/build/?view=collection", label: "My collection" },
  { id: "showcase", href: "/build/?view=showcase", label: "Showcase" },
  { id: "account", href: "/build/?view=account", label: "Account" },
  { id: "about", href: "/readme/", label: "About" },
];

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * The full-bleed red beam every dedicated page shares: brand, section nav
 * (with the current section marked, not just coloured, so it reads without
 * colour too) and a way back to the table. `accountLabel` is the one piece
 * only a client page can know ahead of render (whether this browser is
 * signed in); the README always shows the plain "Account" label, which is
 * still correct — it names the destination, not a live status.
 */
export function pageHeaderHtml({ section, accountLabel }: { section?: PageSection; accountLabel?: string }): string {
  const navHtml = NAV.map((n) => {
    const current = n.id === section;
    const label = n.id === "account" && accountLabel ? accountLabel : n.label;
    return `<a href="${n.href}"${current ? ' aria-current="page"' : ""}>${escape(label)}</a>`;
  }).join("");
  return `<header class="page-beam">
  <div class="page-beam-studs" aria-hidden="true"></div>
  <div class="page-beam-row">
    <a class="brand home-link" href="/" aria-label="Brick Commons (working title): back to the table">
      <span class="mark" aria-hidden="true">${MARK}</span>
      <span class="brand-name">Brick Commons</span>
    </a>
    <nav class="page-nav" aria-label="Sections">${navHtml}</nav>
    <a class="btn btn-small btn-ghost-light to-table" href="/"><span aria-hidden="true">&larr;</span> Back to the table</a>
  </div>
</header>`;
}
