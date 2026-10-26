const PATTERN_RE = /^(\*|https?):\/\/(\*|\*\.[^/*:]+|[^/*:]+)\/(.*)$/;
const regexCache = new Map<string, RegExp>();

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): string {
  return glob.split('*').map(escapeRegex).join('.*');
}

export function isValidMatchPattern(pattern: string): boolean {
  if (typeof pattern !== 'string' || pattern.length > 2048) return false;
  const match = PATTERN_RE.exec(pattern);
  if (!match) return false;
  const host = match[2] ?? '';
  if (host === '*.') return false;
  if (host.includes('*') && host !== '*' && !host.startsWith('*.')) return false;
  return true;
}

export function matchPatternToRegex(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) return cached;

  const match = PATTERN_RE.exec(pattern);
  if (!match) throw new Error(`Invalid match pattern: ${pattern}`);
  const [, scheme = '*', host = '*', path = '*'] = match;

  const schemeRe = scheme === '*' ? 'https?' : escapeRegex(scheme);
  const hostRe =
    host === '*'
      ? '[^/]+'
      : host.startsWith('*.')
        ? `(?:[^/]+\\.)?${escapeRegex(host.slice(2))}`
        : escapeRegex(host);
  const pathRe = globToRegex(path);

  const regex = new RegExp(`^${schemeRe}://${hostRe}/${pathRe}$`, 'i');
  if (regexCache.size > 500) regexCache.clear();
  regexCache.set(pattern, regex);
  return regex;
}

/** Chrome match patterns are matched against pathname, without query or hash. */
export function urlMatches(url: string, pattern: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // Chrome match patterns ignore ports.
  const target = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  return matchPatternToRegex(pattern).test(target);
}

export function urlMatchesAny(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => urlMatches(url, pattern));
}

/** Rough specificity: more literal characters and an explicit priority win. */
export function matchSpecificity(patterns: string[], priority = 0): number {
  let score = priority * 1000;
  for (const pattern of patterns) {
    score += pattern.replace(/[*?]/g, '').length;
  }
  return score;
}
