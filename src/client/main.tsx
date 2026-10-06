import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installKeyboard } from "./keyboard.ts";
import { getState, preview, start } from "./state/store.ts";
import { viewQuadrant } from "./state/view.ts";
import { httpTransport, localTransport } from "./state/transport.ts";
import "./styles.css";

// `?local` runs the rules in the browser with nothing saved: the visual
// preview. `?local&reference` starts it with the reference house built.
const local = new URLSearchParams(location.search).has("local");
void start(local ? localTransport() : httpTransport);
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
