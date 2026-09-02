import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expandPlaceholdersWithScaling } from '@/shared/utils.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/** Curated skills covering placeholders, skill refs, subskill blocks, and variants. */
const SNAPSHOT_SKILLS = [
  { id: 'abyss', level: 1 },
  { id: 'ancestral_endurance', level: 1 },
  { id: 'artifice_mastery', level: 1 },
  { id: 'flamefront', level: 1, variantKey: 'non_sorceress' },
];

function textFromField(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((x) => (x == null ? '' : String(x))).join('\n');
  return String(value);
}

describe('tooltip expansion', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('snapshots expanded description/effect for representative skills', async () => {
    const store = getFileSkillStore();
    const snapshots = {};

    for (const entry of SNAPSHOT_SKILLS) {
      const row = store.catalogByInternalId.get(entry.id);
      expect(row, `missing skill ${entry.id}`).toBeTruthy();

      let description = textFromField(row.description);
      let skillEffect = textFromField(row.skillEffect ?? row.skill_effect);
      const variantKey = entry.variantKey ?? null;

      if (variantKey) {
        const overrides = store.getVariantTextOverrides(row.id, variantKey);
        if (overrides?.description) description = overrides.description;
        if (overrides?.skill_effect) skillEffect = overrides.skill_effect;
      }

      const descExpanded = await expandPlaceholdersWithScaling(
        row.id,
        entry.level,
        description,
        row.id,
        null,
        false,
        variantKey
      );
      const effectExpanded = await expandPlaceholdersWithScaling(
        row.id,
        entry.level,
        skillEffect,
        row.id,
        null,
        false,
        variantKey
      );

      snapshots[entry.id] = {
        level: entry.level,
        variantKey,
        description: descExpanded,
        skillEffect: effectExpanded,
      };
    }

    expect(snapshots).toMatchSnapshot();
  });

  function fieldsOf(row) {
    return {
      description: textFromField(row.description),
      skillEffect: textFromField(row.skillEffect ?? row.skill_effect),
      restriction: textFromField(row.restriction),
    };
  }

  function commonChecks(rowId, field, expanded, issues) {
    if (expanded.includes('[unknown skill')) {
      issues.push(`${rowId} [${field}]: reference to unknown skill`);
    }
    if (expanded.includes('[Unknown stat')) {
      issues.push(`${rowId} [${field}]: reference to unknown stat`);
    }
    if (expanded.includes('MISSING STAT')) {
      issues.push(`${rowId} [${field}]: MISSING STAT marker`);
    }
    if (/\bNaN\b/.test(expanded)) {
      issues.push(`${rowId} [${field}]: contains NaN`);
    }
    if (/\bundefined\b/.test(expanded)) {
      issues.push(`${rowId} [${field}]: contains undefined`);
    }
  }

  it.each([1, 15])(
    'browse mode (no character): all skill text at level %i has no unknown refs or NaN',
    async (level) => {
      // Without a character state the app intentionally shows raw formulas
      // (including [[skill]].{{stat}} tokens), so leftover braces are legal here.
      const store = getFileSkillStore();
      const issues = [];

      for (const row of store.catalog) {
        for (const [field, text] of Object.entries(fieldsOf(row))) {
          if (!text.trim()) continue;
          const expanded = await expandPlaceholdersWithScaling(
            row.id,
            level,
            text,
            row.id,
            null,
            false,
            null
          );
          commonChecks(row.id, field, expanded, issues);
        }
      }

      expect(issues, issues.slice(0, 20).join('\n')).toEqual([]);
    }
  );

  it.each([1, 15])(
    'planner mode (with character): all skill text at level %i fully resolves',
    async (level) => {
      const store = getFileSkillStore();
      const issues = [];

      // Planner-like character state: all registered stats at 0, current skill allocated.
      const baseStats = {};
      for (const def of store.characterStatRegistry) {
        if (def?.key) baseStats[String(def.key).toLowerCase()] = 0;
      }

      for (const row of store.catalog) {
        const characterState = {
          level: 120,
          stats: baseStats,
          blvl: { [String(row.id)]: level },
          lvl: {},
          treeSkillsCache: {},
        };

        for (const [field, text] of Object.entries(fieldsOf(row))) {
          if (!text.trim()) continue;
          const expanded = await expandPlaceholdersWithScaling(
            row.id,
            level,
            text,
            row.id,
            characterState,
            false,
            null
          );

          commonChecks(row.id, field, expanded, issues);
          if (/\{\{[^}]*\}\}/.test(expanded)) {
            issues.push(`${row.id} [${field}]: unresolved {{placeholder}}`);
          }
          if (/\[\[[^\]]*\]\]/.test(expanded)) {
            issues.push(`${row.id} [${field}]: unresolved [[skill]]`);
          }
        }
      }

      expect(issues, issues.slice(0, 20).join('\n')).toEqual([]);
    }
  );

  it('showFormulas keeps [[skill]].{{stat}} inside formulas and still expands standalone {{stat}}', async () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('fire_elementals');
    expect(row, 'missing fire_elementals').toBeTruthy();

    const effect = textFromField(row.skillEffect ?? row.skill_effect);
    expect(effect).toMatch(/\{\{cooldown\}\}/);
    expect(effect).toMatch(/\{\{minions\}\}/);

    const characterState = {
      level: 50,
      blvl: { fire_elementals: 1, unstable_essence: 0 },
      lvl: {},
      stats: {},
      treeSkillsCache: {},
    };

    const expanded = await expandPlaceholdersWithScaling(
      row.id,
      1,
      effect,
      row.id,
      characterState,
      true,
      null
    );

    expect(expanded).toContain('[[fire_elementals]].{{minions}}');
    expect(expanded).not.toMatch(/\[\[fire_elementals\]\]\.Spirits/);
    // Standalone {{minions}} line must expand; compound token may still contain {{minions}}.
    expect(expanded).toMatch(/Spirits<\/span>:\s*<span/);
    expect(expanded).not.toMatch(/(^|\n)\{\{minions\}\}(\n|$)/);
  });

  it('showFormulas keeps {{character_stat}} inside subskill formulas (not ???% format)', async () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('lunar_assault');
    expect(row, 'missing lunar_assault').toBeTruthy();

    const effect = textFromField(row.skillEffect ?? row.skill_effect);
    expect(effect).toMatch(/<<lunar_assault_moon_strike>>/);

    const characterState = {
      level: 50,
      blvl: { lunar_assault: 1 },
      lvl: {},
      stats: { deadly_strike: 10, innate_elemental_damage: 20 },
      treeSkillsCache: {},
    };

    const expanded = await expandPlaceholdersWithScaling(
      row.id,
      1,
      effect,
      row.id,
      characterState,
      true,
      null
    );

    expect(expanded).toContain('{{deadly_strike}}');
    expect(expanded).toContain('{{innate_elemental_damage}}');
    expect(expanded).not.toMatch(/\?\?\?%\s*Deadly Strike/);
    expect(expanded).not.toMatch(/Innate Elemental Damage:\s*\?\?\?%/);
  });

  it('frostborn {{attack_rating_percent}} matches scaling and evaluates tree(13)', async () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('frostborn');
    expect(row, 'missing frostborn').toBeTruthy();

    const effect = textFromField(row.skillEffect ?? row.skill_effect);
    expect(effect).toMatch(/\{\{attack_rating_percent\}\}/);

    const sc = (row.scalingConstants || []).find(
      (s) => String(s.statKey).toLowerCase() === 'attack_rating_percent'
    );
    expect(
      sc,
      'skillEffect {{attack_rating_percent}} needs matching scalingConstants.statKey'
    ).toBeTruthy();
    expect(String(sc.value0)).toMatch(/tree\(13\)/);

    const coldSkills = store.catalog.filter((s) => s.tab === 13).map((s) => String(s.id));
    expect(coldSkills).toContain('frostborn');

    const blvl = Object.fromEntries(
      coldSkills.map((id) => [id, id === 'frostborn' ? 1 : 2])
    );
    const treeTotal = coldSkills.reduce((sum, id) => sum + (blvl[id] || 0), 0);
    const expectedAr = 5 * (treeTotal - blvl.frostborn);

    const characterState = {
      level: 50,
      blvl,
      lvl: {},
      stats: { energy: 0 },
      treeSkillsCache: { 13: coldSkills },
    };

    const expanded = await expandPlaceholdersWithScaling(
      row.id,
      1,
      effect,
      row.id,
      characterState,
      false,
      null
    );

    expect(expanded).not.toMatch(/\{\{attack_rating_percent\}\}/);
    expect(expanded).toMatch(
      new RegExp(`Attack Rating:\\s*<span[^>]*>${expectedAr}<\/span>%`)
    );
  });
});
