import type {
  AppSettings,
  Binding,
  CustomSet,
  Emote,
  ResolvedEmotes,
  SevenTvSetInfo,
  SevenTvSpec,
} from '../types';
import { parseSevenTvSetId } from '../validate';
import { fetchBttvGlobal } from './bttv';
import { fetchFfzGlobal } from './ffz';
import { fetchSevenTvGlobal, fetchSevenTvSet, fetchSevenTvUser } from './seven-tv';

export interface ResolveOptions {
  binding: Binding | null;
  settings: AppSettings;
  customSets: CustomSet[];
  sevenTv?: SevenTvSpec;
  sevenTvId?: string;
}

interface Layer {
  label: string;
  load: () => Promise<Emote[]>;
}

/**
 * Priority: manual binding sets, auto 7TV channel, custom sets, then global
 * providers. The first provider that defines a code wins.
 */
export async function resolveEmotes(options: ResolveOptions): Promise<ResolvedEmotes> {
  const layers: Layer[] = [];
  const bindingSets = options.binding?.sets ?? [];

  if (bindingSets.length) {
    for (const id of bindingSets) {
      layers.push({
        label: `7tv:set:${id}`,
        load: async () => (await fetchSevenTvSet(id)).emotes,
      });
    }
  } else if (options.settings.autoChannel && options.sevenTv && options.sevenTvId) {
    const { platform } = options.sevenTv;
    const id = options.sevenTvId;
    layers.push({
      label: `7tv:${platform}:${id}`,
      load: async () => (await fetchSevenTvUser(platform, id)).emotes,
    });
  }

  for (const set of options.customSets) {
    if (!set.enabled) continue;
    layers.push({
      label: `custom:${set.name}`,
      load: async () =>
        set.emotes.map((emote) => ({
          code: emote.code,
          url: emote.url,
          flags: emote.flags ?? 0,
          provider: 'custom' as const,
        })),
    });
  }

  if (options.settings.providers.sevenTv) {
    layers.push({
      label: '7tv:global',
      load: async () => (await fetchSevenTvGlobal()).emotes,
    });
  }
  if (options.settings.providers.bttv) {
    layers.push({ label: 'bttv:global', load: fetchBttvGlobal });
  }
  if (options.settings.providers.ffz) {
    layers.push({ label: 'ffz:global', load: fetchFfzGlobal });
  }

  const results = await Promise.all(
    layers.map(async (layer) => {
      try {
        return { emotes: await layer.load(), error: null as string | null };
      } catch (error) {
        return {
          emotes: [] as Emote[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const byCode = new Map<string, Emote>();
  const sources: string[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    const layer = layers[index];
    if (!layer) return;
    if (result.error) {
      errors.push(`${layer.label}: ${result.error}`);
      return;
    }
    if (!result.emotes.length) return;
    sources.push(layer.label);
    for (const emote of result.emotes) {
      if (!byCode.has(emote.code)) byCode.set(emote.code, emote);
    }
  });

  return { emotes: Array.from(byCode.values()), sources, errors };
}

export async function lookupSevenTvSet(input: string): Promise<SevenTvSetInfo> {
  const id = parseSevenTvSetId(input);
  const set = await fetchSevenTvSet(id);
  return { id, name: set.name, emoteCount: set.emotes.length };
}
