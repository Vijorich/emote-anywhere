import type { Emote, EmoteProvider } from './types';

/**
 * One character per emote, aligned by index. Keeps provider data out of the
 * per-emote payload sent to content scripts: 30k resolved entries cost ~30KB
 * instead of one provider string per emote.
 */
export const PROVIDER_CHARS: Record<EmoteProvider, string> = {
  '7tv': '7',
  bttv: 'b',
  ffz: 'f',
  twitch: 't',
  custom: 'c',
};

export function encodeProviders(emotes: Emote[]): string {
  let encoded = '';
  for (const emote of emotes) {
    encoded += PROVIDER_CHARS[emote.provider] ?? '?';
  }
  return encoded;
}
