import { rpc } from '../../../core/rpc';
import { DEFAULT_GLOBAL_SET_IDS } from '../../../core/defaults';
import type { AppState, Binding, SevenTvSetInfo } from '../../../core/types';
import { bindingLabel, plural } from '../../../ui/components';
import { h } from '../../../ui/dom';
import type { OptionsContext } from '../context';
import {
  bindingChip,
  clearFieldError,
  markFieldError,
  setRow,
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
                void ctx.updateGlobalSets(globalSets.filter((item) => item !== id));
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
                ctx.updateGlobalSets([...new Set([...globalSets, ...DEFAULT_GLOBAL_SET_IDS])]),
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
                  h('span', {
                    class: 'row-sub',
                    title: `Channel ${binding.channelKey}`,
                    text: bindingLabel(binding.label, binding.channelKey, 'Chat set'),
                  }),
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
                  text: 'Clear chat set',
                  onclick: (event: Event) =>
                    clearChatSet(event.currentTarget as HTMLButtonElement, binding, ctx),
                }),
              ),
            );
          }),
        )
      : h(
          'div',
          { class: 'empty' },
          'No chat sets yet. Add one from the popup while a chat is open.',
        ),
  );

  return h(
    'main',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Sets' })),
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
        h('h2', { text: 'Chat sets' }),
        h('span', { class: 'meta', text: plural(chatBindings.length, 'chat') }),
      ),
      chatPanel,
    ),
  );
}

function clearChatSet(
  button: HTMLButtonElement,
  binding: Binding,
  ctx: OptionsContext,
): void {
  void withBusy(button, 'Clearing…', async () => {
    try {
      await rpc('binding/remove', { key: binding.key });
      await ctx.refresh();
    } catch (error) {
      console.error(error);
    }
  });
}

async function addGlobalSet(
  input: HTMLInputElement,
  current: AppState,
  ctx: OptionsContext,
): Promise<void> {
  const value = input.value.trim();
  if (!value) {
    markFieldError(input, 'Enter a 7TV set link or ID.');
    return;
  }
  clearFieldError(input);
  try {
    const info = await rpc<SevenTvSetInfo>('sevenTv/lookupSet', { input: value });
    if (current.globalBinding.sets.includes(info.id)) {
      markFieldError(input, 'Already added.');
      return;
    }
    await ctx.updateGlobalSets([...current.globalBinding.sets, info.id]);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    markFieldError(input, text);
  }
}
