import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildFor, findVisitor, parseEnvelope, runCommand, summaryFor, visitorFor } from "./builds.ts";
import { openDatabase } from "./db.ts";
import { renderReadme } from "./readme.ts";

// One same-origin service: the built client (the homepage at / and the
// editor at /build/), the build API and /readme/.
// It listens on 0.0.0.0:$PORT, and its only durable state is the SQLite file
// on the volume mounted at /data (fly.toml).

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ROOT = process.cwd();
const CLIENT = join(ROOT, "dist/client");
const COOKIE = "brick_visitor";
const YEAR = 365 * 24 * 60 * 60;

const db = openDatabase(join(DATA_DIR, "app.db"));
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true); // Fly terminates TLS in front of us

function readCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function setCookie(req: Request, res: Response, token: string): void {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${secure}`);
}

// One line per command: who (an opaque prefix), which build, what, and how it
// went. Never the cookie.
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

// A small per-visitor brake on command floods; real building is far slower.
const recent = new Map<string, number[]>();
function tooFast(visitorId: string): boolean {
  const t = Date.now();
  const times = (recent.get(visitorId) ?? []).filter((x) => t - x < 10_000);
  times.push(t);
  recent.set(visitorId, times);
  return times.length > 40;
}

app.use("/api", express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/build", (req, res) => {
  const visitor = visitorFor(db, readCookie(req));
  if (visitor.newToken) setCookie(req, res, visitor.newToken);
  res.json(buildFor(db, visitor.id));
});

// the homepage's "Continue my build": read-only, and sets no cookie
app.get("/api/summary", (req, res) => {
  res.json(summaryFor(db, readCookie(req)));
});

app.post("/api/command", (req, res) => {
  const visitorId = findVisitor(db, readCookie(req));
  if (!visitorId) {
    res.status(401).json({ ok: false, code: "bad_request", message: "No visitor session; reload the page." });
    return;
  }
  if (!req.is("application/json")) {
    res.status(415).json({ ok: false, code: "bad_request", message: "Commands are JSON." });
    return;
  }
  if (tooFast(visitorId)) {
    res.status(429).json({ ok: false, code: "bad_request", message: "That's a lot of changes at once; wait a moment." });
    return;
  }
  const envelope = parseEnvelope(req.body);
  if (!envelope) {
    res.status(400).json({ ok: false, code: "bad_request", message: "That command isn't one the server understands." });
    return;
  }
  const { result, outcome, buildId } = runCommand(db, visitorId, envelope);
  log({
    event: "command",
    visitor: visitorId.slice(0, 8),
    build: buildId?.slice(0, 8),
    type: envelope.command.type,
    partId: envelope.command.type === "place" ? envelope.command.placement.partId : undefined,
    outcome,
    code: result.ok ? undefined : result.code,
    revision: result.ok ? result.snapshot.revision : undefined,
  });
  res.status(result.ok ? 200 : outcome === "conflict" ? 409 : 422).json(result);
});

// Express matches /readme and /readme/ alike; only the slash form lets the
// README's relative links resolve, so send the bare one there
app.get("/readme/", (req, res) => {
  if (!req.path.endsWith("/")) {
    res.redirect(301, "/readme/");
    return;
  }
  res.type("html").send(renderReadme(join(ROOT, "README.md")));
});
// images the README links relatively (docs/…) resolve under /readme/
app.use("/readme/docs", express.static(join(ROOT, "docs")));

if (existsSync(CLIENT)) {
  app.use(
    express.static(CLIENT, {
      index: "index.html",
      // hashed assets can be cached; the page that names them must not be
      setHeaders: (res, path) => res.setHeader("Cache-Control", path.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable"),
    }),
  );
} else {
  app.get("/", (_req, res) => {
    res.type("text").send("The client hasn't been built: run `pnpm build`.");
  });
}

app.use((_req, res) => {
  res.status(404).type("text").send("Not found");
});

const server = app.listen(PORT, "0.0.0.0", () => {
  log({ event: "listening", port: PORT, data: DATA_DIR });
});

// Fly stops idle machines with SIGINT; close cleanly so WAL is checkpointed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
