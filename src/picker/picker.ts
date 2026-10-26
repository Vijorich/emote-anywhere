import type { AppSettings, Emote, PluginDescriptor } from '../core/types';
import { queryAllFirst } from '../engine/dom';
import { proxiedImage } from '../engine/image-fallback';
import { PICKER_HOST_CLASS } from '../engine/render';
import { insertIntoComposer } from './insert';

const MAX_VISIBLE = 500;

const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
[hidden] { display: none !important; }
.fab {
  position: fixed; right: 20px; bottom: 88px; width: 40px; height: 40px;
  display: grid; place-items: center; z-index: 2147483647;
  border: 1px solid rgba(255,255,255,.16); border-radius: 12px;
  background: #1d1d22; color: #f2f2f5; font-size: 20px; line-height: 1;
  cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.35);
}
.fab:hover { background: #2a2a31; }
.panel {
  position: fixed; right: 20px; bottom: 136px;
  width: min(440px, calc(100vw - 24px)); max-height: min(560px, 72vh);
  display: flex; flex-direction: column; overflow: hidden;
  background: #17171b; color: #ececf1; border: 1px solid #34343d;
  border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
  z-index: 2147483647;
}
.head { display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid #2b2b33; }
.search {
  flex: 1; min-width: 0; height: 34px; padding: 0 10px;
  border: 1px solid #3a3a45; border-radius: 9px;
  background: #101014; color: #f2f2f5; font-size: 14px; outline: none;
}
.search:focus { border-color: #7c6cff; }
.close {
  width: 34px; height: 34px; border: 1px solid #3a3a45; border-radius: 9px;
  background: #202027; color: #c9c9d3; font-size: 18px; cursor: pointer;
}
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px; padding: 10px; overflow-y: auto; align-content: start;
}
.cell {
  height: 46px; display: grid; place-items: center; padding: 4px;
  border: 1px solid transparent; border-radius: 10px; background: #202027;
  cursor: pointer; overflow: hidden;
}
.cell:hover { background: #2b2b34; }
.cell.selected { border-color: #7c6cff; background: #2a2643; }
.cell img { max-width: 34px; max-height: 34px; width: auto; height: auto; display: block; }
.status {
  padding: 8px 12px; border-top: 1px solid #2b2b33;
  color: #9a9aa8; font-size: 12px; min-height: 30px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.empty { padding: 28px 18px; text-align: center; color: #9a9aa8; font-size: 13px; line-height: 1.5; }
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

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyE') {
      event.preventDefault();
      this.toggle();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.open || !this.host) return;
    if (!event.composedPath().includes(this.host)) this.close(false);
  };

  constructor(descriptor: PluginDescriptor, emotes: Emote[], settings: Pick<AppSettings, 'pickerEnabled'>) {
    this.descriptor = descriptor;
    this.emotes = emotes;
    this.settings = settings;
  }

  start(): void {
    if (!this.settings.pickerEnabled || !this.descriptor.composer) return;
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('pointerdown', this.onPointerDown, true);
    this.checkTimer = window.setInterval(() => this.refreshComposer(), 1000);
    this.refreshComposer();
  }

  setEmotes(emotes: Emote[]): void {
    this.emotes = emotes;
    if (this.open) this.renderGrid();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
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
    this.open = false;
  }

  private refreshComposer(): void {
    if (this.composer && !this.composer.isConnected) this.composer = null;
    const next = this.findComposer();
    if (next) this.composer = next;
    if (!this.composer) {
      if (this.fab) this.fab.hidden = true;
      return;
    }
    if (!this.host) this.mount();
    if (this.fab) this.fab.hidden = false;
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
    fab.textContent = '☺';
    fab.title = 'Emote picker (Alt+E)';
    fab.setAttribute('aria-label', 'Open emote picker');
    fab.addEventListener('click', (event) => {
      event.preventDefault();
      this.toggle();
    });

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;

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
    input.addEventListener('keydown', (event) => this.onPanelKeyDown(event));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close emote picker');
    close.addEventListener('click', () => this.close(true));
    head.append(input, close);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.addEventListener('click', (event) => {
      const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
      if (!cell) return;
      const index = Number(cell.dataset.index);
      if (!Number.isInteger(index)) return;
      this.selected = index;
      this.insertSelected();
    });

    const status = document.createElement('div');
    status.className = 'status';

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
      this.close(false);
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    if (!this.composer || !this.composer.isConnected) this.refreshComposer();
    if (!this.composer) return;
    if (!this.host) this.mount();
    if (!this.panel || !this.input) return;
    this.open = true;
    this.panel.hidden = false;
    this.input.value = '';
    this.selected = 0;
    this.renderGrid();
    this.input.focus();
  }

  private close(focusComposer: boolean): void {
    this.open = false;
    if (this.panel) this.panel.hidden = true;
    if (focusComposer) this.composer?.focus();
  }

  private onPanelKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.insertSelected();
      return;
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();
    if (!this.visible.length) return;
    const delta = forward ? 1 : -1;
    this.selected = (this.selected + delta + this.visible.length) % this.visible.length;
    this.renderGrid(false);
    this.grid
      ?.querySelector<HTMLElement>(`.cell[data-index="${this.selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  private insertSelected(): void {
    const emote = this.visible[this.selected];
    if (!emote || !this.composer) return;
    if (insertIntoComposer(this.composer, `${emote.code} `)) {
      this.close(true);
    }
  }

  private loadProxied(img: HTMLImageElement, source: string): void {
    void proxiedImage(source).then((dataUrl) => {
      if (dataUrl && img.isConnected) img.src = dataUrl;
    });
  }

  private renderGrid(resetScroll = true): void {
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
        const img = document.createElement('img');
        img.alt = emote.code;
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
    if (resetScroll) this.grid.scrollTop = 0;

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
