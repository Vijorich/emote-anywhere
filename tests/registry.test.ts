import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRegistryIndex } from '../src/core/validate';

function load(path: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
}

describe('shipped registries', () => {
  it('parses the default registry', () => {
    const registry = parseRegistryIndex(load('../registry/index.json'));
    const vk = registry.plugins.find((plugin) => plugin.id === 'vk');
    expect(vk).toBeDefined();
    expect(vk?.matches).toContain('https://vk.ru/*');
    expect(vk?.chat.messages).toContain('.ConvoHistory__messageWrapper');
    expect(vk?.proxyImages).toBe(true);
  });

  it('parses the local development registry', () => {
    const registry = parseRegistryIndex(load('../registry/dev.json'));
    expect(registry.plugins[0]?.id).toBe('mock');
  });
});
