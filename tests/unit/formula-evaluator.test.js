import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFormula, evaluateFormula } from '@/skills/domain/formula-evaluator.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  resolveCharacterStatKeyForToken,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('parseFormula', () => {
  it('accepts simple arithmetic', () => {
    expect(parseFormula('lvl + 3').success).toBe(true);
  });

  it('rejects empty formulas', () => {
    expect(parseFormula('').success).toBe(false);
    expect(parseFormula('   ').success).toBe(false);
  });

  it('rejects unbalanced parentheses', () => {
    expect(parseFormula('(lvl + 1').success).toBe(false);
    expect(parseFormula('lvl + 1)').success).toBe(false);
  });
});

describe('evaluateFormula', () => {
  it('evaluates arithmetic with variables', () => {
    const result = evaluateFormula('lvl * 2 + 1', { lvl: 10 });
    expect(result.success).toBe(true);
    expect(result.value).toBe(21);
  });

  it('supports floor()', () => {
    const result = evaluateFormula('floor(lvl / 3)', { lvl: 10 });
    expect(result.success).toBe(true);
    expect(result.value).toBe(3);
  });

  it('supports cond() for planner showConditions', async () => {
    const { toggleCondition, isConditionSelected } = await import(
      '@/stores/planner-config-store.js'
    );
    const key = 'while_wielding_twohanded_weapon';
    if (isConditionSelected(key)) toggleCondition(key);
    expect(evaluateFormula('9+5*cond(while_wielding_twohanded_weapon)', {}).value).toBe(9);
    toggleCondition(key);
    expect(evaluateFormula('9+5*cond(while_wielding_twohanded_weapon)', {}).value).toBe(14);
    toggleCondition(key);
  });

  it('fails on undefined variables', () => {
    const result = evaluateFormula('missing_stat + 1', {});
    expect(result.success).toBe(false);
  });
});

describe('pairedStat reverse alias (life_steal)', () => {
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

  it('maps life_steal token to life_stolen_per_hit', () => {
    expect(resolveCharacterStatKeyForToken('life_steal')).toBe('life_stolen_per_hit');
  });

  it('reads {{life_steal}} from life_stolen_per_hit in formulas', () => {
    const result = evaluateFormula('({{life_steal}}*15)/10', {
      characterState: { stats: { life_stolen_per_hit: 10 } },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(15);
  });
});

describe('current/max life and mana formula tokens', () => {
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

  it('keeps current and base pool keys in character_stats', () => {
    expect(resolveCharacterStatKeyForToken('current_mana')).toBe('current_mana');
    expect(resolveCharacterStatKeyForToken('base_mana')).toBe('base_mana');
    expect(resolveCharacterStatKeyForToken('current_life')).toBe('current_life');
    expect(resolveCharacterStatKeyForToken('base_life')).toBe('base_life');
  });

  it('evaluates current/max mana ratio formulas', () => {
    const result = evaluateFormula('max(({{current_mana}}*4)/max({{base_mana}},1),0)', {
      characterState: { stats: { current_mana: 50, base_mana: 200 } },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(1);
  });

  it('treats empty mana pool as zero extra bolts', () => {
    const result = evaluateFormula('max(({{current_mana}}*4)/max({{base_mana}},1),0)', {
      characterState: { stats: { current_mana: 0, base_mana: 0 } },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(0);
  });

  it('evaluates current/max life ratio formulas', () => {
    const result = evaluateFormula('max(({{current_life}}*4)/max({{base_life}},1),0)', {
      characterState: { stats: { current_life: 100, base_life: 400 } },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(1);
  });
});
