import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { start } from "./state/store.ts";
import { httpTransport, localTransport } from "./state/transport.ts";
import "./styles.css";

// `?local` runs the rules in the browser with nothing saved: the visual
// preview. `?local&reference` starts it with the reference house built.
const local = new URLSearchParams(location.search).has("local");
void start(local ? localTransport() : httpTransport);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
