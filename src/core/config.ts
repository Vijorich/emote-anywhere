export const DEFAULT_REGISTRY_NAME = 'Emote Anywhere';

export const PROJECT_URL = 'https://github.com/Vijorich/emote-anywhere';
export const PLUGIN_DOC_URL = `${PROJECT_URL}/blob/main/registry/PLUGIN_API.md`;

export const DEFAULT_REGISTRY_URL =
  import.meta.env.WXT_DEFAULT_REGISTRY_URL ??
  'https://raw.githubusercontent.com/Vijorich/emote-anywhere/main/registry/index.json';

export const DEFAULT_REGISTRY_ID = 'default';

/** Built content script, relative to the extension root. */
export const CONTENT_SCRIPT_FILE = 'chat.js';

export const CACHE_KEY = 'emote-cache';
export const STATE_KEY = 'state';

export const SET_TTL_MS = 60 * 60 * 1000;
export const GLOBAL_TTL_MS = 6 * 60 * 60 * 1000;
export const REGISTRY_TTL_MS = 15 * 60 * 1000;

export const MAX_PLUGIN_BYTES = 256 * 1024;
export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;

export const EMOTE_BASE_HEIGHT_EM = 1.5;
