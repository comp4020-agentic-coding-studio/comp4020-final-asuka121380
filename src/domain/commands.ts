import type { Rotation } from "./grid.ts";
import type { PlacedPart, Plan, Placement, RejectionCode } from "./rules.ts";

// The one path for durable changes: the client sends a command, the server
// validates it and commits it in a single transaction, then answers with the
// authoritative snapshot. Nothing else writes to a build.
//
// ADR 0008: `place` is validated against live state only, never gated on a
// stale whole-room revision, because its correctness (collision, bounds,
// stock) is already a live check. `remove`/`recolour`/`rotate` may carry
// `expectedRev`, the targeted part's own `rev` as the client last saw it; a
// mismatch is a specific, part-level conflict, never a whole-room one. It is
// optional so an older client (or a solo build, where it can never fire) need
// not send it.

export type Command =
  | { type: "place"; placement: Placement }
  | { type: "remove"; placedId: string; expectedRev?: number }
  | { type: "recolour"; placedId: string; colour: string; expectedRev?: number }
  | { type: "rotate"; placedId: string; rot: Rotation; expectedRev?: number }
  | { type: "propose-plan"; plan: Placement }
  | { type: "withdraw-plan"; planId: string }
  | { type: "realize-plan"; planId: string };

export interface CommandEnvelope {
  /** Client-generated and stable across retries, so a retry never runs twice. */
  commandId: string;
  /**
   * The revision the client last saw. Kept for context and for the
   * "no-build" case; ADR 0008 no longer gates `place` on it, and edit
   * commands gate on `expectedRev` (above) instead when supplied.
   */
  expectedRevision: number;
  command: Command;
}

export interface Snapshot {
  buildId: string;
  sceneId: string;
  templateVersion: number;
  revision: number;
  parts: PlacedPart[];
  inventory: Record<string, number>;
  /** Transparent proposals: ADR 0009. Only `status: "open"` ones in the live view. */
  plans: Plan[];
  /** Everyone who has ever placed a real part here, independent of current presence. */
  contributors: Contributor[];
  /**
   * Credited because they contributed to a snapshot this room was continued
   * from, but never themselves a member or builder here unless they also
   * joined and built (in which case they also appear in `contributors`).
   * Kept distinct per the brief: never described as having joined this room.
   */
  inheritedCredits: Contributor[];
  /** Current room members, independent of who has ever contributed. */
  members: Member[];
  maxPlayers: number;
  roomId: string;
  visibility: "public" | "invite_only";
  allowPublish: boolean;
  hostId: string;
}

export interface Contributor {
  visitorId: string;
  firstContributionAt: string;
  /** True once they've placed/realized a real part; false for plan-only participants (ADR 0009). */
  hasBuilt: boolean;
}

export interface Member {
  visitorId: string;
  active: boolean;
  isHost: boolean;
}

export type CommandResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; code: RejectionCode | "revision_conflict" | "bad_request"; message: string; snapshot?: Snapshot };
