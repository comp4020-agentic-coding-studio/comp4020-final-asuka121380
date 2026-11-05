# Evidence 0023: bolder artistic pass (lobby "two ways to begin", About's scene-led opening and narrative, shared empty-state scene, one heading beam)

Collected by the agent on 5 November 2026 (AEDT), for the pass described in
ADR 0014's "Bolder artistic pass" section, after the author judged the two
prior passes (`7b184da`, `ed0b206`) as still "a conventional interface with
small brick decorations". Against a production build, served from a
confirmed-clean local port (9301) with a fresh temporary `DATA_DIR`.
Nothing pushed or deployed.

## 1. Automated checks

- `pnpm typecheck` — clean.
- `pnpm build` — succeeds.
- `APP_URL=http://localhost:9301 pnpm test` — **228/228 passed**, including
  `spec/invariants.test.ts` 2/2. README.md's own text and heading order
  were not edited this pass, only `readme.ts`'s illustration wrappers, so
  the shipped invariant check is unaffected.

## 2. The lobby's "two ways to begin" (brief priority 1)

`src/client/ui/brickScenes.ts` built: `soloPlotScene()`, `sharedPlotScene()`
and the rest of the new scene library, each first prototyped with a
throwaway Node + Playwright script before being written into the committed
file. `parts.tsx`'s old `BuildAlone`/`CreateRoom` cards replaced by one
`StartChoices` component: two compact, equal tiles, each unfolding only
the controls its own path needs.

- `doc/evidence/shots/0023/new_lobby.png` — default lobby state at
  1920×1080: two equal tiles, no tall form visible, the room-discovery
  grid and "Load more" (from the prior pass) unchanged below it.
- `doc/evidence/shots/0023/solo_expanded.png` — after clicking the solo
  tile: a single "Build alone" button in a `.start-unfold` panel, the tile
  itself shown selected (yellow border).
- `doc/evidence/shots/0023/shared_expanded.png` — after clicking the
  shared tile: the full room-settings form (room name, public/invite-only,
  publish checkbox, "Create and open"), the tile shown selected (red
  border), keyboard focus visibly in the room-name field (its focus ring
  is drawn).
- `doc/evidence/shots/0023/kb_shared_expanded.png` — reached the same tile
  by repeated `Tab` and activated it with `Enter` (no mouse click);
  `document.activeElement` after `Enter` was logged as `INPUT.` with no
  class, confirming focus moved to the bare room-name input, not merely
  somewhere in the form.
- `doc/evidence/shots/0023/mobile_lobby.png` and
  `.../mobile_shared_expanded.png` — the same two states at 390×844: the
  tiles stack, and the unfolded form reflows to one column with no
  overlap or clipped controls.
- End-to-end functional check (not only visual): a Playwright script
  clicked the solo tile then "Build alone" and observed the browser
  navigate to `/build/room/<uuid>`; separately, it clicked the shared
  tile, read `document.activeElement` (confirmed the room-name `<input>`),
  then clicked "Create and open" and again observed navigation to a new
  `/build/room/<uuid>` — both the solo and the shared path still actually
  open/create a room, not only render a form.

## 3. About's opening and narrative (brief priorities 2–3)

`unfinishedCreationScene()` (three built sections around one deliberate
gap, with a translucent proposed piece approaching it) replaces the old
small loose-bricks flourish as the hero's art, now sized and placed as a
real sibling column beside the title/lede rather than a small addition
below them.

- `doc/evidence/shots/0023/about_top.png` — the new hero at 1920×1080:
  title, lede and the hero scene read together as one opening, at a scale
  that carries the page.
- `doc/evidence/shots/0023/about_chapter1.png` /
  `about_chapter2.png` — the "Build somewhere, not in a void" and "Join,
  build, and keep a creation" chapters, each now illustrated with
  `neighbourhoodScene()` / `displayedCreationScene()` respectively, each
  sized proportionately beside its own prose (see the bug/fix note below —
  these screenshots are the *post-fix* state).
- `doc/evidence/shots/0023/about_mobile_top.png` — the hero at 390×844:
  stacks to text-above-scene, still a comfortable scale.
- `doc/evidence/shots/0023/about_reduced.png` — the same hero and first
  chapter rendered with `reducedMotion: "reduce"` set in the browser
  context: all art is immediately at its resting (fully visible,
  untransformed) state, confirming the pass's new animations collapse
  correctly rather than only shortening.
- The closing scene's exact wording ("Made with love by Asuka121380") and
  its "Back to the table" link are unchanged (visible at the foot of
  `about_chapter2.png`).

**Bug found and fixed during this review:** the first render of the
"keepsake" chapter showed its new, larger illustration occupying the wide
prose column, with the actual paragraph text squeezed into the narrow
side column — the opposite of the intended layout. Root cause: the
non-`alt` `.chapter-support` variant's grid places its wide track first,
but the chapter's art is emitted before `.chapter-copy` in the markup (for
a sensible no-CSS/screen-reader reading order); with the old, small flat
icons this mismatch was not visually obvious, but a real, larger scene
made it immediately visible. Fixed with an explicit `order: 2` on the
non-`.chapter-copy` first child of a non-`alt` `.chapter-support` section;
reproduced the broken state by reading the CSS by hand, then confirmed
the fix in a fresh Playwright screenshot (`about_chapter1.png` above,
captured after the fix).

## 4. Smaller thematic treatments (brief priority 4, applied narrowly)

- `doc/evidence/shots/0023/empty_collection.png` — the collection's empty
  state at `/build/?view=collection` with no saved creations: an empty
  baseplate with one translucent ghost stud (`emptyPlotScene()`),
  replacing the earlier flat line-and-dot placeholder.
- `doc/evidence/shots/0023/empty_showcase.png` — the showcase populated
  with three published creations: unchanged from before this pass, since
  its thumbnails already used the shared `isoSvg`/`creationSvg` renderer.
- `doc/evidence/shots/0023/beam_lobby.png` — the lobby's "Find a room"
  heading, now with a small `headingBeamScene()` brick beside it.

## 5. Scope not touched

No gameplay scenery, model, lighting, control, construction rule, or
camera file was opened or edited this pass (confirmed by `git status`,
listed in the commit this evidence accompanies). The tabletop's own
`ScenesPanel` (`home/tabletop/panels.tsx`) was checked by reading its
imports and confirmed to use only the lower-level `useSoloRoom`/
`useCreateRoom`/`RoomSettings` exports from `parts.tsx`, never the removed
`BuildAlone`/`CreateRoom` components, so it is unaffected by the lobby
redesign.

## 6. Limitations

- All checks were Chrome/Playwright automation against a local dev
  server; nothing was checked on a physical device or in Safari.
- `clipScene()` (a brick-clip shape for invitation cards) was built into
  `brickScenes.ts` but not wired into the Friends/Invites panel in this
  pass; left for a follow-up.
- `node scripts/tabletop.ts` full regression was run against the same
  local server; its result is recorded in the DEVELOPMENT_LOG entry for
  this pass's commit once the run completed, since it was still in
  progress when this document was first written.
