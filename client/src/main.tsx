import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WakeGate } from "./components/WakeGate";
import "./index.css";
import "./lib/install"; // catch the browser's install offer as early as possible
import { applyTheme, useSettings } from "./state/settings";

// Before the first paint, so a player who chose the whiteboard never sees a flash of chalkboard.
applyTheme(useSettings.getState().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <WakeGate>
        <App />
      </WakeGate>
    </ErrorBoundary>
  </StrictMode>,
);
