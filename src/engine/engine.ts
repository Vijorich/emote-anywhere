import type { AppSettings, ChatEmote, PluginDescriptor } from '../core/types';
import {
  closestSelector,
  combineSelectors,
  hasSelector,
  matchesSelector,
  queryAllFirst,
} from './dom';
import {
  EMOTE_CLASS,
  PICKER_HOST_CLASS,
  groupTokens,
  readSource,
  replaceTextNode,
  restoreEmotes,
} from './render';
import { tokenizeText } from './tokenize';

const BASE_EXCLUDED =
  'script,style,noscript,textarea,input,select,option,code,pre,[contenteditable]:not([contenteditable="false"])';

export interface ChatEngineOptions {
  descriptor: PluginDescriptor;
  emotes: ChatEmote[];
  settings: Pick<AppSettings, 'globalMode' | 'emoteScale'>;
}

export class ChatEngine {
  private readonly descriptor: PluginDescriptor;
  private readonly settings: Pick<AppSettings, 'globalMode' | 'emoteScale'>;
  private readonly lookup: Map<string, ChatEmote>;
  private readonly excludedSelector: string | null;
  private readonly skipSelector: string | null;
  private readonly proxyImages: boolean;
  private readonly snapshots = new WeakMap<Element, { source: string; hasTokens: boolean }>();
  private readonly pendingMessages = new Set<Element>();
  private readonly pendingNodes = new Set<Node>();
  private roots: Element[] = [];
  private rootsMatched = false;
  private observer: MutationObserver | null = null;
  /** Watches for the chat root being replaced under document.body. */
  private rootObserver: MutationObserver | null = null;
  private stopped = true;

  constructor(options: ChatEngineOptions) {
    this.descriptor = options.descriptor;
    this.settings = options.settings;
    this.lookup = new Map(options.emotes.map((emote) => [emote.code, emote]));
    this.proxyImages = this.descriptor.proxyImages === true;
    this.excludedSelector = combineSelectors([
      BASE_EXCLUDED,
      ...(this.descriptor.chat.exclude ?? []),
    ]);
    this.skipSelector = combineSelectors(this.descriptor.chat.skip ?? []);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.resolveRoots();
    const messages = this.settings.globalMode ? [] : this.messagesInRoots();
    const pinned = this.bottomPinned(
      this.settings.globalMode || !messages.length ? [document.body] : messages,
    );
    this.restoreAll();
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.rootObserver = new MutationObserver(() => this.onRootsChanged());
    this.observeTargets();
    if (this.settings.globalMode) {
      this.processGlobalNode(document.body);
    } else {
      for (const message of messages) this.processMessage(message);
    }
    this.restorePinned(pinned);
    // Rendering inserts our own spans and text nodes. They are already handled;
    // leaving them queued makes the observer reprocess every rendered message.
    this.observer.takeRecords();
  }

  stop(): void {
    const wasRunning = !this.stopped;
    this.stopped = true;
    this.observer?.disconnect();
    this.rootObserver?.disconnect();
    this.observer = null;
    this.rootObserver = null;
    if (wasRunning) this.restoreAll();
    this.pendingMessages.clear();
    this.pendingNodes.clear();
    this.roots = [];
    this.rootsMatched = false;
  }

  private get messages(): string[] {
    return this.descriptor.chat.messages;
  }

  /** A previous engine instance may have left its spans in the page. */
  private restoreAll(): void {
    if (this.settings.globalMode) {
      restoreEmotes(document.body);
      return;
    }
    for (const root of this.roots) restoreEmotes(root);
  }

  private onMutations(records: MutationRecord[]): void {
    if (this.stopped) return;
    if (!this.settings.globalMode && this.ensureRoots()) {
      this.observeTargets();
      this.renderRoots();
      return;
    }
    const roots = this.settings.globalMode ? [] : this.roots;
    for (const record of records) {
      if (this.isOurs(record.target)) continue;
      if (record.type === 'characterData') {
        this.enqueue(record.target, roots);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && this.isOurs(node)) continue;
        this.enqueue(node, roots);
      }
    }
    this.schedule();
  }

  /**
   * Root selectors and body fallback. Returns whether the target list changed.
   * A configured root that is not in the DOM yet is not cached, so a late
   * mounting chat is picked up on a later batch.
   */
  private resolveRoots(): boolean {
    const selectors = this.descriptor.chat.roots;
    let elements: Element[];
    let matched: boolean;
    if (!selectors?.length) {
      elements = [document.body];
      matched = true;
    } else {
      const found = queryAllFirst(document, selectors);
      elements = found.length ? found : [document.body];
      matched = found.length > 0;
    }
    const changed =
      elements.length !== this.roots.length ||
      elements.some((element, index) => element !== this.roots[index]);
    this.roots = elements;
    this.rootsMatched = matched;
    return changed;
  }

  private ensureRoots(): boolean {
    if (this.rootsMatched && this.roots.every((root) => root.isConnected)) return false;
    return this.resolveRoots();
  }

  /**
   * Watch the chat roots themselves, not the whole page. A second observer on
   * body's direct children catches a root being replaced by the host app.
   */
  private observeTargets(): void {
    if (!this.observer) return;
    this.observer.disconnect();
    this.rootObserver?.disconnect();
    if (this.settings.globalMode) {
      this.observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      return;
    }
    for (const root of this.roots) {
      this.observer.observe(root, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    if (this.rootObserver && this.rootsMatched && this.roots[0] !== document.body) {
      // Root replacements are rare; only direct children of body are watched.
      this.rootObserver.observe(document.body, { childList: true });
    }
  }

  private onRootsChanged(): void {
    if (this.stopped || this.settings.globalMode) return;
    // Re-resolve even when the current roots are connected: the host may add
    // a second element matching the same root selector.
    if (!this.resolveRoots()) return;
    this.observeTargets();
    this.renderRoots();
  }

  private renderRoots(): void {
    const messages = this.messagesInRoots();
    const pinned = this.bottomPinned(messages.length ? messages : this.roots);
    for (const message of messages) this.processMessage(message);
    this.restorePinned(pinned);
    this.observer?.takeRecords();
  }

  private messagesInRoots(): Element[] {
    return this.roots.flatMap((root) => this.findMessages(root));
  }

  private enqueue(node: Node, roots: Element[]): void {
    if (this.settings.globalMode) {
      if (this.isExcludedNode(node)) return;
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
        this.pendingNodes.add(node);
      }
      return;
    }

    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element || this.isOurs(element)) return;
    if (!roots.some((root) => root === element || root.contains(element))) return;

    const message = this.findMessage(element, roots);
    if (message) {
      this.pendingMessages.add(message);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const found of this.findMessages(node as Element)) {
        this.pendingMessages.add(found);
      }
    }
  }

  private schedule(): void {
    if (
      this.stopped ||
      (!this.pendingMessages.size && !this.pendingNodes.size)
    ) {
      return;
    }
    // Render in the same task as the DOM change. Waiting even one frame lets
    // the plain text paint first, which reads as a flicker when emotes land.
    this.flush();
  }

  private flush(): void {
    if (this.stopped) return;
    const messages = Array.from(this.pendingMessages);
    const nodes = Array.from(this.pendingNodes);
    this.pendingMessages.clear();
    this.pendingNodes.clear();
    const pinned = this.bottomPinned([...messages, ...nodes]);
    for (const message of messages) this.processMessage(message);
    for (const node of nodes) this.processGlobalNode(node);
    this.restorePinned(pinned);
    // Everything queued during the synchronous flush is our own rendering.
    this.observer?.takeRecords();
  }

  /** Keep bottom-pinned chats pinned when emote spans change line height; elsewhere leave scrolling to the browser. */
  private bottomPinned(nodes: Node[]): HTMLElement[] {
    const pinned: HTMLElement[] = [];
    const seen = new Set<Element>();
    const visit = (node: Node | null): void => {
      const start = node instanceof Element ? node : node?.parentElement;
      for (let element = start; element; element = element.parentElement) {
        if (seen.has(element)) continue;
        seen.add(element);
        if (!(element instanceof HTMLElement)) continue;
        const max = element.scrollHeight - element.clientHeight;
        if (max > 1 && max - element.scrollTop <= 48) pinned.push(element);
      }
    };
    for (const node of nodes) visit(node);
    return pinned;
  }

  private restorePinned(pinned: HTMLElement[]): void {
    for (const element of pinned) {
      if (!element.isConnected) continue;
      element.scrollTop = element.scrollHeight - element.clientHeight;
    }
  }

  private processMessage(message: Element): void {
    if (this.stopped || !message.isConnected || this.isSkipped(message)) return;
    const roots = this.textRoots(message);
    const sources = roots.map((root) =>
      readSource(root, (element) => this.isExcludedElement(element)),
    );
    const before = JSON.stringify(sources);
    const previous = this.snapshots.get(message);

    if (previous?.source === before) {
      // A message without emotes never needs to be inspected again. A message
      // with emotes only needs a re-render if React replaced our spans.
      if (!previous.hasTokens) return;
      if (message.querySelector(`.${EMOTE_CLASS}`) !== null) return;
    }
    if (previous !== undefined) restoreEmotes(message);

    let hasTokens = false;
    for (const node of this.collectTextNodes(roots)) {
      hasTokens = this.renderNode(node) || hasTokens;
    }
    this.snapshots.set(message, { source: before, hasTokens });
  }

  private processGlobalNode(node: Node): void {
    if (this.stopped || !node.isConnected) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.nodeValue?.trim() && !this.isExcludedNode(text)) this.renderNode(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (this.isExcludedNode(element)) return;
    for (const text of this.walkText(element)) this.renderNode(text);
  }

  private renderNode(node: Text): boolean {
    const text = node.data;
    if (!text) return false;
    const tokens = tokenizeText(text, this.lookup);
    if (!tokens.length) return false;
    replaceTextNode(
      node,
      groupTokens(text, tokens),
      this.settings.emoteScale,
      this.proxyImages,
    );
    return true;
  }

  private textRoots(message: Element): Element[] {
    const containers = this.descriptor.chat.text?.length
      ? queryAllFirst(message, this.descriptor.chat.text)
      : [];
    return containers.length ? containers : [message];
  }

  private collectTextNodes(roots: Element[]): Text[] {
    const result = new Set<Text>();
    for (const root of roots) {
      for (const text of this.walkText(root)) result.add(text);
    }
    return Array.from(result);
  }

  private walkText(root: Element): Text[] {
    const result: Text[] = [];
    const visit = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        if (text.data.trim()) result.push(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (element.classList.contains(EMOTE_CLASS)) return;
      if (element.classList.contains(PICKER_HOST_CLASS)) return;
      if (this.isExcludedElement(element)) return;
      for (const child of element.childNodes) visit(child);
    };
    visit(root);
    return result;
  }

  private findMessages(root: Element): Element[] {
    for (const selector of this.messages) {
      const found: Element[] = [];
      try {
        if (root.matches(selector)) found.push(root);
        root.querySelectorAll(selector).forEach((element) => found.push(element));
      } catch (error) {
        console.warn(`[emote-anywhere] invalid message selector "${selector}"`, error);
      }
      if (!found.length) continue;

      const candidates = new Set(found);
      return found.filter((element) => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (candidates.has(parent)) return false;
          if (parent === root) break;
        }
        return true;
      });
    }
    return [];
  }

  private findMessage(element: Element, roots: Element[]): Element | null {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (!roots.some((root) => root === current || root.contains(current))) break;
      ancestors.push(current);
    }
    for (const selector of this.messages) {
      let found: Element | null = null;
      for (const ancestor of ancestors) {
        if (matchesSelector(ancestor, selector)) found = ancestor;
      }
      if (found) return found;
    }
    return null;
  }

  private isSkipped(message: Element): boolean {
    if (!this.skipSelector) return false;
    return (
      matchesSelector(message, this.skipSelector) ||
      hasSelector(message, this.skipSelector)
    );
  }

  private isExcludedElement(element: Element): boolean {
    return matchesSelector(element, this.excludedSelector);
  }

  private isExcludedNode(node: Node): boolean {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element || this.isOurs(element)) return true;
    return closestSelector(element, this.excludedSelector) !== null;
  }

  private isOurs(node: Node): boolean {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!element?.closest(`.${EMOTE_CLASS}, .${PICKER_HOST_CLASS}`);
  }
}
