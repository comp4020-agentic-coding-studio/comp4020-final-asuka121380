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

describe("guest recovery cannot bypass a password-protected account (regression, 14 Oct 2026)", () => {
  async function register(cookie: string, username: string, password: string): Promise<void> {
    const res = await fetch(new URL("/api/account/register", baseUrl), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ username, password, displayName: username }),
    });
    expect(res.status, await res.text()).toBe(200);
  }

  // one registration shared by two of the three tests below — register()
  // itself signs in the registering cookie, so "a browser already signed in
  // to an account" (what both tests need) is exactly what this is, without
  // a second call against the real, intentionally-not-weakened per-source-
  // IP rate limit every spec file touching these endpoints shares
  let signedInVictim: { cookie: string } = { cookie: "" };

  it("refuses to GENERATE a recovery code for a visitor currently signed in to an account", async () => {
    signedInVictim = await freshVisitor();
    await register(signedInVictim.cookie, `vg${Date.now() % 1_000_000}`, "a-victim-password-1");

    const res = await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: signedInVictim.cookie } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("refuses to REDEEM a code that (even if generated earlier) now resolves to an account-linked visitor, so it can never grant account access with no password", async () => {
    const victim = await freshVisitor();
    // generate the code BEFORE registering, simulating a code that existed
    // first and the account was only linked afterward
    const codeRes = await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: victim.cookie } });
    const { code } = await codeRes.json();
    await register(victim.cookie, `vr${Date.now() % 1_000_000}`, "a-victim-password-2");

    const attacker = await freshVisitor();
    const res = await fetch(new URL("/api/identity/recover", baseUrl), {
      method: "POST",
      headers: { cookie: attacker.cookie, "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(400);
    const me = await (await fetch(new URL("/api/me", baseUrl), { headers: { cookie: attacker.cookie } })).json();
    expect(me.account).toBeNull(); // the attacker's browser never became the victim's account
  });

  it("refuses to redeem ANY code while the requesting browser is itself signed in to an account (no silent switch-away)", async () => {
    const guest = await freshVisitor();
    const codeRes = await fetch(new URL("/api/identity/recovery-code", baseUrl), { method: "POST", headers: { cookie: guest.cookie } });
    const { code } = await codeRes.json();

    // reuses the account the first test in this block already registered
    const before = await (await fetch(new URL("/api/me", baseUrl), { headers: { cookie: signedInVictim.cookie } })).json();
    expect(before.account).not.toBeNull();

    const res = await fetch(new URL("/api/identity/recover", baseUrl), {
      method: "POST",
      headers: { cookie: signedInVictim.cookie, "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(400);

    const after = await (await fetch(new URL("/api/me", baseUrl), { headers: { cookie: signedInVictim.cookie } })).json();
    expect(after.account?.id).toBe(before.account.id); // still the same account, never silently switched to the guest
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
