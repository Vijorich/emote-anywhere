import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/changelog-section.mjs <version>');
  process.exit(2);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}

const body = [];
for (let index = start + 1; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^## \[/.test(line) || /^\[[^\]]+\]: /.test(line)) break;
  body.push(line);
}

const text = body.join('\n').trim();
if (!text) {
  console.error(`CHANGELOG.md section for ${version} is empty`);
  process.exit(1);
}

process.stdout.write(`${text}\n`);
