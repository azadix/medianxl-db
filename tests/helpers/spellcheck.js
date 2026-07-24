/**
 * Re-export shared spellcheck helpers for Vitest.
 */
export {
  extractWords,
  collectSpellingErrors,
  loadSkillRows,
  resolveActiveDataDir,
} from '../../spellcheck/check-spelling.mjs';
