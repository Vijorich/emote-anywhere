export type ChannelRule =
  | { from: 'urlParam'; param: string }
  | { from: 'urlRegex'; regex: string; group?: number }
  | { from: 'dom'; selector: string; attribute: string }
  | { from: 'constant'; value: string };

export interface SevenTvSpec {
  platform: 'twitch' | 'youtube' | 'kick';
  id: ChannelRule | ChannelRule[];
}

export interface ChatSpec {
  /** Optional containers to search inside. Defaults to document.body. */
  roots?: string[];
  /** Message element selectors, tried in order. */
  messages: string[];
  /** Text containers inside a message. Defaults to the message itself. */
  text?: string[];
  /** Text inside these elements is never touched. */
  exclude?: string[];
  /** Messages matching these selectors are ignored. */
  skip?: string[];
  /** Stable message id attribute, for debugging only. */
  messageIdAttr?: string;
  channel: ChannelRule | ChannelRule[];
  sevenTv?: SevenTvSpec;
}

export interface ComposerSpec {
  selectors: string[];
  kind?: 'auto' | 'contenteditable' | 'textarea';
}

export interface PluginDescriptor {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  homepage?: string;
  /** Higher wins when several plugins match the same URL. */
  priority?: number;
  /** Fetch emote images through the background worker (for strict img-src CSP). */
  proxyImages?: boolean;
  matches: string[];
  chat: ChatSpec;
  composer?: ComposerSpec;
}

export interface RegistryIndex {
  schemaVersion: 1;
  name?: string;
  plugins: PluginDescriptor[];
}

export interface RegistryRef {
  id: string;
  name: string;
  url: string;
  builtin?: boolean;
  lastCheckedAt?: number;
  lastError?: string;
  pluginCount?: number;
}

export interface InstalledPlugin {
  key: string;
  registryId: string;
  descriptor: PluginDescriptor;
  enabled: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface Binding {
  key: string;
  pluginKey: string;
  channelKey: string;
  label: string;
  sets: string[];
}

/** 7TV sets that load in every chat. A per-chat binding takes priority. */
export interface GlobalBinding {
  sets: string[];
}

export interface CustomEmote {
  code: string;
  url: string;
  flags?: number;
}

export interface CustomSet {
  id: string;
  name: string;
  enabled: boolean;
  emotes: CustomEmote[];
}

export interface ProviderSettings {
  sevenTv: boolean;
  bttv: boolean;
  ffz: boolean;
}

export interface AppSettings {
  globalMode: boolean;
  emoteScale: number;
  autoChannel: boolean;
  pickerEnabled: boolean;
  providers: ProviderSettings;
}

export interface AppState {
  version: 1;
  settings: AppSettings;
  registries: RegistryRef[];
  plugins: Record<string, InstalledPlugin>;
  bindings: Record<string, Binding>;
  globalBinding: GlobalBinding;
  customSets: CustomSet[];
}

export type EmoteProvider = '7tv' | 'bttv' | 'ffz' | 'custom';

export interface Emote {
  code: string;
  url: string;
  flags: number;
  provider: EmoteProvider;
}

/** Emote payload for content scripts; provider is only needed in the background. */
export type ChatEmote = Pick<Emote, 'code' | 'url' | 'flags'>;

export interface ResolvedEmotes {
  emotes: Emote[];
  sources: string[];
  errors: string[];
}

export interface PluginMatch {
  pluginKey: string;
  descriptor: PluginDescriptor;
  settings: AppSettings;
}

export interface ChatRegistration {
  emotes: ChatEmote[];
  sources: string[];
  errors: string[];
  binding: Binding | null;
}

export interface SevenTvSetInfo {
  id: string;
  name: string;
  emoteCount: number;
  /** First few emotes, used for the size preview. */
  preview: Array<{ code: string; url: string }>;
}

export type RpcRequest =
  | { type: 'state/get' }
  | { type: 'registry/add'; name: string; url: string }
  | { type: 'registry/remove'; id: string }
  | { type: 'registry/refresh'; id?: string }
  | { type: 'plugin/enable'; key: string }
  | { type: 'plugin/disable'; key: string }
  | { type: 'plugin/remove'; key: string }
  | { type: 'plugin/forUrl'; url: string }
  | { type: 'chat/register'; pluginKey: string; channelKey: string; sevenTvId?: string }
  | { type: 'binding/set'; pluginKey: string; channelKey: string; label: string; sets: string[] }
  | { type: 'binding/remove'; key: string }
  | { type: 'globalBinding/set'; sets: string[] }
  | { type: 'set/add'; name: string; emotes: CustomEmote[] }
  | { type: 'set/remove'; id: string }
  | { type: 'set/toggle'; id: string; enabled: boolean }
  | { type: 'settings/update'; patch: Partial<AppSettings> }
  | { type: 'sevenTv/lookupSet'; input: string }
  | { type: 'image/fetch'; url: string }
  | { type: 'frame/context'; context: ContentContext | null }
  | { type: 'frame/contexts'; tabId: number }
  | { type: 'cache/clear' };

export interface RpcOk<T> {
  ok: true;
  data: T;
}

export interface RpcErr {
  ok: false;
  error: string;
}

export type RpcResponse<T> = RpcOk<T> | RpcErr;

export interface ContentContext {
  pluginKey: string;
  channelKey: string;
  sevenTvId?: string;
  url: string;
}

/** A content-script context registered by its frame. */
export interface FrameContext extends ContentContext {
  tabId: number;
  frameId: number;
  updatedAt: number;
}

export interface RpcSender {
  tab?: { id?: number };
  frameId?: number;
  url?: string;
}
