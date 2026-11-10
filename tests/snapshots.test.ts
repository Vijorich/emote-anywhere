import { describe, expect, it } from 'vitest';
import { parseSnapshot } from '../src/core/emotes/snapshots';

const valid = {
  schemaVersion: 1,
  fetchedAt: '2026-11-10T00:00:00.000Z',
  provider: '7tv',
  id: 'abc123',
  name: 'Snapshot set',
  emotes: [
    { code: 'catJAM', url: 'https://cdn.7tv.app/emote/1/2x.webp', flags: 0 },
    { code: 'Overlay', url: 'https://cdn.7tv.app/emote/2/2x.webp', flags: 256 },
    { code: 'catJAM', url: 'https://cdn.7tv.app/emote/3/2x.webp', flags: 0 },
    { code: 'bad code', url: 'https://cdn.7tv.app/emote/4/2x.webp', flags: 0 },
    { code: 'badUrl', url: 'javascript:alert(1)', flags: 0 },
  ],
};

describe('snapshot parser', () => {
  it('validates and normalizes a snapshot', () => {
    const result = parseSnapshot(valid);
    expect(result.provider).toBe('7tv');
    expect(result.name).toBe('Snapshot set');
    expect(result.emotes).toEqual([
      { code: 'catJAM', url: 'https://cdn.7tv.app/emote/1/2x.webp', flags: 0, provider: '7tv' },
      { code: 'Overlay', url: 'https://cdn.7tv.app/emote/2/2x.webp', flags: 256, provider: '7tv' },
    ]);
  });

  it('rejects empty or malformed snapshots', () => {
    expect(() => parseSnapshot({ ...valid, schemaVersion: 2 })).toThrow();
    expect(() => parseSnapshot({ ...valid, emotes: [] })).toThrow();
    expect(() => parseSnapshot({ ...valid, provider: 'kreygasm' })).toThrow();
    expect(() => parseSnapshot(null)).toThrow();
  });
});
