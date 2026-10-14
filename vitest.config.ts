import { defineConfig } from "vitest/config";

// Two projects, both run by `pnpm check`:
// - `app`: the HTTP checks in spec/*.test.ts, against the RUNNING app that
//   spec/global-setup.ts finds (the two shipped invariants live here)
// - `domain`: spec/domain/, the construction rules as plain functions, which
//   need no server
// - `server`: spec/server/, the server's storage code against a throwaway
//   in-memory database
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "app",
          include: ["spec/*.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
          // These files share ONE running server/database AND its real,
          // intentional per-source-IP rate limiters (account registration/
          // sign-in, recovery — accounts.ts/identity.ts; never weakened for
          // tests). Running the files in parallel means several of them
          // hitting those endpoints at once, all from this one test
          // runner's IP, which exceeds a 10/min budget that's sized for a
          // real browser's traffic, not several worker processes' combined
          // load. Sequential keeps the limiter doing its actual job without
          // raising it just to make concurrent test traffic fit.
          fileParallelism: false,
          // Even sequentially, spec/session-revocation.test.ts and
          // spec/friends-and-identity.test.ts together currently make 10
          // calls against the same 10-per-minute account-auth limiter
          // (authRateLimited, accounts.ts) — right at its ceiling. Adding
          // another register/sign-in call to either file (or a new file
          // calling those endpoints) will start failing with 429s when the
          // whole suite runs within one minute; reduce an existing test's
          // call count (reuse an already-registered account where the
          // test doesn't need a fresh one — see both files' comments)
          // rather than raise the limiter itself.
        },
      },
      {
        test: {
          name: "domain",
          include: ["spec/domain/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          include: ["spec/server/**/*.test.ts"],
        },
      },
    ],
  },
});
