// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { trackFocusModality } from '../src/ui/focus-modality';

trackFocusModality();

describe('focus modality', () => {
  afterEach(() => {
    document.documentElement.classList.remove('input-pointer');
  });

  it('skips the keyboard ring after pointer input until Tab', () => {
    document.dispatchEvent(new Event('pointerdown'));
    expect(document.documentElement.classList.contains('input-pointer')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(document.documentElement.classList.contains('input-pointer')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.documentElement.classList.contains('input-pointer')).toBe(false);
  });
});
