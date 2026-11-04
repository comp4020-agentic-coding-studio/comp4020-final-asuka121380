import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "../ui/theme.css";
import "../ui/kit.css";
import "./home.css";
import { HomeApp } from "./HomeApp.tsx";

// The homepage entry (ADR 0014). It imports no three.js itself: HomeApp loads
// the table scene lazily, once WebGL is known to be available.
createRoot(document.getElementById("home-root")!).render(
  <StrictMode>
    <HomeApp />
  </StrictMode>,
);
