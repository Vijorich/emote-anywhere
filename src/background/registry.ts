import { MAX_REGISTRY_BYTES, REGISTRY_TTL_MS } from '../core/config';
import { getState, mutateState } from '../core/state';
import type { AppState, PluginDescriptor, RegistryIndex, RegistryRef } from '../core/types';
import { parseRegistryIndex } from '../core/validate';
import { syncContentScript } from './plugins';

interface MemoryEntry {
  at: number;
  index: RegistryIndex;
}

interface RegistryFetchResult {
  index: RegistryIndex;
  stale: boolean;
  error: string;
}

const memory = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<RegistryFetchResult>>();
const refreshPromises = new Map<boolean, Promise<Record<string, string>>>();

export function normalizeRegistryUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error('Enter a full registry URL that starts with http:// or https://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Registry URL must start with http:// or https://.');
  }
  return parsed.toString();
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)) || 'Registry refresh failed';
}

async function readRegistryBody(response: Response): Promise<string> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_REGISTRY_BYTES) throw new Error('Registry file is too large');
    return new TextDecoder().decode(buffer);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        chunks.push(decoder.decode());
        return chunks.join('');
      }
      bytes += value.byteLength;
      if (bytes > MAX_REGISTRY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Registry file is too large');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

async function fetchRegistryResult(url: string, force: boolean): Promise<RegistryFetchResult> {
  const cached = memory.get(url);
  if (!force && cached && Date.now() - cached.at < REGISTRY_TTL_MS) {
    return { index: cached.index, stale: false, error: '' };
  }
  const key = `${force ? 'forced' : 'normal'}:${url}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `Registry returned HTTP ${response.status}. Check the URL and try again.`,
        );
      }
      const body = await readRegistryBody(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error('Registry is not valid JSON');
      }
      const index = parseRegistryIndex(parsed);
      memory.set(url, { at: Date.now(), index });
      return { index, stale: false, error: '' };
    } catch (error) {
      if (cached && !force) {
        return { index: cached.index, stale: true, error: errorMessage(error) };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}

export async function fetchRegistry(url: string, force = false): Promise<RegistryIndex> {
  return (await fetchRegistryResult(url, force)).index;
}

function syncPlugins(
  state: AppState,
  registryId: string,
  descriptors: PluginDescriptor[],
  now: number,
): void {
  const existingForRegistry = Object.values(state.plugins).filter(
    (plugin) => plugin.registryId === registryId,
  ).length;
  if (!descriptors.length && existingForRegistry) {
    throw new Error('Registry returned no plugins; keeping the existing plugins');
  }
  const expected = new Set<string>();
  for (const descriptor of descriptors) {
    const key = `${registryId}:${descriptor.id}`;
    expected.add(key);
    const existing = state.plugins[key];
    const updatedAt =
      existing && JSON.stringify(existing.descriptor) === JSON.stringify(descriptor)
        ? existing.updatedAt
        : now;
    state.plugins[key] = {
      key,
      registryId,
      descriptor,
      enabled: existing?.enabled ?? false,
      addedAt: existing?.addedAt ?? now,
      updatedAt,
    };
  }
  for (const [key, plugin] of Object.entries(state.plugins)) {
    if (plugin.registryId !== registryId || expected.has(key)) continue;
    delete state.plugins[key];
    for (const [bindingKey, binding] of Object.entries(state.bindings)) {
      if (binding.pluginKey === key) delete state.bindings[bindingKey];
    }
  }
}

function applyIndex(state: AppState, registry: RegistryRef, index: RegistryIndex, now: number): void {
  registry.lastCheckedAt = now;
  registry.pluginCount = index.plugins.length;
  if (index.name && !registry.name) registry.name = index.name;
  delete registry.lastError;
  syncPlugins(state, registry.id, index.plugins, now);
}

export async function refreshRegistries(force = false): Promise<Record<string, string>> {
  const existing = refreshPromises.get(force);
  if (existing) return existing;

  const request = (async () => {
    const state = await getState();
    const targets = state.registries.filter((registry) => {
      if (force) return true;
      if (!registry.lastCheckedAt) return true;
      return Date.now() - registry.lastCheckedAt >= REGISTRY_TTL_MS;
    });
    if (!targets.length) {
      await syncContentScript();
      return {};
    }

    const results = await Promise.all(
      targets.map(async (registry) => {
        try {
          const result = await fetchRegistryResult(registry.url, force);
          return {
            id: registry.id,
            index: result.stale ? null : result.index,
            error: result.error,
          };
        } catch (error) {
          return { id: registry.id, index: null, error: errorMessage(error) };
        }
      }),
    );

    const current = await getState();
    const checked = results.map((result) => {
      if (!result.index) return result;
      const existing = Object.values(current.plugins).filter(
        (plugin) => plugin.registryId === result.id,
      ).length;
      if (!result.index.plugins.length && existing) {
        return {
          ...result,
          index: null,
          error: 'Registry returned no plugins; keeping the existing plugins',
        };
      }
      return result;
    });

    const errors: Record<string, string> = {};
    const now = Date.now();
    await mutateState((next) => {
      for (const result of checked) {
        const registry = next.registries.find((item) => item.id === result.id);
        if (!registry) continue;
        if (result.index) {
          applyIndex(next, registry, result.index, now);
        } else {
          registry.lastError = result.error;
          errors[registry.id] = result.error;
        }
      }
    });
    await syncContentScript();
    return errors;
  })();

  refreshPromises.set(force, request);
  try {
    return await request;
  } finally {
    if (refreshPromises.get(force) === request) refreshPromises.delete(force);
  }
}

export async function addRegistry(urlInput: string, nameInput: string): Promise<RegistryRef> {
  const url = normalizeRegistryUrl(urlInput);
  const index = await fetchRegistry(url, true);
  const id = `reg_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  let created: RegistryRef | null = null;

  await mutateState((state) => {
    if (state.registries.some((registry) => registry.url === url)) {
      throw new Error('This registry is already added. Remove it first or use a different URL.');
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
  if (!registry) throw new Error('Registry not found. Refresh Sources and try again.');
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
