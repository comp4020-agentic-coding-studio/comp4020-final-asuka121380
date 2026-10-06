import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Command, CommandEnvelope, CommandResult, Snapshot } from "../domain/commands.ts";
import { rotatedPlacement, validateCommand, type BuildState, type PlacedPart } from "../domain/rules.ts";
import { STREET_SCENE } from "../domain/scene.ts";
import { transaction, type Db } from "./db.ts";

// The authoritative command path. Every durable change is: find the visitor's
// build, check the command against the shared rules, then write the part, the
// stock and the new revision in one transaction. The client's view of stock or
// validity is never trusted.

const scene = STREET_SCENE;
const now = (): string => new Date().toISOString();
const hash = (token: string): string => createHash("sha256").update(token).digest("hex");

export interface Visitor {
  id: string;
  /** Set only when a new visitor was created: the cookie value to hand back. */
  newToken?: string;
}

export function visitorFor(db: Db, token: string | undefined): Visitor {
  if (token) {
    const row = db.prepare("SELECT id FROM visitors WHERE token_hash = ?").get(hash(token)) as { id: string } | undefined;
    if (row) return { id: row.id };
  }
  const newToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  db.prepare("INSERT INTO visitors (id, token_hash, created_at) VALUES (?, ?, ?)").run(id, hash(newToken), now());
  return { id, newToken };
}

export function findVisitor(db: Db, token: string | undefined): string | null {
  if (!token) return null;
  const row = db.prepare("SELECT id FROM visitors WHERE token_hash = ?").get(hash(token)) as { id: string } | undefined;
  return row?.id ?? null;
}

interface BuildRow {
  id: string;
  scene_id: string;
  template_version: number;
  revision: number;
}

// Call inside a transaction: an older build is upgraded before anyone reads it.
function currentBuild(db: Db, visitorId: string): BuildRow | undefined {
  const build = db
    .prepare("SELECT id, scene_id, template_version, revision FROM builds WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(visitorId) as BuildRow | undefined;
  return build && upgrade(db, build);
}

/**
 * Brings a build saved under an older scene version up to the current one.
 * Versions only add part types (scene.additions), so this inserts the new
 * types' stock at full quantity and touches nothing already saved: no part,
 * no existing quantity, no revision. kit = held + placed still holds.
 */
export function upgrade(db: Db, build: BuildRow): BuildRow {
  if (build.template_version >= scene.version) return build;
  const add = db.prepare("INSERT OR IGNORE INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
  for (let v = build.template_version + 1; v <= scene.version; v++) {
    for (const [partId, quantity] of Object.entries(scene.additions[v] ?? {})) add.run(build.id, partId, quantity);
  }
  db.prepare("UPDATE builds SET template_version = ? WHERE id = ?").run(scene.version, build.id);
  return { ...build, template_version: scene.version };
}

function snapshotOf(db: Db, build: BuildRow): Snapshot {
  const parts = db
    .prepare("SELECT id, part_id, x, y, z, rot, colour FROM parts WHERE build_id = ? ORDER BY rowid")
    .all(build.id) as { id: string; part_id: string; x: number; y: number; z: number; rot: number; colour: string }[];
  const stock = db.prepare("SELECT part_id, quantity FROM inventory WHERE build_id = ?").all(build.id) as {
    part_id: string;
    quantity: number;
  }[];
  return {
    buildId: build.id,
    sceneId: build.scene_id,
    templateVersion: build.template_version,
    revision: build.revision,
    parts: parts.map(
      (p): PlacedPart => ({ id: p.id, partId: p.part_id, x: p.x, y: p.y, z: p.z, rot: p.rot as PlacedPart["rot"], colour: p.colour }),
    ),
    inventory: Object.fromEntries(stock.map((s) => [s.part_id, s.quantity])),
  };
}

/** The visitor's build, started with the whole kit on their first visit. Never replaces an existing one. */
export function buildFor(db: Db, visitorId: string): Snapshot {
  return transaction(db, () => {
    let build = currentBuild(db, visitorId);
    if (!build) {
      const id = randomUUID();
      const t = now();
      db.prepare(
        "INSERT INTO builds (id, visitor_id, scene_id, template_version, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      ).run(id, visitorId, scene.id, scene.version, t, t);
      const stock = db.prepare("INSERT INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
      for (const [partId, quantity] of Object.entries(scene.kit)) stock.run(id, partId, quantity);
      build = { id, scene_id: scene.id, template_version: scene.version, revision: 0 };
    }
    return snapshotOf(db, build);
  });
}

// ---- input checking --------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 100): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** The envelope's shape only; the rules decide whether it's allowed. */
export function parseEnvelope(body: unknown): CommandEnvelope | null {
  if (!isObj(body) || !isStr(body.commandId, 64) || !Number.isInteger(body.expectedRevision) || !isObj(body.command)) return null;
  const c = body.command;
  let command: Command;
  if (c.type === "place" && isObj(c.placement)) {
    const p = c.placement;
    if (!isStr(p.partId) || !isStr(p.colour) || ![p.x, p.y, p.z, p.rot].every((n) => typeof n === "number")) return null;
    command = {
      type: "place",
      placement: { partId: p.partId, colour: p.colour, x: p.x as number, y: p.y as number, z: p.z as number, rot: p.rot as 0 },
    };
  } else if (c.type === "remove" && isStr(c.placedId)) {
    command = { type: "remove", placedId: c.placedId };
  } else if (c.type === "recolour" && isStr(c.placedId) && isStr(c.colour)) {
    command = { type: "recolour", placedId: c.placedId, colour: c.colour };
  } else if (c.type === "rotate" && isStr(c.placedId) && typeof c.rot === "number") {
    command = { type: "rotate", placedId: c.placedId, rot: c.rot as 0 };
  } else {
    return null;
  }
  return { commandId: body.commandId, expectedRevision: body.expectedRevision as number, command };
}

// ---- the command path ------------------------------------------------------

export interface Outcome {
  result: CommandResult;
  buildId?: string;
  /** For the action log: what happened, without anything private. */
  outcome: "applied" | "duplicate" | "rejected" | "conflict" | "no-build";
}

export function runCommand(db: Db, visitorId: string, envelope: CommandEnvelope): Outcome {
  return transaction(db, (): Outcome => {
    const build = currentBuild(db, visitorId);
    if (!build) {
      return { outcome: "no-build", result: { ok: false, code: "not_found", message: "There's no build to change; reload the page." } };
    }

    // a retry of a command that already committed: report the current state, change nothing
    const seen = db.prepare("SELECT 1 FROM commands WHERE build_id = ? AND command_id = ?").get(build.id, envelope.commandId);
    if (seen) return { outcome: "duplicate", buildId: build.id, result: { ok: true, snapshot: snapshotOf(db, build) } };

    if (envelope.expectedRevision !== build.revision) {
      return {
        outcome: "conflict",
        buildId: build.id,
        result: { ok: false, code: "revision_conflict", message: "The build changed since you last saw it.", snapshot: snapshotOf(db, build) },
      };
    }

    const snapshot = snapshotOf(db, build);
    const state: BuildState = snapshot;
    const { command } = envelope;
    const rejection = validateCommand(scene, state, command);
    if (rejection) return { outcome: "rejected", buildId: build.id, result: { ok: false, ...rejection, snapshot } };

    const t = now();
    if (command.type === "place") {
      const p = command.placement;
      db.prepare(
        "INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(randomUUID(), build.id, p.partId, p.x, p.y, p.z, p.rot, p.colour, visitorId, t);
      db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE build_id = ? AND part_id = ?").run(build.id, p.partId);
    } else if (command.type === "remove") {
      const part = state.parts.find((p) => p.id === command.placedId)!;
      db.prepare("DELETE FROM parts WHERE id = ? AND build_id = ?").run(part.id, build.id);
      db.prepare("UPDATE inventory SET quantity = quantity + 1 WHERE build_id = ? AND part_id = ?").run(build.id, part.partId);
    } else if (command.type === "recolour") {
      db.prepare("UPDATE parts SET colour = ? WHERE id = ? AND build_id = ?").run(command.colour, command.placedId, build.id);
    } else {
      const turned = rotatedPlacement(state.parts.find((p) => p.id === command.placedId)!, command.rot);
      db.prepare("UPDATE parts SET x = ?, z = ?, rot = ? WHERE id = ? AND build_id = ?").run(turned.x, turned.z, turned.rot, turned.id, build.id);
    }
    const revision = build.revision + 1;
    db.prepare("UPDATE builds SET revision = ?, updated_at = ? WHERE id = ?").run(revision, t, build.id);
    db.prepare("INSERT INTO commands (build_id, command_id, type, revision, created_at) VALUES (?, ?, ?, ?, ?)").run(
      build.id,
      envelope.commandId,
      command.type,
      revision,
      t,
    );
    return { outcome: "applied", buildId: build.id, result: { ok: true, snapshot: snapshotOf(db, { ...build, revision }) } };
  });
}
