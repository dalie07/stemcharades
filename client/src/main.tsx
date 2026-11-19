import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WakeGate } from "./components/WakeGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <WakeGate>
        <App />
      </WakeGate>
    </ErrorBoundary>
  </StrictMode>,
);
