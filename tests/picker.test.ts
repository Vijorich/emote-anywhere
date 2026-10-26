// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function startPicker(spec = descriptor()): EmotePicker {
  const picker = new EmotePicker(spec, emotes, { pickerEnabled: true });
  pickers.push(picker);
  picker.start();
  return picker;
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
    status: shadow.querySelector<HTMLDivElement>('.status')!,
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

function key(target: EventTarget, key: string): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true }),
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
  it('FAB preserves a middle contenteditable caret through insertion', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);

    openFromFab();
    const { input, panel, shadow } = ui();
    expect(panel.hidden).toBe(false);
    expect(shadow.activeElement).toBe(input);
    key(input, 'Enter');

    expect(composer.textContent).toBe('Azero B');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(composer);
  });

  it('saves the caret on FAB pointerdown before focus moves', () => {
    const composer = contentComposer();
    startPicker();
    selectText(composer, 1);
    const { fab, input } = ui();

    fab.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    fab.focus();
    fab.click();
    key(input, 'Enter');

    expect(composer.textContent).toBe('Azero B');
    expect(document.activeElement).toBe(composer);
  });

  it('replaces a saved contenteditable range', () => {
    const composer = contentComposer('ABCD');
    startPicker();
    selectText(composer, 1, 3);

    openFromFab();
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
    key(ui().input, 'Enter');

    expect(composer.value).toBe('Azero B');
    expect(composer.selectionStart).toBe(6);
    expect(document.activeElement).toBe(composer);
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

    const { grid, input, shadow, status } = ui();
    const originalCells = cells();
    const originalImages = originalCells.map((cell) => cell.querySelector('img'));
    const scroll = vi.fn();
    originalCells.forEach((cell, index) => {
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
        top: Math.floor(index / 3) * 46,
      } as DOMRect);
      cell.scrollIntoView = scroll;
    });
    const statusText = status.textContent;
    expect(grid.getAttribute('role')).toBe('listbox');
    expect(originalCells[0]!.getAttribute('aria-label')).toBe('zero');
    expect(originalCells[0]!.querySelector('img')?.alt).toBe('zero');
    expectSelected(originalCells, 0);

    key(input, 'ArrowDown');
    expect(shadow.activeElement).toBe(originalCells[0]);
    key(originalCells[0]!, 'ArrowRight');
    expectSelected(originalCells, 1);
    expect(shadow.activeElement).toBe(originalCells[1]);
    key(originalCells[1]!, 'ArrowDown');
    expectSelected(originalCells, 4);
    expect(shadow.activeElement).toBe(originalCells[4]);
    key(originalCells[4]!, 'ArrowLeft');
    expectSelected(originalCells, 3);
    key(originalCells[3]!, 'ArrowUp');
    expectSelected(originalCells, 0);

    originalCells[2]!.focus();
    expectSelected(originalCells, 2);
    expect(shadow.activeElement).toBe(originalCells[2]);
    expect(cells()).toEqual(originalCells);
    expect(cells().map((cell) => cell.querySelector('img'))).toEqual(originalImages);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.disconnect).not.toHaveBeenCalled();
    expect(status.textContent).toBe(statusText);
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });

    key(originalCells[2]!, 'Enter');
    expect(composer.textContent).toBe('ABtwo ');
    expect(document.activeElement).toBe(composer);
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
