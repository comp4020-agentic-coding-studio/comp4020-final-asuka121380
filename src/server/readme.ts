import { readFileSync } from "node:fs";
import { marked } from "marked";

// /readme/ is README.md rendered on the server, so the whole argument is in
// the HTML a visitor (or the shipped check) receives, with no script needed.

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

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
<style>
  :root { color: #23262b; background: #faf7f0; font: 17px/1.6 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { margin: 0; }
  main { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  nav a, main a { color: #22385f; }
  img { max-width: 100%; height: auto; }
  code { background: #ece7dc; padding: 0 0.25em; border-radius: 3px; }
  pre { background: #ece7dc; padding: 0.8rem; overflow-x: auto; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { border: 1px solid #ddd6c8; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
  :focus-visible { outline: 3px solid #e08a00; outline-offset: 2px; }
</style>
</head>
<body>
<main>
<nav><a href="/">← Back to the street</a></nav>
${body}
</main>
</body>
</html>`;
}
