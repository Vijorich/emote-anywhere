const warned = new Set<string>();

function warnOnce(selector: string, error: unknown): void {
  if (warned.has(selector)) return;
  warned.add(selector);
  console.warn(`[emote-anywhere] invalid selector "${selector}"`, error);
}

export function matchesAny(element: Element, selectors: string[]): boolean {
  for (const selector of selectors) {
    try {
      if (element.matches(selector)) return true;
    } catch (error) {
      warnOnce(selector, error);
    }
  }
  return false;
}

export function queryAllFirst(root: ParentNode, selectors: string[]): Element[] {
  for (const selector of selectors) {
    try {
      const nodes = root.querySelectorAll(selector);
      if (nodes.length) return Array.from(nodes);
    } catch (error) {
      warnOnce(selector, error);
    }
  }
  return [];
}

export function closestAny(element: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const found = element.closest(selector);
      if (found) return found;
    } catch (error) {
      warnOnce(selector, error);
    }
  }
  return null;
}
