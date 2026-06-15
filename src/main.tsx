import React from "react";
import { createRoot } from "react-dom/client";
import { injectSpeedInsights } from "@vercel/speed-insights";
import App from "./App";
import "./styles.css";

injectSpeedInsights();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
