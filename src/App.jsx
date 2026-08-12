import { useEffect, useReducer, useRef } from "react";
import { Compass, ScrollText, SlidersHorizontal, Swords } from "lucide-react";

import { createBrowserRuntime } from "./application/browserRuntime.js";
import { tableModeForScene } from "./application/library.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { D20 } from "./ui/Glyphs.jsx";
import LibraryScreen from "./screens/LibraryScreen.jsx";
import HeroesScreen from "./screens/HeroesScreen.jsx";
import SceneScreen from "./screens/SceneScreen.jsx";
import TableScreen from "./screens/TableScreen.jsx";

const TABS = [
  { id: "home", label: "Library", icon: Compass },
  { id: "characters", label: "Heroes", icon: ScrollText },
  { id: "settings", label: "Scene", icon: SlidersHorizontal, requiresScene: true },
];

export function CommandDeck({ route, go, activeScene }) {
  const hasScene = Boolean(activeScene);
  return (
    <header className="deck">
      <button className="brand" onClick={() => go({ page: "home" })} title="Roll30">
        <span className="brand-mark"><D20 size={17} /></span>
        <span className="brand-type"><b>Roll30</b><span>NIGHTFORGE</span></span>
      </button>

      <nav className="deck-nav">
        {TABS.map(({ id, label, icon: Icon, requiresScene }) => {
          const disabled = Boolean(requiresScene && !hasScene);
          return (
            <button
              key={id}
              className={
                "deck-tab" + (route.page === id ? " on" : "") +
                (disabled ? " nf-state-disabled" : "")
              }
              onClick={() => go({ page: id })}
              disabled={disabled}
              title={disabled ? "Choose or Forge a Scene from Library first" : undefined}
            >
              <Icon size={15} strokeWidth={2} /> {label}
            </button>
          );
        })}
      </nav>

      <div className="deck-tail">
        <button
          className={"btn btn-key btn-sm" + (!hasScene ? " nf-state-disabled" : "")}
          onClick={() => go({ page: "board", mode: tableModeForScene(activeScene) })}
          title={hasScene ? "Jump to the table" : "Choose or Forge a Scene first"}
          disabled={!hasScene}
        >
          <Swords size={14} strokeWidth={2.2} /> Enter the table
        </button>
      </div>
    </header>
  );
}

export default function App({ browser = window, runtimeFactory = createBrowserRuntime }) {
  const [state, dispatch] = useReducer(applicationReducer, undefined, createInitialApplicationState);
  const runtimeRef = useRef(null);
  if (!runtimeRef.current) runtimeRef.current = runtimeFactory(browser, dispatch);
  const runtime = runtimeRef.current;

  useEffect(() => {
    runtime.commands.initialize();
  }, [runtime]);

  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId) || null;
  const go = (route) => runtime.commands.navigate(route, state.activeSceneId);
  const openScene = (scene, page) =>
    runtime.commands.openScene(
      scene.id,
      page === "board" ? { page: "board", mode: tableModeForScene(scene) } : { page },
    );
  const forgeScene = (input) =>
    runtime.commands.forgeScene(input, {
      page: "board",
      mode: tableModeForScene(input),
    });

  if (state.route.page === "board") {
    return (
      <TableScreen
        scene={activeScene}
        mode={state.route.mode || tableModeForScene(activeScene)}
        go={go}
        setMode={(mode) => go({ page: "board", mode })}
      />
    );
  }

  let screen;
  if (state.route.page === "characters") screen = <HeroesScreen go={go} />;
  else if (state.route.page === "settings") screen = <SceneScreen scene={activeScene} go={go} />;
  else {
    screen = (
      <LibraryScreen
        scenes={state.scenes}
        lifecycle={state.lifecycle}
        persistence={state.persistence}
        artworkRepository={runtime.artworkRepository}
        go={go}
        onForge={forgeScene}
        onOpen={(scene) => openScene(scene, "board")}
        onSettings={(scene) => openScene(scene, "settings")}
        onDelete={(scene) => runtime.commands.removeScene(scene.id)}
      />
    );
  }

  return (
    <div className="app">
      <CommandDeck route={state.route} go={go} activeScene={activeScene} />
      <main className="viewport" key={state.route.page}>{screen}</main>
    </div>
  );
}

