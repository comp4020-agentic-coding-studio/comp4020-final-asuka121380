import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { captureLogs, classifyError, commandRef, describeError, emit, format, known, label, safeId, type Fields } from "../../src/server/log.ts";

// ADR 0013: log lines are built from an allowlist of fields, each validated
// for its kind. These check the builder itself, without a server.

const SECRET = "SENTINEL-log-format-9f3c";
const at = new Date("2026-10-20T00:00:00.000Z");
const parse = (fields: Fields) => JSON.parse(format(fields, at)) as Record<string, unknown>;

describe("log line format", () => {
  it("writes only allowlisted keys, in a fixed order, after the time", () => {
    const line = format({ event: "room.join", outcome: "changed", actor: "1234abcd", room: "8b1e1c0e-1111-4222-8333-944445555666" }, at);
    expect(line).toBe('{"t":"2026-10-20T00:00:00.000Z","event":"room.join","outcome":"changed","actor":"1234abcd","room":"8b1e1c0e-1111-4222-8333-944445555666"}');
  });

  it("drops keys that aren't in the allowlist, whatever they're called", () => {
    const sneaky = { event: "x", password: SECRET, cookie: SECRET, body: { a: SECRET }, headers: SECRET, message: SECRET, stack: SECRET } as unknown as Fields;
    const line = format(sneaky, at);
    expect(line).not.toContain(SECRET);
    expect(Object.keys(JSON.parse(line))).toEqual(["t", "event"]);
  });

  it("rejects values that don't have their field's shape, so free text can't slip into a known field", () => {
    const line = format(
      {
        event: "command",
        reason: `bad reason ${SECRET}`,
        actor: SECRET,
        room: SECRET,
        target: `../${SECRET}`,
        part: `brick ${SECRET}`,
        at: SECRET,
        route: `/api/rooms?x=${SECRET}`,
        where: SECRET,
        error: `Error: ${SECRET}`,
        errcode: SECRET,
        cmd: SECRET,
      },
      at,
    );
    expect(line).not.toContain(SECRET);
    // a non-UUID id is replaced, not dropped, so the line still says something was there
    expect(JSON.parse(line).room).toBe("unrecognised");
    expect(JSON.parse(line).target).toBe("unrecognised");
  });

  it("an event name outside the naming scheme is logged as 'unknown'", () => {
    expect(parse({ event: `room.join ${SECRET}` }).event).toBe("unknown");
  });

  it("labels only server-resolved visitor UUIDs, as their first 8 hex characters", () => {
    expect(label("8B1E1C0E-1111-4222-8333-944445555666")).toBe("8b1e1c0e");
    expect(label(SECRET)).toBeUndefined();
    expect(label(null)).toBeUndefined();
  });

  it("keeps a UUID whole, replaces anything else", () => {
    expect(safeId("8b1e1c0e-1111-4222-8333-944445555666")).toBe("8b1e1c0e-1111-4222-8333-944445555666");
    expect(safeId(SECRET)).toBe("unrecognised");
    expect(safeId(undefined)).toBeUndefined();
  });

  it("correlates a non-UUID command id by hash, never by its text, and the same id always gives the same value", () => {
    expect(commandRef("8b1e1c0e-1111-4222-8333-944445555666")).toBe("8b1e1c0e-1111-4222-8333-944445555666");
    const h = commandRef(SECRET)!;
    expect(h).toMatch(/^h-[0-9a-f]{16}$/);
    expect(h).not.toContain(SECRET);
    expect(commandRef(SECRET)).toBe(h);
    expect(commandRef(`${SECRET}-2`)).not.toBe(h);
    expect(parse({ event: "command", cmd: h }).cmd).toBe(h);
  });

  it("maps client-chosen names outside a known set to 'unrecognised'", () => {
    const types = new Set(["place"]);
    expect(known("place", types)).toBe("place");
    expect(known(SECRET, types)).toBe("unrecognised");
  });

  it("a failing sink never throws into the caller", () => {
    const restore = captureLogs({ push: () => { throw new Error("disk full"); } } as unknown as string[]);
    try {
      expect(() => emit({ event: "x" })).not.toThrow();
    } finally {
      restore();
    }
  });
});

describe("error classification and description", () => {
  it("keeps body-parser's statuses: malformed 400, too large 413", () => {
    expect(classifyError({ type: "entity.parse.failed", status: 400, message: SECRET })).toEqual({ status: 400, kind: "malformed_json" });
    expect(classifyError({ type: "entity.too.large", status: 413 })).toEqual({ status: 413, kind: "body_too_large" });
    expect(classifyError(new Error(SECRET))).toEqual({ status: 500, kind: "internal" });
    expect(classifyError(SECRET)).toEqual({ status: 500, kind: "internal" });
  });

  it("describes an unexpected error by class, code and this app's own frames, never by its message", () => {
    const err = new TypeError(`cannot read ${SECRET}`);
    (err as { code?: string }).code = "ERR_SOMETHING";
    const described = describeError(err);
    expect(described.error).toBe("TypeError");
    expect(described.errcode).toBe("ERR_SOMETHING");
    expect(described.where ?? "").toMatch(/^spec\/|^src\/|^$/);
    const line = format({ event: "http.error", ...described }, at);
    expect(line).not.toContain(SECRET);
  });

  it("drops a stack whose frames have been tampered with to carry text", () => {
    const err = new Error("x");
    err.stack = `Error: ${SECRET}\n    at ${SECRET} (${process.cwd()}/src/server/${SECRET}.ts:1:1)\n    at ${pathToFileURL(`${process.cwd()}/src/server/index.ts`).href}:12:3`;
    const described = describeError(err);
    expect(JSON.stringify(described)).not.toContain(SECRET);
    expect(described.where).toBe("src/server/index.ts:12");
  });
});
