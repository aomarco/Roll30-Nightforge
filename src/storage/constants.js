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

/** A deployment path is not a storage boundary. Keep the established production
 * identifiers, and require every other runtime to use its own namespace. */
export function storageIdentity(environment = "development") {
  if (!["production", "preview", "development", "test"].includes(environment)) {
    throw new TypeError(`Unknown Nightforge storage environment: ${environment}`);
  }
  const namespace = environment === "production" ? "roll30-nightforge" : `roll30-nightforge-${environment}`;
  return Object.freeze({
    environment,
    namespace,
    keys: environment === "production" ? STORAGE_KEYS : Object.freeze({
      state: `${namespace}-v1:state`,
      backup: `${namespace}-v1:state-backup`,
      session: `${namespace}-v1:session`,
    }),
    artworkDatabase: `${namespace}-assets`,
    portraitDatabase: `${namespace}-portraits`,
    vaultDatabase: `${namespace}-vault`,
    lock: `${namespace}:writer`,
    channel: `${namespace}:changes`,
  });
}

export const FORBIDDEN_LEGACY_STORAGE_IDENTIFIERS = Object.freeze([
  "roll30-maps",
  "roll30-active-map",
  "roll30-characters",
  "roll30-assets",
]);
