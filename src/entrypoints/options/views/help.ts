import { PLUGIN_DOC_URL, PRIVACY_URL, PROJECT_URL, RELEASES_URL } from '../../../core/config';
import { h } from '../../../ui/dom';

export function helpView(): HTMLElement {
  return h(
    'main',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Help' })),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'About' }),
      h(
        'div',
        { class: 'panel about-panel' },
        h('p', {
          class: 'section-note',
          text: 'Emote images come from 7TV, BetterTTV, FrankerFaceZ or a custom set you add. The extension has no accounts or analytics. Chat text stays on the page.',
        }),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Problems' }),
      h(
        'div',
        { class: 'trouble-grid' },
        troubleRow(
          'No emotes',
          "Enable the site's plugin in Sources, then reload the tab.",
        ),
        troubleRow(
          'Images show as text',
          'The site blocks third-party images. Report it to the plugin author; the plugin needs image proxying for this site.',
        ),
        troubleRow(
          'Outdated emotes',
          'Clear the cache in Settings, then choose Reload emotes in the popup.',
        ),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Links' }),
      h(
        'div',
        { class: 'panel links-panel' },
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
