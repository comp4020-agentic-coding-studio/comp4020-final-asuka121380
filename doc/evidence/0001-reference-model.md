# Evidence 0001: the reference model, from the official 11035 instructions

Collected by the agent, 6 October 2026. Facts only; the decisions that follow
from them are in `doc/adr/`.

## Source and access

- Downloaded the official instructions PDF linked from the design brief
  (`https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6497646.pdf`):
  HTTP 200, 31.7 MB, 124 pages.
- The PDF reader in the agent's tools needs poppler, which isn't installed. The
  pages were rendered to PNG with macOS PDFKit through a small Swift script
  instead, outside the repo.
- Neither the PDF nor the page renders are committed. They are LEGO's
  copyrighted material, and the repo goes public.

## What pages 100–116 show

The small house with the dark-blue roof, then its tree. Step numbers are
the instruction book's.

| Steps | Parts | Where (this repo's grid) |
| --- | --- | --- |
| 1 | 6×8 plate, grey | the base: x 1–8, z 1–6 |
| 2, 4 | 2×4 brick ×4, dark blue | two wall columns, 2 wide × 4 deep, at x 1–2 and x 7–8, courses 1–2 |
| 3 | 2×2 plate ×2, green | front garden corners, z 5–6 |
| 5–8 | 2×4 brick ×8, light aqua | the same columns, courses 3–6 |
| 9 | door 1×4×6 in white frame, dark blue door, yellow 1×1 round knob | between the columns at the front of the house body |
| 10 | 2×8 plate ×2, white | across the top of the walls, covering 8 × 4 |
| 11 | 2×2 brick ×4, dark blue | centre 4 × 4 of the roof |
| 12 | 2×4 brick ×1, dark blue | on top of those, front to back, offset by a stud |
| 13–15 | 2×2 45° slope ×12, dark blue | three courses, two each side, stepping inward |
| 16 | 2×2 double (ridge) slope ×2, dark blue | the ridge |
| 17 | flower ×2 (leaves, yellow flower, 1×1 round) | one on each garden plate |
| 18–19 | 2×2 brick ×3, reddish brown | trunk |
| 20–22 | 2×4 brick ×3: dark green, bright green, dark green | canopy |
| 23–24 | 2×2 brick, bright green; 1×1 round plate, red | top of the tree |

Page 116 shows the finished model, plus a "Rebuild" panel of extra parts for
varying it. Those extras are: two light-aqua and one dark-blue 2×4, two 2×2
slopes, four light-aqua 1×2, two 2×1 slopes, three 1×1 rounds, two curved
slopes and a transparent panel.

## What the agent interpreted rather than read

- **The ridge piece in step 16.** I rendered it at 3.5× to judge its
  proportions against the 2×2 slopes in the step before, and I read it as a
  2×2 double slope, two of which cover the 4-deep ridge. A 2×1 double would
  leave half the ridge open, which page 116 doesn't show.
- **The exact position of the flowers on their plates and of the tree's top
  2×2.** I read these off the isometric drawings.

## Result

- The model is `src/domain/scene.ts`: 46 placements of 11 part types (38 for
  the house, 8 for the tree).
- `spec/domain/rules.test.ts` places every one of them, in instruction order,
  through `validatePlacement`, the same rule the server applies to players.
  All 46 are accepted, and the stock equation (kit = held + placed) holds at
  the end.

## Adaptations (see ADR 0002)

- The 6×8 base plate is the plot itself, a fixed 16×8 surface, so the house
  stands directly on it.
- The door, frame and knob are one part, and so are the leaves, flower head and
  centre of each flower.
- Slopes collide as full boxes.
- The proposed surplus and two extra types (1×2 brick, 2×1 slope) come from
  the page 116 Rebuild panel. The curved slopes and transparent panel are left
  out.
