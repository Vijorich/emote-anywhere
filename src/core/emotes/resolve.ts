import { MAX_RESOLVED_EMOTES } from '../config';
import type {
  AppSettings,
  Binding,
  CustomSet,
  Emote,
  GlobalBinding,
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
  globalBinding: GlobalBinding;
  settings: AppSettings;
  customSets: CustomSet[];
  sevenTv?: SevenTvSpec;
  sevenTvId?: string;
}

interface Layer {
  label: string;
  load: () => Promise<Emote[]>;
}

/** Priority: per-chat sets, global sets, auto 7TV, custom sets, then global providers; first code wins. */
export async function resolveEmotes(options: ResolveOptions): Promise<ResolvedEmotes> {
  const layers: Layer[] = [];
  const bindingSets = options.binding?.sets ?? [];

  for (const id of bindingSets) {
    layers.push({
      label: `7tv:set:${id}`,
      load: async () => (await fetchSevenTvSet(id)).emotes,
    });
  }
  for (const id of options.globalBinding.sets) {
    layers.push({
      label: `7tv:global-set:${id}`,
      load: async () => (await fetchSevenTvSet(id)).emotes,
    });
  }

  if (!bindingSets.length && options.settings.autoChannel && options.sevenTv && options.sevenTvId) {
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
  let limitReached = false;

  results.forEach((result, index) => {
    if (limitReached) return;
    const layer = layers[index];
    if (!layer) return;
    if (result.error) {
      errors.push(`${layer.label}: ${result.error}`);
      return;
    }
    if (!result.emotes.length) return;
    sources.push(layer.label);
    for (const emote of result.emotes) {
      if (byCode.size >= MAX_RESOLVED_EMOTES) {
        limitReached = true;
        break;
      }
      if (!byCode.has(emote.code)) byCode.set(emote.code, emote);
    }
  });

  if (limitReached) {
    errors.push(`Emote limit of ${MAX_RESOLVED_EMOTES} reached; lower-priority sources were skipped`);
  }

  return { emotes: Array.from(byCode.values()), sources, errors };
}

export async function lookupSevenTvSet(input: string): Promise<SevenTvSetInfo> {
  const id = parseSevenTvSetId(input);
  const set = await fetchSevenTvSet(id);
  return {
    id,
    name: set.name,
    emoteCount: set.emotes.length,
    preview: set.emotes.slice(0, 12).map(({ code, url }) => ({ code, url })),
  };
}
