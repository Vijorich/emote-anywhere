import type { ChannelRule } from './types';

// Registry regexes are length-capped and star-height checked (validate.ts), but
// a rule can still be polynomial; matching only a bounded URL prefix keeps the
// worst case constant regardless of the page URL length.
const MAX_HREF_CHARS = 500;

function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return undefined;
  return trimmed;
}

export function resolveChannelRule(
  rule: ChannelRule,
  doc: Document,
  href: string,
): string | undefined {
  switch (rule.from) {
    case 'urlParam': {
      try {
        return clean(new URL(href).searchParams.get(rule.param));
      } catch {
        return undefined;
      }
    }
    case 'urlRegex': {
      try {
        const subject = href.length > MAX_HREF_CHARS ? href.slice(0, MAX_HREF_CHARS) : href;
        const match = subject.match(new RegExp(rule.regex));
        if (!match) return undefined;
        const index = rule.group ?? (match.length > 1 ? 1 : 0);
        return clean(match[index]);
      } catch {
        return undefined;
      }
    }
    case 'dom': {
      try {
        return clean(doc.querySelector(rule.selector)?.getAttribute(rule.attribute));
      } catch {
        return undefined;
      }
    }
    case 'constant':
      return clean(rule.value);
  }
}

export function resolveChannel(
  rules: ChannelRule | ChannelRule[],
  doc: Document,
  href: string,
): string | undefined {
  const list = Array.isArray(rules) ? rules : [rules];
  for (const rule of list) {
    const value = resolveChannelRule(rule, doc, href);
    if (value) return value;
  }
  return undefined;
}

export function bindingKey(pluginKeyValue: string, channelKey: string): string {
  return `${pluginKeyValue}|${channelKey}`;
}

export function safeChannelKey(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'default';
  return trimmed.slice(0, 200);
}
