import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installKeyboard } from "./keyboard.ts";
import { PreJoinGate } from "./PreJoin.tsx";
import { getState, preview, setRoomId, start } from "./state/store.ts";
import { viewQuadrant } from "./state/view.ts";
import { localTransport, roomTransport } from "./state/transport.ts";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./ui/theme.css";
import "./styles.css";

// `?local` runs the rules in the browser with nothing saved: the visual
// preview. `?local&reference` starts it with the reference house built.
const local = new URLSearchParams(location.search).has("local");
// /build/room/:id (ADR 0007). A bare /build/room/ (no id) falls back to the
// visitor's own default solo room, the same one C8's /build/ always opened.
const roomMatch = location.pathname.match(/^\/build\/room\/([^/]+)\/?$/);
const roomId = roomMatch?.[1];
setRoomId(roomId ?? null);

function proceed(): void {
  void start(local ? localTransport() : roomTransport(roomId));
  installKeyboard();
  // `?debug` lets the browser tests read the state, the computed preview and
  // the snapped camera quadrant; none of these can change anything
  if (new URLSearchParams(location.search).has("debug")) {
    Object.assign(window, { __state: getState, __preview: () => preview(getState()), __quadrant: viewQuadrant });
  }
}

/**
 * Gates a first-time room link behind an explicit pre-join confirmation
 * (the brief, section 3): a direct `/build/room/:id` visit shows room
 * name, scene, capacity, visibility and the publication setting, and
 * requires an explicit click before the real transport (which performs
 * the actual, server-checked join) ever starts. A returning/admitted
 * player, the solo default-room path, and `?local` all skip this — there
 * is nothing to confirm the first time for any of those.
 */
function Root() {
  const [confirmed, setConfirmed] = useState(!roomId || local);
  if (!confirmed) return <PreJoinGate roomId={roomId!} onProceed={() => { proceed(); setConfirmed(true); }} />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
