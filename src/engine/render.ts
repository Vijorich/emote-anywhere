import { EMOTE_BASE_HEIGHT_EM } from '../core/config';
import { isZeroWidth } from '../core/emote-flags';
import type { Emote } from '../core/types';
import { proxiedImage } from './image-fallback';
import type { EmoteToken } from './tokenize';

export interface EmoteGroup {
  tokens: EmoteToken[];
  start: number;
  end: number;
  source: string;
}

export const EMOTE_CLASS = 'ea-e';
export const PICKER_HOST_CLASS = 'ea-picker-host';

function gapIsWhitespace(text: string, from: number, to: number): boolean {
  return /^[\s\u200b\ufeff]*$/u.test(text.slice(from, to));
}

/**
 * A zero-width emote is attached to the previous emote when only whitespace
 * separates them. The group keeps the exact original text so a re-render can
 * restore the DOM to its source form.
 */
export function groupTokens(text: string, tokens: EmoteToken[]): EmoteGroup[] {
  const groups: EmoteGroup[] = [];
  for (const token of tokens) {
    const previous = groups[groups.length - 1];
    if (
      previous &&
      isZeroWidth(token.emote) &&
      gapIsWhitespace(text, previous.end, token.start)
    ) {
      previous.tokens.push(token);
      previous.end = token.end;
      previous.source = text.slice(previous.start, previous.end);
      continue;
    }
    groups.push({
      tokens: [token],
      start: token.start,
      end: token.end,
      source: text.slice(token.start, token.end),
    });
  }
  return groups;
}

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value, 'important');
  }
}

function createImage(
  emote: Emote,
  overlay: boolean,
  proxyImages: boolean,
): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = emote.code;
  img.title = emote.code;
  img.draggable = false;
  img.decoding = 'async';
  img.loading = 'eager';
  const styles: Record<string, string> = {
    display: 'block',
    height: '100%',
    'max-width': 'none',
    'max-height': 'none',
    'object-fit': 'contain',
    border: '0',
    background: 'none',
    padding: '0',
    margin: '0',
    'box-shadow': 'none',
  };
  if (overlay) {
    styles.position = 'absolute';
    styles.left = '0';
    styles.top = '0';
    styles.width = '100%';
    styles.height = '100%';
  } else {
    styles.width = 'auto';
  }
  setStyles(img, styles);

  if (proxyImages) {
    img.style.setProperty('min-width', '1em', 'important');
    img.addEventListener(
      'load',
      () => img.style.removeProperty('min-width'),
      { once: true },
    );
    void proxiedImage(emote.url).then((dataUrl) => {
      if (dataUrl) img.src = dataUrl;
    });
  } else {
    img.src = emote.url;
    img.addEventListener(
      'error',
      () => {
        if (img.dataset.eaRetried === '1') return;
        img.dataset.eaRetried = '1';
        void proxiedImage(emote.url).then((dataUrl) => {
          if (dataUrl) img.src = dataUrl;
        });
      },
      { once: true },
    );
  }

  return img;
}

export function createEmoteSpan(
  group: EmoteGroup,
  scale: number,
  proxyImages = false,
): HTMLSpanElement {
  const heightEm = EMOTE_BASE_HEIGHT_EM * scale;
  const base = group.tokens.find((token) => !isZeroWidth(token.emote)) ?? group.tokens[0];
  if (!base) throw new Error('Emote group without tokens');

  const span = document.createElement('span');
  span.className = EMOTE_CLASS;
  span.dataset.eaCode = base.emote.code;
  span.dataset.eaText = group.source;
  setStyles(span, {
    display: 'inline-block',
    position: 'relative',
    height: `${heightEm}em`,
    'vertical-align': 'middle',
    'line-height': '0',
    margin: '0 1px',
    padding: '0',
    border: '0',
    background: 'none',
    'max-width': 'none',
    'max-height': 'none',
    'box-shadow': 'none',
  });

  span.append(createImage(base.emote, false, proxyImages));
  for (const token of group.tokens) {
    if (token === base || !isZeroWidth(token.emote)) continue;
    span.append(createImage(token.emote, true, proxyImages));
  }
  return span;
}

export function replaceTextNode(
  node: Text,
  groups: EmoteGroup[],
  scale: number,
  proxyImages = false,
): void {
  const parent = node.parentNode;
  if (!parent || groups.length === 0) return;
  const text = node.data;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const group of groups) {
    if (group.start > cursor) fragment.append(text.slice(cursor, group.start));
    fragment.append(createEmoteSpan(group, scale, proxyImages));
    cursor = group.end;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  parent.replaceChild(fragment, node);
}

export function restoreEmotes(root: Element): void {
  for (const span of Array.from(root.querySelectorAll(`.${EMOTE_CLASS}[data-ea-text]`))) {
    const source = span.getAttribute('data-ea-text') ?? '';
    span.replaceWith(document.createTextNode(source));
  }
}

/** Text content with rendered emotes converted back to their source codes. */
export function readSource(root: Element): string {
  const parts: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.classList.contains(EMOTE_CLASS)) {
      parts.push(element.getAttribute('data-ea-text') ?? '');
      return;
    }
    for (const child of Array.from(element.childNodes)) visit(child);
  };
  visit(root);
  return parts.join('');
}
