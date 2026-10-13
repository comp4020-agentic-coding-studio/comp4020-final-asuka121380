import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installKeyboard } from "./keyboard.ts";
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
void start(local ? localTransport() : roomTransport(roomId));
installKeyboard();
// `?debug` lets the browser tests read the state, the computed preview and
// the snapped camera quadrant; none of these can change anything
if (new URLSearchParams(location.search).has("debug")) {
  Object.assign(window, { __state: getState, __preview: () => preview(getState()), __quadrant: viewQuadrant });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
