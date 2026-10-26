import type { AppSettings, Emote, PluginDescriptor } from '../core/types';
import { queryAllFirst } from '../engine/dom';
import { proxiedImage } from '../engine/image-fallback';
import { PICKER_HOST_CLASS } from '../engine/render';
import { insertIntoComposer } from './insert';

const MAX_VISIBLE = 500;

function fabIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const bubble = document.createElementNS(ns, 'path');
  bubble.setAttribute(
    'd',
    'M5.5 4.5h13A2.5 2.5 0 0 1 21 7v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.7 3.2.9-3.2H5.5A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5Z',
  );
  bubble.setAttribute('stroke', 'currentColor');
  bubble.setAttribute('stroke-width', '1.6');
  bubble.setAttribute('stroke-linejoin', 'round');

  const leftEye = document.createElementNS(ns, 'circle');
  leftEye.setAttribute('cx', '8.5');
  leftEye.setAttribute('cy', '10.4');
  leftEye.setAttribute('r', '1.1');
  leftEye.setAttribute('fill', 'currentColor');

  const rightEye = leftEye.cloneNode() as SVGCircleElement;
  rightEye.setAttribute('cx', '15.5');

  const smile = document.createElementNS(ns, 'path');
  smile.setAttribute(
    'd',
    'M8.7 13.3c.9 1.2 2 1.8 3.3 1.8s2.4-.6 3.3-1.8',
  );
  smile.setAttribute('stroke', 'currentColor');
  smile.setAttribute('stroke-width', '1.6');
  smile.setAttribute('stroke-linecap', 'round');

  svg.append(bubble, leftEye, rightEye, smile);
  return svg;
}

const PANEL_CSS = `
:host {
  all: initial;
  --ea-surface: #171d19;
  --ea-raised: #212a24;
  --ea-border: #2d3931;
  --ea-control: #414f46;
  --ea-text: #f0f5f1;
  --ea-muted: #a6b2a9;
  --ea-accent: #6cc79e;
  --ea-accent-soft: #173125;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: light) {
  :host {
    --ea-surface: #ffffff;
    --ea-raised: #f3f6f4;
    --ea-border: #e1e7e3;
    --ea-control: #ccd4ce;
    --ea-text: #121714;
    --ea-muted: #58625b;
    --ea-accent: #17694e;
    --ea-accent-soft: #e2f0e9;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.fab {
  position: fixed; right: 20px; bottom: 88px; width: 42px; height: 42px;
  display: grid; place-items: center; z-index: 2147483647;
  border: 1px solid var(--ea-border); border-radius: 10px;
  background: var(--ea-surface); color: var(--ea-text);
  cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.fab:hover { background: var(--ea-raised); }
.fab:focus-visible, .close:focus-visible, .cell:focus-visible, .search:focus-visible {
  outline: 2px solid var(--ea-accent); outline-offset: 2px;
}
.panel {
  position: fixed; right: 20px; bottom: 138px;
  width: min(440px, calc(100vw - 24px)); max-height: min(560px, 72vh);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ea-surface); color: var(--ea-text);
  border: 1px solid var(--ea-border); border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0,0,0,.35);
  z-index: 2147483647;
}
.head { display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid var(--ea-border); }
.search {
  flex: 1; min-width: 0; height: 34px; padding: 0 10px;
  border: 1px solid var(--ea-control); border-radius: 6px;
  background: var(--ea-surface); color: var(--ea-text); font-size: 14px; outline: none;
}
.search::placeholder { color: var(--ea-muted); }
.search:focus { border-color: var(--ea-accent); }
.close {
  width: 34px; height: 34px; border: 1px solid var(--ea-control); border-radius: 6px;
  background: var(--ea-surface); color: var(--ea-muted); font-size: 18px; cursor: pointer;
}
.close:hover { background: var(--ea-raised); color: var(--ea-text); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 4px; padding: 10px; overflow-y: auto; align-content: start;
}
.cell {
  height: 46px; display: grid; place-items: center; padding: 4px;
  border: 1px solid transparent; border-radius: 6px; background: var(--ea-raised);
  cursor: pointer; overflow: hidden;
}
.cell:hover { background: var(--ea-raised); }
.cell.selected { outline: 2px solid var(--ea-accent); outline-offset: -2px; background: var(--ea-accent-soft); }
.cell img { max-width: 34px; max-height: 34px; width: auto; height: auto; display: block; }
.status {
  padding: 8px 12px; border-top: 1px solid var(--ea-border);
  color: var(--ea-muted); font-size: 11px; min-height: 30px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.empty { padding: 28px 18px; text-align: center; color: var(--ea-muted); font-size: 13px; line-height: 1.5; }
`;

export class EmotePicker {
  private readonly descriptor: PluginDescriptor;
  private readonly settings: Pick<AppSettings, 'pickerEnabled'>;
  private emotes: Emote[];
  private composer: HTMLElement | null = null;
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private grid: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private fab: HTMLButtonElement | null = null;
  private visible: Emote[] = [];
  private selected = 0;
  private open = false;
  private checkTimer: number | null = null;
  private imageObserver: IntersectionObserver | null = null;
  private savedRange: Range | null = null;

  private readonly onPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (this.fab && path.includes(this.fab)) {
      if (!this.open) this.saveComposerSelection();
      return;
    }
    if (!this.open || !this.host) return;
    if (!path.includes(this.host)) this.close(false);
  };

  constructor(descriptor: PluginDescriptor, emotes: Emote[], settings: Pick<AppSettings, 'pickerEnabled'>) {
    this.descriptor = descriptor;
    this.emotes = emotes;
    this.settings = settings;
  }

  start(): void {
    if (!this.settings.pickerEnabled || !this.descriptor.composer) return;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    this.checkTimer = window.setInterval(() => this.refreshComposer(), 1000);
    this.refreshComposer();
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    if (this.checkTimer !== null) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.imageObserver?.disconnect();
    this.imageObserver = null;
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
    this.input = null;
    this.grid = null;
    this.status = null;
    this.fab = null;
    this.composer = null;
    this.savedRange = null;
    this.open = false;
  }

  private refreshComposer(): void {
    if (this.composer?.isConnected) return;
    this.composer = null;
    this.savedRange = null;
    const next = this.findComposer();
    if (next) this.composer = next;
    if (!this.composer) {
      if (this.fab) this.fab.hidden = true;
      return;
    }
    if (!this.host) this.mount();
    if (this.fab) this.fab.hidden = false;
  }

  private saveComposerSelection(): void {
    if (!this.composer?.isConnected) this.refreshComposer();
    this.savedRange = null;
    const composer = this.composer;
    if (!composer?.isContentEditable) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (
      !composer.contains(range.startContainer) ||
      !composer.contains(range.endContainer)
    ) {
      return;
    }
    this.savedRange = range.cloneRange();
  }

  private findComposer(): HTMLElement | null {
    const selectors = this.descriptor.composer?.selectors;
    if (!selectors?.length) return null;
    for (const candidate of queryAllFirst(document, selectors)) {
      if (!(candidate instanceof HTMLElement)) continue;
      const editable = this.resolveEditable(candidate);
      if (editable) return editable;
    }
    return null;
  }

  private resolveEditable(candidate: HTMLElement): HTMLElement | null {
    const kind = this.descriptor.composer?.kind ?? 'auto';
    const isText = candidate instanceof HTMLTextAreaElement || candidate instanceof HTMLInputElement;
    const isEditable = candidate.isContentEditable;
    if (kind === 'textarea') return isText ? candidate : null;
    if (kind === 'contenteditable') return isEditable ? candidate : null;
    if (isText || isEditable) return candidate;
    const nested = candidate.querySelector<HTMLElement>(
      'textarea, input, [contenteditable]:not([contenteditable="false"])',
    );
    if (!nested) return null;
    if (
      nested instanceof HTMLTextAreaElement ||
      nested instanceof HTMLInputElement ||
      nested.isContentEditable
    ) {
      return nested;
    }
    return null;
  }

  private mount(): void {
    const host = document.createElement('div');
    host.className = PICKER_HOST_CLASS;
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('right', '0', 'important');
    host.style.setProperty('bottom', '0', 'important');
    host.style.setProperty('width', '0', 'important');
    host.style.setProperty('height', '0', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');

    const shadow = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = PANEL_CSS;
      shadow.append(style);
    }

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'fab';
    fab.append(fabIcon());
    fab.title = 'Emote picker';
    fab.setAttribute('aria-label', 'Open emote picker');
    fab.setAttribute('aria-expanded', 'false');
    fab.addEventListener('click', (event) => {
      event.preventDefault();
      this.toggle();
    });

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Emote picker');
    panel.addEventListener('keydown', (event) => this.onPanelKeyDown(event));

    const head = document.createElement('div');
    head.className = 'head';
    const input = document.createElement('input');
    input.className = 'search';
    input.type = 'text';
    input.placeholder = 'Search emotes…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      this.selected = 0;
      this.renderGrid();
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close emote picker');
    close.addEventListener('click', () => this.close(true));
    head.append(input, close);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Emotes');
    grid.addEventListener('focusin', (event) => {
      const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
      if (!cell) return;
      const index = Number(cell.dataset.index);
      if (Number.isInteger(index)) this.selectCell(index);
    });
    grid.addEventListener('click', (event) => {
      const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
      if (!cell) return;
      const index = Number(cell.dataset.index);
      if (!Number.isInteger(index)) return;
      this.selectCell(index);
      this.insertSelected();
    });

    const status = document.createElement('div');
    status.className = 'status';
    status.setAttribute('aria-live', 'polite');

    panel.append(head, grid, status);
    shadow.append(fab, panel);
    document.documentElement.append(host);

    this.host = host;
    this.shadow = shadow;
    this.fab = fab;
    this.panel = panel;
    this.input = input;
    this.grid = grid;
    this.status = status;
  }

  private toggle(): void {
    if (this.open) {
      this.close(true);
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    if (!this.savedRange) this.saveComposerSelection();
    if (!this.composer || !this.composer.isConnected) this.refreshComposer();
    if (!this.composer) return;
    if (!this.host) this.mount();
    if (!this.panel || !this.input) return;
    this.open = true;
    this.panel.hidden = false;
    this.fab?.setAttribute('aria-expanded', 'true');
    this.input.value = '';
    this.selected = 0;
    this.renderGrid();
    this.input.focus();
  }

  private close(focusComposer: boolean): void {
    const range = this.savedRange;
    this.savedRange = null;
    this.open = false;
    if (this.panel) this.panel.hidden = true;
    this.fab?.setAttribute('aria-expanded', 'false');
    const composer = this.composer;
    if (!focusComposer || !composer?.isConnected) return;
    composer.focus();
    if (
      range &&
      composer.isContentEditable &&
      composer.contains(range.startContainer) &&
      composer.contains(range.endContainer)
    ) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  private onPanelKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('.close')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.insertSelected();
      return;
    }
    if (target === this.input) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      if (this.visible.length) this.selectCell(this.selected, true, true);
      return;
    }
    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();
    if (!this.visible.length) return;
    const distance = vertical ? this.columnCount() : 1;
    const delta = forward ? distance : -distance;
    const next = (this.selected + delta + this.visible.length) % this.visible.length;
    this.selectCell(next, true, true);
  }

  private columnCount(): number {
    const cells = this.grid?.querySelectorAll<HTMLElement>('.cell');
    if (!cells?.length) return 1;
    const first = cells[0];
    if (!first) return 1;
    const firstTop = first.getBoundingClientRect().top;
    let columns = 1;
    for (let index = 1; index < cells.length; index += 1) {
      const cell = cells[index];
      if (!cell || Math.abs(cell.getBoundingClientRect().top - firstTop) > 1) break;
      columns += 1;
    }
    return columns;
  }

  private selectCell(index: number, focus = false, scroll = false): void {
    if (!this.grid || index < 0 || index >= this.visible.length) return;
    const previous = this.grid.querySelector<HTMLButtonElement>('.cell.selected');
    const next = this.grid.querySelector<HTMLButtonElement>(`.cell[data-index="${index}"]`);
    if (!next) return;
    if (previous && previous !== next) {
      previous.classList.remove('selected');
      previous.setAttribute('aria-selected', 'false');
      previous.tabIndex = -1;
    }
    this.selected = index;
    next.classList.add('selected');
    next.setAttribute('aria-selected', 'true');
    next.tabIndex = 0;
    if (focus) next.focus();
    if (scroll) next.scrollIntoView({ block: 'nearest' });
  }

  private insertSelected(): void {
    const emote = this.visible[this.selected];
    if (!emote || !this.composer?.isConnected) return;
    if (!insertIntoComposer(this.composer, `${emote.code} `, this.savedRange)) return;
    // Keep the picker open for another pick and remember the caret that the
    // insertion just moved, so the next emote lands right after this one.
    this.saveComposerSelection();
    this.input?.focus();
  }

  private loadProxied(img: HTMLImageElement, source: string): void {
    void proxiedImage(source).then((dataUrl) => {
      if (dataUrl && img.isConnected) img.src = dataUrl;
    });
  }

  private renderGrid(): void {
    if (!this.grid || !this.status) return;
    const filter = this.input?.value.trim().toLowerCase() ?? '';
    const filtered = filter
      ? this.emotes.filter((emote) => emote.code.toLowerCase().includes(filter))
      : this.emotes;
    this.visible = filtered.slice(0, MAX_VISIBLE);
    if (this.selected >= this.visible.length) this.selected = 0;

    this.grid.replaceChildren();
    this.imageObserver?.disconnect();
    this.imageObserver = null;
    if (this.descriptor.proxyImages && typeof IntersectionObserver !== 'undefined') {
      this.imageObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const cell = entry.target as HTMLElement;
            this.imageObserver?.unobserve(cell);
            const source = cell.dataset.eaSrc;
            const img = cell.querySelector('img');
            if (!source || !img) continue;
            delete cell.dataset.eaSrc;
            this.loadProxied(img, source);
          }
        },
        { root: this.grid, rootMargin: '120px' },
      );
    }

    if (!this.visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = this.emotes.length
        ? 'No emote matches this search.'
        : 'No emotes for this chat yet. Bind a 7TV set in the extension popup, then reload.';
      this.grid.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      this.visible.forEach((emote, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = index === this.selected ? 'cell selected' : 'cell';
        cell.dataset.index = String(index);
        cell.title = emote.code;
        cell.setAttribute('role', 'option');
        cell.setAttribute('aria-label', emote.code);
        cell.setAttribute('aria-selected', String(index === this.selected));
        cell.tabIndex = index === this.selected ? 0 : -1;
        const img = document.createElement('img');
        img.alt = emote.code;
        img.decoding = 'async';
        img.loading = 'lazy';
        img.draggable = false;
        if (this.descriptor.proxyImages) {
          if (this.imageObserver) {
            cell.dataset.eaSrc = emote.url;
            this.imageObserver.observe(cell);
          } else {
            this.loadProxied(img, emote.url);
          }
        } else {
          img.src = emote.url;
          img.addEventListener(
            'error',
            () => {
              if (img.dataset.eaRetried === '1') return;
              img.dataset.eaRetried = '1';
              this.loadProxied(img, emote.url);
            },
            { once: true },
          );
        }
        cell.append(img);
        fragment.append(cell);
      });
      this.grid.append(fragment);
    }
    this.grid.scrollTop = 0;

    const total = this.emotes.length;
    const suffix = filtered.length > MAX_VISIBLE ? ` · showing ${MAX_VISIBLE}` : '';
    this.status.textContent = total
      ? `${filtered.length} of ${total} emotes${suffix}`
      : 'No emotes loaded';
    const hint = document.createElement('span');
    hint.textContent = 'Enter inserts · Esc closes';
    this.status.append(hint);
  }
}
