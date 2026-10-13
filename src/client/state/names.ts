import { useEffect, useState } from "react";
import { displayNamesFor } from "./api.ts";

// A small shared hook: given a set of visitor ids (room members, friends,
// contributors, attribution, credits — everywhere a list shows "who"), it
// resolves each to its account's display name where one exists. A visitor
// with no linked account has no name to show, so the caller's `who()`
// falls back to a short, anonymous label — never a raw UUID (the brief).

export function useDisplayNames(ids: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    void displayNamesFor(ids).then((r) => {
      if (!cancelled) setNames((prev) => ({ ...prev, ...r }));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}

/** "You" for the viewer's own id, their display name if one is known, else a short anonymous label — never a raw UUID in full. */
export function who(id: string | undefined, selfId: string | null, names: Record<string, string>): string | null {
  if (!id) return null;
  if (id === selfId) return "you";
  return names[id] ?? `a guest builder (${id.slice(0, 8)})`;
}
