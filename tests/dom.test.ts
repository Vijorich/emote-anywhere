// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { h } from '../src/ui/dom';

describe('h', () => {
  it('binds onclick props as listeners, not attributes', () => {
    let clicks = 0;
    const button = h('button', { onclick: () => clicks++ });
    button.click();
    expect(clicks).toBe(1);
    expect(button.getAttribute('onclick')).toBeNull();
  });
});
