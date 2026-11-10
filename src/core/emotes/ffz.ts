import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';
import { fetchProviderJson } from './http';

interface FfzEmoticon {
  id?: number;
  name?: string;
  urls?: Record<string, string>;
}

interface FfzSet {
  emoticons?: FfzEmoticon[];
}

interface FfzGlobal {
  default_sets?: number[];
  sets?: Record<string, FfzSet>;
}

interface FfzRoom {
  sets?: Record<string, FfzSet>;
}

// The FFZ API returns https URLs, sometimes protocol-relative. Anything else
// is not loaded; the CDN fallback below keeps the emote usable.
function emoteUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value.startsWith('https://')) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return undefined;
}

function normalize(sets: FfzSet[]): Emote[] {
  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const set of sets) {
    for (const item of set.emoticons ?? []) {
      const code = (item.name ?? '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const urls = item.urls ?? {};
      const url =
        emoteUrl(urls['2']) ??
        emoteUrl(urls['1']) ??
        emoteUrl(urls['4']) ??
        (item.id ? `https://cdn.frankerfacez.com/emoticon/${item.id}/2` : undefined);
      if (!url) continue;
      emotes.push({ code, url, flags: 0, provider: 'ffz' });
    }
  }
  return emotes;
}

export async function fetchFfzGlobal(): Promise<Emote[]> {
  return cached(
    'ffz:global',
    GLOBAL_TTL_MS,
    async () => {
      const data = await fetchProviderJson<FfzGlobal>(
        'https://api.frankerfacez.com/v1/set/global',
      );
      const ids = data.default_sets ?? [];
      const sets = ids.map((id) => data.sets?.[String(id)]).filter((set): set is FfzSet => !!set);
      return normalize(sets);
    },
    { staleWhileRevalidate: true },
  );
}

export async function fetchFfzChannel(id: string): Promise<Emote[]> {
  if (!/^\d{1,32}$/.test(id)) throw new Error('Invalid Twitch user id');
  return cached(
    `ffz:channel:${id}`,
    SET_TTL_MS,
    async () => {
      const data = await fetchProviderJson<FfzRoom>(
        `https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(id)}`,
      );
      return normalize(Object.values(data.sets ?? {}));
    },
    { staleWhileRevalidate: true },
  );
}
