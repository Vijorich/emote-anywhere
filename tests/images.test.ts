import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../src/core/rpc', () => ({ rpc: rpcMock }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function imageResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'image/png' },
  });
}

beforeEach(() => {
  vi.resetModules();
  rpcMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('background image proxy', () => {
  it('rejects untrusted hosts before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchImageAsDataUrl } = await import('../src/background/images');

    await expect(fetchImageAsDataUrl('https://evil.test/x.png')).rejects.toThrow(
      'Image host is not allowed',
    );
    await expect(fetchImageAsDataUrl('http://cdn.7tv.app/x.png')).rejects.toThrow(
      'Image host is not allowed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates same-URL requests and preserves streamed bytes', async () => {
    const response = deferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchImageAsDataUrl } = await import('../src/background/images');
    const url = 'https://cdn.7tv.app/same.png';

    const first = fetchImageAsDataUrl(url);
    const second = fetchImageAsDataUrl(url);
    expect(fetchMock).toHaveBeenCalledOnce();
    response.resolve(imageResponse([0, 1, 2, 255]));

    const expected = { dataUrl: 'data:image/png;base64,AAEC/w==' };
    expect(await first).toEqual(expected);
    expect(await second).toEqual(expected);
  });

  it('stops reading and cancels an oversized streamed response', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(2 * 1024 * 1024) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(2 * 1024 * 1024) })
        .mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    const arrayBuffer = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: { getReader: () => reader },
      arrayBuffer,
    } as unknown as Response;
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchImageAsDataUrl } = await import('../src/background/images');

    await expect(fetchImageAsDataUrl('https://cdn.7tv.app/large.png')).rejects.toThrow(
      'Image is too large',
    );
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('evicts data URLs when the 32 MiB byte budget is exceeded', async () => {
    const encoded = 'x'.repeat(12 * 1024 * 1024);
    vi.stubGlobal('btoa', vi.fn(() => encoded));
    const fetchMock = vi.fn(async () => imageResponse([1]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchImageAsDataUrl } = await import('../src/background/images');
    const url = (name: string) => `https://cdn.7tv.app/${name}.png`;

    for (const name of ['a', 'b', 'c']) await fetchImageAsDataUrl(url(name));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await fetchImageAsDataUrl(url('b'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await fetchImageAsDataUrl(url('a'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('content image fallback', () => {
  it('evicts data URLs when the 32 MiB byte budget is exceeded', async () => {
    const a = `data:image/png;base64,${'a'.repeat(17 * 1024 * 1024)}`;
    const b = `data:image/png;base64,${'b'.repeat(17 * 1024 * 1024)}`;
    const aUrl = 'https://cdn.7tv.app/a.png';
    const bUrl = 'https://cdn.7tv.app/b.png';
    rpcMock.mockImplementation(async (_type: string, payload: { url: string }) => ({
      dataUrl: payload.url === aUrl ? a : b,
    }));
    const { proxiedImage } = await import('../src/engine/image-fallback');

    expect(await proxiedImage(aUrl)).toBe(a);
    expect(await proxiedImage(bUrl)).toBe(b);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(await proxiedImage(bUrl)).toBe(b);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(await proxiedImage(aUrl)).toBe(a);
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });
});
