import { readFileSync } from "node:fs";
import { marked } from "marked";
import { pageHeaderHtml } from "../client/ui/pageHeader.ts";
import { ABOUT_SCENES } from "../client/ui/aboutScenes.ts";

// /readme/ is README.md rendered on the server, so the whole argument is in
// the HTML a visitor (or the shipped check) receives, with no script needed.
// README.md is the page's only source of prose: it is split by heading and
// each piece goes through `marked.parse()` unchanged, so every word, link
// and heading of README.md, in order, is what ships (spec/invariants.test.ts
// checks the headings).
//
// The presentation (ADR 0014, "About page: the README's argument in
// pictures", 8 Nov 2026): each of README.md's sections is illustrated by a
// scene chosen FOR THAT SECTION, by its heading (CHAPTERS below), not by
// its position, with a composition suited to what it says:
// - the opening: a corner of a building table, an unfinished build;
// - "A table before a menu": the table's sign, parts tray and creation
//   shelf, with the tray picked out as the object being approached;
// - "Social interaction with a purpose": a shared build and a roof proposed
//   as a plan, which then becomes real;
// - "Keeping what we made": the finished build kept on a display plinth,
//   two equal contributor markers;
// - "One intention throughout": every earlier object on one table, the
//   section's closing argument set large below it.
// A section CHAPTERS doesn't name (a future README heading) renders in a
// plain, complete layout.
//
// All artwork is original inline SVG (ui/aboutScenes.ts), decorative and
// `aria-hidden`. No fonts or scripts load from elsewhere. Motion: each
// scene plays once, when its section first comes into view (an
// IntersectionObserver, never scroll-linked or scroll-jacking). The
// animation start states exist only under `html.js`, so without JavaScript
// every scene is shown finished; `prefers-reduced-motion: reduce` shows
// the finished scenes without movement.

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect y='5' width='16' height='11' rx='2' fill='%23d2242c'/%3E%3Crect x='2' y='2' width='4' height='4' rx='1' fill='%23d2242c'/%3E%3Crect x='10' y='2' width='4' height='4' rx='1' fill='%23d2242c'/%3E%3C/svg%3E";

interface Section {
  level: 1 | 2;
  heading: string;
  /** The heading line plus everything under it, up to (not including) the next heading: fed to `marked` exactly as README.md wrote it. */
  md: string;
}

/** Splits README.md into one section per top-level heading (# or ##), each still containing its own heading line — so `marked.parse()` renders the same `<h1>`/`<h2>` text, in the same order, as rendering the whole file at once would. */
export function splitSections(md: string): Section[] {
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

/** A heading reduced to lower-case words, so small punctuation or case edits to README.md still find their chapter. */
export const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Treatment = "table" | "proposal" | "kept" | "intention";

/**
 * Which treatment illustrates which README section, by the section's
 * heading. Unknown headings get none (a plain chapter). If a heading is
 * reworded, add its new slug here: the page still renders every word in the
 * meantime, just without that section's picture.
 */
export const CHAPTERS: Readonly<Record<string, Treatment>> = {
  [slug("A table before a menu")]: "table",
  [slug("Social interaction with a purpose")]: "proposal",
  [slug("Keeping what we made")]: "kept",
  [slug("One intention throughout")]: "intention",
};

export const treatmentFor = (heading: string): Treatment | undefined => CHAPTERS[slug(heading)];

/** One README section in its chapter's composition. The section's own rendered markdown is placed whole, never edited. */
function chapterHtml(s: Section, n: number): string {
  const t = treatmentFor(s.heading);
  const body = render(s.md);
  const num = `<span class="chapter-num" aria-hidden="true">${String(n).padStart(2, "0")}</span>`;
  // a stable anchor per chapter (#a-table-before-a-menu), kept clear of the sticky beam by section's scroll-margin
  const id = `id="${slug(s.heading).replace(/ /g, "-")}"`;
  switch (t) {
    case "table":
      return `
    <section class="chapter ch-table" data-anim ${id}>
      <div class="ch-table-copy">${num}${body}</div>
      <figure class="ch-table-art">${ABOUT_SCENES.table()}</figure>
    </section>`;
    case "proposal":
      return `
    <section class="chapter ch-proposal" data-anim ${id}>
      <figure class="ch-proposal-art">${ABOUT_SCENES.proposal()}<figcaption aria-hidden="true"><span class="cap-plan">a plan</span><span class="cap-arrow">&rarr;</span><span class="cap-real">part of the build</span></figcaption></figure>
      <div class="ch-proposal-copy">${num}${body}</div>
    </section>`;
    case "kept":
      return `
    <section class="chapter ch-kept" data-anim ${id}>
      <div class="ch-kept-copy">${num}${body}</div>
      <figure class="ch-kept-art">${ABOUT_SCENES.kept()}</figure>
    </section>`;
    case "intention":
      return `
    <section class="chapter ch-intention" data-anim ${id}>
      <div class="ch-intention-inner">
        <div class="ch-intention-copy">${num}${body}</div>
        <figure class="ch-intention-art">${ABOUT_SCENES.intention()}</figure>
      </div>
    </section>`;
    default:
      return `
    <section class="chapter ch-plain" ${id}>
      <div class="ch-plain-copy">${body}</div>
    </section>`;
  }
}

/** The closing heart brick (unchanged from the previous About page). */
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
  // the opening is README.md's title section (# …), or the untitled text
  // before its first heading; a file that starts with ## has no opening and
  // every section is a chapter
  const opening = sections[0]?.level === 1 ? sections[0] : undefined;
  const chapters = opening ? sections.slice(1) : sections;

  const hero = opening
    ? `
    <section class="hero" data-anim>
      <div class="hero-copy">${render(opening.md)}</div>
      <figure class="hero-art">${ABOUT_SCENES.opening()}</figure>
    </section>`
    : "";

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<link rel="icon" href="${ICON}" />
<script>document.documentElement.classList.add("js");</script>
<style>
  :root {
    --ink: #241a17;
    --ink-soft: #5c4f49;
    --white: #ffffff;
    --wash: #fbf5ee;
    --line: #ecdfd2;
    --red: #d2242c;
    --red-edge: #9c141c;
    --red-deep: #7a0f17;
    --blue: #1f6fae;
    --blue-deep: #134f85;
    --yellow: #ffcf3d;
    --yellow-edge: #d99f00;
    --yellow-soft: #fff3cf;
    --link: #134f85;
    --display: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", sans-serif;
    --measure: 40rem;
    --beam: 4.6rem;
    color: var(--ink);
    background: var(--wash);
    font: 17px/1.65 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100%; min-height: 100vh; background: var(--wash); overflow-x: hidden; }
  :focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 4px; }

  /* ---- the shared dedicated-page header (ui/pageHeader.ts) -------------- */
  .page-beam { position: sticky; top: 0; z-index: 5; background: linear-gradient(180deg, var(--red) 0%, var(--red) 82%, var(--red-edge) 100%); box-shadow: 0 3px 0 var(--red-deep); }
  .page-beam-studs { height: 7px; background-image: radial-gradient(circle at 50% 35%, rgb(255 255 255 / 0.4) 0 28%, transparent 30%); background-size: 22px 100%; background-position: 11px 0; background-repeat: repeat-x; opacity: 0.55; }
  .page-beam-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.2rem; padding: 0.65rem clamp(1rem, 4vw, 2rem) 0.75rem; }
  .home-link { display: inline-flex; align-items: center; gap: 0.55rem; color: #fff; font: 800 1.2rem/1 var(--display); letter-spacing: -0.01em; text-decoration: none; }
  .home-link svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.18)); }
  .page-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-right: auto; }
  .page-nav a { padding: 0.5rem 0.75rem; border-radius: 10px; color: #fff; font-weight: 800; font-size: 0.94rem; text-decoration: none; opacity: 0.88; }
  .page-nav a:hover { background: rgb(255 255 255 / 0.16); opacity: 1; }
  .page-nav a[aria-current="page"] { background: #fff; color: var(--red-deep); opacity: 1; box-shadow: 0 2px 0 rgb(0 0 0 / 0.18); }
  .page-beam .btn { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 40px; padding: 0.4rem 0.8rem; border: 2px solid rgb(255 255 255 / 0.4); border-radius: 12px; background: rgb(255 255 255 / 0.14); color: #fff; font: 800 0.9rem/1 var(--display); text-decoration: none; }
  .page-beam .btn:hover { background: rgb(255 255 255 / 0.22); }
  .to-table { white-space: nowrap; }
  .page-beam :focus-visible { outline-color: #fff; }
  .ch-intention a { color: #fff; }
  .ch-intention :focus-visible { outline-color: var(--yellow); }

  /* ---- type ---------------------------------------------------------------- */
  h1, h2, h3, h4 { font-family: var(--display); line-height: 1.1; letter-spacing: -0.015em; color: var(--ink); scroll-margin-top: calc(var(--beam) + 1.5rem); }
  p, ul, ol { margin: 0 0 1rem; }
  li + li { margin-top: 0.3rem; }
  a { color: var(--link); text-underline-offset: 2px; text-decoration-thickness: 1.5px; }
  a:hover { text-decoration-thickness: 2.5px; }
  strong { color: var(--ink); }
  blockquote { margin: 1.2rem 0; padding: 0.6rem 1rem; border-left: 4px solid var(--yellow); background: var(--yellow-soft); border-radius: 0 10px 10px 0; }
  img { max-width: 100%; height: auto; border-radius: 10px; }
  code { background: var(--wash); padding: 0.05em 0.3em; border-radius: 4px; font-size: 0.92em; }
  pre { background: var(--wash); padding: 0.9rem; overflow-x: auto; border-radius: 10px; }
  table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 0.92rem; margin: 0 0 1rem; }
  th, td { border: 1px solid var(--line); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  figure { margin: 0; }
  section { scroll-margin-top: calc(var(--beam) + 1rem); }

  /* ---- layered scenes (ui/aboutScenes.ts): layers share one viewBox, stacked in one box ---- */
  .scene { position: relative; display: block; width: 100%; }
  .scene .layer { display: block; width: 100%; height: auto; overflow: visible; }
  .scene .layer + .layer { position: absolute; inset: 0; }

  .story { width: min(78rem, 100%); margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2.5rem); }
  .chapter { position: relative; }
  .chapter-num { display: block; margin-bottom: 0.4rem; font: 800 0.95rem/1 var(--display); letter-spacing: 0.08em; color: var(--red); }
  .chapter h2 { margin: 0 0 0.9rem; font-size: clamp(1.9rem, 4vw, 2.9rem); font-weight: 800; color: var(--red-deep); }

  /* ---- the opening: a building table, the title beside it ---------------- */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
    padding: clamp(2.5rem, 6vw, 5rem) 0 clamp(2rem, 4vw, 3rem);
  }
  .hero-copy { max-width: 38rem; }
  .hero-copy h1 { margin: 0 0 1.1rem; font-size: clamp(2.8rem, 7vw, 5rem); font-weight: 800; color: var(--red-deep); }
  .hero-copy p { font-size: 1.12rem; line-height: 1.65; }
  .hero-copy p:first-of-type { font-size: 1.24rem; color: var(--ink); }
  .hero-art { position: relative; }
  .hero-art::before {
    /* a warm pool of light on the table */
    content: ""; position: absolute; inset: 8% -4% -4% 4%; z-index: -1;
    background: radial-gradient(closest-side, var(--yellow-soft), transparent);
  }
  .hero-art .scene { filter: drop-shadow(0 14px 22px rgb(36 26 23 / 0.18)); }

  /* ---- "A table before a menu": a wide table strip under the text --------- */
  .ch-table {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) minmax(0, 1fr);
    gap: clamp(1.5rem, 4vw, 3.5rem);
    align-items: center;
    padding: clamp(3rem, 7vw, 5.5rem) 0;
  }
  .ch-table-art { position: relative; }
  .ch-table-art .scene { filter: drop-shadow(0 10px 16px rgb(36 26 23 / 0.15)); }

  /* ---- "Social interaction": the proposal on a red stage, prose beside it -- */
  .ch-proposal {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, var(--measure));
    gap: clamp(1.5rem, 4vw, 3.5rem);
    align-items: center;
    margin: 0 calc(-1 * clamp(1rem, 4vw, 2.5rem));
    padding: clamp(3rem, 7vw, 5.5rem) clamp(1rem, 4vw, 2.5rem);
    background: linear-gradient(160deg, #fff 0%, #fff 55%, var(--yellow-soft) 100%);
    border-radius: 28px;
    box-shadow: 0 2px 0 var(--line);
  }
  .ch-proposal-art { position: relative; padding: clamp(1rem, 3vw, 2rem); border-radius: 22px; background: radial-gradient(120% 90% at 50% 70%, #ffe3e3 0%, #fff 70%); }
  .ch-proposal-art figcaption {
    display: flex; justify-content: center; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin-top: 0.8rem; font: 800 0.85rem/1 var(--display); letter-spacing: 0.04em; text-transform: uppercase;
  }
  /* plain labels, not pills: nothing in the picture may look like a button */
  .ch-proposal-art figcaption { font-weight: 700; text-transform: none; letter-spacing: 0; font-size: 0.92rem; color: var(--ink-soft); }
  .cap-plan { padding-bottom: 0.15rem; border-bottom: 2px dashed var(--blue); }
  .cap-arrow { color: var(--red); }
  .cap-real { padding-bottom: 0.15rem; border-bottom: 2px solid var(--blue); }

  /* ---- "Keeping what we made": the kept creation on its plinth ------------ */
  .ch-kept {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) minmax(0, 0.8fr);
    gap: clamp(1.5rem, 4vw, 4rem);
    align-items: center;
    padding: clamp(3rem, 7vw, 5.5rem) 0;
  }
  .ch-kept-art { position: relative; padding: 1rem 8% 0; }
  .ch-kept-art::before {
    /* the shelf the kept piece stands on: a wall shelf, behind and below */
    content: ""; position: absolute; left: 0; right: 0; bottom: 6%; height: 16px; z-index: -1;
    background: var(--red); border-radius: 6px; box-shadow: 0 6px 0 var(--red-edge), 0 18px 24px rgb(36 26 23 / 0.15);
  }

  /* ---- "One intention throughout": the conclusion, full-bleed red -------- */
  .ch-intention {
    margin: clamp(1rem, 3vw, 2rem) calc(50% - 50vw) 0;
    padding: clamp(3.2rem, 7vw, 6rem) 0 clamp(2.5rem, 5vw, 4rem);
    background: radial-gradient(120% 80% at 50% 0%, #e0333b 0%, var(--red) 45%, var(--red-edge) 100%);
    color: #fff;
  }
  .ch-intention-inner { width: min(78rem, 100%); margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2.5rem); }
  .ch-intention-copy { max-width: 52rem; margin: 0 auto; }
  .ch-intention .chapter-num { color: var(--yellow); }
  .ch-intention h2 { color: #fff; font-size: clamp(2.2rem, 5vw, 3.6rem); }
  .ch-intention p { color: rgb(255 255 255 / 0.92); font-size: 1.06rem; }
  .ch-intention a { color: #fff; }
  /* the section's closing argument: README.md's own last paragraph, set as
     the page's conclusion (style only; the words are exactly README.md's) */
  .ch-intention-copy > p:last-of-type {
    margin: 1.6rem 0 0;
    padding: 1.4rem 0 0;
    border-top: 3px solid var(--yellow);
    font: 700 clamp(1.25rem, 2.4vw, 1.7rem)/1.42 var(--display);
    letter-spacing: -0.005em;
    color: #fff;
  }
  .ch-intention-art { margin: clamp(2rem, 5vw, 3.5rem) auto 0; max-width: 64rem; }
  .ch-intention-art .scene { filter: drop-shadow(0 18px 26px rgb(60 0 0 / 0.35)); }

  /* ---- a section with no named treatment: a plain, complete read --------- */
  .ch-plain { padding: clamp(2.5rem, 6vw, 4rem) 0; border-top: 2px dashed var(--line); }
  .ch-plain-copy { max-width: var(--measure); }
  .ch-plain h2 { margin: 0 0 0.9rem; font-size: clamp(1.7rem, 3.6vw, 2.4rem); color: var(--red-deep); }

  /* ---- the signature -------------------------------------------------------- */
  .finale { display: grid; justify-items: center; gap: 0.7rem; padding: clamp(3rem, 7vw, 4.5rem) 1.5rem clamp(2.2rem, 5vw, 3.2rem); background: linear-gradient(180deg, var(--wash), var(--yellow-soft) 140%); text-align: center; }
  .finale-art { width: 5.5rem; height: auto; }
  .finale-made { margin: 0; font: 800 clamp(1.3rem, 3.4vw, 1.9rem) / 1.2 var(--display); color: var(--ink); }
  .finale-heart { color: var(--red); }
  .finale-actions { margin-top: 0.6rem; }
  .finale-table { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 48px; padding: 0.65rem 1.4rem; border-radius: 14px; background: var(--red); box-shadow: 0 4px 0 var(--red-edge); color: #fff; font: 800 1.02rem/1 var(--display); text-decoration: none; }
  .finale-table:hover { filter: brightness(1.05); }
  .finale-table:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--red-edge); }
  .foot { margin: 0 auto 2.5rem; width: min(44rem, calc(100% - 2rem)); color: var(--ink-soft); font-size: 0.8rem; text-align: center; }

  /* ---- motion: once, when a section comes into view ---------------------------
     Start states exist only with JavaScript (html.js) and before .in-view; a
     section that is never observed, or a page without script, shows the
     finished scene. */
  @media (prefers-reduced-motion: no-preference) {
    /* the opening: the build's bricks settle on to the table, the tray fills, loose bricks drop */
    html.js .hero:not(.in-view) .layer-build,
    html.js .hero:not(.in-view) .layer-contents,
    html.js .hero:not(.in-view) .layer-loose { opacity: 0; transform: translateY(-7%); }
    .hero.in-view .layer-build { animation: drop 620ms 150ms cubic-bezier(.25,.8,.3,1.15) both; }
    .hero.in-view .layer-contents { animation: drop 420ms 520ms cubic-bezier(.25,.8,.3,1.2) both; }
    .hero.in-view .layer-loose { animation: drop 480ms 760ms cubic-bezier(.25,.8,.3,1.25) both; }

    /* a table before a menu: the view frames in towards the tray, which lights up */
    html.js .ch-table:not(.in-view) .scene { transform: scale(0.94); transform-origin: 48% 60%; }
    html.js .ch-table:not(.in-view) .layer-glow { opacity: 0; }
    .ch-table.in-view .scene { animation: frameIn 900ms 120ms cubic-bezier(.3,.7,.3,1) both; transform-origin: 48% 60%; }
    .ch-table.in-view .layer-glow { animation: glow 700ms 700ms ease-out both; }

    /* social interaction: the planned roof comes down and becomes real */
    html.js .ch-proposal:not(.in-view) .layer-real { opacity: 0; transform: translateY(-6%); }
    html.js .ch-proposal:not(.in-view) .layer-plan { opacity: 1; }
    html.js .ch-proposal:not(.in-view) .cap-real { opacity: 0; }
    html.js .ch-proposal:not(.in-view) .layer-next { opacity: 0; }
    .ch-proposal.in-view .layer-next { animation: capOn 400ms 1500ms ease-out both; }
    .ch-proposal.in-view .layer-plan { animation: planLeaves 700ms 650ms ease-in both; }
    .ch-proposal.in-view .layer-real { animation: seat 520ms 900ms cubic-bezier(.3,.8,.35,1.2) both; }
    .ch-proposal.in-view .cap-real { animation: capOn 300ms 1250ms ease-out both; }

    /* keeping: the creation is set down on its plinth */
    html.js .ch-kept:not(.in-view) .layer-creation { opacity: 0; transform: translateY(-9%); }
    .ch-kept.in-view .layer-creation { animation: drop 640ms 200ms cubic-bezier(.25,.8,.3,1.12) both; }

    /* one intention: the whole table rises into place */
    html.js .ch-intention:not(.in-view) .ch-intention-art { opacity: 0; transform: translateY(26px); }
    .ch-intention.in-view .ch-intention-art { animation: rise 760ms 200ms cubic-bezier(.25,.8,.3,1) both; }
  }
  /* without motion (or once played) the finished state is the default: the
     planned roof is gone and the real one is in place */
  .layer-plan { opacity: 0; }
  html.js .ch-proposal.in-view .layer-plan { opacity: 0; }
  @keyframes drop { from { opacity: 0; transform: translateY(-7%); } 70% { opacity: 1; } to { opacity: 1; transform: none; } }
  @keyframes frameIn { from { transform: scale(0.94); } to { transform: scale(1); } }
  @keyframes glow { 0% { opacity: 0; } 55% { opacity: 1; } 75% { opacity: 0.75; } 100% { opacity: 1; } }
  @keyframes planLeaves { from { opacity: 1; } to { opacity: 0; } }
  @keyframes seat { from { opacity: 0; transform: translateY(-6%); } to { opacity: 1; transform: none; } }
  @keyframes capOn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }

  /* ---- narrower screens ------------------------------------------------------ */
  @media (max-width: 900px) {
    .hero, .ch-table, .ch-proposal, .ch-kept { grid-template-columns: minmax(0, 1fr); }
    .hero-art { max-width: 34rem; margin: 0 auto; width: 100%; }
    .ch-table-art { max-width: 38rem; margin: 0 auto; width: 100%; }
    .ch-proposal-art { order: 2; max-width: 30rem; margin: 0 auto; width: 100%; }
    .ch-kept-art { max-width: 24rem; margin: 0 auto; width: 100%; }
    .ch-proposal { margin: 0; border-radius: 20px; }
  }
  @media (max-width: 560px) {
    :root { font-size: 16px; --beam: 7.4rem; }
    .page-beam-row { gap: 0.4rem 0.6rem; }
    .page-nav { order: 3; width: 100%; margin-right: 0; overflow-x: auto; flex-wrap: nowrap; }
    .page-nav a { white-space: nowrap; }
    .to-table { margin-left: auto; }
    .hero { padding-top: 2rem; }
    .ch-proposal { padding: 2.2rem 1rem; }
    .ch-intention-copy > p:last-of-type { font-size: 1.2rem; }
  }
</style>
</head>
<body>
${pageHeaderHtml({ section: "about" })}
<main class="story">
${hero}
${chapters.map((s, i) => chapterHtml(s, i + 1)).join("\n")}
</main>
<section class="finale" aria-label="Signature">
  ${finaleArt()}
  <p class="finale-made">Made with love <span class="finale-heart" aria-hidden="true">&hearts;</span> by Asuka121380</p>
  <div class="finale-actions">
    <a class="finale-table" href="/"><span aria-hidden="true">&larr;</span> Back to the table</a>
  </div>
</section>
<p class="foot">An independent student project. Not made, sponsored or endorsed by the LEGO Group.</p>
<script>
(function () {
  var els = document.querySelectorAll("[data-anim]");
  function show(el) { el.classList.add("in-view"); }
  if (!("IntersectionObserver" in window)) { els.forEach(show); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });
  els.forEach(function (el) { io.observe(el); });
})();
</script>
</body>
</html>`;
}
