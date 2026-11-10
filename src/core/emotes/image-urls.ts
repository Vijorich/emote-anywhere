export const ALLOWED_IMAGE_HOSTS = new Set([
  'cdn.7tv.app',
  'cdn.betterttv.net',
  'cdn.frankerfacez.com',
  'static-cdn.jtvnw.net',
]);

export function isAllowedImageUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Smaller alternative for when a CDN asset exceeds the proxy byte budget. */
export function smallerImageUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (!isAllowedImageUrl(input)) return null;

    if (url.hostname === 'cdn.7tv.app') {
      if (url.pathname.includes('/2x.')) return url.toString().replace('/2x.', '/1x.');
      if (url.pathname.includes('/3x.')) return url.toString().replace('/3x.', '/1x.');
      if (url.pathname.includes('/4x.')) return url.toString().replace('/4x.', '/1x.');
      return null;
    }
    if (url.hostname === 'cdn.betterttv.net') {
      if (url.pathname.includes('/2x')) return url.toString().replace('/2x', '/1x');
      if (url.pathname.includes('/3x')) return url.toString().replace('/3x', '/1x');
      return null;
    }
    if (url.hostname === 'cdn.frankerfacez.com') {
      const parts = url.pathname.split('/');
      const last = parts[parts.length - 1];
      if (last === '2' || last === '4') {
        parts[parts.length - 1] = '1';
        url.pathname = parts.join('/');
        return url.toString();
      }
      return null;
    }
    if (url.hostname === 'static-cdn.jtvnw.net') {
      if (url.pathname.includes('/2.0')) return url.toString().replace('/2.0', '/1.0');
      if (url.pathname.includes('/3.0')) return url.toString().replace('/3.0', '/1.0');
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** 7TV serves AVIF; wsrv is more reliable when asked for the WebP sibling. */
export function webpSibling(input: string): string {
  try {
    const url = new URL(input);
    if (url.hostname !== 'cdn.7tv.app') return input;
    return url.toString().replace(/\.avif$/, '.webp');
  } catch {
    return input;
  }
}
