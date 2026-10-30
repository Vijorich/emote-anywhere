import { describe, expect, it } from 'vitest';
import type { Emote } from '../src/core/types';
import { tokenizeText } from '../src/engine/tokenize';

const emote = (code: string, flags = 0): Emote => ({
  code,
  url: `https://cdn.example/${code}.png`,
  flags,
  provider: '7tv',
});

const lookup = new Map<string, Emote>([
  ['peepoSad', emote('peepoSad')],
  ['catJAM', emote('catJAM')],
  ['peepo', emote('peepo')],
  [':wrapped:', emote(':wrapped:')],
  [':tf:', emote(':tf:')],
  ['???', emote('???')],
  ['...', emote('...')],
]);

describe('tokenizeText', () => {
  it('matches whitespace separated codes only', () => {
    const tokens = tokenizeText('hello peepoSad world', lookup);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.code).toBe('peepoSad');
    expect(tokens[0]?.start).toBe(6);
    expect(tokens[0]?.end).toBe(14);
  });

  it('does not match inside words', () => {
    expect(tokenizeText('xpeepoSad peepoSady', lookup)).toHaveLength(0);
  });

  it('strips surrounding punctuation', () => {
    const tokens = tokenizeText('(peepoSad), catJAM!', lookup);
    expect(tokens.map((token) => token.code)).toEqual(['peepoSad', 'catJAM']);
  });

  it('supports :code: syntax', () => {
    const tokens = tokenizeText('hi :catJAM:', lookup);
    expect(tokens[0]?.code).toBe('catJAM');
  });

  it('matches codes that include colons', () => {
    const tokens = tokenizeText('hi :tf:', lookup);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.code).toBe(':tf:');
  });

  it('matches codes made only of punctuation', () => {
    const tokens = tokenizeText('??? ...', lookup);
    expect(tokens.map((token) => token.code)).toEqual(['???', '...']);
    expect(tokens.map((token) => [token.start, token.end])).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });

  it('matches punctuation-only codes surrounded by punctuation', () => {
    const tokens = tokenizeText('???, ...!', lookup);
    expect(tokens.map((token) => token.code)).toEqual(['???', '...']);
  });

  it('is case sensitive', () => {
    expect(tokenizeText('peeposad PEEPOSAD', lookup)).toHaveLength(0);
  });

  it('treats zero width space as a separator', () => {
    const tokens = tokenizeText('peepo\u200bSad', lookup);
    expect(tokens.map((token) => token.code)).toEqual(['peepo']);
  });
});
