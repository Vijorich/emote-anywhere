import type { Emote } from '../core/types';

export interface EmoteToken {
  code: string;
  start: number;
  end: number;
  emote: Emote;
}

const PUNCTUATION = new Set(
  Array.from('.,!?;:()[]{}<>"\'`“”‘’«»…—–-*~|\\/'),
);

const MAX_CODE_LENGTH = 64;

function isSpace(char: string): boolean {
  return /\s/u.test(char) || char === '\u200b' || char === '\ufeff';
}

function peel(text: string, start: number, end: number): [number, number] {
  let left = start;
  let right = end;
  while (left < right && PUNCTUATION.has(text[left] ?? '')) left++;
  while (right > left && PUNCTUATION.has(text[right - 1] ?? '')) right--;
  return [left, right];
}

/**
 * Chat tokens are whitespace separated. Leading/trailing punctuation is
 * stripped so "peepoSad," and ":peepoSad:" both resolve to the same code.
 */
export function tokenizeText(text: string, lookup: Map<string, Emote>): EmoteToken[] {
  const tokens: EmoteToken[] = [];
  let index = 0;
  while (index < text.length) {
    while (index < text.length && isSpace(text[index] ?? '')) index++;
    const wordStart = index;
    while (index < text.length && !isSpace(text[index] ?? '')) index++;
    const wordEnd = index;
    if (wordEnd <= wordStart) break;

    const [start, end] = peel(text, wordStart, wordEnd);
    if (end <= start) continue;
    const core = text.slice(start, end);
    if (!core || core.length > MAX_CODE_LENGTH) continue;

    // Some BTTV codes include colons (`:tf:`). Try the whole word first, then
    // the punctuation-stripped core (`:catJAM:` -> `catJAM`).
    const whole = text.slice(wordStart, wordEnd);
    const wholeEmote = whole.length <= MAX_CODE_LENGTH ? lookup.get(whole) : undefined;
    if (wholeEmote) {
      tokens.push({ code: whole, start: wordStart, end: wordEnd, emote: wholeEmote });
      continue;
    }
    const emote = lookup.get(core);
    if (!emote) continue;
    tokens.push({ code: core, start, end, emote });
  }
  return tokens;
}
