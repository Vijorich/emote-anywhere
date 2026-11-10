import { beforeEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({
  isProviderBlocked: vi.fn(async () => false),
  recordProviderFailure: vi.fn(async () => undefined),
  recordProviderSuccess: vi.fn(async () => undefined),
}));
vi.mock('../src/core/emotes/health', () => health);

import { fetchProviderJson } from '../src/core/emotes/http';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  health.isProviderBlocked.mockReset().mockResolvedValue(false);
  health.recordProviderFailure.mockReset().mockResolvedValue(undefined);
  health.recordProviderSuccess.mockReset().mockResolvedValue(undefined);
});

describe('provider HTTP client', () => {
  it('retries a transient server error once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'down' }, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderJson('https://provider.test/a')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(health.recordProviderSuccess).toHaveBeenCalled();
  });

  it('does not retry a client error and does not trip the circuit', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'not found' }, 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderJson('https://provider.test/a')).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health.recordProviderFailure).not.toHaveBeenCalled();
  });

  it('reports an open circuit without fetching', async () => {
    health.isProviderBlocked.mockResolvedValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderJson('https://provider.test/a')).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
