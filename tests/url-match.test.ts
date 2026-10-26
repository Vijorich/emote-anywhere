import { describe, expect, it } from 'vitest';
import {
  isValidMatchPattern,
  matchSpecificity,
  urlMatches,
  urlMatchesAny,
} from '../src/core/url-match';

describe('match patterns', () => {
  it('accepts normal patterns', () => {
    expect(isValidMatchPattern('https://vk.com/*')).toBe(true);
    expect(isValidMatchPattern('*://*.vk.com/*')).toBe(true);
    expect(isValidMatchPattern('http://localhost/*')).toBe(true);
  });

  it('rejects malformed patterns', () => {
    expect(isValidMatchPattern('vk.com')).toBe(false);
    expect(isValidMatchPattern('https://vk.com')).toBe(false);
    expect(isValidMatchPattern('https://*.com/*')).toBe(true);
    expect(isValidMatchPattern('file:///*')).toBe(false);
    expect(isValidMatchPattern('https://vk.com:443/*')).toBe(false);
  });

  it('matches hosts and subdomains', () => {
    expect(urlMatches('https://vk.com/im?sel=1', 'https://vk.com/*')).toBe(true);
    expect(urlMatches('https://im.vk.com/foo', 'https://*.vk.com/*')).toBe(true);
    expect(urlMatches('https://vk.com.evil.test/', 'https://*.vk.com/*')).toBe(false);
    expect(urlMatches('https://example.com/', '*://*/*')).toBe(true);
    expect(urlMatches('http://example.com/', '*://*/*')).toBe(true);
    expect(urlMatches('http://localhost:8788/chat', 'http://localhost/*')).toBe(true);
    expect(urlMatches('https://example.com:8443/chat', 'https://example.com/*')).toBe(true);
  });

  it('ignores query and hash like Chrome match patterns', () => {
    expect(urlMatches('https://example.com/chat?x=1#y', 'https://example.com/chat')).toBe(true);
  });

  it('merges multiple patterns', () => {
    expect(
      urlMatchesAny('https://example.com/a', ['https://other.test/*', 'https://example.com/*']),
    ).toBe(true);
  });

  it('scores literal patterns higher', () => {
    expect(matchSpecificity(['https://vk.com/*'])).toBeGreaterThan(
      matchSpecificity(['*://*/*']),
    );
    expect(matchSpecificity(['*://*/*'], 10)).toBeGreaterThan(
      matchSpecificity(['https://vk.com/*']),
    );
  });
});
