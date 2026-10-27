import { rpc } from '../../../core/rpc';
import { DEFAULT_GLOBAL_SET_IDS } from '../../../core/defaults';
import type { AppState, SevenTvSetInfo } from '../../../core/types';
import { plural } from '../../../ui/components';
import { h } from '../../../ui/dom';
import { lookupSet } from '../../../ui/sets';
import type { OptionsContext } from '../context';
import {
  bindingChip,
  clearFieldError,
  markFieldError,
  setRow,
  sourceOrderSection,
  withBusy,
} from '../shared';

export function bindingsView(current: AppState, ctx: OptionsContext): HTMLElement {
  const chatBindings = Object.values(current.bindings);
  const globalSets = current.globalBinding.sets;

  const globalPanel = h(
    'div',
    { class: 'panel' },
    globalSets.length
      ? h(
          'div',
          { class: 'rows' },
          ...globalSets.map((id) =>
            setRow(id, {
              removeLabel: 'Remove',
              onRemove: () => {
                if (!window.confirm('Remove this set from global sets?')) return;
                void ctx.updateGlobalSets(
                  globalSets.filter((item) => item !== id),
                  'Set removed',
                );
              },
            }),
          ),
        )
      : h(
          'div',
          { class: 'empty' },
          'No global sets yet. Add a 7TV set below, or restore the default.',
        ),
    h(
      'form',
      {
        class: 'inline-form',
        on: {
          submit: (event: Event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            const input = form.querySelector<HTMLInputElement>('input');
            if (input) void addGlobalSet(input, current, ctx);
          },
        },
      },
      h('input', {
        class: 'input',
        type: 'text',
        placeholder: '7TV set link or ID',
        'aria-label': '7TV set to add to global sets',
        on: {
          input: (event: Event) => {
            clearFieldError(event.currentTarget as HTMLInputElement);
          },
        },
      }),
      h('button', { class: 'btn primary', type: 'submit', text: 'Add set' }),
    ),
    globalSets.includes(DEFAULT_GLOBAL_SET_IDS[0] ?? '')
      ? null
      : h(
          'div',
          { class: 'form-actions' },
          h('button', {
            class: 'btn',
            type: 'button',
            text: 'Restore default',
            onclick: (event: Event) => {
              const button = event.currentTarget as HTMLButtonElement;
              void withBusy(button, 'Restoring…', () =>
                ctx.updateGlobalSets(
                  [...new Set([...globalSets, ...DEFAULT_GLOBAL_SET_IDS])],
                  'Default set restored',
                ),
              );
            },
          }),
        ),
  );

  const chatPanel = h(
    'div',
    { class: 'panel' },
    chatBindings.length
      ? h(
          'div',
          { class: 'rows' },
          ...chatBindings.map((binding) => {
            const plugin = current.plugins[binding.pluginKey];
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
                  h('span', { class: 'row-sub', text: `Channel ${binding.channelKey}` }),
                  h(
                    'span',
                    { class: 'chips' },
                    ...binding.sets.map(bindingChip),
                  ),
                ),
              ),
              h(
                'div',
                { class: 'row-actions' },
                h('button', {
                  class: 'btn danger tiny',
                  type: 'button',
                  text: 'Clear binding',
                  onclick: (event: Event) => {
                    const button = event.currentTarget as HTMLButtonElement;
                    if (!window.confirm('Clear the set for this chat?')) return;
                    void withBusy(button, 'Clearing…', async () => {
                      try {
                        await rpc('binding/remove', { key: binding.key });
                        await ctx.refresh('Set removed');
                      } catch (error) {
                        ctx.show(error instanceof Error ? error.message : String(error), 'error');
                      }
                    });
                  },
                }),
              ),
            );
          }),
        )
      : h(
          'div',
          { class: 'empty' },
          'No per-chat sets. Add one from the popup while a chat is open.',
        ),
  );

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h('header', { class: 'view-head' }, h('h1', { text: 'Chat sets' })),
    h(
      'div',
      { class: 'bindings-grid' },
      h(
        'div',
        { class: 'bindings-main' },
        h(
          'section',
          { class: 'section' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { text: 'Global sets' }),
            h('span', { class: 'meta', text: plural(globalSets.length, 'set') }),
          ),
          globalPanel,
        ),
        h(
          'section',
          { class: 'section' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { text: 'Per-chat' }),
            h('span', { class: 'meta', text: plural(chatBindings.length, 'chat') }),
          ),
          chatPanel,
        ),
      ),
      h(
        'aside',
        { class: 'bindings-side', 'aria-label': 'Set details' },
        sourceOrderSection(current),
        previewSection(current),
      ),
    ),
  );
}

async function addGlobalSet(
  input: HTMLInputElement,
  current: AppState,
  ctx: OptionsContext,
): Promise<void> {
  const value = input.value.trim();
  if (!value) {
    markFieldError(input, 'Enter a 7TV set link or ID.');
    ctx.show('Enter a 7TV set link or ID.', 'error');
    return;
  }
  clearFieldError(input);
  try {
    const info = await rpc<SevenTvSetInfo>('sevenTv/lookupSet', { input: value });
    if (current.globalBinding.sets.includes(info.id)) {
      ctx.show('Already added.', 'error');
      return;
    }
    await ctx.updateGlobalSets(
      [...current.globalBinding.sets, info.id],
      'Set added',
    );
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    markFieldError(input, text);
    ctx.show(text, 'error');
  }
}

function previewSection(current: AppState): HTMLElement {
  const first = current.globalBinding.sets[0];
  const grid = h('div', { class: 'emote-grid' });
  const note = h('p', {
    class: 'section-note',
    text: first ? 'Loading…' : 'No global set.',
  });

  if (!first) {
    grid.append(h('div', { class: 'empty' }, 'No global set.'));
  } else {
    void lookupSet(first).then((info) => {
      if (!info) {
        note.textContent = 'Could not load the set. Check your connection and reload the page.';
        return;
      }
      note.textContent = `${info.name} · ${plural(info.emoteCount, 'emote')}`;
      grid.replaceChildren(
        ...(info.preview ?? []).slice(0, 12).map((emote) =>
          h(
            'span',
            { class: 'emote-cell', title: emote.code },
            h('img', {
              src: emote.url,
              alt: '',
              decoding: 'async',
              draggable: 'false',
            }),
          ),
        ),
      );
    });
  }

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { text: 'Preview' }),
      h('span', { class: 'meta', text: 'First 12' }),
    ),
    h('div', { class: 'panel' }, grid, note),
  );
}
