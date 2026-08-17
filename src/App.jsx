import { useEffect, useReducer, useRef } from "react";
import { Compass, ScrollText, SlidersHorizontal, Swords } from "lucide-react";

import { createBrowserRuntime } from "./application/browserRuntime.js";
import { tableModeForScene } from "./application/library.js";
import { applicationReducer, createInitialApplicationState } from "./application/state.js";
import { STORAGE_KEYS } from "./storage/constants.js";
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
              onClick={() =>
                go(id === "settings" ? { page: id, returnTo: { page: "home" } } : { page: id })
              }
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
  const workbenchFlushRef = useRef(null);
  const heroFlushRef = useRef(null);
  const revisionRef = useRef(state.persistence.revision);
  revisionRef.current = state.persistence.revision;

  const recordRevision = (result) => {
    if (result?.ok && Number.isSafeInteger(result.revision)) {
      revisionRef.current = result.revision;
    }
    return result;
  };

  const trackRevision = (operation) => {
    const result = operation();
    return result && typeof result.then === "function"
      ? result.then(recordRevision)
      : recordRevision(result);
  };

  const updateScene = (id, patch) => trackRevision(() =>
    runtime.commands.updateScene(id, patch, revisionRef.current));
  const updateHero = (id, patch) => trackRevision(() =>
    runtime.commands.updateHero(id, patch, revisionRef.current));

  useEffect(() => {
    runtime.commands.initialize();
  }, [runtime]);

  useEffect(() => {
    if (typeof browser.addEventListener !== "function") return undefined;
    const synchronize = (event) => {
      if (event?.key === STORAGE_KEYS.state) recordRevision(runtime.commands.synchronize());
    };
    browser.addEventListener("storage", synchronize);
    return () => browser.removeEventListener?.("storage", synchronize);
  }, [browser, runtime]);

  useEffect(() => {
    if (typeof browser.addEventListener !== "function") return undefined;
    const flushActiveDraft = () => {
      if (state.route.page === "settings") workbenchFlushRef.current?.();
      if (state.route.page === "characters") heroFlushRef.current?.();
    };
    browser.addEventListener("pagehide", flushActiveDraft);
    return () => browser.removeEventListener?.("pagehide", flushActiveDraft);
  }, [browser, state.route.page]);

  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId) || null;
  const go = (route) => {
    if (state.route.page === "settings" && route.page !== "settings") {
      const flushed = workbenchFlushRef.current?.();
      if (flushed && !flushed.ok) return flushed;
    }
    if (state.route.page === "characters" && route.page !== "characters") {
      const flushed = heroFlushRef.current?.();
      if (flushed && !flushed.ok) return flushed;
    }
    return runtime.commands.navigate(route, state.activeSceneId);
  };
  const openScene = (scene, page) =>
    trackRevision(() => runtime.commands.openScene(
      scene.id,
      page === "board" ? { page: "board", mode: tableModeForScene(scene) } : { page },
    ));
  const forgeScene = (input) =>
    trackRevision(() => runtime.commands.forgeScene(input, {
      page: "board",
      mode: tableModeForScene(input),
    }));

  if (state.route.page === "board") {
    return (
      <TableScreen
        scene={activeScene}
        heroes={state.heroes}
        mode={state.route.mode || tableModeForScene(activeScene)}
        go={go}
        setMode={(mode) => go({ page: "board", mode })}
        onUpdate={updateScene}
        artworkRepository={runtime.artworkRepository}
        persistence={state.persistence}
      />
    );
  }

  let screen;
  if (state.route.page === "characters") {
    screen = (
      <HeroesScreen
        heroes={state.heroes}
        lifecycle={state.lifecycle}
        persistence={state.persistence}
        go={go}
        onCreate={(input) => trackRevision(() => runtime.commands.createHero(input))}
        onUpdate={updateHero}
        onRetire={(id) => trackRevision(() => runtime.commands.removeHero(id))}
        flushRef={heroFlushRef}
      />
    );
  }
  else if (state.route.page === "settings") {
    screen = (
      <SceneScreen
        scene={activeScene}
        go={go}
        returnTo={state.route.returnTo || { page: "home" }}
        persistence={state.persistence}
        artworkRepository={runtime.artworkRepository}
        onUpdate={updateScene}
        onReplaceArtwork={(id, blob) => trackRevision(() => runtime.commands.replaceSceneArtwork(id, blob))}
        onUseWhiteCanvas={(id) => trackRevision(() => runtime.commands.useWhiteCanvas(id))}
        flushRef={workbenchFlushRef}
        confirmChange={(message) => browser.confirm(message)}
      />
    );
  }
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
        onSettings={(scene) =>
          runtime.commands.openScene(scene.id, {
            page: "settings",
            returnTo: { page: "home" },
          })
        }
        onDelete={(scene) => trackRevision(() => runtime.commands.removeScene(scene.id))}
      />
    );
  }

  return (
    <div className="app nf-state-responsive-shell">
      <CommandDeck route={state.route} go={go} activeScene={activeScene} />
      <main className="viewport" key={state.route.page}>{screen}</main>
    </div>
  );
}
