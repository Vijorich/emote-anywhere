import { describe, expect, it } from 'vitest';
import {
  isAllowedImageUrl,
  smallerImageUrl,
  webpSibling,
} from '../src/core/emotes/image-urls';

describe('emote image URLs', () => {
  it('allows only known HTTPS CDN hosts', () => {
    expect(isAllowedImageUrl('https://cdn.7tv.app/emote/1/2x.webp')).toBe(true);
    expect(isAllowedImageUrl('https://static-cdn.jtvnw.net/emoticons/v2/x/default/light/2.0')).toBe(
      true,
    );
    expect(isAllowedImageUrl('http://cdn.7tv.app/emote/1/2x.webp')).toBe(false);
    expect(isAllowedImageUrl('https://evil.example/image.png')).toBe(false);
  });

  it('maps assets to a smaller variant', () => {
    expect(smallerImageUrl('https://cdn.7tv.app/emote/1/2x.avif')).toBe(
      'https://cdn.7tv.app/emote/1/1x.avif',
    );
    expect(smallerImageUrl('https://cdn.betterttv.net/emote/1/2x')).toBe(
      'https://cdn.betterttv.net/emote/1/1x',
    );
    expect(smallerImageUrl('https://cdn.frankerfacez.com/emote/1/2')).toBe(
      'https://cdn.frankerfacez.com/emote/1/1',
    );
    expect(
      smallerImageUrl('https://static-cdn.jtvnw.net/emoticons/v2/x/default/light/2.0'),
    ).toBe('https://static-cdn.jtvnw.net/emoticons/v2/x/default/light/1.0');
    expect(smallerImageUrl('https://evil.example/2x.webp')).toBeNull();
  });

  it('uses the WebP sibling for 7TV AVIF fallback URLs', () => {
    expect(webpSibling('https://cdn.7tv.app/emote/1/2x.avif')).toBe(
      'https://cdn.7tv.app/emote/1/2x.webp',
    );
    expect(webpSibling('https://cdn.betterttv.net/emote/1/2x')).toBe(
      'https://cdn.betterttv.net/emote/1/2x',
    );
  });
});
