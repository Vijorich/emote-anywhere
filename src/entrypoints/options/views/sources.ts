import { browser } from 'wxt/browser';
import { rpc } from '../../../core/rpc';
import type {
  AppState,
  CustomEmote,
  CustomSet,
  InstalledPlugin,
  RegistryRef,
} from '../../../core/types';
import { field, pill, plural, switchRow } from '../../../ui/components';
import { h, link } from '../../../ui/dom';
import type { OptionsContext } from '../context';
import { clearFieldError, markFieldError, withBusy } from '../shared';

export function sourcesView(current: AppState, ctx: OptionsContext): HTMLElement {
  const { settings, customSets } = current;
  const setRows = customSets.length
    ? h(
        'div',
        { class: 'rows' },
        ...customSets.map((set) =>
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'row-main' },
              h(
                'span',
                { class: 'row-copy' },
                h('span', { class: 'row-title', text: set.name }),
                h('span', { class: 'row-sub', text: plural(set.emotes.length, 'emote') }),
              ),
            ),
            h(
              'div',
              { class: 'row-actions' },
              h('button', {
                class: 'btn danger tiny',
                type: 'button',
                text: 'Remove',
                onclick: (event: Event) =>
                  removeCustomSet(event.currentTarget as HTMLButtonElement, set, ctx),
              }),
              switchRow({
                title: '',
                ariaLabel: `Enable ${set.name}`,
                focusKey: `custom-set-${set.id}`,
                checked: set.enabled,
                onChange: (checked) => {
                  void rpc('set/toggle', { id: set.id, enabled: checked })
                    .then(() => ctx.refresh())
                    .catch((error: unknown) => {
                      console.error(error);
                      void ctx.refresh();
                    });
                },
              }),
            ),
          ),
        ),
      )
    : h('div', { class: 'empty' }, 'No custom sets yet.');

  const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Set name' });
  const jsonInput = h('textarea', {
    class: 'textarea',
    placeholder:
      '{\n  "name": "My set",\n  "emotes": [\n    { "code": "peepoHappy", "url": "https://cdn.7tv.app/emote/.../2x.webp" }\n  ]\n}',
  });

  const registryPanels = current.registries.length
    ? current.registries.map((registry) => registryPanel(current, registry, ctx))
    : [h('div', { class: 'empty' }, 'No registries yet.')];

  return h(
    'main',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Sources' })),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('h2', { text: 'Providers' }),
      ),
      h(
        'div',
        { class: 'panel' },
        switchRow({
          title: '7TV',
          focusKey: 'provider-sevenTv',
          checked: settings.providers.sevenTv,
          onChange: (checked) => {
            ctx.updateSettings({ providers: { ...settings.providers, sevenTv: checked } });
          },
        }),
        switchRow({
          title: 'BetterTTV',
          focusKey: 'provider-bttv',
          checked: settings.providers.bttv,
          onChange: (checked) => {
            ctx.updateSettings({ providers: { ...settings.providers, bttv: checked } });
          },
        }),
        switchRow({
          title: 'FrankerFaceZ',
          focusKey: 'provider-ffz',
          checked: settings.providers.ffz,
          onChange: (checked) => {
            ctx.updateSettings({ providers: { ...settings.providers, ffz: checked } });
          },
        }),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('h2', { text: 'Custom sets' }),
        h('span', { class: 'meta', text: plural(customSets.length, 'set') }),
      ),
      h('div', { class: 'panel' }, setRows, addCustomSetForm(nameInput, jsonInput, ctx)),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('h2', { text: 'Registries' }),
        h('span', { class: 'meta', text: plural(current.registries.length, 'registry', 'registries') }),
      ),
      ...registryPanels,
      addRegistryForm(ctx),
    ),
  );
}

function removeCustomSet(
  button: HTMLButtonElement,
  set: CustomSet,
  ctx: OptionsContext,
): void {
  void withBusy(button, 'Removing…', async () => {
    try {
      await rpc('set/remove', { id: set.id });
      await ctx.refresh();
    } catch (error) {
      console.error(error);
    }
  });
}

function addCustomSetForm(
  name: HTMLInputElement,
  json: HTMLTextAreaElement,
  ctx: OptionsContext,
): HTMLElement {
  const fail = (message: string, target: HTMLElement): void => {
    markFieldError(target as HTMLInputElement | HTMLTextAreaElement, message);
  };
  name.addEventListener('input', () => clearFieldError(name));
  json.addEventListener('input', () => clearFieldError(json));
  return h(
    'details',
    { class: 'disclosure' },
    h('summary', { text: 'Add custom set' }),
    h(
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
              if (!Array.isArray(emotes)) {
                fail('The set needs an emotes array.', json);
                return;
              }
              const finalName = name.value.trim() || parsedName;
              if (!finalName) {
                fail('Enter a set name.', name);
                return;
              }
              void rpc('set/add', { name: finalName, emotes: emotes as CustomEmote[] })
                .then(() => {
                  name.value = '';
                  json.value = '';
                  return ctx.refresh();
                })
                .catch((error: unknown) => {
                  fail(error instanceof Error ? error.message : String(error), json);
                });
            } catch (error) {
              fail(error instanceof Error ? error.message : String(error), json);
            }
          },
        },
      },
      h('p', {
        class: 'section-note',
        text: 'Paste a JSON object with an emotes array. Each emote needs a code and a URL. The Name field overrides the name in the JSON.',
      }),
      field('Name', name),
      h(
        'label',
        { class: 'field' },
        h('span', { text: 'Emotes (JSON)' }),
        json,
      ),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { class: 'btn primary', type: 'submit', text: 'Add set' }),
      ),
    ),
  );
}

function registryPanel(
  current: AppState,
  registry: RegistryRef,
  ctx: OptionsContext,
): HTMLElement {
  const plugins = Object.values(current.plugins).filter(
    (plugin) => plugin.registryId === registry.id,
  );
  const refreshButton = h('button', {
    class: 'btn tiny',
    type: 'button',
    text: 'Refresh',
    onclick: () => {
      void withBusy(refreshButton, 'Refreshing…', async () => {
        try {
          await rpc<Record<string, string>>('registry/refresh', { id: registry.id });
          await ctx.refresh();
        } catch (error) {
          console.error(error);
        }
      });
    },
  });
  return h(
    'div',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-head' },
      h(
        'div',
        {},
        h('h2', { text: registry.name }),
        h(
          'p',
          { class: 'mono', title: registry.url },
          h('a', {
            href: registry.url,
            target: '_blank',
            rel: 'noreferrer',
            // Break the long URL at its slashes instead of inside a word.
            text: registry.url.replaceAll('/', '/\u200B'),
          }),
        ),
        h('p', {
          text: plural(registry.pluginCount ?? plugins.length, 'plugin'),
        }),
      ),
      h(
        'div',
        { class: 'row-actions' },
        refreshButton,
        registry.builtin
          ? null
          : h('button', {
              class: 'btn danger tiny',
              type: 'button',
              text: 'Remove',
              onclick: (event: Event) => {
                const button = event.currentTarget as HTMLButtonElement;
                if (!window.confirm(`Remove registry "${registry.name}" and its plugins?`)) return;
                void withBusy(button, 'Removing…', async () => {
                  try {
                    await rpc('registry/remove', { id: registry.id });
                    await ctx.refresh();
                  } catch (error) {
                    console.error(error);
                  }
                });
              },
            }),
      ),
    ),
    registry.lastError ? h('div', { class: 'banner error', text: registry.lastError }) : null,
    plugins.length
      ? h('div', { class: 'rows' }, ...plugins.map((plugin) => pluginRow(plugin, ctx)))
      : h(
          'div',
          { class: 'empty' },
          'No plugins in this registry. Refresh it above.',
        ),
  );
}

function removePlugin(
  button: HTMLButtonElement,
  plugin: InstalledPlugin,
  ctx: OptionsContext,
  close?: () => void,
): void {
  if (!window.confirm(`Remove ${plugin.descriptor.name}?`)) return;
  close?.();
  void withBusy(button, 'Removing…', async () => {
    try {
      await rpc('plugin/remove', { key: plugin.key });
      await ctx.refresh();
    } catch (error) {
      console.error(error);
    }
  });
}

function pluginRow(plugin: InstalledPlugin, ctx: OptionsContext): HTMLElement {
  const descriptor = plugin.descriptor;
  const permission = h('span', { class: 'pill', text: 'Checking…' });
  void browser.permissions
    .contains({ origins: descriptor.matches })
    .then((granted) => {
      permission.textContent = granted ? 'Allowed' : 'No site access';
      permission.className = granted ? 'pill ok' : 'pill warn';
    })
    .catch(() => {
      permission.textContent = 'Access unknown';
      permission.className = 'pill';
    });

  const details = pluginDetails(plugin, ctx);
  const remove = h('button', {
    class: 'btn danger tiny',
    type: 'button',
    text: 'Remove',
  });
  remove.addEventListener('click', () => removePlugin(remove, plugin, ctx));
  return h(
    'div',
    { class: 'row plugin-row' },
    h('button', {
      class: 'plugin-details',
      type: 'button',
      'aria-label': `Details for ${descriptor.name}`,
      'aria-haspopup': 'dialog',
      onclick: () => details.showModal(),
    }),
    h(
      'div',
      { class: 'row-main' },
      h(
        'span',
        { class: 'row-copy' },
        h(
          'span',
          { class: 'row-title' },
          h('span', { class: 'row-name', text: descriptor.name }),
          permission,
        ),
        h('span', {
          class: 'row-sub',
          text: plural(descriptor.matches.length, 'site'),
        }),
      ),
    ),
    h(
      'div',
      { class: 'row-actions' },
      remove,
      switchRow({
        title: '',
        ariaLabel: `Enable ${descriptor.name}`,
        focusKey: `plugin-${plugin.key}`,
        checked: plugin.enabled,
        onChange: (checked) => ctx.togglePlugin(plugin, checked),
      }),
      h('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '›' }),
    ),
    details,
  );
}

function pluginDetails(plugin: InstalledPlugin, ctx: OptionsContext): HTMLDialogElement {
  const descriptor = plugin.descriptor;
  const dialog = h('dialog', {
    class: 'plugin-dialog',
    'aria-label': `Details for ${descriptor.name}`,
  });
  const home = descriptor.homepage
    ? h(
        'p',
        { class: 'plugin-detail' },
        h('span', { class: 'plugin-detail-label', text: 'Homepage' }),
        link(descriptor.homepage, descriptor.homepage),
      )
    : null;
  const authors =
    descriptor.authors?.length
      ? h(
          'p',
          { class: 'plugin-detail' },
          h('span', { class: 'plugin-detail-label', text: 'Authors' }),
          descriptor.authors.join(', '),
        )
      : null;
  const remove = h('button', {
    class: 'btn danger',
    type: 'button',
    text: 'Remove',
  });
  remove.addEventListener('click', () =>
    removePlugin(remove, plugin, ctx, () => dialog.close()),
  );

  dialog.append(
    h(
      'div',
      { class: 'plugin-dialog-head' },
      h(
        'div',
        {},
        h('h2', { class: 'dialog-title', text: descriptor.name }),
        h('p', {
          class: 'mono',
          text: `${descriptor.id} · v${descriptor.version}`,
        }),
      ),
      h('button', {
        class: 'btn quiet tiny',
        type: 'button',
        text: 'Close',
        onclick: () => dialog.close(),
      }),
    ),
    descriptor.description
      ? h('p', { class: 'plugin-dialog-description', text: descriptor.description })
      : '',
    h('div', {}, authors, home),
    h('p', { class: 'field-label', text: 'Sites' }),
    h(
      'div',
      { class: 'chips' },
      ...descriptor.matches.map((pattern) => h('span', { class: 'chip', text: pattern })),
    ),
    h(
      'div',
      { class: 'plugin-dialog-actions' },
      remove,
      switchRow({
        title: 'Enabled',
        ariaLabel: `Enable ${descriptor.name}`,
        focusKey: `dialog-plugin-${plugin.key}`,
        checked: plugin.enabled,
        onChange: (checked) => {
          dialog.close();
          ctx.togglePlugin(plugin, checked);
        },
      }),
    ),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function addRegistryForm(ctx: OptionsContext): HTMLElement {
  const name = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'My registry',
    'aria-label': 'Registry name',
  });
  const url = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'https://example.com/index.json',
    'aria-label': 'Registry URL',
    required: true,
  });
  const fail = (message: string): void => {
    markFieldError(url, message);
  };
  url.addEventListener('input', () => clearFieldError(url));
  return h(
    'div',
    { class: 'panel add-registry-panel' },
    h(
      'details',
      { class: 'disclosure' },
      h('summary', { text: 'Add registry' }),
      h(
        'form',
        {
          class: 'form',
          on: {
            submit: (event: Event) => {
              event.preventDefault();
              const value = url.value.trim();
              if (!value) {
                fail('Enter a registry URL.');
                return;
              }
              void (async () => {
                await ctx.requestOrigin(value);
                try {
                  await rpc('registry/add', { name: name.value.trim(), url: value });
                  name.value = '';
                  url.value = '';
                  await ctx.refresh();
                } catch (error) {
                  fail(error instanceof Error ? error.message : String(error));
                }
              })();
            },
          },
        },
        h('p', {
          class: 'section-note',
          text: 'Name is optional. The URL must return a registry JSON file.',
        }),
        h('div', { class: 'field-row' }, field('Name', name), field('URL', url)),
        h(
          'div',
          { class: 'form-actions' },
          h('button', { class: 'btn primary', type: 'submit', text: 'Add registry' }),
        ),
      ),
    ),
  );
}
