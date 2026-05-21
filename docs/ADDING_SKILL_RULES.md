# Adding first-point skill allocation rules

Planner allocation beyond tree prerequisites and devotion uses rule classes and wrappers in `src/skills/domain/`.

## Architecture

- **`Skill.js`** — runtime model for catalog rows.
- **Allocation rules** — `Mastery`, `Ultimate`, `Paragon`, `Coven`, `Proficiency` in `skill-allocation-rules.js` (wrappers in `skill-restrictions.js`).
- **`skill-restrictions.js`** — public façade: `check*Restriction(skill, allSkills)` wrappers and `FIRST_POINT_RULE_SUMMARY`.

Each rule implements `checkRestriction(allSkills)` returning `{ allowed: boolean, reason: string }`.

## Steps for a new rule

1. **Predicate + check** — Add or extend a subclass with `static is…(skill)` and `checkRestriction`, or add a dedicated small module if the rule does not fit an existing class.
2. **Export wrapper** — Add `check…Restriction(skill, allSkills)` in `src/skills/domain/skill-restrictions.js`.
3. **Register in planner** — Call the wrapper from `src/character/character-state.js` in `addSkillPoint` / `addSkillPointsBatch` (order matters; devotion is typically last).
4. **UI warnings** — If the rule should appear on the skill card, add it to `getSkillRestrictions` in `character-state.js`.
5. **Document** — Append an entry to `FIRST_POINT_RULE_SUMMARY` in `skill-restrictions.js` for contributors and tooling.

## Testing manually

- Open `/planner`, allocate first point on skills that should pass/fail the rule.
- Confirm toast/block message matches `reason`.
- Export build URL and re-import on the same patch version.

## Related docs

- `docs/PATCH_RELEASE.md` — new `tree_data` folder workflow
- `improvements.md` Phase 2 — consolidating allocation subclasses into `skill-allocation-rules.js`
