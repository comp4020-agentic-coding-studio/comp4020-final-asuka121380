import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "../ui/theme.css";
import "./home.css";
import { partDef } from "../../domain/catalog.ts";
import { SCENE_LIST, templateOf } from "../scenes/registry.ts";
import { brandMark, isoSvg, type IsoBrick } from "../ui/iso.ts";

// The homepage (ADR 0004): static HTML for every word, and this small script
// for the drawings, the scene list and whether to say "Continue". It never
// imports three.js or a scene's surroundings.

const RED = "#e3241b";
const YELLOW = "#ffcd00";
const WHITE = "#f7f5f0";
const BLUE = "#1a5bb0";
const GREEN = "#2f9e57";
const CORAL = "#ff7059";
const TEAL = "#1fb4ab";

const B = (x: number, y: number, z: number, w: number, d: number, colour: string, h = 3, extra: Partial<IsoBrick> = {}): IsoBrick => ({ x, y, z, w, d, h, colour, ...extra });

// Two kits meeting in one build: a staggered wall laid in red and white from
// one side and yellow and blue from the other, on a shared plate, with the
// next brick about to drop into the gap at the top.
const HERO: IsoBrick[] = [
  B(0, 0, 0, 12, 7, WHITE, 1),
  // course 1
  B(1, 2, 1, 4, 2, RED),
  B(5, 2, 1, 2, 2, WHITE),
  B(7, 2, 1, 4, 2, YELLOW),
  // course 2, half a brick along
  B(1, 2, 4, 2, 2, WHITE),
  B(3, 2, 4, 4, 2, RED),
  B(7, 2, 4, 2, 2, BLUE),
  B(9, 2, 4, 2, 2, YELLOW),
  // course 3
  B(1, 2, 7, 4, 2, RED),
  B(5, 2, 7, 4, 2, YELLOW),
  B(9, 2, 7, 2, 2, BLUE),
  // course 4, stepping in
  B(2, 2, 10, 2, 2, WHITE),
  B(4, 2, 10, 4, 2, RED),
  B(8, 2, 10, 2, 2, YELLOW),
  // the top, with a gap the hovering brick will fill
  B(3, 2, 13, 2, 2, YELLOW),
  B(7, 2, 13, 2, 2, BLUE),
  // a little garden in front
  B(2, 5, 1, 2, 1, GREEN, 1),
  B(8, 5, 1, 2, 1, CORAL, 1),
  B(9, 5, 2, 1, 1, YELLOW, 1),
  B(5, 2, 19, 2, 2, RED, 3, { float: true }),
];

const ART: Record<string, IsoBrick[]> = {
  kit: [B(0, 0, 0, 2, 4, RED), B(3, 0, 0, 2, 2, YELLOW), B(3, 3, 0, 2, 2, WHITE, 1), B(0, 5, 0, 2, 2, BLUE)],
  colour: [B(0, 0, 0, 4, 2, CORAL), B(0, 0, 3, 2, 2, TEAL), B(2, 0, 3, 2, 2, YELLOW), B(1, 0, 6, 2, 2, "#a68fdb")],
  kept: [B(0, 0, 0, 6, 4, GREEN, 1), B(1, 1, 1, 4, 2, WHITE), B(1, 1, 4, 4, 2, WHITE), B(2, 1, 7, 2, 2, RED), B(1, 3, 1, 1, 1, YELLOW)],
  together: [
    B(0, 0, 0, 6, 4, WHITE, 1),
    B(0, 0, 1, 4, 2, RED),
    B(4, 0, 1, 2, 2, YELLOW),
    B(0, 2, 1, 2, 2, YELLOW),
    B(0, 0, 4, 2, 2, RED),
    B(2, 0, 4, 4, 2, BLUE, 3, { ghost: true }),
  ],
};

for (const el of document.querySelectorAll<HTMLElement>("[data-mark]")) el.innerHTML = brandMark();
document.getElementById("hero-art")!.innerHTML = isoSvg(HERO, "Bricks in red, white, yellow and blue stacked into one construction, with one more brick about to drop into place");
for (const el of document.querySelectorAll<HTMLElement>("[data-art]")) el.innerHTML = isoSvg(ART[el.dataset.art!] ?? [], "").replace('role="img" aria-label=""', 'aria-hidden="true"');

// ---- scenes, from the registry ---------------------------------------------

const list = document.getElementById("scene-list")!;
for (const info of SCENE_LIST) {
  const t = templateOf(info);
  const parts = Object.values(t.kit).reduce((a, b) => a + b, 0);
  const kinds = Object.keys(t.kit).filter((id) => partDef(id)).length;
  const card = document.createElement("article");
  card.className = "card scene-card";
  card.innerHTML = `
    <img src="${info.cover}" alt="${info.coverAlt}" width="1200" height="675" loading="lazy" />
    <div class="scene-body">
      <p class="scene-kicker"><span class="tag">Scene 1</span></p>
      <h3>${info.title}</h3>
      <p class="setting">${info.setting}</p>
      <p>${info.blurb}</p>
      <p class="meta"><span><b>${parts}</b> parts</span><span><b>${kinds}</b> kinds of part</span><span>Any colour</span></p>
      <a class="btn btn-red scene-go" href="/build/">Build here</a>
    </div>`;
  list.replaceChildren(card);
}

// ---- "Continue my build" ---------------------------------------------------

// read-only: asking never creates a visitor or a build
fetch("/api/summary")
  .then((r) => (r.ok ? r.json() : null))
  .then((s: { hasBuild: boolean; parts: number } | null) => {
    if (!s?.hasBuild) return;
    document.getElementById("start")!.textContent = "Continue my build";
    for (const a of document.querySelectorAll(".scene-go")) a.textContent = "Continue here";
    const note = document.getElementById("cta-note")!;
    note.textContent = s.parts === 0 ? "Your plot is ready and still empty." : `Your build has ${s.parts} part${s.parts === 1 ? "" : "s"} so far.`;
    note.hidden = false;
  })
  .catch(() => {});
