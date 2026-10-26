import { rpc } from '../../../core/rpc';
import { DEFAULT_GLOBAL_SET_IDS } from '../../../core/defaults';
import type { AppState, SevenTvSetInfo } from '../../../core/types';
import { plural } from '../../../ui/components';
import { h } from '../../../ui/dom';
import { lookupSet } from '../../../ui/sets';
import type { OptionsContext } from '../context';
import { bindingChip, setRow, sourceOrderSection } from '../shared';

export function bindingsView(current: AppState, ctx: OptionsContext): HTMLElement {
  const chatBindings = Object.values(current.bindings);
  const globalSets = current.globalBinding.sets;

  const globalPanel = h(
    'div',
    { class: 'panel' },
    h('p', {
      class: 'section-note',
      text: 'These sets load in every chat. A per-chat binding overrides them for that chat.',
    }),
    globalSets.length
      ? h(
          'div',
          { class: 'rows' },
          ...globalSets.map((id) =>
            setRow(id, {
              removeLabel: 'Remove',
              onRemove: () => {
                if (!window.confirm('Remove this 7TV set from global bindings?')) return;
                void ctx.updateGlobalSets(
                  globalSets.filter((item) => item !== id),
                  'Global set removed',
                );
              },
            }),
          ),
        )
      : h(
          'div',
          { class: 'empty' },
          h('strong', { text: 'No global sets. ' }),
          'Chats fall back to the 7TV channel and the provider globals.',
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
        placeholder: '7TV set id or https://7tv.app/emote-sets/…',
        'aria-label': '7TV set to add to global bindings',
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
            text: 'Restore default set',
            onclick: () => {
              void ctx.updateGlobalSets(
                [...new Set([...globalSets, ...DEFAULT_GLOBAL_SET_IDS])],
                'Default global set restored',
              );
            },
          }),
        ),
  );

  const chatPanel = h(
    'div',
    { class: 'panel' },
    h('p', {
      class: 'section-note',
      text: 'Created from the extension popup while a chat is open. They override global sets for that chat.',
    }),
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
                  text: 'Unbind',
                  onclick: () => {
                    void rpc('binding/remove', { key: binding.key })
                      .then(() => ctx.refresh('Binding removed'))
                      .catch((error: unknown) => ctx.show(String(error), 'error'));
                  },
                }),
              ),
            );
          }),
        )
      : h(
          'div',
          { class: 'empty' },
          h('strong', { text: 'No per-chat bindings. ' }),
          'Open a chat, click the extension icon and bind a 7TV set to that channel.',
        ),
  );

  return h(
    'main',
    { class: 'view' },
    ctx.noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Bindings' }),
      h('p', {
        class: 'lede',
        text: 'Global sets follow you everywhere. A per-chat binding applies to one conversation and takes priority.',
      }),
    ),
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
            h('h2', { text: 'Global chat bindings' }),
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
            h('h2', { text: 'Per-chat bindings' }),
            h('span', { class: 'meta', text: plural(chatBindings.length, 'chat') }),
          ),
          chatPanel,
        ),
      ),
      h(
        'aside',
        { class: 'bindings-side', 'aria-label': 'Binding details' },
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
  if (!value) return;
  try {
    const info = await rpc<SevenTvSetInfo>('sevenTv/lookupSet', { input: value });
    if (current.globalBinding.sets.includes(info.id)) {
      ctx.show('That set is already in global bindings', 'error');
      return;
    }
    await ctx.updateGlobalSets(
      [...current.globalBinding.sets, info.id],
      `${info.name} added to global chat bindings`,
    );
  } catch (error) {
    ctx.show(error instanceof Error ? error.message : String(error), 'error');
  }
}

function previewSection(current: AppState): HTMLElement {
  const first = current.globalBinding.sets[0];
  const grid = h('div', { class: 'emote-grid' });
  const note = h('p', {
    class: 'section-note',
    text: first ? 'Loading set preview…' : 'No global set yet.',
  });

  if (!first) {
    grid.append(h('div', { class: 'empty' }, 'Add a global set to see its emotes here.'));
  } else {
    void lookupSet(first).then((info) => {
      if (!info) {
        note.textContent = 'The set preview could not be loaded.';
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
              alt: emote.code,
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
      h('h2', { text: 'Set preview' }),
      h('span', { class: 'meta', text: 'First 12' }),
    ),
    h('div', { class: 'panel' }, grid, note),
  );
}
