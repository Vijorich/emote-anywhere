import { GLOBAL_TTL_MS } from '../config';
import type { Emote } from '../types';
import { cached } from './cache';
import { fetchTwitchGlobalMirror } from './mirrors';
import { twitchGlobalSnapshot } from './snapshots';

export async function fetchTwitchGlobal(): Promise<Emote[]> {
  return cached(
    'twitch:global',
    GLOBAL_TTL_MS,
    async () => {
      const [mirror, snapshot] = await Promise.all([
        fetchTwitchGlobalMirror(),
        twitchGlobalSnapshot(),
      ]);
      if (mirror?.emotes.length) return mirror.emotes;
      if (snapshot?.emotes.length) return snapshot.emotes;
      throw new Error('Twitch global emotes are unavailable');
    },
    { staleWhileRevalidate: true },
  );
}
