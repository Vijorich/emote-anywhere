import type { AppSettings, Emote, PluginDescriptor } from '../core/types';
import { closestAny, hasAnyDescendant, matchesAny, queryAllFirst } from './dom';
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
  emotes: Emote[];
  settings: Pick<AppSettings, 'globalMode' | 'emoteScale'>;
}

export class ChatEngine {
  private readonly descriptor: PluginDescriptor;
  private readonly settings: Pick<AppSettings, 'globalMode' | 'emoteScale'>;
  private readonly lookup: Map<string, Emote>;
  private readonly excludedSelectors: string[];
  private readonly proxyImages: boolean;
  private readonly snapshots = new WeakMap<Element, string>();
  private readonly pendingMessages = new Set<Element>();
  private readonly pendingNodes = new Set<Node>();
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  private stopped = true;

  constructor(options: ChatEngineOptions) {
    this.descriptor = options.descriptor;
    this.settings = options.settings;
    this.lookup = new Map(options.emotes.map((emote) => [emote.code, emote]));
    this.proxyImages = this.descriptor.proxyImages === true;
    this.excludedSelectors = [BASE_EXCLUDED, ...(this.descriptor.chat.exclude ?? [])];
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.restoreAll();
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    if (this.settings.globalMode) {
      this.processGlobalNode(document.body);
    } else {
      for (const root of this.chatRoots()) {
        for (const message of this.findMessages(root)) this.processMessage(message);
      }
    }
  }

  stop(): void {
    const wasRunning = !this.stopped;
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    if (wasRunning) this.restoreAll();
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingMessages.clear();
    this.pendingNodes.clear();
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
    for (const root of this.chatRoots()) restoreEmotes(root);
  }

  private onMutations(records: MutationRecord[]): void {
    if (this.stopped) return;
    const roots = this.settings.globalMode ? [] : this.chatRoots();
    for (const record of records) {
      if (this.isOurs(record.target)) continue;
      if (record.type === 'characterData') {
        this.enqueue(record.target, roots);
        continue;
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE && this.isOurs(node)) continue;
        this.enqueue(node, roots);
      }
    }
    this.schedule();
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
      this.timer !== null ||
      (!this.pendingMessages.size && !this.pendingNodes.size)
    ) {
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 40);
  }

  private flush(): void {
    if (this.stopped) return;
    const messages = Array.from(this.pendingMessages);
    const nodes = Array.from(this.pendingNodes);
    this.pendingMessages.clear();
    this.pendingNodes.clear();
    for (const message of messages) this.processMessage(message);
    for (const node of nodes) this.processGlobalNode(node);
  }

  private processMessage(message: Element): void {
    if (this.stopped || !message.isConnected || this.isSkipped(message)) return;
    const roots = this.textRoots(message);
    const sources = roots.map((root) =>
      readSource(root, (element) => this.isExcludedElement(element)),
    );
    const before = JSON.stringify(sources);
    const previous = this.snapshots.get(message);

    if (previous === before) {
      // React may replace our spans with identical plain text. The source
      // snapshot is unchanged, but the rendered emotes are gone.
      const hasRendered = message.querySelector(`.${EMOTE_CLASS}`) !== null;
      if (hasRendered || !sources.some((source) => tokenizeText(source, this.lookup).length)) {
        return;
      }
    }
    if (previous !== undefined) restoreEmotes(message);

    for (const node of this.collectTextNodes(roots)) this.renderNode(node);
    this.snapshots.set(message, before);
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

  private renderNode(node: Text): void {
    const text = node.data;
    if (!text) return;
    const tokens = tokenizeText(text, this.lookup);
    if (!tokens.length) return;
    replaceTextNode(
      node,
      groupTokens(text, tokens),
      this.settings.emoteScale,
      this.proxyImages,
    );
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
      for (const child of Array.from(element.childNodes)) visit(child);
    };
    visit(root);
    return result;
  }

  private chatRoots(): Element[] {
    const roots = this.descriptor.chat.roots;
    if (!roots?.length) return [document.body];
    const found = queryAllFirst(document, roots);
    return found.length ? found : [document.body];
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
        if (matchesAny(ancestor, [selector])) found = ancestor;
      }
      if (found) return found;
    }
    return null;
  }

  private isSkipped(message: Element): boolean {
    const skip = this.descriptor.chat.skip;
    if (!skip?.length) return false;
    return matchesAny(message, skip) || hasAnyDescendant(message, skip);
  }

  private isExcludedElement(element: Element): boolean {
    return matchesAny(element, this.excludedSelectors);
  }

  private isExcludedNode(node: Node): boolean {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!element || this.isOurs(element)) return true;
    return closestAny(element, this.excludedSelectors) !== null;
  }

  private isOurs(node: Node): boolean {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!element?.closest(`.${EMOTE_CLASS}, .${PICKER_HOST_CLASS}`);
  }
}
