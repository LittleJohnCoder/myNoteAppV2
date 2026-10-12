import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./editor/editor.css";

import App from "./App";
import { startHeartbeatIfEnabled } from "./dev/heartbeat";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root container in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SPEC §10.6's dev-only heartbeat. Called at module scope, not in an effect: it must be live before
// React mounts, and it is idempotent (`startHeartbeatIfEnabled` guards its timer).
startHeartbeatIfEnabled();
