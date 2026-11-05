import { readFileSync } from "node:fs";
import { marked } from "marked";
import { decorativeEmblemMark } from "../client/ui/iso.ts";

// /readme/ is README.md rendered on the server, so the whole argument is in
// the HTML a visitor (or the shipped check) receives, with no script needed.
// The URL, the full rendered content, the server-side rendering and the
// shipped invariant (spec/invariants.test.ts, checked by heading text and
// order, never by colour or structure) are unchanged by anything below
// (ADR 0014, "Colour system", "Artistic identity pass").
//
// The table's booklet leads here (ADR 0014), so the page wears the site's
// warm identity (red leads, white reads, yellow accents) and reads as a
// flowing, illustrated account rather than one long card: each of
// README.md's sections gets its own small composition, in a different
// rhythm, closing in a deliberate farewell scene. The markdown is split by
// heading and each piece still goes through the same `marked.parse()` as
// before — only the *wrapper* around each piece is new, so every word of
// README.md, and the order its headings appear in, is exactly what ships.
// All illustration is original, inline SVG, `aria-hidden` and decorative
// only; no fonts or scripts load from anywhere, so the page works, and
// reads completely, with no JavaScript (ADR 0014 "Artistic identity pass").
// Motion is CSS-only, plays once on load (never scroll-hijacking), and
// collapses entirely under `prefers-reduced-motion: reduce`.

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The one non-gameplay emblem (ui/iso.ts, shared with the client bundles),
// rendered once at module load: iso.ts has no DOM/React dependency, so its
// pure string output works unchanged on the server.
const MARK = decorativeEmblemMark();

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect y='5' width='16' height='11' rx='2' fill='%23d2242c'/%3E%3Crect x='2' y='2' width='4' height='4' rx='1' fill='%23d2242c'/%3E%3Crect x='10' y='2' width='4' height='4' rx='1' fill='%23d2242c'/%3E%3C/svg%3E";

interface Section {
  level: 1 | 2;
  heading: string;
  /** The heading line plus everything under it, up to (not including) the next heading: fed to `marked` exactly as README.md wrote it. */
  md: string;
}

/** Splits README.md into one section per top-level heading (# or ##), each still containing its own heading line — so `marked.parse()` renders the same `<h1>`/`<h2>` text, in the same order, as rendering the whole file at once would. */
function splitSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const sections: Section[] = [];
  let current: string[] = [];
  let level: 1 | 2 = 1;
  let heading = "";
  const flush = () => {
    if (current.length) sections.push({ level, heading, md: current.join("\n") });
  };
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    if (h1 || h2) {
      flush();
      current = [line];
      level = h1 ? 1 : 2;
      heading = (h1 ?? h2)![1].trim();
    } else {
      current.push(line);
    }
  }
  flush();
  return sections;
}

const render = (md: string): string => marked.parse(md, { async: false, gfm: true }) as string;

// ---- original, decorative illustrations (inline SVG, aria-hidden) ---------

/** A handful of loose, unmatched bricks: the opening scene, before anything has been decided or finished. */
const heroArt = (): string => `
<svg class="hero-art" viewBox="0 0 220 110" aria-hidden="true">
  <g class="hero-brick hero-brick-1">
    <rect x="8" y="58" width="56" height="30" rx="4" fill="var(--red)"/>
    <circle cx="24" cy="52" r="7" fill="var(--red)"/>
    <circle cx="48" cy="52" r="7" fill="var(--red)"/>
  </g>
  <g class="hero-brick hero-brick-2">
    <rect x="86" y="30" width="46" height="26" rx="4" fill="var(--yellow)"/>
    <circle cx="99" cy="25" r="6" fill="var(--yellow)"/>
    <circle cx="119" cy="25" r="6" fill="var(--yellow)"/>
  </g>
  <g class="hero-brick hero-brick-3">
    <rect x="150" y="62" width="62" height="32" rx="4" fill="var(--ink)"/>
    <circle cx="167" cy="56" r="7" fill="var(--ink)"/>
    <circle cx="195" cy="56" r="7" fill="var(--ink)"/>
  </g>
</svg>`;

/** Two differently-coloured, staggered brick stacks, drawn apart, animated together on load until they stand side by side with a small yellow brick bridging the seam between them: the chapter about shared, unplanned contribution. */
const joiningArt = (): string => `
<svg class="joining-art" viewBox="0 0 260 150" aria-hidden="true">
  <g class="joining-left">
    <rect x="14" y="94" width="86" height="28" rx="4" fill="var(--red-edge)"/>
    <circle cx="33" cy="94" r="6.5" fill="var(--red-edge)"/>
    <circle cx="57" cy="94" r="6.5" fill="var(--red-edge)"/>
    <circle cx="81" cy="94" r="6.5" fill="var(--red-edge)"/>
    <rect x="26" y="62" width="62" height="28" rx="4" fill="var(--red)"/>
    <circle cx="41" cy="62" r="6.5" fill="var(--red)"/>
    <circle cx="73" cy="62" r="6.5" fill="var(--red)"/>
  </g>
  <g class="joining-right">
    <rect x="160" y="94" width="86" height="28" rx="4" fill="var(--blue-deep)"/>
    <circle cx="179" cy="94" r="6.5" fill="var(--blue-deep)"/>
    <circle cx="203" cy="94" r="6.5" fill="var(--blue-deep)"/>
    <circle cx="227" cy="94" r="6.5" fill="var(--blue-deep)"/>
    <rect x="172" y="62" width="62" height="28" rx="4" fill="var(--blue)"/>
    <circle cx="187" cy="62" r="6.5" fill="var(--blue)"/>
    <circle cx="219" cy="62" r="6.5" fill="var(--blue)"/>
  </g>
  <g class="joining-seam">
    <rect x="108" y="94" width="44" height="28" rx="4" fill="var(--yellow)"/>
    <circle cx="121" cy="94" r="6.5" fill="var(--yellow)"/>
    <circle cx="139" cy="94" r="6.5" fill="var(--yellow)"/>
  </g>
</svg>`;

/** A small building beside a couple of plainer neighbours, on a shared strip of ground: build somewhere, not in a void. */
const neighbourhoodArt = (): string => `
<svg class="place-art" viewBox="0 0 260 140" aria-hidden="true">
  <rect x="0" y="112" width="260" height="10" fill="var(--line)"/>
  <g>
    <rect x="12" y="78" width="46" height="34" fill="var(--yellow-soft)"/>
    <polygon points="12,78 35,58 58,78" fill="var(--ink-soft)"/>
  </g>
  <g>
    <rect x="186" y="84" width="54" height="28" fill="var(--yellow-soft)"/>
    <polygon points="186,84 213,64 240,84" fill="var(--ink-soft)"/>
  </g>
  <g class="place-house">
    <rect x="86" y="58" width="80" height="54" rx="2" fill="var(--white)" stroke="var(--line-strong)" stroke-width="2"/>
    <polygon points="80,58 126,24 172,58" fill="var(--red)"/>
    <rect x="114" y="82" width="22" height="30" fill="var(--blue)"/>
    <rect x="96" y="70" width="14" height="14" fill="var(--yellow)"/>
    <rect x="142" y="70" width="14" height="14" fill="var(--yellow)"/>
  </g>
</svg>`;

/** A saved creation on a small display plinth, two plain marks beside it standing for whoever built it together: shared memory, without inventing anyone's name or story. */
const keepsakeArt = (): string => `
<svg class="keepsake-art" viewBox="0 0 220 140" aria-hidden="true">
  <rect x="30" y="104" width="160" height="14" rx="3" fill="var(--yellow-soft)" stroke="var(--yellow-edge)" stroke-width="2"/>
  <rect x="70" y="56" width="50" height="48" rx="3" fill="var(--white)" stroke="var(--line-strong)" stroke-width="2"/>
  <polygon points="64,56 95,32 126,56" fill="var(--red)"/>
  <rect x="88" y="78" width="14" height="26" fill="var(--blue)"/>
  <circle cx="48" cy="112" r="7" fill="var(--red)"/>
  <circle cx="172" cy="112" r="7" fill="var(--blue)"/>
</svg>`;

/** A small checklist mark beside a plain brick: the two kinds of claim the last chapter makes — what's tested, and what still needs a person's judgement. */
const checklistArt = (): string => `
<svg class="checklist-art" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="8" y="8" width="48" height="48" rx="10" fill="var(--yellow-soft)"/>
  <path d="M20 33 L29 42 L45 23" fill="none" stroke="var(--ok)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** The closing scene: a small finished-enough stack with a brick cap and a heart pressed into the top stud, standing in for the "unfinished house" motif settling, at last, into something kept. */
const finaleArt = (): string => `
<svg class="finale-art" viewBox="0 0 120 110" aria-hidden="true">
  <rect x="20" y="58" width="80" height="34" rx="4" fill="var(--red)"/>
  <circle cx="38" cy="52" r="8" fill="var(--red)"/>
  <circle cx="82" cy="52" r="8" fill="var(--red)"/>
  <rect x="34" y="28" width="52" height="30" rx="4" fill="var(--yellow)"/>
  <path d="M60 24 c-5 -8 -17 -4 -15 5 c1.5 6.5 10 11 15 14 c5 -3 13.5 -7.5 15 -14 c2 -9 -10 -13 -15 -5 z" fill="var(--red-edge)"/>
</svg>`;

export function renderReadme(path: string): string {
  const md = readFileSync(path, "utf8");
  const sections = splitSections(md);
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? "About";

  const hero = sections[0] ? `
    <section class="hero" data-anim>
      <div class="hero-copy">${render(sections[0].md)}</div>
      ${heroArt()}
    </section>` : "";

  // README.md's four H2 sections, in order: "A shared building, a shared
  // memory", "Build somewhere, not in a void", "Join, build, and keep a
  // creation", "What is checked, and what needs judgement". Matched by
  // position, not by guessing at exact wording, so a small wording edit to
  // README.md doesn't silently break the illustration assignment — if the
  // author ever adds or removes a section, the extra ones still render,
  // undecorated, in the generic `.chapter` layout below.
  const chapters = sections.slice(1);
  const layouts = [
    { art: joiningArt, cls: "chapter-join" },
    { art: neighbourhoodArt, cls: "chapter-place alt" },
    { art: keepsakeArt, cls: "chapter-keep" },
    { art: checklistArt, cls: "chapter-checked compact" },
  ];
  const chapterHtml = chapters
    .map((s, i) => {
      const layout = layouts[i];
      const art = layout ? layout.art() : "";
      const cls = layout ? layout.cls : "chapter";
      return `
    <section class="chapter ${cls}" data-anim>
      ${art}
      <div class="chapter-copy">${render(s.md)}</div>
    </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<link rel="icon" href="${ICON}" />
<style>
  :root {
    --ink: #241a17;
    --ink-soft: #5c4f49;
    --white: #ffffff;
    --paper: #ffffff;
    --wash: #fbf5ee;
    --line: #ecdfd2;
    --line-strong: #cdb9a4;
    --red: #d2242c;
    --red-edge: #9c141c;
    --red-deep: #7a0f17;
    --blue: #1f6fae;
    --blue-deep: #134f85;
    --yellow: #ffcf3d;
    --yellow-edge: #d99f00;
    --yellow-soft: #fff3cf;
    --ok: #1d7f45;
    --link: #134f85;
    --display: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--ink);
    background: var(--wash);
    font: 17px/1.65 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: var(--wash);
    overflow-x: hidden;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem clamp(1rem, 4vw, 2rem);
    background: var(--red);
    box-shadow: 0 3px 0 var(--red-deep);
  }
  .brand { display: inline-flex; align-items: center; gap: 0.5rem; font: 800 1.1rem/1 var(--display); color: #fff; text-decoration: none; }
  .brand svg { width: 26px; height: 26px; }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.45rem 0.95rem;
    border: 2px solid rgb(255 255 255 / 0.55);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.12);
    color: #fff;
    font-weight: 800;
    text-decoration: none;
  }
  .back:hover { background: rgb(255 255 255 / 0.22); }
  .back:active { transform: translateY(1px); }
  :focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 4px; }

  /* ---- the story: one flowing page, each chapter its own composition --- */

  .story { width: min(62rem, 100%); margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2rem); }

  h1, h2, h3, h4 { font-family: var(--display); line-height: 1.12; letter-spacing: -0.015em; color: var(--ink); }
  p, ul, ol { margin: 0 0 1rem; max-width: 42rem; }
  li + li { margin-top: 0.3rem; }
  a { color: var(--link); text-underline-offset: 2px; }
  strong { color: var(--ink); }
  blockquote { margin: 1.2rem 0; padding: 0.6rem 1rem; border-left: 4px solid var(--yellow); background: var(--yellow-soft); border-radius: 0 10px 10px 0; color: var(--ink-soft); max-width: 42rem; }
  img { max-width: 100%; height: auto; border-radius: 10px; }
  code { background: var(--wash); padding: 0.05em 0.3em; border-radius: 4px; font-size: 0.92em; }
  pre { background: var(--wash); padding: 0.9rem; overflow-x: auto; border-radius: 10px; }
  pre code { padding: 0; background: none; }
  .table-wrap, table { display: block; max-width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 0.92rem; margin: 0 0 1rem; }
  th, td { border: 1px solid var(--line); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: var(--wash); }

  /* the opening: an oversized title, loose bricks not yet a building */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 20rem);
    align-items: center;
    gap: 1.5rem;
    padding: clamp(2.5rem, 7vw, 5rem) 0 clamp(2rem, 5vw, 3rem);
  }
  .hero-copy h1 {
    margin: 0 0 1rem;
    font-size: clamp(2.6rem, 7vw, 4.6rem);
    font-weight: 800;
  }
  .hero-copy p { font-size: 1.1rem; color: var(--ink-soft); max-width: 36rem; }
  .hero-art { width: 100%; height: auto; justify-self: center; }
  .hero-brick { opacity: 0; transform: translateY(14px) scale(0.9); }
  .hero.anim-in .hero-brick-1 { animation: popIn 560ms 80ms ease-out both; }
  .hero.anim-in .hero-brick-2 { animation: popIn 560ms 220ms ease-out both; }
  .hero.anim-in .hero-brick-3 { animation: popIn 560ms 360ms ease-out both; }
  .hero:not(.anim-in) .hero-brick { opacity: 1; transform: none; }

  /* chapters: alternating two-up compositions, generous and varied */
  .chapter {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem);
    align-items: center;
    gap: 2rem;
    padding: clamp(2.2rem, 5vw, 3.6rem) 0;
    border-top: 2px dashed var(--line);
  }
  .chapter.alt { grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr); }
  .chapter.alt .chapter-copy { order: 2; }
  .chapter h2 {
    margin: 0 0 0.7rem;
    font-size: clamp(1.5rem, 3.2vw, 2.1rem);
    color: var(--red-deep);
  }
  .chapter p, .chapter ul { color: var(--ink); }
  .chapter :is(.hero-art, .joining-art, .place-art, .keepsake-art) { width: 100%; height: auto; justify-self: center; }

  /* a compact, informational chapter: smaller type, a single-column read, a small icon instead of a full scene */
  .chapter.compact {
    grid-template-columns: 1fr;
    gap: 0.8rem;
    max-width: 44rem;
  }
  .chapter.compact .checklist-art { width: 3rem; height: 3rem; justify-self: start; }
  .chapter.compact h2 { font-size: 1.3rem; }
  .chapter.compact p { font-size: 0.96rem; }

  /* two assemblies, apart, sliding together once on load */
  .joining-art { overflow: visible; }
  .joining-left { transform: translateX(-18px); opacity: 0; }
  .joining-right { transform: translateX(18px); opacity: 0; }
  .joining-seam { opacity: 0; }
  .chapter-join.anim-in .joining-left { animation: slideIn 620ms 100ms ease-out both; }
  .chapter-join.anim-in .joining-right { animation: slideInRight 620ms 100ms ease-out both; }
  .chapter-join.anim-in .joining-seam { animation: popIn 420ms 620ms ease-out both; }
  .chapter-join:not(.anim-in) .joining-left,
  .chapter-join:not(.anim-in) .joining-right,
  .chapter-join:not(.anim-in) .joining-seam { transform: none; opacity: 1; }

  .place-house { opacity: 0; transform: translateY(10px); }
  .chapter-place.anim-in .place-house { animation: popIn 560ms 140ms ease-out both; }
  .chapter-place:not(.anim-in) .place-house { opacity: 1; transform: none; }

  .keepsake-art { opacity: 0; transform: translateY(10px) scale(0.96); }
  .chapter-keep.anim-in .keepsake-art { animation: popIn 560ms 100ms ease-out both; }
  .chapter-keep:not(.anim-in) .keepsake-art { opacity: 1; transform: none; }

  @keyframes popIn { from { opacity: 0; transform: translateY(14px) scale(0.92); } to { opacity: 1; transform: none; } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideInRight { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: translateX(0); } }

  @media (prefers-reduced-motion: reduce) {
    .hero-brick, .joining-left, .joining-right, .joining-seam, .place-house, .keepsake-art {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }

  /* the closing scene: warm, unhurried, a deliberate farewell */
  .finale {
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    margin-top: 1rem;
    padding: clamp(3rem, 8vw, 5rem) 1.5rem clamp(2.5rem, 6vw, 4rem);
    background: linear-gradient(180deg, var(--wash), var(--yellow-soft) 140%);
    text-align: center;
  }
  .finale-art { width: 5.5rem; height: auto; }
  .finale-made {
    margin: 0;
    font: 800 clamp(1.3rem, 3.4vw, 1.9rem) / 1.2 var(--display);
    color: var(--ink);
  }
  .finale-heart { color: var(--red); }
  .finale-actions { margin-top: 0.6rem; }
  .finale-table {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0.65rem 1.4rem;
    border: none;
    border-radius: 14px;
    background: var(--red);
    box-shadow: 0 4px 0 var(--red-edge);
    color: #fff;
    font: 800 1.02rem/1 var(--display);
    text-decoration: none;
  }
  .finale-table:hover { filter: brightness(1.05); }
  .finale-table:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--red-edge); }

  .foot { margin: 0 auto 2.5rem; width: min(44rem, calc(100% - 2rem)); color: var(--ink-soft); font-size: 0.8rem; text-align: center; }

  @media (max-width: 760px) {
    .hero, .chapter, .chapter.alt { grid-template-columns: 1fr; }
    .hero-art, .chapter :is(.joining-art, .place-art, .keepsake-art) { max-width: 16rem; margin: 0 auto; }
    .chapter.alt .chapter-copy { order: 0; }
  }
  @media (max-width: 560px) {
    :root { font-size: 16px; }
    .bar { flex-wrap: wrap; gap: 0.5rem 0.8rem; }
    .back { min-height: 40px; padding: 0.4rem 0.8rem; font-size: 0.92rem; white-space: nowrap; }
  }
</style>
</head>
<body>
<header class="bar">
<a class="brand" href="/">${MARK}Brick Commons</a>
<a class="back" href="/"><span aria-hidden="true">&larr;</span> Back to the table</a>
</header>
<main class="story">
${hero}
${chapterHtml}
</main>
<section class="finale">
  ${finaleArt()}
  <p class="finale-made">Made with love <span class="finale-heart" aria-hidden="true">&hearts;</span> by Asuka121380</p>
  <div class="finale-actions">
    <a class="finale-table" href="/"><span aria-hidden="true">&larr;</span> Back to the table</a>
  </div>
</section>
<p class="foot">An independent student project. Not made, sponsored or endorsed by the LEGO Group.</p>
<script>document.querySelectorAll('[data-anim]').forEach(function(el){el.classList.add('anim-in');});</script>
</body>
</html>`;
}
