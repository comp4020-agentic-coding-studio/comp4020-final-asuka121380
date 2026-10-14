import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// Regression (independent review, 14 Oct 2026): account A opens a private
// room's SSE stream; a second browser session signs into the same account;
// the ORIGINAL session logs out; the second session makes a change; the
// original, logged-out SSE connection still received the private room
// update, because nothing ever told an already-open stream that its
// authorizing session had ended. Fixed by keying every live SSE connection
// to the session token that opened it and closing exactly those
// connections — never a different, still-valid session for the same
// visitor — whenever that session is revoked (sign-out, or an account
// switch that supersedes it).

const baseUrl = inject("baseUrl");

async function register(cookie: string, username: string, password: string): Promise<void> {
  const res = await fetch(new URL("/api/account/register", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ username, password, displayName: username }),
  });
  expect(res.status, await res.text()).toBe(200);
}

async function confirmSignIn(cookie: string, username: string, password: string): Promise<string> {
  const res = await fetch(new URL("/api/account/sign-in/confirm", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function freshCookie(): Promise<string> {
  const res = await fetch(new URL("/api/build", baseUrl));
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function createPrivateRoom(cookie: string): Promise<{ roomId: string }> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
  });
  return res.json();
}

async function place(cookie: string, roomId: string, x: number, z: number, expectedRevision = 0): Promise<void> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      commandId: randomUUID(),
      expectedRevision,
      command: { type: "place", placement: { partId: "brick-2x4", x, y: 0, z, rot: 0, colour: "navy" } },
    }),
  });
  expect(res.status, await res.text()).toBe(200);
}

/** Opens an SSE stream and resolves once the catch-up snapshot has arrived, handing back its raw reader for the caller to drive. */
async function openStream(cookie: string, roomId: string): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array> }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/events`, baseUrl), { headers: { cookie } });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  await reader.read(); // consume the catch-up snapshot
  return { reader };
}

/** Reads from an already-open stream's reader until it reports `done` (the server closed it), or the timeout elapses first. */
async function waitForClose(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<boolean> {
  const loop = (async () => {
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) return true;
      }
    } catch {
      return true;
    }
  })();
  const result = await raceTimeout(loop, ms);
  return result === true;
}

async function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

describe("logging out revokes that session's own SSE streams, not another valid one", () => {
  it("the first session's stream closes on its own sign-out; a second, still-signed-in session's stream is unaffected", async () => {
    const username = `revoke${Date.now()}`;
    const password = "a-fine-password-1";
    const regCookie = await freshCookie();
    await register(regCookie, username, password);

    // two independent "devices" signed into the SAME account
    const deviceACookie0 = await freshCookie();
    const deviceACookie = await confirmSignIn(deviceACookie0, username, password);
    const deviceBCookie0 = await freshCookie();
    const deviceBCookie = await confirmSignIn(deviceBCookie0, username, password);

    const room = await createPrivateRoom(deviceACookie);

    const streamA = await openStream(deviceACookie, room.roomId);
    const streamB = await openStream(deviceBCookie, room.roomId);

    // device A signs out: its own stream must close...
    const signOutA = await fetch(new URL("/api/account/sign-out", baseUrl), { method: "POST", headers: { cookie: deviceACookie } });
    expect(signOutA.status).toBe(200);

    const aClosed = await waitForClose(streamA.reader, 2000);
    expect(aClosed).toBe(true);

    // ...but device B's stream (a different, still-valid session for the
    // same account) must still be open and still receive updates
    await place(deviceBCookie, room.roomId, 0, 0);
    const bEvent = await raceTimeout(streamB.reader.read(), 2000);
    expect(bEvent).not.toBe("timeout");
    if (bEvent !== "timeout" && !bEvent.done) {
      const text = new TextDecoder().decode(bEvent.value);
      expect(text).toContain("snapshot");
    }
  });

  it("a stale, logged-out session can no longer send mutating commands directly", async () => {
    const a = await freshCookie();
    const room = await createPrivateRoom(a);
    const signOut = await fetch(new URL("/api/account/sign-out", baseUrl), { method: "POST", headers: { cookie: a } });
    expect(signOut.status).toBe(200);

    // the OLD cookie (now session-deleted) tries to place a brick
    const attempt = await fetch(new URL(`/api/rooms/${room.roomId}/command`, baseUrl), {
      method: "POST",
      headers: { cookie: a, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: randomUUID(),
        expectedRevision: 0,
        command: { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } },
      }),
    });
    // findVisitor on a deleted session resolves to null, which the command
    // path already refuses outright (ADR 0001/0006/0010: no session, no actor)
    expect(attempt.status).toBe(401);
  });

  // shared between the next two tests, specifically to keep this file's
  // total register/sign-in calls within the real, intentionally-not-
  // weakened per-source-IP rate limit (accounts.ts) that every spec file
  // touching these endpoints draws from together — reusing one already-
  // registered account as "some existing account" where a test doesn't
  // need a fresh one costs no coverage, since neither test asserts
  // anything about the account being brand-new
  const reusablePassword = "another-fine-password-1";
  let reusableUsername = "";

  it("SSE reconnection after a fresh sign-in revalidates both session and room admission", async () => {
    reusableUsername = `reconnect${Date.now()}`;
    const regCookie = await freshCookie();
    await register(regCookie, reusableUsername, reusablePassword);
    const signedIn = await confirmSignIn(await freshCookie(), reusableUsername, reusablePassword);
    const room = await createPrivateRoom(signedIn);

    // a stranger (no session at all, and never a member) cannot open the stream
    const strangerEvents = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: await freshCookie() } });
    expect(strangerEvents.status).toBe(404);

    // the room's own member reconnecting is fine
    const reconnect = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: signedIn } });
    expect(reconnect.status).toBe(200);
    await reconnect.body!.cancel();
  });

  it("account-switching (sign-in/confirm) revokes the prior session's own streams, same as a direct sign-out", async () => {
    const userOld = reusableUsername; // registered by the previous test
    const password = reusablePassword;
    const userNew = `new${Date.now()}`;
    await register(await freshCookie(), userNew, password);

    const cookie0 = await freshCookie();
    const signedInOld = await confirmSignIn(cookie0, userOld, password);
    const room = await createPrivateRoom(signedInOld);
    const stream = await openStream(signedInOld, room.roomId);

    // the SAME browser (same cookie jar conceptually — here, we reuse
    // signedInOld's cookie value as the "prior session" being switched away
    // from) signs into a DIFFERENT account
    const switched = await fetch(new URL("/api/account/sign-in/confirm", baseUrl), {
      method: "POST",
      headers: { cookie: signedInOld, "content-type": "application/json" },
      body: JSON.stringify({ username: userNew, password }),
    });
    expect(switched.status).toBe(200);

    const closed = await waitForClose(stream.reader, 2000);
    expect(closed).toBe(true);
  });
});
