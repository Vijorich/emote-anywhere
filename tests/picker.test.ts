// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_WIDTH_DATA_FLAG } from '../src/core/emote-flags';
import type { Emote, PluginDescriptor } from '../src/core/types';
import { EmotePicker } from '../src/picker/picker';

const emotes: Emote[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'].map(
  (code) => ({ code, url: `https://cdn.example/${code}.png`, flags: 0, provider: '7tv' }),
);

const pickers: EmotePicker[] = [];

function descriptor(
  kind: 'contenteditable' | 'textarea' = 'contenteditable',
  proxyImages = false,
): PluginDescriptor {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test chat',
    version: '1.0.0',
    matches: ['https://example.com/*'],
    proxyImages,
    chat: {
      messages: ['.msg'],
      channel: { from: 'constant', value: 'chan' },
    },
    composer: { selectors: ['#composer'], kind },
  };
}

function contentComposer(text = 'AB'): HTMLElement {
  const composer = document.createElement('div');
  composer.id = 'composer';
  composer.setAttribute('contenteditable', 'true');
  composer.tabIndex = 0;
  Object.defineProperty(composer, 'isContentEditable', { value: true });
  composer.textContent = text;
  document.body.append(composer);
  return composer;
}

function startPicker(spec = descriptor(), list = emotes, providers?: string): EmotePicker {
  const picker = new EmotePicker(spec, list, { pickerEnabled: true }, providers);
  pickers.push(picker);
  picker.start();
  return picker;
}

function manyEmotes(count: number): Emote[] {
  return Array.from({ length: count }, (_, index) => ({
    code: `Emote${index}`,
    url: `https://cdn.example/emote${index}.png`,
    flags: 0,
    provider: '7tv',
  }));
}

function ui() {
  const host = document.querySelector<HTMLElement>('.ea-picker-host');
  if (!host?.shadowRoot) throw new Error('Picker was not mounted');
  const shadow = host.shadowRoot;
  return {
    host,
    shadow,
    fab: shadow.querySelector<HTMLButtonElement>('.fab')!,
    panel: shadow.querySelector<HTMLDivElement>('.panel')!,
    input: shadow.querySelector<HTMLInputElement>('.search')!,
    grid: shadow.querySelector<HTMLDivElement>('.grid')!,
    zoom: shadow.querySelector<HTMLDivElement>('.zoom')!,
  };
}

function selectText(composer: HTMLElement, start: number, end = start): void {
  const text = composer.firstChild;
  if (!(text instanceof Text)) throw new Error('Composer text is missing');
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  composer.focus();
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function key(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true, ...init }),
  );
}

function openFromFab(): void {
  const { fab } = ui();
  fab.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
  fab.click();
}

function cells(): HTMLButtonElement[] {
  return Array.from(ui().grid.querySelectorAll<HTMLButtonElement>('.cell'));
}

function tabs(): HTMLButtonElement[] {
  return Array.from(ui().panel.querySelectorAll<HTMLButtonElement>('.tab'));
}

function expectSelected(all: HTMLButtonElement[], index: number): void {
  all.forEach((cell, cellIndex) => {
    expect(cell.getAttribute('aria-selected')).toBe(String(cellIndex === index));
    expect(cell.tabIndex).toBe(cellIndex === index ? 0 : -1);
    expect(cell.classList.contains('selected')).toBe(cellIndex === index);
  });
  expect(all.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  for (const picker of pickers) picker.destroy();
  pickers.length = 0;
  document.querySelectorAll('.ea-picker-host').forEach((host) => host.remove());
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EmotePicker composer selection', () => {
  it('FAB preserves a middle contenteditable caret through repeated insertions', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);

    openFromFab();
    const { input, panel, shadow } = ui();
    expect(panel.hidden).toBe(false);
    expect(shadow.activeElement).toBe(input);
    expect(input.getAttribute('aria-label')).toBe('Search emotes');
    key(input, 'ArrowDown');
    key(input, 'Enter');

    expect(composer.textContent).toBe('Azero B');
    expect(panel.hidden).toBe(false);
    expect(shadow.activeElement).toBe(input);

    key(input, 'Enter');
    expect(composer.textContent).toBe('Azero zero B');
    expect(panel.hidden).toBe(false);
  });

  it('keeps the picker open for multiple clicked emotes', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);

    openFromFab();
    const all = cells();
    all[0]!.click();
    expect(composer.textContent).toBe('Azero B');
    expect(ui().panel.hidden).toBe(false);
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();

    all[1]!.click();
    expect(composer.textContent).toBe('Azero one B');
    expect(ui().panel.hidden).toBe(false);
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
  });

  it('does not mark a cell selected for a pointer click', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);
    openFromFab();
    const first = cells()[0]!;

    first.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, composed: true }),
    );
    first.focus();
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, composed: true }));
    first.click();

    expect(composer.textContent).toBe('Azero B');
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
    expect(ui().shadow.activeElement).toBe(ui().input);
  });

  it('shows a large preview on hold, follows the hovered tile, and does not insert', () => {
    vi.useFakeTimers();
    const composer = contentComposer();
    startPicker();
    openFromFab();
    const all = cells();
    all.forEach((cell, index) => {
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
        left: index * 50,
        right: index * 50 + 46,
        top: 0,
        bottom: 46,
      } as DOMRect);
    });
    const first = all[0]!;

    first.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    expect(first.classList.contains('pressed')).toBe(true);
    vi.advanceTimersByTime(400);

    const { zoom } = ui();
    const code = (): string | null | undefined =>
      zoom.querySelector('.zoom-code')?.textContent;
    expect(zoom.hidden).toBe(false);
    expect(code()).toBe('zero');
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();

    first.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        composed: true,
        clientX: 60,
        clientY: 10,
      }),
    );
    expect(code()).toBe('one');
    expect(first.classList.contains('pressed')).toBe(false);
    expect(all[1]!.classList.contains('pressed')).toBe(true);
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();

    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, composed: true }));
    expect(zoom.hidden).toBe(true);
    expect(ui().grid.querySelector('.cell.pressed')).toBeNull();

    first.click();
    expect(composer.textContent).toBe('AB');
    expect(ui().panel.hidden).toBe(false);
  });

  it('marks overlaying emotes in the grid without changing normal ones', () => {
    const list: Emote[] = [
      { code: 'normal', url: 'https://cdn.example/normal.png', flags: 0, provider: '7tv' },
      {
        code: 'overlay',
        url: 'https://cdn.example/overlay.png',
        flags: ZERO_WIDTH_DATA_FLAG,
        provider: '7tv',
      },
    ];
    contentComposer();
    startPicker(descriptor(), list);
    openFromFab();
    const [normal, overlay] = cells();

    expect(normal!.classList.contains('overlay')).toBe(false);
    expect(normal!.querySelector('.overlay-badge')).toBeNull();
    expect(overlay!.classList.contains('overlay')).toBe(true);
    expect(overlay!.querySelector('.overlay-badge svg')).not.toBeNull();
    expect(overlay!.getAttribute('aria-label')).toBe('overlay, overlaying emote');

    key(ui().input, 'ArrowDown');
    key(ui().input, 'ArrowRight');
    expect(overlay!.classList.contains('selected')).toBe(true);
    expect(overlay!.classList.contains('overlay')).toBe(true);

    key(ui().input, 'Enter', { shiftKey: true });
    const flag = ui().zoom.querySelector<HTMLElement>('.zoom-flag');
    expect(flag?.hidden).toBe(false);
    expect(flag?.textContent).toBe('Overlaying');
  });

  it('saves the caret on FAB pointerdown before focus moves', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);
    const { fab, input } = ui();

    fab.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    fab.focus();
    fab.click();
    key(input, 'ArrowDown');
    key(input, 'Enter');

    expect(composer.textContent).toBe('Azero B');
    expect(ui().shadow.activeElement).toBe(ui().input);
  });

  it('replaces a saved contenteditable range', () => {
    const composer = contentComposer('ABCD');
    startPicker();
    selectText(composer, 1, 3);

    openFromFab();
    key(ui().input, 'ArrowDown');
    key(ui().input, 'Enter');

    expect(composer.textContent).toBe('Azero D');
  });

  it('clears a saved range after outside-pointer close and keeps append fallback', () => {
    const composer = contentComposer('ABCD');
    const outside = document.createElement('button');
    document.body.append(outside);
    startPicker();
    selectText(composer, 1);
    openFromFab();

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    outside.focus();
    window.getSelection()?.removeAllRanges();
    openFromFab();
    key(ui().input, 'ArrowDown');
    key(ui().input, 'Enter');

    expect(composer.textContent).toBe('ABCDzero ');
  });

  it('Escape close restores composer focus and selection', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);
    openFromFab();

    key(ui().input, 'Escape');

    expect(ui().panel.hidden).toBe(true);
    expect(document.activeElement).toBe(composer);
    const selection = window.getSelection()!;
    expect(selection.anchorNode).toBe(composer.firstChild);
    expect(selection.anchorOffset).toBe(1);
    expect(selection.isCollapsed).toBe(true);
  });

  it('preserves textarea caret insertion', () => {
    const composer = document.createElement('textarea');
    composer.id = 'composer';
    composer.value = 'AB';
    document.body.append(composer);
    startPicker(descriptor('textarea'));
    composer.focus();
    composer.setSelectionRange(1, 1);

    openFromFab();
    key(ui().input, 'ArrowDown');
    key(ui().input, 'Enter');

    expect(composer.value).toBe('Azero B');
    expect(composer.selectionStart).toBe(6);
    expect(ui().shadow.activeElement).toBe(ui().input);
  });
});

describe('EmotePicker keyboard grid', () => {
  it('keeps DOM and observer stable while moving focus and selection by visual columns', () => {
    const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    const composer = contentComposer();
    startPicker(descriptor('contenteditable', true));
    openFromFab();

    const { grid, input, shadow } = ui();
    const originalCells = cells();
    const originalImages = originalCells.map((cell) => cell.querySelector('img'));
    const scroll = vi.fn();
    originalCells.forEach((cell, index) => {
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
        top: Math.floor(index / 3) * 46,
      } as DOMRect);
      cell.scrollIntoView = scroll;
    });
    expect(grid.getAttribute('role')).toBe('listbox');
    expect(originalCells[0]!.getAttribute('aria-label')).toBe('zero');
    expect(originalCells[0]!.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(originalCells.every((cell, index) => cell.tabIndex === (index === 0 ? 0 : -1))).toBe(true);
    expect(originalCells.some((cell) => cell.classList.contains('selected'))).toBe(false);

    key(input, 'ArrowDown');
    expect(shadow.activeElement).toBe(input);
    expect(input.getAttribute('aria-activedescendant')).toBe(originalCells[0]!.id);
    expectSelected(originalCells, 0);
    key(input, 'ArrowRight');
    expectSelected(originalCells, 1);
    expect(input.getAttribute('aria-activedescendant')).toBe(originalCells[1]!.id);
    key(input, 'ArrowDown');
    expectSelected(originalCells, 4);
    key(input, 'ArrowLeft');
    expectSelected(originalCells, 3);
    key(input, 'ArrowUp');
    expectSelected(originalCells, 0);

    originalCells[2]!.focus();
    expectSelected(originalCells, 2);
    expect(shadow.activeElement).toBe(originalCells[2]);
    expect(cells()).toEqual(originalCells);
    expect(cells().map((cell) => cell.querySelector('img'))).toEqual(originalImages);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.disconnect).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });

    key(originalCells[2]!, 'Enter');
    expect(composer.textContent).toBe('ABtwo ');
    expect(shadow.activeElement).toBe(input);
  });

  it('clears keyboard selection when clicking an empty part of the panel', () => {
    contentComposer();
    startPicker();
    openFromFab();
    const { grid, input } = ui();
    const first = cells()[0]!;

    first.focus();
    expect(first.classList.contains('selected')).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);

    grid.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('opens the full-size preview with Shift+Enter and closes it with Escape', () => {
    const composer = contentComposer();
    startPicker();
    openFromFab();
    const { input, zoom } = ui();

    key(input, 'ArrowDown');
    key(input, 'Enter', { shiftKey: true });
    expect(zoom.hidden).toBe(false);
    expect(zoom.querySelector('.zoom-code')?.textContent).toBe('zero');

    key(input, 'Escape');
    expect(zoom.hidden).toBe(true);
    expect(ui().panel.hidden).toBe(false);
    expect(ui().shadow.activeElement).toBe(input);
    expect(composer.textContent).toBe('AB');
  });

  it('inserts the first match when Enter follows a search with no selection', () => {
    const composer = contentComposer();
    startPicker();
    openFromFab();
    const { input } = ui();

    key(input, 'Enter');
    expect(composer.textContent).toBe('AB');

    input.value = 'thr';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    key(input, 'Enter');
    expect(composer.textContent).toBe('ABthree ');
  });

  it('shows the search keyboard ring only after keyboard intent', () => {
    contentComposer();
    startPicker();
    openFromFab();
    const { input } = ui();

    input.focus();
    expect(input.classList.contains('kbd')).toBe(false);

    key(input, 'a');
    input.blur();
    input.focus();
    expect(input.classList.contains('kbd')).toBe(true);

    input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    input.blur();
    input.focus();
    expect(input.classList.contains('kbd')).toBe(false);
  });

  it('announces the result count and inserted emote', () => {
    contentComposer();
    startPicker();
    openFromFab();
    const { input, shadow } = ui();
    const status = shadow.querySelector('[role="status"]');

    expect(status?.textContent).toBe('7 emotes');
    input.value = 'two';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(status?.textContent).toBe('1 emote');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(status?.textContent).toBe('Inserted two');
  });

  it('filters through a precomputed lowercase index', () => {
    contentComposer();
    startPicker(descriptor(), manyEmotes(200));
    openFromFab();
    const lower = vi.spyOn(String.prototype, 'toLowerCase');
    lower.mockClear();
    const { input } = ui();

    input.value = 'emote199';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const lowerCodedEmoteCalls = lower.mock.contexts.filter(
      (value) => typeof value === 'string' && value.startsWith('Emote'),
    );

    expect(lowerCodedEmoteCalls).toHaveLength(0);
    expect(cells()).toHaveLength(1);
    expect(cells()[0]?.getAttribute('aria-label')).toBe('Emote199');
  });

  it('debounces search rendering on large sets', () => {
    vi.useFakeTimers();
    contentComposer();
    startPicker(descriptor(), manyEmotes(600));
    openFromFab();
    const { input, shadow } = ui();
    const status = shadow.querySelector('[role="status"]');
    expect(status?.textContent).toBe('600 emotes');

    input.value = 'emote599';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(status?.textContent).toBe('600 emotes');

    vi.advanceTimersByTime(100);
    expect(status?.textContent).toBe('1 emote');
    expect(cells()).toHaveLength(1);
  });

  it('applies a pending debounced search before Enter inserts', () => {
    vi.useFakeTimers();
    const composer = contentComposer();
    startPicker(descriptor(), manyEmotes(600));
    openFromFab();
    const { input } = ui();

    input.value = 'emote599';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    key(input, 'Enter');

    expect(composer.textContent).toBe('ABEmote599 ');
  });

  it('does not flush the debounce on ordinary key presses', () => {
    vi.useFakeTimers();
    contentComposer();
    startPicker(descriptor(), manyEmotes(600));
    openFromFab();
    const { input, shadow } = ui();
    const status = shadow.querySelector('[role="status"]');
    expect(status?.textContent).toBe('600 emotes');

    input.value = 'emote5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    key(input, 'x');

    expect(status?.textContent).toBe('600 emotes');
    vi.advanceTimersByTime(100);
    expect(status?.textContent).toBe('111 emotes');
  });

  it('reuses one intersection observer across grid renders', () => {
    const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    contentComposer();
    startPicker(descriptor('contenteditable', true));
    openFromFab();
    const { input } = ui();

    input.value = 'z';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'ze';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(observers).toHaveLength(1);
  });
});

describe('EmotePicker provider tabs', () => {
  // zero=7tv, one/two/three=bttv, four/five=twitch, six=custom
  const mixed = '7bbbttc';

  function tabLabels(): string[] {
    return tabs().map((tab) => tab.textContent ?? '');
  }

  it('renders only the tabs for providers present in the list', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();

    const bar = ui().panel.querySelector('.tabs');
    expect(bar?.getAttribute('role')).toBe('tablist');
    expect(bar?.getAttribute('aria-label')).toBe('Emote provider');
    expect(tabLabels()).toEqual(['All', '7TV', 'BTTV', 'Twitch', 'Custom']);
    expect(tabs().every((tab) => tab.getAttribute('role') === 'tab')).toBe(true);
    expect(tabs().every((tab) => tab.getAttribute('aria-controls') === 'ea-emote-grid')).toBe(true);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs().slice(1).every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('renders no tab bar without provider data', () => {
    contentComposer();
    startPicker();
    openFromFab();
    expect(ui().panel.querySelector('.tabs')).toBeNull();
    expect(tabs()).toHaveLength(0);
  });

  it('renders no tab bar when the providers string length does not match', () => {
    contentComposer();
    startPicker(descriptor(), emotes, '77');
    openFromFab();
    expect(ui().panel.querySelector('.tabs')).toBeNull();
    expect(cells()).toHaveLength(7);
  });

  it('clicking a tab filters the grid and updates aria-selected; All restores', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const [all, sevenTv, bttv] = tabs();

    bttv!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['one', 'two', 'three']);
    expect(bttv!.getAttribute('aria-selected')).toBe('true');
    expect(all!.getAttribute('aria-selected')).toBe('false');

    sevenTv!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['zero']);
    expect(sevenTv!.getAttribute('aria-selected')).toBe('true');
    expect(bttv!.getAttribute('aria-selected')).toBe('false');

    all!.click();
    expect(cells()).toHaveLength(7);
    expect(all!.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the chosen tab across close and reopen', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    tabs()[2]!.click();
    expect(cells()).toHaveLength(3);

    key(ui().input, 'Escape');
    expect(ui().panel.hidden).toBe(true);
    openFromFab();

    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['one', 'two', 'three']);
  });

  it('combines the search with the active tab and re-filters on tab switch', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const { input } = ui();
    const [all, , bttv] = tabs();

    bttv!.click();
    input.value = 'e';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['one', 'three']);

    all!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'zero',
      'one',
      'three',
      'five',
    ]);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    bttv!.click();
    expect(cells()).toHaveLength(0);
    expect(ui().grid.querySelector('.empty')?.textContent).toBe('No emotes match this search.');
  });

  it('Enter and Space on a focused tab activate it instead of inserting an emote', () => {
    const composer = contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const { input, shadow } = ui();
    const bttv = tabs()[2]!;

    bttv.focus();
    key(bttv, 'Enter');
    expect(composer.textContent).toBe('AB');
    expect(bttv.getAttribute('aria-selected')).toBe('true');
    expect(cells()).toHaveLength(3);
    expect(shadow.activeElement).toBe(bttv);

    const custom = tabs()[4]!;
    custom.focus();
    key(custom, ' ');
    custom.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    expect(composer.textContent).toBe('AB');
    expect(custom.getAttribute('aria-selected')).toBe('true');
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['six']);

    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('arrow keys on a focused tab do not move the grid selection', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const { input } = ui();
    const bttv = tabs()[2]!;

    bttv.focus();
    key(bttv, 'ArrowDown');
    key(bttv, 'ArrowRight');

    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(bttv.getAttribute('aria-selected')).toBe('false');
    expect(cells()).toHaveLength(7);
  });

  it('clears a stale grid selection when switching tabs', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const { input } = ui();

    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(cells()[0]!.id);

    tabs()[2]!.click();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
    expect(cells()[0]!.tabIndex).toBe(0);
  });

  it('includes the tab row in the Tab focus trap', () => {
    contentComposer();
    startPicker(descriptor(), emotes, mixed);
    openFromFab();
    const { input, shadow } = ui();

    key(input, 'ArrowDown');
    const rovingCell = cells()[0]!;
    expect(rovingCell.tabIndex).toBe(0);
    rovingCell.focus();
    key(rovingCell, 'Tab');
    expect(shadow.activeElement).toBe(input);

    key(input, 'Tab', { shiftKey: true });
    expect(shadow.activeElement).toBe(rovingCell);

    const bttv = tabs()[2]!;
    bttv.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    bttv.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(shadow.activeElement).toBe(bttv);
  });
});

describe('EmotePicker type filters', () => {
  // plain7/over7=7tv, plainB/overB=bttv; over* carry the zero-width flag.
  const mixedTyped: Emote[] = [
    { code: 'plain7', url: 'https://cdn.example/plain7.png', flags: 0, provider: '7tv' },
    {
      code: 'over7',
      url: 'https://cdn.example/over7.png',
      flags: ZERO_WIDTH_DATA_FLAG,
      provider: '7tv',
    },
    { code: 'plainB', url: 'https://cdn.example/plainB.png', flags: 0, provider: 'bttv' },
    {
      code: 'overB',
      url: 'https://cdn.example/overB.png',
      flags: ZERO_WIDTH_DATA_FLAG,
      provider: 'bttv',
    },
  ];
  const typedProviders = '77bb';

  const allOverlaying: Emote[] = mixedTyped.map((emote) => ({
    ...emote,
    flags: ZERO_WIDTH_DATA_FLAG,
  }));

  function typeChips(): HTMLButtonElement[] {
    return Array.from(ui().panel.querySelectorAll<HTMLButtonElement>('.type-bar .tab'));
  }

  function providerTabs(): HTMLButtonElement[] {
    return Array.from(
      ui().panel.querySelectorAll<HTMLButtonElement>('.tabs:not(.type-bar) .tab'),
    );
  }

  it('renders no chip row when every emote is standard', () => {
    contentComposer();
    startPicker(descriptor(), emotes);
    openFromFab();
    expect(ui().panel.querySelector('.type-bar')).toBeNull();
  });

  it('renders no chip row when every emote is overlaying', () => {
    contentComposer();
    startPicker(descriptor(), allOverlaying);
    openFromFab();
    expect(ui().panel.querySelector('.type-bar')).toBeNull();
  });

  it('renders All / Standard / Overlaying chips with tab semantics', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();

    const bar = ui().panel.querySelector('.type-bar');
    expect(bar?.getAttribute('role')).toBe('tablist');
    expect(bar?.getAttribute('aria-label')).toBe('Emote type');
    expect(typeChips().map((chip) => chip.textContent)).toEqual([
      'All',
      'Standard',
      'Overlaying',
    ]);
    expect(typeChips().every((chip) => chip.getAttribute('role') === 'tab')).toBe(true);
    expect(typeChips().every((chip) => chip.getAttribute('aria-controls') === 'ea-emote-grid')).toBe(
      true,
    );
    expect(typeChips()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(typeChips().slice(1).every((chip) => chip.getAttribute('aria-selected') === 'false')).toBe(
      true,
    );
  });

  it('renders the chip row alone when no provider data exists', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped);
    openFromFab();

    expect(ui().panel.querySelector('.tabs:not(.type-bar)')).toBeNull();
    expect(typeChips()).toHaveLength(3);
  });

  it('clicking a chip filters the grid and updates aria-selected; All restores', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    const [all, standard, overlaying] = typeChips();

    overlaying!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'over7, overlaying emote',
      'overB, overlaying emote',
    ]);
    expect(overlaying!.getAttribute('aria-selected')).toBe('true');
    expect(all!.getAttribute('aria-selected')).toBe('false');

    standard!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['plain7', 'plainB']);
    expect(standard!.getAttribute('aria-selected')).toBe('true');
    expect(overlaying!.getAttribute('aria-selected')).toBe('false');

    all!.click();
    expect(cells()).toHaveLength(4);
    expect(all!.getAttribute('aria-selected')).toBe('true');
  });

  it('combines the chip with the search text and the active provider tab', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    const { input } = ui();
    const sevenTv = providerTabs()[1]!;
    const overlaying = typeChips()[2]!;

    sevenTv.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'plain7',
      'over7, overlaying emote',
    ]);

    overlaying.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'over7, overlaying emote',
    ]);

    input.value = 'over';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'over7, overlaying emote',
    ]);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cells()).toHaveLength(0);
    expect(ui().grid.querySelector('.empty')?.textContent).toBe('No emotes match this search.');

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    typeChips()[1]!.click();
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['plain7']);
  });

  it('Enter and Space on a focused chip activate it instead of inserting an emote', () => {
    const composer = contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    const { input, shadow } = ui();
    const overlaying = typeChips()[2]!;

    overlaying.focus();
    key(overlaying, 'Enter');
    expect(composer.textContent).toBe('AB');
    expect(overlaying.getAttribute('aria-selected')).toBe('true');
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'over7, overlaying emote',
      'overB, overlaying emote',
    ]);
    expect(shadow.activeElement).toBe(overlaying);

    const standard = typeChips()[1]!;
    standard.focus();
    key(standard, ' ');
    standard.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    expect(composer.textContent).toBe('AB');
    expect(standard.getAttribute('aria-selected')).toBe('true');
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['plain7', 'plainB']);

    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('arrow keys on a focused chip do not move the grid selection', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    const overlaying = typeChips()[2]!;

    overlaying.focus();
    key(overlaying, 'ArrowDown');
    key(overlaying, 'ArrowRight');

    expect(ui().grid.querySelector('.cell.selected')).toBeNull();
    expect(ui().input.getAttribute('aria-activedescendant')).toBeNull();
    expect(typeChips()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(overlaying.getAttribute('aria-selected')).toBe('false');
    expect(cells()).toHaveLength(4);
  });

  it('includes the chip row between the provider tabs and the close button', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    const { panel, input, shadow } = ui();

    const children = Array.from(panel.children).map((child) => (child as HTMLElement).className);
    expect(children).toEqual(['head', 'tabs', 'tabs type-bar', 'grid', 'sr-status']);

    const overlaying = typeChips()[2]!;
    overlaying.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    overlaying.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(shadow.activeElement).toBe(overlaying);

    input.focus();
    key(input, 'Tab', { shiftKey: true });
    const rovingCell = cells()[0]!;
    expect(shadow.activeElement).toBe(rovingCell);
  });

  it('keeps the chosen chip across close and reopen', () => {
    contentComposer();
    startPicker(descriptor(), mixedTyped, typedProviders);
    openFromFab();
    typeChips()[2]!.click();
    expect(cells()).toHaveLength(2);

    key(ui().input, 'Escape');
    expect(ui().panel.hidden).toBe(true);
    openFromFab();

    expect(typeChips()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'over7, overlaying emote',
      'overB, overlaying emote',
    ]);
  });
});

describe('EmotePicker composer refresh', () => {
  it('does not query selectors while the composer stays connected', async () => {
    vi.useFakeTimers();
    const composer = contentComposer();
    const queries = vi.spyOn(document, 'querySelectorAll');
    const picker = startPicker();
    queries.mockClear();

    await vi.advanceTimersByTimeAsync(5000);
    expect(queries).not.toHaveBeenCalled();
    expect(ui().fab.hidden).toBe(false);

    composer.remove();
    await vi.advanceTimersByTimeAsync(1000);
    expect(queries).toHaveBeenCalled();
    expect(ui().fab.hidden).toBe(true);

    contentComposer('CD');
    queries.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ui().fab.hidden).toBe(false);
    queries.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(queries).not.toHaveBeenCalled();

    const { host } = ui();
    picker.destroy();
    queries.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(queries).not.toHaveBeenCalled();
    expect(host.isConnected).toBe(false);
  });
});
