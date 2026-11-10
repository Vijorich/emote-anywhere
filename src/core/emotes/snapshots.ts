import { EMOTE_SNAPSHOT_BASE_URL } from '../config';
import type { Emote, EmoteProvider } from '../types';
import { fetchProviderJson } from './http';
import { isAllowedImageUrl } from './image-urls';

export interface SnapshotFile {
  schemaVersion: 1;
  fetchedAt: string;
  provider: EmoteProvider;
  id?: string;
  name: string;
  emotes: Emote[];
}

const PROVIDERS = new Set<EmoteProvider>(['7tv', 'bttv', 'ffz', 'twitch']);
const CODE_RE = /^\S{1,64}$/;
const MAX_SNAPSHOT_EMOTES = 30_000;

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  return isAllowedImageUrl(trimmed) ? trimmed : null;
}

export function parseSnapshot(value: unknown): SnapshotFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Snapshot is not an object');
  }
  const raw = value as Record<string, unknown>;
  if (raw['schemaVersion'] !== 1) throw new Error('Unsupported snapshot version');
  if (typeof raw['fetchedAt'] !== 'string') throw new Error('Snapshot has no fetchedAt');
  const provider = raw['provider'];
  if (typeof provider !== 'string' || !PROVIDERS.has(provider as EmoteProvider)) {
    throw new Error('Snapshot has an unsupported provider');
  }
  const name = typeof raw['name'] === 'string' ? raw['name'].trim().slice(0, 200) : '';
  if (!name) throw new Error('Snapshot has no name');
  if (!Array.isArray(raw['emotes'])) throw new Error('Snapshot has no emotes');
  if (raw['emotes'].length > MAX_SNAPSHOT_EMOTES) throw new Error('Snapshot is too large');

  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const item of raw['emotes']) {
    if (!item || typeof item !== 'object') continue;
    const emote = item as Record<string, unknown>;
    const code = typeof emote['code'] === 'string' ? emote['code'].trim() : '';
    if (!code || !CODE_RE.test(code) || seen.has(code)) continue;
    const url = httpUrl(emote['url']);
    if (!url) continue;
    const flags = emote['flags'];
    if (flags !== undefined && (!Number.isInteger(flags) || (flags as number) < 0)) continue;
    seen.add(code);
    emotes.push({
      code,
      url,
      flags: typeof flags === 'number' ? flags : 0,
      provider: provider as EmoteProvider,
    });
  }
  if (!emotes.length) throw new Error('Snapshot has no usable emotes');
  return {
    schemaVersion: 1,
    fetchedAt: raw['fetchedAt'],
    provider: provider as EmoteProvider,
    ...(typeof raw['id'] === 'string' ? { id: raw['id'] } : {}),
    name,
    emotes,
  };
}

export async function fetchSnapshot(name: string): Promise<SnapshotFile | null> {
  const base = EMOTE_SNAPSHOT_BASE_URL.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(name)}`;
  try {
    const data = await fetchProviderJson<unknown>(url, { timeoutMs: 6_000, retries: 0 });
    return parseSnapshot(data);
  } catch {
    return null;
  }
}

export function sevenTvGlobalSnapshot(): Promise<SnapshotFile | null> {
  return fetchSnapshot('7tv-global.json');
}

export function sevenTvSetSnapshot(id: string): Promise<SnapshotFile | null> {
  return fetchSnapshot(`7tv-set-${id}.json`);
}

export function twitchGlobalSnapshot(): Promise<SnapshotFile | null> {
  return fetchSnapshot('twitch-global.json');
}
