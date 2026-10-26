import { rpc } from '../../../core/rpc';
import { EMOTE_BASE_HEIGHT_EM, MAX_EMOTE_SCALE, MIN_EMOTE_SCALE } from '../../../core/config';
import { DEFAULT_EMOTE_SCALE } from '../../../core/defaults';
import type { AppSettings, AppState } from '../../../core/types';
import { switchRow } from '../../../ui/components';
import { h } from '../../../ui/dom';
import { clearSetLookupCache, lookupSet } from '../../../ui/sets';
import type { OptionsContext } from '../context';

export function settingsView(current: AppState, ctx: OptionsContext): HTMLElement {
  const { settings } = current;
  const preview = h('div', { class: 'preview' });
  renderPreview(preview, current, settings.emoteScale);

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Settings' }),
      h('p', {
        class: 'lede',
        text: 'How the engine behaves on supported sites. These settings apply to every chat.',
      }),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Behaviour' }),
      h(
        'div',
        { class: 'panel' },
        switchRow({
          title: 'Global mode',
          description: 'Replace emote codes anywhere on a supported site, not only inside chat.',
          checked: settings.globalMode,
          onChange: (checked) => ctx.updateSettings({ globalMode: checked }),
        }),
        switchRow({
          title: 'Auto channel',
          description: 'Use the 7TV channel connected to the site when no per-chat binding exists.',
          checked: settings.autoChannel,
          onChange: (checked) => ctx.updateSettings({ autoChannel: checked }),
        }),
        switchRow({
          title: 'Emote picker',
          description: 'Show the picker button in a chat.',
          checked: settings.pickerEnabled,
          onChange: (checked) => ctx.updateSettings({ pickerEnabled: checked }),
        }),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Emote size' }),
      h(
        'div',
        { class: 'panel' },
        h('p', {
          class: 'section-note',
          text: 'Height relative to the chat text. Default is 1.2×, which measures 1.8em.',
        }),
        h(
          'div',
          { class: 'range-row' },
          scaleInput(settings.emoteScale, preview, ctx),
          h('button', {
            class: 'btn tiny',
            type: 'button',
            text: 'Reset',
            onclick: () => {
              void rpc('settings/update', { patch: { emoteScale: DEFAULT_EMOTE_SCALE } })
                .then(() => ctx.refresh())
                .catch((error: unknown) => ctx.show(String(error), 'error'));
            },
          }),
        ),
        preview,
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Maintenance' }),
      h(
        'div',
        { class: 'panel' },
        h('p', {
          class: 'section-note',
          text: 'Sets are cached for one hour and provider globals for six. Clear the cache when a set changed upstream.',
        }),
        h(
          'div',
          { class: 'form-actions' },
          h('button', {
            class: 'btn',
            type: 'button',
            text: 'Clear emote cache',
            onclick: () => {
              void rpc('cache/clear')
                .then(() => {
                  clearSetLookupCache();
                  return ctx.refresh('Emote cache cleared');
                })
                .catch((error: unknown) => ctx.show(String(error), 'error'));
            },
          }),
        ),
      ),
    ),
  );
}

function scaleInput(value: number, preview: HTMLElement, ctx: OptionsContext): HTMLElement {
  const output = h('span', { class: 'range-value num', text: `${value.toFixed(1)}×` });
  const input = h('input', {
    type: 'range',
    min: String(MIN_EMOTE_SCALE),
    max: String(MAX_EMOTE_SCALE),
    step: '0.1',
    value: String(value),
    'aria-label': 'Emote size',
    on: {
      input: () => {
        const next = Number(input.value);
        output.textContent = `${next.toFixed(1)}×`;
        updatePreviewScale(preview, next);
      },
      change: () => {
        const next = Number(input.value);
        void rpc<AppSettings>('settings/update', { patch: { emoteScale: next } })
          .then((settings) => {
            const currentState = ctx.getState();
            if (currentState) currentState.settings = settings;
          })
          .catch((error: unknown) => {
            const previous = ctx.getState()?.settings.emoteScale ?? value;
            input.value = String(previous);
            output.textContent = `${previous.toFixed(1)}×`;
            updatePreviewScale(preview, previous);
            ctx.show(String(error), 'error');
          });
      },
    },
  });
  return h('div', { class: 'range-control' }, input, output);
}

function updatePreviewScale(preview: HTMLElement, scale: number): void {
  preview.style.setProperty(
    '--emote-height',
    `${(EMOTE_BASE_HEIGHT_EM * scale).toFixed(2)}em`,
  );
  const note = preview.querySelector<HTMLElement>('.preview-note');
  if (note) note.textContent = `${(EMOTE_BASE_HEIGHT_EM * scale).toFixed(1)}em tall`;
}

function renderPreview(container: HTMLElement, current: AppState, scale: number): void {
  const first = current.globalBinding.sets[0];
  const line = h(
    'span',
    { class: 'preview-line' },
    h('span', { text: 'Nice stream' }),
  );
  container.style.setProperty(
    '--emote-height',
    `${(EMOTE_BASE_HEIGHT_EM * scale).toFixed(2)}em`,
  );
  container.append(
    line,
    h('span', {
      class: 'preview-note',
      text: `${(EMOTE_BASE_HEIGHT_EM * scale).toFixed(1)}em tall`,
    }),
  );
  if (!first) return;

  void lookupSet(first).then((info) => {
    if (!info || !line.isConnected) return;
    for (const emote of (info.preview ?? []).slice(0, 6)) {
      line.append(
        h('img', {
          class: 'preview-emote',
          src: emote.url,
          alt: emote.code,
          title: emote.code,
          decoding: 'async',
        }),
      );
    }
  });
}
