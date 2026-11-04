import { readFileSync } from "node:fs";
import { marked } from "marked";

// /readme/ is README.md rendered on the server, so the whole argument is in
// the HTML a visitor (or the shipped check) receives, with no script needed.
//
// The table's booklet leads here (ADR 0014), so the page wears the site's
// look: cream paper, a red-edged booklet page, rounded headings, a
// comfortable reading width and a way back to the table. Only the frame and
// the styles are ours; the body is README.md exactly as written, rendered
// as-is. No fonts or scripts load from anywhere: the page is one response.

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect y='5' width='16' height='11' rx='2' fill='%23e3241b'/%3E%3Crect x='2' y='2' width='4' height='4' rx='1' fill='%23e3241b'/%3E%3Crect x='10' y='2' width='4' height='4' rx='1' fill='%23e3241b'/%3E%3C/svg%3E";

export function renderReadme(path: string): string {
  const md = readFileSync(path, "utf8");
  const body = marked.parse(md, { async: false, gfm: true });
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? "About";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<link rel="icon" href="${ICON}" />
<style>
  :root {
    --ink: #2b2622;
    --ink-soft: #5d5348;
    --paper: #fffdf8;
    --line: #e6dac4;
    --red: #d6261c;
    --red-deep: #a8170f;
    --yellow: #f5c01f;
    --link: #1d4f99;
    --display: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--ink);
    background: #f4ecdc;
    font: 17px/1.65 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: radial-gradient(120% 70% at 50% 0%, #fbf4e6 0%, #f4ecdc 60%, #ecdfc8 100%);
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem clamp(1rem, 4vw, 2rem);
    background: rgb(251 246 234 / 0.94);
    border-bottom: 2px solid var(--line);
  }
  .brand { font: 700 1.05rem/1 var(--display); color: var(--ink); text-decoration: none; }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.45rem 0.95rem;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 3px 0 #d7c9ae;
    color: var(--ink);
    font-weight: 700;
    text-decoration: none;
  }
  .back:hover { background: #fff8e6; }
  .back:active { transform: translateY(2px); box-shadow: 0 1px 0 #d7c9ae; }
  main {
    width: min(44rem, calc(100% - 2rem));
    margin: clamp(1rem, 4vw, 2.5rem) auto 4rem;
    padding: clamp(1.25rem, 4vw, 2.75rem) clamp(1.1rem, 5vw, 3.25rem) clamp(1.5rem, 4vw, 3rem);
    background: var(--paper);
    border: 2px solid var(--line);
    border-left: 10px solid var(--red);
    border-radius: 16px;
    box-shadow: 0 5px 0 var(--line), 0 24px 48px rgb(84 60 32 / 0.12);
  }
  h1, h2, h3, h4 { font-family: var(--display); line-height: 1.2; letter-spacing: -0.01em; color: var(--ink); }
  h1 { margin: 0 0 1rem; font-size: clamp(1.9rem, 5vw, 2.5rem); }
  h1::after { content: ""; display: block; width: 3.5rem; height: 0.4rem; margin-top: 0.6rem; border-radius: 4px; background: var(--yellow); }
  h2 { margin: 2.4rem 0 0.6rem; padding-top: 1.4rem; border-top: 2px dashed var(--line); font-size: 1.4rem; }
  h3 { margin: 1.8rem 0 0.4rem; font-size: 1.12rem; }
  p, ul, ol { margin: 0 0 1rem; }
  li + li { margin-top: 0.3rem; }
  a { color: var(--link); text-underline-offset: 2px; }
  strong { color: var(--ink); }
  blockquote { margin: 1.2rem 0; padding: 0.6rem 1rem; border-left: 4px solid var(--yellow); background: #fff8e1; border-radius: 0 10px 10px 0; color: var(--ink-soft); }
  img { max-width: 100%; height: auto; border-radius: 10px; }
  code { background: #f1e9d8; padding: 0.05em 0.3em; border-radius: 4px; font-size: 0.92em; }
  pre { background: #f1e9d8; padding: 0.9rem; overflow-x: auto; border-radius: 10px; }
  pre code { padding: 0; background: none; }
  hr { border: 0; border-top: 2px dashed var(--line); margin: 2rem 0; }
  .table-wrap, table { display: block; max-width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 0.92rem; margin: 0 0 1rem; }
  th, td { border: 1px solid var(--line); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f8f0de; }
  .foot { margin: 0 auto 2.5rem; width: min(44rem, calc(100% - 2rem)); color: var(--ink-soft); font-size: 0.8rem; text-align: center; }
  :focus-visible { outline: 3px solid #1d4f99; outline-offset: 2px; border-radius: 4px; }
  @media (max-width: 560px) {
    :root { font-size: 16px; }
    .brand { display: none; }
    main { border-left-width: 6px; }
  }
</style>
</head>
<body>
<header class="bar">
<a class="brand" href="/">Brick Commons</a>
<a class="back" href="/"><span aria-hidden="true">←</span> Back to the table</a>
</header>
<main>
${body}
</main>
<p class="foot">An independent student project. Not made, sponsored or endorsed by the LEGO Group.</p>
</body>
</html>`;
}
