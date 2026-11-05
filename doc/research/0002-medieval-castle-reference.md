# Research 0002: the Medieval Castle reference (LEGO Creator 31120)

Collected by the agent on 5 November 2026 (AEDT) for the Medieval Castle
scene (ADR 0015), following the author's brief to derive the scene's part
catalogue and inventory from the official building instructions for the
**primary castle model only**. Text and numbers only: no PDF, page render,
product photograph or LEGO branding is committed or served (CLAUDE.md,
Never). Every page reference below is to the official booklet, so the
counts can be checked against the source.

## Sources

| What | Where |
| --- | --- |
| Product page (identifies the set; not used for counting) | <https://www.lego.com/en-us/product/medieval-castle-31120> |
| Building instructions page | <https://www.lego.com/en-us/service/building-instructions/31120> |
| Booklet 1: **the primary castle** (224 pages) | file `6372694.pdf`, linked from the instructions page |
| Booklet 2: the alternative builds (224 pages) | file `6372697.pdf`, linked from the instructions page |

Both booklets were downloaded on 5 November 2026 into a temporary folder
outside the repository (`/tmp/ref31120`) and read there. They, and every
page render and extracted image made from them, stay out of the repository
and out of `public/`.

### Which booklet is the primary model

- Booklet 1's opening pages (pp. 2–4) show the primary castle and its
  modules; its steps run to p. 208, where the modules are joined, and
  pp. 209–216 build the dragon.
- Booklet 2 holds the alternative models. Its pp. 221–223 are the
  **whole set's** parts list (1,426 pieces, including minifigures, weapons,
  the dragon and parts only the alternative models use).

So the set's inventory pages cannot give the primary castle's part counts,
and the set's piece count is not the building's part count. Neither is
used. Every count below comes from booklet 1's own step callouts.

## What was counted

The brief's adapted reference is "castle entrance, two towers, connecting
walls and battlements, small courtyard, medieval doors, windows and roofs".
Booklet 1 is divided into numbered bags. Each bag's step pages were
identified from the bag numbers printed on the pages:

| Bag | Booklet 1 pages | What it builds (pp. 2–4 and the step pages) | Counted |
| --- | --- | --- | --- |
| 1 | 6–45 | the rock base and the gate platform | **yes** |
| 2 | 46–81 | the gatehouse's lower storey and its timber upper storey | **yes** |
| 3 | 82–109 | the two square towers either side of the gate, the battlements, the roofed timber section, the drawbridge | **yes** |
| 4 | 110–134 | a small ruin/hut with a brown roof | no: a separate building |
| 5 | 135–167 (168 joins) | a timber house with a curved roof and a water wheel | no: a separate building |
| 6 | 169–189 | the wall section: crenellations, an awning, the cell and its door | **yes** |
| 7 | 190–207 | the watchtower | no: a separate building |
| — | 208 | joining the modules (no new structure) | no |
| — | 209–216 | the dragon | no: an animal (brief: excluded) |

### Counting method

1. Each page of booklet 1 was read as a PDF content stream (with `pypdf`,
   plus a small interpreter for the text and image positioning operators),
   giving the position of every part image and every quantity label
   ("1x", "2x", …) in each step's callout box.
2. The labels are drawn in an embedded font with a private glyph mapping,
   so the digits were decoded once by matching each glyph to the digits
   visible in a rendered page, then applied throughout.
3. Each quantity label was paired with the part image directly above it
   in the same callout (nearest image above, within the callout's column).
   This pairing was checked by hand against the rendered page for step 58
   (p. 53), with every pair correct.
4. Identical part images share an image object in the PDF, so a part's
   image hash identifies the same part type and colour across pages. The
   per-step quantities were summed by hash, per bag.
5. Every distinct part image counted in bags 1, 2, 3 and 6 was looked at
   on contact sheets and identified by eye. Each was then classified as
   mapped to a game part (below) or omitted (minifigures, accessories,
   landscape, drawbridge mechanism and so on).
6. Labels that were not paired with an image were checked one by one.
   Almost all were step-count multipliers ("2x" beside a sub-assembly).
   Two were real single-part callouts with the part image placed beside
   the label instead of above it:
   - p. 91: a brown plate 4×8 (the hinged roof's base);
   - p. 181: a black door frame 1×4×6 (the cell door).
   Both were added to the count by hand.

Of the counted parts, **544 pieces in 83 distinct part images** map to
game parts. The rest were omitted, in six groups:

| Omitted group | Part images | Pieces | Why |
| --- | --- | --- | --- |
| landscape (rocks, water, plants, tree parts) | 30 | 67 | the scene's own terrain stands in for the rock base |
| drawbridge, chain and mechanism | 28 | 51 | no hinges or moving parts in the rules; the gate is a fixed arch |
| minifigures, loose accessories, food, containers | 29 | 31 | brief: excluded |
| small finishing details (cheese slopes, pentagonal and curved tiles, awning) | 10 | 29 | no matching part shape; decoration only |
| flags, banners, torches, shields | 10 | 22 | brief: weapons and accessories excluded |
| plants and flowers | 3 | 18 | scenery, not structure |

## Mapping and counts

The game's catalogue has no sideways attachment, no hinges, and studs only
on top. Every official part is therefore kept, replaced by an equivalent
the rules support, or omitted. Colour is not part of the mapping: the kit
is colour-agnostic, and every colour stays available.

Classes:
- **exact reuse**: an existing game part of the same shape and size.
- **new part**: added to the catalogue for this scene, same shape and size.
- **substitution**: a different game part, or several, standing in for it
  (said how in the note).
- **omitted**: in the table above, not mapped.

A row's "Game part" says how many of which game part one official piece
becomes. Fractions apportion a group, e.g. two half-arches make one arch.
The required quantity is the sum over every row, rounded up to whole parts.
The full table is the classifier's output, sorted by count. The image key
is the first six hex characters of the SHA-1 of the part image's stream
data and pixel size in booklet 1. It is only a label for matching rows to
the counting run; a reader with the booklet finds a part by its pages.

| Image key | Official part (as identified) | Pieces | Per bag | Booklet 1 pages | Game part | Class | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `5990cc` | Brick, round 1×1 (light grey) | 62 | bag 1: 7, bag 2: 28, bag 3: 24, bag 6: 3 | 23, 24, 26, 32, 39, 47, 48, 53, 59, 60, 83, 175, 183 | 1× `round-brick-1x1` | new part |  |
| `7be1f4` | Brick 1×1 (dark grey) | 41 | bag 1: 9, bag 2: 6, bag 3: 8, bag 6: 18 | 14, 23, 24, 25, 27, 46, 47, 48, 49, 54, 84, 86, 96, 173, 174, 175, 176, 177, 182, 183, 185, 187 | 1× `brick-1x1` | new part |  |
| `8f4063` | Brick 1×1 (light grey) | 37 | bag 1: 6, bag 2: 8, bag 3: 20, bag 6: 3 | 14, 24, 25, 28, 33, 34, 47, 52, 53, 61, 83, 90, 95, 98, 100, 175, 177 | 1× `brick-1x1` | new part |  |
| `03267f` | Slope 45° 2×1 (light grey) | 24 | bag 2: 1, bag 3: 16, bag 6: 7 | 46, 87, 102, 186, 187 | 1× `slope-2x1` | exact reuse |  |
| `b66791` | Brick 1×2 (dark grey) | 21 | bag 1: 9, bag 2: 2, bag 3: 1, bag 6: 9 | 14, 23, 26, 27, 34, 39, 42, 46, 47, 84, 177, 182, 183, 187 | 1× `brick-1x2` | exact reuse |  |
| `defa7a` | Brick 1×4 (dark grey) | 17 | bag 1: 2, bag 2: 1, bag 3: 2, bag 6: 12 | 32, 42, 54, 84, 86, 173, 176, 177, 182, 183, 185, 187 | 1× `brick-1x4` | new part |  |
| `0ef557` | Brick 1×2 (light grey) | 16 | bag 1: 6, bag 2: 4, bag 6: 6 | 23, 24, 28, 34, 43, 47, 48, 173, 175, 177, 183 | 1× `brick-1x2` | exact reuse |  |
| `94d755` | Brick 1×2 with rounded ends | 13 | bag 3: 6, bag 6: 7 | 98, 100, 170, 171, 172, 173, 175, 177, 183 | 1× `brick-1x2` | substitution | rounded profile dropped |
| `df4e8a` | Panel 1×4×3 (dark grey) | 11 | bag 1: 2, bag 2: 5, bag 3: 3, bag 6: 1 | 26, 27, 54, 55, 62, 84, 94, 173 | 3× `brick-1x4` | substitution | 1 = three 1×4 courses (solid wall instead of a thin panel) |
| `fde608` | Brick, round 1×1 (brown) | 11 | bag 2: 10, bag 3: 1 | 50, 57, 72, 78, 105 | 1× `round-brick-1x1` | new part |  |
| `b94187` | Brick 2×2 corner (dark grey) | 10 | bag 1: 5, bag 3: 4, bag 6: 1 | 14, 23, 34, 96, 177 | 1× `brick-1x2` + 1× `brick-1x1` | substitution | 1 = 1×2 + 1×1 laid as a corner |
| `8af650` | Brick 1×2 masonry profile | 10 | bag 1: 4, bag 2: 2, bag 3: 2, bag 6: 2 | 14, 23, 27, 54, 84, 174, 175 | 1× `brick-1x2` | substitution | masonry texture dropped |
| `f88919` | Brick 1×1×3 (light grey) | 10 | bag 1: 4, bag 2: 2, bag 3: 4 | 23, 35, 48, 49, 89, 94 | 3× `brick-1x1` | substitution | 1 = three 1×1 courses |
| `1cee9b` | Tile 1×8 (dark blue), hinged roof | 10 | bag 3: 10 | 91 | 0.5× `slope-2x2` + 0.25× `ridge-2x2` | substitution | the hinged tiled roof (p.91: brown plate 4×8, 10 tiles 1×8, 2 plates 1×4) becomes a 45° gable: 8 slope 2×2 + 4 ridge 2×2 + 2 brick 2×4 over the same 8×6 storey; apportioned 5+2.5 / 10 tiles |
| `4b199d` | Slope, inverted 45° 2×2 with cutout | 10 | bag 3: 6, bag 6: 4 | 96, 177, 184 | 1× `inv-slope-2x2` | substitution | cutout dropped |
| `f9e947` | Plate, round 1×1 (light grey) | 9 | bag 1: 5, bag 2: 2, bag 6: 2 | 13, 19, 32, 61, 186 | 1× `round-1x1` | exact reuse |  |
| `39ec0b` | Brick 1×2×2 (dark grey) | 9 | bag 1: 5, bag 2: 3, bag 6: 1 | 32, 34, 35, 46, 51, 183 | 2× `brick-1x2` | substitution | 1 = two 1×2 courses |
| `984555` | Brick 1×1 (yellow) | 9 | bag 2: 9 | 47, 48, 64, 75, 78 | 1× `brick-1x1` | new part |  |
| `bcdf64` | Brick 2×2 corner (light grey) | 9 | bag 2: 4, bag 3: 4, bag 6: 1 | 51, 73, 100, 184 | 1× `brick-1x2` + 1× `brick-1x1` | substitution | 1 = 1×2 + 1×1 laid as a corner |
| `feaeb8` | Arch 1×3 (light grey) | 9 | bag 3: 8, bag 6: 1 | 99, 170 | 1× `arch-1x4` | substitution | 1×3 arch lengthened to the 1×4 arch |
| `455275` | Brick 1×1 (brown) | 8 | bag 2: 8 | 47, 48, 57, 63 | 1× `brick-1x1` | new part |  |
| `04db7c` | Slope, inverted 45° 2×2 double convex | 8 | bag 3: 8 | 95 | 1× `inv-slope-2x2` | new part |  |
| `0b24dc` | Brick 2×2 (light grey) | 7 | bag 1: 3, bag 6: 4 | 11, 14, 17, 170, 173, 182 | 1× `brick-2x2` | exact reuse |  |
| `6a4758` | Plate 6×6 (tan) | 7 | bag 1: 2, bag 2: 2, bag 3: 2, bag 6: 1 | 29, 44, 70, 97, 184 | 1× `plate-6x6` | new part |  |
| `eea5d7` | Slope, inverted 45° 2×2 triple | 6 | bag 1: 3, bag 6: 3 | 23, 174, 182 | 1× `inv-slope-2x2` | substitution | corner form simplified |
| `933847` | Brick 1×3 (dark grey) | 6 | bag 1: 3, bag 6: 3 | 23, 24, 32, 174, 175 | 1× `brick-1x2` + 1× `brick-1x1` | substitution | 1 = 1×2 + 1×1 |
| `912451` | Plate 2×4 (tan) | 6 | bag 1: 4, bag 6: 2 | 29, 44, 45, 169, 173 | 1× `plate-2x4` | new part |  |
| `fc76e2` | Plate 1×2 (brown) | 6 | bag 2: 6 | 56, 79 | 1× `plate-1x2` | new part |  |
| `5deb89` | Plate 1×2 (yellow) | 6 | bag 2: 6 | 57, 58, 74 | 1× `plate-1x2` | new part |  |
| `15b713` | Brick 1×2 with two studs on side | 6 | bag 3: 6 | 101 | 1× `brick-1x2` | substitution | side studs dropped |
| `3caa41` | Slope, inverted 45° 2×2 double (dark grey) | 5 | bag 1: 3, bag 6: 2 | 24, 25, 39, 183, 184 | 1× `inv-slope-2x2` | new part |  |
| `872a83` | Brick 1×2 (yellow) | 5 | bag 2: 5 | 48, 56, 72 | 1× `brick-1x2` | exact reuse |  |
| `c09e89` | Arch 1×4 (light grey) | 5 | bag 2: 3, bag 3: 2 | 59, 90 | 1× `arch-1x4` | new part |  |
| `069b7c` | Brick 2×3 (light grey) | 4 | bag 1: 3, bag 6: 1 | 10, 13, 15, 169 | 1× `brick-2x2` + 1× `brick-1x2` | substitution | 1 = 2×2 + 1×2 |
| `0c0715` | Brick 1×2 with hinge (half) | 4 | bag 1: 4 | 10, 25, 33, 42 | 1× `brick-1x2` | substitution | angled hinge joint not supported; set square |
| `5012d2` | Brick 1×2 with hinge (pin half) | 4 | bag 1: 4 | 10, 25, 33, 42 | 1× `brick-1x2` | substitution | angled hinge joint not supported; set square |
| `08961e` | Arch 1×5×4 quarter arch (brown) | 4 | bag 1: 2, bag 2: 2 | 30, 50 | 0.5× `arch-1x8x2` | substitution | a facing pair = one 1×8×2 arch |
| `4e8cf5` | Plate 1×4 (brown) | 4 | bag 2: 4 | 57, 58, 73 | 2× `plate-1x2` | substitution | 1 = two 1×2 |
| `6a3fa5` | Brick 1×1×3 (brown) | 4 | bag 2: 4 | 64, 75, 78 | 3× `brick-1x1` | substitution | 1 = three 1×1 courses |
| `6e04f5` | Brick 1×1×1⅔ with studs on side | 4 | bag 3: 4 | 87 | 2× `brick-1x1` | substitution | 1 = two 1×1 courses (height rounded up); side studs dropped |
| `f32e9a` | Arch 1×3×2 curved half-arch (brown) | 4 | bag 3: 2, bag 6: 2 | 89, 177 | 0.5× `arch-1x4` | substitution | two half-arches = one 1×4 arch |
| `df7ded` | Brick 2×2 round corner (macaroni) | 4 | bag 6: 4 | 188 | 1× `brick-1x2` + 1× `brick-1x1` | substitution | 1 = 1×2 + 1×1 laid as a square corner |
| `edbe4d` | Plate, round 1×1 (brown) | 4 | bag 6: 4 | 177, 178 | 1× `round-1x1` | exact reuse |  |
| `f20b14` | Plate 6×6 (tan, wall-section base) | 3 | bag 1: 2, bag 6: 1 | 9, 16, 169 | 1× `plate-6x6` | new part | size read from the callout image; 6×8 not ruled out |
| `4bcdb0` | Plate 2×2 (tan) | 3 | bag 1: 3 | 10, 33 | 1× `plate-2x2` | exact reuse |  |
| `2001ca` | Brick 2×4 (light grey) | 3 | bag 1: 2, bag 6: 1 | 17, 19, 171 | 1× `brick-2x4` | exact reuse |  |
| `c6f450` | Plate 1×6 (brown) | 3 | bag 2: 3 | 52, 64 | 3× `plate-1x2` | substitution | 1 = three 1×2 |
| `a77f69` | Panel 1×2×3 (yellow) | 3 | bag 2: 3 | 56, 78 | 3× `brick-1x2` | substitution | 1 = three 1×2 courses |
| `abdaf8` | Window 1×2×3 (black) + lattice glass | 3 | bag 2: 3 | 57, 74 | 1× `window-1x2x2` | substitution | 1×2×3 frame shown as the 1×2×2 window |
| `1954ee` | Lattice glass 1×2×3 (counted with its frame) | 3 | bag 2: 3 | 57, 74 | — (merged) | substitution | merged into its window |
| `0a9dd3` | Brick 1×2 with pins | 2 | bag 1: 2 | 28, 43 | 1× `brick-1x2` | substitution | pins dropped |
| `c5b485` | Plate 1×2 (tan) | 2 | bag 1: 2 | 29, 44 | 1× `plate-1x2` | new part |  |
| `bbe61c` | Slope, inverted 45° 2×1 | 2 | bag 1: 2 | 33, 43 | 0.5× `inv-slope-2x2` | substitution | two 2×1 = one 2×2 |
| `8acd50` | Technic brick 1×4 (black) | 2 | bag 2: 2 | 59 | 1× `brick-1x4` | substitution | holes dropped |
| `60d88d` | Technic brick 1×6 | 2 | bag 2: 2 | 61, 67 | 1× `brick-1x4` + 1× `brick-1x2` | substitution | 1 = 1×4 + 1×2 |
| `c5b608` | Slope 45° 2×2 pyramid corner (dark blue) | 2 | bag 2: 2 | 61 | 1× `slope-2x2` | substitution | pyramid corner replaced by straight 45° slope |
| `520430` | Tile 2×2 (dark grey) | 2 | bag 2: 2 | 63 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `139c28` | Tile 1×4 (brown) | 2 | bag 2: 2 | 65 | 2× `plate-1x2` | substitution | 1 = two 1×2 plates |
| `47a48a` | Plate 1×2 (dark grey) | 2 | bag 3: 2 | 86 | 1× `plate-1x2` | new part |  |
| `201083` | Plate 1×4 with two studs | 2 | bag 3: 1, bag 6: 1 | 86, 169 | 2× `plate-1x2` | substitution | 1 = two 1×2 |
| `24fbe0` | Plate 1×4 (dark grey) | 2 | bag 3: 1, bag 6: 1 | 87, 185 | 2× `plate-1x2` | substitution | 1 = two 1×2 |
| `851c28` | Plate 1×4 (dark blue), hinged roof edge | 2 | bag 3: 2 | 91 | 1.5× `slope-2x2` + 0.75× `ridge-2x2` | substitution | part of the hinged-roof substitution above |
| `ecc73b` | Brick 1×8 (light grey) | 2 | bag 3: 2 | 98 | 2× `brick-1x4` | substitution | 1 = two 1×4 |
| `aae0f0` | Slope 75° 1×2×3 | 2 | bag 6: 2 | 170, 173 | 1× `slope-2x1` | substitution | steeper/taller slope replaced by 45° 2×1 |
| `474f03` | Brick 1×6 (dark grey) | 2 | bag 6: 2 | 175, 187 | 1× `brick-1x4` + 1× `brick-1x2` | substitution | 1 = 1×4 + 1×2 |
| `a28ef3` | Brick 1×2 log (brown) | 2 | bag 6: 2 | 172 | 1× `brick-1x2` | substitution | log profile dropped |
| `497f5c` | Plate 4×8 (tan) | 2 | bag 6: 2 | 178, 184 | 2× `plate-2x8` | substitution | 1 = two 2×8 |
| `933fe6` | Plate 2×8 (tan) | 2 | bag 6: 2 | 170, 178 | 1× `plate-2x8` | exact reuse |  |
| `6aa758` | Window 1×2×3 arched (dark grey) + lattice | 2 | bag 6: 2 | 176, 185 | 1× `window-1x2x2` | substitution | arched 1×2×3 frame shown as the 1×2×2 window |
| `5d503a` | Lattice glass (counted with its frame) | 2 | bag 6: 2 | 176, 185 | — (merged) | substitution | merged into its window |
| `8f73c9` | Brick 1×1 with studs on two sides | 2 | bag 6: 2 | 177 | 1× `brick-1x1` | substitution | side studs dropped |
| `a9ee80` | Arch 1×8×2 (light grey) | 1 | bag 2: 1 | 51 | 1× `arch-1x8x2` | new part |  |
| `6e31b5` | Technic brick 1×2 with hole | 1 | bag 2: 1 | 54 | 1× `brick-1x2` | substitution | axle hole dropped |
| `1e55d2` | Brick 1×2 with studs on side (black) | 1 | bag 2: 1 | 59 | 1× `brick-1x2` | substitution | side studs dropped |
| `8b1bc5` | Plate 2×2 (brown) | 1 | bag 2: 1 | 62 | 1× `plate-2x2` | exact reuse |  |
| `e60ce6` | Plate 6×6 (brown, upper-storey floor) | 1 | bag 2: 1 | 65 | 1× `plate-6x6` | new part |  |
| `50fae6` | Technic brick 1×2 with hole (tan) | 1 | bag 2: 1 | 72 | 1× `brick-1x2` | substitution | axle hole dropped |
| `07dabc` | Technic brick 1×2 with holes (yellow) | 1 | bag 2: 1 | 76 | 1× `brick-1x2` | substitution | axle hole dropped |
| `b203e4` | Plate 1×10 (dark grey) | 1 | bag 2: 1 | 80 | 5× `plate-1x2` | substitution | 1 = five 1×2 |
| `ebb294` | Plate 4×8 (tan) | 1 | bag 6: 1 | 172 | 2× `plate-2x8` | substitution | 1 = two 2×8 |
| `950cb8` | Bar gate 1×4×5 (cell door) | 1 | bag 6: 1 | 181 | 1× `door-1x4x6` | substitution | barred gate and its frame shown as the 1×4×6 door with frame |
| `6a837d` | Plate 4×8 (brown), hinged-roof base — unpaired 1x label, p.91 | 1 | bag 3: 1 | 91 | 2× `brick-2x4` | substitution | roof base becomes the two 2×4 bricks under the ridge |
| `5c612f` | Door frame 1×4×6 (black), cell door — unpaired 1x label, p.181 | 1 | bag 6: 1 | 181 | — (merged) | substitution | merged into the door-with-frame part (counted with the bar gate) |

## Allocation

**allocated quantity = ceil(required quantity × 1.30)**, the brief's
formula, computed in integer arithmetic (×130, /100) so that an exact
product such as 10 × 1.30 = 13 is not rounded up to 14 by floating-point
error. This is `allocate()` in `src/domain/castle.ts`, and
`spec/domain/castle.test.ts` checks every row below.

| Game part | Name | Catalogue | Required | Allocated | In the adapted reference |
| --- | --- | --- | --- | --- | --- |
| `brick-1x1` | Brick 1×1 | new part | 176 | ceil(176 × 1.30) = **229** | 100 |
| `brick-1x2` | Brick 1×2 | existing part | 151 | ceil(151 × 1.30) = **197** | 81 |
| `brick-1x4` | Brick 1×4 | new part | 60 | ceil(60 × 1.30) = **78** | 73 |
| `round-brick-1x1` | Round brick 1×1 | new part | 73 | ceil(73 × 1.30) = **95** | 48 |
| `brick-2x2` | Brick 2×2 | existing part | 11 | ceil(11 × 1.30) = **15** | 0 |
| `brick-2x4` | Brick 2×4 | existing part | 5 | ceil(5 × 1.30) = **7** | 2 |
| `plate-1x2` | Plate 1×2 | new part | 50 | ceil(50 × 1.30) = **65** | 22 |
| `plate-2x2` | Plate 2×2 | existing part | 6 | ceil(6 × 1.30) = **8** | 0 |
| `plate-2x4` | Plate 2×4 | new part | 6 | ceil(6 × 1.30) = **8** | 0 |
| `plate-2x8` | Plate 2×8 | existing part | 8 | ceil(8 × 1.30) = **11** | 3 |
| `plate-6x6` | Plate 6×6 | new part | 11 | ceil(11 × 1.30) = **15** | 6 |
| `round-1x1` | Round plate 1×1 | existing part | 13 | ceil(13 × 1.30) = **17** | 8 |
| `slope-2x1` | Slope 45° 2×1 | existing part | 26 | ceil(26 × 1.30) = **34** | 0 |
| `slope-2x2` | Slope 45° 2×2 | existing part | 10 | ceil(10 × 1.30) = **13** | 8 |
| `ridge-2x2` | Ridge slope 2×2 | existing part | 4 | ceil(4 × 1.30) = **6** | 4 |
| `inv-slope-2x2` | Inverted slope 45° 2×2 | new part | 30 | ceil(30 × 1.30) = **39** | 22 |
| `arch-1x4` | Arch 1×4 | new part | 16 | ceil(16 × 1.30) = **21** | 10 |
| `arch-1x8x2` | Arch 1×8×2 | new part | 3 | ceil(3 × 1.30) = **4** | 1 |
| `door-1x4x6` | Door with frame 1×4×6 | existing part | 1 | ceil(1 × 1.30) = **2** | 1 |
| `window-1x2x2` | Window 1×2×2 | existing part | 5 | ceil(5 × 1.30) = **7** | 4 |

20 part types: 11 existing parts, reused unchanged, and 9 new ones. The
room's whole kit is one shared, colour-agnostic count per type (ADR 0007),
the same for every new castle room. A new room starts **empty**: the
reference is a target and a test fixture, never pre-placed.

## The adapted reference

`src/domain/castle.ts` builds a castle in the game's own parts that keeps
the counted model's architecture, not its exact brick layout. It has 393
parts and fits inside the allocation with room to spare (last column
above):

- a gate in the front wall: a 1×8×2 arch on two pillars;
- two 6×6 square towers either side of the gate, each standing on its own
  6×6 plate, with round-brick corners, an arched doorway from the
  courtyard, a window to the front, arch-brick machicolations and a
  crenellated top under a 6×6 roof plate;
- curtain walls on three sides, four courses high, carrying a wall-walk of
  inverted slopes that widen into the courtyard, a timber walk and
  merlons on the outer row;
- a small paved courtyard (two 6×6 plates) inside the walls;
- a hall against the back wall, 8×6 and six courses high, with the door
  facing the courtyard, a window in each side and a 45° blue gable roof.

Footprint 24 × 18 studs (x 4–28, z 3–21), 33 plates high, in a
32 × 26 × 48 plot. That leaves four studs either side, five rows in front
of the gate (the open front edge) and 15 plates of headroom. The front two
rows stay empty in the reference (a test checks this).

### Adaptations and simplifications

- **Drawbridge**: omitted. The gate is a fixed, open arch; there are no
  hinges, chains or moving parts in the rules.
- **Hinged tiled roof** (bag 3, p. 91: a brown plate 4×8, ten tiles 1×8 and
  two plates 1×4): becomes a 45° gable over the same 8×6 storey (8 slopes
  2×2, 4 ridges 2×2, and 2 bricks 2×4 under the ridge). The ten tiles and
  the two edge plates are apportioned across the slopes and ridges.
- **Tall and composite bricks** (1×1×3, 1×2×2, panels 1×4×3, 1×6, 1×8,
  2×3, corner bricks): built from courses of the game's 1×1, 1×2 and 1×4
  bricks, as the note on each row says. A panel becomes a solid wall.
- **Profiles, side studs, pins, axle holes and hinges on bricks**: dropped.
  The brick keeps its footprint and height.
- **Arches**: the 1×3 arch is lengthened to the 1×4 arch. Two curved
  half-arches make one 1×4 arch, and two quarter-arches facing each other
  make one 1×8×2 arch.
- **Windows**: the 1×2×3 frames (one arched), with their lattice glass,
  become the existing 1×2×2 window.
- **The cell door** (barred gate, p. 181 frame): becomes the existing door
  with frame. The black frame is counted with it, not separately.
- **Slopes**: the 75° 1×2×3 slope becomes a 45° 2×1 slope, and the pyramid
  corner becomes a straight 2×2 slope.
- **Tiles**: shown as studded plates; the game has no tiles.
- **Plate 6×6 (wall-section base)**: read from the callout image as 6×6;
  6×8 was not ruled out (see uncertainty).

### Collision and support for the new shapes

- **Arches** (1×4 and 1×8×2) collide as their whole box, but rest only on
  their two end cells (`sockets` in the catalogue). A part standing in the
  opening never holds an arch up. Studs run along the whole top, so a part
  can stand over the opening.
- **The inverted slope 2×2** collides as its whole box, but rests only on
  its back row. The overhang widens out over empty space, and all four
  studs on top carry parts.
- Every other part rests on its whole footprint, exactly as before, so
  Beach Houses is unchanged.

The drawn geometry agrees with this: the arch's opening is cut out under
its lintel, with solid legs at the ends, and the inverted slope's underside
rises at 45° from its back row.

## Uncertainty

- **Identification is visual.** Each part image was identified by eye from
  a small callout picture. Similar parts (e.g. a 1×2 brick with or without
  a masonry profile, or an inverted slope's variants) could be confused.
  This would change a row's class or note, rarely its game part.
- **Plate 6×6 vs 6×8** (`f20b14`, the wall section's base): read as 6×6 from
  the callout image; 6×8 is possible. If 6×8, the requirement for
  `plate-6x6` would hold, but one 6×2 strip of plate would be missing.
- **The hinged roof** is apportioned (5 + 2.5 per 10 tiles, plus the edge
  plates), not counted one-to-one, since its shape changes.
- **Glyph decoding**: checked by hand on several pages, including step 58
  (p. 53) in full. A systematic mistake would show up as implausible
  totals, and none did.
- **Unpaired labels**: each was checked against its page. Two real
  callouts were found and added (pp. 91, 181). Any other single-part
  callout drawn the same unusual way would be missing from the count.
- **Selection of bags**: the counted assembly is bags 1, 2, 3 and 6, the
  modules that make the brief's adapted reference. Including the
  watchtower (bag 7), the hut (bag 4) or the timber house (bag 5) would
  raise every requirement. The author may decide otherwise; the counts per
  bag are in the table, so the requirement can be recomputed from it.

## Reproducing the count

The scripts that did the counting were throwaway tools, run outside the
repository (`/tmp/refscripts`), because they read the booklet itself.
With booklet 1 in hand, the table can be checked by hand: each row lists
the pages on which that part appears in a callout.
