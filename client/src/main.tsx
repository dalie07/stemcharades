import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WakeGate } from "./components/WakeGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WakeGate>
      <App />
    </WakeGate>
  </StrictMode>,
);
