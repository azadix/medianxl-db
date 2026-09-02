/**
 * Re-export shared spellcheck helpers for Vitest.
 */
export {
  extractWords,
  collectSpellingErrors,
  loadSkillRows,
  resolveActiveDataDir,
} from '../../tools/spellcheck/check-spelling.mjs';
