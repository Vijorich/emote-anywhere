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

/**
 * A token made only of punctuation (`???`, `...`) peels down to nothing, so
 * search its longest substring instead. This also finds `???` in `???,`.
 */
function findPunctuationCode(
  text: string,
  start: number,
  end: number,
  lookup: Map<string, ChatEmote>,
): [number, number, ChatEmote] | null {
  const length = Math.min(end - start, MAX_CODE_LENGTH);
  for (let size = length; size > 0; size--) {
    for (let left = start; left + size <= end; left++) {
      const code = text.slice(left, left + size);
      const emote = lookup.get(code);
      if (emote) return [left, left + size, emote];
    }
  }
  return null;
}

/** Tokens are whitespace-separated; strip surrounding punctuation so "peepoSad," and ":peepoSad:" both resolve. */
export function tokenizeText(text: string, lookup: Map<string, ChatEmote>): EmoteToken[] {
  const tokens: EmoteToken[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0];
    const wordStart = match.index;
    const wordEnd = wordStart + word.length;

    // Some BTTV codes include colons (`:tf:`). Try the whole word first, then
    // the punctuation-stripped core (`:catJAM:` -> `catJAM`).
    const whole = text.slice(wordStart, wordEnd);
    const wholeEmote = whole.length <= MAX_CODE_LENGTH ? lookup.get(whole) : undefined;
    if (wholeEmote) {
      tokens.push({ code: whole, start: wordStart, end: wordEnd, emote: wholeEmote });
      continue;
    }

    const [start, end] = peel(text, wordStart, wordEnd);
    if (end > start) {
      const core = text.slice(start, end);
      if (core.length > MAX_CODE_LENGTH) continue;
      const emote = lookup.get(core);
      if (emote) tokens.push({ code: core, start, end, emote });
      continue;
    }

    const found = findPunctuationCode(text, wordStart, wordEnd, lookup);
    if (found) {
      const [left, right, emote] = found;
      tokens.push({ code: text.slice(left, right), start: left, end: right, emote });
    }
  }
  return tokens;
}
