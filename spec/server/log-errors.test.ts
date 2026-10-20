import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { browser, startServer, type ServerProcess } from "./helpers/server-process.ts";

// ADR 0013: requests that fail before or outside a route's own handling
// (malformed or oversized bodies, unknown routes, odd parameters) keep their
// HTTP statuses, and nothing they carried reaches stdout or stderr. Before
// this change Express's default error handler printed the stack of a JSON
// parse error, whose first line quotes the start of the request body.

const SENTINEL = "SENTINEL-errlog-4b7e";
let server: ServerProcess;

beforeAll(async () => {
  server = await startServer();
}, 20_000);
afterAll(async () => {
  await server?.stop();
});

const bothStreams = () => server.stdout() + server.stderr();

describe("unsafe input never reaches the logs", () => {
  it("malformed JSON stays a 400 with Express's production error page, and is logged as a safe classification", async () => {
    const b = browser(server.base);
    const res = await b.req("POST", "/api/account/sign-in", undefined, { type: "application/json", data: `password=${SENTINEL}` });
    expect(res.status).toBe(400);
    expect(res.body).toContain("<pre>Bad Request</pre>");
    expect(res.body).not.toContain(SENTINEL);
    expect(res.reqId).toMatch(/^[0-9a-f-]{36}$/);
    const line = await server.waitFor((e) => e.req === res.reqId);
    expect(line).toMatchObject({ event: "http.refused", outcome: "invalid", kind: "malformed_json", status: 400, method: "POST" });
    expect(bothStreams()).not.toContain(SENTINEL);
    // the start of the body, which Express's own handler used to quote
    expect(bothStreams()).not.toContain("password=");
  });

  it("an oversized body stays a 413 and nothing of it is logged", async () => {
    const b = browser(server.base);
    const big = JSON.stringify({ label: SENTINEL + "x".repeat(20_000) });
    const res = await b.req("POST", "/api/rooms", undefined, { type: "application/json", data: big });
    expect(res.status).toBe(413);
    expect(res.body).toContain("<pre>Payload Too Large</pre>");
    await server.waitFor((e) => e.req === res.reqId && e.kind === "body_too_large");
    expect(bothStreams()).not.toContain(SENTINEL);
  });

  it("route parameters and query strings are never echoed into the logs", async () => {
    const b = browser(server.base);
    const res = await b.req("POST", `/api/rooms/${SENTINEL}/join?note=${SENTINEL}`);
    expect(res.status).toBe(404);
    const get = await b.req("GET", `/no/such/page/${SENTINEL}?q=${SENTINEL}`);
    expect(get.status).toBe(404);
    await new Promise((r) => setTimeout(r, 200)); // let any line those requests caused be written
    expect(bothStreams()).not.toContain(SENTINEL);
  });

  it("a malformed body on a non-API route is not parsed, and still not logged", async () => {
    const b = browser(server.base);
    const res = await b.req("POST", `/readme/?x=${SENTINEL}`, undefined, { type: "application/json", data: `{${SENTINEL}` });
    expect([404, 200]).toContain(res.status);
    expect(bothStreams()).not.toContain(SENTINEL);
  });

  it("nothing at all is written to stderr", () => {
    expect(server.stderr()).toBe("");
  });
});
