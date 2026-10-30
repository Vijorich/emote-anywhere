import { h } from './dom';

const MARK = `
<svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
  <rect width="16" height="16" rx="3.5" fill="#17694e"/>
  <circle cx="8" cy="7.5" r="5.4" fill="#f0f5f1"/>
  <circle cx="5.6" cy="5.9" r="1.1" fill="#17694e"/>
  <circle cx="10.4" cy="5.9" r="1.1" fill="#17694e"/>
  <path d="M5.4 9.1c.6 1 1.5 1.6 2.6 1.6s2-.6 2.6-1.6" fill="none" stroke="#17694e" stroke-width="1.25" stroke-linecap="round"/>
</svg>`;

/** Inline SVG so the mark inherits currentColor. */
export function brandMark(): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = MARK.trim();
  return template.content.firstElementChild as SVGElement;
}

export function brand(): HTMLElement {
  return h('a', { class: 'brand', href: '#sources' }, brandMark(), h('span', { class: 'brand-name', text: 'Emote Anywhere' }));
}

export function pill(text: string, tone: 'ok' | 'warn' | 'err' | 'neutral' = 'neutral'): HTMLElement {
  return h('span', { class: tone === 'neutral' ? 'pill' : `pill ${tone}`, text });
}

export interface SwitchOptions {
  title: string;
  description?: string;
  ariaLabel?: string;
  focusKey?: string;
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
    'data-focus-key': options.focusKey,
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

/** Older bindings stored the raw channel key in their label. */
export function bindingLabel(label: string, channelKey: string, fallback: string): string {
  const clean = label.trim();
  const legacy = clean === channelKey || clean.endsWith(`· ${channelKey}`);
  return !clean || (channelKey && legacy) ? fallback : clean;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
