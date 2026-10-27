const warned = new Set<string>();

function warnOnce(selector: string, error: unknown): void {
  if (warned.has(selector)) return;
  warned.add(selector);
  console.warn(`[emote-anywhere] invalid selector "${selector}"`, error);
}

/** Validates selectors once and joins them, so hot paths call matches() once. */
export function combineSelectors(selectors: string[]): string | null {
  const probe = document.createDocumentFragment();
  const valid: string[] = [];
  for (const selector of selectors) {
    try {
      probe.querySelector(selector);
      valid.push(selector);
    } catch (error) {
      warnOnce(selector, error);
    }
  }
  return valid.length ? valid.join(',') : null;
}

export function matchesSelector(element: Element, selector: string | null): boolean {
  if (!selector) return false;
  try {
    return element.matches(selector);
  } catch (error) {
    warnOnce(selector, error);
    return false;
  }
}

export function closestSelector(element: Element, selector: string | null): Element | null {
  if (!selector) return null;
  try {
    return element.closest(selector);
  } catch (error) {
    warnOnce(selector, error);
    return null;
  }
}

export function hasSelector(root: Element, selector: string | null): boolean {
  if (!selector) return false;
  try {
    return root.querySelector(selector) !== null;
  } catch (error) {
    warnOnce(selector, error);
    return false;
  }
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
