import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installKeyboard } from "./keyboard.ts";
import { getState, start } from "./state/store.ts";
import { httpTransport, localTransport } from "./state/transport.ts";
import "./styles.css";

// `?local` runs the rules in the browser with nothing saved: the visual
// preview. `?local&reference` starts it with the reference house built.
const local = new URLSearchParams(location.search).has("local");
void start(local ? localTransport() : httpTransport);
installKeyboard();
// `?debug` lets the browser tests read the state; it can't change anything
if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { __state: getState });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
