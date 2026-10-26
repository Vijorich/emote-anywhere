import { GLOBAL_TTL_MS, SET_TTL_MS } from '../config';
import type { Emote } from '../types';

import { cached } from './cache';

interface SevenTvFile {
  name?: string;
  width?: number;
  height?: number;
}

interface SevenTvHost {
  url?: string;
  files?: SevenTvFile[];
}

interface SevenTvEmoteData {
  name?: string;
  flags?: number;
  host?: SevenTvHost;
}

interface SevenTvEmote {
  id?: string;
  name?: string;
  flags?: number;
  data?: SevenTvEmoteData | null;
}

interface SevenTvSet {
  id?: string;
  name?: string;
  emotes?: SevenTvEmote[];
}

interface SevenTvUser {
  emote_set?: SevenTvSet | null;
}

export interface SevenTvSetData {
  name: string;
  emotes: Emote[];
}

function pickFile(files: SevenTvFile[] | undefined): SevenTvFile | undefined {
  if (!files?.length) return undefined;
  const preferred = ['2x.webp', '2x.avif', '2x.png', '1x.webp', '1x.avif', '1x.png'];
  for (const name of preferred) {
    const file = files.find((item) => item.name === name);
    if (file) return file;
  }
  return files.find((item) => item.name?.includes('2x')) ?? files[0];
}

function imageUrl(emote: SevenTvEmote, host: SevenTvHost | undefined, file: SevenTvFile | undefined): string {
  const base = host?.url;
  if (base && file?.name) {
    const normalized = base.startsWith('//') ? `https:${base}` : base;
    return `${normalized.replace(/\/$/, '')}/${file.name}`;
  }
  return `https://cdn.7tv.app/emote/${emote.id ?? ''}/2x.webp`;
}

export function normalizeSevenTvSet(set: SevenTvSet | null | undefined): SevenTvSetData {
  const seen = new Set<string>();
  const emotes: Emote[] = [];
  for (const emote of set?.emotes ?? []) {
    const data = emote.data;
    if (!data) continue;
    const code = (emote.name ?? data.name ?? '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const file = pickFile(data.host?.files);
    emotes.push({
      code,
      url: imageUrl(emote, data.host, file),
      flags: (emote.flags ?? 0) | (data.flags ?? 0),
      provider: '7tv',
    });
  }
  return { name: set?.name ?? '7TV set', emotes };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchSevenTvSet(id: string): Promise<SevenTvSetData> {
  return cached(`7tv:set:${id}`, SET_TTL_MS, async () => {
    const set = await getJson<SevenTvSet>(`https://7tv.io/v3/emote-sets/${encodeURIComponent(id)}`);
    return normalizeSevenTvSet(set);
  });
}

export async function fetchSevenTvGlobal(): Promise<SevenTvSetData> {
  return cached('7tv:global', GLOBAL_TTL_MS, async () => {
    const set = await getJson<SevenTvSet>('https://7tv.io/v3/emote-sets/global');
    return normalizeSevenTvSet(set);
  });
}

export async function fetchSevenTvUser(
  platform: 'twitch' | 'youtube' | 'kick',
  id: string,
): Promise<SevenTvSetData> {
  return cached(`7tv:user:${platform}:${id}`, SET_TTL_MS, async () => {
    const user = await getJson<SevenTvUser>(
      `https://7tv.io/v3/users/${platform}/${encodeURIComponent(id)}`,
    );
    return normalizeSevenTvSet(user.emote_set);
  });
}


