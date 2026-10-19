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
