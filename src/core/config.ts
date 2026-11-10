export const DEFAULT_REGISTRY_NAME = 'Emote Anywhere';

export const PROJECT_URL = 'https://github.com/Vijorich/emote-anywhere';
export const PLUGIN_DOC_URL = `${PROJECT_URL}/blob/main/registry/PLUGIN_API.md`;
export const PRIVACY_URL = `${PROJECT_URL}/blob/main/PRIVACY.md`;
export const RELEASES_URL = `${PROJECT_URL}/releases`;

/** Published from registry/ by .github/workflows/pages.yml. */
export const DEFAULT_REGISTRY_URL =
  import.meta.env.WXT_DEFAULT_REGISTRY_URL ??
  'https://vijorich.github.io/emote-anywhere/index.json';

export const DEFAULT_REGISTRY_ID = 'default';

/** Built content script, relative to the extension root. */
export const CONTENT_SCRIPT_FILE = 'chat.js';

export const CACHE_KEY = 'emote-cache';
export const STATE_KEY = 'state';

export const SET_TTL_MS = 60 * 60 * 1000;
export const GLOBAL_TTL_MS = 6 * 60 * 60 * 1000;
export const REGISTRY_TTL_MS = 15 * 60 * 1000;

/** Expired data stays available for stale-while-revalidate and offline fallback. */
export const STALE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PROVIDER_TIMEOUT_MS = 6_000;
export const PROVIDER_RETRY_DELAY_MS = 400;
export const PROVIDER_HEALTH_KEY = 'provider-health';
export const PROVIDER_HEALTH_THRESHOLD = 2;
export const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;

export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
/** Provider payloads are trusted APIs, but not unbounded. */
export const MAX_PROVIDER_BYTES = 4 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

/** Published next to the registry by the snapshot workflow. */
export const EMOTE_SNAPSHOT_BASE_URL =
  import.meta.env.WXT_EMOTE_SNAPSHOT_URL ??
  'https://vijorich.github.io/emote-anywhere/emotes';

/** Bumped by cache/clear so closed pages drop their image cache on next open. */
export const IMAGE_CACHE_EPOCH_KEY = 'image-cache-epoch';
/** Bumped by cache/clear so closed pages re-fetch a full registration. */
export const REGISTRATION_EPOCH_KEY = 'registration-epoch';

/** Storage.local is ~10 MB without unlimitedStorage. Keep headroom. */
export const MAX_CACHE_BYTES = 4 * 1024 * 1024;
export const MAX_STATE_BYTES = 5 * 1024 * 1024;

export const MAX_CUSTOM_SETS = 50;
export const MAX_CUSTOM_SET_EMOTES = 5_000;
export const MAX_TOTAL_CUSTOM_EMOTES = 20_000;
/** Upper bound for a resolved chat set sent to a content script. */
export const MAX_RESOLVED_EMOTES = 30_000;

export const MIN_EMOTE_SCALE = 0.5;
export const MAX_EMOTE_SCALE = 3;

/** In-memory iframe context entries older than this are ignored. */
export const FRAME_CONTEXT_TTL_MS = 10 * 60 * 1000;
export const FRAME_CONTEXT_KEY = 'frame-contexts';

export const EMOTE_BASE_HEIGHT_EM = 1.5;
