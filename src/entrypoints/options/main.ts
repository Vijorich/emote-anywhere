import './style.css';
import { browser } from 'wxt/browser';
import { PLUGIN_DOC_URL, PROJECT_URL } from '../../core/config';
import { DEFAULT_EMOTE_SCALE } from '../../core/defaults';
import { rpc } from '../../core/rpc';
import type {
  AppSettings,
  AppState,
  CustomEmote,
  InstalledPlugin,
  RegistryRef,
} from '../../core/types';
import { h, link } from '../../ui/dom';
import { scaleControl } from '../../ui/scale';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;

const banner = h('div', { class: 'banner', hidden: true });
let state: AppState | null = null;
let bannerTimer: number | null = null;
let refreshTimer: number | null = null;

function show(text: string, kind: 'ok' | 'error' = 'ok'): void {
  banner.textContent = text;
  banner.className = `banner ${kind}`;
  banner.hidden = false;
  if (bannerTimer !== null) window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => {
    banner.hidden = true;
  }, 6000);
}

async function refresh(message?: string, kind: 'ok' | 'error' = 'ok'): Promise<void> {
  try {
    state = await rpc<AppState>('state/get');
    render();
    if (message) show(message, kind);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), 'error');
  }
}

async function requestOrigin(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return await browser.permissions.request({
      origins: [`${parsed.protocol}//${parsed.hostname}/*`],
    });
  } catch {
    return false;
  }
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const input = h('input', {
    type: 'checkbox',
    checked,
    on: {
      change: (event: Event) => {
        onChange((event.currentTarget as HTMLInputElement).checked);
      },
    },
  });
  return h('label', { class: 'check' }, input, label);
}

function card(...children: Array<Node | string>): HTMLElement {
  return h('div', { class: 'card' }, ...children);
}

function pluginRow(plugin: InstalledPlugin): HTMLElement {
  const descriptor = plugin.descriptor;
  const toggle = h('input', {
    type: 'checkbox',
    checked: plugin.enabled,
    on: {
      change: (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        void togglePlugin(plugin, input.checked, input);
      },
    },
  });

  const permissionChip = h('span', { class: 'chip', text: 'checking access…' });
  void browser.permissions
    .contains({ origins: descriptor.matches })
    .then((granted) => {
      if (granted) {
        permissionChip.remove();
      } else {
        permissionChip.textContent = 'permission needed';
        permissionChip.className = 'chip error-text';
      }
    })
    .catch(() => permissionChip.remove());

  const hosts = descriptor.matches.slice(0, 4).map((pattern) =>
    h('span', { class: 'chip', text: pattern }),
  );
  if (descriptor.matches.length > 4) {
    hosts.push(h('span', { class: 'chip', text: `+${descriptor.matches.length - 4}` }));
  }

  return h(
    'div',
    { class: 'plugin' },
    h(
      'div',
      {},
      h(
        'h3',
        {},
        descriptor.name,
        ' ',
        h('span', { class: 'muted small', text: `v${descriptor.version}` }),
      ),
      descriptor.description
        ? h('div', { class: 'muted small', text: descriptor.description })
        : null,
      h('div', { class: 'chips' }, ...hosts, permissionChip),
    ),
    h(
      'div',
      { class: 'actions' },
      h('label', { class: 'check' }, toggle, 'Enabled'),
      h('button', {
        class: 'danger',
        type: 'button',
        text: 'Remove',
        onclick: () => {
          if (!window.confirm(`Remove ${descriptor.name}?`)) return;
          void rpc('plugin/remove', { key: plugin.key })
            .then(() => refresh('Plugin removed'))
            .catch((error: unknown) => show(String(error), 'error'));
        },
      }),
    ),
  );
}

function registryCard(registry: RegistryRef): HTMLElement {
  const plugins = Object.values(state?.plugins ?? {}).filter(
    (plugin) => plugin.registryId === registry.id,
  );
  const status = registry.lastError
    ? h('div', { class: 'error-text', text: registry.lastError })
    : h('div', {
        class: 'muted small',
        text: `${registry.pluginCount ?? plugins.length} plugin(s) · ${
          registry.lastCheckedAt
            ? `checked ${new Date(registry.lastCheckedAt).toLocaleTimeString()}`
            : 'not checked yet'
        }`,
      });

  return card(
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        {},
        h('h2', { text: registry.name }),
        h('div', { class: 'muted small', text: registry.url }),
        status,
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', {
          type: 'button',
          text: 'Refresh',
          onclick: () => {
            void rpc<Record<string, string>>('registry/refresh', { id: registry.id })
              .then(() => refresh('Registry refreshed'))
              .catch((error: unknown) => show(String(error), 'error'));
          },
        }),
        h('button', {
          class: 'danger',
          type: 'button',
          text: 'Remove',
          onclick: () => {
            if (!window.confirm(`Remove registry "${registry.name}" and its plugins?`)) return;
            void rpc('registry/remove', { id: registry.id })
              .then(() => refresh('Registry removed'))
              .catch((error: unknown) => show(String(error), 'error'));
          },
        }),
      ),
    ),
    plugins.length
      ? h('div', { class: 'plugin-list' }, ...plugins.map(pluginRow))
      : h('div', { class: 'empty', text: 'No plugins in this registry yet.' }),
  );
}

function addRegistryForm(): HTMLElement {
  const name = h('input', { type: 'text', placeholder: 'Registry name (optional)' });
  const url = h('input', {
    type: 'text',
    placeholder: 'https://raw.githubusercontent.com/you/repo/main/index.json',
  });
  const form = h(
    'form',
    {
      class: 'form',
      on: {
        submit: (event: Event) => {
          event.preventDefault();
          const value = url.value.trim();
          if (!value) return;
          void (async () => {
            await requestOrigin(value);
            try {
              await rpc('registry/add', { name: name.value.trim(), url: value });
              name.value = '';
              url.value = '';
              await refresh('Registry added');
            } catch (error) {
              show(error instanceof Error ? error.message : String(error), 'error');
            }
          })();
        },
      },
    },
    h('div', { class: 'row' }, name, url),
    h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'submit', text: 'Add registry' })),
  );
  return card(
    h('h2', { text: 'Add a registry' }),
    h('p', {
      class: 'muted small',
      text: 'A registry is one JSON file with one or more declarative chat plugins.',
    }),
    form,
  );
}

function togglePlugin(plugin: InstalledPlugin, enabled: boolean, input: HTMLInputElement): void {
  void (async () => {
    try {
      if (enabled) {
        const granted = await browser.permissions.request({
          origins: plugin.descriptor.matches,
        });
        if (!granted) {
          input.checked = false;
          show('Host permission was not granted.', 'error');
          return;
        }
        await rpc('plugin/enable', { key: plugin.key });
        await refresh(`${plugin.descriptor.name} enabled`);
      } else {
        await rpc('plugin/disable', { key: plugin.key });
        await refresh(`${plugin.descriptor.name} disabled`);
      }
    } catch (error) {
      input.checked = !enabled;
      show(error instanceof Error ? error.message : String(error), 'error');
    }
  })();
}

function registriesSection(): HTMLElement {
  if (!state) return h('div');
  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        {},
        h('h2', { text: 'Registries & plugins' }),
        h('p', {
          class: 'muted small',
          text: 'Plugins teach the extension where a chat lives. Nothing is bundled: the default registry is fetched from the URL below.',
        }),
      ),
      h('button', {
        type: 'button',
        text: 'Refresh all',
        onclick: () => {
          void rpc('registry/refresh', {})
            .then(() => refresh('Registries refreshed'))
            .catch((error: unknown) => show(String(error), 'error'));
        },
      }),
    ),
    ...(state.registries.length
      ? state.registries.map(registryCard)
      : [h('div', { class: 'empty', text: 'No registries. Add one below.' })]),
    addRegistryForm(),
  );
}

function updateSettings(patch: Partial<AppSettings>): void {
  void rpc('settings/update', { patch })
    .then(() => refresh())
    .catch((error: unknown) => show(String(error), 'error'));
}

function sourcesSection(): HTMLElement {
  if (!state) return h('div');
  const { settings, customSets } = state;
  const setRows = customSets.map((set) =>
    h(
      'div',
      { class: 'plugin' },
      h(
        'div',
        {},
        h('h3', { text: set.name }),
        h('div', { class: 'muted small', text: `${set.emotes.length} emote(s)` }),
      ),
      h(
        'div',
        { class: 'actions' },
        checkbox('Enabled', set.enabled, (checked) => {
          void rpc('set/toggle', { id: set.id, enabled: checked })
            .then(() => refresh())
            .catch((error: unknown) => show(String(error), 'error'));
        }),
        h('button', {
          class: 'danger',
          type: 'button',
          text: 'Remove',
          onclick: () => {
            void rpc('set/remove', { id: set.id })
              .then(() => refresh('Set removed'))
              .catch((error: unknown) => show(String(error), 'error'));
          },
        }),
      ),
    ),
  );

  const name = h('input', { type: 'text', placeholder: 'Set name' });
  const json = h('textarea', {
    placeholder:
      '{\n  "name": "My set",\n  "emotes": [\n    { "code": "peepoHappy", "url": "https://cdn.7tv.app/emote/.../2x.webp" }\n  ]\n}',
  });
  const form = h(
    'form',
    {
      class: 'form',
      on: {
        submit: (event: Event) => {
          event.preventDefault();
          try {
            const parsed = JSON.parse(json.value) as
              | { name?: unknown; emotes?: unknown }
              | unknown[];
            const parsedName =
              Array.isArray(parsed) ? '' : typeof parsed.name === 'string' ? parsed.name : '';
            const emotes = Array.isArray(parsed) ? parsed : parsed.emotes;
            if (!Array.isArray(emotes)) throw new Error('Expected an "emotes" array');
            const finalName = name.value.trim() || parsedName;
            if (!finalName) throw new Error('Set name is required');
            void rpc('set/add', { name: finalName, emotes: emotes as CustomEmote[] })
              .then(() => {
                name.value = '';
                json.value = '';
                return refresh('Custom set added');
              })
              .catch((error: unknown) => show(String(error), 'error'));
          } catch (error) {
            show(error instanceof Error ? error.message : String(error), 'error');
          }
        },
      },
    },
    h('div', { class: 'row' }, name),
    json,
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'primary', type: 'submit', text: 'Add custom set' }),
    ),
  );

  return h(
    'section',
    { class: 'card' },
    h('h2', { text: 'Emote sources' }),
    h('p', {
      class: 'muted small',
      text: 'Global providers fill every chat. A per-chat 7TV binding overrides them. Custom sets sit between the channel set and the global providers.',
    }),
    h(
      'div',
      { class: 'stack' },
      checkbox('7TV global', settings.providers.sevenTv, (checked) =>
        updateSettings({ providers: { ...settings.providers, sevenTv: checked } }),
      ),
      checkbox('BTTV global', settings.providers.bttv, (checked) =>
        updateSettings({ providers: { ...settings.providers, bttv: checked } }),
      ),
      checkbox('FFZ global', settings.providers.ffz, (checked) =>
        updateSettings({ providers: { ...settings.providers, ffz: checked } }),
      ),
    ),
    h('div', { class: 'divider' }),
    h('h2', { text: 'Custom sets' }),
    ...(setRows.length ? setRows : [h('div', { class: 'empty', text: 'No custom sets.' })]),
    form,
  );
}

function bindingsSection(): HTMLElement {
  if (!state) return h('div');
  const bindings = Object.values(state.bindings);
  return h(
    'section',
    { class: 'card' },
    h('h2', { text: 'Chat bindings' }),
    h('p', {
      class: 'muted small',
      text: 'Open a chat, click the extension icon and bind a 7TV set to that channel. Bindings are per chat and override the global providers.',
    }),
    ...(bindings.length
      ? bindings.map((binding) =>
          h(
            'div',
            { class: 'plugin' },
            h(
              'div',
              {},
              h('h3', { text: binding.label }),
              h('div', { class: 'muted small', text: binding.channelKey }),
              h(
                'div',
                { class: 'chips' },
                ...binding.sets.map((set) => h('span', { class: 'chip', text: set })),
              ),
            ),
            h('button', {
              class: 'danger',
              type: 'button',
              text: 'Unbind',
              onclick: () => {
                void rpc('binding/remove', { key: binding.key })
                  .then(() => refresh('Binding removed'))
                  .catch((error: unknown) => show(String(error), 'error'));
              },
            }),
          ),
        )
      : [h('div', { class: 'empty', text: 'No per-chat bindings yet.' })]),
  );
}

function settingsSection(): HTMLElement {
  if (!state) return h('div');
  const { settings } = state;
  return h(
    'section',
    { class: 'card' },
    h('h2', { text: 'Settings' }),
    h(
      'div',
      { class: 'stack' },
      checkbox('Global mode: replace text everywhere on supported sites', settings.globalMode, (checked) =>
        updateSettings({ globalMode: checked }),
      ),
      checkbox('Auto: use the 7TV channel connected to the site', settings.autoChannel, (checked) =>
        updateSettings({ autoChannel: checked }),
      ),
      checkbox('Show the emote picker (Alt+E)', settings.pickerEnabled, (checked) =>
        updateSettings({ pickerEnabled: checked }),
      ),
      h(
        'div',
        { class: 'setting-row' },
        h(
          'div',
          {},
          h('div', { text: 'Emote size' }),
          h('div', {
            class: 'muted small',
            text: 'Relative to the chat text. Default is 1.2×.',
          }),
        ),
        scaleControl(settings.emoteScale, (value) => updateSettings({ emoteScale: value }), h('button', {
          type: 'button',
          text: 'Default',
          title: `Reset to ${DEFAULT_EMOTE_SCALE}×`,
          onclick: () => updateSettings({ emoteScale: DEFAULT_EMOTE_SCALE }),
        })),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', {
          type: 'button',
          text: 'Clear emote cache',
          onclick: () => {
            void rpc('cache/clear')
              .then(() => refresh('Emote cache cleared'))
              .catch((error: unknown) => show(String(error), 'error'));
          },
        }),
      ),
    ),
  );
}

function helpSection(): HTMLElement {
  const builtin = state?.registries.find((registry) => registry.builtin);
  return h(
    'section',
    { class: 'card' },
    h('h2', { text: 'Writing a plugin' }),
    h('p', {
      class: 'muted',
      text: 'A plugin is declarative JSON: match patterns, chat selectors, how to read a channel key, and where the composer lives. It cannot execute code or read anything outside the selectors it declares.',
    }),
    h('p', { class: 'muted small' }, 'Default registry: ', h('code', { text: builtin?.url ?? 'not configured' })),
    h(
      'div',
      { class: 'actions' },
      h('button', {
        type: 'button',
        text: 'Plugin format',
        onclick: () => window.open(PLUGIN_DOC_URL, '_blank', 'noreferrer'),
      }),
      h('button', {
        type: 'button',
        text: 'Source',
        onclick: () => window.open(PROJECT_URL, '_blank', 'noreferrer'),
      }),
    ),
    h(
      'footer',
      {},
      `Emote Anywhere v${browser.runtime.getManifest().version} · `,
      link(PROJECT_URL, 'project page'),
    ),
  );
}

function render(): void {
  if (!state) return;
  app.replaceChildren(
    h(
      'header',
      {},
      h('h1', { text: 'Emote Anywhere' }),
      h('p', {
        class: 'muted',
        text: 'One emote engine for every chat. Site support comes from declarative plugins.',
      }),
    ),
    banner,
    registriesSection(),
    sourcesSection(),
    bindingsSection(),
    settingsSection(),
    helpSection(),
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['state']) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 300);
});

void refresh();
