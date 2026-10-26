import type { AppState } from '../../../core/types';
import { rpc } from '../../../core/rpc';
import { pill, plural } from '../../../ui/components';
import { h } from '../../../ui/dom';
import type { OptionsContext } from '../context';
import { bindingChip, setRow, sourceOrderSection, stat } from '../shared';

export function overviewView(current: AppState, ctx: OptionsContext): HTMLElement {
  const { settings, plugins, bindings, globalBinding } = current;
  const pluginList = Object.values(plugins);
  const enabled = pluginList.filter((plugin) => plugin.enabled);
  const providerCount = [
    settings.providers.sevenTv,
    settings.providers.bttv,
    settings.providers.ffz,
  ].filter(Boolean).length;
  const bindingCount = Object.keys(bindings).length;

  const globalSets = globalBinding.sets;
  const globalRows = globalSets.length
    ? h(
        'div',
        { class: 'rows' },
        ...globalSets.map((id) =>
          setRow(id, {
            removeLabel: 'Remove',
            onRemove: () => {
              if (!window.confirm('Remove this 7TV set from global bindings?')) return;
              void ctx.updateGlobalSets(
                globalSets.filter((item) => item !== id),
                'Global set removed',
              );
            },
          }),
        ),
      )
    : h(
        'div',
        { class: 'empty' },
        'No global sets. Chats use their channel and the provider globals.',
      );

  const pluginRows = pluginList.length
    ? h(
        'div',
        { class: 'rows' },
        ...pluginList.slice(0, 4).map((plugin) =>
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'row-main' },
              h(
                'span',
                { class: 'row-copy' },
                h('span', { class: 'row-title', text: plugin.descriptor.name }),
                h('span', {
                  class: 'row-sub',
                  text: `v${plugin.descriptor.version} · ${plural(
                    plugin.descriptor.matches.length,
                    'host',
                  )}`,
                }),
                h(
                  'span',
                  { class: 'chips' },
                  ...plugin.descriptor.matches.slice(0, 3).map((pattern) =>
                    h('span', { class: 'chip', text: pattern }),
                  ),
                  plugin.descriptor.matches.length > 3
                    ? h('span', {
                        class: 'chip',
                        text: `+${plugin.descriptor.matches.length - 3}`,
                      })
                    : null,
                ),
              ),
            ),
            pill(plugin.enabled ? 'On' : 'Off', plugin.enabled ? 'ok' : 'neutral'),
          ),
        ),
      )
    : h(
        'div',
        { class: 'empty' },
        'No plugins installed. Add a registry in Sources to support a chat site.',
      );

  const registry = current.registries[0];
  const registryPlugins = registry
    ? pluginList.filter((plugin) => plugin.registryId === registry.id)
    : [];

  const sourceOrder = sourceOrderSection(current);

  const registryStatus = h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { text: 'Registry' }),
      h(
        'button',
        {
          class: 'btn tiny',
          type: 'button',
          text: 'Refresh',
          onclick: () => {
            void rpc<Record<string, string>>('registry/refresh', {})
              .then(async (errors) => {
                await ctx.refresh();
                const first = Object.values(errors)[0];
                if (first) ctx.show(first, 'error');
                else ctx.show('Registries refreshed');
              })
              .catch((error: unknown) => ctx.show(String(error), 'error'));
          },
        },
      ),
    ),
    registry
      ? h(
          'div',
          { class: 'panel' },
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'row-main' },
              h(
                'span',
                { class: 'row-copy' },
                h('span', { class: 'row-title', text: registry.name }),
                h('span', {
                  class: 'row-sub',
                  text: registry.lastError
                    ? registry.lastError
                    : `${plural(registry.pluginCount ?? registryPlugins.length, 'plugin')} · ${
                        registry.lastCheckedAt
                          ? `checked ${new Date(registry.lastCheckedAt).toLocaleTimeString()}`
                          : 'not checked yet'
                      }`,
                }),
              ),
            ),
            registry.lastError
              ? pill('Error', 'err')
              : pill(registry.builtin ? 'Built in' : 'Custom'),
          ),
        )
      : h('div', { class: 'empty' }, 'No registries yet.'),
  );

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Overview' }),
      h('p', {
        class: 'lede',
        text: 'Every supported chat draws from a per-chat binding, your global sets and the provider globals. This page shows what is active.',
      }),
    ),
    h(
      'div',
      { class: 'stat-strip' },
      stat(
        `${providerCount}`,
        ' of 3',
        'Providers on',
        '7TV · BTTV · FFZ',
        true,
        h(
          'span',
          { class: 'provider-meter', 'aria-hidden': 'true' },
          h('i', {
            class: settings.providers.sevenTv ? 'on' : 'off',
            title: '7TV',
          }),
          h('i', {
            class: settings.providers.bttv ? 'on' : 'off',
            title: 'BTTV',
          }),
          h('i', {
            class: settings.providers.ffz ? 'on' : 'off',
            title: 'FFZ',
          }),
        ),
      ),
      stat(`${enabled.length}`, ` of ${pluginList.length}`, 'Plugins enabled', 'On supported sites'),
      stat(`${bindingCount}`, '', 'Chat bindings', bindingCount ? 'Per chat' : 'None yet'),
      stat(`${settings.emoteScale.toFixed(1)}×`, '', 'Emote size', 'Of chat text'),
    ),
    h(
      'div',
      { class: 'overview-grid' },
      h(
        'div',
        { class: 'overview-main' },
        h(
          'section',
          { class: 'section' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { text: 'Global chat bindings' }),
            h(
              'a',
              { class: 'section-link', href: '#bindings' },
              `Manage · ${plural(globalSets.length, 'set')}`,
            ),
          ),
          h('p', {
            class: 'section-note',
            text: 'These 7TV sets load in every chat. A per-chat binding takes priority.',
          }),
          globalRows,
        ),
        h(
          'section',
          { class: 'section' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { text: 'Site support' }),
            h('a', { class: 'section-link', href: '#sources' }, 'Sources'),
          ),
          pluginRows,
        ),
        h(
          'section',
          { class: 'section' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { text: 'Chat bindings' }),
            h('a', { class: 'section-link', href: '#bindings' }, 'Manage'),
          ),
          bindingCount
            ? h(
                'div',
                { class: 'rows' },
                ...Object.values(bindings).slice(0, 3).map((binding) => {
                  const plugin = plugins[binding.pluginKey];
                  return h(
                    'div',
                    { class: 'row' },
                    h(
                      'div',
                      { class: 'row-main' },
                      h(
                        'span',
                        { class: 'row-copy' },
                        h('span', {
                          class: 'row-title',
                          text: plugin?.descriptor.name ?? 'Chat',
                        }),
                        h('span', {
                          class: 'row-sub',
                          text: `Channel ${binding.channelKey}`,
                        }),
                        h(
                          'span',
                          { class: 'chips' },
                          ...binding.sets.map(bindingChip),
                        ),
                      ),
                    ),
                  );
                }),
              )
            : h(
                'div',
                { class: 'empty' },
                'No per-chat bindings. Open a chat and bind a set from the extension popup.',
              ),
        ),
      ),
      h(
        'aside',
        { class: 'overview-side', 'aria-label': 'Overview details' },
        sourceOrder,
        registryStatus,
      ),
    ),
  );
}
