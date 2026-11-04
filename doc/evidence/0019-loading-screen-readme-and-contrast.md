# Evidence 0019: test-failure investigation, README styling, branded loading screen, contrast fixes

Collected by the agent on 4 November 2026 (AEDT), completing the remaining
authorised parts of the colour/loading brief after evidence 0018: a
root-cause investigation of the apparent `pnpm test` failures evidence
0018 called "pre-existing", README restyling (explicitly authorised,
narrowly scoped), the branded loading screen, and a contrast audit of the
new palette with two real fixes. Against the **production build**, served
on ports 8096–8099 across this session (see "Why the port changed"
below), each with a fresh temporary `DATA_DIR`. Nothing pushed or
deployed.

## 1. Why evidence 0018's "13 pre-existing failures" was not the full story

Evidence 0018 reported `pnpm test` failing 7 tests against the colour
changes and 13 against a `git stash`-restored baseline, and called the 7 a
subset. Re-investigated from scratch, because "a larger number also
fails" does not by itself prove the smaller number is unrelated — both
could share one external cause.

**Root cause, found and fixed:** `spec/global-setup.ts` points `pnpm
test`'s HTTP checks at `APP_URL`, defaulting to `http://localhost:8080`
when unset. A **stale `tsx` process from 14 October 2026** (three weeks
old, long before this session, predating even the activation-reliability
pass) was still bound to port 8080 (`lsof -i :8080` confirmed PID 73390,
`ps -p 73390 -o lstart` showed `Wed 14 Oct 12:10:22 2026`). Its build
predates routes added since, e.g. `GET /api/me/peek` — a route
`spec/persistence.test.ts` and `spec/friends-and-identity.test.ts` call
directly — so it answered `404 Not found` for them. `pnpm test` with no
`APP_URL` set was silently talking to this three-week-old process the
whole time, not to anything built or started in this session.

This explains most, not all, of both failure counts:
- `spec/persistence.test.ts`'s and `spec/friends-and-identity.test.ts`'s
  `/api/me/peek` failures: caused directly by the stale server's missing
  route (`SyntaxError: Unexpected token 'N', "Not found" is not valid
  JSON`, `expected 404 to be 200`).
- The remaining failures in `spec/friends-and-identity.test.ts` and
  `spec/session-revocation.test.ts` (recovery-code and session tests)
  were **429 Too many attempts** responses: `vitest.config.ts` already
  documents, in its own comments, a real per-source-IP rate limiter on
  account-auth endpoints (`authRateLimited`, `accounts.ts`), sized for one
  browser's traffic, easily exceeded by running the suite (or a scripted
  check that also registers accounts) more than once within its ~60s
  window from the same test-runner IP. This is not a code defect; it is
  the intended behaviour of a real, documented rate limiter interacting
  with repeated local test runs.
- `spec/plans-and-attribution.test.ts`'s four failures reproduced
  identically whether the stale server or a freshly built one answered
  the request, and are unrelated to `APP_URL`, the port, or the rate
  limiter — investigated separately below.

**Fix applied:** none to application code — the fix was procedural:
always pass `APP_URL` to a freshly built, freshly started server on a
port confirmed empty beforehand (`lsof -i :<port> -sTCP:LISTEN`), and
never run two full suites back-to-back inside the auth rate limiter's
window. The stale process on 8080 was left running (killing an
unrelated, already-running process was outside the scope of this
session's sandboxed permissions); every check in this evidence and in
0018 used an explicit `APP_URL` pointing at a server this session itself
started, confirmed via `curl .../api/me/peek` to answer `200` before any
test run.

**`spec/plans-and-attribution.test.ts`'s four failures, investigated
separately:** reproduced with a correctly-targeted, freshly built server
(`APP_URL=http://localhost:8096`), confirmed to fail identically against
commit `fa6a487` (the branch point before any work in this session,
checked via `git stash` of every file this session touched, matching
evidence 0018's method) **and** against the very first commit of this
session's own work (`ad04efe`), i.e. before the colour pass began.
`git log -- spec/plans-and-attribution.test.ts src/domain/rules.ts`
confirms neither file was touched by any commit in this session. These
four failures are therefore pre-existing in the sense that matters: they
predate this session's first commit, are reproducible on an unmodified
checkout of the branch point, and touch no file this session edited. They
are **not fixed in this pass** (fixing `src/domain/rules.ts`'s plan logic
is outside this task's authorised scope — ADR 0014 Section 9 explicitly
excludes "construction rules" from this work) and are reported here as a
separate, pre-existing, unresolved issue rather than waved away:

| Test | Error |
|---|---|
| "refuses a floating plan, but accepts a wall on the plot and a roof on that planned wall…" | `expected floating.json.ok to be false, got true` |
| "refuses a plan inside a real part, and a duplicate or partial overlap…" | `expected inside.json.code to be "collision", got undefined` |
| "refuses withdrawing, removing or turning the only support under a standing plan…" | `expected withdraw.json.ok to be false, got true` |
| "lets only one of two concurrent overlapping proposals from different members succeed" | `expected exactly 1 of [ra.ok, rb.ok] true, got 2` |

**Final, correctly-isolated result:** with a freshly built server on a
confirmed-empty port, and outside the rate limiter's window,
`APP_URL=http://localhost:8099 pnpm check` (`pnpm typecheck && pnpm
test`) passed **228/228**. The plans-and-attribution failures above did
**not** reproduce in that run; they were observed only in a dedicated,
isolated repro (`pnpm test spec/plans-and-attribution.test.ts` run alone,
immediately after a fresh server start, with no other suite run first) —
meaning even these four are not perfectly deterministic across all
conditions tried, which is itself worth recording rather than asserting
a stronger claim than the evidence supports. No file this session changed
is implicated in their cause.

## 2. README styling (Section 7, explicitly re-authorised)

The author's follow-up explicitly authorised styling `/readme/` and asked
that CLAUDE.md's restriction be read narrowly: preserve the URL, the full
rendered README content, server-side rendering, and the shipped
invariant; change presentation only.

- `src/server/readme.ts`: the inline `<style>` block's colour tokens
  (`--ink`, `--paper`, `--red`, `--link`, background gradients, the
  `.bar`/`.back`/`main`/`blockquote`/`code`/`table`/`:focus-visible`
  rules) were replaced with the same white/red/blue/dark-blue direction
  as the rest of the site — a blue `--link`, blue chapter-heading colour
  (`h2`), a blue-bordered back button, a white reading surface, and a red
  left accent on `main`, matching Section 7 ("white reading surface, blue
  chapter headings, red brand accents, small yellow markers only where
  useful"). No HTML structure, no Markdown rendering logic, no route, and
  no content changed — `renderReadme()`'s signature, its `marked.parse`
  call and every string it reads from `README.md` are untouched.
- Re-verified the invariant this protects: `spec/invariants.test.ts`'s
  `"publishes README.md at /readme/"` test checks the served page's
  *text content* against `README.md`'s own headings, in order, after
  stripping all markup — it does not and cannot see colour. It passed
  (`doc/evidence/shots/colour-system/readme-desktop.png` is from the same
  verified build).
- `fly.toml`, `spec/invariants.test.ts` itself, `0.0.0.0:$PORT`, and the
  rendering code in `readme.ts` (as opposed to its `<style>` block) remain
  untouched, per CLAUDE.md's other "Never" items.

## 3. Branded loading screen (Section 3)

Two coordinated pieces, kept visually identical so there is no swap a
visitor would notice:

- **`src/client/index.html`'s `#static-splash`**: a plain `<div>` with an
  inline, hand-written SVG emblem (a baseplate, two walls and a
  deliberate gap — an unfinished house, not a finished logo) plus
  "Brick Commons" and "Setting out the table…", styled by a `<style>`
  block in `<head>`. No external font, no script, no three.js: this is
  the actual first paint, confirmed by loading the page with network
  conditions emulated via CDP (`Network.emulateNetworkConditions`,
  500ms latency) and checking the DOM at `commit`+200ms — the splash is
  present and fully painted before `main.tsx` has had a chance to run
  (`doc/evidence/shots/colour-system/static-splash-early.png`).
- **`HomeApp.tsx`'s `useRemoveStaticSplash()`**: removes `#static-splash`
  in a `useEffect` once React has mounted, so there is exactly one
  hand-off, not a layered stack of loading states.
- **`HomeApp.tsx`'s `.table-loading` state** (shown once React has
  mounted but the 3D bundle/WebGL context isn't ready) now renders the
  same emblem shape as a `<LoadingEmblem>` React component (kept visually
  identical to the static SVG; the two are necessarily separate markup
  since `index.html` is static and `HomeApp.tsx` is React, documented in
  both places to keep them in sync) plus the same "Brick Commons" /
  "Setting out the table…" text. A one-off settle-in animation (walls and
  roof fade/slide in over ~400ms, once, never looping) is skipped
  entirely under `prefers-reduced-motion: reduce` via the existing
  reduced-motion media query in `home.css`.
- **No fake percentage or progress bar, no repeated announcements**: the
  loading `<div>` has `role="status"` (announced once by assistive tech
  when it appears, not on every re-render) and shows only the emblem and
  the one status line until a `loadingSlow` state (a plain `useEffect`
  timeout, 4 seconds) reveals a labelled direct-navigation link list
  ("Taking a little longer than usual. You can go straight to:") —
  confirmed by screenshot at both the immediate and slow states
  (`doc/evidence/shots/colour-system/loading-slow-links.png`). This is a
  one-time reveal, not a poll or a retry, and never hides the links again
  once shown.
- **Failure and no-JS fallbacks preserved and left functionally
  unchanged**: `HomeApp.tsx`'s existing `Fallback` component (shown on
  `status === "failed"` — no WebGL, a failed chunk load, or a lost GPU
  context) still explicitly explains the cause ("The 3D table couldn't be
  shown on this device") and lists every core function, now in the new
  white/red identity
  (`doc/evidence/shots/colour-system/fallback-no-webgl-desktop.png`).
  `index.html`'s `<noscript>` block (unchanged logic, moved to sit after
  `#home-root` rather than duplicated) still renders the same full
  fallback nav with JavaScript disabled
  (`doc/evidence/shots/colour-system/fallback-no-js-desktop.png`), and a
  small added rule inside that same `<noscript>` hides `#static-splash`
  so it can never cover the no-JS fallback forever.
- **A regression found and fixed during this work:** the first version of
  `index.html` had the splash-hiding rule in its own second `<noscript>`
  element in `<head>`, alongside the existing one in `<body>` — two
  `<noscript>` elements on one page. `scripts/tabletop.ts`'s existing
  `"no JavaScript: the noscript links show"` check (which asserts exactly
  one `<noscript>`) caught this immediately (`{"noscript":2,"links":6}`).
  Fixed by merging the splash-hiding `<style>` into the single existing
  `<noscript>` block. Re-run confirmed `{"noscript":1}` and the full
  173-check suite passing — documented here as a regression this pass
  introduced and then fixed, not silently corrected.

## 4. Contrast and state verification (Section 8)

Computed WCAG relative-luminance contrast ratios (`/tmp/contrast_check.py`,
the standard sRGB relative-luminance formula) for every new foreground/
background pairing introduced or changed by evidence 0018 and this pass:
body text, button text, link text, info banners, warning/caution cards,
focus indicators, and the input-field border. 16 of 18 pairs checked
passed their applicable threshold (4.5:1 for normal text, 3:1 for large
text/UI components) on the first check; two did not, and both were fixed:

| Pairing | Before | After | Threshold |
|---|---|---|---|
| `.kit-ok`/`.tag-ok` green text on its pale-green success background | 4.40:1 (fail) | 4.55:1 (pass) — background lightened `#e6f3ea` → `#e9f7ee` | 4.5:1 |
| `.kit`'s input-field border on white | 2.16:1 (fail) | 3.06:1 (pass) — `--kit-line-strong` darkened `#9cb3c9` → `#7e96ae` (matching the already-correct `--input-border` value in `site-colors.css`) | 3:1 (non-text UI component) |

Both fixes are scoped to `src/client/ui/kit.css`'s `.kit`-local tokens —
never `:root`, never a shared `theme.css` token, so the editor (which
never gets a `.kit` ancestor) is unaffected; re-confirmed by the same
live editor check as evidence 0018 (`--red` still `#e3241b`, body class
still `""`) after this change. `theme.css`'s own `--line-strong` (used
mostly for decorative card-bottom shadows, not a border carrying meaning)
was deliberately left alone — changing it would have touched the shared,
gameplay-reachable token.

Also explicitly checked and passing, without needing a fix:
- Body/secondary text on white and on the pale page background (14.31:1,
  6.61:1, 6.04:1).
- White text on the primary red button and its darker edge (4.97:1,
  7.49:1).
- The secondary button's blue border and the README's blue link colour
  (5.84:1, 8.50:1).
- Dark-blue text on the yellow caution/invite-tag backgrounds (13.24:1,
  10.04:1) — confirming Section 8's "yellow should normally use dark text
  rather than white" rule, already followed everywhere `var(--yellow)` is
  used as a background (`grep` of every such rule in `kit.css`,
  `theme.css` and `home.css` showed `color: var(--ink)` or no override —
  i.e. inherited dark text — at each site).
- The red-error banner's text on its pale-red background (4.76:1).
- Dark-blue text on the pale-blue informational background (12.40:1).
- The shared blue focus outline on white (5.84:1, exceeding the 3:1 a
  focus indicator needs).

**Live state checks** (Chrome/swiftshader, `/build/?view=account`):
registering/signing in, an incorrect-credentials error (explicit red text
+ pale-red banner + left border, not colour alone —
`doc/evidence/shots/colour-system/error-state-desktop.png`), keyboard
focus traversal (blue outline clearly visible on nav links and buttons),
and the disabled "Sign in" submit button (reduced-opacity red, consistent
with the shared, unmodified `theme.css` `.btn:disabled` rule — disabled
controls are explicitly exempt from WCAG's contrast requirement, and this
rule is shared with the editor so it was not touched).

**Not independently re-measured in this pass:** hover/active states'
exact ratios (visually inspected only), and no automated tool (e.g.
axe-core) was run — the check above is a manual formula-based audit of
the specific pairings this colour pass introduced or changed, not an
exhaustive page-level accessibility scan.

## 5. Tests run (final, correctly-isolated state)

Server built and started fresh on port 8099 (`DATA_DIR=/tmp/tt-data-verify4`),
confirmed healthy (`curl .../api/me/peek` → `200`) before every run below:

- `pnpm typecheck`: passed.
- `pnpm build`: built.
- `APP_URL=http://localhost:8099 pnpm check` (`typecheck && test`):
  **228/228 passed**, run after waiting out the account-auth rate
  limiter's window from this session's earlier repeated runs.
- `scripts/tabletop.ts` (full suite): **173/173 passed**, on the first
  attempt immediately after the loading-screen noscript fix, and again
  (**173/173**) in a final confirmation run after the contrast fixes,
  outside the rate limiter's window. (One intermediate attempt, run
  inside the rate limiter's window right after the previous `pnpm check`
  run, failed one check — `TimeoutError` waiting for the post-registration
  "Signed in as" text, because that registration call itself got a `429`
  — recorded here as a run invalidated by the documented rate limiter,
  not as a finding.)
- `pnpm check:evidence`: passed.
- `git diff --check`: clean.

## 6. Screenshots

In `doc/evidence/shots/colour-system/` (this pass adds the new ones,
keeps evidence 0018's for continuity):
- `static-splash-early.png`: the pre-React `#static-splash`, painted
  before `main.tsx` has run.
- `loading-slow-links.png`: the React loading state once the slow-loading
  timeout has revealed direct navigation links.
- `readme-desktop.png`: `/readme/` in the new identity — white surface,
  blue `h2`s, red left accent, yellow underline on `h1`, full original
  content.
- `account-page-desktop.png`: the dedicated `/build/?view=account` page.
- `error-state-desktop.png`: an incorrect-credentials error in the
  sign-in form — explicit text, icon-free but colour-plus-text, not
  colour alone.
- `fallback-no-js-desktop.png`: the `<noscript>` fallback, now
  structurally de-duplicated to a single `<noscript>` element.
- `editor-unchanged-desktop.png`: replaced with a screenshot from this
  pass's final build, confirming the editor is still pixel-equivalent to
  the pre-colour-pass original.
- `overview-desktop.png`, `overview-mobile.png`, `sign-in-panel-desktop.png`,
  `lobby-rooms-desktop.png`, `fallback-no-webgl-desktop.png`: refreshed
  from the final build (same content as evidence 0018's versions; the
  files were re-captured rather than left possibly stale).

## 7. Known limitations (updated from evidence 0018)

- `spec/plans-and-attribution.test.ts`'s four failures (listed in section
  1) are a **real, pre-existing issue** in `src/domain/rules.ts`'s plan
  logic, predating this session, reproducible on the unmodified branch
  point, and touching no file this pass or evidence 0018 changed. Fixing
  them is outside this task's authorised scope (construction rules are
  explicitly excluded by ADR 0014 Section 9) and is flagged here rather
  than fixed or hidden.
- Section 5's per-object 3D geometry/colour work (individual sign/board/
  tray/shelf pieces in `room.ts` beyond the shared `PALETTE` constants
  already updated in evidence 0018) was not extended further in this
  pass.
- Checked only in Chrome with swiftshader software WebGL; not checked in
  Safari, WebKit, a real GPU, or a physical device.
- The contrast audit covers the specific pairings this colour pass
  touched, not an exhaustive automated accessibility scan of every page.
- The stale process on port 8080 (PID 73390 at investigation time) was
  identified but not killed — terminating an already-running,
  unrelated process was outside this session's sandboxed permissions.
  Anyone running `pnpm test` locally without an explicit `APP_URL` should
  first confirm nothing stale is listening on port 8080.
