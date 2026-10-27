import { browser } from 'wxt/browser';
import { FRAME_CONTEXT_KEY, FRAME_CONTEXT_TTL_MS } from '../core/config';
import type { ContentContext, FrameContext } from '../core/types';

const contexts = new Map<string, FrameContext>();
let hydrated = false;
let hydration: Promise<void> | null = null;

function key(tabId: number, frameId: number): string {
  return `${tabId}:${frameId}`;
}

function isFrameContext(value: unknown): value is FrameContext {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FrameContext>;
  return (
    typeof entry.tabId === 'number' &&
    typeof entry.frameId === 'number' &&
    typeof entry.pluginKey === 'string' &&
    typeof entry.channelKey === 'string' &&
    typeof entry.url === 'string' &&
    (entry.sevenTvId === undefined || typeof entry.sevenTvId === 'string') &&
    typeof entry.updatedAt === 'number'
  );
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (!hydration) {
    hydration = (async () => {
      try {
        const session = browser.storage?.session;
        if (!session) return;
        const stored = (await session.get(FRAME_CONTEXT_KEY))[FRAME_CONTEXT_KEY];
        if (Array.isArray(stored)) {
          for (const entry of stored) {
            if (isFrameContext(entry)) contexts.set(key(entry.tabId, entry.frameId), entry);
          }
        }
        if (prune()) persist();
      } catch {
        // Session storage is optional; the in-memory map still works.
      } finally {
        hydrated = true;
      }
    })();
  }
  await hydration;
}

function persist(): void {
  const session = browser.storage?.session;
  if (!session) return;
  void session
    .set({ [FRAME_CONTEXT_KEY]: Array.from(contexts.values()) })
    .catch(() => undefined);
}

function prune(now = Date.now()): boolean {
  let changed = false;
  for (const [entryKey, entry] of contexts) {
    if (now - entry.updatedAt >= FRAME_CONTEXT_TTL_MS) {
      contexts.delete(entryKey);
      changed = true;
    }
  }
  return changed;
}

export async function rememberFrameContext(
  tabId: number,
  frameId: number,
  context: ContentContext,
): Promise<void> {
  await hydrate();
  contexts.set(key(tabId, frameId), {
    ...context,
    tabId,
    frameId,
    updatedAt: Date.now(),
  });
  prune();
  persist();
}

export async function forgetFrameContext(tabId: number, frameId: number): Promise<void> {
  await hydrate();
  if (!contexts.delete(key(tabId, frameId))) return;
  persist();
}

export async function forgetTab(tabId: number): Promise<void> {
  await hydrate();
  const prefix = `${tabId}:`;
  let changed = false;
  for (const entryKey of contexts.keys()) {
    if (entryKey.startsWith(prefix)) {
      contexts.delete(entryKey);
      changed = true;
    }
  }
  if (changed) persist();
}

export async function listFrameContexts(tabId: number): Promise<FrameContext[]> {
  await hydrate();
  if (prune()) persist();
  return Array.from(contexts.values())
    .filter((context) => context.tabId === tabId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

/** Clears all frame contexts between tests. */
export async function clearFrameContexts(): Promise<void> {
  await hydrate();
  contexts.clear();
  persist();
}
