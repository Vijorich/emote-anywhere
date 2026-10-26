import { GLOBAL_TTL_MS } from '../config';
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

export async function fetchFfzGlobal(): Promise<Emote[]> {
  return cached('ffz:global', GLOBAL_TTL_MS, async () => {
    const data = await fetchProviderJson<FfzGlobal>('https://api.frankerfacez.com/v1/set/global');
    const ids = data.default_sets ?? [];
    const sets = ids.map((id) => data.sets?.[String(id)]).filter((set): set is FfzSet => !!set);
    return normalize(sets);
  });
}
