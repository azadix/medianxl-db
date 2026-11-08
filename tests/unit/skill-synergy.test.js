import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
} from '@/shared/skill-data-store.js';
import { resolveEngineFormula } from '@/skills/domain/skill-synergy.js';
import { formulaEvaluator } from '@/skills/domain/formula-evaluator.js';
import Skill from '@/skills/domain/Skill.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('skill-synergy', () => {
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

  it('resolves Earth Talons -> Charged Talons -> Egg Trap recursion', () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('earth_talons');
    expect(row).toBeTruthy();
    expect(row.synergy?.elemental).toContain('[[charged_talons]].{{clc1}}');

    const charState = {
      blvl: { charged_talons: 5, egg_trap: 3 },
      lvl: {},
      stats: {},
    };
    const resolved = resolveEngineFormula('earth_talons', row.synergy.elemental, charState, store);
    // clc1 = min(1,blvl)*clc2 ; blvl=5 -> min(1,5); clc2 = ((ulvl*(1+aura_90))*(100+30*(blvl-1)))/100
    expect(resolved).toContain('min(1,5)');
    expect(resolved).toContain('truncdiv');
    expect(resolved).toContain('(5-1)');
    expect(resolved).not.toContain('skill(');
    expect(resolved).not.toContain('clc');
  });

  it('resolves pstN to the skill passive calc', () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('annihilation');
    expect(row.synergy?.elemental).toContain('pst3');
    const resolved = resolveEngineFormula(
      'annihilation',
      row.synergy.elemental,
      { blvl: { annihilation: 1 }, lvl: {}, stats: {} },
      store
    );
    // pst3 -> {{mana}}/10240 (annihilation passivecalc3), now truncdiv({{mana}},10240)
    expect(resolved).toContain('{{mana}}');
    expect(resolved).toContain('10240');
    expect(resolved).not.toContain('pst3');
  });

  it('evaluates apocalypse elemental synergy at level 1 (no stats)', () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('apocalypse');
    const charState = { blvl: { apocalypse: 1 }, lvl: {}, stats: {} };
    const resolved = resolveEngineFormula('apocalypse', row.synergy.elemental, charState, store);
    const variables = { blvl: 1, slvl: 0, lvl: 1, ulvl: 1, characterState: charState };
    const r = formulaEvaluator.evaluate(resolved, variables);
    expect(r.success).toBe(true);
    expect(Number.isFinite(r.value)).toBe(true);
    // energy=0, spell focus=0, ulvl=1 -> -42% (per-step integer division: 2600/500=5,
    // 60*55/100=33, 33-75=-42). truncdiv() makes this exact, matching the game.
    expect(r.value).toBe(-42);
  });

  it('evaluates Harbinger cold damage with character-level synergy', async () => {
    const skill = new Skill({ id: 'harbinger', name: 'Harbinger' });
    const charState = { blvl: { harbinger: 25 }, lvl: { harbinger: 0 }, stats: {} };
    const at140 = await skill.getScalingValues(25, 'cold_damage', 0, charState, 140);
    expect(Number(at140?.value0)).toBe(1004);
    expect(Number(at140?.value1)).toBe(1320);
    const at120 = await skill.getScalingValues(25, 'cold_damage', 0, charState, 120);
    expect(Number(at120?.value0)).toBe(864);
  });

  it('resolves skill(id, exma/enma) to the other skill elemental damage', () => {
    const store = getFileSkillStore();
    const row = store.catalogByInternalId.get('flametail_shot');
    const resolved = resolveEngineFormula(
      'flametail_shot',
      row.synergy.elemental,
      { blvl: { flametail_shot: 1, catapult_shot: 5 }, lvl: {}, stats: {} },
      store
    );
    // [[catapult_shot]].{{exma}}/{{enma}} -> Catapult Shot's fire_damage value1/value0
    expect(resolved).not.toContain('skill(');
    expect(resolved).not.toContain('exma');
    expect(resolved).not.toContain('enma');
  });
});
