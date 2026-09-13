import { ArchiveError } from "./format.js";

/** Merge imports rewrite game identities, never names, prose or catalogue IDs. */
export function remapImportedState(input, assets, missing, idFactory = () => crypto.randomUUID()) {
  const state = structuredClone(input);
  const heroes = new Map(state.heroes.map((hero) => [hero.id, `hero-${idFactory()}`]));
  const scenes = new Map(state.scenes.map((scene) => [scene.id, `scene-${idFactory()}`]));
  const images = new Map([...assets, ...missing].map((asset) => [`${asset.kind}:${asset.key}`, `${asset.kind}-${idFactory()}`]));
  for (const hero of state.heroes) {
    hero.id = heroes.get(hero.id);
    if (hero.portraitKey) hero.portraitKey = images.get(`portrait:${hero.portraitKey}`);
  }
  for (const scene of state.scenes) {
    const ids = new Map();
    for (const record of [...(scene.tokens || []), ...(scene.chests || []), ...(scene.walls || []), ...(scene.encounter?.battleItems || [])]) {
      if (ids.has(record.id)) throw new ArchiveError("archive-merge-ambiguous", "This Scene reuses an identifier across object types. Import it as a separate campaign instead.");
      ids.set(record.id, `object-${idFactory()}`);
    }
    if (scene.encounter?.instanceId) ids.set(scene.encounter.instanceId, `encounter-${idFactory()}`);
    const keyedByToken = new Set(["resources", "initiatives", "setupTokens", "ammoSpentByToken"]);
    const walk = (value, field = "") => {
      if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" && (field.endsWith("Ids") || field === "initiativeOrder") ? ids.get(entry) || entry : walk(entry, field));
      if (!value || typeof value !== "object") {
        if (field === "heroId") return heroes.get(value) || value;
        if (field === "sceneId") return scenes.get(value) || value;
        if ((field === "id" || field.endsWith("Id")) && typeof value === "string") return ids.get(value) || value;
        return value;
      }
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [keyedByToken.has(field) ? ids.get(key) || key : key, walk(entry, key)]));
    };
    const oldId = scene.id;
    Object.assign(scene, walk(scene));
    scene.id = scenes.get(oldId);
    if (scene.artworkKey) scene.artworkKey = images.get(`artwork:${scene.artworkKey}`);
  }
  state.lastActiveSceneId = scenes.get(state.lastActiveSceneId) || null;
  state.pendingArtworkDeletes = [];
  state.campaign = { ...state.campaign, sceneIds: state.scenes.map((scene) => scene.id), heroIds: state.heroes.map((hero) => hero.id) };
  return {
    state,
    assets: assets.map((asset) => ({ ...asset, key: images.get(`${asset.kind}:${asset.key}`) })),
    missing: missing.map((asset) => ({ ...asset, key: images.get(`${asset.kind}:${asset.key}`) })),
  };
}
