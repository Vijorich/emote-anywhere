import { browser } from 'wxt/browser';
import {
  PROVIDER_COOLDOWN_MS,
  PROVIDER_HEALTH_KEY,
  PROVIDER_HEALTH_THRESHOLD,
} from '../config';

interface HealthEntry {
  failures: number;
  until: number;
}

type HealthMap = Record<string, HealthEntry>;

let memory: HealthMap | null = null;
let loading: Promise<HealthMap> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function load(): Promise<HealthMap> {
  if (memory) return memory;
  if (!loading) {
    loading = (async () => {
      try {
        const stored = (await browser.storage.local.get(PROVIDER_HEALTH_KEY))[PROVIDER_HEALTH_KEY];
        memory = stored && typeof stored === 'object' ? (stored as HealthMap) : {};
      } catch {
        memory = {};
      }
      return memory;
    })();
  }
  return loading;
}

function persist(): void {
  if (!memory) return;
  const snapshot = { ...memory };
  writeQueue = writeQueue
    .then(() => browser.storage.local.set({ [PROVIDER_HEALTH_KEY]: snapshot }))
    .catch(() => undefined);
}

export async function isProviderBlocked(url: string): Promise<boolean> {
  const health = await load();
  const host = hostOf(url);
  const entry = health[host];
  if (!entry) return false;
  if (entry.until > 0 && entry.until <= Date.now()) {
    delete health[host];
    persist();
    return false;
  }
  return entry.until > Date.now();
}

export async function recordProviderFailure(url: string): Promise<void> {
  const health = await load();
  const host = hostOf(url);
  const previous = health[host] ?? { failures: 0, until: 0 };
  const failures = previous.failures + 1;
  health[host] = {
    failures,
    until:
      failures >= PROVIDER_HEALTH_THRESHOLD ? Date.now() + PROVIDER_COOLDOWN_MS : previous.until,
  };
  persist();
}

export async function recordProviderSuccess(url: string): Promise<void> {
  const health = await load();
  const host = hostOf(url);
  if (!health[host]) return;
  delete health[host];
  persist();
}

export async function resetProviderHealth(): Promise<void> {
  memory = {};
  loading = null;
  await browser.storage.local.remove(PROVIDER_HEALTH_KEY).catch(() => undefined);
}

export async function providerHealthSnapshot(): Promise<HealthMap> {
  return { ...(await load()) };
}
