import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { storage: { session: storage } },
}));

beforeEach(() => {
  vi.resetModules();
  storage.data = {};
  storage.get.mockReset().mockImplementation(async (key: string) => ({ [key]: storage.data[key] }));
  storage.set.mockReset().mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(storage.data, values);
  });
});

describe('frame context registry', () => {
  it('restores contexts from session storage after a worker restart', async () => {
    const first = await import('../src/background/contexts');
    await first.rememberFrameContext(7, 2, {
      pluginKey: 'default:vk',
      channelKey: 'chat-1',
      url: 'https://vk.com/im?sel=1',
    });

    vi.resetModules();
    const second = await import('../src/background/contexts');
    expect(await second.listFrameContexts(7)).toEqual([
      expect.objectContaining({ tabId: 7, frameId: 2, channelKey: 'chat-1' }),
    ]);
  });

  it('forgets one frame and all frames in a tab', async () => {
    const contexts = await import('../src/background/contexts');
    const context = {
      pluginKey: 'p',
      channelKey: 'c',
      url: 'https://example.com/',
    };
    await contexts.rememberFrameContext(7, 2, context);
    await contexts.rememberFrameContext(7, 3, context);

    await contexts.forgetFrameContext(7, 2);
    expect(await contexts.listFrameContexts(7)).toHaveLength(1);

    await contexts.forgetTab(7);
    expect(await contexts.listFrameContexts(7)).toEqual([]);
  });
});
