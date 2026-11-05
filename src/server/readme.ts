import { readFileSync } from "node:fs";
import { marked } from "marked";
import { pageHeaderHtml } from "../client/ui/pageHeader.ts";
import {
  contributionsApproachScene,
  displayedCreationScene,
  neighbourhoodScene,
  pieceSettlesScene,
  unfinishedCreationScene,
} from "../client/ui/brickScenes.ts";

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

/** Gives an `isoSvg()` string a class so the page's CSS can size and animate it, without touching the SVG markup it already produced. */
const withClass = (svg: string, cls: string): string => svg.replace("<svg ", `<svg class="${cls}" `);

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

// ---- original, decorative illustrations ------------------------------------
// The hero and the three narrative chapter scenes below are built from the
// same isometric brick primitive the saved-creation thumbnails and the
// lobby's new "ways to begin" tiles use (`ui/brickScenes.ts`, itself built
// on `ui/iso.ts`) — one brick-drawing system for the whole site, not a
// second, flatter icon language invented for this page (author's brief,
// "Bolder artistic pass", 5 Nov 2026). The hero keeps a real `aria-label`
// (it is the substantive opening image, not decoration); the chapter scenes
// are marked `aria-hidden` since each sits beside prose that already says
// what it shows.

/** The opening scene (brief: "a memorable scene… an unfinished creation with room for another person's idea"): three built contributions around one deliberate gap, with a translucent proposed piece — the same "plan" look the editor itself uses — approaching it. */
const heroArt = (): string => withClass(unfinishedCreationScene(), "hero-art");

/**
 * The joining chapter's "a suggestion finds its place": two isoSvg renders
 * of the *same* geometry, one with the third piece still a translucent
 * proposal (`contributionsApproachScene`), one with it real and seated
 * (`pieceSettlesScene`) — both share one viewBox (same bricks, same
 * bounding box), so they can be stacked and cross-faded in place, playing
 * once as the proposal becomes part of the build, never as a loop.
 */
const joiningArt = (): string => `
<span class="joining-art">
  ${withClass(contributionsApproachScene(), "joining-before")}
  ${withClass(pieceSettlesScene(), "joining-after")}
</span>`;

/** The creation among a couple of plainer neighbours, same ground, same strip: build somewhere, not in a void. */
const neighbourhoodArt = (): string => withClass(neighbourhoodScene(), "place-art");

/** The creation on a display plinth, with two equal-sized contributor nameplate studs: shared memory, without inventing anyone's name or story. */
const keepsakeArt = (): string => withClass(displayedCreationScene(), "keepsake-art");

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
      <div class="hero-copy">
        ${render(sections[0].md)}
      </div>
      ${heroArt()}
    </section>` : "";

  // README.md's four H2 sections, in order: "A shared building, a shared
  // memory", "Build somewhere, not in a void", "Join, build, and keep a
  // creation", "What is checked, and what needs judgement". Matched by
  // position, not by guessing at exact wording, so a small wording edit to
  // README.md doesn't silently break the illustration assignment — if the
  // author ever adds or removes a section, the extra ones still render,
  // undecorated, in the generic `.chapter-plain` layout below.
  //
  // Refinement (author's brief, 5 Nov 2026): a real browser check found
  // every chapter mechanically alternating the same two-column shape,
  // squeezing text into a narrow column beside an oversized illustration.
  // Each chapter now picks a composition suited to its own length and
  // role: the longest, most substantive chapter (cooperation and shared
  // memory) reads at full width with its illustration as a floated accent,
  // not a permanent side column; the two shorter, more scene-setting
  // chapters (the neighbourhood, the saved keepsake) keep a supporting
  // illustration column, sized to the text rather than overwhelming it;
  // the closing, informational chapter (what's checked vs. what needs
  // judgement) is a single compact column with a small inline icon.
  // `inCopy: true` means the art is placed first inside `.chapter-copy`
  // (so it floats correctly beside the start of the rendered prose);
  // otherwise it's a separate column beside the copy.
  const chapters = sections.slice(1);
  const layouts: { art: () => string; cls: string; inCopy: boolean }[] = [
    { art: joiningArt, cls: "chapter-wide chapter-join", inCopy: true },
    { art: neighbourhoodArt, cls: "chapter-support chapter-place alt", inCopy: false },
    { art: keepsakeArt, cls: "chapter-support chapter-keep", inCopy: false },
    { art: checklistArt, cls: "chapter-compact chapter-checked", inCopy: true },
  ];
  const chapterHtml = chapters
    .map((s, i) => {
      const layout = layouts[i];
      const art = layout ? layout.art() : "";
      const cls = layout ? layout.cls : "chapter-plain";
      const copy = `<div class="chapter-copy">${layout?.inCopy ? art : ""}${render(s.md)}</div>`;
      return `
    <section class="chapter ${cls}" data-anim>
      ${!layout || layout.inCopy ? "" : art}
      ${copy}
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
    width: 100%;
    min-height: 100vh;
    background: var(--wash);
    overflow-x: hidden;
  }
  :focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 4px; }

  /* ---- the shared dedicated-page header (ui/pageHeader.ts) --------------
     Refinement (author's brief, 5 Nov 2026): About previously had its own
     bar with only the brand and a return button, not the shared nav the
     other dedicated pages use. This is the exact same markup Shell.tsx
     renders client-side, styled here with plain CSS (no JavaScript
     involved in producing or showing it), so About keeps working with no
     script while still reading as the same place as the lobby/account/
     collection/showcase pages. */
  .page-beam {
    position: sticky;
    top: 0;
    z-index: 5;
    background: linear-gradient(180deg, var(--red) 0%, var(--red) 82%, var(--red-edge) 100%);
    box-shadow: 0 3px 0 var(--red-deep);
  }
  .page-beam-studs {
    height: 7px;
    background-image: radial-gradient(circle at 50% 35%, rgb(255 255 255 / 0.4) 0 28%, transparent 30%);
    background-size: 22px 100%;
    background-position: 11px 0;
    background-repeat: repeat-x;
    opacity: 0.55;
  }
  .page-beam-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.2rem;
    padding: 0.65rem clamp(1rem, 4vw, 2rem) 0.75rem;
  }
  .home-link {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: #fff;
    font: 800 1.2rem/1 var(--display);
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .home-link svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 0 rgb(0 0 0 / 0.18)); }
  .page-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-right: auto; }
  .page-nav a {
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    color: #fff;
    font-weight: 800;
    font-size: 0.94rem;
    text-decoration: none;
    opacity: 0.88;
  }
  .page-nav a:hover { background: rgb(255 255 255 / 0.16); opacity: 1; }
  .page-nav a[aria-current="page"] { background: #fff; color: var(--red-deep); opacity: 1; box-shadow: 0 2px 0 rgb(0 0 0 / 0.18); }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 0.95rem;
    border: 2px solid rgb(255 255 255 / 0.4);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.14);
    color: #fff;
    font: 800 0.95rem/1 var(--display);
    text-decoration: none;
    backdrop-filter: blur(2px);
  }
  .btn:hover { background: rgb(255 255 255 / 0.22); }
  .btn:active { transform: translateY(1px); }
  .btn-small { min-height: 40px; padding: 0.4rem 0.8rem; font-size: 0.9rem; }
  .to-table { white-space: nowrap; }

  /* ---- the story: one flowing page, each chapter its own composition --- */

  /* Refinement (author's brief, 5 Nov 2026): a real browser check found the
     middle chapters cramming body text into a narrow column beside an
     oversized illustration, causing frequent short line wraps. The page
     now uses a wider shared frame (.story), and each chapter picks its
     own composition rather than mechanically alternating one two-column
     template: a wide single column for the longest, most important prose
     (the opening and the cooperation chapter), a supporting-illustration
     layout with a narrower but still comfortable art column for the two
     shorter chapters, and a compact single-column read for the closing
     "checked vs. judgement" chapter — varied rhythm, not one repeated
     shape (the brief's own description of the intended structure). */
  .story { width: min(74rem, 100%); margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2.5rem); }

  /* the beam is sticky and sits above everything (z-index: 5); any
     scroll-to-section (a browser's own find-in-page jump, or a future
     in-page link) must not land a heading underneath it */
  h1, h2, h3, h4 { font-family: var(--display); line-height: 1.12; letter-spacing: -0.015em; color: var(--ink); scroll-margin-top: 6.5rem; }
  .chapter, .chapter-wide, .chapter-support, .chapter-compact, .chapter-plain, .hero { scroll-margin-top: 5.5rem; }
  p, ul, ol { margin: 0 0 1rem; }
  li + li { margin-top: 0.3rem; }
  a { color: var(--link); text-underline-offset: 2px; }
  strong { color: var(--ink); }
  blockquote { margin: 1.2rem 0; padding: 0.6rem 1rem; border-left: 4px solid var(--yellow); background: var(--yellow-soft); border-radius: 0 10px 10px 0; color: var(--ink-soft); }
  img { max-width: 100%; height: auto; border-radius: 10px; }
  code { background: var(--wash); padding: 0.05em 0.3em; border-radius: 4px; font-size: 0.92em; }
  pre { background: var(--wash); padding: 0.9rem; overflow-x: auto; border-radius: 10px; }
  pre code { padding: 0; background: none; }
  .table-wrap, table { display: block; max-width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 0.92rem; margin: 0 0 1rem; }
  th, td { border: 1px solid var(--line); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: var(--wash); }

  /* the opening (brief: "a substantial original visual scene… enough scale,
     detail and contrast to carry the opening — do not replace one tiny
     icon with several tiny icons"): the scene now sits directly beside the
     title and lede, at a real hero size, in a two-column frame on wide
     screens that still reads top-to-bottom first (the text column comes
     first in the markup) and stacks on narrow ones — asymmetric, but with
     one clear reading order, never requiring the scene to be understood
     before the words are. */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 26rem);
    align-items: center;
    gap: clamp(1.6rem, 4vw, 3.5rem);
    padding: clamp(2.5rem, 7vw, 5rem) 0 clamp(2.2rem, 5vw, 3.4rem);
  }
  .hero-copy { max-width: 42rem; }
  .hero-copy h1 {
    margin: 0 0 1rem;
    font-size: clamp(2.6rem, 6vw, 4.2rem);
    font-weight: 800;
  }
  .hero-copy p { font-size: 1.15rem; line-height: 1.6; color: var(--ink-soft); }
  .hero-art {
    width: 100%;
    height: auto;
    filter: drop-shadow(0 10px 18px rgb(36 26 23 / 0.16));
    opacity: 0;
    transform: translateY(18px) scale(0.96);
  }
  .hero.anim-in .hero-art { animation: popIn 640ms 120ms cubic-bezier(.2,.7,.3,1) both; }
  .hero:not(.anim-in) .hero-art { opacity: 1; transform: none; }

  /* a wide chapter: full-width, comfortably-measured prose (the longest,
     most substantive chapter gets the most reading room), with its
     illustration set as a smaller accent beside the heading — floated,
     so the text still reads at one even measure beneath it rather than
     being squeezed into a narrow permanent side column */
  .chapter-wide {
    padding: clamp(2.2rem, 5vw, 3.6rem) 0;
    border-top: 2px dashed var(--line);
  }
  .chapter-wide .chapter-copy { max-width: 50rem; }
  .chapter-wide .chapter-copy h2 {
    margin: 0 0 0.7rem;
    font-size: clamp(1.6rem, 3.4vw, 2.3rem);
    color: var(--red-deep);
  }
  .chapter-wide .joining-art {
    float: right;
    position: relative;
    display: block;
    width: min(16rem, 40%);
    margin: 0.2rem 0 1rem 1.6rem;
  }
  .chapter-wide .chapter-copy::after { content: ""; display: block; clear: both; }

  /* a supporting chapter: prose keeps a comfortable measure of its own
     (constrained on the copy, not stretched to fill a narrow grid track);
     its illustration sits beside it as a smaller, proportionate column,
     never wider than the text it accompanies */
  .chapter-support {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(11rem, 15rem);
    align-items: start;
    gap: 2.2rem;
    padding: clamp(2.2rem, 5vw, 3.6rem) 0;
    border-top: 2px dashed var(--line);
  }
  .chapter-support.alt { grid-template-columns: minmax(11rem, 15rem) minmax(0, 1fr); }
  .chapter-support.alt .chapter-copy { order: 2; }
  /* non-alt: the art is emitted before .chapter-copy in markup (so it
     reads art-then-prose in a screen reader or no-CSS fallback), but the
     wide column is first in this variant's track list -- without an
     explicit order, the art would land in the wide column and the prose
     in the narrow one, the opposite of "a supporting illustration column,
     sized to the text, never overwhelming it" (found in a real browser
     check, 5 Nov 2026, once the art became a real detailed scene rather
     than a small flat icon and the bug became visible). */
  .chapter-support:not(.alt) > :first-child:not(.chapter-copy) { order: 2; }
  .chapter-support .chapter-copy {
    max-width: 38rem;
  }
  .chapter-support .chapter-copy h2 {
    margin: 0 0 0.7rem;
    font-size: clamp(1.5rem, 3.2vw, 2.1rem);
    color: var(--red-deep);
  }
  .chapter-support :is(.place-art, .keepsake-art) { width: 100%; height: auto; justify-self: center; margin-top: 0.3rem; filter: drop-shadow(0 6px 12px rgb(36 26 23 / 0.14)); }

  .chapter p, .chapter ul, .chapter-wide p, .chapter-wide ul, .chapter-support p, .chapter-support ul { color: var(--ink); }

  /* a compact, informational chapter: smaller type, a single-column read
     at a comfortable measure, a small icon set beside the heading instead
     of a full scene */
  .chapter-compact {
    padding: clamp(2.2rem, 5vw, 3.6rem) 0;
    border-top: 2px dashed var(--line);
  }
  .chapter-compact .chapter-copy { max-width: 46rem; }
  .chapter-compact .checklist-art {
    float: left;
    width: 2.2rem;
    height: 2.2rem;
    margin: 0.2rem 0.7rem 0 0;
  }
  .chapter-compact .chapter-copy h2 { margin: 0 0 0.6rem; font-size: 1.3rem; color: var(--red-deep); }
  .chapter-compact .chapter-copy p { font-size: 0.98rem; }
  /* the icon floats only beside the heading; the prose below always
     starts at the full column width, never squeezed beside it */
  .chapter-compact .chapter-copy p:first-of-type { clear: both; }

  /* a generic fallback for any section this file doesn't name a layout
     for (if README.md ever gains or loses a heading): a plain wide read,
     never broken, never undecorated-looking as an error */
  .chapter-plain {
    padding: clamp(2.2rem, 5vw, 3.6rem) 0;
    border-top: 2px dashed var(--line);
  }
  .chapter-plain .chapter-copy { max-width: 48rem; }

  /* the proposed piece finding its place (brief, section 7: "a proposed
     piece settling into a gap"): two renders of the same scene, stacked in
     the same box — the "before" (piece still a translucent plan) visible
     first, the "after" (piece now real) fading in over it and staying, a
     single settling moment, never a loop. */
  .joining-art { position: relative; display: block; }
  .joining-before, .joining-after { display: block; width: 100%; height: auto; }
  .joining-after { position: absolute; inset: 0; opacity: 0; }
  .chapter-join.anim-in .joining-after { animation: settleIn 520ms 420ms cubic-bezier(.3,0,.2,1) both; }
  .chapter-join:not(.anim-in) .joining-after { opacity: 1; }

  .place-art, .keepsake-art { opacity: 0; transform: translateY(10px); }
  .chapter-place.anim-in .place-art { animation: popIn 560ms 140ms ease-out both; }
  .chapter-place:not(.anim-in) .place-art { opacity: 1; transform: none; }
  .chapter-keep.anim-in .keepsake-art { animation: popIn 560ms 100ms ease-out both; }
  .chapter-keep:not(.anim-in) .keepsake-art { opacity: 1; transform: none; }

  @keyframes popIn { from { opacity: 0; transform: translateY(14px) scale(0.92); } to { opacity: 1; transform: none; } }
  @keyframes settleIn { from { opacity: 0; } to { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .hero-art, .joining-after, .place-art, .keepsake-art {
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
    .hero { grid-template-columns: 1fr; }
    .hero-art { width: min(20rem, 80%); margin: 0 auto; }
    .chapter-wide .joining-art { float: none; width: min(18rem, 75%); margin: 0 auto 1rem; }
    .chapter-support { grid-template-columns: 1fr; }
    .chapter-support.alt .chapter-copy { order: 0; }
    .chapter-support :is(.place-art, .keepsake-art) { max-width: 18rem; margin: 0 auto; }
  }
  @media (max-width: 560px) {
    :root { font-size: 16px; }
    .page-beam-row { gap: 0.4rem 0.6rem; }
    .page-nav { order: 3; width: 100%; margin-right: 0; overflow-x: auto; flex-wrap: nowrap; }
    .page-nav a { white-space: nowrap; }
    .to-table { margin-left: auto; }
    .btn-small { min-height: 40px; padding: 0.4rem 0.8rem; font-size: 0.92rem; white-space: nowrap; }
    /* the beam wraps the nav onto its own row here, roughly doubling its
       height, so a scrolled-to heading needs more clearance to stay clear
       of it (brief: "check sticky-header overlap... so headings are not
       obscured when navigating or scrolling") */
    h1, h2, h3, h4 { scroll-margin-top: 10.5rem; }
    .chapter, .chapter-wide, .chapter-support, .chapter-compact, .chapter-plain, .hero { scroll-margin-top: 9.5rem; }
  }
</style>
</head>
<body>
${pageHeaderHtml({ section: "about" })}
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
