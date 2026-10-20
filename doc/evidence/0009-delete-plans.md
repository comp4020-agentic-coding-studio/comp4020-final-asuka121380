# Evidence 0009: unified Delete tool

19 October 2026, Australia/Sydney. Author requested that Delete tool remove
plans as well as real bricks, without selecting each plan and withdrawing
it separately. Implemented by Codex in the local checkout; not deployed.

## Implementation

- Scene hover and click can target a plan; targeted plans use the existing
  red delete highlight. Touch retains two-tap confirmation.
- Toolbar confirmation, Enter and Delete/Backspace route a delete target to
  remove for real bricks or withdraw-plan for plans. Keyboard cycling in
  Delete tool includes both kinds. Tool stays active after success.
- Existing support validation is unchanged. A supporting plan cannot be
  withdrawn until its dependants have another support or are removed.
- The local preview transport now returns only open plans, matching the
  Snapshot contract and the server. Tests revealed it previously returned
  withdrawn plans too. This is separate from the deployed server behavior.

## Checks actually run

- `mise exec -- pnpm typecheck`: passed.
- `mise exec -- pnpm build`: passed.
- Client/domain/server tests: 79/79 passed.
- Full `pnpm check` with APP_URL=http://127.0.0.1:8381: 161/161 passed,
  18 test files. Server used a fresh temporary database, not user data.
- Five new client-store tests cover plan withdrawal without stock changes,
  real removal with stock returned, support refusal and top-down deletion,
  target cycling plus confirmation, and missing targets.

## Limits and manual acceptance still required

Browser control was denied because the browser security policy could not
be verified. No browser tests or screenshots were obtained this turn, and
no alternative browser driver was used to bypass that denial.

The passing tests verify store dispatch, domain rules and HTTP behavior;
they do not verify 3D pointer hit testing, visual highlights or touch.
Manually check on desktop and phone: D then click/tap a plan; red target
highlight; tool remains active; top-down deletion; refusal when supporting
another plan; real stock unchanged for plans; real deletion returns stock.
Also check toolbar Remove it and keyboard Enter/Delete/Backspace. Existing
browser regression scripts were not rerun. The deployed site was not tested.

## Addendum, 20 October 2026 (AEDT, added by Claude): deployment record

The original text above is unchanged. It describes the state when it was
written: implemented in the local checkout, not deployed.

The author later reported that the change was pushed and deployed. The
GitHub Actions record confirms it (read with `gh run view`, read-only):
- Run 39204979166, triggered by the push of
  [`f325e2e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/f325e2e),
  whose history includes
  [`0270a00`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0270a00).
- Job `check` succeeded, 05:31:11–05:32:04 UTC on 19 Oct 2026.
- Job `deploy` succeeded, 05:32:06–05:32:45 UTC (16:32–16:33 AEDT).

Not checked:
- the Fly release number (no `flyctl` command was run)
- anything on the deployed site

The limits listed above still stand. Browser acceptance of the Delete tool's
pointer, highlight and touch behaviour was not done for that change.
