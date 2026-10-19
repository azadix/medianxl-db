# Spellcheck

Skill text spelling is checked as part of Vitest (`npm run test:data` / `npm test`),
or alone with `npm run spellcheck`.
It scans `description`, `restriction`, and `skillEffect`, ignores placeholders like
`{{...}}` / `[[...]]`, and compares words against:

- `tools/spellcheck/spelling-dict.txt` (known words)
- `tools/spellcheck/ignore-dict.txt` (allowed exceptions)

Add new game words to those dictionaries when tests fail on legitimate terms.
