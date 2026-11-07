import { useEffect, useState, type ReactNode } from "react";

// A scene's environment (and its light) loads lazily. The canvas draws
// nothing until it has arrived together with the plot and parts, so no
// unlit, black or half-built scene is ever shown (ADR 0016). Meanwhile a
// plain status line sits over the empty canvas, outside it in the DOM.

/** Inside the canvas's Suspense boundary: reports when everything in it has mounted. */
export function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

/** Wraps a canvas: shows "Loading the scene…" over it until `ready`. */
export function useSceneLoading(): { ready: boolean; markReady: () => void; notice: ReactNode } {
  const [ready, setReady] = useState(false);
  const [markReady] = useState(() => () => setReady(true));
  const notice = ready ? null : (
    <div className="scene-loading" role="status">
      <span className="chip">Loading the scene…</span>
    </div>
  );
  return { ready, markReady, notice };
}
