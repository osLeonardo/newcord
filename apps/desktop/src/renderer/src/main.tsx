import "./assets/main.css";

import { APP_NAME } from "@newcord/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

document.title = APP_NAME;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
