/**
 * Runs spellcheck/check_spelling.py against the active tree_data version (public/tree_data/versions.json).
 * Uses PYTHON env var if set, otherwise "python" (Windows) — override with PYTHON=python3 on Unix if needed.
 * Passes -B so Python does not write __pycache__ / .pyc when importing py/tree_data_loader.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const versionsPath = join(repoRoot, 'public', 'tree_data', 'versions.json');
let versions;
try {
  versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
} catch (e) {
  console.error('spellcheck: could not read', versionsPath, e.message);
  process.exit(1);
}

if (!Array.isArray(versions) || versions.length === 0) {
  console.error('spellcheck: public/tree_data/versions.json has no versions');
  process.exit(1);
}

const active = versions.find((v) => v.is_active) ?? versions[0];
const dataDir = join(repoRoot, 'public', 'tree_data', `${active.major}_${active.minor}`);

const py = process.env.PYTHON || 'python';
const script = join(repoRoot, 'spellcheck', 'check_spelling.py');

const result = spawnSync(py, ['-B', script, dataDir], {
  stdio: 'inherit',
  cwd: repoRoot,
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === 0 ? 0 : 1);
