import type { PlacedPart, Placement, RejectionCode } from "./rules.ts";

// The one path for durable changes: the client sends a command, the server
// validates it and commits it in a single transaction, then answers with the
// authoritative snapshot. Nothing else writes to a build.

export type Command =
  | { type: "place"; placement: Placement }
  | { type: "remove"; placedId: string }
  | { type: "recolour"; placedId: string; colour: string };

export interface CommandEnvelope {
  /** Client-generated and stable across retries, so a retry never runs twice. */
  commandId: string;
  /** The revision the client last saw; a mismatch is refused, not merged. */
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
}

export type CommandResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; code: RejectionCode | "revision_conflict" | "bad_request"; message: string; snapshot?: Snapshot };
