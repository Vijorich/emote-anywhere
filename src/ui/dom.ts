type Child = Node | string | number | null | undefined | false;

export type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'style') {
      Object.assign(node.style, value as Record<string, string>);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value as Record<string, string>);
    } else if (key === 'on') {
      for (const [event, listener] of Object.entries(value as Record<string, EventListener>)) {
        node.addEventListener(event, listener);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value' && 'value' in node) {
      (node as HTMLInputElement).value = String(value);
    } else if (key === 'checked' && 'checked' in node) {
      (node as HTMLInputElement).checked = Boolean(value);
    } else if (key === 'disabled' && 'disabled' in node) {
      (node as HTMLButtonElement).disabled = Boolean(value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function link(href: string, text: string): HTMLAnchorElement {
  return h('a', { href, target: '_blank', rel: 'noreferrer', text });
}
