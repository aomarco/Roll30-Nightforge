const timestamp = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export function orderScenesForLibrary(scenes = []) {
  return [...scenes].sort((left, right) => {
    const recent = timestamp(right.lastOpenedAt) - timestamp(left.lastOpenedAt);
    if (recent) return recent;
    const updated = timestamp(right.updatedAt) - timestamp(left.updatedAt);
    if (updated) return updated;
    const created = timestamp(right.createdAt) - timestamp(left.createdAt);
    if (created) return created;
    return left.id.localeCompare(right.id);
  });
}

export const tableModeForScene = (scene) => {
  if (scene?.kind === "play") return "play";
  return scene?.encounter?.status === "active" || scene?.encounter?.status === "complete"
    ? "battle"
    : "setup";
};

const ACCENTS = Object.freeze([
  "#f2617a",
  "#2fd3b4",
  "#e0b055",
  "#6aa9ff",
  "#b787f5",
  "#df8c52",
]);

export function accentForScene(scene) {
  const source = `${scene?.id || ""}:${scene?.name || ""}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (Math.imul(hash, 31) + source.charCodeAt(index)) | 0;
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

