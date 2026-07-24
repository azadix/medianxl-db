import { describe, expect, it } from 'vitest';
import { collectSpellingErrors } from '../helpers/spellcheck.js';
import { loadActiveTreeData } from '../helpers/tree-data.js';

const { skills, subskills } = loadActiveTreeData();

describe('skill text spellcheck', () => {
  it('finds no unknown words against spelling-dict.txt', () => {
    const errors = collectSpellingErrors([...skills, ...subskills]);
    if (errors.length) {
      const samples = errors
        .slice(0, 15)
        .map((e) => `${e.displayName}: ${e.words.join(', ')}`);
      const more =
        errors.length > 15 ? `\n... and ${errors.length - 15} more skills` : '';
      expect.fail(
        `${errors.length} skill(s) have unknown words:\n${samples.join('\n')}${more}`
      );
    }
  });
});
