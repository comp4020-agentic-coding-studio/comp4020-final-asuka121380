import { defineConfig } from "vitest/config";

// Two projects, both run by `pnpm check`:
// - `app`: the HTTP checks in spec/*.test.ts, against the RUNNING app that
//   spec/global-setup.ts finds (the two shipped invariants live here)
// - `domain`: spec/domain/, the construction rules as plain functions, which
//   need no server
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "app",
          include: ["spec/*.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
      {
        test: {
          name: "domain",
          include: ["spec/domain/**/*.test.ts"],
        },
      },
    ],
  },
});
