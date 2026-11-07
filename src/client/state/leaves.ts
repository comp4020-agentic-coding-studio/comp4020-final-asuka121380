import { useSyncExternalStore } from "react";

// "Hide leaves" (ADR 0016): this viewer's own view setting, in scenes that
// offer it. It hides only the canopy's foliage. It is never sent anywhere,
// never stored, never changes a rule, and never changes what anyone else
// sees. A page load starts with the leaves shown.

let hidden = false;
const listeners = new Set<() => void>();

export const leavesHidden = (): boolean => hidden;

export function setLeavesHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  for (const l of listeners) l();
}

export function useLeavesHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden,
  );
}
