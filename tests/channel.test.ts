import { describe, expect, it } from 'vitest';
import { resolveChannel, resolveChannelRule } from '../src/core/channel';
import type { ChannelRule } from '../src/core/types';

const noDoc = null as unknown as Document;

describe('channel rules', () => {
  it('reads URL parameters', () => {
    const rule: ChannelRule = { from: 'urlParam', param: 'sel' };
    expect(resolveChannelRule(rule, noDoc, 'https://vk.com/im?sel=c1')).toBe('c1');
    expect(resolveChannelRule(rule, noDoc, 'https://vk.com/im')).toBeUndefined();
  });

  it('matches regex rules against the bounded URL prefix', () => {
    const rule: ChannelRule = { from: 'urlRegex', regex: '\\?sel=([a-z0-9]+)' };
    expect(resolveChannelRule(rule, noDoc, 'https://vk.com/im?sel=abc&tab=1')).toBe('abc');
    const longHref = `https://vk.com/im?sel=abc&pad=${'x'.repeat(2000)}`;
    expect(resolveChannelRule(rule, noDoc, longHref)).toBe('abc');
  });

  it('does not match a group that only closes beyond the URL cap', () => {
    const rule: ChannelRule = { from: 'urlRegex', regex: 'end-([a-z]+)$' };
    const longHref = `https://vk.com/${'x'.repeat(600)}end-value`;
    expect(resolveChannelRule(rule, noDoc, longHref)).toBeUndefined();
  });

  it('tries rules in order and falls through', () => {
    const rules: ChannelRule[] = [
      { from: 'urlParam', param: 'sel' },
      { from: 'constant', value: 'fallback' },
    ];
    expect(resolveChannel(rules, noDoc, 'https://vk.com/im?sel=c1')).toBe('c1');
    expect(resolveChannel(rules, noDoc, 'https://vk.com/im')).toBe('fallback');
  });
});
