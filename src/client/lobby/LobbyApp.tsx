import { useEffect, useState } from "react";
import { sceneInfo } from "../scenes/registry.ts";
import { STREET_SCENE as scene } from "../../domain/scene.ts";
import { AccountPage } from "./Account.tsx";
import { CollectionPage, ShowcasePage, SnapshotViewerPage } from "./Collection.tsx";
import { FriendLink, Friends, IdentityPanel, Invites, JoinByCode, MyRooms, PublicRooms, StartChoices } from "./parts.tsx";
import { headingBeamScene } from "../ui/brickScenes.ts";
import { PageHead, PageShell } from "./Shell.tsx";
import { resetIdentity } from "../state/identity.ts";
import { onIdentityChangedElsewhere } from "../state/session-events.ts";
import { whoAmI } from "../state/api.ts";

// The room lobby (ADR 0007), at /build/, and the dedicated pages beside it
// (ADR 0014): account, collection, showcase, a saved version, a friend link.
// Every page here is a direct URL that works on its own: a visitor never has
// to go through the homepage's table first. The forms and lists are the same
// components the table's panels use (parts.tsx), so there is one version of
// each, with one set of rules behind it.

const info = sceneInfo(scene.id);

export function LobbyApp() {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const refreshWho = () =>
    void whoAmI().then((r) => {
      setSelfId(r.visitorId);
      setAccountName(r.account?.displayName ?? null);
    });
  useEffect(refreshWho, []);
  // a sign-out or account switch completed in another tab: refresh who
  // this tab is now, so a stale "Sign in" / display name never lingers
  useEffect(
    () =>
      onIdentityChangedElsewhere(() => {
        resetIdentity();
        refreshWho();
      }),
    [],
  );

  const goTo = (roomId: string) => {
    // the browser test harness's ?debug flag carries through into the editor
    const debug = new URLSearchParams(location.search).has("debug") ? "?debug" : "";
    location.href = `/build/room/${roomId}${debug}`;
  };

  // No router: /build/ itself is the lobby, and a few query params pick one
  // of a handful of pages (ADR 0009) without a new route tree.
  const params = new URLSearchParams(location.search);
  const snapshotId = params.get("snapshot");
  const showcaseId = params.get("showcase");
  const view = params.get("view");
  const friendToken = params.get("friend");
  const accountLabel = accountName ? `Signed in as ${accountName}` : "Guest — sign in";

  if (friendToken)
    return (
      <PageShell accountLabel={accountLabel}>
        <main className="lobby-grid page-narrow">
          <FriendLink token={friendToken} />
          <p>
            <a href="/build/#friends">Your friends and invitations</a>
          </p>
        </main>
      </PageShell>
    );
  if (snapshotId)
    return (
      <PageShell section="collection" accountLabel={accountLabel} wide>
        <SnapshotViewerPage id={snapshotId} selfId={selfId} />
      </PageShell>
    );
  if (showcaseId)
    return (
      <PageShell section="showcase" accountLabel={accountLabel} wide>
        <SnapshotViewerPage id={showcaseId} published selfId={selfId} />
      </PageShell>
    );
  if (view === "collection")
    return (
      <PageShell section="collection" accountLabel={accountLabel} wide>
        <CollectionPage selfId={selfId} />
      </PageShell>
    );
  if (view === "showcase")
    return (
      <PageShell section="showcase" accountLabel={accountLabel} wide>
        <ShowcasePage selfId={selfId} />
      </PageShell>
    );
  if (view === "account")
    return (
      <PageShell section="account" accountLabel={accountLabel}>
        <main className="lobby-grid page-narrow">
          <PageHead title="Your account" />
          <AccountPage onAccountChange={(a) => setAccountName(a?.displayName ?? null)} />
          <p className="lobby-hint">
            Using another device as a guest? The <a href="/build/">rooms page</a> has "Identity and another device".
          </p>
        </main>
      </PageShell>
    );

  return (
    <PageShell section="lobby" accountLabel={accountLabel}>
      <div className="lobby-page">
        <PageHead title={`${info?.title ?? scene.id}: choose a room`}>
          <p className="lobby-hint">
            Up to {scene.maxPlayers} people share one room's inventory and construction. Plans and marks let you suggest ideas
            without spending anyone's stock.
          </p>
          <p className="lobby-hint lobby-status">{accountName ? `Signed in as ${accountName}` : "Guest — no account needed to build"}</p>
        </PageHead>
        <section className="lobby-start">
          <StartChoices onOpen={goTo} onCreated={goTo} />
          <Invites onJoined={goTo} selfId={selfId} />
          <MyRooms onOpen={goTo} />
        </section>
        <section className="lobby-discover">
          <h2 className="lobby-section-head">
            <span className="lobby-section-beam" dangerouslySetInnerHTML={{ __html: headingBeamScene() }} />
            Find a room
          </h2>
          <PublicRooms onJoined={goTo} grid />
          <div className="lobby-discover-side">
            <JoinByCode onJoined={goTo} />
            <Friends selfId={selfId} />
            <IdentityPanel accountName={accountName} />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
