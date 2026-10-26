import { h } from './dom';

/** Range + live value. onChange fires when the user releases the thumb. */
export function scaleControl(
  value: number,
  onChange: (value: number) => void,
  extra?: Node | null,
): HTMLElement {
  const display = h('span', {
    class: 'muted small',
    text: `${value.toFixed(1)}×`,
  });
  const input = h('input', {
    type: 'range',
    min: '0.5',
    max: '2',
    step: '0.1',
    value: String(value),
    'aria-label': 'Emote size',
    on: {
      input: () => {
        display.textContent = `${Number(input.value).toFixed(1)}×`;
      },
      change: () => {
        onChange(Number(input.value));
      },
    },
  });
  return h('div', { class: 'range-wrap' }, input, display, extra ?? null);
}
