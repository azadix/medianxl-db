/**
 * Spellcheck skill text against spelling-dict.txt + ignore-dict.txt.
 * Used by Vitest (tests/data/spellcheck.test.js).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SPELLCHECK_DIR = __dirname;
export const REPO_ROOT = join(__dirname, '..', '..');

function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((x) => (x == null ? '' : String(x))).join('\n');
  return String(value);
}

function loadWordSet(filePath) {
  const words = new Set();
  if (!existsSync(filePath)) return words;
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
    const word = line.trim().toLowerCase();
    if (word && !word.startsWith('#')) words.add(word);
  }
  return words;
}

/**
 * Extract words, ignoring {{...}}, [[...]], and <<...>> placeholders.
 * @param {string} text
 * @returns {string[]}
 */
export function extractWords(text) {
  if (!text) return [];
  let cleaned = String(text);
  cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, '');
  cleaned = cleaned.replace(/\[\[[^\]]*\]\]/g, '');
  cleaned = cleaned.replace(/<<[^>]*>>/g, '');
  const words = cleaned.match(/\b[a-zA-Z]+(?:['-][a-zA-Z]+)*\b/g) || [];
  return words.map((w) => w.toLowerCase()).filter((w) => w.length > 1);
}

/**
 * Resolve active tree_data version folder from versions.json.
 * @param {string} [dataDirArg]
 * @returns {string}
 */
export function resolveActiveDataDir(dataDirArg) {
  if (dataDirArg) return dataDirArg;
  const versionsPath = join(REPO_ROOT, 'public', 'tree_data', 'versions.json');
  const versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('public/tree_data/versions.json has no versions');
  }
  const active = versions.find((v) => v.is_active) ?? versions[0];
  return join(REPO_ROOT, 'public', 'tree_data', `${active.major}_${active.minor}`);
}

/**
 * Load skills.json + optional subskills.json from a tree_data version folder.
 * @param {string} dataDir
 * @returns {object[]}
 */
export function loadSkillRows(dataDir) {
  const skills = JSON.parse(readFileSync(join(dataDir, 'skills.json'), 'utf8'));
  const subPath = join(dataDir, 'subskills.json');
  const subskills = existsSync(subPath)
    ? JSON.parse(readFileSync(subPath, 'utf8'))
    : [];
  return [...skills, ...subskills];
}

/**
 * @param {object[]} skills
 * @param {{
 *   minWordLength?: number,
 *   dictPath?: string,
 *   ignorePath?: string,
 * }} [options]
 * @returns {{
 *   errors: Array<{ displayName: string, name: string, skillId: unknown, words: string[], details: Array<{field: string, word: string, context: string}> }>,
 *   checkedWords: number,
 *   knownWordCount: number,
 * }}
 */
export function collectSpellingErrors(skills, options = {}) {
  const minWordLength = options.minWordLength ?? 2;
  const dictPath = options.dictPath ?? join(SPELLCHECK_DIR, 'spelling-dict.txt');
  const ignorePath = options.ignorePath ?? join(SPELLCHECK_DIR, 'ignore-dict.txt');
  const known = loadWordSet(dictPath);
  const ignore = loadWordSet(ignorePath);
  if (known.size === 0) {
    throw new Error(`No words loaded from dictionary: ${dictPath}`);
  }

  const errors = [];
  let checkedWords = 0;

  for (const row of skills) {
    const displayName = row.displayName || row.id || '?';
    const name = row.id || '';
    const skillId = row.id ?? null;
    const details = [];

    const fields = {
      description: asText(row.description),
      restriction: asText(row.restriction),
      skillEffect: asText(row.skillEffect ?? row.skill_effect),
    };

    for (const [field, text] of Object.entries(fields)) {
      if (!text.trim()) continue;
      for (const word of extractWords(text)) {
        checkedWords += 1;
        if (word.length >= minWordLength && !known.has(word) && !ignore.has(word)) {
          details.push({ field, word, context: text.slice(0, 100) });
        }
      }
    }

    if (details.length) {
      errors.push({
        displayName,
        name,
        skillId,
        words: [...new Set(details.map((d) => d.word))].sort(),
        details,
      });
    }
  }

  return { errors, checkedWords, knownWordCount: known.size };
}
