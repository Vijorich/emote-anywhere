import { browser } from 'wxt/browser';
import { rpc } from '../../../core/rpc';
import type {
  AppState,
  CustomEmote,
  InstalledPlugin,
  RegistryRef,
} from '../../../core/types';
import { field, pill, plural, switchRow } from '../../../ui/components';
import { h, link } from '../../../ui/dom';
import type { OptionsContext } from '../context';

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
              switchRow({
                title: '',
                ariaLabel: `Enable ${set.name}`,
                checked: set.enabled,
                onChange: (checked) => {
                  void rpc('set/toggle', { id: set.id, enabled: checked })
                    .then(() => ctx.refresh())
                    .catch((error: unknown) => {
                      ctx.show(String(error), 'error');
                      void ctx.refresh();
                    });
                },
              }),
              h('button', {
                class: 'btn danger tiny',
                type: 'button',
                text: 'Remove',
                onclick: () => {
                  if (!window.confirm(`Remove custom set "${set.name}"?`)) return;
                  void rpc('set/remove', { id: set.id })
                    .then(() => ctx.refresh('Set removed'))
                    .catch((error: unknown) => ctx.show(String(error), 'error'));
                },
              }),
            ),
          ),
        ),
      )
    : h('div', { class: 'empty' }, 'No custom sets. A set is a JSON list of code and image URL pairs.');

  const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Set name' });
  const jsonInput = h('textarea', {
    class: 'textarea',
    placeholder:
      '{\n  "name": "My set",\n  "emotes": [\n    { "code": "peepoHappy", "url": "https://cdn.7tv.app/emote/.../2x.webp" }\n  ]\n}',
  });

  const registryPanels = current.registries.length
    ? current.registries.map((registry) => registryPanel(current, registry, ctx))
    : [h('div', { class: 'empty' }, 'No registries. Add one below.')];

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Sources' }),
      h('p', {
        class: 'lede',
        text: 'Provider globals, custom sets and the registries that teach the extension where chats live.',
      }),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'panel' },
        h(
          'div',
          { class: 'panel-head' },
          h('div', {}, h('h2', { text: 'Global providers' }), h('p', { text: 'Fills every chat after bindings and custom sets.' })),
          pill(`${[settings.providers.sevenTv, settings.providers.bttv, settings.providers.ffz].filter(Boolean).length} on`, 'ok'),
        ),
        switchRow({
          title: '7TV global',
          description: 'The 7TV global emote set.',
          checked: settings.providers.sevenTv,
          onChange: (checked) => {
            ctx.updateSettings({ providers: { ...settings.providers, sevenTv: checked } });
          },
        }),
        switchRow({
          title: 'BTTV global',
          description: 'BetterTTV global emotes.',
          checked: settings.providers.bttv,
          onChange: (checked) => {
            ctx.updateSettings({ providers: { ...settings.providers, bttv: checked } });
          },
        }),
        switchRow({
          title: 'FFZ global',
          description: 'FrankerFaceZ global emotes.',
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

function addCustomSetForm(
  name: HTMLInputElement,
  json: HTMLTextAreaElement,
  ctx: OptionsContext,
): HTMLElement {
  return h(
    'details',
    { class: 'disclosure' },
    h('summary', { text: 'Add a custom set' }),
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
              if (!Array.isArray(emotes)) throw new Error('Expected an "emotes" array');
              const finalName = name.value.trim() || parsedName;
              if (!finalName) throw new Error('Set name is required');
              void rpc('set/add', { name: finalName, emotes: emotes as CustomEmote[] })
                .then(() => {
                  name.value = '';
                  json.value = '';
                  return ctx.refresh('Custom set added');
                })
                .catch((error: unknown) => ctx.show(String(error), 'error'));
            } catch (error) {
              ctx.show(error instanceof Error ? error.message : String(error), 'error');
            }
          },
        },
      },
      field('Name', name),
      h(
        'label',
        { class: 'field' },
        h('span', { text: 'JSON' }),
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
          { class: 'mono' },
          h('a', {
            href: registry.url,
            target: '_blank',
            rel: 'noreferrer',
            text: registry.url,
          }),
        ),
        h('p', {
          text: `${plural(registry.pluginCount ?? plugins.length, 'plugin')} · ${
            registry.lastCheckedAt
              ? `checked ${new Date(registry.lastCheckedAt).toLocaleTimeString()}`
              : 'not checked yet'
          }`,
        }),
      ),
      h(
        'div',
        { class: 'row-actions' },
        h('button', {
          class: 'btn tiny',
          type: 'button',
          text: 'Refresh',
          onclick: () => {
            void rpc<Record<string, string>>('registry/refresh', { id: registry.id })
              .then(() => ctx.refresh('Registry refreshed'))
              .catch((error: unknown) => ctx.show(String(error), 'error'));
          },
        }),
        registry.builtin
          ? null
          : h('button', {
              class: 'btn danger tiny',
              type: 'button',
              text: 'Remove',
              onclick: () => {
                if (!window.confirm(`Remove registry "${registry.name}" and its plugins?`)) return;
                void rpc('registry/remove', { id: registry.id })
                  .then(() => ctx.refresh('Registry removed'))
                  .catch((error: unknown) => ctx.show(String(error), 'error'));
              },
            }),
      ),
    ),
    registry.lastError ? h('div', { class: 'banner error', text: registry.lastError }) : null,
    plugins.length
      ? h('div', { class: 'rows' }, ...plugins.map((plugin) => pluginRow(plugin, ctx)))
      : h('div', { class: 'empty' }, 'No plugins in this registry yet.'),
  );
}

function pluginRow(plugin: InstalledPlugin, ctx: OptionsContext): HTMLElement {
  const descriptor = plugin.descriptor;
  const permission = h('span', { class: 'pill', text: 'Checking access' });
  void browser.permissions
    .contains({ origins: descriptor.matches })
    .then((granted) => {
      permission.textContent = granted ? 'Access granted' : 'Permission needed';
      permission.className = granted ? 'pill ok' : 'pill warn';
    })
    .catch(() => permission.remove());

  const hosts = descriptor.matches
    .slice(0, 3)
    .map((pattern) => h('span', { class: 'chip', text: pattern }));
  if (descriptor.matches.length > 3) {
    hosts.push(h('span', { class: 'chip', text: `+${descriptor.matches.length - 3}` }));
  }

  const details = pluginDetails(descriptor);
  return h(
    'div',
    { class: 'row plugin-row' },
    h(
      'div',
      { class: 'row-main' },
      h(
        'button',
        {
          class: 'row-copy plugin-details',
          type: 'button',
          title: `Full details for ${descriptor.name}`,
          onclick: () => details.showModal(),
        },
        h(
          'span',
          { class: 'row-title' },
          descriptor.name,
          h('span', { class: 'muted small', text: ` v${descriptor.version}` }),
        ),
        descriptor.description
          ? h('span', { class: 'row-sub', text: descriptor.description })
          : null,
        h('span', { class: 'chips' }, ...hosts, permission),
      ),
    ),
    h(
      'div',
      { class: 'row-actions' },
      switchRow({
        title: '',
        ariaLabel: `Enable ${descriptor.name}`,
        checked: plugin.enabled,
        onChange: (checked) => ctx.togglePlugin(plugin, checked),
      }),
      h('button', {
        class: 'btn danger tiny',
        type: 'button',
        text: 'Remove',
        onclick: () => {
          if (!window.confirm(`Remove ${descriptor.name}?`)) return;
          void rpc('plugin/remove', { key: plugin.key })
            .then(() => ctx.refresh('Plugin removed'))
            .catch((error: unknown) => ctx.show(String(error), 'error'));
        },
      }),
    ),
    details,
  );
}

function pluginDetails(descriptor: InstalledPlugin['descriptor']): HTMLDialogElement {
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

  dialog.append(
    h(
      'div',
      { class: 'row plugin-dialog-head' },
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
    h('p', {
      class: descriptor.description ? 'plugin-dialog-description' : 'section-note',
      text: descriptor.description ?? 'No description provided.',
    }),
    h('div', {}, authors, home),
    h('p', {
      class: 'field-label',
      text: `Sites (${plural(descriptor.matches.length, 'pattern')})`,
    }),
    h(
      'div',
      { class: 'chips' },
      ...descriptor.matches.map((pattern) => h('span', { class: 'chip', text: pattern })),
    ),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function addRegistryForm(ctx: OptionsContext): HTMLElement {
  const name = h('input', { class: 'input', type: 'text', placeholder: 'Registry name (optional)' });
  const url = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'https://raw.githubusercontent.com/you/repo/main/index.json',
  });
  return h(
    'div',
    { class: 'panel' },
    h(
      'form',
      {
        class: 'form',
        on: {
          submit: (event: Event) => {
            event.preventDefault();
            const value = url.value.trim();
            if (!value) return;
            void (async () => {
              await ctx.requestOrigin(value);
              try {
                await rpc('registry/add', { name: name.value.trim(), url: value });
                name.value = '';
                url.value = '';
                await ctx.refresh('Registry added');
              } catch (error) {
                ctx.show(error instanceof Error ? error.message : String(error), 'error');
              }
            })();
          },
        },
      },
      h('h2', { text: 'Add a registry' }),
      h('p', {
        class: 'section-note',
        text: 'A registry is one JSON file with one or more declarative chat plugins.',
      }),
      h('div', { class: 'field-row' }, field('Name', name), field('URL', url)),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { class: 'btn primary', type: 'submit', text: 'Add registry' }),
      ),
    ),
  );
}
