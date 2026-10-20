import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "../ui/theme.css";
import "./lobby.css";
import { IdentityGate } from "../IdentityGate.tsx";
import { LobbyApp } from "./LobbyApp.tsx";

// Nothing in the lobby asks the server anything about "me" until this
// browser's identity exists (state/identity.ts).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IdentityGate>
      <LobbyApp />
    </IdentityGate>
  </StrictMode>,
);
