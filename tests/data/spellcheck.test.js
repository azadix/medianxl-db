import { describe, expect, it } from 'vitest';
import {
  collectSpellingErrors,
  loadSkillRows,
  resolveActiveDataDir,
} from '../helpers/spellcheck.js';

describe('skill text spellcheck', () => {
  it('finds no unknown words against spelling-dict.txt', () => {
    const dataDir = resolveActiveDataDir();
    const skills = loadSkillRows(dataDir);
    const { errors } = collectSpellingErrors(skills);
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
