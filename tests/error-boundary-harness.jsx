import React from "react";
import { createRoot } from "react-dom/client";

import ApplicationErrorBoundary from "../src/ui/ApplicationErrorBoundary.jsx";
import "../src/styles/core.css";
import "../src/styles/shell.css";
import "../src/styles/library.css";
import "../src/styles/heroes.css";
import "../src/styles/scene.css";
import "../src/styles/table.css";
import "../src/styles/functional-states.css";

function ThrowingChild() {
  throw new Error("Intentional browser-test render failure");
}

createRoot(document.getElementById("root")).render(
  <ApplicationErrorBoundary onReload={() => { document.body.dataset.recoveryInvoked = "true"; }}>
    <ThrowingChild />
  </ApplicationErrorBoundary>,
);
