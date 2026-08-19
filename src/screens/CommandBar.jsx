import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Footprints,
  Gauge,
  PackageOpen,
  RefreshCw,
  ShieldHalf,
  Swords,
  Wind,
  X,
} from "lucide-react";

import { ITEM_BY_ID, itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining, validateSwapLoadout } from "../domain/combat.js";

const errorText = (error) => error ? `${error.message} ${error.recovery || "Retry the command."}` : "";

/**
 * The whole turn lives in one bar. Attack, Dash, Swap and End Turn are always
 * visible, and choosing Attack or Bonus grows the bar upward into the space
 * above it rather than opening a window over the board.
 */
export default function CommandBar({
  token,
  resources,
  dashState,
  swapState,
  attackState,
  bonusState,
  chestOptions = [],
  retrievalOptions = [],
  busy = false,
  error = null,
  attack,
  dash,
  swap,
  end,
  openChest,
  retrieve,
  initialPanel = null,
  initialSwapDraft = null,
}) {
  const [panel, setPanel] = useState(initialPanel);
  const [draft, setDraft] = useState(() => initialSwapDraft || { ...token.loadout });
  const weapons = useMemo(() => token.inventory
    .map((entry) => ({ item: ITEM_BY_ID[entry.itemId], quantity: entry.quantity }))
    .filter(({ item }) => item?.kind === "weapon"), [token.inventory]);
  const validation = validateSwapLoadout(token, draft);
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);

  useEffect(() => {
    setPanel(null);
    setDraft({ ...token.loadout });
  }, [token.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && panel) setPanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panel]);

  const togglePanel = (next) => {
    setPanel((current) => {
      if (current === next) return null;
      if (next === "swap") setDraft({ ...token.loadout });
      return next;
    });
  };

  const movementSpent = maximum > 0 && remaining <= 0;
  const meters = [
    {
      id: "movement",
      icon: Wind,
      label: "Movement",
      value: `${remaining} ft`,
      state: movementSpent ? "spent" : "ready",
      reason: movementSpent
        ? `${token.name} has used all ${maximum} feet of movement this turn.`
        : `${remaining} of ${maximum} feet remaining this turn.`,
    },
    {
      id: "action",
      icon: Swords,
      label: "Action",
      value: resources.actionSpent ? resources.actionType || "Spent" : "Ready",
      state: resources.actionSpent ? "spent" : "ready",
      reason: resources.actionSpent
        ? `The Action was spent on ${resources.actionType || "another command"}. End the turn to refresh it.`
        : "The Action is available: Attack, Dash or Swap weapons.",
    },
    {
      id: "bonus",
      icon: ShieldHalf,
      label: "Bonus",
      value: resources.bonusActionSpent ? resources.bonusActionType || "Spent" : "Ready",
      state: resources.bonusActionSpent ? "spent" : "ready",
      reason: resources.bonusActionSpent
        ? `The Bonus Action was spent on ${resources.bonusActionType || "another command"}. End the turn to refresh it.`
        : "The Bonus Action is available: off-hand attack, open a chest or retrieve a weapon.",
    },
    {
      id: "swap",
      icon: RefreshCw,
      label: "Swap",
      value: resources.swapped ? resources.swapChoice || "Used" : "Ready",
      state: resources.swapped ? "spent" : "ready",
      reason: resources.swapped
        ? `Weapons were already swapped this turn${resources.swapChoice ? ` (${resources.swapChoice} branch)` : ""}.`
        : "A weapon swap is still available this turn.",
    },
  ];

  const commands = [
    {
      id: "attack",
      icon: Swords,
      label: "Attack",
      state: attackState,
      onClick: () => togglePanel("attack"),
      hint: attackState.ok ? `${attackState.value.options.length} equipped` : attackState.message,
    },
    {
      id: "dash",
      icon: Gauge,
      label: "Dash",
      state: dashState,
      onClick: dash,
      hint: dashState.ok ? `Add ${token.baseSpeed} ft` : dashState.message,
    },
    {
      id: "swap",
      icon: RefreshCw,
      label: "Swap weapon",
      state: swapState,
      onClick: () => togglePanel("swap"),
      hint: swapState.ok ? "Once this turn" : swapState.message,
    },
    {
      id: "bonus",
      icon: ShieldHalf,
      label: "Bonus",
      state: { ok: true },
      onClick: () => togglePanel("bonus"),
      hint: resources.bonusActionSpent ? resources.bonusActionType || "Spent" : "Available",
    },
  ];

  return (
    <div className={`nf-state-command-bar glass grained${panel ? " nf-state-command-bar-open" : ""}`}>
      {panel && (
        <div className="nf-state-command-panel" role="group" aria-label={`${panel} options`}>
          <div className="nf-state-command-panel-top">
            <span className="kicker kicker-brass">
              {panel === "attack"
                ? attackState.ok ? "Choose attack weapon" : "Attack unavailable"
                : panel === "swap" ? "Swap draft" : "Bonus commands"}
            </span>
            <button className="glyph" onClick={() => setPanel(null)} aria-label="Close options"><X size={16} /></button>
          </div>

          {error && <div className="nf-state-inline-error" role="alert"><strong>Command not completed</strong><span>{errorText(error)}</span></div>}

          {panel === "attack" && attackState.ok && (
            <div className="nf-state-command-options">
              {attackState.value.options.map((option) => (
                <button
                  className="nf-state-command-option"
                  key={option.key}
                  onClick={() => attack({ kind: "action", weaponId: option.weaponId, hand: option.hand })}
                  disabled={busy || !option.supply.ok}
                  title={option.supply.ok ? "Enter targeting mode" : option.supply.message}
                >
                  <Swords size={16} />
                  <span>
                    <strong>{option.weapon.name}</strong>
                    <small>{option.supply.ok ? `${option.hand === "mainHand" ? "Main hand" : "Off hand"} · ${itemSubtitle(option.weapon)}` : option.supply.message}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {panel === "attack" && attackState.ok && (
            <p className="note">Choose a weapon, then select a living token inside the highlighted range. Blocked and out-of-range attempts do not spend Action.</p>
          )}
          {panel === "attack" && !attackState.ok && (
            <p className="note">{attackState.message} {attackState.recovery}</p>
          )}

          {panel === "swap" && swapState.ok && (
            <div className="nf-state-command-swap">
              <label className="field"><span className="label">Main hand</span>
                <select className="sel" value={draft.mainHand || ""} onChange={(event) => setDraft((current) => ({ ...current, mainHand: event.target.value || null }))}>
                  <option value="">Empty</option>
                  {weapons.map(({ item }) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Off hand</span>
                <select className="sel" value={draft.offHand || ""} onChange={(event) => setDraft((current) => ({ ...current, offHand: event.target.value || null }))}>
                  <option value="">Empty</option>
                  {weapons.map(({ item, quantity }) => <option value={item.id} key={item.id}>{item.name}{item.id === draft.mainHand && quantity < 2 ? " · needs quantity 2" : ""}</option>)}
                </select>
              </label>
              {!validation.ok && <div className="nf-state-inline-error" role="status"><strong>Choose another loadout</strong><span>{validation.message}</span></div>}
              <p className="note">Swap then Attack causes disadvantage and blocks movement. Moving before or after Swap blocks Attack and Dash while preserving unused movement.</p>
              <button className="btn btn-key btn-wide" onClick={() => swap(draft)} disabled={busy || !validation.ok}><RefreshCw size={15} /> Confirm weapon swap</button>
            </div>
          )}
          {panel === "swap" && !swapState.ok && (
            <p className="note">{swapState.message} {swapState.recovery}</p>
          )}

          {panel === "bonus" && (
            <div className="nf-state-command-options">
              <span className="tag tag-jade">No automatic End Turn</span>
              {!bonusState.ok && (
                <p className="note">
                  <strong>Off-hand attack unavailable.</strong> {bonusState.message} {bonusState.recovery}
                </p>
              )}
              <button
                className="nf-state-command-option"
                onClick={() => bonusState.ok && attack({ kind: "bonus", weaponId: bonusState.value.options[0].weaponId, hand: bonusState.value.options[0].hand })}
                disabled={busy || !bonusState.ok}
                title={bonusState.ok ? "Enter off-hand targeting mode" : bonusState.message}
              >
                <ShieldHalf size={16} />
                <span>
                  <strong>Off-hand attack</strong>
                  <small>{bonusState.ok ? `${bonusState.value.options[0].weapon.name} · ${itemSubtitle(bonusState.value.options[0].weapon)}` : bonusState.message}</small>
                </span>
              </button>
              <span className="nf-state-command-group">Battle chests</span>
              {chestOptions.map(({ chest, availability }, index) => (
                <button
                  className="nf-state-command-option"
                  key={chest.id}
                  onClick={() => openChest(chest.id)}
                  disabled={busy || !availability.ok}
                  title={availability.ok ? availability.value.alreadyOpen ? "Resume this opened chest" : "Spend Bonus Action and open this chest" : availability.message}
                >
                  <PackageOpen size={16} />
                  <span>
                    <strong>Chest {index + 1}</strong>
                    <small>{availability.ok ? availability.value.alreadyOpen ? "Resume looting" : `${chest.inventory.reduce((total, entry) => total + entry.quantity, 0)} items · adjacent` : availability.message}</small>
                  </span>
                </button>
              ))}
              <span className="nf-state-command-group">Physical weapons</span>
              {retrievalOptions.map(({ battleItem, availability }) => {
                const weapon = ITEM_BY_ID[battleItem.itemId];
                return (
                  <button
                    className="nf-state-command-option"
                    key={battleItem.id}
                    onClick={() => retrieve(battleItem.id)}
                    disabled={busy || !availability.ok}
                    title={availability.ok ? `${availability.value.cost === "free" ? "Free" : "Bonus Action"} retrieval` : availability.message}
                  >
                    <ArchiveRestore size={16} />
                    <span>
                      <strong>Retrieve {weapon?.name || battleItem.itemId}</strong>
                      <small>{availability.ok ? `${availability.value.retrievalKind.replaceAll("-", " ")} · ${availability.value.cost}` : availability.message}</small>
                    </span>
                  </button>
                );
              })}
              {!chestOptions.length && !retrievalOptions.length && (
                <p className="note">No Battle chests or thrown weapons are present in this encounter.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="nf-state-command-deck">
        <div className="nf-state-command-meters">
          {meters.map((meter) => (
            <span
              className={`nf-state-command-meter nf-state-command-meter-${meter.state} nf-state-command-meter-${meter.id}`}
              key={meter.id}
              title={meter.reason}
              tabIndex={0}
            >
              <meter.icon size={14} />
              <em>{meter.label}</em>
              <strong className="numeral">{meter.value}</strong>
            </span>
          ))}
        </div>

        <div className="nf-state-command-actions">
          {commands.map((command) => (
            <button
              className={`btn btn-sm ${panel === command.id ? "btn-key" : "btn-line"}`}
              key={command.id}
              onClick={command.onClick}
              disabled={busy || !command.state.ok}
              title={command.state.ok ? command.hint : command.state.message}
              aria-expanded={["attack", "swap", "bonus"].includes(command.id) ? panel === command.id : undefined}
            >
              <command.icon size={15} /> {command.label}
            </button>
          ))}
          <button className="btn btn-key btn-sm nf-state-command-end" onClick={end} disabled={busy}>
            <Footprints size={15} /> End Turn
          </button>
        </div>
      </div>
    </div>
  );
}
