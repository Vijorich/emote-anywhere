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

export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
/** Provider payloads are trusted APIs, but not unbounded. */
export const MAX_PROVIDER_BYTES = 4 * 1024 * 1024;

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
