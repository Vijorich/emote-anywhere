// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDescriptor } from '../src/core/types';

vi.mock('wxt/browser', () => ({ browser: {} }));
vi.mock('wxt/utils/define-unlisted-script', () => ({ defineUnlistedScript: () => ({}) }));

import { hasChatSurface } from '../src/entrypoints/chat';

function descriptor(roots?: string[]): PluginDescriptor {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    matches: ['https://example.com/*'],
    chat: {
      ...(roots ? { roots } : {}),
      messages: ['.msg'],
      channel: { from: 'constant', value: 'chan' },
    },
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('hasChatSurface', () => {
  it('detects the configured chat root', () => {
    document.body.innerHTML = `<div id="chat"></div>`;
    expect(hasChatSurface(descriptor(['#chat']))).toBe(true);
  });

  it('accepts message markup when the root selector is missing', () => {
    document.body.innerHTML = `<div class="msg">hello</div>`;
    expect(hasChatSurface(descriptor(['#missing']))).toBe(true);
  });

  it('rejects frames without any chat markup', () => {
    document.body.innerHTML = `<div id="media"></div>`;
    expect(hasChatSurface(descriptor(['#chat']))).toBe(false);
  });

  it('does not gate adapters without configured roots', () => {
    document.body.innerHTML = `<div id="media"></div>`;
    expect(hasChatSurface(descriptor())).toBe(true);
  });
});
