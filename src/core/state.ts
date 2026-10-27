import { browser } from 'wxt/browser';
import {
  DEFAULT_REGISTRY_ID,
  DEFAULT_REGISTRY_NAME,
  DEFAULT_REGISTRY_URL,
  MAX_STATE_BYTES,
  STATE_KEY,
} from './config';
import { DEFAULT_GLOBAL_SET_IDS, DEFAULT_SETTINGS } from './defaults';
import { normalizeState } from './validate';
import type { AppSettings, AppState } from './types';

export function createDefaultState(): AppState {
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      providers: { ...DEFAULT_SETTINGS.providers },
    },
    registries: [
      {
        id: DEFAULT_REGISTRY_ID,
        name: DEFAULT_REGISTRY_NAME,
        url: DEFAULT_REGISTRY_URL,
        builtin: true,
      },
    ],
    plugins: {},
    bindings: {},
    globalBinding: { sets: [...DEFAULT_GLOBAL_SET_IDS] },
    customSets: [],
  };
}

let writeQueue: Promise<void> = Promise.resolve();
let cachedState: AppState | null = null;

/** Background reads state on nearly every RPC; drop the cache on writes from other contexts. */
export function onStateStorageChanged(changes: Record<string, unknown>, area: string): void {
  if (area === 'local' && changes[STATE_KEY]) cachedState = null;
}

browser?.storage?.onChanged?.addListener(onStateStorageChanged);

/** Clears the memoized state. Used between tests and after a failed write. */
export function resetStateCache(): void {
  cachedState = null;
}

export async function getState(): Promise<AppState> {
  if (cachedState) return cachedState;
  const defaults = createDefaultState();
  let stored: unknown;
  try {
    stored = (await browser.storage.local.get(STATE_KEY))[STATE_KEY];
  } catch (error) {
    // Never substitute defaults for a failed read: the next mutation would
    // overwrite the real state with defaults.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read extension state: ${message}`);
  }
  cachedState = stored ? normalizeState(stored, defaults) : defaults;
  return cachedState;
}

function assertStateSize(state: AppState): void {
  const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  if (bytes > MAX_STATE_BYTES) {
    throw new Error('Extension state is too large. Remove some custom sets or chat sets.');
  }
}

export function mutateState<T>(
  change: (state: AppState) => T | Promise<T>,
): Promise<{ state: AppState; result: T }> {
  const run = writeQueue.then(async () => {
    try {
      const state = await getState();
      const result = await change(state);
      assertStateSize(state);
      await browser.storage.local.set({ [STATE_KEY]: state });
      return { state, result };
    } catch (error) {
      // The mutation may have changed the memoized object before it failed.
      resetStateCache();
      throw error;
    }
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppState> {
  return (
    await mutateState((state) => {
      state.settings = {
        ...state.settings,
        ...patch,
        providers: { ...state.settings.providers, ...(patch.providers ?? {}) },
      };
    })
  ).state;
}
