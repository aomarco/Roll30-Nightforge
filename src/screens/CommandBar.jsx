import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  ChevronsRight,
  Hourglass,
  PackageOpen,
  RefreshCw,
  Sparkles,
  Sword,
  X,
} from "lucide-react";

import { ITEM_BY_ID, itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining, validateSwapLoadout } from "../domain/combat.js";

/** One segment per five feet, which is the unit the whole game counts in. */
const SPEED_SEGMENT_FEET = 5;
const MAX_SPEED_SEGMENTS = 20;

/**
 * The whole turn lives in one bar: a segmented Speed meter, four command
 * sections divided by hairlines, and End Turn as a ring on the right.
 *
 * There are no separate resource chips any more. A command that cannot be used
 * turns red and goes dead, and hovering it still explains why — which is the
 * same information the old "Action Attack" / "Bonus Ready" text carried, minus
 * the clutter.
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
  // Dash is one press away from wasting a turn, so it asks twice.
  const [dashArmed, setDashArmed] = useState(false);
  const [draft, setDraft] = useState(() => initialSwapDraft || { ...token.loadout });
  const weapons = useMemo(() => token.inventory
    .map((entry) => ({ item: ITEM_BY_ID[entry.itemId], quantity: entry.quantity }))
    .filter(({ item }) => item?.kind === "weapon"), [token.inventory]);
  const validation = validateSwapLoadout(token, draft);
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);

  useEffect(() => {
    setPanel(null);
    setDashArmed(false);
    setDraft({ ...token.loadout });
  }, [token.id]);

  useEffect(() => {
    if (!dashArmed) return undefined;
    const timer = setTimeout(() => setDashArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [dashArmed]);

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

  const totalSegments = Math.min(
    MAX_SPEED_SEGMENTS,
    Math.max(1, Math.round(maximum / SPEED_SEGMENT_FEET)),
  );
  const filledSegments = maximum > 0
    ? Math.max(0, Math.min(totalSegments, Math.round((remaining / maximum) * totalSegments)))
    : 0;

  // Health reads as a smooth continuous pixel bar sitting to the left of Speed.
  const hpPercent = token.maxHp > 0
    ? Math.max(0, Math.min(100, (Math.max(0, token.hp) / token.maxHp) * 100))
    : 0;

  // The Bonus panel still holds chests and weapon retrieval, so it stays
  // reachable whenever it has anything inside it — even after the Bonus Action
  // itself is spent, because an already-open chest can still be looted.
  const bonusHasContent = bonusState.ok || chestOptions.length > 0 || retrievalOptions.length > 0;

  const commands = [
    {
      id: "attack",
      icon: Sword,
      label: "Attack",
      available: attackState.ok,
      reason: attackState.ok
        ? `${attackState.value.options.length} equipped weapon${attackState.value.options.length === 1 ? "" : "s"} ready.`
        : attackState.message,
      onClick: () => togglePanel("attack"),
      expands: true,
    },
    {
      id: "dash",
      icon: ChevronsRight,
      label: dashArmed ? "Confirm" : "Dash",
      available: dashState.ok,
      reason: dashState.ok
        ? dashArmed
          ? `Press again to spend the Action and add ${token.baseSpeed} feet.`
          : `Adds ${token.baseSpeed} feet of movement. Press twice to confirm.`
        : dashState.message,
      onClick: () => {
        if (!dashArmed) { setDashArmed(true); return; }
        setDashArmed(false);
        dash();
      },
      expands: false,
      armed: dashArmed,
    },
    {
      id: "swap",
      icon: RefreshCw,
      label: "Swap",
      available: swapState.ok,
      reason: swapState.ok ? "One weapon swap is still available this turn." : swapState.message,
      onClick: () => togglePanel("swap"),
      expands: true,
    },
    {
      id: "bonus",
      icon: Sparkles,
      label: "Bonus action",
      available: bonusHasContent,
      reason: bonusHasContent
        ? resources.bonusActionSpent
          ? `Bonus Action spent on ${resources.bonusActionType || "another command"}. Opened chests can still be looted.`
          : "Off-hand attack, open a chest or retrieve a weapon."
        : bonusState.message,
      onClick: () => togglePanel("bonus"),
      expands: true,
    },
  ];

  return (
    <div className={`nf-state-command-bar${panel ? " nf-state-command-bar-open" : ""}`}>
      {panel && (
        <div className="nf-state-command-panel glass grained" role="group" aria-label={`${panel} options`}>
          <div className="nf-state-command-panel-top">
            <span className="kicker kicker-brass">
              {panel === "attack"
                ? attackState.ok ? "Choose attack weapon" : "Attack unavailable"
                : panel === "swap" ? "Swap draft" : "Bonus commands"}
            </span>
            <button className="glyph" onClick={() => setPanel(null)} aria-label="Close options"><X size={16} /></button>
          </div>

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
                  <Sword size={16} />
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
              <p className="note">{validation.ok
                ? "Swap then Attack causes disadvantage and blocks movement. Moving before or after Swap blocks Attack and Dash while preserving unused movement."
                : validation.message}</p>
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
                <Sword size={16} />
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
        <div className="nf-state-command-console">
          <div className="nf-state-command-gauges">
          <div
            className={`nf-state-command-health glass${token.hp <= 0 ? " nf-state-command-health-empty" : ""}`}
            title={`${Math.max(0, token.hp)} of ${token.maxHp} hit points remaining.`}
          >
            <em>HP</em>
            <span className="nf-state-command-health-track" role="progressbar" aria-valuenow={Math.max(0, token.hp)} aria-valuemin={0} aria-valuemax={token.maxHp} aria-label={`${Math.max(0, token.hp)} of ${token.maxHp} hit points remaining`}>
              <i
                className="nf-state-command-health-fill"
                style={{ width: `${hpPercent}%` }}
              />
            </span>
            <strong className="numeral">{Math.max(0, token.hp)}/{token.maxHp}</strong>
          </div>

          <div
            className={`nf-state-command-speed glass${remaining <= 0 ? " nf-state-command-speed-empty" : ""}`}
            title={remaining > 0
              ? `${remaining} of ${maximum} feet of movement left this turn.`
              : `${token.name} has used all ${maximum} feet of movement this turn.`}
          >
            <em>Speed</em>
            <span className="nf-state-command-speed-track" role="img" aria-label={`${remaining} of ${maximum} feet of movement remaining`}>
              {Array.from({ length: totalSegments }, (unused, index) => (
                <i
                  className={`nf-state-command-speed-cell${index < filledSegments ? " nf-state-command-speed-cell-on" : ""}`}
                  key={index}
                />
              ))}
            </span>
            <strong className="numeral">{remaining}/{maximum}</strong>
          </div>
          </div>

          <div className="nf-state-command-actions glass grained">
            {commands.map((command) => (
              // The tooltip lives on the wrapper because a disabled button
              // does not reliably raise the hover events a title needs.
              <span className="nf-state-command-slot" key={command.id} title={command.reason}>
                <button
                  className={`nf-state-command-key nf-state-command-key-${command.id} ${command.available ? "nf-state-command-key-ready" : "nf-state-command-key-blocked"}${panel === command.id ? " nf-state-command-key-open" : ""}${command.armed ? " nf-state-command-key-armed" : ""}`}
                  onClick={command.onClick}
                  disabled={busy || !command.available}
                  aria-label={command.label}
                  aria-expanded={command.expands ? panel === command.id : undefined}
                >
                  <command.icon size={22} strokeWidth={2.2} />
                </button>
              </span>
            ))}
          </div>
        </div>

        <button
          className="nf-state-command-end glass"
          onClick={end}
          disabled={busy}
          title={`End ${token.name}'s turn and pass initiative on.`}
        >
          <Hourglass size={26} strokeWidth={1.9} />
          <em>End Turn</em>
        </button>
      </div>
    </div>
  );
}
