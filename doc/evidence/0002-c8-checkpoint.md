# Evidence 0002: C8 checkpoint, visual slice, then the save loop

Collected by the agent, 6 October 2026 (AEDT). What was run and what it
showed. Screenshots are in `shots/c8-checkpoint/`.

## Commits

- [`4b40546`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4b40546):
  the shared rules, the reference model and the first R3F workbench, which
  saved nothing yet.
- [`9202f3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/9202f3f):
  the Express and node:sqlite server, the command path and `/readme/`.

## Deploy path (before any app code)

- The untouched course starter was deployed with
  `flyctl deploy --remote-only --ha=false`.
- `/` and `/readme/` returned 200, but the first request to `/` got no
  response while the stopped machine started.
- `APP_URL=… pnpm check` gave 2/2.

## Domain rules (`pnpm vitest run --project domain`)

17 tests passed. Among them:
- The whole reference model assembles through the player rules.
- Out of stock, collision, floating parts, the sloped face of a slope and
  outside the plot are each refused without changing anything.
- Removing a part that is something's only support is refused, and removing
  one of two supports is allowed.
- Recolouring changes neither shape nor stock.

## Placement experiment (`scripts/placement-experiment.ts`, Chrome via playwright-core)

- **Run 1, `?local`:** the in-browser rules with nothing saved.
- **Run 2, the local server.**
- **Run 3, the deployed app.**

The results were the same each time:

| Action | Result shown to the player |
| --- | --- |
| 2×2 plate by keyboard (arrow, Enter) | "Placed Plate 2×2. Saved.", stock 3 → 2 |
| 2×4 brick over the plate | rests one plate up on the plate's studs, stock 19 → 18 |
| 2×2 slope rotated (R) onto the brick | placed, stock 14 → 13 |
| door | placed, stock 1 → 0 |
| a second door | "Can't place there: No Door with frame 1×4×6 (D46) left in your kit.", stock stays 0 |
| 1×2 brick by mouse hover and click | placed where the ghost was |
| select newest (S, ]), recolour Rose pink | "Recoloured. Saved.", inspector shows Rose pink |
| Delete | "Removed Brick 1×2; it's back in your kit." |
| select the plate ([), Delete | "Can't remove this yet: it's the only support for a Brick 2×4 above it. Remove that first." |
| reload the page | every count identical before and after, status "✓ Saved" |

No page errors in any run.

## HTTP checks against the deployed app

`APP_URL=https://comp4020-final-asuka121380.fly.dev pnpm check` ran 26 tests
in 3 files, all passing:
- the 2 shipped invariants
- the 17 domain tests
- the 7 persistence tests in `spec/persistence.test.ts`

## Restart and redeploy persistence, on Fly

This was a new visitor made with curl and a cookie jar.

1. 05:38:14Z: build `227d9b2a…` at revision 0. One 2×4 placed at (6, 0, 2) in
   brick red, giving revision 1 and 18 left in stock.
2. `flyctl machine restart 84e1dea2790d38`. At 05:38:20Z the same build,
   revision 1, the same part id `1bedd153`, and 18 in stock.
3. `flyctl deploy` took the release from v2 to v3. At 05:40:06Z the same build,
   revision 1, the same part, and 18 in stock.

## Not yet checked

- Touch input on a real phone. Only the 390×844 viewport was rendered; no taps
  were driven.
- A keyboard-only pass by a person.
- Resizing mid-use.
- Anyone other than the agent using it.
