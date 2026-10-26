import { browser } from 'wxt/browser';
import { DEFAULT_REGISTRY_ID, DEFAULT_REGISTRY_NAME, DEFAULT_REGISTRY_URL, STATE_KEY } from './config';
import { normalizeState } from './validate';
import type { AppSettings, AppState } from './types';

export function createDefaultState(): AppState {
  return {
    version: 1,
    settings: {
      globalMode: false,
      emoteScale: 1,
      autoChannel: true,
      pickerEnabled: true,
      providers: { sevenTv: true, bttv: true, ffz: true },
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
    customSets: [],
  };
}

let writeQueue: Promise<void> = Promise.resolve();

export async function getState(): Promise<AppState> {
  const defaults = createDefaultState();
  let stored: unknown;
  try {
    stored = (await browser.storage.local.get(STATE_KEY))[STATE_KEY];
  } catch {
    return defaults;
  }
  if (!stored) {
    await browser.storage.local.set({ [STATE_KEY]: defaults });
    return defaults;
  }
  return normalizeState(stored, defaults);
}

export function mutateState<T>(
  change: (state: AppState) => T | Promise<T>,
): Promise<{ state: AppState; result: T }> {
  const run = writeQueue.then(async () => {
    const state = await getState();
    const result = await change(state);
    await browser.storage.local.set({ [STATE_KEY]: state });
    return { state, result };
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
