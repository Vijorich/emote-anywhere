import type { AppState } from '../../core/types';
import { plural, shortId } from '../../ui/components';
import { h } from '../../ui/dom';
import { lookupSet } from '../../ui/sets';

export function setRow(
  id: string,
  options: { removeLabel?: string; onRemove?: () => void } = {},
): HTMLElement {
  const media = h('span', { class: 'media-stack' }, h('span', { class: 'media' }));
  const title = h('span', { class: 'row-title', text: `7TV set ${shortId(id)}` });
  const sub = h('span', { class: 'row-sub mono', text: id });

  void lookupSet(id).then((info) => {
    if (!info) return;
    title.textContent = info.name;
    sub.textContent = `${plural(info.emoteCount, 'emote')} · ${id}`;
    sub.classList.remove('mono');
    const thumbs = (info.preview ?? []).slice(0, 3);
    if (!thumbs.length) return;
    media.replaceChildren(
      ...thumbs.map((preview) =>
        h(
          'span',
          { class: 'media' },
          h('img', {
            src: preview.url,
            alt: '',
            decoding: 'async',
            draggable: 'false',
          }),
        ),
      ),
    );
  });

  return h(
    'div',
    { class: 'row' },
    h('div', { class: 'row-main' }, media, h('span', { class: 'row-copy' }, title, sub)),
    options.onRemove
      ? h(
          'div',
          { class: 'row-actions' },
          h('button', {
            class: 'btn danger tiny',
            type: 'button',
            text: options.removeLabel ?? 'Remove',
            'aria-label': `Remove 7TV set ${id}`,
            onclick: options.onRemove,
          }),
        )
      : null,
  );
}

export function bindingChip(id: string): HTMLElement {
  const label = h('span', { class: 'chip-label', text: shortId(id) });
  const chip = h('span', { class: 'chip', title: id }, label);
  void lookupSet(id).then((info) => {
    if (!info) return;
    label.textContent = info.name;
    chip.title = `${info.name} · ${plural(info.emoteCount, 'emote')}`;
  });
  return chip;
}

export function sourceOrderSection(current: AppState): HTMLElement {
  const settings = current.settings;
  const providerCount = [
    settings.providers.sevenTv,
    settings.providers.bttv,
    settings.providers.ffz,
  ].filter(Boolean).length;
  const bindingCount = Object.keys(current.bindings).length;
  const globalCount = current.globalBinding.sets.length;
  const customCount = current.customSets.filter((set) => set.enabled).length;

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { text: 'Source order' }),
      h('span', { class: 'meta', text: 'First match wins' }),
    ),
    h(
      'div',
      { class: 'panel' },
      sourceRow('Per-chat binding', bindingCount ? plural(bindingCount, 'chat') : 'None', bindingCount > 0),
      sourceRow('Global binding', globalCount ? plural(globalCount, 'set') : 'None', globalCount > 0),
      sourceRow('7TV channel', settings.autoChannel ? 'Auto' : 'Off', settings.autoChannel),
      sourceRow('Custom sets', customCount ? plural(customCount, 'set') : 'Off', customCount > 0),
      sourceRow('Provider globals', `${providerCount} on`, providerCount > 0),
    ),
    h('p', {
      class: 'section-note',
      text: 'The first source that defines a code renders it. Later sources fill the rest.',
    }),
  );
}

function sourceRow(name: string, value: string, active: boolean): HTMLElement {
  return h(
    'div',
    { class: 'source-row' },
    h('span', { class: 'source-name', text: name }),
    h('span', { class: active ? 'source-value active' : 'source-value', text: value }),
  );
}

export function stat(
  value: string,
  unit: string,
  label: string,
  hint: string,
  accent = false,
  extra?: Node | null,
): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h(
      'span',
      { class: accent ? 'stat-value accent' : 'stat-value' },
      value,
      unit ? h('span', { class: 'unit', text: unit }) : null,
    ),
    extra ?? null,
    h('span', { class: 'stat-hint', text: hint }),
  );
}
