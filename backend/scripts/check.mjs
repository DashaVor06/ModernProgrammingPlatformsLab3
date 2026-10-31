/**
 * Automated static code check (Lab 3, point 5).
 *
 * Walks every JavaScript file under `src/` and `tests/` and runs Node's
 * built-in syntax/parse check (`node --check`). The process exits with a
 * non-zero code when any file fails, so it can gate CI pipelines and hooks.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const targets = ['src', 'tests'];

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(fullPath, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(fullPath);
    }
  }
  return out;
}

const files = targets.flatMap((t) => collect(join(root, t), []));
let failures = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const rel = relative(root, file);
  if (result.status === 0) {
    console.log(`\u2713 ${rel}`);
  } else {
    failures += 1;
    console.error(`\u2717 ${rel}`);
    if (result.stderr) console.error(result.stderr);
  }
}

console.log(`\nChecked ${files.length} file(s), ${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
