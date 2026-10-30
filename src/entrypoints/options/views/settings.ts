import { rpc } from '../../../core/rpc';
import { EMOTE_BASE_HEIGHT_EM, MAX_EMOTE_SCALE, MIN_EMOTE_SCALE } from '../../../core/config';
import { DEFAULT_EMOTE_SCALE } from '../../../core/defaults';
import type { AppSettings, AppState } from '../../../core/types';
import { switchRow } from '../../../ui/components';
import { h } from '../../../ui/dom';
import { clearSetLookupCache, lookupSet } from '../../../ui/sets';
import type { OptionsContext } from '../context';
import { withBusy } from '../shared';

export function settingsView(current: AppState, ctx: OptionsContext): HTMLElement {
  const { settings } = current;
  const preview = h('div', { class: 'preview' });
  renderPreview(preview, current, settings.emoteScale);

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h('header', { class: 'view-head' }, h('h1', { text: 'Settings' })),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Chat' }),
      h(
        'div',
        { class: 'panel' },
        switchRow({
          title: 'Emotes everywhere',
          description: 'Render emotes in all page text, not only chat messages.',
          focusKey: 'setting-globalMode',
          checked: settings.globalMode,
          onChange: (checked) => ctx.updateSettings({ globalMode: checked }),
        }),
        switchRow({
          title: 'Channel emotes',
          description: "Load the chat's 7TV channel when no set is bound.",
          focusKey: 'setting-autoChannel',
          checked: settings.autoChannel,
          onChange: (checked) => ctx.updateSettings({ autoChannel: checked }),
        }),
        switchRow({
          title: 'Emote picker',
          description: 'Show a picker button in the chat composer.',
          focusKey: 'setting-pickerEnabled',
          checked: settings.pickerEnabled,
          onChange: (checked) => ctx.updateSettings({ pickerEnabled: checked }),
        }),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', { text: 'Size' }),
      h(
        'div',
        { class: 'panel' },
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
      h('h2', { text: 'Cache' }),
      h(
        'div',
        { class: 'panel' },
        h(
          'div',
          { class: 'form-actions' },
          clearCacheButton(ctx),
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
        syncFill();
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
            syncFill();
            ctx.show(String(error), 'error');
          });
      },
    },
  });
  const syncFill = (): void => {
    const next = Number(input.value);
    const percent = ((next - MIN_EMOTE_SCALE) / (MAX_EMOTE_SCALE - MIN_EMOTE_SCALE)) * 100;
    input.style.setProperty('--fill', `${percent}%`);
  };
  syncFill();
  return h('div', { class: 'range-control' }, input, output);
}

function updatePreviewScale(preview: HTMLElement, scale: number): void {
  preview.style.setProperty(
    '--emote-height',
    `${(EMOTE_BASE_HEIGHT_EM * scale).toFixed(2)}em`,
  );
}

function clearCacheButton(ctx: OptionsContext): HTMLButtonElement {
  const button = h('button', {
    class: 'btn',
    type: 'button',
    text: 'Clear cache',
  });
  button.addEventListener('click', () => {
    void withBusy(button, 'Clearing…', async () => {
      try {
        await rpc('cache/clear');
        clearSetLookupCache();
        await ctx.refresh('Cache cleared');
      } catch (error) {
        ctx.show(error instanceof Error ? error.message : String(error), 'error');
      }
    });
  });
  return button;
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
  container.append(line);
  if (!first) {
    container.append(
      h('p', {
        class: 'section-note',
        text: 'Add a global set in Sets to preview emote size.',
      }),
    );
    return;
  }

  void lookupSet(first).then((info) => {
    if (!line.isConnected) return;
    if (!info) {
      container.append(
        h('p', {
          class: 'section-note',
          text: 'Could not load the set. Check your connection and reload the page.',
        }),
      );
      return;
    }
    for (const emote of (info.preview ?? []).slice(0, 6)) {
      line.append(
        h('img', {
          class: 'preview-emote',
          src: emote.url,
          alt: '',
          title: emote.code,
          decoding: 'async',
        }),
      );
    }
  });
}
