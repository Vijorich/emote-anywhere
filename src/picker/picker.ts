import type { AppSettings, ChatEmote, PluginDescriptor } from '../core/types';
import { queryAllFirst } from '../engine/dom';
import { proxiedImage } from '../engine/image-fallback';
import { PICKER_HOST_CLASS } from '../engine/render';
import { insertIntoComposer } from './insert';

const MAX_VISIBLE = 500;
const LONG_PRESS_MS = 380;
const CLICK_SUPPRESS_MS = 700;
/** Large sets rebuild a full grid on each keystroke; let typing settle first. */
const SEARCH_DEBOUNCE_MS = 100;
const SEARCH_DEBOUNCE_MIN_EMOTES = 500;

function fabIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const face = document.createElementNS(ns, 'circle');
  face.setAttribute('cx', '12');
  face.setAttribute('cy', '12');
  face.setAttribute('r', '8.4');
  face.setAttribute('stroke', 'currentColor');
  face.setAttribute('stroke-width', '1.8');

  const leftEye = document.createElementNS(ns, 'circle');
  leftEye.setAttribute('cx', '8.8');
  leftEye.setAttribute('cy', '10.2');
  leftEye.setAttribute('r', '1.4');
  leftEye.setAttribute('fill', 'currentColor');

  const rightEye = leftEye.cloneNode() as SVGCircleElement;
  rightEye.setAttribute('cx', '15.2');

  const smile = document.createElementNS(ns, 'path');
  smile.setAttribute('d', 'M8 14c1 1.7 2.3 2.5 4 2.5s3-.8 4-2.5');
  smile.setAttribute('stroke', 'currentColor');
  smile.setAttribute('stroke-width', '1.8');
  smile.setAttribute('stroke-linecap', 'round');

  svg.append(face, leftEye, rightEye, smile);
  return svg;
}

const PANEL_CSS = `
/* Mirror of the colour tokens in src/ui/theme.css. Update both. */
:host {
  all: initial;
  --ea-surface: #181f1a;
  --ea-raised: #202922;
  --ea-control: #3c4a40;
  --ea-line: #6b7870;
  --ea-text: #f2f6f2;
  --ea-muted: #b2bdb4;
  --ea-accent: #6cc79e;
  --ea-accent-ink: #0b0f0c;
  --ea-accent-soft: #16281f;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
@media (prefers-color-scheme: light) {
  :host {
    --ea-surface: #ffffff;
    --ea-raised: #ebf1ed;
    --ea-control: #d2ddd5;
    --ea-line: #7d8680;
    --ea-text: #101411;
    --ea-muted: #59645c;
    --ea-accent: #17694e;
    --ea-accent-ink: #f6fbf8;
    --ea-accent-soft: #e2f0e9;
  }
}
* { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
[hidden] { display: none !important; }
.fab {
  position: fixed; right: 24px; bottom: 88px; width: 48px; height: 48px;
  display: grid; place-items: center; z-index: 2147483647;
  border: 0; border-radius: 8px;
  background: var(--ea-accent); color: var(--ea-accent-ink);
  cursor: pointer; box-shadow: 0 8px 16px rgba(0,0,0,.28);
  transition: background-color 120ms ease, color 120ms ease;
}
.fab:hover { background: var(--ea-text); color: var(--ea-surface); }
.fab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ea-surface), 0 0 0 4px var(--ea-accent), 0 8px 16px rgba(0,0,0,.28);
}
.close:focus-visible, .cell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ea-accent);
}
.panel {
  position: fixed; right: 24px; bottom: 144px;
  width: min(440px, calc(100% - 48px));
  max-height: min(560px, calc(100dvh - 168px));
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ea-surface); color: var(--ea-text);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,.35);
  z-index: 2147483647;
}
@media (max-height: 520px) {
  .panel { top: 8px; bottom: 8px; max-height: none; }
}
.head { display: flex; gap: 8px; padding: 16px; }
.search {
  flex: 1; min-width: 0; min-height: 40px; padding: 0 16px;
  border: 0; border-radius: 8px;
  background: var(--ea-raised); color: var(--ea-text); font-size: 16px;
  transition: background-color 120ms ease, box-shadow 120ms ease;
}
.search::placeholder { color: var(--ea-text); opacity: 0.68; }
.search:focus, .search:focus-visible {
  background: var(--ea-control);
  outline: none;
  box-shadow: none;
}
.search.kbd:focus {
  box-shadow: 0 0 0 2px var(--ea-accent);
}
.close {
  display: grid; place-items: center; width: 40px; height: 40px; padding: 0;
  border: 0; border-radius: 8px; line-height: 1;
  background: transparent; color: var(--ea-muted); font-size: 20px; cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.close:hover { background: var(--ea-control); color: var(--ea-text); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px; padding: 0 16px 16px; overflow-y: auto; align-content: start;
  min-height: 0; flex: 1;
  scrollbar-width: thin; scrollbar-color: var(--ea-control) transparent;
}
.grid::-webkit-scrollbar { width: 10px; }
.grid::-webkit-scrollbar-track { background: transparent; }
.grid::-webkit-scrollbar-thumb {
  border: 2px solid transparent; border-radius: 999px;
  background-color: var(--ea-control); background-clip: padding-box;
}
.grid::-webkit-scrollbar-thumb:hover { background-color: var(--ea-line); }
.grid::-webkit-scrollbar-button { display: none; }
.grid::-webkit-scrollbar-corner { background: transparent; }
.cell {
  height: 48px; display: grid; place-items: center; padding: 8px;
  border: 0; border-radius: 8px; background: var(--ea-raised);
  cursor: pointer; overflow: hidden;
  transition: background-color 120ms ease, transform 120ms ease;
  -webkit-touch-callout: none; user-select: none; touch-action: manipulation;
}
.cell:hover { background: var(--ea-control); }
.cell:active { transform: scale(.96); }
.cell.selected { background: var(--ea-accent-soft); box-shadow: inset 0 0 0 2px var(--ea-accent); }
.cell img { max-width: 32px; max-height: 32px; width: auto; height: auto; display: block; pointer-events: none; }
.cell-fallback {
  display: none; max-width: 100%;
  color: var(--ea-muted); font-size: 12px; font-weight: 700; line-height: 1.2;
  letter-spacing: -0.01em; text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cell.failed img { display: none; }
.cell.failed .cell-fallback { display: block; }
.zoom {
  position: fixed; inset: 0; display: grid; place-items: center;
  pointer-events: none; z-index: 2147483647;
}
.zoom[hidden] { display: none; }
.zoom-card {
  display: grid; justify-items: center; gap: 16px;
  max-width: min(320px, calc(100vw - 32px));
  max-height: calc(100dvh - 24px);
  padding: 24px; overflow: auto;
  pointer-events: auto;
  border-radius: 16px;
  background: var(--ea-surface);
  box-shadow: 0 24px 64px rgba(0,0,0,.45);
  animation: ea-zoom-in 120ms ease-out;
}
.zoom img {
  display: block;
  width: min(240px, 60vw, 50dvh); height: min(240px, 60vw, 50dvh);
  object-fit: contain;
}
.zoom-code {
  max-width: 100%; overflow: hidden; color: var(--ea-text);
  font-size: 13px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.3;
  text-overflow: ellipsis; white-space: nowrap;
}
@keyframes ea-zoom-in {
  from { opacity: 0; transform: scale(.94); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cell, .zoom-card { transition: none; animation: none; }
  .cell:active { transform: none; }
}
@media (pointer: coarse) {
  .fab { width: 48px; height: 48px; }
  .close { width: 48px; height: 48px; }
  .search { min-height: 48px; font-size: 16px; }
}
@media (forced-colors: active) {
  .cell.selected { outline: 2px solid Highlight; outline-offset: -2px; box-shadow: none; }
}
.sr-status {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.grid-note {
  grid-column: 1 / -1; padding: 8px; color: var(--ea-muted);
  font-size: 13px; line-height: 1.5; text-align: center;
}
.empty { padding: 32px 24px; text-align: center; color: var(--ea-muted); font-size: 16px; line-height: 1.5; }
`;

export class EmotePicker {
  private readonly descriptor: PluginDescriptor;
  private readonly settings: Pick<AppSettings, 'pickerEnabled'>;
  private emotes: ChatEmote[];
  private readonly searchIndex: Array<{ emote: ChatEmote; search: string }>;
  private composer: HTMLElement | null = null;
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private grid: HTMLDivElement | null = null;
  private fab: HTMLButtonElement | null = null;
  private closeButton: HTMLButtonElement | null = null;
  private status: HTMLDivElement | null = null;
  private zoom: HTMLDivElement | null = null;
  private zoomImage: HTMLImageElement | null = null;
  private zoomCode: HTMLSpanElement | null = null;
  private visible: ChatEmote[] = [];
  private selected = -1;
  private open = false;
  private checkTimer: number | null = null;
  private imageObserver: IntersectionObserver | null = null;
  private savedRange: Range | null = null;
  private pressTimer: number | null = null;
  private pressOrigin: { x: number; y: number } | null = null;
  private pointerActive = false;
  private previewing = false;
  private renderTimer: number | null = null;
  private previewCell: HTMLButtonElement | null = null;
  private previewRects: Array<{ cell: HTMLButtonElement; left: number; right: number; top: number; bottom: number }> = [];
  private suppressClickUntil = 0;
  private keyboardFocus = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (this.fab && path.includes(this.fab)) {
      if (!this.open) this.saveComposerSelection();
      return;
    }
    if (!this.open || !this.host) return;
    if (!path.includes(this.host)) this.close(false);
  };

  private readonly onPointerRelease = (): void => {
    this.cancelPress();
    this.pointerActive = false;
    this.previewCell = null;
    if (!this.previewing) return;
    this.hideZoom();
    this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.open || event.key !== 'Escape') return;
    if (this.host && event.composedPath().includes(this.host)) return;
    event.preventDefault();
    this.close(true);
  };

  private readonly onIntentKey = (): void => {
    this.keyboardFocus = true;
  };

  private readonly onIntentPointer = (): void => {
    this.keyboardFocus = false;
  };

  private readonly onGridPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.pointerActive = true;
    const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (!Number.isInteger(index)) return;
    this.cancelPress();
    this.previewCell = null;
    this.pressOrigin = { x: event.clientX, y: event.clientY };
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
      this.showZoom(index, cell);
    }, LONG_PRESS_MS);
  };

  private readonly onGridPointerMove = (event: PointerEvent): void => {
    if (this.previewing) {
      const cell = this.cellAt(event.clientX, event.clientY);
      if (cell && cell !== this.previewCell) {
        const index = Number(cell.dataset.index);
        if (Number.isInteger(index)) this.showZoom(index, cell);
      }
      return;
    }
    const origin = this.pressOrigin;
    if (!origin || this.pressTimer === null) return;
    if (
      Math.abs(event.clientX - origin.x) > 10 ||
      Math.abs(event.clientY - origin.y) > 10
    ) {
      this.cancelPress();
    }
  };

  private readonly onGridPointerLeave = (): void => {
    if (this.previewing) {
      this.hideZoom();
      this.pressOrigin = null;
      this.suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
      return;
    }
    this.cancelPress();
  };

  private readonly onGridContextMenu = (event: Event): void => {
    if (this.pressTimer !== null || this.previewing) event.preventDefault();
  };

  constructor(descriptor: PluginDescriptor, emotes: ChatEmote[], settings: Pick<AppSettings, 'pickerEnabled'>) {
    this.descriptor = descriptor;
    this.emotes = emotes;
    this.searchIndex = emotes.map((emote) => ({ emote, search: emote.code.toLowerCase() }));
    this.settings = settings;
  }

  start(): void {
    if (!this.settings.pickerEnabled || !this.descriptor.composer) return;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('pointerup', this.onPointerRelease, true);
    document.addEventListener('pointercancel', this.onPointerRelease, true);
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
    document.addEventListener('pointerdown', this.onIntentPointer, true);
    document.addEventListener('keydown', this.onIntentKey, true);
    this.checkTimer = window.setInterval(() => this.refreshComposer(), 1000);
    this.refreshComposer();
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('pointerup', this.onPointerRelease, true);
    document.removeEventListener('pointercancel', this.onPointerRelease, true);
    document.removeEventListener('keydown', this.onDocumentKeyDown, true);
    document.removeEventListener('pointerdown', this.onIntentPointer, true);
    document.removeEventListener('keydown', this.onIntentKey, true);
    this.endPreview();
    if (this.checkTimer !== null) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.imageObserver?.disconnect();
    this.imageObserver = null;
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
    this.input = null;
    this.grid = null;
    this.fab = null;
    this.closeButton = null;
    this.status = null;
    this.zoom = null;
    this.zoomImage = null;
    this.zoomCode = null;
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
    host.style.setProperty('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'important');
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
    panel.id = 'ea-emote-picker';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Emote picker');
    panel.addEventListener('keydown', (event) => this.onPanelKeyDown(event));
    fab.setAttribute('aria-controls', panel.id);

    const head = document.createElement('div');
    head.className = 'head';
    const input = document.createElement('input');
    input.className = 'search';
    input.type = 'text';
    input.placeholder = 'Search emotes…';
    input.setAttribute('aria-label', 'Search emotes');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', 'ea-emote-grid');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      this.selected = -1;
      this.scheduleGridRender();
    });
    input.addEventListener('focus', () => {
      input.classList.toggle('kbd', this.keyboardFocus);
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
    grid.id = 'ea-emote-grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Emotes');
    grid.addEventListener('pointerdown', this.onGridPointerDown);
    grid.addEventListener('pointermove', this.onGridPointerMove);
    grid.addEventListener('pointerleave', this.onGridPointerLeave);
    grid.addEventListener('contextmenu', this.onGridContextMenu);
    grid.addEventListener(
      'touchmove',
      (event) => {
        // Once the preview is open, a moving finger switches tiles instead of
        // scrolling the grid.
        if (this.previewing) event.preventDefault();
      },
      { passive: false },
    );
    grid.addEventListener('scroll', () => this.endPreview(), { passive: true });
    grid.addEventListener('focusin', (event) => {
      if (this.pointerActive) return;
      const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
      if (!cell) return;
      const index = Number(cell.dataset.index);
      if (Number.isInteger(index)) this.selectCell(index);
    });
    grid.addEventListener('click', (event) => {
      if (Date.now() < this.suppressClickUntil) {
        this.suppressClickUntil = 0;
        event.preventDefault();
        return;
      }
      const cell = (event.target as Element | null)?.closest<HTMLButtonElement>('.cell');
      if (!cell) return;
      const index = Number(cell.dataset.index);
      if (!Number.isInteger(index)) return;
      this.clearSelection();
      cell.tabIndex = 0;
      this.insertEmote(index);
    });

    const zoom = document.createElement('div');
    zoom.className = 'zoom';
    zoom.hidden = true;
    zoom.setAttribute('aria-hidden', 'true');
    const zoomCard = document.createElement('div');
    zoomCard.className = 'zoom-card';
    const zoomImage = document.createElement('img');
    zoomImage.alt = '';
    zoomImage.draggable = false;
    zoomImage.addEventListener('error', () => {
      zoomImage.style.setProperty('display', 'none', 'important');
    });
    const zoomCode = document.createElement('span');
    zoomCode.className = 'zoom-code';
    zoomCard.append(zoomImage, zoomCode);
    zoom.append(zoomCard);

    const status = document.createElement('div');
    status.className = 'sr-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    panel.append(head, grid, status);
    shadow.append(fab, panel, zoom);
    document.documentElement.append(host);

    this.host = host;
    this.shadow = shadow;
    this.fab = fab;
    this.panel = panel;
    this.input = input;
    this.grid = grid;
    this.closeButton = close;
    this.status = status;
    this.zoom = zoom;
    this.zoomImage = zoomImage;
    this.zoomCode = zoomCode;
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
    this.input.setAttribute('aria-expanded', 'true');
    this.input.value = '';
    this.selected = -1;
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.renderGrid();
    this.input.focus();
  }

  private scheduleGridRender(): void {
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.emotes.length < SEARCH_DEBOUNCE_MIN_EMOTES) {
      this.renderGrid();
      return;
    }
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.renderGrid();
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Keyboard actions must see the results for the current query, not the debounced grid. */
  private flushGridRender(): void {
    if (this.renderTimer === null) return;
    window.clearTimeout(this.renderTimer);
    this.renderTimer = null;
    this.renderGrid();
  }

  private close(focusComposer: boolean): void {
    this.endPreview();
    const range = this.savedRange;
    this.savedRange = null;
    this.open = false;
    if (this.panel) this.panel.hidden = true;
    this.input?.setAttribute('aria-expanded', 'false');
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
      event.stopPropagation();
      if (this.previewing) {
        this.hideZoom();
        return;
      }
      this.close(true);
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('.close')) return;
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      this.flushGridRender();
      this.previewSelected();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.flushGridRender();
      this.insertSelected();
      return;
    }
    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();
    this.flushGridRender();
    if (!this.visible.length) return;
    if (this.selected < 0) {
      this.selectCell(0, target !== this.input, true);
      return;
    }
    const distance = vertical ? this.columnCount() : 1;
    const delta = forward ? distance : -distance;
    const next = (this.selected + delta + this.visible.length) % this.visible.length;
    this.selectCell(next, target !== this.input, true);
  }

  private trapFocus(event: KeyboardEvent): void {
    const cells = Array.from(
      this.grid?.querySelectorAll<HTMLButtonElement>('.cell[tabindex="0"]') ?? [],
    );
    const focusables: HTMLElement[] = [
      ...(this.input ? [this.input] : []),
      ...(this.closeButton ? [this.closeButton] : []),
      ...cells,
    ];
    if (focusables.length < 2) return;
    const active = this.shadow?.activeElement as HTMLElement | null;
    const current = active ? focusables.indexOf(active) : -1;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && current <= 0) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && current === focusables.length - 1) {
      event.preventDefault();
      first.focus();
    }
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
    const tabStop = this.grid.querySelector<HTMLButtonElement>('.cell[tabindex="0"]');
    const next = this.grid.querySelector<HTMLButtonElement>(`.cell[data-index="${index}"]`);
    if (!next) return;
    if (previous && previous !== next) {
      previous.classList.remove('selected');
      previous.setAttribute('aria-selected', 'false');
    }
    if (tabStop && tabStop !== next) tabStop.tabIndex = -1;
    this.selected = index;
    next.classList.add('selected');
    next.setAttribute('aria-selected', 'true');
    next.tabIndex = 0;
    this.input?.setAttribute('aria-activedescendant', next.id);
    if (focus) next.focus();
    if (scroll) next.scrollIntoView?.({ block: 'nearest' });
  }

  private clearSelection(): void {
    const previous = this.grid?.querySelector<HTMLButtonElement>('.cell.selected');
    if (previous) {
      previous.classList.remove('selected');
      previous.setAttribute('aria-selected', 'false');
    }
    const tabStop = this.grid?.querySelector<HTMLButtonElement>('.cell[tabindex="0"]');
    if (tabStop) tabStop.tabIndex = -1;
    this.input?.removeAttribute('aria-activedescendant');
    this.selected = -1;
  }

  private insertEmote(index: number): void {
    const emote = this.visible[index];
    if (!emote || !this.composer?.isConnected) return;
    if (!insertIntoComposer(this.composer, `${emote.code} `, this.savedRange)) return;
    // Keep the picker open for another pick and remember the caret that the
    // insertion just moved, so the next emote lands right after this one.
    this.saveComposerSelection();
    this.setStatus(`Inserted ${emote.code}`);
    this.input?.focus();
  }

  private previewSelected(): void {
    this.ensureFilteredSelection();
    const cell = this.grid?.querySelector<HTMLButtonElement>('.cell.selected');
    if (cell && this.selected >= 0) this.showZoom(this.selected, cell);
  }

  /** Enter on a search with nothing selected inserts the first match. */
  private ensureFilteredSelection(): void {
    if (this.selected >= 0 || !this.visible.length) return;
    if (!this.input?.value.trim()) return;
    this.selectCell(0);
  }

  private setStatus(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  private insertSelected(): void {
    this.ensureFilteredSelection();
    this.insertEmote(this.selected);
  }

  private cancelPress(): void {
    if (this.pressTimer !== null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.pressOrigin = null;
  }

  private hideZoom(): void {
    this.previewing = false;
    this.previewCell = null;
    this.previewRects = [];
    if (this.zoom) this.zoom.hidden = true;
    this.zoomImage?.removeAttribute('src');
  }

  private endPreview(): void {
    this.cancelPress();
    this.hideZoom();
  }

  private cachePreviewRects(): void {
    this.previewRects = [];
    const cells = this.grid?.querySelectorAll<HTMLButtonElement>('.cell');
    if (!cells) return;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      this.previewRects.push({
        cell,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
    }
  }

  private cellAt(x: number, y: number): HTMLButtonElement | null {
    for (const entry of this.previewRects) {
      if (x >= entry.left && x <= entry.right && y >= entry.top && y <= entry.bottom) {
        return entry.cell;
      }
    }
    return null;
  }

  private showZoom(index: number, cell: HTMLButtonElement): void {
    const emote = this.visible[index];
    const image = this.zoomImage;
    if (!emote || !this.zoom || !image || !this.zoomCode) return;
    if (!this.previewing) this.cachePreviewRects();
    this.previewing = true;
    this.previewCell = cell;
    this.zoomCode.textContent = emote.code;
    image.alt = '';
    image.style.removeProperty('display');
    image.removeAttribute('src');
    const thumb = cell.querySelector<HTMLImageElement>('img');
    if (thumb?.src) image.src = thumb.src;
    this.zoom.hidden = false;
    this.loadZoomImage(emote, image);
  }

  /** 7TV serves 4x assets at the same URL shape; try them for the large view. */
  private loadZoomImage(emote: ChatEmote, image: HTMLImageElement): void {
    const large = emote.url.replace('/2x.', '/4x.');
    const apply = (src: string): void => {
      if (!this.previewing || this.zoomCode?.textContent !== emote.code) return;
      image.style.removeProperty('display');
      image.src = src;
    };
    if (this.descriptor.proxyImages) {
      void proxiedImage(large).then((dataUrl) => {
        if (dataUrl) {
          apply(dataUrl);
          return;
        }
        if (large === emote.url) return;
        void proxiedImage(emote.url).then((fallback) => {
          if (fallback) apply(fallback);
        });
      });
      return;
    }
    if (large === emote.url) return;
    const probe = new Image();
    probe.onload = () => apply(large);
    probe.src = large;
  }

  private loadProxied(img: HTMLImageElement, source: string): void {
    void proxiedImage(source).then((dataUrl) => {
      if (!img.isConnected) return;
      const cell = img.closest<HTMLElement>('.cell');
      if (dataUrl) {
        img.src = dataUrl;
        cell?.classList.remove('failed');
        return;
      }
      cell?.classList.add('failed');
    });
  }

  private renderGrid(): void {
    if (!this.grid) return;
    const filter = this.input?.value.trim().toLowerCase() ?? '';
    const filtered = filter
      ? this.searchIndex
          .filter((entry) => entry.search.includes(filter))
          .map((entry) => entry.emote)
      : this.emotes;
    this.visible = filtered.slice(0, MAX_VISIBLE);
    if (this.selected >= this.visible.length) this.selected = -1;
    if (this.selected < 0) this.input?.removeAttribute('aria-activedescendant');

    this.grid.replaceChildren();
    if (this.descriptor.proxyImages && typeof IntersectionObserver !== 'undefined') {
      if (!this.imageObserver) {
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
      } else {
        this.imageObserver.disconnect();
      }
    }

    if (!this.visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = this.emotes.length
        ? 'No emotes match this search.'
        : 'No emotes yet. Add a set from the extension popup.';
      this.grid.append(empty);
      this.setStatus(empty.textContent);
    } else {
      const fragment = document.createDocumentFragment();
      this.visible.forEach((emote, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.id = `ea-emote-${index}`;
        cell.className = index === this.selected ? 'cell selected' : 'cell';
        cell.dataset.index = String(index);
        cell.title = emote.code;
        cell.setAttribute('role', 'option');
        cell.setAttribute('aria-label', emote.code);
        cell.setAttribute('aria-selected', String(index === this.selected));
        cell.tabIndex = index === this.selected || (this.selected < 0 && index === 0) ? 0 : -1;
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';
        img.draggable = false;
        const fallback = document.createElement('span');
        fallback.className = 'cell-fallback';
        fallback.textContent = emote.code;
        fallback.setAttribute('aria-hidden', 'true');
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
        cell.append(img, fallback);
        fragment.append(cell);
      });
      if (filtered.length > MAX_VISIBLE) {
        const note = document.createElement('div');
        note.className = 'grid-note';
        note.textContent = `Showing first ${MAX_VISIBLE} of ${filtered.length}. Refine the search.`;
        fragment.append(note);
        this.setStatus(`Showing first ${MAX_VISIBLE} of ${filtered.length} emotes. Refine the search.`);
      } else {
        this.setStatus(`${this.visible.length} emote${this.visible.length === 1 ? '' : 's'}`);
      }
      this.grid.append(fragment);
    }
    this.grid.scrollTop = 0;
  }
}
