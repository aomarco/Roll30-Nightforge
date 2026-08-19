export const NIGHTFORGE_SCHEMA_VERSION = 1;
export const NIGHTFORGE_ENCOUNTER_VERSION = 1;

export const STORAGE_KEYS = Object.freeze({
  state: "roll30-nightforge-v1:state",
  backup: "roll30-nightforge-v1:state-backup",
  session: "roll30-nightforge-v1:session",
});

export const ARTWORK_DATABASE = "roll30-nightforge-assets";
export const ARTWORK_STORE = "scene-artwork";

/**
 * Hero portraits live in their own database so the Scene artwork orphan sweep
 * can never mistake a portrait for an unreferenced Scene image and delete it.
 */
export const PORTRAIT_DATABASE = "roll30-nightforge-portraits";
export const PORTRAIT_STORE = "hero-portrait";

export const FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS = Object.freeze([
  "roll30-maps",
  "roll30-active-map",
  "roll30-characters",
  "roll30-assets",
]);

