import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Compass, ScrollText, SlidersHorizontal, Swords } from "lucide-react";

import "./styles/core.css";
import "./styles/shell.css";
import "./styles/library.css";
import "./styles/heroes.css";
import "./styles/scene.css";
import "./styles/table.css";

import { D20 } from "./ui/Glyphs.jsx";
import LibraryScreen from "./screens/LibraryScreen.jsx";
import HeroesScreen from "./screens/HeroesScreen.jsx";
import SceneScreen from "./screens/SceneScreen.jsx";
import TableScreen from "./screens/TableScreen.jsx";

// Navigation is a single capsule in the command deck. The table is not a tab —
// it is a destination you drop into, so it keeps its own full-bleed chrome.
const TABS = [
  { id: "home", label: "Library", icon: Compass },
  { id: "characters", label: "Heroes", icon: ScrollText },
  { id: "settings", label: "Scene", icon: SlidersHorizontal },
];

function CommandDeck({ route, go }) {
  return (
    <header className="deck">
      <button className="brand" onClick={() => go({ page: "home" })} title="Roll30">
        <span className="brand-mark">
          <D20 size={17} />
        </span>
        <span className="brand-type">
          <b>Roll30</b>
          <span>NIGHTFORGE</span>
        </span>
      </button>

      <nav className="deck-nav">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={"deck-tab" + (route.page === id ? " on" : "")}
            onClick={() => go({ page: id })}
          >
            <Icon size={15} strokeWidth={2} />
            {label}
          </button>
        ))}
      </nav>

      <div className="deck-tail">
        <button
          className="btn btn-key btn-sm"
          onClick={() => go({ page: "board", mode: "battle" })}
          title="Jump to the table"
        >
          <Swords size={14} strokeWidth={2.2} /> Enter the table
        </button>
      </div>
    </header>
  );
}

function App() {
  const [route, setRoute] = useState({ page: "home" });
  const go = (next) => setRoute(next);

  // The table takes the whole window — no deck, no margins, just the map.
  if (route.page === "board") {
    return (
      <TableScreen
        mode={route.mode || "setup"}
        go={go}
        setMode={(mode) => go({ page: "board", mode })}
      />
    );
  }

  let screen;
  if (route.page === "characters") screen = <HeroesScreen go={go} />;
  else if (route.page === "settings") screen = <SceneScreen go={go} />;
  else screen = <LibraryScreen go={go} />;

  return (
    <div className="app">
      <CommandDeck route={route} go={go} />
      <main className="viewport" key={route.page}>
        {screen}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
