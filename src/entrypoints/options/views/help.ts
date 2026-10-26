import { browser } from 'wxt/browser';
import { PLUGIN_DOC_URL, PRIVACY_URL, PROJECT_URL, RELEASES_URL } from '../../../core/config';
import type { AppState } from '../../../core/types';
import { h } from '../../../ui/dom';
import type { OptionsContext } from '../context';

export function helpView(current: AppState, ctx: OptionsContext): HTMLElement {
  const builtin = current.registries.find((registry) => registry.builtin);
  const registryUrl = builtin?.url ?? 'not configured';

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Help' }),
      h('p', {
        class: 'lede',
        text: 'Site support is a declarative plugin, not bundled code. Registries can be fixed without an extension update.',
      }),
    ),
    h(
      'div',
      { class: 'help-grid' },
      h(
        'section',
        { class: 'section' },
        h('h2', { text: 'Plugins' }),
        h(
          'div',
          { class: 'panel' },
          h('p', {
            class: 'section-note',
            text: 'A plugin is JSON: match patterns, chat selectors, how to read a channel key and where the composer lives. It cannot execute code or read outside the selectors it declares.',
          }),
          h('p', { class: 'field-label', text: 'Default registry' }),
          h(
            'div',
            { class: 'copy-row' },
            h('code', { class: 'mono', text: registryUrl }),
            h('button', {
              class: 'btn tiny',
              type: 'button',
              text: 'Copy',
              onclick: () => {
                void navigator.clipboard
                  .writeText(registryUrl)
                  .then(() => ctx.show('Registry URL copied'))
                  .catch(() => ctx.show('Could not copy the URL', 'error'));
              },
            }),
          ),
          h(
            'div',
            { class: 'form-actions' },
            anchorButton(PLUGIN_DOC_URL, 'Plugin format'),
            anchorButton(PRIVACY_URL, 'Privacy'),
            anchorButton(RELEASES_URL, 'Release notes'),
            anchorButton(PROJECT_URL, 'Source code'),
          ),
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { text: 'About' }),
        h(
          'div',
          { class: 'panel' },
          h('p', {
            class: 'section-note',
            text: 'Emote images come from 7TV, BTTV and FFZ. There is no backend and no telemetry; chat text never leaves the page.',
          }),
          h('p', {
            class: 'section-note',
            text: `Emote Anywhere v${browser.runtime.getManifest().version} · IBM Plex typefaces under the SIL Open Font License.`,
          }),
        ),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Picker' }),
      h(
        'div',
        { class: 'panel' },
        h(
          'div',
          { class: 'shortcut' },
          h('span', { class: 'row-title', text: 'Open the emote picker' }),
          h('span', { class: 'keys', text: 'Click the picker button in the chat' }),
        ),
        h(
          'div',
          { class: 'shortcut' },
          h('span', { class: 'row-title', text: 'Insert the selected emote' }),
          h('span', { class: 'keys' }, h('kbd', { text: 'Enter' })),
        ),
        h(
          'div',
          { class: 'shortcut' },
          h('span', { class: 'row-title', text: 'Close the picker' }),
          h('span', { class: 'keys' }, h('kbd', { text: 'Esc' })),
        ),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Troubleshooting' }),
      h(
        'div',
        { class: 'trouble-grid' },
        troubleRow(
          'A chat shows no emotes',
          'Enable the site plugin and allow its host permission in Sources, then reload the tab.',
        ),
        troubleRow(
          'Emote images stay blank',
          'Some sites block external image hosts. A plugin with proxyImages fetches the image through the extension.',
        ),
        troubleRow(
          'A set did not update',
          'Clear the emote cache in Settings. Sets are cached for one hour.',
        ),
      ),
    ),
  );
}

function troubleRow(title: string, text: string): HTMLElement {
  return h(
    'div',
    { class: 'trouble' },
    h('span', { class: 'row-title', text: title }),
    h('span', { class: 'row-sub', text }),
  );
}

function anchorButton(href: string, label: string): HTMLElement {
  return h(
    'a',
    {
      class: 'btn',
      href,
      target: '_blank',
      rel: 'noreferrer',
      text: label,
    },
  );
}
