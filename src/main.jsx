import { createRoot } from "react-dom/client";

import "./styles/core.css";
import "./styles/shell.css";
import "./styles/library.css";
import "./styles/heroes.css";
import "./styles/scene.css";
import "./styles/table.css";
import "./styles/functional-states.css";
import "./styles/library-states.css";
import "./styles/heroes-states.css";
import "./styles/table-states.css";
import "./styles/ai-assistant.css";
import "./styles/compendium.css";

import App from "./App.jsx";
import ApplicationErrorBoundary from "./ui/ApplicationErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <ApplicationErrorBoundary>
    <App />
  </ApplicationErrorBoundary>,
);
