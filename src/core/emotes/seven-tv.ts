import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import { DEFAULT_GLOBAL_SET_IDS } from '../defaults';
import type { Emote } from '../types';

import { cached } from './cache';
import { fetchProviderJson } from './http';
import { fetchSevenTvGlobalMirror } from './mirrors';
import { sevenTvGlobalSnapshot, sevenTvSetSnapshot } from './snapshots';

const USER_ID_RE = {
  twitch: /^\d{1,32}$/,
  youtube: /^UC[A-Za-z0-9_-]{22}$/,
  kick: /^\d{1,32}$/,
};

interface SevenTvFile {
  name?: string;
  width?: number;
  height?: number;
}

interface SevenTvHost {
  url?: string;
  files?: SevenTvFile[];
}

interface SevenTvEmoteData {
  name?: string;
  flags?: number;
  host?: SevenTvHost;
}

interface SevenTvEmote {
  id?: string;
  name?: string;
  flags?: number;
  data?: SevenTvEmoteData | null;
}

interface SevenTvSet {
  id?: string;
  name?: string;
  emotes?: SevenTvEmote[];
}

interface SevenTvUser {
  emote_set?: SevenTvSet | null;
}

export interface SevenTvSetData {
  name: string;
  emotes: Emote[];
}

export interface SevenTvRequestOptions {
  /** Optional self-hosted mirror that serves /v3/* and /cdn/*. */
  proxyUrl?: string;
}

function apiUrl(path: string, options: SevenTvRequestOptions): string {
  const base = (options.proxyUrl ?? 'https://7tv.io').replace(/\/$/, '');
  return `${base}${path}`;
}

function pickFile(files: SevenTvFile[] | undefined): SevenTvFile | undefined {
  if (!files?.length) return undefined;
  // AVIF is roughly a quarter of the WebP payload on cdn.7tv.app, which keeps
  // the per-emote background proxy well inside its request timeout.
  const preferred = ['2x.avif', '1x.avif', '2x.webp', '1x.webp', '2x.png', '1x.png'];
  for (const name of preferred) {
    const file = files.find((item) => item.name === name);
    if (file) return file;
  }
  return files.find((item) => item.name?.includes('2x')) ?? files[0];
}

function imageUrl(emote: SevenTvEmote, host: SevenTvHost | undefined, file: SevenTvFile | undefined): string {
  const base = host?.url;
  if (base && file?.name) {
    const normalized = base.startsWith('//') ? `https:${base}` : base;
    return `${normalized.replace(/\/$/, '')}/${file.name}`;
  }
  return `https://cdn.7tv.app/emote/${emote.id ?? ''}/2x.webp`;
}

export function normalizeSevenTvSet(set: SevenTvSet | null | undefined): SevenTvSetData {
  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const emote of set?.emotes ?? []) {
    const data = emote.data;
    if (!data) continue;
    const code = (emote.name ?? data.name ?? '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const file = pickFile(data.host?.files);
    emotes.push({
      code,
      url: imageUrl(emote, data.host, file),
      flags: (emote.flags ?? 0) | (data.flags ?? 0),
      provider: '7tv',
    });
  }
  return { name: set?.name ?? '7TV set', emotes };
}

export async function fetchSevenTvSet(
  id: string,
  options: SevenTvRequestOptions = {},
): Promise<SevenTvSetData> {
  return cached(
    `7tv:set:${id}`,
    SET_TTL_MS,
    async () => {
      try {
        const set = await fetchProviderJson<SevenTvSet>(
          apiUrl(`/v3/emote-sets/${encodeURIComponent(id)}`, options),
          { timeoutMs: 4_000, retries: 0 },
        );
        return normalizeSevenTvSet(set);
      } catch (error) {
        const snapshot = await sevenTvSetSnapshot(id);
        if (snapshot) return { name: snapshot.name, emotes: snapshot.emotes };
        // The built-in default set is a convenience, not a hard requirement.
        // If it is unavailable, its global sibling is still better than an
        // empty global layer on a blocked network.
        if (DEFAULT_GLOBAL_SET_IDS.includes(id)) {
          const globalSnapshot = await sevenTvGlobalSnapshot();
          if (globalSnapshot?.emotes.length) {
            return {
              name: `${globalSnapshot.name} (default fallback)`,
              emotes: globalSnapshot.emotes,
            };
          }
          try {
            const global = await fetchSevenTvGlobal(options);
            if (global.emotes.length) {
              return { name: `${global.name} (default fallback)`, emotes: global.emotes };
            }
          } catch {
            // Preserve the original set error below.
          }
        }
        throw error;
      }
    },
    { staleWhileRevalidate: true },
  );
}

export async function fetchSevenTvGlobal(
  options: SevenTvRequestOptions = {},
): Promise<SevenTvSetData> {
  return cached(
    '7tv:global',
    GLOBAL_TTL_MS,
    async () => {
      try {
        const set = await fetchProviderJson<SevenTvSet>(
          apiUrl('/v3/emote-sets/global', options),
          { timeoutMs: 4_000, retries: 0 },
        );
        const normalized = normalizeSevenTvSet(set);
        if (!normalized.emotes.length) throw new Error('7TV returned no global emotes');
        return normalized;
      } catch (error) {
        // Snapshot before mirrors: it has zero-width flags and is one request.
        const snapshot = await sevenTvGlobalSnapshot();
        if (snapshot) return { name: snapshot.name, emotes: snapshot.emotes };
        const mirror = await fetchSevenTvGlobalMirror();
        if (mirror) return { name: mirror.name, emotes: mirror.emotes };
        throw error;
      }
    },
    { staleWhileRevalidate: true },
  );
}

export async function fetchSevenTvUser(
  platform: 'twitch' | 'youtube' | 'kick',
  id: string,
  options: SevenTvRequestOptions = {},
): Promise<SevenTvSetData> {
  if (!USER_ID_RE[platform].test(id)) throw new Error(`Invalid ${platform} user id`);
  return cached(
    `7tv:user:${platform}:${id}`,
    SET_TTL_MS,
    async () => {
      const user = await fetchProviderJson<SevenTvUser>(
        apiUrl(`/v3/users/${platform}/${encodeURIComponent(id)}`, options),
        { timeoutMs: 4_000, retries: 0 },
      );
      return normalizeSevenTvSet(user.emote_set);
    },
    { staleWhileRevalidate: true },
  );
}


