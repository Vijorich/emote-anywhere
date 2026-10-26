import './style.css';
import { browser } from 'wxt/browser';
import { DEFAULT_EMOTE_SCALE } from '../../core/defaults';
import { rpc } from '../../core/rpc';
import type {
  AppSettings,
  AppState,
  Binding,
  ContentContext,
  InstalledPlugin,
  SevenTvSetInfo,
} from '../../core/types';
import { matchSpecificity, urlMatchesAny } from '../../core/url-match';
import { h } from '../../ui/dom';
import { scaleControl } from '../../ui/scale';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;

let state: AppState | null = null;
let tabId: number | undefined;
let tabUrl = '';
let context: ContentContext | null = null;
let message: { text: string; kind: 'ok' | 'error' } | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function show(text: string, kind: 'ok' | 'error' = 'ok'): void {
  message = { text, kind };
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
  const candidates = Object.values(state.plugins).filter((plugin) =>
    urlMatchesAny(url, plugin.descriptor.matches),
  );
  candidates.sort((left, right) => {
    const leftScore = matchSpecificity(left.descriptor.matches, left.descriptor.priority);
    const rightScore = matchSpecificity(right.descriptor.matches, right.descriptor.priority);
    return rightScore - leftScore;
  });
  return candidates[0] ?? null;
}

async function getContext(attempts = 1): Promise<ContentContext | null> {
  if (tabId === undefined) return null;
  for (let attempt = 0; attempt < attempts; attempt++) {
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

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  return h(
    'label',
    { class: 'check' },
    h('input', {
      type: 'checkbox',
      checked,
      on: {
        change: (event: Event) => onChange((event.currentTarget as HTMLInputElement).checked),
      },
    }),
    label,
  );
}

function currentBinding(plugin: InstalledPlugin): Binding | null {
  if (!state || !context) return null;
  return state.bindings[`${plugin.key}|${context.channelKey}`] ?? null;
}

function bindingCard(plugin: InstalledPlugin): HTMLElement {
  const binding = currentBinding(plugin);
  const input = h('input', {
    type: 'text',
    placeholder: '7TV set id or https://7tv.app/emote-sets/…',
  });
  const bindButton = h('button', {
    class: 'primary',
    type: 'button',
    text: 'Bind',
    onclick: () => {
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
          show(`Bound ${info.name} (${info.emoteCount} emotes)`);
          await refresh();
        } catch (error) {
          show(error instanceof Error ? error.message : String(error), 'error');
          bindButton.disabled = false;
          render();
        }
      })();
    },
  });

  const chips = (binding?.sets ?? []).map((setId) =>
    h(
      'span',
      { class: 'chip' },
      setId,
      h('button', {
        type: 'button',
        text: '×',
        title: 'Remove set',
        onclick: () => {
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
        },
      }),
    ),
  );

  return h(
    'div',
    { class: 'card' },
    h('h2', { text: 'This chat' }),
    h('div', { class: 'muted small', text: `Channel: ${context?.channelKey ?? 'unknown'}` }),
    binding?.sets.length
      ? h('div', { class: 'chips' }, ...chips)
      : h('div', { class: 'empty', text: 'Using auto channel or global providers.' }),
    h(
      'div',
      { class: 'form' },
      input,
      h(
        'div',
        { class: 'actions' },
        bindButton,
        binding
          ? h('button', {
              class: 'danger',
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
    ),
  );
}

function pluginCard(plugin: InstalledPlugin): HTMLElement {
  const toggle = h('input', {
    type: 'checkbox',
    checked: plugin.enabled,
    on: {
      change: (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        void (async () => {
          if (!input.checked) {
            try {
              await rpc('plugin/disable', { key: plugin.key });
              show('Plugin disabled');
              context = null;
              await refresh();
            } catch (error) {
              input.checked = true;
              show(String(error), 'error');
              render();
            }
            return;
          }
          const granted = await browser.permissions.request({
            origins: plugin.descriptor.matches,
          });
          if (!granted) {
            input.checked = false;
            show('Host permission was not granted.', 'error');
            render();
            return;
          }
          try {
            await rpc('plugin/enable', { key: plugin.key });
            show('Plugin enabled');
            await sleep(350);
            context = await getContext(5);
            await refresh(false);
          } catch (error) {
            input.checked = false;
            show(String(error), 'error');
            render();
          }
        })();
      },
    },
  });

  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        {},
        h('h2', { text: plugin.descriptor.name }),
        h('div', { class: 'muted small', text: `v${plugin.descriptor.version}` }),
      ),
      h('label', { class: 'check' }, toggle, 'On'),
    ),
    plugin.descriptor.description
      ? h('div', { class: 'muted small', text: plugin.descriptor.description })
      : null,
  );
}

function globalModeCard(): HTMLElement {
  if (!state) return h('div');
  return h(
    'div',
    { class: 'card' },
    checkbox('Global mode: replace all text on this site', state.settings.globalMode, (checked) => {
      void rpc<AppSettings>('settings/update', { patch: { globalMode: checked } })
        .then(() => refresh(false))
        .catch((error: unknown) => {
          show(String(error), 'error');
          render();
        });
    }),
  );
}

function sizeCard(): HTMLElement {
  if (!state) return h('div');
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        {},
        h('h2', { text: 'Emote size' }),
        h('div', { class: 'muted small', text: 'Default 1.2×' }),
      ),
      scaleControl(
        state.settings.emoteScale,
        (value) => {
          void rpc<AppSettings>('settings/update', { patch: { emoteScale: value } })
            .then(() => refresh(false))
            .catch((error: unknown) => {
              show(String(error), 'error');
              render();
            });
        },
        h('button', {
          type: 'button',
          text: 'Default',
          title: `Reset to ${DEFAULT_EMOTE_SCALE}×`,
          onclick: () => {
            void rpc<AppSettings>('settings/update', {
              patch: { emoteScale: DEFAULT_EMOTE_SCALE },
            })
              .then(() => refresh(false))
              .catch((error: unknown) => {
                show(String(error), 'error');
                render();
              });
          },
        }),
      ),
    ),
  );
}

function render(): void {
  app.replaceChildren();

  app.append(
    h(
      'header',
      {},
      h('strong', { text: 'Emote Anywhere' }),
      h('span', { class: 'site', text: hostname() }),
    ),
  );

  if (message) {
    app.append(h('div', { class: `banner ${message.kind}`, text: message.text }));
  }

  if (!state) {
    app.append(h('div', { class: 'empty', text: 'Loading…' }));
    return;
  }

  const plugin = bestPlugin(tabUrl);
  if (!plugin) {
    app.append(
      h(
        'div',
        { class: 'card' },
        h('h2', { text: 'No plugin for this site' }),
        h('div', {
          class: 'empty',
          text: 'Site support is a declarative plugin. Add a registry or install a plugin from the settings page.',
        }),
      ),
    );
  } else {
    app.append(pluginCard(plugin));
    if (plugin.enabled) {
      if (context) {
        app.append(bindingCard(plugin));
      } else {
        app.append(
          h(
            'div',
            { class: 'card' },
            h('h2', { text: 'Page not connected' }),
            h('div', {
              class: 'empty',
              text: 'Reload this tab so the content script can attach to the chat.',
            }),
            h(
              'div',
              { class: 'actions' },
              h('button', {
                class: 'primary',
                type: 'button',
                text: 'Reload tab',
                onclick: () => {
                  if (tabId !== undefined) void browser.tabs.reload(tabId);
                },
              }),
            ),
          ),
        );
      }
      app.append(sizeCard());
      app.append(globalModeCard());
      app.append(
        h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'actions' },
            h('button', {
              type: 'button',
              text: 'Reload emotes',
              onclick: () => {
                void (async () => {
                  try {
                    await rpc('cache/clear');
                    if (tabId !== undefined) {
                      await browser.tabs
                        .sendMessage(tabId, { type: 'ea/resync' }, { frameId: 0 })
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
              type: 'button',
              text: 'Settings',
              onclick: () => {
                void browser.runtime.openOptionsPage();
              },
            }),
          ),
        ),
      );
    }
  }

  if (!plugin) {
    app.append(
      h(
        'div',
        { class: 'actions' },
        h('button', {
          type: 'button',
          text: 'Open settings',
          onclick: () => {
            void browser.runtime.openOptionsPage();
          },
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
  void refresh(false).then(() => getContext().then((next) => {
    context = next;
    render();
  }));
});
