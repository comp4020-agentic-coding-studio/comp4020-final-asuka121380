# Evidence 0018: brighter red/blue/white colour system for the non-gameplay site

Collected by the agent on 4 November 2026 (AEDT), implementing the
author's brief for a brighter red/blue/white colour identity across the
homepage table, the lobby/account/collection pages and the shared UI kit,
scoped so the gameplay editor is unaffected (ADR 0014, "Colour system"
section, added alongside this evidence). Against the **production
build**, served on port 8095 with a fresh temporary `DATA_DIR`. Nothing
pushed or deployed.

## Scope delivered in this pass

- A new, non-gameplay-scoped token override (`src/client/ui/site-colors.css`),
  redeclaring the same custom properties `theme.css` defines
  (`--red`, `--blue`, `--yellow`, `--ink`, `--paper`, `--white`, `--line`,
  …) but only under `body.home, body.lobby` — the two bundles that are
  never the game editor's. `--ok`/`--danger` (success/error semantics) are
  deliberately **not** overridden, so green confirmation and red error
  meaning stay distinct from the brand red.
- `src/client/home/main.tsx` and `src/client/lobby/main.tsx` import the new
  file (between `theme.css` and `kit.css`), and `src/client/build/index.html`
  gained `<body class="lobby">` (it previously had no class) so the lobby
  bundle has a scoping hook. The editor's own HTML shell
  (`src/client/build/room/index.html`) is untouched and keeps a bare
  `<body>`.
- `src/client/ui/kit.css`'s local `.kit` tokens (shared panel/form look,
  imported only by the home and lobby bundles — never the editor) were
  changed from cream/brown to white/pale-blue/dark-blue, and its remaining
  hardcoded warm hex literals were replaced with those tokens.
- `src/client/home/home.css`'s home-only local tokens (`--wall`,
  `--wall-deep`, `--table-ink`, `--nameplate`) moved from a cream/brown
  "paper" feel to pale cool-grey/white with dark-blue ink, and its warm
  hardcoded literals (sign-face text colour, the panel's brick-seam frame,
  the caution card, the fallback card, the shelf-item backdrop) were
  replaced with the new tokens.
- `src/client/lobby/lobby.css`'s warm literals (the page's top wash, the
  sticky bar's border/background, the nav's hover/selected treatment, the
  saved-version viewer's frame) were replaced: nav hover/selected now reads
  as blue (navigation/structure/selection, per the brief), matching
  Section 7's intent without a conventional navbar look.
- `src/client/home/tabletop/build.ts`'s `PALETTE` (the 3D scene's own
  material constants, separate from CSS entirely): `wall`/`wallDeep`
  cooled from beige to pale cool-grey/off-white; `floor` (table wood)
  desaturated slightly away from orange; `woodEdge`/`woodLeg`/`woodTray`/
  `woodTrayRim` kept as pale natural wood but with the orange/yellow tint
  reduced (not shifted to blue/white plastic, per the brief); `cream`
  (used for sign/noticeboard/booklet/shelf face plates) and `white` moved
  from a warm off-white to a near-white, cool tone. The pale-blue house
  roof-slice decoration, the decorative "Beach Houses" miniature's own
  palette, and all gameplay/editor assets are untouched — this constant is
  in `src/client/home/tabletop/`, never imported by the editor.
- `scripts/tabletop.ts`'s one assertion that hardcoded the lobby's old
  paper background colour (`rgb(255, 250, 241)`) was updated to the new,
  intended value (`rgb(242, 245, 248)`) — the test was asserting the exact
  **old** colour this pass deliberately replaced, not a regression.

## Not touched in this pass (explicit)

- `src/server/readme.ts` (`/readme/`): CLAUDE.md lists `/readme/` as never
  to be changed. Its cream/booklet styling (mentioned in the author's
  brief, Section 7) was left exactly as it was; this is a deliberate
  exception to the brief, made to respect the stronger, pre-existing
  repository rule.
- The branded loading screen (replacing the brief links-only loading
  state) and gameplay scenery/materials in `src/client/scene/` — not part
  of this pass; see "Known limitations" below.
- `--ok`/`--danger` semantic tokens, the decorative "Beach Houses"
  miniature's own house palette, and every gameplay-editor file: none
  were read as part of this pass beyond confirming they do not import the
  changed files.

## Verifying the gameplay editor is unaffected

The brief's strongest constraint (ADR 0014, Section 9) is that the editor
must not change. This was checked by tracing every changed file's
importers, then confirming live in the browser:

- `grep` for `site-colors.css`, `kit.css` imports across every `main.tsx`
  shows only `src/client/home/main.tsx` and `src/client/lobby/main.tsx`
  import either file. The editor's entry (`src/client/main.tsx`) imports
  only `theme.css` and `styles.css` — neither changed.
- `src/client/home/tabletop/build.ts`'s `PALETTE` is imported only from
  `src/client/home/tabletop/*.ts`; `grep` confirms no file under
  `src/client/scene/` or `src/client/scenes/` references it.
- Live check (`editorcheck2.ts`, Chrome/swiftshader): opened a real room
  via "Build alone" into the actual editor route
  (`/build/room/:id`), and read `getComputedStyle(document.body)`:
  `document.body.className` is `""` (no `home`/`lobby` class — the
  override never matches), and `--red` resolves to `#e3241b`, the
  original, **unchanged** value from `:root` in `theme.css` — not the new
  `#d92328`. A screenshot of the same session
  (`doc/evidence/shots/colour-system/editor-unchanged-desktop.png`) shows
  the dock, toolbar and scenery exactly as before: cream dock panel,
  original muted palette, pastel houses.
- The scripted suite's `[other pages unchanged]` checks (below) also ran
  against this build and passed.

## Screenshots

In `doc/evidence/shots/colour-system/`:
- `overview-desktop.png` / `overview-mobile.png`: the table overview,
  white/pale-grey walls, pale wood table, white-faced signs/board/booklet
  with red/blue/yellow accents, white storage boxes with red/yellow/blue
  lids.
- `sign-in-panel-desktop.png`: the focused Sign-in panel — white panel
  body, red brick-seam frame, red primary button ("Create an account"),
  white secondary button with a blue border ("Sign in"), dark-blue
  heading and body text.
- `lobby-rooms-desktop.png`: `/build/`'s room lobby — pale cool-grey page
  background, white cards, blue selected nav tab, red primary action
  ("Create and open"), a restrained yellow "Build on your own" card.
- `collection-desktop.png`: `/build/?view=collection`'s empty state —
  white page body, blue nav, consistent with the lobby.
- `fallback-no-webgl-desktop.png`: the existing WebGL-unavailable fallback
  (`Fallback` component, `HomeApp.tsx`), now in the new identity — white
  card, red frame, red primary action, full link list to every core
  function, "You never need an account to build."
- `editor-unchanged-desktop.png`: the real gameplay editor (`/build/room/:id`),
  confirming no visual change.

## Tests run (production build, local server on port 8095, fresh temporary `DATA_DIR`)

- `pnpm typecheck`: passed, at every intermediate state.
- `pnpm build`: built.
- `scripts/tabletop.ts` (full suite, including the `activation` run added
  in evidence 0017): **173/173 passed**, after correcting the one
  assertion described above that still expected the pre-change colour.
- `pnpm test` (`vitest`): 7 failing tests exist in
  `spec/plans-and-attribution.test.ts` and `spec/session-revocation.test.ts`
  — confirmed **pre-existing** by `git stash`-ing every uncommitted file
  from this pass and re-running: the stashed (pre-colour-change) baseline
  fails **13** tests, a strict superset, so none of the colour/CSS changes
  in this pass caused or worsened a test-suite failure. These are
  server-side domain tests unrelated to any file touched in this pass
  (no CSS, HTML, or `build.ts` file is imported by domain or server code).
- `pnpm check:evidence`: passed.
- `git diff --check`: clean.

## Observed

- The 3D scene's walls, table and sign/board/booklet face plates read
  distinctly cooler and whiter after the `PALETTE` change, confirmed by
  comparing `/tmp/color2_overview.png` (before the `build.ts` edit) against
  the final `overview-desktop.png` (after): the back wall and side wall
  visibly lose their beige cast, and the sign/noticeboard/booklet face
  plates go from cream to near-white.
- The sign-in panel's background, previously cream (`--nameplate:
  #fffdf7` in `home.css`, a local token `site-colors.css` does not touch),
  is now white (`#fdfefe`) after editing `home.css`'s own local tokens
  directly — this was caught by screenshot comparison mid-pass (the
  panel's border/button colours changed immediately from the shared-token
  override, but its background did not, until `home.css`'s own tokens
  were also updated).
- The scripted check for "the red link button keeps white text (link
  colour doesn't leak)" (part of the existing `entrances` run) continued
  to pass against the new palette, confirming the brief's link-identifiability
  and no-colour-only-meaning constraints were not accidentally broken by
  the broader token change.

## Known limitations

- The branded loading screen (replacing the current brief loading-links
  screen) is **not implemented in this pass**. The current loading state
  (a link list while the 3D bundle loads) is unchanged in behaviour;
  whatever colours it inherits from the shared tokens already changed
  (`home.css`'s `.loading-links` background, `--table-ink`), but no new
  emblem, branded status line, or slow-loading/failure-state redesign was
  built. This remains open work.
- Section 5's sign/board/shelf/tray colour requirements (red or blue
  brick-built frames on signs, coherent red-or-blue shelf supports,
  white/light-grey parts tray bodies) were addressed only to the extent
  the existing geometry already matched them (confirmed by inspection and
  screenshot, not changed further) or the `PALETTE.wall`/`floor`/`cream`/
  `white` constants covered them; no per-object geometry/colour rewrite
  of `room.ts`'s individual decorative objects (the house, parts boxes,
  plant) was done beyond what's listed above.
- `src/server/readme.ts` was not updated for the colour identity (see
  "Not touched" above): this is an intentional deviation from Section 7
  of the brief, to respect CLAUDE.md's stronger "never change `/readme/`"
  rule, flagged here rather than silently skipped.
- Checked only in Chrome, with swiftshader software WebGL, and only with
  Chrome's regular WebGL-disabled flags for the fallback screenshot — not
  checked in Safari, WebKit, a real GPU, or a physical device.
- Contrast ratios were not independently re-verified with a tool against
  every new colour pairing in this pass (the starting palette's ratios
  were checked earlier in the session against the brief's suggested
  values); a dedicated accessibility contrast audit (Section 8 of the
  brief) remains open work alongside the semantic-states review.
