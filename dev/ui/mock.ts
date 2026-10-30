import type {
  AppState,
  PluginDescriptor,
  RpcRequest,
  SevenTvSetInfo,
} from '../../src/core/types';

const SET_ID = '01M5VFKKAQEH8WEF0N0PNRK2YP';

const EMOTES = [
  ['Clueless', '01F6T8NM9R0007M5BTFWSP1YSJ'],
  ['GIGACHAD', '01F6MZGCNG000255K4X1K7NTHR'],
  ['catKISS', '01F5VW2TKR0003RCV2Z6JBHCST'],
  ['COPIUM', '01F6ME7ADR0000WDA7ERT9H30R'],
  ['donowall', '01F6BN89H80006VBW12DRB1DJ0'],
  ['DIESOFCRINGE', '01FCX95ZG80009QXBMY7YYTVBJ'],
  ['SNIFFA', '01F7M225F8000AWSXNQ65M4PKG'],
  ['KEKW', '01F61B1440000991F7SWQNMVX7'],
] as const;

const preview = EMOTES.map(([code, id]) => ({
  code,
  url: `https://cdn.7tv.app/emote/${id}/2x.webp`,
}));

const vk: PluginDescriptor = {
  schemaVersion: 1,
  id: 'vk',
  name: 'VK',
  version: '0.2.0',
  description:
    'VK Messenger on vk.com and vk.ru. Emotes render in chats. Images load through the extension because VK blocks external image hosts.',
  priority: 20,
  proxyImages: true,
  matches: ['https://vk.com/*', 'https://*.vk.com/*', 'https://vk.ru/*', 'https://*.vk.ru/*'],
  chat: {
    roots: ['#reforged-root'],
    messages: ['.ConvoHistory__messageWrapper', '.ConvoMessage', '.ConvoMessageWithoutBubble'],
    exclude: ['a', 'code', 'pre', 'button'],
    channel: [
      { from: 'urlParam', param: 'sel' },
      { from: 'urlRegex', regex: '/im/convo/(\\d+)', group: 1 },
      { from: 'constant', value: 'default' },
    ],
  },
  composer: {
    selectors: ['.ComposerInput__input'],
    kind: 'auto',
  },
};

let state: AppState = {
  version: 1,
  settings: {
    globalMode: false,
    emoteScale: 1.2,
    autoChannel: true,
    pickerEnabled: true,
    providers: { sevenTv: true, bttv: true, ffz: true },
  },
  registries: [
    {
      id: 'default',
      name: 'Emote Anywhere',
      url: 'https://vijorich.github.io/emote-anywhere/index.json',
      builtin: true,
      lastCheckedAt: Date.now() - 2 * 60 * 1000,
      pluginCount: 1,
    },
  ],
  plugins: {
    'default:vk': {
      key: 'default:vk',
      registryId: 'default',
      descriptor: vk,
      enabled: true,
      addedAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 3_600_000,
    },
  },
  bindings: {
    'default:vk|371502952': {
      key: 'default:vk|371502952',
      pluginKey: 'default:vk',
      channelKey: '371502952',
      label: 'VK · 371502952',
      sets: [SET_ID],
    },
  },
  globalBinding: { sets: [SET_ID] },
  customSets: [
    {
      id: 'set_stream',
      name: 'Stream faces',
      enabled: true,
      emotes: preview.slice(0, 4).map((emote) => ({ code: emote.code, url: emote.url })),
    },
  ],
};

const SET_INFO: SevenTvSetInfo = {
  id: SET_ID,
  name: 'emote everywhere default set',
  emoteCount: 19,
  preview,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function handle(request: RpcRequest): Promise<unknown> {
  switch (request.type) {
    case 'state/get':
      return clone(state);

    case 'settings/update':
      state.settings = {
        ...state.settings,
        ...request.patch,
        providers: { ...state.settings.providers, ...(request.patch.providers ?? {}) },
      };
      return clone(state.settings);

    case 'globalBinding/set':
      state.globalBinding = { sets: [...request.sets] };
      return clone(state.globalBinding);

    case 'binding/set': {
      const key = `${request.pluginKey}|${request.channelKey}`;
      state.bindings[key] = {
        key,
        pluginKey: request.pluginKey,
        channelKey: request.channelKey,
        label: request.label,
        sets: [...request.sets],
      };
      return clone(state.bindings[key]);
    }

    case 'binding/remove':
      delete state.bindings[request.key];
      return true;

    case 'plugin/enable':
      if (state.plugins[request.key]) state.plugins[request.key]!.enabled = true;
      return true;

    case 'plugin/disable':
      if (state.plugins[request.key]) state.plugins[request.key]!.enabled = false;
      return true;

    case 'plugin/remove':
      delete state.plugins[request.key];
      return true;

    case 'set/toggle': {
      const set = state.customSets.find((item) => item.id === request.id);
      if (set) set.enabled = request.enabled;
      return true;
    }

    case 'set/remove':
      state.customSets = state.customSets.filter((set) => set.id !== request.id);
      return true;

    case 'set/add': {
      const set = {
        id: `set_${Date.now()}`,
        name: request.name,
        enabled: true,
        emotes: request.emotes,
      };
      state.customSets.push(set);
      return clone(set);
    }

    case 'set/restore': {
      const index = Math.min(request.index, state.customSets.length);
      state.customSets.splice(index, 0, clone(request.set));
      return clone(request.set);
    }

    case 'registry/refresh': {
      for (const registry of state.registries) {
        registry.lastCheckedAt = Date.now();
      }
      return {};
    }

    case 'registry/add': {
      state.registries.push({
        id: `reg_${Date.now()}`,
        name: request.name || 'Preview registry',
        url: request.url,
        lastCheckedAt: Date.now(),
        pluginCount: 0,
      });
      return clone(state.registries[state.registries.length - 1]);
    }

    case 'registry/remove':
      state.registries = state.registries.filter((registry) => registry.id !== request.id);
      return true;

    case 'sevenTv/lookupSet': {
      if (request.input.includes(SET_ID)) return clone(SET_INFO);
      throw new Error('The preview only knows the default set');
    }

    case 'cache/clear':
      return true;

    default:
      throw new Error(`The preview does not implement ${request.type}`);
  }
}

const activeTab = {
  id: 1,
  url: 'https://vk.com/im?sel=371502952',
  title: 'VK Messenger',
};

function installChrome(): void {
  const chrome = {
    runtime: {
      id: 'preview',
      getManifest: () => ({ version: '0.4.0' }),
      getURL: (path: string) => path,
      sendMessage: async (request: RpcRequest) => {
        try {
          return { ok: true, data: await handle(request) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      onMessage: { addListener: () => undefined },
      openOptionsPage: async () => undefined,
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: clone(state) }),
        set: async () => undefined,
        remove: async () => undefined,
      },
      onChanged: {
        addListener: () => undefined,
      },
    },
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    tabs: {
      query: async () => [activeTab],
      sendMessage: async (_tabId: number, message: { type?: string }) => {
        if (message?.type === 'ea/context') {
          return {
            pluginKey: 'default:vk',
            channelKey: '371502952',
            sevenTvId: '371502952',
            url: activeTab.url,
          };
        }
        return undefined;
      },
      create: async ({ url }: { url: string }) => {
        console.info('[preview] open', url);
      },
      reload: async () => undefined,
    },
  };

  (globalThis as { chrome?: unknown; browser?: unknown }).chrome = chrome;
  (globalThis as { browser?: unknown }).browser = undefined;
}

installChrome();
