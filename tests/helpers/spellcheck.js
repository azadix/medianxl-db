/**
 * JS port of spellcheck/check_spelling.py word extraction + dict check (for Vitest).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './mock-fetch-tree-data.js';
import { asText } from './tree-data.js';

function loadWordSet(filePath) {
  const words = new Set();
  const body = readFileSync(filePath, 'utf8');
  for (const line of body.split(/\r?\n/)) {
    const word = line.trim().toLowerCase();
    if (word && !word.startsWith('#')) words.add(word);
  }
  return words;
}

/**
 * Extract words, ignoring {{...}} and [[...]] placeholders.
 * @param {string} text
 * @returns {string[]}
 */
export function extractWords(text) {
  if (!text) return [];
  let cleaned = String(text);
  cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, '');
  cleaned = cleaned.replace(/\[\[[^\]]*\]\]/g, '');
  const words = cleaned.match(/\b[a-zA-Z]+(?:['-][a-zA-Z]+)*\b/g) || [];
  return words.map((w) => w.toLowerCase()).filter((w) => w.length > 1);
}

/**
 * @param {Array<object>} skills - raw skills + subskills rows
 * @param {{ minWordLength?: number }} [options]
 * @returns {Array<{ displayName: string, name: string, words: string[] }>}
 */
export function collectSpellingErrors(skills, options = {}) {
  const minWordLength = options.minWordLength ?? 2;
  const dictDir = join(REPO_ROOT, 'spellcheck');
  const known = loadWordSet(join(dictDir, 'spelling-dict.txt'));
  const ignore = loadWordSet(join(dictDir, 'ignore-dict.txt'));
  const errors = [];

  for (const row of skills) {
    const displayName = row.displayName || row.id || '?';
    const name = row.id || '';
    const skillErrors = [];
    for (const field of ['description', 'restriction', 'skillEffect', 'skill_effect']) {
      const text = asText(row[field]);
      if (!text.trim()) continue;
      for (const word of extractWords(text)) {
        if (
          word.length >= minWordLength &&
          !known.has(word) &&
          !ignore.has(word)
        ) {
          skillErrors.push({ field, word });
        }
      }
    }
    if (skillErrors.length) {
      errors.push({
        displayName,
        name,
        words: [...new Set(skillErrors.map((e) => e.word))].sort(),
      });
    }
  }
  return errors;
}
