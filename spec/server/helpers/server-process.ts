import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Starts the real server (src/server/index.ts) as its own process, on a free
// port with a fresh temporary DATA_DIR, and captures everything it writes to
// stdout and stderr, so a test can check both what the logs say and what
// they must never contain. Each server process has its own in-memory rate
// limiters; nothing here weakens them. `stop()` kills the process and
// removes the temporary directory.

export interface ServerProcess {
  base: string;
  stdout: () => string;
  stderr: () => string;
  /** Parsed JSON lines written to stdout so far. */
  events: () => Record<string, unknown>[];
  /** Waits until a line matching `pred` has been written (logs are written after the response is sent in some paths). */
  waitFor: (pred: (e: Record<string, unknown>) => boolean, ms?: number) => Promise<Record<string, unknown>>;
  stop: () => Promise<void>;
  /** Resolves with the exit code (or signal) once the process has exited. */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Sends a signal to the server process. */
  kill: (signal: NodeJS.Signals) => void;
  /** Stop reading the server's stdout, so its pipe fills as an unread log shipper's would. */
  pauseStdout: () => void;
  /** Read it again. */
  resumeStdout: () => void;
  /** Close our end of the stdout pipe: the server's next writes fail (EPIPE). */
  closeStdout: () => void;
}

export interface StartOptions {
  /** Extra arguments to node before the script, e.g. ["--import", "/tmp/x.mjs"] for a test-only preload. */
  nodeArgs?: string[];
  env?: Record<string, string>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer(opts: StartOptions = {}): Promise<ServerProcess> {
  const dataDir = mkdtempSync(join(tmpdir(), "brick-log-test-"));
  const port = await freePort();
  let out = "";
  let err = "";
  const child: ChildProcess = spawn(process.execPath, [...(opts.nodeArgs ?? []), "src/server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: "production", ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  child.stdout!.setEncoding("utf8").on("data", (d: string) => (out += d));
  child.stdout!.on("error", () => {}); // after closeStdout
  child.stderr!.setEncoding("utf8").on("data", (d: string) => (err += d));

  const events = (): Record<string, unknown>[] =>
    out
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);

  const waitFor = async (pred: (e: Record<string, unknown>) => boolean, ms = 5000): Promise<Record<string, unknown>> => {
    const until = Date.now() + ms;
    for (;;) {
      const hit = events().find(pred);
      if (hit) return hit;
      if (Date.now() > until) throw new Error(`no matching log line within ${ms} ms; stdout so far:\n${out}\nstderr:\n${err}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  const stop = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    rmSync(dataDir, { recursive: true, force: true });
  };

  try {
    await waitFor((e) => e.event === "server.start", 15_000);
  } catch (e) {
    await stop();
    throw e;
  }
  return {
    base: `http://127.0.0.1:${port}`,
    stdout: () => out,
    stderr: () => err,
    events,
    waitFor,
    stop,
    exited,
    kill: (sig) => void child.kill(sig),
    pauseStdout: () => void child.stdout!.pause(),
    resumeStdout: () => void child.stdout!.resume(),
    closeStdout: () => void child.stdout!.destroy(),
  };
}

/** A tiny cookie-keeping client: one per simulated browser profile. */
export function browser(base: string) {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async req(method: string, path: string, body?: unknown, raw?: { type: string; data: string }): Promise<{ status: number; body: any; reqId: string | null }> {
      const headers: Record<string, string> = {};
      if (cookie) headers.cookie = cookie;
      if (raw) headers["content-type"] = raw.type;
      else if (body !== undefined) headers["content-type"] = "application/json";
      const res = await fetch(base + path, { method, headers, body: raw ? raw.data : body !== undefined ? JSON.stringify(body) : undefined });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON
      }
      return { status: res.status, body: parsed, reqId: res.headers.get("x-request-id") };
    },
  };
}
