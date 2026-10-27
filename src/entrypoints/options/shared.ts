import type { AppState } from '../../core/types';
import { plural, shortId } from '../../ui/components';
import { h } from '../../ui/dom';
import { lookupSet, setUrl } from '../../ui/sets';

export function setRow(
  id: string,
  options: { removeLabel?: string; onRemove?: () => void } = {},
): HTMLElement {
  const media = h('span', { class: 'media-stack' }, h('span', { class: 'media' }));
  const title = h('span', { class: 'row-title', text: '7TV set' });
  const sub = h('span', { class: 'row-sub' });
  const link = h('a', {
    class: 'set-row-link',
    href: setUrl(id),
    target: '_blank',
    rel: 'noreferrer',
    title: `Open set ${id} on 7TV`,
    'aria-label': `Open set ${id} on 7TV`,
  });

  void lookupSet(id).then((info) => {
    if (!info) {
      sub.textContent = 'Could not load set.';
      media.remove();
      return;
    }
    title.textContent = info.name;
    sub.textContent = plural(info.emoteCount, 'emote');
    link.setAttribute('aria-label', `Open ${info.name} on 7TV`);
    const thumbs = (info.preview ?? []).slice(0, 3);
    if (!thumbs.length) {
      media.remove();
      return;
    }
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
    { class: 'row set-row' },
    link,
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
  const chip = h(
    'a',
    {
      class: 'chip chip-link',
      href: setUrl(id),
      target: '_blank',
      rel: 'noreferrer',
      title: id,
    },
    label,
  );
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
      h('h2', { text: 'Emote priority' }),
    ),
    h(
      'div',
      { class: 'panel' },
      sourceRow('Per-chat', bindingCount ? plural(bindingCount, 'chat') : 'None', bindingCount > 0),
      sourceRow('Global sets', globalCount ? plural(globalCount, 'set') : 'None', globalCount > 0),
      sourceRow('7TV channel', settings.autoChannel ? 'Auto' : 'Off', settings.autoChannel),
      sourceRow('Custom sets', customCount ? plural(customCount, 'set') : 'Off', customCount > 0),
      sourceRow('Providers', `${providerCount} on`, providerCount > 0),
    ),
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

export async function withBusy(
  button: HTMLButtonElement,
  label: string,
  task: () => Promise<void>,
): Promise<void> {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
  }
}

let fieldErrorCount = 0;

export function markFieldError(
  input: HTMLInputElement | HTMLTextAreaElement,
  message: string,
): void {
  if (!input.id) input.id = `ea-field-${++fieldErrorCount}`;
  let error = input.parentElement?.querySelector<HTMLElement>('.field-error') ?? null;
  if (!error) {
    error = h('span', { class: 'field-error', id: `${input.id}-error` });
    input.after(error);
  }
  error.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', `${input.id}-error`);
  input.focus();
}

export function clearFieldError(input: HTMLInputElement | HTMLTextAreaElement): void {
  const error = input.parentElement?.querySelector<HTMLElement>('.field-error');
  if (error) error.remove();
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
}
