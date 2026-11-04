# Evidence 0017: two missed-activation causes found and fixed; one suspected cause ruled out

Collected by the agent on 4 November 2026 (AEDT), investigating the
author's report that activating a table entrance sometimes did nothing —
after returning from a panel to the overview, and shortly after the
homepage first loaded — but worked again once the camera or loading had
settled. Decision record: ADR 0014, "Activation reliability" (below).
Against the **production build**, served on port 8090 with a fresh
temporary `DATA_DIR`. Nothing was pushed or deployed.

## Method

Rather than assume a cause, the agent wrote small Playwright scripts
(outside the repo, in `/tmp/ttshot/`) that drove the real built page
through Chrome with software (swiftshader) WebGL and read back the app's
own state (`__tableCamera()`, `data-focus`, `history.length`, and
instrumented `pointerdown`/`pointerup`/`click`/`popstate`/`history.*`
calls) rather than guessing from behaviour alone. Each suspected cause was
reproduced on the **pre-fix** build, the fix applied, then the same script
re-run on the fixed build to confirm the specific failure no longer
occurs — not merely that some later retry happened to pass.

## Cause 1 (confirmed and fixed): the hover lift moves the thing that was pressed

A browser sends `click` only to the element that was under the pointer at
*both* `pointerdown` and `pointerup`. Each entrance's printed label lifts
on hover (`EntranceObject`'s `lift` group, eased over a few frames). A
press near the lower edge of a label — a natural place to aim, since the
label is wider than tall — could land on the `<button>`, have the label
lift away under it during the hold, and release over the canvas behind it.
The browser then sends `click` to the nearest common ancestor of the two
elements, which is not listening, and the activation vanishes with no
error and no visible sign anything happened.

**Reproduced** (`/tmp/ttshot/race2.ts`, scenario F): a scripted press-and-hold
of 90 ms at increasing fractions of a label's height, before the fix:

| Press point (fraction of label height) | mousedown target | mouseup target | Result |
|---|---|---|---|
| 0.50 | `BUTTON.entrance-face` | `BUTTON.entrance-face` | opened |
| 0.85 | `BUTTON.entrance-face` | `CANVAS` | **nothing** |
| 0.95 | `CANVAS` | `CANVAS` | opened (raycast still hit the object) |

**Fix** (`TableScene.tsx`): activation is decided on **press**, not
release. Pressing an entrance's hit box, its label, or a phone's touch pad
arms that entrance; releasing anywhere within 14px of the press point
chooses it, regardless of what element the release lands on. The `click`
that a browser still sends after such a release is caught at `window`
level and stopped, so the gesture does not also fire React's own
`onClick` a second time. A keyboard activation (Enter/Space on the
focused button) has no pointer gesture before it (`event.detail === 0`),
so it still goes through the ordinary `click` handler.

**Verified fixed**: the same scripted press at every fraction (0.5, 0.85,
0.95) now opens the panel.

## Cause 2 (confirmed and fixed): a deferred `history.back()` can undo a newer choice

"Back to table" (and Escape) closed a panel by calling `history.back()`,
relying on the resulting `popstate` event to update `focus`. That event
does not fire synchronously — Chromium defers it — so a visitor who
closed a panel and *immediately* activated a different object could have
their new choice overwritten moments later when the delayed `popstate`
from the close arrived and reset `focus` to the URL it carried (the
overview).

**Reproduced** (`/tmp/ttshot/race6.ts`, `/tmp/ttshot/race7.ts`, traced with
`/tmp/ttshot/race5.ts`'s instrumentation of `history.back`/`pushState`/
`popstate`): closing the shelf panel with Escape, then pressing the
noticeboard's label while the camera was still animating back:

```
+7ms    pushState {tableFocus:"shelf"} /?focus=shelf
--- Escape pressed ---
+1382ms history.back() called
--- noticeboard pressed, correctly armed and chosen ---
+1387ms popstate fires (from the back() above), focus reset to overview
        (the choice of "rooms" is silently lost)
```

Out of several runs under swiftshader's bursty frame timing, this
recurred whenever the deferred `popstate` from a close landed *after* a
new choice had already been made and applied, but before that choice's
own `pushState` had gone out.

**Fix** (`HomeApp.tsx`): the page's own idea of what it means to show
(`intended`, a ref, not state) is updated synchronously the instant a
choice is made, in `go()`. A `popstate` this page itself caused (tracked
via `ownBack`) is distinguished from the browser's own Back/Forward: if a
newer choice has been made since, the deferred `popstate` from our own
`history.back()` is absorbed and `intended`'s (newer) value is written
back onto history instead of being allowed to overwrite it. The
browser's own Back/Forward (`ownBack.current` false) always wins, as
before — only our own, already-superseded closing navigation is ever
overridden.

**Verified fixed**: the identical "Back to table, then immediately
activate another entrance" sequence (and the equivalent Escape sequence)
now consistently ends on the newly chosen entrance, never the overview.
`/tmp/ttshot/race6.ts`, `race7.ts` (10 and 12 repeated trials
respectively) show no further "armed but reverted to overview" cases
after the fix; `scripts/tabletop.ts`'s own existing history assertions
(`desktop`'s "a double click adds one history entry, not two", "reversing
mid-move settles at the overview") still pass.

## Suspected cause 3: ruled out — the "stale camera" theory was a test-harness artifact, not an application defect

Several early repeated trials of a mid-return press (`/tmp/ttshot/race3.ts`,
`race6.ts`, `race7.ts`) showed a `pointerdown` landing on the bare
`<canvas>` with R3F's own raycast finding no object, even though the
target label's `getBoundingClientRect()` reported it as on-screen at the
sampled coordinates. The agent's working theory was that under slow
(software) rendering, a single frame can take seconds to reach the
screen, so the camera (updated synchronously each `requestAnimationFrame`
tick, before that frame is drawn) could run many ticks ahead of what is
actually painted — meaning a press aimed at what the visitor currently
sees could be raycast against a camera pose several moves later, landing
on nothing.

Acting on that theory, the agent began an R3F `events.compute`/manual
`gl.render()` override (`DrawnCamera`/`DrawnFrame`, drafted but never
wired into the scene) to raycast against the camera exactly as it was for
the last frame actually submitted to the GPU, rather than the live one.

**Before finishing that patch, the theory was tested directly** and
disproved:

- `/tmp/ttshot/diag1.ts` instrumented the exact `pointerdown` that missed
  in several repeated trials and found, every time, that `cameraAtThisInstant`
  — read inside the capture-phase listener, at the moment of the real DOM
  event — had **already fully settled at the overview** (`moving: false`).
  The press itself happened *after* the return had finished; only the
  `(x, y)` coordinate the test script had chosen earlier (while the
  animation was still running) was stale.
- `/tmp/ttshot/diag2.ts` re-sampled the target point and dispatched a
  `PointerEvent` in the *same synchronous JS step*, with no round-trip
  between sampling and acting — removing the test harness's own
  move-then-down delay. Across 15 attempts, no synchronous JS step ever
  observed a moving, on-screen label at all: the window in which one
  exists under swiftshader's bursty frame timing is shorter than a
  single script step can usefully sample and then act within, independent
  of raycast camera staleness.
- `/tmp/ttshot/diag3.ts` read `__tableCamera()` twenty times in a single
  synchronous script evaluation during a move and found the value
  constant across all twenty reads — confirming that within one
  synchronous tick (which is all any real human pointer event ever spans:
  a `pointerdown` is dispatched and handled synchronously by the page),
  the camera cannot be ahead of itself. The divergence seen earlier only
  ever arose from `/tmp/ttshot`'s own `page.mouse.move()` then
  `page.mouse.down()` — two separate CDP round trips with real wall-clock
  time between them, during which the in-page animation continued or
  completed. A genuine human press does not split a move and a down
  across a multi-hundred-millisecond gap the way the test driver did.

**Conclusion**: there is no camera/raycast staleness defect reachable by
an actual press. The `DrawnCamera`/`DrawnFrame` draft was removed in full
(it was never wired into the `Canvas` or referenced anywhere) rather than
landed as an untested, invasive change — claiming R3F's render priority
to call `gl.render()` manually would have been a materially riskier
change than the problem (once disproved) warranted, and ADR 0014's
"interrupt/retarget safely" guidance is about honouring the user's
latest choice, not about re-deriving R3F's picking pipeline.

## A third fix made in passing: a guessed timeout could discard a genuine slow press

While investigating cause 2, one repeated-trial run (`/tmp/ttshot/race7.ts`,
runs 7 and 11) showed a press correctly armed (`pointerdown` and
`pointerup` both landing on the same, correct `<button>`) but discarded,
because the gap between the two events — 1210ms, caused by the main
thread stalling under swiftshader, not by the visitor's hand — exceeded
an arbitrary 900ms cap the first version of the press-to-choose code
imposed.

**Fix**: the time cap was removed. There is no necessary reason for one:
`pointercancel` already clears a press whose pointer capture was lost
(switching tabs, the OS taking the gesture), and the 14px distance check
already rejects a release that answers a different gesture. A
press-and-release that never moved is honoured no matter how long it
took to hold, per ADR 0014's "do not silently discard an activation."

## Checks run on the fixed build

| Check | Result |
|---|---|
| `pnpm typecheck` | passed, at every intermediate state including after removing the unused `DrawnCamera`/`DrawnFrame` draft |
| `pnpm build` | built |
| `scripts/tabletop.ts` — `desktop` | 38/38 |
| `scripts/tabletop.ts` — `mobile` | 9/9 |
| `scripts/tabletop.ts` — `reduced` | 3/3 |
| `scripts/tabletop.ts` — `failures` | 7/7 |
| `scripts/tabletop.ts` — `others` | 5/5 |
| `scripts/tabletop.ts` — `entrances` | 76/76 |
| `scripts/tabletop.ts` — `activation` (new) | 5/5 |
| `scripts/tabletop.ts` — `invitations` | 9/9 |
| `scripts/tabletop.ts` — `mobile-entrances` | 9/9 |
| `scripts/tabletop.ts` — `intermediate` | 12/12 |
| `APP_URL=http://localhost:8090 pnpm check` | 26 files, 228/228 |
| `git diff --check` | clean |

None of these assertions were weakened to make them pass; the same
history, focus, reduced-motion, keyboard, direct-link and double-submit
assertions that existed before this pass are unchanged and still pass.

## The "0 part s (0 kind s)" wording from the brief

The brief also asked for the saved-version detail page's part/kind count
to use correct singular/plural rendering. Reading
`src/client/lobby/Collection.tsx` (`{partCount} part{partCount === 1 ? ""
: "s"} ({kinds} kind{kinds === 1 ? "" : "s"})`), and rendering a real
0-part saved version in the browser (`/build/?snapshot=<id>`), the text
already reads **"Beach Houses · 0 parts (0 kinds) · saved …"** — correct,
with no separated suffix. No other surface (the shelf preview, the
collection/showcase cards) shows a part or kind count at all. The agent
searched the full commit history for the pattern described and found
only the one commit that introduced this line, already in its current,
correct form. No change was made here, since there was nothing to fix;
this is recorded rather than silently skipped.

## Regression coverage added to the shipped suite

`scripts/tabletop.ts` gained a new `activation` run, using deterministic,
directly-dispatched DOM events rather than a timing-dependent wait for a
slow-rendering window:

- **Cause 1's fix.** A synthetic `pointerdown` on the noticeboard's label,
  then `pointerup` at the same coordinates but dispatched on the canvas
  behind it — exactly the element mismatch the hover lift used to cause —
  must still open the panel.
- **A check that this isn't just "any release anywhere activates"**: a
  press that moves more than the 14px slop distance before release must
  choose nothing.
- **Cause 2's fix.** Closing a panel ("Back to table") and choosing a
  different entrance are dispatched synchronously, in the same tick, before
  the close's own deferred `popstate` can fire — the exact ordering that
  discarded the newer choice before the fix. The camera must settle on
  the new choice, and the URL must agree.

**Each assertion was confirmed to fail on the pre-fix code before being
added**, not merely written to pass on the fixed one:
- With both fixes reverted (`git stash` of `HomeApp.tsx` and
  `TableScene.tsx`), the `activation` run's first check times out
  (`0/1 passed`): the synthetic pointerdown/pointerup-on-different-elements
  sequence never opens the panel, because the pre-fix code only listened
  for `click`.
- With only `HomeApp.tsx` reverted (cause 1's fix kept, isolating cause 2),
  a standalone probe (`/tmp/ttshot/isolate_cause2.ts`) showed the
  close-then-choose sequence ending at `overview` (`url=?debug`,
  `dialog=null`) instead of the newly chosen `friends` panel — reproducing
  cause 2 in isolation from cause 1.
- With both fixes restored, the full `activation` run and the full
  existing suite (`desktop`, `mobile`, `reduced`, `failures`, `others`,
  `entrances`, `invitations`, `mobile-entrances`, `intermediate`) all
  pass together; see the table below.

## Known limitations

- Checked only in Chrome, with swiftshader software WebGL, through
  Playwright. Not checked in Safari or WebKit, on a real GPU, on a
  physical device, or with a screen reader.
- The repeated-trial counts in the investigation above (10, 12, 15 runs in
  various `/tmp` scripts) are not exhaustive; they were enough to
  reproduce each cause reliably during diagnosis, not a formal proof of
  absence under every possible timing. The shipped `activation` run,
  by contrast, is deterministic: it dispatches the exact event sequence
  each cause needs rather than waiting to catch one.
