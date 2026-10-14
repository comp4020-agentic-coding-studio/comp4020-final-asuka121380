import { useEffect, useState } from "react";
import { sceneInfo } from "./scenes/registry.ts";
import { STREET_SCENE as scene } from "../domain/scene.ts";
import { previewAdmission, type AdmissionPreview } from "./state/api.ts";

// Pre-join confirmation for a direct room URL (the brief: "a first-time
// join through a direct URL must show a pre-join screen before joining...
// show room name, scene, capacity, visibility, and whether members may
// publish saved works... require explicit confirmation to join"). This
// never joins by itself: it only reads `previewAdmission` (read-only,
// reserves nothing, exposes no build contents) and waits for an explicit
// click before the caller is allowed to actually start the room transport,
// which is what performs the real, server-checked join.
//
// A returning/already-admitted player (`alreadyMember`) skips straight
// past this — "existing admitted players should be able to reload/
// reconnect without unnecessary repeated confirmation."

type Status = { kind: "loading" } | { kind: "ready"; preview: AdmissionPreview } | { kind: "invalid" };

const info = sceneInfo(scene.id);

export function PreJoinGate({ roomId, onProceed }: { roomId: string; onProceed: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void previewAdmission(roomId).then((p) => {
      if (cancelled) return;
      if (!p) {
        setStatus({ kind: "invalid" });
        return;
      }
      if (p.alreadyMember) {
        onProceed(); // a returning player: no repeated confirmation
        return;
      }
      setStatus({ kind: "ready", preview: p });
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (status.kind === "loading") {
    return (
      <div className="access-screen">
        <div className="card access-card">
          <h1>Checking this room…</h1>
          <p>Loading its details before you join.</p>
        </div>
      </div>
    );
  }

  if (status.kind === "invalid") {
    return (
      <div className="access-screen">
        <div className="card access-card">
          <h1>This room isn't open to you</h1>
          <p>It's invite-only and you don't have an accepted invitation, doesn't exist, or the link is wrong.</p>
          <div className="context-actions">
            <a className="btn btn-red" href="/build/">
              Back to the room lobby
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { preview } = status;
  const confirm = () => {
    setConfirming(true);
    onProceed();
  };

  return (
    <div className="access-screen">
      <div className="card access-card">
        <h1>{preview.label || `Room ${preview.id.slice(0, 8)}`}</h1>
        <p className="lobby-hint">
          <strong>Scene:</strong> {info?.title ?? preview.sceneId}
          <br />
          <strong>Visibility:</strong> {preview.visibility === "public" ? "Public — anyone can join while there's room" : "Invite-only"}
          <br />
          <strong>Capacity:</strong> {preview.occupancy}/{preview.capacity} here now
          <br />
          <strong>Publishing:</strong>{" "}
          {preview.allowPublish
            ? "Members may publish a saved version of this room to the public showcase, keeping full contributor and source credit."
            : "This room doesn't allow publishing a saved version."}
        </p>
        {!preview.canJoin && (
          <p className="lobby-error">{preview.reason === "room_full" ? "This room is already full." : "You don't have standing to join this room."}</p>
        )}
        <div className="context-actions">
          <button className="btn btn-red" onClick={confirm} aria-disabled={confirming || !preview.canJoin}>
            {confirming ? "Joining…" : "Join this room"}
          </button>
          <a className="btn" href="/build/">
            Back to the room lobby
          </a>
        </div>
      </div>
    </div>
  );
}
