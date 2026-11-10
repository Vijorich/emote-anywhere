import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';
import { fetchProviderJson } from './http';

interface BttvEmote {
  id?: string;
  code?: string;
}

interface BttvChannel {
  channelEmotes?: BttvEmote[];
  sharedEmotes?: BttvEmote[];
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

function channelUrl(id: string): string {
  if (!/^\d{1,32}$/.test(id)) throw new Error('Invalid Twitch user id');
  return `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(id)}`;
}

export async function fetchBttvGlobal(): Promise<Emote[]> {
  return cached(
    'bttv:global',
    GLOBAL_TTL_MS,
    async () =>
      normalize(
        await fetchProviderJson<BttvEmote[]>('https://api.betterttv.net/3/cached/emotes/global'),
      ),
    { staleWhileRevalidate: true },
  );
}

export async function fetchBttvChannel(id: string): Promise<Emote[]> {
  return cached(
    `bttv:channel:${id}`,
    SET_TTL_MS,
    async () => {
      const data = await fetchProviderJson<BttvChannel>(channelUrl(id));
      return normalize([...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])]);
    },
    { staleWhileRevalidate: true },
  );
}
