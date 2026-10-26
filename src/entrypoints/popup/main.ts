import './style.css';
import { browser } from 'wxt/browser';
import { bindingKey } from '../../core/channel';
import { DEFAULT_EMOTE_SCALE } from '../../core/defaults';
import { EMOTE_BASE_HEIGHT_EM } from '../../core/config';
import { rpc } from '../../core/rpc';
import type {
  AppSettings,
  AppState,
  Binding,
  ContentContext,
  FrameContext,
  InstalledPlugin,
  SevenTvSetInfo,
} from '../../core/types';
import { matchSpecificity, urlMatchesAny } from '../../core/url-match';
import { brandMark, pill, plural, shortId, switchRow } from '../../ui/components';
import { h } from '../../ui/dom';
import { clearSetLookupCache, lookupSet } from '../../ui/sets';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;

let state: AppState | null = null;
let tabId: number | undefined;
let tabUrl = '';
let context: ContentContext | null = null;
let message: { text: string; kind: 'ok' | 'error' } | null = null;
let messageTimer: number | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function show(text: string, kind: 'ok' | 'error' = 'ok'): void {
  message = { text, kind };
  if (messageTimer !== null) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }
  if (state || kind !== 'error') {
    messageTimer = window.setTimeout(() => {
      messageTimer = null;
      message = null;
      const active = document.activeElement;
      if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) render();
    }, 5000);
  }
}

function hostname(): string {
  try {
    return new URL(tabUrl).hostname;
  } catch {
    return tabUrl || 'this page';
  }
}

function bestPlugin(url: string): InstalledPlugin | null {
  if (!state) return null;
  const matching = Object.values(state.plugins).filter((plugin) =>
    urlMatchesAny(url, plugin.descriptor.matches),
  );
  const enabled = matching.filter((plugin) => plugin.enabled);
  const candidates = enabled.length ? enabled : matching;
  candidates.sort((left, right) => {
    const leftScore = matchSpecificity(left.descriptor.matches, left.descriptor.priority, url);
    const rightScore = matchSpecificity(right.descriptor.matches, right.descriptor.priority, url);
    return rightScore - leftScore;
  });
  return candidates[0] ?? null;
}

async function getContext(attempts = 1): Promise<ContentContext | null> {
  if (tabId === undefined) return null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const contexts = await rpc<FrameContext[]>('frame/contexts', { tabId });
      if (contexts.length) {
        const plugin = bestPlugin(tabUrl);
        return contexts.find((item) => item.pluginKey === plugin?.key) ?? contexts[0] ?? null;
      }
    } catch {
      // Background context registry is unavailable; try the top frame below.
    }
    try {
      const response = await browser.tabs.sendMessage(
        tabId,
        { type: 'ea/context' },
        { frameId: 0 },
      );
      if (response) return response as ContentContext;
    } catch {
      // Content script is not injected in this tab yet.
    }
    if (attempt + 1 < attempts) await sleep(250);
  }
  return null;
}

async function refresh(loadContext = true): Promise<void> {
  try {
    state = await rpc<AppState>('state/get');
    if (loadContext) context = await getContext();
    render();
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), 'error');
    render();
  }
}

function openOptions(hash = ''): void {
  const url = new URL('options.html', location.href);
  url.hash = hash;
  void browser.tabs.create({ url: url.toString() });
}

function currentBinding(plugin: InstalledPlugin): Binding | null {
  if (!state || !context) return null;
  return state.bindings[bindingKey(plugin.key, context.channelKey)] ?? null;
}

function setChip(setId: string, onRemove: () => void): HTMLElement {
  const label = h('span', { class: 'chip-label', text: shortId(setId) });
  const chip = h(
    'span',
    { class: 'chip', title: setId },
    label,
    h('button', {
      type: 'button',
      text: '×',
      'aria-label': `Remove set ${setId}`,
      onclick: onRemove,
    }),
  );
  void lookupSet(setId).then((info) => {
    if (!info) return;
    label.textContent = info.name;
    chip.title = `${info.name} · ${plural(info.emoteCount, 'emote')}`;
  });
  return chip;
}

function bindingCard(plugin: InstalledPlugin): HTMLElement {
  const binding = currentBinding(plugin);
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: '7TV set id or 7tv.app link',
    'aria-label': '7TV set to bind to this chat',
  });
  const bindButton = h('button', {
    class: 'btn primary',
    type: 'submit',
    text: 'Bind set',
  });

  const bind = (): void => {
    const value = input.value.trim();
    if (!value || !context) return;
    bindButton.disabled = true;
    void (async () => {
      try {
        const info = await rpc<SevenTvSetInfo>('sevenTv/lookupSet', { input: value });
        const sets = Array.from(new Set([...(binding?.sets ?? []), info.id]));
        await rpc<Binding>('binding/set', {
          pluginKey: plugin.key,
          channelKey: context?.channelKey ?? 'default',
          label: `${plugin.descriptor.name} · ${context?.channelKey ?? 'default'}`,
          sets,
        });
        input.value = '';
        show(`Bound ${info.name}`);
        await refresh();
      } catch (error) {
        show(error instanceof Error ? error.message : String(error), 'error');
        bindButton.disabled = false;
        render();
      }
    })();
  };

  const chips = (binding?.sets ?? []).map((setId) =>
    setChip(setId, () => {
      void (async () => {
        if (!binding || !context) return;
        const sets = binding.sets.filter((id) => id !== setId);
        try {
          if (sets.length) {
            await rpc('binding/set', {
              pluginKey: plugin.key,
              channelKey: context.channelKey,
              label: binding.label,
              sets,
            });
          } else {
            await rpc('binding/remove', { key: binding.key });
          }
          show('Binding updated');
          await refresh();
        } catch (error) {
          show(error instanceof Error ? error.message : String(error), 'error');
          render();
        }
      })();
    }),
  );

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', { text: 'This chat' }),
        h('p', {
          class: 'mono',
          text: context?.channelKey ?? 'unknown channel',
        }),
      ),
      binding
        ? h('button', {
            class: 'btn danger tiny',
            type: 'button',
            text: 'Unbind',
            onclick: () => {
              void rpc('binding/remove', { key: binding.key })
                .then(() => refresh())
                .catch((error: unknown) => {
                  show(String(error), 'error');
                  render();
                });
            },
          })
        : null,
    ),
    chips.length
      ? h('div', { class: 'chips' }, ...chips)
      : h('p', {
          class: 'section-note',
          text: 'No set bound here. The chat uses global sets, the 7TV channel or the provider globals.',
        }),
    h(
      'form',
      {
        class: 'inline-form',
        on: {
          submit: (event: Event) => {
            event.preventDefault();
            bind();
          },
        },
      },
      input,
      bindButton,
    ),
  );
}

function globalCard(current: AppState): HTMLElement {
  const sets = current.globalBinding.sets;
  const rows = sets.length
    ? h(
        'div',
        { class: 'global-list' },
        ...sets.map((id) => {
          const label = h('span', { class: 'row-title', text: shortId(id) });
          const count = h('span', { class: 'pill', text: '7TV' });
          void lookupSet(id).then((info) => {
            if (!info) return;
            label.textContent = info.name;
            count.textContent = plural(info.emoteCount, 'emote');
          });
          return h('div', { class: 'global-row' }, label, count);
        }),
      )
    : h('p', { class: 'section-note', text: 'No global sets. Using channel and provider emotes.' });

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', { text: 'Global sets' }),
        h('p', { text: 'Load in every chat.' }),
      ),
      h('button', {
        class: 'btn tiny',
        type: 'button',
        text: 'Manage',
        onclick: () => openOptions('#bindings'),
      }),
    ),
    rows,
  );
}

function pluginCard(plugin: InstalledPlugin): HTMLElement {
  const on = plugin.enabled;
  const connected = on && context !== null;

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'plugin-head' },
      h(
        'div',
        { class: 'row-copy' },
        h('h2', { class: 'plugin-name', text: plugin.descriptor.name }),
        h('p', {
          class: 'row-sub',
          text: `${plural(plugin.descriptor.matches.length, 'host')} · v${plugin.descriptor.version}`,
        }),
      ),
      switchRow({
        title: '',
        ariaLabel: `Enable ${plugin.descriptor.name}`,
        checked: on,
        onChange: (checked) => togglePlugin(plugin, checked),
      }),
    ),
    h(
      'p',
      { class: connected ? 'status ok' : 'status' },
      connected
        ? `Connected to ${context?.channelKey ?? 'this chat'}`
        : on
          ? 'Page not connected'
          : 'Off for this site',
      on && !connected
        ? h('button', {
            class: 'btn tiny',
            type: 'button',
            text: 'Reload tab',
            onclick: () => {
              if (tabId !== undefined) void browser.tabs.reload(tabId);
            },
          })
        : null,
    ),
  );
}

function togglePlugin(plugin: InstalledPlugin, enabled: boolean): void {
  void (async () => {
    if (!enabled) {
      try {
        await rpc('plugin/disable', { key: plugin.key });
        show('Plugin disabled');
        context = null;
        await refresh();
      } catch (error) {
        show(String(error), 'error');
        render();
      }
      return;
    }

    try {
      const granted = await browser.permissions.request({ origins: plugin.descriptor.matches });
      if (!granted) {
        show('Host permission was not granted.', 'error');
        render();
        return;
      }
      await rpc('plugin/enable', { key: plugin.key });
      show('Plugin enabled');
      await sleep(350);
      context = await getContext(5);
      await refresh(false);
    } catch (error) {
      show(String(error), 'error');
      render();
    }
  })();
}

function sizeCard(current: AppState): HTMLElement {
  const output = h('span', { class: 'range-value num', text: `${current.settings.emoteScale.toFixed(1)}×` });
  const note = h('p', {
    text: `Default ${DEFAULT_EMOTE_SCALE.toFixed(1)}× · ${(EMOTE_BASE_HEIGHT_EM * current.settings.emoteScale).toFixed(1)}em tall`,
  });
  const input = h('input', {
    type: 'range',
    min: '0.5',
    max: '3',
    step: '0.1',
    value: String(current.settings.emoteScale),
    'aria-label': 'Emote size',
    on: {
      input: () => {
        output.textContent = `${Number(input.value).toFixed(1)}×`;
      },
      change: () => {
        const next = Number(input.value);
        void rpc<AppSettings>('settings/update', {
          patch: { emoteScale: next },
        })
          .then((settings) => {
            if (state) state.settings = settings;
            note.textContent = `Default ${DEFAULT_EMOTE_SCALE.toFixed(1)}× · ${(EMOTE_BASE_HEIGHT_EM * next).toFixed(1)}em tall`;
          })
          .catch((error: unknown) => {
            if (state) {
              input.value = String(state.settings.emoteScale);
              note.textContent = `Default ${DEFAULT_EMOTE_SCALE.toFixed(1)}× · ${(EMOTE_BASE_HEIGHT_EM * state.settings.emoteScale).toFixed(1)}em tall`;
            }
            output.textContent = `${Number(input.value).toFixed(1)}×`;
            show(String(error), 'error');
          });
      },
    },
  });

  const applyScale = (next: number): void => {
    input.value = String(next);
    output.textContent = `${next.toFixed(1)}×`;
    note.textContent = `Default ${DEFAULT_EMOTE_SCALE.toFixed(1)}× · ${(EMOTE_BASE_HEIGHT_EM * next).toFixed(1)}em tall`;
    if (state) state.settings.emoteScale = next;
  };

  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', { text: 'Emote size' }),
        note,
      ),
      h('button', {
        class: 'btn tiny',
        type: 'button',
        text: 'Reset',
        onclick: () => {
          void rpc<AppSettings>('settings/update', {
            patch: { emoteScale: DEFAULT_EMOTE_SCALE },
          })
            .then((settings) => {
              if (state) state.settings = settings;
              applyScale(DEFAULT_EMOTE_SCALE);
            })
            .catch((error: unknown) => {
              show(String(error), 'error');
            });
        },
      }),
    ),
    h('div', { class: 'range-row' }, input, output),
  );
}

function noPluginView(): HTMLElement {
  return h(
    'section',
    { class: 'panel empty-panel' },
    h('h2', { text: 'No site support yet' }),
    h('p', {
      class: 'section-note',
      text: 'Site support is a declarative plugin. Add a registry or enable a plugin for this host in Sources.',
    }),
    h(
      'div',
      { class: 'form-actions' },
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Open sources',
        onclick: () => openOptions('#sources'),
      }),
    ),
  );
}

function render(): void {
  app.replaceChildren();

  app.append(
    h(
      'header',
      { class: 'popup-head' },
      h(
        'div',
        { class: 'popup-brand' },
        brandMark(),
        h('h1', { class: 'popup-title', text: 'Emote Anywhere' }),
      ),
      h('span', { class: 'site mono', title: tabUrl, text: hostname() }),
    ),
  );

  if (message) {
    app.append(h('div', { class: `banner ${message.kind}`, role: 'status', text: message.text }));
  }

  if (!state) {
    if (message?.kind === 'error') {
      app.append(
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Retry',
          onclick: () => {
            if (messageTimer !== null) window.clearTimeout(messageTimer);
            messageTimer = null;
            message = null;
            render();
            void refresh();
          },
        }),
      );
    } else {
      app.append(h('p', { class: 'section-note', text: 'Loading…' }));
    }
    return;
  }

  const contextPlugin = context ? state.plugins[context.pluginKey] ?? null : null;
  const plugin = contextPlugin ?? bestPlugin(tabUrl);
  if (!plugin) {
    app.append(noPluginView());
    app.append(
      h(
        'div',
        { class: 'popup-foot' },
        h('button', {
          class: 'btn quiet',
          type: 'button',
          text: 'Settings',
          onclick: () => openOptions(),
        }),
      ),
    );
    return;
  }

  app.append(pluginCard(plugin));

  if (plugin.enabled) {
    if (context) app.append(bindingCard(plugin));
    app.append(globalCard(state));
    app.append(sizeCard(state));
    app.append(
      h(
        'footer',
        { class: 'popup-foot' },
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Reload emotes',
          onclick: () => {
            void (async () => {
              try {
                await rpc('cache/clear');
                clearSetLookupCache();
                if (tabId !== undefined) {
                  await browser.tabs
                    .sendMessage(tabId, { type: 'ea/resync' })
                    .catch(() => undefined);
                }
                await sleep(300);
                show('Emotes reloaded');
                await refresh();
              } catch (error) {
                show(error instanceof Error ? error.message : String(error), 'error');
                render();
              }
            })();
          },
        }),
        h('button', {
          class: 'btn quiet',
          type: 'button',
          text: 'Settings',
          onclick: () => openOptions(),
        }),
      ),
    );
  } else {
    app.append(
      h(
        'footer',
        { class: 'popup-foot' },
        h('button', {
          class: 'btn quiet',
          type: 'button',
          text: 'Settings',
          onclick: () => openOptions(),
        }),
      ),
    );
  }
}

void (async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  tabUrl = tab?.url ?? '';
  await refresh();
})();

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['state']) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    void getContext().then((next) => {
      context = next;
    });
    return;
  }
  void refresh(false).then(() =>
    getContext().then((next) => {
      context = next;
      render();
    }),
  );
});
