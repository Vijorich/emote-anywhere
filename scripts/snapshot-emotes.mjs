import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../registry/emotes/', import.meta.url));
const DEFAULT_SET = '01M5VFKKAQEH8WEF0N0PNRK2YP';
const ALLOWED_HOSTS = new Set([
  'cdn.7tv.app',
  'cdn.betterttv.net',
  'cdn.frankerfacez.com',
  'static-cdn.jtvnw.net',
]);
const PROVIDER_IDS = { 0: 'twitch', 1: '7tv', 2: 'bttv', 3: 'ffz' };

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error(`${url} is too large`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function apiFile(emote) {
  const host = emote?.data?.host;
  const files = host?.files;
  if (!Array.isArray(files) || !host?.url) return null;
  const base = String(host.url).startsWith('//') ? `https:${host.url}` : String(host.url);
  for (const name of ['2x.webp', '1x.webp', '2x.avif', '1x.avif', '2x.png', '1x.png']) {
    const file = files.find((item) => item?.name === name);
    if (file) return imageUrl(`${base.replace(/\/$/, '')}/${file.name}`);
  }
  const best = files.find((item) => item?.name);
  return best ? imageUrl(`${base.replace(/\/$/, '')}/${best.name}`) : null;
}

function normalizeSevenTv(body) {
  const seen = new Set();
  const emotes = [];
  for (const emote of body?.emotes ?? []) {
    const code = String(emote?.name ?? emote?.data?.name ?? '').trim();
    if (!code || code.length > 64 || /\s/.test(code) || seen.has(code)) continue;
    const url =
      apiFile(emote) ??
      (emote?.id ? imageUrl(`https://cdn.7tv.app/emote/${emote.id}/2x.webp`) : null);
    if (!url) continue;
    seen.add(code);
    emotes.push({
      code,
      url,
      flags: (emote?.flags ?? 0) | (emote?.data?.flags ?? 0),
    });
  }
  return emotes;
}

function normalizeMirror(body, expected) {
  const seen = new Set();
  const emotes = [];
  for (const item of Array.isArray(body) ? body : []) {
    const provider = PROVIDER_IDS[item?.provider] ?? expected;
    if (provider !== expected) continue;
    const code = String(item?.code ?? '').trim();
    if (!code || code.length > 64 || /\s/.test(code) || seen.has(code)) continue;
    const ranked = ['2x', '2', '1x', '1', '3x', '4x'];
    let url = null;
    for (const size of ranked) {
      const found = (item.urls ?? []).find((entry) => entry?.size === size && entry?.url);
      if (found) {
        url = imageUrl(found.url);
        if (url) break;
      }
    }
    if (!url) continue;
    seen.add(code);
    emotes.push({ code, url, flags: item.zero_width ? 256 : 0 });
  }
  return emotes;
}

async function writeSnapshot(file, label, provider, emotes, id) {
  if (!emotes.length) throw new Error(`${file}: no emotes, keeping the previous snapshot`);
  const path = `${root}${file}`;
  const signature = JSON.stringify({ provider, ...(id ? { id } : {}), name: label, emotes });
  try {
    const existing = JSON.parse(await readFile(path, 'utf8'));
    const previous = JSON.stringify({
      provider: existing?.provider,
      ...(existing?.id ? { id: existing.id } : {}),
      name: existing?.name,
      emotes: existing?.emotes,
    });
    if (previous === signature) {
      console.log(`${file}: unchanged`);
      return;
    }
  } catch {
    // The file does not exist or is invalid; write a fresh snapshot.
  }
  const body = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    provider,
    ...(id ? { id } : {}),
    name: label,
    emotes,
  };
  await writeFile(path, `${JSON.stringify(body)}\n`, 'utf8');
  console.log(`wrote ${file}: ${emotes.length} emotes`);
}

async function sevenTvSet(id) {
  try {
    const body = await fetchJson(`https://7tv.io/v3/emote-sets/${id}`);
    return normalizeSevenTv(body);
  } catch {
    return null;
  }
}

async function sevenTvGlobal() {
  try {
    const body = await fetchJson('https://7tv.io/v3/emote-sets/global');
    return normalizeSevenTv(body);
  } catch {
    for (const url of [
      'https://emotes.crippled.dev/v1/global/7tv',
      'https://emotes.adamcy.pl/v1/global/emotes/7tv',
    ]) {
      try {
        const body = await fetchJson(url);
        const emotes = normalizeMirror(body, '7tv');
        if (emotes.length) return emotes;
      } catch {
        // Try the next mirror.
      }
    }
    return null;
  }
}

async function twitchGlobal() {
  for (const url of [
    'https://emotes.crippled.dev/v1/global/twitch',
    'https://emotes.adamcy.pl/v1/global/emotes/twitch',
  ]) {
    try {
      const body = await fetchJson(url);
      const emotes = normalizeMirror(body, 'twitch');
      if (emotes.length) return emotes;
    } catch {
      // Try the next mirror.
    }
  }
  return null;
}

async function bttvGlobal() {
  try {
    const body = await fetchJson('https://api.betterttv.net/3/cached/emotes/global');
    return (Array.isArray(body) ? body : [])
      .map((item) => ({
        code: String(item?.code ?? '').trim(),
        url: item?.id ? imageUrl(`https://cdn.betterttv.net/emote/${item.id}/2x`) : null,
        flags: 0,
      }))
      .filter((item) => item.code && item.url);
  } catch {
    return null;
  }
}

async function ffzGlobal() {
  try {
    const body = await fetchJson('https://api.frankerfacez.com/v1/set/global');
    const sets = (body.default_sets ?? [])
      .map((id) => body.sets?.[String(id)])
      .filter(Boolean);
    const seen = new Set();
    const emotes = [];
    for (const set of sets) {
      for (const item of set.emoticons ?? []) {
        const code = String(item?.name ?? '').trim();
        if (!code || seen.has(code)) continue;
        const raw = item.urls?.['2'] ?? item.urls?.['1'] ?? item.urls?.['4'];
        const url = raw ? imageUrl(raw) : item.id ? imageUrl(`https://cdn.frankerfacez.com/emote/${item.id}/2`) : null;
        if (!url) continue;
        seen.add(code);
        emotes.push({ code, url, flags: 0 });
      }
    }
    return emotes;
  } catch {
    return null;
  }
}

await mkdir(root, { recursive: true });

const jobs = [
  ['7tv-global.json', '7TV global', '7tv', await sevenTvGlobal()],
  ['twitch-global.json', 'Twitch global', 'twitch', await twitchGlobal()],
  ['bttv-global.json', 'BetterTTV global', 'bttv', await bttvGlobal()],
  ['ffz-global.json', 'FrankerFaceZ global', 'ffz', await ffzGlobal()],
];

const defaultSet = await sevenTvSet(DEFAULT_SET);
if (defaultSet) {
  jobs.push([
    `7tv-set-${DEFAULT_SET}.json`,
    'emote everywhere default set',
    '7tv',
    defaultSet,
    DEFAULT_SET,
  ]);
}

let failed = false;
for (const [file, label, provider, emotes, id] of jobs) {
  try {
    if (!emotes) throw new Error(`${file}: source unavailable`);
    await writeSnapshot(file, label, provider, emotes, id);
  } catch (error) {
    failed = true;
    console.error(String(error instanceof Error ? error.message : error));
  }
}

if (failed && jobs.every(([, , emotes]) => !emotes)) process.exitCode = 1;
