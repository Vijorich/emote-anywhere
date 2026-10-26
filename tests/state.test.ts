import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_STATE_BYTES, STATE_KEY } from '../src/core/config';
import type { AppState } from '../src/core/types';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: storage } },
}));

import { createDefaultState, getState, mutateState } from '../src/core/state';

function mockStorage(initial: Record<string, unknown> = {}): () => Record<string, unknown> {
  let values = structuredClone(initial);
  storage.get.mockImplementation(async (key: string) => ({ [key]: values[key] }));
  storage.set.mockImplementation(async (update: Record<string, unknown>) => {
    values = { ...values, ...structuredClone(update) };
  });
  return () => values;
}

beforeEach(() => {
  storage.get.mockReset();
  storage.set.mockReset();
});

describe('state storage', () => {
  it('creates independent nested defaults', () => {
    const changed = createDefaultState();
    const pristine = createDefaultState();

    changed.settings.providers.ffz = false;
    changed.globalBinding.sets.length = 0;

    expect(pristine.settings.providers.ffz).toBe(true);
    expect(pristine.globalBinding.sets).toHaveLength(1);
  });

  it('returns defaults without writing when storage is empty', async () => {
    const stored = mockStorage();

    const state = await getState();

    expect(state).toEqual(createDefaultState());
    expect(storage.get).toHaveBeenCalledWith(STATE_KEY);
    expect(storage.set).not.toHaveBeenCalled();
    expect(stored()[STATE_KEY]).toBeUndefined();
  });

  it('rejects when storage cannot be read, without writing defaults', async () => {
    storage.get.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(getState()).rejects.toThrow('Could not read extension state');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('does not write when a mutation cannot read the existing state', async () => {
    storage.get.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(mutateState((state) => state)).rejects.toThrow('Could not read extension state');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('serializes concurrent mutations without losing updates', async () => {
    const stored = mockStorage({ [STATE_KEY]: createDefaultState() });
    let active = 0;
    let maxActive = 0;

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        mutateState(async (state) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await Promise.resolve();
          state.customSets.push({
            id: `set-${index}`,
            name: `Set ${index}`,
            enabled: true,
            emotes: [
              {
                code: `emote${index}`,
                url: `https://cdn.example/${index}.png`,
              },
            ],
          });
          active -= 1;
          return index;
        }),
      ),
    );

    expect(results.map(({ result }) => result)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(maxActive).toBe(1);
    const saved = stored()[STATE_KEY] as AppState;
    expect(saved.customSets.map(({ id }) => id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `set-${i}`),
    );
  });

  it('rejects a mutation that exceeds the state size guard', async () => {
    mockStorage({ [STATE_KEY]: createDefaultState() });
    const huge = 'x'.repeat(MAX_STATE_BYTES + 1);

    await expect(
      mutateState((state) => {
        state.customSets.push({
          id: 'huge',
          name: 'Huge',
          enabled: true,
          emotes: [{ code: 'huge', url: `data:image/png;base64,${huge}` }],
        });
      }),
    ).rejects.toThrow('too large');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('propagates failed writes and allows the next mutation to proceed', async () => {
    const stored = mockStorage({ [STATE_KEY]: createDefaultState() });
    storage.set.mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(
      mutateState((state) => {
        state.settings.globalMode = true;
      }),
    ).rejects.toThrow('quota exceeded');

    await mutateState((state) => {
      state.settings.autoChannel = false;
    });

    const saved = stored()[STATE_KEY] as AppState;
    expect(saved.settings.globalMode).toBe(false);
    expect(saved.settings.autoChannel).toBe(false);
  });
});
