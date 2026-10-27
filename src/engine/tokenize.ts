import type { ChatEmote } from '../core/types';

export interface EmoteToken {
  code: string;
  start: number;
  end: number;
  emote: ChatEmote;
}

const PUNCTUATION = new Set(
  Array.from('.,!?;:()[]{}<>"\'`“”‘’«»…—–-*~|\\/'),
);

const MAX_CODE_LENGTH = 64;
const WORD_RE = /[^\s\u200b\ufeff]+/gu;

function peel(text: string, start: number, end: number): [number, number] {
  let left = start;
  let right = end;
  while (left < right && PUNCTUATION.has(text[left] ?? '')) left++;
  while (right > left && PUNCTUATION.has(text[right - 1] ?? '')) right--;
  return [left, right];
}

/** Tokens are whitespace-separated; strip surrounding punctuation so "peepoSad," and ":peepoSad:" both resolve. */
export function tokenizeText(text: string, lookup: Map<string, ChatEmote>): EmoteToken[] {
  const tokens: EmoteToken[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0];
    const wordStart = match.index;
    const wordEnd = wordStart + word.length;

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
