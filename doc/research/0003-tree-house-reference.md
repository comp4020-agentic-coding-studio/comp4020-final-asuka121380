# Research 0003: the Tree House reference (LEGO Ideas 21318)

Collected by the agent on 7 November 2026 (AEDT) for Woodland Commons, the
tree-house scene (ADR 0016), following the author's brief to derive the
scene's inventory from the official building instructions, separating the
fixed environment, the player-buildable architecture and the omitted
accessories and mechanisms. Text and numbers only: no PDF, page render,
product photograph or LEGO branding is committed or served (CLAUDE.md,
Never). Every page reference is to the official booklet, so each count can
be checked against the source.

## Sources

| What | Where |
| --- | --- |
| Building instructions page | <https://www.lego.com/en-us/service/building-instructions/21318> |
| The one booklet, "Tree House (1/1)", 436 pages | <https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6294836.pdf> |
| Product image (to identify the set and the look; never counted) | <https://www.lego.com/cdn/product-assets/product.img.pri/21318_Prod.jpg> |

All three were downloaded on 7 November 2026 into a temporary folder outside
the repository (`/tmp/ref21318`) and read there. They, and every page render
and extracted part image made from them, stay out of the repository and out
of `public/`.

The booklet's pp. 429–433 are the **whole set's** parts list: 480 rows and
3,026 pieces, including the tree, the base, both foliage colours,
minifigures and accessories. It is used only to read element numbers and to
cross-check counts (below), never as the requirement. Neither is the set's
headline piece count.

## Booklet structure

Each bag's first page was found from the bag number printed on it.

| Bag | First page | What it builds | Group |
| --- | --- | --- | --- |
| 1 | 19 | the base frame | fixed environment |
| 2 | 47 | the base's ground | fixed environment |
| 3 | 60 | the trunk's core | fixed environment |
| 4 | 63 | roots and the lower trunk | fixed environment |
| 5 | 87 | the trunk and the branches | fixed environment |
| 6 | 113 | the upper trunk and branches | fixed environment |
| 7 | 149 | cabin A: floor and walls | **player-buildable** |
| 8 | 169 | cabin A continued | **player-buildable** |
| 9 | 191 | cabin B: door, mint floor | **player-buildable** |
| 10 | 207 | cabin B continued, the crane | **player-buildable** (crane omitted) |
| 11 | 232 | cabin C, with its balcony | **player-buildable** |
| 12 | 253 | cabin C continued, the bunk | **player-buildable** |
| 13 | 280 | the three blue octagonal roofs | **player-buildable** (substituted as a whole) |
| 14 | 318 | the trunk's crown | fixed environment |
| 15 | 331 | the stairs, the bridge walk, railings | **player-buildable** |
| 16 | 351 | ground details: table, swing, crates | omitted (accessories) |
| 17 | 366 | foliage | fixed environment |
| 18 | 385 | foliage | fixed environment |
| 19 | 403 | foliage | fixed environment |

## Counting method

1. Each page was split out of the booklet and read with PyMuPDF, which gives
   the position of every embedded part image and every text span.
2. A quantity label ("1x", "2x", …) was paired with the part image directly
   above it in the same callout box: the label's top within 3 pt above or
   4 pt below the image's bottom, and horizontally overlapping it. This found
   2,025 callouts totalling 2,872 pieces across the booklet.
3. Identical part images share one image object in the PDF, so a part
   image's hash identifies one part type and colour across pages. Per-step
   quantities were summed by hash, per bag.
4. The parts list (pp. 429–433) uses separate renderings, so its rows were
   matched to callout images by visual similarity (small thumbnails cropped
   to content, with an aspect-ratio penalty), which gives each callout image
   an element number. For 451 of the 457 matched rows, the booklet-wide
   callout total equals the parts list's quantity; the other six are spares
   or parts the list groups differently, none in a mapped row's requirement.
5. **Sub-assembly multipliers.** The 21 labels in bags 7–15 not paired with
   an image were checked one by one against their pages (149, 153, 179,
   189, 191, 204, 215, 226 ×2, 230, 239, 251, 252, 256, 278, 282, 294, 319,
   321, 348 ×2). Twenty are "build this N×" multipliers beside a
   sub-assembly (for example p. 179's window built twice, p. 230's railing
   built five times, p. 348's stair landing built twice). In this booklet
   each step's callout box already lists the pieces for every repetition
   (step 246's box shows the 2× of the plate it builds 2×; step 318's shows
   2× frames and 2× glass for a window built 2×), so no count was
   multiplied again. One was a real single-part callout with its image
   beside the label (p. 204: 3× round transparent tiles in a bucket); it
   was already counted as an accessory and is omitted.
6. Every distinct part image counted in bags 7–13 and 15 (258 images,
   1,354 pieces) was looked at on contact sheets and identified by eye, then
   classified: mapped to game parts, merged into the part it belongs to,
   part of the roof group, or omitted.

## The three groups

| Group | Bags | Distinct part images | Pieces | Treatment |
| --- | --- | --- | --- | --- |
| Fixed environment: base, ground, trunk, roots, branches, crown, foliage | 1–6, 14, 17–19 | 250 | 1,422 | the scene's fixed tree and its drawn surroundings; never in the kit |
| Ground accessories: table, swing, crates and so on | 16 | 57 | 96 | omitted |
| **Player-buildable architecture**: cabins, roofs, stairs, railings | 7–13, 15 | 258 | 1,354 | mapped below |

Fixed environment in detail: the base and ground (bags 1–2) are 294
pieces, the trunk, roots, branches and crown (3–6, 14) 742, and the foliage
(17–19) 386. The set's swappable autumn leaves are among the foliage. None
of these becomes a game part. Instead, the scene's fixed structure (ADR
0016) gives the tree a trunk, three roots, two branches and three
platforms, as solid boxes the rules treat as already built, and the client
draws the foliage around them.

Within the buildable bags:

| | Part images | Pieces |
| --- | --- | --- |
| mapped to game parts (the table below) | 141 | 946 |
| the roof group (bag 13), substituted as a whole | 31 | 238 |
| omitted: crane mechanism | 14 | 24 |
| omitted: small details (bars, branch pieces, brackets, cones, 1×1 slopes) | 16 | 38 |
| omitted: accessories (lanterns, jars, tools, printed tiles, books, binoculars) | 33 | 54 |
| omitted: furniture (beds, bunk, benches, table tops, tub, rug, cupboard) | 22 | 38 |
| omitted: landscape (rocks, stepping stones) | 4 | 10 |
| omitted: plants | 4 | 6 |

Some part images appear in both groups. A row's mapped pieces exclude its
bag-13 pieces, which belong to the roof group. "Glass for window" rows are
merged into their frames, as in research 0002.

### The roof group

Bag 13 builds three blue octagonal roofs on curved wedge plates, around a
turntable hub, with clips and ball joints holding the panels at their
pitch: 238 pieces in 31 part images (pp. 280–317). The rules have no
angled joints, wedges or curved slopes, so the roofs are **substituted as a
whole**, not piece by piece: each official roof becomes one 45° gable over
an 8 × 6 cabin, built from 4 plates 2×4, 4 plates 2×2, 3 bricks 2×4 and 12
slopes 2×2 (as in `cabin()` in `src/domain/treehouse.ts`). Three roofs give
12 plates 2×4, 12 plates 2×2, 9 bricks 2×4 and 36 slopes 2×2. Those are the
requirement's only contributions from bag 13.

## Mapping and counts

The game's catalogue has no sideways attachment, hinges, clips, curves or
tiles, and studs only on top. Each official part is therefore kept,
replaced by an equivalent the rules support, or omitted. Colour is not part
of the mapping: the kit is colour-agnostic, and every colour stays
available.

Classes, as in research 0002:
- **exact reuse**: an existing game part of the same shape and size.
- **new part**: added to the catalogue for this scene, same shape and size.
- **substitution**: different game parts standing in for it.
- **omitted**: counted in the groups above, not mapped.

A row's "Game part" says how many of which game part one official piece
becomes. The fence's 0.25 apportions four turned balusters and their rail
to one fence. The required quantity is the sum over every row plus the roof
group, rounded up to whole parts. The image key is the first six hex
characters of the image's hash in the booklet. It only matches rows to the
counting run; a reader with the booklet finds a part by its pages.
"Element" is the element number read from the parts list by the visual
match in step 4.

| Image key | Element | Official part (as identified) | Pieces | Per bag | Booklet pages | Game part | Class | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `a55609` | 6057986 | Brick 1×1 (medium nougat) | 56 | bag 7: 5, bag 8: 10, bag 9: 5, bag 10: 12, bag 11: 4, bag 12: 20 | 155, 157, 162, 170, 171, 176, 179, 180, 181, 197, 203, 205, 209, 210, 211, 212, 214, 215, 216, 237, 240, 241, 254, 255, 256, 257, 258, 261, 262, 263, 265, 269, 270 | 1× `brick-1x1` | exact reuse |  |
| `0109f2` | 6215606 | Plate 1×1 (medium nougat) | 55 | bag 7: 10, bag 8: 10, bag 9: 10, bag 10: 4, bag 11: 7, bag 12: 13, bag 15: 1 | 155, 157, 161, 162, 166, 172, 173, 174, 178, 179, 194, 196, 197, 198, 202, 203, 205, 207, 210, 211, 237, 240, 247, 254, 256, 258, 262, 263, 269, 270, 343, 356 | 1× `plate-1x1` | new part |  |
| `ae963c` | 6102782 | Hinge plate 1×4 swivel, two halves (dark grey) | 48 | bag 7: 8, bag 8: 8, bag 9: 8, bag 10: 8, bag 11: 8, bag 12: 8 | 155, 156, 157, 160, 161, 175, 181, 184, 194, 196, 197, 201, 202, 213, 216, 237, 240, 241, 260, 266, 272 | 2× `plate-1x2` | substitution | angled joint not supported; each 1×2 half becomes a plate 1×2 |
| `a2c25f` | 4651232 | Log brick 1×4 (medium nougat) | 33 | bag 7: 5, bag 8: 5, bag 9: 6, bag 10: 8, bag 11: 4, bag 12: 5 | 157, 159, 160, 161, 162, 170, 171, 175, 181, 194, 197, 202, 205, 208, 213, 216, 237, 238, 240, 241, 258, 259, 265 | 1× `brick-1x4` | substitution | log profile dropped |
| `85e4e7` | 4538950 | Telescope, used as turned porch balusters (reddish brown) | 30 | bag 8: 10, bag 10: 8, bag 11: 2, bag 12: 10 | 184, 186, 217, 219, 250, 252, 272, 274 | 0.25× `fence-1x4x1` | substitution | four balusters and their rail become one fence 1×4×1 |
| `f2ff5a` | 4225469 | Brick 1×1 with stud on one side (reddish brown) | 28 | bag 7: 9, bag 8: 4, bag 9: 3, bag 10: 1, bag 11: 4, bag 12: 6, bag 15: 1 | 153, 155, 157, 162, 165, 173, 174, 178, 179, 197, 203, 205, 211, 245, 247, 254, 256, 262, 263, 269, 270, 346 | 1× `brick-1x1` | substitution | side stud dropped |
| `8eb383` | 6066142 | Plate 1×1 with clip (reddish brown) | 27 | bag 7: 6, bag 8: 1, bag 11: 10, bag 15: 10 | 164, 166, 168, 188, 241, 244, 247, 249, 250, 338, 340, 341, 344, 348, 349 | 1× `plate-1x1` | substitution | clip dropped |
| `c38ec7` | 4211190 | Plate 1×4 (reddish brown) | 26 | bag 7: 3, bag 8: 1, bag 9: 3, bag 10: 7, bag 11: 2, bag 12: 3, bag 15: 7 | 63, 66, 68, 87, 94, 95, 101, 114, 119, 120, 126, 136, 149, 157, 186, 191, 203, 218, 220, 228, 229, 230, 233, 244, 273, 275, 276, 325, 326, 327, 329, 338, 340, 341, 343, 348, 349, 368, 369, 370, 373, 375, 380, 386, 388, 390, 393, 395, 397, 399, 401, 404, 405, 407, 408, 410, 411, 413, 414 | 1× `plate-1x4` | new part |  |
| `daf70a` | 6218360 | Plate 1×2 (medium nougat) | 25 | bag 7: 7, bag 8: 3, bag 9: 7, bag 11: 7, bag 12: 1 | 152, 155, 157, 162, 164, 166, 174, 189, 195, 197, 203, 205, 206, 237, 240, 241, 247, 264, 355, 356 | 1× `plate-1x2` | exact reuse |  |
| `4a1313` | 4645103 | Plate 1×2 with door rail (reddish brown) | 25 | bag 7: 2, bag 8: 5, bag 9: 3, bag 10: 8, bag 11: 2, bag 12: 5 | 156, 161, 173, 177, 179, 180, 196, 202, 206, 212, 214, 215, 237, 240, 254, 257, 261, 264, 269 | 1× `plate-1x2` | substitution | rail dropped |
| `1ae099` | 6058084 | Window frame 1×2×3 (reddish brown) | 18 | bag 8: 5, bag 10: 9, bag 12: 4 | 173, 177, 179, 180, 210, 212, 214, 215, 254, 257, 261, 269 | 1× `window-1x2x2` | substitution | 1×2×3 frame shown as the 1×2×2 window |
| `16ec18` | 6252258 | Glass for window 1×2×3 (counted with its frame) | 18 | bag 8: 5, bag 10: 9, bag 12: 4 | 173, 177, 179, 180, 210, 212, 214, 215, 254, 257, 261, 269 | — (merged) | substitution |  |
| `59d869` | 4211151 | Tile 1×4 (reddish brown) | 18 | bag 8: 5, bag 10: 5, bag 12: 8 | 184, 186, 217, 219, 220, 272, 273, 274, 275, 319, 321, 327, 373, 378, 383, 397, 401 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `bfea27` | 6167928 | Tile 1×4 (dark brown) | 17 | bag 7: 16, bag 12: 1 | 67, 70, 76, 78, 79, 81, 83, 85, 120, 138, 151, 152, 276, 327, 329, 378, 381, 399, 401 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `9d9bbd` | 4211183 | Round brick 1×1 (reddish brown) | 16 | bag 7: 2, bag 8: 3, bag 10: 4, bag 11: 4, bag 12: 3 | 88, 101, 103, 155, 171, 176, 179, 210, 212, 215, 216, 237, 239, 241, 256, 265, 270 | 1× `round-brick-1x1` | exact reuse |  |
| `2f7019` | 6102998 | Tile 1×4 (medium nougat) | 15 | bag 7: 2, bag 10: 5, bag 11: 1, bag 15: 7 | 153, 164, 228, 229, 230, 241, 338, 340, 343, 348, 356 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `27454d` | 4651231 | Log brick 1×2 (medium nougat) | 15 | bag 7: 2, bag 8: 4, bag 9: 1, bag 10: 2, bag 11: 2, bag 12: 4 | 155, 164, 171, 181, 197, 213, 216, 239, 240, 255, 258, 265 | 1× `brick-1x2` | substitution | log profile dropped |
| `0a2362` | 4566688 | Tile 1×2 (dark brown) | 14 | bag 7: 9, bag 8: 2, bag 10: 1, bag 11: 1, bag 12: 1 | 151, 152, 186, 187, 218, 252, 273 | 1× `plate-1x2` | substitution | tile shown as a studded plate |
| `c953a8` | 4504374 | Slope 30° 1×2×⅔ (dark blue), wall-top trim | 14 | bag 7: 2, bag 8: 4, bag 10: 4, bag 12: 4 | 153, 189, 226, 278 | 1× `slope-2x1` | substitution | shallow slope shown as 45° 2×1 |
| `70c6af` | 6215659 | Round plate 1×1 with petal edge (reddish brown) | 14 | bag 7: 1, bag 8: 5, bag 11: 3, bag 12: 1, bag 15: 4 | 167, 172, 176, 182, 188, 239, 247, 269, 333, 348, 349, 352, 358 | 1× `round-1x1` | substitution | edge detail dropped |
| `fbffe9` | 4616578 | Tile 1×2 (sand green), floor | 13 | bag 9: 13 | 193, 194 | 1× `plate-1x2` | substitution | tile shown as a studded plate |
| `d503f0` | 6030845 | Wedge plate 6×6 cut corner (tan), cabin floor | 12 | bag 7: 4, bag 9: 4, bag 11: 4 | 150, 192, 233 | 1× `plate-6x6` | substitution | cut corner squared |
| `d0a60f` | 6092590 | Plate 2×2 with one stud (reddish brown) | 12 | bag 7: 4, bag 9: 2, bag 11: 6 | 156, 157, 160, 162, 194, 197, 238, 241, 243, 251 | 1× `plate-2x2` | substitution | jumper shown as a full plate |
| `baea40` | 6186673 | Round plate 2×2 (reddish brown) | 12 | bag 7: 3, bag 9: 1, bag 10: 6, bag 11: 2 | 156, 165, 198, 208, 230, 247, 352 | 1× `plate-2x2` | substitution | round outline squared |
| `f5fd61` | 4550324 | Tile 1×4 (tan) | 11 | bag 11: 11 | 46, 235, 236 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `547327` | 4114026 | Tile 2×4 (tan) | 11 | bag 11: 9, bag 12: 2 | 91, 98, 105, 235, 236, 278 | 1× `plate-2x4` | substitution | tile shown as a studded plate |
| `2940d1` | 4666322 | Brick 1×1 with stud on one side (dark orange) | 10 | bag 8: 3, bag 9: 1, bag 10: 2, bag 11: 1, bag 12: 3 | 171, 175, 180, 199, 211, 214, 240, 255, 258, 270 | 1× `brick-1x1` | substitution | side stud dropped |
| `12533a` | 6284070 | Round tile 1×1 (black) | 10 | bag 9: 4, bag 11: 6 | 193, 235, 236 | 1× `round-1x1` | substitution | tile shown as a studded round plate |
| `442ac2` | 6192923 | Tile 1×4 (sand green), floor | 10 | bag 9: 10 | 193, 194 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `07a6d1` | 4550329 | Plate 2×6 (tan) | 9 | bag 7: 3, bag 9: 3, bag 11: 3 | 149, 150, 191, 192, 233 | 1× `plate-2x4` + 1× `plate-2x2` | substitution | 1 = 2×4 + 2×2 |
| `67af10` | 6022579 | Tile 2×2 with grooves (dark blue) | 1 | bag 11: 1 | 236 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `21220b` | 4113917 | Plate 1×2 (tan) | 8 | bag 7: 3, bag 9: 3, bag 11: 2 | 53, 100, 101, 106, 109, 150, 151, 192, 195, 234, 327 | 1× `plate-1x2` | exact reuse |  |
| `5f58b8` | 4221590 | Plate 1×6 (reddish brown) | 8 | bag 8: 4, bag 10: 2, bag 12: 2 | 90, 122, 124, 185, 187, 218, 220, 273, 275 | 1× `plate-1x4` + 1× `plate-1x2` | substitution | 1 = 1×4 + 1×2 |
| `d43ef5` | 6196221 | Plate 2×2 (reddish brown, second shade/element) | 8 | bag 7: 2, bag 11: 2, bag 15: 4 | 112, 165, 247, 344, 348, 349 | 1× `plate-2x2` | substitution | identified from the image only |
| `ceb4ef` | 4211189 | Plate 2×3 (reddish brown) | 8 | bag 7: 2, bag 8: 1, bag 9: 1, bag 10: 2, bag 11: 1, bag 12: 1 | 123, 132, 146, 159, 189, 206, 225, 244, 267, 386, 390, 395, 399 | 1× `plate-2x2` + 1× `plate-1x2` | substitution | 1 = 2×2 + 1×2 |
| `64b9be` | 6084573 | Wedge plate 4×4 with cutout (reddish brown), floor frame | 8 | bag 7: 3, bag 9: 2, bag 11: 3 | 150, 192, 234 | 1× `plate-2x4` | substitution | triangular frame shown as a 2×4 plate |
| `c98834` | 6100769 | Tile 1×4 (reddish brown, second element) | 8 | bag 7: 2, bag 8: 1, bag 10: 3, bag 12: 2 | 152, 159, 187, 218, 220, 273, 275, 371, 373, 376 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `9d4329` | 4216581 | Round plate 1×1 with petal edge (reddish brown, second element) | 7 | bag 9: 1, bag 10: 6 | 65, 68, 79, 83, 85, 88, 94, 196, 228, 229, 230, 370, 373, 378, 380, 383, 386, 388, 390, 393, 396, 397, 399, 401 | 1× `round-1x1` | substitution | edge detail dropped |
| `96165c` | 4211186 | Plate 2×4 (reddish brown) | 7 | bag 7: 1, bag 8: 1, bag 10: 1, bag 11: 2, bag 12: 1, bag 15: 1 | 88, 90, 95, 97, 102, 104, 116, 128, 138, 152, 188, 222, 233, 244, 258, 323, 325, 326, 327, 328, 329, 338, 370, 373, 375, 378, 380, 383, 388, 393, 397, 401 | 1× `plate-2x4` | exact reuse |  |
| `bcab1d` | 4211152 | Plate 1×3 (reddish brown) | 7 | bag 7: 2, bag 12: 1, bag 15: 4 | 117, 133, 145, 147, 154, 267, 324, 338, 340, 341, 344, 378, 383, 388, 390, 393, 395, 397 | 1× `plate-1x2` + 1× `plate-1x1` | substitution | 1 = 1×2 + 1×1 |
| `4d08d1` | 6248944 | Plate 1×2 with rounded ends (reddish brown) | 7 | bag 9: 1, bag 10: 6 | 132, 141, 199, 228, 229, 230, 358 | 1× `plate-1x2` | substitution | rounded ends squared |
| `716921` | 4528981 | Plate 1×2 (dark blue) | 2 | bag 7: 1, bag 11: 1 | 154, 236 | 1× `plate-1x2` | exact reuse |  |
| `02670e` | 6056383 | Plate 2×2 (medium nougat) | 7 | bag 7: 3, bag 9: 2, bag 11: 1, bag 15: 1 | 155, 157, 162, 195, 197, 241, 343 | 1× `plate-2x2` | exact reuse |  |
| `74804b` | 614126 | Round plate 1×1 (black) | 7 | bag 8: 2, bag 10: 1, bag 12: 3, bag 15: 1 | 182, 183, 221, 262, 271, 276, 350, 416, 420, 426 | 1× `round-1x1` | exact reuse |  |
| `b39fc4` | 6284586 | Round tile 2×2 (reddish brown) | 7 | bag 8: 2, bag 10: 2, bag 12: 3 | 185, 187, 208, 220, 273, 275 | 1× `plate-2x2` | substitution | round tile squared |
| `6128e3` | 6143431 | Tile 2×2 (dark orange) | 7 | bag 8: 1, bag 10: 2, bag 12: 4 | 187, 218, 220, 258, 273, 275, 276 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `3c0dc3` | 6092585 | Plate 1×2 with one stud (black) | 1 | bag 10: 1 | 209 | 1× `plate-1x2` | substitution | jumper shown as a full plate |
| `a8c143` | 6043639 | Plate 1×2 with clip (light grey) | 1 | bag 10: 1 | 228, 368, 369 | 1× `plate-1x2` | substitution | clip dropped |
| `fda7c4` | 371026 | Plate 1×4 (dark grey) | 6 | bag 7: 2, bag 9: 2, bag 11: 2 | 34, 40, 113, 118, 125, 135, 152, 193, 236 | 1× `plate-1x4` | new part |  |
| `7921ea` | 4211150 | Plate 1×2 (reddish brown) | 6 | bag 7: 1, bag 11: 3, bag 12: 2 | 44, 65, 66, 70, 104, 113, 118, 127, 130, 132, 135, 155, 234, 267, 370, 373, 375, 378, 380, 383, 386, 388, 390, 393, 395, 397, 399, 401 | 1× `plate-1x2` | exact reuse |  |
| `d9e914` | 4243838 | Plate 4×4 (reddish brown) | 6 | bag 7: 2, bag 9: 2, bag 11: 2 | 92, 100, 108, 150, 192, 234, 323 | 2× `plate-2x4` | substitution | 1 = two 2×4 |
| `0c694a` | 243126 | Tile 1×4 (black) | 6 | bag 7: 2, bag 9: 2, bag 11: 2 | 151, 193, 235 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `961f77` | 6167700 | Plate 1×4 (medium nougat) | 6 | bag 7: 2, bag 9: 2, bag 11: 2 | 160, 164, 196, 198, 237, 238 | 1× `plate-1x4` | new part |  |
| `dad164` | 4656783 | Brick 1×2 masonry profile (medium nougat) | 6 | bag 7: 1, bag 8: 1, bag 10: 1, bag 11: 1, bag 12: 2 | 164, 181, 213, 239, 255, 265 | 1× `brick-1x2` | substitution | masonry texture dropped |
| `66ef8b` | 6013867 | Turntable 2×2 (light grey) | 6 | bag 8: 2, bag 10: 2, bag 12: 2 | 189, 225, 277 | 1× `plate-2x2` | substitution | turning joint fixed |
| `b643fe` | 4502089 | Plate 1×4 (dark blue) | 6 | bag 8: 2, bag 10: 2, bag 12: 2 | 189, 226, 278 | 1× `plate-1x4` | new part |  |
| `dfc6af` | 4653988 | Plate 1×2 (medium azure) | 2 | bag 12: 2 | 49, 50, 267 | 1× `plate-1x2` | exact reuse |  |
| `6af4f9` | 4211194 | Tile 1×6 (reddish brown) | 5 | bag 8: 3, bag 10: 1, bag 11: 1 | 81, 124, 131, 133, 147, 185, 187, 218, 236 | 1× `plate-1x4` + 1× `plate-1x2` | substitution | tile shown as studded plates; 1 = 1×4 + 1×2 |
| `767285` | 6177146 | Tile 2×2 (medium nougat) | 5 | bag 8: 2, bag 15: 3 | 172, 343, 344, 356 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `8e65bf` | 6074890 | Round brick 1×1 (dark orange) | 5 | bag 8: 1, bag 9: 2, bag 11: 1, bag 12: 1 | 178, 195, 199, 240, 261 | 1× `round-brick-1x1` | exact reuse |  |
| `4757fb` | 4211288 | Tile 2×2 (reddish brown) | 5 | bag 8: 3, bag 9: 1, bag 12: 1 | 186, 187, 199, 275, 319 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `803cf8` | 6251470 | Plate 1×2 with one stud (reddish brown) | 5 | bag 9: 3, bag 10: 1, bag 11: 1 | 194, 195, 223, 244, 365 | 1× `plate-1x2` | substitution | jumper shown as a full plate |
| `1fafd4` | 4221744 | Plate 1×1 (reddish brown) | 4 | bag 7: 4 | 152, 153, 166 | 1× `plate-1x1` | new part |  |
| `bd7df5` | 6184432 | Plate 1×2 with one stud (sand green) | 4 | bag 7: 4 | 159, 165 | 1× `plate-1x2` | substitution | jumper shown as a full plate |
| `0860ee` | 6218366 | Plate 2×2 corner (reddish brown) | 4 | bag 7: 2, bag 11: 2 | 160, 238 | 1× `plate-1x2` + 1× `plate-1x1` | substitution | 1 = 1×2 + 1×1 laid as a corner |
| `cd915c` | 6177697 | Arch 1×4 (reddish brown) | 4 | bag 7: 2, bag 11: 2 | 166, 168, 247, 249 | 1× `arch-1x4` | exact reuse |  |
| `dc1b49` | 6022105 | Round brick 1×1 (dark brown) | 4 | bag 8: 1, bag 15: 3 | 181, 335, 336 | 1× `round-brick-1x1` | exact reuse |  |
| `1851b1` | 4211242 | Panel 1×1×1 corner (reddish brown) | 4 | bag 9: 4 | 206 | 1× `brick-1x1` | substitution | thin corner panel shown as a solid brick |
| `2d5b2d` | 303426 | Plate 2×10 (dark grey), floor spine | 3 | bag 7: 1, bag 9: 1, bag 11: 1 | 149, 191, 233 | 1× `plate-2x8` + 1× `plate-2x2` | substitution | 1 = 2×8 + 2×2 |
| `aba5e0` | 362326 | Plate 1×3 (dark grey) | 3 | bag 7: 1, bag 9: 2 | 150, 192 | 1× `plate-1x2` + 1× `plate-1x1` | substitution | 1 = 1×2 + 1×1 |
| `0bd71c` | 6037886 | Curved slope 1×4 (dark blue) | 3 | bag 7: 3 | 154 | 1× `slope-2x1` | substitution | curve replaced by a 45° slope |
| `2e1e8f` | 6071274 | Plate 1×1 with tooth (reddish brown) | 3 | bag 7: 1, bag 9: 1, bag 11: 1 | 159, 195, 250, 360 | 1× `plate-1x1` | substitution | tooth dropped |
| `1e209a` | 6192922 | Brick 1×3 (medium nougat) | 3 | bag 8: 2, bag 12: 1 | 171, 175, 270 | 1× `brick-1x2` + 1× `brick-1x1` | substitution | 1 = 1×2 + 1×1 |
| `487bf1` | 6103769 | Door 1×4×6 (reddish brown) | 3 | bag 8: 1, bag 9: 1, bag 12: 1 | 183, 201, 271 | 1× `door-1x4x6` | exact reuse | door and frame are one game part |
| `a67870` | 6259764 | Door frame 1×4×6 (dark brown, counted with its door) | 3 | bag 8: 1, bag 9: 1, bag 12: 1 | 183, 201, 271 | — (merged) | substitution |  |
| `e12d50` | 6092588 | Plate 1×2 with one stud (dark blue) | 3 | bag 11: 3 | 241, 247 | 1× `plate-1x2` | substitution | jumper shown as a full plate |
| `140d71` | 6280388 | Plate 1×4 with clip (reddish brown) | 3 | bag 11: 1, bag 12: 2 | 244, 267 | 1× `plate-1x4` | substitution | clip dropped |
| `e41ff3` | 6151654 | Tile 1×4 with wood grain (medium nougat), stair tread | 3 | bag 15: 3 | 341, 343, 349 | 1× `plate-1x4` | substitution | tile shown as a studded plate |
| `056465` | 6149677 | Tile 2×2 round corner (reddish brown), stair landing | 3 | bag 15: 3 | 344, 348 | 1× `plate-2x2` | substitution | round corner squared |
| `ebe4d7` | 4211149 | Brick 1×2 (reddish brown) | 2 | bag 9: 1, bag 15: 1 | 24, 38, 67, 68, 142, 206, 342 | 1× `brick-1x2` | exact reuse |  |
| `d1cdfb` | 306928 | Tile 2×4 (green) | 2 | bag 10: 2 | 39, 226 | 1× `plate-2x4` | substitution | tile shown as a studded plate |
| `a91b08` | 4211247 | Plate 2×6 (reddish brown) | 2 | bag 8: 1, bag 12: 1 | 69, 75, 77, 90, 91, 96, 97, 103, 104, 128, 130, 189, 277, 325, 326, 327, 328, 386, 390, 395, 399 | 1× `plate-2x4` + 1× `plate-2x2` | substitution | 1 = 2×4 + 2×2 |
| `a0d5bb` | 6004996 | Plate 1×10 (reddish brown) | 2 | bag 11: 2 | 79, 81, 83, 85, 137, 232 | 2× `plate-1x4` + 1× `plate-1x2` | substitution | 1 = two 1×4 + 1×2 |
| `0dd2ab` | 6272144 | Technic brick 1×2 with axle hole (dark brown) | 2 | bag 7: 1, bag 8: 1 | 103, 155, 171 | 1× `brick-1x2` | substitution | axle hole dropped |
| `c86bf0` | 6174856 | Brick 1×2 with wheel holders (reddish brown) | 2 | bag 7: 1, bag 9: 1 | 112, 132, 161, 206 | 1× `brick-1x2` | substitution | holders dropped |
| `06d938` | 6065139 | Plate 2×8 (reddish brown) | 2 | bag 7: 1, bag 9: 1 | 120, 149, 191 | 1× `plate-2x8` | exact reuse |  |
| `57cdcf` | 4211204 | Tile 1×6 (reddish brown) | 2 | bag 12: 2 | 141, 260 | 1× `plate-1x4` + 1× `plate-1x2` | substitution | tile shown as studded plates; 1 = 1×4 + 1×2 |
| `c81711` | 371001 | Plate 1×4 (white) | 2 | bag 7: 2 | 151 | 1× `plate-1x4` | new part |  |
| `c4bfa9` | 4507045 | Tile 2×2 (dark tan) | 2 | bag 7: 2 | 152 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `14cbb1` | 6210077 | Plate 1×4 with two studs (reddish brown) | 2 | bag 7: 2 | 152, 159 | 1× `plate-1x4` | substitution | jumper shown as a full plate |
| `ae2081` | 6212994 | Flower (bright light orange) | 2 | bag 7: 1, bag 15: 1 | 167, 350, 364 | 1× `flower` | substitution | flower head shown as the game's flower |
| `6dcfa8` | 6177892 | Tile 2×4 with wood grain (tan), sign | 2 | bag 8: 1, bag 12: 1 | 182, 271 | 1× `plate-2x4` | substitution | tile shown as a studded plate |
| `9e5f26` | 6008297 | Plate 1×2 with clip (reddish brown) | 2 | bag 8: 1, bag 15: 1 | 188, 337 | 1× `plate-1x2` | substitution | clip dropped |
| `a2170e` | 6192250 | Plate 2×2 with one stud (dark green), pot base | 2 | bag 9: 2 | 195, 206, 360 | 1× `plate-2x2` | substitution | jumper shown as a full plate |
| `499f7b` | 302326 | Plate 1×2 (black) | 2 | bag 11: 2 | 234 | 1× `plate-1x2` | exact reuse |  |
| `823ad7` | 4636170 | Round corner plate 4×4 (reddish brown), balcony | 2 | bag 11: 2 | 236 | 1× `plate-2x4` | substitution | quarter-round outline squared |
| `a9a6b9` | 6227891 | Fence 1×4×2 curved (reddish brown) | 2 | bag 11: 2 | 252 | 1× `fence-1x4x1` | substitution | curve straightened, one plate lower |
| `1d7a86` | 6176608 | Curved tile 1×4 (reddish brown), railing cap | 2 | bag 11: 2 | 252 | 1× `plate-1x4` | substitution | curve straightened |
| `0804fa` | 4519970 | Log brick 1×2 (dark brown) | 2 | bag 15: 2 | 335 | 1× `brick-1x2` | substitution | log profile dropped |
| `090f88` | 6021997 | Tile 2×2 (tan), stair landing | 2 | bag 15: 2 | 343, 344 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `6e18e4` | 4528604 | Plate 2×2 with pin hole (tan) | 1 | bag 15: 1 | 21, 43, 334 | 1× `plate-2x2` | substitution | hole dropped |
| `669b1a` | 6144149 | Plate 2×3 (medium azure) | 1 | bag 12: 1 | 49, 52, 267 | 1× `plate-2x2` + 1× `plate-1x2` | substitution | 1 = 2×2 + 1×2 |
| `0adc2d` | 6123809 | Technic brick 2×2 with holes (light grey) | 1 | bag 11: 1 | 60, 61, 100, 108, 109, 110, 241 | 1× `brick-2x2` | substitution | holes dropped |
| `78a71c` | 6167641 | Cone / round plate 1×1 (medium nougat) | 1 | bag 11: 1 | 60, 61, 100, 108, 109, 111, 248, 319 | 1× `round-1x1` | substitution | shape simplified |
| `4e261c` | 4211242 | Brick 1×1 (reddish brown) | 1 | bag 15: 1 | 64, 67, 69, 71, 344 | 1× `brick-1x1` | exact reuse |  |
| `2937aa` | 6069984 | Curved slope 1×2 (reddish brown) | 1 | bag 9: 1 | 65, 70, 79, 83, 131, 133, 140, 143, 147, 200 | 1× `slope-2x1` | substitution | curve replaced by a 45° slope |
| `aa4bb7` | 4211195 | Inverted slope 1×3 (reddish brown) | 1 | bag 10: 1 | 87, 95, 101, 102, 209 | 1× `slope-2x1` | substitution | shown as a 45° 2×1 slope |
| `e1a33e` | 6153594 | Brick 1×4 with studs on side (medium nougat) | 1 | bag 7: 1 | 88, 159 | 1× `brick-1x4` | substitution | side studs dropped |
| `3b503b` | 6261348 | Plate 2×2 with pin (black) | 1 | bag 9: 1 | 112, 200 | 1× `plate-2x2` | substitution | pin dropped |
| `6678c0` | 302226 | Plate 2×2 (black) | 1 | bag 7: 1 | 114, 119, 136, 154 | 1× `plate-2x2` | exact reuse |  |
| `f665c3` | 6228922 | Tile 2×2 with planks (reddish brown) | 1 | bag 7: 1 | 152 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `0ca6ec` | 4160483 | Plate 1×2 with rail (tan) | 1 | bag 7: 1 | 153 | 1× `plate-1x2` | substitution | rail dropped |
| `359cb3` | 6034929 | Window frame 1×2×3 (tan) | 1 | bag 7: 1 | 156 | 1× `window-1x2x2` | substitution | 1×2×3 frame shown as the 1×2×2 window |
| `0cdbe8` | 6122047 | Tile 1×2 (tan) | 1 | bag 7: 1 | 161 | 1× `plate-1x2` | substitution | tile shown as a studded plate |
| `894154` | 4539099 | Round brick 1×1 (dark red), pot | 1 | bag 7: 1 | 167 | 1× `round-brick-1x1` | exact reuse |  |
| `e48708` | 6133765 | Brick 1×1 with studs on two sides (reddish brown) | 1 | bag 8: 1 | 172 | 1× `brick-1x1` | substitution | side studs dropped |
| `833644` | 6212758 | Plate 1×2 with one stud (tan) | 1 | bag 8: 1 | 172 | 1× `plate-1x2` | substitution | jumper shown as a full plate |
| `1847f7` | 6170572 | Brick 1×1 with handle (medium nougat) | 1 | bag 8: 1 | 178 | 1× `brick-1x1` | substitution | handle dropped |
| `207353` | 4569385 | Brick 1×1 with clip (medium nougat) | 1 | bag 8: 1 | 180 | 1× `brick-1x1` | substitution | clip dropped |
| `e01e95` | 4211288 | Tile 2×2 (reddish brown, second element) | 1 | bag 8: 1 | 185 | 1× `plate-2x2` | substitution | tile shown as a studded plate |
| `873ca2` | 4614158 | Tile 1×2 (dark orange) | 1 | bag 8: 1 | 185 | 1× `plate-1x2` | substitution | tile shown as a studded plate |
| `8b4aa9` | 302228 | Plate 2×2 (green) | 1 | bag 9: 1 | 194 | 1× `plate-2x2` | exact reuse |  |
| `e53b04` | 4558954 | Brick 1×1 with stud on one side (dark grey) | 1 | bag 9: 1 | 195 | 1× `brick-1x1` | substitution | side stud dropped |
| `937a64` | 6138173 | Brick 1×2 with studs on side (dark grey) | 1 | bag 9: 1 | 195 | 1× `brick-1x2` | substitution | side studs dropped |
| `c219c5` | 4579354 | Plate 1×2 with clip (dark grey) | 1 | bag 9: 1 | 197 | 1× `plate-1x2` | substitution | clip dropped |
| `5287ba` | 6055171 | Tile 1×1 (dark green) | 1 | bag 9: 1 | 197 | 1× `plate-1x1` | substitution | tile shown as a studded plate |
| `5e7390` | 6253282 | Round brick 1×1 (dark green) | 1 | bag 9: 1 | 198 | 1× `round-brick-1x1` | exact reuse |  |
| `cef9e3` | 4211159 | Round plate 2×2 with axle hole (reddish brown) | 1 | bag 9: 1 | 199, 355 | 1× `plate-2x2` | substitution | round outline squared |
| `8fc1fc` | 6102360 | Round tile 2×2 with hole (reddish brown) | 1 | bag 9: 1 | 199 | 1× `plate-2x2` | substitution | round outline squared |
| `b2bb47` | 4579690 | Tile 1×2 (reddish brown) | 1 | bag 11: 1 | 236 | 1× `plate-1x2` | substitution | tile shown as a studded plate |
| `78f5e6` | 6093494 | Plate 2×4 (medium nougat) | 1 | bag 11: 1 | 239 | 1× `plate-2x4` | exact reuse |  |
| `ebc37e` | 6248949 | Brick 1×1 with stud on one side (dark orange) | 1 | bag 11: 1 | 249 | 1× `brick-1x1` | substitution | side stud dropped |
| `54f259` | 6167643 | Round plate 2×2 (medium nougat) | 1 | bag 11: 1 | 251 | 1× `plate-2x2` | substitution | round outline squared |
| `9a08ec` | 6182260 | Flower (red) | 1 | bag 11: 1 | 251 | 1× `flower` | substitution | flower head shown as the game's flower |
| `989c46` | 4595814 | Window frame 1×2×2 (reddish brown) | 1 | bag 12: 1 | 264 | 1× `window-1x2x2` | exact reuse |  |
| `5aac06` | 6185998 | Plate 1×2 with bar (reddish brown) | 1 | bag 12: 1 | 264 | 1× `plate-1x2` | substitution | bar dropped |
| `62016f` | 6254552 | Glass for window 1×2×2 (counted with its frame) | 1 | bag 12: 1 | 264 | — (merged) | substitution |  |
| `501c15` | 4211189 | Plate 2×3 (reddish brown, second element) | 1 | bag 12: 1 | 277 | 1× `plate-2x2` + 1× `plate-1x2` | substitution | 1 = 2×2 + 1×2 |
| `fa08ba` | 6037289 | Round plate 4×4 (reddish brown) | 1 | bag 12: 1 | 277 | 2× `plate-2x4` | substitution | round outline squared; 1 = two 2×4 |
| `e27af0` | 4277751 | Stairs 7×4×6 straight open (reddish brown) | 1 | bag 15: 1 | 343 | 4× `stairs-2x4` | substitution | one 4-wide flight rising 6 bricks = two 2-wide columns of two game flights (each rises 4 bricks; 8 bricks in all, since a flight cannot be cut) |
| `302747` | 6177535 | Plate 2×2 corner (medium nougat) | 1 | bag 15: 1 | 343 | 1× `plate-1x2` + 1× `plate-1x1` | substitution | 1 = 1×2 + 1×1 laid as a corner |


## Allocation

**allocated quantity = ceil(required quantity × 1.30)**, per part type, with
colours consolidated (the kit has no colour dimension). It is computed in
integer arithmetic (×130, /100), so an exact product such as 10 × 1.30 = 13
is not rounded up to 14 by floating-point error. This is `allocate()` in
`src/domain/treehouse.ts`, the castle's rule (ADR 0015).
`spec/domain/treehouse.test.ts` checks every row below.

| Game part | Name | Catalogue | Required | Allocated | In the adapted reference |
| --- | --- | --- | --- | --- | --- |
| `plate-1x2` | Plate 1×2 | existing | 265 | ceil(265 × 1.30) = **345** | 108 |
| `plate-1x4` | Plate 1×4 | new part | 160 | ceil(160 × 1.30) = **208** | 54 |
| `plate-2x2` | Plate 2×2 | existing | 124 | ceil(124 × 1.30) = **162** | 12 |
| `brick-1x1` | Brick 1×1 | existing | 107 | ceil(107 × 1.30) = **140** | 18 |
| `plate-1x1` | Plate 1×1 | new part | 105 | ceil(105 × 1.30) = **137** | 126 |
| `plate-2x4` | Plate 2×4 | existing | 70 | ceil(70 × 1.30) = **91** | 13 |
| `round-1x1` | Round plate 1×1 | existing | 39 | ceil(39 × 1.30) = **51** | 0 |
| `slope-2x2` | Slope 45° 2×2 | existing | 36 | ceil(36 × 1.30) = **47** | 36 |
| `brick-1x4` | Brick 1×4 | existing | 34 | ceil(34 × 1.30) = **45** | 24 |
| `brick-1x2` | Brick 1×2 | existing | 33 | ceil(33 × 1.30) = **43** | 25 |
| `round-brick-1x1` | Round brick 1×1 | existing | 27 | ceil(27 × 1.30) = **36** | 2 |
| `window-1x2x2` | Window 1×2×2 | existing | 20 | ceil(20 × 1.30) = **26** | 9 |
| `slope-2x1` | Slope 45° 2×1 | existing | 19 | ceil(19 × 1.30) = **25** | 0 |
| `plate-6x6` | Plate 6×6 | existing | 12 | ceil(12 × 1.30) = **16** | 1 |
| `fence-1x4x1` | Fence 1×4×1 | existing | 10 | ceil(10 × 1.30) = **13** | 3 |
| `brick-2x4` | Brick 2×4 | existing | 9 | ceil(9 × 1.30) = **12** | 9 |
| `plate-2x8` | Plate 2×8 | existing | 5 | ceil(5 × 1.30) = **7** | 0 |
| `arch-1x4` | Arch 1×4 | existing | 4 | ceil(4 × 1.30) = **6** | 0 |
| `stairs-2x4` | Stairs 2×4×4 | new part | 4 | ceil(4 × 1.30) = **6** | 4 |
| `door-1x4x6` | Door with frame 1×4×6 | existing | 3 | ceil(3 × 1.30) = **4** | 3 |
| `flower` | Flower | existing | 3 | ceil(3 × 1.30) = **4** | 3 |
| `brick-2x2` | Brick 2×2 | existing | 1 | ceil(1 × 1.30) = **2** | 0 |

**Totals:** 22 part types, 1,090 required, 1,426 allocated. 19 types are
existing parts, reused unchanged. Three are new: the plate 1×1, the plate
1×4 and the stairs 2×4×4. The room's whole kit is one shared count per
type (ADR 0007), the same for every new tree-house room. A new room starts
**empty**: the reference is a target and a test fixture, never pre-placed.

## Reconciliation: official, adapted, final

| | Pieces | Where it goes |
| --- | --- | --- |
| Booklet callouts, all bags | 2,872 | (parts list: 3,026, which includes spares and pre-built items) |
| Fixed environment (bags 1–6, 14, 17–19) | 1,422 | the fixed tree and drawn foliage; not in the kit |
| Ground accessories (bag 16) | 96 | omitted |
| Buildable architecture (bags 7–13, 15) | 1,354 | as below |
| — mapped piece by piece | 946 | → 1,090 − 69 = 1,021 game parts (splits such as 2×6 = 2×4 + 2×2 raise the count) |
| — the roof group | 238 | → 69 game parts (three gables) |
| — omitted (crane, details, accessories, furniture, landscape, plants) | 170 | none |
| **Required game parts** | | **1,090** |
| **Allocated kit** (× 1.30, per type, rounded up) | | **1,426** |
| The adapted reference uses | | 450 parts, every one within its type's allocation |

The adapted reference uses fewer parts than the requirement because its
cabins are square, with flat-plate floors on the fixed platforms, while the
official cabins are octagonal, on 6×6 wedge floors, with interiors. The
spare allocation is what players have for their own cabins, bridges and
platforms.

## The adapted reference

`src/domain/treehouse.ts` builds the tree house in the game's own parts. It
keeps the official model's arrangement (three cabins at three heights
round one trunk, connected by stairs), not its exact brick layout. It has
450 parts:

- **Three cabins, one per fixed platform:** left (platform top at 12
  plates), right (24) and on the crown deck (36). Each cabin:
  - is 8 × 6 studs, with the door in the middle of the front wall;
  - has walls 18 plates high, alternating a course of log bricks (nougat)
    with three layers of plates (nougat, bark, nougat), as the official
    walls alternate log bricks with stacked plates;
  - has a 1×2×2 window in the back wall and in each side;
  - has a dark wall-top band and a blue 45° gable roof (the roof group's
    substitution).
- **Stairs:**
  - one flight from the ground up to the left porch;
  - two flights, one on the other, from the ground up to the right porch;
  - a flight from the right porch up to the crown deck.
- **Railings:** porch railings on all three platforms.
- **A picnic spot** on the ground in front of the trunk, with flowers.

Footprint 30 × 24 studs, 63 plates high (the crown roof's ridge), in a
32 × 28 × 72 plot. The front four rows of the plot stay open.

### Adaptations and simplifications

- **Octagonal cabins** become square 8 × 6 cabins. The game's grid has no
  45° walls.
- **The curved octagonal roofs** become 45° gables (see the roof group).
- **Log bricks, masonry profiles, side studs, clips, handles, holes**:
  dropped. The part keeps its footprint and height.
- **Tiles** are shown as studded plates; the game has no tiles.
- **Long plates** (1×6, 1×10, 2×6, 2×10, 4×4) are split into the game's
  plates, as the note on each row says.
- **Round plates and tiles 2×2 and 4×4, and the quarter-round balcony**:
  squared.
- **Hinge plates** (the walls' 48 swivel hinges) become pairs of 1×2
  plates. The game has no angled joints.
- **The 6×6 cut-corner wedge plates** (cabin floors) become 6×6 plates.
- **The curved railing 1×4×2** becomes the straight fence 1×4×1. The 30
  turned balusters (telescope pieces) under the porches are apportioned to
  fences (four balusters and a rail = one fence).
- **The stairs element 4277751** (one straight flight, four studs wide,
  rising six bricks) has no game equivalent, so the stairs 2×4×4 is added.
  It is two studs wide, four deep, and rises four bricks. Two of them side
  by side make the official flight's width, and one on another reaches the
  right platform. So the official flight maps to four game flights.
- **Windows 1×2×3** become the existing window 1×2×2.
- **The doors 1×4×6 and their frames** are the existing door-with-frame
  part. The frame is merged into it.
- **Flowers** become the game's flower.

### The fixed structure is not from the kit

The trunk, roots, branches and platforms are a **fixed structure** in the
scene template (ADR 0016), not a pre-built assembly of kit parts. They cost
nothing and can't be selected, recoloured, turned or removed. They do not
appear in the requirement. The platforms stand in for what the official
model does with the trunk's top and its branch supports, so cabins have
somewhere to start at each height.

### Collision and support for the new part

- **The stairs 2×4×4** collide as their whole box (12 plates high), so
  nothing tucks under a flight. They rest on their bottom step's two
  cells, and carry studs only on their top step's two cells, so a second
  flight rests on the first's top step. A part beside the lower steps at
  the flight's top height has nothing to stand on.
- The drawn geometry agrees: four solid steps rising towards the back row,
  studs only on the top step.

## Uncertainty

- **Identification is visual.** Each part image was identified by eye from
  a small callout picture, helped by the element number from the parts
  list. Similar parts (a 1×2 plate with or without a rail, the two
  reddish-brown 2×2 plates, a jumper versus a plain plate) could be
  confused. That would change a row's class or note, rarely its game part.
- **Element numbers** come from a visual match between two renderings. The
  quantity cross-check agrees for 451 of 457 rows, but an element number
  on a single-piece row could be a near neighbour's.
- **The roof group** is substituted as a whole: 69 game parts for 238
  official pieces. A different gable design would change those five rows.
- **The balusters** (row `85e4e7`, 30 pieces) were read as turned
  balusters from their use under the porch steps. If they are another
  part, the fence requirement (10) would fall by up to 8.
- **Sub-assembly multipliers**: read from the pages' own callout boxes, as
  explained above. If a step's box listed one repetition's pieces only, its
  rows would be under-counted. Steps 246, 318 and 335 were checked against
  their drawings and match the reading used.
- **Bag boundaries**: bag 15 also holds a few pieces placed on the trunk
  and the ground. Those that are bars, plants or rocks are omitted; the
  rest are mapped with the stairs.

## Reproducing the count

The scripts that did the counting were throwaway tools, run outside the
repository (`/tmp/refscripts21318`), because they read the booklet itself.
With the booklet in hand, the table can be checked by hand: each row lists
the pages on which that part appears in a callout.
