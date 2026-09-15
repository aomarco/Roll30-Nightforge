import { useEffect, useRef, useState } from "react";
import { Bot, Eye, EyeOff, GripVertical, Send, Settings2, Trash2, X } from "lucide-react";

import {
  AI_PROVIDERS,
  THINKING_OFF,
  THINKING_XHIGH,
  buildSystemPrompt,
  chatEndpoint,
  loadAssistantSettings,
  providerFor,
  saveAssistantSettings,
  sendChatMessage,
} from "../ai/assistant.js";

const clampPosition = (position) => {
  if (typeof globalThis.window === "undefined") return position || { x: 16, y: 16 };
  const width = globalThis.window.innerWidth || 1024;
  const height = globalThis.window.innerHeight || 768;
  const fallback = { x: Math.max(8, width - 396), y: Math.max(8, height - 580) };
  const base = position || fallback;
  return {
    x: Math.max(0, Math.min(Math.max(0, width - 120), Math.floor(Number(base.x) || 0))),
    y: Math.max(0, Math.min(Math.max(0, height - 80), Math.floor(Number(base.y) || 0))),
  };
};

// A floating sage button plus a draggable chat bubble. It mounts beside every
// screen (Library, Heroes, Backups, Compendium, and the battle table) so help
// is one press away mid-fight. A plain section is used instead of a dialog so
// the managed-dialog focus contract keeps counting exactly nine dialogs.
export default function AiAssistant({ scene = null, heroes = [], route = null, mode = null }) {
  const [settings, setSettings] = useState(() => {
    const loaded = loadAssistantSettings();
    return { ...loaded, position: clampPosition(loaded.position) };
  });
  const [showSettings, setShowSettings] = useState(() => !loadAssistantSettings().apiKey);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [dragging, setDragging] = useState(null);
  const listRef = useRef(null);

  const update = (patch) => {
    setSettings((previous) => {
      const next = typeof patch === "function" ? patch(previous) : { ...previous, ...patch };
      saveAssistantSettings(next);
      return next;
    });
  };

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [settings.messages, settings.open]);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => {
      update({ position: clampPosition({ x: event.clientX - dragging.dx, y: event.clientY - dragging.dy }) });
    };
    const stop = () => setDragging(null);
    globalThis.window.addEventListener("pointermove", move);
    globalThis.window.addEventListener("pointerup", stop);
    globalThis.window.addEventListener("pointercancel", stop);
    return () => {
      globalThis.window.removeEventListener("pointermove", move);
      globalThis.window.removeEventListener("pointerup", stop);
      globalThis.window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  const startDrag = (event) => {
    if (event.target.closest("button")) return;
    const position = settings.position || clampPosition(null);
    setDragging({ dx: event.clientX - position.x, dy: event.clientY - position.y });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const base = [...settings.messages, { role: "user", content: text }].slice(-40);
    update({ messages: base });
    setDraft("");
    setBusy(true);
    try {
      const system = buildSystemPrompt({ scene, heroes, route, mode });
      const reply = await sendChatMessage({
        endpoint: chatEndpoint(settings),
        apiKey: settings.apiKey,
        model: settings.model,
        thinking: settings.thinking,
        messages: [{ role: "system", content: system }, ...base],
      });
      update((previous) => ({ ...previous, messages: [...previous.messages, { role: "assistant", content: reply }].slice(-40) }));
    } catch (error) {
      const message = error?.message || "Something went wrong talking to the provider.";
      update((previous) => ({ ...previous, messages: [...previous.messages, { role: "assistant", content: `Hmm, that fizzled: ${message}` }].slice(-40) }));
    } finally {
      setBusy(false);
    }
  };

  const provider = providerFor(settings);
  const thinkingLabel = settings.thinking === THINKING_XHIGH ? "Think: xhigh" : "Think: off";

  if (!settings.open) {
    return (
      <button
        type="button"
        className="ai-fab"
        aria-label="Ask the tabletop sage"
        title="Ask the tabletop sage"
        onClick={() => update({ open: true })}
      >
        <Bot size={22} />
      </button>
    );
  }

  return (
    <section className="ai-bubble" aria-label="Tabletop sage chat" style={{ left: settings.position?.x || 16, top: settings.position?.y || 16 }}>
      <header className="ai-head" onPointerDown={startDrag} title="Drag to move">
        <span className="ai-drag" aria-hidden="true"><GripVertical size={15} /></span>
        <span className="ai-title"><Bot size={16} /> Sage</span>
        <button type="button" className="ai-chip" title="Thinking mode: off, or xhigh for the hardest questions" onClick={() => update({ thinking: settings.thinking === THINKING_XHIGH ? THINKING_OFF : THINKING_XHIGH })}>
          {thinkingLabel}
        </button>
        <button type="button" className="ai-icon" aria-label="Sage settings" title="Sage settings" onClick={() => setShowSettings((value) => !value)}>
          <Settings2 size={15} />
        </button>
        <button type="button" className="ai-icon" aria-label="Close the sage" title="Close" onClick={() => update({ open: false })}>
          <X size={16} />
        </button>
      </header>

      {showSettings && (
        <div className="ai-settings">
          <label className="field"><span className="label">Key source</span>
            <select
              className="sel"
              value={provider.id}
              onChange={(event) => {
                const next = AI_PROVIDERS.find((entry) => entry.id === event.target.value) || AI_PROVIDERS[0];
                update({ providerId: next.id, baseUrl: next.baseUrl });
              }}
            >
              {AI_PROVIDERS.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">API key</span>
            <span className="ai-keyrow">
              <input className="inp" type={showKey ? "text" : "password"} value={settings.apiKey} placeholder="Paste your key here" autoComplete="off" onChange={(event) => update({ apiKey: event.target.value })} />
              <button type="button" className="ai-icon" aria-label={showKey ? "Hide the key" : "Show the key"} onClick={() => setShowKey((value) => !value)}>
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
          <label className="field"><span className="label">Model</span>
            <input className="inp" value={settings.model} onChange={(event) => update({ model: event.target.value })} />
          </label>
          <p className="note">The key stays in this browser only. The sage knows your open scene, the fight, and the D&D rules below.</p>
          <button
            type="button"
            className="btn btn-line btn-sm"
            onClick={() => update({ messages: [] })}
            disabled={!settings.messages.length}
          >
            <Trash2 size={13} /> Clear conversation
          </button>
        </div>
      )}

      <div className="ai-msgs" ref={listRef} role="log" aria-label="Sage conversation">
        {!settings.messages.length && (
          <p className="note">No key yet? Open settings (the gear above), paste an OpenRouter or OpenCode Go key, then ask me anything — rules, tactics, loot, story ideas.</p>
        )}
        {settings.messages.map((entry, index) => (
          <article key={`${index}-${entry.role}`} className={entry.role === "user" ? "ai-msg ai-user" : "ai-msg ai-sage"}>
            <p>{entry.content}</p>
          </article>
        ))}
        {busy && <p className="note" role="status">The sage is thinking…</p>}
      </div>

      <div className="ai-compose">
        <input
          className="inp"
          aria-label="Ask the sage"
          placeholder={settings.apiKey ? "Ask about rules, tactics, loot…" : "Add your key in settings first…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") send(); }}
        />
        <button type="button" className="btn btn-key btn-sm" aria-label="Send to the sage" onClick={send} disabled={busy || !draft.trim()}>
          <Send size={14} />
        </button>
      </div>
    </section>
  );
}
