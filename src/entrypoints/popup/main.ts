import './style.css';
import { browser } from 'wxt/browser';
import { bindingKey } from '../../core/channel';
import { rpc } from '../../core/rpc';
import type {
  AppState,
  Binding,
  ContentContext,
  FrameContext,
  InstalledPlugin,
  SevenTvSetInfo,
} from '../../core/types';
import { matchSpecificity, urlMatchesAny } from '../../core/url-match';
import { bindingLabel, brandMark, plural, shortId, switchRow } from '../../ui/components';
import { h } from '../../ui/dom';
import { trackFocusModality } from '../../ui/focus-modality';
import { clearSetLookupCache, lookupSet, setUrl } from '../../ui/sets';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;
trackFocusModality();

let state: AppState | null = null;
let stateError = false;
let tabId: number | undefined;
let tabUrl = '';
let context: ContentContext | null = null;
let restoreFocusKey: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    stateError = false;
    if (loadContext) context = await getContext();
    render();
  } catch (error) {
    console.error(error);
    stateError = true;
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
  const label = h('a', {
    class: 'chip-label',
    href: setUrl(setId),
    target: '_blank',
    rel: 'noreferrer',
    text: shortId(setId),
  });
  const remove = h('button', {
    type: 'button',
    text: '×',
    'aria-label': `Remove set ${shortId(setId)}`,
    onclick: onRemove,
  });
  const chip = h('span', { class: 'chip', title: setId }, label, remove);
  void lookupSet(setId).then((info) => {
    if (!info) return;
    label.textContent = info.name;
    chip.title = `${info.name} · ${plural(info.emoteCount, 'emote')}`;
    remove.setAttribute('aria-label', `Remove set ${info.name}`);
  });
  return chip;
}

function clearBindingButton(binding: Binding): HTMLButtonElement {
  const button = h('button', {
    class: 'btn danger tiny',
    type: 'button',
    text: 'Clear chat set',
  });
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Clearing…';
    void rpc('binding/remove', { key: binding.key })
      .then(async () => {
        await refresh();
      })
      .catch((error: unknown) => {
        console.error(error);
        render();
      });
  });

  return button;
}

function bindingCard(plugin: InstalledPlugin): HTMLElement {
  const binding = currentBinding(plugin);
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: '7TV set link or ID',
    'aria-label': '7TV set for this chat',
  });
  const bindButton = h('button', {
    class: 'btn primary',
    type: 'submit',
    text: 'Add set',
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
          label: hostname(),
          sets,
        });
        input.value = '';
        await refresh();
      } catch (error) {
        console.error(error);
        bindButton.disabled = false;
      }
    })();
  };

  const chips = (binding?.sets ?? []).map((setId) =>
    setChip(setId, () => {
      void (async () => {
        if (!binding) return;
        const sets = binding.sets.filter((id) => id !== setId);
        try {
          if (sets.length) {
            await rpc('binding/set', {
              pluginKey: binding.pluginKey,
              channelKey: binding.channelKey,
              label: binding.label,
              sets,
            });
          } else {
            await rpc('binding/remove', { key: binding.key });
          }
          await refresh();
        } catch (error) {
          console.error(error);
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
        h('h2', { text: 'Chat set' }),
        h('p', {
          title: context?.channelKey ? `Channel ${context.channelKey}` : undefined,
          text: binding
            ? bindingLabel(binding.label, binding.channelKey, hostname())
            : hostname(),
        }),
      ),
      binding ? clearBindingButton(binding) : null,
    ),
    chips.length
      ? h('div', { class: 'chips' }, ...chips)
      : h('p', {
          class: 'section-note',
          text: 'No 7TV set for this chat. Add one below.',
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
          text: plural(plugin.descriptor.matches.length, 'site'),
        }),
      ),
      switchRow({
        title: '',
        ariaLabel: `Enable ${plugin.descriptor.name}`,
        focusKey: `plugin-${plugin.key}`,
        checked: on,
        onChange: (checked) => togglePlugin(plugin, checked),
      }),
    ),
    h(
      'p',
      { class: connected ? 'status ok' : on ? 'status warn' : 'status' },
      connected ? 'Connected' : on ? 'Not connected' : 'Off',
      on && !connected
        ? h('button', {
            class: 'btn tiny',
            type: 'button',
            text: 'Reload page',
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
        context = null;
        await refresh();
      } catch (error) {
        console.error(error);
        render();
      }
      return;
    }

    try {
      const granted = await browser.permissions.request({ origins: plugin.descriptor.matches });
      if (!granted) {
        console.error(new Error('Site access was not granted.'));
        render();
        return;
      }
      await rpc('plugin/enable', { key: plugin.key });
      await sleep(350);
      context = await getContext(5);
      await refresh(false);
    } catch (error) {
      console.error(error);
      render();
    }
  })();
}

function noPluginView(): HTMLElement {
  return h(
    'section',
    { class: 'panel empty-panel' },
    h('h2', { text: 'Not supported here' }),
    h(
      'div',
      { class: 'form-actions' },
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Open Sources',
        onclick: () => openOptions('#sources'),
      }),
    ),
  );
}

function render(): void {
  const active = document.activeElement as HTMLElement | null;
  if (active?.dataset.focusKey) {
    restoreFocusKey = active.dataset.focusKey;
    queueMicrotask(() => {
      const key = restoreFocusKey;
      restoreFocusKey = null;
      if (!key) return;
      const target = Array.from(
        app.querySelectorAll<HTMLElement>('[data-focus-key]'),
      ).find((element) => element.dataset.focusKey === key);
      target?.focus();
    });
  }
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

  if (!state) {
    if (stateError) {
      app.append(h('p', { class: 'section-note', text: 'Could not load settings.' }));
      app.append(
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Retry',
          onclick: () => {
            stateError = false;
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
    const reloadButton = h('button', {
      class: 'btn quiet',
      type: 'button',
      text: 'Reload emotes',
      onclick: () => {
        if (reloadButton.disabled) return;
        reloadButton.disabled = true;
        reloadButton.setAttribute('aria-busy', 'true');
        reloadButton.textContent = 'Reloading…';
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
            await refresh();
          } catch (error) {
            console.error(error);
            render();
          } finally {
            reloadButton.disabled = false;
            reloadButton.removeAttribute('aria-busy');
            reloadButton.textContent = 'Reload emotes';
          }
        })();
      },
    });
    app.append(
      h(
        'footer',
        { class: 'popup-foot' },
        reloadButton,
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
