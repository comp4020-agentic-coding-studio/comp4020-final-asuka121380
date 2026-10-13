import { describe, expect, inject, it } from "vitest";

// ADR 0006: an opt-in, single-use recovery code links a second browser to the
// same identity without signing the first one out. ADR 0007: friendship
// requires acceptance (a link never silently grants it) and never by itself
// admits someone to an invite-only room.

const baseUrl = inject("baseUrl");

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { cookie: cookie! };
}

describe("identity recovery", () => {
  it("links a second browser to the same visitor without signing the first one out", async () => {
    const a = await freshVisitor();
    const codeRes = await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: a.cookie } });
    const { code } = (await codeRes.json()) as { code: string };
    expect(code).toBeTruthy();

    const recoverRes = await fetch(new URL("/api/identity/recover", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(recoverRes.status).toBe(200);
    const bCookie = recoverRes.headers.get("set-cookie")?.split(";")[0]!;

    // both cookies now resolve to builds with the same buildId (same visitor)
    const aBuild = await (await fetch(new URL("/api/build", baseUrl), { headers: { cookie: a.cookie } })).json();
    const bBuild = await (await fetch(new URL("/api/build", baseUrl), { headers: { cookie: bCookie } })).json();
    expect(bBuild.buildId).toBe(aBuild.buildId);

    // a's original cookie still works — recovering never signs it out
    const aAgain = await fetch(new URL("/api/build", baseUrl), { headers: { cookie: a.cookie } });
    expect(aAgain.status).toBe(200);
  });

  it("a code is single-use: redeeming it twice fails the second time", async () => {
    const a = await freshVisitor();
    const { code } = await (await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();

    const first = await fetch(new URL("/api/identity/recover", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(new URL("/api/identity/recover", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(second.status).toBe(400);
  });

  it("never returns the code itself from the server response's observable shape beyond the one generation call", async () => {
    // a weak but cheap regression guard: the recovery-code endpoint's body is
    // the only place a code should ever appear in a server response
    const a = await freshVisitor();
    const res = await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: a.cookie } });
    const { code } = await res.json();
    const build = await fetch(new URL("/api/build", baseUrl), { headers: { cookie: a.cookie } });
    const text = await build.text();
    expect(text.includes(code)).toBe(false);
  });
});

describe("friendship", () => {
  it("a direct request requires acceptance before either side is friends", async () => {
    const a = await freshVisitor();
    const b = await freshVisitor();

    // discover each other's visitor id the way the app does: via a shared room's member list
    const room = await (
      await fetch(new URL("/api/rooms", baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public", allowPublish: true }),
      })
    ).json();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    const afterJoin = await (await fetch(new URL(`/api/rooms/${room.roomId}`, baseUrl), { headers: { cookie: a.cookie } })).json();
    const bId = afterJoin.members.find((m: any) => m.visitorId !== afterJoin.hostId).visitorId;

    const reqRes = await fetch(new URL("/api/friends/requests", baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ to: bId }),
    });
    const { requestId } = await reqRes.json();

    // not friends yet
    const beforeFriends = await (await fetch(new URL("/api/friends", baseUrl), { headers: { cookie: a.cookie } })).json();
    expect(beforeFriends.friends).not.toContain(bId);

    const accept = await fetch(new URL(`/api/friends/requests/${requestId}/respond`, baseUrl), {
      method: "POST",
      headers: { cookie: b.cookie, "content-type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });
    expect(accept.status).toBe(200);

    const afterFriends = await (await fetch(new URL("/api/friends", baseUrl), { headers: { cookie: a.cookie } })).json();
    expect(afterFriends.friends).toContain(bId);
  });

  it("opening a friend link never silently establishes friendship", async () => {
    const a = await freshVisitor();
    const { token } = await (await fetch(new URL("/api/friends/link", baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();

    const b = await freshVisitor();
    const open = await fetch(new URL(`/api/friends/link/${token}`, baseUrl), { headers: { cookie: b.cookie } });
    expect(open.status).toBe(200);

    const friends = await (await fetch(new URL("/api/friends", baseUrl), { headers: { cookie: b.cookie } })).json();
    expect(friends.friends).toHaveLength(0); // viewing the link is not accepting it
  });

  it("friendship alone never admits someone to an invite-only room", async () => {
    const a = await freshVisitor();
    const b = await freshVisitor();
    // make them friends via a link + accept
    const { token } = await (await fetch(new URL("/api/friends/link", baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();
    const opened = await (await fetch(new URL(`/api/friends/link/${token}`, baseUrl), { headers: { cookie: b.cookie } })).json();
    await fetch(new URL(`/api/friends/requests/${opened.requestId}/respond`, baseUrl), {
      method: "POST",
      headers: { cookie: b.cookie, "content-type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });

    const room = await (
      await fetch(new URL("/api/rooms", baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
      })
    ).json();

    // b is now a's friend, but was never invited to this specific room
    const join = await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    expect(join.status).toBe(403);
  });
});
