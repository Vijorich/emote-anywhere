import { rpc } from '../core/rpc';
import type { SevenTvSetInfo } from '../core/types';

const cache = new Map<string, SevenTvSetInfo>();
const pending = new Map<string, Promise<SevenTvSetInfo | null>>();
let generation = 0;

export function setUrl(id: string): string {
  return `https://7tv.app/emote-sets/${encodeURIComponent(id)}`;
}

export function clearSetLookupCache(): void {
  generation++;
  cache.clear();
  pending.clear();
}

/** Set names and previews are presentation only; a failure falls back to the id. */
export function lookupSet(id: string): Promise<SevenTvSetInfo | null> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(id);
  if (existing) return existing;

  const requestGeneration = generation;
  const request = rpc<SevenTvSetInfo>('sevenTv/lookupSet', { input: id })
    .then((info) => {
      if (requestGeneration === generation) cache.set(id, info);
      return info;
    })
    .catch(() => null)
    .finally(() => {
      if (pending.get(id) === request) pending.delete(id);
    });

  pending.set(id, request);
  return request;
}
