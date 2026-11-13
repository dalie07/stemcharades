import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { WakeGate } from "./WakeGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WakeGate>
      <App />
    </WakeGate>
  </StrictMode>,
);
