# Evidence 0024: the Medieval Castle, a second playable scene

Collected by the agent on 5–6 November 2026 (AEDT), for ADR 0015 and the
research record `doc/research/0002-medieval-castle-reference.md`. Against a
production build (`pnpm build`), served by `node src/server/index.ts` on a
confirmed-clean local port (9310) with a fresh temporary `DATA_DIR`
(`/tmp/castle-data`), restarted fresh before each browser batch so the
account sign-up rate limit from one run never leaks into the next. Nothing
pushed or deployed.

## 1. Reference research

- The official instructions page for 31120 lists two booklets. Booklet
  `6372694` (224 pages) builds the castle; `6372697` holds the alternative
  builds and was not counted. The PDF was read locally; it is not in the
  repository, in `public/`, or in any commit, and no page image was kept.
- Counted: the primary castle's bags 1, 2, 3 and 6 (pp. 6–189, page ranges
  in the research record). Excluded: bags 4, 5 and 7 (a ruin/hut, a timber
  house with a water wheel, and the watchtower, all separate buildings),
  the joining page (208), the dragon (pp. 209–216), and the groups the
  record lists as omitted. The set's total piece count was never used.
- Result: 544 pieces in 83 distinct part images, each mapped to one of
  20 game parts or recorded as omitted, with the page each first appears
  on, its conversion and its uncertainty (research record, "Mapping and
  counts").

## 2. Automated checks

- `pnpm typecheck` — clean.
- `pnpm build` — succeeds.
- `APP_URL=http://localhost:9310 pnpm check` — **261/261 passed**, 29 files,
  including the three new files:
  - `spec/domain/castle.test.ts`
    - the formula on every part type, with `allocate(10) = 13`, not 14;
    - the kit equals the research record's table;
    - the reference places part by part through the rules, within the
      kit and the bounds;
    - the two front rows stay empty;
    - Beach Houses' id, version, kit and capacity are unchanged;
    - arches and inverted slopes are held only at their sockets, with the
      whole box still colliding;
    - the new parts recolour, rotate and remove with stock conserved;
    - every part with no sockets still rests on its whole footprint.
  - `spec/castle-scene.test.ts` (HTTP, against the running server)
    - a castle room is created with the castle's kit and 4 places, and
      starts empty; no scene still means Beach Houses;
    - an unknown scene is a 400 that creates nothing;
    - each visitor gets one solo plot per scene;
    - a castle part is refused in a Beach Houses room;
    - reload, snapshot, its read-back and continue all keep the castle;
    - the lobby and the pre-join preview show 4;
    - 4 visitors join and a 5th is refused; they share one kit
      (229 − 4 bricks);
    - Beach Houses still refuses a 3rd.
  - `spec/server/scene-migration.test.ts`
    - a database left at `user_version` 4 upgrades to 5 with its solo
      room's scene, version, parts and stock rows unchanged, still that
      visitor's Beach Houses plot;
    - a castle solo plot can then be added beside the existing one.
- `pnpm check:evidence` — passes.

## 3. Browser checks (real Chrome via Playwright, against port 9310)

| Script | Result | Notes |
| --- | --- | --- |
| `scripts/castle.ts` (new) | **34/34** | see below |
| `scripts/tabletop.ts` | **174/174** | scene tray now lists both scenes, Beach Houses first |
| `scripts/multiplayer.ts` | **17/17** | needed a tile click, stale since `731c920` |
| `scripts/interaction.ts` | **85/85** | same tile click |
| `scripts/log-rehearsal.ts` | **13/13** | same tile click, plus the radio renamed in `731c920` |

`scripts/castle.ts`, through the site's own controls:
- the lobby offers both scenes with their real facts (1–2 vs 1–4
  builders, 16×8 vs 32×26 studs), Beach Houses chosen by default;
- choosing the castle and "Create and open: Medieval Castle" opens an
  empty castle room with its 20 part types and stone as the starting
  colour;
- three more independent visitors (separate browser contexts and cookies)
  join from the public lobby (row reads "1/4 here"), and a fifth sees
  "4/4 … already full";
- the four build with the new parts: two 1×1 legs, an arch 1×4 on them, a
  round brick on top of the arch over its opening, and an inverted slope
  on a wall. Each placement reaches all four live, and the shared kit
  drops by exactly the parts used;
- removing the arch under the round brick is refused; removing one leg is
  allowed; removing the remaining leg is then refused;
- reload, a saved snapshot's page, and continuing it all keep the castle;
- "Build alone" opens a castle solo plot, and Beach Houses still opens its
  own, different plot with its own title, target and 14 part types;
- no console errors in any page.

## 4. Log lines (ADR 0013)

Read from the server's stdout after the rehearsal and a short scripted
create and continue:

```
{"event":"room.create","outcome":"changed",…,"visibility":"public","scene":"castle-01",…}
{"event":"room.create","outcome":"rejected","reason":"unknown_scene",…}
{"event":"snapshot.continue","outcome":"changed",…,"visibility":"invite_only","scene":"castle-01",…}
{"event":"room.create","outcome":"changed",…,"visibility":"invite_only","scene":"street-01",…}
```

The rejected line carries the reason only, never the unknown value sent.

## 5. Screenshots (`doc/evidence/shots/0024/`)

Desktop is 1920×1080 or 1600×1000 (downscaled to 1600 wide for the
repository); mobile is a 390×844 Chrome emulation at device scale 2
(downscaled).

- **The empty site:** `empty-default-desktop`, `empty-approach-desktop`,
  `empty-side-desktop`, `empty-top-desktop`, `empty-default-mobile`,
  `empty-approach-mobile`, `empty-side-mobile`. In front there is only the
  road, kerbs and open grass; ruins, rocks and trees sit behind and beside.
- **The reference, an adapted castle:** `reference-default-desktop`,
  `reference-approach-desktop`, `reference-side-desktop`,
  `reference-top-desktop`, `reference-default-mobile`,
  `reference-approach-mobile`. Opened with `&reference`, which shows it in
  `?local` preview only; no room starts with it.
- **Background:** the hills, sparse woodland and the mountain saddle
  behind the courtyard are visible in the default and approach views.
- **Integration:**
  - `lobby-scenes-desktop`, `lobby-mobile`: the lobby's scene choice;
  - `home-scene-tray-desktop`, `home-scene-tray-mobile`: the homepage's
    scene panel;
  - `fifth-refused-desktop`: a fifth visitor's pre-join screen;
  - `construction-desktop`, `construction-top-desktop`: the four
    visitors' build;
  - `snapshot-view-desktop`: the saved version's page;
  - `beach-unchanged-desktop`: Beach Houses' editor after all of it.
- **Header:** `mobile-header-360-390`: both scene titles at 360 and 390px
  wide. "Beach Houses" already ran under the save chip at those widths
  before this work; the title now wraps to two lines, so neither scene's
  overlaps (measured by bounding box at 360, 390 and 430px).

## 6. The cover

`src/client/public/scenes/medieval-castle.webp` (1200×750) is a screenshot
of this scene, the adapted reference in `?local` preview, with the UI
hidden. It is not a LEGO image, photograph or render, and carries no
branding.

## 7. Limitations

- All browser checks were Chrome via Playwright on macOS; nothing was
  checked in Safari, Firefox or on a physical phone. Mobile is device
  emulation only.
- The four-player check uses four browser contexts in one process, not
  four people on four machines.
- WebGL ran on SwiftShader in headless runs; frame rate on a weak phone
  with the castle's larger plot and 120 trees was not measured.
- Some older scripts that click "Create and open" on `/build/` still have
  the pre-existing `731c920` problem and were not changed in this pass
  (ADR 0015, Consequences).
