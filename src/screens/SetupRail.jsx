import { useEffect, useState } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MoreHorizontal,
  Package,
  PenLine,
  RotateCcw,
  Skull,
  Ruler,
  Trash2,
  UserPlus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const initials = (name) => (name || "?")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0])
  .join("")
  .toUpperCase() || "?";

function RailButton({ icon: Icon, label, onClick, active = false, hazard = false, disabled = false, title }) {
  return (
    <button
      className={`nf-state-rail-key${active ? " nf-state-rail-key-on" : ""}${hazard ? " nf-state-rail-key-hazard" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={title || label}
    >
      <Icon size={19} strokeWidth={1.9} />
      <span className="nf-state-rail-label">{label}</span>
    </button>
  );
}

/**
 * The permanent tool rail for Setup.
 *
 * Everything here used to live inside a modal that you reached from a "5 ft"
 * chip in the corner, which meant the tools were two clicks away and invisible
 * until you went looking. On the rail the active tool is always on screen and
 * always one click away, which is how an editing tool behaves.
 */
export default function SetupRail({
  activeTool = null,
  chooseTool,
  heroes = [],
  summonToken,
  openMonsterBrowser,
  addChest,
  zoomIn,
  zoomOut,
  resetView,
  toggleWalls,
  wallsVisible = true,
  canAdjustArtwork = false,
  busy = false,
  pickerOpen = false,
  setPickerOpen,
  initialCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setPickerOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen, setPickerOpen]);

  const pick = (heroId) => {
    setPickerOpen(false);
    summonToken(heroId);
  };

  const browseMonsters = () => {
    setPickerOpen(false);
    openMonsterBrowser();
  };

  return (
    <aside className={`nf-state-rail glass grained${collapsed ? " nf-state-rail-collapsed" : ""}`} aria-label="Scene tools">
      <div className="nf-state-rail-group">
        <RailButton
          icon={UserPlus}
          label="Add token"
          active={pickerOpen}
          disabled={busy}
          onClick={() => setPickerOpen(!pickerOpen)}
        />
        <RailButton icon={Package} label="Add chest" disabled={busy} onClick={addChest} />
      </div>

      <span className="nf-state-rail-div" />

      <div className="nf-state-rail-group">
        <RailButton
          icon={PenLine}
          label="Wall"
          title="Wall — blocks movement and line of sight"
          active={activeTool === "wall-full"}
          onClick={() => chooseTool("wall-full")}
        />
        <RailButton
          icon={MoreHorizontal}
          label="Half wall"
          title="Half wall — blocks movement, not sight"
          active={activeTool === "wall-half"}
          onClick={() => chooseTool("wall-half")}
        />
        <RailButton
          icon={Ruler}
          label="Ruler"
          title="Ruler — drag across the board to measure"
          active={activeTool === "ruler"}
          onClick={() => chooseTool("ruler")}
        />
        <RailButton
          icon={ImageIcon}
          label="Backdrop"
          title={canAdjustArtwork ? "Backdrop — drag to move, pull a corner to resize" : "Upload a backdrop from Scene settings first"}
          active={activeTool === "artwork"}
          disabled={!canAdjustArtwork}
          onClick={() => chooseTool("artwork")}
        />
        <RailButton
          icon={wallsVisible ? Eye : EyeOff}
          label={wallsVisible ? "Hide walls" : "Show walls"}
          onClick={toggleWalls}
        />
      </div>

      <span className="nf-state-rail-div" />

      <RailButton
        icon={Trash2}
        label="Delete"
        title="Delete — click an object, or drag a box over several"
        hazard
        active={activeTool === "delete"}
        onClick={() => chooseTool("delete")}
      />

      <span className="nf-state-rail-div" />

      <div className="nf-state-rail-group">
        <RailButton icon={ZoomIn} label="Zoom in" onClick={zoomIn} />
        <RailButton icon={ZoomOut} label="Zoom out" onClick={zoomOut} />
        <RailButton icon={RotateCcw} label="Reset view" onClick={resetView} />
      </div>

      <button
        className="nf-state-rail-collapse"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? "Expand the tool rail" : "Collapse the tool rail"}
        aria-expanded={!collapsed}
      >
        <ChevronDown size={16} />
      </button>

      {pickerOpen && (
        <>
          <span className="nf-state-rail-veil" onClick={() => setPickerOpen(false)} />
          <div className="nf-state-rail-picker glass grained" role="menu" aria-label="Choose what to add">
            <button className="nf-state-rail-picker-item" role="menuitem" onClick={() => pick("")}>
              <span className="nf-state-rail-picker-face nf-state-rail-picker-blank">+</span>
              Blank token
            </button>
            <button className="nf-state-rail-picker-item" role="menuitem" onClick={browseMonsters}>
              <span className="nf-state-rail-picker-face nf-state-rail-picker-bestiary"><Skull size={15} /></span>
              Monster…
            </button>
            {heroes.map((hero) => (
              <button className="nf-state-rail-picker-item" role="menuitem" key={hero.id} onClick={() => pick(hero.id)}>
                <span className="nf-state-rail-picker-face">{initials(hero.name)}</span>
                {hero.name}
              </button>
            ))}
            {!heroes.length && <p className="note">Create a hero to drop one onto the board.</p>}
          </div>
        </>
      )}
    </aside>
  );
}
