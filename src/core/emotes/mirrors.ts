import type { Emote, EmoteProvider } from '../types';
import { fetchProviderJson } from './http';
import { isAllowedImageUrl } from './image-urls';

interface MirrorUrl {
  size?: string;
  url?: string;
}

interface MirrorEmote {
  code?: string;
  provider?: number;
  urls?: MirrorUrl[];
  zero_width?: boolean;
}

export interface MirrorResult {
  name: string;
  emotes: Emote[];
  source: string;
  /** tEmotes omits zero_width, so its result is only a last resort. */
  zeroWidthSupported: boolean;
}

const PROVIDER_IDS: Record<number, EmoteProvider> = {
  0: 'twitch',
  1: '7tv',
  2: 'bttv',
  3: 'ffz',
};

const MIRRORS = {
  '7tv': [
    'https://emotes.crippled.dev/v1/global/7tv',
    'https://emotes.adamcy.pl/v1/global/emotes/7tv',
  ],
  twitch: [
    'https://emotes.crippled.dev/v1/global/twitch',
    'https://emotes.adamcy.pl/v1/global/emotes/twitch',
  ],
} as const;

function pickUrl(urls: MirrorUrl[] | undefined): string | null {
  if (!urls?.length) return null;
  const ranked = ['2x', '2', '1x', '1', '3x', '4x'];
  for (const size of ranked) {
    const found = urls.find((item) => item.size === size && item.url);
    if (found?.url && isAllowedImageUrl(found.url)) return found.url;
  }
  const any = urls.find((item) => item.url && isAllowedImageUrl(item.url));
  return any?.url ?? null;
}

function normalize(list: unknown, expected: EmoteProvider): Emote[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as MirrorEmote;
    const code = typeof raw.code === 'string' ? raw.code.trim() : '';
    if (!code || code.length > 64 || /\s/.test(code) || seen.has(code)) continue;
    const provider =
      typeof raw.provider === 'number' ? PROVIDER_IDS[raw.provider] : expected;
    if (provider !== expected) continue;
    const url = pickUrl(raw.urls);
    if (!url) continue;
    seen.add(code);
    emotes.push({
      code,
      url,
      flags: raw.zero_width ? 256 : 0,
      provider: expected,
    });
  }
  return emotes;
}

async function fetchMirror(
  url: string,
  provider: EmoteProvider,
  zeroWidthSupported: boolean,
): Promise<MirrorResult | null> {
  try {
    const body = await fetchProviderJson<unknown>(url, { timeoutMs: 6_000, retries: 0 });
    const emotes = normalize(body, provider);
    if (!emotes.length) return null;
    return {
      name: `${provider} mirror`,
      emotes,
      source: hostOf(url),
      zeroWidthSupported,
    };
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function fetchSevenTvGlobalMirror(): Promise<MirrorResult | null> {
  for (const url of MIRRORS['7tv']) {
    const result = await fetchMirror(
      url,
      '7tv',
      !url.includes('adamcy.pl'),
    );
    if (result) return result;
  }
  return null;
}

export async function fetchTwitchGlobalMirror(): Promise<MirrorResult | null> {
  for (const url of MIRRORS.twitch) {
    const result = await fetchMirror(url, 'twitch', true);
    if (result) return result;
  }
  return null;
}
