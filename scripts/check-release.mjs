import { readFile, access } from 'node:fs/promises';

const failures = [];
const notes = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  failures.push(`package.json version is not semver: ${pkg.version}`);
}

const changelog = await readFile('CHANGELOG.md', 'utf8').catch(() => '');
if (!changelog.includes(`## [${pkg.version}]`)) {
  failures.push(`CHANGELOG.md has no entry for ${pkg.version}`);
}

const env = await readFile('.env.production', 'utf8').catch(() => '');
const registry = /^WXT_DEFAULT_REGISTRY_URL=(.+)$/m.exec(env)?.[1]?.trim() ?? '';
if (!registry) {
  failures.push('WXT_DEFAULT_REGISTRY_URL is missing from .env.production');
} else if (registry.includes('.invalid') || registry.includes('localhost')) {
  failures.push(`Production registry is not public: ${registry}`);
} else {
  try {
    const response = await fetch(registry, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) failures.push(`Registry returned HTTP ${response.status}: ${registry}`);
    else {
      const index = await response.json();
      if (index?.schemaVersion !== 1 || !Array.isArray(index.plugins) || !index.plugins.length) {
        failures.push('Registry does not look like a non-empty schemaVersion 1 index.');
      } else {
        notes.push(`Registry: ${registry} (${index.plugins.length} plugin(s))`);
      }
    }
  } catch (error) {
    failures.push(`Registry is unreachable: ${error instanceof Error ? error.message : error}`);
  }
}

for (const icon of [16, 32, 48, 128]) {
  if (!(await exists(`public/icon-${icon}.png`))) failures.push(`Missing public/icon-${icon}.png`);
}
for (const file of ['LICENSE', 'PRIVACY.md', 'README.md']) {
  if (!(await exists(file))) failures.push(`Missing ${file}`);
}

const wxt = await readFile('wxt.config.ts', 'utf8').catch(() => '');
if (wxt.includes('emote-anywhere@local')) {
  failures.push('Firefox ID is still the local placeholder. Set a permanent ID before release.');
}

const project = 'https://github.com/Vijorich/emote-anywhere';
try {
  const response = await fetch(project, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) failures.push(`Project URL returned HTTP ${response.status}: ${project}`);
  else notes.push(`Project: ${project}`);
} catch (error) {
  failures.push(`Project URL is unreachable: ${error instanceof Error ? error.message : error}`);
}

notes.unshift(`Version: ${pkg.version}`);
for (const note of notes) console.log(`ok: ${note}`);
if (failures.length) {
  for (const failure of failures) console.error(`error: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Release checks passed.');
}
