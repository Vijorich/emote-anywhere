import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';

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
  room?: { set?: number };
  sets?: Record<string, FfzSet>;
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
        urls['2'] ??
        urls['1'] ??
        urls['4'] ??
        (item.id ? `https://cdn.frankerfacez.com/emoticon/${item.id}/2` : '');
      if (!url) continue;
      emotes.push({ code, url, flags: 0, provider: 'ffz' });
    }
  }
  return emotes;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchFfzGlobal(): Promise<Emote[]> {
  return cached('ffz:global', GLOBAL_TTL_MS, async () => {
    const data = await getJson<FfzGlobal>('https://api.frankerfacez.com/v1/set/global');
    const ids = data.default_sets ?? [];
    const sets = ids.map((id) => data.sets?.[String(id)]).filter((set): set is FfzSet => !!set);
    return normalize(sets);
  });
}

export async function fetchFfzChannel(twitchLogin: string): Promise<Emote[]> {
  return cached(`ffz:channel:${twitchLogin}`, SET_TTL_MS, async () => {
    const data = await getJson<FfzRoom>(
      `https://api.frankerfacez.com/v1/room/twitch/${encodeURIComponent(twitchLogin)}`,
    );
    const setId = data.room?.set;
    const set = setId !== undefined ? data.sets?.[String(setId)] : undefined;
    return normalize(set ? [set] : []);
  });
}
