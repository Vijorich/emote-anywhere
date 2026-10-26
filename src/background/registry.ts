import { MAX_REGISTRY_BYTES, REGISTRY_TTL_MS } from '../core/config';
import { getState, mutateState } from '../core/state';
import type { AppState, PluginDescriptor, RegistryIndex, RegistryRef } from '../core/types';
import { parseRegistryIndex } from '../core/validate';
import { syncContentScript } from './plugins';

interface MemoryEntry {
  at: number;
  index: RegistryIndex;
}

const memory = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<RegistryIndex>>();
let refreshPromise: Promise<Record<string, string>> | null = null;

export function normalizeRegistryUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error('Registry URL is not valid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Registry URL must use http or https');
  }
  return parsed.toString();
}

export async function fetchRegistry(url: string, force = false): Promise<RegistryIndex> {
  const cached = memory.get(url);
  if (!force && cached && Date.now() - cached.at < REGISTRY_TTL_MS) return cached.index;
  const existing = inflight.get(url);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > MAX_REGISTRY_BYTES) throw new Error('Registry file is too large');
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error('Registry is not valid JSON');
      }
      const index = parseRegistryIndex(parsed);
      memory.set(url, { at: Date.now(), index });
      return index;
    } catch (error) {
      if (cached) return cached.index;
      throw error;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}

function upsertPlugins(
  state: AppState,
  registryId: string,
  descriptors: PluginDescriptor[],
  now: number,
): void {
  for (const descriptor of descriptors) {
    const key = `${registryId}:${descriptor.id}`;
    const existing = state.plugins[key];
    state.plugins[key] = {
      key,
      registryId,
      descriptor,
      enabled: existing?.enabled ?? false,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
    };
  }
}

function applyIndex(state: AppState, registry: RegistryRef, index: RegistryIndex, now: number): void {
  registry.lastCheckedAt = now;
  registry.pluginCount = index.plugins.length;
  if (index.name) registry.name = index.name;
  delete registry.lastError;
  upsertPlugins(state, registry.id, index.plugins, now);
}

export async function refreshRegistries(force = false): Promise<Record<string, string>> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const state = await getState();
    const targets = state.registries.filter((registry) => {
      if (force) return true;
      if (!registry.lastCheckedAt) return true;
      return Date.now() - registry.lastCheckedAt >= REGISTRY_TTL_MS;
    });
    if (!targets.length) return {};

    const results = await Promise.all(
      targets.map(async (registry) => {
        try {
          return { id: registry.id, index: await fetchRegistry(registry.url, force), error: '' };
        } catch (error) {
          return {
            id: registry.id,
            index: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const errors: Record<string, string> = {};
    const now = Date.now();
    await mutateState((next) => {
      for (const result of results) {
        const registry = next.registries.find((item) => item.id === result.id);
        if (!registry) continue;
        if (result.index) {
          applyIndex(next, registry, result.index, now);
        } else {
          registry.lastCheckedAt = now;
          registry.lastError = result.error;
          errors[registry.id] = result.error;
        }
      }
    });
    await syncContentScript();
    return errors;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function addRegistry(urlInput: string, nameInput: string): Promise<RegistryRef> {
  const url = normalizeRegistryUrl(urlInput);
  const index = await fetchRegistry(url, true);
  const id = `reg_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  let created: RegistryRef | null = null;

  await mutateState((state) => {
    if (state.registries.some((registry) => registry.url === url)) {
      throw new Error('This registry is already added');
    }
    const registry: RegistryRef = {
      id,
      name: nameInput.trim() || index.name || new URL(url).hostname,
      url,
    };
    applyIndex(state, registry, index, now);
    state.registries.push(registry);
    created = registry;
  });

  await syncContentScript();
  if (!created) throw new Error('Failed to add registry');
  return created;
}

export async function removeRegistry(id: string): Promise<void> {
  await mutateState((state) => {
    state.registries = state.registries.filter((registry) => registry.id !== id);
    for (const [key, plugin] of Object.entries(state.plugins)) {
      if (plugin.registryId === id) {
        delete state.plugins[key];
        for (const [bindingKey, binding] of Object.entries(state.bindings)) {
          if (binding.pluginKey === key) delete state.bindings[bindingKey];
        }
      }
    }
  });
  memory.clear();
  await syncContentScript();
}

export async function refreshOneRegistry(id: string): Promise<Record<string, string>> {
  const state = await getState();
  const registry = state.registries.find((item) => item.id === id);
  if (!registry) throw new Error('Registry not found');
  const index = await fetchRegistry(registry.url, true);
  await mutateState((next) => {
    const target = next.registries.find((item) => item.id === id);
    if (target) applyIndex(next, target, index, Date.now());
  });
  await syncContentScript();
  return {};
}

export async function bootstrapRegistries(): Promise<void> {
  await refreshRegistries(false);
}
