import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Check,
  ChevronsRight,
  EyeOff,
  Footprints,
  HandHelping,
  HeartPulse,
  Hourglass,
  PackageOpen,
  RefreshCw,
  ShieldHalf,
  Skull,
  Sparkle,
  Sparkles,
  Sword,
  X,
} from "lucide-react";

import { ITEM_BY_ID, itemSubtitle } from "../domain/catalog.js";
import { movementMaximum, movementRemaining, validateSwapLoadout } from "../domain/combat.js";
import { DEATH_SAVES_REQUIRED } from "../domain/table.js";

/** One segment per five feet, which is the unit the whole game counts in. */
const SPEED_SEGMENT_FEET = 5;
const MAX_SPEED_SEGMENTS = 20;

const signed = (value) => (value >= 0 ? `+${value}` : String(value));

/**
 * A derived weapon reads as the hand it sits in; an authored attack reads as
 * the numbers it was written with, because that is all there is to say.
 */
/**
 * A hero readies weapons; a creature simply has attacks. The wording follows
 * whichever kind of option is on offer.
 */
const attackReadyCopy = (options) => {
  const noun = options.some((option) => option.authored) ? "attack" : "equipped weapon";
  return `${options.length} ${noun}${options.length === 1 ? "" : "s"} ready.`;
};

const attackOptionDetail = (option) => {
  if (!option.authored) {
    return `${option.hand === "mainHand" ? "Main hand" : "Off hand"} · ${itemSubtitle(option.weapon)}`;
  }
  const { attack } = option;
  const reach = attack.rangeKind === "melee"
    ? `${attack.reachFeet} ft`
    : `${attack.normalFeet}/${attack.longFeet} ft`;
  const damage = [attack.damageDice, (attack.damageType || "").toLowerCase()].filter(Boolean).join(" ");
  return `${signed(attack.toHit)} to hit · ${damage} · ${reach}${attack.throwable ? " · thrown" : ""}`;
};

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
  lootOptions = [],
  busy = false,
  tacticState = { ok: false, message: "Battle is not active." },
  hideState = { ok: false, message: "Battle is not active." },
  helpState = { ok: false, message: "Battle is not active." },
  stabilizeState = { ok: false, message: "Battle is not active." },
  readyState = { ok: false, message: "Battle is not active." },
  potionState = { ok: false, message: "No potion is available." },
  attack,
  dash,
  swap,
  dodge,
  disengage,
  hide,
  help,
  stabilize,
  ready,
  specialAttack,
  grappleState = { grappledTargets: [], escape: { ok: false } },
  escapeGrapple,
  releaseGrapple,
  drinkPotion,
  movementModes = [],
  chooseMovementMode,
  rollDeath,
  end,
  openChest,
  searchBody,
  retrieve,
  initialPanel = null,
  initialSwapDraft = null,
}) {
  const [panel, setPanel] = useState(initialPanel);
  // Dash is one press away from wasting a turn, so it asks twice.
  const [dashArmed, setDashArmed] = useState(false);
  const [draft, setDraft] = useState(() => initialSwapDraft || { ...token.loadout });
  const [readyTrigger, setReadyTrigger] = useState("target-moves");
  const weapons = useMemo(() => token.inventory
    .map((entry) => ({ item: ITEM_BY_ID[entry.itemId], quantity: entry.quantity }))
    .filter(({ item }) => item?.kind === "weapon"), [token.inventory]);
  const validation = validateSwapLoadout(token, draft);
  const maximum = movementMaximum(resources, token);
  const remaining = movementRemaining(resources, token);
  const selectedSpeed = movementModes.find(({ mode }) => mode === (resources.movementMode || "walk"))?.speed || token.baseSpeed;

  useEffect(() => {
    setPanel(null);
    setDashArmed(false);
    setDraft({ ...token.loadout });
    setReadyTrigger("target-moves");
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

  const enterTargeting = (start) => {
    const result = start();
    if (result?.ok) setPanel(null);
    return result;
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
  const bonusHasContent = bonusState.ok || chestOptions.length > 0 || retrievalOptions.length > 0 || lootOptions.length > 0;
  // A creature with Multiattack keeps its Action open across several rolls.
  const attacksRemaining = Math.max(0, resources.attackAllowance - resources.attacksMade);

  // A dying creature has no Action, no Bonus Action and no movement. Showing it
  // the usual four keys, all dead, would be four separate lies; the one thing it
  // can do is roll, so that is the only thing on offer.
  const dying = token.hp <= 0 && !token.dead;
  const stable = dying && token.deathSaveSuccesses >= DEATH_SAVES_REQUIRED;
  const commands = dying
    ? [{
      id: "death",
      icon: Skull,
      label: "Roll death save",
      available: !stable && !resources.deathSaveRolled,
      reason: stable
        ? `${token.name} is stable and has stopped rolling. Healing is the only thing that brings them back.`
        : resources.deathSaveRolled
          ? `${token.name} has rolled this turn. End the turn to continue initiative.`
        : `${token.deathSaveSuccesses} of ${DEATH_SAVES_REQUIRED} successes, ${token.deathSaveFailures} of ${DEATH_SAVES_REQUIRED} failures. Ten or better succeeds.`,
      onClick: () => rollDeath(token.id),
      expands: false,
    }]
    : [
    {
      id: "attack",
      icon: Sword,
      label: "Attack",
      available: attackState.ok,
      reason: attackState.ok
        ? attacksRemaining > 1
          ? `${attacksRemaining} attacks left in this Action.`
          : attackReadyCopy(attackState.value.options)
        : attackState.message,
      onClick: () => togglePanel("attack"),
      expands: true,
    },
    {
      id: "dash",
      icon: dashArmed ? Check : ChevronsRight,
      label: dashArmed ? "Confirm" : "Dash",
      available: dashState.ok,
      reason: dashState.ok
        ? dashArmed
          ? `Press again to spend the Action and add ${selectedSpeed} feet.`
          : `Adds ${selectedSpeed} feet of movement. Press twice to confirm.`
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
      // Three Actions behind one key rather than three more keys. The bar has
      // four already and the responsive layout starts clipping past five, so
      // the ones that need a moment's thought share a drawer.
      id: "tactics",
      icon: ShieldHalf,
      label: "Tactics",
      available: tacticState.ok,
      reason: tacticState.ok ? "Dodge, Disengage, Help, Ready, Grapple, Shove, use a potion, or stabilise." : tacticState.message,
      onClick: () => togglePanel("tactics"),
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
                : panel === "swap" ? "Swap draft"
                  : panel === "tactics" ? "Spend the Action on a tactic" : "Bonus commands"}
            </span>
            <button className="glyph" onClick={() => setPanel(null)} aria-label="Close options"><X size={16} /></button>
          </div>

          {panel === "attack" && attackState.ok && (
            <div className="nf-state-command-options">
              {attackState.value.options.map((option) => (
                <button
                  className="nf-state-command-option"
                  key={option.key}
                  onClick={() => enterTargeting(() => attack({ kind: "action", weaponId: option.weaponId, hand: option.hand, attackId: option.attackId }))}
                  disabled={busy || !option.supply.ok}
                  title={option.supply.ok ? "Enter targeting mode" : option.supply.message}
                >
                  <Sword size={16} />
                  <span>
                    <strong>{option.weapon.name}</strong>
                    <small>{option.supply.ok ? attackOptionDetail(option) : option.supply.message}</small>
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

          {panel === "tactics" && grappleState.grappledTargets?.length > 0 && (
            <div className="nf-state-command-options nf-state-command-tactics">
              <span className="nf-state-command-group">Held creatures</span>
              {grappleState.grappledTargets.map((target) => (
                <button className="nf-state-command-option" type="button" key={`release-${target.id}`} onClick={() => releaseGrapple(target.id)} disabled={busy}>
                  <X size={16} /><span><strong>Release {target.name}</strong><small>Release the grapple without spending an Action.</small></span>
                </button>
              ))}
            </div>
          )}
          {panel === "tactics" && tacticState.ok && (
            <div className="nf-state-command-options nf-state-command-tactics">
              <button className="nf-state-command-option" type="button" onClick={dodge} disabled={busy} title="Spend the Action to Dodge.">
                <ShieldHalf size={16} />
                <span>
                  <strong>Dodge</strong>
                  <small>Every attack against you has disadvantage until your next turn.</small>
                </span>
              </button>
              <button className="nf-state-command-option" type="button" onClick={disengage} disabled={busy} title="Spend the Action to Disengage.">
                <Footprints size={16} />
                <span>
                  <strong>Disengage</strong>
                  <small>Move away without drawing an opportunity attack for the rest of this turn.</small>
                </span>
              </button>
              <button className="nf-state-command-option" type="button" onClick={hide} disabled={busy || !hideState.ok} title={hideState.ok ? "Spend the Action to make a Stealth check." : hideState.message}>
                <EyeOff size={16} />
                <span>
                  <strong>Hide</strong>
                  <small>{hideState.ok ? "Stealth versus each enemy's passive Perception; total cover is required." : hideState.message}</small>
                </span>
              </button>
              <span className="nf-state-command-group">Ready an attack</span>
              <label className="field">
                <span className="label">Trigger</span>
                <select className="sel" value={readyTrigger} onChange={(event) => setReadyTrigger(event.target.value)} disabled={busy || !readyState.ok}>
                  <option value="target-moves">Target moves</option>
                  <option value="target-attacks">Target attacks</option>
                  <option value="target-ends-turn">Target ends its turn</option>
                </select>
              </label>
              {readyState.ok && attackState.ok ? attackState.value.options.map((option) => (
                <button
                  className="nf-state-command-option"
                  type="button"
                  key={`ready-${option.key}`}
                  onClick={() => enterTargeting(() => ready({ trigger: readyTrigger, weaponId: option.weaponId, hand: option.hand, attackId: option.attackId, attackName: option.weapon.name }))}
                  disabled={busy || !option.supply.ok}
                >
                  <Hourglass size={16} />
                  <span><strong>Ready {option.weapon.name}</strong><small>Spend the Action, then choose the triggering enemy.</small></span>
                </button>
              )) : <p className="note">{readyState.message || attackState.message}</p>}
              <span className="nf-state-command-group">Contested attacks</span>
              {grappleState.escape?.ok && (
                <button className="nf-state-command-option" type="button" onClick={escapeGrapple} disabled={busy}>
                  <Footprints size={16} /><span><strong>Escape {grappleState.escape.value.grappler.name}</strong><small>Spend the Action on Athletics or Acrobatics versus the grappler's Athletics.</small></span>
                </button>
              )}
              <button className="nf-state-command-option" type="button" onClick={() => enterTargeting(() => specialAttack("grapple"))} disabled={busy}>
                <HandHelping size={16} /><span><strong>Grapple</strong><small>Athletics versus Athletics or Acrobatics; choose an adjacent enemy.</small></span>
              </button>
              <button className="nf-state-command-option" type="button" onClick={() => enterTargeting(() => specialAttack("shove-prone"))} disabled={busy}>
                <ChevronsRight size={16} /><span><strong>Shove prone</strong><small>Win a contested check to knock an adjacent enemy prone.</small></span>
              </button>
              <button className="nf-state-command-option" type="button" onClick={() => enterTargeting(() => specialAttack("shove-push"))} disabled={busy}>
                <ChevronsRight size={16} /><span><strong>Push 5 feet</strong><small>Win a contested check to push an adjacent enemy into an open square.</small></span>
              </button>
              <span className="nf-state-command-group">Healing potions</span>
              {potionState.ok ? potionState.value.potions.flatMap(({ item, quantity }) => potionState.value.targets.map((target) => (
                <button className="nf-state-command-option" type="button" key={`${item.id}-${target.id}`} onClick={() => drinkPotion(item.id, target.id)} disabled={busy}>
                  <HeartPulse size={16} /><span><strong>{item.name} → {target.name}</strong><small>{item.healingDice}d4 + {item.healingBonus} healing · {quantity} carried</small></span>
                </button>
              ))) : <p className="note">{potionState.message}</p>}
              {helpState.ok
                ? helpState.value.allies.map((ally) => (
                  <button
                    className="nf-state-command-option"
                    key={ally.id}
                    type="button"
                    onClick={() => enterTargeting(() => help(ally.id))}
                    disabled={busy}
                    title={`Spend the Action to Help ${ally.name}, then choose the enemy they are going for.`}
                  >
                    <HandHelping size={16} />
                    <span>
                      <strong>Help {ally.name}</strong>
                      <small>Their next attack on the enemy you pick has advantage.</small>
                    </span>
                  </button>
                ))
                : <p className="note">{helpState.message} {helpState.recovery}</p>}
              {stabilizeState.ok
                ? stabilizeState.value.targets.map((target) => (
                  <button
                    className="nf-state-command-option"
                    key={target.id}
                    type="button"
                    onClick={() => stabilize(target.id)}
                    disabled={busy}
                    title={`Spend the Action on a DC 10 Medicine check to stabilise ${target.name}.`}
                  >
                    <HeartPulse size={16} />
                    <span>
                      <strong>Stabilise {target.name}</strong>
                      <small>DC 10 Medicine. On success, they stop making death saves.</small>
                    </span>
                  </button>
                ))
                : <p className="note">{stabilizeState.message} {stabilizeState.recovery}</p>}
            </div>
          )}
          {panel === "tactics" && !tacticState.ok && (
            <p className="note">{tacticState.message} {tacticState.recovery}</p>
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
              <span className="nf-state-command-group">Fallen</span>
              {lootOptions.map(({ token: body, availability }) => (
                <button
                  className="nf-state-command-option"
                  key={body.id}
                  onClick={() => searchBody(body.id)}
                  disabled={busy || !availability.ok}
                  title={availability.ok ? availability.value.alreadyOpen ? "Resume searching this body" : "Spend Bonus Action and search this body" : availability.message}
                >
                  <PackageOpen size={16} />
                  <span>
                    <strong>Search {body.name}</strong>
                    <small>{availability.ok ? availability.value.alreadyOpen ? "Resume looting" : `${body.inventory.reduce((total, entry) => total + entry.quantity, 0)} items · adjacent` : availability.message}</small>
                  </span>
                </button>
              ))}
              <span className="nf-state-command-group">Physical weapons</span>
              {retrievalOptions.map(({ battleItem, availability }) => {
                const weapon = battleItem.attackId ? null : ITEM_BY_ID[battleItem.itemId];
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
                      <strong>Retrieve {weapon?.name || battleItem.name}</strong>
                      <small>{availability.ok ? `${availability.value.retrievalKind.replaceAll("-", " ")} · ${availability.value.cost}` : availability.message}</small>
                    </span>
                  </button>
                );
              })}
              {!chestOptions.length && !retrievalOptions.length && !lootOptions.length && (
                <p className="note">No Battle chests, fallen creatures or thrown weapons are present in this encounter.</p>
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
            className={`nf-state-command-speed glass${remaining <= 0 ? " nf-state-command-speed-empty" : ""}${resources?.dashed ? " nf-state-command-speed-dashed" : ""}`}
            title={remaining > 0
              ? `${remaining} of ${maximum} feet of movement left this turn.`
              : `${token.name} has used all ${maximum} feet of movement this turn.`}
          >
            {movementModes.length > 1
              ? <select className="nf-state-command-movement-mode" aria-label="Movement mode" value={resources.movementMode || "walk"} onChange={(event) => chooseMovementMode(event.target.value)} disabled={busy}>
                {movementModes.map(({ mode, speed }) => <option value={mode} key={mode}>{mode} {speed}</option>)}
              </select>
              : <em>{resources.movementMode || "walk"}</em>}
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
          disabled={busy || (dying && !stable && !resources.deathSaveRolled)}
          title={dying && !stable && !resources.deathSaveRolled
            ? `${token.name} must roll a death saving throw before ending the turn.`
            : `End ${token.name}'s turn and pass initiative on.`}
        >
          <Hourglass size={26} strokeWidth={1.9} />
          <em>End Turn</em>
        </button>
      </div>
    </div>
  );
}
