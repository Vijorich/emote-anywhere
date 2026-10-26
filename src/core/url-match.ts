const PATTERN_RE = /^(\*|https?):\/\/(\*|\*\.[^/*:]+|[^/*:]+)\/(.*)$/;
const regexCache = new Map<string, RegExp>();

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): string {
  return glob.split('*').map(escapeRegex).join('.*');
}

function escapeRegexInsensitive(value: string): string {
  return escapeRegex(value).replace(
    /[a-z]/gi,
    (char) => `[${char.toLowerCase()}${char.toUpperCase()}]`,
  );
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

  const schemeRe =
    scheme === '*' ? `${escapeRegexInsensitive('https')}?` : escapeRegexInsensitive(scheme);
  const hostRe =
    host === '*'
      ? '[^/]+'
      : host.startsWith('*.')
        ? `(?:[^/]+\\.)?${escapeRegexInsensitive(host.slice(2))}`
        : escapeRegexInsensitive(host);
  const pathRe = globToRegex(path);

  const regex = new RegExp(`^${schemeRe}://${hostRe}/${pathRe}$`);
  if (regexCache.size > 500) regexCache.clear();
  regexCache.set(pattern, regex);
  return regex;
}

/** WebExtension match patterns use pathname and search, but not hash. */
export function urlMatches(url: string, pattern: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // WebExtension match patterns ignore ports.
  const target = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`;
  return matchPatternToRegex(pattern).test(target);
}

export function urlMatchesAny(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => urlMatches(url, pattern));
}

const PRIORITY_WEIGHT = 20 * 2048 + 1;

function literalScore(pattern: string): number {
  return pattern.replace(/[*?]/g, '').length;
}

/** Rough specificity: more literal characters and an explicit priority win. */
export function matchSpecificity(patterns: string[], priority = 0, url?: string): number {
  const candidates =
    url === undefined ? patterns : patterns.filter((pattern) => urlMatches(url, pattern));
  const patternScore =
    url === undefined
      ? candidates.reduce((score, pattern) => score + literalScore(pattern), 0)
      : Math.max(0, ...candidates.map(literalScore));
  return priority * PRIORITY_WEIGHT + patternScore;
}
