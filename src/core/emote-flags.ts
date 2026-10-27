import type { Emote } from './types';

/** `data.flags` uses 1 << 8; the active-emote `flags` uses 1 << 0. */
export const ZERO_WIDTH_DATA_FLAG = 256;
export const ZERO_WIDTH_ACTIVE_FLAG = 1;

export function isZeroWidth(emote: Pick<Emote, 'flags'>): boolean {
  return (
    (emote.flags & ZERO_WIDTH_DATA_FLAG) !== 0 ||
    (emote.flags & ZERO_WIDTH_ACTIVE_FLAG) !== 0
  );
}
