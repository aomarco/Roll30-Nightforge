export const NIGHTFORGE_SCHEMA_VERSION = 1;
export const NIGHTFORGE_ENCOUNTER_VERSION = 1;

export const STORAGE_KEYS = Object.freeze({
  state: "roll30-nightforge-v1:state",
  backup: "roll30-nightforge-v1:state-backup",
  session: "roll30-nightforge-v1:session",
});

export const ARTWORK_DATABASE = "roll30-nightforge-assets";
export const ARTWORK_STORE = "scene-artwork";

export const FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS = Object.freeze([
  "roll30-maps",
  "roll30-active-map",
  "roll30-characters",
  "roll30-assets",
]);

