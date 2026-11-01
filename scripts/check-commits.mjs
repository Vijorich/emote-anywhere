import { execFileSync } from 'node:child_process';

// Validates Conventional Commit subjects in a git range. Subjects decide the
// next version (feat -> minor, fix -> patch, !/BREAKING CHANGE -> major), so
// CI rejects anything release-please cannot read. Merge commits and fixup!
// markers are skipped.
const range = process.argv[2];
if (!range) {
  console.error('usage: node scripts/check-commits.mjs <range>   e.g. origin/main..HEAD');
  process.exit(1);
}

let subjects;
try {
  subjects = execFileSync('git', ['log', '--no-merges', '--format=%s', range], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .split('\n')
    .filter(Boolean);
} catch (error) {
  console.error(`error: could not read range "${range}": ${error.message}`);
  process.exit(1);
}

const TYPES = '(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)';
const SUBJECT_RE = new RegExp(`^${TYPES}(\\([a-z0-9._-]+\\))?!?: .{1,72}$`);
const FIXUP_RE = /^(fixup|squash)!/;

const bad = subjects.filter((subject) => !FIXUP_RE.test(subject) && !SUBJECT_RE.test(subject));

if (!subjects.length) {
  console.log('ok: no commits to check');
} else if (bad.length) {
  console.error(`error: ${bad.length} commit subject(s) do not follow Conventional Commits:`);
  for (const subject of bad) console.error(`  ${subject}`);
  console.error('');
  console.error('Use: type[(scope)][!]: summary (max 72 characters).');
  console.error(`Types: ${TYPES.slice(1, -1)}.`);
  console.error('Versions come from these types: feat -> minor, fix -> patch,');
  console.error('!/BREAKING CHANGE -> major, everything else -> no release.');
  process.exit(1);
} else {
  console.log(`ok: ${subjects.length} commit subject(s) follow Conventional Commits`);
}
