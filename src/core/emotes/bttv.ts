import { GLOBAL_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';
import { fetchProviderJson } from './http';

interface BttvEmote {
  id?: string;
  code?: string;
}

function normalize(list: BttvEmote[] | undefined): Emote[] {
  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const item of list ?? []) {
    const code = (item.code ?? '').trim();
    if (!code || !item.id || seen.has(code)) continue;
    seen.add(code);
    emotes.push({
      code,
      url: `https://cdn.betterttv.net/emote/${item.id}/2x`,
      flags: 0,
      provider: 'bttv',
    });
  }
  return emotes;
}

export async function fetchBttvGlobal(): Promise<Emote[]> {
  return cached('bttv:global', GLOBAL_TTL_MS, async () =>
    normalize(
      await fetchProviderJson<BttvEmote[]>('https://api.betterttv.net/3/cached/emotes/global'),
    ),
  );
}
