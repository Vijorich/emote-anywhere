import { h } from './dom';

const MARK = `
<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5.5 4.5h13A2.5 2.5 0 0 1 21 7v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.7 3.2.9-3.2H5.5A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="8.5" cy="10.4" r="1.1" fill="currentColor"/>
  <circle cx="15.5" cy="10.4" r="1.1" fill="currentColor"/>
  <path d="M8.7 13.3c.9 1.2 2 1.8 3.3 1.8s2.4-.6 3.3-1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/** The product mark: a chat bubble with a face, drawn from the name. */
export function brandMark(): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = MARK.trim();
  return template.content.firstElementChild as SVGElement;
}

export function brand(): HTMLElement {
  return h('a', { class: 'brand', href: '#overview' }, brandMark(), h('span', { class: 'brand-name', text: 'Emote Anywhere' }));
}

export function pill(text: string, tone: 'ok' | 'warn' | 'err' | 'neutral' = 'neutral'): HTMLElement {
  return h('span', { class: tone === 'neutral' ? 'pill' : `pill ${tone}`, text });
}

export interface SwitchOptions {
  title: string;
  description?: string;
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function switchRow(options: SwitchOptions): HTMLLabelElement {
  const input = h('input', {
    type: 'checkbox',
    checked: options.checked,
    disabled: options.disabled,
    'aria-label': options.ariaLabel,
    on: {
      change: (event: Event) => {
        options.onChange((event.currentTarget as HTMLInputElement).checked);
      },
    },
  });
  return h(
    'label',
    { class: 'switch' },
    h(
      'span',
      { class: 'switch-copy' },
      h('span', { class: 'switch-title', text: options.title }),
      options.description ? h('span', { class: 'switch-desc', text: options.description }) : null,
    ),
    input,
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
  );
}

export function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
