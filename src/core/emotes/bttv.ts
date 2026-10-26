import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';

interface BttvEmote {
  id?: string;
  code?: string;
  imageType?: string;
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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchBttvGlobal(): Promise<Emote[]> {
  return cached('bttv:global', GLOBAL_TTL_MS, async () => {
    return normalize(await getJson<BttvEmote[]>('https://api.betterttv.net/3/cached/emotes/global'));
  });
}

export async function fetchBttvChannel(twitchId: string): Promise<Emote[]> {
  return cached(`bttv:channel:${twitchId}`, SET_TTL_MS, async () => {
    const channel = await getJson<BttvChannel>(
      `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchId)}`,
    );
    return normalize([...(channel.channelEmotes ?? []), ...(channel.sharedEmotes ?? [])]);
  });
}
