import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "../ui/theme.css";
import "./lobby.css";
import { LobbyApp } from "./LobbyApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LobbyApp />
  </StrictMode>,
);
