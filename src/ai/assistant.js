// Nightforge AI tabletop helper.
//
// This module lives outside src/domain on purpose: it talks to the network
// (fetch) and reads the browser key vault (localStorage), both of which the
// pure rules layer is forbidden from touching. Everything here runs on the
// user's machine and the API key never leaves it except inside the direct
// request to the chosen provider.

export const AI_SETTINGS_KEY = "roll30-nightforge-v1:ai-assistant";

export const AI_PROVIDERS = Object.freeze([
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "opencode-go", label: "OpenCode Go", baseUrl: "https://opencode.ai/zen/go/v1" },
]);

// The model this helper asks for. Editable in the bubble settings because
// provider catalogs rename things; this default matches the bare Zen catalog
// id for the Muse Spark contributor build this project was raised with.
export const DEFAULT_AI_MODEL = "muse-spark-1.3-contributor";

export const THINKING_OFF = "off";
export const THINKING_XHIGH = "xhigh";

const defaultSettings = () => ({
  providerId: "openrouter",
  baseUrl: AI_PROVIDERS[0].baseUrl,
  apiKey: "",
  model: DEFAULT_AI_MODEL,
  thinking: THINKING_OFF,
  open: false,
  position: null,
  messages: [],
});

const isBrowser = () => typeof globalThis.localStorage !== "undefined";

export function loadAssistantSettings() {
  const next = defaultSettings();
  if (!isBrowser()) return next;
  try {
    const raw = globalThis.localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return next;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return next;
    const provider = AI_PROVIDERS.find((entry) => entry.id === parsed.providerId) || AI_PROVIDERS[0];
    // Addresses are locked to presets: a freeform box once let a stale URL
    // send keys to the wrong place with no visible reason, so anything stored
    // from that era is replaced by its provider's address here.
    return {
      ...next,
      ...parsed,
      providerId: provider.id,
      baseUrl: provider.baseUrl,
      position: parsed.position && typeof parsed.position === "object" ? parsed.position : null,
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : [],
    };
  } catch {
    return next;
  }
}

export function saveAssistantSettings(settings) {
  if (!isBrowser()) return;
  try {
    globalThis.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({
      ...settings,
      messages: Array.isArray(settings.messages) ? settings.messages.slice(-40) : [],
    }));
  } catch {
    // A full or blocked vault must never break the chat bubble.
  }
}

export function providerFor(settings) {
  return AI_PROVIDERS.find((entry) => entry.id === settings?.providerId) || AI_PROVIDERS[0];
}

export function chatEndpoint(settings) {
  const provider = providerFor(settings);
  const base = String(settings?.baseUrl || provider.baseUrl || "").trim().replace(/\/+$/, "");
  return base ? `${base}/chat/completions` : "";
}

const hitPoints = (token) => `${Math.max(0, Number(token?.hp) || 0)}/${Math.max(0, Number(token?.maxHp ?? token?.hp) || 0)}`;

const describeToken = (token) => {
  const conditions = Array.isArray(token?.conditions) && token.conditions.length
    ? ` [${token.conditions.join(", ")}]`
    : "";
  const side = token?.faction === "ally" ? "ally" : token?.faction === "foe" ? "foe" : "no side";
  const state = token?.dead ? "dead" : (Number(token?.hp) || 0) <= 0 ? "down" : hitPoints(token);
  return `- ${token?.name || "Unnamed"} (${side}, ${state})${conditions}`;
};

const describeHero = (hero) => {
  const level = Math.max(1, Math.min(20, Math.floor(Number(hero?.level) || 1)));
  return `- ${hero?.name || "Unnamed hero"}: level ${level} ${hero?.classId || "fighter"} (${hero?.raceId || "human"})`;
};

/**
 * The system prompt is the whole trick: it teaches the model what Nightforge
 * is, which rules this table actually enforces, and what is happening on the
 * user's table right now, so answers land in context instead of in a vacuum.
 */
export function buildSystemPrompt({ scene = null, heroes = [], route = null, mode = null } = {}) {
  const sceneName = scene?.name || "no scene open";
  const sceneKind = scene?.kind === "play" ? "Play (display only, no grid, no combat)" : scene ? "Battle (grid, tokens, combat)" : "none";
  const phase = scene?.encounter?.status === "active" ? "Battle" : scene ? "Setup" : "—";
  const round = scene?.encounter?.status === "active" ? `round ${Math.max(1, Math.floor(Number(scene.encounter.round) || 1))}` : "no fight running";
  const order = Array.isArray(scene?.encounter?.initiativeOrder) ? scene.encounter.initiativeOrder : [];
  const tokens = Array.isArray(scene?.tokens) ? scene.tokens : [];
  const activeId = order[Math.max(0, Math.floor(Number(scene?.encounter?.activeIndex) || 0))] || null;
  const active = tokens.find((entry) => entry?.id === activeId) || null;
  const tokenLines = tokens.slice(0, 40).map(describeToken).join("\n") || "(no tokens on the map)";
  const heroLines = (Array.isArray(heroes) ? heroes : []).slice(0, 30).map(describeHero).join("\n") || "(no heroes in the roster)";
  const where = route?.page === "board" ? `at the battle table (${mode || "setup"} view)` : route?.page === "characters" ? "on the Heroes roster screen" : route?.page === "home" ? "in the Library" : "in the app";

  return `You are the tabletop sage inside Nightforge, a virtual tabletop for Dungeons & Dragons 5th Edition that runs in a web browser. Help with everything D&D: rules questions, encounter building, tactics, hero builds, story and roleplay ideas, loot, and how to use this app to run it all. Address the person running the game. Keep answers short enough to read mid-session unless they ask for detail. Never invent app buttons or screens; only describe what is listed below.

WHAT NIGHTFORGE IS AND KNOWS
- Scenes are maps. Play scenes are display-only pictures with no grid and no combat. Battle scenes have a grid, tokens, walls, chests, and at most one encounter (fight) at a time.
- A Battle scene is either in Setup (arranging tokens, walls, chests, no dice) or in Battle (initiative rolled, rules enforced). The user can abandon back to Setup, which discards the fight but keeps the arrangement.
- Heroes are player characters in a roster (race, class, scores, skills, gear). Only Fighter and Wizard exist as classes so far; the other ten are not built. Dropping a Hero onto a map copies a frozen snapshot, so later roster edits do not change tokens already placed.
- Tokens are creatures on the map: Hero snapshots, Monsters (334 imported SRD stat blocks), or blank tokens the user fills in. Every token has a side, ally or foe; a fight ends when one side is left standing.
- Items: 359 SRD entries (36 weapons, 13 armour, gear, ammunition, 113 reference magic items, worn magic items, 4 healing potions). Heroes, tokens, chests, and the fallen carry five coin purses (CP, SP, EP, GP, PP). There is no shop.
- Spells are NOT automated in this app yet. You may still explain any spell's rules from D&D knowledge, but warn that the table must resolve it by hand with the hit-point and check controls.

COMBAT RULES THIS TABLE ENFORCES (5th Edition)
- A turn gives movement (splittable before and after acting), one Action, and one Bonus Action. The app never ends a turn automatically.
- Attacks: roll d20, natural 20 always hits and is a critical, natural 1 always misses. Criticals double damage dice only, never flat modifiers. Advantage and disadvantage from any number of sources cancel to a normal roll.
- Movement speeds: walk, fly, swim, climb are separate; Dash doubles movement for the turn; difficult terrain costs double except when flying.
- Actions include Attack, Dash, Dodge (attackers have disadvantage until your next turn), Disengage (no opportunity attacks this turn), Help (ally within 5 ft gains advantage against one named enemy), Hide (Stealth vs enemy passive Perception, needs total cover or invisibility), Ready (name an attack, an enemy, and a trigger: it moves, attacks, or ends its turn), Grapple and Shove (contested Athletics vs the defender's better Athletics/Acrobatics), and Stabilise (adjacent dying Hero, Action, DC 10 Wisdom/Medicine).
- Opportunity attacks: leaving an enemy's melee reach draws one swing; staying inside its reach draws nothing; Disengage prevents it; one reaction per creature per round.
- Cover: half +2 AC, three-quarters +5 AC, full wall blocks the shot entirely. Cover also helps sourced Dexterity saves.
- Damage defences apply to the finished total: immunity zeroes it, resistance halves rounding down, vulnerability doubles it.
- Temporary hit points absorb damage first and never stack; a bigger grant replaces a smaller pool.
- Death saves are Heroes only; monsters at zero simply die. Three successes stabilise, three failures kill, natural 1 counts two failures, natural 20 stands the creature up at 1 hit point. Any healing raises the dying. An adjacent ally can stabilise with Medicine.
- Conditions and what they do: Blinded (your attacks disadvantage, attacks vs you advantage), Frightened and Poisoned (your attacks disadvantage), Invisible (your attacks advantage, attacks vs you disadvantage), Prone (your attacks disadvantage; melee vs you advantage, ranged vs you disadvantage), Grappled and Restrained (no movement), Incapacitated/Stunned/Paralyzed/Petrified (no Action or Bonus Action), Paralyzed (melee hits vs you auto-crit), Paralyzed/Petrified/Stunned/Unconscious (Strength and Dexterity saves fail with no roll), Restrained (Dexterity saves at disadvantage). Charmed and Deafened are tracked only.
- Rests: short rest spends chosen hit dice and heals die + Constitution each; long rest restores full HP and recovers half the spent hit dice (minimum one) plus racial and item uses. Experience is offered at battle end and awarded by hand; levelling up is always the user's manual choice.

THE USER'S TABLE RIGHT NOW
- The user is ${where}.
- Open scene: ${sceneName} — ${sceneKind}. Phase: ${phase}. ${round}.
- Active creature: ${active ? `${active.name} (${hitPoints(active)})` : "none"}.
- Tokens on the map:
${tokenLines}
- Heroes in the roster:
${heroLines}

Answer as their knowledgeable co-DM with all of the above in mind. If they ask about a creature, item, or rule named above, use the table state shown. If they ask something the app cannot do yet (spells, missing classes, feats, shopping), say so plainly and give the hand-resolution instead.`;
}

const friendlyError = (status, payloadMessage) => {
  if (status === 401) return "That key was refused (401). Check the key in the bubble settings and retry.";
  if (status === 403) return "The provider refused this request (403). The key may lack model access.";
  if (status === 404) return "That model name was not found (404). Check the model spelling in the bubble settings.";
  if (status === 429) return "Rate limited (429). Wait a moment and send again.";
  if (payloadMessage) return `The provider answered with an error: ${payloadMessage}`;
  return `The provider answered with status ${status}. Retry, or check the base URL in settings.`;
};

/**
 * One chat round trip. Messages are plain { role, content } entries; the
 * caller prepends buildSystemPrompt as the system message.
 */
export async function sendChatMessage({ endpoint, apiKey, model, thinking = THINKING_OFF, messages = [] }) {
  if (!endpoint) throw new Error("Set a provider base URL in the bubble settings first.");
  if (!apiKey) throw new Error("Add your API key in the bubble settings first — the bubble cannot talk without one.");
  if (!model) throw new Error("Set a model name in the bubble settings first.");
  const body = { model, messages };
  if (thinking === THINKING_XHIGH) body.reasoning = { effort: "xhigh" };
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aomarco.github.io/Roll30-Nightforge/",
        "X-Title": "Roll30 Nightforge tabletop sage",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Browsers throw a bare TypeError when the provider refuses cross-origin
    // calls at the network edge (no CORS blessing). Measured live: OpenRouter
    // answers browsers fine, OpenCode Zen does not, so say exactly that.
    if (error?.name === "TypeError") {
      throw new Error("The browser blocked the request before it was sent. OpenRouter welcomes browser apps; OpenCode Go currently turns them away, so a Zen key cannot talk from inside this page.", { cause: error });
    }
    throw new Error("Could not reach the provider. Check the connection and retry.", { cause: error });
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The provider answered with status ${response.status} and no readable reply. Retry in a moment.`);
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "";
    throw new Error(friendlyError(response.status, message));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("The provider answered with no text. Retry, or try another model name.");
  return content.trim();
}
